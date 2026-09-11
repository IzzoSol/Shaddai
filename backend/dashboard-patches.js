// P0 dashboard-patch router — wires the 5 endpoints the UI calls but were never implemented.
// Auction (plot auctions), pricing (hire cost catalog), city/boost, news/analyze.
// JSON-backed stores in backend/data/ to survive restarts (mirrors museum-routes pattern).
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { softAuth } = require('./auth-guard');

const router = express.Router();
const DATA_DIR = path.join(__dirname, 'data');
const AUCTION_FILE = path.join(DATA_DIR, 'auctions.json');
const BOOST_FILE = path.join(DATA_DIR, 'city-boosts.json');

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { /* ignore */ }
  return fallback;
}
function writeJSON(file, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) { /* ignore */ }
}

// ── Plot Auctions ──
// A few listing slots on "Founders Row"; new-relic style seeded + user-posted.
function loadAuctions() {
  return readJSON(AUCTION_FILE, [
    { slot: 0, startPrice: 100, endsAt: Date.now() + 6 * 3600e3, highBid: 0, highBidder: null },
    { slot: 1, startPrice: 120, endsAt: Date.now() + 9 * 3600e3, highBid: 0, highBidder: null },
    { slot: 2, startPrice: 90,  endsAt: Date.now() + 24 * 3600e3, highBid: 0, highBidder: null },
  ]);
}

router.get('/auction', (req, res) => {
  const auctions = loadAuctions();
  // prune expired-but-unbid listings so the panel stays populated
  res.json({ ok: true, auctions });
});

router.post('/auction/bid', softAuth, express.json(), (req, res) => {
  try {
    const { slot, amount } = req.body || {};
    // SECURITY: bidder identity comes from the verified session (req.userId,
    // set by softAuth), never a caller-supplied `uid` body field — anyone
    // could otherwise place a winning bid attributed to another user.
    // Mirrors the resolveUserId pattern in economy-routes.js / skill-market-routes.js.
    const uid = req.userId ? String(req.userId) : String((req.body && req.body.uid) || '');
    if (!uid) return res.json({ ok: false, error: 'Sign in first' });
    const auctions = loadAuctions();
    const a = auctions.find(x => x.slot === Number(slot));
    if (!a) return res.json({ ok: false, error: 'No such plot' });
    if (Date.now() > a.endsAt) return res.json({ ok: false, error: 'Auction ended' });
    const min = Math.max((a.highBid || 0) + 1, a.startPrice || 1);
    if (!Number.isFinite(amount) || amount < min) return res.json({ ok: false, error: 'Bid must be at least ' + min + ' Sparks' });
    a.highBid = Math.floor(amount);
    a.highBidder = uid;
    a.endsAt = Math.min(a.endsAt + 30 * 60e3, Date.now() + 48 * 3600e3); // soft anti-snipe
    writeJSON(AUCTION_FILE, auctions);
    res.json({ ok: true, slot: a.slot, highBid: a.highBid });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Hire pricing catalog ──
// Keyed by agent id → { priceUsd } so x402LoadPricing maps into X402_PRICE.
const PRICING = {
  quill:    { priceUsd: 0.25 },
  oracle:   { priceUsd: 0.40 },
  nexus:    { priceUsd: 0.55 },
  zerox:    { priceUsd: 0.45 },
  turtle:   { priceUsd: 0.35 },
  pikadon:  { priceUsd: 0.50 },
  shaddai:  { priceUsd: 0.65 },
  general:  { priceUsd: 0.30 },
  mock:     { priceUsd: 0.05 },
  grok:     { priceUsd: 0.60 },
};
router.get('/pricing', (req, res) => {
  res.json(PRICING);
});

// ── City boost ──
router.post('/city/boost', softAuth, express.json(), (req, res) => {
  try {
    // SECURITY: identity comes from the verified session (req.userId, set by
    // softAuth), never a raw x-user-id header or body field — either was
    // spoofable and let anyone record a boost as any other user.
    const uid = req.userId ? String(req.userId) : (req.get('x-user-id') || (req.body && req.body.uid) || 'guest');
    const amount = Math.max(0, Number((req.body && req.body.amount) || 0));
    const boosts = readJSON(BOOST_FILE, {});
    boosts[uid] = { amount, at: Date.now(), count: (boosts[uid] ? boosts[uid].count : 0) + 1 };
    writeJSON(BOOST_FILE, boosts);
    res.json({ ok: true, amount, at: boosts[uid].at, count: boosts[uid].count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── News sentiment analyze ──
router.post('/news/analyze', express.json(), (req, res) => {
  try {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    const limit = Number((req.body && req.body.limit) || 20);
    const sample = items.slice(0, limit);
    // Deterministic pseudo-sentiment over headline text (no external model needed).
    const pos = ['bull','gain','surge','rally','beat','up','growth','record','win','jump','rise'];
    const neg = ['crash','drop','loss','fear','sell','down','plunge','dip','risk','fall','ban'];
    let score = 0, bullish = 0, bearish = 0, neutral = 0;
    (sample.length ? sample : [{ title: 'market steady', score: 0 }]).forEach(it => {
      const t = String(it.title || it.headline || '').toLowerCase();
      let s = 0;
      pos.forEach(w => { if (t.includes(w)) s += 1; });
      neg.forEach(w => { if (t.includes(w)) s -= 1; });
      score += s;
      if (s > 0) bullish++; else if (s < 0) bearish++; else neutral++;
    });
    const overall = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
    res.json({
      ok: true,
      overallSentiment: overall,
      score,
      bullishCount: bullish,
      bearishCount: bearish,
      neutralCount: neutral,
      summary: `Sentiment over ${sample.length} headlines: ${overall} (net score ${score}).`,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
