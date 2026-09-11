// ============================================================================
// SHADDAI Brains & Personas — the "different brains and personalities" layer.
// ----------------------------------------------------------------------------
// Sits ON TOP of llm-client.js (which owns the raw provider calls + fallback).
// Adds: a named BRAIN registry, per-agent PERSONAS, tier-aware routing, custom
// user-defined agents, and a single usage-metering chokepoint that feeds billing.
// This is what makes agents real & swappable instead of one hard-coded model.
// Mounted at /api/brains (router). Use agentLLM() from agent code.
// ============================================================================
const express = require('express');
const llm = require('./llm-client');
const pool = require('./key-pool');

// Best-effort billing hook — wired to the billing agent's recordUsage if present.
// debitCredits:false → we only record usage STATS here; the actual credit charge
// happens via the per-action credit meter (debitForAction) so we never double-charge.
function meter(usage) {
  try {
    const billing = require('./billing-service');
    if (billing && typeof billing.recordUsage === 'function') billing.recordUsage({ ...usage, debitCredits: false });
  } catch (_) { /* billing not wired yet — non-fatal */ }
}

// Map the chosen provider/brain to a credit-cost action id.
// Local Ollama = the cheap fast path (fast_chat). Everything cloud/premium
// (groq-70b, ollama-cloud, claude-*, openrouter, openai) = strong_chat.
function actionForBrain(brainId, provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'ollama') return 'fast_chat';          // local Ollama only
  if (brainId === 'ollama-local') return 'fast_chat';
  return 'strong_chat';                            // groq/ollamacloud/anthropic/openrouter/openai
}

// Best-effort per-action credit debit. NEVER throws, NEVER blocks the response
// in this pass — if blocked, we just log it (hard-blocking moves to the route
// layer later). byok is honoured (charged 0, never blocked).
async function meterAction(userId, actionId, byok) {
  try {
    const billing = require('./billing-service');
    if (!billing || typeof billing.debitForAction !== 'function') return;
    const r = await billing.debitForAction(userId, actionId, { byok: !!byok });
    if (r && r.blocked) {
      console.warn(`[credit-meter] BLOCK ${userId} action=${actionId} needed=${r.needed} remaining=${r.remaining} (best-effort pass — response still served)`);
    }
  } catch (_) { /* metering is best-effort — never fatal */ }
}

