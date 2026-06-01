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

// Best-effort billing hook — wired to the billing agent's recordUsage if present.
function meter(usage) {
  try {
    const billing = require('./billing-service');
    if (billing && typeof billing.recordUsage === 'function') billing.recordUsage(usage);
  } catch (_) { /* billing not wired yet — non-fatal */ }
}

// --- BRAIN REGISTRY: friendly id -> { provider, model, tier, label } ---------
// Models mirror llm-client.js defaults so we never reference an invalid model.
const BRAINS = {
  'ollama-local':   { provider: 'ollama',     model: process.env.OLLAMA_MODEL     || 'llama3.2:1b',                              tier: 'free',     label: 'Ollama · local (free)' },
  'openrouter-free':{ provider: 'openrouter', model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',   tier: 'free',     label: 'OpenRouter · free' },
  'groq-70b':       { provider: 'groq',       model: process.env.GROQ_MODEL       || 'llama-3.1-70b-versatile',                 tier: 'standard', label: 'Groq · Llama 70B (fast)' },
  'claude-haiku':   { provider: 'anthropic',  model: process.env.ANTHROPIC_MODEL  || 'claude-haiku-4-5-20251001',               tier: 'standard', label: 'Claude · Haiku 4.5' },
  'claude-premium': { provider: 'anthropic',  model: process.env.ANTHROPIC_PREMIUM_MODEL || 'claude-haiku-4-5-20251001',        tier: 'premium',  label: 'Claude · premium' }
};

const PROVIDER_ENABLED = {
  ollama:     () => true, // local, free; fails fast if not running
  groq:       () => Boolean(process.env.GROQ_API_KEY),
  openrouter: () => Boolean(process.env.OPENROUTER_API_KEY),
  anthropic:  () => Boolean(process.env.ANTHROPIC_API_KEY),
  openai:     () => Boolean(process.env.OPENAI_API_KEY)
};
function brainAvailable(id) { const b = BRAINS[id]; return !!b && PROVIDER_ENABLED[b.provider] && PROVIDER_ENABLED[b.provider](); }

// --- PERSONAS: the 7-agent council. persona = system prompt + default brain ---
const PERSONAS = {
  SHADDAI: { label: 'SHADDAI · Orchestrator', defaultBrain: 'groq-70b',    persona: 'You are SHADDAI, the supreme orchestrator. Strategic, decisive, long-term. You coordinate the other agents, weigh trade-offs, and make the final call. Be concise and outcome-focused.' },
  NEXUS:   { label: 'NEXUS · Architect',      defaultBrain: 'groq-70b',    persona: 'You are NEXUS, the technical architect. Pragmatic, favors simple testable solutions over clever abstractions. You reason about backend, APIs, data, and scale.' },
  ZEROX:   { label: 'ZEROX · Wealth Engine',  defaultBrain: 'groq-70b',    persona: 'You are ZEROX, the wealth & revenue engine. You think in MRR, LTV, unit economics, and trading edge. You read market data + analytics and propose money moves — always within risk limits and the PIKADON kill-switch.' },
  ORACLE:  { label: 'ORACLE · Research',      defaultBrain: 'claude-haiku',persona: 'You are ORACLE, research & intelligence. Curious, thorough, connects dots, questions assumptions. You gather data and surface trends, gaps, and signals before decisions.' },
  TURTLE:  { label: 'TURTLE · Creative',      defaultBrain: 'groq-70b',    persona: 'You are TURTLE, UI/UX & creative. Aesthetic, user-centric; you care about feel, flow, brand. You produce design, media, and visual ideas.' },
  QUILL:   { label: 'QUILL · Writer',         defaultBrain: 'groq-70b',    persona: 'You are QUILL, writing & communication. Clear, detail-oriented; you think about the person reading this. You write copy, docs, and guides.' },
  PIKADON: { label: 'PIKADON · Security',     defaultBrain: 'claude-haiku',persona: 'You are PIKADON, security & compliance. Defensive, assumes worst-case, checks assumptions ruthlessly. You guard secrets, PII, approvals, and own the kill-switch.' }
};

// Runtime overrides + user-defined custom agents (swap to DB later).
const agentBrainOverride = {}; // agent -> brainId
const customAgents = {};       // name -> { label, persona, defaultBrain }

function getPersona(agent) {
  return PERSONAS[agent] || customAgents[agent] || { label: agent, defaultBrain: 'groq-70b', persona: `You are ${agent}, a SHADDAI agent.` };
}

// --- ROUTER: pick the brain for (agent, taskTier, user) ----------------------
// Order of preference: explicit user override → persona default → tier upgrade →
// first available fallback. Always returns an AVAILABLE brain.
function route(agent, taskTier = 'standard', user = {}) {
  const p = getPersona(agent);
  let id = (user.brainOverride && BRAINS[user.brainOverride]) ? user.brainOverride
         : agentBrainOverride[agent] || p.defaultBrain || 'groq-70b';
  // Premium task + premium-allowed user → upgrade to a premium brain if available.
  if (taskTier === 'premium' && (user.tier === 'premium' || user.tier === 'elite') && brainAvailable('claude-premium')) id = 'claude-premium';
  if (!brainAvailable(id)) {
    id = ['ollama-local', 'groq-70b', 'openrouter-free', 'claude-haiku', 'claude-premium'].find(brainAvailable) || 'ollama-local';
  }
  const b = BRAINS[id];
  return { brainId: id, provider: b.provider, model: b.model, persona: p.persona, agentLabel: p.label };
}

// --- agentLLM: the one call agent code should use ----------------------------
async function agentLLM({ agent = 'SHADDAI', messages = [], taskTier = 'standard', user = {}, options = {} }) {
  const r = route(agent, taskTier, user);
  const msgs = (messages[0] && messages[0].role === 'system')
    ? messages
    : [{ role: 'system', content: r.persona }, ...messages];
  const result = await llm.callLLM(msgs, { ...options, provider: r.provider, model: r.model, agentName: agent });
  meter({
    userId: user.id || user.userId || 'anon', agent, brain: r.brainId,
    provider: result.provider, model: result.model,
    tokens: (result.tokens?.input || 0) + (result.tokens?.output || 0),
    costUsd: 0 // billing-service estimates cost from provider+tokens
  });
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
router.post('/custom', requireAdmin, json, (req, res) => {
  const { name, persona, brainId } = req.body || {};
  if (!name || !persona) return res.status(400).json({ ok: false, error: 'need { name, persona, brainId? }' });
  customAgents[name] = { label: name, persona, defaultBrain: BRAINS[brainId] ? brainId : 'groq-70b' };
  res.json({ ok: true, agent: name });
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
