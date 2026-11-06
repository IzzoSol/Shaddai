'use strict';
// ============================================================================
// grok-connect.js - Import a Grok-powered bot as a FULL dashboard agent.
// POST /api/grok/connect  { name, apiKey?, tools?: string[] }
//   1. Registers the bot in the Arena bot store (so it can battle).
//   2. Registers it in the server agent engine (engine.AGENTS) with a REAL tool
//      loadout + a Grok brain -> it can CHAT and USE TOOLS like the 7 agents.
//   3. Stores a persona so the dashboard chat can route to it via /llm/chat.
// PIKADON: we NEVER persist an api key to disk/logs; only a hasKey flag.
// ============================================================================
const express = require('express');
const router = express.Router();
const botStore = require('./arena/bot-store');
const templates = require('./arena/bot-templates');
const { softAuth, rateLimit } = require('./auth-guard');

// SECURITY (v119): every route needs a VERIFIED identity. Previously ownerId came from the request
// body (anyone could import bots as someone else) and /chat was open to the world on the server's key.
router.use(softAuth);
router.use(rateLimit({ windowMs: 60000, max: 30 }));
function needAuth(req, res, next) {
  if (!req.isAuthenticated) return res.status(401).json({ error: 'sign in to connect or use a Grok bot' });
  next();
}

const connected = []; // in-memory roster of imported Grok bots (name -> ref)
const MAX_BOTS_PER_OWNER = 5;
const MAX_BOTS_TOTAL = 500;
const MAX_MESSAGE = 4000;
// Tools an imported bot may hold: read-only public data + pure compute. Anything that writes files, runs
// code, trades, mints, posts, spends credits or fetches arbitrary URLs is NOT grantable from outside.
const SAFE_TOOLS = new Set([
  'fetch_price', 'get_fear_greed', 'get_trending', 'get_ohlcv', 'get_global_market', 'get_token_info',
  'whale_scan', 'get_defi_tvl', 'get_sol_balance', 'get_eth_balance', 'get_exchange_rates', 'search_web',
  'wikipedia_search', 'get_hackernews', 'get_rss_feed', 'get_github_trending', 'get_github_repo',
  'search_npm', 'get_weather', 'calculate', 'check_security', 'list_open_jobs', 'browse_listings',
  'analyze_sentiment', 'format_data', 'hash_text', 'base64_codec', 'regex_test', 'extract_keywords',
  'markdown_to_html', 'translate_text', 'count_tokens', 'get_reddit_posts', 'get_arxiv_papers',
  'get_gas_price', 'get_nft_floor', 'get_crypto_news'
]);
function safeTools(list) {
  const asked = Array.isArray(list) ? list : DEFAULT_TOOLS;
  return [...new Set(asked.filter(t => typeof t === 'string' && SAFE_TOOLS.has(t)))].slice(0, 20);
}

// Real dashboard tool loadout an imported Grok bot can use (must exist in TOOLS).
const DEFAULT_TOOLS = ['search_web', 'fetch_price', 'wikipedia_search'];

function registerEngineAgent(bot, persona) {
  try {
    const eng = require('./agent-engine');
    if (eng && eng.AGENTS) {
      const realTools = (Array.isArray(bot.toolsList) ? bot.toolsList : DEFAULT_TOOLS)
        .filter(t => typeof t === 'string' && eng.TOOLS && eng.TOOLS[t]);
      eng.AGENTS[bot.id] = {
        name: bot.id, role: 'Imported Grok Bot', goal: persona || 'Help the user with tools.',
        tools: realTools,
        preferredProvider: 'grok',
        custom: true,
        grokBot: true
      };
      // Expose to the brains persona layer too, so agentLLM/route can find it.
      try {
        const brains = require('./brains');
        if (brains && brains.BRAINS && !brains.BRAINS['grok-bot']) {
          brains.BRAINS['grok-bot'] = { name: 'Grok Bot', provider: 'grok-logic', desc: 'Imported Grok-powered bot' };
        }
      } catch (_) {}
      return { tools: realTools };
    }
  } catch (e) { console.warn('[grok-connect] engine register skipped:', e.message); }
  return { tools: [] };
}

