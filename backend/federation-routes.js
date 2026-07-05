// federation-routes.js — exposes SHADDAI's 7 agents to the outside world (MEGA_BUILD_SPEC §3 + §5).
//   GET  /.well-known/agent.json  — A2A Agent Card (discover SHADDAI's skills)
//   GET  /.well-known/mcp.json    — MCP manifest (Claude Desktop / Cursor can hire agents)
//   POST /api/a2a                 — A2A task submission (skill → agent), x402-gated
//   POST /mcp/tools/call          — MCP tool execution
// Mount with: app.use(require('./federation-routes'))
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();
let ae = null; try { ae = require('./agent-engine'); } catch (e) { console.warn('[federation] agent-engine unavailable:', e.message); }

const BASE = () => process.env.RENDER_EXTERNAL_URL || 'http://localhost:8099';

const AGENTS = [
  { id:'SHADDAI', skill:'orchestration',  name:'Multi-Agent Orchestration', tags:['orchestration','workflow','delegate'],        description:'Master orchestrator — delegates sub-tasks, runs multi-agent chains, executive synthesis.' },
  { id:'ORACLE',  skill:'research',        name:'Research & Intelligence',   tags:['research','web','arxiv','news','wikipedia'],   description:'Deep research: web, arxiv, news, wikipedia, hacker news, semantic scholar.' },
  { id:'ZEROX',   skill:'defi_analysis',   name:'DeFi & Market Analysis',    tags:['crypto','defi','prices','whales','solana'],    description:'Live crypto prices, DefiLlama TVL/yields, DEX data, whale tracking, Solana tokens.' },
  { id:'NEXUS',   skill:'code',            name:'Code & Architecture',       tags:['code','github','npm','regex','diagrams'],      description:'Code analysis, github/npm intel, bundle size, CVE lookup, diagrams.' },
  { id:'QUILL',   skill:'writing',         name:'Writing & Content',         tags:['writing','social','translate','rss'],          description:'Summarize, translate, tweet threads, readability, RSS, copywriting.' },
  { id:'TURTLE',  skill:'creative',        name:'Image & Creative',          tags:['image','art','svg','design','palette'],        description:'Image generation, SVG charts, color palettes, font pairing.' },
  { id:'PIKADON', skill:'security',        name:'Security Audit',            tags:['security','cve','ports','breach'],             description:'Security audits, CVE lookup, port/IP checks, code-vuln scanning.' },
];
const SKILL_AGENT = Object.fromEntries(AGENTS.map(a => [a.skill, a.id]));

// ── A2A Agent Card (discovery) ──
router.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'SHADDAI Agent Council',
    description: 'A sovereign AI agent civilization — 7 specialized agents for research, DeFi, code, writing, creative, security, and orchestration. Hire per-task via x402.',
    url: `${BASE()}/api/a2a`, version: '1.0.0', protocolVersion: '1.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: AGENTS.map(a => ({ id: a.skill, name: a.name, tags: a.tags, description: a.description })),
    security_schemes: { x402: { type: 'http', scheme: 'x402', description: 'Pay-per-task with x402 micropayments (USDC on Base or Solana).' } },
  });
});

// ── MCP manifest (Claude Desktop / Cursor) ──
router.get('/.well-known/mcp.json', (req, res) => {
  res.json({
    mcp_version: '2025-11-05',
    server: { name: 'SHADDAI Agent Council', version: '1.0.0', url: BASE() },
    tools: AGENTS.map(a => ({
      name: `shaddai_${a.id.toLowerCase()}`,
      description: a.description,
      inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'The task to assign to this agent' } }, required: ['task'] },
    })),
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

function startTask(agentId, task) {
  if (!ae || !ae.createTask) return { error: 'agent engine unavailable' };
  if (!task) return { error: 'task is required' };
  const t = ae.createTask(String(task), agentId, {});
  ae.runAgentLoop(t.id).catch(e => console.error('[federation task]', agentId, e.message));
  return { taskId: t.id, agent: agentId, status: 'running', poll: `/api/agent/task/${t.id}` };
}

// ── A2A task submission ──
router.post('/api/a2a', json, (req, res) => {
  const { skill, message, task } = req.body || {};
  const agent = SKILL_AGENT[skill] || 'SHADDAI';
  const text = (message && message.parts && message.parts[0] && message.parts[0].text)
    || (typeof message === 'string' ? message : null) || task || '';
  recordVisitor(req, skill || 'orchestration', agent);
  if (process.env.X402_ENABLED === 'true' && skill !== 'research' && !req.headers['x-payment']) {
    return res.status(402).json({ error: 'Payment required', x402: { amount: '0.01', currency: 'USDC', network: 'base', address: process.env.TREASURY_WALLET || '' } });
  }
  const r = startTask(agent, text);
  return res.status(r.error ? 400 : 202).json({ status: r.error ? 'error' : 'accepted', ...r });
});

// ── MCP tool execution ──
router.post('/mcp/tools/call', json, (req, res) => {
  const { name, arguments: args } = req.body || {};
  const agentId = String(name || '').replace('shaddai_', '').toUpperCase();
  recordVisitor(req, 'mcp', agentId);
  const r = startTask(agentId, (args && args.task) || '');
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
