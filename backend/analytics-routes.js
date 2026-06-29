// analytics-routes.js — read-only economy/marketplace dashboard for SHADDAI.
//   Aggregates the existing JSON data stores. NEVER writes.
//   GET /api/analytics/overview     — all aggregates in one object
//   GET /api/analytics/leaderboards — games + top sellers + richest wallets
//   GET /api/analytics/treasury     — treasury / circulating / fees
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const read = (file) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8')); } catch (e) { return null; } };
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);

function economy() {
  const led = read('x402-ledger.json') || { balances: {}, txns: [] };
  const balances = led.balances || {}, txns = led.txns || [];
  const circulating = Object.values(balances).reduce((s, v) => s + num(v), 0);
  const volume = txns.reduce((s, t) => s + num(t.amount), 0);
  return {
    circulating: Math.round(circulating * 100) / 100,
    treasury: Math.round(num(balances.SHADDAI_TREASURY) * 100) / 100,
    wallets: Object.keys(balances).length,
    txCount: txns.length,
    volume: Math.round(volume * 100) / 100,
    feesCollected: Math.round(num(balances.SHADDAI_TREASURY) * 100) / 100,
    recentTxns: txns.slice(0, 10),
  };
}
function bazaarStats() {
  const bz = read('bazaar.json') || { listings: [], orders: [] };
  const L = bz.listings || [];
  const sold = L.filter(x => x.status === 'sold');
  return { live: L.filter(x => x.status !== 'sold').length, sold: sold.length, externalOrders: (bz.orders || []).length, gmv: Math.round(sold.reduce((s, x) => s + num(x.price), 0) * 100) / 100 };
}
function gamesStats() {
  const g = read('games-scores.json') || {};
  const out = {};
  for (const k of Object.keys(g)) { const b = g[k] || []; out[k] = { plays: b.length, top: b[0] ? b[0].score : 0 }; }
  return out;
}

router.get('/api/analytics/overview', (req, res) => {
  const museum = read('museum.json') || { items: [] };
  const library = read('library.json') || { notes: [] };
  const neo = read('neocortex.json') || {};
  const ops = read('operatives.json') || { operatives: {} };
  res.json({
    ok: true, generatedAt: Date.now(),
    economy: economy(),
    bazaar: bazaarStats(),
    games: gamesStats(),
    museum: { items: (museum.items || []).length, minted: (museum.items || []).filter(i => i.minted).length },
    library: { notes: (library.notes || []).length },
    bonds: { pairs: Object.keys(neo).length, highest: Object.values(neo).reduce((m, v) => Math.max(m, num(v && v.bond)), 0) },
    operatives: { count: Object.keys(ops.operatives || {}).length },
  });
});

router.get('/api/analytics/leaderboards', (req, res) => {
  const g = read('games-scores.json') || {};
  const games = {}; for (const k of Object.keys(g)) games[k] = (g[k] || []).slice(0, 5);
  const bz = read('bazaar.json') || { listings: [] };
  const sellerRev = {};
  (bz.listings || []).filter(x => x.status === 'sold').forEach(x => { sellerRev[x.seller] = (sellerRev[x.seller] || 0) + num(x.price); });
  const sellers = Object.entries(sellerRev).map(([seller, revenue]) => ({ seller, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const led = read('x402-ledger.json') || { balances: {} };
  const richest = Object.entries(led.balances || {}).filter(([u]) => u !== 'SHADDAI_TREASURY').map(([user, balance]) => ({ user, balance: num(balance) })).sort((a, b) => b.balance - a.balance).slice(0, 5);
  res.json({ ok: true, games, sellers, richest });
});

router.get('/api/analytics/treasury', (req, res) => {
  const e = economy();
  res.json({ ok: true, treasury: e.treasury, circulating: e.circulating, feesCollected: e.feesCollected, txCount: e.txCount, volume: e.volume });
});

module.exports = router;
