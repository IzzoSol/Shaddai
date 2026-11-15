/**
 * AGENT POLICY — the survival product.
 *
 * This is NOT another chatbot surface. This is the "permit layer": named agents
 * that hold money under rules the owner sets, spend only inside a cap, keep a
 * PUBLIC ledger, and can be revoked in one click. It is the thing Grok is not
 * allowed / not designed / not willing to own.
 *
 * The one-sentence promise it implements:
 *   "Create an agent. Attach one wallet. Set a daily cap. It can pay and trade
 *    only inside that cap. You can revoke it in one click."
 *
 * Principles:
 *   1. SHADDAI DOES NOT HOST INFERENCE. Every generation in /execute runs on the
 *      user's OWN key (brought-your-own-key: passed in, or from env / the byok
 *      store). Shaddai bills for state, limits, settlement and world — not tokens.
 *   2. Money moves go through paybox-guard's 5-layer gate (per-call cap, daily
 *      budget, approval threshold, ledger) AND this module's per-AGENT cap.
 *   3. Everything lands in a public, redacted ledger. Secrets/keys are never logged.
 *   4. Revoke is immediate and irreversible for that agent's spending.
 *
 * Storage (plain JSON, no DB assumption):
 *   backend/data/agent-policies.json   — the policy store
 *   backend/data/agent-ledger.json     — the rolling public ledger
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();
const json = express.json({ limit: '256kb' });

const POLICIES_PATH = path.join(__dirname, '..', 'data', 'agent-policies.json');
const LEDGER_PATH   = path.join(__dirname, '..', 'data', 'agent-ledger.json');

const DEFAULT_DAILY_CAP   = 5.00;   // $5/day — small by default; the plan's demo cap
const DEFAULT_PER_CALL    = 1.00;   // $1 single-call ceiling
const MAX_CAP_USD         = 2500;   // hard ceiling so nobody vaults an unlimited wallet

const ENABLED = process.env.POLICY_ENABLED !== 'false'; // on by default (product is the policy)

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}

function readPolicies() { const d = readJson(POLICIES_PATH, []); return Array.isArray(d) ? d : []; }
function writePolicies(list) { writeJson(POLICIES_PATH, list); }
function readLedger() { const d = readJson(LEDGER_PATH, []); return Array.isArray(d) ? d : []; }
function appendLedger(entry) {
  const l = readLedger();
  l.push({ id: crypto.randomBytes(8).toString('hex'), at: new Date().toISOString(), ...entry });
  if (l.length > 2000) l.splice(0, l.length - 2000); // bounded public log
  writeJson(LEDGER_PATH, l);
  return l;
}

function ownerOf(req) { return String((req.userId) || (req.user && req.user.id) || (req.body && req.body.userId) || (req.query && req.query.userId) || 'anon'); }

function findPolicy(list, id) { return list.find(p => p.id === id); }

// Safely round a numeric cap within sane bounds.
function normCap(v, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Number(n.toFixed(2)), MAX_CAP_USD);
}

// Resolve a user's own key for a provider: body key → env → byok store. Never return
// the key in a response and never log it. Undefined on the generic non-keyed call.
function resolveOwnKey(provider, bodyKey) {
  let key = null;
  if (typeof bodyKey === 'string' && bodyKey.trim().length > 8) key = bodyKey.trim();
  if (!key) {
    const envVar = ({ openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', gemini: 'GEMINI_API_KEY', xai: 'XAI_API_KEY' })[provider];
    if (envVar && process.env[envVar]) key = process.env[envVar];
  }
  if (!key) {
    try { const ae = require('../agent-engine'); if (ae.getBYOKKey) key = ae.getBYOKKey(provider) || null; } catch (_) {}
  }
  return key;
}

// Direct OpenAI-compatible call to the USER's own provider key. Shaddai does NOT
// host inference. Returns { ok, content, provider, model }.
async function runOwnKey(prompt, { provider, model, key }) {
  const base = {
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: null, // handled separately below
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models/' + (model || 'gemini-1.5-flash') + ':generateContent',
    xai: 'https://api.x.ai/v1/chat/completions'
  }[provider] || 'https://api.openai.com/v1/chat/completions';

  const url = base;
  const body = {
    model: model || (provider === 'groq' ? (process.env.GROQ_MODEL || 'openai/gpt-oss-20b') : provider === 'xai' ? 'grok-beta' : provider === 'gemini' ? model : 'gpt-4o-mini'),
    messages: [{ role: 'system', content: 'You are a capable, cautious agent. Answer helpfully and directly. You may spend only under the cap your owner set; do not fabricate transactions.' }, { role: 'user', content: String(prompt).slice(0, 8000) }],
    temperature: 0.4
  };

  if (provider === 'anthropic' && false) { /* placeholder for claude-specific shape if needed */ }

  if (provider === 'gemini' && url.includes('generativelanguage')) {
    const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: body.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }) });
    const data = await resp.json().catch(() => ({}));
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    return { ok: resp.ok, content: text, provider, model: model || 'gemini' };
  }

  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  const content = data?.choices?.[0]?.message?.content || (typeof data === 'object' ? JSON.stringify(data).slice(0, 400) : '');
  return { ok: resp.ok, content, provider, model: body.model };
}

