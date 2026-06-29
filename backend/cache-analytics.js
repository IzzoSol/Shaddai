'use strict';
// Cache hit/miss analytics — pure JS, no external packages
// Tracks: tool call results cached, skill lookups, LLM responses reused
// Uses an in-memory Map + file persistence (JSON)

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'data', 'cache-analytics.json');
const TOOL_CACHE = new Map(); // key → {value, hits, createdAt, lastHit, ttlMs}

// Default TTLs by category
const TTL = {
  market: 5 * 60 * 1000,     // 5 min — crypto prices
  search: 15 * 60 * 1000,    // 15 min — web search results
  skill: 60 * 60 * 1000,     // 1 hr — skill lookups
  weather: 10 * 60 * 1000,   // 10 min
  default: 30 * 60 * 1000    // 30 min
};

let _stats = { hits: 0, misses: 0, evictions: 0, sets: 0 };

function getCacheKey(toolName, params) {
  return `${toolName}:${JSON.stringify(params)}`;
}

function getCategory(toolName) {
  if (['fetch_price','get_ohlcv','get_fear_greed','get_global_market','get_trending'].includes(toolName)) return 'market';
  if (['search_web','wikipedia_search','get_hackernews','get_rss_feed'].includes(toolName)) return 'search';
  if (['read_obsidian_skill','get_memory'].includes(toolName)) return 'skill';
  if (['get_weather'].includes(toolName)) return 'weather';
  return 'default';
}

function get(toolName, params) {
  const key = getCacheKey(toolName, params);
  const entry = TOOL_CACHE.get(key);
  if (!entry) { _stats.misses++; return null; }
  if (Date.now() - entry.createdAt > entry.ttlMs) {
    TOOL_CACHE.delete(key);
    _stats.evictions++;
    _stats.misses++;
    return null;
  }
  entry.hits++;
  entry.lastHit = Date.now();
  _stats.hits++;
  return entry.value;
}

function set(toolName, params, value) {
  const key = getCacheKey(toolName, params);
  const cat = getCategory(toolName);
  TOOL_CACHE.set(key, {
    value,
    hits: 0,
    createdAt: Date.now(),
    lastHit: null,
    ttlMs: TTL[cat],
    toolName,
    category: cat
  });
  _stats.sets++;
  // Evict if cache grows too large (max 500 entries)
  if (TOOL_CACHE.size > 500) evictOldest(50);
}

function evictOldest(count) {
  const entries = [...TOOL_CACHE.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  entries.slice(0, count).forEach(([k]) => { TOOL_CACHE.delete(k); _stats.evictions++; });
}

function getStats() {
  const total = _stats.hits + _stats.misses;
  const byCategory = {};
  for (const entry of TOOL_CACHE.values()) {
    byCategory[entry.category] = byCategory[entry.category] || { entries: 0, hits: 0 };
    byCategory[entry.category].entries++;
    byCategory[entry.category].hits += entry.hits;
  }
  return {
    hitRate: total ? Number((_stats.hits / total * 100).toFixed(1)) : 0,
    hits: _stats.hits,
    misses: _stats.misses,
    evictions: _stats.evictions,
    totalEntries: TOOL_CACHE.size,
    byCategory,
    ..._stats
  };
}

function clearExpired() {
  const now = Date.now();
  let cleared = 0;
  for (const [k, v] of TOOL_CACHE.entries()) {
    if (now - v.createdAt > v.ttlMs) { TOOL_CACHE.delete(k); cleared++; }
  }
  return cleared;
}

// Auto-clear expired every 5 minutes
setInterval(clearExpired, 5 * 60 * 1000);

module.exports = { get, set, getStats, clearExpired, getCacheKey };
