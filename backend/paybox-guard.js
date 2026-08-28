/**
 * SHADDAI Paybox Guard — let agents charge/checkout via Paybox, SAFELY.
 *
 * Mirrors pay-guard.js's safety model exactly (same 5 layers), but calls
 * Paybox's REST API directly with PAYBOX_API_KEY instead of shelling out to
 * the pay.sh CLI:
 *
 *   1. Disabled by default. Nothing charges until paybox-config.json { enabled:true }.
 *   2. Per-call cap   — refuse any single charge quoted above per_call_cap_usd.
 *   3. Daily budget   — refuse if today's spend + this charge exceeds daily_budget_usd.
 *   4. Approval gate  — charges above approval_threshold_usd are NOT executed; they
 *                       create a pending approval the human must release.
 *   5. Ledger         — every charge recorded in paybox-ledger.json (rolling, audited).
 *
 * NOTHING here charges money unless ALL of: enabled=true, PAYBOX_API_KEY present,
 * cost <= caps, and (if over threshold) an explicit approval.
 *
 * NOTE ON ENDPOINT SHAPE: Paybox's exact REST contract (path, request/response
 * fields) hasn't been verified against live docs/credentials yet — this guard
 * calls a generic {baseUrl}/{path} with a JSON body and expects a JSON response
 * with amount_usd (or amountUsd) and a checkout/status field. Confirm against
 * real Paybox API docs and adjust `callPaybox()` before this goes live with
 * real money. Until then it fails closed if PAYBOX_API_KEY is unset — nothing
 * silently does the wrong thing against a real account.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH  = path.join(__dirname, 'data', 'paybox-config.json');
const LEDGER_PATH  = path.join(__dirname, 'data', 'paybox-ledger.json');
const PENDING_PATH = path.join(__dirname, 'data', 'paybox-pending.json');

const DEFAULT_CONFIG = {
  enabled: false,                 // master switch — OFF until you opt in
  per_call_cap_usd: 5.00,         // refuse any single charge quoted above this
  daily_budget_usd: 25.00,        // refuse once today's spend would exceed this
  approval_threshold_usd: 1.00,   // charges above this need human approval first
  require_approval: true,         // gate on by default
  base_url: 'https://api.paybox.sh',
};

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}

function getConfig() { return { ...DEFAULT_CONFIG, ...readJson(CONFIG_PATH, {}) }; }
function setConfig(patch) {
  const cfg = { ...getConfig(), ...patch };
  writeJson(CONFIG_PATH, cfg);
  return cfg;
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function getLedger() {
  const l = readJson(LEDGER_PATH, { days: {}, calls: [] });
  if (!l.days) l.days = {};
  if (!l.calls) l.calls = [];
  return l;
}
function spentToday() { return getLedger().days[todayKey()] || 0; }

function recordSpend(entry) {
  const l = getLedger();
  const day = todayKey();
  l.days[day] = Number(((l.days[day] || 0) + entry.cost_usd).toFixed(6));
  l.calls.push({ ...entry, at: new Date().toISOString() });
  if (l.calls.length > 500) l.calls = l.calls.slice(-500);
  writeJson(LEDGER_PATH, l);
  return l.days[day];
}

function getPending() { return readJson(PENDING_PATH, []); }
function addPending(entry) {
  const list = getPending();
  const p = { id: 'pbx_' + Date.now().toString(36), status: 'pending', ...entry };
  list.push(p);
  writeJson(PENDING_PATH, list);
  return p;
}
function setPendingStatus(id, status) {
  const list = getPending();
  const p = list.find(x => x.id === id);
  if (!p) return null;
  p.status = status;
  writeJson(PENDING_PATH, list);
  return p;
}

// Calls Paybox's REST API. See NOTE ON ENDPOINT SHAPE above — verify against
// real docs before relying on this in production.
async function callPaybox(pathSegment, method, body) {
  const apiKey = process.env.PAYBOX_API_KEY;
  if (!apiKey) return { ok: false, output: 'PAYBOX_API_KEY not set in backend/.env — no charge made.' };
  const cfg = getConfig();
  const url = cfg.base_url.replace(/\/+$/, '') + '/' + String(pathSegment || '').replace(/^\/+/, '');
  try {
    const res = await fetch(url, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON response */ }
    if (!res.ok) return { ok: false, output: `Paybox HTTP ${res.status}: ${text.slice(0, 500)}` };
    return { ok: true, output: json || text, cost_usd: json && (json.amount_usd ?? json.amountUsd) };
  } catch (e) {
    return { ok: false, output: `Paybox request failed: ${(e && e.message) || e}` };
  }
}

