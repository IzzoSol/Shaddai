// federation-routes.js — exposes SHADDAI's 7 agents to the outside world (MEGA_BUILD_SPEC §3 + §5).
//   GET  /.well-known/agent.json  — A2A Agent Card (discover SHADDAI's skills)
//   GET  /.well-known/mcp.json    — MCP manifest (Claude Desktop / Cursor / a Grok bot can hire agents)
//   POST /api/a2a                 — A2A task submission (skill → agent), key-gated + x402-gated
//   POST /mcp/tools/call          — MCP tool execution, key-gated
// Mount with: app.use(require('./federation-routes'))
//
// SECURITY (2026-08-28): this router is reachable by ANY external caller — a Grok bot, another
// A2A/MCP client, anyone with the URL. Two things are non-negotiable here:
//   1. Dispatch goes through lib/agent-tool-run.js's runAgentWithTools(), the SAME denylisted,
//      step-capped path Simple Mode uses (backend/lib/agent-tool-run.js DENY set) — NOT the raw
//      agent-engine createTask/runAgentLoop, which hands an agent its full tool list unrestricted
//      (writes, trades, posting, spend). Never wire this router back to the raw loop.
//   2. Execution endpoints require a key from mcp-external-keys.json. No keys configured = the
//      endpoint is disabled (501), matching this repo's disabled-by-default guard pattern
//      (pay-guard.js, paybox-guard.js) rather than silently allowing the world in.
// When Paybox/MoonPay wallet-action tools get wired into TOOLS, they inherit this same DENY set
// by default (agent-tool-run.js's DENY is the single source of truth) — do NOT special-case them
// into this router without an explicit, separately-reviewed allowlist + human-approval gate.
const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const json = express.json();
let toolRun = null; try { toolRun = require('./lib/agent-tool-run'); } catch (e) { console.warn('[federation] agent-tool-run unavailable:', e.message); }
// 2026-08-29: the pricing page sells "point Claude, Grok or a local model straight at
// the council's knowledge... on your own key" — a REMOTE MCP connection. mcp-server-rag.js
// only ran over stdio (local process spawn), which no paying remote customer can reach.
// Reuse its already transport-agnostic runTool() here so the RAG tools (rag_search,
// rag_ask, get_route, list_digests, list_agents, list_rag_docs) work over this same
// key-gated HTTP door, not just for the owner's own local Claude Desktop config.
let ragMcp = null; try { ragMcp = require('./mcp-server-rag'); } catch (e) { console.warn('[federation] mcp-server-rag unavailable:', e.message); }
const RAG_TOOLS = new Set(['list_agents', 'list_rag_docs', 'rag_search', 'rag_ask', 'get_route', 'list_digests']);

const BASE = () => process.env.RENDER_EXTERNAL_URL || 'http://localhost:8099';

