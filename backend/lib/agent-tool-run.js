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
const llmRouter = require('./llm-router'); // multi-provider router — Groq primary, OpenAI/DeepSeek/OpenRouter function-calling fallback

let _engine = null;
function eng() { if (!_engine) _engine = require('../agent-engine'); return _engine; }
let _kb = null;
function kb() { if (!_kb) { try { _kb = require('./knowledge'); } catch (_) { _kb = { contextFor: () => '', learn: () => {} }; } } return _kb; }

const MODEL = process.env.GROQ_TOOL_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
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

// Read the SAME persisted key vault agent-engine.js's callLLM() reads (backend/data/
// byok-keys.json, written by POST /api/byok/set) — highest-permission tier first.
// 2026-08-29: forged agents (this file) never read this at all before — only the
// council-agent path did — so a forged agent could never actually draw on a saved
// vault key, despite forge.html's own UI showing BYOK status/set controls.
function getVaultKey(provider) {
  try {
    const fs = require('fs'), path = require('path');
    const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'byok-keys.json'), 'utf8'));
    for (const tier of ['alpha', 'pro', 'builder', 'free']) {
      const entry = store[`${tier}:${provider}`];
      if (entry && typeof entry.key === 'string' && entry.key.length > 8) return entry.key;
    }
  } catch (_) { /* file absent or parse error */ }
  return '';
}