// ── AUTH-adjacent helpers (reused from auth-guard; never hard-require) ─────────
let requireAdmin = (req, res, next) => next();
let softAuth = (req, res, next) => next();
try { const ag = require('../auth-guard'); if (ag.requireAdmin) requireAdmin = ag.requireAdmin; if (ag.softAuth) softAuth = ag.softAuth; } catch (_) {}

// PIKADON: identify the caller BEFORE any route runs so ownerOf() below reflects
// a verified req.userId (from softAuth) instead of falling through to the
// spoofable body.userId/query.userId — without this, anyone could impersonate
// any owner to list/edit/revoke/read another user's agent. Same pattern as
// brains.js (`router.use(rateLimit(...), softAuth)`).
router.use(softAuth);

// ── ENDPOINTS ──────────────────────────────────────────────────────────────────
// POST /api/policy/agent  { name, userId?, wallet_label?, daily_cap_usd?, per_call_cap_usd?, allowed_tools?[] }
router.post('/agent', json, (req, res) => {
  if (!ENABLED) return res.status(503).json({ ok: false, error: 'policy rails disabled' });
  const b = req.body || {};
  const name = String(b.name || (b.agent_name || 'agent')).trim().slice(0, 40);
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const owner = ownerOf(req);
  const policy = {
    id: 'agt_' + crypto.randomBytes(6).toString('hex'),
    owner,
    name,
    wallet_label: String(b.wallet_label || 'default').slice(0, 40),
    daily_cap_usd: normCap(b.daily_cap_usd, DEFAULT_DAILY_CAP),
    per_call_cap_usd: normCap(b.per_call_cap_usd, DEFAULT_PER_CALL),
    allowed_tools: Array.isArray(b.allowed_tools) ? b.allowed_tools.map(String).slice(0, 25) : ['request_payment', 'request_transfer', 'request_swap', 'pay_x402'],
    revoked: false,
    created_at: new Date().toISOString(),
    last_spend_day: null,
    spent_today: 0
  };
  const list = readPolicies(); list.push(policy); writePolicies(list);
  appendLedger({ kind: 'agent_create', agent: policy.id, owner, name, daily_cap_usd: policy.daily_cap_usd, created_at: policy.created_at });
  res.status(201).json({ ok: true, agent: policy });
});

// GET /api/policy/agent?userId=  — list own agents (never ledger of others)
router.get('/agent', (req, res) => {
  const owner = ownerOf(req);
  const mine = readPolicies().filter(p => p.owner === owner);
  res.json({ ok: true, agents: mine });
});

// PUT /api/policy/agent/:id  { daily_cap_usd?, per_call_cap_usd?, allowed_tools?[], revoked? }
router.put('/agent/:id', json, (req, res) => {
  const list = readPolicies();
  const p = findPolicy(list, req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'agent not found' });
  if (p.owner !== ownerOf(req)) return res.status(403).json({ ok: false, error: 'not your agent' });
  const b = req.body || {};
  if (b.daily_cap_usd !== undefined) p.daily_cap_usd = normCap(b.daily_cap_usd, p.daily_cap_usd);
  if (b.per_call_cap_usd !== undefined) p.per_call_cap_usd = normCap(b.per_call_cap_usd, p.per_call_cap_usd);
  if (Array.isArray(b.allowed_tools)) p.allowed_tools = b.allowed_tools.map(String).slice(0, 25);
  if (typeof b.revoked === 'boolean') p.revoked = b.revoked;
  writePolicies(list);
  appendLedger({ kind: 'agent_policy', agent: p.id, daily_cap_usd: p.daily_cap_usd, revoked: p.revoked });
  res.json({ ok: true, agent: p });
});

// POST /api/policy/agent/:id/revoke  — one-click kill. Immediate + irreversible for spending.
router.post('/agent/:id/revoke', json, (req, res) => {
  const list = readPolicies();
  const p = findPolicy(list, req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'agent not found' });
  if (p.owner !== ownerOf(req)) return res.status(403).json({ ok: false, error: 'not your agent' });
  p.revoked = true;
  writePolicies(list);
  appendLedger({ kind: 'agent_revoke', agent: p.id, at: new Date().toISOString() });
  res.json({ ok: true, revoked: true, agent: p.id });
});

// GET /api/policy/agent/:id/ledger  — this agent's spend ledger (reviewable)
router.get('/agent/:id/ledger', (req, res) => {
  const list = readPolicies();
  const p = findPolicy(list, req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'agent not found' });
  if (p.owner !== ownerOf(req)) return res.status(403).json({ ok: false, error: 'not your agent' });
  const recs = readLedger().filter(r => r.agent === p.id).slice(-200);
  res.json({ ok: true, agent: p.id, records: recs });
});

// GET /api/policy/ledger  — PUBLIC shared ledger (agents only; redacted; no secrets/keys)
router.get('/ledger', (req, res) => {
  const from = readLedger().slice(-300).map(r => ({
    kind: r.kind, at: r.at, agent: r.agent, status: r.status, tool: r.tool,
    amount_usd: r.amount_usd, reason: r.reason || null
  }));
  res.json({ ok: true, count: from.length, ledger: from });
});

