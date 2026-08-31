// shop-routes.js — SHADDAI Shop + Skill Bazaar shell.
//   A thin storefront router that proxies the Skill Bazaar (`/api/skills/market`)
//   and the paybox-settle rail. It never reinvents the catalog or the checkout —
//   those live in skills-market-routes.js. This module only:
//     GET  /api/shop                → storefront meta (categories + featured note)
//     GET  /api/shop/receipts?user= → a buyer's paybox receipts / proofs of task
//     GET  /api/shop/paybox/:agent  → one agent's in-app paybox (ledger) balance
//     POST /api/shop/demo-credit    → ensure a user has the START_CREDITS top-up
//
// Data idiom mirrors api-proxy-routes.js: read with loadJSON (fallback on any
// parse/read error) and write atomically to a .tmp file then rename over the
// target so a crash mid-write can never leave a truncated ledger behind.
const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();
const json = express.json();

const DATA_DIR = path.join(__dirname, 'data');
const LEDGER = path.join(DATA_DIR, 'x402-ledger.json');
const RECEIPTS = path.join(DATA_DIR, 'paybox-receipts.json');

const START_CREDITS = 100;        // every new wallet starts with demo credits
const CURRENCY = 'SHAD-Credits';  // matches x402-routes.js / paybox-settle.js

function loadJSON(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}

function saveJSON(filePath, data) {
  // Atomic write: serialize to a temp file then rename over the target. A crash
  // mid-write leaves the original intact instead of a truncated file that would
  // silently load as fallback and wipe balances/receipts.
  try {
    const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return true;
  } catch (e) {
    console.error('[SHOP] Failed to save:', filePath, e.message);
    return false;
  }
}

// read the ledger in its canonical shape { balances:{}, txns:[] }
function readLedger() {
  const db = loadJSON(LEDGER, null);
  if (db && typeof db === 'object' && db.balances) return db;
  return { balances: {}, txns: [] };
}

// balance for a user; a missing user defaults to START_CREDITS *without writing*
function balanceFor(db, user) {
  return (user in db.balances) ? db.balances[user] : START_CREDITS;
}

// GET /api/shop — storefront meta. The catalog itself is served by
// /api/skills/market (skills-market-routes.js); we keep the fixture minimal.
router.get('/api/shop', (req, res) => {
  res.json({
    ok: true,
    featured: [],
    categories: ['common', 'rare', 'legendary', 'all'],
    catalog: '/api/skills/market',
    note: 'Browse the full catalog at /api/skills/market?limit=12',
    currency: CURRENCY,
    startCredits: START_CREDITS
  });
});

// GET /api/shop/receipts?user= — proxy the paybox-receipts file (the buy-side
// copy of every settled skill run), filtered to the caller's wallet.
router.get('/api/shop/receipts', (req, res) => {
  const user = String(req.query.user || 'guest');
  let receipts = loadJSON(RECEIPTS, []);
  if (!Array.isArray(receipts)) receipts = [];
  const list = receipts.filter(r => r && r.user === user);
  res.json({ ok: true, receipts: list, count: list.length });
});

// GET /api/shop/paybox/:agent — one selling agent's in-app paybox balance.
router.get('/api/shop/paybox/:agent', (req, res) => {
  const agent = String(req.params.agent || 'SHADDAI').toUpperCase();
  const db = readLedger();
  const balance = balanceFor(db, agent);
  res.json({ ok: true, agent, balance, currency: CURRENCY });
});

// POST /api/shop/demo-credit {user} — safe dev top-up consistent with the
// existing "/api/x402/grant" demo pattern. Ensures the user has at least the
// START_CREDITS starting balance (sets to exactly 100 if missing or below),
// and writes back atomically. Never decreases an established balance.
router.post('/api/shop/demo-credit', json, (req, res) => {
  const user = String((req.body && req.body.user) || 'guest').slice(0, 80);
  const db = readLedger();
  const current = balanceFor(db, user);

  if (current >= START_CREDITS) {
    // Already funded — no-op (mirrors idempotent grant semantics).
    return res.json({ ok: true, user, balance: current, granted: 0, topup: false });
  }

  db.balances[user] = START_CREDITS;
  const ok = saveJSON(LEDGER, db);
  if (!ok) {
    const retry = loadJSON(LEDGER, null);
    return res.json({
      ok: true,
      user,
      balance: (retry && retry.balances && user in retry.balances) ? retry.balances[user] : START_CREDITS,
      granted: START_CREDITS - current,
      topup: true,
      persist: 'deferred'
    });
  }
  res.json({ ok: true, user, balance: START_CREDITS, granted: START_CREDITS - current, topup: true });
});

module.exports = router;
