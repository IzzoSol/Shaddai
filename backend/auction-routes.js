'use strict';
/**
 * auction-routes.js — Timed Sparks auctions for unclaimed Founders Row plots.
 * When a plot is released (no owner) it can be listed for auction. Highest Sparks
 * bid wins at end of timer. 2% of winning bid goes to the burn pool; 1% to staking pool.
 *
 * Routes (mount at /api/auction):
 *   GET  /             → all active auctions
 *   POST /list         { uid, slot, startPrice, durationHours } → start auction (admin or plot owner)
 *   POST /bid          { uid, slot, amount }  → place bid
 *   POST /settle/:slot → settle expired auction (anyone can call)
 *   GET  /plot/:slot   → auction state for a plot
 *   GET  /history      → recent settled auctions
 *
 * Storage: backend/data/auctions.json
 */

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();
const json     = express.json();

const DATA_DIR     = path.join(__dirname, 'data');
const AUCTION_FILE = path.join(DATA_DIR, 'auctions.json');
const BURN_PCT     = 0.02;   // 2% of winning bid burned
const STAKE_PCT    = 0.01;   // 1% of winning bid to staking pool

function load() {
  try { return JSON.parse(fs.readFileSync(AUCTION_FILE, 'utf8')); }
  catch (_) { return { active: {}, history: [] }; }
}
function save(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUCTION_FILE, JSON.stringify(state, null, 2));
}

// Credit staking pool (fire-and-forget HTTP to own server)
function creditStakePool(amount, ref) {
  try {
    const http = require('http');
    const body = JSON.stringify({ amount, ref });
    const req = http.request({ host: 'localhost', port: process.env.PORT || 3000, path: '/api/stake/pool/credit', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    req.write(body); req.end();
  } catch (_) {}
}

// GET /api/auction — all active
router.get('/', (req, res) => {
  const state  = load();
  const now    = Date.now();
  const active = Object.values(state.active).filter(a => a.endsAt > now);
  res.json({ ok: true, auctions: active });
});

// POST /api/auction/list — start a timed auction
router.post('/list', json, (req, res) => {
  const { uid, slot, startPrice = 100, durationHours = 24 } = req.body || {};
  if (!uid || slot === undefined) return res.status(400).json({ ok: false, error: 'uid and slot required' });
  const s = Number(slot);
  if (!Number.isFinite(s) || s < 0 || s > 29) return res.status(400).json({ ok: false, error: 'slot must be 0-29' });
  const dur = Math.min(168, Math.max(1, Number(durationHours) || 24)); // 1h-7d

  const state = load();
  if (state.active[s] && state.active[s].endsAt > Date.now()) {
    return res.status(409).json({ ok: false, error: 'auction already active for this slot' });
  }

  const auction = {
    slot: s, listedBy: uid, startPrice: Number(startPrice) || 100,
    highBid: 0, highBidder: null, bids: [],
    startedAt: Date.now(), endsAt: Date.now() + dur * 3600 * 1000,
    durationHours: dur, settled: false
  };
  state.active[s] = auction;
  save(state);
  res.json({ ok: true, auction });
});

// POST /api/auction/bid — place a bid
router.post('/bid', json, (req, res) => {
  const { uid, slot, amount } = req.body || {};
  if (!uid || slot === undefined || !amount) return res.status(400).json({ ok: false, error: 'uid, slot, amount required' });
  const s   = Number(slot);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ ok: false, error: 'invalid amount' });

  const state   = load();
  const auction = state.active[s];
  if (!auction) return res.status(404).json({ ok: false, error: 'no active auction for slot ' + s });
  if (auction.endsAt < Date.now()) return res.status(410).json({ ok: false, error: 'auction ended — call /settle/' + s });
  if (amt <= auction.highBid) return res.status(400).json({ ok: false, error: 'bid must exceed current high bid of ' + auction.highBid });
  if (amt < auction.startPrice) return res.status(400).json({ ok: false, error: 'minimum bid is ' + auction.startPrice });

  // Extend auction by 5 minutes if bid placed in last 10 minutes (anti-sniping)
  const remaining = auction.endsAt - Date.now();
  if (remaining < 600000) auction.endsAt = Date.now() + 300000;

  auction.highBid    = amt;
  auction.highBidder = uid;
  auction.bids.push({ uid, amount: amt, ts: Date.now() });
  if (auction.bids.length > 200) auction.bids = auction.bids.slice(-200);
  save(state);
  res.json({ ok: true, highBid: auction.highBid, highBidder: uid, endsAt: auction.endsAt });
});

// POST /api/auction/settle/:slot — settle an ended auction
router.post('/settle/:slot', async (req, res) => {
  const s = parseInt(req.params.slot, 10);
  const state   = load();
  const auction = state.active[s];
  if (!auction) return res.status(404).json({ ok: false, error: 'no auction for slot ' + s });
  if (auction.endsAt > Date.now()) return res.status(400).json({ ok: false, error: 'auction still running — ' + Math.ceil((auction.endsAt - Date.now()) / 60000) + ' min left' });
  if (auction.settled) return res.json({ ok: true, already: true, auction });

  auction.settled   = true;
  auction.settledAt = Date.now();

  let burnAmt = 0, stakeAmt = 0;
  if (auction.highBidder && auction.highBid > 0) {
    burnAmt  = Math.max(1, Math.floor(auction.highBid * BURN_PCT));
    stakeAmt = Math.max(1, Math.floor(auction.highBid * STAKE_PCT));
    auction.burnedAmount = burnAmt;
    auction.stakeAmount  = stakeAmt;
    auction.netToWinner  = auction.highBid; // winner gets the plot; they paid the sparks
    // Credit staking pool
    creditStakePool(stakeAmt, 'auction-settle-slot-' + s);
  }

  // Move to history
  state.history = state.history || [];
  state.history.unshift(auction);
  if (state.history.length > 100) state.history = state.history.slice(0, 100);
  delete state.active[s];
  save(state);

  res.json({ ok: true, settled: true, winner: auction.highBidder, winningBid: auction.highBid, burnAmt, stakeAmt, slot: s });
});

// GET /api/auction/plot/:slot
router.get('/plot/:slot', (req, res) => {
  const s     = parseInt(req.params.slot, 10);
  const state = load();
  const a     = state.active[s];
  if (!a) return res.json({ ok: true, active: false, slot: s });
  res.json({ ok: true, active: a.endsAt > Date.now(), auction: a, timeLeft: Math.max(0, a.endsAt - Date.now()) });
});

// GET /api/auction/history
router.get('/history', (req, res) => {
  const state = load();
  res.json({ ok: true, history: (state.history || []).slice(0, 20) });
});

module.exports = router;
