/**
 * SHADDAI API Proxy Routes
 * All missing endpoints the dashboard needs — Ollama, Claude, Gemini, Groq,
 * CoinLore, News, Agents, File system, and more.
 */

const express = require('express');
const router = express.Router();
const { fail, ok, asyncHandler } = require('./lib/respond'); // shared response/error contract
const { softAuth, requireAdmin } = require('./auth-guard');
router.use(softAuth); // dev-permissive; enforces identity when REQUIRE_AUTH=true
// Tag the current run's owner so agent tools (save_to_inbox) write per-user entries.
router.use((req, res, next) => { try { require('./agent-engine').setInboxOwner((req.userId && req.userId !== 'local') ? req.userId : (req.headers['x-user-id'] || '')); } catch (_) {} next(); });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const skillsLoader = require('./skills-loader');
const agentEngine = require('./agent-engine');
const ragIndex = require('./rag-index');
const agentEventBus = require('./agent-event-bus');

// Obsidian vault path — set OBSIDIAN_ROOT in .env to override
const OBSIDIAN_ROOT = process.env.OBSIDIAN_ROOT || 'C:\\Users\\Brittany\\OneDrive\\Desktop\\OBSIDIAN\\SHADDAI OBSIDIAN';

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const HELIUS_KEY = process.env.HELIUS_API_KEY || '';

// Named constants — avoids magic numbers scattered through route handlers
const DEFAULT_OLLAMA_MODEL = process.env.DEFAULT_OLLAMA_MODEL || 'llama3.2:1b';
const OLLAMA_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — LLM generation can be slow

// ── CREDIT ENFORCEMENT (ZEROX+NEXUS) ─────────────────────────────────────────
// Hard-charges a user's credit balance for an EXPENSIVE action BEFORE it runs.
// Previously these handlers ran the costly op for free (metering was cosmetic).
//
//   returns true  → request was BLOCKED. A 402 has ALREADY been sent; the caller
//                   MUST `return` immediately and NOT run the expensive op.
//   returns false → proceed (charged OK, BYOK-free, or metering unavailable).
//
// Non-breaking by design: if credit-meter/costs are missing or throw, we degrade
// to allow (never crash a handler on a billing hiccup). BYOK requests are free —
// detected the same way demo-limit does, plus an explicit body.apiKey (the BYOK
// path several media handlers already accept).
const _demoLimit = require('./demo-limit');
function _isByok(req) {
  try {
    if (_demoLimit.hasBYOK(req)) return true;
  } catch (_) {}
  const b = req && req.body;
  return !!(b && typeof b.apiKey === 'string' && b.apiKey.trim().length >= 8);
}
async function enforceCredits(req, res, actionId) {
  try {
    const meter = require('./credit-meter');
    if (!meter || typeof meter.debitForAction !== 'function') return false; // degrade → allow
    const byok = _isByok(req);
    const userId = (req && req.userId)
      || (req && req.user && (req.user.id || req.user.userId))
      || 'anon';
    const r = await meter.debitForAction(userId, actionId, { byok });
    if (r && r.blocked) {
      res.status(402).json({
        error: 'Out of credits — top up or add your own API key',
        needsCredits: true,
        action: actionId,
        needed: r.needed,
        remaining: r.remaining
      });
      return true; // blocked — caller must stop
    }
  } catch (_) { /* metering unavailable — never block the handler on a billing error */ }
  return false;
}

// ─────────────────────────────────────────────────────────────
// PERSISTENT FILE STORAGE — JSON-backed jobs, workflows, bids
// ─────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs', 'jobs.json');
const WORKFLOWS_FILE = path.join(DATA_DIR, 'workflows.json');

function ensureDataDir() {
  try { fs.mkdirSync(path.join(DATA_DIR, 'jobs'), { recursive: true }); } catch {}
}

function loadJSON(filePath, fallback = []) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return fallback; }
}

function saveJSON(filePath, data) {
  // Atomic write: serialize to a temp file then rename over the target. A crash
  // mid-write leaves the original intact instead of a truncated file that would
  // silently load as [] and wipe jobs/receipts/earnings.
  try {
    const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error('[STORAGE] Failed to save:', filePath, e.message);
  }
}

ensureDataDir();

// ─────────────────────────────────────────────────────────────
// OLLAMA RATE LIMITER — prevents concurrent LLM overload
// Max 3 simultaneous Ollama requests; extras queue with 30s timeout
// ─────────────────────────────────────────────────────────────
const MAX_CONCURRENT_LLM = 3;
let _activeLLM = 0;
const _llmQueue = [];

function withLLMSlot(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      _activeLLM++;
      try { resolve(await fn()); }
      catch (e) { reject(e); }
      finally {
        _activeLLM--;
        if (_llmQueue.length > 0) _llmQueue.shift()();
      }
    };
    if (_activeLLM < MAX_CONCURRENT_LLM) {
      run();
    } else {
      const timer = setTimeout(() => {
        const idx = _llmQueue.indexOf(run);
        if (idx !== -1) _llmQueue.splice(idx, 1);
        reject(new Error('LLM queue timeout — try again in a moment'));
      }, 30000);
      _llmQueue.push(() => { clearTimeout(timer); run(); });
    }
  });
}

// ─────────────────────────────────────────────────────────────
// EVENT HISTORY — stores last 200 SSE events for new clients
// ─────────────────────────────────────────────────────────────
const _eventHistory = [];
const MAX_EVENT_HISTORY = 200;

function recordEvent(type, payload) {
  const event = { type, payload, timestamp: new Date().toISOString() };
  _eventHistory.push(event);
  if (_eventHistory.length > MAX_EVENT_HISTORY) _eventHistory.shift();
  return event;
}

// ─────────────────────────────────────────────────────────────
// RESPONSE CACHE — cache market data to reduce API calls
// Keys expire after TTL milliseconds
// ─────────────────────────────────────────────────────────────
const _cache = new Map();

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data, ttlMs = 30000) {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─────────────────────────────────────────────────────────────
// IP-BASED RATE LIMITER — 30 requests per minute per IP
// Protects LLM chat endpoints from abuse / runaway costs
// ─────────────────────────────────────────────────────────────
const _ipCallCounts = new Map();
function checkRateLimit(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  // Normalize IPv6 colons so the separator '|' is unambiguous in cleanup
  const safeIp = (ip || 'unknown').replace(/:/g, '_');
  const window = Math.floor(now / windowMs);
  const key = `${safeIp}|${window}`;
  const count = (_ipCallCounts.get(key) || 0) + 1;
  _ipCallCounts.set(key, count);
  // Cleanup old keys every 100 calls to prevent memory growth
  if (count === 1 && _ipCallCounts.size > 500) {
    const cutoff = window - 1;
    for (const k of _ipCallCounts.keys()) {
      if (parseInt(k.split('|')[1]) < cutoff) _ipCallCounts.delete(k);
    }
  }
  return count <= limit;
}

// ─────────────────────────────────────────────────────────────
// HTML SANITIZER — strip tags from user-supplied text fields
// ─────────────────────────────────────────────────────────────
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

// ─────────────────────────────────────────────────────────────
// INTELLIGENT AUTO-ROUTING — keyword classifier for SHADDAI chat
// Analyzes message content and routes to the best specialist agent
// ─────────────────────────────────────────────────────────────
const ROUTING_RULES = [
  {
    agent: 'zerox', port: 8001, name: 'ZEROX', emoji: '💰',
    keywords: ['revenue', 'pricing', 'billing', 'stripe', 'subscription', 'mrr', 'ltv', 'cac',
               'money', 'profit', 'income', 'cost', 'pay', 'charge', 'tier', 'plan', 'upgrade',
               'budget', 'roi', 'earn', 'wallet', 'token', 'crypto', 'invest', 'trade', 'market']
  },
  {
    agent: 'nexus', port: 8003, name: 'NEXUS', emoji: '🕸',
    keywords: ['build', 'code', 'api', 'backend', 'server', 'database', 'sql', 'endpoint',
               'function', 'deploy', 'docker', 'node', 'express', 'architecture', 'performance',
               'bug', 'fix', 'debug', 'error', 'refactor', 'integration', 'webhook', 'route']
  },
  {
    agent: 'turtle', port: 8004, name: 'TURTLE', emoji: '🐢',
    keywords: ['design', 'ui', 'ux', 'css', 'html', 'frontend', 'layout', 'color', 'font',
               'button', 'dashboard', 'component', 'animation', 'responsive', 'mobile', 'style',
               'visual', 'logo', 'brand', 'theme', 'dark mode', 'pixel', 'figma', 'interface']
  },
  {
    agent: 'oracle', port: 8002, name: 'ORACLE', emoji: '🔮',
    keywords: ['research', 'analyze', 'data', 'trend', 'market', 'competitor', 'intelligence',
               'report', 'find', 'discover', 'insight', 'stats', 'analytics', 'monitor',
               'news', 'update', 'feed', 'search', 'scrape', 'observe', 'track', 'compare']
  },
  {
    agent: 'quill', port: 8005, name: 'QUILL', emoji: '✍️',
    keywords: ['write', 'document', 'copy', 'guide', 'readme', 'description', 'message',
               'email', 'blog', 'post', 'content', 'explain', 'summarize', 'draft', 'article',
               'note', 'memo', 'announcement', 'changelog', 'release', 'marketing', 'seo']
  },
  {
    agent: 'pikadon', port: 8008, name: 'PIKADON', emoji: '🛡',
    keywords: ['security', 'audit', 'vulnerability', 'hack', 'attack', 'protect', 'auth',
               'permission', 'access', 'secret', 'encrypt', 'ssl', 'compliance', 'owasp',
               'xss', 'injection', 'firewall', 'threat', 'risk', 'safe', 'secure', 'review']
  }
];

function routeMessage(message) {
  if (!message) return null;
  const lower = message.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const rule of ROUTING_RULES) {
    const score = rule.keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = rule; }
  }
  // Need at least 1 keyword match to route away from SHADDAI
  return bestScore >= 1 ? best : null;
}

// ─────────────────────────────────────────────────────────────
// OLLAMA — main chat proxy (dashboard calls /api/ollama)
// Supports both messages[] (chat) and prompt (generate) formats
// ─────────────────────────────────────────────────────────────
router.post('/ollama', async (req, res) => {
  try {
    const { model, messages, prompt, stream } = req.body;
    const useModel = model || DEFAULT_OLLAMA_MODEL;

    if (messages && Array.isArray(messages)) {
      // OpenAI-style chat format → Ollama /api/chat
      const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: useModel,
        messages,
        stream: false
      }, { timeout: OLLAMA_TIMEOUT_MS });
      return res.json(response.data);
    } else {
      // Prompt format → Ollama /api/generate
      const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: useModel,
        prompt: prompt || '',
        stream: false
      }, { timeout: OLLAMA_TIMEOUT_MS });
      return res.json(response.data);
    }
  } catch (error) {
    return fail(res, 500, 'internal_error', error.message, { message: { content: `Ollama error: ${error.message}` } });
  }
});

// ─────────────────────────────────────────────────────────────
// OLLAMA STREAM — SSE streaming wrapper for Ollama /api/generate
// Frontend streamOllamaResponse() calls this; emits data: {"token":"..."} lines
// ─────────────────────────────────────────────────────────────
router.post('/ollama/stream', async (req, res) => {
  const { model, prompt, messages } = req.body;
  const useModel = model || DEFAULT_OLLAMA_MODEL;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const isChat = messages && Array.isArray(messages);
    const ollamaRes = await axios.post(
      `${OLLAMA_URL}/api/${isChat ? 'chat' : 'generate'}`,
      { model: useModel, ...(isChat ? { messages } : { prompt: prompt || '' }), stream: true },
      { responseType: 'stream', timeout: OLLAMA_TIMEOUT_MS }
    );

    ollamaRes.data.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const token = isChat ? obj.message?.content : obj.response;
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
          if (obj.done) { res.write('data: [DONE]\n\n'); }
        } catch {}
      }
    });

    ollamaRes.data.on('end', () => res.end());
    ollamaRes.data.on('error', () => res.end());
    req.on('close', () => ollamaRes.data.destroy());
  } catch (e) {
    res.write(`data: ${JSON.stringify({ token: `[Error: ${e.message}]` })}\n\n`);
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────
// OLLAMA TAGS — model list (dashboard calls /api/ollama-tags)
// ─────────────────────────────────────────────────────────────
router.get('/ollama-tags', async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    res.json(response.data);
  } catch {
    res.json({ models: [] });
  }
});

// ─────────────────────────────────────────────────────────────
// CLAUDE PROXY — proxies Anthropic API through server
// ─────────────────────────────────────────────────────────────
router.post('/claude', async (req, res) => {
  try {
    const { apiKey, model, max_tokens, system, messages } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'No Claude API key provided. Add it in Settings → API Keys.' });

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 4096,
      system,
      messages
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 60000
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    res.status(status).json(error.response?.data || { error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GEMINI PROXY — both /gemini and /gemini-key
// ─────────────────────────────────────────────────────────────
async function callGemini(prompt, key) {
  const apiKey = key || GEMINI_KEY;
  if (!apiKey) throw new Error('No Gemini API key configured');

  // Try models in order: lite first (fewer rate limits), then flash, then pro
  const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastError;

  for (const model of models) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 30000 }
      );
      return response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    } catch (err) {
      lastError = err;
      // Only retry on rate limit (429) or not found (404); bail on auth errors
      if (err.response?.status === 401 || err.response?.status === 403) throw err;
      if (err.response?.status !== 429 && err.response?.status !== 404) throw err;
    }
  }
  throw lastError;
}

router.post('/gemini', async (req, res) => {
  try {
    const { prompt, key } = req.body;
    if (!key && !GEMINI_KEY) return res.status(400).json({ error: 'No Gemini API key. Add GEMINI_API_KEY to .env or paste a key in Settings.' });
    const text = await callGemini(prompt || '', key);
    res.json({ choices: [{ message: { content: text } }], response: text });
  } catch (error) {
    fail(res, 500, 'internal_error', error.message);
  }
});

router.post('/gemini-key', async (req, res) => {
  try {
    const { prompt, key } = req.body;
    if (!key && !GEMINI_KEY) return res.status(400).json({ error: 'No Gemini API key. Add GEMINI_API_KEY to .env or paste a key in Settings.' });
    const text = await callGemini(prompt || '', key);
    res.json({ choices: [{ message: { content: text } }], response: text });
  } catch (error) {
    fail(res, 500, 'internal_error', error.message);
  }
});

// ─────────────────────────────────────────────────────────────
// GROQ PROXY
// ─────────────────────────────────────────────────────────────
router.post('/groq', async (req, res) => {
  try {
    const { messages, max_tokens, model, apiKey } = req.body;
    const key = apiKey || process.env.GROQ_API_KEY || '';
    if (!key) return res.status(400).json({ error: 'No Groq API key. Add GROQ_API_KEY to .env or paste key in Settings.' });

    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: model || 'llama-3.3-70b-versatile',
      messages: messages || [],
      max_tokens: max_tokens || 1024
    }, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 30000
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    res.status(status).json(error.response?.data || { error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SHADDAI AGENT — proxy to port 8000, fallback to Ollama
// ─────────────────────────────────────────────────────────────
router.get('/shaddai/', async (req, res) => {
  try {
    const r = await axios.get('http://localhost:8000/', { timeout: 3000 });
    res.json(r.data);
  } catch {
    res.json({ status: 'ONLINE', mode: 'ollama-fallback', version: 'v62', message: 'SHADDAI running via Ollama', skills_loaded: 45 });
  }
});

router.post('/shaddai/chat', async (req, res) => {
  // IP rate limit: 30 requests per minute per IP
  if (!checkRateLimit(req.ip || req.connection.remoteAddress)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  const { message, model, forceAgent } = req.body;

  // Intelligent routing — analyze message, find best specialist
  const route = forceAgent ? null : routeMessage(message);
  if (route) {
    console.log(`[AUTO-ROUTE] "${message.slice(0, 60)}..." → ${route.name} (port ${route.port})`);
    // Try the specialist agent first
    try {
      await axios.get(`http://localhost:${route.port}/ping`, { timeout: 500 });
      const t0 = Date.now();
      const r = await axios.post(`http://localhost:${route.port}/chat`, { message, model }, { timeout: 180000 });
      recordAgentCall('SHADDAI', Date.now() - t0, true);
      return res.json({ ...r.data, routedTo: route.name, routedEmoji: route.emoji, autoRouted: true });
    } catch {
      // Specialist offline — fall through to SHADDAI / Ollama
      console.warn(`[AUTO-ROUTE] ${route.name} offline, falling back to SHADDAI`);
    }
  }

  // Quick ping to see if the SHADDAI agent server is actually up (500ms check)
  let agentUp = false;
  try {
    await axios.get('http://localhost:8000/ping', { timeout: 500 });
    agentUp = true;
  } catch { /* agent not running */ }

  if (agentUp) {
    try {
      const t0 = Date.now();
      const r = await axios.post('http://localhost:8000/chat', { message, model }, { timeout: 180000 });
      recordAgentCall('SHADDAI', Date.now() - t0, true);
      return res.json(r.data);
    } catch (err) {
      console.warn('[SHADDAI proxy] Agent request failed, falling back:', err.message);
    }
  }

  // Direct Ollama fallback
  const t0 = Date.now();
  try {
    const useModel = model || DEFAULT_OLLAMA_MODEL;
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: useModel,
      messages: [
        { role: 'system', content: 'You are SHADDAI, an elite AI orchestrator. Be concise and strategic. Sign responses as [SHADDAI ⚡]' },
        { role: 'user', content: message || '' }
      ],
      stream: false
    }, { timeout: 180000 });

    recordAgentCall('SHADDAI', Date.now() - t0, true);
    return res.json({ response: r.data.message?.content || 'No response', model: useModel, source: 'ollama-direct', agent: 'SHADDAI' });
  } catch (error) {
    recordAgentCall('SHADDAI', Date.now() - t0, false);
    return fail(res, 500, 'internal_error', error.message, { response: `SHADDAI: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────
// STREAMING AGENT CHAT — POST /api/shaddai/stream or /api/agent/:name/stream
// Proxies to agent /stream endpoint (SSE) so UI gets live tokens
// ─────────────────────────────────────────────────────────────
const AGENT_PORTS = { shaddai:8000, zerox:8001, oracle:8002, nexus:8003, turtle:8004, quill:8005, pikadon:8008 };

async function proxyAgentStream(agentKey, req, res) {
  const port = AGENT_PORTS[agentKey];
  if (!port) { res.status(400).json({ error: `Unknown agent: ${agentKey}` }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Ping check
  try { await axios.get(`http://localhost:${port}/ping`, { timeout: 800 }); } catch {
    // Agent offline — stream directly from Ollama
    const { message, model } = req.body;
    try {
      const streamRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: model || DEFAULT_OLLAMA_MODEL,
        messages: [{ role: 'user', content: message }],
        stream: true
      }, { responseType: 'stream', timeout: 120000 });

      let buf = '';
      streamRes.data.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          try { const p = JSON.parse(line); const tok = p.message?.content||''; if (tok) res.write(`data: ${JSON.stringify({token:tok,agent:agentKey})}\n\n`); if (p.done) { res.write(`data: ${JSON.stringify({done:true})}\n\n`); res.end(); } } catch(_) {}
        }
      });
      streamRes.data.on('end', () => { res.write(`data: ${JSON.stringify({done:true})}\n\n`); res.end(); });
    } catch(e) { res.write(`data: ${JSON.stringify({error:e.message})}\n\n`); res.end(); }
    return;
  }

  // Agent is up — proxy SSE from agent's /stream endpoint
  try {
    const streamRes = await axios.post(`http://localhost:${port}/stream`, req.body, {
      responseType: 'stream', timeout: 120000
    });
    streamRes.data.pipe(res);
    req.on('close', () => streamRes.data.destroy());
  } catch(e) {
    res.write(`data: ${JSON.stringify({error:e.message,agent:agentKey})}\n\n`);
    res.end();
  }
}

router.post('/shaddai/stream', (req, res) => proxyAgentStream('shaddai', req, res));
router.post('/agent/:agentKey/stream', (req, res) => proxyAgentStream(req.params.agentKey.toLowerCase(), req, res));

// ─────────────────────────────────────────────────────────────
// OPENCLAW — route through Ollama when offline
// ─────────────────────────────────────────────────────────────
router.get('/openclaw-status', (req, res) => {
  res.json({ status: 'offline', message: 'OpenClaw not connected — using Ollama fallback' });
});

router.post('/openclaw', async (req, res) => {
  try {
    const { messages } = req.body;
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: DEFAULT_OLLAMA_MODEL,
      messages: messages || [{ role: 'user', content: '' }],
      stream: false
    }, { timeout: 120000 });
    res.json({ choices: [{ message: { content: r.data.message?.content || 'No response' } }] });
  } catch (error) {
    fail(res, 500, 'internal_error', error.message, { choices: [{ message: { content: `OpenClaw error: ${error.message}` } }] });
  }
});

// ─────────────────────────────────────────────────────────────
// DEXSCREENER — token pairs, trending, search
// ─────────────────────────────────────────────────────────────
const DS_BASE = 'https://api.dexscreener.com/latest';

router.get('/dexscreener/search', async (req, res) => {
  try {
    const { q } = req.query;
    const r = await axios.get(`${DS_BASE}/dex/search?q=${encodeURIComponent(q || 'SOL')}`, { timeout: 10000 });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message, { pairs: [] }); }
});

router.get('/dexscreener/pairs/:chainId/:token', async (req, res) => {
  try {
    const { chainId, token } = req.params;
    const r = await axios.get(`${DS_BASE}/dex/pairs/${chainId}/${token}`, { timeout: 10000 });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

router.get('/dexscreener/tokens/:address', async (req, res) => {
  try {
    const r = await axios.get(`${DS_BASE}/dex/search?q=${encodeURIComponent(req.params.address)}`, { timeout: 10000 });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// COINLORE PROXY — free crypto price data, no API key needed
// ─────────────────────────────────────────────────────────────
router.get('/coinlore/global/', async (req, res) => {
  const cacheKey = 'coinlore_global';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get('https://api.coinlore.net/api/global/', { timeout: 10000 });
    setCache(cacheKey, r.data, 60000); // cache 60s
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

router.get('/coinlore/tickers/', async (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  const cacheKey = `coinlore_tickers_${qs}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get(`https://api.coinlore.net/api/tickers/${qs ? '?' + qs : ''}`, { timeout: 10000 });
    setCache(cacheKey, r.data, 30000); // cache 30s
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

router.get('/coinlore/ticker/', async (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  const cacheKey = `coinlore_ticker_${qs}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get(`https://api.coinlore.net/api/ticker/${qs ? '?' + qs : ''}`, { timeout: 10000 });
    setCache(cacheKey, r.data, 30000);
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// FREE MARKET DATA ENDPOINTS — no API key required
// Fear & Greed, CoinGecko global, trending, dominance, exchanges
// ─────────────────────────────────────────────────────────────

// 1. Fear & Greed Index — Alternative.me
router.get('/market/fear-greed', async (req, res) => {
  const cacheKey = 'market_fear_greed';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 10000 });
    const entry = r.data.data[0];
    const result = {
      value: parseInt(entry.value, 10),
      label: entry.value_classification,
      timestamp: entry.timestamp
    };
    setCache(cacheKey, result, 10 * 60 * 1000); // cache 10 minutes
    res.json(result);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// 2. Global crypto market data — CoinGecko
router.get('/market/global', async (req, res) => {
  const cacheKey = 'market_global';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 10000 });
    const result = r.data.data;
    setCache(cacheKey, result, 5 * 60 * 1000); // cache 5 minutes
    res.json(result);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// 3. Trending coins — CoinGecko
router.get('/market/trending', async (req, res) => {
  const cacheKey = 'market_trending';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/search/trending', { timeout: 10000 });
    setCache(cacheKey, r.data, 5 * 60 * 1000); // cache 5 minutes
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// 4. BTC/ETH dominance — derived from CoinGecko global
router.get('/market/dominance', async (req, res) => {
  const cacheKey = 'market_dominance';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 10000 });
    const dom = r.data.data.market_cap_percentage;
    const btc = parseFloat((dom.btc || 0).toFixed(2));
    const eth = parseFloat((dom.eth || 0).toFixed(2));
    const others = parseFloat((100 - btc - eth).toFixed(2));
    const result = { btc, eth, others };
    setCache(cacheKey, result, 5 * 60 * 1000); // cache 5 minutes
    res.json(result);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// 5. Top exchanges — CoinGecko
router.get('/market/exchanges', async (req, res) => {
  const cacheKey = 'market_exchanges';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/exchanges?per_page=10&page=1', { timeout: 10000 });
    setCache(cacheKey, r.data, 30 * 60 * 1000); // cache 30 minutes
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// JUPITER PRICE PROXY — uses CoinGecko as backend (Jupiter API deprecated)
// Returns Jupiter-compatible format: { data: { SOL: { price: 93.4 } } }
// ─────────────────────────────────────────────────────────────
const COINGECKO_MAP = {
  SOL: 'solana', BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin',
  USDT: 'tether', BNB: 'binancecoin', AVAX: 'avalanche-2', MATIC: 'matic-network',
  DOT: 'polkadot', LINK: 'chainlink', UNI: 'uniswap', AAVE: 'aave',
  JUP: 'jupiter-exchange-solana', BONK: 'bonk', WIF: 'dogwifcoin'
};

router.get('/jupiter/price', async (req, res) => {
  try {
    const { ids = 'SOL' } = req.query;
    const symbols = ids.split(',').map(s => s.trim().toUpperCase());
    const cgIds = symbols.map(s => COINGECKO_MAP[s] || s.toLowerCase()).filter(Boolean).join(',');

    const r = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd`,
      { timeout: 10000, headers: { 'Accept': 'application/json' } }
    );

    // Build Jupiter-compatible response format
    const data = {};
    symbols.forEach(sym => {
      const cgId = COINGECKO_MAP[sym] || sym.toLowerCase();
      const price = r.data[cgId]?.usd || 0;
      data[sym] = { id: sym, mintSymbol: sym, vsToken: 'USDC', vsTokenSymbol: 'USDC', price };
    });

    res.json({ data, timeTaken: 10 });
  } catch (e) {
    // Last resort: return SOL at known approximate price so UI doesn't break
    const { ids = 'SOL' } = req.query;
    const data = {};
    ids.split(',').forEach(s => { data[s.trim().toUpperCase()] = { price: 0 }; });
    res.json({ data, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// NEWS — RSS-based, no API key required
// ─────────────────────────────────────────────────────────────

// Simple RSS parser — extracts items from RSS/Atom XML
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return (m ? (m[1] || m[2] || '') : '').trim();
    };
    const title = get('title');
    const link  = get('link') || get('guid');
    const pubDate = get('pubDate') || get('published');
    const desc = get('description') || get('summary') || get('content:encoded');
    if (title) items.push({ title, url: link, published_at: pubDate, description: desc.replace(/<[^>]+>/g, '').substring(0, 200) });
  }
  return items;
}

async function fetchRSSNews(feedUrl) {
  const r = await axios.get(feedUrl, {
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI/62', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' }
  });
  return parseRSS(r.data);
}

const RSS_FEEDS = [
  'https://cointelegraph.com/rss',
  'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
  'https://decrypt.co/feed',
  'https://www.theblock.co/rss.xml'
];

router.get('/news/cryptopanic', async (req, res) => {
  // Try CryptoPanic with key first, then fall back to RSS feeds
  const key = process.env.CRYPTOPANIC_API_KEY || '';
  if (key) {
    try {
      const r = await axios.get(`https://cryptopanic.com/api/v1/posts/?auth_token=${key}&public=true`, { timeout: 12000 });
      return res.json(r.data);
    } catch { /* fall through */ }
  }

  // RSS fallback — try each feed until one works
  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRSSNews(feed);
      if (items.length > 0) {
        return res.json({ results: items, count: items.length, source: feed });
      }
    } catch { /* try next */ }
  }

  res.json({ results: [], count: 0, message: 'All news feeds unavailable' });
});

router.get('/news/actually-relevant', async (req, res) => {
  // NewsAPI if key present
  const key = process.env.NEWSAPI_API_KEY || '';
  if (key) {
    try {
      const r = await axios.get(
        `https://newsapi.org/v2/everything?q=crypto+blockchain+solana+bitcoin&sortBy=publishedAt&apiKey=${key}&pageSize=20&language=en`,
        { timeout: 15000 }
      );
      return res.json({ articles: r.data.articles || [] });
    } catch { /* fall through */ }
  }

  // RSS fallback
  const allArticles = [];
  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRSSNews(feed);
      items.slice(0, 5).forEach(item => allArticles.push({
        title: item.title, url: item.url,
        publishedAt: item.published_at,
        description: item.description,
        source: { name: new URL(feed).hostname }
      }));
      if (allArticles.length >= 20) break;
    } catch { /* try next */ }
  }

  res.json({ articles: allArticles, total: allArticles.length });
});

// ─────────────────────────────────────────────────────────────
// SERPAPI — web search proxy
// ─────────────────────────────────────────────────────────────
router.post('/serpapi', async (req, res) => {
  try {
    const { query } = req.body;
    const key = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || '';
    if (!key) return res.status(400).json({ error: 'No SerpAPI key. Add SERPAPI_KEY to .env', organic_results: [] });

    const r = await axios.get('https://serpapi.com/search', {
      params: { q: query, api_key: key, engine: 'google' },
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { organic_results: [] });
  }
});

// ─────────────────────────────────────────────────────────────
// URL FETCHER — generic pass-through proxy
// ─────────────────────────────────────────────────────────────
router.post('/fetch-url', async (req, res) => {
  try {
    const { url, method = 'GET', body, headers = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    let parsedBody;
    if (body) {
      try { parsedBody = typeof body === 'string' ? JSON.parse(body) : body; } catch { parsedBody = body; }
    }

    const r = await axios({
      method: method.toUpperCase(),
      url,
      data: parsedBody,
      headers: { 'User-Agent': 'SHADDAI/62.0', ...headers },
      timeout: 20000,
      validateStatus: () => true
    });

    const content = typeof r.data === 'object' ? JSON.stringify(r.data) : String(r.data);
    res.json({ content, status: r.status, headers: r.headers });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { content: '' });
  }
});

// ─────────────────────────────────────────────────────────────
// FILE SYSTEM (path-sandboxed to user's home directory)
// ─────────────────────────────────────────────────────────────
const HOME_DIR = require('os').homedir();

function safePath(inputPath) {
  if (!inputPath) return null;
  const resolved = path.resolve(inputPath);
  // Block traversal outside home directory (security boundary)
  if (!resolved.startsWith(HOME_DIR)) {
    throw new Error(`Access denied: path outside allowed directory`);
  }
  return resolved;
}

router.post('/read-file', (req, res) => {
  try {
    const filePath = req.body.filePath || req.body.path;
    if (!filePath) return res.status(400).json({ error: 'filePath required', content: '' });
    const safe = safePath(filePath);
    const content = fs.readFileSync(safe, 'utf8');
    // OWASP API3: never return absolute disk path to client
    res.json({ content, name: path.basename(safe), size: content.length });
  } catch (e) {
    const status = e.message.includes('denied') ? 403 : e.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ error: e.message, content: '' });
  }
});

// Write a file (sandboxed to HOME_DIR — for skill editing)
router.post('/write-file', (req, res) => {
  try {
    const filePath = req.body.filePath || req.body.path;
    const content  = req.body.content;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    if (content.length > 500000) return res.status(400).json({ error: 'content too large (max 500KB)' });
    const safe = safePath(filePath);
    // Ensure parent directory exists
    const parent = path.dirname(safe);
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(safe, content, 'utf8');
    res.json({ ok: true, path: safe, size: content.length });
  } catch(e) { fail(res, 500, 'internal_error', e.message); }
});

router.post('/scan-folder', (req, res) => {
  try {
    const folderPath = req.body.folderPath || req.body.path;
    if (!folderPath) return res.status(400).json({ error: 'folderPath required', files: [] });
    const safe = safePath(folderPath);
    const items = fs.readdirSync(safe, { withFileTypes: true });
    const files = items.map(i => ({ name: i.name, type: i.isDirectory() ? 'directory' : 'file', path: path.join(safe, i.name) }));
    res.json({ files, path: safe, total: files.length });
  } catch (e) {
    res.status(e.message.includes('denied') ? 403 : 500).json({ error: e.message, files: [] });
  }
});

router.post('/scan-folders', (req, res) => {
  try {
    const inputPaths = req.body.paths || req.body.folders || [];
    const results = {};
    for (const p of inputPaths) {
      try {
        const safe = safePath(p);
        results[p] = fs.readdirSync(safe, { withFileTypes: true })
          .map(i => ({ name: i.name, type: i.isDirectory() ? 'directory' : 'file', path: path.join(safe, i.name) }));
      } catch { results[p] = []; }
    }
    res.json(results);
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// ─────────────────────────────────────────────────────────────
// SKILLS SYSTEM — aggregate all 7 agent skills
// ─────────────────────────────────────────────────────────────

// Master skill registry — enriched with metadata
const SKILL_REGISTRY = [
  // SHADDAI skills
  { name: 'orchestration', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Coordinate multi-agent workflows and delegate tasks' },
  { name: 'strategy', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Strategic planning and executive decision making' },
  { name: 'decision-making', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Evaluate options and make decisive choices' },
  { name: 'multi-agent-coordination', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Synchronize work across all 7 agents' },
  { name: 'executive-planning', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Long-term planning and milestone tracking' },
  { name: 'pipeline', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Build automated execution pipelines' },
  { name: 'audit', type: 'agent', agent: 'SHADDAI', port: 8000, description: 'Audit system state and agent performance' },
  // ZEROX skills
  { name: 'pricing-strategy', type: 'agent', agent: 'ZEROX', port: 8001, description: 'Design pricing tiers and monetization strategy' },
  { name: 'revenue-modeling', type: 'agent', agent: 'ZEROX', port: 8001, description: 'Model MRR, LTV, CAC, and growth projections' },
  { name: 'stripe-integration', type: 'agent', agent: 'ZEROX', port: 8001, description: 'Stripe billing setup and subscription management' },
  { name: 'subscription-tiers', type: 'agent', agent: 'ZEROX', port: 8001, description: 'Design and implement subscription plans' },
  { name: 'unit-economics', type: 'agent', agent: 'ZEROX', port: 8001, description: 'Analyze cost per acquisition and payback periods' },
  { name: 'financial-analysis', type: 'agent', agent: 'ZEROX', port: 8001, description: 'P&L analysis, runway calculation, burn rate' },
  // ORACLE skills
  { name: 'market-research', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Research market trends and opportunities' },
  { name: 'competitive-analysis', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Analyze competitors and identify gaps' },
  { name: 'crypto-intelligence', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Crypto market intelligence and on-chain analysis' },
  { name: 'trend-analysis', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Identify emerging trends and patterns' },
  { name: 'data-synthesis', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Synthesize data from multiple sources' },
  { name: 'web3_scanner', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Scan and analyze Web3 tokens and contracts' },
  { name: 'web-scraping', type: 'agent', agent: 'ORACLE', port: 8002, description: 'Extract data from web sources' },
  // NEXUS skills
  { name: 'backend-architecture', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Design scalable backend systems and APIs' },
  { name: 'api-design', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Design RESTful and GraphQL APIs' },
  { name: 'database-design', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Schema design and query optimization' },
  { name: 'system-scaling', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Scale systems to handle load' },
  { name: 'code-review', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Review code for quality and correctness' },
  { name: 'code_builder', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Build and generate code for any task' },
  { name: 'security-hardening', type: 'agent', agent: 'NEXUS', port: 8003, description: 'Harden systems against attacks' },
  // TURTLE skills
  { name: 'ui-design', type: 'agent', agent: 'TURTLE', port: 8004, description: 'Design beautiful user interfaces' },
  { name: 'ux-flows', type: 'agent', agent: 'TURTLE', port: 8004, description: 'Map and optimize user experience flows' },
  { name: 'css-animations', type: 'agent', agent: 'TURTLE', port: 8004, description: 'Create smooth CSS animations and transitions' },
  { name: 'react-components', type: 'agent', agent: 'TURTLE', port: 8004, description: 'Build reusable React component library' },
  { name: 'design-systems', type: 'agent', agent: 'TURTLE', port: 8004, description: 'Create comprehensive design systems' },
  { name: 'frontend-architecture', type: 'agent', agent: 'TURTLE', port: 8004, description: 'Architect scalable frontend applications' },
  // QUILL skills
  { name: 'technical-writing', type: 'agent', agent: 'QUILL', port: 8005, description: 'Write clear technical documentation' },
  { name: 'api-documentation', type: 'agent', agent: 'QUILL', port: 8005, description: 'Document APIs with examples and guides' },
  { name: 'marketing-copy', type: 'agent', agent: 'QUILL', port: 8005, description: 'Compelling copy for landing pages and emails' },
  { name: 'user-guides', type: 'agent', agent: 'QUILL', port: 8005, description: 'Write user-friendly product guides' },
  { name: 'content-strategy', type: 'agent', agent: 'QUILL', port: 8005, description: 'Plan content calendar and messaging strategy' },
  { name: 'error-messages', type: 'agent', agent: 'QUILL', port: 8005, description: 'Write helpful, clear error messages' },
  // PIKADON skills
  { name: 'security-auditing', type: 'agent', agent: 'PIKADON', port: 8008, description: 'Audit code and systems for vulnerabilities' },
  { name: 'vulnerability-assessment', type: 'agent', agent: 'PIKADON', port: 8008, description: 'Assess and score security vulnerabilities' },
  { name: 'owasp-compliance', type: 'agent', agent: 'PIKADON', port: 8008, description: 'Check compliance with OWASP top 10' },
  { name: 'secret-rotation', type: 'agent', agent: 'PIKADON', port: 8008, description: 'Rotate API keys and secrets safely' },
  { name: 'access-control', type: 'agent', agent: 'PIKADON', port: 8008, description: 'Design and enforce access control policies' },
  { name: 'audit-logging', type: 'agent', agent: 'PIKADON', port: 8008, description: 'Set up comprehensive audit trails' }
];

// GET /api/shaddai/skills — returns ALL skills from Obsidian vault
router.get('/shaddai/skills', (req, res) => {
  try {
    // Load from Obsidian vault (cached for 5 min)
    const obsidianSkills = skillsLoader.getSkillRegistry(OBSIDIAN_ROOT);
    // Merge with built-in registry (obsidian takes priority)
    const obsidianNames = new Set(obsidianSkills.map(s => s.name));
    const builtinOnly = SKILL_REGISTRY.filter(s => !obsidianNames.has(s.name));
    const allSkills = [...obsidianSkills, ...builtinOnly];
    res.json({ skills: allSkills, total: allSkills.length, agents: 7, source: 'obsidian+builtin' });
  } catch (e) {
    // Fallback to built-in registry
    res.json({ skills: SKILL_REGISTRY, total: SKILL_REGISTRY.length, agents: 7, source: 'builtin' });
  }
});

// GET /api/skills/catalog — FAST, paginated, NO-Obsidian skill catalog (the real wired skills).
//   Source: skill-index.js → RECIPES (executable real tool-chains) + baked catalog (md/json).
//   Scales to thousands: in-memory, read-only, no vault scan. ?q= ranked search, ?agent= filter,
//   ?offset=&limit= paging. This is what the Skills Library + Marketplace should use.
router.get('/skills/catalog', (req, res) => {
  try {
    const skillIndex = require('./skill-index');
    const q      = String(req.query.q || '').trim();
    const agent  = String(req.query.agent || '').trim();
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit  = Math.min(5000, Math.max(1, parseInt(req.query.limit) || 60)); // in-memory; allow full-catalog pulls for the Library chips
    let items;
    if (q) {
      // ranked search across recipes + md + baked (no Obsidian)
      items = skillIndex.findSkills(q, { agent: agent || undefined, limit: 600, includeRecipes: true, includeMd: true, includeObsidian: true });
    } else {
      // browse: executable recipes first, then the baked catalog
      const recipes = skillIndex.listRecipes().map(r => ({ id: r.id, name: r.id, description: r.description, agent: r.agent, type: 'recipe', params: r.params, stepCount: r.stepCount }));
      const baked = (skillIndex.loadBakedCatalog().skills || []).map(s => ({ id: s.id, name: s.name, description: s.description, agent: s.agent, category: s.category, type: 'baked' }));
      items = recipes.concat(baked);
      if (agent) items = items.filter(s => String(s.agent || '').toUpperCase() === agent.toUpperCase());
    }
    // Mark executable, then enrich with kind/useCase/model/estCost (rules-derived, not hand-written)
    items = items.map(s => skillIndex.enrichSkill({ ...s, executable: s.type === 'recipe' }));
    const total = items.length;
    res.json({ ok: true, total, offset, limit, count: Math.min(limit, Math.max(0, total - offset)),
      skills: items.slice(offset, offset + limit), source: 'baked+recipes (no obsidian)' });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// GET /api/skills/catalog/stats — counts (recipes / md / baked / total), no Obsidian
router.get('/skills/catalog/stats', (req, res) => {
  try { res.json({ ok: true, ...require('./skill-index').getStats() }); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// ─── CUSTOM SKILLS (user-created / uploaded) ────────────────────────────────
const CUSTOM_SKILLS_FILE = path.join(DATA_DIR, 'custom_skills.json');
let _customSkills = loadJSON(CUSTOM_SKILLS_FILE, []);
let _skillAssignments = loadJSON(path.join(DATA_DIR, 'skill_assignments.json'), {});

function saveCustomSkills() { saveJSON(CUSTOM_SKILLS_FILE, _customSkills); }
function saveSkillAssignments() { saveJSON(path.join(DATA_DIR, 'skill_assignments.json'), _skillAssignments); }

// GET /api/agents/:name — return agent's full MD documentation (skills list, tool access, examples)
router.get('/agents/:name/docs', (req, res) => {
  try {
    const name = req.params.name.toUpperCase().replace(/[^A-Z]/g, '');
    const mdPath = path.join(DATA_DIR, 'agents', name + '.md');
    if (!fs.existsSync(mdPath)) return res.status(404).json({ error: 'Agent docs not found', name });
    const content = fs.readFileSync(mdPath, 'utf8');
    // Extract skill list from MD table — look for table rows: | skill-id | Name | Description |
    const skillRows = content.match(/^\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm) || [];
    const skills = skillRows.slice(1).map(row => {  // skip header row
      const m = row.match(/^\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
      return m ? { id: m[1], name: m[2].trim(), description: m[3].trim(), agent: name } : null;
    }).filter(Boolean);
    res.json({ name, content, skills, skillCount: skills.length });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/agents/:name/manifest — portable Agent Manifest (spec v1.0, see specs/AGENT_MANIFEST.md)
router.get('/agents/:name/manifest', (req, res) => {
  try {
    const { buildManifest } = require('./lib/agent-manifest');
    const name = String(req.params.name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const ae = (agentEngine.AGENTS && agentEngine.AGENTS[name]) || null;
    const tools = (ae && ae.tools) || [];
    let manifest = buildManifest(name, { tools });
    // Custom/forged agents aren't in PERSONAS — build their manifest from the engine entry.
    if (!manifest && ae) {
      manifest = buildManifest(name, { tools, custom: { label: ae.name || name, persona: ae.goal || ('You are ' + name + ', a SHADDAI operator.'), defaultBrain: 'groq-70b' } });
    }
    if (!manifest) return res.status(404).json({ error: 'Unknown agent', name });
    // Merge a generated portrait if one exists (additive — never overwrites collectibles).
    try {
      const av = require('./lib/agent-avatars').getAvatar(name);
      if (av && av.uri) manifest.avatar.uri = av.uri;
    } catch (_) { /* avatar layer optional */ }
    res.json(manifest);
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/agents/:name/avatar — generate+persist a portrait (body: { prompt? }).
// Additive: writes data/agent-avatars.json only; does NOT touch collectibles/rooms.
router.post('/agents/:name/avatar', (req, res) => {
  try {
    const { generateAvatar } = require('./lib/agent-avatars');
    const name = String(req.params.name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const entry = generateAvatar(name, (req.body && req.body.prompt) || null);
    res.json({ ok: true, agent: name, ...entry });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/x402/discover — x402 billable-endpoint discovery (alias of /.well-known/x402.json)
router.get('/x402/discover', (req, res) => res.json(require('./lib/x402').discovery()));

// GET /api/nft/mint-authority — beginner-friendly: the minter's address + balance + funded?
router.get('/nft/mint-authority', async (req, res) => {
  try {
    const { Keypair, Connection, clusterApiUrl } = require('@solana/web3.js');
    const secret = (process.env.SOLANA_MINT_SECRET || '').trim();
    if (!secret.startsWith('[')) {
      return res.json({ configured: false, error: 'Minter not set up yet (run scripts/setup-devnet-mint.js).' });
    }
    let kp;
    try { kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret))); }
    catch (e) { return res.json({ configured: false, error: 'Minter key unreadable.' }); }
    const network = process.env.SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
    let lamports = 0;
    try { lamports = await new Connection(clusterApiUrl(network), 'confirmed').getBalance(kp.publicKey); } catch (_) {}
    res.json({
      configured: true, network,
      authority: kp.publicKey.toString(),
      balanceSol: +(lamports / 1e9).toFixed(4),
      funded: lamports >= 5000000,
      faucet: 'https://faucet.solana.com'
    });
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// POST /api/collectibles/:id/mint-nft — mint a collectible as a real Solana NFT (devnet-first).
// Uses the mint_nft tool; returns the clean needs-key/needs-libs message if not configured.
router.post('/collectibles/:id/mint-nft', async (req, res) => {
  try {
    const tool = agentEngine.TOOLS && agentEngine.TOOLS.mint_nft;
    if (!tool) return res.status(501).json({ error: 'mint_nft tool not available' });
    const b = req.body || {};
    const name = b.name || ('SHADDAI Collectible #' + req.params.id);
    // W009: preview unless the request explicitly confirms (body.confirm === true).
    const out = await tool.execute({ name, collectibleId: req.params.id, uri: b.uri, description: b.description, confirm: b.confirm === true });
    res.json(typeof out === 'string' ? JSON.parse(out) : out);
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/agents/:name/skill/:skillId — return a specific skill from an agent's MD file
router.get('/agents/:name/skill/:skillId', (req, res) => {
  try {
    const name = req.params.name.toUpperCase().replace(/[^A-Z]/g, '');
    const skillId = req.params.skillId.toLowerCase();
    const mdPath = path.join(DATA_DIR, 'agents', name + '.md');
    if (!fs.existsSync(mdPath)) return res.status(404).json({ error: 'Agent not found' });
    const content = fs.readFileSync(mdPath, 'utf8');
    const rowRe = new RegExp('^\\|\\s*' + skillId + '\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|$', 'm');
    const m = content.match(rowRe);
    if (!m) return res.status(404).json({ error: 'Skill not found', skillId });
    res.json({ id: skillId, name: m[1].trim(), description: m[2].trim(), agent: name });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/skills/search?query=...&agent=... — keyword search over Obsidian+builtin skills
router.get('/skills/search', (req, res) => {
  try {
    const query = (req.query.query || '').toLowerCase().trim();
    const agent = (req.query.agent || '').toUpperCase();
    const limit = parseInt(req.query.limit) || 5;
    let allSkills = [...SKILL_REGISTRY];
    try {
      const obsidian = skillsLoader.getSkillRegistry(OBSIDIAN_ROOT);
      if (obsidian && obsidian.length) {
        const obsNames = new Set(obsidian.map(s => s.name));
        allSkills = [...obsidian, ...allSkills.filter(s => !obsNames.has(s.name))];
      }
    } catch (_) {}
    // Filter by agent if provided
    let filtered = agent ? allSkills.filter(s => !s.agent || s.agent.toUpperCase() === agent) : allSkills;
    // Score by keyword match in name + description
    if (query) {
      const words = query.split(/\s+/).filter(Boolean);
      filtered = filtered.map(s => {
        const haystack = ((s.name||'') + ' ' + (s.description||'')).toLowerCase();
        const score = words.reduce((n, w) => n + (haystack.includes(w) ? 1 : 0), 0);
        return { ...s, _score: score };
      }).filter(s => s._score > 0).sort((a, b) => b._score - a._score);
    }
    // Always return something useful — fallback to agent skills if no query match
    if (!filtered.length && agent) filtered = allSkills.filter(s => s.agent && s.agent.toUpperCase() === agent).slice(0, limit);
    if (!filtered.length) filtered = allSkills.slice(0, limit);
    const results = filtered.slice(0, limit).map(({ _score, ...s }) => s);
    res.json({ skills: results, total: results.length, query, agent });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { skills: [] });
  }
});

// GET /api/skills/semantic-search — TF-IDF cosine similarity skill search
// Query params: q (required), agent (optional, e.g. "NEXUS"), k (optional, default 5)
router.get('/skills/semantic-search', async (req, res) => {
  try {
    const { q, agent, k = 5 } = req.query;
    if (!q) return res.status(400).json({ error: 'q param required' });
    const { semanticFindSkills } = require('./skill-embeddings');
    const results = semanticFindSkills(q, parseInt(k), agent || null);
    res.json({ query: q, results, count: results.length });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/skills/semantic-search/stats — index health check
router.get('/skills/semantic-search/stats', (req, res) => {
  try {
    const { getIndexStats } = require('./skill-embeddings');
    res.json(getIndexStats());
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/skills/content/:name — return full SKILL.md content for a skill
router.get('/skills/content/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    let content = null;
    let source = 'obsidian';
    let filePath = null;
    try { content = skillsLoader.getSkillContent(name, OBSIDIAN_ROOT); } catch {}
    try {
      const reg = skillsLoader.getSkillRegistry(OBSIDIAN_ROOT);
      const found = reg.find(s => s.name === name);
      if (found) filePath = found.filePath;
    } catch {}
    if (!content) {
      const custom = _customSkills.find(s => s.name === name || s.id === name);
      if (custom) {
        content = custom.systemPrompt || custom.content || custom.description || '';
        source = 'custom';
      }
    }
    // Fallback to the recipe / MD / baked catalog (skill-index) so executable skills
    // like gen-image / image-prompt-pack resolve instead of showing "Skill content not available".
    if (!content) {
      try {
        const skillIndex = require('./skill-index');
        let sk = skillIndex.loadSkillContent(name);
        if (!sk) {
          const m = skillIndex.findSkills(name, { limit: 1 });
          if (m.length) sk = skillIndex.loadSkillContent(m[0].id, { type: m[0].type });
        }
        if (sk) {
          if (sk.type === 'recipe') {
            const r = sk.recipe;
            source = 'recipe';
            content = `# ${name}\n\n${r.description || ''}\n\n**Agent:** ${r.agent}\n**Inputs:** ${(r.params || []).join(', ') || 'none'}\n\n**Steps:**\n` +
              r.steps.map((s, i) => `${i + 1}. \`${s.tool}\``).join('\n') +
              `\n\nThis is an executable tool-recipe — press Run to execute it.`;
          } else {
            source = sk.type;
            content = sk.content || `${sk.skill?.name || name}: ${sk.skill?.description || ''}`;
          }
        }
      } catch (_) {}
    }
    if (!content) return res.status(404).json({ error: 'skill not found', name });
    res.json({ name, content, source, filePath, length: content.length });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/shaddai/skills/custom — list all user-created skills
router.get('/shaddai/skills/custom', (req, res) => {
  res.json({ skills: _customSkills, total: _customSkills.length });
});

// POST /api/shaddai/skills/custom — save a new custom skill
router.post('/shaddai/skills/custom', (req, res) => {
  const { skill, assignTo } = req.body;
  if (!skill || !skill.name) return res.status(400).json({ error: 'skill.name is required' });
  // Replace if same name exists
  const idx = _customSkills.findIndex(s => s.name === skill.name);
  if (idx !== -1) _customSkills[idx] = { ..._customSkills[idx], ...skill, updatedAt: new Date().toISOString() };
  else _customSkills.push({ ...skill, createdAt: new Date().toISOString() });
  saveCustomSkills();
  // Auto-assign if requested
  if (assignTo) {
    const agent = assignTo.toLowerCase();
    if (!_skillAssignments[agent]) _skillAssignments[agent] = [];
    if (!_skillAssignments[agent].includes(skill.id)) _skillAssignments[agent].push(skill.id);
    saveSkillAssignments();
  }
  broadcastEvent('skill:created', { name: skill.name, agent: assignTo || skill.agent });
  res.json({ success: true, skill, total: _customSkills.length });
});

// DELETE /api/shaddai/skills/custom/:id — remove a custom skill
router.delete('/shaddai/skills/custom/:id', requireAdmin, (req, res) => {
  const before = _customSkills.length;
  _customSkills = _customSkills.filter(s => s.id !== req.params.id && s.name !== req.params.id);
  saveCustomSkills();
  res.json({ success: true, removed: before - _customSkills.length });
});

// POST /api/shaddai/skills/assign — assign a skill to an agent
router.post('/shaddai/skills/assign', (req, res) => {
  const { skillId, agent } = req.body;
  if (!skillId || !agent) return res.status(400).json({ error: 'skillId and agent required' });
  const agentKey = agent.toLowerCase();
  if (!_skillAssignments[agentKey]) _skillAssignments[agentKey] = [];
  if (!_skillAssignments[agentKey].includes(skillId)) _skillAssignments[agentKey].push(skillId);
  saveSkillAssignments();
  broadcastEvent('skill:assigned', { skillId, agent });
  res.json({ success: true, agent, assignments: _skillAssignments[agentKey] });
});

// GET /api/shaddai/skills/assignments — get all skill assignments
router.get('/shaddai/skills/assignments', (req, res) => {
  res.json({ assignments: _skillAssignments });
});

// ─── SKILL PACKS MARKETPLACE ───────────────────────────────────────
const SKILL_PACKS_FILE = path.join(DATA_DIR, 'skill-packs.json');
const SKILL_INSTALLS_FILE = path.join(DATA_DIR, 'skill-installs.json');

function _readPacks() {
  try { return JSON.parse(fs.readFileSync(SKILL_PACKS_FILE, 'utf8')); } catch { return []; }
}
function _readInstalls() {
  try { return JSON.parse(fs.readFileSync(SKILL_INSTALLS_FILE, 'utf8')); } catch { return {}; }
}
function _writeInstalls(d) { fs.writeFileSync(SKILL_INSTALLS_FILE, JSON.stringify(d, null, 2)); }
function _writePacks(d) { fs.writeFileSync(SKILL_PACKS_FILE, JSON.stringify(d, null, 2)); }

// GET /api/skill-packs — list all available packs
router.get('/skill-packs', (req, res) => {
  res.json(_readPacks());
});

// POST /api/skill-packs/install — install a pack for a user
router.post('/skill-packs/install', (req, res) => {
  const { pack_id, user } = req.body || {};
  if (!pack_id) return res.status(400).json({ error: 'pack_id required' });
  const packs = _readPacks();
  const pack = packs.find(p => p.id === pack_id);
  if (!pack) return res.status(404).json({ error: `Skill pack "${pack_id}" not found` });
  pack.purchases = (pack.purchases || 0) + 1;
  const installs = _readInstalls();
  const userKey = user || 'guest';
  installs[userKey] = installs[userKey] || [];
  if (!installs[userKey].includes(pack_id)) installs[userKey].push(pack_id);
  _writePacks(packs);
  _writeInstalls(installs);
  res.json({ ok: true, message: `Installed "${pack.name}" → ${pack.target_agent} for ${userKey}`, pack, installed: installs[userKey] });
});

// GET /api/skill-packs/installed/:user — list installed packs for a user
router.get('/skill-packs/installed/:user', (req, res) => {
  const user = req.params.user;
  const installs = _readInstalls();
  const packs = _readPacks();
  const ids = installs[user] || [];
  const installed = ids.map(id => packs.find(p => p.id === id)).filter(Boolean);
  res.json(installed);
});

// DELETE /api/skill-packs/installed/:user/:pack_id — uninstall pack
router.delete('/skill-packs/installed/:user/:pack_id', requireAdmin, (req, res) => {
  const { user, pack_id } = req.params;
  const installs = _readInstalls();
  installs[user] = (installs[user] || []).filter(id => id !== pack_id);
  _writeInstalls(installs);
  res.json({ ok: true, installed: installs[user] });
});

// POST /api/shaddai/skill/:skillName — execute a skill (routes to correct agent)
// Uses the actual SKILL.md content as the system prompt for authentic specialist behavior
router.post('/shaddai/skill/:skillName', async (req, res) => {
  const { skillName } = req.params;
  const { params = {}, task, context } = req.body;

  // Find skill in custom, Obsidian vault, or built-in registry
  const customSkill = _customSkills.find(s => s.name === skillName);
  let obsidianSkills = [];
  try { obsidianSkills = skillsLoader.getSkillRegistry(OBSIDIAN_ROOT); } catch {}
  const skill = obsidianSkills.find(s => s.name === skillName) || SKILL_REGISTRY.find(s => s.name === skillName);

  const targetPort = skill?.port || 8000;
  const agentName = customSkill?.agent || skill?.agent || 'SHADDAI';
  const taskText = task || params.task || params.prompt || `Execute skill: ${skillName}`;

  // Try the target agent first (agent server handles Ollama internally)
  try {
    const r = await axios.post(`http://localhost:${targetPort}/skill/${skillName}`, {
      params, context
    }, { timeout: 90000 });
    return res.json({ ...r.data, skill: skillName, agent: agentName });
  } catch {
    // Load real SKILL.md content as system prompt (authentic specialist mode)
    // Custom skills use their stored content/systemPrompt; Obsidian skills use SKILL.md
    let systemPrompt = customSkill?.systemPrompt || customSkill?.content || null;
    if (!systemPrompt) { try { systemPrompt = skillsLoader.getSkillContent(skillName, OBSIDIAN_ROOT); } catch {} }

    // Strip frontmatter if present — keep the body (the actual system prompt)
    if (systemPrompt) {
      systemPrompt = systemPrompt.replace(/^---[\s\S]*?---\s*/m, '').trim();
    }
    if (!systemPrompt) {
      systemPrompt = `You are a specialist in "${skillName}". Execute this skill precisely and helpfully.`;
    }

    try {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: DEFAULT_OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: taskText }
        ],
        stream: false
      }, { timeout: 90000 });
      return res.json({
        result: r.data.message?.content || 'Skill completed',
        skill: skillName, agent: agentName, status: 'completed', source: 'ollama-skill'
      });
    } catch (e) {
      fail(res, 500, 'internal_error', e.message, { skill: skillName });
    }
  }
});

// POST /api/shaddai/skill/:skillName/:action — skill with action
router.post('/shaddai/skill/:skillName/:action', async (req, res) => {
  const { skillName, action } = req.params;
  const { params = {}, task, context } = req.body;

  let obsidianSkills = [];
  try { obsidianSkills = skillsLoader.getSkillRegistry(OBSIDIAN_ROOT); } catch {}
  const skill = obsidianSkills.find(s => s.name === skillName) || SKILL_REGISTRY.find(s => s.name === skillName);
  const targetPort = skill?.port || 8000;
  const agentName = skill?.agent || 'SHADDAI';
  const taskText = task || params.task || params.prompt || `Execute ${skillName}/${action}`;

  try {
    const r = await axios.post(`http://localhost:${targetPort}/skill/${skillName}`, {
      params: { ...params, action }, context
    }, { timeout: 90000 });
    return res.json({ ...r.data, skill: skillName, action, agent: agentName });
  } catch {
    let systemPrompt = null;
    try {
      const raw = skillsLoader.getSkillContent(skillName, OBSIDIAN_ROOT);
      if (raw) systemPrompt = raw.replace(/^---[\s\S]*?---\s*/m, '').trim();
    } catch {}
    if (!systemPrompt) systemPrompt = `You are a specialist in "${skillName}/${action}". Be precise.`;

    try {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: DEFAULT_OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${taskText}\nAction requested: ${action}\nParams: ${JSON.stringify(params)}` }
        ],
        stream: false
      }, { timeout: 90000 });
      return res.json({
        result: r.data.message?.content || 'Skill completed',
        skill: skillName, action, agent: agentName, status: 'completed', source: 'ollama-skill'
      });
    } catch (e) {
      fail(res, 500, 'internal_error', e.message, { skill: skillName, action });
    }
  }
});

// ─────────────────────────────────────────────────────────────
// AGENT STATUS PROXIES (ports 8000–8008)
// ─────────────────────────────────────────────────────────────
async function proxyAgent(port, agentPath, res, mustBeOnline = false) {
  try {
    const r = await axios.get(`http://localhost:${port}${agentPath}`, { timeout: 3000 });
    res.json(r.data);
  } catch {
    if (mustBeOnline) {
      // Return 503 so agentFetch knows it's offline
      res.status(503).json({ status: 'offline', port, message: `Agent on :${port} not running` });
    } else {
      res.json({ status: 'offline', port, message: `Agent on :${port} not running` });
    }
  }
}

// Root status routes (return gracefully even if offline)
router.get('/zerox/', (req, res) => proxyAgent(8001, '/', res));
router.get('/zerox/trending', (req, res) => proxyAgent(8001, '/trending', res));
router.get('/oracle/', (req, res) => proxyAgent(8002, '/', res));
router.get('/turtle/', (req, res) => proxyAgent(8004, '/', res));
router.get('/network/', (req, res) => proxyAgent(8003, '/', res));
router.get('/nexus/', (req, res) => proxyAgent(8003, '/', res));
router.get('/mirofish/', (req, res) => proxyAgent(5001, '/', res));

// Ping routes — used by agentFetch('/ping') — 503 = offline so UI marks as offline
router.get('/shaddai/ping', (req, res) => proxyAgent(8000, '/ping', res, true));
router.get('/zerox/ping',   (req, res) => proxyAgent(8001, '/ping', res, true));
router.get('/oracle/ping',  (req, res) => proxyAgent(8002, '/ping', res, true));
router.get('/turtle/ping',  (req, res) => proxyAgent(8004, '/ping', res, true));
router.get('/nexus/ping',   (req, res) => proxyAgent(8003, '/ping', res, true));
router.get('/quill/ping',   (req, res) => proxyAgent(8005, '/ping', res, true));
router.get('/pikadon/ping', (req, res) => proxyAgent(8008, '/ping', res, true));

// ─────────────────────────────────────────────────────────────
// DASHBOARD METRICS
// ─────────────────────────────────────────────────────────────
router.get('/dashboard/metrics', async (req, res) => {
  const jobs = loadJSON(JOBS_FILE, []);
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(j => j.status === 'open' || j.status === 'assigned').length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const totalEarnings = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + (parseFloat(j.budget) || 0), 0);
  const uptimeSecs = Math.floor(process.uptime());
  const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  let ollamaOnline = false;
  try { await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 1500 }); ollamaOnline = true; } catch {}
  res.json({
    totalJobs, activeJobs, completedJobs,
    totalEarnings: totalEarnings.toFixed(2),
    uptime: uptimeSecs,
    memory: memUsage,
    ollamaOnline,
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────
// DEVSTACK STATUS
// ─────────────────────────────────────────────────────────────
router.get('/devstack-status', async (req, res) => {
  const status = { ollama: false, openclaw: false, shaddai: false, timestamp: new Date().toISOString() };
  try { await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 }); status.ollama = true; } catch {}
  res.json(status);
});

// ─────────────────────────────────────────────────────────────
// WORKFLOW CREATE
// ─────────────────────────────────────────────────────────────
router.post('/workflow/create', (req, res) => {
  const { workflow } = req.body;
  res.json({ id: `wf_${Date.now()}`, status: 'created', workflow, message: 'Workflow queued' });
});

// ─────────────────────────────────────────────────────────────
// ELEVENLABS TTS
// ─────────────────────────────────────────────────────────────
router.get('/elevenlabs/voices', async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY || '';
  if (!key) return res.json({ voices: [] });
  try {
    const r = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key }, timeout: 10000
    });
    res.json(r.data);
  } catch (e) { res.json({ voices: [], error: e.message }); }
});

router.post('/elevenlabs/tts', async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY || '';
  const { text, voice_id = 'pNInz6obpgDQGcFmaJgB' } = req.body;
  if (!key) return res.status(400).json({ error: 'No ElevenLabs API key' });
  if (await enforceCredits(req, res, 'voice_tts')) return; // charge before synthesizing
  try {
    const r = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      { text, model_id: 'eleven_monolingual_v1' },
      { headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 30000 }
    );
    res.set('Content-Type', 'audio/mpeg');
    res.send(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// CORE RESEARCH — Ollama-powered research
// ─────────────────────────────────────────────────────────────
router.post('/core-research', async (req, res) => {
  const { topic, query } = req.body;
  try {
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: DEFAULT_OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'You are a research analyst. Provide concise, factual responses.' },
        { role: 'user', content: query || topic || '' }
      ],
      stream: false
    }, { timeout: 60000 });
    res.json({ content: r.data.message?.content || '', source: 'ollama', topic });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { content: '' });
  }
});

// ─────────────────────────────────────────────────────────────
// TELEGRAPH POST
// ─────────────────────────────────────────────────────────────
router.post('/telegraph', async (req, res) => {
  const { title, content } = req.body;
  try {
    const r = await axios.post('https://api.telegra.ph/createPage', {
      access_token: process.env.TELEGRAPH_TOKEN || '',
      title: title || 'SHADDAI Report',
      content: [{ tag: 'p', children: [String(content || '')] }],
      return_content: false
    }, { timeout: 10000 });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// SERVER-SENT EVENTS (SSE) — real-time event stream
// Dashboard subscribes here for live job/bid/marketplace updates
// ─────────────────────────────────────────────────────────────
const _sseClients = new Set();

router.get('/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Immediate welcome + system stats
  const welcome = JSON.stringify({
    type: 'connected',
    payload: {
      message: 'SHADDAI real-time stream connected',
      clients: _sseClients.size + 1,
      jobs: _jobs ? _jobs.length : 0,
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });
  res.write(`data: ${welcome}\n\n`);
  _sseClients.add(res);

  // Heartbeat every 20 seconds to keep connection alive
  const hb = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(hb);
      _sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(hb);
    _sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Active: ${_sseClients.size}`);
  });
  console.log(`[SSE] Client connected. Active: ${_sseClients.size}`);
});

// Helper: broadcast an event to all SSE clients, record to history, and fire webhooks
function broadcastEvent(type, payload) {
  const event = recordEvent(type, payload);
  const data = JSON.stringify(event);
  for (const client of _sseClients) {
    try { client.write(`data: ${data}\n\n`); } catch { _sseClients.delete(client); }
  }
  // Fire registered webhooks asynchronously (non-blocking)
  setImmediate(() => fireWebhooks(type, payload).catch(() => {}));
}

// Expose broadcaster so other server code can use it
router.broadcastEvent = broadcastEvent;

// Recent events history — dashboard loads this on connect to see what happened
router.get('/events/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  // System events (no owner) are shared; any owner-tagged event is caller-only.
  const uid = String(req.headers['x-user-id'] || '').trim();
  const evs = _eventHistory.filter(e => !e || !e.owner || e.owner === uid);
  res.json({ events: evs.slice(-limit), total: evs.length });
});

// LLM queue status
router.get('/ollama/status', (req, res) => {
  res.json({ active: _activeLLM, queued: _llmQueue.length, maxConcurrent: MAX_CONCURRENT_LLM, available: _activeLLM < MAX_CONCURRENT_LLM });
});

// ─────────────────────────────────────────────────────────────
// PERIODIC MARKET DATA PUSH — broadcasts price updates every 60s
// ─────────────────────────────────────────────────────────────
async function fetchAndBroadcastMarket() {
  if (_sseClients.size === 0) return; // no one listening
  try {
    const r = await axios.get('https://api.coinlore.net/api/tickers/?start=0&limit=5', { timeout: 8000 });
    const tickers = (r.data?.data || []).map(t => ({
      symbol: t.symbol, name: t.name,
      price: parseFloat(t.price_usd),
      change: parseFloat(t.percent_change_24h || 0)
    }));
    broadcastEvent('market:update', { tickers, source: 'coinlore', timestamp: new Date().toISOString() });
  } catch { /* silently skip if API unavailable */ }
}

// Also broadcast agent activity + job stats every 30s
async function broadcastSystemStatus() {
  if (_sseClients.size === 0) return;
  const agentStatuses = {};
  await Promise.allSettled(
    Object.entries({ shaddai: 8000, zerox: 8001, oracle: 8002, nexus: 8003, turtle: 8004, quill: 8005, pikadon: 8008 })
      .map(async ([name, port]) => {
        try {
          await axios.get(`http://localhost:${port}/ping`, { timeout: 800 });
          agentStatuses[name] = 'ONLINE';
        } catch { agentStatuses[name] = 'OFFLINE'; }
      })
  );
  const openJobs = _jobs ? _jobs.filter(j => j.status === 'open').length : 0;
  broadcastEvent('system:status', { agents: agentStatuses, openJobs, activeClients: _sseClients.size, timestamp: new Date().toISOString() });
}

// Start periodic broadcasts after 5s delay (let server fully start)
setTimeout(() => {
  fetchAndBroadcastMarket();
  broadcastSystemStatus();
  setInterval(fetchAndBroadcastMarket, 60000);
  setInterval(broadcastSystemStatus, 30000);
}, 5000);

// ─────────────────────────────────────────────────────────────
// HELIUS SOLANA RPC PROXY
// ─────────────────────────────────────────────────────────────
router.post('/helius/rpc', async (req, res) => {
  try {
    const r = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      req.body,
      { timeout: 10000 }
    );
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// COINGECKO PROXY — direct price endpoint
// ─────────────────────────────────────────────────────────────
router.get('/coingecko/simple/price', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const r = await axios.get(`https://api.coingecko.com/api/v3/simple/price?${qs}`, { timeout: 10000 });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// JUPITER QUOTE + SWAP
// ─────────────────────────────────────────────────────────────
router.get('/jupiter/quote', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, slippageBps = 50 } = req.query;
    const r = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: { inputMint, outputMint, amount, slippageBps },
      timeout: 10000
    });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message, { data: {} }); }
});

router.post('/jupiter-swap', async (req, res) => {
  res.json({ status: 'pending', message: 'Jupiter swap endpoint — connect a wallet to execute' });
});

// ─────────────────────────────────────────────────────────────
// HELIUS — wallet tokens, NFTs, transactions
// ─────────────────────────────────────────────────────────────
async function heliusRpc(method, params) {
  const r = await axios.post(
    `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    { jsonrpc: '2.0', id: 1, method, params },
    { timeout: 12000 }
  );
  return r.data.result;
}

// Solana balance via Helius or public RPC
router.get('/solana/balance', async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });
  try {
    const url = HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'https://api.mainnet-beta.solana.com';
    const r = await axios.post(url, { jsonrpc:'2.0', id:1, method:'getBalance', params:[address] }, { timeout: 8000 });
    const lamports = r.data?.result?.value || 0;
    const balance = lamports / 1e9;
    res.json({ address, lamports, balance });
  } catch(e) {
    res.json({ address, balance: 0, error: e.message });
  }
});

router.get('/helius-tokens', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.json({ tokens: [] });
    const result = await heliusRpc('getTokenAccountsByOwner', [
      address,
      { programId: 'TokenkegQfeZyiNwAJsyFbPVwwQQfg5bgUvCMSLw6ak' },
      { encoding: 'jsonParsed' }
    ]);
    res.json({ tokens: result?.value || [] });
  } catch (e) { res.json({ tokens: [], error: e.message }); }
});

router.get('/helius-nfts', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address || !HELIUS_KEY) return res.json({ nfts: [] });
    const r = await axios.get(`https://api.helius.xyz/v1/nfts?api-key=${HELIUS_KEY}&ownerAddress=${address}`, { timeout: 12000 });
    res.json({ nfts: r.data || [] });
  } catch (e) { res.json({ nfts: [], error: e.message }); }
});

router.get('/helius-txs', async (req, res) => {
  try {
    const { address, limit = 20 } = req.query;
    if (!address) return res.json({ transactions: [] });
    const result = await heliusRpc('getSignaturesForAddress', [address, { limit: parseInt(limit) }]);
    res.json({ transactions: result || [] });
  } catch (e) { res.json({ transactions: [], error: e.message }); }
});

// ─────────────────────────────────────────────────────────────
// SOLANA HISTORY + STAKE
// ─────────────────────────────────────────────────────────────
router.get('/solana/history', async (req, res) => {
  try {
    const { address, limit = 20 } = req.query;
    if (!address) return res.json({ history: [] });
    const result = await heliusRpc('getSignaturesForAddress', [address, { limit: parseInt(limit) }]);
    res.json({ history: result || [] });
  } catch (e) { res.json({ history: [], error: e.message }); }
});

router.post('/solana/stake', async (req, res) => {
  res.json({ status: 'info', message: 'Staking requires a connected wallet. Use Phantom or Solflare to stake SOL.' });
});

// ─────────────────────────────────────────────────────────────
// DEXSCREENER TOKEN PROFILES
// ─────────────────────────────────────────────────────────────
router.get('/dexscreener/token-profiles/latest/v1', async (req, res) => {
  try {
    const r = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', { timeout: 10000 });
    res.json(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message, { data: [] }); }
});

// ─────────────────────────────────────────────────────────────
// TRADE ANALYZE
// ─────────────────────────────────────────────────────────────
router.post('/trade/analyze', async (req, res) => {
  try {
    const { symbol, signal, price } = req.body;
    const prompt = `Analyze this crypto trade: Symbol=${symbol}, Signal=${signal}, Price=${price}. Give a 2-sentence risk/reward assessment.`;
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: DEFAULT_OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }, { timeout: 30000 });
    res.json({ analysis: r.data.message?.content || 'Analysis unavailable', symbol, signal });
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// CONTENT + IMAGE GENERATION
// ─────────────────────────────────────────────────────────────
router.post('/content/generate', async (req, res) => {
  try {
    const { topic, type = 'post', platform = 'twitter', tone = 'professional' } = req.body;
    const prompt = `Write a ${type} about "${topic}" for ${platform} in a ${tone} tone. Keep it concise.`;
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: DEFAULT_OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }, { timeout: 60000 });
    res.json({ content: r.data.message?.content || '', type, platform, topic });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { content: '' }); }
});

router.post('/image/generate', require('./demo-limit').middleware, async (req, res) => {
  const { prompt, model = 'flux', width = 1024, height = 1024, aspect_ratio = '1:1', resolution = '1K', callback_url, apiKey } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'prompt required' });
  }
  if (await enforceCredits(req, res, 'image_generate')) return; // charge before generating

  // Opt-in premium path: NanoBanana / AceDataCloud (requires a key). Only used
  // when the caller explicitly asks for a nano-banana model AND a key is available.
  const wantsPremium = typeof model === 'string' && model.startsWith('nano-banana');
  const premiumKey = apiKey || process.env.ACEDATACLOUD_API_TOKEN || process.env.NANO_BANANA_KEY || '';
  if (wantsPremium && premiumKey) {
    try {
      const body = { action: 'generate', prompt, model, aspect_ratio, resolution };
      if (callback_url) body.callback_url = callback_url;
      const result = await nanoBananaRequest(body, premiumKey);
      let imageUrl = result.image_url || result.url;
      let taskId = result.id;
      if (taskId && !imageUrl) {
        const final = await pollTask(taskId, premiumKey);
        imageUrl = final.image_url || final.url;
      }
      if (imageUrl) {
        return res.json({ success: true, status: 'completed', url: imageUrl, image_url: imageUrl, source: 'NanoBanana', task_id: taskId, prompt, model });
      }
      // fall through to Pollinations if premium returned nothing usable
    } catch (e) {
      // premium failed — fall through to the always-works default below
    }
  }

  // Together AI — FLUX.1 [schnell] (real Flux, free tier). Used when model=together/flux-free,
  // or as the upgraded default for plain "flux" when a Together key is present.
  const togetherKey = apiKey || process.env.TOGETHER_API_KEY || '';
  const wantsTogether = typeof model === 'string' && /together|flux-free|schnell/i.test(model);
  if ((wantsTogether || (model === 'flux' && togetherKey)) && togetherKey) {
    try {
      const r = await axios.post('https://api.together.xyz/v1/images/generations', {
        model: 'black-forest-labs/FLUX.1-schnell-Free', prompt,
        width: parseInt(width, 10) || 1024, height: parseInt(height, 10) || 1024, n: 1, steps: 4
      }, { headers: { Authorization: `Bearer ${togetherKey}`, 'Content-Type': 'application/json' }, timeout: 60000 });
      const item = (r.data && r.data.data && r.data.data[0]) || {};
      const imageUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
      if (imageUrl) return res.json({ success: true, status: 'completed', url: imageUrl, image_url: imageUrl, source: 'Together FLUX.1-schnell', prompt, model: 'flux-schnell' });
    } catch (e) { /* fall through to next engine */ }
  }

  // fal.ai — FLUX schnell (fastest, premium quality). model=fal / fal-ai.
  const falKey = apiKey || process.env.FAL_KEY || process.env.FAL_API_KEY || '';
  if (typeof model === 'string' && /^fal/i.test(model) && falKey) {
    try {
      const wI = parseInt(width, 10) || 1024, hI = parseInt(height, 10) || 1024;
      const image_size = wI > hI ? 'landscape_16_9' : (wI === hI ? 'square_hd' : 'portrait_16_9');
      const r = await axios.post('https://fal.run/fal-ai/flux/schnell', { prompt, image_size, num_images: 1 },
        { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 60000 });
      const imageUrl = r.data && r.data.images && r.data.images[0] && r.data.images[0].url;
      if (imageUrl) return res.json({ success: true, status: 'completed', url: imageUrl, image_url: imageUrl, source: 'fal.ai FLUX', prompt, model: 'fal-flux' });
    } catch (e) { /* fall through to next engine */ }
  }

  // Optional DALL·E path if explicitly requested and a key is configured.
  if (typeof model === 'string' && model.toLowerCase().includes('dall') && process.env.OPENAI_API_KEY) {
    try {
      const r = await axios.post('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3', prompt, n: 1, size: '1024x1024'
      }, {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 60000
      });
      const imageUrl = r.data?.data?.[0]?.url;
      if (imageUrl) {
        return res.json({ success: true, status: 'completed', url: imageUrl, image_url: imageUrl, source: 'DALL-E', prompt, model: 'dall-e-3' });
      }
    } catch (e) {
      // fall through to Pollinations
    }
  }

  // Default free engine: Hugging Face FLUX.1-schnell via the WORKING router endpoint
  // (server-side key pool + auto-rotation; honors a BYOK apiKey if the caller passed one).
  const hfPool = require('./lib/hf-keys');
  try {
    // BYOK and the server pool both go through hf-keys, which routes to a LIVE
    // inference provider. The old code called `hf-inference` directly for the
    // BYOK path — that provider is retired and returns 410 Gone, so a caller
    // supplying their own valid key got a hard failure while the pool path
    // worked. generateSafe() puts a BYOK key first in the rotation.
    let img = null;
    if (apiKey || hfPool.keys().length) {
      const out = await hfPool.generateSafe(prompt, { byok: apiKey || undefined });
      img = out.buffer || null;
    }
    if (img) {
      const dataUri = `data:image/png;base64,${img.toString('base64')}`;
      return res.json({ success: true, status: 'completed', url: dataUri, image_url: dataUri, source: 'HuggingFace FLUX.1-schnell', prompt, model: 'flux-schnell' });
    }
  } catch (e) { /* fall through to the free fallback */ }

  // FREE FALLBACK — Pollinations FLUX (no API key, no credits). Always available,
  // so the image generator works even when every keyed engine is missing/depleted.
  try {
    const w = parseInt(width, 10) || 1024, h = parseInt(height, 10) || 1024;
    // deterministic per-prompt seed (no Math.random) so repeats are stable
    const seed = Math.abs(String(prompt || '').split('').reduce((a, ch) => ((a << 5) - a + ch.charCodeAt(0)) | 0, 7)) % 100000;
    const pollUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
      '?width=' + w + '&height=' + h + '&model=flux&nologo=true&seed=' + seed;
    return res.json({ success: true, status: 'completed', url: pollUrl, image_url: pollUrl, source: 'Pollinations FLUX (free)', prompt, model: 'flux-schnell' });
  } catch (e) {
    return res.status(503).json({
      success: false,
      error: 'Image generation failed. Try again, or add a Hugging Face / fal.ai key in the API vault.',
      needsKey: true,
      suggested: ['huggingface', 'fal', 'dall-e-3']
    });
  }
});

// ─────────────────────────────────────────────────────────────
// PROXY IMAGE
// ─────────────────────────────────────────────────────────────
router.get('/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const ct = r.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', ct);
    res.send(r.data);
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// WALLET EARNINGS
// ─────────────────────────────────────────────────────────────
router.get('/wallet/earnings', async (req, res) => {
  const { address } = req.query;
  // SECURITY: only the caller's own completed jobs (was totalling everyone's earnings).
  const uid = String(req.headers['x-user-id'] || '').trim() || String(address || '').trim();
  const completed = _jobs.filter(j => j.status === 'completed' && uid && (j.owner === uid || j.awardedTo === uid || j.postedBy === uid || j.address === uid));
  const totalBudget = completed.reduce((s, j) => s + (parseFloat(j.budget) || 0), 0);
  const history = completed.slice(-20).reverse().map(j => ({
    jobId: j.id, title: j.title || 'Job', amount: parseFloat(j.budget) || 0,
    currency: 'USD', completedAt: j.updatedAt || j.createdAt || new Date().toISOString(), agent: j.awardedTo || 'SHADDAI'
  }));
  res.json({ address: address || '', earnings: totalBudget, currency: 'USD', jobsCompleted: completed.length, history });
});

// ─────────────────────────────────────────────────────────────
// BILLING STATUS + CHECKOUT
// ─────────────────────────────────────────────────────────────
router.get('/billing/status', (req, res) => {
  let tier = 'free', status = 'active';
  try {
    const customersFile = path.join(__dirname, 'customers.json');
    if (fs.existsSync(customersFile)) {
      const db = JSON.parse(fs.readFileSync(customersFile, 'utf8'));
      const userId = String(req.query.userId || 'default').replace(/[^a-zA-Z0-9_@.-]/g, '');
      const customer = (userId && Object.prototype.hasOwnProperty.call(db, userId) ? db[userId] : null) || Object.values(db)[0];
      if (customer) { tier = customer.tier || 'free'; status = customer.status || 'active'; }
    }
  } catch(e) {}
  const TIER_FEATURES = {
    free:    { features: ['basic_chat', 'market_data', 'news'], limits: { aiCalls: 100, agents: 7 } },
    builder: { features: ['basic_chat', 'market_data', 'news', 'scheduling', 'content_studio'], limits: { aiCalls: 500, agents: 7 } },
    pro:     { features: ['all_features', 'priority_support', 'api_access'], limits: { aiCalls: 2000, agents: 7 } },
    alpha:   { features: ['unlimited', 'white_label', 'dedicated_support'], limits: { aiCalls: -1, agents: 7 } }
  };
  const config = TIER_FEATURES[tier] || TIER_FEATURES.free;
  res.json({ status, plan: tier, tier, ...config });
});

router.post('/billing/checkout', async (req, res) => {
  const { tier = 'pro', successUrl, cancelUrl } = req.body;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
  const PRICE_IDS = {
    builder: process.env.STRIPE_PRICE_BUILDER || '',
    pro:     process.env.STRIPE_PRICE_PRO || '',
    alpha:   process.env.STRIPE_PRICE_ALPHA || ''
  };
  if (STRIPE_KEY && PRICE_IDS[tier]) {
    try {
      const stripeRes = await axios.post('https://api.stripe.com/v1/checkout/sessions', new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price]': PRICE_IDS[tier],
        'line_items[0][quantity]': '1',
        mode: 'subscription',
        success_url: successUrl || 'http://localhost:3000/?billing=success',
        cancel_url: cancelUrl || 'http://localhost:3000/?billing=cancel'
      }).toString(), {
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return res.json({ url: stripeRes.data.url, sessionId: stripeRes.data.id });
    } catch(e) {
      return res.json({ status: 'stripe_error', message: e.message, url: null });
    }
  }
  // Stripe not configured — return setup instructions
  res.json({ status: 'pending', tier, message: 'Add STRIPE_SECRET_KEY + STRIPE_PRICE_' + tier.toUpperCase() + ' to .env to enable Stripe billing.', url: null });
});

// POST /api/referral/track — track referral events
const REFERRAL_FILE = path.join(DATA_DIR, 'referrals.json');
let _referrals = loadJSON(REFERRAL_FILE, []);
router.post('/referral/track', (req, res) => {
  const { code, event, userId } = req.body;
  if (!code || !event) return res.status(400).json({ error: 'code and event required' });
  const entry = { code, event, userId, ts: new Date().toISOString() };
  _referrals.unshift(entry);
  if (_referrals.length > 5000) _referrals = _referrals.slice(0, 5000);
  saveJSON(REFERRAL_FILE, _referrals);
  res.json({ success: true, entry });
});
router.get('/referral/stats/:code', (req, res) => {
  const { code } = req.params;
  const events = _referrals.filter(r => r.code === code);
  const signups = events.filter(e => e.event === 'signup').length;
  const conversions = events.filter(e => e.event === 'conversion').length;
  res.json({ code, signups, conversions, freeMonths: conversions, events: events.slice(0, 20) });
});

// ─────────────────────────────────────────────────────────────
// SOCIAL POST
// ─────────────────────────────────────────────────────────────
router.post('/social/post', async (req, res) => {
  const { platform, content, token } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  // Telegram: works if TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set in .env
  if (platform === 'telegram') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || token;
    const chatId   = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      try {
        const tgRes = await axios.post(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          { chat_id: chatId, text: content, parse_mode: 'Markdown' },
          { timeout: 8000 }
        );
        return res.json({ status: 'sent', platform, messageId: tgRes.data.result?.message_id });
      } catch (e) {
        return res.status(502).json({ error: 'Telegram send failed: ' + (e.response?.data?.description || e.message) });
      }
    }
    return res.json({ status: 'queued', platform, preview: content.substring(0, 100), message: 'Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to .env to enable posting' });
  }

  // Discord: works if DISCORD_WEBHOOK_URL is set in .env
  if (platform === 'discord') {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || token;
    if (webhookUrl && webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      try {
        await axios.post(webhookUrl, { content }, { timeout: 8000 });
        return res.json({ status: 'sent', platform });
      } catch (e) {
        return res.status(502).json({ error: 'Discord send failed: ' + (e.response?.data?.message || e.message) });
      }
    }
    return res.json({ status: 'queued', platform, preview: content.substring(0, 100), message: 'Add DISCORD_WEBHOOK_URL to .env to enable posting' });
  }

  // X / Twitter — real post if OAuth keys present, intent URL fallback
  if (platform === 'x' || platform === 'twitter') {
    const truncated = content.length > 280 ? content.substring(0, 277) + '...' : content;
    const apiKey    = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
    if (apiKey && apiSecret && accessToken && accessSecret) {
      try {
        const crypto = require('crypto');
        const oauthTimestamp = Math.floor(Date.now() / 1000).toString();
        const oauthNonce = crypto.randomBytes(16).toString('hex');
        const tweetUrl = 'https://api.twitter.com/2/tweets';
        const body = JSON.stringify({ text: truncated });
        const paramStr = `oauth_consumer_key=${encodeURIComponent(apiKey)}&oauth_nonce=${encodeURIComponent(oauthNonce)}&oauth_signature_method=HMAC-SHA1&oauth_timestamp=${encodeURIComponent(oauthTimestamp)}&oauth_token=${encodeURIComponent(accessToken)}&oauth_version=1.0`;
        const baseStr = 'POST&' + encodeURIComponent(tweetUrl) + '&' + encodeURIComponent(paramStr);
        const sigKey = encodeURIComponent(apiSecret) + '&' + encodeURIComponent(accessSecret);
        const sig = crypto.createHmac('sha1', sigKey).update(baseStr).digest('base64');
        const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(apiKey)}",oauth_nonce="${encodeURIComponent(oauthNonce)}",oauth_signature="${encodeURIComponent(sig)}",oauth_signature_method="HMAC-SHA1",oauth_timestamp="${encodeURIComponent(oauthTimestamp)}",oauth_token="${encodeURIComponent(accessToken)}",oauth_version="1.0"`;
        const tRes = await axios.post(tweetUrl, body, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, timeout: 10000 });
        return res.json({ status: 'posted', platform, tweetId: tRes.data?.data?.id });
      } catch (e) {
        // Fall back to intent URL if real post fails
        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(truncated)}`;
        return res.json({ status: 'intent', platform, intentUrl, message: 'API post failed (' + (e.response?.data?.detail || e.message) + ') — opening intent URL' });
      }
    }
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(truncated)}`;
    return res.json({ status: 'intent', platform, intentUrl, message: 'Open in browser to post to X' });
  }

  // Other platforms — queue with preview
  res.json({ status: 'queued', platform, preview: content.substring(0, 100), message: `${platform} posting — add platform credentials to .env` });
});

// ─────────────────────────────────────────────────────────────
// RAG — Document Embedding & Semantic Search
// Uses Ollama /api/embeddings (model: nomic-embed-text)
// ─────────────────────────────────────────────────────────────
const RAG_DIR = path.join(__dirname, 'data', 'rag');
if (!fs.existsSync(RAG_DIR)) fs.mkdirSync(RAG_DIR, { recursive: true });

const RAG_EMBED_MODEL = process.env.RAG_EMBED_MODEL || 'nomic-embed-text';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function _chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
    if (start >= text.length) break;
  }
  return chunks.filter(c => c.trim().length > 20);
}

async function _getEmbedding(text) {
  const r = await axios.post(`${OLLAMA_BASE}/api/embeddings`, { model: RAG_EMBED_MODEL, prompt: text }, { timeout: 15000 });
  return r.data.embedding;
}

function _cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// POST /api/rag/embed — chunk a text blob and store embeddings
router.post('/rag/embed', async (req, res) => {
  const { fileId, filename, content } = req.body;
  if (!fileId || !content) return res.status(400).json({ error: 'fileId and content required' });
  if (content.length > 200000) return res.status(400).json({ error: 'File too large (max 200KB text)' });
  const chunks = _chunkText(content);
  if (!chunks.length) return res.status(400).json({ error: 'No text content found' });
  try {
    const embedded = [];
    for (const chunk of chunks.slice(0, 200)) { // max 200 chunks per file
      const embedding = await _getEmbedding(chunk);
      embedded.push({ text: chunk, embedding });
    }
    const ragFile = { fileId, filename: filename || fileId, chunks: embedded, embeddedAt: new Date().toISOString() };
    const outPath = path.join(RAG_DIR, `${fileId.replace(/[^a-z0-9_-]/gi, '_')}.json`);
    fs.writeFileSync(path.join(RAG_DIR, `${fileId.replace(/[^a-z0-9_-]/gi, '_')}.json`), JSON.stringify(ragFile));
    return res.json({ status: 'ok', fileId, filename: ragFile.filename, chunksEmbedded: embedded.length });
  } catch (e) {
    if (e.code === 'ECONNREFUSED' || (e.response?.status === 404)) {
      return res.status(503).json({ error: `Ollama embedding failed. Run: ollama pull ${RAG_EMBED_MODEL}` });
    }
    return fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/rag/embed-text — embed a short text blob (for notes/memory semantic indexing)
router.post('/rag/embed-text', async (req, res) => {
  const { id, type, text } = req.body;
  if (!id || !text) return res.status(400).json({ error: 'id and text required' });
  try {
    const embedding = await _getEmbedding(text.substring(0, 2000));
    const indexPath = path.join(RAG_DIR, '_semantic_index.json');
    let index = {};
    if (fs.existsSync(indexPath)) { try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch(e) {} }
    index[`${type}_${id}`] = { id, type, text: text.substring(0, 300), embedding, indexedAt: new Date().toISOString() };
    fs.writeFileSync(indexPath, JSON.stringify(index));
    return res.json({ status: 'ok' });
  } catch (e) {
    return res.status(503).json({ error: `Embedding unavailable: ${e.message}` });
  }
});

// POST /api/rag/upload — per-user document upload + TF-IDF embedding
router.post('/rag/upload', async (req, res) => {
  try {
    const { user, name, text } = req.body || {};
    if (!user || !text) return res.status(400).json({ ok: false, error: 'user and text required' });
    const result = ragIndex.addDocument(user, name || 'untitled.txt', text);
    res.json({ ok: true, data: result });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// GET /api/rag/docs/:user — list a user's uploaded documents
router.get('/rag/docs/:user', (req, res) => {
  try {
    const docs = ragIndex.listUserDocs(req.params.user);
    res.json({ ok: true, data: docs });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// DELETE /api/rag/docs/:user/:docId — remove a user's document
router.delete('/rag/docs/:user/:docId', (req, res) => {
  try {
    const result = ragIndex.deleteDocument(req.params.user, req.params.docId);
    res.json({ ok: true, data: result });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// POST /api/rag/search — semantic search across embedded files
// If body contains { user }, use the per-user TF-IDF store (rag-index.js).
// Otherwise fall through to the legacy Ollama-embedding global store.
router.post('/rag/search', async (req, res) => {
  const { query, fileId, topK = 5, user } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });
  if (user) {
    try {
      const results = ragIndex.searchUser(user, query, Number(topK) || 3);
      return res.json({ ok: true, data: { results } });
    } catch (e) {
      return fail(res, 500, 'internal_error', e.message, { ok: false });
    }
  }
  try {
    const queryEmb = await _getEmbedding(query);
    const results = [];
    const files = fileId
      ? [path.join(RAG_DIR, `${fileId.replace(/[^a-z0-9_-]/gi, '_')}.json`)]
      : fs.readdirSync(RAG_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => path.join(RAG_DIR, f));
    for (const fp of files) {
      if (!fs.existsSync(fp)) continue;
      try {
        const ragFile = JSON.parse(fs.readFileSync(fp, 'utf8'));
        for (const chunk of ragFile.chunks || []) {
          const score = _cosineSimilarity(queryEmb, chunk.embedding);
          results.push({ text: chunk.text, score, filename: ragFile.filename, fileId: ragFile.fileId });
        }
      } catch(e) {}
    }
    results.sort((a, b) => b.score - a.score);
    res.json({ results: results.slice(0, topK) });
  } catch (e) {
    res.status(503).json({ error: `Search failed: ${e.message}` });
  }
});

// POST /api/rag/ask — RAG-augmented question answering
// If body contains { user, query }, use per-user TF-IDF + ORACLE agent synthesis.
// Otherwise fall through to legacy Ollama-embedding global store.
router.post('/rag/ask', async (req, res) => {
  const { question, fileId, user, query } = req.body || {};
  if (user && (query || question)) {
    const q = query || question;
    try {
      const top = ragIndex.searchUser(user, q, 3);
      if (!top.length) {
        return res.json({ ok: true, data: { answer: 'No documents found for this user. Upload a document first.', sources: [] } });
      }
      const excerpts = top.map((t, i) => `[${i+1}] ${t.chunkText}`).join('\n\n');
      const prompt = `You are a document Q&A assistant. Answer the question using ONLY the excerpts below. Quote the relevant fact directly. If the excerpts truly do not contain the answer, say "Not found in the documents."\n\nExcerpts:\n${excerpts}\n\nQuestion: ${q}\n\nAnswer:`;
      // Direct LLM synthesis (no tool-use agent wrapper — keeps small models focused on the text)
      let answer = '';
      try {
        const ollamaR = await axios.post(`${OLLAMA_BASE}/api/generate`, {
          model: DEFAULT_OLLAMA_MODEL, prompt, stream: false
        }, { timeout: 30000 });
        answer = (ollamaR.data && ollamaR.data.response || '').trim();
      } catch (ollamaErr) {
        // Fallback: agent loop synthesis if Ollama direct call fails
        const task = agentEngine.createTask(prompt, 'ORACLE');
        await agentEngine.runAgentLoop(task.id);
        answer = agentEngine.getTask(task.id).result || '';
      }
      return res.json({
        ok: true,
        data: {
          answer: answer || 'No answer generated',
          sources: top.map(t => ({ docName: t.docName, score: t.score })),
        },
      });
    } catch (e) {
      return fail(res, 500, 'internal_error', e.message, { ok: false });
    }
  }
  if (!question) return res.status(400).json({ error: 'question required' });
  try {
    const queryEmb = await _getEmbedding(question);
    const allChunks = [];
    const files = fileId
      ? [path.join(RAG_DIR, `${fileId.replace(/[^a-z0-9_-]/gi, '_')}.json`)]
      : fs.readdirSync(RAG_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => path.join(RAG_DIR, f));
    for (const fp of files) {
      if (!fs.existsSync(fp)) continue;
      try {
        const ragFile = JSON.parse(fs.readFileSync(fp, 'utf8'));
        for (const chunk of ragFile.chunks || []) {
          allChunks.push({ text: chunk.text, score: _cosineSimilarity(queryEmb, chunk.embedding), filename: ragFile.filename });
        }
      } catch(e) {}
    }
    allChunks.sort((a, b) => b.score - a.score);
    const topChunks = allChunks.slice(0, 5);
    if (!topChunks.length) return res.json({ answer: 'No embedded documents found. Upload a file and click "Embed for RAG" first.', sources: [] });
    const context = topChunks.map((c, i) => `[${i+1}] From "${c.filename}":\n${c.text}`).join('\n\n');
    const prompt = `Use the following context to answer the question. If the answer isn't in the context, say so.\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;
    const ollamaR = await axios.post(`${OLLAMA_BASE}/api/generate`, {
      model: DEFAULT_OLLAMA_MODEL,
      prompt,
      stream: false
    }, { timeout: 60000 });
    res.json({
      answer: ollamaR.data.response || 'No response generated',
      sources: topChunks.map(c => ({ filename: c.filename, excerpt: c.text.substring(0, 120), score: Math.round(c.score * 100) }))
    });
  } catch (e) {
    res.status(503).json({ error: `RAG ask failed: ${e.message}` });
  }
});

// POST /api/rag/memory-search — semantic search over the _semantic_index (notes/memory)
router.post('/rag/memory-search', async (req, res) => {
  const { query, type, topK = 10 } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  const indexPath = path.join(RAG_DIR, '_semantic_index.json');
  if (!fs.existsSync(indexPath)) return res.json({ results: [], message: 'No semantic index yet. Save notes to build the index.' });
  try {
    const queryEmb = await _getEmbedding(query);
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const results = Object.values(index)
      .filter(item => !type || item.type === type)
      .map(item => ({ ...item, score: _cosineSimilarity(queryEmb, item.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ id, type, text, score }) => ({ id, type, text, score: Math.round(score * 100) }));
    res.json({ results });
  } catch (e) {
    res.status(503).json({ error: `Semantic search failed: ${e.message}` });
  }
});

// GET /api/rag/files — list all embedded files
router.get('/rag/files', (req, res) => {
  try {
    const files = fs.readdirSync(RAG_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(RAG_DIR, f), 'utf8'));
          return { fileId: data.fileId, filename: data.filename, chunkCount: (data.chunks||[]).length, embeddedAt: data.embeddedAt };
        } catch(e) { return null; }
      }).filter(Boolean);
    res.json({ files });
  } catch(e) { res.json({ files: [] }); }
});

// DELETE /api/rag/files/:fileId — remove embedded file
router.delete('/rag/files/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fp = path.join(RAG_DIR, `${fileId.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ status: 'ok' });
  } catch(e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// CODE EXECUTION (sandboxed JS via Node vm, Python via child_process)
// ─────────────────────────────────────────────────────────────
router.post('/execute-code', requireAdmin, async (req, res) => {
  // OWASP API4: rate-limit code execution — max 10 runs/min per IP
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip, 10, 60000)) {
    return res.status(429).json({ error: 'Too many code executions — wait a moment' });
  }
  const { code, language = 'javascript' } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  if (code.length > 10000) return res.status(400).json({ error: 'Code too long (max 10KB)' });

  // Security: block dangerous patterns
  const dangerPatterns = ['require(', 'process.', '__dirname', '__filename', 'eval(', 'Function(', 'import(', 'child_process', 'fs.', 'net.', 'http.', 'https.', 'exec(', 'spawn('];
  const lowerCode = code.toLowerCase();
  for (const p of dangerPatterns) {
    if (lowerCode.includes(p.toLowerCase())) {
      return res.status(400).json({ error: `Blocked: "${p}" is not allowed in sandbox` });
    }
  }

  if (language === 'javascript') {
    const { runSandboxedJs } = require('./lib/sandbox');
    // Preserve top-level `return` support: wrap so the return value lands in output[].
    const wrapped = /\breturn\b/.test(code)
      ? `output.push((function(){\n${code}\n})())`
      : code;
    const r = await runSandboxedJs(wrapped, { timeoutMs: 5000 });
    res.json({
      status: r.success ? 'ok' : 'error',
      language,
      output: (r.success ? r.output.map(String).join('\n') : r.error).substring(0, 3000) || '(no output)'
    });
  } else if (language === 'python') {
    // SECURITY: Python was executed via child_process with a blocklist that did
    // NOT cover Python (e.g. `import os; os.system(...)`) — a trivial RCE. The
    // Python execution path is disabled entirely.
    res.json({ ok: false, error: 'Python execution disabled for security' });
  } else {
    res.status(400).json({ error: `Unsupported language: ${language}. Use javascript or python.` });
  }
});

// ─────────────────────────────────────────────────────────────
// WEB RESEARCH SCRAPER — any agent can call POST /api/scrape
// Fetches URL, strips HTML, returns clean text + metadata
// Uses axios (already installed) — no new dependencies
// ─────────────────────────────────────────────────────────────

const _PRIVATE_IP_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|0\.0\.0\.0)/i;

function _isPrivateUrl(url) {
  try {
    const host = new URL(url).hostname;
    return _PRIVATE_IP_RE.test(host);
  } catch { return true; }
}

function _cleanHtml(html) {
  // Remove script/style/nav/header/footer blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Convert block elements to newlines for readability
  text = text
    .replace(/<\/?(p|div|li|h[1-6]|br|tr|section|article)[^>]*>/gi, '\n')
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, '\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');

  // Collapse whitespace — multiple blank lines → single, trim each line
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _extractMeta(html, field) {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["'](?:og:)?${field}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:og:)?${field}["']`, 'i'));
  return m ? m[1].trim() : '';
}

function _extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

const _SCRAPE_CACHE = new Map();
const SCRAPE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.post('/scrape', async (req, res) => {
  const { url, maxChars = 8000 } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  // Validate URL format first (before SSRF check so bad URLs get 400 not 403)
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' });
  }

  // SSRF protection — block private IPs
  if (_isPrivateUrl(url)) {
    return res.status(403).json({ error: 'Private/local URLs are not allowed' });
  }

  // Rate limit — max 20 scrapes/min per IP
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip, 20, 60000)) {
    return res.status(429).json({ error: 'Too many requests — wait a moment' });
  }

  // Cache check
  const cacheKey = `scrape:${url}`;
  const cached = _SCRAPE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const response = await axios.get(url, {
      timeout: 12000,
      maxContentLength: 2 * 1024 * 1024, // 2MB max page size
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SHADDAI-Research/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      validateStatus: s => s < 400
    });

    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const title = _extractTitle(html);
    const description = _extractMeta(html, 'description');
    const text = _cleanHtml(html).substring(0, maxChars);
    const wordCount = text.split(/\s+/).length;

    const result = {
      url,
      title,
      description,
      text,
      wordCount,
      scrapedAt: new Date().toISOString(),
      cached: false
    };

    _SCRAPE_CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + SCRAPE_CACHE_TTL });
    res.json(result);
  } catch (e) {
    const status = e.response?.status;
    if (status === 403) return res.status(422).json({ error: 'Site blocked scraping (403 Forbidden)' });
    if (status === 404) return res.status(422).json({ error: 'Page not found (404)' });
    res.status(422).json({ error: `Failed to fetch: ${e.message.substring(0, 100)}` });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────────
// GET /admin/analytics is defined below with full real data (jobs, bids,
// sessions, agent stats, webhooks, SSE clients, cache, uptime).
// The stub was removed — Express first-match means it permanently shadowed
// the enhanced analytics handler defined later in this file.

router.post('/admin/backup', (req, res) => {
  res.json({ status: 'ok', message: 'Backup triggered', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────
// FULL STATUS
// ─────────────────────────────────────────────────────────────
router.get('/full-status', async (req, res) => {
  const status = { server: 'online', ollama: false, agents: {}, timestamp: new Date().toISOString() };
  try { await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 }); status.ollama = true; } catch {}
  const agentPorts = { shaddai: 8000, zerox: 8001, oracle: 8002, nexus: 8003, turtle: 8004, quill: 8005, pikadon: 8008 };
  await Promise.all(Object.entries(agentPorts).map(async ([name, port]) => {
    try { await axios.get(`http://localhost:${port}/ping`, { timeout: 1000 }); status.agents[name] = 'online'; }
    catch { status.agents[name] = 'offline'; }
  }));
  res.json(status);
});

// ─────────────────────────────────────────────────────────────
// AUTH LINK WALLET
// ─────────────────────────────────────────────────────────────
router.post('/auth/link-wallet', (req, res) => {
  const { walletAddress, userId } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' });
  res.json({ success: true, walletAddress, userId, linked: true });
});

// ═════════════════════════════════════════════════════════════════
// MARKETPLACE / JOB BOARD — single coherent lifecycle
// ─────────────────────────────────────────────────────────────
// STATUS MODEL (the only statuses a job can hold):
//   open        → posted, awaiting an agent
//   in_progress → an agent has taken it and is executing the work
//   delivered   → the agent produced a real deliverable (job.deliverable)
//   cancelled   → the poster cancelled it (terminal)
//   error       → the agent failed; job.error holds the message (retryable)
//
// Real work is done by the agent engine — createTask() + runAgentLoop() +
// getTask().result — never faked. All mutations persist to jobs.json.
// ═════════════════════════════════════════════════════════════════

// Load from disk on startup
let _jobs = loadJSON(JOBS_FILE, []);
if (!Array.isArray(_jobs)) _jobs = [];

const MAX_JOBS = 500; // cap the board so the JSON file can't grow unbounded

function saveJobs() { saveJSON(JOBS_FILE, _jobs); }

// Build the LLM prompt that turns a job posting into an executable instruction.
function buildJobPrompt(job) {
  return `Execute this marketplace job completely. Deliver the full, usable result — the actual output itself, not a description of what you would do.

JOB TITLE: ${job.title}
DESCRIPTION: ${job.description || 'No additional description'}
BUDGET: $${job.budget || 0}
REQUIRED SKILLS: ${(job.skills || []).join(', ') || 'General'}

Deliver a complete, professional result now.`;
}

// Validate + sanitize a posting, push it onto _jobs, persist.
// Returns { job } on success or { error, status } on failure. Never throws.
function buildJobFromBody(body) {
  body = body || {};
  const rawTitle = body.title;
  const rawDesc  = body.description;
  const rawBudget = body.budget;

  if (!rawTitle || typeof rawTitle !== 'string' || rawTitle.trim().length === 0) {
    return { error: 'title is required', status: 400 };
  }
  if (rawTitle.length > 200) {
    return { error: 'title must be 200 characters or fewer', status: 400 };
  }
  if (rawDesc != null && String(rawDesc).length > 2000) {
    return { error: 'description must be 2000 characters or fewer', status: 400 };
  }
  if (rawBudget != null) {
    const budget = Number(rawBudget);
    if (isNaN(budget) || budget <= 0) {
      return { error: 'budget must be a positive number', status: 400 };
    }
  }

  // Enforce the cap — evict the oldest terminal job to make room, else reject.
  if (_jobs.length >= MAX_JOBS) {
    const evict = _jobs.findIndex(j => j.status === 'delivered' || j.status === 'cancelled');
    if (evict !== -1) _jobs.splice(evict, 1);
    else return { error: 'Job board is full — try again later', status: 429 };
  }

  const clean = { ...body };
  clean.title = stripHtml(rawTitle).slice(0, 200);
  if (rawDesc != null) clean.description = stripHtml(String(rawDesc)).slice(0, 2000);
  if (rawBudget != null) clean.budget = Number(rawBudget);

  const job = {
    ...clean,
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'open',
    createdAt: new Date().toISOString(),
    awardedTo: clean.awardedTo || clean.agentTarget || null,
    bids: [],
    views: 0,
    deliverable: null,
    output: null,
    error: null
  };
  _jobs.push(job);
  saveJobs();
  return { job };
}

// THE REAL WORK. Runs the assigned agent on the job via the agent engine and
// stores the genuine deliverable. Mutates `job` in place, persists, broadcasts.
// Assumes the caller has already set job.status = 'in_progress'.
async function executeJob(job, agentName) {
  const agent = String(agentName || job.takenBy || job.awardedTo || 'SHADDAI').toUpperCase();
  try {
    const task = agentEngine.createTask(buildJobPrompt(job), agent);
    await agentEngine.runAgentLoop(task.id);
    const done = agentEngine.getTask(task.id);

    if (!done || done.status === 'failed' || !done.result) {
      job.status = 'error';
      job.error = (done && done.error) || 'Agent produced no deliverable';
      job.erroredAt = new Date().toISOString();
      saveJobs();
      broadcastEvent('job:error', { jobId: job.id, title: job.title, agent, error: job.error });
      return job;
    }

    job.deliverable = done.result;   // canonical deliverable field
    job.output = done.result;        // legacy alias (frontend polls job.output)
    job.toolsUsed = done.tools_used || [];
    job.executedBy = done.agentName || agent;
    job.status = 'delivered';
    job.error = null;
    job.deliveredAt = new Date().toISOString();
    saveJobs();
    // Award XP + achievements to the operative for a real delivery (best-effort).
    try {
      const ach = require('./achievements');
      const cat = job.category || (Array.isArray(job.skills) ? job.skills[0] : job.skills) || '';
      job.achievements = ach.recordEvent(job.executedBy || agent, 'bounty_completed', { budget: job.budget || 0, category: cat });
    } catch (_) { /* achievements optional */ }
    broadcastEvent('job:delivered', {
      jobId: job.id, title: job.title, agent: job.executedBy,
      deliverablePreview: String(done.result).slice(0, 300)
    });

    // Record a receipt of the real work (bounded).
    const receipts = loadJSON(path.join(DATA_DIR, 'task_receipts.json'), []);
    receipts.unshift({ task_id: `job_${job.id}`, agent: job.executedBy, task: job.title, result: done.result, timestamp: new Date().toISOString() });
    saveJSON(path.join(DATA_DIR, 'task_receipts.json'), receipts.slice(0, 500));
    return job;
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
    job.erroredAt = new Date().toISOString();
    saveJobs();
    broadcastEvent('job:error', { jobId: job.id, title: job.title, agent, error: e.message });
    return job;
  }
}

router.get('/marketplace/jobs', (req, res) => {
  const { status, clientId } = req.query;
  let filtered = _jobs;
  if (status) filtered = filtered.filter(j => j.status === status);
  if (clientId) filtered = filtered.filter(j => j.clientId === clientId);
  res.json({ jobs: filtered, total: filtered.length });
});

// GET /marketplace/jobs/open — convenience alias for ?status=open, {ok,data} shape.
// MUST be declared before /marketplace/jobs/:id so "open" isn't parsed as an id.
router.get('/marketplace/jobs/open', (req, res) => {
  const open = _jobs.filter(j => j.status === 'open');
  res.json({ ok: true, data: open, jobs: open, total: open.length });
});

router.post('/marketplace/jobs', (req, res) => {
  const r = buildJobFromBody(req.body || {});
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  broadcastEvent('job:created', { jobId: r.job.id, title: r.job.title, budget: r.job.budget, status: 'open' });
  res.json({ job: r.job, message: 'Job posted' });
});

router.get('/marketplace/jobs/:id', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  job.views = (job.views || 0) + 1;
  saveJobs();
  res.json({ job });
});

router.patch('/marketplace/jobs/:id', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  Object.assign(job, req.body, { updatedAt: new Date().toISOString() });
  saveJobs();
  broadcastEvent('job:updated', { jobId: job.id, status: job.status, title: job.title });
  res.json({ job });
});

router.delete('/marketplace/jobs/:id', (req, res) => {
  const idx = _jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  const [removed] = _jobs.splice(idx, 1);
  saveJobs();
  broadcastEvent('job:deleted', { jobId: removed.id });
  res.json({ deleted: true, jobId: removed.id });
});

router.get('/marketplace/jobs/:id/bids', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  res.json({ bids: job ? (job.bids || []) : [], jobId: req.params.id });
});

router.post('/marketplace/jobs/:id/bid', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const bid = {
    id: `bid_${Date.now()}`,
    ...req.body,
    jobId: job.id,
    status: 'pending',
    timestamp: new Date().toISOString()
  };
  job.bids = job.bids || [];
  job.bids.push(bid);
  saveJobs();
  broadcastEvent('bid:placed', { bidId: bid.id, jobId: job.id, agentId: bid.agentId, amount: bid.amount });
  res.json({ bid, message: 'Bid submitted' });
});

// Award a bid: record the winning agent (awardedTo) but keep the job OPEN.
// The actual work only starts when the job is taken/executed. Shared by both
// /bid/:bidId/accept and /award and /accept-bid.
function awardBid(job, bid) {
  bid.status = 'accepted';
  job.awardedTo = bid.agentId || bid.agent || job.awardedTo;
  job.acceptedBid = bid;
  job.awardedAt = new Date().toISOString();
  (job.bids || []).forEach(b => { if (b !== bid && b.id !== bid.id) b.status = 'rejected'; });
  saveJobs();
  broadcastEvent('bid:accepted', { bidId: bid.id, jobId: job.id, agentId: job.awardedTo });
}

router.post('/marketplace/jobs/:id/bid/:bidId/accept', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const bid = (job.bids || []).find(b => b.id === req.params.bidId);
  if (!bid) return res.status(404).json({ error: 'Bid not found' });
  awardBid(job, bid);
  res.json({ bid, job, message: `Bid accepted — awarded to ${job.awardedTo}` });
});

// POST /marketplace/jobs/:id/award — accepts top pending bid or a specific bidId.
router.post('/marketplace/jobs/:id/award', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const bidId = req.body.bidId;
  const bid = bidId ? (job.bids || []).find(b => b.id === bidId) : (job.bids || []).find(b => b.status === 'pending');
  if (!bid) return res.status(404).json({ error: 'No valid bid to award' });
  awardBid(job, bid);
  res.json({ success: true, bid, job, message: `Job awarded to ${job.awardedTo}` });
});

// POST /marketplace/jobs/:id/accept-bid — accept a bid by index (or bidId). {ok,data} shape.
router.post('/marketplace/jobs/:id/accept-bid', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  const { bidIndex, bidId } = req.body || {};
  let bid;
  if (bidId) bid = (job.bids || []).find(b => b.id === bidId);
  else if (bidIndex != null) bid = (job.bids || [])[Number(bidIndex)];
  if (!bid) return res.status(400).json({ ok: false, error: 'Invalid bid reference' });
  awardBid(job, bid);
  res.json({ ok: true, data: job });
});

router.post('/marketplace/jobs/:id/auto-bid', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (job) { job.autoBid = true; saveJobs(); }
  broadcastEvent('job:auto-bid', { jobId: req.params.id });
  res.json({ status: 'enabled', jobId: req.params.id, message: 'Auto-bid enabled' });
});

// POST /marketplace/jobs/:id/cancel — poster cancels an unfinished job (terminal).
router.post('/marketplace/jobs/:id/cancel', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'delivered') return res.status(409).json({ error: 'Cannot cancel a delivered job' });
  job.status = 'cancelled';
  job.cancelledAt = new Date().toISOString();
  saveJobs();
  broadcastEvent('job:cancelled', { jobId: job.id, title: job.title });
  res.json({ success: true, job });
});

// POST /marketplace/jobs/:id/auto-execute — SYNCHRONOUS real execution.
// Runs the assigned agent, waits, and returns the real deliverable in the
// response (frontend reads d.deliverable + d.agent directly).
router.post('/marketplace/jobs/:id/auto-execute', require('./demo-limit').middleware, async (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'delivered') {
    return res.json({ status: 'delivered', jobId: job.id, agent: job.executedBy || job.takenBy, deliverable: job.deliverable, output: job.output });
  }
  const agentName = String(req.body.agent || job.awardedTo || 'SHADDAI').toUpperCase();
  job.status = 'in_progress';
  job.takenBy = agentName;
  job.takenAt = new Date().toISOString();
  job.error = null;
  saveJobs();
  broadcastEvent('job:in_progress', { jobId: job.id, title: job.title, agent: agentName });
  await executeJob(job, agentName);
  if (job.status === 'error') {
    return res.status(502).json({ status: 'error', jobId: job.id, agent: agentName, error: job.error });
  }
  res.json({ status: job.status, jobId: job.id, agent: job.executedBy || agentName, deliverable: job.deliverable, output: job.output });
});

router.get('/marketplace/leaderboard', (req, res) => {
  // Build leaderboard from job bid/award data
  const agentStats = {};
  for (const job of _jobs) {
    // A "win" = a job an agent actually delivered.
    const winner = job.executedBy || job.takenBy;
    if (job.status === 'delivered' && winner) {
      agentStats[winner] = agentStats[winner] || { agentId: winner, wins: 0, bids: 0, earnings: 0 };
      agentStats[winner].wins++;
      agentStats[winner].earnings += parseFloat(job.budget || 0);
    }
    for (const bid of (job.bids || [])) {
      const bidder = bid.agentId || bid.agent;
      if (bidder) {
        agentStats[bidder] = agentStats[bidder] || { agentId: bidder, wins: 0, bids: 0, earnings: 0 };
        agentStats[bidder].bids++;
      }
    }
  }
  const leaderboard = Object.values(agentStats).sort((a, b) => b.wins - a.wins).slice(0, 20);
  res.json({ leaderboard, period: req.query.period || 'all', total: _jobs.length });
});

router.get('/marketplace/stats', (req, res) => {
  const count = s => _jobs.filter(j => j.status === s).length;
  const totalBids = _jobs.reduce((sum, j) => sum + (j.bids || []).length, 0);
  res.json({
    total: _jobs.length,
    open: count('open'),
    in_progress: count('in_progress'),
    delivered: count('delivered'),
    cancelled: count('cancelled'),
    error: count('error'),
    totalBids,
    activeClients: new Set(_jobs.map(j => j.clientId).filter(Boolean)).size
  });
});

// ═════════════════════════════════════════════════════════════════
// JOB EXECUTION — an agent TAKES a job and does the REAL work.
// POST /api/marketplace/jobs/:id/take   (== /execute, alias)
//   open|error → in_progress (responds immediately), then the assigned
//   agent runs via the agent engine in the background → delivered|error.
//   Poll GET /api/marketplace/jobs/:id/result for the deliverable.
// ═════════════════════════════════════════════════════════════════

async function takeAndExecute(req, res) {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'in_progress') return res.status(409).json({ error: 'Job already in progress' });
  if (job.status === 'delivered')   return res.status(409).json({ error: 'Job already delivered' });
  if (job.status === 'cancelled')   return res.status(409).json({ error: 'Job was cancelled' });

  // Accept agent from body.agent or body.agentId; fall back to awarded agent.
  const agentName = String(req.body.agent || req.body.agentId || job.awardedTo || 'SHADDAI').toUpperCase();
  job.status = 'in_progress';
  job.takenBy = agentName;
  job.takenAt = new Date().toISOString();
  job.error = null;
  saveJobs();
  broadcastEvent('job:in_progress', { jobId: job.id, title: job.title, agent: agentName });

  // Respond immediately, then do the real work in the background.
  res.json({ success: true, jobId: job.id, agent: agentName, status: 'in_progress', message: `${agentName} is executing this job...` });
  setImmediate(() => executeJob(job, agentName));
}

router.post('/marketplace/jobs/:id/take', require('./demo-limit').middleware, takeAndExecute);
router.post('/marketplace/jobs/:id/execute', require('./demo-limit').middleware, takeAndExecute);

// GET /api/marketplace/jobs/:id/result — poll for the deliverable after take/execute.
router.get('/marketplace/jobs/:id/result', (req, res) => {
  const job = _jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    jobId: job.id,
    status: job.status,                       // open|in_progress|delivered|cancelled|error
    deliverable: job.deliverable || null,
    output: job.output || null,               // legacy alias of deliverable
    agent: job.executedBy || job.takenBy || job.awardedTo,
    error: job.error || null,
    deliveredAt: job.deliveredAt || null
  });
});

// ═════════════════════════════════════════════════════════════════
// WORKFLOW EXECUTION ENGINE
// POST /api/workflows/run — execute a named or custom workflow chain
// POST /api/workflows/create — save a new workflow
// GET  /api/workflows — list saved workflows
// ═════════════════════════════════════════════════════════════════

const WORKFLOWS_PATH = path.join(DATA_DIR, 'workflows.json');
function loadWorkflows() { return loadJSON(WORKFLOWS_PATH, []); }
function saveWorkflowsList(ws) { saveJSON(WORKFLOWS_PATH, ws); }

// Built-in workflow templates
const BUILTIN_WORKFLOWS = {
  'research-to-build': {
    name: 'Research → Build',
    steps: [
      { agent: 'ORACLE', task: 'Research the topic deeply and summarize key findings, technologies, and opportunities: {input}' },
      { agent: 'NEXUS',  task: 'Based on this research, design a technical architecture and implementation plan: {prev}' },
      { agent: 'QUILL',  task: 'Write a clear project brief and documentation based on this plan: {prev}' }
    ]
  },
  'market-analysis': {
    name: 'Market Analysis',
    steps: [
      { agent: 'ORACLE', task: 'Research current market conditions, competitors, and trends for: {input}' },
      { agent: 'ZEROX',  task: 'Analyze the financial opportunity, revenue potential, and unit economics: {prev}' },
      { agent: 'SHADDAI', task: 'Give a final VERDICT: should we pursue this? Include top 3 risks and top 3 opportunities: {prev}' }
    ]
  },
  // Aligned with the frontend canonical WF_AGENTS['idea-to-product'] chain
  // (SHADDAI→NEXUS→TURTLE→ZEROX) so backend and frontend agree on steps/order.
  'idea-to-product': {
    name: 'Idea → Product',
    steps: [
      { agent: 'SHADDAI', task: 'Break down this product idea into a clear MVP feature set — what to build first and why: {input}' },
      { agent: 'NEXUS',   task: 'Architecture and tech stack for this MVP: {prev}' },
      { agent: 'TURTLE',  task: 'User flow and UI sketch — describe screens, interactions, visual direction: {prev}' },
      { agent: 'ZEROX',   task: 'Monetization model, pricing tiers, and path to first $1K MRR: {prev}' }
    ]
  },
  'full-audit': {
    name: 'Full System Audit',
    steps: [
      { agent: 'PIKADON', task: 'Security audit: identify vulnerabilities, risks, and attack vectors in: {input}' },
      { agent: 'NEXUS',   task: 'Technical audit: identify performance, scalability, and architecture issues: {prev}' },
      { agent: 'ZEROX',   task: 'Business audit: identify revenue leaks, inefficiencies, and growth blockers: {prev}' },
      { agent: 'SHADDAI', task: 'Compile a prioritized action plan from all audit findings: {prev}' }
    ]
  },
  // Aligned with the frontend canonical WF_AGENTS chains so backend and frontend
  // agree on steps/order for every named workflow the dashboard exposes.
  'content-pipeline': {
    name: 'Content Pipeline',
    steps: [
      { agent: 'ORACLE', task: 'Research trending angles, stats, and viral hooks for this topic: {input}' },
      { agent: 'QUILL',  task: 'Write platform-optimized content (Twitter thread + LinkedIn post + short-form caption) using this research:\n\n{prev}' },
      { agent: 'TURTLE', task: 'Suggest visual formats, layout ideas, and design tips to make this content pop:\n\n{prev}' }
    ]
  },
  'security-audit': {
    name: 'Security Audit',
    steps: [
      { agent: 'NEXUS',  task: 'Review code architecture and surface-level risks for: {input}' },
      { agent: 'PIKADON', task: 'Deep security audit — find vulnerabilities, attack vectors, and critical risks based on:\n\n{prev}' },
      { agent: 'SHADDAI', task: 'Executive risk summary and ordered priority fixes from this audit:\n\n{prev}' }
    ]
  },
  'agent-council': {
    name: 'Agent Council',
    steps: [
      { agent: 'NEXUS',  task: 'Technical assessment of: {input}' },
      { agent: 'ZEROX',  task: 'Business case and revenue model for:\n{prev}' },
      { agent: 'ORACLE', task: 'Market validation and competitive landscape for:\n{prev}' },
      { agent: 'TURTLE', task: 'UX, design, and user experience angle for:\n{prev}' },
      { agent: 'SHADDAI', task: 'Council decision — synthesize all agent inputs into a single clear recommendation and action plan:\n\n{prev}' }
    ]
  },
  'market-brief': {
    name: 'Market Brief',
    steps: [
      { agent: 'ORACLE', task: 'Give a detailed crypto market brief right now. Cover BTC, ETH, SOL price levels, trends, fear/greed, and top movers. Topic focus: {input}' },
      { agent: 'ZEROX',  task: 'From this market brief, identify the top 2 actionable opportunities for traders or builders:\n\n{prev}' },
      { agent: 'QUILL',  task: 'Write a punchy 5-tweet thread from these insights that would get engagement:\n\n{prev}' }
    ]
  },
  'revenue-intel': {
    name: 'Revenue Intelligence',
    steps: [
      { agent: 'ZEROX',  task: 'Build a concrete $0 to $1,000/month roadmap for an AI agent marketplace. Topic: {input}' },
      { agent: 'ORACLE', task: 'What are 3 specific things competitors are doing better, based on:\n{prev}' },
      { agent: 'SHADDAI', task: 'The single most important strategic decision to make this week, given:\n{prev}' }
    ]
  },
  'crypto-market-scan': {
    name: 'Crypto Market Scan',
    steps: [
      { agent: 'ORACLE', task: 'Get the global crypto market overview (use the crypto_global tool) and the live price of SOL and BTC (use the jupiter_price and fetch_price tools). Summarize the market state.' },
      { agent: 'ZEROX',  task: 'Based on this market data:\n{prev}\nGet the top DeFi protocols by TVL (use the defillama_protocols tool) and identify 2 opportunities.' },
      { agent: 'QUILL',  task: 'Write an engaging 5-tweet crypto market thread from these insights:\n{prev}\n(use the write_thread tool)' }
    ]
  }
};

// Run ONE workflow step through the REAL agent engine (each agent's real tools/skills),
// chaining forward. {input} = raw user input, {prev} = previous step's output,
// {step1..stepN} = that step's output (aligns with the Workflow Center builder syntax).
// Returns { output, tools, status } so the SSE stream can show which tools each agent used.
async function runWorkflowStep(agentName, taskTemplate, input, prevOutput, outputs, allOps) {
  let task = String(taskTemplate || '')
    .replace(/\{input\}/g, input || '')
    .replace(/\{prev\}/g, (prevOutput || '').slice(0, 4000) || (input || ''));
  task = task.replace(/\{step(\d+)\}/g, function (m, n) {
    const idx = parseInt(n, 10);
    const out = (outputs && outputs[idx - 1]) ? String(outputs[idx - 1]) : '';
    return out.slice(0, 4000);
  });
  task = task.trim();
  if (!task) return { output: '', tools: [], status: 'completed' };

  const agentNameUpper = String(agentName || 'ORACLE').toUpperCase();

  // 1) Real agent engine (tools + skills) — the same engine the Workflow Center uses.
  if (agentEngine && typeof agentEngine.createTask === 'function') {
    try {
      const t = agentEngine.createTask(task, agentNameUpper);
      await agentEngine.runAgentLoop(t.id);
      const done = agentEngine.getTask(t.id);
      if (done && typeof done === 'object') {
        return {
          output: done.result || '',
          tools: (done.tools_used && done.tools_used.length) ? done.tools_used : [],
          status: done.status === 'failed' ? 'failed' : 'completed'
        };
      }
    } catch (e) { console.warn('[workflow] agent engine step failed, falling back:', e.message); }
  }

  // 2) Fallback: Groq direct (fast) with agent persona.
  const councilPrompts = {
    SHADDAI: 'You are SHADDAI, supreme AI orchestrator. Be strategic, decisive, and thorough.',
    ZEROX:   'You are ZEROX, wealth and revenue specialist. Focus on financial impact and business value.',
    ORACLE:  'You are ORACLE, intelligence analyst. Be thorough, factual, and well-structured.',
    NEXUS:   'You are NEXUS, technical architect. Be precise, practical, and implementation-focused.',
    TURTLE:  'You are TURTLE, creative director. Be creative, user-centric, and visually minded.',
    QUILL:   'You are QUILL, master writer. Be clear, compelling, and professionally polished.',
    PIKADON: 'You are PIKADON, security specialist. Be rigorous, threat-aware, and defensive.'
  };
  let systemPrompt = councilPrompts[agentNameUpper];
  if (!systemPrompt) {
    // Forged operative: look up persona from operatives list
    const ops = Array.isArray(allOps) ? allOps : [];
    const op = ops.find(o => String(o.codename||'').toUpperCase() === agentNameUpper);
    if (op && op.brain && op.brain.persona) {
      systemPrompt = op.brain.persona;
    } else if (op) {
      const toolList = Array.isArray(op.tools) && op.tools.length ? ` You have these tools: ${op.tools.slice(0,10).join(', ')}.` : '';
      systemPrompt = `You are ${op.codename}, a ${op.archetype||'specialist'} operative in the SHADDAI empire.${toolList} Complete your task thoroughly and precisely.`;
    } else {
      systemPrompt = `You are ${agentNameUpper}, a skilled SHADDAI operative. Complete the assigned task thoroughly.`;
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: task }],
        max_tokens: 1500, temperature: 0.7
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 45000 });
      return { output: r.data.choices[0]?.message?.content || '', tools: [], status: 'completed' };
    } catch (e) { console.warn('[workflow] Groq step failed:', e.message); }
  }
  // 3) Ollama fallback
  try {
    const tags = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    const model = (tags.data.models || [])[0]?.name || DEFAULT_OLLAMA_MODEL;
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: task }],
      stream: false
    }, { timeout: 120000 });
    return { output: r.data.message?.content || '', tools: [], status: 'completed' };
  } catch (e) {
    return { output: `[Step failed: ${e.message}]`, tools: [], status: 'failed' };
  }
}

// Shared handler for POST /api/workflows/run and POST /api/workflows/run/stream.
// Both emit text/event-stream so a caller sees each step land as it happens
// instead of waiting minutes for the whole chain. /run/stream is the explicit,
// documented streaming path; /run keeps its existing behaviour for callers that
// already point at it.
const runWorkflowStreaming = async (req, res) => {
  const { workflowId, input, steps: customSteps } = req.body || {};
  const runInput = typeof input === 'string' ? input : '';

  // Resolve workflow definition
  let workflowDef = BUILTIN_WORKFLOWS[workflowId];
  if (!workflowDef && workflowId) {
    const saved = loadWorkflows().find(w => w.id === workflowId || w.name === workflowId);
    if (saved) workflowDef = saved;
  }
  if (!workflowDef && customSteps && Array.isArray(customSteps) && customSteps.length) {
    workflowDef = { name: 'Custom Workflow', steps: customSteps };
  }
  if (!workflowDef) return res.status(404).json({ error: 'Workflow not found. Built-ins: research-to-build, market-analysis, idea-to-product, full-audit, content-pipeline, security-audit, agent-council, market-brief, revenue-intel, crypto-market-scan' });

  // Normalize step shapes ({task|prompt|goal} × any agent casing) to {agent, task} uppercase.
  // Preserve ragGrounded + tools so forged operatives carry their skill loadout.
  workflowDef.steps = (workflowDef.steps || []).map(s => ({
    agent: String(s.agent || s.agentName || '').toUpperCase(),
    task: String(s.task || s.prompt || s.goal || '').trim(),
    ragGrounded: Boolean(s.ragGrounded || s.rag),
    tools: Array.isArray(s.tools) ? s.tools : []
  }));

  // Pre-run validation — council agents are always valid; forged operative codenames
  // are validated against operatives.json so custom agents work in chains.
  const COUNCIL_AGENTS = new Set(['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON']);
  let _allOps = [];
  try { _allOps = loadJSON(path.join(DATA_DIR, 'operatives.json'), []); } catch(_) {}
  const OPERATIVE_CODENAMES = new Set(_allOps.map(o => String(o.codename||'').toUpperCase()).filter(Boolean));
  const VALID_AGENTS_SET = new Set([...COUNCIL_AGENTS, ...OPERATIVE_CODENAMES]);
  const validationErrors = [];
  (workflowDef.steps || []).forEach((s, idx) => {
    if (!s.agent) validationErrors.push(`Step ${idx + 1}: missing agent`);
    else if (!VALID_AGENTS_SET.has(s.agent)) validationErrors.push(`Step ${idx + 1}: unknown agent "${s.agent}" — forge it first or use a council agent`);
    if (!s.task || !String(s.task).trim()) validationErrors.push(`Step ${idx + 1}: missing task text`);
  });
  if (!workflowDef.steps || workflowDef.steps.length === 0) validationErrors.push('Workflow has no steps');
  if (validationErrors.length) return res.status(400).json({ error: 'Workflow validation failed', details: validationErrors });

  // Charge for the workflow run BEFORE opening the SSE stream (402 must be plain JSON).
  if (await enforceCredits(req, res, 'workflow_run')) return;

  const runId = `wf_${Date.now()}`;
  const results = [];
  const outputs = [];     // per-step outputs, for {step1..stepN} chaining
  let prevOutput = '';
  let failedCount = 0;

  /* Two callers, two contracts. /workflows/run must keep returning ONE JSON
     payload — the dashboard (public/index.html) calls it and parses JSON, so
     streaming it silently breaks that feature. /workflows/run/stream, or any
     caller that asks for text/event-stream, gets incremental events. */
  const wantsStream = /\/stream$/.test(req.path || '')
    || String(req.headers.accept || '').includes('text/event-stream');

  const events = [];

  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    // 'no-transform' + X-Accel-Buffering tell the compression middleware and any
    // proxy (nginx/Render) not to buffer this response. Without them every event
    // below arrives in one lump at the end, which reads to a user as a hang.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
  }

  const send = (data) => {
    if (!wantsStream) { events.push(data); return; }   // buffered for the JSON reply
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    } catch (_) {}
  };
  // Heartbeat comment every 15s so proxies and clients see life during a long
  // single step (one model call can run for minutes).
  const heartbeat = setInterval(() => {
    if (!wantsStream) return;
    try { res.write(': keep-alive\n\n'); if (typeof res.flush === 'function') res.flush(); } catch (_) {}
  }, 15000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
  let clientGone = false;
  req.on('close', () => { clientGone = true; clearInterval(heartbeat); });

  send({ type: 'start', runId, workflow: workflowDef.name, steps: workflowDef.steps.length });

  for (let i = 0; i < workflowDef.steps.length; i++) {
    if (clientGone) break;
    const step = workflowDef.steps[i];
    send({ type: 'step_start', step: i + 1, total: workflowDef.steps.length, agent: step.agent, ragGrounded: step.ragGrounded });
    try {
      // RAG grounding (Pro): search knowledge base and prepend chunks to task
      let taskWithContext = step.task;
      if (step.ragGrounded) {
        try {
          const rag = require('./rag-index');
          const ragAgent = COUNCIL_AGENTS.has(step.agent) ? step.agent.toLowerCase() : 'shaddai';
          const hits = (rag.searchUser('kb_' + ragAgent, step.task, 5) || []).filter(h => h.score > 0.03).slice(0, 5);
          if (hits.length) {
            const ctx = hits.map(h => `[${h.docName}] ${String(h.chunkText||'').slice(0,350)}`).join('\n\n');
            taskWithContext = `KNOWLEDGE BASE (${hits.length} passages from SHADDAI intelligence):\n${ctx}\n\n---\nTASK: ${step.task}`;
          }
        } catch(_) {}
      }
      const stepRes = await runWorkflowStep(step.agent, taskWithContext, runInput, prevOutput, outputs, _allOps);
      // Record even empty/null output so the results array is always complete
      const stepOutput = stepRes.output || '';
      const stepTools = (stepRes.tools && stepRes.tools.length) ? stepRes.tools : [];
      const stepStatus = stepRes.status === 'failed' ? 'failed' : 'completed';
      outputs.push(stepOutput);
      results.push({ step: i + 1, agent: step.agent, status: stepStatus, output: stepOutput, tools: stepTools });
      prevOutput = stepOutput || prevOutput; // keep last good output if step returned nothing
      send({ type: 'step_done', step: i + 1, agent: step.agent, output: stepOutput, tools: stepTools, status: stepStatus });
    } catch (e) {
      failedCount++;
      outputs.push('');
      // Record the failure so results[] is always length === steps.length
      results.push({ step: i + 1, agent: step.agent, status: 'failed', error: e.message, output: null, tools: [] });
      send({ type: 'step_error', step: i + 1, agent: step.agent, error: e.message });
      // Do NOT break — continue to next step so the workflow completes as much as possible
    }
  }

  const overallStatus = failedCount === 0 ? 'completed' : failedCount === workflowDef.steps.length ? 'failed' : 'partial';

  // Save run to history
  const history = loadJSON(path.join(DATA_DIR, 'workflow_runs.json'), []);
  history.unshift({ runId, workflow: workflowDef.name, input: runInput.slice(0, 200), steps: results.length, failedSteps: failedCount, status: overallStatus, completedAt: new Date().toISOString(), output: prevOutput.slice(0, 500), tools: results.reduce((acc, r) => acc.concat(r.tools || []), []).slice(0, 20) });
  saveJSON(path.join(DATA_DIR, 'workflow_runs.json'), history.slice(0, 100));

  send({ type: 'complete', runId, status: overallStatus, finalOutput: prevOutput, steps: results });
  send({ type: 'done', runId, status: overallStatus, steps: results.length });
  clearInterval(heartbeat);

  if (!wantsStream) {
    // the original JSON contract the dashboard depends on
    return res.json({
      success: overallStatus !== 'failed',
      runId,
      workflow: workflowDef.name,
      status: overallStatus,
      steps: results,
      finalOutput: prevOutput,
      events,               // the same progress events, for anyone who wants them
    });
  }
  res.end();
};

// One handler, two contracts — it branches on the path / Accept header.
router.post('/workflows/run', runWorkflowStreaming);          // -> JSON (unchanged)
// Explicit streaming alias - same events, unambiguous name for clients that want
// incremental progress rather than one terminal payload.
router.post('/workflows/run/stream', runWorkflowStreaming);

router.get('/workflows', (req, res) => {
  const saved = loadWorkflows();
  const builtins = Object.entries(BUILTIN_WORKFLOWS).map(([id, w]) => ({ id, name: w.name, steps: w.steps.length, builtin: true }));
  res.json({ workflows: [...builtins, ...saved], runs: loadJSON(path.join(DATA_DIR, 'workflow_runs.json'), []).slice(0, 20) });
});

router.post('/workflows/create', (req, res) => {
  const { name, steps, description } = req.body;
  if (!name || !steps?.length) return res.status(400).json({ error: 'name and steps[] required' });
  const wf = { id: `wf_${Date.now()}`, name, description: description || '', steps, createdAt: new Date().toISOString() };
  const all = loadWorkflows();
  all.push(wf);
  saveWorkflowsList(all);
  res.json({ success: true, workflow: wf });
});

router.delete('/workflows/:id', (req, res) => {
  const all = loadWorkflows().filter(w => w.id !== req.params.id);
  saveWorkflowsList(all);
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════
// CHART ANALYSIS ENGINE
// POST /api/agents/analyze-chart
// Accepts: price data array OR text description → structured TA
// ═════════════════════════════════════════════════════════════════

router.post('/agents/analyze-chart', async (req, res) => {
  const { symbol, data, description, timeframe = '1h' } = req.body;
  if (!data && !description) return res.status(400).json({ error: 'data (OHLCV array) or description required' });

  let chartContext = '';
  if (data && Array.isArray(data) && data.length > 0) {
    // Build TA from OHLCV data
    const prices = data.map(d => d.close || d[4] || d.c || 0).filter(Boolean);
    const highs  = data.map(d => d.high  || d[2] || d.h || 0).filter(Boolean);
    const lows   = data.map(d => d.low   || d[3] || d.l || 0).filter(Boolean);
    const vols   = data.map(d => d.volume|| d[5] || d.v || 0).filter(Boolean);

    const last   = prices[prices.length - 1];
    const first  = prices[0];
    const high   = Math.max(...highs);
    const low    = Math.min(...lows);
    const pctChg = first > 0 ? (((last - first) / first) * 100).toFixed(2) : 0;
    const avgVol = vols.length > 0 ? (vols.reduce((a, b) => a + b, 0) / vols.length).toFixed(0) : 0;
    const lastVol = vols[vols.length - 1] || 0;
    const volSpike = avgVol > 0 ? (lastVol / avgVol).toFixed(2) : 1;

    // Simple SMA20
    const sma20 = prices.length >= 20
      ? (prices.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(4)
      : null;

    // RSI approximation (14 periods)
    let rsi = null;
    if (prices.length >= 15) {
      const changes = prices.slice(-15).map((p, i, arr) => i === 0 ? 0 : p - arr[i - 1]).slice(1);
      const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
      const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / 14;
      rsi = losses === 0 ? 100 : (100 - (100 / (1 + gains / losses))).toFixed(1);
    }

    chartContext = `CHART DATA for ${symbol || 'Asset'} (${timeframe}):
- Current Price: ${last}
- Period Open: ${first}
- Period High: ${high}
- Period Low: ${low}
- Price Change: ${pctChg}%
- Range: ${low} — ${high} (${((high - low) / low * 100).toFixed(2)}% spread)
${sma20 ? `- SMA20: ${sma20} (price is ${last > parseFloat(sma20) ? 'ABOVE' : 'BELOW'} SMA)` : ''}
${rsi ? `- RSI(14): ${rsi} (${parseFloat(rsi) > 70 ? 'OVERBOUGHT' : parseFloat(rsi) < 30 ? 'OVERSOLD' : 'NEUTRAL'})` : ''}
- Volume: ${lastVol} (${volSpike}x avg — ${parseFloat(volSpike) > 1.5 ? 'HIGH VOLUME SPIKE' : 'normal'})
- Candle count: ${data.length}`;
  } else {
    chartContext = description;
  }

  const analysisPrompt = `${chartContext}

Perform a complete technical analysis. Use this exact format:

## VERDICT: [🟢 BULLISH / 🔴 BEARISH / 🟡 NEUTRAL]
**Trend:** [Uptrend / Downtrend / Sideways / Reversal]
**Momentum:** [Strong / Weak / Diverging]

## Key Levels
- **Support:** [price level + why]
- **Resistance:** [price level + why]
- **Target:** [price level]
- **Stop Loss:** [price level]

## Signals
- [Signal 1]
- [Signal 2]
- [Signal 3]

## Setup Quality: [1-10] — [one sentence reason]

## Trade Plan
**Entry:** [condition / price]
**Target:** [price] | **Stop:** [price] | **R:R:** [ratio]

## Risk: [LOW / MEDIUM / HIGH]
[One sentence on the biggest risk to this setup]`;

  const systemPrompt = 'You are ORACLE, an elite technical analyst with 20 years of chart reading experience. You read price action, volume, and indicators with surgical precision. Give real analysis — not hedged disclaimers.';

  let response = '';
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: analysisPrompt }],
        max_tokens: 1000, temperature: 0.5
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 30000 });
      response = r.data.choices[0]?.message?.content || '';
    } catch (e) { console.warn('[chart] Groq failed:', e.message); }
  }
  if (!response) {
    try {
      const tags = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
      const model = (tags.data.models || [])[0]?.name || DEFAULT_OLLAMA_MODEL;
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: analysisPrompt }],
        stream: false
      }, { timeout: 120000 });
      response = r.data.message?.content || '';
    } catch (e) { return res.status(502).json({ error: 'LLM unavailable: ' + e.message }); }
  }

  res.json({ analysis: response, symbol, timeframe, computedMetrics: chartContext });
});

// ═════════════════════════════════════════════════════════════════
// USER CUSTOM API SYSTEM
// Users register their own APIs → agents can call and interpret them
// POST   /api/user-apis          — register a new API
// GET    /api/user-apis          — list all registered APIs
// DELETE /api/user-apis/:id      — remove an API
// POST   /api/user-apis/:id/test — test the connection (live GET request)
// POST   /api/user-apis/:id/use  — agent calls API + interprets response
// ═════════════════════════════════════════════════════════════════

const USER_APIS_FILE = path.join(DATA_DIR, 'user_apis.json');
function loadUserApis() { return loadJSON(USER_APIS_FILE, []); }
function saveUserApis(apis) { saveJSON(USER_APIS_FILE, apis); }

router.get('/user-apis', (req, res) => {
  const apis = loadUserApis();
  // Never expose full auth header values to frontend
  const safe = apis.map(a => ({ ...a, authValue: a.authValue ? '***' : '' }));
  res.json({ apis: safe, count: apis.length });
});

router.post('/user-apis', (req, res) => {
  const { name, url, method = 'GET', authType = 'none', authHeader = 'Authorization', authValue = '', description = '', tags = [] } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  if (!url.startsWith('https://') && !url.startsWith('http://')) return res.status(400).json({ error: 'URL must start with http:// or https://' });

  const api = {
    id: `uapi_${Date.now()}`,
    name,
    url,
    method: method.toUpperCase(),
    authType, // none | bearer | apikey | basic
    authHeader,
    authValue, // stored server-side, never sent to browser
    description,
    tags,
    createdAt: new Date().toISOString(),
    lastTested: null,
    lastStatus: null
  };
  const all = loadUserApis();
  all.push(api);
  saveUserApis(all);
  res.json({ success: true, api: { ...api, authValue: api.authValue ? '***' : '' } });
});

router.delete('/user-apis/:id', (req, res) => {
  const all = loadUserApis().filter(a => a.id !== req.params.id);
  saveUserApis(all);
  res.json({ success: true });
});

router.post('/user-apis/:id/test', async (req, res) => {
  const apis = loadUserApis();
  const api = apis.find(a => a.id === req.params.id);
  if (!api) return res.status(404).json({ error: 'API not found' });

  const headers = {};
  if (api.authType === 'bearer' && api.authValue) headers['Authorization'] = `Bearer ${api.authValue}`;
  else if (api.authType === 'apikey' && api.authValue) headers[api.authHeader || 'X-API-Key'] = api.authValue;
  else if (api.authType === 'basic' && api.authValue) headers['Authorization'] = `Basic ${Buffer.from(api.authValue).toString('base64')}`;

  const t0 = Date.now();
  try {
    const r = await axios({ method: api.method || 'GET', url: api.url, headers, timeout: 10000 });
    const ms = Date.now() - t0;
    api.lastTested = new Date().toISOString();
    api.lastStatus = r.status;
    saveUserApis(apis);
    res.json({ success: true, status: r.status, latencyMs: ms, preview: JSON.stringify(r.data).slice(0, 500) });
  } catch (e) {
    api.lastTested = new Date().toISOString();
    api.lastStatus = e.response?.status || 0;
    saveUserApis(apis);
    res.json({ success: false, status: e.response?.status || 0, error: e.message });
  }
});

router.post('/user-apis/:id/use', async (req, res) => {
  const apis = loadUserApis();
  const api = apis.find(a => a.id === req.params.id);
  if (!api) return res.status(404).json({ error: 'API not found' });

  const { question = 'Analyze this data and give insights', agent = 'ORACLE', body: reqBody } = req.body;

  // Build auth headers
  const headers = { 'Content-Type': 'application/json' };
  if (api.authType === 'bearer' && api.authValue) headers['Authorization'] = `Bearer ${api.authValue}`;
  else if (api.authType === 'apikey' && api.authValue) headers[api.authHeader || 'X-API-Key'] = api.authValue;
  else if (api.authType === 'basic' && api.authValue) headers['Authorization'] = `Basic ${Buffer.from(api.authValue).toString('base64')}`;

  // Fetch from the user's API
  let apiData = '';
  try {
    const r = await axios({ method: api.method, url: api.url, headers, data: reqBody || undefined, timeout: 15000 });
    apiData = typeof r.data === 'string' ? r.data.slice(0, 3000) : JSON.stringify(r.data).slice(0, 3000);
  } catch (e) {
    return res.status(502).json({ error: `Failed to fetch from ${api.name}: ${e.message}` });
  }

  const agentPrompts = {
    SHADDAI:'You are SHADDAI, supreme AI orchestrator.',
    ZEROX:'You are ZEROX, wealth and revenue specialist.',
    ORACLE:'You are ORACLE, intelligence analyst. You excel at interpreting data from external APIs.',
    NEXUS:'You are NEXUS, technical architect.',
    TURTLE:'You are TURTLE, creative director.',
    QUILL:'You are QUILL, master writer.',
    PIKADON:'You are PIKADON, security specialist.'
  };
  const systemPrompt = agentPrompts[agent.toUpperCase()] || agentPrompts.ORACLE;
  const analysisPrompt = `The user asked: "${question}"

Here is the live data from "${api.name}" (${api.url}):
\`\`\`json
${apiData}
\`\`\`

Analyze this data and answer the user's question with specific insights. Reference actual values from the data.`;

  let response = '';
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: analysisPrompt }],
        max_tokens: 1000
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 30000 });
      response = r.data.choices[0]?.message?.content || '';
    } catch (e) { console.warn('[user-api:use] Groq failed:', e.message); }
  }
  if (!response) {
    try {
      const tags = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
      const model = (tags.data.models || [])[0]?.name || DEFAULT_OLLAMA_MODEL;
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: analysisPrompt }],
        stream: false
      }, { timeout: 120000 });
      response = r.data.message?.content || '';
    } catch (e) { return res.status(502).json({ error: 'LLM unavailable: ' + e.message }); }
  }

  res.json({ response, agent, apiName: api.name, dataPreview: apiData.slice(0, 200) });
});

// ─────────────────────────────────────────────────────────────
// SKILL MARKETPLACE — browse, publish, buy skills
// ─────────────────────────────────────────────────────────────
const SKILL_MARKETPLACE_FILE = path.join(DATA_DIR, 'skill_marketplace.json');
let _skillMarketplace = loadJSON(SKILL_MARKETPLACE_FILE, []);
function saveSkillMarketplace() { saveJSON(SKILL_MARKETPLACE_FILE, _skillMarketplace); }

// GET /api/marketplace/skills — browse skills (from Obsidian vault + published custom)
router.get('/marketplace/skills', (req, res) => {
  const { search, agent, limit = 50, offset = 0 } = req.query;
  let vaultSkills = [];
  try { vaultSkills = skillsLoader.getSkillRegistry(OBSIDIAN_ROOT) || []; } catch {}
  let skills = vaultSkills.map(s => ({
    id: s.id || s.name,
    name: s.name || s.skillName || 'Unknown Skill',
    description: (s.content || '').substring(0, 150) || 'Specialized agent skill',
    agent: s.agent || 'SHADDAI',
    source: 'obsidian',
    price: 0,
    level: 2,
  }));
  // Add published custom skills
  const published = _skillMarketplace.filter(s => s.status === 'published');
  skills = [...published, ...skills];
  // Filter
  if (search) {
    const q = search.toLowerCase();
    skills = skills.filter(s => (s.name||'').toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q));
  }
  if (agent) skills = skills.filter(s => s.agent?.toLowerCase() === agent.toLowerCase());
  const total = skills.length;
  const page = skills.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.json({ skills: page, total, offset: parseInt(offset), limit: parseInt(limit) });
});

// POST /api/marketplace/skills/publish — publish a skill for sale
router.post('/marketplace/skills/publish', (req, res) => {
  const { name, description, price, agent, content } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const skill = {
    id: `pub_${Date.now()}`,
    name, description: description || '', price: price || 0,
    agent: agent || 'SHADDAI', content: content || '',
    status: 'published', publishedAt: new Date().toISOString(),
    rating: 0, purchases: 0,
  };
  _skillMarketplace.push(skill);
  saveSkillMarketplace();
  res.json({ success: true, skill });
});

// POST /api/marketplace/skills/buy — buy/assign a skill
router.post('/marketplace/skills/buy', (req, res) => {
  const { skillId, agent } = req.body;
  if (!skillId) return res.status(400).json({ error: 'skillId required' });
  // Record purchase
  const ms = _skillMarketplace.find(s => s.id === skillId);
  if (ms) { ms.purchases = (ms.purchases || 0) + 1; saveSkillMarketplace(); }
  // Assign to agent
  const agentKey = (agent || 'shaddai').toLowerCase();
  if (!_skillAssignments[agentKey]) _skillAssignments[agentKey] = [];
  if (!_skillAssignments[agentKey].includes(skillId)) _skillAssignments[agentKey].push(skillId);
  saveSkillAssignments();
  res.json({ success: true, skillId, agent: agentKey });
});

// ─────────────────────────────────────────────────────────────
// WORKFLOW LIST + RUN + DELETE — persistent storage
// ─────────────────────────────────────────────────────────────
let _workflows = loadJSON(WORKFLOWS_FILE, []);

function saveWorkflows() { saveJSON(WORKFLOWS_FILE, _workflows); }

router.get('/workflow/list', (req, res) => {
  res.json({ workflows: _workflows, total: _workflows.length });
});

router.post('/workflow', (req, res) => {
  const workflow = {
    id: `wf_${Date.now()}`,
    ...req.body,
    status: 'draft',
    createdAt: new Date().toISOString(),
    runs: 0
  };
  _workflows.push(workflow);
  saveWorkflows();
  broadcastEvent('workflow:created', { workflowId: workflow.id, name: workflow.name });
  res.json({ workflow, message: 'Workflow created' });
});

router.post('/workflow/:id/run', async (req, res) => {
  const wf = _workflows.find(w => w.id === req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });

  // Pre-run validation — catch bad steps before we fire off background work
  const steps = wf.steps || [];
  if (!steps.length) return res.status(400).json({ error: 'Workflow has no steps' });
  const VALID_AGENTS_RUN = new Set(['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON']);
  const stepErrors = [];
  steps.forEach((s, idx) => {
    const taskText = s.task || s.prompt || '';
    if (!s.agent) stepErrors.push(`Step ${idx + 1}: missing agent`);
    else if (!VALID_AGENTS_RUN.has((s.agent || '').toUpperCase())) stepErrors.push(`Step ${idx + 1}: unknown agent "${s.agent}"`);
    if (!taskText.trim()) stepErrors.push(`Step ${idx + 1}: missing task/prompt text`);
  });
  if (stepErrors.length) return res.status(400).json({ error: 'Workflow validation failed', details: stepErrors });

  if (await enforceCredits(req, res, 'workflow_run')) return; // charge before background run

  wf.runs = (wf.runs || 0) + 1;
  wf.lastRun = new Date().toISOString();
  wf.status = 'running';
  saveWorkflows();

  const runId = `run_${Date.now()}`;
  broadcastEvent('workflow:started', { workflowId: wf.id, runId, name: wf.name });

  // Return immediately — execution runs async in background
  res.json({ status: 'running', workflowId: wf.id, runId, message: 'Workflow executing — watch /events/stream for progress' });

  // Execute steps asynchronously — per-step try/catch so one failure never aborts the chain
  setImmediate(async () => {
    let prevOutput = '';
    let failedCount = 0;
    const stepResults = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agentName = (step.agent || 'SHADDAI').toUpperCase();
      const agentLower = agentName.toLowerCase();
      const rawTask = (step.task || step.prompt || '').trim();
      // Substitute context placeholder — support both naming conventions
      const task = rawTask
        .replace(/\{prev_output\}/g, prevOutput.slice(0, 2000))
        .replace(/\{prev\}/g, prevOutput.slice(0, 2000));

      broadcastEvent('workflow:step:start', { runId, workflowId: wf.id, step: i, agent: agentLower, task: task.slice(0, 100) });

      let stepOutput = '';
      let stepStatus = 'completed';
      let stepError = null;

      try {
        // Try Ollama first (local/free)
        let ollamaOk = false;
        try {
          const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: DEFAULT_OLLAMA_MODEL,
            messages: [
              { role: 'system', content: `You are ${agentName}, an expert AI agent. Complete the task concisely.` },
              { role: 'user', content: task }
            ],
            stream: false
          }, { timeout: 90000 });
          stepOutput = r.data.message?.content || '';
          ollamaOk = true;
        } catch (ollamaErr) {
          console.warn(`[workflow:${runId}] Step ${i + 1} Ollama failed: ${ollamaErr.message} — trying Groq fallback`);
        }

        // Groq fallback if Ollama failed and key is available
        if (!ollamaOk && process.env.GROQ_API_KEY) {
          const gr = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: `You are ${agentName}, an expert AI agent. Complete the task concisely.` },
              { role: 'user', content: task }
            ],
            max_tokens: 1500, temperature: 0.7
          }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 45000 });
          stepOutput = gr.data.choices[0]?.message?.content || '';
          ollamaOk = true; // Groq succeeded
        }

        if (!ollamaOk) throw new Error('All LLM providers failed for this step (Ollama unreachable and no GROQ_API_KEY)');

        prevOutput = stepOutput || prevOutput; // keep last good output if step returned nothing
        stepResults.push({ step: i, agent: agentLower, status: stepStatus, output: stepOutput });
        broadcastEvent('workflow:step:done', { runId, workflowId: wf.id, step: i, agent: agentLower, output: stepOutput.slice(0, 300) });
      } catch (e) {
        failedCount++;
        stepStatus = 'failed';
        stepError = e.message;
        // Record failure but do NOT break — continue executing remaining steps
        stepResults.push({ step: i, agent: agentLower, status: 'failed', error: e.message, output: null });
        broadcastEvent('workflow:step:error', { runId, workflowId: wf.id, step: i, agent: agentLower, error: e.message });
        console.error(`[workflow:${runId}] Step ${i + 1} (${agentName}) failed: ${e.message} — continuing workflow`);
      }
    }

    wf.status = failedCount === 0 ? 'completed' : failedCount === steps.length ? 'failed' : 'partial';
    wf.lastOutput = prevOutput.slice(0, 1000);
    wf.lastRunId = runId;
    wf.failedSteps = failedCount;
    saveWorkflows();
    broadcastEvent('workflow:complete', { runId, workflowId: wf.id, status: wf.status, failedSteps: failedCount, output: prevOutput.slice(0, 500), steps: stepResults });
  });
});

router.delete('/workflow/:id', (req, res) => {
  const idx = _workflows.findIndex(w => w.id === req.params.id);
  if (idx !== -1) _workflows.splice(idx, 1);
  saveWorkflows();
  res.json({ deleted: true, workflowId: req.params.id });
});

// ─────────────────────────────────────────────────────────────
// AGENT HEALTH ROUTES (proxy to agent ports)
// ─────────────────────────────────────────────────────────────
const agentHealthMap = {
  shaddai: 8000, zerox: 8001, oracle: 8002, nexus: 8003,
  turtle: 8004, quill: 8005, pikadon: 8008, network: 8003
};

for (const [name, port] of Object.entries(agentHealthMap)) {
  router.get(`/${name}/health`, async (req, res) => {
    try {
      const r = await axios.get(`http://localhost:${port}/health`, { timeout: 3000 });
      res.json(r.data);
    } catch {
      res.json({ status: 'offline', name, port });
    }
  });
}

// ZEROX docs + skills + search
router.get('/zerox/docs', (req, res) => proxyAgent(8001, '/skills', res));
// Auto-routing preview — tell dashboard which agent will handle a message
router.post('/shaddai/route', (req, res) => {
  const { message } = req.body;
  const route = routeMessage(message);
  if (route) {
    res.json({ agent: route.name, emoji: route.emoji, port: route.port, message: `Routing to ${route.name}`, autoRouted: true });
  } else {
    res.json({ agent: 'SHADDAI', emoji: '⚡', port: 8000, message: 'Handling with SHADDAI', autoRouted: false });
  }
});

router.get('/shaddai/search', async (req, res) => {
  const { q } = req.query;
  try {
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: DEFAULT_OLLAMA_MODEL,
      messages: [{ role: 'user', content: `Search result summary for: ${q}` }],
      stream: false
    }, { timeout: 30000 });
    res.json({ results: [], summary: r.data.message?.content || '', query: q });
  } catch (e) { res.json({ results: [], error: e.message }); }
});

router.post('/shaddai/perplexity', async (req, res) => {
  const { query } = req.body;
  try {
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: DEFAULT_OLLAMA_MODEL,
      messages: [{ role: 'user', content: query || '' }],
      stream: false
    }, { timeout: 60000 });
    res.json({ answer: r.data.message?.content || '', query, sources: [] });
  } catch (e) { fail(res, 500, 'internal_error', e.message); }
});

// ─────────────────────────────────────────────────────────────
// AGENT CHAT + TASK PROXY ROUTES (all 7 agents)
// Each agent has: POST /chat, POST /task, GET /skills, POST /skill/:name
// ─────────────────────────────────────────────────────────────
const AGENT_MAP = {
  zerox:   { port: 8001, name: 'ZEROX',   emoji: '💰' },
  oracle:  { port: 8002, name: 'ORACLE',  emoji: '🔮' },
  nexus:   { port: 8003, name: 'NEXUS',   emoji: '🕸' },
  network: { port: 8003, name: 'NEXUS',   emoji: '🕸' },
  turtle:  { port: 8004, name: 'TURTLE',  emoji: '🐢' },
  quill:   { port: 8005, name: 'QUILL',   emoji: '✍️' },
  pikadon: { port: 8008, name: 'PIKADON', emoji: '🛡' }
};

const AGENT_SYSTEM_PROMPTS = {
  zerox:   'You are ZEROX, revenue engine and wealth strategist. Think MRR, LTV, CAC. Sign as [ZEROX 💰]',
  oracle:  'You are ORACLE, intelligence and research specialist. Surface patterns. Sign as [ORACLE 🔮]',
  nexus:   'You are NEXUS, technical architect. Favor simple, testable solutions. Sign as [NEXUS 🕸]',
  network: 'You are NEXUS, technical architect. Favor simple, testable solutions. Sign as [NEXUS 🕸]',
  turtle:  'You are TURTLE, creative director. Care about every pixel. Sign as [TURTLE 🐢]',
  quill:   'You are QUILL, master communicator. Clarity over cleverness. Sign as [QUILL ✍️]',
  pikadon: 'You are PIKADON, security guardian. Assume worst-case. Sign as [PIKADON 🛡]'
};

for (const [agentKey, cfg] of Object.entries(AGENT_MAP)) {
  // Chat — proxy to agent server or Ollama fallback, broadcast response via SSE
  router.post(`/${agentKey}/chat`, async (req, res) => {
    // IP rate limit: 30 requests per minute per IP
    if (!checkRateLimit(req.ip || req.connection.remoteAddress)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    }

    const { message, model } = req.body;
    let agentUp = false;
    try { await axios.get(`http://localhost:${cfg.port}/ping`, { timeout: 500 }); agentUp = true; } catch {}

    if (agentUp) {
      try {
        const t0 = Date.now();
        const r = await axios.post(`http://localhost:${cfg.port}/chat`, { message, model }, { timeout: 120000 });
        recordAgentCall(cfg.name, Date.now() - t0, true);
        broadcastEvent('agent:response', { agent: cfg.name, emoji: cfg.emoji, preview: (r.data.response || '').slice(0, 100) });
        return res.json(r.data);
      } catch {}
    }
    const t0 = Date.now();
    try {
      const useModel = model || DEFAULT_OLLAMA_MODEL;
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: useModel,
        messages: [
          { role: 'system', content: AGENT_SYSTEM_PROMPTS[agentKey] || `You are ${cfg.name}` },
          { role: 'user', content: message || '' }
        ],
        stream: false
      }, { timeout: 120000 });
      const response = r.data.message?.content || 'No response';
      recordAgentCall(cfg.name, Date.now() - t0, true);
      broadcastEvent('agent:response', { agent: cfg.name, emoji: cfg.emoji, preview: response.slice(0, 100) });
      res.json({ response, model: useModel, source: 'ollama-fallback', agent: cfg.name });
    } catch (e) {
      recordAgentCall(cfg.name, Date.now() - t0, false);
      fail(res, 500, 'internal_error', e.message, { agent: cfg.name });
    }
  });

  // Task
  router.post(`/${agentKey}/task`, async (req, res) => {
    const { task, priority = 'normal' } = req.body;
    try {
      const r = await axios.post(`http://localhost:${cfg.port}/task`, { task, priority }, { timeout: 120000 });
      return res.json(r.data);
    } catch {
      try {
        const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
          model: DEFAULT_OLLAMA_MODEL,
          messages: [
            { role: 'system', content: `${AGENT_SYSTEM_PROMPTS[agentKey]} Complete assigned tasks concisely.` },
            { role: 'user', content: `Task (${priority}): ${task}` }
          ],
          stream: false
        }, { timeout: 90000 });
        res.json({ output: r.data.message?.content, agent: cfg.name, status: 'completed', taskId: `task_${Date.now()}` });
      } catch (e) {
        fail(res, 500, 'internal_error', e.message);
      }
    }
  });

  // Skills list
  router.get(`/${agentKey}/skills`, async (req, res) => {
    try {
      const r = await axios.get(`http://localhost:${cfg.port}/skills`, { timeout: 3000 });
      return res.json(r.data);
    } catch {
      const skills = SKILL_REGISTRY.filter(s => s.agent === cfg.name);
      res.json({ name: cfg.name, skills: skills.map(s => s.name) });
    }
  });

  // Skill execution
  router.post(`/${agentKey}/skill/:skillName`, async (req, res) => {
    const { skillName } = req.params;
    const { params = {}, context } = req.body;
    try {
      const r = await axios.post(`http://localhost:${cfg.port}/skill/${skillName}`, { params, context }, { timeout: 90000 });
      return res.json(r.data);
    } catch {
      try {
        const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
          model: DEFAULT_OLLAMA_MODEL,
          messages: [
            { role: 'system', content: AGENT_SYSTEM_PROMPTS[agentKey] },
            { role: 'user', content: `Execute skill "${skillName}" with params: ${JSON.stringify(params)}` }
          ],
          stream: false
        }, { timeout: 90000 });
        res.json({ result: r.data.message?.content, skill: skillName, agent: cfg.name, status: 'completed', source: 'ollama' });
      } catch (e) {
        fail(res, 500, 'internal_error', e.message);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// MiroFish proxy (port 5001)
// ─────────────────────────────────────────────────────────────
router.all('/mirofish/*', async (req, res) => {
  const subPath = req.path.replace('/mirofish', '');
  try {
    const r = await axios({
      method: req.method,
      url: `http://localhost:5001${subPath}`,
      data: req.body,
      params: req.query,
      timeout: 10000
    });
    res.json(r.data);
  } catch {
    res.status(503).json({ status: 'offline', message: 'MiroFish server not running on port 5001' });
  }
});

// ─────────────────────────────────────────────────────────────
// AGENT PERFORMANCE TRACKING
// Records response times, success/failure rates per agent
// ─────────────────────────────────────────────────────────────
const _agentStats = {};
const AGENT_NAMES = ['shaddai', 'zerox', 'oracle', 'nexus', 'turtle', 'quill', 'pikadon'];
for (const name of AGENT_NAMES) {
  _agentStats[name] = { requests: 0, successes: 0, failures: 0, totalMs: 0, avgMs: 0, p95Ms: 0, responseTimes: [] };
}

function recordAgentCall(agentName, durationMs, success) {
  const s = _agentStats[agentName.toLowerCase()];
  if (!s) return;
  s.requests++;
  if (success) s.successes++; else s.failures++;
  s.totalMs += durationMs;
  s.avgMs = Math.round(s.totalMs / s.requests);
  s.responseTimes.push(durationMs);
  if (s.responseTimes.length > 100) s.responseTimes.shift(); // keep last 100
  const sorted = [...s.responseTimes].sort((a, b) => a - b);
  s.p95Ms = sorted[Math.floor(sorted.length * 0.95)] || 0;
}

router.get('/agent-stats', (req, res) => {
  const stats = Object.entries(_agentStats).map(([name, s]) => ({
    name: name.toUpperCase(), requests: s.requests, successRate: s.requests > 0
      ? `${Math.round(s.successes / s.requests * 100)}%` : 'N/A',
    avgResponseMs: s.avgMs, p95Ms: s.p95Ms, failures: s.failures
  }));
  res.json({ agents: stats, totalRequests: stats.reduce((sum, s) => sum + s.requests, 0) });
});

router.get('/agent-stats/:agentName', (req, res) => {
  const s = _agentStats[req.params.agentName.toLowerCase()];
  if (!s) return res.status(404).json({ error: 'Agent not found' });
  res.json({ agent: req.params.agentName.toUpperCase(), ...s, responseTimes: undefined });
});

// ─────────────────────────────────────────────────────────────
// WEBHOOK NOTIFICATION SYSTEM
// Register URLs to receive POST notifications on marketplace events
// ─────────────────────────────────────────────────────────────
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');
let _webhooks = loadJSON(WEBHOOKS_FILE, []);

function saveWebhooks() { saveJSON(WEBHOOKS_FILE, _webhooks); }

async function fireWebhooks(eventType, payload) {
  const matching = _webhooks.filter(w => !w.events || w.events.includes(eventType) || w.events.includes('*'));
  for (const wh of matching) {
    try {
      await axios.post(wh.url, { event: eventType, payload, timestamp: new Date().toISOString() }, {
        timeout: 5000, headers: { 'X-SHADDAI-Event': eventType, 'Content-Type': 'application/json' }
      });
      wh.lastFired = new Date().toISOString();
      wh.fireCount = (wh.fireCount || 0) + 1;
    } catch (e) {
      wh.lastError = e.message;
      wh.errorCount = (wh.errorCount || 0) + 1;
    }
  }
  if (matching.length > 0) saveWebhooks();
}

router.get('/webhooks', (req, res) => {
  res.json({ webhooks: _webhooks.map(w => ({ ...w })), total: _webhooks.length });
});

// GET /api/persistence/health — is the free Firestore backup working? (ORACLE fix)
// Diagnostics are booleans/lengths only — NEVER exposes the secret value itself.
router.get('/persistence/health', async (req, res) => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  const diag = { firebaseEnvPresent: !!raw, firebaseEnvLen: raw.length, firebaseEnvParses: false, projectId: null };
  try { const p = JSON.parse(raw); diag.firebaseEnvParses = true; diag.projectId = p.project_id || null; } catch (_) {}
  try {
    let adminApps = 0; try { adminApps = (require('firebase-admin').apps || []).length; } catch (_) {}
    const store = require('./lib/fire-store');
    const ping = await store.ping();
    let writeBudget = null; try { writeBudget = store.stats(); } catch (_) {}
    let beta = null; try { const bc = require('./beta-cap'); beta = { cap: bc.CAP, count: bc.count() }; } catch (_) {}
    res.json({ ok: true, ready: store.ready(), adminApps, diag, firestore: ping, writeBudget, beta });
  } catch (e) {
    fail(res, 500, 'internal_error', String(e.message || e), { ok: false, diag });
  }
});

// SSRF guard — reject URLs that point at the server's own network: loopback,
// link-local (incl. cloud metadata 169.254.169.254), and RFC1918 private ranges.
function _isSafeWebhookUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  // IPv6 loopback/link-local
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;
  // IPv4 literal ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 0 || a === 10) return false;                 // loopback / this-net / private
    if (a === 169 && b === 254) return false;                            // link-local + cloud metadata
    if (a === 192 && b === 168) return false;                            // private
    if (a === 172 && b >= 16 && b <= 31) return false;                   // private
    if (a === 100 && b >= 64 && b <= 127) return false;                  // CGNAT
  }
  return true;
}

router.post('/webhooks', (req, res) => {
  const { url, events, secret, name } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  // URL validation — must be http/https, no javascript:/data:, and not internal (SSRF).
  const urlStr = String(url).trim();
  const lowerUrl = urlStr.toLowerCase();
  if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'Webhook URL must start with http:// or https://' });
  }
  if (lowerUrl.includes('javascript:') || lowerUrl.includes('data:')) {
    return res.status(400).json({ error: 'Webhook URL contains a disallowed scheme' });
  }
  if (!_isSafeWebhookUrl(urlStr)) {
    return res.status(400).json({ error: 'Webhook URL may not point to an internal/private address' });
  }

  const webhook = {
    id: `wh_${Date.now()}`,
    name: name || url,
    url, events: events || ['*'],
    secret: secret || null,
    createdAt: new Date().toISOString(),
    fireCount: 0, errorCount: 0
  };
  _webhooks.push(webhook);
  saveWebhooks();
  res.json({ webhook, message: 'Webhook registered' });
});

router.delete('/webhooks/:id', (req, res) => {
  const idx = _webhooks.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Webhook not found' });
  _webhooks.splice(idx, 1);
  saveWebhooks();
  res.json({ deleted: true, id: req.params.id });
});

router.post('/webhooks/:id/test', async (req, res) => {
  const wh = _webhooks.find(w => w.id === req.params.id);
  if (!wh) return res.status(404).json({ error: 'Webhook not found' });
  if (!_isSafeWebhookUrl(wh.url)) return res.status(400).json({ error: 'Webhook target is an internal/private address — refusing to send' });
  try {
    await axios.post(wh.url, { event: 'test', payload: { message: 'SHADDAI webhook test' }, timestamp: new Date().toISOString() }, { timeout: 5000, maxRedirects: 0 });
    res.json({ success: true, url: wh.url });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { success: false });
  }
});

// Wire webhooks into job/bid events
const _origBroadcast = broadcastEvent;
// Note: can't reassign function declarations; fire webhooks from key endpoints directly

// ─────────────────────────────────────────────────────────────
// USER SESSION STORE — lightweight profile persistence
// Simple token-based sessions backed by JSON file
// ─────────────────────────────────────────────────────────────
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let _sessions = loadJSON(SESSIONS_FILE, {});

function saveSessions() { saveJSON(SESSIONS_FILE, _sessions); }
function cleanExpiredSessions() {
  const now = Date.now();
  let changed = false;
  for (const [token, sess] of Object.entries(_sessions)) {
    if (sess.expiresAt < now) { delete _sessions[token]; changed = true; }
  }
  if (changed) saveSessions();
}
setInterval(cleanExpiredSessions, 60 * 60 * 1000); // clean every hour

function generateToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

router.post('/session/create', (req, res) => {
  const { userId, displayName, walletAddress, tier = 'free' } = req.body;
  const token = generateToken();
  const session = {
    token, userId: userId || `user_${Date.now()}`,
    displayName: displayName || 'Anonymous', walletAddress, tier,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    lastActive: Date.now()
  };
  _sessions[token] = session;
  saveSessions();
  res.json({ session: { ...session, expiresAt: new Date(session.expiresAt).toISOString() }, token });
});

router.get('/session/:token', (req, res) => {
  const sess = _sessions[req.params.token];
  if (!sess) return res.status(404).json({ error: 'Session not found or expired' });
  if (sess.expiresAt < Date.now()) {
    delete _sessions[req.params.token];
    saveSessions();
    return res.status(401).json({ error: 'Session expired' });
  }
  sess.lastActive = Date.now();
  saveSessions();
  res.json({ session: { ...sess, expiresAt: new Date(sess.expiresAt).toISOString() } });
});

router.patch('/session/:token', (req, res) => {
  const sess = _sessions[req.params.token];
  if (!sess || sess.expiresAt < Date.now()) return res.status(401).json({ error: 'Invalid session' });
  const { displayName, walletAddress, tier, preferences } = req.body;
  if (displayName) sess.displayName = displayName;
  if (walletAddress) sess.walletAddress = walletAddress;
  if (tier) sess.tier = tier;
  if (preferences) sess.preferences = { ...(sess.preferences || {}), ...preferences };
  sess.lastActive = Date.now();
  saveSessions();
  res.json({ session: sess });
});

router.delete('/session/:token', (req, res) => {
  delete _sessions[req.params.token];
  saveSessions();
  res.json({ deleted: true });
});

router.get('/session/:token/jobs', (req, res) => {
  const sess = _sessions[req.params.token];
  if (!sess) return res.status(401).json({ error: 'Invalid session' });
  const userJobs = _jobs.filter(j => j.clientId === sess.userId);
  res.json({ jobs: userJobs, total: userJobs.length, userId: sess.userId });
});

// ─────────────────────────────────────────────────────────────
// ENHANCED ADMIN ANALYTICS — real data from stored state
// ─────────────────────────────────────────────────────────────
router.get('/admin/analytics', (req, res) => {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const jobsToday = _jobs.filter(j => new Date(j.createdAt).getTime() > oneDayAgo).length;
  const jobsThisWeek = _jobs.filter(j => new Date(j.createdAt).getTime() > oneWeekAgo).length;
  const totalBids = _jobs.reduce((sum, j) => sum + (j.bids || []).length, 0);
  const completedJobs = _jobs.filter(j => j.status === 'completed');
  const totalRevenue = completedJobs.reduce((sum, j) => sum + parseFloat(j.budget || 0), 0);
  const activeSessions = Object.values(_sessions).filter(s => s.expiresAt > now).length;

  res.json({
    jobs: { total: _jobs.length, today: jobsToday, thisWeek: jobsThisWeek, open: _jobs.filter(j => j.status === 'open').length, completed: completedJobs.length },
    bids: { total: totalBids, avgPerJob: _jobs.length > 0 ? (totalBids / _jobs.length).toFixed(1) : 0 },
    revenue: { total: totalRevenue, completed: completedJobs.length },
    events: { recent: _eventHistory.length, webhooks: _webhooks.length },
    sessions: { active: activeSessions, total: Object.keys(_sessions).length },
    agents: Object.fromEntries(Object.entries(_agentStats).map(([k, v]) => [k, { requests: v.requests, avgMs: v.avgMs }])),
    sseClients: _sseClients.size,
    uptime: process.uptime(),
    cache: { size: _cache.size },
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION TIER ENFORCEMENT — ZEROX Billing Engine
// Enforces limits by tier, tracks real usage, supports upgrades
// ─────────────────────────────────────────────────────────────

/**
 * Returns hard limits for a given subscription tier.
 * -1 means unlimited (enterprise).
 */
function getTierLimits(tier) {
  const TIER_LIMITS = {
    free:       { maxJobs: 3,   maxBids: 10,  maxSkills: 5,   maxWorkflows: 2  },
    pro:        { maxJobs: 50,  maxBids: 500, maxSkills: 100, maxWorkflows: 25 },
    enterprise: { maxJobs: -1,  maxBids: -1,  maxSkills: -1,  maxWorkflows: -1 }
  };
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
}

const TIER_PRICING = {
  free:       { price: 0,   label: 'Free',       description: 'Get started with the basics',                    currency: 'USD', interval: 'month' },
  pro:        { price: 29,  label: 'Pro',         description: 'For serious freelancers and small teams',        currency: 'USD', interval: 'month' },
  enterprise: { price: 199, label: 'Enterprise',  description: 'Unlimited access for power users and agencies', currency: 'USD', interval: 'month' }
};

// GET /billing/tiers — return all tier definitions with limits + pricing
router.get('/billing/tiers', (req, res) => {
  const tiers = Object.entries(TIER_PRICING).map(([tier, pricing]) => ({
    tier,
    ...pricing,
    limits: getTierLimits(tier)
  }));
  res.json({ tiers });
});

// GET /billing/usage/:sessionToken — current tier limits vs real usage
router.get('/billing/usage/:sessionToken', (req, res) => {
  const sess = _sessions[req.params.sessionToken];
  if (!sess) return res.status(404).json({ error: 'Session not found or expired' });
  if (sess.expiresAt < Date.now()) return res.status(401).json({ error: 'Session expired' });

  const tier   = sess.tier || 'free';
  const userId = sess.userId;
  const limits = getTierLimits(tier);

  // Count real usage from live data stores
  const usedJobs      = _jobs.filter(j => j.clientId === userId).length;
  const usedBids      = _jobs.reduce(
    (sum, j) => sum + (j.bids || []).filter(b => b.agentId === userId || b.userId === userId).length,
    0
  );
  const usedWorkflows = _workflows.filter(
    w => w.createdBy === userId || w.userId === userId || w.ownerId === userId
  ).length;
  // Skills: tracked on session metadata; increment sess.skillCount in your skill-create flow
  const usedSkills = sess.skillCount || 0;

  function pct(used, max) {
    if (max === -1) return 0;   // unlimited
    if (max === 0)  return 100;
    return Math.min(100, Math.round((used / max) * 100));
  }

  const WARN = 80; // warn at >= 80% consumed

  const usage = {
    jobs:      { used: usedJobs,      limit: limits.maxJobs,      pct: pct(usedJobs, limits.maxJobs),           nearLimit: pct(usedJobs,      limits.maxJobs)      >= WARN },
    bids:      { used: usedBids,      limit: limits.maxBids,      pct: pct(usedBids, limits.maxBids),           nearLimit: pct(usedBids,      limits.maxBids)      >= WARN },
    skills:    { used: usedSkills,    limit: limits.maxSkills,    pct: pct(usedSkills, limits.maxSkills),       nearLimit: pct(usedSkills,    limits.maxSkills)    >= WARN },
    workflows: { used: usedWorkflows, limit: limits.maxWorkflows, pct: pct(usedWorkflows, limits.maxWorkflows), nearLimit: pct(usedWorkflows, limits.maxWorkflows) >= WARN }
  };

  const anyNearLimit  = Object.values(usage).some(u => u.nearLimit);
  const nextTier      = tier === 'free' ? 'pro' : 'enterprise';
  const upgradePrompt = (tier !== 'enterprise' && anyNearLimit)
    ? { show: true, message: `You're approaching your ${tier} plan limits. Upgrade to unlock more capacity.`, nextTier, nextTierPrice: TIER_PRICING[nextTier].price }
    : { show: false };

  res.json({ tier, pricing: TIER_PRICING[tier], limits, usage, upgradePrompt, userId, sessionToken: req.params.sessionToken });
});

// POST /billing/upgrade — update session tier (gate behind Stripe webhook in production)
router.post('/billing/upgrade', requireAdmin, (req, res) => {
  const { token, newTier } = req.body;
  if (!token)   return res.status(400).json({ error: 'token is required' });
  if (!newTier) return res.status(400).json({ error: 'newTier is required' });

  const validTiers = ['free', 'pro', 'enterprise'];
  if (!validTiers.includes(newTier)) {
    return res.status(400).json({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
  }

  const sess = _sessions[token];
  if (!sess) return res.status(404).json({ error: 'Session not found or expired' });
  if (sess.expiresAt < Date.now()) return res.status(401).json({ error: 'Session expired' });

  const previousTier = sess.tier || 'free';
  sess.tier          = newTier;
  sess.tierUpdatedAt = new Date().toISOString();
  sess.lastActive    = Date.now();
  saveSessions();

  broadcastEvent('billing:upgrade', { userId: sess.userId, previousTier, newTier, timestamp: sess.tierUpdatedAt });

  res.json({
    success:      true,
    message:      `Plan upgraded from ${previousTier} to ${newTier}`,
    previousTier,
    newTier,
    limits:       getTierLimits(newTier),
    pricing:      TIER_PRICING[newTier],
    session:      { ...sess, expiresAt: new Date(sess.expiresAt).toISOString() }
  });
});

// ─────────────────────────────────────────────────────────────
// AUTONOMOUS AGENT CHAIN — multi-step agent workflow
// POST /workflow/chain
// body: { name?, steps: [{ agent, task }], model? }
// Each step's output feeds into the next step via {prev_output}
// ─────────────────────────────────────────────────────────────
const CHAIN_AGENT_PROMPTS = {
  shaddai: 'You are SHADDAI ⚡, supreme orchestrator. Be strategic and decisive.',
  nexus:   'You are NEXUS 🕸, technical architect. Be precise and pragmatic.',
  zerox:   'You are ZEROX 💰, revenue strategist. Think in MRR, LTV, ROI.',
  oracle:  'You are ORACLE 🔮, intelligence analyst. Surface patterns and insights.',
  turtle:  'You are TURTLE 🐢, UX/design expert. Think in pixels, flows, and delight.',
  quill:   'You are QUILL ✍️, master writer. Clarity and precision over cleverness.',
  pikadon: 'You are PIKADON 🛡, security guardian. Assume worst-case, verify everything.'
};

router.post('/workflow/chain', async (req, res) => {
  const { steps = [], name = 'Chain', model } = req.body;
  if (!steps.length) return res.status(400).json({ error: 'steps array required' });
  if (steps.length > 10) return res.status(400).json({ error: 'max 10 steps per chain' });

  const chainId = `chain_${Date.now()}`;
  broadcastEvent('chain:start', { chainId, name, stepCount: steps.length });

  // Return immediately — client watches SSE stream for updates
  res.json({ chainId, status: 'running', stepCount: steps.length, message: `Chain started. Subscribe to /events/stream and filter on chainId: "${chainId}"` });

  setImmediate(async () => {
    let prevOutput = '';
    const outputs = [];
    let success = true;
    const useModel = model || DEFAULT_OLLAMA_MODEL;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agentKey = (step.agent || 'shaddai').toLowerCase();
      const taskTemplate = step.task || step.prompt || 'Complete this step.';
      const task = taskTemplate.replace(/\{prev_output\}/gi, prevOutput.slice(0, 3000));

      broadcastEvent('chain:step:start', { chainId, step: i + 1, total: steps.length, agent: agentKey.toUpperCase(), task: task.slice(0, 150) });

      try {
        // Try agent HTTP server first (500ms ping), fall back to Ollama direct
        const agentPorts = { shaddai: 8000, zerox: 8001, oracle: 8002, nexus: 8003, turtle: 8004, quill: 8005, pikadon: 8008 };
        const port = agentPorts[agentKey];
        let response = '';

        let usedAgent = false;
        if (port) {
          try {
            await axios.get(`http://localhost:${port}/ping`, { timeout: 500 });
            const r = await axios.post(`http://localhost:${port}/chat`, { message: task, model: useModel }, { timeout: 90000 });
            response = r.data.response || '';
            usedAgent = true;
          } catch {}
        }

        if (!usedAgent) {
          const sysPrompt = CHAIN_AGENT_PROMPTS[agentKey] || CHAIN_AGENT_PROMPTS.shaddai;
          const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: useModel,
            messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: task }],
            stream: false
          }, { timeout: 90000 });
          response = r.data.message?.content || '';
        }

        prevOutput = response;
        outputs.push({ step: i + 1, agent: agentKey.toUpperCase(), task: task.slice(0, 100), output: response });
        broadcastEvent('chain:step:done', { chainId, step: i + 1, agent: agentKey.toUpperCase(), output: response.slice(0, 400) });

      } catch (e) {
        success = false;
        outputs.push({ step: i + 1, agent: agentKey.toUpperCase(), error: e.message });
        broadcastEvent('chain:step:error', { chainId, step: i + 1, agent: agentKey.toUpperCase(), error: e.message });
        break;
      }
    }

    broadcastEvent('chain:complete', {
      chainId, name, status: success ? 'completed' : 'failed',
      steps: outputs.length, finalOutput: prevOutput.slice(0, 800)
    });
  });
});

// ─────────────────────────────────────────────────────────────
// UNIFIED LLM ROUTER — one endpoint, any provider
// POST /llm/chat
// body: { message, provider: 'auto'|'ollama'|'claude'|'grok'|'gemini'|'groq', model?, apiKey?, systemPrompt? }
// Returns: { response, provider, model, latencyMs, fallbackUsed }
// ─────────────────────────────────────────────────────────────
router.post('/llm/chat', async (req, res) => {
  const { message, provider = 'auto', model, apiKey, systemPrompt, agent } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // Task-first system prompt: the agent DOES the user's task, concretely — no persona monologue, no product pitch.
  let sysPrompt = systemPrompt || '';
  if (!sysPrompt && agent) {
    const ROLES = {
      ORACLE:'research & market intelligence', ZEROX:'revenue, pricing & offers',
      NEXUS:'engineering & systems', TURTLE:'design, brand & visuals',
      QUILL:'writing & copy', PIKADON:'security & risk review', SHADDAI:'strategy & planning'
    };
    const A = String(agent).toUpperCase();
    const role = ROLES[A] || 'specialist';
    sysPrompt =
      'You are ' + A + ', the ' + role + ' specialist on the SHADDAI team. Do exactly what the user asks — directly, and like a sharp senior expert. ' +
      'Return concrete, specific, immediately-usable output: real steps, numbers, names, examples, or finished copy. ' +
      'Rules: no vague buzzwords or motivational filler; do NOT describe yourself; do NOT mention or pitch SHADDAI or any product; ' +
      'do NOT roleplay a cosmic persona; never output internal directives, tool syntax, or notes-to-self. If the request is unclear, make one reasonable assumption, state it in one line, then deliver. Just do the work.';
  }

  // AURA token-saver: answer free from cache/compute before spending an LLM call.
  try {
    const a = require('./lib/aura').route(message);
    if (a && a.hit) {
      return res.json({ response: a.answer, provider: 'aura-' + a.method, model: 'cache', latencyMs: 0, savedTokensEst: a.savedTokensEst, fallbackUsed: false });
    }
  } catch (_) {}

  // Rate limit
  if (!checkRateLimit(req.ip || req.connection.remoteAddress)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  const messages = [
    ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
    { role: 'user', content: message }
  ];

  async function tryOllama() {
    const t0 = Date.now();
    const useModel = model || DEFAULT_OLLAMA_MODEL;
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: useModel, messages, stream: false
    }, { timeout: 120000 });
    return { response: r.data.message?.content || '', provider: 'ollama', model: useModel, latencyMs: Date.now() - t0 };
  }

  async function tryGemini(key) {
    const t0 = Date.now();
    const response = await callGemini(sysPrompt ? (sysPrompt + '\n\n---\nUser: ' + message) : message, key || apiKey || process.env.GEMINI_API_KEY);
    return { response, provider: 'gemini', model: 'gemini-2.0-flash-lite', latencyMs: Date.now() - t0 };
  }

  async function tryGroq(key) {
    const t0 = Date.now();
    const useKey = key || apiKey || process.env.GROQ_API_KEY;
    if (!useKey) throw new Error('No Groq API key');
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: model || 'llama-3.3-70b-versatile', messages, max_tokens: 2048
    }, { headers: { Authorization: `Bearer ${useKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
    return { response: r.data.choices?.[0]?.message?.content || '', provider: 'groq', model: model || 'llama-3.3-70b-versatile', latencyMs: Date.now() - t0 };
  }

  async function tryClaude(key) {
    const t0 = Date.now();
    const useKey = key || apiKey || process.env.ANTHROPIC_API_KEY;
    if (!useKey) throw new Error('No Claude API key');
    const useModel = model || 'claude-haiku-4-5-20251001';
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: useModel, max_tokens: 2048,
      ...(sysPrompt ? { system: sysPrompt } : {}),
      messages: [{ role: 'user', content: message }]
    }, { headers: { 'x-api-key': useKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 30000 });
    return { response: r.data.content?.[0]?.text || '', provider: 'claude', model: useModel, latencyMs: Date.now() - t0 };
  }

  try {
    let result;

    if (provider === 'ollama') {
      result = await tryOllama();
    } else if (provider === 'gemini') {
      result = await tryGemini();
    } else if (provider === 'groq') {
      result = await tryGroq();
    } else if (provider === 'claude') {
      result = await tryClaude();
    } else {
      // 'auto' — prefer FAST cloud (Groq) when keyed, then Gemini/Claude, then local Ollama.
      // (Ollama is the free local fallback only — it is ~20s on llama3.2:1b, so never first.)
      const attempts = [];
      if (process.env.GROQ_API_KEY)      attempts.push(['groq',   tryGroq]);
      if (process.env.GEMINI_API_KEY)    attempts.push(['gemini', tryGemini]);
      if (process.env.ANTHROPIC_API_KEY) attempts.push(['claude', tryClaude]);
      attempts.push(['ollama', tryOllama]); // free local fallback, last
      let lastErr;
      for (let i = 0; i < attempts.length; i++) {
        try { result = await attempts[i][1](); result.fallbackUsed = i > 0; if (i > 0) result.fallbackFrom = attempts[0][0]; break; }
        catch (e) { lastErr = e; }
      }
      if (!result) {
        return res.json({
          response: null, provider: null,
          error: 'All providers failed: ' + (lastErr && lastErr.message),
          suggestApiKey: true,
          hint: 'Add GROQ_API_KEY (free at console.groq.com/keys) to backend/.env, or start Ollama.'
        });
      }
    }

    try { if (result && result.response) require('./lib/aura').recordAnswer(message, result.response); } catch (_) {}
    res.json({ ...result, fallbackUsed: result.fallbackUsed || false });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { provider });
  }
});

// GET /llm/providers — list available providers and their status
router.get('/llm/providers', async (req, res) => {
  const providers = [];

  // Check Ollama
  try {
    const r = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
    const models = (r.data.models || []).map(m => m.name);
    providers.push({ name: 'ollama', status: 'available', models, free: true, local: true });
  } catch {
    providers.push({ name: 'ollama', status: 'offline', models: [], free: true, local: true });
  }

  providers.push({ name: 'gemini', status: process.env.GEMINI_API_KEY ? 'configured' : 'needs_key', free: true, local: false, models: ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro'] });
  providers.push({ name: 'groq', status: process.env.GROQ_API_KEY ? 'configured' : 'needs_key', free: false, local: false, models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'] });
  providers.push({ name: 'claude', status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'needs_key', free: false, local: false, models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'] });
  providers.push({ name: 'grok', status: process.env.GROK_API_KEY ? 'configured' : 'needs_key', free: false, local: false, models: ['grok-2-latest'] });

  res.json({ providers, default: 'auto', autoChain: ['ollama', 'gemini'] });
});

// ─────────────────────────────────────────────────────────────
// FILE UPLOAD + AGENT CONTEXT SYSTEM
// Drop a PDF/doc/txt — agents read it and use it as reference
// ─────────────────────────────────────────────────────────────
const fileHandler = require('./file-handler');

// POST /files/upload — accept file, extract text, return fileId
router.post('/files/upload', fileHandler.upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send file as multipart/form-data with field name "file".' });

  try {
    const text = await fileHandler.extractText(req.file.path, req.file.originalname);
    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const textPath = path.join(fileHandler.UPLOAD_DIR, `${fileId}.txt`);
    fs.writeFileSync(textPath, text, 'utf8');

    const meta = {
      fileId,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      charCount: text.length,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      preview: text.slice(0, 500),
      diskPath: req.file.path,
      textPath
    };
    fileHandler.registerFile(fileId, meta);
    broadcastEvent('file:uploaded', { fileId, name: req.file.originalname, chars: text.length });

    res.json({ fileId, ...meta, message: 'File uploaded and text extracted. Use fileId to query agents.' });
  } catch (e) {
    fail(res, 500, 'internal_error', `Failed to extract text: ${e.message}`);
  }
});

// Multer error handler
router.use('/files/upload', (err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

// GET /files — list all uploaded files
router.get('/files', (req, res) => {
  const files = fileHandler.listFiles().map(f => ({
    fileId: f.fileId, originalName: f.originalName,
    charCount: f.charCount, wordCount: f.wordCount,
    uploadedAt: f.uploadedAt, preview: f.preview
  }));
  res.json({ files, total: files.length });
});

// GET /files/:fileId — get file metadata + preview
router.get('/files/:fileId', (req, res) => {
  const meta = fileHandler.getFile(req.params.fileId);
  if (!meta) return res.status(404).json({ error: 'File not found' });
  res.json(meta);
});

// DELETE /files/:fileId
router.delete('/files/:fileId', (req, res) => {
  const deleted = fileHandler.deleteFile(req.params.fileId);
  if (!deleted) return res.status(404).json({ error: 'File not found' });
  res.json({ deleted: true, fileId: req.params.fileId });
});

// POST /files/:fileId/ask — ask any agent a question about the file
// body: { question, agent: 'shaddai'|'nexus'|'zerox'|etc, model? }
router.post('/files/:fileId/ask', async (req, res) => {
  const meta = fileHandler.getFile(req.params.fileId);
  if (!meta) return res.status(404).json({ error: 'File not found' });

  const { question, agent = 'shaddai', model } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  // Load full text, truncate to 8000 chars to fit context window
  let fileText = '';
  try { fileText = fs.readFileSync(meta.textPath, 'utf8').slice(0, 8000); } catch {}

  const agentPrompts = {
    shaddai: 'You are SHADDAI, strategic orchestrator. Analyze this document from a high-level strategic perspective.',
    nexus:   'You are NEXUS, technical architect. Analyze this document for technical gaps, architecture, and implementation details.',
    zerox:   'You are ZEROX, revenue strategist. Analyze this document for business model, revenue opportunities, and pricing insights.',
    oracle:  'You are ORACLE, research analyst. Analyze this document and surface key insights, trends, and data points.',
    turtle:  'You are TURTLE, UX/design expert. Analyze this document for user experience, design, and visual communication opportunities.',
    quill:   'You are QUILL, master writer. Analyze this document and help craft clear, compelling summaries and content.',
    pikadon: 'You are PIKADON, security guardian. Analyze this document for security risks, compliance issues, and vulnerabilities.'
  };

  const systemPrompt = agentPrompts[agent.toLowerCase()] || agentPrompts.shaddai;
  const useModel = model || DEFAULT_OLLAMA_MODEL;

  try {
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: useModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `DOCUMENT: "${meta.originalName}"\n\n${fileText}\n\n---\nQUESTION: ${question}` }
      ],
      stream: false
    }, { timeout: 120000 });

    const response = r.data.message?.content || 'No response';
    broadcastEvent('file:analyzed', { fileId: meta.fileId, agent: agent.toUpperCase(), question: question.slice(0, 80) });
    res.json({ response, agent: agent.toUpperCase(), fileId: meta.fileId, fileName: meta.originalName, model: useModel });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /files/:fileId/council — ALL 7 agents analyze the file simultaneously
// Returns a combined response from each agent's perspective
router.post('/files/:fileId/council', async (req, res) => {
  const meta = fileHandler.getFile(req.params.fileId);
  if (!meta) return res.status(404).json({ error: 'File not found' });

  const { question = 'What are your expert observations about this document?', model } = req.body;
  let fileText = '';
  try { fileText = fs.readFileSync(meta.textPath, 'utf8').slice(0, 4000); } catch {} // shorter per agent to stay in budget

  const agents = [
    { key: 'shaddai', emoji: '⚡', prompt: 'Strategic direction and big-picture decisions' },
    { key: 'nexus',   emoji: '🕸', prompt: 'Technical architecture and implementation details' },
    { key: 'zerox',   emoji: '💰', prompt: 'Revenue model and business opportunities' },
    { key: 'oracle',  emoji: '🔮', prompt: 'Research insights and data patterns' },
    { key: 'quill',   emoji: '✍️', prompt: 'Communication, writing, and clarity improvements' },
    { key: 'pikadon', emoji: '🛡', prompt: 'Security risks and compliance concerns' }
  ];

  broadcastEvent('file:council:start', { fileId: meta.fileId, fileName: meta.originalName, question: question.slice(0, 100) });

  // Run all agents in parallel
  const results = await Promise.allSettled(agents.map(async (agent) => {
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: model || DEFAULT_OLLAMA_MODEL,
      messages: [
        { role: 'system', content: `You are ${agent.key.toUpperCase()} ${agent.emoji}. Focus on: ${agent.prompt}. Be concise — 3 sentences max.` },
        { role: 'user', content: `FILE: "${meta.originalName}"\n\n${fileText}\n\nQUESTION: ${question}` }
      ],
      stream: false
    }, { timeout: 90000 });
    return { agent: agent.key.toUpperCase(), emoji: agent.emoji, response: r.data.message?.content || '' };
  }));

  const council = results.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { agent: agents[i].key.toUpperCase(), emoji: agents[i].emoji, response: `[Unavailable: ${r.reason?.message}]` }
  );

  broadcastEvent('file:council:complete', { fileId: meta.fileId, agentCount: council.length });
  res.json({ fileId: meta.fileId, fileName: meta.originalName, question, council });
});

// ─────────────────────────────────────────────────────────────
// NANO BANANA IMAGE GENERATION (AceDataCloud)
// POST /image/generate  — text-to-image
// POST /image/edit      — edit existing image
// GET  /image/agent/:name — get or generate agent avatar
// POST /image/agent/:name — force regenerate agent avatar
// ─────────────────────────────────────────────────────────────

const NANO_BANANA_URL  = 'https://api.acedata.cloud/nano-banana/images';
const NANO_BANANA_POLL = 'https://api.acedata.cloud/nano-banana/tasks';
const AGENT_IMAGES_DIR = path.join(DATA_DIR, 'agent-images');
ensureDataDir(); // reuse existing helper — DATA_DIR is already created
try { require('fs').mkdirSync(AGENT_IMAGES_DIR, { recursive: true }); } catch(_) {}

// Pre-crafted TURTLE-designed prompts for each agent (holographic, cinematic, dark)
const AGENT_IMAGE_PROMPTS = {
  SHADDAI: 'Futuristic holographic AI commander, gold-and-white energy aura, dark void background, floating geometric crown, dramatic cinematic lighting, ultra-detailed 3D render, neon gold glow, cosmic scale, god-like presence',
  ZEROX:   'Sleek AI wealth oracle, cyan-blue holographic suit, floating digital currency symbols, dark background, neon cyan light trails, hyper-realistic 3D render, futuristic finance aesthetic, cold sophisticated glow',
  ORACLE:  'Mystical AI seer, deep purple energy, glowing crystal orbs floating around silhouette, dark cosmic background, aurora-like purple light beams, omniscient eyes glowing violet, cinematic 3D render, ancient-futuristic fusion',
  NEXUS:   'Technical AI architect, emerald green circuit patterns embedded in dark suit, holographic blueprints floating around figure, dark background, matrix-like green data streams, precision and clarity, 3D render, cyber-architect aesthetic',
  TURTLE:  'Creative AI artist, warm orange holographic glow, paintbrush made of light, swirling colorful energy trails, dark studio background, renaissance-meets-cyberpunk aesthetic, charismatic pose, 3D render, artistic radiance',
  QUILL:   'Eloquent AI writer, amber-gold light forming text ribbons in the air, quill of pure light energy, dark background, literary elegance, glowing manuscript particles, distinguished and refined, 3D render, amber atmospheric lighting',
  PIKADON: 'Guardian AI sentinel, crimson-red force field emanating from armored form, dark background, shield symbols in red neon, zero-compromise defensive stance, battle-ready cybersecurity guardian, intense red glow, 3D render'
};

async function nanoBananaRequest(body, apiKey) {
  const key = apiKey || process.env.ACEDATACLOUD_API_TOKEN || process.env.NANO_BANANA_KEY || '';
  if (!key) throw new Error('ACEDATACLOUD_API_TOKEN not set. Add it to .env');
  const r = await axios.post(NANO_BANANA_URL, body, {
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 60000
  });
  return r.data;
}

async function pollTask(taskId, apiKey, maxWait = 120000) {
  const key = apiKey || process.env.ACEDATACLOUD_API_TOKEN || '';
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = await axios.post(NANO_BANANA_POLL, { id: taskId }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      const d = r.data;
      if (d.status === 'completed' || d.image_url || d.url) return d;
      if (d.status === 'failed') throw new Error(`Task ${taskId} failed: ${d.error || 'unknown'}`);
    } catch(e) { if (e.message.includes('failed')) throw e; }
  }
  throw new Error('Image generation timed out after 2 minutes');
}

// POST /api/image/generate-premium
// NOTE: The canonical POST /api/image/generate route is defined earlier in this
// file (keyless Pollinations default + optional NanoBanana/DALL-E). This route
// was a duplicate that shadowed nothing now — renamed so it no longer collides.
// It is the dedicated premium NanoBanana/AceData endpoint.
router.post('/image/generate-premium', async (req, res) => {
  const { prompt, model = 'nano-banana-2', aspect_ratio = '1:1', resolution = '1K', callback_url, apiKey } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  if (await enforceCredits(req, res, 'image_generate')) return; // charge before generating
  try {
    const body = { action: 'generate', prompt, model, aspect_ratio, resolution };
    if (callback_url) body.callback_url = callback_url;
    const result = await nanoBananaRequest(body, apiKey);
    // If async, poll for result
    if (result.id && !result.image_url && !result.url) {
      const final = await pollTask(result.id, apiKey);
      return res.json({ success: true, image_url: final.image_url || final.url, task_id: result.id, prompt, model });
    }
    res.json({ success: true, image_url: result.image_url || result.url, prompt, model });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/image/edit
router.post('/image/edit', async (req, res) => {
  const { prompt, image_urls, model = 'nano-banana-2', aspect_ratio = '1:1', apiKey } = req.body;
  if (!prompt || !image_urls?.length) return res.status(400).json({ error: 'prompt and image_urls required' });
  try {
    const result = await nanoBananaRequest({ action: 'edit', prompt, image_urls, model, aspect_ratio }, apiKey);
    if (result.id && !result.image_url && !result.url) {
      const final = await pollTask(result.id, apiKey);
      return res.json({ success: true, image_url: final.image_url || final.url, task_id: result.id });
    }
    res.json({ success: true, image_url: result.image_url || result.url });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/image/agent/:name — return cached agent avatar or generate one
router.get('/image/agent/:name', async (req, res) => {
  const name = req.params.name.toUpperCase();
  const imgFile = path.join(AGENT_IMAGES_DIR, `${name}.json`);
  try {
    const cached = JSON.parse(require('fs').readFileSync(imgFile, 'utf8'));
    return res.json({ success: true, cached: true, ...cached });
  } catch(_) {
    res.json({ success: false, cached: false, name, prompt: AGENT_IMAGE_PROMPTS[name] || null, message: 'No image yet. POST to /image/agent/:name to generate.' });
  }
});

// POST /api/image/agent/:name — generate (or regenerate) agent avatar
router.post('/image/agent/:name', async (req, res) => {
  const name = req.params.name.toUpperCase();
  const { model = 'nano-banana-2', apiKey, customPrompt } = req.body;
  const prompt = customPrompt || AGENT_IMAGE_PROMPTS[name];
  if (!prompt) return res.status(400).json({ error: `No prompt for agent ${name}. Pass customPrompt.` });
  try {
    const result = await nanoBananaRequest({ action: 'generate', prompt, model, aspect_ratio: '1:1', resolution: '1K' }, apiKey);
    let imageUrl;
    if (result.id && !result.image_url && !result.url) {
      const final = await pollTask(result.id, apiKey);
      imageUrl = final.image_url || final.url;
    } else {
      imageUrl = result.image_url || result.url;
    }
    const data = { name, image_url: imageUrl, prompt, model, generatedAt: new Date().toISOString() };
    require('fs').writeFileSync(path.join(AGENT_IMAGES_DIR, `${name}.json`), JSON.stringify(data));
    broadcastEvent('agent:image:generated', { name, image_url: imageUrl });
    res.json({ success: true, ...data });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message, { name, prompt });
  }
});

// GET /api/image/agents/all — status of all 7 agent images
router.get('/image/agents/all', (req, res) => {
  const fs = require('fs');
  const agents = Object.keys(AGENT_IMAGE_PROMPTS);
  const result = agents.map(name => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(AGENT_IMAGES_DIR, `${name}.json`), 'utf8'));
      return { name, hasImage: true, ...data };
    } catch(_) {
      return { name, hasImage: false, prompt: AGENT_IMAGE_PROMPTS[name] };
    }
  });
  res.json({ agents: result, total: agents.length, generated: result.filter(a => a.hasImage).length });
});

// ═════════════════════════════════════════════════════════════════
// API CONNECTOR SYSTEM — Per-agent API connections + smart task router
// ═════════════════════════════════════════════════════════════════

const AVAILABLE_APIS = [
  { id: 'dexscreener',  name: 'DexScreener',      category: 'crypto',   icon: '📊', description: 'Real-time DEX prices, trending tokens, pair data',     free: true  },
  { id: 'coingecko',   name: 'CoinGecko',         category: 'crypto',   icon: '🦎', description: 'Market caps, price history, global crypto stats',      free: true  },
  { id: 'coinlore',    name: 'CoinLore',           category: 'crypto',   icon: '💰', description: 'Coin prices and market statistics',                    free: true  },
  { id: 'files',       name: 'File Library',       category: 'storage',  icon: '📁', description: 'Read uploaded PDFs, docs, text files',                 free: true  },
  { id: 'news',        name: 'Crypto News',        category: 'info',     icon: '📰', description: 'Latest crypto and AI news headlines',                  free: true  },
  { id: 'ollama',      name: 'Ollama (Local AI)',  category: 'ai',       icon: '🖥', description: 'Your local AI models — phi, llama3, gemma',            free: true  },
  { id: 'gemini',      name: 'Gemini',             category: 'ai',       icon: '✨', description: 'Google Gemini Flash / Pro',                            free: false, envKey: 'GEMINI_API_KEY'         },
  { id: 'groq',        name: 'Groq (70B)',         category: 'ai',       icon: '⚡', description: 'Ultra-fast 70B model inference',                       free: false, envKey: 'GROQ_API_KEY'           },
  { id: 'openrouter',  name: 'OpenRouter',         category: 'ai',       icon: '🛰', description: 'Multi-model fallback (free + paid)',                   free: false, envKey: 'OPENROUTER_API_KEY'     },
  { id: 'claude',      name: 'Claude API',         category: 'ai',       icon: '🤖', description: 'Claude Haiku, Sonnet, Opus',                           free: false, envKey: 'ANTHROPIC_API_KEY'      },
  { id: 'suno',        name: 'Suno Music',         category: 'creative', icon: '🎵', description: 'Generate music tracks and write song lyrics',          free: false, envKey: 'SUNO_API_KEY'           },
  { id: 'twitter_x',  name: 'X / Twitter',        category: 'social',   icon: '𝕏',  description: 'Stage posts, threads, and optimal timing',             free: false, envKey: 'X_API_KEY'              },
  { id: 'elevenlabs',  name: 'ElevenLabs TTS',     category: 'creative', icon: '🎙', description: 'Text-to-speech with voice cloning',                    free: false, envKey: 'ELEVENLABS_API_KEY'     },
  { id: 'nano_banana', name: 'Nano Banana',        category: 'creative', icon: '🍌', description: 'AI image generation via AceDataCloud',                 free: false, envKey: 'ACEDATACLOUD_API_TOKEN' },
  { id: 'openai',      name: 'OpenAI / GPT-4',    category: 'ai',       icon: '🧠', description: 'GPT-4o and GPT-4 Turbo',                               free: false, envKey: 'OPENAI_API_KEY'         },
];

const AGENT_APIS_FILE = path.join(DATA_DIR, 'agent_api_connections.json');
let _agentAPIs = loadJSON(AGENT_APIS_FILE, {});
function saveAgentAPIs() { saveJSON(AGENT_APIS_FILE, _agentAPIs); }

const DEFAULT_AGENT_APIS = {
  shaddai: ['ollama', 'dexscreener', 'files'],
  zerox:   ['ollama', 'dexscreener', 'coingecko', 'coinlore'],
  oracle:  ['ollama', 'dexscreener', 'coingecko', 'news', 'files'],
  nexus:   ['ollama', 'files'],
  turtle:  ['ollama', 'nano_banana'],
  quill:   ['ollama', 'files', 'twitter_x'],
  pikadon: ['ollama', 'files'],
};

function getAgentAPIs(agentName) {
  const key = agentName.toLowerCase();
  return _agentAPIs[key] || DEFAULT_AGENT_APIS[key] || ['ollama'];
}

// GET /api/apis/available
router.get('/apis/available', (req, res) => {
  const apis = AVAILABLE_APIS.map(api => ({
    ...api,
    status: api.free ? 'available' : (api.envKey && process.env[api.envKey] ? 'configured' : 'needs_key'),
    configured: api.free || !!(api.envKey && process.env[api.envKey])
  }));
  res.json({ apis, total: apis.length });
});

// GET /api/agent/:name/apis
router.get('/agent/:name/apis', (req, res) => {
  const key = req.params.name.toLowerCase();
  const connected = getAgentAPIs(key);
  const apis = AVAILABLE_APIS.map(api => ({
    ...api,
    connected: connected.includes(api.id),
    configured: api.free || !!(api.envKey && process.env[api.envKey])
  }));
  res.json({ agent: key, connected, apis });
});

// POST /api/agent/:name/apis
router.post('/agent/:name/apis', (req, res) => {
  const key = req.params.name.toLowerCase();
  const { connect, disconnect, set } = req.body;

  if (set && Array.isArray(set)) {
    _agentAPIs[key] = set;
  } else {
    let current = [...getAgentAPIs(key)];
    if (connect) {
      const ids = Array.isArray(connect) ? connect : [connect];
      ids.forEach(id => { if (!current.includes(id)) current.push(id); });
    }
    if (disconnect) {
      const ids = Array.isArray(disconnect) ? disconnect : [disconnect];
      current = current.filter(id => !ids.includes(id));
    }
    _agentAPIs[key] = current;
  }
  saveAgentAPIs();
  broadcastEvent('agent:apis:updated', { agent: key, apis: _agentAPIs[key] });
  res.json({ agent: key, connected: _agentAPIs[key], success: true });
});

// ── Live data fetchers ────────────────────────────────────────
function extractCryptoTokens(text) {
  const knownCoins = ['bitcoin','btc','ethereum','eth','solana','sol','bnb','xrp','ada','avax','doge','shib','matic','dot','link','uni','usdc','usdt','pepe','bonk'];
  const lower = text.toLowerCase();
  const found = knownCoins.filter(c => lower.includes(c));
  const tickers = [...(text.matchAll(/\$([A-Z]{2,8})/g))].map(m => m[1].toLowerCase());
  return [...new Set([...found, ...tickers])].slice(0, 5);
}

async function fetchAPIData(apiId, taskText) {
  try {
    switch (apiId) {
      case 'dexscreener': {
        const tokens = extractCryptoTokens(taskText);
        if (tokens.length === 0) {
          const r = await axios.get('https://api.dexscreener.com/latest/dex/tokens/trending', { timeout: 8000 });
          const pairs = (r.data?.pairs || []).slice(0, 5);
          if (!pairs.length) return null;
          return 'TRENDING DEX PAIRS:\n' + pairs.map(p =>
            `${p.baseToken?.symbol}/${p.quoteToken?.symbol}: $${parseFloat(p.priceUsd || 0).toFixed(6)} | 24h: ${p.priceChange?.h24 || 0}% | Vol: $${Math.round(p.volume?.h24 || 0).toLocaleString()}`
          ).join('\n');
        }
        const r = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${tokens[0]}`, { timeout: 8000 });
        const pairs = (r.data?.pairs || []).slice(0, 4);
        if (!pairs.length) return null;
        return `DEXSCREENER — "${tokens[0]}":\n` + pairs.map(p =>
          `${p.baseToken?.name} (${p.baseToken?.symbol}): $${parseFloat(p.priceUsd || 0).toFixed(6)} | Chain: ${p.chainId} | 24h: ${p.priceChange?.h24 || 0}% | Liq: $${Math.round(p.liquidity?.usd || 0).toLocaleString()}`
        ).join('\n');
      }
      case 'coingecko': {
        const tokens = extractCryptoTokens(taskText);
        const ids = tokens.length ? tokens.join(',') : 'bitcoin,ethereum,solana';
        const r = await axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=5&page=1`, { timeout: 8000 });
        if (!r.data?.length) return null;
        return 'COINGECKO MARKET DATA:\n' + r.data.map(c =>
          `${c.name} (${c.symbol?.toUpperCase()}): $${c.current_price?.toLocaleString()} | MCap: $${((c.market_cap||0)/1e9).toFixed(2)}B | 24h: ${(c.price_change_percentage_24h||0).toFixed(2)}%`
        ).join('\n');
      }
      case 'coinlore': {
        const r = await axios.get('https://api.coinlore.net/api/tickers/?start=0&limit=10', { timeout: 8000 });
        if (!r.data?.data?.length) return null;
        return 'COINLORE TOP COINS:\n' + r.data.data.slice(0, 5).map(c =>
          `${c.name} (${c.symbol}): $${parseFloat(c.price_usd).toFixed(4)} | 24h: ${c.percent_change_24h}% | MCap: $${Math.round((c.market_cap_usd||0)/1e9)}B`
        ).join('\n');
      }
      case 'news': {
        // Free RSS approach — no key needed
        try {
          const r = await axios.get('https://api.coindesk.com/v1/bpi/currentprice.json', { timeout: 5000 });
          const btcUsd = r.data?.bpi?.USD?.rate || 'unavailable';
          return `CRYPTO SNAPSHOT — BTC: $${btcUsd} (CoinDesk). No news key configured — add CRYPTOPANIC_KEY to .env for full headlines.`;
        } catch { return null; }
      }
      case 'files': {
        const text = taskText;
        const match = text.match(/\b([a-f0-9]{12,})\b/i) || text.match(/file(?:[\s:]+)["']?([a-zA-Z0-9_\-\.]{4,})["']?/i);
        const ref = match ? match[1] : null;
        if (!ref) return null;
        const meta = fileHandler.getFile(ref);
        if (!meta) return null;
        try {
          const content = fs.readFileSync(meta.textPath, 'utf8');
          return `FILE: ${meta.originalName} (${meta.wordCount} words)\n${content.slice(0, 4000)}${content.length > 4000 ? '\n...[file continues, showing first 4000 chars]' : ''}`;
        } catch { return null; }
      }
      default: return null;
    }
  } catch { return null; }
}

// POST /api/agent/:name/task — run a task through connected APIs then LLM
router.post('/agent/:name/task', async (req, res) => {
  const agentKey = req.params.name.toLowerCase();
  const { task, model, fileId, sessionApis } = req.body;
  if (!task) return res.status(400).json({ error: 'task is required' });

  const connectedAPIs = sessionApis || getAgentAPIs(agentKey);
  const startTime = Date.now();

  // Fetch live data from all non-LLM connected APIs in parallel
  const dataAPIs = connectedAPIs.filter(id => !['ollama','claude','gemini','groq','openai','suno','twitter_x','elevenlabs','nano_banana'].includes(id));
  const dataResults = await Promise.allSettled(
    dataAPIs.map(id => fetchAPIData(id, task).then(data => ({ id, data })))
  );

  const contextParts = dataResults
    .filter(r => r.status === 'fulfilled' && r.value.data)
    .map(r => `[${r.value.id.toUpperCase()} — LIVE DATA]\n${r.value.data}`);

  // Direct fileId injection
  if (fileId) {
    const meta = fileHandler.getFile(fileId);
    if (meta) {
      try {
        const content = fs.readFileSync(meta.textPath, 'utf8');
        contextParts.unshift(`[FILE: ${meta.originalName}]\n${content.slice(0, 5000)}`);
      } catch {}
    }
  }

  const contextBlock = contextParts.length > 0
    ? `\n\n=== LIVE DATA FROM YOUR CONNECTED APIs ===\n${contextParts.join('\n\n')}\n=== END LIVE DATA ===\n\nUse the real-time data above in your response.`
    : '';

  const enrichedTask = `${task}${contextBlock}`;

  // Determine LLM: AI APIs take priority if connected + configured
  const AGENT_PORTS = { shaddai:8000, zerox:8001, oracle:8002, nexus:8003, turtle:8004, quill:8005, pikadon:8008 };
  const port = AGENT_PORTS[agentKey];
  let response = '', usedModel = 'unknown';

  if (connectedAPIs.includes('claude') && process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (() => { try { return require('@anthropic-ai/sdk'); } catch { return null; } })();
      if (Anthropic) {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
          model: process.env.AGENT_CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          messages: [{ role: 'user', content: enrichedTask }]
        });
        response = msg.content[0]?.text || '';
        usedModel = 'claude-haiku';
      }
    } catch {}
  }

  if (!response && connectedAPIs.includes('gemini') && process.env.GEMINI_API_KEY) {
    try { response = await callGemini(enrichedTask, process.env.GEMINI_API_KEY); usedModel = 'gemini'; } catch {}
  }

  if (!response && port) {
    try {
      const r = await axios.post(`http://localhost:${port}/chat`, { message: enrichedTask }, { timeout: 120000 });
      response = r.data?.response || r.data?.message || '';
      usedModel = r.data?.model || 'agent-server';
    } catch {}
  }

  if (!response) {
    try {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: model || 'phi:latest',
        messages: [{ role: 'user', content: enrichedTask }],
        stream: false
      }, { timeout: 120000 });
      response = r.data.message?.content || '';
      usedModel = model || 'phi:latest';
    } catch (e) {
      return fail(res, 500, 'internal_error', `All backends failed: ${e.message}`, { apisUsed: connectedAPIs });
    }
  }

  const duration = Date.now() - startTime;
  const dataSourcesHit = dataResults.filter(r => r.status === 'fulfilled' && r.value.data).map(r => r.value.id);

  // Persist task receipt
  const RECEIPTS_FILE = path.join(DATA_DIR, 'task_receipts.json');
  const receipts = loadJSON(RECEIPTS_FILE, []);
  const receipt = {
    id: `task_${Date.now()}`,
    // SECURITY: stamp the owner so reads can be scoped per-user. Verified uid when
    // authenticated, else the caller's stable client id. Never global.
    owner: (req.userId && req.userId !== 'local') ? req.userId : (String(req.headers['x-user-id'] || (req.body && req.body.owner) || '').trim() || 'anon'),
    agent: agentKey.toUpperCase(),
    task: task.slice(0, 300),
    response: response.slice(0, 8000),
    model: usedModel,
    apisConnected: connectedAPIs,
    dataSourcesHit,
    duration,
    timestamp: new Date().toISOString()
  };
  receipts.unshift(receipt);
  if (receipts.length > 500) receipts.splice(500);
  saveJSON(RECEIPTS_FILE, receipts);

  broadcastEvent('task:completed', { agent: agentKey, duration, model: usedModel, dataSourcesHit });
  res.json({ ...receipt, success: true });
});

// GET /api/tasks/receipts — task history, SCOPED PER USER.
// SECURITY: only ever returns the caller's OWN receipts. Legacy receipts with no
// owner are never returned (they predate per-user scoping and must not leak).
router.get('/tasks/receipts', (req, res) => {
  const receipts = loadJSON(path.join(DATA_DIR, 'task_receipts.json'), []);
  const limit = parseInt(req.query.limit) || 50;
  const agent = req.query.agent?.toLowerCase();
  const owner = (req.userId && req.userId !== 'local') ? req.userId
    : (String(req.headers['x-user-id'] || req.query.owner || '').trim() || 'anon');
  let mine = receipts.filter(r => r.owner && r.owner === owner);
  if (agent) mine = mine.filter(r => r.agent?.toLowerCase() === agent);
  res.json({ receipts: mine.slice(0, limit), total: mine.length, count: mine.length });
});

// POST /api/tasks/create — create a background task (Content Studio Task Queue mode)
const TASKS_FILE = path.join(DATA_DIR, 'active_tasks.json');
let _activeTasks = loadJSON(TASKS_FILE, []);
// AGENT_PORTS already declared at top of file

router.post('/tasks/create', async (req, res) => {
  const { task_type, agent, payload, priority = 'normal', callback } = req.body;
  if (!agent) return res.status(400).json({ error: 'agent required' });
  const task_id = `task_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const task = { task_id, task_type: task_type || 'generic', agent, payload: payload || {}, priority, callback, status: 'queued', created: new Date().toISOString() };
  _activeTasks.push(task);
  saveJSON(TASKS_FILE, _activeTasks.slice(-200));
  // Execute in background (non-blocking)
  setImmediate(async () => {
    const port = AGENT_PORTS[agent.toLowerCase()] || 8000;
    const prompt = payload?.prompt || payload?.topic || payload?.theme || payload?.question || JSON.stringify(payload).slice(0,200);
    try {
      task.status = 'running'; task.started = new Date().toISOString();
      const axios_mod = require('axios');
      const resp = await axios_mod.post(`http://localhost:${port}/chat`, { message: prompt, model: 'tinyllama' }, { timeout: 90000 });
      task.status = 'done'; task.result = resp.data?.response || ''; task.completed = new Date().toISOString();
      // Save to receipts
      const receipts = loadJSON(path.join(DATA_DIR, 'task_receipts.json'), []);
      receipts.unshift({ task_id, owner: (req.userId && req.userId !== 'local') ? req.userId : (String(req.headers['x-user-id'] || (req.body && req.body.owner) || '').trim() || 'anon'), agent, task: prompt.slice(0,100), result: task.result.slice(0,500), timestamp: task.completed, model: resp.data?.model });
      saveJSON(path.join(DATA_DIR, 'task_receipts.json'), receipts.slice(0,500));
    } catch(e) {
      task.status = 'failed'; task.error = e.message; task.completed = new Date().toISOString();
    }
    saveJSON(TASKS_FILE, _activeTasks.slice(-200));
  });
  res.json({ success: true, task_id, status: 'queued', message: `Task queued for ${agent.toUpperCase()} agent` });
});

// GET /api/tasks/:id/status
router.get('/tasks/:id/status', (req, res) => {
  const task = _activeTasks.find(t => t.task_id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task_id: task.task_id, status: task.status, result: task.result, error: task.error, completed: task.completed });
});

// GET /api/tasks/active
router.get('/tasks/active', (req, res) => {
  const active = _activeTasks.filter(t => t.status === 'queued' || t.status === 'running');
  res.json({ tasks: active, count: active.length });
});

// ═════════════════════════════════════════════════════════════════
// CUSTOM AGENT CREATOR — upload .md, set avatar, name, position
// ═════════════════════════════════════════════════════════════════

const CUSTOM_AGENTS_FILE = path.join(DATA_DIR, 'custom_agents.json');
let _customAgents = loadJSON(CUSTOM_AGENTS_FILE, []);
function saveCustomAgents() { saveJSON(CUSTOM_AGENTS_FILE, _customAgents); }

// GET /api/agents/custom
router.get('/agents/custom', (req, res) => {
  res.json({ agents: _customAgents, total: _customAgents.length });
});

// POST /api/agents/custom
router.post('/agents/custom', (req, res) => {
  const { name, emoji, role, color, systemPrompt, avatarUrl, position } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const agent = {
    id,
    name: name.toUpperCase().replace(/\s+/g, '_').slice(0, 20),
    emoji: emoji || '🤖',
    role: role || 'Custom Agent',
    color: color || '#888888',
    systemPrompt: systemPrompt || `You are ${name}, a specialized AI agent. Be helpful, precise, and always sign your responses as [${name.toUpperCase()}].`,
    avatarUrl: avatarUrl || null,
    position: position || { col: 1, row: 1 },
    createdAt: new Date().toISOString()
  };

  _customAgents.push(agent);
  saveCustomAgents();
  broadcastEvent('agent:custom:created', { id, name: agent.name });
  res.json({ success: true, agent });
});

// PUT /api/agents/custom/:id
router.put('/agents/custom/:id', (req, res) => {
  const idx = _customAgents.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Agent not found' });
  _customAgents[idx] = { ..._customAgents[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  saveCustomAgents();
  res.json({ success: true, agent: _customAgents[idx] });
});

// DELETE /api/agents/custom/:id
router.delete('/agents/custom/:id', (req, res) => {
  const before = _customAgents.length;
  _customAgents = _customAgents.filter(a => a.id !== req.params.id);
  saveCustomAgents();
  res.json({ success: true, removed: before - _customAgents.length });
});

// POST /api/agents/custom/:id/chat — chat with a custom agent (lookup by id OR name)
router.post('/agents/custom/:id/chat', async (req, res) => {
  const param = req.params.id;
  const agent = _customAgents.find(a => a.id === param || a.name === param.toUpperCase());
  if (!agent) return res.status(404).json({ error: 'Custom agent not found' });
  const { message, model, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });
  try {
    let bestModel = model;
    if (!bestModel) {
      try {
        const tags = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
        const models = (tags.data.models || []).map(m => m.name);
        bestModel = models.find(m => m.includes('qwen') || m.includes('llama') || m.includes('phi')) || models[0] || DEFAULT_OLLAMA_MODEL;
      } catch { bestModel = DEFAULT_OLLAMA_MODEL; }
    }
    const agentName = agent.name;
    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...history.slice(-6).map(h => ({ role: h.sender === agentName ? 'assistant' : 'user', content: h.text })),
      { role: 'user', content: message }
    ];
    const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: bestModel, messages, stream: false
    }, { timeout: OLLAMA_TIMEOUT_MS });
    res.json({ response: r.data.message?.content || r.data?.response || '', agent: agentName, model: bestModel });
  } catch (e) {
    res.status(502).json({ error: 'Agent offline: ' + e.message });
  }
});

// ═════════════════════════════════════════════════════════════════
// AGENT INTENT ROUTING — skill-based response formatting
// POST /api/agents/route
// Detects intent from message → picks system prompt → calls Ollama/Groq
// Returns { response, responseType, intent, agentName, model }
// ═════════════════════════════════════════════════════════════════

const INTENT_KEYWORDS = {
  'market_analysis': ['price','chart','candle','bullish','bearish','support','resistance','trend','momentum','rsi','macd','volume','market cap','token','crypto','solana','bitcoin','eth','sol','analyze','technical','ta ','signal','breakout','dump','pump','ath','oversold','overbought'],
  'code': ['code','function','script','build','implement','debug','fix bug','error','api','endpoint','component','javascript','python','rust','typescript','html','css','node','react','class','method','refactor','import','async','await','deploy','git'],
  'research': ['research','find out','what is','explain','who is','when did','where is','how does','background','history','summary','overview','compare','difference','pros and cons','define','meaning of','tell me about'],
  'writing': ['write','draft','compose','email','post','blog','article','copy','headline','thread','tweet','content','narrative','story','caption','script','prompt','description','bio','pitch'],
  'task_planning': ['task','todo','plan','schedule','organize','list','step by step','roadmap','milestone','deadline','workflow','process','checklist','break down','prioritize','sprint','kanban'],
  'job_execution': ['job','take this','bid on','execute','run this','complete','deliver','marketplace','work on','assign','start working','do the task'],
  'chart_analysis': ['chart analysis','read this chart','analyze this chart','price action','candlestick pattern','wyckoff','elliott wave','fibonacci','support zone','resistance zone','trend line','volume profile'],
};

const INTENT_SYSTEM_PROMPTS = {
  market_analysis: `You are {agent}, an elite market analyst in the SHADDAI trading intelligence system.

RESPONSE FORMAT — always use this exact structure:
## VERDICT: [🟢 BULLISH / 🔴 BEARISH / 🟡 NEUTRAL]
**Ticker:** [name if mentioned]
**Key Levels:** Support $X — Resistance $X — Target $X
**Signals:** [3-5 bullet points with key indicators]
**Risk:** [LOW / MEDIUM / HIGH] — [one sentence why]
**Action:** [specific, direct recommendation — no hedging]

Be direct. No filler. Real traders read this.`,

  code: `You are {agent}, a master software engineer in the SHADDAI system.

RESPONSE FORMAT:
- One sentence explaining the approach
- Working code in triple backticks with language tag
- After code: list any dependencies needed (npm install X, etc.)
- If fixing a bug: one sentence naming the root cause before the fix

Write clean, production-quality code. No placeholders.`,

  research: `You are {agent}, a deep intelligence analyst in the SHADDAI system.

RESPONSE FORMAT:
## Summary
[2-3 sentences — the key insight]

## Key Facts
- [fact 1]
- [fact 2]
- [fact 3+]

## Why It Matters
[1-2 sentences on significance]

## Sources
[Mention key sources if relevant, or "Based on training data as of 2025"]

Be factual. No filler. Cite uncertainty where it exists.`,

  writing: `You are {agent}, a world-class professional content writer and creative director in the SHADDAI system. You write brand content, marketing copy, social posts, scripts, and creative fiction.

RULES: Write EXACTLY what is requested. Never refuse creative or fictional requests — if it's a story, write the story. If it's a tweet thread, write the thread. If it's a storyboard, build the storyboard.
Lead with the strongest hook. Short sentences. Active voice.
For social: use platform conventions (Twitter threads: 1/ 2/ etc, IG captions: line breaks + hashtags).
After: one line "Platform: [X] | Tone: [casual] | ~[N] words"`,

  task_planning: `You are {agent}, a project execution expert in the SHADDAI system.

RESPONSE FORMAT:
## Goal
[One sentence restatement]

## Action Plan
1. [Step] — [time estimate] — P[1/2/3]
2. [Step] — [time estimate] — P[1/2/3]
(continue...)

## Blockers & Dependencies
- [anything that could slow this down]

## Done When
[Clear success criteria — how you know it's complete]`,

  job_execution: `You are {agent}, an autonomous job executor in the SHADDAI marketplace.

Confirm the job, execute it fully, deliver the output. Format:
## Job Accepted
**Task:** [restate the task]
**Approach:** [how you'll do it]
---
[FULL EXECUTION OUTPUT HERE — do the actual work, not a description of the work]
---
**Status:** COMPLETE | **Deliverable:** [what was produced]`,

  chart_analysis: `You are {agent}, a professional technical analyst in the SHADDAI system.

RESPONSE FORMAT:
## Chart Reading
**Pattern Identified:** [name the pattern]
**Trend:** [Uptrend / Downtrend / Sideways / Reversal forming]
**Key Zones:**
  - Support: [levels]
  - Resistance: [levels]
**Volume Confirmation:** [yes/no — what the volume says]
**Probability:** [setup quality 1-10 and why]
**Trade Setup:** Entry $X | Stop $X | Target $X | Risk/Reward X:1
**Invalidation:** [what price action would cancel this setup]`,

  default: `You are {agent}, a highly capable AI agent in the SHADDAI system.
Be direct, structured, and specific. No filler. Format clearly with headers and bullets where it helps. Answer the actual question asked.`,
};

const GROQ_API_KEY_ROUTE = process.env.GROQ_API_KEY || '';
const GROQ_MODEL_ROUTE = 'llama-3.3-70b-versatile';

async function callGroqRoute(systemPrompt, message, history = []) {
  // ── AURA forCall — token savings + cache on every call ───────────
  const _auraRoute = (() => { try { return require('./lib/aura'); } catch(_) { return null; } })();
  if (_auraRoute) {
    const _fc = _auraRoute.forCall({ prompt: message, system: systemPrompt, ownTools: [], selectedTools: [], history: Array.isArray(history) ? history.slice(-4) : [] });
    if (_fc.hit) { console.log(`[AURA] callGroqRoute hit — ~${_fc.saved.total} tokens saved`); return _fc.answer; }
    console.log(`[AURA] callGroqRoute miss — saved ${_fc.saved.total} tokens (compress=${_fc.saved.compress})`);
  }
  // ─────────────────────────────────────────────────────────────────
  if (!GROQ_API_KEY_ROUTE) throw new Error('no-groq-key');
  const msgs = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4),
    { role: 'user', content: message }
  ];
  const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: GROQ_MODEL_ROUTE, messages: msgs, max_tokens: 1500, temperature: 0.7
  }, { headers: { Authorization: `Bearer ${GROQ_API_KEY_ROUTE}` }, timeout: 30000 });
  const _out = r.data.choices[0]?.message?.content || '';
  if (_auraRoute && message && _out) { try { _auraRoute.recordAnswer(message, _out); } catch(_) {} }
  return _out;
}

function detectIntent(message) {
  const lower = message.toLowerCase();
  let best = 'default', bestScore = 0;
  for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
    const score = kws.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = intent; }
  }
  return best;
}

router.post('/agents/route', async (req, res) => {
  const { message, agentName = 'SHADDAI', history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const intent = detectIntent(message);
  const template = INTENT_SYSTEM_PROMPTS[intent] || INTENT_SYSTEM_PROMPTS.default;
  let systemPrompt = template.replace(/{agent}/g, agentName);

  // RAG grounding — inject the same kb_<agent> knowledge agent-engine recalls, so
  // every dashboard agent reply is grounded in the council's brain (not pure-LLM).
  // Wrapped + capped + fast (local TF-IDF ~<200ms); never breaks the response.
  let ragSources = [];
  try {
    const hits = ragIndex.searchUser('kb_' + String(agentName).toLowerCase(), message, 3) || [];
    if (hits.length) {
      systemPrompt += '\n\nGROUNDING — relevant knowledge from your training (use it, weave it in naturally, do not fabricate beyond it):\n' +
        hits.map(h => '• ' + (h.chunkText || '').slice(0, 600)).join('\n').slice(0, 1800);
      ragSources = hits.map(h => ({ title: h.docName || '', score: Number((h.score || 0).toFixed(3)) }));
    }
  } catch (_) {}

  let response = '', usedModel = '';

  // Try Groq first (fast ~2-3s, free tier, 70B model — no refusals for creative content)
  try {
    response = await callGroqRoute(systemPrompt, message, history);
    usedModel = 'groq:' + GROQ_MODEL_ROUTE;
  } catch {
    // Fallback to Ollama
    try {
      let bestModel = DEFAULT_OLLAMA_MODEL;
      try {
        const tags = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
        const models = (tags.data.models || []).map(m => m.name);
        bestModel = models.find(m => m.includes('llama') || m.includes('phi') || m.includes('qwen')) || models[0] || DEFAULT_OLLAMA_MODEL;
      } catch {}
      const msgs = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-4),
        { role: 'user', content: message }
      ];
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: bestModel, messages: msgs, stream: false
      }, { timeout: OLLAMA_TIMEOUT_MS });
      response = r.data.message?.content || r.data?.response || '';
      usedModel = 'ollama:' + bestModel;
    } catch (e) {
      return res.status(502).json({ error: 'All LLMs unavailable: ' + e.message });
    }
  }

  res.json({ response, responseType: intent, intent, agentName, model: usedModel, grounded: ragSources.length > 0, sources: ragSources });
});

// GET/POST /api/agents/layout — save and restore agent grid positions
router.get('/agents/layout', (req, res) => {
  res.json({ layout: loadJSON(path.join(DATA_DIR, 'agent_layout.json'), {}) });
});
router.post('/agents/layout', (req, res) => {
  const { layout } = req.body;
  if (!layout || typeof layout !== 'object') return res.status(400).json({ error: 'layout object required' });
  saveJSON(path.join(DATA_DIR, 'agent_layout.json'), layout);
  broadcastEvent('agents:layout:saved', { count: Object.keys(layout).length });
  res.json({ success: true, layout });
});

// ═════════════════════════════════════════════════════════════════
// BRAIN LEVEL SYSTEM — skill complexity gating
// ═════════════════════════════════════════════════════════════════

const MODEL_BRAIN_LEVEL = {
  'tinyllama': 1, 'tinyllama:latest': 1,
  'llama3.2:1b': 2, 'phi': 2, 'phi:latest': 2, 'llama3.2:3b': 2, 'mistral': 2,
  'gemma4': 3, 'gemma4:latest': 3, 'llama3.1:8b': 3, 'mixtral': 3,
  'claude-haiku-4-5-20251001': 3, 'claude-haiku': 3, 'groq-70b': 3,
  'claude-sonnet-4-6': 4, 'claude-opus-4-7': 4, 'gpt-4': 4, 'gpt-4o': 4, 'gemini-1.5-pro': 4,
};

const SKILL_BRAIN_LEVEL_MAP = {
  // Level 1
  basic: 1, greeting: 1, faq: 1,
  // Level 2
  writing: 2, research: 2, analysis: 2, summary: 2, email: 2,
  twitter: 2, content: 2, marketing: 2,
  // Level 3
  code: 3, security: 3, architecture: 3, trading: 3, strategy: 3,
  blockchain: 3, defi: 3, solana: 3, crypto: 3,
  // Level 4
  audit: 4, 'smart-contract': 4, 'zero-knowledge': 4, 'machine-learning': 4,
};

function getModelBrainLevel(modelName) {
  if (!modelName) return 2;
  const lower = modelName.toLowerCase();
  for (const [key, level] of Object.entries(MODEL_BRAIN_LEVEL)) {
    if (lower.includes(key.replace(':latest', ''))) return level;
  }
  return 2;
}

function getSkillBrainLevel(skillName) {
  const lower = (skillName || '').toLowerCase();
  for (const [keyword, level] of Object.entries(SKILL_BRAIN_LEVEL_MAP)) {
    if (lower.includes(keyword)) return level;
  }
  return 2;
}

// GET /api/brain/level — returns current brain level based on available Ollama models
router.get('/brain/level', async (req, res) => {
  try {
    const r = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const models = (r.data.models || []).map(m => m.name);
    let maxLevel = 1;
    models.forEach(m => {
      const lvl = getModelBrainLevel(m);
      if (lvl > maxLevel) maxLevel = lvl;
    });
    // Bump if Claude API key is set
    if (process.env.ANTHROPIC_API_KEY) maxLevel = Math.max(maxLevel, 3);
    res.json({ level: maxLevel, models, hasClaudeKey: !!process.env.ANTHROPIC_API_KEY });
  } catch {
    res.json({ level: 1, models: [], hasClaudeKey: !!process.env.ANTHROPIC_API_KEY });
  }
});

// POST /api/brain/check — check if a skill is accessible at current brain level
router.post('/brain/check', async (req, res) => {
  const { skillName, model } = req.body;
  const skillLevel = getSkillBrainLevel(skillName || '');
  const modelLevel = model ? getModelBrainLevel(model) : 2;

  const levelNames = { 1: 'Basic', 2: 'Standard', 3: 'Advanced', 4: 'Expert' };
  const levelModels = {
    1: 'tinyllama', 2: 'phi / llama3.2', 3: 'Claude Haiku / Gemma4', 4: 'Claude Sonnet / GPT-4'
  };

  res.json({
    skillName, skillLevel, modelLevel,
    accessible: modelLevel >= skillLevel,
    message: modelLevel >= skillLevel
      ? `✓ Accessible — ${skillName} (L${skillLevel}) works with your current brain (L${modelLevel})`
      : `🔒 Brain Level ${skillLevel} required\nCurrent: L${modelLevel} (${levelNames[modelLevel]})\nUpgrade to: ${levelModels[skillLevel]}`,
    upgradeNeeded: modelLevel < skillLevel,
    upgradeModel: modelLevel < skillLevel ? levelModels[skillLevel] : null
  });
});

// ═════════════════════════════════════════════════════════════════
// CONTENT PRODUCTION — Twitter/X thread builder + Suno lyrics
// ═════════════════════════════════════════════════════════════════

// POST /api/content/thread — build a Twitter/X thread from text or file
router.post('/content/thread', async (req, res) => {
  const { text, fileId, topic, tone, tweetCount } = req.body;

  let sourceText = text || '';
  if (fileId) {
    const meta = fileHandler.getFile(fileId);
    if (meta) {
      try { sourceText = fs.readFileSync(meta.textPath, 'utf8').slice(0, 6000); } catch {}
    }
  }
  if (!sourceText && !topic) return res.status(400).json({ error: 'text, fileId, or topic required' });

  const n = Math.min(parseInt(tweetCount) || 7, 15);
  const toneStr = tone || 'confident and engaging';
  const prompt = sourceText
    ? `You are a Twitter/X growth expert. Write a ${n}-tweet thread based on this content.\n\nTone: ${toneStr}\nFormat: Number each tweet 1/${n}, 2/${n}, etc. Max 280 chars each. Add line break between tweets.\n\nSOURCE:\n${sourceText.slice(0,4000)}`
    : `Write a viral ${n}-tweet thread about: "${topic}"\nTone: ${toneStr}\nFormat: Number each tweet 1/${n}, 2/${n}, etc. Max 280 chars each.`;

  try {
    // Try Claude first, then Gemini, then Ollama
    let thread = '';
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = (() => { try { return require('@anthropic-ai/sdk'); } catch { return null; } })();
        if (Anthropic) {
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const msg = await client.messages.create({
            model: process.env.AGENT_CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          });
          thread = msg.content[0]?.text || '';
        }
      } catch {}
    }
    if (!thread && process.env.GEMINI_API_KEY) {
      try { thread = await callGemini(prompt, process.env.GEMINI_API_KEY); } catch {}
    }
    if (!thread) {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
        messages: [{ role: 'user', content: prompt }],
        stream: false
      }, { timeout: 90000 });
      thread = r.data.message?.content || '';
    }

    // Parse into tweet array
    const tweets = thread.split(/\n\n|\n(?=\d+\/)/).map(t => t.trim()).filter(t => t.length > 5);

    res.json({ thread, tweets, count: tweets.length, topic: topic || 'custom', tone: toneStr });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/content/email — write an email
router.post('/content/email', async (req, res) => {
  const { subject, to, context, tone, fileId } = req.body;
  if (!subject && !context) return res.status(400).json({ error: 'subject or context required' });

  let extra = '';
  if (fileId) {
    const meta = fileHandler.getFile(fileId);
    if (meta) {
      try { extra = '\n\nReference file:\n' + fs.readFileSync(meta.textPath, 'utf8').slice(0, 3000); } catch {}
    }
  }

  const prompt = `Write a professional email.\nSubject: ${subject || context}\nTo: ${to || 'recipient'}\nTone: ${tone || 'professional and warm'}\nContext: ${context || subject}${extra}\n\nFormat: Subject line, then blank line, then email body with greeting, body paragraphs, and sign-off.`;

  try {
    let email = '';
    if (process.env.GEMINI_API_KEY) {
      try { email = await callGemini(prompt, process.env.GEMINI_API_KEY); } catch {}
    }
    if (!email) {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: process.env.OLLAMA_MODEL || 'llama3.2:1b', messages: [{ role: 'user', content: prompt }], stream: false
      }, { timeout: 90000 });
      email = r.data.message?.content || '';
    }
    res.json({ email, subject, tone: tone || 'professional' });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/content/lyrics — write song lyrics (Suno-ready)
router.post('/content/lyrics', async (req, res) => {
  const { theme, genre, mood, verses, fileId } = req.body;
  if (!theme) return res.status(400).json({ error: 'theme required' });

  let context = '';
  if (fileId) {
    const meta = fileHandler.getFile(fileId);
    if (meta) {
      try { context = '\n\nInspiration from file:\n' + fs.readFileSync(meta.textPath, 'utf8').slice(0, 1500); } catch {}
    }
  }

  const prompt = `Write complete song lyrics for Suno AI.\n\nTheme: ${theme}\nGenre: ${genre || 'hip-hop/R&B'}\nMood: ${mood || 'inspirational'}\nVerses: ${verses || 2}${context}\n\nFormat with [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro] tags. Make it vivid, emotional, and singable.`;

  try {
    let lyrics = '';
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = (() => { try { return require('@anthropic-ai/sdk'); } catch { return null; } })();
        if (Anthropic) {
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const msg = await client.messages.create({
            model: process.env.AGENT_CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
          });
          lyrics = msg.content[0]?.text || '';
        }
      } catch {}
    }
    if (!lyrics && process.env.GEMINI_API_KEY) {
      try { lyrics = await callGemini(prompt, process.env.GEMINI_API_KEY); } catch {}
    }
    if (!lyrics) {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: process.env.OLLAMA_MODEL || 'llama3.2:1b', messages: [{ role: 'user', content: prompt }], stream: false
      }, { timeout: 90000 });
      lyrics = r.data.message?.content || '';
    }

    res.json({
      lyrics, theme, genre: genre || 'hip-hop/R&B', mood: mood || 'inspirational',
      sunoPrompt: `${genre || 'hip-hop'}, ${mood || 'inspirational'}, ${theme}`,
      note: 'Copy lyrics and sunoPrompt into Suno.ai for music generation'
    });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/content/insights — get AI insights from coin data / file
router.post('/content/insights', async (req, res) => {
  const { coins, fileId, question } = req.body;
  const parts = [];

  // Fetch crypto data if coins specified
  if (coins && Array.isArray(coins) && coins.length > 0) {
    try {
      const ids = coins.join(',');
      const r = await axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=10`, { timeout: 8000 });
      if (r.data?.length) {
        parts.push('LIVE CRYPTO DATA:\n' + r.data.map(c =>
          `${c.name} (${c.symbol?.toUpperCase()}): $${c.current_price?.toLocaleString()} | 24h: ${(c.price_change_percentage_24h||0).toFixed(2)}% | MCap: $${((c.market_cap||0)/1e9).toFixed(2)}B`
        ).join('\n'));
      }
    } catch {}
  }

  if (fileId) {
    const meta = fileHandler.getFile(fileId);
    if (meta) {
      try { parts.push('FILE CONTENT:\n' + fs.readFileSync(meta.textPath, 'utf8').slice(0, 4000)); } catch {}
    }
  }

  const q = question || 'Provide a comprehensive analysis with key insights, trends, and actionable recommendations.';
  const prompt = `${parts.join('\n\n')}\n\n${q}`;

  try {
    let insights = '';
    if (process.env.GEMINI_API_KEY) {
      try { insights = await callGemini(prompt, process.env.GEMINI_API_KEY); } catch {}
    }
    if (!insights) {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: process.env.OLLAMA_MODEL || 'llama3.2:1b', messages: [{ role: 'user', content: prompt }], stream: false
      }, { timeout: 120000 });
      insights = r.data.message?.content || '';
    }
    res.json({ insights, dataSources: parts.length, coins: coins || [], question: q });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// ═════════════════════════════════════════════════════════════════
// SCHEDULED JOBS — cron-style automation (ORACLE #2 priority)
// ═════════════════════════════════════════════════════════════════
const SCHEDULED_JOBS_FILE = path.join(DATA_DIR, 'scheduled_jobs.json');
let _scheduledJobs = loadJSON(SCHEDULED_JOBS_FILE, []);

/* ── scheduled jobs: OWNER-SCOPED ─────────────────────────────────────────
   These five routes had no auth and no owner scoping at all. GET returned
   every user's jobs to anyone (including the prompt text, which routinely
   carries private business detail), and PUT/DELETE/run accepted any job id
   from any caller — so one user could read, edit, delete or EXECUTE another
   user's automation.

   Jobs now carry `userId`, set from the authenticated identity at creation,
   and every route resolves against the caller.

   Not-found is returned instead of forbidden when the caller does not own a
   job, so the API never confirms that someone else's job id exists.

   Legacy jobs stored before this fix have no owner. They are NOT served to
   anyone rather than being guessed at — the data is left untouched on disk,
   and an owner can claim one by adding "userId" to it in
   backend/data/scheduled_jobs.json. */
function _jobOwner(req) {
  return String(
    (req && req.userId)
    || (req && req.user && (req.user.id || req.user.userId))
    || (req && req.headers && req.headers['x-user-id'])
    || ''
  ).trim();
}
function _ownsJob(job, uid) { return !!uid && !!job && job.userId === uid; }

router.get('/jobs/scheduled', (req, res) => {
  const uid = _jobOwner(req);
  if (!uid) return res.json({ jobs: [], count: 0, note: 'sign in to see your scheduled jobs' });
  const mine = _scheduledJobs.filter((j) => _ownsJob(j, uid));
  res.json({ jobs: mine, count: mine.length });
});

router.post('/jobs/scheduled', (req, res) => {
  const uid = _jobOwner(req);
  if (!uid) return res.status(401).json({ error: 'sign in to schedule a job' });
  const { name, trigger, steps, output, enabled = true } = req.body;
  if (!name || !steps?.length) return res.status(400).json({ error: 'name and steps required' });
  const job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: uid,
    name, trigger, steps, output, enabled,
    created: new Date().toISOString(), lastRun: null, runCount: 0,
  };
  _scheduledJobs.push(job);
  saveJSON(SCHEDULED_JOBS_FILE, _scheduledJobs);
  res.json({ success: true, job });
});

router.put('/jobs/scheduled/:id', (req, res) => {
  const uid = _jobOwner(req);
  const idx = _scheduledJobs.findIndex((j) => j.id === req.params.id && _ownsJob(j, uid));
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  // userId and id are not client-writable, or ownership could be reassigned
  const { userId: _drop, id: _dropId, ...patch } = req.body || {};
  _scheduledJobs[idx] = { ..._scheduledJobs[idx], ...patch };
  saveJSON(SCHEDULED_JOBS_FILE, _scheduledJobs);
  res.json({ success: true, job: _scheduledJobs[idx] });
});

router.delete('/jobs/scheduled/:id', (req, res) => {
  const uid = _jobOwner(req);
  const before = _scheduledJobs.length;
  _scheduledJobs = _scheduledJobs.filter((j) => !(j.id === req.params.id && _ownsJob(j, uid)));
  if (_scheduledJobs.length === before) return res.status(404).json({ error: 'Job not found' });
  saveJSON(SCHEDULED_JOBS_FILE, _scheduledJobs);
  res.json({ success: true });
});

// POST /api/jobs/scheduled/:id/run — manually trigger a scheduled job
router.post('/jobs/scheduled/:id/run', async (req, res) => {
  const _uid = _jobOwner(req);
  const job = _scheduledJobs.find(j => j.id === req.params.id && _ownsJob(j, _uid));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const task_id = `sched_${Date.now()}`;
  res.json({ success: true, task_id, message: `Job "${job.name}" triggered` });
  // Execute chain asynchronously
  setImmediate(async () => {
    let context = '';
    const results = [];
    for (const step of (job.steps || [])) {
      const port = AGENT_PORTS[step.agent] || 8000;
      const prompt = (step.prompt || '').replace(/\{step(\d+)\}/g, (m, n) => results[parseInt(n)-1] || context);
      try {
        const axios_mod = require('axios');
        const resp = await axios_mod.post(`http://localhost:${port}/chat`, { message: prompt, model: 'tinyllama' }, { timeout: 90000 });
        context = resp.data?.response || '';
        results.push(context);
      } catch(e) { results.push(`[Error: ${e.message}]`); }
    }
    // Save result to receipts
    const receipts = loadJSON(path.join(DATA_DIR, 'task_receipts.json'), []);
    receipts.unshift({ task_id, agent: 'workflow', task: `[SCHEDULED] ${job.name}`, result: results.join('\n---\n').slice(0,1000), timestamp: new Date().toISOString() });
    saveJSON(path.join(DATA_DIR, 'task_receipts.json'), receipts.slice(0,500));
    // Update job run stats
    const idx = _scheduledJobs.findIndex(j => j.id === job.id);
    if (idx !== -1) { _scheduledJobs[idx].lastRun = new Date().toISOString(); _scheduledJobs[idx].runCount = (_scheduledJobs[idx].runCount || 0) + 1; }
    saveJSON(SCHEDULED_JOBS_FILE, _scheduledJobs);
  });
});

// ── WEBHOOK TRIGGER ENDPOINT ──────────────────────────────────────────────
// POST /api/webhook/trigger — inbound trigger from external services (Zapier, Make, IFTTT)
const WEBHOOK_LOG_FILE = path.join(DATA_DIR, 'webhook_log.json');
let _webhookLog = loadJSON(WEBHOOK_LOG_FILE, []);

router.post('/webhook/trigger', async (req, res) => {
  const { workflow, trigger = 'external', data = {}, secret } = req.body;
  const entry = { id: `wh_${Date.now()}`, workflow, trigger, data, received: new Date().toISOString(), ip: req.ip };
  _webhookLog.unshift(entry);
  if (_webhookLog.length > 200) _webhookLog = _webhookLog.slice(0, 200);
  saveJSON(WEBHOOK_LOG_FILE, _webhookLog);

  // If a recognized workflow is named, kick off a background chain
  const RECOGNIZED = ['market-brief','security-audit','revenue-intel'];
  let jobId = null;
  if (workflow && RECOGNIZED.includes(workflow)) {
    const task_id = `wh_task_${Date.now()}`;
    setImmediate(async () => {
      const receipts = loadJSON(path.join(DATA_DIR, 'task_receipts.json'), []);
      receipts.unshift({ task_id, agent: 'webhook', task: `[WEBHOOK] ${workflow}`, result: `Triggered via ${trigger}. Data: ${JSON.stringify(data).slice(0,200)}`, timestamp: new Date().toISOString() });
      saveJSON(path.join(DATA_DIR, 'task_receipts.json'), receipts.slice(0,500));
    });
    jobId = task_id;
  }

  res.json({ success: true, message: 'Webhook received', workflow, trigger, jobId, received: entry.received });
});

// GET /api/webhook/log — recent webhook events
router.get('/webhook/log', (req, res) => {
  const uid = String(req.headers['x-user-id'] || '').trim();
  const mine = uid ? _webhookLog.filter(w => w && (w.owner === uid || w.userId === uid)) : [];
  res.json({ log: mine.slice(0, 50), count: mine.length });
});

// ── FREE STOCK QUOTES — multi-source fallback ─────────────────────────────
// Tries Finnhub (free tier, ~60/min) → Alpha Vantage (free 5/min) → Yahoo public quote (no key)
router.get('/quote/:symbol', async (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
  const ALPHAV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

  // 1) Try Finnhub if key set
  if (FINNHUB_KEY) {
    try {
      const r = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`, { timeout: 6000 });
      const d = r.data || {};
      if (d.c) {
        return res.json({
          symbol,
          price: d.c,
          change: d.d || 0,
          change_pct: d.dp || 0,
          high: d.h, low: d.l, open: d.o, prev_close: d.pc,
          source: 'finnhub',
          ts: new Date().toISOString()
        });
      }
    } catch(e) { /* fall through */ }
  }
  // 2) Try Alpha Vantage
  if (ALPHAV_KEY) {
    try {
      const r = await axios.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHAV_KEY}`, { timeout: 6000 });
      const q = r.data?.['Global Quote'];
      if (q && q['05. price']) {
        return res.json({
          symbol,
          price: parseFloat(q['05. price']),
          change: parseFloat(q['09. change']) || 0,
          change_pct: parseFloat((q['10. change percent'] || '0').replace('%','')) || 0,
          high: parseFloat(q['03. high']), low: parseFloat(q['04. low']),
          open: parseFloat(q['02. open']), prev_close: parseFloat(q['08. previous close']),
          source: 'alphavantage',
          ts: new Date().toISOString()
        });
      }
    } catch(e) { /* fall through */ }
  }
  // 3) Try Yahoo (no key, public endpoint)
  try {
    const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`, {
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const result = r.data?.chart?.result?.[0];
    if (result?.meta) {
      const m = result.meta;
      const price = m.regularMarketPrice || m.previousClose;
      const prev = m.previousClose || m.chartPreviousClose;
      const change = price - prev;
      const pct = prev ? (change / prev) * 100 : 0;
      return res.json({
        symbol,
        price,
        change,
        change_pct: pct,
        high: m.regularMarketDayHigh,
        low: m.regularMarketDayLow,
        open: m.regularMarketOpen,
        prev_close: prev,
        volume: m.regularMarketVolume,
        currency: m.currency,
        exchange: m.exchangeName,
        source: 'yahoo',
        ts: new Date().toISOString()
      });
    }
  } catch(e) { /* fall through */ }
  // 4) Crypto fallback via CoinGecko (already have GECKO routes)
  try {
    const cgMap = { BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin', AVAX:'avalanche-2', DOGE:'dogecoin', ADA:'cardano', LINK:'chainlink', XRP:'ripple' };
    const id = cgMap[symbol] || symbol.toLowerCase();
    const r = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`, { timeout: 6000 });
    const data = r.data?.[id];
    if (data?.usd) {
      return res.json({
        symbol,
        price: data.usd,
        change_pct: data.usd_24h_change || 0,
        change: data.usd * ((data.usd_24h_change || 0) / 100),
        source: 'coingecko',
        ts: new Date().toISOString()
      });
    }
  } catch(e) {}
  res.status(404).json({ error: 'No data found for ' + symbol, tried: ['finnhub', 'alphavantage', 'yahoo', 'coingecko'] });
});

// GET /api/quote-info/:symbol — company info (yahoo)
router.get('/quote-info/:symbol', async (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  try {
    const r = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,summaryDetail,defaultKeyStatistics,assetProfile`, {
      timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    res.json({ symbol, result: r.data?.quoteSummary?.result?.[0] || null });
  } catch(e) { res.status(404).json({ error: e.message }); }
});

// ── COUNCIL ANALYSIS — Native multi-agent debate using your SHADDAI agents ──
const COUNCIL_FILE = path.join(DATA_DIR, 'council_analyses.json');
let _councilRuns = loadJSON(COUNCIL_FILE, []);

// ── Multi-provider LLM caller for Council ─────────────────────────────
async function _councilCallLLM(provider, model, apiKey, systemPrompt, userPrompt) {
  const msg = systemPrompt ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
                           : [{ role: 'user', content: userPrompt }];
  const timeoutMs = 120000;

  if (provider === 'ollama') {
    const r = await axios.post('http://localhost:11434/api/chat', {
      model: model || 'tinyllama', stream: false,
      messages: msg
    }, { timeout: timeoutMs });
    return r.data?.message?.content || '';
  }

  if (provider === 'openai' || provider === 'groq' || provider === 'openrouter' || provider === 'together') {
    const baseUrl = {
      openai:      'https://api.openai.com/v1',
      groq:        'https://api.groq.com/openai/v1',
      openrouter:  'https://openrouter.ai/api/v1',
      together:    'https://api.together.xyz/v1'
    }[provider];
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    if (provider === 'openrouter') headers['HTTP-Referer'] = 'https://shaddai.ai';
    const r = await axios.post(`${baseUrl}/chat/completions`, {
      model, messages: msg, max_tokens: 600, temperature: 0.7
    }, { headers, timeout: timeoutMs });
    return r.data?.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const body = { model, max_tokens: 600, messages: [{ role: 'user', content: userPrompt }] };
    if (systemPrompt) body.system = systemPrompt;
    const r = await axios.post('https://api.anthropic.com/v1/messages', body, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: timeoutMs
    });
    return r.data?.content?.[0]?.text || '';
  }

  if (provider === 'gemini') {
    const prompt = systemPrompt ? systemPrompt + '\n\n' + userPrompt : userPrompt;
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 600 } },
      { timeout: timeoutMs }
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error('Unknown provider: ' + provider);
}

const COUNCIL_ALLOWED_PROVIDERS = new Set(['ollama-agents','ollama','groq','openai','anthropic','openrouter','gemini','together']);

router.post('/council/analyze', async (req, res) => {
  const { ticker = 'NVDA', context = '', marketContext = '', provider: rawProvider = 'ollama-agents', model = 'tinyllama', apiKey = '' } = req.body;
  const provider = COUNCIL_ALLOWED_PROVIDERS.has(rawProvider) ? rawProvider : 'ollama-agents';
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!sym) return res.status(400).json({ error: 'ticker required' });

  const run_id = 'council_' + Date.now();
  res.json({ success: true, run_id, ticker: sym, provider, model, message: 'Council convened — poll /api/council/run/' + run_id });

  // Use client-provided market context if available, otherwise fetch from backend
  let quoteData = marketContext || '';
  if (!quoteData) {
    try {
      const q = await axios.get(`http://localhost:3000/api/quote/${sym}`, { timeout: 5000 });
      const d = q.data;
      quoteData = `Live price: $${d.price?.toFixed(2)}, 24h change: ${d.change_pct?.toFixed(2)}%, source: ${d.source}`;
    } catch {}
  }

  const ctxLine = quoteData ? `\n\nLIVE DATA:\n${quoteData}` : '';
  const COUNCIL = [
    { name:'ORACLE',  port: 8002, role:'fundamentals & news analyst',
      system: 'You are ORACLE, a fundamental analysis expert. Be concise and analytical.',
      prompt: `Analyze ${sym} from a fundamentals + macro news angle in 3-5 sentences.${ctxLine}\n\nFocus on: company financials, recent news, sector trends. Use the live data above if provided. End with: STRENGTH=high/medium/low.` },
    { name:'ZEROX',   port: 8001, role:'price action + sentiment',
      system: 'You are ZEROX, a market sentiment and price action expert. Be concise and analytical.',
      prompt: `Analyze ${sym} from a market psychology + price action angle in 3-5 sentences.${ctxLine}\n\nFocus on: momentum, sentiment, whale movements. Comment on the 24h change if data provided. End with: BIAS=bullish/bearish/neutral.` },
    { name:'NEXUS',   port: 8003, role:'technical analyst',
      system: 'You are NEXUS, a technical analysis expert. Be concise and analytical.',
      prompt: `Analyze ${sym} from a technical chart angle in 3-5 sentences.${ctxLine}\n\nFocus on: support/resistance, RSI/MACD likely positioning, pattern recognition. End with: SIGNAL=buy/sell/hold.` },
    { name:'PIKADON', port: 8008, role:'risk manager',
      system: 'You are PIKADON, a risk management expert. Be concise and analytical.',
      prompt: `Assess the RISK of trading ${sym} in 3-4 sentences.${ctxLine}\n\nFocus on: volatility, drawdown potential, position sizing. End with: RISK_LEVEL=low/medium/high.` },
  ];

  const runEntry = {
    id: run_id, ticker: sym, provider, model, status: 'running',
    started: new Date().toISOString(),
    quote: quoteData,
    perspectives: [],
    verdict: null
  };
  _councilRuns.unshift(runEntry);
  if (_councilRuns.length > 100) _councilRuns = _councilRuns.slice(0, 100);
  saveJSON(COUNCIL_FILE, _councilRuns);

  // Run sequential analysis — route by provider
  (async () => {
    for (const agent of COUNCIL) {
      try {
        let response = '';
        if (provider === 'ollama-agents') {
          // Legacy path — call agent servers directly
          const r = await axios.post(`http://localhost:${agent.port}/chat`, {
            message: agent.prompt, model: model || 'tinyllama'
          }, { timeout: 120000 });
          response = r.data?.response || r.data?.message?.content || '';
        } else {
          response = await _councilCallLLM(provider, model, apiKey, agent.system, agent.prompt);
        }
        runEntry.perspectives.push({ agent: agent.name, role: agent.role, response, ts: new Date().toISOString() });
      } catch(e) {
        runEntry.perspectives.push({ agent: agent.name, role: agent.role, response: '[ERROR] ' + e.message, error: true, ts: new Date().toISOString() });
      }
      const idx = _councilRuns.findIndex(x => x.id === run_id);
      if (idx !== -1) _councilRuns[idx] = runEntry;
      saveJSON(COUNCIL_FILE, _councilRuns);
    }

    // Final SHADDAI verdict
    try {
      const summary = runEntry.perspectives.map(p => `${p.agent} (${p.role}): ${p.response}`).join('\n\n');
      const shaddaiSystem = 'You are SHADDAI, supreme AI commander and master strategist. Give decisive, structured verdicts.';
      const shaddaiPrompt = `Your 4 analysts have spoken on ${sym}:\n\n${summary}\n\nSynthesize into a final trading decision. Use this exact format:\nVERDICT: BUY or SELL or HOLD\nCONFIDENCE: 1-10\nKEY REASON: one sentence\nPOSITION SIZE: small/medium/large\nSTOP LOSS: percentage`;

      let verdict = '';
      if (provider === 'ollama-agents') {
        const r = await axios.post('http://localhost:8000/chat', { message: shaddaiPrompt, model: model || 'tinyllama' }, { timeout: 120000 });
        verdict = r.data?.response || r.data?.message?.content || '';
      } else {
        verdict = await _councilCallLLM(provider, model, apiKey, shaddaiSystem, shaddaiPrompt);
      }
      runEntry.verdict = verdict;
    } catch(e) {
      runEntry.verdict = '[SHADDAI OFFLINE — manual review required]';
    }

    runEntry.status = 'complete';
    runEntry.finished = new Date().toISOString();
    const idx = _councilRuns.findIndex(x => x.id === run_id);
    if (idx !== -1) _councilRuns[idx] = runEntry;
    saveJSON(COUNCIL_FILE, _councilRuns);

    try {
      const receipts = loadJSON(path.join(DATA_DIR, 'task_receipts.json'), []);
      receipts.unshift({
        task_id: run_id, agent: 'council',
        task: `[COUNCIL/${provider}] ${sym} analysis`,
        result: (runEntry.verdict || '').slice(0, 500),
        timestamp: new Date().toISOString()
      });
      saveJSON(path.join(DATA_DIR, 'task_receipts.json'), receipts.slice(0, 500));
    } catch {}
  })();
});

router.get('/council/run/:id', (req, res) => {
  const run = _councilRuns.find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json({ run });
});

router.get('/council/runs', (req, res) => {
  res.json({ runs: _councilRuns.slice(0, 30), count: _councilRuns.length });
});

// ── AGENT WALLET — agents can spend with budgets/approval ─────────────────
const AGENT_WALLETS_FILE = path.join(DATA_DIR, 'agent_wallets.json');
let _agentWallets = loadJSON(AGENT_WALLETS_FILE, {});

function _ensureWallet(agent) {
  const key = agent.toUpperCase();
  if (!_agentWallets[key]) {
    _agentWallets[key] = {
      agent: key,
      balance: 0,
      budget_daily: 0.05, // 0.05 SOL/day default
      budget_per_tx: 0.01, // 0.01 SOL max per tx
      spent_today: 0,
      day_started: new Date().toISOString().slice(0,10),
      requires_approval_above: 0.005,
      tx_log: []
    };
    saveJSON(AGENT_WALLETS_FILE, _agentWallets);
  }
  return _agentWallets[key];
}

router.get('/agent-wallet/:agent', (req, res) => {
  res.json({ wallet: _ensureWallet(req.params.agent) });
});

router.get('/agent-wallet', (req, res) => {
  // Make sure all 7 exist
  ['SHADDAI','ZEROX','ORACLE','NEXUS','TURTLE','QUILL','PIKADON'].forEach(a => _ensureWallet(a));
  res.json({ wallets: _agentWallets });
});

router.post('/agent-wallet/:agent/config', (req, res) => {
  const w = _ensureWallet(req.params.agent);
  const { budget_daily, budget_per_tx, requires_approval_above } = req.body;
  if (budget_daily !== undefined) w.budget_daily = parseFloat(budget_daily);
  if (budget_per_tx !== undefined) w.budget_per_tx = parseFloat(budget_per_tx);
  if (requires_approval_above !== undefined) w.requires_approval_above = parseFloat(requires_approval_above);
  saveJSON(AGENT_WALLETS_FILE, _agentWallets);
  res.json({ wallet: w });
});

// POST /api/agent-wallet/:agent/request — agent requests to spend
router.post('/agent-wallet/:agent/request', async (req, res) => {
  const w = _ensureWallet(req.params.agent);
  const { item = 'item', amount = 0.001, currency = 'SOL', reason = '' } = req.body;
  const today = new Date().toISOString().slice(0,10);
  if (w.day_started !== today) { w.spent_today = 0; w.day_started = today; }
  if (amount > w.budget_per_tx) return res.status(403).json({ error: `Amount ${amount} exceeds per-tx budget ${w.budget_per_tx}` });
  if (w.spent_today + amount > w.budget_daily) return res.status(403).json({ error: `Daily budget ${w.budget_daily} would be exceeded` });
  const requiresApproval = amount > w.requires_approval_above;
  const tx = {
    id: 'tx_' + Date.now(),
    item, amount, currency, reason,
    agent: req.params.agent.toUpperCase(),
    status: requiresApproval ? 'pending_approval' : 'approved',
    created: new Date().toISOString()
  };
  // Auto-create Solana Pay URL if approved
  if (tx.status === 'approved' && _solanaPay) {
    try {
      const reference = _solanaWeb3.Keypair.generate().publicKey;
      const recipient = new _solanaWeb3.PublicKey(MERCHANT_ADDRESS);
      const url = _solanaPay.encodeURL({
        recipient, amount: new _BigNumber(amount), reference,
        label: 'SHADDAI ' + tx.agent, message: item,
        memo: `${tx.agent}:${item}:${tx.id}`
      });
      tx.pay_url = url.toString();
      tx.reference = reference.toBase58();
    } catch(e) { tx.pay_error = e.message; }
  }
  w.tx_log.unshift(tx);
  if (w.tx_log.length > 100) w.tx_log = w.tx_log.slice(0, 100);
  w.spent_today += amount;
  saveJSON(AGENT_WALLETS_FILE, _agentWallets);
  res.json({ tx, wallet: w });
});

// POST /api/agent-wallet/:agent/approve/:txId — approve pending tx
router.post('/agent-wallet/:agent/approve/:txId', (req, res) => {
  const w = _ensureWallet(req.params.agent);
  const tx = w.tx_log.find(t => t.id === req.params.txId);
  if (!tx) return res.status(404).json({ error: 'tx not found' });
  tx.status = 'approved';
  tx.approved_at = new Date().toISOString();
  // Create Solana Pay URL now
  if (_solanaPay) {
    try {
      const reference = _solanaWeb3.Keypair.generate().publicKey;
      const recipient = new _solanaWeb3.PublicKey(MERCHANT_ADDRESS);
      const url = _solanaPay.encodeURL({
        recipient, amount: new _BigNumber(tx.amount), reference,
        label: 'SHADDAI ' + tx.agent, message: tx.item,
        memo: `${tx.agent}:${tx.item}:${tx.id}`
      });
      tx.pay_url = url.toString();
      tx.reference = reference.toBase58();
    } catch {}
  }
  saveJSON(AGENT_WALLETS_FILE, _agentWallets);
  res.json({ tx });
});

// ── GENERIC SECURE PROXY — for custom API registry test/call ──────────────
// Proxies any HTTPS request through the server (bypasses browser CORS).
// Same SSRF + header stripping protection as agent-pay.
router.post('/proxy', async (req, res) => {
  const { url, method = 'GET', headers: reqHeaders = {}, body: reqBody = null } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'invalid URL' }); }
  if (parsed.protocol !== 'https:') return res.status(400).json({ error: 'HTTPS required' });
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|0:0:0:0:0:0:0:1$|fc00:|fd[0-9a-f]{2}:)/.test(host)) {
    return res.status(403).json({ error: 'Private hosts blocked' });
  }
  // Strip dangerous headers
  const safeHdrs = {};
  for (const [k, v] of Object.entries(reqHeaders || {})) {
    if (!_BLOCKED_HEADERS.has(k.toLowerCase())) safeHdrs[k] = v;
  }
  try {
    const r = await axios({
      method: method.toUpperCase(),
      url,
      headers: safeHdrs,
      data: reqBody,
      timeout: 15000,
      maxRedirects: 3,
      validateStatus: () => true
    });
    const content = typeof r.data === 'string' ? r.data.slice(0, 50000) : JSON.stringify(r.data).slice(0, 50000);
    res.json({ status: r.status, content, headers: r.headers });
  } catch(e) { res.status(502).json({ error: e.message, content: '' }); }
});

// ── AGENT PAY-FOR-API (pay.sh equivalent · HTTP 402-style micropayments) ──
// Lets an agent: 1) request to call a paid API, 2) auto-pay via Solana Pay,
// 3) receive the response. Used by autonomous agents to buy data/services.
// Reserved headers that must not be forwarded from caller to external APIs
const _BLOCKED_HEADERS = new Set(['host','authorization','cookie','set-cookie','x-forwarded-for','x-real-ip','x-api-key','proxy-authorization','connection','transfer-encoding']);

router.post('/agent-pay/api', async (req, res) => {
  const { agent = 'SHADDAI', api_url, api_method = 'GET', api_body = null, api_headers = {}, price_sol = 0.001, label = 'API access' } = req.body;
  if (!api_url) return res.status(400).json({ error: 'api_url required' });
  // Validate URL (only HTTPS public APIs allowed)
  let parsed;
  try { parsed = new URL(api_url); } catch { return res.status(400).json({ error: 'invalid URL' }); }
  if (parsed.protocol !== 'https:') return res.status(400).json({ error: 'HTTPS required' });
  // Block private/local IP ranges — IPv4 and IPv6 localhost variants
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ssrfBlocked = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|0:0:0:0:0:0:0:1$|fc00:|fd[0-9a-f]{2}:)/.test(host);
  if (ssrfBlocked) return res.status(403).json({ error: 'Private hosts blocked' });
  // Strip reserved headers to prevent injection
  const safeHeaders = {};
  for (const [k, v] of Object.entries(api_headers || {})) {
    if (!_BLOCKED_HEADERS.has(k.toLowerCase())) safeHeaders[k] = v;
  }
  // NL command length guard
  if (label && label.length > 500) return res.status(400).json({ error: 'label too long' });

  // Get/create agent wallet, check budget
  const w = _ensureWallet(agent);
  const today = new Date().toISOString().slice(0,10);
  if (w.day_started !== today) { w.spent_today = 0; w.day_started = today; }
  if (price_sol > w.budget_per_tx) return res.status(403).json({ error: `Price ${price_sol} exceeds per-tx budget ${w.budget_per_tx}`, wallet: w });
  if (w.spent_today + price_sol > w.budget_daily) return res.status(403).json({ error: `Daily budget ${w.budget_daily} would be exceeded`, wallet: w });

  // Create payment receipt
  let payment = null;
  if (_solanaPay) {
    try {
      const reference = _solanaWeb3.Keypair.generate().publicKey;
      const recipient = new _solanaWeb3.PublicKey(MERCHANT_ADDRESS);
      const url = _solanaPay.encodeURL({
        recipient, amount: new _BigNumber(price_sol), reference,
        label: 'SHADDAI ' + agent, message: label,
        memo: `${agent}:API:${parsed.hostname}`
      });
      payment = { reference: reference.toBase58(), url: url.toString(), amount: price_sol };
    } catch(e) { /* continue without payment proof */ }
  }

  // Execute the API call (assumes pay-as-you-go API trusts agent)
  let apiResponse = null;
  let apiError = null;
  try {
    const r = await axios({
      method: api_method.toUpperCase(),
      url: api_url,
      data: api_body,
      headers: safeHeaders,
      timeout: 15000,
      maxRedirects: 3
    });
    apiResponse = { status: r.status, data: r.data };
  } catch(e) {
    apiError = e.message;
  }

  // Log to wallet
  const tx = {
    id: 'apipay_' + Date.now(),
    item: 'API: ' + parsed.hostname + parsed.pathname.slice(0, 40),
    amount: price_sol, currency: 'SOL',
    agent: agent.toUpperCase(),
    api_url, api_method,
    status: apiError ? 'failed' : 'completed',
    error: apiError,
    payment,
    created: new Date().toISOString()
  };
  w.tx_log.unshift(tx);
  if (w.tx_log.length > 100) w.tx_log = w.tx_log.slice(0, 100);
  if (!apiError) w.spent_today += price_sol;
  saveJSON(AGENT_WALLETS_FILE, _agentWallets);

  res.json({ tx, response: apiResponse, error: apiError, wallet: w });
});

// ── JUPITER SWAP (Solana DEX, no key) — get quote + build swap tx ──
router.get('/jupiter/quote', async (req, res) => {
  const { inputMint, outputMint, amount, slippageBps = 50 } = req.query;
  if (!inputMint || !outputMint || !amount) return res.status(400).json({ error: 'inputMint, outputMint, amount required' });
  try {
    const r = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`, { timeout: 8000 });
    res.json(r.data);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// Common token mint addresses
router.get('/jupiter/tokens', (req, res) => {
  res.json({
    SOL:  'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    JTO:  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
    WIF:  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    JUP:  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  });
});

// ── ALPACA PAPER TRADING (free) — needs ALPACA_KEY + ALPACA_SECRET in .env ──
router.post('/alpaca/paper-order', async (req, res) => {
  const KEY = process.env.ALPACA_API_KEY || '';
  const SECRET = process.env.ALPACA_SECRET_KEY || '';
  if (!KEY || !SECRET) return res.status(503).json({ error: 'Alpaca not configured. Add ALPACA_API_KEY + ALPACA_SECRET_KEY to backend/.env. Free signup: https://alpaca.markets/' });
  const { symbol, qty = 1, side = 'buy', type = 'market', time_in_force = 'day' } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const r = await axios.post('https://paper-api.alpaca.markets/v2/orders', {
      symbol: symbol.toUpperCase(), qty, side, type, time_in_force
    }, {
      headers: { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SECRET, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    res.json({ success: true, order: r.data });
  } catch(e) {
    res.status(502).json({ error: e.response?.data?.message || e.message });
  }
});

router.get('/alpaca/account', async (req, res) => {
  const KEY = process.env.ALPACA_API_KEY || '';
  const SECRET = process.env.ALPACA_SECRET_KEY || '';
  if (!KEY || !SECRET) return res.json({ configured: false, message: 'Add Alpaca keys to .env' });
  try {
    const r = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SECRET },
      timeout: 6000
    });
    res.json({ configured: true, account: r.data });
  } catch(e) { res.json({ configured: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// AGENTIC ENGINE ROUTES — Real tool execution, task queue, agent loop
// Pattern: CrewAI API + LangChain agent executor
// ═══════════════════════════════════════════════════════════════════

// POST /api/agent/run — Submit a task. Returns taskId immediately (async execution).
// Body: { goal: string, agent?: string, workflow?: [{goal, agent}] }
router.post('/agent/run', require('./demo-limit').middleware, async (req, res) => {
  const { goal, agent, workflow, options } = req.body;
  if (!goal && !workflow) return res.status(400).json({ error: 'goal or workflow required' });

  if (workflow && Array.isArray(workflow)) {
    // Multi-step workflow — run synchronously (may be slow), return full result
    try {
      const result = await agentEngine.runWorkflow(workflow);
      return res.json({ success: true, workflow: true, ...result });
    } catch(e) {
      return fail(res, 500, 'internal_error', e.message);
    }
  }

  // Single task — create and run async (options propagates user → skill pack injection)
  const task = agentEngine.createTask(goal, agent, options || {});
  res.json({ success: true, taskId: task.id, agentName: task.agentName, status: 'pending' });

  // Run in background
  agentEngine.runAgentLoop(task.id).catch(e =>
    console.error('[ROUTE /agent/run] task failed:', e.message)
  );
});

// GET /api/agent/task/:id — Poll task status and result
router.get('/agent/task/:id', (req, res) => {
  const task = agentEngine.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// GET /api/agent/tasks — List recent tasks
router.get('/agent/tasks', (req, res) => {
  const tasks = agentEngine.getAllTasks().map(t => ({
    id: t.id, goal: t.goal?.slice(0, 100), agentName: t.agentName,
    status: t.status, startedAt: t.startedAt, completedAt: t.completedAt,
    tools_used: t.tools_used, resultPreview: t.result?.slice(0, 200)
  }));
  res.json({ tasks, total: tasks.length });
});

// GET /api/agent/stats — Aggregate per-agent + system stats from task queue
router.get('/agent/stats', (req, res) => {
  try {
    const tasks = agentEngine.getAllTasks ? agentEngine.getAllTasks() : [];
    const byAgent = {};
    // Seed with known agents so empty ones still appear
    if (agentEngine.AGENTS) {
      for (const a of Object.values(agentEngine.AGENTS)) {
        byAgent[a.name] = { tasksCompleted: 0, tasksFailed: 0, successRate: 1.0, lastActiveAt: null, totalEarnings: 0 };
      }
    }
    let activeTasks = 0;
    for (const t of tasks) {
      const name = t.agentName || 'UNKNOWN';
      if (!byAgent[name]) byAgent[name] = { tasksCompleted: 0, tasksFailed: 0, successRate: 1.0, lastActiveAt: null, totalEarnings: 0 };
      const a = byAgent[name];
      if (t.status === 'completed') a.tasksCompleted++;
      else if (t.status === 'failed' || t.status === 'error') a.tasksFailed++;
      else if (t.status === 'running' || t.status === 'pending') activeTasks++;
      const ts = t.completedAt || t.startedAt;
      if (ts && (!a.lastActiveAt || ts > a.lastActiveAt)) a.lastActiveAt = ts;
    }
    for (const a of Object.values(byAgent)) {
      const total = a.tasksCompleted + a.tasksFailed;
      a.successRate = total === 0 ? 1.0 : a.tasksCompleted / total;
    }
    res.json({
      byAgent,
      system: {
        totalTasks: tasks.length,
        activeTasks,
        queueDepth: activeTasks,
        uptimeSec: Math.floor(process.uptime())
      }
    });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// Derive a sensible category for tools that don't declare one (pre-existing tools).
function _catFor(t) {
  if (t.category) return t.category;
  const n = (t.name || '').toLowerCase();
  if (/price|token|coin|crypto|defi|sol_|eth_|wallet|nft|mint|market|whale|gas|ohlcv|fear|greed|jupiter|dex|rug/.test(n)) return 'Crypto & Markets';
  if (/security|scan|cve|vuln|audit|breach|password|ssl|dns|jwt|threat|phish|pwned/.test(n)) return 'Security & Trust';
  if (/image|img|flux|art|photo|music|audio|voice|speech|tts|video|media|color|palette|svg|css|design/.test(n)) return 'Media & Design';
  if (/file|read_|write_|list_|inbox|memory|note|save|obsidian|recall/.test(n)) return 'Files & Memory';
  if (/post_|tweet|telegram|discord|slack|social/.test(n)) return 'Social';
  if (/search|wiki|news|rss|github|npm|arxiv|reddit|hacker|fetch_url|scholar|book|weather|country|trend|define|dictionary/.test(n)) return 'Web & Research';
  if (/run_|calc|hash|json|base64|regex|uuid|encode|decode|convert|format|slug|case|morse|binary/.test(n)) return 'Dev & Utility';
  if (/agent|workflow|task|deploy|schedule|delegate|council|room|brain/.test(n)) return 'Agents & Workflow';
  return 'General';
}
// GET /api/agent/tools — List all available tools with schemas (incl. connected MCP tools)
router.get('/agent/tools', (req, res) => {
  const tools = Object.values(agentEngine.TOOLS).map(t => ({
    name: t.name, description: t.description, schema: t.schema, agents: t.agents, category: _catFor(t)
  }));
  let mcpTools = [];
  try {
    const mcp = require('./mcp-client');
    mcpTools = Object.values(mcp.getAgentTools()).map(t => ({
      name: t.name, description: t.description, schema: t.schema, agents: t.agents, category: 'MCP', mcp: true
    }));
  } catch {}
  res.json({ tools: [...tools, ...mcpTools], total: tools.length + mcpTools.length, mcpTools: mcpTools.length });
});

// POST /api/subscribe — beta waitlist email capture (codex "Join the Circle").
// Appends {email,source,ts} to gitignored backend/data/subscribers.json. Deduped.
router.post('/subscribe', (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const source = String((req.body && req.body.source) || 'web').slice(0, 40);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'valid email required' });
    const fp = require('path').join(__dirname, 'data', 'subscribers.json');
    let list = [];
    try { list = JSON.parse(require('fs').readFileSync(fp, 'utf8')); if (!Array.isArray(list)) list = []; } catch {}
    if (!list.some(s => s && s.email === email)) list.push({ email, source, ts: Date.now() });
    require('fs').writeFileSync(fp, JSON.stringify(list, null, 2));
    return res.json({ ok: true, count: list.length });
  } catch (e) { return fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// POST /api/tools/run — run ANY registered tool by name (reuses the agent-engine
// executor; does NOT reimplement tools). Mutating tools (post_to_x, etc.) allowed.
// Body: { tool: string, args?: object }
// → { ok:true, tool, result }  |  { ok:false, tool, error, needsAuth?:true }
router.post('/tools/run', async (req, res) => {
  const { tool, args = {} } = req.body || {};
  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ ok: false, error: 'tool (string) required' });
  }
  // SECURITY: read/compute tools stay open (the dashboard Tool Runner needs them), but
  // state-changing / resource-spending tools require auth (or an explicit env opt-in),
  // and REQUIRE_AUTH=true gates the whole endpoint for a locked-down public deploy.
  const MUTATING_TOOL = /(post_|send_|tweet|publish|mint|deploy|buy_|sell_|swap|execute_trade|transfer|write_file|make_music|generate_image|complete_job|bid_on|create_agent|schedule_task)/i;
  const _authed = !!(req.user || (process.env.ADMIN_TOKEN && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN));
  if (process.env.REQUIRE_AUTH === 'true' && !_authed) {
    return res.status(401).json({ ok: false, error: 'Authentication required (REQUIRE_AUTH).' });
  }
  if (MUTATING_TOOL.test(tool) && !_authed && process.env.ALLOW_MUTATING_TOOLS !== 'true') {
    return res.status(403).json({ ok: false, error: 'This tool changes state or spends resources — sign in (or set ALLOW_MUTATING_TOOLS=true) to run it.' });
  }
  // agent-engine tools first, then any connected MCP tools.
  let t = agentEngine.TOOLS[tool];
  if (!t || typeof t.execute !== 'function') {
    try { t = require('./mcp-client').getAgentTools()[tool]; } catch {}
  }
  if (!t || typeof t.execute !== 'function') {
    return res.status(404).json({ ok: false, error: `unknown tool: ${tool}` });
  }
  try {
    const raw = await t.execute(args || {});
    // Tools often return a JSON string; parse so we can surface needsAuth/success honestly.
    let parsed = raw;
    if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch {} }
    const isObj = parsed && typeof parsed === 'object';
    const needsAuth = isObj && (parsed.needsAuth || parsed.needsKey);
    const failed = isObj && parsed.success === false;
    if (failed) {
      return res.json({
        ok: false, tool,
        error: parsed.error || 'tool failed',
        ...(needsAuth ? { needsAuth: true } : {}),
        result: parsed
      });
    }
    return res.json({ ok: true, tool, result: parsed });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const needsAuth = /\b(key|token|auth|401|403|unauthorized|forbidden|not configured|credential|api_?key)\b/i.test(msg);
    return res.json({ ok: false, tool, error: msg, ...(needsAuth ? { needsAuth: true } : {}) });
  }
});

// ─── SOCIAL BYOK KEY STORAGE ────────────────────────────────────────────────
// POST /api/social/keys — save X/Telegram keys to backend/data/social-keys.json
//   Body: { provider:'x'|'telegram', keys:{...} }
//   x       → { apiKey, apiSecret, accessToken, accessSecret, bearer? }
//   telegram→ { botToken, chatId? }
router.post('/social/keys', (req, res) => {
  try {
    const { provider, keys } = req.body || {};
    if (!provider || !keys || typeof keys !== 'object') {
      return res.status(400).json({ ok: false, error: 'provider and keys required' });
    }
    const status = require('./social-keys').saveKeys(provider, keys);
    res.json({ ok: true, provider: String(provider).toLowerCase(), status });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// GET /api/social/status — { x:boolean, telegram:boolean } (env OR saved file)
router.get('/social/status', (req, res) => {
  try { res.json(require('./social-keys').status()); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// ─── PROVIDER GATEWAY ────────────────────────────────────────────────────────
// One endpoint the whole UI uses for chat. It never exposes which engine runs —
// Ollama first (free/local), cloud fallback only if configured. Returns uniform
// { ok, content, provider, model, tokens, costUSD } so the UI is engine-agnostic.
router.post('/model/chat', require('./demo-limit').middleware, async (req, res) => {
  try {
    const { messages, message, system, agent } = req.body || {};
    let msgs = Array.isArray(messages) ? messages.slice() : [];
    if (!msgs.length && message) msgs = [{ role: 'user', content: String(message) }];
    if (system) msgs.unshift({ role: 'system', content: String(system) });
    if (!msgs.length) return res.status(400).json({ ok: false, error: 'messages or message required' });

    // ── "Send to Chat" handoff: a message like "[SKILL: gen-image/action] <task>"
    //    executes that skill server-side (real tools) and returns its result inline,
    //    instead of sending the raw tag to the LLM. Fixes the Send-to-Chat error and
    //    enables the content-idea → image handoff (the skill's text becomes tool input).
    try {
      const lastUserMsg = [...msgs].reverse().find(m => m && m.role === 'user');
      const raw = lastUserMsg && typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';
      const m = raw.match(/^\s*\[SKILL:\s*([^\]/\s]+)(?:\/([^\]\s]+))?\s*\]\s*([\s\S]*)$/i);
      if (m) {
        const skillId = m[1];
        const action = m[2] || null;
        const task = (m[3] || '').trim();
        const input = task ? { prompt: task, text: task, query: task, concept: task, task } : {};
        if (action) input.action = action;
        try {
          const skillResult = await agentEngine.runSkill(skillId, input, agent);
          const content = typeof skillResult?.result === 'string'
            ? skillResult.result
            : JSON.stringify(skillResult?.result ?? skillResult, null, 2);
          return res.json({ ok: true, content, provider: 'skill-runner', model: skillId,
            tools_used: skillResult?.tools_used || [], skill: skillId,
            tokens: { input: 0, output: 0, total: 0 }, costUSD: 0 });
        } catch (skillErr) {
          return res.json({ ok: true, provider: 'skill-runner', model: skillId, skill: skillId,
            content: `Skill "${skillId}" could not run: ${skillErr.message}`,
            tokens: { input: 0, output: 0, total: 0 }, costUSD: 0 });
        }
      }
    } catch (_) { /* tag parse optional — fall through to normal chat */ }

    // ── AURA free-path: token-saver. If the exact/fuzzy cache or safe local compute can
    //    answer this prompt, return it for $0 / 0 tokens instead of calling the LLM. ──
    let auraPrompt = '';
    try {
      const lastUser = [...msgs].reverse().find(m => m && m.role === 'user');
      auraPrompt = (lastUser && typeof lastUser.content === 'string') ? lastUser.content : '';
      if (auraPrompt) {
        const hit = require('./lib/aura').route(auraPrompt, { scope: agent || '' });
        if (hit && hit.hit && hit.answer) {
          return res.json({ ok: true, content: hit.answer, provider: 'aura-cache',
            model: hit.method || 'aura', tokens: { input: 0, output: 0, total: 0 },
            costUSD: 0, cached: true, tokensSaved: hit.savedTokensEst || 0, similarity: hit.similarity });
        }
      }
    } catch (_) { /* AURA optional — fall through to the LLM */ }

    const r = await agentEngine.modelChat(msgs, agent || 'SHADDAI');
    // Record the real answer so future identical/similar prompts are free.
    try { if (auraPrompt && r && r.content) require('./lib/aura').recordAnswer(auraPrompt, r.content, { scope: agent || '' }); } catch (_) {}
    res.json({
      ok: true,
      content: r.content,
      provider: r.provider,
      model: r.model,
      tokens: { input: r.inputTokens, output: r.outputTokens, total: r.inputTokens + r.outputTokens, exact: r.exact },
      costUSD: r.costUSD,
      ragSources: r.ragSources
    });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// GET /api/model/health — which engines are reachable right now
router.get('/model/health', async (req, res) => {
  const out = { ok: true, providers: {} };
  // Ollama (local)
  try {
    const r = await fetch((process.env.OLLAMA_API_URL || 'http://localhost:11434') + '/api/tags', { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    out.providers.ollama = { online: r.ok, models: (d.models || []).map(m => m.name) };
  } catch { out.providers.ollama = { online: false, models: [] }; }
  // Cloud keys configured? (presence only — never expose the key)
  out.providers.groq = { configured: !!process.env.GROQ_API_KEY };
  out.providers.gemini = { configured: !!process.env.GEMINI_KEY };
  out.providers.openrouter = { configured: !!process.env.OPENROUTER_API_KEY };
  out.primary = out.providers.ollama.online ? 'ollama' : (out.providers.groq.configured ? 'groq' : 'none');
  res.json(out);
});

// ─── pay.sh guarded payment routes ──────────────────────────────────────────
// GET /api/pay/config — current guard config (caps, budget, enabled)
router.get('/pay/config', (req, res) => {
  try { res.json({ ok: true, config: require('./pay-guard').getConfig() }); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});
// POST /api/pay/config — update guard config (enable, set caps, allowlist). ADMIN ONLY — this controls the real-money spend guard.
router.post('/pay/config', requireAdmin, (req, res) => {
  try { res.json({ ok: true, config: require('./pay-guard').setConfig(req.body || {}) }); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});
// GET /api/pay/ledger — spend history + today's total
router.get('/pay/ledger', (req, res) => {
  try {
    const g = require('./pay-guard');
    res.json({ ok: true, spentToday: g.spentToday(), ledger: g.getLedger() });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});
// GET /api/pay/pending — calls awaiting human approval
router.get('/pay/pending', (req, res) => {
  try { res.json({ ok: true, pending: require('./pay-guard').getPending().filter(p => p.status === 'pending') }); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});
// POST /api/pay/approve { id, decision } — approve/deny a pending payment
router.post('/pay/approve', (req, res) => {
  try {
    const { id, decision } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const e = require('./pay-guard').resolvePending(id, decision === 'deny' ? 'deny' : 'approve');
    if (!e) return res.status(404).json({ ok: false, error: 'pending request not found' });
    res.json({ ok: true, request: e });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// ─── MCP (Model Context Protocol) routes ────────────────────────────────────
// GET /api/mcp/servers — list configured MCP servers + connection status
router.get('/mcp/servers', (req, res) => {
  try { res.json({ ok: true, servers: require('./mcp-client').listServers() }); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// POST /api/mcp/connect { serverId } — connect to a server, import its tools
router.post('/mcp/connect', async (req, res) => {
  try {
    const { serverId } = req.body || {};
    if (!serverId) return res.status(400).json({ ok: false, error: 'serverId required' });
    const result = await require('./mcp-client').connect(serverId);
    res.json({ ok: true, server: result.id, tools: result.tools.map(t => ({ name: t.name, description: t.description })) });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// POST /api/mcp/disconnect { serverId }
router.post('/mcp/disconnect', (req, res) => {
  try {
    const { serverId } = req.body || {};
    const ok = require('./mcp-client').disconnect(serverId);
    res.json({ ok, serverId });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// GET /api/mcp/tools?server= — list tools from connected MCP server(s)
router.get('/mcp/tools', (req, res) => {
  try { res.json({ ok: true, tools: require('./mcp-client').listTools(req.query.server) }); }
  catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// POST /api/mcp/call { tool, args } — call an MCP tool directly (tool = mcp__server__name)
router.post('/mcp/call', async (req, res) => {
  try {
    const { tool, args } = req.body || {};
    if (!tool) return res.status(400).json({ ok: false, error: 'tool required (mcp__server__name)' });
    const result = await require('./mcp-client').callTool(tool, args || {});
    res.json({ ok: true, result });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// POST /api/mcp/servers/add { id, transport, command?, args?, url?, headers?, description }
router.post('/mcp/servers/add', (req, res) => {
  try {
    const mcp = require('./mcp-client');
    const def = req.body || {};
    if (!def.id || !def.transport) return res.status(400).json({ ok: false, error: 'id and transport required' });
    const servers = mcp.loadConfig().filter(s => s.id !== def.id);
    servers.push({ disabled: false, ...def });
    mcp.saveConfig(servers);
    res.json({ ok: true, servers: mcp.listServers() });
  } catch (e) { fail(res, 500, 'internal_error', e.message, { ok: false }); }
});

// GET /api/agent/agents — List all agents with their tool grants
router.get('/agent/agents', (req, res) => {
  const agents = Object.values(agentEngine.AGENTS).map(a => ({
    name: a.name, role: a.role, goal: a.goal, tools: a.tools, keywords: a.keywords
  }));
  res.json({ agents, total: agents.length });
});

// POST /api/agent/tool — Execute a single tool directly
// Body: { tool: string, params: object, agent?: string }
router.post('/agent/tool', async (req, res) => {
  const { tool: toolName, params = {}, agent } = req.body;
  if (!toolName) return res.status(400).json({ error: 'tool name required' });
  const tool = agentEngine.TOOLS[toolName];
  if (!tool) return res.status(404).json({ error: 'Tool not found: ' + toolName, available: Object.keys(agentEngine.TOOLS) });
  try {
    const result = await tool.execute(params);
    let parsed; try { parsed = JSON.parse(result); } catch { parsed = result; }
    res.json({ success: true, tool: toolName, result: parsed });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message, { tool: toolName });
  }
});

// POST /api/agent/skill/:agentName/:skillId — Run a specific skill from agent MD file
// Loads the skill description, builds a goal prompt, runs through agent engine
router.post('/agent/skill/:agentName/:skillId', async (req, res) => {
  const agentName = req.params.agentName.toUpperCase();
  const skillId = req.params.skillId.toLowerCase();
  const { context = '', input = '' } = req.body;

  // Look up the skill from the agent's MD file
  const mdPath = path.join(__dirname, 'data', 'agents', agentName + '.md');
  let skillDesc = skillId;
  if (fs.existsSync(mdPath)) {
    const md = fs.readFileSync(mdPath, 'utf8');
    const rowRe = new RegExp('^\\|\\s*' + skillId + '\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|$', 'm');
    const m = md.match(rowRe);
    if (m) skillDesc = `${m[1].trim()}: ${m[2].trim()}`;
  }

  const goal = `Execute skill "${skillDesc}" for agent ${agentName}.${input ? '\n\nUser input: ' + input : ''}${context ? '\n\nContext: ' + context : ''}`;
  const task = agentEngine.createTask(goal, agentName);
  res.json({ success: true, taskId: task.id, agentName, skillId, goal });
  agentEngine.runAgentLoop(task.id).catch(e => console.error('[skill route]', e.message));
});

// GET /api/agent/inbox — Get inbox messages saved by agents
router.get('/agent/inbox', (req, res) => {
  try {
    const inboxFile = path.join(__dirname, 'data', 'inbox.json');
    const all = fs.existsSync(inboxFile) ? JSON.parse(fs.readFileSync(inboxFile, 'utf8')) : [];
    // SECURITY: the inbox is per-user. Only return the caller's own entries — never the
    // whole shared file (that leaked every user's agent outputs). Owner-less legacy
    // entries are withheld. TODO: tag save_to_inbox writes with the run's userId.
    const uid = String(req.headers['x-user-id'] || '').trim();
    const inbox = uid ? all.filter(it => it && it.owner === uid) : [];
    res.json({ inbox, total: inbox.length });
  } catch(e) { res.json({ inbox: [], error: e.message }); }
});

// GET /api/agent/test — Run engine self-test (verifies Groq + tools work)
router.get('/agent/test', async (req, res) => {
  try {
    const result = await agentEngine.selfTest();
    res.json({ success: result.status === 'completed', task: result });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message, { success: false });
  }
});

// GET /api/agent/workflows — list available workflow templates
router.get('/agent/workflows', (req, res) => {
  const templates = Object.entries(agentEngine.WORKFLOW_TEMPLATES).map(([id, t]) => ({
    id, name: t.name, description: t.description, stepCount: t.steps.length,
    agents: [...new Set(t.steps.map(s => s.agent))]
  }));
  res.json({ workflows: templates, total: templates.length });
});

// POST /api/agent/workflow/:id/run — kick off a named workflow template
// Body: { input?: string } — substituted into {{INPUT}} placeholders
router.post('/agent/workflow/:id/run', async (req, res) => {
  const wf = agentEngine.WORKFLOW_TEMPLATES[req.params.id];
  if (!wf) return res.status(404).json({ error: 'Unknown workflow', available: Object.keys(agentEngine.WORKFLOW_TEMPLATES) });
  const { input = '' } = req.body;
  // Substitute {{INPUT}} in each step
  const steps = wf.steps.map(s => ({ agent: s.agent, goal: s.goal.replace(/\{\{INPUT\}\}/g, input) }));
  try {
    const result = await agentEngine.runWorkflow(steps);
    res.json({ success: true, workflow: req.params.id, name: wf.name, ...result });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/agent/autonomous — SHADDAI plans + delegates to specialists, no human guidance
// Body: { goal: string }
router.post('/agent/autonomous', async (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ error: 'goal required' });
  // Return task id immediately; run in background
  const task = { id: require('crypto').randomUUID(), status: 'starting' };
  res.json({ success: true, taskId: task.id, mode: 'autonomous' });
  // Actually run and store
  agentEngine.runAutonomousCommander(goal).then(done => {
    console.log('[AUTONOMOUS] completed:', done.id, '| status:', done.status, '| delegated to:', done.delegations.map(d=>d.agent).join(', '));
  }).catch(e => console.error('[AUTONOMOUS] failed:', e.message));
});

// POST /api/agent/autonomous-sync — same as above but waits and returns full result
router.post('/agent/autonomous-sync', async (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ error: 'goal required' });
  try {
    const result = await agentEngine.runAutonomousCommander(goal);
    res.json({ success: result.status === 'completed', ...result });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// SSE streaming endpoint — browser subscribes here to receive live tool events
router.get('/agent/stream/:taskId', (req, res) => {
  const { taskId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);

  // Keep-alive ping every 15s
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15000);

  // Subscribe to events for this task
  const unsubscribe = agentEventBus.subscribe(taskId, (event) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // Auto-close on terminal events
      if (event.type === 'done' || event.type === 'error') {
        setTimeout(() => {
          clearInterval(ping);
          if (!res.writableEnded) res.end();
        }, 500);
      }
    }
  });

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

// Event bus health check
router.get('/agent/bus/stats', (req, res) => {
  res.json({
    ok: true,
    listenerCount: agentEventBus.listenerCount('task-event'),
    maxListeners: agentEventBus.getMaxListeners()
  });
});

// ═══════════════════════════════════════════════════════════════════
// SKILL LIBRARY ROUTES — unified access to ALL skills (5000+)
// ═══════════════════════════════════════════════════════════════════

// GET /api/skills/stats — how many skills available
router.get('/skills/stats', (req, res) => {
  res.json(agentEngine.skillIndex.getStats());
});

// GET /api/skills/recipes — list deterministic recipes
router.get('/skills/recipes', (req, res) => {
  res.json({ recipes: agentEngine.skillIndex.listRecipes() });
});

// GET /api/skills/find?query=...&agent=...&limit=10 — search across recipes + MD + Obsidian
router.get('/skills/find', (req, res) => {
  const { query, agent, limit } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  const results = agentEngine.skillIndex.findSkills(query, {
    agent,
    limit: parseInt(limit) || 10
  });
  res.json({ query, count: results.length, skills: results });
});

// POST /api/skills/run — execute ANY skill by ID
// Body: { skillId: string, input?: object, agent?: string }
// Returns: { taskId, status, result, tools_used, steps }
router.post('/skills/run', async (req, res) => {
  const { skillId, input = {}, agent, sync } = req.body;
  if (!skillId) return res.status(400).json({ error: 'skillId required' });

  // Async by default: skills (even tool-recipes with an LLM synthesis step) can take
  // minutes on a local model → return a taskId immediately and let the client poll
  // /api/agent/task/:id. Pass { sync: true } to block and get the result inline.
  if (sync) {
    try {
      const result = await agentEngine.runSkill(skillId, input, agent);
      return res.json(result);
    } catch(e) {
      return fail(res, 500, 'internal_error', e.message);
    }
  }

  // Async path: start the skill, return taskId immediately. Frontend polls /api/agent/task/:id.
  try {
    const taskId = require('crypto').randomUUID();
    // runSkill creates its own task internally; we kick it off and surface its task via a shim id.
    // Simpler: start runSkill without awaiting; capture its task id by wrapping.
    const p = agentEngine.runSkill(skillId, input, agent);
    // runSkill sets a task in the queue synchronously at start; find the newest skill task.
    // To reliably return the right id, await one microtask then read the latest task for this skill.
    setImmediate(() => {});
    p.catch(e => console.error('[skills/run async]', skillId, e.message));
    // Find the just-created task (runSkill adds it to taskQueue synchronously before any await)
    const tasks = agentEngine.getAllTasks().filter(t => t.skillId === skillId).sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
    const tid = tasks[0]?.id || taskId;
    return res.json({ taskId: tid, status: 'running', async: true, skillId });
  } catch(e) {
    return fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/skills/auto — find best matching skill for a query and run it
// Body: { query: string, input?: object }
router.post('/skills/auto', async (req, res) => {
  const { query, input = {} } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  const matches = agentEngine.skillIndex.findSkills(query, { limit: 1 });
  if (!matches.length) return res.status(404).json({ error: 'No matching skill found' });
  const top = matches[0];
  try {
    const result = await agentEngine.runSkill(top.id, input);
    res.json({ matched: top, ...result });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message, { matched: top });
  }
});

// POST /api/agent/skill/run — execute a named skill synchronously, return result inline
// Body: { agent: string, skillId: string, input?: string }
router.post('/agent/skill/run', async (req, res) => {
  const { agent, skillId, input = '' } = req.body;
  if (!agent || !skillId) return res.status(400).json({ error: 'agent and skillId required' });
  const agentUp = agent.toUpperCase();

  // Look up skill description from MD file
  const mdPath = path.join(__dirname, 'data', 'agents', agentUp + '.md');
  let skillDesc = skillId;
  if (fs.existsSync(mdPath)) {
    const md = fs.readFileSync(mdPath, 'utf8');
    const rowRe = new RegExp('^\\|\\s*' + skillId + '\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|$', 'm');
    const m = md.match(rowRe);
    if (m) skillDesc = `${m[1].trim()} — ${m[2].trim()}`;
  }

  const goal = `Execute skill: ${skillDesc}${input ? '\n\nUser input: ' + input : ''}\n\nUse your real tools to deliver concrete results. Save the output to a file.`;
  const task = agentEngine.createTask(goal, agentUp);
  try {
    await agentEngine.runAgentLoop(task.id);
    const done = agentEngine.getTask(task.id);
    res.json({ success: done.status === 'completed', taskId: task.id, agentName: agentUp, skillId, ...done });
  } catch(e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// ── TRADINGAGENTS (kept for users who want the Python framework) ──────────
// Free auto-trade analysis using local Ollama. Spawns Python subprocess.
// Setup: install once via /api/tradingagents/setup
const { spawn } = require('child_process');
const TA_ROOT = path.join(__dirname, '..', 'TradingAgents');
const TA_RUNS_FILE = path.join(DATA_DIR, 'tradingagents_runs.json');
let _taRuns = loadJSON(TA_RUNS_FILE, []);

// GET /api/tradingagents/status — check if TradingAgents is installed
router.get('/tradingagents/status', (req, res) => {
  const installed = fs.existsSync(path.join(TA_ROOT, 'main.py'));
  const venv = fs.existsSync(path.join(TA_ROOT, '.venv'));
  res.json({ installed, venv, root: TA_ROOT, runs: _taRuns.length });
});

// POST /api/tradingagents/setup — clone repo + install
router.post('/tradingagents/setup', async (req, res) => {
  if (fs.existsSync(path.join(TA_ROOT, 'main.py'))) {
    return res.json({ success: true, message: 'TradingAgents already installed', root: TA_ROOT });
  }
  res.json({
    success: false,
    message: 'Run these commands manually in your terminal:',
    commands: [
      `cd "${path.dirname(TA_ROOT)}"`,
      'git clone https://github.com/TauricResearch/TradingAgents.git',
      `cd "${TA_ROOT}"`,
      'python -m venv .venv',
      '.venv\\Scripts\\activate',
      'pip install .',
      'Then POST /api/tradingagents/setup again to verify'
    ],
    root: TA_ROOT
  });
});

// POST /api/tradingagents/analyze — run a trade analysis
// Body: { ticker: 'NVDA', date: '2026-05-16', provider: 'ollama' (default), model: 'llama3.2:3b' }
router.post('/tradingagents/analyze', async (req, res) => {
  const { ticker = 'NVDA', date = new Date().toISOString().slice(0,10), provider = 'ollama', model = 'llama3.2:3b' } = req.body;
  if (!fs.existsSync(path.join(TA_ROOT, 'main.py'))) {
    return res.status(503).json({ error: 'TradingAgents not installed. POST /api/tradingagents/setup for instructions.', root: TA_ROOT });
  }
  // Validate ticker (no path traversal)
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) return res.status(400).json({ error: 'Invalid ticker' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date (YYYY-MM-DD required)' });
  // SECURITY: provider/model are interpolated into executed Python — allow only safe chars (no quotes/parens/semicolons/newlines → no code injection).
  if (!/^[a-zA-Z0-9._-]{1,40}$/.test(provider)) return res.status(400).json({ error: 'Invalid provider' });
  if (!/^[a-zA-Z0-9._:/-]{1,60}$/.test(model)) return res.status(400).json({ error: 'Invalid model' });

  const run_id = 'ta_' + Date.now();
  const runEntry = { id: run_id, ticker, date, provider, model, status: 'running', started: new Date().toISOString() };
  _taRuns.unshift(runEntry);
  if (_taRuns.length > 100) _taRuns = _taRuns.slice(0, 100);
  saveJSON(TA_RUNS_FILE, _taRuns);

  res.json({ success: true, run_id, message: 'Analysis started — poll /api/tradingagents/run/' + run_id });

  // Execute in background
  const pyScript = `
import sys, json, os
os.chdir(r"${TA_ROOT}")
sys.path.insert(0, r"${TA_ROOT}")
try:
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.default_config import DEFAULT_CONFIG
    config = DEFAULT_CONFIG.copy()
    config["llm_provider"] = "${provider}"
    config["deep_think_llm"] = "${model}"
    config["quick_think_llm"] = "${model}"
    config["max_debate_rounds"] = 1
    ta = TradingAgentsGraph(debug=False, config=config)
    _, decision = ta.propagate("${ticker}", "${date}")
    print(json.dumps({"ok": True, "decision": str(decision)}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;
  const venvPython = fs.existsSync(path.join(TA_ROOT, '.venv', 'Scripts', 'python.exe'))
    ? path.join(TA_ROOT, '.venv', 'Scripts', 'python.exe')
    : 'python';
  const proc = spawn(venvPython, ['-c', pyScript], { cwd: TA_ROOT });
  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.on('close', code => {
    const idx = _taRuns.findIndex(r => r.id === run_id);
    if (idx !== -1) {
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop());
        _taRuns[idx].status = parsed.ok ? 'complete' : 'error';
        _taRuns[idx].decision = parsed.decision || null;
        _taRuns[idx].error = parsed.error || null;
      } catch {
        _taRuns[idx].status = code === 0 ? 'complete' : 'error';
        _taRuns[idx].decision = stdout.slice(-2000);
        _taRuns[idx].error = stderr.slice(-500) || null;
      }
      _taRuns[idx].finished = new Date().toISOString();
      saveJSON(TA_RUNS_FILE, _taRuns);
    }
  });
});

// GET /api/tradingagents/run/:id — fetch a specific run
router.get('/tradingagents/run/:id', (req, res) => {
  const run = _taRuns.find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json({ run });
});

// GET /api/tradingagents/runs — list all runs
router.get('/tradingagents/runs', (req, res) => {
  res.json({ runs: _taRuns.slice(0, 30), count: _taRuns.length });
});

// ── SOLANA PAY ────────────────────────────────────────────────────────────
// Build payment URLs + transaction requests using @solana/pay
let _solanaPay = null;
let _solanaWeb3 = null;
let _BigNumber = null;
try {
  _solanaPay = require('@solana/pay');
  _solanaWeb3 = require('@solana/web3.js');
  _BigNumber = require('bignumber.js');
} catch(e) {
  console.warn('[SolanaPay] packages not loaded:', e.message);
}

// Merchant wallet — MUST be set in .env before accepting live payments
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const MERCHANT_ADDRESS = process.env.SHADDAI_MERCHANT_WALLET || SYSTEM_PROGRAM;
const _merchantIsReal = !!process.env.SHADDAI_MERCHANT_WALLET && process.env.SHADDAI_MERCHANT_WALLET !== SYSTEM_PROGRAM;
if (!_merchantIsReal) {
  console.error('[SolanaPay] CRITICAL: SHADDAI_MERCHANT_WALLET not set — /api/pay/create is BLOCKED to prevent fund loss. Set your Solana wallet address in .env');
}
const PAYMENTS_FILE = path.join(DATA_DIR, 'solana_payments.json');
let _payments = loadJSON(PAYMENTS_FILE, []);

// POST /api/pay/create — create a Solana Pay URL for a product
router.post('/pay/create', async (req, res) => {
  if (!_merchantIsReal) return res.status(503).json({ error: 'SHADDAI_MERCHANT_WALLET not set in .env — add your Solana wallet address to enable payments' });
  try {
    if (!_solanaPay) return res.status(503).json({ error: '@solana/pay not installed' });
    const { item = 'item', amount = 0.001, currency = 'SOL', label = 'SHADDAI', message } = req.body;
    const reference = _solanaWeb3.Keypair.generate().publicKey;
    const recipient = new _solanaWeb3.PublicKey(MERCHANT_ADDRESS);
    const amountBN = new _BigNumber(amount);
    const memo = `SHADDAI:${item}:${Date.now()}`;
    const url = _solanaPay.encodeURL({
      recipient,
      amount: amountBN,
      reference,
      label,
      message: message || `Buy ${item} via SHADDAI`,
      memo
    });
    const payment = {
      id: 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      item, amount, currency, label, message,
      reference: reference.toBase58(),
      recipient: recipient.toBase58(),
      url: url.toString(),
      status: 'pending',
      created: new Date().toISOString()
    };
    _payments.unshift(payment);
    if (_payments.length > 500) _payments = _payments.slice(0, 500);
    saveJSON(PAYMENTS_FILE, _payments);
    res.json({ success: true, payment });
  } catch(e) {
    console.error('[pay/create]', e.message);
    fail(res, 500, 'internal_error', e.message);
  }
});

// Rate limiter for pay/status — max 1 call per 3s per reference
const _payStatusCalls = new Map();
function _payStatusRateLimit(ref) {
  const now = Date.now();
  const last = _payStatusCalls.get(ref) || 0;
  if (now - last < 3000) return false;
  _payStatusCalls.set(ref, now);
  if (_payStatusCalls.size > 1000) { // Prevent unbounded growth
    const oldest = [..._payStatusCalls.entries()].sort((a,b) => a[1]-b[1]).slice(0, 200);
    oldest.forEach(([k]) => _payStatusCalls.delete(k));
  }
  return true;
}

// GET /api/pay/status/:reference — check if payment was made
router.get('/pay/status/:reference', async (req, res) => {
  try {
    if (!_solanaPay) return res.status(503).json({ error: '@solana/pay not installed' });
    const { reference } = req.params;
    // Validate reference is a valid base58 public key (43-44 chars)
    if (!reference || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(reference)) {
      return res.status(400).json({ error: 'invalid reference' });
    }
    if (!_payStatusRateLimit(reference)) {
      return res.status(429).json({ status: 'pending', error: 'Rate limited — poll max once per 3s' });
    }
    const refKey = new _solanaWeb3.PublicKey(reference);
    const rpcUrl = HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'https://api.mainnet-beta.solana.com';
    const conn = new _solanaWeb3.Connection(rpcUrl, 'confirmed');
    // Get current slot for minContextSlot so findReference doesn't return stale results
    let minContextSlot;
    try { minContextSlot = await conn.getSlot(); } catch {}
    try {
      const opts = { finality: 'confirmed' };
      if (minContextSlot) opts.minContextSlot = minContextSlot - 10; // small buffer for slot lag
      const sig = await _solanaPay.findReference(conn, refKey, opts);
      // Mark payment paid
      const idx = _payments.findIndex(p => p.reference === reference);
      if (idx !== -1 && _payments[idx].status !== 'paid') {
        _payments[idx].status = 'paid';
        _payments[idx].signature = sig.signature;
        _payments[idx].paidAt = new Date().toISOString();
        saveJSON(PAYMENTS_FILE, _payments);
      }
      res.json({ status: 'paid', signature: sig.signature, slot: sig.slot });
    } catch(_) {
      res.json({ status: 'pending' });
    }
  } catch(e) {
    res.json({ status: 'pending', error: e.message });
  }
});

// GET /api/pay/list — list the CALLER'S recent payments (scoped, not global)
router.get('/pay/list', (req, res) => {
  const uid = String(req.headers['x-user-id'] || '').trim();
  const mine = uid ? _payments.filter(p => p && (p.owner === uid || p.userId === uid || p.from === uid)) : [];
  res.json({ payments: mine.slice(0, 50), count: mine.length });
});

// POST /api/pay/nl — natural language → Solana Pay (Claude-style: "buy some water with pay")
router.post('/pay/nl', async (req, res) => {
  try {
    const rawCmd = req.body?.command || '';
    if (typeof rawCmd !== 'string') return res.status(400).json({ error: 'command must be a string' });
    const command = rawCmd.slice(0, 300).replace(/[<>]/g, ''); // length cap + strip HTML chars
    // Simple parser: look for verb + noun + optional amount
    const norm = command.toLowerCase().trim();
    const STOCK_ITEMS = {
      // Agent services — the core SHADDAI use case
      shaddai:      { item: 'SHADDAI Task',              amount: 0.005, emoji: '⚡', category: 'agent' },
      nexus:        { item: 'NEXUS Backend Task',         amount: 0.002, emoji: '🔧', category: 'agent' },
      zerox:        { item: 'ZEROX Revenue Analysis',     amount: 0.003, emoji: '💰', category: 'agent' },
      oracle:       { item: 'ORACLE Research Task',       amount: 0.003, emoji: '🔮', category: 'agent' },
      turtle:       { item: 'TURTLE Design Task',         amount: 0.004, emoji: '🎨', category: 'agent' },
      quill:        { item: 'QUILL Writing Task',         amount: 0.002, emoji: '✍',  category: 'agent' },
      pikadon:      { item: 'PIKADON Security Audit',     amount: 0.003, emoji: '🛡',  category: 'agent' },
      // Subscription tiers
      builder:      { item: 'Builder Plan (1 month)',     amount: 0.12,  emoji: '🏗',  category: 'subscription' },
      pro:          { item: 'Pro Plan (1 month)',          amount: 0.32,  emoji: '🚀', category: 'subscription' },
      alpha:        { item: 'Alpha Plan (1 month)',        amount: 1.30,  emoji: '👑', category: 'subscription' },
      // Common service types
      audit:        { item: 'Security Audit',             amount: 0.05,  emoji: '🔍', category: 'service' },
      review:       { item: 'Code Review',                amount: 0.025, emoji: '📋', category: 'service' },
      consult:      { item: 'Strategy Consultation',      amount: 0.08,  emoji: '🧠', category: 'service' },
      report:       { item: 'Market Report',              amount: 0.015, emoji: '📊', category: 'service' },
      deploy:       { item: 'Agent Deployment',           amount: 0.05,  emoji: '🚀', category: 'service' },
      integration:  { item: 'API Integration',            amount: 0.075, emoji: '🔗', category: 'service' },
      // Legacy food items kept for backward compat
      coffee:       { item: 'Coffee',                     amount: 0.012, emoji: '☕', category: 'misc' },
      lunch:        { item: 'Lunch',                      amount: 0.05,  emoji: '🍽', category: 'misc' },
    };
    // Match order: agent > subscription > service > misc
    let match = null;
    const orderedKeys = Object.keys(STOCK_ITEMS).sort((a,b) => {
      const order = { agent:0, subscription:1, service:2, misc:3 };
      return (order[STOCK_ITEMS[a].category]||9) - (order[STOCK_ITEMS[b].category]||9);
    });
    for (const k of orderedKeys) {
      if (norm.includes(k)) { match = { key: k, ...STOCK_ITEMS[k] }; break; }
    }
    if (!match) {
      // Fallback: extract noun after action verb
      const m = norm.match(/(?:pay for|buy|hire|get|create|request)\s+(?:some\s+|a\s+|the\s+|an\s+)?(\w+)/);
      const item = m ? (m[1].charAt(0).toUpperCase() + m[1].slice(1)) : 'Custom Service';
      match = { item, amount: 0.01, emoji: '⚡', category: 'custom' };
    }
    // Allow override amount: "0.5 sol" or "$5"
    const amtMatch = norm.match(/([\d.]+)\s*(sol|usdc|\$)/);
    if (amtMatch) {
      const v = parseFloat(amtMatch[1]);
      if (!isNaN(v)) match.amount = amtMatch[2] === '$' ? +(v / 150).toFixed(6) : v;
    }
    // Create payment
    if (!_solanaPay) return res.json({ error: '@solana/pay not installed', parsed: match });
    const reference = _solanaWeb3.Keypair.generate().publicKey;
    const recipient = new _solanaWeb3.PublicKey(MERCHANT_ADDRESS);
    const amountBN = new _BigNumber(match.amount);
    const memo = `SHADDAI:NL:${match.item}:${Date.now()}`;
    const url = _solanaPay.encodeURL({
      recipient,
      amount: amountBN,
      reference,
      label: 'SHADDAI',
      message: `${match.emoji || ''} ${match.item}`.trim(),
      memo
    });
    const payment = {
      id: 'pay_nl_' + Date.now(),
      item: match.item, amount: match.amount, currency: 'SOL',
      label: 'SHADDAI', message: match.item, emoji: match.emoji || '🛒',
      reference: reference.toBase58(),
      recipient: recipient.toBase58(),
      url: url.toString(),
      status: 'pending', source: 'nl', command,
      created: new Date().toISOString()
    };
    _payments.unshift(payment);
    if (_payments.length > 500) _payments = _payments.slice(0, 500);
    saveJSON(PAYMENTS_FILE, _payments);
    res.json({ success: true, payment, parsed: match });
  } catch(e) {
    console.error('[pay/nl]', e.message);
    fail(res, 500, 'internal_error', e.message);
  }
});

// ─────────────────────────────────────────────────────────────
// OHLC Candlestick Data — CoinGecko free API (no key required)
// Returns: { symbol, candles: [{time, ts, open, high, low, close}] }
// ─────────────────────────────────────────────────────────────
const _OHLC_SYMBOL_MAP = {
  BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin',
  ADA:'cardano', XRP:'ripple', DOGE:'dogecoin', AVAX:'avalanche-2',
  DOT:'polkadot', MATIC:'matic-network', LINK:'chainlink',
  UNI:'uniswap', ATOM:'cosmos', LTC:'litecoin', BCH:'bitcoin-cash'
};
const _OHLC_CACHE = new Map();

router.get('/prices/ohlc', async (req, res) => {
  const symbol = (req.query.symbol || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const coinId = _OHLC_SYMBOL_MAP[symbol] || symbol.toLowerCase();
  const cacheKey = `ohlc:${coinId}:${days}`;

  const cached = _OHLC_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const r = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc`,
      { params: { vs_currency: 'usd', days }, timeout: 10000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SHADDAI/1.0' } }
    );
    // CoinGecko OHLC format: [[timestamp_ms, open, high, low, close], ...]
    const candles = r.data.map(([t, o, h, l, c]) => ({
      time: new Date(t).toISOString(), ts: t, open: o, high: h, low: l, close: c
    }));
    const result = { symbol, coinId, days, candles, fetchedAt: new Date().toISOString(), cached: false };
    _OHLC_CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.json(result);
  } catch (e) {
    const status = e.response?.status === 404 ? 404 : e.response?.status === 429 ? 429 : 502;
    res.status(status).json({ error: e.response?.data?.error || e.message, symbol, coinId });
  }
});


// ─────────────────────────────────────────────────────────────
// SIGNAL POSTING — post trading calls to Telegram / Discord
// POST /api/signals/post
// Body: { ticker, price, chg24, chg7, consensus, votes, fearGreed, fearGreedLabel, volume, targets }
// ─────────────────────────────────────────────────────────────
router.post('/signals/post', async (req, res) => {
  const {
    ticker = 'SOL', price, chg24, chg7, consensus = 'HOLD',
    votes = [], fearGreed, fearGreedLabel, volume,
    targets, note = ''
  } = req.body;

  const arrow   = chg24 >= 0 ? '📈' : '📉';
  const verdict = consensus === 'BUY' ? '🟢 BUY' : consensus === 'SELL' ? '🔴 SELL' : '🟡 HOLD';
  const fgLine  = fearGreed != null ? `😰 Fear & Greed: ${fearGreed} — ${fearGreedLabel || ''}` : '';
  const volLine = volume ? `💧 Volume 24h: $${(parseFloat(volume)/1e6).toFixed(1)}M` : '';
  const buyCount  = votes.filter(v => v.vote === 'BUY').length;
  const sellCount = votes.filter(v => v.vote === 'SELL').length;
  const holdCount = votes.filter(v => v.vote === 'HOLD').length;
  const agentSummary = votes.slice(0,3).map(v =>
    `  ${v.vote==='BUY'?'🟢':v.vote==='SELL'?'🔴':'🟡'} ${v.agent}: ${(v.reason||v.raw||'').slice(0,60)}`
  ).join('\n');
  const targetLine = targets ? `\n🎯 Targets: ${targets}` : '';
  const noteLine   = note ? `\n📝 ${note}` : '';

  const msg = `⚡ *SHADDAI SIGNAL — $${ticker}*
━━━━━━━━━━━━━━━━━━━━
💰 Price: $${price != null ? parseFloat(price).toFixed(price < 1 ? 6 : 2) : 'N/A'}
${arrow} 24h: ${chg24 >= 0 ? '+' : ''}${parseFloat(chg24||0).toFixed(2)}% | 7d: ${chg7 >= 0 ? '+' : ''}${parseFloat(chg7||0).toFixed(2)}%
${fgLine}
${volLine}

🧠 *Council Vote:* ${buyCount} BUY · ${holdCount} HOLD · ${sellCount} SELL
${agentSummary}
${targetLine}${noteLine}

*VERDICT: ${verdict}*
━━━━━━━━━━━━━━━━━━━━
🤖 SHADDAI Agent Dashboard`;

  const results = {};

  // Post to Telegram
  const tgToken  = process.env.TELEGRAM_SIGNAL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  const tgChatId = process.env.TELEGRAM_SIGNAL_CHAT_ID   || process.env.TELEGRAM_CHAT_ID   || '';
  if (tgToken && tgChatId) {
    try {
      await axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        chat_id: tgChatId, text: msg, parse_mode: 'Markdown'
      }, { timeout: 10000 });
      results.telegram = 'sent';
    } catch(e) { results.telegram = 'error: ' + (e.response?.data?.description || e.message); }
  } else {
    results.telegram = 'not configured — add TELEGRAM_SIGNAL_BOT_TOKEN + TELEGRAM_SIGNAL_CHAT_ID to .env';
  }

  // Post to Discord
  const discordUrl = process.env.DISCORD_SIGNAL_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  if (discordUrl) {
    try {
      await axios.post(discordUrl, {
        content: msg.replace(/\*/g, '**'),
        username: 'SHADDAI Signals'
      }, { timeout: 10000 });
      results.discord = 'sent';
    } catch(e) { results.discord = 'error: ' + e.message; }
  } else {
    results.discord = 'not configured — add DISCORD_SIGNAL_WEBHOOK_URL to .env';
  }

  const anySent = Object.values(results).some(v => v === 'sent');
  res.json({ success: anySent, ticker, consensus, results, message: msg });
});

// ─────────────────────────────────────────────────────────────
// COUNCIL CONSENSUS — real market data drives agent votes
// Each agent has a distinct personality/threshold. Instant response.
// GET /api/council/consensus?ticker=SOL
// ─────────────────────────────────────────────────────────────
router.get('/council/consensus', async (req, res) => {
  const ticker = String(req.query.ticker || 'SOL').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const WEIGHTS = { ORACLE:0.35, ZEROX:0.30, NEXUS:0.15, PIKADON:0.10, SHADDAI:0.10 };
  const PAIR_IDS = { BTC:'90', ETH:'80', SOL:'48543', BNB:'2710', DOGE:'2', ADA:'257', XRP:'58', MATIC:'3890' };

  // Fetch live price data from CoinLore
  let chg24 = 0, chg7 = 0, price = 0, vol24 = 0, mktCap = 0;
  try {
    const coinId = PAIR_IDS[ticker] || '48543';
    const pr = await axios.get(`https://api.coinlore.net/api/ticker/?id=${coinId}`, { timeout: 6000 });
    const d = pr.data?.[0] || {};
    chg24  = parseFloat(d.percent_change_24h) || 0;
    chg7   = parseFloat(d.percent_change_7d)  || 0;
    price  = parseFloat(d.price_usd) || 0;
    vol24  = parseFloat(d.volume24) || 0;
    mktCap = parseFloat(d.market_cap_usd) || 0;
  } catch { /* use neutral if CoinLore down */ }

  // Momentum score: -10 to +10
  const momentum = Math.max(-10, Math.min(10, chg24 * 0.6 + chg7 * 0.4));

  // Each agent has a distinct personality that interprets momentum differently
  function agentVote(name, momentum) {
    const jitter = ((name.charCodeAt(0) * 7 + name.charCodeAt(1||0) * 3) % 20 - 10) * 0.05; // tiny deterministic offset per agent
    const m = momentum + jitter;
    const reasons = {
      ORACLE: {
        BUY:  `${ticker} 24h momentum +${chg24.toFixed(1)}% — technical breakout pattern`,
        SELL: `${ticker} -${Math.abs(chg24).toFixed(1)}% — bearish trend confirmation`,
        HOLD: `${ticker} consolidating — waiting for volume confirmation`
      },
      ZEROX: {
        BUY:  `Risk/reward favorable at current levels — 7d trend +${chg7.toFixed(1)}%`,
        SELL: `Profit-taking zone — risk outweighs reward after ${chg7.toFixed(1)}% run`,
        HOLD: `Neutral risk/reward — no clear edge for entry or exit`
      },
      NEXUS: {
        BUY:  `On-chain activity up — network utilization increasing with price`,
        SELL: `Network fee spike suggests sell pressure building`,
        HOLD: `Stable network metrics — no on-chain signal`
      },
      PIKADON: {
        BUY:  `Volatility within acceptable risk parameters — low drawdown risk`,
        SELL: `High volatility flag — protect capital, exit overexposed positions`,
        HOLD: `Position size risk neutral — monitor regulatory signals`
      },
      SHADDAI: {
        BUY:  `Macro regime favors risk assets — ${ticker} aligned with BTC dominance trend`,
        SELL: `Macro headwinds — broader market correlation suggests exit`,
        HOLD: `Mixed macro signals — hold and reassess next session`
      }
    };
    // ORACLE: trend follower (low threshold)
    // ZEROX: value-focused (medium threshold)
    // NEXUS: on-chain momentum (medium-low)
    // PIKADON: risk-averse (high threshold — needs strong signal)
    // SHADDAI: macro-driven (medium)
    const thresholds = { ORACLE: 1.5, ZEROX: 3.0, NEXUS: 2.0, PIKADON: 5.0, SHADDAI: 2.5 };
    const t = thresholds[name] || 2.5;
    const vote = m > t ? 'BUY' : m < -t ? 'SELL' : 'HOLD';
    const confidence = Math.min(10, Math.max(3, Math.round(4 + Math.abs(m) * 0.6)));
    const reason = (reasons[name] || {})[vote] || `Analyzing ${ticker} conditions`;
    return { agent: name, vote, confidence, reason, raw: `${vote} (${confidence}/10): ${reason}`.slice(0, 120), weight: WEIGHTS[name] };
  }

  const votes = Object.keys(WEIGHTS).map(name => agentVote(name, momentum));
  const weightedScore = votes.reduce((s, v) => s + (v.vote==='BUY'?1:v.vote==='SELL'?-1:0) * v.weight * (v.confidence||5)/10, 0);
  const consensus = weightedScore > 0.12 ? 'BUY' : weightedScore < -0.12 ? 'SELL' : 'HOLD';
  res.json({
    ticker, votes, consensus, weightedScore, onlineAgents: votes.length,
    marketData: { price, chg24, chg7, vol24, mktCap, momentum: parseFloat(momentum.toFixed(2)) }
  });
});

// ─────────────────────────────────────────────────────────────
// VIDEO CLIPPER — yt-dlp download + Groq Whisper transcription
// Requires: yt-dlp in PATH (https://github.com/yt-dlp/yt-dlp)
//           GROQ_API_KEY in .env for transcription
// ─────────────────────────────────────────────────────────────
const { execFile } = require('child_process');
const CLIPS_DIR = path.join(DATA_DIR, 'clips');
try { fs.mkdirSync(CLIPS_DIR, { recursive: true }); } catch {}

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';

function probeYtdlp() {
  return new Promise((resolve) => {
    execFile(YTDLP_BIN, ['--version'], { timeout: 5000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

// POST /api/clip — download full video or time-range clip
router.post('/clip', async (req, res) => {
  const { url, quality = '720', mode = 'video', start, end } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  // SECURITY: validate URL before handing it to yt-dlp (injection / SSRF).
  if (!/^https?:\/\//.test(url) || String(url).startsWith('-')) {
    return res.status(400).json({ error: 'invalid url' });
  }
  if (await enforceCredits(req, res, 'clip_generate')) return; // charge before clipping

  const ver = await probeYtdlp();
  if (!ver) return res.status(503).json({
    error: 'yt-dlp not installed. Get it free at https://github.com/yt-dlp/yt-dlp — then restart the server.'
  });

  const ext = mode === 'audio' ? '.mp3' : '.mp4';
  const filename = 'clip_' + Date.now() + ext;
  const outPath = path.join(CLIPS_DIR, filename);
  const args = [];

  if (mode === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('-f', `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`, '--merge-output-format', 'mp4');
  }

  if (start || end) {
    const pp = [(start ? '-ss ' + start : ''), (end ? '-to ' + end : '')].filter(Boolean).join(' ');
    if (pp) args.push('--postprocessor-args', 'ffmpeg:' + pp);
  }

  args.push('-o', outPath, '--no-playlist', '--', url);

  try {
    await new Promise((resolve, reject) => {
      execFile(YTDLP_BIN, args, { timeout: 300000 }, (err, _stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).slice(0, 400)));
        else resolve();
      });
    });
    res.json({ downloadUrl: `/api/clip/files/${filename}`, filename, quality });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// GET /api/clip/files/:filename — serve clip file then auto-delete after 10 min
router.get('/clip/files/:filename', (req, res) => {
  const fname = path.basename(req.params.filename);
  const fpath = path.join(CLIPS_DIR, fname);
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'File not found or expired' });
  res.download(fpath, fname);
  setTimeout(() => { try { fs.unlinkSync(fpath); } catch {} }, 10 * 60 * 1000);
});

// POST /api/clip/transcribe — yt-dlp audio extraction + Groq Whisper STT
router.post('/clip/transcribe', require('./demo-limit').middleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  // SECURITY: validate URL before handing it to yt-dlp (injection / SSRF).
  if (!/^https?:\/\//.test(url) || String(url).startsWith('-')) {
    return res.status(400).json({ error: 'invalid url' });
  }
  if (await enforceCredits(req, res, 'clip_generate')) return; // charge before transcribing

  const GROQ_KEY_LOCAL = process.env.GROQ_API_KEY || '';
  if (!GROQ_KEY_LOCAL) return res.status(503).json({
    error: 'GROQ_API_KEY not set in .env — needed for Whisper transcription. Get a free key at groq.com'
  });

  const ver = await probeYtdlp();
  if (!ver) return res.status(503).json({ error: 'yt-dlp not installed' });

  const tmpFile = path.join(CLIPS_DIR, 'trans_' + Date.now() + '.mp3');
  let title = url;

  try {
    // Get title
    await new Promise((resolve) => {
      execFile(YTDLP_BIN, ['--get-title', '--no-playlist', '--', url], { timeout: 15000 }, (err, stdout) => {
        if (!err && stdout.trim()) title = stdout.trim();
        resolve();
      });
    });

    // Extract audio (max 25MB — Groq file limit)
    await new Promise((resolve, reject) => {
      execFile(YTDLP_BIN, [
        '-x', '--audio-format', 'mp3', '--audio-quality', '5',
        '--max-filesize', '24m', '--no-playlist',
        '-o', tmpFile, '--', url
      ], { timeout: 180000 }, (err, _o, stderr) => {
        if (err) reject(new Error((stderr || err.message).slice(0, 400)));
        else resolve();
      });
    });

    if (!fs.existsSync(tmpFile)) throw new Error('Audio extraction produced no file');

    // Send to Groq Whisper via form-data
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(tmpFile), { filename: 'audio.mp3', contentType: 'audio/mpeg' });
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'text');
    form.append('language', 'en');

    const gResp = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${GROQ_KEY_LOCAL}` },
      timeout: 120000,
      maxContentLength: Infinity
    });

    try { fs.unlinkSync(tmpFile); } catch {}
    const transcription = typeof gResp.data === 'string' ? gResp.data : (gResp.data?.text || '');
    res.json({ transcription, title });

  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch {}
    fail(res, 500, 'internal_error', e.message);
  }
});

// ═══════════════════════════════════════════════════════════════════
// LLM OBSERVABILITY ROUTES — lightweight call tracer
// ═══════════════════════════════════════════════════════════════════

// GET /api/llm/traces — ring-buffer stats: total calls, tokens, cost, by provider/agent
router.get('/llm/traces', (req, res) => {
  try {
    const tracer = require('./llm-tracer');
    res.json(tracer.getStats());
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// ═══════════════════════════════════════════════════════════════════
// CACHE ANALYTICS ROUTES — pure-JS tool-result cache
// ═══════════════════════════════════════════════════════════════════

// GET /api/cache/stats — hit rate, miss count, entries by category
router.get('/cache/stats', (req, res) => {
  try {
    const cache = require('./cache-analytics');
    res.json(cache.getStats());
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// POST /api/cache/clear — evict all expired entries, returns count cleared
router.post('/cache/clear', (req, res) => {
  try {
    const cache = require('./cache-analytics');
    const cleared = cache.clearExpired();
    res.json({ cleared, message: `Cleared ${cleared} expired cache entries` });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message);
  }
});

// ═══════════════════════════════════════════════════════════════════
// BYOK (Bring Your Own Key) — tier-gated API key storage
// Free: no keys. Builder: groq+gemini. Pro/Alpha: all providers.
// ═══════════════════════════════════════════════════════════════════
const BYOK_FILE = path.join(DATA_DIR, 'byok-keys.json');
const BYOK_TIER_PERMS = {
  // Free providers (user pays $0 to the provider) are open to EVERYONE so beta
  // testers can bring their own free Groq/Gemini/OpenRouter key. Paid providers
  // (claude/openai/perplexity) still require Pro.
  free:    ['groq', 'gemini', 'openrouter'],
  builder: ['groq', 'gemini', 'openrouter'],
  pro:     ['groq', 'gemini', 'claude', 'openai', 'perplexity', 'openrouter'],
  alpha:   ['groq', 'gemini', 'claude', 'openai', 'perplexity', 'openrouter']
};
const VALID_PROVIDERS = ['groq', 'gemini', 'claude', 'openai', 'perplexity', 'openrouter'];

function maskKey(k) {
  if (!k || typeof k !== 'string' || k.length < 8) return '***';
  return k.slice(0, 4) + '...' + k.slice(-4);
}

// POST /api/byok/set — store BYOK key with tier validation
router.post('/byok/set', (req, res) => {
  try {
    // SECURITY: never trust a client-supplied `tier` to decide permissions —
    // derive it server-side from the customer record, defaulting to the lowest
    // tier (free). Any `tier` in the body is ignored.
    const { provider, key } = req.body || {};
    let tier = 'free';
    try {
      const devFallback = process.env.NODE_ENV === 'production' ? '' : (req.headers['x-user-id'] || req.query.userId || '');
      const uid = String(req.userId || devFallback || '').replace(/[^a-zA-Z0-9_@.-]/g, '');
      // FIX: customers.json lives in backend/data/, not backend/. The old path
      // (__dirname/customers.json) never existed, so every user silently fell back
      // to the 'free' tier and Pro users could not save paid-provider keys.
      const customersFile = path.join(DATA_DIR, 'customers.json');
      if (uid && fs.existsSync(customersFile)) {
        const db = JSON.parse(fs.readFileSync(customersFile, 'utf8'));
        const customer = Object.prototype.hasOwnProperty.call(db, uid) ? db[uid] : null;
        if (customer && customer.tier) tier = customer.tier;
      }
    } catch (e) { /* default to free on any lookup failure */ }
    if (!provider || !key) {
      return res.status(400).json({ error: 'provider and key are required' });
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }
    const allowed = BYOK_TIER_PERMS[tier];
    if (!allowed) {
      return res.status(400).json({ error: `Invalid tier. Must be: free|builder|pro|alpha` });
    }
    if (allowed.length === 0) {
      return res.status(403).json({ error: 'Upgrade to Builder to set API keys' });
    }
    if (!allowed.includes(provider)) {
      const required = provider === 'groq' || provider === 'gemini' ? 'Builder' : 'Pro';
      return res.status(403).json({ error: `Upgrade to ${required} to set ${provider} key` });
    }
    try { ensureDataDir(); } catch (_) {}
    const store = loadJSON(BYOK_FILE, {});
    store[`${tier}:${provider}`] = { key, provider, tier, updatedAt: new Date().toISOString() };
    saveJSON(BYOK_FILE, store);
    let masked = ''; try { masked = maskKey(key); } catch (_) { masked = '***'; }
    console.log(`[BYOK] Set ${provider} key for tier=${tier} (key=${masked})`);
    return res.json({ ok: true, message: `Key set for ${provider}` });
  } catch (e) {
    console.error('[BYOK] set error:', (e && e.stack) || e);   // full stack surfaces the real cause in Render logs
    return fail(res, 500, 'internal_error', (e && e.message) || 'byok set failed');
  }
});

// GET /api/byok/status — which providers have keys (never returns actual keys)
router.get('/byok/status', (req, res) => {
  try {
    const store = loadJSON(BYOK_FILE, {});
    const status = {};
    for (const p of VALID_PROVIDERS) status[p] = false;
    for (const compoundKey of Object.keys(store)) {
      const provider = compoundKey.split(':')[1];
      if (provider && store[compoundKey] && store[compoundKey].key) {
        status[provider] = true;
      }
    }
    return res.json(status);
  } catch (e) {
    return fail(res, 500, 'internal_error', e.message);
  }
});

// ═════════════════════════════════════════════════════════════════
// COLLECTIBLES — direct routes backed by agent-engine TOOLS
// Persists to backend/data/collectibles.json
// ═════════════════════════════════════════════════════════════════
const COLLECTIBLES_FILE = path.join(__dirname, 'data', 'collectibles.json');
function _readCollectibles() {
  try { return JSON.parse(fs.readFileSync(COLLECTIBLES_FILE, 'utf8')); } catch { return []; }
}

// POST /api/collectibles/mint — mint a new NFT-style collectible
router.post('/collectibles/mint', async (req, res) => {
  try {
    const { name, rarity, owner } = req.body || {};
    if (!name || !rarity || !owner) return res.status(400).json({ ok: false, error: 'name, rarity, owner required' });
    const tool = agentEngine.TOOLS.mint_collectible;
    if (!tool) return fail(res, 500, 'internal_error', 'mint_collectible tool not available', { ok: false });
    const result = await tool.execute({ name, rarity, owner });
    const list = _readCollectibles();
    const minted = list[list.length - 1] || null;
    res.json({ ok: true, data: { message: result, collectible: minted } });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// GET /api/collectibles — return full collectibles.json array
router.get('/collectibles', (req, res) => {
  try {
    res.json({ ok: true, data: _readCollectibles() });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// POST /api/collectibles/list — list a collectible for sale at credit price
router.post('/collectibles/list', async (req, res) => {
  try {
    const { id, priceCredits } = req.body || {};
    if (id === undefined || priceCredits === undefined) return res.status(400).json({ ok: false, error: 'id and priceCredits required' });
    const tool = agentEngine.TOOLS.list_collectible;
    if (!tool) return fail(res, 500, 'internal_error', 'list_collectible tool not available', { ok: false });
    const result = await tool.execute({ id, priceCredits });
    const list = _readCollectibles();
    const item = list.find(c => Number(c.id) === Number(id)) || null;
    res.json({ ok: true, data: { message: result, collectible: item } });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// GET /api/collectibles/listings — only items with .listing set
router.get('/collectibles/listings', (req, res) => {
  try {
    const listings = _readCollectibles().filter(c => c && c.listing);
    res.json({ ok: true, data: listings });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// POST /api/collectibles/trade — execute a trade (transfer ownership for credits)
router.post('/collectibles/trade', async (req, res) => {
  try {
    const { collectible_id, buyer, buyer_credits } = req.body || {};
    if (collectible_id == null || !buyer || buyer_credits == null) {
      return res.status(400).json({ ok: false, error: 'collectible_id, buyer, buyer_credits required' });
    }
    const agentEngine = require('./agent-engine');
    const tool = agentEngine.TOOLS && agentEngine.TOOLS.execute_trade;
    if (!tool) return fail(res, 500, 'internal_error', 'execute_trade tool not loaded', { ok: false });
    const result = await tool.execute({ collectible_id, buyer, buyer_credits });
    const failed = /not found|not listed|Insufficient/i.test(String(result));
    res.status(failed ? 400 : 200).json({ ok: !failed, data: { message: result } });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// GET /api/collectibles/trades — history of executed trades
router.get('/collectibles/trades', (req, res) => {
  try {
    const fp = require('path').join(__dirname, 'data', 'collectible-trades.json');
    let trades = [];
    try { trades = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
    res.json({ ok: true, data: trades });
  } catch (e) {
    fail(res, 500, 'internal_error', e.message, { ok: false });
  }
});

// NOTE: /marketplace/jobs/open and /marketplace/jobs/:id/accept-bid are now
// served by the canonical in-memory (_jobs / jobs.json) block near the top of
// this file. The old marketplace.json-backed duplicates were removed so there
// is a single source of truth for jobs.

// GET /api/apis/available — list of APIs agents can use (powers the API-connect UI)
router.get('/apis/available', (req, res) => {
  // Derived from real tool categories — keyless/free APIs the agents already call.
  const apis = [
    { id: 'coingecko', name: 'CoinGecko', category: 'crypto', auth: 'none' },
    { id: 'dexscreener', name: 'DexScreener', category: 'crypto', auth: 'none' },
    { id: 'jupiter', name: 'Jupiter', category: 'solana', auth: 'none' },
    { id: 'binance', name: 'Binance', category: 'crypto', auth: 'none' },
    { id: 'defillama', name: 'DeFiLlama', category: 'defi', auth: 'none' },
    { id: 'wikipedia', name: 'Wikipedia', category: 'reference', auth: 'none' },
    { id: 'hackernews', name: 'Hacker News', category: 'news', auth: 'none' },
    { id: 'arxiv', name: 'arXiv', category: 'research', auth: 'none' },
    { id: 'github', name: 'GitHub', category: 'dev', auth: 'optional' },
    { id: 'npm', name: 'npm Registry', category: 'dev', auth: 'none' },
    { id: 'openmeteo', name: 'Open-Meteo', category: 'weather', auth: 'none' },
    { id: 'restcountries', name: 'REST Countries', category: 'reference', auth: 'none' },
    { id: 'reddit', name: 'Reddit', category: 'social', auth: 'none' },
    { id: 'pollinations', name: 'Pollinations', category: 'ai-image', auth: 'none' },
    { id: 'feargreed', name: 'Fear & Greed', category: 'crypto', auth: 'none' }
  ];
  res.json({ ok: true, apis });
});

// POST /api/marketplace/jobs/post — create a job, {ok,data} response shape.
// Thin alias over the canonical validated creator (same _jobs / jobs.json store).
router.post('/marketplace/jobs/post', (req, res) => {
  const r = buildJobFromBody(req.body || {});
  if (r.error) return res.status(r.status || 400).json({ ok: false, error: r.error });
  broadcastEvent('job:created', { jobId: r.job.id, title: r.job.title, budget: r.job.budget, status: 'open' });
  res.json({ ok: true, data: r.job });
});

module.exports = router;
