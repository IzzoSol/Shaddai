/**
 * Wallet Intelligence API — Pro-Signals tab
 * - GET /api/intel/holders       — per-mint top holders + cross-holder aggregation
 * - GET /api/intel/wallets       — per-wallet rollup: coins held, holdings value, PnL (+/-),
 *                                  hold time, multi-coin "smart money" flag, bubble/heatmap data
 * - GET /api/intel/backfill      — enrich calls missing topHolders from RugCheck (capped, on-demand)
 * - POST /api/intel/watchlist    — merge a static wallet watchlist (dev-config)
 *
 * Source of truth: backend/data/tg-calls.json (each call now carries topHolders[] captured at call
 * time). Wallet addresses/owners come from RugCheck's topHolders (free, keyless) — the only
 * wallet-grade source available. Full on-chain reconciliation (Helius) is optional when HELIUS_API_KEY
 * is present on the server.
 */
'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, obj) {
  try {
    const tmp = path.join(DATA_DIR, file + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, path.join(DATA_DIR, file));
  } catch (e) { console.warn('[wallet-intel] write error:', e.message); }
}

function loadCalls() { return loadJSON('tg-calls.json', {}).calls || []; }

// Load static watchlist wallets (user-provided + seeded smart-money clusters).
function loadWatchlist() {
  const set = new Set();
  for (const f of ['wallets.json', 'watched-wallets.json', 'smart-money-watchlist.json']) {
    const j = loadJSON(f, {});
    const arr = (j.wallets && j.wallets.length) ? j.wallets
      : (Array.isArray(j) ? j
        : (Array.isArray(j.wallets) ? j.wallets
          : (Array.isArray(j.addresses) ? j.addresses : (j.watchlist || []))));
    (arr || []).forEach(w => {
      const a = (w && (w.address || w.wallet || w.owner || w.mint || '')) || '';
      if (a) set.add(a);
    });
  }
  return [...set];
}

// Lock / burn / LP / market wallets aren't real holders — skip them so the
// "smart money / cross-coin wallets" view isn't polluted by pools & burn addresses.
const _BURN_RE = /1nc1nerator|^1{20,}$|dead0000|burn/i;
const _LOCK_RE = /lp|amm|pool|lock|burn|vault|market|escrow|stream|raydium|meteora|orca/i;
const _isLocked = (owner) => { const o = String(owner || ''); return _BURN_RE.test(o) || _LOCK_RE.test(o); };

// Pull a call's topHolders (already captured) as an array of {owner, pct, uiAmount, insider}.
function callHolders(call) {
  const th = call && Array.isArray(call.topHolders) ? call.topHolders : [];
  return th.map(h => ({
    owner: String(h.owner || '').trim(),
    pct: Number(h.pct) || 0,
    uiAmount: Number(h.uiAmount) || 0,
    insider: !!h.insider,
  })).filter(h => h.owner && !_isLocked(h.owner));
}