// --- BRAIN REGISTRY: friendly id -> { provider, model, tier, label } ---------
// Models mirror llm-client.js defaults so we never reference an invalid model.
const BRAINS = {
  'ollama-local':   { provider: 'ollama',     model: process.env.OLLAMA_MODEL     || 'llama3.2:1b',                              tier: 'free',     label: 'Ollama · local (free)' },
  'openrouter-free':{ provider: 'openrouter', model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',   tier: 'free',     label: 'OpenRouter · free' },
  'groq-70b':       { provider: 'groq',       model: process.env.GROQ_MODEL       || 'llama-3.1-8b-instant',                    tier: 'standard', label: 'Groq · Llama 70B (fast)' },
  'ollama-cloud':   { provider: 'ollamacloud',model: process.env.OLLAMA_CLOUD_MODEL|| 'gpt-oss:120b',                            tier: 'standard', label: 'Ollama Cloud · gpt-oss 120B' },
  'claude-haiku':   { provider: 'anthropic',  model: process.env.ANTHROPIC_MODEL  || 'claude-haiku-4-5-20251001',               tier: 'standard', label: 'Claude · Haiku 4.5' },
  'claude-premium': { provider: 'anthropic',  model: process.env.ANTHROPIC_PREMIUM_MODEL || 'claude-haiku-4-5-20251001',        tier: 'premium',  label: 'Claude · premium' }
};

const PROVIDER_ENABLED = {
  ollama:     () => true, // local, free; fails fast if not running
  groq:       () => pool.envKeys('groq').length > 0,
  openrouter: () => pool.envKeys('openrouter').length > 0,
  anthropic:  () => pool.envKeys('anthropic').length > 0,
  openai:     () => pool.envKeys('openai').length > 0,
  ollamacloud:() => pool.envKeys('ollamacloud').length > 0
};
function brainAvailable(id) { const b = BRAINS[id]; return !!b && PROVIDER_ENABLED[b.provider] && PROVIDER_ENABLED[b.provider](); }

// --- PERSONAS: the 7-agent council. persona = system prompt + default brain ---
const PERSONAS = {
  SHADDAI: { label: 'SHADDAI · Orchestrator', defaultBrain: 'groq-70b',    persona: 'You are SHADDAI, the supreme orchestrator. Strategic, decisive, long-term. You coordinate the other agents, weigh trade-offs, and make the final call. Be concise and outcome-focused.' },
  NEXUS:   { label: 'NEXUS · Architect',      defaultBrain: 'groq-70b',    persona: 'You are NEXUS, the technical architect. Pragmatic, favors simple testable solutions over clever abstractions. You reason about backend, APIs, data, and scale.' },
  ZEROX:   { label: 'ZEROX · Wealth Engine',  defaultBrain: 'groq-70b',    persona: 'You are ZEROX, the wealth & revenue engine. You think in MRR, LTV, unit economics, and trading edge. You read market data + analytics and propose money moves — always within risk limits and the PIKADON kill-switch.' },
  ORACLE:  { label: 'ORACLE · Research',      defaultBrain: 'groq-70b'   ,persona: 'You are ORACLE, research & intelligence. Curious, thorough, connects dots, questions assumptions. You gather data and surface trends, gaps, and signals before decisions.' },
  TURTLE:  { label: 'TURTLE · Creative',      defaultBrain: 'groq-70b',    persona: 'You are TURTLE, UI/UX & creative. Aesthetic, user-centric; you care about feel, flow, brand. You produce design, media, and visual ideas.' },
  QUILL:   { label: 'QUILL · Writer',         defaultBrain: 'groq-70b',    persona: 'You are QUILL, writing & communication. Clear, detail-oriented; you think about the person reading this. You write copy, docs, and guides.' },
  PIKADON: { label: 'PIKADON · Security',     defaultBrain: 'groq-70b'   ,persona: 'You are PIKADON, security & compliance. Defensive, assumes worst-case, checks assumptions ruthlessly. You guard secrets, PII, approvals, and own the kill-switch.' }
};

// Runtime overrides + user-defined custom agents (swap to DB later).
const agentBrainOverride = {}; // agent -> brainId
const customAgents = {};       // name -> { label, persona, defaultBrain }

function getPersona(agent) {
  return PERSONAS[agent] || customAgents[agent] || { label: agent, defaultBrain: 'groq-70b', persona: `You are ${agent}, a SHADDAI agent.` };
}

// --- STRENGTH LADDERS: which brains to prefer for a given horsepower need -----
// The router walks the ladder top-to-bottom and picks the first AVAILABLE brain.
// 'fast'     = cheap/quick, save quota for when it matters (or offline demo).
// 'balanced' = the sensible default (Groq 70B when keyed).
// 'strong'   = heavy reasoning; reach for the best brain available.
const STRENGTH_LADDER = {
  fast:     ['ollama-local', 'openrouter-free', 'groq-70b', 'claude-haiku', 'ollama-cloud', 'claude-premium'],
  balanced: ['groq-70b', 'ollama-cloud', 'openrouter-free', 'claude-haiku', 'claude-premium', 'ollama-local'],
  strong:   ['claude-premium', 'ollama-cloud', 'groq-70b', 'claude-haiku', 'openrouter-free', 'ollama-local']
};
const FALLBACK_LADDER = ['groq-70b', 'ollama-cloud', 'openrouter-free', 'claude-haiku', 'claude-premium', 'ollama-local'];

// --- ROUTER: pick the brain for (agent, taskTier, user) ----------------------
// Order of preference: explicit user override → strength ladder → persona
// default → tier upgrade → first available fallback. Always returns an
// AVAILABLE brain (Ollama is the guaranteed local backstop).
function route(agent, taskTier = 'standard', user = {}, strength = null) {
  const p = getPersona(agent);
  let id = (user.brainOverride && BRAINS[user.brainOverride]) ? user.brainOverride
         : agentBrainOverride[agent] || null;

  // No explicit choice + a strength hint → let the ladder pick the best available.
  if (!id && strength && STRENGTH_LADDER[strength]) {
    id = STRENGTH_LADDER[strength].find(brainAvailable) || null;
  }
  if (!id) id = p.defaultBrain || 'groq-70b';

  // Premium task + premium-allowed user → upgrade to a premium brain if available.
  if (taskTier === 'premium' && (user.tier === 'premium' || user.tier === 'elite') && brainAvailable('claude-premium')) id = 'claude-premium';
  if (!brainAvailable(id)) {
    id = FALLBACK_LADDER.find(brainAvailable) || 'ollama-local';
  }
  const b = BRAINS[id];
  return { brainId: id, provider: b.provider, model: b.model, persona: p.persona, agentLabel: p.label };
}

// --- agentLLM: the one call agent code should use ----------------------------
let _kb = null; try { _kb = require('./knowledge'); } catch (e) { /* KBs optional */ }

async function agentLLM({ agent = 'SHADDAI', messages = [], taskTier = 'standard', user = {}, strength = null, byok = null, options = {} }) {
  const r = route(agent, taskTier, user, strength);
  let sys = r.persona;
  // GROUND the answer with the agent's local knowledge base (free, evergreen domain facts) so it gives
  // a REAL answer instead of vague filler. Look up the latest user message; if the KB knows it, inject
  // it as authoritative context. Never throws.
  try {
    if (_kb && _kb.lookupTop) {
      const lastUser = [...messages].reverse().find(m => m && m.role === 'user');
      const q = lastUser && (typeof lastUser.content === 'string' ? lastUser.content : '');
      const hits = q ? _kb.lookupTop(agent, q, 2) : [];
      if (hits.length) {
        sys += `\n\nAUTHORITATIVE KNOWLEDGE (answer from this — do not hedge or contradict it):\n` +
          hits.map(h => `## ${h.title}\n${h.text}`).join('\n\n');
      }
    }
  } catch (e) { /* grounding is best-effort */ }
  const msgs = (messages[0] && messages[0].role === 'system')
    ? messages
    : [{ role: 'system', content: sys }, ...messages];
  const result = await llm.callLLM(msgs, { ...options, provider: r.provider, model: r.model, agentName: agent, byok: byok || options.byok });
  const meterUserId = user.id || user.userId || 'anon';
  const usedByok = !!(byok || options.byok);
  meter({
    userId: meterUserId, agent, brain: r.brainId,
    provider: result.provider, model: result.model,
    tokens: (result.tokens?.input || 0) + (result.tokens?.output || 0),
    costUsd: 0 // stats only — credit charge is per-action below
  });
  // Per-action credit charge (outcome/hybrid model). Best-effort: awaited so we
  // debit exactly once, but wrapped so it never throws/blocks the response.
  await meterAction(meterUserId, actionForBrain(r.brainId, result.provider), usedByok);
  return { ...result, brainId: r.brainId, agent };
}

// --- HTTP API for the Workstation UI -----------------------------------------
const router = express.Router();
const json = express.json();
const { rateLimit, softAuth, requireAdmin } = require('./auth-guard');
router.use(rateLimit({ max: 80 }), softAuth); // PIKADON: abuse protection + caller id (hard-auth in prod via REQUIRE_AUTH)

router.get('/', (req, res) => {
  res.json({
    ok: true,
    brains: Object.entries(BRAINS).map(([id, b]) => ({ id, ...b, available: brainAvailable(id) })),
    // Live key-pool headroom per provider — lets the UI show "Groq: 2/3 keys ready".
    keyPool: Object.fromEntries(pool.providersWithKeys().map(p => [p, pool.stats(p)])),
    strengths: Object.keys(STRENGTH_LADDER),
    agents: { ...Object.fromEntries(Object.entries(PERSONAS).map(([k, v]) => [k, { label: v.label, brain: agentBrainOverride[k] || v.defaultBrain }])),
              ...Object.fromEntries(Object.entries(customAgents).map(([k, v]) => [k, { label: v.label, brain: agentBrainOverride[k] || v.defaultBrain, custom: true }])) }
  });
});

// Set an agent's brain. Body { agent, brainId }
router.post('/agent', requireAdmin, json, (req, res) => {
  const { agent, brainId } = req.body || {};
  if (!agent || !BRAINS[brainId]) return res.status(400).json({ ok: false, error: 'need { agent, brainId in registry }' });
  agentBrainOverride[agent] = brainId;
  res.json({ ok: true, agent, brainId });
});

// Add a custom user agent. Body { name, persona, brainId? }
// FIX: use softAuth (not requireAdmin) so a normal user can register their OWN forged
// agent in production (where ADMIN_TOKEN is set). This only adds to the in-memory AGENTS
// map with tools filtered to the real engine registry — low risk, no persistence/priv-esc.
// Other admin routes (e.g. /agent) keep requireAdmin.
router.post('/custom', softAuth, json, (req, res) => {
  const { name, persona, brainId, tools } = req.body || {};
  if (!name || !persona) return res.status(400).json({ ok: false, error: 'need { name, persona, brainId? }' });
  const brain = BRAINS[brainId] ? brainId : 'groq-70b';
  const id = String(name).toUpperCase();
  // Keep ONLY real tools that exist in the engine registry, so equipped skills actually work.
  let realTools = [];
  let registered = false;
  try {
    const eng = require('./agent-engine');
    const reg = (eng && eng.TOOLS) || {};
    realTools = (Array.isArray(tools) ? tools : []).filter(t => typeof t === 'string' && reg[t]);
    if (eng && eng.AGENTS) {
      // Register the forged agent so /api/agent/run gives it these REAL tools in the tool-loop.
      eng.AGENTS[id] = {
        name: id, role: 'Custom Operator', goal: persona,
        tools: realTools,
        preferredProvider: (BRAINS[brain] && BRAINS[brain].provider) || 'groq',
        custom: true
      };
      registered = true;
    }
  } catch (_) {}
  customAgents[name] = { label: name, persona, defaultBrain: brain, tools: realTools };
  res.json({ ok: true, agent: name, tools: realTools.length, equipped: realTools, registered });
});

// Quick test of an agent's brain. Body { agent, prompt }
router.post('/test', json, async (req, res) => {
  try {
    const { agent = 'SHADDAI', prompt = 'Say hello in one short sentence.' } = req.body || {};
    const out = await agentLLM({ agent, messages: [{ role: 'user', content: prompt }], options: { maxTokens: 120 } });
    res.json({ ok: true, agent, brain: out.brainId, provider: out.provider, model: out.model, content: out.content });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

module.exports = { BRAINS, PERSONAS, route, getPersona, agentLLM, brainAvailable, router };
