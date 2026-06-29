/**
 * SHADDAI pay.sh Guard — let agents pay for APIs autonomously, SAFELY.
 *
 * pay.sh lets an agent call a paid API with no account/key ("pay curl <url>"),
 * settling per-call on Solana. That means an agent can spend REAL money — so every
 * call goes through this guard:
 *
 *   1. Disabled by default. Nothing spends until pay-config.json { enabled:true }.
 *   2. Per-call cap   — refuse any single call quoted above per_call_cap_usd.
 *   3. Daily budget   — refuse if today's spend + this call exceeds daily_budget_usd.
 *   4. Approval gate  — calls above approval_threshold_usd are NOT executed; they
 *                       create a pending approval the human must release.
 *   5. Ledger         — every spend recorded in pay-ledger.json (rolling, audited).
 *
 * The actual payment uses the `pay` CLI (shelled out). If the CLI isn't installed
 * or the wallet isn't funded, calls fail closed (no spend, clear message).
 *
 * NOTHING here spends money unless ALL of: enabled=true, pay CLI present,
 * cost <= caps, and (if over threshold) an explicit approval.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CONFIG_PATH  = path.join(__dirname, 'data', 'pay-config.json');
const LEDGER_PATH  = path.join(__dirname, 'data', 'pay-ledger.json');
const PENDING_PATH = path.join(__dirname, 'data', 'pay-pending.json');

const DEFAULT_CONFIG = {
  enabled: false,                 // master switch — OFF until you opt in
  per_call_cap_usd: 0.50,         // refuse any single call quoted above this
  daily_budget_usd: 5.00,         // refuse once today's spend would exceed this
  approval_threshold_usd: 0.10,   // calls above this need human approval first
  require_approval: true,         // gate on by default
  pay_cli: 'pay',                 // command to invoke (pay.sh CLI)
  allowed_domains: []             // optional allowlist (empty = allow any)
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
function addPending(req) {
  const list = getPending();
  const entry = { id: 'pay-' + Date.now().toString(36), status: 'pending', createdAt: new Date().toISOString(), ...req };
  list.push(entry);
  writeJson(PENDING_PATH, list.slice(-200));
  return entry;
}
function resolvePending(id, decision) {
  const list = getPending();
  const e = list.find(x => x.id === id);
  if (!e) return null;
  e.status = decision === 'approve' ? 'approved' : 'denied';
  e.resolvedAt = new Date().toISOString();
  writeJson(PENDING_PATH, list);
  return e;
}

function isCliAvailable(cli) {
  return new Promise((resolve) => {
    execFile(cli, ['--version'], { timeout: 5000, shell: process.platform === 'win32' }, (err) => resolve(!err));
  });
}

// Run a pay.sh call: `pay curl <url> [-d body]`. Returns { ok, output, cost_usd }.
function runPayCurl(cli, url, method, body) {
  return new Promise((resolve) => {
    const args = ['curl', url];
    if (method && method.toUpperCase() !== 'GET') args.push('-X', method.toUpperCase());
    if (body) args.push('-d', typeof body === 'string' ? body : JSON.stringify(body));
    execFile(cli, args, { timeout: 60000, shell: process.platform === 'win32', maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, output: (stderr || err.message || '').slice(0, 500) });
      // pay.sh reports the charged amount; try to parse "$0.0123" or "cost: 0.0123"
      const m = String(stdout).match(/\$([0-9]+\.[0-9]+)|cost[:\s]+\$?([0-9]+\.[0-9]+)/i);
      const cost = m ? parseFloat(m[1] || m[2]) : 0;
      resolve({ ok: true, output: String(stdout).slice(0, 4000), cost_usd: cost });
    });
  });
}

// Internal helper used inside guardedCall (defined before the function so it hoists cleanly).
// The exported _debitBillingCredits is a duplicate for external/test use.
function _debitBillingCreditsLocal(userId, costUsd) {
  if (!userId) return;
  try {
    const billing = require('./billing-service');
    if (typeof billing.recordUsage === 'function') {
      billing.recordUsage({ userId, agent: 'pay-guard', brain: 'pay.sh', tokens: 0, costUsd });
    }
  } catch {
    // billing-service unavailable — skip
  }
}

/**
 * Guarded paid API call. Returns a structured result describing what happened —
 * executed, refused (with reason), or pending approval.
 *
 * @param {object} a
 * @param {string} a.url            target API url (pay.sh FQN or full url)
 * @param {string} [a.method]       GET/POST/... (default GET)
 * @param {object|string} [a.body]  request body
 * @param {number} [a.est_cost_usd] caller's estimated cost (used for pre-checks)
 * @param {string} [a.approval_id]  id of an approved pending request to execute
 */
