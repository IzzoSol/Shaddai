'use strict';
/**
 * staking-routes.js — Sparks staking pool.
 * 1% of every Bazaar sale flows to the pool (wired in game.html client-side + backend-side).
 * Stakers earn proportional share of the pool when they claim.
 *
 * Routes (mount at /api/stake):
 *   POST /           { uid, amount }  → stake Sparks (client sends Sparks to pool)
 *   GET  /:uid       → { staked, pendingReward, totalPool, share }
 *   POST /claim      { uid }          → claim pending rewards → { claimed, newBalance }
 *   POST /pool/credit { amount, ref } → internal: add to pool (called by Bazaar logic)
 *   GET  /stats      → global pool stats
 *
 * Storage: simple JSON file (backend/data/staking.json) — no DB needed for MVP.
 */

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();
const json     = express.json();

const DATA_FILE = path.join(__dirname, 'data', 'staking.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) { return { pool: 0, totalStaked: 0, stakes: {}, lastUpdated: Date.now() }; }
}
function save(state) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// Compute a user's pending reward: their share of pool * their proportion of total staked
function pendingFor(state, uid) {
  const s = state.stakes[uid];
  if (!s || !s.amount || state.totalStaked <= 0 || state.pool <= 0) return 0;
  // Simple proportional: (userStake / totalStaked) * pool
  return parseFloat(((s.amount / state.totalStaked) * state.pool).toFixed(4));
}

// POST /api/stake — stake Sparks
router.post('/', json, (req, res) => {
  const { uid, amount } = req.body || {};
  if (!uid || typeof uid !== 'string') return res.status(400).json({ ok: false, error: 'uid required' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 1) return res.status(400).json({ ok: false, error: 'amount must be >= 1' });

  const state = load();
  if (!state.stakes[uid]) state.stakes[uid] = { amount: 0, stakedAt: Date.now() };

  // Before changing stake, snapshot the current pending (so it isn't diluted)
  const snap = pendingFor(state, uid);
  state.stakes[uid].pendingSnapshot = (state.stakes[uid].pendingSnapshot || 0) + snap;
  // Remove old proportion from pool accounting
  if (state.stakes[uid].amount > 0) {
    const oldShare = state.stakes[uid].amount / state.totalStaked;
    state.pool = Math.max(0, state.pool - oldShare * state.pool);
    state.totalStaked -= state.stakes[uid].amount;
  }

  state.stakes[uid].amount += amt;
  state.totalStaked += amt;
  state.lastUpdated = Date.now();
  save(state);
  res.json({ ok: true, staked: state.stakes[uid].amount, totalPool: state.pool, totalStaked: state.totalStaked });
});

// GET /api/stake/:uid
router.get('/:uid', (req, res) => {
  const { uid } = req.params;
  const state = load();
  const s = state.stakes[uid] || { amount: 0 };
  const pending = (s.pendingSnapshot || 0) + pendingFor(state, uid);
  const share = state.totalStaked > 0 ? (s.amount / state.totalStaked * 100).toFixed(2) : '0.00';
  res.json({ ok: true, uid, staked: s.amount, pendingReward: parseFloat(pending.toFixed(4)), totalPool: state.pool, totalStaked: state.totalStaked, sharePct: share });
});

// POST /api/stake/claim — pay out pending rewards
router.post('/claim', json, (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ ok: false, error: 'uid required' });

  const state = load();
  const s = state.stakes[uid];
  if (!s || s.amount <= 0) return res.status(400).json({ ok: false, error: 'no active stake' });

  const snap = s.pendingSnapshot || 0;
  const live = pendingFor(state, uid);
  const total = snap + live;
  if (total < 0.01) return res.json({ ok: true, claimed: 0, message: 'nothing to claim yet' });

  // Deduct from pool
  state.pool = Math.max(0, state.pool - live);
  s.pendingSnapshot = 0;
  state.lastUpdated = Date.now();
  save(state);
  res.json({ ok: true, claimed: parseFloat(total.toFixed(4)), remainingPool: state.pool });
});

// POST /api/stake/pool/credit — called internally when Bazaar sales happen (1% fee)
router.post('/pool/credit', json, (req, res) => {
  const { amount, ref } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ ok: false, error: 'amount required' });

  const state = load();
  state.pool += amt;
  state.lastUpdated = Date.now();
  if (!state.log) state.log = [];
  state.log.push({ ts: Date.now(), amount: amt, ref: ref || '' });
  if (state.log.length > 500) state.log = state.log.slice(-500);
  save(state);
  res.json({ ok: true, pool: state.pool });
});

// GET /api/stake/stats
router.get('/stats', (req, res) => {
  const state = load();
  res.json({ pool: state.pool, totalStaked: state.totalStaked, stakers: Object.keys(state.stakes).length, lastUpdated: state.lastUpdated });
});

module.exports = router;
