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
  // Responses carry keys/usage — never let intermediaries cache them.
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Generous per-IP DoS backstop for the WHOLE namespace (authed traffic is also
// limited per-key below; this stops unauthenticated floods and key-guessing).
// Uses req.ip (trusted under `trust proxy`), bounded/self-evicting map.
const _ipHits = new Map();
router.use((req, res, next) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  if (_ipHits.size > 50000) { for (const [k, w] of _ipHits) if (now - w.start >= 60000) _ipHits.delete(k); }
  let w = _ipHits.get(ip);
  if (!w) { w = { start: now, count: 0 }; _ipHits.set(ip, w); }
  if (now - w.start >= 60000) { w.start = now; w.count = 0; }
  w.count++;
  if (w.count > 240) return res.status(429).json({ ok: false, error: 'rate limit exceeded (per-IP) — slow down' });
  next();
});

// Admin gate. Open in dev when unset, but FAIL-CLOSED in production so the revoke
// route is never world-callable on Render without an ADMIN_TOKEN configured.
function _adminOk(req) {
  const need = process.env.ADMIN_TOKEN || '';
  if (!need) return process.env.NODE_ENV !== 'production';
  const got = req.headers['x-admin-token'] || (req.body && req.body.adminToken) || '';
  return got && got === need;
}

// Key comes ONLY from the Authorization header — never a query param, which would
// leak the credential into access logs, proxy logs, and Referer headers.
function _extractKey(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return (m && m[1].trim()) || '';
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
  // req.ip is the trusted client IP (Express resolves it via `trust proxy`). Do NOT
  // read X-Forwarded-For directly — it is attacker-controlled and would let a caller
  // mint unlimited keys by rotating fake IPs, defeating all per-key rate limits.
  const ip = req.ip || 'unknown';
  if (!keys.mintAllowed(ip)) return res.status(429).json({ ok: false, error: 'too many keys created from this IP — try again later' });
  const label = (req.body && (req.body.label || req.body.email)) || '';
  const minted = keys.mint(label);
  if (!minted) return res.status(503).json({ ok: false, error: 'key capacity reached — please try again later' });
  res.json({ ok: true, key: minted.key, id: minted.id, tier: minted.tier, note: 'Save this key now — it is shown only once.' });
});

router.get('/me', requireKey, (req, res) => res.json({ ok: true, data: keys.info(req.apiKey) }));

// Revoke a key (admin only) — kill a leaked/abusive key by id or raw value.
router.post('/keys/:id/revoke', express.json({ limit: '2kb' }), (req, res) => {
  if (!_adminOk(req)) return res.status(401).json({ ok: false, error: 'admin token required' });
  const revoked = keys.revoke(req.params.id);
  res.json({ ok: revoked, revoked });
});

// ── read endpoints ──────────────────────────────────────────────────────────
router.get('/calls', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.callsJson({ limit: req.query.limit, since: req.query.since, chain: req.query.chain, source: req.query.source }) }));

router.get('/leaderboard', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.leaderboardJson({ limit: req.query.limit, period: req.query.period }) }));

router.get('/stats', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.statsJson() }));

router.get('/token/:q', requireKey, (req, res) =>
  res.json({ ok: true, data: pnl.findTokenJson(String(req.params.q || '').slice(0, 64)) }));

module.exports = router;
