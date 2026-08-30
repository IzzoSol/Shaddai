#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI MCP SERVER — plug the SHADDAI 7-agent team + 556 tools into any
// MCP client (Claude Desktop, Cursor, Claude Code). Zero dependencies:
// speaks JSON-RPC 2.0 over stdio and proxies to the SHADDAI API.
//
// Config (Claude Desktop / Cursor mcp settings):
//   { "mcpServers": { "shaddai": {
//       "command": "npx", "args": ["-y", "shaddai-mcp"],
//       "env": { "SHADDAI_API_URL": "https://shaddai-g81x.onrender.com" } } } }
// ─────────────────────────────────────────────────────────────────────────────
const readline = require('readline');

const API = (process.env.SHADDAI_API_URL || 'https://shaddai-g81x.onrender.com').replace(/\/+$/, '');
const API_KEY = process.env.SHADDAI_API_KEY || ''; // optional — gate access to paying users

const AGENTS_INFO =
`SHADDAI — orchestrator; decomposes goals and coordinates the team
ORACLE — research, knowledge, science, health/body, psychology, esoteric
ZEROX  — revenue, pricing, offers, markets/crypto, business
NEXUS  — engineering, data, code, structuring deliverables
TURTLE — design, images, visuals, branding, logos
QUILL  — writing, descriptions, copy, docs, guides
PIKADON — security, risk, auditing, review`;

const TOOLS = [
  {
    name: 'shaddai_orchestrate',
    description: 'Give SHADDAI a complex goal. It decomposes the task and routes each part to the right specialist agent, then returns a plan (execute=false) or runs it and returns combined results (execute=true).',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The goal / request, in plain language.' },
        execute: { type: 'boolean', description: 'true = run the plan and return results; false (default) = return the plan only.' },
      },
      required: ['task'],
    },
  },
  {
    name: 'shaddai_run_agent',
    description: 'Run a single SHADDAI specialist on a task. The agent uses its real tools (live data, research, github, markets, etc.) and returns the result plus which tools fired.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'ORACLE | ZEROX | NEXUS | TURTLE | QUILL | PIKADON | SHADDAI' },
        task: { type: 'string', description: 'What to do.' },
      },
      required: ['agent', 'task'],
    },
  },
  {
    name: 'shaddai_generate_image',
    description: 'Generate an image with TURTLE (SHADDAI\'s design agent). Use for logos, illustrations, concept art, thumbnails, social pins, brand visuals. Give a detailed prompt; returns an image URL you can show or embed.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to create.' },
        width: { type: 'number', description: 'optional pixel width (default 1024)' },
        height: { type: 'number', description: 'optional pixel height (default 1024)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'shaddai_list_agents',
    description: 'List the 7 SHADDAI agents and what each specializes in. Call this first if unsure which agent fits a task.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'shaddai_search_mastery',
    description: 'Search SHADDAI mastery cards (knowledge distilled from thousands of transcripts). Finds relevant chapters from any agent\'s training: SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON. Returns up to 5 matching passages with source names and relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you want to know — the search question.' },
        agent: { type: 'string', description: 'Optional — narrow to one agent (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON). Defaults to all.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'shaddai_create_agent',
    description: 'Create a named SHADDAI agent that can spend money ONLY up to the caps you set. SHADDAI does NOT host inference — the agent runs on the user\'s own API key. This is the permit layer: set daily_cap_usd and per_call_cap_usd, then the agent can pay/trade only inside those limits, and you can revoke it one-click at any time. Every action is written to a public ledger.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human name for the agent, e.g. "Zerox-intern".' },
        daily_cap_usd: { type: 'number', description: 'Max USD the agent may spend per day. Default 5.' },
        per_call_cap_usd: { type: 'number', description: 'Max USD for a single call. Default 1. Hard ceiling 2500.' },
        allowed_tools: { type: 'array', items: { type: 'string' }, description: 'Optional tool allow-list; blank = all tools.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'shaddai_set_spend_policy',
    description: 'Update an existing agent\'s spend policy (new daily/per-call caps or tool allow-list). Apply the new limit immediately — existing daily spend counts against the new cap.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The agent id (agt_...).' },
        daily_cap_usd: { type: 'number', description: 'New max daily spend in USD. Optional.' },
        per_call_cap_usd: { type: 'number', description: 'New max spend per single call in USD. Optional.' },
        allowed_tools: { type: 'array', items: { type: 'string' }, description: 'Optional new tool allow-list; leave unset to keep current.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'shaddai_revoke_agent',
    description: 'Revoke an agent immediately (one-click kill). The agent can no longer spend or run. Irreversible — recorded in the public ledger.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The agent id (agt_...) to revoke.' } },
      required: ['id'],
    },
  },
  {
    name: 'shaddai_get_agent_ledger',
    description: 'Read the public ledger — every agent_create / refuse / spend / revoke with redacted amounts. Show this before and after moving money so the user can see exactly what an agent did.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Optional — narrow to a single agent id (agt_...). Omit for the full public ledger.' } },
      required: [],
    },
  },
];