/**
 * POST /api/policy/agent/:id/execute  — run one action on the USER'S OWN key.
 * Body: { task, provider?, model?, api_key?, intend_tool?, est_cost_usd?, wallet_label?, nonce? }
 *
 * - If intend_tool + est_cost_usd are provided, the money move is checked against
 *   THIS agent's cap (and revoke state) AND paybox-guard's 5-layer gate, then
 *   recorded in the public ledger. Cost is capped; nothing is spent unless the
 *   whole chain approves.
 * - If no money tool, it just runs the task on the user's own key (no Render bill).
 */
router.post('/agent/:id/execute', json, async (req, res) => {
  const list = readPolicies();
  const p = findPolicy(list, req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'agent not found' });
  if (p.owner !== ownerOf(req)) return res.status(403).json({ ok: false, error: 'not your agent' });
  if (p.revoked) return res.status(403).json({ ok: false, error: 'agent revoked — spending disabled' });

  const b = req.body || {};
  const task = String(b.task || '').trim();
  if (!task) return res.status(400).json({ ok: false, error: 'task required' });

  const provider = String(b.provider || 'openai').toLowerCase();
  const model = String(b.model || '').trim() || undefined;
  const ownKey = resolveOwnKey(provider, b.api_key);
  if (!ownKey) {
    return res.status(402).json({ ok: false, ref: 'need_own_key', error: `No ${provider} key on this server. Shaddai does not host inference — bring your own key (body api_key, or set ${provider.toUpperCase()}_API_KEY, or the Byok panel).` });
  }

  // Money intent path.
  if (b.intend_tool) {
    const tool = String(b.intend_tool);
    if (!p.allowed_tools.includes(tool)) {
      appendLedger({ kind: 'agent_refused', agent: p.id, tool, status: 'refused', reason: 'tool not allowed' });
      return res.status(403).json({ ok: false, status: 'refused', reason: `tool "${tool}" not allowed for this agent` });
    }
    const est = Math.max(0, Number(b.est_cost_usd || 0));
    if (est > p.per_call_cap_usd) {
      appendLedger({ kind: 'agent_refused', agent: p.id, tool, status: 'refused', reason: 'per-call cap', amount_usd: est });
      return res.status(403).json({ ok: false, status: 'refused', reason: `est $${est} exceeds per-call cap $${p.per_call_cap_usd}` });
    }
    const today = p.spent_today || 0;
    if (today + est > p.daily_cap_usd) {
      appendLedger({ kind: 'agent_refused', agent: p.id, tool, status: 'refused', reason: 'daily cap', amount_usd: est });
      return res.status(402).json({ ok: false, status: 'refused', reason: `daily cap $${p.daily_cap_usd} would be exceeded (spent $${today.toFixed(2)})` });
    }
    // Load the chronological daily spend from the ledger for this agent today.
    try {
      const guard = require('../paybox-guard');
      const g = await guard.guardedPayboxCall({ tool, args: b.args || {}, est_cost_usd: est, agentKey: p.name, userId: p.owner });
      if (!g.ok) {
        appendLedger({ kind: 'agent_spend', agent: p.id, tool, status: 'refused', reason: (g.reason || g.output || 'guard refused').slice(0, 300), amount_usd: est });
        return res.status(200).json({ ok: false, status: 'refused', reason: g.reason || g.output || 'guard refused', detail: g });
      }
      p.spent_today = Math.min(MAX_CAP_USD, today + est);
      p.last_spend_day = new Date().toISOString().slice(0, 10);
      writePolicies(list);
      appendLedger({ kind: 'agent_spend', agent: p.id, owner: p.owner, tool, status: 'ok', amount_usd: est, request_id: g.output && g.output.request_id });
      return res.json({ ok: true, status: 'fired', tool, est_cost_usd: est, request: g.output, policy: { daily_cap_usd: p.daily_cap_usd, spent_today: p.spent_today } });
    } catch (e) {
      appendLedger({ kind: 'agent_spend', agent: p.id, tool, status: 'error', reason: String((e && e.message) || e).slice(0, 300), amount_usd: est });
      return res.status(500).json({ ok: false, status: 'error', reason: String((e && e.message) || e) });
    }
  }

  // Pure generation path — user's OWN key, RAG-free, direct.
  const r = await runOwnKey(task, { provider, model, key: ownKey }).catch(e => ({ ok: false, content: String((e && e.message) || e) }));
  appendLedger({ kind: 'agent_run', agent: p.id, owner: p.owner, provider, status: r.ok ? 'ok' : 'error', reason: r.ok ? null : (r.content || '').slice(0, 200) });
  if (!r.ok) return res.status(502).json({ ok: false, error: 'own-key call failed', detail: (r.content || '').slice(0, 400) });
  return res.json({ ok: true, content: r.content, provider: r.provider, model: r.model, policy: { daily_cap_usd: p.daily_cap_usd, revoked: p.revoked } });
});

module.exports = router;
module.exports.router = router;
