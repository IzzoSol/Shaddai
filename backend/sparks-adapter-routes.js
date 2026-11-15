'use strict';
/**
 * sparks-adapter-routes.js — the /sparks API, backed by the ONE Sparks
 * ledger (backend/economy-service.js via /api/economy).
 *
 * Why an adapter, not a mount of server/sparksRoutes.js: that file is the
 * standalone MMO server's route and is pinned by server/tests/* to its own
 * store (server/data/characters.json + sparksCore). Mounting it in the
 * production server would create a SECOND live balance store alongside
 * economy-service — the exact five-ledgers disagreement this fix removes.
 * This adapter exposes the same /sparks/* HTTP shape (same paths, same
 * x-user-id auth, same vendor catalog and earn allow-list — no prices
 * changed) over economy-service, so the game client
 * (public/sparks-ledger.js) reads the same ledger as the dashboard header
 * (public/shd-sparks.js -> /api/economy/balance) and the City panel.
 *
 * Unit convention (economy-service.js): the stored integer is ledger
 * UNITS, 100 units = 1 Spark. This API speaks whole Sparks (as the old
 * MMO routes did) and converts at the boundary: balance/amounts in
 * Sparks, balance_units alongside for auditing. 0.1 Sparks = 10 units.
 *
 *   GET  /sparks/balance          -> { balance (Sparks), balance_units, mode }
 *   POST /sparks/spend            { amount (whole Sparks), kind, note }
 *   POST /sparks/earn             { amount, kind, note } (allow-listed kinds, caps)
 *   GET  /sparks/vendor/catalog   -> server catalog (prices are the server's)
 *   POST /sparks/vendor/buy       { vendorId, itemId }
 *   GET  /sparks/ledger?limit=    -> this user's recent entries (newest first)
 *   GET  /sparks/summary          -> minted / burned / net by kind
 *
 * Guests ('guest-*', 'local', empty) get NO server wallet (401), same as
 * the MMO routes — they stay on the local cache in the client.
 */
const express = require('express');
const crypto = require('crypto');
const {
  getDefault,
  InsufficientFundsError,
  ValidationError,
  UNITS_PER_SPARK,
  unitsToSparks
} = require('./economy-service');

const SIGNUP_SPARKS = 100; // starting Sparks, once per user (unchanged from the MMO routes)

/* same rule as cloudUid() (server/sparksRoutes.js, game.html:2258): real ids only */
function cloudUid(req) {
  const u = String(req.headers['x-user-id'] || '').trim();
  if (!u || u.length > 128 || u === 'local' || u.indexOf('guest') === 0) return null;
  return u;
}
function auth(req, res, next) {
  const uid = cloudUid(req);
  if (!uid) return res.status(401).json({ success: false, error: 'Sign in to use the server wallet (guests stay on the local cache)', guest: true });
  req.uid = uid; next();
}

/* faucet allow-list: what a client may CLAIM from a game it just finished.
   Unchanged from server/sparksRoutes.js (whole Sparks). */
const EARN_RULES = { tactics: { perCall: 100, perDay: 400 }, arena: { perCall: 200, perDay: 800 }, arcade: { perCall: 50, perDay: 300 }, soccer: { perCall: 150, perDay: 600 } };

/* Colosseum concessions — the ONLY place prices exist (Sparks only).
   Unchanged from server/sparksRoutes.js. */
const VENDOR_CATALOG = {
  nachos:   { name: 'Arena Nachos',   price: 8,  kind: 'food',  item: 'snack_nachos' },
  hotdog:   { name: 'Gladiator Dog',  price: 5,  kind: 'food',  item: 'snack_hotdog' },
  soda:     { name: 'Neon Soda',      price: 3,  kind: 'drink', item: 'drink_soda' },
  nectar:   { name: 'Spark Nectar',   price: 6,  kind: 'drink', item: 'drink_nectar' },
  scarf:    { name: 'Team Scarf',     price: 25, kind: 'merch', item: 'merch_scarf' },
  foamhand: { name: 'Foam Hand',      price: 12, kind: 'merch', item: 'merch_foamhand' },
  program:  { name: 'Match Program',  price: 4,  kind: 'score', item: 'misc_program' },
};

function amt(v, max) { const n = Math.floor(Number(v)); return isFinite(n) && n >= 1 && n <= (max || 100000) ? n : 0; }
function newKey() { return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)); }