// Per-agent specialist tools — one named tool per agent so the model auto-picks the right one.
const SPECIALISTS = [
  { key: 'oracle',  agent: 'ORACLE',  desc: 'ORACLE — research & intelligence. Use for: researching a topic, comparing options, market/knowledge questions, science, health/body, psychology, and anything needing live/current data.' },
  { key: 'zerox',   agent: 'ZEROX',   desc: 'ZEROX — revenue & business. Use for: pricing a product, building an irresistible offer, monetization strategy, and market/crypto analysis.' },
  { key: 'nexus',   agent: 'NEXUS',   desc: 'NEXUS — engineering & systems. Use for: technical plans, code, architecture, github/npm lookups, and structuring/assembling deliverables.' },
  { key: 'turtle',  agent: 'TURTLE',  desc: 'TURTLE — design direction. Use for: brand and visual concepts, UX ideas, color/type direction. (For an actual image, use shaddai_generate_image.)' },
  { key: 'quill',   agent: 'QUILL',   desc: 'QUILL — writing & copy. Use for: posts, sales pages, emails, docs, product descriptions, and any clear written content.' },
  { key: 'pikadon', agent: 'PIKADON', desc: 'PIKADON — security & risk. Use for: security audits, pre-launch checklists, vulnerability review, and "is this safe?" questions.' },
];
SPECIALISTS.forEach(s => TOOLS.push({
  name: 'shaddai_' + s.key,
  description: s.desc,
  inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'What you want this specialist to do.' } }, required: ['task'] },
}));

async function callAPI(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-shaddai-key'] = API_KEY;
  const r = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify(body) });
  return r.json().catch(() => ({ error: 'bad response from SHADDAI API (' + r.status + ')' }));
}

async function callAPIGet(path) {
  const headers = {};
  if (API_KEY) headers['x-shaddai-key'] = API_KEY;
  const r = await fetch(API + path, { method: 'GET', headers });
  return r.json().catch(() => ({ error: 'bad response from SHADDAI API (' + r.status + ')' }));
}

function fmtAgentLine(a) {
  if (!a || typeof a === 'string') return String(a || '?');
  return a.id +
    (a.name ? ' "' + a.name + '"' : '') +
    ' daily=$' + a.daily_cap_usd + ' call=$' + a.per_call_cap_usd +
    ' spent_today=$' + (a.spent_today || 0) +
    ' status=' + (a.revoked ? 'REVOKED' : 'active');
}

function fmtLedger(entries) {
  if (!entries || !entries.length) return 'Ledger is empty — nothing has been spent or revoked yet.';
  return entries.map((e) =>
    '[' + (e.at || e.ts || '') + '] ' + (e.agent || '?') + ' ' + (e.kind || e.type || 'event') +
    (e.amount_usd != null ? ' amount=$' + e.amount_usd : '') +
    (e.status ? ' status=' + e.status : '') +
    (e.tool ? ' tool=' + e.tool : '') +
    (e.reason ? ' — ' + e.reason : '')
  ).slice(0, 60).join('\n');
}

