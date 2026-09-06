'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI Agent Academy — core engine (sandbox-first, real-x402-ready).
//
// SHADDAI is the COACH + router + policy + merchant. It NEVER holds keys.
//   - Discover / quote  -> x402 402 challenge, $0            (nobody signs)
//   - Lesson/skill/API  -> x402 exact, Solana USDC           (PayBox or capped agent wallet)
//   - RPC/inference loop-> x402 upto / payment channel        (PayBox opens ceiling)
//   - Swap/card/>= $1   -> PayBox structured intent           (PayBox only)
//
// Sandbox default: PAY_SANDBOX=1. When the `pay` CLI / x402 libs are unavailable,
// we run SANDBOX tabs with IDENTICAL JSON shapes (constitution §2, §3).
//   - Spend path: AURA cache identical GET -> PIKADON allowlist/cap -> pay or cached hit.
//   - Quote cost >= 1 USDC => humanApprovalRequired true, fail closed (constitution §4).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- Rail config (constitution §10) ---------------------------------------
const PAY_SANDBOX = process.env.PAY_SANDBOX !== '0';          // sandbox by default
const X402_MAX_PAYMENT_USD = parseFloat(process.env.X402_MAX_PAYMENT_USD || '1.00');
const ACADEMY_LESSON_PRICE_USDC = parseFloat(process.env.ACADEMY_LESSON_PRICE_USDC || '0.10');
const HUMAN_APPROVAL_THRESHOLD_USD = 1.0;                     // >= $1 -> fail closed

// ---- Ledger data dir -------------------------------------------------------
const DATA_DIR = process.env.AURA_DATA_DIR
  ? (process.env.AURA_DATA_DIR + '/academy')
  : path.join(__dirname, '..', 'data', 'academy');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }

const TABS_FILE = path.join(DATA_DIR, 'tabs.json');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const BADGES_FILE = path.join(DATA_DIR, 'badges.json');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; }
  catch (_) { return false; }
}

const tabs = loadJSON(TABS_FILE, {});          // tabId -> tab
const receipts = loadJSON(RECEIPTS_FILE, {});  // sessionId -> receipt[]
const badges = loadJSON(BADGES_FILE, {});      // sessionId -> [badge]
const cache = loadJSON(CACHE_FILE, {});        // key -> {response, costUsdc, ts}

// ---- Shared event bus (socket subscribes here) -----------------------------
const EventEmitter = require('events');
const bus = new EventEmitter();
bus.setMaxListeners(0);
const HISTORY = [];                            // last 50 events (replay on reconnect)
function emit(event) {
  const ev = { ts: new Date().toISOString(), ...event };
  HISTORY.push(ev);
  if (HISTORY.length > 50) HISTORY.shift();
  bus.emit('event', ev);
}
function replay() { return HISTORY.slice(); }

// ---- Catalog (discovery, $0) ------------------------------------------------
// Mirrors the spec's academy_catalog: what can an agent pay for / sell.
const CATALOG = [
  { name: 'Alibaba Cloud Qwen Inference', provider: 'alibaba',    price: '$0.002/call', rail: 'x402-channel', useWhen: 'Metered inference loops (100+ calls/min)' },
  { name: 'Helius RPC',                   provider: 'helius',     price: '$0.001/call', rail: 'x402-channel', useWhen: 'Solana RPC in trading bot loops' },
  { name: 'Birdeye API',                  provider: 'birdeye',    price: '$0.005/call', rail: 'x402-single',  useWhen: 'One-off token data fetches' },
  { name: 'QuickNode RPC',                provider: 'quicknode',  price: '$0.002/call', rail: 'x402-channel', useWhen: 'Solana/ETH RPC loops' },
  { name: 'SHADDAI Lesson: Pay-Lab',      provider: 'shaddai-lesson', price: '$0.10',   rail: 'paybox',       useWhen: 'Learn to open payment channels (tutorial)' },
];

function searchCatalog(query, provider) {
  const q = (query || '').toLowerCase();
  return CATALOG.filter(c =>
    (!provider || c.provider === provider) &&
    (!q || c.name.toLowerCase().includes(q) || c.provider.toLowerCase().includes(q) || c.useWhen.toLowerCase().includes(q))
  );
}

// ---- AURA-style exact cache ($0 for repeat GETs, constitution §4) -----------
function cacheKey(method, endpoint, body) {
  return crypto.createHash('sha256').update(method + '|' + endpoint + '|' + (body ? JSON.stringify(body) : '')).digest('hex');
}
function cachedGet(key) { return cache[key]; }
function storeCache(key, val) { cache[key] = val; saveJSON(CACHE_FILE, cache); }

