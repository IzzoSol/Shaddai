/**
 * SHADDAI Paybox Guard — let agents spend/trade via Paybox, SAFELY.
 *
 * CORRECTED 2026-08-29 (real tool list confirmed): Paybox is NOT a REST checkout
 * API — it's a non-custodial agent wallet reached over MCP (JSON-RPC over HTTP
 * at {base_url}/mcp), authenticated with a persistent `pbx_live_*` Bearer key
 * (issued from the Paybox app's Clients screen — same authority as a full OAuth
 * grant on whatever wallets that key's connector has been granted).
 *
 * Every money-moving Paybox tool (request_swap, request_transfer, request_payment,
 * pay_x402) is itself async: it returns a request_id + a pending_* status, and the
 * ACTUAL signing happens on Paybox's own side. SHADDAI's gate below is a layer
 * BEFORE that — it decides whether to even fire the request at all. This matters
 * a lot here because the connected wallets currently have approval_mode:
 * "autonomous" (confirmed via list_credentials 2026-08-29) — Paybox will NOT stop
 * an autonomous-wallet transaction with its own passkey prompt, so this guard is
 * the only human checkpoint that exists for those wallets.
 *
 * Same 5-layer model as pay-guard.js / the original (wrong-shaped) paybox-guard.js:
 *   1. Disabled by default. Nothing spends until paybox-config.json { enabled:true }.
 *   2. Per-call cap   — refuse any single call quoted above per_call_cap_usd.
 *   3. Daily budget   — refuse if today's spend + this call exceeds daily_budget_usd.
 *   4. Approval gate  — calls above approval_threshold_usd are NOT executed; they
 *                       create a pending approval the human must release.
 *   5. Ledger         — every call recorded in paybox-ledger.json (rolling, audited).
 *
 * Read-only Paybox tools (list_credentials, get_portfolio, list_requests, get_request,
 * verify_solana_balance, resolve_username, discover_plugins, discover_services,
 * get_buy_link) move no money and are NOT gated — they work even while enabled:false,
 * same as checking a bank balance doesn't need a spending limit.
 *
 * NOTHING here spends unless ALL of: enabled=true, a pbx_live_* key present,
 * cost <= caps, and (if over threshold) an explicit approval.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH  = path.join(__dirname, 'data', 'paybox-config.json');
const LEDGER_PATH  = path.join(__dirname, 'data', 'paybox-ledger.json');
const PENDING_PATH = path.join(__dirname, 'data', 'paybox-pending.json');

const DEFAULT_CONFIG = {
  enabled: false,                 // master switch — OFF until you opt in
  per_call_cap_usd: 5.00,         // refuse any single call quoted above this
  daily_budget_usd: 25.00,        // refuse once today's spend would exceed this
  approval_threshold_usd: 1.00,   // calls above this need human approval first
  require_approval: true,         // gate on by default
  base_url: 'https://api.paybox.sh',
};

// Tools that move no money — always allowed, never gated, never logged to the spend ledger.
const READ_ONLY_TOOLS = new Set([
  'list_credentials', 'get_portfolio', 'list_requests', 'get_request',
  'verify_solana_balance', 'resolve_username', 'discover_plugins',
  'discover_services', 'get_buy_link', 'get_contract',
]);
// Tools that move (or can move) real money — must go through the full 5-layer gate.
const GATED_TOOLS = new Set([
  'request_swap', 'request_transfer', 'request_payment', 'pay_x402', 'use_plugin', 'use_service',
]);

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

let _rpcId = 0;
/**
 * Calls one Paybox MCP tool over JSON-RPC/HTTP. `agentKey` picks which env var
 * holds the Bearer token — different agents can get their own dedicated
 * pbx_live_* key (so spend is attributable per-agent, per the owner's ask),
 * falling back to a shared PAYBOX_API_KEY if that agent has none of its own.
 */