// Build the Groq key pool: an explicitly-passed key first, then the persisted vault,
// then env (GROQ_API_KEY, GROQ_KEYS csv, GROQ_API_KEY_2..8), then runtime-keys.json.
// Rotating across keys multiplies the free-tier rate limit.
function groqKeyPool(byok) {
  const out = [];
  const add = k => { k = String(k || '').trim(); if (k && !out.includes(k)) out.push(k); };
  add(byok);
  add(getVaultKey('groq'));
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

// Call the LLM through the multi-provider router (function-calling shape). The
// SAME rotated Groq key pool feeds the primary provider; if every Groq key is
// exhausted/rate-limited the router falls through to the other configured
// tool-capable providers (openai → deepseek → openrouter) instead of failing
// the whole run. Returns the resolved { message, provider, model }.
async function modelCall(messages, tools, keys) {
  return llmRouter.chatTools(messages, tools || [], {
    groqKeys: keys,
    model: MODEL,
    temperature: 0.4,
    max_tokens: 1500,
    timeoutMs: 45000,
  });
}

// AURA lazy-load (matches the try/catch-optional pattern used everywhere else
// AURA is wired in — agent-engine.js's modelChat, api-proxy-routes.js's
// /api/model/chat — so a missing/broken aura.js degrades to "always call Groq"
// rather than breaking this endpoint).
let _aura = null;
function aura() { if (!_aura) { try { _aura = require('./aura'); } catch (_) { _aura = { route: () => ({ hit: false }), recordAnswer: () => {} }; } } return _aura; }

// Reputation accumulator — feeds lib/reputation-engine so per-agent accuracy /
// latency compound from real runs (directory + leaderboard rank by evidence).
// Optional: a missing/broken dimmer degrades to "no-op" rather than erroring.
let _rep = null;
function rep() { if (!_rep) { try { _rep = require('./reputation-engine'); } catch (_) { _rep = { record: () => {} }; } } return _rep; }

async function runAgentWithTools(agentName, task, opts = {}) {
  const { TOOLS, AGENTS } = eng();
  const A = String(agentName || 'ORACLE').toUpperCase();
  const agent = AGENTS[A] || {};
  const repStart = Date.now();
  const tally = (outcome, tool) => {
    try { rep().record({ agent: A, outcome, latencyMs: Date.now() - repStart, tool: String(tool || 'none').slice(0, 80), task: String(task || '').slice(0, 120) }); } catch (_) {}
  };

  // AURA free-path FIRST — before even requiring a Groq key, so a cache hit
  // costs $0 and works even with no keys configured. This endpoint (Simple
  // Mode's action wheel, the federation/MCP door) previously called Groq
  // directly on every request, completely bypassing the token-saver every
  // other agent-chat path already goes through.
  try {
    const hit = aura().route(String(task), { scope: A });
    if (hit && hit.hit && hit.answer) {
      tally(null, 'aura-cache');
      return { response: hit.answer, toolsUsed: [], steps: 0, model: 'aura-cache', cached: true, tokensSaved: hit.savedTokensEst || 0 };
    }
  } catch (_) {}

  const keys = groqKeyPool(opts.apiKey);
  const anyCloud = keys.length || llmRouter.getProviders().some(p => p.id !== 'anthropic');
  if (!anyCloud) throw new Error('No LLM key configured (Groq primary, OpenAI/DeepSeek/OpenRouter fallback)');

  // opts.tools overrides agent's built-in tool list (used for forged operatives
  // whose tool loadout lives in operatives.json, not the AGENTS map).
  const toolSource = Array.isArray(opts.tools) && opts.tools.length ? opts.tools
                   : Array.isArray(agent.tools) && agent.tools.length ? agent.tools
                   : BASE;
// Merge the user's custom API services (from the BYOK vault) into the tool
  // surface so they resolve + execute exactly like native tools. opts.includeCustomTools
  // is on by default; pass false to restrict to built-ins only.
  let customTools = {};
  if (opts.includeCustomTools !== false) {
    try { customTools = require('./api-vault').customToolRegistry() || {}; } catch (_e) { customTools = {}; }
  }
  const resolveTool = (n) => TOOLS[n] || customTools[n];
  const candidates = toolSource.filter(n => resolveTool(n) && !DENY.has(n)).map(n => resolveTool(n));
  // 2026-08-30: this used to be a blind .slice(0, MAX_TOOLS_SHOWN) — whatever 10 tools
  // happened to be FIRST in the agent's array, regardless of the actual task. ZEROX's
  // tools array lists paybox_pay near the end, so it was NEVER shown here no matter
  // what was asked — reproduced live (ZEROX correctly picked a token, then said
  // "paybox_pay isn't available"). Reuse the same relevance-ranked selector
  // agent-engine.js's callLLM already uses, so a task that needs a specific tool
  // actually gets it shown, not just whichever tools happened to be listed first.
  let selected;
  try {
    selected = require('./tool-selector').selectTools(String(task || ''), candidates, { max: MAX_TOOLS_SHOWN, min: Math.min(6, candidates.length), agent: A });
  } catch (_) { selected = candidates.slice(0, MAX_TOOLS_SHOWN); }
  const toolNames = selected.map(t => t.name);
  const oaTools = selected.map(toOpenAITool);

  // Persona: use opts.persona (from operative.brain.persona) when set,
  // otherwise fall back to generic identity.
  const persona = opts.persona
    ? String(opts.persona).slice(0, 600)
    : 'You are ' + A + ', a specialist on the SHADDAI team.';
  let sysContent =
    persona + ' Use the provided tools to actually DO the task with real data — ' +
    'call a tool when it gives you real information, then answer concisely and concretely based on what the tools returned. ' +
    'Do not invent data a tool could fetch. No self-description, no product pitch.';
  try { const kctx = kb().contextFor(A, task); if (kctx) sysContent += '\n\n' + kctx; } catch (_) {}
  const messages = [
    { role: 'system', content: sysContent },
    { role: 'user', content: String(task) },
  ];

  const toolsUsed = [];
  let lastModel = MODEL, lastProvider = 'groq';
  for (let step = 0; step < MAX_STEPS; step++) {
    const mres = await modelCall(messages, oaTools, keys);
    const msg = mres.message;
    lastModel = mres.model; lastProvider = mres.provider;
    if (!msg) break;
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      try { kb().learn(A, task, msg.content || ''); } catch (_) {}
      try { if (msg.content) aura().recordAnswer(String(task), msg.content, { scope: A }); } catch (_) {}
      tally(true, toolsUsed.join(','));
      return { response: msg.content || '', toolsUsed, steps: step + 1, model: lastModel, provider: lastProvider };
    }
    for (const c of calls) {
      const name = c.function && c.function.name;
      let args = {};
      try { args = JSON.parse((c.function && c.function.arguments) || '{}'); } catch (_) {}
      let result;
      const t = TOOLS[name] || customTools[name];
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
    const fRes = await modelCall(
      messages.concat([{ role: 'user', content: 'Give your final concise answer now, based on the tool results above.' }]),
      null, keys);
    const finalMsg = fRes.message;
    lastModel = fRes.model; lastProvider = fRes.provider;
    try { if (finalMsg && finalMsg.content) aura().recordAnswer(String(task), finalMsg.content, { scope: A }); } catch (_) {}
    tally(!!(finalMsg && finalMsg.content), toolsUsed.join(','));
    return { response: (finalMsg && finalMsg.content) || '', toolsUsed, steps: MAX_STEPS, model: lastModel, provider: lastProvider, capped: true };
  } catch (_) {
    tally(false, toolsUsed.join(','));
    return { response: '(reached step limit)', toolsUsed, steps: MAX_STEPS, capped: true };
  }
}

const COUNCIL = new Set(['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON']);

// Express handler — POST /api/agentic/run  { agent, task | message, apiKey?, tools? }
async function handler(req, res) {
  const hStart = Date.now();
  try {
    const b = req.body || {};
    const task = b.task || b.message;
    if (!task) return res.status(400).json({ error: 'task (or message) required' });
    // Auto-route: when no explicit agent is given (or autoRoute=true), the council
    // (agent-engine.routeTask) decides who owns the task, not a hard-coded default.
    const wantsAutoRoute = b.autoRoute !== false && !b.agent;
    let agentUp = String(b.agent || '').toUpperCase();
    let routedByCouncil = false;
    if (!agentUp) {
      try { const r = eng().routeTask(task, null); if (r && r.name) { agentUp = String(r.name).toUpperCase(); routedByCouncil = true; } } catch (_e) {}
    }
    if (!agentUp) agentUp = 'ORACLE';

    // For forged operatives (not council), look up their tools + persona from operatives.json.
    let toolOverride = Array.isArray(b.tools) && b.tools.length ? b.tools : null;
    let personaOverride = b.persona || null;
    if (!COUNCIL.has(agentUp)) {
      try {
        const fs = require('fs'), path = require('path');
        const ops = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'operatives.json'), 'utf8'));
        const op = ops.find(o => String(o.codename || '').toUpperCase() === agentUp);
        if (op) {
          if (!toolOverride && Array.isArray(op.tools) && op.tools.length) toolOverride = op.tools;
          if (!personaOverride && op.brain && op.brain.persona) personaOverride = op.brain.persona;
          if (!personaOverride && op.codename) {
            const toolHint = toolOverride && toolOverride.length ? ` Your tools: ${toolOverride.slice(0,8).join(', ')}.` : '';
            personaOverride = `You are ${op.codename}, a ${op.archetype || 'specialist'} operative in the SHADDAI empire.${toolHint}`;
          }
        }
      } catch (_) {}
    }

    const t0 = Date.now();
    const out = await runAgentWithTools(b.agent, task, {
      apiKey: b.apiKey,
      tools: toolOverride || undefined,
      persona: personaOverride || undefined,
    });
    res.json(Object.assign({ agent: agentUp, routedByCouncil: !!routedByCouncil, durationMs: Date.now() - t0 }, out));
  } catch (e) {
    try { rep().record({ agent: agentUp, outcome: false, latencyMs: Date.now() - hStart, tool: 'run-error', task: String(task || '').slice(0, 120) }); } catch (_) {}
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

module.exports = { runAgentWithTools, handler, getVaultKey };
