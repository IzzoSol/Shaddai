#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI UNIFIED MCP SERVER — ONE entrypoint for the whole SHADDAI world.
//
// Merges what used to be three separate MCP servers into a single stdio MCP
// server you register ONCE in Claude Desktop / Cursor / Claude Code / Copilot:
//
//   SHADDAI pillar   → the 7-agent team, orchestration, specialist runs
//   Art pillar       → TURTLE image generation
//   Knowledge/RAG    → rag_search, rag_ask, list_rag_docs, memory_search,
//                      get_route (the RAG brain + real router)
//   Money pillar     → spend caps, agent ledger (permit layer)
//
// Everything is proxied to the ONE live SHADDAI API so the same server works
// from anywhere (npx, local node, GitHub Copilot, Codespaces). Zero deps:
// JSON-RPC 2.0 over stdio.
//
// Config (Claude Desktop / Cursor / Copilot mcp settings):
//   { "mcpServers": { "shaddai": {
//       "command": "npx", "args": ["-y", "shaddai-mcp"],
//       "env": { "SHADDAI_API_URL": "https://shaddai-g81x.onrender.com" } } } }
// ─────────────────────────────────────────────────────────────────────────────
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const API = (process.env.SHADDAI_API_URL || 'https://shaddai-g81x.onrender.com').replace(/\/+$/, '');
const API_KEY = process.env.SHADDAI_API_KEY || ''; // optional — gate access to paying users
const VERSION = '1.0.0';

const AGENTS_INFO =
`SHADDAI — orchestrator; decomposes goals and coordinates the team
ORACLE — research, knowledge, science, health/body, psychology, esoteric
ZEROX  — revenue, pricing, offers, markets/crypto, business
NEXUS  — engineering, data, code, structuring deliverables
TURTLE — design, images, visuals, branding, logos
QUILL  — writing, descriptions, copy, docs, guides
PIKADON — security, risk, auditing, review`;