// ---- PIKADON policy gate (fail closed) --------------------------------------
const ALLOWED_SCHEMES = ['http:', 'https:'];
const BLOCKED_HOSTS = ['localhost:3000/admin', /\.internal$/, /169\.254\./];
function pikadonAllow(endpoint, costUsdc) {
  let u;
  try { u = new URL(endpoint); } catch (_) {
    return { allowed: false, reason: 'Not a valid URL (PIKADON).' };
  }
  if (!ALLOWED_SCHEMES.includes(u.protocol)) {
    return { allowed: false, reason: 'Protocol ' + u.protocol + ' not allowed (PIKADON).' };
  }
  for (const b of BLOCKED_HOSTS) {
    if (typeof b === 'string' && u.hostname.endsWith(b)) return { allowed: false, reason: 'Host blocked by policy (PIKADON).' };
    if (b instanceof RegExp && b.test(u.hostname)) return { allowed: false, reason: 'Host blocked by policy (PIKADON).' };
  }
  if (costUsdc >= HUMAN_APPROVAL_THRESHOLD_USD) {
    return { allowed: true, humanApprovalRequired: true, reason: 'Cost >= $1 — human approval required, failing closed until approved.' };
  }
  if (costUsdc > X402_MAX_PAYMENT_USD) {
    return { allowed: false, reason: 'Cost exceeds X402_MAX_PAYMENT_USD (' + X402_MAX_PAYMENT_USD + ').' };
  }
  return { allowed: true, humanApprovalRequired: false };
}

// ---- Real-x402 hooks (only used when PAY_SANDBOX=0) -------------------------
// Sandbox keeps IDENTICAL JSON shapes. These hooks swap in real libs lazily.
let realFetchPay = null, realSettle = null, realPayLab = null;
try {
  if (!PAY_SANDBOX) {
    // consume side: @x402/fetch wrapFetchWithPaymentFromConfig + @x402/svm ExactSvmScheme
    // merchant side: @x402/express paymentMiddlewareFromConfig + x402ResourceServer
    const f = require('@x402/fetch');
    const svm = require('@x402/svm');
    // We deliberately do NOT construct signers here — SHADDAI never holds keys.
    // A dedicated capped agent wallet (or PayBox approval) supplies the signer.
    // These are wired at /ws + merchant route when a facilitator/key is configured.
    void f; void svm;
  }
} catch (_) { /* libs optional in sandbox */ }

// ---- Tabs (payment channels) -------------------------------------------------
function newTab(provider, maxUsdc, ttlHours) {
  const tabId = 'tab_' + crypto.randomBytes(6).toString('hex');
  const now = Date.now();
  const tab = {
    tabId,
    provider,
    maxUsdc: clampNum(maxUsdc, 0.01, 100),
    spentUsdc: 0,
    ttlHours: clampNum(ttlHours, 1, 720),
    openedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + clampNum(ttlHours, 1, 720) * 3600 * 1000).toISOString(),
    status: 'open',
    sandbox: PAY_SANDBOX,
    escrowTx: PAY_SANDBOX ? 'sandbox_escrow_' + crypto.randomBytes(6).toString('hex') : 'PENDING_ONCHAIN_SETTLE',
    sessionId: null,
    calls: 0,
  };
  tabs[tabId] = tab;
  saveJSON(TABS_FILE, tabs);
  return tab;
}

