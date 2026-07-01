'use strict';
/**
 * SHADDAI tool-result micro-cache.
 *
 * The agent engine exposes ~50 real tools, each doing a live `fetch()` to an external
 * API (CoinGecko, Binance, DexScreener, GitHub, DeFiLlama, Solana RPC, …). With no cache,
 * every agent iteration / workflow step / concurrent user re-pulls the SAME data and burns
 * a real API call + latency every time.
 *
 * This wraps each tool's `execute(params)` with a short-TTL, in-process cache keyed by
 * (toolName + normalized params). The TTL is tuned to how fast the data actually changes:
 *   - market/price/funding/gas   → 45s   (fresh enough for agent reasoning, kills bursts)
 *   - news/feeds/search/trending → 5min
 *   - repo/npm/dictionary/wiki…  → 2h    (effectively static)
 *   - anything that MUTATES (post/mint/deploy/buy/swap/generate-image/…) → NEVER cached
 *
 * Honest by construction: TTLs are short and per-tool; we never serve data past its
 * freshness window, and we never cache a side-effecting action. Public market data is
 * shared across agents/users on purpose — that's where the savings come from.
 *
 * Zero dependencies. Never throws outward. Disable with env TOOL_CACHE=off.
 */

const MAX_ENTRIES = 600;     // cap; evict oldest beyond this
const MAX_RECENT  = 40;      // rolling activity log

// ── TTL policy (ms). 0 = never cache. ──────────────────────────────────────
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN;

// Side-effecting / sensitive / expensive-nondeterministic — MUST NOT be cached.
const NEVER = /(post|send|tweet|publish|share|reply|comment|dm|email|mint|deploy|create|shorten|buy|sell|swap|trade|transfer|sign|pay|vote|generate|image|draw|render|upload|write_|set_)/i;
// Volatile market data — short window.
const VOLATILE = /(price|ticker|quote|market|depth|orderbook|order_book|funding|gas|fear|greed|fng|dominance|global|gainers|losers|ohlc|chart|candle|whale|balance|supply|tvl|dex|pair|token_info|stablecoin)/i;
// Semi-fresh feeds.
const SEMI = /(news|feed|trending|posts|reddit|hacker|^hn|producthunt|product_hunt|arxiv|stack|devto|dev_to|medium|issues|search|web|weather|sentiment|headline|show_hn|quote)/i;
// Effectively static reference data.
const STABLE = /(repo|github|npm|package|dictionary|define|country|countries|wiki|color|colour|moon|phase|history|on_this_day|geo|^ip|lookup|define_word|country_info)/i;

function ttlFor(name) {
  const n = String(name || '');
  if (NEVER.test(n))    return 0;
  if (VOLATILE.test(n)) return 45 * SEC;
  if (SEMI.test(n))     return 5 * MIN;
  if (STABLE.test(n))   return 2 * HOUR;
  return 60 * SEC; // default: read tools we didn't classify
}

// ── injectable clock (tests) ──
let _now = () => Date.now();
function __setClock(fn) { _now = fn || (() => Date.now()); }

// ── state ──
const store = new Map();   // key -> { value, isObj, exp, ms }
const stats = {
  hits: 0, misses: 0, savedMs: 0,
  byTool: {},              // name -> { hits, misses }
  recent: []               // [{ ts, tool, params, ms }]
};

function enabled() { return process.env.TOOL_CACHE !== 'off'; }

function stableStringify(obj) {
  if (obj === undefined || obj === null) return '';
  if (typeof obj !== 'object') return String(obj);
  const keys = Object.keys(obj).sort();
  return keys.map(k => `${k}=${typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : String(obj[k])}`).join('&');
}

function bump(name, field) {
  if (!stats.byTool[name]) stats.byTool[name] = { hits: 0, misses: 0 };
  stats.byTool[name][field]++;
}

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  // delete oldest-expiring first
  const arr = [...store.entries()].sort((a, b) => a[1].exp - b[1].exp);
  for (let i = 0; i < arr.length - MAX_ENTRIES; i++) store.delete(arr[i][0]);
}

/**
 * Wrap one tool's execute() with the cache. Returns a new async function.
 * `name` drives the TTL policy; `fn` is the original execute (bound to its tool).
 */
function wrapExecute(name, fn) {
  const ttl = ttlFor(name);
  return async function cachedExecute(params) {
    if (!enabled() || ttl === 0) return fn(params);          // bypass entirely
    const key = name + '|' + stableStringify(params);
    const now = _now();
    const hit = store.get(key);
    if (hit && hit.exp > now) {
      stats.hits++; bump(name, 'hits'); stats.savedMs += hit.ms;
      stats.recent.unshift({ ts: now, tool: name, params: stableStringify(params).slice(0, 60), ms: hit.ms });
      if (stats.recent.length > MAX_RECENT) stats.recent.length = MAX_RECENT;
      return hit.isObj ? JSON.parse(hit.value) : hit.value;  // fresh copy for objects
    }
    // MISS — run the real tool, measure it, store the result.
    const t0 = _now();
    const result = await fn(params);
    const ms = Math.max(0, _now() - t0);
    stats.misses++; bump(name, 'misses');
    if (result !== undefined && result !== null) {
      const isObj = typeof result === 'object';
      try {
        store.set(key, { value: isObj ? JSON.stringify(result) : result, isObj, exp: _now() + ttl, ms });
        evictIfNeeded();
      } catch (_) { /* unserializable → just don't cache */ }
    }
    return result;
  };
}

/**
 * Wrap every tool in a TOOLS map in place. Idempotent. Returns the count wrapped.
 */
function wrapAll(TOOLS) {
  let n = 0;
  for (const key of Object.keys(TOOLS || {})) {
    const tool = TOOLS[key];
    if (!tool || typeof tool.execute !== 'function' || tool.__cached) continue;
    const orig = tool.execute.bind(tool);
    tool.execute = wrapExecute(tool.name || key, orig);
    tool.__cached = true;
    n++;
  }
  return n;
}

function getStats() {
  const total = stats.hits + stats.misses;
  // top tools by hits
  const top = Object.entries(stats.byTool)
    .filter(([, v]) => v.hits > 0)
    .sort((a, b) => b[1].hits - a[1].hits)
    .slice(0, 8)
    .map(([name, v]) => ({ name, hits: v.hits, misses: v.misses }));
  return {
    enabled: enabled(),
    pullsSaved: stats.hits,                 // real API calls avoided
    realPulls: stats.misses,                // real API calls made
    hitRate: total ? Math.round((stats.hits / total) * 1000) / 1000 : 0,
    secondsSaved: Math.round(stats.savedMs / 100) / 10,   // latency not spent
    cachedEndpoints: store.size,
    topTools: top,
    recent: stats.recent.slice(0, 12)
  };
}

// test/maintenance helpers
function _reset() { store.clear(); stats.hits = 0; stats.misses = 0; stats.savedMs = 0; stats.byTool = {}; stats.recent = []; }

module.exports = { wrapAll, wrapExecute, ttlFor, getStats, __setClock, _reset };
