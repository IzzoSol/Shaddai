// backend/lib/orchestrate.js
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI ORCHESTRATOR — decompose a complex request into an ordered plan and
// route each step to the right specialist agent, then (optionally) execute each
// via the function-calling tool engine (agent-tool-run) and combine.
//
//   POST /api/orchestrate  { task, execute?:bool }
//     execute=false → returns the PLAN only (for the "want me to use these agents?" confirm step)
//     execute=true  → runs each step through the specialist + returns combined results
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const llmRouter = require('./llm-router');
const { runAgentWithTools } = require('./agent-tool-run');

const MODEL = process.env.GROQ_TOOL_MODEL || 'llama-3.1-8b-instant';

const ROSTER =
`ORACLE — research, knowledge, science, health/body, psychology, physiology, esoteric/spiritual
ZEROX — revenue, pricing, offers, markets/crypto, business
NEXUS — engineering, data, code, structuring & assembling deliverables
TURTLE — design, images, visuals, branding, logos
QUILL — writing, descriptions, copy, docs, guides
PIKADON — security, risk, auditing, review`;

const VALID = new Set(['ORACLE', 'ZEROX', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON', 'SHADDAI']);

async function planTask(task, key) {
  const messages = [
    { role: 'system', content:
`You are SHADDAI, orchestrator of a 7-specialist AI team:
${ROSTER}

Break the user's request into a short ORDERED plan (2–6 steps). Assign each step to the single best specialist so work is DEFINED and ACCURATE (one specialist per step, not one agent doing everything). Keep each step concrete and self-contained.
Respond ONLY with JSON:
{"plan":[{"agent":"QUILL","task":"the concrete sub-task","why":"one short reason"}],"deliverable":"one line describing the final combined output"}` },
    { role: 'user', content: String(task) },
  ];
  const r = await llmRouter.chatTools(messages, [], {
    groqKeys: key ? [key] : [],
    model: MODEL,
    temperature: 0.3,
    max_tokens: 900,
    json: true,
  });
  let parsed = {};
  try { parsed = JSON.parse(r.message && r.message.content || '{}'); } catch (_) {}
  const plan = (Array.isArray(parsed.plan) ? parsed.plan : [])
    .map(s => ({ agent: VALID.has(String(s.agent).toUpperCase()) ? String(s.agent).toUpperCase() : 'SHADDAI', task: String(s.task || ''), why: String(s.why || '') }))
    .filter(s => s.task).slice(0, 6);
  return { plan, deliverable: String(parsed.deliverable || '') };
}

async function orchestrate(task, opts = {}) {
  const key = opts.apiKey || process.env.GROQ_API_KEY;
  const anyCloud = !!key || llmRouter.getProviders().some(p => p.id !== 'anthropic');
  if (!anyCloud) throw new Error('No LLM key configured (Groq primary, OpenAI/DeepSeek/OpenRouter fallback)');
  const planned = await planTask(task, key);
  const agents = [...new Set(planned.plan.map(s => s.agent))];

  if (!opts.execute) {
    return { mode: 'plan', deliverable: planned.deliverable, agents, plan: planned.plan };
  }

  const results = [];
  for (const s of planned.plan) {
    try {
      const out = await runAgentWithTools(s.agent, s.task, { apiKey: key });
      results.push({ agent: s.agent, task: s.task, response: out.response, toolsUsed: out.toolsUsed || [] });
    } catch (e) {
      try { require('./reputation-engine').record({ agent: s.agent, outcome: false, latencyMs: 0, tool: 'orchestrate-step', task: String(s.task || '').slice(0, 120) }); } catch (_) {}
      results.push({ agent: s.agent, task: s.task, error: String((e && e.message) || e) });
    }
  }
  return { mode: 'execute', deliverable: planned.deliverable, agents, plan: planned.plan, results };
}

async function handler(req, res) {
  try {
    const b = req.body || {};
    const task = b.task || b.message;
    if (!task) return res.status(400).json({ error: 'task required' });
    const t0 = Date.now();
    const out = await orchestrate(task, { execute: !!b.execute, apiKey: b.apiKey });
    res.json(Object.assign({ durationMs: Date.now() - t0 }, out));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

module.exports = { planTask, orchestrate, handler };
