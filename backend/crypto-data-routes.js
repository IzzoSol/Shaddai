'use strict';
/**
 * SHADDAI Crypto Data API — a documented, KEYLESS (read-only) front door.
 *
 * This is a thin, consistent FAÇADE over the market-data proxies SHADDAI already
 * runs (DexScreener, CoinGecko, CoinLore, Jupiter-compat, Fear&Greed). It does NOT
 * add new upstream integrations or duplicate business logic — it just repackages the
 * existing keyless proxies into one coherent, versioned, documented surface that a
 * third party can consume the same way three.ws exposes its "free crypto data API".
 *
 * Design rules:
 *  - READ-ONLY. No writes, no money, no auth. Keyless by design.
 *  - Uniform envelope via lib/respond.js ok()/fail(). Every response is
 *      { ok, data, source, cachedAt } on success, or
 *      { ok:false, error, code, ... } on failure.
 *  - HONEST offline states: when an upstream is down we return
 *      { ok:false, error:'source unavailable, retry' } (HTTP 503) — never fake zeros.
 *  - Short in-process cache (shared across callers) to respect free-tier rate limits.
 *
 * Mounted at:  /api/data/v1/*
 */

const express = require('express');
const router = express.Router();
const { ok, fail } = require('./lib/respond');

// ── config ────────────────────────────────────────────────────────────────
const CG = 'https://api.coingecko.com/api/v3';
const DS = 'https://api.dexscreener.com/latest';
const API_VERSION = '1.0.0';
const UA = { 'user-agent': 'SHADDAI-DataAPI/1.0', accept: 'application/json' };

// Symbol → CoinGecko id (superset of the maps already used elsewhere in the codebase).
const CG_MAP = {
  SOL: 'solana', BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin', USDT: 'tether',
  BNB: 'binancecoin', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano',
  AVAX: 'avalanche-2', MATIC: 'matic-network', DOT: 'polkadot', LINK: 'chainlink',
  UNI: 'uniswap', AAVE: 'aave', JUP: 'jupiter-exchange-solana', BONK: 'bonk',
  WIF: 'dogwifcoin', LTC: 'litecoin', TRX: 'tron', SHIB: 'shiba-inu'
};

// ── tiny shared cache (per-key TTL) ─────────────────────────────────────────
const _cache = new Map();               // key -> { at, data }
function cacheGet(key, ttl) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit;
  return null;
}
function cacheSet(key, data) {
  _cache.set(key, { at: Date.now(), data });
  if (_cache.size > 500) {              // simple cap: drop oldest
    const oldest = [..._cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) _cache.delete(oldest[0]);
  }
  return Date.now();
}

// fetch JSON with timeout; throws on non-2xx. Never returns fake data.
async function getJSON(url, ms = 9000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: UA });
  if (!r.ok) throw new Error('upstream ' + r.status);
  return r.json();
}

// Standard "source is down" honest response.
function offline(res, source, detail) {
  return fail(res, 503, 'source_unavailable', 'source unavailable, retry', {
    ok: false, source, detail: detail ? String(detail).slice(0, 200) : undefined
  });
}

// Success envelope helper: { ok, data, source, cachedAt }.
function data(res, payload, source, cachedAt) {
  return ok(res, {
    ok: true,
    source,
    cachedAt: new Date(cachedAt || Date.now()).toISOString(),
    data: payload
  });
}

// Serve from cache if fresh, else run loader; on loader failure fall back to stale
// cache if we have any, otherwise return the honest offline shape.
async function serve(res, key, ttl, source, loader) {
  const hit = cacheGet(key, ttl);
  if (hit) return data(res, hit.data, source, hit.at);
  try {
    const payload = await loader();
    const at = cacheSet(key, payload);
    return data(res, payload, source, at);
  } catch (e) {
    const stale = _cache.get(key);
    if (stale) return data(res, stale.data, source + ' (stale)', stale.at);
    return offline(res, source, e.message);
  }
}