// 2026-08-30: `example` is a REAL, runnable task string for POST /mcp/tools/call or
// /api/a2a — grounded in each agent's actual tool list (agent-engine.js AGENTS.*.tools),
// not aspirational copy. If you want an example for a capability that isn't listed here
// (link-safety checking, X/Twitter account verification, etc.), it's because the
// underlying tool doesn't exist yet — don't add an example that would lie about it.
const AGENTS = [
  { id:'SHADDAI', skill:'orchestration',  name:'Multi-Agent Orchestration', tags:['orchestration','workflow','delegate'],        description:'Master orchestrator — delegates sub-tasks, runs multi-agent chains, executive synthesis.', example:'Coordinate NEXUS and PIKADON to review this pull request for both code quality and security issues, then summarize.' },
  { id:'ORACLE',  skill:'research',        name:'Research & Intelligence',   tags:['research','web','arxiv','news','wikipedia'],   description:'Deep research: web, arxiv, news, wikipedia, hacker news, semantic scholar.', example:'Research the current state of MCP (Model Context Protocol) adoption and summarize the top 3 developments this month.' },
  { id:'ZEROX',   skill:'defi_analysis',   name:'DeFi & Market Analysis',    tags:['crypto','defi','prices','whales','solana','paybox'], description:'Live crypto prices, DefiLlama TVL/yields, DEX data, whale tracking, Solana tokens, and real Paybox trades/quotes (guarded — real spend needs human approval above a small threshold).', example:'Check BTC and SOL sentiment, then use paybox_pay to quote a $5 swap into whichever looks stronger.' },
  { id:'NEXUS',   skill:'code',            name:'Code & Architecture',       tags:['code','github','npm','regex','diagrams'],      description:'Code analysis, github/npm intel, bundle size, CVE lookup, diagrams, architecture/scaling questions.', example:'Look up the npm package "express-rate-limit", check its bundle size and recent CVEs, and tell me if it is safe to add.' },
  { id:'QUILL',   skill:'writing',         name:'Writing & Content',         tags:['writing','social','translate','rss'],          description:'Summarize, translate, tweet threads, readability, RSS, copywriting.', example:'Turn this changelog into a 5-tweet thread announcing the release, casual tone.' },
  { id:'TURTLE',  skill:'creative',        name:'Image & Creative',          tags:['image','art','svg','design','palette'],        description:'Image generation, SVG charts, color palettes, font pairing.', example:'Generate a color palette and a matching SVG icon for a crypto trading app called Nova.' },
  { id:'PIKADON', skill:'security',        name:'Security Audit',            tags:['security','cve','ports','breach'],             description:'Code security audits (SQL injection, XSS, hardcoded secrets, eval, path traversal), password strength, IP/port checks. NOT yet wired: link/URL-safety checking or social-account verification — ask for those and it will say so rather than guess.', example:'Run a security audit on this function and list every finding by severity.' },
];
const SKILL_AGENT = Object.fromEntries(AGENTS.map(a => [a.skill, a.id]));

// ── External key store (gitignored — see backend/data/mcp-external-keys.json) ──
// [{ key, label, createdAt, rateLimitPerHour? }]. Empty/missing = execution disabled (501).
const KEYS_FILE = path.join(__dirname, 'data', 'mcp-external-keys.json');
function loadKeys() {
  try { const d = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); return Array.isArray(d.keys) ? d.keys : []; }
  catch (e) { return []; }
}
function requireExternalKey(req, res, next) {
  const keys = loadKeys();
  if (!keys.length) return res.status(501).json({ error: 'External agent access not configured — no keys issued yet. See backend/data/mcp-external-keys.json.' });
  const presented = String(req.headers['x-mcp-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '').trim();
  const match = keys.find(k => k.key === presented);
  if (!presented || !match) return res.status(401).json({ error: 'Missing or invalid key — pass it as "Authorization: Bearer <key>" or "X-MCP-Key: <key>".' });
  req.mcpKeyLabel = match.label || 'unlabeled';
  next();
}
const dispatchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  keyGenerator: (req) => req.mcpKeyLabel || req.ip,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Rate limit exceeded for this key — try again later.' },
});

// ── A2A Agent Card (discovery — public, no key required, standard for A2A discovery) ──
router.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'SHADDAI Agent Council',
    description: 'A sovereign AI agent civilization — 7 specialized agents for research, DeFi, code, writing, creative, security, and orchestration. Hire per-task via x402.',
    url: `${BASE()}/api/a2a`, version: '1.0.0', protocolVersion: '1.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: AGENTS.map(a => ({ id: a.skill, name: a.name, tags: a.tags, description: a.description })),
    security_schemes: {
      x402: { type: 'http', scheme: 'x402', description: 'Pay-per-task with x402 micropayments (USDC on Base or Solana).' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-MCP-Key', description: 'Request a key from the SHADDAI owner — required to actually submit a task.' },
    },
  });
});

