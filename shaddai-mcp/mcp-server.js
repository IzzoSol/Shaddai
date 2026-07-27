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
    name: 'shaddai_list_agents',
    description: 'List the 7 SHADDAI agents and what each specializes in.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

async function callAPI(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-shaddai-key'] = API_KEY;
  const r = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify(body) });
  return r.json().catch(() => ({ error: 'bad response from SHADDAI API (' + r.status + ')' }));
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
        serverInfo: { name: 'shaddai', version: '0.1.0' },
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