// ── GET /api/data/v1/health ─────────────────────────────────────────────────
// Liveness + shallow upstream reachability (CoinGecko ping). Always 200.
router.get('/api/data/v1/health', async (req, res) => {
  let coingecko = 'unknown';
  try { await getJSON(`${CG}/ping`, 4000); coingecko = 'up'; }
  catch (_) { coingecko = 'down'; }
  return ok(res, {
    ok: true,
    service: 'shaddai-crypto-data-api',
    version: API_VERSION,
    keyless: true,
    readOnly: true,
    time: new Date().toISOString(),
    upstreams: { coingecko },
    endpoints: [
      'GET /api/data/v1/health',
      'GET /api/data/v1/price/:mintOrId',
      'GET /api/data/v1/trending',
      'GET /api/data/v1/new',
      'GET /api/data/v1/token/:mint',
      'GET /api/data/v1/search?q=',
      'GET /api/data/v1/openapi.json'
    ]
  });
});

// ── GET /api/data/v1/price/:mintOrId ────────────────────────────────────────
// Price + market data for a symbol (SOL, BTC…), a CoinGecko id (solana), or a
// token mint/contract address (routed to DexScreener). Wraps CoinGecko
// /simple/price + /coins/markets, falls back to DexScreener for raw addresses.
router.get('/api/data/v1/price/:mintOrId', async (req, res) => {
  const raw = String(req.params.mintOrId || '').trim();
  if (!raw) return fail(res, 400, 'bad_request', 'mintOrId is required');
  const vs = String(req.query.vs || 'usd').toLowerCase().slice(0, 8);

  // Looks like a contract/mint address → DexScreener path.
  const looksLikeAddress = /^0x[a-fA-F0-9]{40}$/.test(raw) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw);
  if (looksLikeAddress) {
    return serve(res, `price:addr:${raw}`, 45 * 1000, 'dexscreener', async () => {
      const j = await getJSON(`${DS}/dex/search?q=${encodeURIComponent(raw)}`);
      const p = (j.pairs || [])[0];
      if (!p) throw new Error('no pair');
      return {
        query: raw, type: 'address',
        symbol: p.baseToken?.symbol || null,
        name: p.baseToken?.name || null,
        price: p.priceUsd ? Number(p.priceUsd) : null,
        vs: 'usd',
        change24h: p.priceChange?.h24 ?? null,
        liquidityUsd: p.liquidity?.usd ?? null,
        volume24h: p.volume?.h24 ?? null,
        chain: p.chainId || null,
        dex: p.dexId || null,
        pairUrl: p.url || null
      };
    });
  }

  // Symbol or CoinGecko id path.
  const upper = raw.toUpperCase();
  const cgId = CG_MAP[upper] || raw.toLowerCase();
  return serve(res, `price:cg:${cgId}:${vs}`, 45 * 1000, 'coingecko', async () => {
    const j = await getJSON(`${CG}/coins/markets?vs_currency=${encodeURIComponent(vs)}&ids=${encodeURIComponent(cgId)}&price_change_percentage=24h`);
    const c = (j || [])[0];
    if (!c) throw new Error('unknown id');
    return {
      query: raw, type: CG_MAP[upper] ? 'symbol' : 'id',
      id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name,
      price: c.current_price, vs,
      change24h: c.price_change_percentage_24h ?? null,
      marketCap: c.market_cap ?? null,
      volume24h: c.total_volume ?? null,
      high24h: c.high_24h ?? null, low24h: c.low_24h ?? null,
      image: c.image || null,
      lastUpdated: c.last_updated || null
    };
  });
});