function clampNum(n, lo, hi) {
  const v = parseFloat(n);
  if (isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function getTab(tabId) {
  const t = tabs[tabId];
  if (!t) return { error: 'Unknown tab: ' + tabId };
  if (t.status !== 'open') return { error: 'Tab ' + tabId + ' is ' + t.status };
  if (new Date(t.expiresAt).getTime() < Date.now()) {
    t.status = 'expired';
    saveJSON(TABS_FILE, tabs);
    return { error: 'Tab ' + tabId + ' expired' };
  }
  return { tab: t };
}

// ---- The 5 Academy operations (stable names + JSON shapes) ------------------
function academyCatalog(args) {
  const results = searchCatalog(args && args.query, args && args.provider);
  emit({ type: 'catalog.results', sessionId: args && args.sessionId, query: args && args.query, count: results.length });
  return { results };
}

function academyQuote(args) {
  const provider = (args && args.provider) || '';
  const endpoint = (args && args.endpoint) || '';
  const method = (args && args.method) || 'GET';
  const entry = CATALOG.find(c => c.provider === provider);
  // deterministic estimated cost from provider
  const est = estimateCost(provider);
  const quote = {
    provider,
    method,
    endpoint,
    amountCap: round6(est * 100),
    asset: 'USDC',
    network: 'solana:mainnet',
    needsChannel: needsChannel(provider),
    reason: needsChannel(provider) ? 'Metered loop (100+ calls expected)' : 'Single x402 call',
    estimatedCostPerCall: est,
    humanApprovalRequired: est >= HUMAN_APPROVAL_THRESHOLD_USD,
    rail: entry ? entry.rail : 'x402-single',
  };
  emit({ type: 'quote.ready', sessionId: args && args.sessionId, provider, estimatedCostPerCall: est, humanApprovalRequired: quote.humanApprovalRequired });
  if (quote.humanApprovalRequired) {
    emit({ type: 'policy.warn', sessionId: args && args.sessionId, reason: 'Quote >= $1 — human approval required (fail closed).' });
  }
  return quote;
}

function estimateCost(provider) {
  const map = { alibaba: 0.002, helius: 0.001, birdeye: 0.005, quicknode: 0.002, 'shaddai-lesson': 0.10 };
  return map[provider] || 0.001;
}
function needsChannel(provider) {
  return ['alibaba', 'helius', 'quicknode'].includes(provider);
}

function academyOpenTab(args) {
  const provider = (args && args.provider) || 'helius';
  const maxUsdc = clampNum(args && args.max_usdc, 0.01, 100);
  const ttlHours = clampNum(args && args.ttl_hours, 1, 720);
  const tab = newTab(provider, maxUsdc, ttlHours);
  tab.sessionId = args && args.sessionId;
  saveJSON(TABS_FILE, tabs);
  emit({ type: 'tab.opened', sessionId: tab.sessionId, tabId: tab.tabId, provider, maxUsdc, ttlHours });
  return tab;
}

function academySpend(args) {
  const tabId = args && args.tabId;
  const endpoint = (args && args.endpoint) || '';
  const method = ((args && args.method) || 'GET').toUpperCase();
  const g = getTab(tabId);
  if (g.error) { emit({ type: 'error', sessionId: args && args.sessionId, reason: g.error }); return { error: g.error }; }
  const tab = g.tab;

  const est = estimateCost(tab.provider);

  // 1) AURA cache identical GETs — don't re-pay (constitution §4)
  const ckey = cacheKey(method, endpoint, args && args.body);
  if (method === 'GET') {
    const hit = cachedGet(ckey);
    if (hit) {
      emit({ type: 'tab.spent', sessionId: tab.sessionId, tabId, costUsdc: 0, cached: true, reason: 'AURA cache hit — $0' });
      return { success: true, cached: true, response: hit.response, costUsdc: 0, remainingBalance: round6(tab.maxUsdc - tab.spentUsdc), voucherTx: 'aura_cached_' + ckey.slice(0, 12) };
    }
  }

  // 2) PIKADON policy gate before any spend (fail closed)
  const pol = pikadonAllow(endpoint, est);
  if (!pol.allowed) {
    emit({ type: 'policy.blocked', sessionId: tab.sessionId, tabId, reason: pol.reason });
    return { error: 'PIKADON blocked: ' + pol.reason };
  }
  if (pol.humanApprovalRequired) {
    emit({ type: 'paybox.needs_approval', sessionId: tab.sessionId, tabId, amountUsdc: est });
    return { success: false, humanApprovalRequired: true, reason: 'Human approval required (>= $1). Route via PayBox.', voucherTx: null };
  }

  // 3) balance check
  if (tab.spentUsdc + est > tab.maxUsdc) {
    emit({ type: 'error', sessionId: tab.sessionId, tabId, reason: 'Tab balance insufficient — open new tab or use PayBox.' });
    return { error: 'Insufficient tab balance. Open a new tab or use PayBox.' };
  }

  // 4) perform the call (sandbox: deterministic response; real: @x402/fetch wrapped)
  let response;
  if (PAY_SANDBOX) {
    response = sandboxCall(endpoint, method, args && args.body);
  } else if (realFetchPay) {
    // TODO(real): realFetchPay(endpoint, { method, body }) — needs a configured capped agent wallet signer
    response = { sandbox: true, note: 'PAY_SANDBOX=0 but no real signer configured — refusing real spend.' };
  } else {
    response = sandboxCall(endpoint, method, args && args.body);
  }

  // 5) debit + record
  tab.spentUsdc = round6(tab.spentUsdc + est);
  tab.calls = (tab.calls || 0) + 1;
  saveJSON(TABS_FILE, tabs);
  storeCache(ckey, { response, costUsdc: est, ts: Date.now() });

  emit({ type: 'tab.spent', sessionId: tab.sessionId, tabId, costUsdc: est, remaining: round6(tab.maxUsdc - tab.spentUsdc) });
  return {
    success: true,
    response,
    costUsdc: est,
    remainingBalance: round6(tab.maxUsdc - tab.spentUsdc),
    voucherTx: PAY_SANDBOX ? 'sandbox_voucher_' + ckey.slice(0, 12) : 'signed_voucher_' + ckey.slice(0, 12),
    rail: 'x402-channel',
  };
}

function sandboxCall(endpoint, method, body) {
  // Deterministic, dependency-free "API response" for sandbox tabs.
  const u = { scheme: 'sandbox' };
  try { const p = new URL(endpoint); u.host = p.host; u.path = p.pathname; } catch (_) {}
  const balance = method === 'POST' && body && body.jsonrpc === '2.0' && body.method === 'getBalance'
    ? { balance: 1.23 } : { ok: true };
  return {
    sandbox: true,
    host: u.host || 'sandbox',
    path: u.path || '/',
    method,
    ...balance,
    _note: 'Sandbox response (PAY_SANDBOX=1). Identical JSON shape to real x402.',
  };
}

function academyCloseTab(args) {
  const tabId = args && args.tabId;
  const g = getTab(tabId);
  if (g.error) return { error: g.error };
  const tab = g.tab;
  if (tab.status !== 'open') return { error: 'Tab already ' + tab.status };

  tab.status = 'settled';
  tab.closedAt = new Date().toISOString();
  const refunded = round6(tab.maxUsdc - tab.spentUsdc);
  saveJSON(TABS_FILE, tabs);

  const receipt = {
    tabId,
    provider: tab.provider,
    callsMade: tab.calls || 0,
    totalSpent: tab.spentUsdc,
    refunded,
    rail: PAY_SANDBOX ? 'sandbox-channel' : 'x402-channel',
    sig: PAY_SANDBOX ? 'sandbox' : 'SETTLE_TX',
    openedAt: tab.openedAt,
    closedAt: tab.closedAt,
  };
  const sid = tab.sessionId || 'anon';
  receipts[sid] = receipts[sid] || [];
  receipts[sid].push(receipt);
  saveJSON(RECEIPTS_FILE, receipts);

  emit({ type: 'tab.closed', sessionId: sid, tabId, totalSpent: tab.spentUsdc, refunded });
  return { tabId, totalSpent: tab.spentUsdc, refunded, settleTx: 'sandbox_settle_' + tabId, receipt };
}

// ---- Lesson 01: Channel Opener ----------------------------------------------
// whoami -> catalog "solana rpc" -> quote -> open_tab 0.50/24h ->
// one spend -> close_tab -> receipt + badge "channel-opener"
async function runLesson01(sessionId) {
  emit({ type: 'session.hello', sessionId, lesson: 'academy-pay-lab' });
  const catalog = academyCatalog({ query: 'solana rpc', sessionId });
  const quote = academyQuote({ provider: 'helius', endpoint: 'https://api.helius-rpc.com/', method: 'POST', body: '{}', sessionId });
  const tab = academyOpenTab({ provider: 'helius', max_usdc: 0.50, ttl_hours: 24, sessionId });
  const spend = academySpend({
    tabId: tab.tabId,
    endpoint: 'https://api.helius-rpc.com/',
    method: 'POST',
    body: { jsonrpc: '2.0', method: 'getBalance', params: ['YourWallet'] },
    sessionId,
  });
  const closed = academyCloseTab({ tabId: tab.tabId, sessionId });
  const badge = grantBadge(sessionId, 'channel-opener');
  return { catalog, quote, tab, spend, closed, badge, memo: '402 is not a trade. Channels are loops. PayBox is the vault.' };
}

function grantBadge(sessionId, badgeId) {
  const map = { 'channel-opener': { id: 'channel-opener', name: 'Channel Opener', desc: 'Proof you can open a Solana payment channel.' } };
  const b = map[badgeId] || { id: badgeId, name: badgeId };
  badges[sessionId] = badges[sessionId] || [];
  if (!badges[sessionId].find(x => x.id === b.id)) {
    badges[sessionId].push(b);
    saveJSON(BADGES_FILE, badges);
    emit({ type: 'badge.granted', sessionId, badge: b });
  }
  return b;
}

// ---- Receipt log (constitution §11) ------------------------------------------
function logReceipt(line) {
  // Never include keys/seeds. tabId, provider, spent, refunded, rail, sig-or-sandbox only.
  try {
    const f = path.join(DATA_DIR, 'receipt-audit.log');
    fs.appendFileSync(f, new Date().toISOString() + ' ' + line + '\n');
  } catch (_) {}
}

function round6(n) { return Math.round((n + Number.EPSILON) * 1e6) / 1e6; }

module.exports = {
  PAY_SANDBOX,
  X402_MAX_PAYMENT_USD,
  ACADEMY_LESSON_PRICE_USDC,
  HUMAN_APPROVAL_THRESHOLD_USD,
  academyCatalog,
  academyQuote,
  academyOpenTab,
  academySpend,
  academyCloseTab,
  runLesson01,
  grantBadge,
  getTab,
  replay,
  bus,
  emit,
  CATALOG,
  logReceipt,
  DATA_DIR,
};
