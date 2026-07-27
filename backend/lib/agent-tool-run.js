// backend/lib/agent-tool-run.js
// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION-CALLING AGENT RUNNER — the agentic core.
// The model is shown the agent's real tool schemas, it decides which to call,
// THIS CODE executes them (TOOLS[name].execute), feeds results back, and loops
// until the agent answers. Returns the answer + exactly which tools fired.
//
// Best-practice guardrails baked in:
//   • App controls execution — the model only *suggests* a tool; we validate + run it.
//   • Safety denylist — no writes / trades / posting / code-exec from this endpoint.
//   • Hard step cap — can't loop forever.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const axios = require('axios');

let _engine = null;
function eng() { if (!_engine) _engine = require('../agent-engine'); return _engine; }

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_TOOL_MODEL || 'llama-3.3-70b-versatile';
const MAX_STEPS = 5;
const MAX_TOOLS_SHOWN = 10; // narrow choice surface — fewer schemas = fewer tokens = fewer rate-limits + sharper picks

// Read-only base if an agent has no tool list.
const BASE = ['search_web', 'calculate', 'fetch_url', 'summarize_text', 'wikipedia_search'];

// Never callable from this endpoint (side effects, money, code exec, recursion).
const DENY = new Set([
  'write_file', 'delete_file', 'run_js', 'run_python', 'execute_trade', 'complete_job',
  'bid_on_job', 'pay_api_call', 'mint_collectible', 'list_collectible', 'browse_listings',
  'post_discord', 'send_telegram', 'post_webhook', 'create_github_issue',
  'install_skill_pack', 'create_skill_pack', 'save_memory', 'remember_fact', 'save_to_inbox',
  'set_agent_room_state', 'save_room_layout', 'delegate_to_agent', 'execute_trade',
]);

function jsonType(s) {
  const m = String(s || '').match(/^\s*(string|number|integer|int|boolean|bool|array|object)/i);
  let t = m ? m[1].toLowerCase() : 'string';
  if (t === 'int') t = 'integer';
  if (t === 'bool') t = 'boolean';
  return t;
}
function toOpenAITool(t) {
  const props = {}, schema = t.schema || {};
  for (const k of Object.keys(schema)) {
    const raw = String(schema[k]);
    const desc = raw.includes('—') ? raw.split('—').slice(1).join('—').trim() : raw;
    props[k] = { type: jsonType(raw), description: desc.slice(0, 140) };
  }
  return {
    type: 'function',
    function: {
      name: t.name,
      description: String(t.description || '').slice(0, 240),
      parameters: { type: 'object', properties: props, required: [] },
    },
  };
}

// Build the Groq key pool: BYOK first, then env (GROQ_API_KEY, GROQ_KEYS csv, GROQ_API_KEY_2..8),
// then runtime-keys.json. Rotating across keys multiplies the free-tier rate limit.
function groqKeyPool(byok) {
  const out = [];
  const add = k => { k = String(k || '').trim(); if (k && !out.includes(k)) out.push(k); };
  add(byok);
  add(process.env.GROQ_API_KEY);
  if (process.env.GROQ_KEYS) String(process.env.GROQ_KEYS).split(',').forEach(add);
  for (let i = 2; i <= 8; i++) add(process.env['GROQ_API_KEY_' + i]);
  try {
    const fs = require('fs'), path = require('path');
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8'));
    if (Array.isArray(j.GROQ_KEYS)) j.GROQ_KEYS.forEach(add);
    add(j.GROQ_API_KEY);
  } catch (_) {}
  return out;
}

// Call Groq, rotating keys + backing off on 429/401/403/5xx.
async function groq(messages, tools, keys) {
  const body = { model: MODEL, messages, temperature: 0.4, max_tokens: 1500 };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  let lastErr;
  for (let i = 0; i < keys.length; i++) {
    try {
      const r = await axios.post(GROQ_URL, body, {
        headers: { Authorization: 'Bearer ' + keys[i], 'Content-Type': 'application/json' }, timeout: 45000,
      });
      return r.data.choices && r.data.choices[0] && r.data.choices[0].message;
    } catch (e) {
      lastErr = e;
      const st = e.response && e.response.status;
      if (st === 429 || st === 401 || st === 403 || st === 500 || st === 503) {
        await new Promise(r => setTimeout(r, 450 + i * 350)); // backoff, then rotate to the next key
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('all Groq keys exhausted');
}

async function runAgentWithTools(agentName, task, opts = {}) {
  const { TOOLS, AGENTS } = eng();
  const A = String(agentName || 'ORACLE').toUpperCase();
  const agent = AGENTS[A] || {};
  const keys = groqKeyPool(opts.apiKey);
  if (!keys.length) throw new Error('No Groq key configured');

  const toolNames = (Array.isArray(agent.tools) && agent.tools.length ? agent.tools : BASE)
    .filter(n => TOOLS[n] && !DENY.has(n))
    .slice(0, MAX_TOOLS_SHOWN);
  const oaTools = toolNames.map(n => toOpenAITool(TOOLS[n]));

  const messages = [
    { role: 'system', content:
      'You are ' + A + ', a specialist on the SHADDAI team. Use the provided tools to actually DO the task with real data — ' +
      'call a tool when it gives you real information, then answer concisely and concretely based on what the tools returned. ' +
      'Do not invent data a tool could fetch. No self-description, no product pitch.' },
    { role: 'user', content: String(task) },
  ];

  const toolsUsed = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await groq(messages, oaTools, keys);
    if (!msg) break;
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      return { response: msg.content || '', toolsUsed, steps: step + 1, model: MODEL };
    }
    for (const c of calls) {
      const name = c.function && c.function.name;
      let args = {};
      try { args = JSON.parse((c.function && c.function.arguments) || '{}'); } catch (_) {}
      let result;
      const t = TOOLS[name];
      if (!t || DENY.has(name)) { result = { error: 'tool not available: ' + name }; }
      else {
        try { result = await t.execute(args); toolsUsed.push(name); }
        catch (e) { result = { error: String((e && e.message) || e) }; }
      }
      messages.push({
        role: 'tool', tool_call_id: c.id, name,
        content: (typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 4000),
      });
    }
  }
  // Step cap reached → force a final answer from the gathered tool results.
  try {
    const finalMsg = await groq(
      messages.concat([{ role: 'user', content: 'Give your final concise answer now, based on the tool results above.' }]),
      null, keys);
    return { response: (finalMsg && finalMsg.content) || '', toolsUsed, steps: MAX_STEPS, model: MODEL, capped: true };
  } catch (_) {
    return { response: '(reached step limit)', toolsUsed, steps: MAX_STEPS, capped: true };
  }
}

// Express handler — POST /api/agent/run  { agent, task | message, apiKey? }
async function handler(req, res) {
  try {
    const b = req.body || {};
    const task = b.task || b.message;
    if (!task) return res.status(400).json({ error: 'task (or message) required' });
    const t0 = Date.now();
    const out = await runAgentWithTools(b.agent, task, { apiKey: b.apiKey });
    res.json(Object.assign({ agent: String(b.agent || 'ORACLE').toUpperCase(), durationMs: Date.now() - t0 }, out));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

module.exports = { runAgentWithTools, handler };