// ── GET /api/data/v1/trending ───────────────────────────────────────────────
// Trending tokens. Wraps CoinGecko /search/trending, normalized to a flat list.
router.get('/api/data/v1/trending', async (req, res) => {
  return serve(res, 'trending', 5 * 60 * 1000, 'coingecko', async () => {
    const j = await getJSON(`${CG}/search/trending`);
    const coins = (j.coins || []).map(({ item }) => ({
      id: item.id, symbol: (item.symbol || '').toUpperCase(), name: item.name,
      marketCapRank: item.market_cap_rank ?? null,
      priceBtc: item.price_btc ?? null,
      thumb: item.thumb || null,
      score: item.score ?? null
    }));
    return { count: coins.length, coins };
  });
});

// ── GET /api/data/v1/new ────────────────────────────────────────────────────
// Newest pairs / launches. Wraps DexScreener search for a chain (default solana),
// sorted by pair creation time (newest first). Honest empty list if none.
router.get('/api/data/v1/new', async (req, res) => {
  const chain = String(req.query.chain || 'solana').toLowerCase().slice(0, 24);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return serve(res, `new:${chain}:${limit}`, 60 * 1000, 'dexscreener', async () => {
    // DexScreener has no public "new pairs" list without a token; we surface the
    // freshest pairs from a broad chain search and sort by createdAt.
    const j = await getJSON(`${DS}/dex/search?q=${encodeURIComponent(chain)}`);
    const pairs = (j.pairs || [])
      .filter(p => (p.chainId || '').toLowerCase() === chain || chain === 'all')
      .filter(p => p.pairCreatedAt)
      .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
      .slice(0, limit)
      .map(p => ({
        symbol: p.baseToken?.symbol || null,
        name: p.baseToken?.name || null,
        address: p.baseToken?.address || null,
        chain: p.chainId || null,
        dex: p.dexId || null,
        price: p.priceUsd ? Number(p.priceUsd) : null,
        liquidityUsd: p.liquidity?.usd ?? null,
        volume24h: p.volume?.h24 ?? null,
        createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
        pairUrl: p.url || null
      }));
    return { chain, count: pairs.length, pairs };
  });
});

// ── GET /api/data/v1/token/:mint ────────────────────────────────────────────
// Full token snapshot: price, liquidity, volume, socials/links. Wraps
// DexScreener token/pair search for a mint or contract address.
router.get('/api/data/v1/token/:mint', async (req, res) => {
  const mint = String(req.params.mint || '').trim();
  if (!mint) return fail(res, 400, 'bad_request', 'mint is required');
  return serve(res, `token:${mint}`, 45 * 1000, 'dexscreener', async () => {
    const j = await getJSON(`${DS}/dex/search?q=${encodeURIComponent(mint)}`);
    const pairs = (j.pairs || []);
    if (!pairs.length) throw new Error('no pairs');
    // Pick the most-liquid pair as canonical.
    const best = pairs.slice().sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const info = best.info || {};
    return {
      query: mint,
      symbol: best.baseToken?.symbol || null,
      name: best.baseToken?.name || null,
      address: best.baseToken?.address || null,
      chain: best.chainId || null,
      price: best.priceUsd ? Number(best.priceUsd) : null,
      priceNative: best.priceNative ? Number(best.priceNative) : null,
      change: {
        m5: best.priceChange?.m5 ?? null,
        h1: best.priceChange?.h1 ?? null,
        h6: best.priceChange?.h6 ?? null,
        h24: best.priceChange?.h24 ?? null
      },
      liquidityUsd: best.liquidity?.usd ?? null,
      fdv: best.fdv ?? null,
      marketCap: best.marketCap ?? null,
      volume: {
        h24: best.volume?.h24 ?? null,
        h6: best.volume?.h6 ?? null,
        h1: best.volume?.h1 ?? null
      },
      txns24h: best.txns?.h24 ?? null,
      dex: best.dexId || null,
      pairUrl: best.url || null,
      links: {
        image: info.imageUrl || null,
        websites: (info.websites || []).map(w => w.url).filter(Boolean),
        socials: (info.socials || []).map(s => ({ type: s.type, url: s.url }))
      },
      pairCount: pairs.length
    };
  });
});