// Build per-wallet intelligence across all called coins.
function buildWalletIntel({ onlyMulti = false } = {}) {
  const calls = loadCalls();
  const byMint = new Map();          // mint -> call
  const wallets = new Map();         // owner -> { coins: Map(mint->{pct,insider}), ... }

  for (const c of calls) {
    if (!c || !c.mint) continue;
    byMint.set(c.mint, c);
    const holders = callHolders(c);
    for (const h of holders) {
      if (!wallets.has(h.owner)) wallets.set(h.owner, { coins: new Map(), insider: false });
      const w = wallets.get(h.owner);
      if (h.insider) w.insider = true;
      w.coins.set(c.mint, { pct: h.pct, insider: h.insider });
    }
  }

  // Per-coin holder count + top holder list (used for bubble source + tabs)
  const perCoin = [];
  for (const [mint, c] of byMint) {
    const holders = callHolders(c);
    perCoin.push({
      mint,
      symbol: c.symbol || c.name || mint.slice(0, 6),
      source: c.source || '',
      entryFdv: Number(c.entryFdv) || 0,
      peakMult: Number(c.peakMult) || 1,
      curMult: Number(c.curMult) || 1,
      ts: c.ts || 0,
      holders,
    });
  }
  perCoin.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  // Wallet rollups
  const list = [];
  for (const [owner, w] of wallets) {
    const coins = [];
    let totalEst = 0;   // est. USD value of holdings (entryFdv * pct) summed
    let unrealPnl = 0;  // sum of per-coin (curMult-1) * (entryFdv * pct)
    let firstTs = Infinity, lastTs = 0;
    for (const [mint, h] of w.coins) {
      const c = byMint.get(mint);
      if (!c) continue;
      const entryFdv = Number(c.entryFdv) || 0;
      const curMult = Number(c.curMult) || 1;
      const holdUsd = entryFdv * (h.pct / 100);
      const pnlUsd = holdUsd * (curMult - 1);
      totalEst += holdUsd;
      unrealPnl += pnlUsd;
      const t = c.ts || 0;
      if (t < firstTs) firstTs = t;
      if (t > lastTs) lastTs = t;
      coins.push({
        mint, symbol: c.symbol || c.name || mint.slice(0, 6),
        pct: h.pct, entryFdv, curMult, peakMult: Number(c.peakMult) || 1,
        holdUsd: Math.round(holdUsd), pnlUsd: Math.round(pnlUsd),
        ageH: t ? Math.max(0, (Date.now() - t) / 3600000) : 0,
        ts: t,
      });
    }
    coins.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd));
    const wallet = {
      owner,
      short: owner.slice(0, 6) + '…' + owner.slice(-4),
      coins,
      coinCount: coins.length,
      totalEst: Math.round(totalEst),
      unrealPnl: Math.round(unrealPnl),
      smartMoney: (coins.length >= 2) || w.insider,
      multiCoin: coins.length >= 2,
      insider: w.insider,
      firstCallTs: firstTs === Infinity ? 0 : firstTs,
      lastCallTs: lastTs || 0,
      holderAgeH: lastTs ? Math.max(0, (Date.now() - lastTs) / 3600000) : 0,
    };
    list.push(wallet);
  }

  // Sort: smart-money first, then by |unrealPnL| desc
  list.sort((a, b) => {
    if (a.smartMoney !== b.smartMoney) return a.smartMoney ? -1 : 1;
    return Math.abs(b.unrealPnl) - Math.abs(a.unrealPnl);
  });

  const watchlist = loadWatchlist();
  let result = {
    ok: true,
    generatedAt: Date.now(),
    counts: {
      calls: byMint.size,
      holderCalls: perCoin.filter(c => c.holders.length).length,
      wallets: list.length,
      multiCoinWallets: list.filter(w => w.multiCoin).length,
    },
    perCoin,
    wallets: list,
    watchlist,
    note: 'Wallets derived from RugCheck top-holders captured at call time. PnL is an estimate based on each called coin current/peak multiple × wallet holding %. Full on-chain reconciliation requires HELIUS_API_KEY.',
  };
  if (onlyMulti) {
    result.wallets = result.wallets.filter(w => w.multiCoin);
    result.watchlist = [];
  }
  return result;
}

// GET /api/intel/holders — per-mint holders + cross-holder aggregation (bubbles source)
router.get('/holders', (req, res) => {
  try {
    const intel = buildWalletIntel();
    res.json({
      ok: true,
      mint: intel.perCoin[0] ? intel.perCoin[0].mint : null,
      coins: intel.perCoin,
      generatedAt: intel.generatedAt,
    });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// GET /api/intel/wallets — wallet rollups + bubble/heatmap + smart money
router.get('/wallets', (req, res) => {
  try {
    const onlyMulti = req.query.multi === '1';
    const intel = buildWalletIntel({ onlyMulti });
    res.json(intel);
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// GET /api/intel/backfill — enrich calls missing topHolders from RugCheck (capped, on-demand).
// Writes enriched topHolders back to tg-calls.json. Rate-safe: caps per request, honors failure.
router.get('/backfill', async (req, res) => {
  try {
    const cap = Math.min(15, parseInt(req.query.cap, 10) || 8);
    const state = loadJSON('tg-calls.json', { calls: [] });
    const calls = state.calls || [];
    const toFill = calls.filter(c => c && c.mint && !(Array.isArray(c.topHolders) && c.topHolders.length)).slice(0, cap);
    let filled = 0, failed = 0;
    for (const c of toFill) {
      try {
        const r = await fetch('https://api.rugcheck.xyz/v1/tokens/' + c.mint + '/report', { signal: AbortSignal.timeout(9000) });
        if (!r.ok) { failed++; continue; }
        const j = await r.json();
        c.topHolders = (j.topHolders || []).slice(0, 20).map(h => ({
          owner: String(h.owner || h.address || '').slice(0, 64),
          pct: Math.round((Number(h.pct) || 0) * 100) / 100,
          uiAmount: Number(h.uiAmount) || 0,
          insider: !!h.insider,
        }));
        filled++;
      } catch { failed++; }
    }
    if (filled) writeJSON('tg-calls.json', state);
    res.json({ ok: true, scanned: toFill.length, filled, failed, remaining: calls.filter(c => c && c.mint && !(Array.isArray(c.topHolders) && c.topHolders.length)).length });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

module.exports = router;