// ── Tool definitions (unified across every pillar) ───────────────────────────
const TOOLS = [
  // SHADDAI pillar
  {
    name: 'shaddai_orchestrate',
    description: 'Give SHADDAI a complex goal. It decomposes the task and routes each part to the right specialist agent, then returns a plan (execute=false) or runs it and returns combined results (execute=true).',
    inputSchema: { type: 'object', properties: {
      task: { type: 'string', description: 'The goal / request, in plain language.' },
      execute: { type: 'boolean', description: 'true = run the plan and return results; false (default) = return the plan only.' },
    }, required: ['task'] },
  },
  {
    name: 'shaddai_run_agent',
    description: 'Run a single SHADDAI specialist on a task. The agent uses its real tools (live data, research, github, markets, etc.) and returns the result plus which tools fired.',
    inputSchema: { type: 'object', properties: {
      agent: { type: 'string', description: 'ORACLE | ZEROX | NEXUS | TURTLE | QUILL | PIKADON | SHADDAI' },
      task: { type: 'string', description: 'What to do.' },
    }, required: ['agent', 'task'] },
  },
  {
    name: 'shaddai_generate_image',
    description: 'Generate an image with TURTLE (SHADDAI\'s design agent). Use for logos, illustrations, concept art, thumbnails, social pins, brand visuals, spiritual/art visuals. Give a detailed prompt; returns an image URL you can show or embed.',
    inputSchema: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Detailed description of the image to create.' },
      width: { type: 'number', description: 'optional pixel width (default 1024)' },
      height: { type: 'number', description: 'optional pixel height (default 1024)' },
    }, required: ['prompt'] },
  },
  {
    name: 'shaddai_list_agents',
    description: 'List the 7 SHADDAI agents and what each specializes in. Call this first if unsure which agent fits a task.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'shaddai_search_mastery',
    description: 'Search SHADDAI mastery cards (knowledge distilled from thousands of transcripts). Finds relevant chapters from any agent\'s training: SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON. Returns up to 5 matching passages with source names and relevance scores.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'What you want to know — the search question.' },
      agent: { type: 'string', description: 'Optional — narrow to one agent (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON). Defaults to all.' },
    }, required: ['query'] },
  },
  // Money pillar
  {
    name: 'shaddai_create_agent',
    description: 'Create a named SHADDAI agent that can spend money ONLY up to the caps you set. SHADDAI does NOT host inference — the agent runs on the user\'s own API key. This is the permit layer: set daily_cap_usd and per_call_cap_usd, then the agent can pay/trade only inside those limits, and you can revoke it one-click. Every action is written to a public ledger.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string', description: 'Human name for the agent, e.g. "Zerox-intern".' },
      daily_cap_usd: { type: 'number', description: 'Max USD the agent may spend per day. Default 5.' },
      per_call_cap_usd: { type: 'number', description: 'Max USD for a single call. Default 1. Hard ceiling 2500.' },
      allowed_tools: { type: 'array', items: { type: 'string' }, description: 'Optional tool allow-list; blank = all tools.' },
    }, required: ['name'] },
  },
  {
    name: 'shaddai_set_spend_policy',
    description: 'Update an existing agent\'s spend policy (new daily/per-call caps or tool allow-list). Apply the new limit immediately — existing daily spend counts against the new cap.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'The agent id (agt_...).' },
      daily_cap_usd: { type: 'number', description: 'New max daily spend in USD. Optional.' },
      per_call_cap_usd: { type: 'number', description: 'New max spend per single call in USD. Optional.' },
      allowed_tools: { type: 'array', items: { type: 'string' }, description: 'Optional new tool allow-list; leave unset to keep current.' },
    }, required: ['id'] },
  },
  {
    name: 'shaddai_revoke_agent',
    description: 'Revoke an agent immediately (one-click kill). The agent can no longer spend or run. Irreversible — recorded in the public ledger.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'The agent id (agt_...) to revoke.' },
    }, required: ['id'] },
  },
  {
    name: 'shaddai_get_agent_ledger',
    description: 'Read the public ledger — every agent_create / refuse / spend / revoke with redacted amounts. Show this before and after moving money so the user can see exactly what an agent did.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'Optional — narrow to a single agent id (agt_...). Omit for the full public ledger.' },
    }, required: [] },
  },
  // Knowledge / RAG pillar (the SHADDAI brain)
  {
    name: 'rag_search',
    description: 'Search the SHADDAI RAG brain (mastery / transcrips / knowledge store) and return ranked text passages with scores, source titles and agents. This is the working RAG brain on the live API. Use for bible interpretation, lessons, horoscopes, moon cycles, and any grounded knowledge retrieval.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'What to search for.' },
      agent: { type: 'string', description: 'Optional — narrow to one agent (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON). Defaults to all agents.' },
      topK: { type: 'number', description: 'Max results (default 6, max 30).' },
    }, required: ['query'] },
  },
  {
    name: 'rag_ask',
    description: 'Ask the SHADDAI RAG brain a question and get a grounded, cited answer plus sources. Use for "what does SHADDAI know about X?" / bible interpretation, lessons, horoscopes, moon cycles, and any grounded Q&A. NOTE: free tier allows a few grounded asks per day; sending the SHADDAI_API_KEY raises/unlocks it.',
    inputSchema: { type: 'object', properties: {
      question: { type: 'string', description: 'The question to answer from the knowledge base.' },
      agent: { type: 'string', description: 'Optional — agent whose knowledge to answer from (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON). Default SHADDAI.' },
    }, required: ['question'] },
  },
  {
    name: 'list_rag_docs',
    description: 'List the organized knowledge digests for an agent — each a structured breakdown (title, thesis, chapters, insights, quotes) of one source. Use before asking to see what organized knowledge exists.',
    inputSchema: { type: 'object', properties: {
      agent: { type: 'string', description: 'Agent whose digests to list (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON). Default SHADDAI.' },
    }, required: [] },
  },
  {
    name: 'memory_search',
    description: 'Semantic-memory search across saved SHADDAI notes. Returns scored text snippets by meaning, not keyword.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'What to search for.' },
      topK: { type: 'number', description: 'Max results (default 10).' },
    }, required: ['query'] },
  },
  {
    name: 'get_route',
    description: 'Route a message to the right SHADDAI agent based on what it is about (routeMessage). Returns which agent should handle it and why. Use when unsure which specialist fits a request.',
    inputSchema: { type: 'object', properties: {
      message: { type: 'string', description: 'The message / request to route.' },
    }, required: ['message'] },
  },
];