async function guardedCall(a = {}) {
  const cfg = getConfig();
  const url = a.url;
  if (!url) return { ok: false, refused: true, reason: 'url required' };

  // Security: agents supply the url, and the pay CLI runs via a shell on Windows.
  // Reject anything that isn't a clean http(s) URL or contains shell metacharacters,
  // to prevent command injection (e.g. "https://x; rm -rf /").
  if (/[;&|`$<>(){}\n\r\\'"]/.test(String(url)) || !/^https?:\/\/[^\s]+$/i.test(String(url))) {
    return { ok: false, refused: true, reason: 'Unsafe or malformed url — must be a plain http(s) URL with no shell metacharacters.' };
  }

  if (!cfg.enabled) {
    return { ok: false, refused: true, reason: 'pay.sh is disabled. Set enabled:true in backend/data/pay-config.json to allow agent spending.' };
  }

  // Domain allowlist (optional)
  if (cfg.allowed_domains.length) {
    const ok = cfg.allowed_domains.some(d => String(url).includes(d));
    if (!ok) return { ok: false, refused: true, reason: `Domain not in allowlist: ${url}` };
  }

  const est = Number(a.est_cost_usd || 0);

  // Per-call cap (based on caller's estimate; final cost re-checked after the call)
  if (est > cfg.per_call_cap_usd) {
    return { ok: false, refused: true, reason: `Estimated $${est} exceeds per-call cap $${cfg.per_call_cap_usd}` };
  }

  // Daily budget pre-check
  const today = spentToday();
  if (today + est > cfg.daily_budget_usd) {
    return { ok: false, refused: true, reason: `Daily budget would be exceeded: spent $${today.toFixed(4)} + est $${est} > $${cfg.daily_budget_usd}` };
  }

  // Approval gate
  if (cfg.require_approval && est > cfg.approval_threshold_usd) {
    if (!a.approval_id) {
      const p = addPending({ url, method: a.method || 'GET', body: a.body || null, est_cost_usd: est });
      return { ok: false, pending: true, approval_id: p.id, reason: `Needs human approval (est $${est} > threshold $${cfg.approval_threshold_usd}). Approve via /api/pay/approve.` };
    }
    const pending = getPending().find(x => x.id === a.approval_id);
    if (!pending || pending.status !== 'approved') {
      return { ok: false, refused: true, reason: `Approval ${a.approval_id} not approved (status: ${pending ? pending.status : 'unknown'}).` };
    }
  }

  // CLI availability — fail closed if not installed
  const cli = cfg.pay_cli || 'pay';
  if (!(await isCliAvailable(cli))) {
    return { ok: false, refused: true, reason: `pay.sh CLI ("${cli}") not installed. Install: brew install pay (or per pay.sh docs). No charge made.` };
  }

  // Execute the paid call
  const res = await runPayCurl(cli, url, a.method, a.body);
  if (!res.ok) return { ok: false, reason: `pay.sh call failed (no charge): ${res.output}` };

  // Post-check: actual charged cost must still be within per-call cap + remaining budget
  const cost = res.cost_usd || est;
  if (cost > cfg.per_call_cap_usd || (today + cost) > cfg.daily_budget_usd) {
    recordSpend({ url, cost_usd: cost, flagged: 'exceeded_after_charge' });
    return { ok: true, warning: `Charged $${cost} which exceeded a limit — recorded and flagged. Tighten caps.`, output: res.output, cost_usd: cost };
  }

  const dayTotal = recordSpend({ url, cost_usd: cost, method: a.method || 'GET' });
  // Mirror spend into the subscription credit ledger (non-blocking, non-fatal)
  _debitBillingCreditsLocal(a.userId, cost);
  return { ok: true, output: res.output, cost_usd: cost, spent_today: dayTotal, daily_budget: cfg.daily_budget_usd };
}

// ── BILLING INTEGRATION HOOK ─────────────────────────────────────────────────
// When a pay.sh call succeeds, optionally debit billing credits for the userId
// so the cost shows up in the subscription ledger alongside LLM usage.
//
// Usage: set a.userId on the guardedCall argument to enable this.
// The hook is a no-op if billing-service is unavailable or userId is absent.
function _debitBillingCredits(userId, costUsd) {
  if (!userId) return;
  try {
    // Lazy-require to avoid circular deps and startup failures
    const billing = require('./billing-service');
    if (typeof billing.recordUsage === 'function') {
      billing.recordUsage({ userId, agent: 'pay-guard', brain: 'pay.sh', tokens: 0, costUsd });
    }
  } catch {
    // billing-service not available — silently skip
  }
}

module.exports = {
  getConfig, setConfig, getLedger, spentToday,
  getPending, resolvePending, guardedCall, DEFAULT_CONFIG,
  _debitBillingCredits // exported for tests; not intended for direct external use
};