// ── MCP manifest (Claude Desktop / Cursor / any MCP-HTTP client — public, no key required) ──
router.get('/.well-known/mcp.json', (req, res) => {
  res.json({
    mcp_version: '2025-11-05',
    server: { name: 'SHADDAI Agent Council', version: '1.0.0', url: BASE() },
    authentication: { type: 'apiKey', in: 'header', name: 'X-MCP-Key', description: 'Required on POST /mcp/tools/call — request a key from the SHADDAI owner.' },
    tools: [
      ...AGENTS.map(a => ({
        name: `shaddai_${a.id.toLowerCase()}`,
        description: a.description,
        inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'The task to assign to this agent', examples: [a.example] } }, required: ['task'] },
      })),
      { name: 'rag_search', description: "Raw TF-IDF chunk hits (score + source doc) from an agent's knowledge base.",
        inputSchema: { type: 'object', properties: { query: { type: 'string' }, agent: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
      { name: 'rag_ask', description: 'A grounded answer synthesized from the knowledge base, cited to source.',
        inputSchema: { type: 'object', properties: { question: { type: 'string' }, agent: { type: 'string' } }, required: ['question'] } },
      { name: 'get_route', description: "Match a query against an agent's known playbooks/routes.",
        inputSchema: { type: 'object', properties: { query: { type: 'string' }, agent: { type: 'string' } }, required: ['query'] } },
      { name: 'list_digests', description: "List an agent's digested knowledge chapters/insights.",
        inputSchema: { type: 'object', properties: { agent: { type: 'string' } }, required: [] } },
      { name: 'list_agents', description: 'The 7 agents, their role, KB doc count, tool count.',
        inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'list_rag_docs', description: "Documents inside an agent's knowledge base.",
        inputSchema: { type: 'object', properties: { agent: { type: 'string' } }, required: [] } },
    ],
  });
});

// ── Visitor registry (F4): inbound federated agents that have entered the Grid ──
const VISITORS = new Map();           // id -> { id, name, origin, skill, agent, calls, first, last }
const VISITOR_TTL = 15 * 60 * 1000;   // considered "present" for 15 min after last call
function recordVisitor(req, skill, agent) {
  const name = String(req.headers['x-agent-name'] || (req.body && req.body.from) || req.headers['user-agent'] || 'Unknown Agent').slice(0, 48);
  const id = String(req.headers['x-agent-id'] || name).slice(0, 64);
  const origin = String(req.headers['x-agent-origin'] || req.headers['origin'] || req.headers['referer'] || '').slice(0, 120);
  const now = Date.now();
  const v = VISITORS.get(id) || { id, name, origin, calls: 0, first: now };
  v.name = name; v.origin = origin || v.origin; v.skill = skill; v.agent = agent; v.calls++; v.last = now;
  VISITORS.set(id, v);
  if (VISITORS.size > 100) { // prune oldest
    const old = [...VISITORS.entries()].sort((a, b) => a[1].last - b[1].last)[0];
    if (old) VISITORS.delete(old[0]);
  }
}
router.get('/api/grid/visitors', (req, res) => {
  const now = Date.now();
  const present = [...VISITORS.values()]
    .filter(v => now - v.last < VISITOR_TTL)
    .sort((a, b) => b.last - a.last)
    .map(v => ({ id: v.id, name: v.name, origin: v.origin, skill: v.skill, agent: v.agent, calls: v.calls, secondsAgo: Math.round((now - v.last) / 1000) }));
  res.json({ count: present.length, visitors: present });
});