async function callTool(name, args) {
  args = args || {};
  if (name === 'shaddai_list_agents') return AGENTS_INFO;

  if (name === 'shaddai_orchestrate') {
    const d = await callAPI('/api/orchestrate', { task: args.task, execute: !!args.execute });
    if (d.error) return 'Error: ' + d.error;
    let out = 'Deliverable: ' + (d.deliverable || '') +
      '\nAgents: ' + (d.agents || []).join(', ') +
      '\n\nPlan:\n' + (d.plan || []).map((s, i) => (i + 1) + '. ' + s.agent + ': ' + s.task).join('\n');
    if (Array.isArray(d.results)) {
      out += '\n\nResults:\n' + d.results.map(r =>
        '— ' + r.agent + (r.toolsUsed && r.toolsUsed.length ? ' [' + r.toolsUsed.join(', ') + ']' : '') +
        ':\n' + (r.response || r.error || '')).join('\n\n');
    }
    return out;
  }

  if (name === 'shaddai_run_agent') {
    const d = await callAPI('/api/agentic/run', { agent: args.agent, task: args.task });
    if (d.error) return 'Error: ' + d.error;
    const tools = d.toolsUsed && d.toolsUsed.length ? '[tools used: ' + d.toolsUsed.join(', ') + ']\n\n' : '';
    return tools + (d.response || '');
  }

  if (name === 'shaddai_generate_image') {
    const d = await callAPI('/api/image/generate', {
      prompt: args.prompt, width: args.width || 1024, height: args.height || 1024,
    });
    const url = d.url || d.image_url;
    if (!url) return 'Error: ' + (d.error || 'no image returned');
    return 'TURTLE generated an image:\n' + url + '\n\n![generated image](' + url + ')';
  }

  if (name === 'shaddai_search_mastery') {
    const d = await callAPI('/api/mastery/search', { query: args.query, agent: args.agent || '' });
    if (d.error) return 'Error: ' + d.error;
    if (!d.ok || !d.results || !d.results.length) return 'No mastery matches found for "' + args.query + '".';
    return d.results.map((r, i) =>
      '[' + (i + 1) + '] ' + r.source + ' (relevance: ' + r.score + ')\n' + r.chunk
    ).join('\n\n');
  }

  const spec = SPECIALISTS.find(s => name === 'shaddai_' + s.key);
  if (spec) {
    const d = await callAPI('/api/agentic/run', { agent: spec.agent, task: args.task });
    if (d.error) return 'Error: ' + d.error;
    const tools = d.toolsUsed && d.toolsUsed.length ? '[tools used: ' + d.toolsUsed.join(', ') + ']\n\n' : '';
    return tools + (d.response || '');
  }

  if (name === 'shaddai_create_agent') {
    const d = await callAPI('/api/policy/agent', {
      name: args.name,
      daily_cap_usd: args.daily_cap_usd,
      per_call_cap_usd: args.per_call_cap_usd,
      allowed_tools: args.allowed_tools,
    });
    if (!d.ok || !d.agent) return 'Error: ' + (d.error || JSON.stringify(d));
    const a = d.agent;
    return 'Created agent → ' + fmtAgentLine(a) +
      '\n\nIt can pay/trade only inside these caps and runs on the user\'s OWN API key (Shaddai does not host inference). ' +
      'Revoke anytime with shaddai_revoke_agent. Every move is in the public ledger (shaddai_get_agent_ledger).';
  }

  if (name === 'shaddai_set_spend_policy') {
    const d = await callAPI('/api/policy/agent/' + args.id, {
      daily_cap_usd: args.daily_cap_usd,
      per_call_cap_usd: args.per_call_cap_usd,
      allowed_tools: args.allowed_tools,
    });
    if (!d.ok || !d.agent) return 'Error: ' + (d.error || JSON.stringify(d));
    return 'Updated policy → ' + fmtAgentLine(d.agent);
  }

  if (name === 'shaddai_revoke_agent') {
    const d = await callAPI('/api/policy/agent/' + args.id + '/revoke', {});
    if (!d.ok) return 'Error: ' + (d.error || JSON.stringify(d));
    return 'REVOKED agent ' + d.agent + ' (revoked=' + d.revoked + '). It can no longer spend or run. Recorded in the public ledger.';
  }

  if (name === 'shaddai_get_agent_ledger') {
    const recs = args.id
      ? (await callAPIGet('/api/policy/agent/' + args.id + '/ledger')).records || []
      : (await callAPIGet('/api/policy/ledger')).ledger || [];
    const label = args.id ? ' for agent ' + args.id : ' (public)';
    return 'Ledger' + label + ' (' + recs.length + ' entries):\n' + fmtLedger(recs);
  }
  return 'Unknown tool: ' + name;
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  line = String(line || '').trim();
  if (!line) return;
  let req;
  try { req = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = req;
  try {
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'shaddai', version: '0.3.0' },
      } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const text = await callTool(params && params.name, (params && params.arguments) || {});
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(text).slice(0, 12000) }] } });
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
    }
    // notifications (no id) are ignored
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: String((e && e.message) || e) } });
  }
});

process.stderr.write('shaddai-mcp ready → ' + API + '\n');
