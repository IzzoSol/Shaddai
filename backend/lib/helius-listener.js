// backend/lib/helius-listener.js
// HELIUS LISTENER — turn on-chain events into agent work.
//
// Two modes, both fail-closed and additive (never blocks the server):
//   1. Poll — getSignaturesForAddress on watched wallets every N ms, detect new
//      token transfers / Jupiter swaps, dispatch a task string to ZEROX/ORACLE.
//   2. Webhook — accepts Helius's POST (transaction notifications), acks, and
//      processes async. Route body-parsing lives elsewhere; this exposes .handle().
//
// Dispatch goes through the existing agentic runner (POST /api/agentic/run) so the
// same tool-safety denylist + AURA free-path apply. No keys → no watchers → no-op.
'use strict';

const HELIUS_RPC = () => (process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=' + (process.env.HELIUS_API_KEY || '')).trim();
const AGENT_URL = () => (process.env.AGENTIC_INTERNAL_URL || 'http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/agentic/run');

const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKB3QNJzrRBVeKLrkQMZUyPWGcFkJn';

const watchers = new Map(); // wallet -> { lastSig, timer, rpc, agent }

function rpcCall(method, params, rpc) {
  return fetch(rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  }).then(r => r.json());
}

function summarizeTransfer(t) {
  const amt = t.tokenAmount && t.tokenAmount.uiAmount != null ? t.tokenAmount.uiAmount : t.amount;
  return `${amt} of ${t.mint} ${t.fromUserAccount ? 'from ' + t.fromUserAccount.slice(0, 6) : ''} → ${t.toUserAccount ? t.toUserAccount.slice(0, 6) : ''}`;
}

function detectEvents(tx) {
  const meta = tx.meta || {};
  const events = [];
  const transfers = Array.isArray(meta.tokenTransfers) ? meta.tokenTransfers : [];
  if (transfers.length) events.push({ type: 'token_transfer', transfers: transfers.slice(0, 8).map(summarizeTransfer) });
  const inner = Array.isArray(meta.innerInstructions) ? meta.innerInstructions : [];
  if (inner.some(ix => Array.isArray(ix.instructions) && ix.instructions.some(i => i.programId === JUPITER_PROGRAM))) {
    events.push({ type: 'jupiter_swap' });
  }
  return events;
}

async function dispatch(agent, text) {
  try {
    const r = await fetch(AGENT_URL(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, task: text }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!r.ok, agent, response: (j.response || j.error || '').slice(0, 200) };
  } catch (e) {
    return { ok: false, agent, error: String((e && e.message) || e) };
  }
}

async function processTx(tx, agent) {
  const events = detectEvents(tx);
  if (!events.length) return { skipped: true, why: 'no recognized event' };
  const text = events.map(e =>
    e.type === 'token_transfer'
      ? `On-chain event: ${e.transfers.length} token transfer(s) — ${e.transfers.join('; ')}`
      : 'On-chain event: Jupiter DEX swap detected.'
  ).join(' | ');
  return dispatch(agent, text);
}

/** Start polling a wallet for new transactions. */
function watch(wallet, opts = {}) {
  if (!process.env.HELIUS_API_KEY && !process.env.HELIUS_RPC_URL) return { ok: false, error: 'set HELIUS_API_KEY or HELIUS_RPC_URL' };
  if (watchers.has(wallet)) return { ok: true, already: true, wallet };
  const rpc = opts.rpc || HELIUS_RPC();
  const agent = String(opts.agent || 'ZEROX').toUpperCase();
  const interval = opts.intervalMs || 30000;

  const state = { lastSig: null, rpc, agent };
  const timer = setInterval(poll, interval);
  async function poll() {
    try {
      const res = await rpcCall('getSignaturesForAddress', [wallet, { limit: 5 }], rpc);
      if (!res.result) return;
      const sigs = res.result;
      for (const s of sigs) {
        if (state.lastSig === s.signature) break;
        const txRes = await rpcCall('getTransaction', [s.signature, { maxSupportedTransactionVersion: 0 }], rpc);
        if (txRes.result) await processTx(txRes.result, state.agent);
        state.lastSig = s.signature;
      }
    } catch (e) {
      // fail quietly; next tick retries
    }
  }
  watchers.set(wallet, { ...state, timer });
  return { ok: true, wallet, agent, intervalMs: interval, rpc };
}

function unwatch(wallet) {
  const w = watchers.get(wallet);
  if (w && w.timer) clearInterval(w.timer);
  watchers.delete(wallet);
  return { ok: true, wallet };
}

function list() {
  return [...watchers.entries()].map(([wallet, w]) => ({ wallet, agent: w.agent, lastSig: w.lastSig }));
}

/** Handle an incoming Helius webhook body (array of transaction notifications). */
async function handle(body, agent = 'ZEROX') {
  const items = Array.isArray(body) ? body : [body];
  const results = [];
  for (const item of items) {
    const tx = item && item.transaction ? item.transaction : item;
    if (!tx) { results.push({ skipped: true, why: 'no transaction' }); continue; }
    results.push(await processTx(tx, agent));
  }
  return results;
}

module.exports = { watch, unwatch, list, handle, processTx, detectEvents };