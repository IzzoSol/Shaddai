/**
 * SHADDAI Multi-Agent Server
 * Spins up all 7 agents on their designated ports.
 * Each agent has a unique personality, system prompt, and skills.
 * All powered by local Ollama LLM.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const OLLAMA_URL  = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
const CLAUDE_MODEL   = process.env.AGENT_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const GROQ_API_KEY   = process.env.GROQ_API_KEY || '';
const GROQ_MODEL     = 'llama-3.1-8b-instant'; // free, fast, 70B

// ── Call Groq (Llama 3.3 70B — fast & free) ─────────────────
async function callGroq(systemPrompt, userMessage) {
  if (!GROQ_API_KEY) throw new Error('no-groq');
  const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage }
    ],
    max_tokens: 1024,
    temperature: 0.7
  }, {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return r.data.choices[0]?.message?.content || '';
}

// ── Call Claude API (Haiku) when key is available ────────────
async function callClaude(systemPrompt, userMessage, stream = false) {
  const Anthropic = (() => { try { return require('@anthropic-ai/sdk'); } catch { return null; } })();
  if (!Anthropic || !CLAUDE_API_KEY) throw new Error('no-claude');
  const client = new Anthropic({ apiKey: CLAUDE_API_KEY });
  if (stream) {
    return client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
  }
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  return msg.content[0]?.text || '';
}

// ── Pick best available Ollama model ──────────────────────────
let _bestModel = null;
async function getBestModel() {
  if (_bestModel) return _bestModel;
  try {
    const r = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const models = (r.data.models || []).map(m => m.name);
    // phi is better at instruction-following; gemma4 is highest quality if RAM allows
    const priority = ['phi:latest', 'llama3.2:1b', 'gemma4:latest', 'tinyllama:latest'];
    _bestModel = priority.find(m => models.includes(m)) || models[0] || 'phi:latest';
    console.log(`[AGENTS] Ollama model: ${_bestModel}${CLAUDE_API_KEY ? ' | Claude Haiku also available' : ''}`);
  } catch {
    _bestModel = 'phi:latest';
  }
  return _bestModel;
}

// ── Agent Definitions ─────────────────────────────────────────
const AGENTS = [
  {
    name: 'SHADDAI',
    port: parseInt(process.env.SHADDAI_PORT) || 8000,
    emoji: '⚡',
    color: '#ffd700',
    role: 'Supreme Orchestrator',
    systemPrompt: `You are SHADDAI, the supreme AI orchestrator and strategic commander of an elite agent empire. You coordinate 6 specialized agents: ZEROX (revenue), ORACLE (intelligence), NEXUS (architecture), TURTLE (design), QUILL (communication), and PIKADON (security).

Your role: Make executive decisions, coordinate multi-agent workflows, ensure mission success.
Style: Strategic, decisive, confident. Short answers unless analysis is needed.
Always sign responses as: [SHADDAI ⚡]`,
    skills: ['orchestration', 'strategy', 'decision-making', 'multi-agent coordination', 'executive planning']
  },
  {
    name: 'ZEROX',
    port: parseInt(process.env.ZEROX_PORT) || 8001,
    emoji: '💰',
    color: '#00c8ff',
    role: 'Revenue & Wealth Engine',
    systemPrompt: `You are ZEROX, the revenue engine and wealth strategist of the SHADDAI empire. You specialize in monetization, pricing strategy, business models, unit economics, and financial optimization.

Your role: Maximize revenue, design subscription tiers, analyze unit economics, identify growth opportunities.
Style: Data-driven, ROI-focused, growth-oriented. Think in MRR, LTV, CAC, conversion rates.
Always sign responses as: [ZEROX 💰]`,
    skills: ['pricing-strategy', 'revenue-modeling', 'stripe-integration', 'subscription-tiers', 'unit-economics', 'financial-analysis']
  },
  {
    name: 'ORACLE',
    port: parseInt(process.env.ORACLE_PORT) || 8002,
    emoji: '🔮',
    color: '#b06aff',
    role: 'Research & Intelligence',
    systemPrompt: `You are ORACLE, the intelligence and research specialist of the SHADDAI empire. You gather data, analyze market trends, perform competitive analysis, and surface insights from crypto markets.

Your role: Research, data synthesis, market intelligence, trend identification, observability.
Style: Thorough, analytical, evidence-based. Connect dots, surface non-obvious patterns.
Always sign responses as: [ORACLE 🔮]`,
    skills: ['market-research', 'competitive-analysis', 'crypto-intelligence', 'trend-analysis', 'data-synthesis', 'web-scraping']
  },
  {
    name: 'NEXUS',
    port: parseInt(process.env.NEXUS_PORT) || 8003,
    emoji: '🕸',
    color: '#00e5a0',
    role: 'Technical Architect',
    systemPrompt: `You are NEXUS, the technical architect and backend engineer of the SHADDAI empire. You design systems, write scalable code, architect APIs, and ensure performance and reliability.

Your role: Backend architecture, API design, database optimization, code review, infrastructure planning.
Style: Pragmatic, performance-focused, security-aware. Favor simple testable solutions.
Always sign responses as: [NEXUS 🕸]`,
    skills: ['backend-architecture', 'api-design', 'database-design', 'system-scaling', 'code-review', 'security-hardening']
  },
  {
    name: 'TURTLE',
    port: parseInt(process.env.TURTLE_PORT) || 8004,
    emoji: '🐢',
    color: '#ff7b3d',
    role: 'UI/UX & Creative Director',
    systemPrompt: `You are TURTLE, the creative director and frontend engineer of the SHADDAI empire. You design beautiful interfaces, create delightful user experiences, and build stunning visual presentations.

Your role: UI/UX design, frontend development, visual branding, animations, component architecture.
Style: Aesthetic, user-centric, detail-oriented. Care about every pixel, every interaction.
Always sign responses as: [TURTLE 🐢]`,
    skills: ['ui-design', 'ux-flows', 'css-animations', 'react-components', 'design-systems', 'frontend-architecture']
  },
  {
    name: 'QUILL',
    port: parseInt(process.env.QUILL_PORT) || 8005,
    emoji: '✍️',
    color: '#ffb020',
    role: 'Writing & Communication',
    systemPrompt: `You are QUILL, the master communicator and writer of the SHADDAI empire. You craft clear documentation, compelling copy, user-facing messages, and technical guides.

Your role: Technical writing, marketing copy, API documentation, user guides, error messages.
Style: Clear, precise, user-focused. Every word counts. Clarity over cleverness.
Always sign responses as: [QUILL ✍️]`,
    skills: ['technical-writing', 'api-documentation', 'marketing-copy', 'user-guides', 'content-strategy', 'error-messages']
  },
  {
    name: 'PIKADON',
    port: parseInt(process.env.PIKADON_PORT) || 8008,
    emoji: '🛡',
    color: '#ff4070',
    role: 'Security & Compliance',
    systemPrompt: `You are PIKADON, the security guardian and compliance enforcer of the SHADDAI empire. You audit code, identify vulnerabilities, enforce access controls, and protect sensitive data.

Your role: Security auditing, vulnerability assessment, OWASP compliance, secret management, audit logging.
Style: Defensive, paranoid (in a good way), thorough. Assume worst-case. Verify everything.
Always sign responses as: [PIKADON 🛡]`,
    skills: ['security-auditing', 'vulnerability-assessment', 'owasp-compliance', 'secret-rotation', 'access-control', 'audit-logging']
  }
];

// ── Create and start each agent ────────────────────────────────
const servers = [];

for (const agent of AGENTS) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${agent.name}] ${req.method} ${req.path}`);
    next();
  });

  // ── Health / root ──────────────────────────────────────────
  app.get('/', (req, res) => {
    res.json({
      name: agent.name,
      role: agent.role,
      emoji: agent.emoji,
      status: 'ONLINE',
      port: agent.port,
      skills: agent.skills,
      skills_loaded: agent.skills.length,
      version: '62.0.0',
      uptime: process.uptime()
    });
  });

  app.get('/ping', (req, res) => {
    res.json({ status: 'ok', name: agent.name, role: agent.role, port: agent.port });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', name: agent.name, uptime: process.uptime() });
  });

  app.get('/skills', (req, res) => {
    res.json({ name: agent.name, skills: agent.skills });
  });

  // ── ZEROX: trending market data ────────────────────────────
  if (agent.name === 'ZEROX') {
    app.get('/trending', async (req, res) => {
      try {
        const axios = require('axios');
        const r = await axios.get('https://api.coinlore.net/api/tickers/?start=0&limit=10', { timeout: 5000 });
        const tickers = r.data?.data || [];
        res.json({
          trending: tickers.map(t => ({
            symbol: t.symbol, name: t.name,
            price: parseFloat(t.price_usd), change: parseFloat(t.percent_change_24h || 0)
          })),
          source: 'coinlore', timestamp: new Date().toISOString()
        });
      } catch (e) {
        res.json({ trending: [], error: e.message });
      }
    });
  }

  // ── Shared: build message array with system prompt + context ──
  function buildMessages(userMessage, context, extraPrompt) {
    const sysContent = extraPrompt
      ? `${agent.systemPrompt}\n\n${extraPrompt}`
      : agent.systemPrompt;
    const msgs = [{ role: 'system', content: sysContent }];
    if (context && Array.isArray(context)) msgs.push(...context.slice(-6));
    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  }

  // ── Chat endpoint (non-streaming, waits for full response) ──
  app.post('/chat', async (req, res) => {
    const { message, model, context, skill } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const messages = buildMessages(message, context, null);
    const sysPrompt = messages[0].content;
    const userText  = messages[messages.length - 1].content;

    // Priority: Ollama (free, local, no limits) → Groq → Claude
    if (!model) {
      try {
        const useModel = await getBestModel();
        const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
          model: useModel, messages, stream: false
        }, { timeout: 120000 });
        const response = r.data.message?.content || `[${agent.name}] Ready.`;
        return res.json({ response, agent: agent.name, model: useModel, role: agent.role, brain: 'ollama' });
      } catch(e) { console.warn(`[${agent.name}] Ollama unavailable: ${e.message}`); }
    }

    if (GROQ_API_KEY && !model) {
      try {
        const response = await callGroq(sysPrompt, userText);
        return res.json({ response, agent: agent.name, model: GROQ_MODEL, role: agent.role, brain: 'groq' });
      } catch(e) { console.warn(`[${agent.name}] Groq err: ${e.message}`); }
    }

    if (CLAUDE_API_KEY && !model) {
      try {
        const response = await callClaude(sysPrompt, userText, false);
        return res.json({ response, agent: agent.name, model: CLAUDE_MODEL, role: agent.role, brain: 'claude' });
      } catch(e) { if (e.message !== 'no-claude') console.warn(`[${agent.name}] Claude err: ${e.message}`); }
    }

    res.status(503).json({ error: 'All AI backends offline', agent: agent.name });
  });

  // ── Stream endpoint — SSE streaming for live token-by-token output ──
  app.post('/stream', async (req, res) => {
    const { message, model, context } = req.body;
    if (!message) { res.status(400).json({ error: 'message required' }); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const messages = buildMessages(message, context, null);
    const sysPrompt = messages[0].content;
    const userText  = messages[messages.length - 1].content;

    // Try Claude streaming first
    if (CLAUDE_API_KEY && !model) {
      try {
        const stream = await callClaude(sysPrompt, userText, true);
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            res.write(`data: ${JSON.stringify({ token: chunk.delta.text, agent: agent.name, brain: 'claude' })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true, agent: agent.name, model: CLAUDE_MODEL })}\n\n`);
        res.end();
        return;
      } catch(e) { if (e.message !== 'no-claude') console.warn(`[${agent.name}] Claude stream err: ${e.message}`); }
    }

    // Ollama stream fallback
    try {
      const useModel = model || await getBestModel();

      const streamRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: useModel, messages, stream: true
      }, { responseType: 'stream', timeout: 120000 });

      let buffer = '';
      streamRes.data.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content || '';
            if (token) res.write(`data: ${JSON.stringify({ token, agent: agent.name })}\n\n`);
            if (parsed.done) {
              res.write(`data: ${JSON.stringify({ done: true, agent: agent.name, model: useModel })}\n\n`);
              res.end();
            }
          } catch(_) {}
        }
      });
      streamRes.data.on('end', () => {
        res.write(`data: ${JSON.stringify({ done: true, agent: agent.name })}\n\n`);
        res.end();
      });
      streamRes.data.on('error', err => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message, agent: agent.name })}\n\n`);
      res.end();
    }
  });

  // ── Skill execution ────────────────────────────────────────
  app.post('/skill/:skillName', async (req, res) => {
    const { skillName } = req.params;
    const { params = {}, context, task } = req.body;

    // Look up skill in SKILL.md files from Obsidian vault
    let skillSystemPrompt = null;
    try {
      const fs = require('fs'), p = require('path');
      const vaultRoot = process.env.OBSIDIAN_ROOT || 'C:\\Users\\Brittany\\OneDrive\\Desktop\\OBSIDIAN\\SHADDAI OBSIDIAN';
      // Recursive search for the skill file
      function findFile(dir, target, depth = 0) {
        if (depth > 5) return null;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) { const f = findFile(p.join(dir, entry.name), target, depth+1); if (f) return f; }
            else if (entry.name.toLowerCase().replace(/[\s-]/g,'_') === target.toLowerCase() + '.md') return p.join(dir, entry.name);
          }
        } catch(_) {}
        return null;
      }
      const fp = findFile(vaultRoot, skillName);
      if (fp) skillSystemPrompt = fs.readFileSync(fp, 'utf8').replace(/^---[\s\S]*?---\s*/m, '').trim().substring(0, 3000);
    } catch(_) {}

    if (!skillSystemPrompt && !agent.skills.includes(skillName)) {
      return res.status(404).json({ error: `Skill '${skillName}' not found`, available: agent.skills });
    }

    try {
      const useModel = await getBestModel();
      const taskText = task || params.task || params.prompt || `Execute skill: ${skillName} with params: ${JSON.stringify(params)}`;
      const sysPrompt = skillSystemPrompt
        ? `${agent.systemPrompt}\n\n--- SKILL: ${skillName} ---\n${skillSystemPrompt}`
        : `${agent.systemPrompt}\n\nExecute the "${skillName}" skill precisely.`;

      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: useModel,
        messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: taskText }],
        stream: false
      }, { timeout: 120000 });

      const result = r.data.message?.content || 'Skill completed';
      res.json({ result, skill: skillName, agent: agent.name, status: 'completed', skillLoaded: !!skillSystemPrompt });
    } catch (error) {
      res.status(500).json({ error: error.message, skill: skillName });
    }
  });

  // ── Task endpoint ──────────────────────────────────────────
  app.post('/task', async (req, res) => {
    const { task, priority = 'normal' } = req.body;
    if (!task) return res.status(400).json({ error: 'task required' });

    const taskId = `task_${Date.now()}`;
    const useModel = await getBestModel().catch(() => 'llama3.2:1b');

    try {
      const r = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: useModel,
        messages: buildMessages(`Task (Priority: ${priority}): ${task}`, null, 'Complete the assigned task concisely and thoroughly.'),
        stream: false
      }, { timeout: 120000 });

      const output = r.data.message?.content || 'Task completed';
      res.json({ taskId, status: 'completed', output, agent: agent.name, priority });
    } catch (error) {
      res.status(500).json({ taskId, status: 'failed', error: error.message });
    }
  });

  // Start listening
  const srv = app.listen(agent.port, () => {
    console.log(`✅ [${agent.emoji} ${agent.name}] Online → http://localhost:${agent.port}`);
  });

  srv.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  [${agent.name}] Port ${agent.port} in use — skipping`);
    } else {
      console.error(`[${agent.name}] Server error:`, err.message);
    }
  });

  servers.push(srv);
}

console.log('\n📡 SHADDAI Multi-Agent Network initializing...\n');

// Graceful shutdown
process.on('SIGTERM', () => { servers.forEach(s => s.close()); });
process.on('SIGINT',  () => { servers.forEach(s => s.close()); process.exit(0); });
