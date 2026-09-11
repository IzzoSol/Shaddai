/**
 * llm-proxy-routes.js — Server-side LLM proxy (PIKADON Issue 1 fix).
 *
 * Replaces hardcoded client-side provider keys with a secure server proxy.
 * The browser posts { messages, agent?, taskTier?, options? } and this router
 * calls llm-client.js / brains.js using server-side env keys. Keys NEVER leave
 * the server or appear in any response.
 *
 * TODO: mount this router in server-production.js with:
 *   app.use('/api/llm', require('./llm-proxy-routes'));
 */

'use strict';

const express = require('express');
const router  = express.Router();
const json    = express.json();

// Rate-limit all routes on this router: 60 req/min per IP.
const { rateLimit } = require('./auth-guard');
router.use(rateLimit({ max: 60 }));

// Lazy-load heavy modules only when first request arrives (keeps startup fast
// if the server has optional features disabled).
let _callLLM      = null;
let _agentLLM     = null;
let _getProviders = null;

function getLLMClient() {
  if (!_callLLM) {
    const llm    = require('./llm-client');
    _callLLM     = llm.callLLM;
    _getProviders = llm.getAvailableProviders;
  }
  return { callLLM: _callLLM, getAvailableProviders: _getProviders };
}

function getBrains() {
  if (!_agentLLM) {
    _agentLLM = require('./brains').agentLLM;
  }
  return _agentLLM;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /chat
// Body: { messages: Array, agent?: string, taskTier?: string, options?: object }
//
// If `agent` is provided → delegates to brains.agentLLM() which applies the
//   correct persona, brain routing, and metering.
// Otherwise → calls llm-client.callLLM() directly with the fallback chain
//   (Ollama → Groq → OpenRouter → Anthropic → OpenAI).
//
// Response: { ok: true, content, provider, model }
//           { ok: false, error: string }            on any failure
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', json, async (req, res) => {
  try {
    const { messages, agent, taskTier, options } = req.body || {};

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages must be a non-empty array' });
    }

    // Sanitise each message: only keep role + content, nothing injected
    const safeMessages = messages.map(m => ({
      role:    String(m.role    || 'user').slice(0, 32),
      content: String(m.content || '').slice(0, 32000)
    }));

    let result;

    if (agent) {
      const agentLLM = getBrains();
      result = await agentLLM({
        agent:     String(agent).slice(0, 64),
        messages:  safeMessages,
        taskTier:  taskTier ? String(taskTier).slice(0, 32) : 'standard',
        options:   (options && typeof options === 'object') ? options : {}
      });
    } else {
      const { callLLM } = getLLMClient();
      result = await callLLM(
        safeMessages,
        (options && typeof options === 'object') ? options : {}
      );
    }

    // Return only safe fields — never echo keys or internal state
    return res.json({
      ok:       true,
      content:  result.content,
      provider: result.provider,
      model:    result.model
    });

  } catch (err) {
    console.error('[llm-proxy] /chat error:', err.message);
    return res.status(500).json({ ok: false, error: String(err.message || 'LLM call failed') });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /providers
// Returns which providers are currently configured — boolean flags only.
// Key values are NEVER included.
//
// Response: { ok: true, providers: { ollama: true, groq: false, ... } }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  try {
    const { getAvailableProviders } = getLLMClient();
    const available = new Set(getAvailableProviders());

    // Enumerate all known providers as boolean presence flags (no key values)
    const providers = {
      ollama:     available.has('ollama'),
      groq:       available.has('groq'),
      openrouter: available.has('openrouter'),
      anthropic:  available.has('anthropic'),
      openai:     available.has('openai')
    };

    return res.json({ ok: true, providers });

  } catch (err) {
    console.error('[llm-proxy] /providers error:', err.message);
    return res.status(500).json({ ok: false, error: String(err.message || 'Failed to read provider config') });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// Live per-provider check. For each keyed provider, sends a minimal 1-token
// ping and reports { provider, configured, ok, status, latencyMs }. Providers
// with no key in env report configured:false (NOT an error). Every call is
// wrapped in try/catch with a short timeout so one dead provider can't hang the
// route, and all pings run in parallel. Keys and full responses are NEVER
// included in the output — only env var NAMES and boolean/latency/status.
//
// Response: { ok, checkedAt, providers: [ { provider, envVar, configured, ok, status, latencyMs, error? } ] }
// ─────────────────────────────────────────────────────────────────────────────

// Minimal, provider-specific ping definitions. Each returns the fetch URL,
// headers (built from a pool key — the key value never leaves this closure),
// body, and a fn to decide if the parsed/HTTP response counts as "ok".
// One shared bad prompt keeps token spend near-zero.
const PING_TIMEOUT_MS = Number(process.env.LLM_HEALTH_TIMEOUT_MS) || 8000;
const PING_MESSAGES = [{ role: 'user', content: 'ping' }];

function buildPing(provider, apiKey) {
  switch (provider) {
    case 'groq':
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: { model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', messages: PING_MESSAGES, max_tokens: 1 }
      };
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://shaddai.app', 'X-Title': 'SHADDAI' },
        body: { model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free', messages: PING_MESSAGES, max_tokens: 1 }
      };
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: PING_MESSAGES, max_tokens: 1 }
      };
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: { model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1, messages: PING_MESSAGES }
      };
    case 'ollamacloud':
      return {
        url: `${process.env.OLLAMA_CLOUD_URL || 'https://ollama.com'}/api/chat`,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: { model: process.env.OLLAMA_CLOUD_MODEL || 'gpt-oss:120b', messages: PING_MESSAGES, stream: false, options: { num_predict: 1 } }
      };
    default:
      return null;
  }
}

async function pingProvider(pool, provider) {
  const envVar = pool.ENV_PREFIX[provider] || null;
  const keyList = pool.keys(provider);            // BYOK-less; env pool only
  if (!keyList.length) {
    return { provider, envVar, configured: false, ok: false, status: null, latencyMs: 0 };
  }

  const ping = buildPing(provider, keyList[0]);   // one key is enough for a liveness probe
  if (!ping) {
    return { provider, envVar, configured: true, ok: false, status: null, latencyMs: 0, error: 'no ping defined' };
  }

  const started = Date.now();
  try {
    const res = await fetch(ping.url, {
      method: 'POST',
      headers: ping.headers,
      body: JSON.stringify(ping.body),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS)
    });
    const latencyMs = Date.now() - started;
    // Drain and discard the body so we never surface provider content or keys.
    await res.text().catch(() => '');
    // 200-family = live & authed. 429 = live but rate-limited (still "reachable+valid key")→ ok:false but no auth error.
    return {
      provider, envVar, configured: true,
      ok: res.ok, status: res.status, latencyMs,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` })
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err && err.name === 'TimeoutError' ? 'timeout' : String((err && err.message) || 'request failed');
    return { provider, envVar, configured: true, ok: false, status: null, latencyMs, error: msg.slice(0, 120) };
  }
}

router.get('/health', async (req, res) => {
  try {
    const pool = require('./key-pool');
    // Cloud/keyed providers only. Local Ollama is keyless and not part of the pool health check.
    const providers = ['groq', 'openrouter', 'anthropic', 'openai', 'ollamacloud'];
    const results = await Promise.all(providers.map(p => pingProvider(pool, p)));
    return res.json({ ok: true, checkedAt: new Date().toISOString(), providers: results });
  } catch (err) {
    console.error('[llm-proxy] /health error:', err.message);
    return res.status(500).json({ ok: false, error: String(err.message || 'health check failed') });
  }
});

module.exports = router;
