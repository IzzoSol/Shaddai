/* ══════════════════════════════════════════════════════════════════════════
   public-api-routes.js — the PUBLIC developer API, mounted at /api/v1.
   Clean JSON over the signals data. Free API keys + per-key rate limiting.
   Read-only; no admin/config/broadcast here (those stay on /api/telegram/*).
   Envelope: { ok:true, data:… } | { ok:false, error:"…" }.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router = express.Router();
const keys = require('./api-keys');
const pnl = require('./telegram-pnl');

// Permissive CORS — this namespace is a public read API, so browser apps can call it.
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function _extractKey(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return (m && m[1].trim()) || req.query.key || '';
}

// Auth + rate-limit gate for the read endpoints.
function requireKey(req, res, next) {
  const rec = keys.validate(_extractKey(req));
  if (!rec) return res.status(401).json({ ok: false, error: 'invalid or missing API key — get a free one at /api' });
  const rl = keys.rateCheck(rec);
  res.set('X-RateLimit-Limit', String(rl.limit));
  res.set('X-RateLimit-Remaining', String(rl.remaining));
  res.set('X-RateLimit-Reset', String(rl.reset));
  if (!rl.ok) return res.status(429).json({ ok: false, error: 'rate limit exceeded — free tier is ' + rl.limit + '/min, ' + rl.perDay + '/day' });
  keys.recordUse(rec);
  req.apiKey = rec;
  next();
}

// ── key minting (no key required; throttled per IP) ─────────────────────────
router.post('/keys', express.json({ limit: '2kb' }), (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  if (!keys.mintAllowed(ip)) return res.status(429).json({ ok: false, error: 'too many keys created from this IP — try again later' });
  const label = (req.body && (req.body.label || req.body.email)) || '';
  const minted = keys.mint(label);
  res.json({ ok: true, key: minted.key, id: minted.id, tier: minted.tier, note: 'Save this key now — it is shown only once.' });
});

router.get('/me', requireKey, (req, res) => res.json({ ok: true, data: keys.info(req.apiKey) }));

// ── read endpoints ──────────────────────────────────────────────────────────
router.get('/calls', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.callsJson({ limit: req.query.limit, since: req.query.since, chain: req.query.chain, source: req.query.source }) }));

router.get('/leaderboard', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.leaderboardJson({ limit: req.query.limit, period: req.query.period }) }));

router.get('/stats', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.statsJson() }));

router.get('/token/:q', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.findTokenJson(req.params.q) }));

module.exports = router;