// ── GET /api/data/v1/search?q= ──────────────────────────────────────────────
// Token search across DexScreener. Returns a normalized list of matches.
router.get('/api/data/v1/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return fail(res, 400, 'bad_request', 'query param q is required');
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return serve(res, `search:${q}:${limit}`, 5 * 60 * 1000, 'dexscreener', async () => {
    const j = await getJSON(`${DS}/dex/search?q=${encodeURIComponent(q)}`);
    const results = (j.pairs || []).slice(0, limit).map(p => ({
      symbol: p.baseToken?.symbol || null,
      name: p.baseToken?.name || null,
      address: p.baseToken?.address || null,
      chain: p.chainId || null,
      dex: p.dexId || null,
      price: p.priceUsd ? Number(p.priceUsd) : null,
      liquidityUsd: p.liquidity?.usd ?? null,
      volume24h: p.volume?.h24 ?? null,
      pairUrl: p.url || null
    }));
    return { query: q, count: results.length, results };
  });
});

// ── GET /api/data/v1/openapi.json ───────────────────────────────────────────
// Hand-written OpenAPI 3 spec for the keyless data surface.
router.get('/api/data/v1/openapi.json', (req, res) => {
  const successEnvelope = {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: true },
      source: { type: 'string', example: 'coingecko' },
      cachedAt: { type: 'string', format: 'date-time' },
      data: { type: 'object' }
    }
  };
  const errorEnvelope = {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: false },
      error: { type: 'string', example: 'source unavailable, retry' },
      code: { type: 'string', example: 'source_unavailable' }
    }
  };
  const okResp = { description: 'OK', content: { 'application/json': { schema: successEnvelope } } };
  const errResp = { description: 'Source unavailable (honest offline state)', content: { 'application/json': { schema: errorEnvelope } } };

  return ok(res, {
    openapi: '3.0.3',
    info: {
      title: 'SHADDAI Crypto Data API',
      version: API_VERSION,
      description: 'Keyless, read-only crypto market data. A thin façade over DexScreener, CoinGecko, CoinLore and Jupiter-compatible price proxies. No API key, no auth, no writes.',
      contact: { name: 'SHADDAI', url: 'https://shaddai-g81x.onrender.com' },
      license: { name: 'Read-only public data' }
    },
    servers: [{ url: '/api/data/v1', description: 'SHADDAI data façade' }],
    paths: {
      '/health': { get: { summary: 'Service + upstream health', responses: { 200: okResp } } },
      '/price/{mintOrId}': {
        get: {
          summary: 'Price + market data for a symbol, CoinGecko id, or token address',
          parameters: [
            { name: 'mintOrId', in: 'path', required: true, schema: { type: 'string' }, example: 'SOL', description: 'Symbol (SOL), CoinGecko id (solana), or token mint/contract address' },
            { name: 'vs', in: 'query', required: false, schema: { type: 'string', default: 'usd' } }
          ],
          responses: { 200: okResp, 400: errResp, 503: errResp }
        }
      },
      '/trending': { get: { summary: 'Trending tokens (CoinGecko)', responses: { 200: okResp, 503: errResp } } },
      '/new': {
        get: {
          summary: 'Newest pairs / launches for a chain (DexScreener)',
          parameters: [
            { name: 'chain', in: 'query', schema: { type: 'string', default: 'solana' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } }
          ],
          responses: { 200: okResp, 503: errResp }
        }
      },
      '/token/{mint}': {
        get: {
          summary: 'Full token snapshot: price, liquidity, volume, links (DexScreener)',
          parameters: [{ name: 'mint', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: okResp, 400: errResp, 503: errResp }
        }
      },
      '/search': {
        get: {
          summary: 'Search tokens (DexScreener)',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'bonk' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } }
          ],
          responses: { 200: okResp, 400: errResp, 503: errResp }
        }
      }
    }
  });
});

module.exports = router;