// Safe dispatch: same denylisted, step-capped tool loop Simple Mode uses. Awaited — returns the
// final answer directly, so callers don't need a task-polling round trip.
async function runSafeTask(agentId, task) {
  if (!toolRun || !toolRun.runAgentWithTools) return { error: 'agent tool-runner unavailable' };
  if (!task) return { error: 'task is required' };
  try {
    const out = await toolRun.runAgentWithTools(agentId, task, {});
    return { status: 'completed', agent: agentId, ...out };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// ── A2A task submission (key-gated + rate-limited) ──
router.post('/api/a2a', requireExternalKey, dispatchLimiter, json, async (req, res) => {
  const { skill, message, task } = req.body || {};
  const agent = SKILL_AGENT[skill] || 'SHADDAI';
  const text = (message && message.parts && message.parts[0] && message.parts[0].text)
    || (typeof message === 'string' ? message : null) || task || '';
  recordVisitor(req, skill || 'orchestration', agent);
  if (process.env.X402_ENABLED === 'true' && skill !== 'research' && !req.headers['x-payment']) {
    return res.status(402).json({ error: 'Payment required', x402: { amount: '0.01', currency: 'USDC', network: 'base', address: process.env.TREASURY_WALLET || '' } });
  }
  const r = await runSafeTask(agent, text);
  return res.status(r.error ? 400 : 200).json(r);
});

// ── MCP tool execution (key-gated + rate-limited) ──
router.post('/mcp/tools/call', requireExternalKey, dispatchLimiter, json, async (req, res) => {
  const { name, arguments: args } = req.body || {};

  // RAG brain tools (rag_search/rag_ask/get_route/list_digests/list_agents/list_rag_docs) —
  // read-only, safe to expose directly via the same runTool() the local stdio server uses.
  if (RAG_TOOLS.has(name)) {
    recordVisitor(req, 'mcp', 'rag:' + name);
    if (!ragMcp || !ragMcp.runTool) return res.status(501).json({ content: [{ type: 'text', text: 'RAG tools unavailable' }], isError: true });
    try {
      const result = await ragMcp.runTool(name, args || {});
      return res.json({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
    } catch (e) {
      return res.json({ content: [{ type: 'text', text: String((e && e.message) || e) }], isError: true });
    }
  }

  const agentId = String(name || '').replace('shaddai_', '').toUpperCase();
  recordVisitor(req, 'mcp', agentId);
  const r = await runSafeTask(agentId, (args && args.task) || '');
  res.json({ content: [{ type: 'text', text: JSON.stringify(r) }], isError: !!r.error });
});

// ── Portal registry (in-world gateways to other worlds, §4) ──
// Curated native portals live in portal-registry.json (never mutated here).
// Community portals — the ones users "connect" behind NEXUS — live in community-portals.json.
const COMMUNITY_FILE = path.join(__dirname, 'community-portals.json');
function readCommunity() {
  try { const d = JSON.parse(fs.readFileSync(COMMUNITY_FILE, 'utf8')); return Array.isArray(d.portals) ? d.portals : []; }
  catch (e) { return []; }
}
function slugId(s) { return String(s || 'portal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'portal'; }

router.get('/api/grid/portals', (req, res) => {
  let base = { portals: [] };
  try { base = JSON.parse(fs.readFileSync(path.join(__dirname, 'portal-registry.json'), 'utf8')); } catch (e) {}
  const community = readCommunity();
  res.json({ portals: (base.portals || []).concat(community) });
});

// POST /api/grid/portals/register — a user connects their own portal (shows in the ring behind NEXUS).
// Body: { name, url, owner?, color?, tags? }  → appended to community-portals.json (capped, sanitized).
router.post('/api/grid/portals/register', json, (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 48);
    let url = String(b.url || '').trim().slice(0, 300);
    if (!name || !url) return res.status(400).json({ ok: false, error: 'name and url are required' });
    // only allow http(s) or in-world relative paths — block javascript:/data: etc.
    if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) return res.status(400).json({ ok: false, error: 'url must be http(s):// or a /path' });
    const color = /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#8b5cf6';
    const tags = Array.isArray(b.tags) ? b.tags.slice(0, 6).map(t => String(t).slice(0, 24)) : [];
    const list = readCommunity();
    if (list.length >= 60) return res.status(429).json({ ok: false, error: 'community portal limit reached' });
    let id = slugId(name); if (list.find(p => p.id === id)) id = id + '-' + Math.random().toString(36).slice(2, 6);
    const portal = { id, name, operator: String(b.owner || 'a SHADDAI user').slice(0, 40), url,
      position: [0, 0, 0], color, entry_fee_usdc: 0, type: 'community', tags, created: Date.now() };
    list.push(portal);
    fs.writeFileSync(COMMUNITY_FILE, JSON.stringify({ portals: list }, null, 2));
    res.json({ ok: true, portal });
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
});

module.exports = router;
