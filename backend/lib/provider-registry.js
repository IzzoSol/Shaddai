'use strict';
/**
 * provider-registry.js — resilience wrapper for external crypto data APIs.
 * Per named provider: health tracking, token-bucket rate limiting, circuit
 * breaker, and a TTL response cache. Pure Node.js (>=18), zero deps.
 * Fail-safe: the public API never throws; returns safe defaults on error.
 */

const MAX_CACHE = 2000;
const providers = new Map(); // name -> provider state

function now() { return Date.now(); }

function defaults(opts = {}) {
  return {
    rateLimitPerSec: opts.rateLimitPerSec > 0 ? opts.rateLimitPerSec : 5,
    ttlMs: opts.ttlMs >= 0 ? opts.ttlMs : 10000,
    breakerThreshold: opts.breakerThreshold > 0 ? opts.breakerThreshold : 5,
    breakerCooldownMs: opts.breakerCooldownMs > 0 ? opts.breakerCooldownMs : 30000,
  };
}

function register(name, opts = {}) {
  try {
    if (!name) return null;
    const cfg = defaults(opts);
    const p = {
      name,
      cfg,
      tokens: cfg.rateLimitPerSec,
      lastRefill: now(),
      cache: new Map(), // cacheKey -> { exp, data }
      state: 'closed', // 'closed' | 'open' | 'half-open'
      consecutiveFails: 0,
      openedAt: 0,
      lastError: null,
      calls: 0,
      cacheHits: 0,
      rateLimited: 0,
    };
    providers.set(name, p);
    return p;
  } catch (_) { return null; }
}

function get(name) {
  let p = providers.get(name);
  if (!p) p = register(name);
  return p;
}

function refill(p) {
  const t = now();
  const elapsed = (t - p.lastRefill) / 1000;
  if (elapsed <= 0) return;
  p.tokens = Math.min(p.cfg.rateLimitPerSec, p.tokens + elapsed * p.cfg.rateLimitPerSec);
  p.lastRefill = t;
}

// Wait up to ~1s for a token, then proceed regardless.
async function acquire(p) {
  try {
    const deadline = now() + 1000;
    while (true) {
      refill(p);
      if (p.tokens >= 1) { p.tokens -= 1; return; }
      if (now() >= deadline) { p.tokens = 0; return; } // proceed after cap
      await new Promise(r => setTimeout(r, 50));
    }
  } catch (_) { /* proceed */ }
}

function cacheGet(p, key) {
  try {
    const e = p.cache.get(key);
    if (!e) return undefined;
    if (e.exp < now()) { p.cache.delete(key); return undefined; }
    // refresh LRU order
    p.cache.delete(key);
    p.cache.set(key, e);
    return e.data;
  } catch (_) { return undefined; }
}

function cacheSet(p, key, data, ttlMs) {
  try {
    if (ttlMs <= 0) return;
    p.cache.set(key, { exp: now() + ttlMs, data });
    while (p.cache.size > MAX_CACHE) {
      const oldest = p.cache.keys().next().value;
      if (oldest === undefined) break;
      p.cache.delete(oldest);
    }
  } catch (_) { /* ignore */ }
}

function breakerAllows(p) {
  if (p.state === 'closed') return true;
  if (p.state === 'open') {
    if (now() - p.openedAt >= p.cfg.breakerCooldownMs) {
      p.state = 'half-open';
      return true; // allow one trial
    }
    return false;
  }
  return true; // half-open allows the trial call
}

function onSuccess(p) {
  p.consecutiveFails = 0;
  p.state = 'closed';
  p.openedAt = 0;
}

function onFailure(p, err) {
  p.consecutiveFails += 1;
  p.lastError = err ? String(err.message || err) : 'unknown';
  if (p.state === 'half-open' || p.consecutiveFails >= p.cfg.breakerThreshold) {
    p.state = 'open';
    p.openedAt = now();
  }
}

async function call(name, url, options = {}) {
  const p = get(name);
  if (!p) return null;
  try {
    const cacheKey = options.cacheKey || url;

    const cached = cacheGet(p, cacheKey);
    if (cached !== undefined) { p.cacheHits += 1; return cached; }

    if (!breakerAllows(p)) return null;

    await acquire(p);
    p.calls += 1;

    let res;
    try {
      res = await fetch(url, { headers: options.headers || {} });
    } catch (netErr) {
      onFailure(p, netErr);
      return null;
    }

    if (!res || !res.ok) {
      onFailure(p, new Error('HTTP ' + (res ? res.status : 'no-response')));
      return null;
    }

    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      onFailure(p, new Error('non-JSON body'));
      return null;
    }

    onSuccess(p);
    cacheSet(p, cacheKey, json, p.cfg.ttlMs);
    return json;
  } catch (err) {
    try { onFailure(p, err); } catch (_) {}
    return null;
  }
}

function health() {
  const out = {};
  try {
    for (const [name, p] of providers) {
      out[name] = {
        healthy: p.state === 'closed',
        state: p.state,
        consecutiveFails: p.consecutiveFails,
        lastError: p.lastError,
        calls: p.calls,
        cacheHits: p.cacheHits,
        rateLimited: p.rateLimited,
      };
    }
  } catch (_) {}
  return out;
}

function stats() {
  let totalCalls = 0, totalCacheHits = 0, n = 0;
  try {
    for (const [, p] of providers) {
      totalCalls += p.calls;
      totalCacheHits += p.cacheHits;
      n += 1;
    }
  } catch (_) {}
  return { totalCalls, totalCacheHits, providers: n };
}

module.exports = { register, call, health, stats };

if (require.main === module) {
  (async () => {
    const URL = 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112';
    register('dexscreener', { rateLimitPerSec: 3, ttlMs: 15000 });
    console.log('First call (network)...');
    const t1 = Date.now();
    const a = await call('dexscreener', URL);
    console.log('  took', Date.now() - t1, 'ms, result:', a ? 'JSON ok (' + (a.pairs ? a.pairs.length : 0) + ' pairs)' : 'null');
    console.log('Second call (should be cache hit, instant)...');
    const t2 = Date.now();
    const b = await call('dexscreener', URL);
    console.log('  took', Date.now() - t2, 'ms, result:', b ? 'JSON ok' : 'null');
    console.log('\nhealth():', JSON.stringify(health(), null, 2));
    console.log('stats():', JSON.stringify(stats()));
  })().catch(e => console.error('self-test error (should not happen):', e));
}