function createRouter(serviceOverride) {
  const router = express.Router();
  const svc = serviceOverride || getDefault();
  const json = express.json({ limit: '4kb' });

  // Idempotent once-per-user signup grant (replay-safe: a second call for
  // the same user returns replayed=true and grants nothing).
  async function ensureSignup(uid) {
    try { await svc.grantSparks(uid, SIGNUP_SPARKS, 'signup-grant', 'sparks-signup:' + uid); }
    catch (e) { /* grantSparks only throws on validation; the key is valid */ }
  }
  async function balanceOf(uid) {
    const units = await svc.getBalance(uid);
    return { units, sparks: unitsToSparks(units) };
  }
  // Sparks a user earned today from one faucet kind (server-side daily caps).
  async function earnedToday(uid, kind) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const txs = await svc.getTransactions(uid, 1000);
    return txs
      .filter((t) => t.reason === 'earn:' + kind && new Date(t.created_at).getTime() >= start.getTime() && Number(t.amount) > 0)
      .reduce((s, t) => s + Number(t.amount), 0) / UNITS_PER_SPARK;
  }

  function sendError(res, err) {
    if (err instanceof InsufficientFundsError) return res.status(400).json({ success: false, error: err.message, code: err.code });
    if (err instanceof ValidationError) return res.status(400).json({ success: false, error: err.message, code: err.code });
    console.error('[sparks-adapter] unexpected error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }

  router.get('/balance', auth, async (req, res) => {
    try {
      await ensureSignup(req.uid);
      const b = await balanceOf(req.uid);
      res.json({ success: true, balance: b.sparks, balance_units: b.units, characterId: null, mode: 'server' });
    } catch (e) { sendError(res, e); }
  });

  router.post('/spend', auth, json, async (req, res) => {
    try {
      const n = amt(req.body && req.body.amount); if (!n) return res.status(400).json({ success: false, error: 'Bad amount' });
      await ensureSignup(req.uid);
      const b0 = await balanceOf(req.uid);
      if (b0.sparks < n) return res.status(400).json({ success: false, error: 'Insufficient Sparks', balance: b0.sparks, balance_units: b0.units });
      const r = await svc.spendSparks(req.uid, n, 'spend:' + String((req.body && req.body.kind) || 'misc').slice(0, 24), 'sparks-spend:' + req.uid + ':' + newKey());
      const b = unitsToSparks(r.balance);
      res.json({ success: true, balance: b, balance_units: r.balance });
    } catch (e) { sendError(res, e); }
  });

  router.post('/earn', auth, json, async (req, res) => {
    try {
      const kind = String((req.body && req.body.kind) || ''); const rule = EARN_RULES[kind];
      if (!rule) return res.status(403).json({ success: false, error: 'Not a client-claimable faucet', kind });
      const n = amt(req.body && req.body.amount, rule.perCall); if (!n) return res.status(400).json({ success: false, error: 'Amount outside 1..' + rule.perCall });
      await ensureSignup(req.uid);
      const today = await earnedToday(req.uid, kind);
      if (today + n > rule.perDay) {
        const b = await balanceOf(req.uid);
        return res.status(429).json({ success: false, error: 'Daily cap reached for ' + kind, cap: rule.perDay, balance: b.sparks, balance_units: b.units });
      }
      const r = await svc.grantSparks(req.uid, n, 'earn:' + kind, 'sparks-earn:' + req.uid + ':' + newKey());
      res.json({ success: true, balance: unitsToSparks(r.balance), balance_units: r.balance, earnedToday: today + n, cap: rule.perDay });
    } catch (e) { sendError(res, e); }
  });

  router.get('/vendor/catalog', (req, res) => res.json({ success: true, catalog: VENDOR_CATALOG }));
  router.post('/vendor/buy', auth, json, async (req, res) => {
    try {
      const { vendorId, itemId } = req.body || {}; const it = VENDOR_CATALOG[itemId];
      if (!vendorId || !it) return res.status(400).json({ success: false, error: 'Unknown item' });
      await ensureSignup(req.uid);
      const b0 = await balanceOf(req.uid);
      if (b0.sparks < it.price) return res.status(400).json({ success: false, error: 'Insufficient Sparks', price: it.price, balance: b0.sparks, balance_units: b0.units });
      const r = await svc.spendSparks(req.uid, it.price, 'vendor:' + it.kind, 'sparks-vendor:' + req.uid + ':' + newKey());
      await svc.grantItem(req.uid, it.item, 1, 'sparks-vendor-item:' + req.uid + ':' + newKey());
      res.json({ success: true, balance: unitsToSparks(r.balance), balance_units: r.balance, item: it.item, name: it.name, price: it.price });
    } catch (e) { sendError(res, e); }
  });

  router.get('/ledger', auth, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      const txs = await svc.getTransactions(req.uid, limit);
      res.json({ success: true, entries: txs.map((t) => ({ kind: t.reason, delta: unitsToSparks(t.amount), delta_units: Number(t.amount), ts: t.created_at ? new Date(t.created_at).getTime() : undefined, ref: t.ref_id || undefined })) });
    } catch (e) { sendError(res, e); }
  });

  router.get('/summary', async (req, res) => {
    try {
      const s = await svc.getSummary();
      const byKind = {};
      for (const [k, v] of Object.entries(s.byKind || {})) {
        byKind[k] = { count: v.count, delta: unitsToSparks(v.delta), minted: unitsToSparks(v.minted), burned: unitsToSparks(v.burned) };
      }
      res.json({ success: true, summary: { entries: s.entries, minted: unitsToSparks(s.minted), burned: unitsToSparks(s.burned), net: unitsToSparks(s.net), byKind } });
    } catch (e) { sendError(res, e); }
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
module.exports.VENDOR_CATALOG = VENDOR_CATALOG;
module.exports.EARN_RULES = EARN_RULES;
module.exports.cloudUid = cloudUid;