// Per-agent specialist tools — one named tool per agent so the model auto-picks the right one.
const SPECIALISTS = [
  { key: 'oracle',  agent: 'ORACLE',  desc: 'ORACLE — research, knowledge & intelligence. Use for: researching a topic, comparing options, market/knowledge questions, science, health/body, psychology, and anything needing live/current data.' },
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

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function callAPI(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-shaddai-key'] = API_KEY;
  try {
    const r = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    return r.json().catch(() => ({ error: 'bad response from SHADDAI API (' + r.status + ')' }));
  } catch (e) {
    return { error: 'request failed: ' + ((e && e.message) || e) };
  }
}

async function callAPIGet(path) {
  const headers = {};
  if (API_KEY) headers['x-shaddai-key'] = API_KEY;
  try {
    const r = await fetch(API + path, { method: 'GET', headers });
    return r.json().catch(() => ({ error: 'bad response from SHADDAI API (' + r.status + ')' }));
  } catch (e) {
    return { error: 'request failed: ' + ((e && e.message) || e) };
  }
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

// ── Tool execution ───────────────────────────────────────────────────────────
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

  // Knowledge / RAG pillar — brain-server TF-IDF brain (working on the live API)
  if (name === 'rag_search') {
    const qs = 'q=' + encodeURIComponent(args.query) +
      (args.agent ? '&agent=' + encodeURIComponent(args.agent.toUpperCase()) : '') +
      '&k=' + (Number(args.topK) || 6);
    const d = await callAPIGet('/api/search?' + qs);
    if (d.error) return 'Error: ' + d.error;
    const results = d.results || [];
    if (!results.length) return 'No knowledge matches found for "' + args.query + '".';
    return results.map((r, i) =>
      '[' + (i + 1) + '] ' + (r.title || r.source || '?') +
      ' [' + (r.agent || '?') + ', score: ' + (r.score != null ? Math.round(r.score * 100) : '?') + ']\n' +
      (r.text || '') + (r.timeLabel ? ' (at ' + r.timeLabel + ')' : '')
    ).join('\n\n');
  }

  if (name === 'rag_ask') {
    const qs = 'q=' + encodeURIComponent(args.question) +
      '&agent=' + encodeURIComponent((args.agent || 'SHADDAI').toUpperCase());
    const d = await callAPIGet('/api/ask?' + qs);
    if (d.error) return 'Error: ' + d.error;
    if (d.upgrade) return 'Free tier limit reached (' + d.message + '). Upgrade at ' + d.upgrade +
      ' or set the SHADDAI_API_KEY to unlock more.';
    let out = (d.answer || '').trim();
    if (d.llm_powered) out += '\n\n(powered by ' + d.provider + ', agent ' + d.agent + ')';
    if (Array.isArray(d.sources) && d.sources.length) {
      out += '\n\nSources:\n' + d.sources.map((s, i) =>
        (i + 1) + '. ' + s.title + ' [score: ' + (s.score != null ? Math.round(s.score * 100) : '?') + ']'
      ).join('\n');
    }
    return out || 'No grounded answer returned for that question.';
  }

  if (name === 'list_rag_docs') {
    const agent = (args.agent || 'SHADDAI').toUpperCase();
    const d = await callAPIGet('/api/digests?agent=' + encodeURIComponent(agent));
    if (d.error) return 'Error: ' + d.error;
    const digests = d.digests || [];
    if (!digests.length) return 'No digests for "' + agent + '" yet.';
    return 'Knowledge digests for ' + agent + ' (' + d.count + '):\n' + digests.map((doc, i) => {
      const line = (i + 1) + '. ' + (doc.title || doc.name) +
        (doc.runtimeLabel ? ' (' + doc.runtimeLabel + ')' : '') +
        ' — ' + doc.chapters + ' chapters, ' + doc.insights + ' insights, ' + doc.quotes + ' quotes';
      const thesis = String(doc.thesis || '').slice(0, 160);
      return thesis ? line + '\n   ' + thesis : line;
    }).join('\n');
  }

  if (name === 'memory_search') {
    const d = await callAPI('/api/rag/memory-search', { query: args.query, topK: args.topK || 10 });
    if (d.error) return 'Error: ' + d.error;
    const results = d.results || [];
    if (!results.length) return 'No memory matches found for "' + args.query + '".';
    return results.map((r, i) =>
      '[' + (i + 1) + '] (' + r.type + ', score: ' + r.score + ')\n' + r.text
    ).join('\n\n');
  }

  if (name === 'get_route') {
    const d = await callAPIGet('/api/route?q=' + encodeURIComponent(args.message));
    if (d.error) return 'Error: ' + d.error;
    const best = d && d.ranked && d.ranked[0];
    const agent = (best && best.agent) || d.routedAgent || 'SHADDAI';
    let out = 'Routed to ' + agent;
    if (best && best.score != null) out += ' (score: ' + Math.round(best.score * 100) + ')';
    if (Array.isArray(d.matchedTopics) && d.matchedTopics.length) out += '\nMatched topics: ' + d.matchedTopics.join(', ');
    if (Array.isArray(d.knows) && d.knows.length) out += '\nWhy: ' + d.knows.map(k => k.topic + ' (' + k.sources + ' sources)').join(', ');
    return out;
  }

  // Specialist / agent runs
  const spec = SPECIALISTS.find(s => name === 'shaddai_' + s.key);
  if (spec) {
    const d = await callAPI('/api/agentic/run', { agent: spec.agent, task: args.task });
    if (d.error) return 'Error: ' + d.error;
    const tools = d.toolsUsed && d.toolsUsed.length ? '[tools used: ' + d.toolsUsed.join(', ') + ']\n\n' : '';
    return tools + (d.response || '');
  }

  // Money pillar
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
    return 'Ledger' + label + ' (' + (recs.length || 0) + ' entries):\n' + fmtLedger(recs);
  }

  return 'Unknown tool: ' + name;
}

// ── Protocol machinery (stdio, newline-delimited JSON-RPC 2.0) ───────────────
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
        serverInfo: { name: 'shaddai', version: VERSION },
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
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: String((e && e.message) || e) } });
  }
});

process.stderr.write('shaddai-unified-mcp ready → ' + API + '\n');

// Allow importing as a module (for tests / federation door).
module.exports = { callTool, TOOLS, AGENTS_INFO, API };