/**
 * guardedCharge({ path, method, body, est_cost_usd, userId, approval_id })
 * Same shape/semantics as pay-guard.js's guardedCall, for consistency.
 */
async function guardedCharge(a = {}) {
  const cfg = getConfig();
  const segment = a.path;
  if (!segment) return { ok: false, refused: true, reason: '"path" required (e.g. "checkout", "charge")' };

  if (!cfg.enabled) {
    return { ok: false, refused: true, reason: 'Paybox is disabled. Set enabled:true in backend/data/paybox-config.json to allow agent charges.' };
  }

  const est = Number(a.est_cost_usd || 0);

  if (est > cfg.per_call_cap_usd) {
    return { ok: false, refused: true, reason: `Estimated $${est} exceeds per-call cap $${cfg.per_call_cap_usd}` };
  }

  const today = spentToday();
  if (today + est > cfg.daily_budget_usd) {
    return { ok: false, refused: true, reason: `Daily budget would be exceeded: spent $${today.toFixed(4)} + est $${est} > $${cfg.daily_budget_usd}` };
  }

  if (cfg.require_approval && est > cfg.approval_threshold_usd) {
    if (!a.approval_id) {
      const p = addPending({ path: segment, method: a.method || 'POST', body: a.body || null, est_cost_usd: est });
      return { ok: false, pending: true, approval_id: p.id, reason: `Needs human approval (est $${est} > threshold $${cfg.approval_threshold_usd}). Approve via /api/paybox/approve.` };
    }
    const pending = getPending().find(x => x.id === a.approval_id);
    if (!pending || pending.status !== 'approved') {
      return { ok: false, refused: true, reason: `Approval ${a.approval_id} not approved (status: ${pending ? pending.status : 'unknown'}).` };
    }
  }

  const res = await callPaybox(segment, a.method, a.body);
  if (!res.ok) return { ok: false, reason: `Paybox call failed (no charge recorded): ${res.output}` };

  const cost = res.cost_usd || est;
  if (cost > cfg.per_call_cap_usd || (today + cost) > cfg.daily_budget_usd) {
    recordSpend({ path: segment, cost_usd: cost, flagged: 'exceeded_after_charge' });
    return { ok: true, warning: `Charged $${cost} which exceeded a limit — recorded and flagged. Tighten caps.`, output: res.output, cost_usd: cost };
  }

  const dayTotal = recordSpend({ path: segment, cost_usd: cost, method: a.method || 'POST' });
  _debitBillingCreditsLocal(a.userId, cost);
  return { ok: true, output: res.output, cost_usd: cost, spent_today: dayTotal, daily_budget: cfg.daily_budget_usd };
}

function _debitBillingCreditsLocal(userId, costUsd) {
  if (!userId) return;
  try {
    const billing = require('./billing-service');
    if (typeof billing.recordUsage === 'function') {
      billing.recordUsage({ userId, agent: 'paybox-guard', brain: 'paybox', tokens: 0, costUsd });
    }
  } catch {
    // billing-service not available — silently skip
  }
}

module.exports = {
  getConfig, setConfig,
  getLedger, spentToday,
  getPending, addPending, setPendingStatus,
  guardedCharge,
};
