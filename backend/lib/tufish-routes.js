/**
 * tufish-routes.js — MiroFish Income Engine proxy router
 * Mounts at /api/tufish — proxies free public APIs server-side to avoid
 * browser CORS/rate-limit issues on Render.
 *
 * Mount in server-production.js:
 *   const tufishRouter = require('./lib/tufish-routes');
 *   app.use('/api/tufish', tufishRouter);
 *
 * Endpoints:
 *   GET /api/tufish/polymarket/markets          → clob.polymarket.com/markets
 *   GET /api/tufish/polymarket/events?slug=     → gamma-api.polymarket.com/events?slug=
 *   GET /api/tufish/polymarket/book?token_id=   → clob.polymarket.com/books/:token_id
 *   GET /api/tufish/price?ids=&vs=              → api.coingecko.com simple price
 *
 * All endpoints: read-only market data, no keys, no auth, no trading execution.
 * Responses cached in memory (15–30 s) to respect upstream rate limits.
 */

'use strict';

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

// ── Simple in-memory TTL cache ─────────────────────────────────────────────
const CACHE = new Map();

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { CACHE.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  // Evict if cache grows large (safety valve)
  if (CACHE.size > 200) {
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
  CACHE.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Shared axios instance ──────────────────────────────────────────────────
const http = axios.create({
  timeout: 8000,
  headers: { 'Accept': 'application/json', 'User-Agent': 'MiroFish/4.0 (proxy)' }
});

// ── Helper: send upstream response or cached data ─────────────────────────
async function proxyGet(cacheKey, ttlMs, upstreamUrl, res) {
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data } = await http.get(upstreamUrl);
    cacheSet(cacheKey, data, ttlMs);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json({
      error: 'upstream_error',
      message: err.message,
      upstream: upstreamUrl
    });
  }
}

// ── Whitelist of safe token_id characters (hex / alphanumeric only) ────────
const TOKEN_ID_RE = /^[0-9a-fA-F]{1,128}$/;

// ── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/tufish/polymarket/markets
 * Returns the CLOB market list (cached 30 s).
 */
router.get('/polymarket/markets', async (req, res) => {
  await proxyGet(
    'poly:markets',
    30_000,
    'https://clob.polymarket.com/markets',
    res
  );
});

/**
 * GET /api/tufish/polymarket/events?slug=bitcoin-above-XXXXX-on-YYYYY
 * Fetches a Polymarket event by slug from gamma API (cached 20 s).
 */
router.get('/polymarket/events', async (req, res) => {
  const slug = String(req.query.slug || '').trim();
  // Slug: letters, digits, hyphens only
  if (!slug || !/^[a-zA-Z0-9\-_]{1,200}$/.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug' });
  }
  await proxyGet(
    'poly:event:' + slug,
    20_000,
    'https://gamma-api.polymarket.com/events?slug=' + encodeURIComponent(slug),
    res
  );
});

/**
 * GET /api/tufish/polymarket/book?token_id=<hex>
 * Fetches a single CLOB order book (cached 15 s).
 */
router.get('/polymarket/book', async (req, res) => {
  const tokenId = String(req.query.token_id || '').trim();
  if (!TOKEN_ID_RE.test(tokenId)) {
    return res.status(400).json({ error: 'invalid_token_id' });
  }
  await proxyGet(
    'poly:book:' + tokenId,
    15_000,
    'https://clob.polymarket.com/books/' + tokenId,
    res
  );
});

/**
 * GET /api/tufish/price?ids=bitcoin,ethereum&vs=usd
 * Fetches CoinGecko simple price (cached 20 s, free tier — no key).
 */
router.get('/price', async (req, res) => {
  // Whitelist coin IDs (letters, digits, hyphens) and vs_currencies
  const rawIds = String(req.query.ids || 'bitcoin').toLowerCase();
  const rawVs  = String(req.query.vs  || 'usd').toLowerCase();

  const ids = rawIds.split(',').filter(s => /^[a-z0-9\-]{1,64}$/.test(s)).slice(0, 20).join(',');
  const vs  = rawVs.split(',').filter(s => /^[a-z]{1,10}$/.test(s)).slice(0, 5).join(',');

  if (!ids || !vs) return res.status(400).json({ error: 'invalid_params' });

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`;
  await proxyGet('cg:price:' + ids + ':' + vs, 20_000, url, res);
});

module.exports = router;