// Build + register an imported Grok bot from a name/persona/tools definition.
// Never persists an api key; only a hasKey flag. Returns the registered bot.
function buildAndRegisterBot({ name, persona, tools, ownerId, apiKey }) {
  if (!name) throw new Error('name required');
  if (connected.length >= MAX_BOTS_TOTAL) throw new Error('bot capacity reached, try later');
  if (connected.filter(b => b.ownerId === ownerId).length >= MAX_BOTS_PER_OWNER) throw new Error('limit of ' + MAX_BOTS_PER_OWNER + ' bots per account');
  const id = 'grok_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString(36);
  const bot = {
    id,
    ownerId,
    name: String(name).slice(0, 40),
    model: 'grok',
    persona: String(persona || 'Imported Grok-powered agent').slice(0, 500),
    toolsList: safeTools(tools),
    systemPrompt: '',
    hasKey: !!apiKey
  };
  botStore.registerBot(bot);
  const eng = registerEngineAgent(bot, bot.persona);
  connected.push({ id: bot.id, ownerId, name: bot.name, hasKey: bot.hasKey, tools: eng.tools });
  return { bot, tools: eng.tools };
}

router.get('/status', (req, res) => {
  // only the caller's own bots; never expose other owners' ids
  const mine = connected.filter(b => req.isAuthenticated && b.ownerId === req.userId).map(({ ownerId, ...b }) => b);
  res.json({ connected: mine.length, bots: mine, allowedTools: [...SAFE_TOOLS] });
});

// List importable bot templates.
router.get('/templates', (req, res) => {
  res.json({ templates: templates.listTemplates() });
});

// Import a bot from a template (optionally overriding the name).
router.post('/templates/:id/import', needAuth, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const tpl = templates.getTemplate(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'template not found' });
    const { name } = req.body || {};
    const { bot, tools } = buildAndRegisterBot({
      name: name || tpl.name,
      persona: tpl.persona,
      tools: tpl.tools,
      ownerId: req.userId,
      apiKey: (req.body && req.body.apiKey) || ''
    });
    res.json({
      success: true,
      template: tpl.id,
      bot: { id: bot.id, name: bot.name, model: bot.model, hasKey: bot.hasKey, tools },
      chat: 'POST /llm/chat with { agent:"' + bot.id + '", provider:"grok" }'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/connect', needAuth, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const { name, persona, apiKey, tools } = req.body || {};
    const { bot, tools: engTools } = buildAndRegisterBot({
      name, persona, tools, ownerId: req.userId, apiKey
    });
    res.json({
      success: true,
      bot: { id: bot.id, name: bot.name, model: 'grok', hasKey: bot.hasKey, tools: engTools },
      chat: 'POST /llm/chat with { agent:"' + bot.id + '", provider:"grok" }'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Chat with an imported Grok bot directly (AURA-first, tools available via engine).
router.post('/chat', needAuth, express.json({ limit: '64kb' }), async (req, res) => {
  const { id, message, apiKey } = req.body || {};
  const provider = /^(grok|groq|openrouter)$/.test(String(req.body && req.body.provider)) ? req.body.provider : 'grok';
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) return res.status(400).json({ error: 'message required (max ' + MAX_MESSAGE + ' chars)' });
  const bot = botStore.getBot(id);
  // 404 (not 403) for other people's bots so ids can't be probed
  if (!bot || bot.ownerId !== req.userId) return res.status(404).json({ error: 'bot not found' });
  try {
    const r = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization || '' },
      // the caller's own key is forwarded for this request only and never stored or logged
      body: JSON.stringify({ message, agent: id, provider, systemPrompt: bot.persona, apiKey: typeof apiKey === 'string' ? apiKey.slice(0, 300) : undefined })
    });
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