async function callPaybox(toolName, args, agentKey) {
  const envVar = agentKey ? `PAYBOX_API_KEY_${String(agentKey).toUpperCase()}` : 'PAYBOX_API_KEY';
  const apiKey = process.env[envVar] || process.env.PAYBOX_API_KEY;
  if (!apiKey) return { ok: false, output: `${envVar} (or PAYBOX_API_KEY) not set in backend/.env — no Paybox call made.` };
  const cfg = getConfig();
  const url = cfg.base_url.replace(/\/+$/, '') + '/mcp';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream', // MCP Streamable HTTP requires both
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++_rpcId, method: 'tools/call', params: { name: toolName, arguments: args || {} } }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, output: `Paybox HTTP ${res.status}: ${text.slice(0, 500)}` };
    let rpc = null;
    try { rpc = JSON.parse(text); } catch { return { ok: false, output: `Paybox returned non-JSON: ${text.slice(0, 300)}` }; }
    if (rpc.error) return { ok: false, output: `Paybox RPC error: ${rpc.error.message || JSON.stringify(rpc.error)}` };
    const content = rpc.result && rpc.result.content && rpc.result.content[0];
    const raw = content && content.text;
    let parsed = raw;
    try { parsed = JSON.parse(raw); } catch { /* some tools return plain text */ }
    if (rpc.result && rpc.result.isError) return { ok: false, output: parsed };
    return { ok: true, output: parsed };
  } catch (e) {
    return { ok: false, output: `Paybox request failed: ${(e && e.message) || e}` };
  }
}

/** Read-only tools — no gate, no ledger entry, works even while enabled:false. */
async function payboxRead(toolName, args, agentKey) {
  if (!READ_ONLY_TOOLS.has(toolName)) {
    return { ok: false, refused: true, reason: `"${toolName}" is not a read-only tool — use guardedPayboxCall for money-moving tools.` };
  }
  return callPaybox(toolName, args, agentKey);
}

/**
 * guardedPayboxCall({ tool, args, est_cost_usd, agentKey, userId, approval_id })
 * The gated path for money-moving tools. Same 5-layer semantics as
 * pay-guard.js's guardedCall / the original guardedCharge, generalized from
 * "path/body" to Paybox's real "tool/args" shape.
 *
 * Returns the RAW Paybox response on success — for request_swap/request_transfer/
 * request_payment/pay_x402 that means a request_id + a pending_* status, NOT a
 * finished transaction. Poll it with checkPayboxRequest(request_id). Never call
 * this function again for the same intent if a request_id already exists — that
 * can double-spend, per Paybox's own tool guidance.
 */
async function guardedPayboxCall(a = {}) {
  const cfg = getConfig();
  const tool = a.tool;
  if (!tool) return { ok: false, refused: true, reason: '"tool" required (e.g. "request_transfer")' };
  if (READ_ONLY_TOOLS.has(tool)) return payboxRead(tool, a.args, a.agentKey);
  if (!GATED_TOOLS.has(tool)) return { ok: false, refused: true, reason: `Unknown Paybox tool "${tool}" — not in the read-only or gated list. Refusing rather than guessing.` };

  if (!cfg.enabled) {
    return { ok: false, refused: true, reason: 'Paybox is disabled. Set enabled:true in backend/data/paybox-config.json to allow agent spending.' };
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
      const p = addPending({ tool, args: a.args || null, est_cost_usd: est, agentKey: a.agentKey || null });
      return { ok: false, pending: true, approval_id: p.id, reason: `Needs human approval (est $${est} > threshold $${cfg.approval_threshold_usd}). Approve via /api/paybox/approve.` };
    }
    const pending = getPending().find(x => x.id === a.approval_id);
    if (!pending || pending.status !== 'approved') {
      return { ok: false, refused: true, reason: `Approval ${a.approval_id} not approved (status: ${pending ? pending.status : 'unknown'}).` };
    }
  }

  const res = await callPaybox(tool, a.args, a.agentKey);
  if (!res.ok) return { ok: false, reason: `Paybox call failed (nothing recorded as spent): ${res.output}` };

  // The estimate IS the recorded spend here — Paybox's own request is async
  // (pending_signature/pending_approval/pending_settlement), so there is no
  // final on-chain cost to reconcile against yet. checkPayboxRequest() can be
  // used later to confirm the request actually reached "success".
  const dayTotal = recordSpend({ tool, cost_usd: est, agentKey: a.agentKey || null, request_id: res.output && res.output.request_id });
  _debitBillingCreditsLocal(a.userId, est);
  return { ok: true, output: res.output, cost_usd: est, spent_today: dayTotal, daily_budget: cfg.daily_budget_usd };
}

/** Poll a Paybox request to its terminal state. Never re-fire the original call. */
async function checkPayboxRequest(requestId, agentKey) {
  return callPaybox('get_request', { request_id: requestId }, agentKey);
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
  payboxRead, guardedPayboxCall, checkPayboxRequest,
  READ_ONLY_TOOLS, GATED_TOOLS,
};
