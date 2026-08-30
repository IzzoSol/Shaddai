// ============================================================================
// SHADDAI Key Pool — multi-key rotation + cooldown for rate-limit survival.
// ----------------------------------------------------------------------------
// PROBLEM: one free-tier key (e.g. Groq) runs out of daily/minute quota fast,
// so the shared "let people test the dashboard" demo dies. FIX: pool several
// keys per provider and rotate. When a key returns 429 / rate-limit, we put it
// on a short cooldown and hand out the next key — only falling through to the
// NEXT PROVIDER (in llm-client's chain) once every key is exhausted.
//
// KEY SOURCES (safest → easiest), highest priority first:
//   1. Per-request BYOK key (the user's own key, passed in)  — never pooled
//   2. GROQ_API_KEYS  = "key1,key2,key3"   (comma-separated list)
//   3. GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 … GROQ_API_KEY_9
// All read from env vars — keys never touch git or the browser.
//
// Usage from a provider call:
//   const pool = require('./key-pool');
//   for (const key of pool.keys('groq', { byok })) {        // in priority order
//     try { ... use key ... ; break; }
//     catch (e) { if (pool.isRateLimit(e)) { pool.cool('groq', key); continue; }
//                 throw e; }
//   }
// ============================================================================
'use strict';

// provider -> env prefix used to read keys (e.g. groq -> GROQ_API_KEY[_n])
const ENV_PREFIX = {
  groq:       'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  openai:     'OPENAI_API_KEY',
  anthropic:  'ANTHROPIC_API_KEY',
  gemini:     'GEMINI_API_KEY',
  together:   'TOGETHER_API_KEY',
  xai:        'XAI_API_KEY',
  ollamacloud:'OLLAMA_API_KEY'   // Ollama Cloud / Turbo (hosted; keyed). Local Ollama stays keyless.
};

const COOLDOWN_MS = Number(process.env.KEY_COOLDOWN_MS) || 60_000; // 60s rest after a 429
const _cooldowns = new Map(); // `${provider}:${key}` -> epoch ms until usable again
const _rr = new Map();        // provider -> round-robin cursor

// Read every configured key for a provider from env (deduped, in a stable order).
function envKeys(provider) {
  const prefix = ENV_PREFIX[provider];
  if (!prefix) return [];
  const out = [];
  const push = (v) => { if (typeof v === 'string' && v.trim().length > 8) out.push(v.trim()); };

  // Comma-separated list wins first — easiest way to paste many keys.
  const list = process.env[`${prefix}S`]; // e.g. GROQ_API_KEYS
  if (list) list.split(',').forEach(push);

  // Then the classic single + numbered variants: GROQ_API_KEY, GROQ_API_KEY_2 …
  push(process.env[prefix]);
  for (let i = 2; i <= 9; i++) push(process.env[`${prefix}_${i}`]);

  return [...new Set(out)]; // dedupe while preserving order
}

function isCool(provider, key) {
  const until = _cooldowns.get(`${provider}:${key}`);
  return until ? Date.now() < until : false;
}

// Put a key to sleep after a rate-limit so we stop hammering it.
function cool(provider, key, ms = COOLDOWN_MS) {
  if (!key) return;
  _cooldowns.set(`${provider}:${key}`, Date.now() + ms);
}

// True if an error looks like a rate-limit / quota exhaustion (worth rotating).
function isRateLimit(err) {
  const s = String((err && err.message) || err || '');
  return /\b429\b/.test(s) || /rate.?limit|too many requests|quota|insufficient_quota|overloaded/i.test(s);
}

// Ordered keys to try for this request. BYOK (user's own key) first, then the
// env pool (round-robin start point rotates each call so load spreads), with
// cooled-down keys pushed to the back rather than dropped (last-resort).
function keys(provider, { byok } = {}) {
  const pool = envKeys(provider);
  const start = pool.length ? (_rr.get(provider) || 0) % pool.length : 0;
  if (pool.length) _rr.set(provider, start + 1);

  const rotated = pool.slice(start).concat(pool.slice(0, start));
  const fresh = rotated.filter(k => !isCool(provider, k));
  const cooled = rotated.filter(k => isCool(provider, k));

  const ordered = [];
  if (byok && typeof byok === 'string' && byok.trim().length > 8) ordered.push(byok.trim());
  ordered.push(...fresh, ...cooled);
  return [...new Set(ordered)];
}

// How many usable keys a provider has right now (for /api/brains + admin UI).
function stats(provider) {
  const pool = envKeys(provider);
  return {
    provider,
    total: pool.length,
    cooling: pool.filter(k => isCool(provider, k)).length,
    available: pool.filter(k => !isCool(provider, k)).length
  };
}

function providersWithKeys() {
  return Object.keys(ENV_PREFIX).filter(p => envKeys(p).length > 0);
}

module.exports = { keys, cool, isRateLimit, stats, envKeys, providersWithKeys, ENV_PREFIX };
