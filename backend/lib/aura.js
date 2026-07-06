'use strict';
/**
 * SHADDAI AURA — In-process, dependency-free "token saver".
 *
 * AURA tries to answer prompts WITHOUT calling an LLM, cheapest path first:
 *   1. FETCH   — exact cache hit (normalized prompt -> sha256 key).
 *   2. SEED    — curated, stable knowledge base (aura-seed.json), free on the FIRST ask.
 *   3. COMPUTE — solve locally (~45 deterministic solvers): arithmetic, percentages,
 *                finance (tip/markup/compound-interest/loan), date math, unit & base
 *                conversion, statistics/stddev, number theory (prime/gcd/lcm/factorial/
 *                fibonacci/nCr/nPr/modulo), geometry (circle/hypotenuse/bmi), text ops,
 *                encoding/hashing, colors. Cached so the identical prompt later FETCHes.
 *   4. QUERY   — fuzzy cache/seed hit (word-overlap cosine similarity >= 0.82).
 *   (RECIPE — deterministic agent tool-chains — is credited via creditDeterministic().)
 *
 * Time-sensitive prompts (prices/news/"live") are detected and NEVER cached or fuzzy-served.
 *
 * If none apply, route() returns { hit:false } and the caller should hit the LLM,
 * then feed the answer back via recordAnswer() so future calls are free.
 *
 * Why: free tiers exhaust fast. Every cache/compute hit = real saved tokens/$$.
 *
 * Uses ONLY node built-ins (fs, path, crypto). Never throws to the caller.
 *
 * Exports: { route, recordAnswer, creditDeterministic, isVolatile, stats, router }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config + persistence paths
// ---------------------------------------------------------------------------
const DATA_DIR     = process.env.AURA_HOME || path.join(__dirname, '..', 'data');
const CACHE_FILE   = path.join(DATA_DIR, 'aura-cache.json');
const STATS_FILE   = path.join(DATA_DIR, 'aura-stats.json');
const SEED_FILE    = path.join(DATA_DIR, 'aura-seed.json');   // curated, stable knowledge base (committed)

const DEFAULT_TTL_MS   = 24 * 60 * 60 * 1000; // 24h
const PROMOTED_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days — promoted (frequently-missed) queries
const MAX_ENTRIES      = 1000;                 // cap; evict oldest beyond this
const SIM_THRESHOLD    = 0.82;                 // fuzzy match cutoff
const COST_PER_1K      = 0.0005;              // ~$ per 1k tokens (rough blended)
const CHARS_PER_TOK    = 4;                    // crude tokens ≈ chars / 4
const MAX_RECENT_SAVES = 50;                   // rolling activity log cap
const FLUSH_INTERVAL_MS = 5000;               // throttle: write disk at most every 5s
const PROMOTE_THRESHOLD = 3;                  // misses before a query is auto-promoted
const MAX_MISS_FREQ     = 200;                // max entries in the miss-frequency map

// ---------------------------------------------------------------------------
// Tiny JSON file helpers (resilient — never throw outward)
// ---------------------------------------------------------------------------
function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) { /* ignore */ }
}
function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}
function writeJson(file, obj) {
  try {
    ensureDir();
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stats tracking — in-memory with throttled disk persistence.
// Counters live in _statsMem and are flushed to aura-stats.json at most
// every FLUSH_INTERVAL_MS (5 s) and always on process exit.  This keeps
// AURA fast (no per-request disk read) while surviving restarts cleanly.
// ---------------------------------------------------------------------------
let _statsMem  = null;   // loaded once; mutated in-place
let _statsDirty = false;
let _statsLastFlush = 0;

function _initStats() {
  if (_statsMem) return _statsMem;
  const s = readJson(STATS_FILE, {});
  // Ensure all fields (back-compat + new)
  _statsMem = {
    hits:             typeof s.hits             === 'number' ? s.hits             : 0,
    misses:           typeof s.misses           === 'number' ? s.misses           : 0,
    tokensSaved:      typeof s.tokensSaved      === 'number' ? s.tokensSaved      : 0,
    // missesWithSaving: misses where compression saved > 0 tokens (for everyUseSaveRate)
    missesWithSaving: typeof s.missesWithSaving === 'number' ? s.missesWithSaving : 0,
    volatileSkips:    typeof s.volatileSkips    === 'number' ? s.volatileSkips    : 0,
    firstTs:          typeof s.firstTs          === 'number' ? s.firstTs          : Date.now(),
    byMethod: Object.assign({ fetch: 0, query: 0, compute: 0, recipe: 0, seed: 0 }, s.byMethod || {}),
    recentSaves: Array.isArray(s.recentSaves) ? s.recentSaves : [],
    // self-improvement fields
    missFreq:       (s.missFreq && typeof s.missFreq === 'object') ? s.missFreq : {},
    promotions:     typeof s.promotions     === 'number' ? s.promotions     : 0,
    promoted:       (s.promoted && typeof s.promoted === 'object') ? s.promoted : {},
    periodicSeeds:  typeof s.periodicSeeds  === 'number' ? s.periodicSeeds  : 0,
    hitRateHistory: Array.isArray(s.hitRateHistory) ? s.hitRateHistory : []
  };
  if (typeof _statsMem.byMethod.recipe !== 'number') _statsMem.byMethod.recipe = 0;
  if (typeof _statsMem.byMethod.seed   !== 'number') _statsMem.byMethod.seed   = 0;
  return _statsMem;
}

/** Write in-memory stats to disk if dirty; reset dirty flag. */
function flushStats() {
  if (!_statsDirty || !_statsMem) return;
  try {
    writeJson(STATS_FILE, _statsMem);
    _statsDirty = false;
    _statsLastFlush = Date.now();
  } catch (_) { /* ignore */ }
}

/** Flush remaining data when the process exits (catches graceful shutdowns). */
process.on('exit', flushStats);

/** Mutate in-memory stats; flush to disk if the throttle window has elapsed. */
function bumpStats(mut) {
  try {
    const s = _initStats();
    mut(s);
    _statsDirty = true;
    if (Date.now() - _statsLastFlush >= FLUSH_INTERVAL_MS) flushStats();
  } catch (_) { /* ignore */ }
}

/**
 * learnMiss(prompt) — track a missed query for the self-improvement loop.
 * Increments the miss-frequency counter for the normalized form of `prompt`.
 * The miss map is bounded at MAX_MISS_FREQ entries (lowest-count evicted).
 * Queries already promoted are silently skipped.
 */
function learnMiss(prompt) {
  try {
    const norm = normalize(prompt);
    if (!norm) return;
    const s = _initStats();
    if (s.promoted[norm]) return; // already promoted — no further tracking needed

    // Near-duplicate consolidation: if a semantically identical query is already in
    // missFreq, increment THAT key rather than fragmenting the count across slight phrasings.
    // Uses stop-word-filtered cosine at a high threshold (0.92) to avoid false merges.
    let key = norm;
    const normToks = simToks(norm);
    if (normToks.length) {
      const fa = {};
      for (const t of normToks) fa[t] = (fa[t] || 0) + 1;
      const magA = Math.sqrt(Object.values(fa).reduce((acc, v) => acc + v * v, 0));
      for (const existing of Object.keys(s.missFreq)) {
        if (existing === norm) break; // exact match — use directly
        const exToks = simToks(existing);
        if (!exToks.length) continue;
        const fb = {};
        for (const t of exToks) fb[t] = (fb[t] || 0) + 1;
        let dot = 0;
        for (const k of Object.keys(fa)) if (fb[k]) dot += fa[k] * fb[k];
        const magB = Math.sqrt(Object.values(fb).reduce((acc, v) => acc + v * v, 0));
        const sim = (magA && magB) ? dot / (magA * magB) : 0;
        if (sim >= 0.92) { key = existing; break; } // consolidate into existing key
      }
    }

    s.missFreq[key] = (s.missFreq[key] || 0) + 1;
    // Evict lowest-count entries if map exceeds cap
    const keys = Object.keys(s.missFreq);
    if (keys.length > MAX_MISS_FREQ) {
      keys.sort((a, b) => s.missFreq[a] - s.missFreq[b]);
      for (let i = 0; i < keys.length - MAX_MISS_FREQ; i++) delete s.missFreq[keys[i]];
    }
    _statsDirty = true;
    if (Date.now() - _statsLastFlush >= FLUSH_INTERVAL_MS) flushStats();
  } catch (_) { /* ignore */ }
}

function estTokens(str) {
  return Math.max(1, Math.ceil(String(str || '').length / CHARS_PER_TOK));
}

// ---------------------------------------------------------------------------
// Stop-word set for near-duplicate query matching (content words dominate)
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','to','of','in','on','at','for',
  'and','or','what','whats','s','please','me','tell','give','do','you','can',
  'how','i','my','it','this','that','with','about','show','help','hey','get',
  'make','let','will','would','could','should','may','might','just','like'
]);
/** Tokenize then filter stop-words for content-focused similarity. */
function simToks(str) {
  const all = normalize(str).split(' ').filter(Boolean);
  const kept = all.filter(t => !STOP_WORDS.has(t));
  return kept.length ? kept : all;
}

// ---------------------------------------------------------------------------
// Safe, lossless-enough prompt compressor.
// Applied on EVERY miss so tokensSaved increments on 100% of uses.
// Transforms: collapse whitespace, cap blank lines, deduplicate repeated
// punctuation, strip trailing spaces before newlines, dedup repeated phrases.
// None of these alter semantic meaning.
// Returns { compressed, savedByCompression, originalTokens, compressedTokens }
// ---------------------------------------------------------------------------
function compressPrompt(prompt) {
  try {
    const original = String(prompt || '');
    let c = original
      .replace(/\t/g, ' ')              // tabs → space
      .replace(/[^\S\n]+/g, ' ')        // collapse inline whitespace runs
      .replace(/\n{3,}/g, '\n\n')       // cap consecutive blank lines at 2
      .replace(/([!?.,-])\1{2,}/g, '$1$1') // "!!!" → "!!" (keep at most 2)
      .replace(/[ \t]+\n/g, '\n')       // trailing spaces before newline
      .trim();
    // Dedup immediately repeated phrase blocks (>= 8 chars)
    c = c.replace(/\b(.{8,}?)\s+\1\b/gi, '$1');
    const origTokens  = estTokens(original);
    const compTokens  = estTokens(c);
    const saved = Math.max(0, origTokens - compTokens);
    return { compressed: c, savedByCompression: saved, originalTokens: origTokens, compressedTokens: compTokens };
  } catch (_) {
    return { compressed: String(prompt || ''), savedByCompression: 0, originalTokens: 0, compressedTokens: 0 };
  }
}

// ---------------------------------------------------------------------------
// Prompt normalization + similarity
// ---------------------------------------------------------------------------
function normalize(prompt) {
  return String(prompt || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // drop punctuation
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}
function hashKey(prompt) {
  return crypto.createHash('sha256').update(normalize(prompt)).digest('hex');
}
function tokens(str) {
  return normalize(str).split(' ').filter(Boolean);
}
// Cosine similarity over word-frequency vectors (bag-of-words).
function cosineSim(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const fa = {}, fb = {};
  for (const t of ta) fa[t] = (fa[t] || 0) + 1;
  for (const t of tb) fb[t] = (fb[t] || 0) + 1;
  let dot = 0;
  for (const k of Object.keys(fa)) if (fb[k]) dot += fa[k] * fb[k];
  const mag = (f) => Math.sqrt(Object.values(f).reduce((s, v) => s + v * v, 0));
  const m = mag(fa) * mag(fb);
  return m ? dot / m : 0;
}

// ---------------------------------------------------------------------------
// Cache load/save (object keyed by hash; each entry has prompt/answer/ts/ttl)
// ---------------------------------------------------------------------------
function loadCache() {
  const c = readJson(CACHE_FILE, {});
  return (c && typeof c === 'object') ? c : {};
}
function pruneCache(cache) {
  const now = Date.now();
  // Drop expired
  for (const k of Object.keys(cache)) {
    const e = cache[k];
    if (!e || (e.ts + (e.ttl || DEFAULT_TTL_MS)) < now) delete cache[k];
  }
  // Evict oldest beyond cap
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => cache[a].ts - cache[b].ts); // oldest first
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete cache[keys[i]];
  }
  return cache;
}

// ===========================================================================
// COMPUTE: local solvers (no LLM, no external calls)
// ===========================================================================

// --- SAFE math evaluator (shunting-yard; supports + - * / % ^ and parens) ---
function safeMath(expr) {
  // Tokenize: numbers, operators, parens. Reject anything else -> null.
  const m = expr.match(/(\d+\.?\d*|\.\d+|[+\-*/%^()])/g);
  if (!m) return null;
  if (m.join('').replace(/\s/g, '') !== expr.replace(/\s/g, '')) return null; // foreign chars

  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const out = [], ops = [];
  let prevType = null; // 'num' | 'op' | '(' | ')'

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (/^(\d|\.)/.test(t)) {
      out.push(parseFloat(t));
      prevType = 'num';
    } else if (t === '(') {
      ops.push(t); prevType = '(';
    } else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
      if (!ops.length) return null; // mismatched
      ops.pop();
      prevType = ')';
    } else { // operator
      // Unary minus/plus -> treat as 0 - x
      if ((t === '-' || t === '+') && (prevType === null || prevType === 'op' || prevType === '(')) {
        out.push(0);
      }
      while (
        ops.length && ops[ops.length - 1] !== '(' &&
        (prec[ops[ops.length - 1]] > prec[t] ||
         (prec[ops[ops.length - 1]] === prec[t] && t !== '^'))
      ) out.push(ops.pop());
      ops.push(t);
      prevType = 'op';
    }
  }
  while (ops.length) {
    const o = ops.pop();
    if (o === '(') return null;
    out.push(o);
  }
  // Evaluate RPN
  const st = [];
  for (const tok of out) {
    if (typeof tok === 'number') { st.push(tok); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) return null;
    let r;
    switch (tok) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/': r = b === 0 ? null : a / b; break;
      case '%': r = b === 0 ? null : a % b; break;
      case '^': r = Math.pow(a, b); break;
      default: return null;
    }
    if (r === null || !isFinite(r)) return null;
    st.push(r);
  }
  if (st.length !== 1 || !isFinite(st[0])) return null;
  return String(Math.round(st[0] * 1e10) / 1e10);
}

// ---------------------------------------------------------------------------
// Unit conversions — all dimensions merged into UNIT_FACTORS.
// Each value is relative to the dimension's base unit:
//   length -> metres | weight -> grams | data -> bytes |
//   time -> seconds  | speed -> m/s
// ---------------------------------------------------------------------------
const UNIT_FACTORS = {
  // — length -> metres —
  mm: 0.001, cm: 0.01, m: 1, km: 1000,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
  yd: 0.9144, yard: 0.9144, yards: 0.9144,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  // — weight -> grams —
  mg: 0.001, g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  // — data size -> bytes (1024-based) —
  byte: 1, bytes: 1,
  kb: 1024, kilobyte: 1024, kilobytes: 1024,
  mb: 1048576, megabyte: 1048576, megabytes: 1048576,
  gb: 1073741824, gigabyte: 1073741824, gigabytes: 1073741824,
  tb: 1099511627776, terabyte: 1099511627776, terabytes: 1099511627776,
  pb: 1125899906842624, petabyte: 1125899906842624, petabytes: 1125899906842624,
  // — time -> seconds —
  sec: 1, second: 1, seconds: 1,
  min: 60, minute: 60, minutes: 60,
  hr: 3600, hour: 3600, hours: 3600,
  day: 86400, days: 86400,
  week: 604800, weeks: 604800,
  // — speed -> m/s —
  mps: 1,
  fps: 0.3048,
  mph: 0.44704,
  kph: 1 / 3.6, kmh: 1 / 3.6,
  knot: 0.514444, knots: 0.514444,
  // — area -> square metres —
  sqm: 1, sqkm: 1e6, sqcm: 0.0001,
  sqft: 0.092903, sqin: 0.00064516, sqyd: 0.836127,
  acre: 4046.86, acres: 4046.86,
  hectare: 10000, hectares: 10000,
  // — volume -> litres —
  ml: 0.001, milliliter: 0.001, milliliters: 0.001,
  l: 1, liter: 1, liters: 1, litre: 1, litres: 1,
  gallon: 3.78541, gallons: 3.78541,
  quart: 0.946353, quarts: 0.946353,
  pint: 0.473176, pints: 0.473176,
  cup: 0.236588, cups: 0.236588,
  floz: 0.0295735,
  tbsp: 0.0147868, tablespoon: 0.0147868, tablespoons: 0.0147868,
  tsp: 0.00492892, teaspoon: 0.00492892, teaspoons: 0.00492892,
  // — pressure -> pascals —
  pa: 1, pascal: 1, pascals: 1,
  kpa: 1000, kilopascal: 1000, kilopascals: 1000,
  mpa: 1000000, megapascal: 1000000, megapascals: 1000000,
  bar: 100000, bars: 100000,
  psi: 6894.76,
  atm: 101325, atmosphere: 101325, atmospheres: 101325,
  // — data (bits — byte is the base) —
  bit: 0.125, bits: 0.125
};

const LENGTH    = new Set(['mm', 'cm', 'm', 'km', 'in', 'inch', 'inches', 'ft', 'foot', 'feet', 'yd', 'yard', 'yards', 'mi', 'mile', 'miles']);
const WEIGHT    = new Set(['mg', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds']);
const DATA_SIZE = new Set(['bit', 'bits', 'byte', 'bytes', 'kb', 'kilobyte', 'kilobytes', 'mb', 'megabyte', 'megabytes', 'gb', 'gigabyte', 'gigabytes', 'tb', 'terabyte', 'terabytes', 'pb', 'petabyte', 'petabytes']);
const TIME_DIM  = new Set(['sec', 'second', 'seconds', 'min', 'minute', 'minutes', 'hr', 'hour', 'hours', 'day', 'days', 'week', 'weeks']);
const SPEED     = new Set(['mps', 'fps', 'mph', 'kph', 'kmh', 'knot', 'knots']);
const AREA      = new Set(['sqm', 'sqkm', 'sqcm', 'sqft', 'sqin', 'sqyd', 'acre', 'acres', 'hectare', 'hectares']);
const VOLUME    = new Set(['ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'litre', 'litres', 'gallon', 'gallons', 'quart', 'quarts', 'pint', 'pints', 'cup', 'cups', 'floz', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons']);
const PRESSURE  = new Set(['pa', 'pascal', 'pascals', 'kpa', 'kilopascal', 'kilopascals', 'mpa', 'megapascal', 'megapascals', 'bar', 'bars', 'psi', 'atm', 'atmosphere', 'atmospheres']);

function convertUnits(prompt) {
  // e.g. "convert 10 km to miles" / "10 kg in lbs" / "3 hours in minutes"
  const p = prompt.toLowerCase();
  const m = p.match(/(-?\d+\.?\d*)\s*([a-z]+)\s*(?:to|in|into)\s*([a-z]+)/);
  if (!m) return null;
  const val = parseFloat(m[1]), from = m[2], to = m[3];

  // Temperature (special, non-linear)
  const temp = { c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };
  if (temp[from] && temp[to]) {
    const tf = temp[from], tt = temp[to];
    let c; // to celsius first
    if (tf === 'c') c = val; else if (tf === 'f') c = (val - 32) * 5 / 9; else c = val - 273.15;
    let r;
    if (tt === 'c') r = c; else if (tt === 'f') r = c * 9 / 5 + 32; else r = c + 273.15;
    return `${Math.round(r * 100) / 100} ${to}`;
  }

  if (!UNIT_FACTORS[from] || !UNIT_FACTORS[to]) return null;
  const sameDim =
    (LENGTH.has(from)    && LENGTH.has(to))    ||
    (WEIGHT.has(from)    && WEIGHT.has(to))    ||
    (DATA_SIZE.has(from) && DATA_SIZE.has(to)) ||
    (TIME_DIM.has(from)  && TIME_DIM.has(to))  ||
    (SPEED.has(from)     && SPEED.has(to))     ||
    (AREA.has(from)      && AREA.has(to))      ||
    (VOLUME.has(from)    && VOLUME.has(to))    ||
    (PRESSURE.has(from)  && PRESSURE.has(to));
  if (!sameDim) return null;
  const r = (val * UNIT_FACTORS[from]) / UNIT_FACTORS[to];
  if (!isFinite(r)) return null;
  return `${Math.round(r * 1e6) / 1e6} ${to}`;
}

// --- base64 encode/decode ---
function base64Op(prompt) {
  let m = prompt.match(/base64\s+encode\s+(.+)/i);
  if (m) return Buffer.from(m[1].trim(), 'utf8').toString('base64');
  m = prompt.match(/base64\s+decode\s+(.+)/i);
  if (m) {
    try { return Buffer.from(m[1].trim(), 'base64').toString('utf8'); } catch (_) { return null; }
  }
  return null;
}

// --- word count ---
function wordCountOp(prompt) {
  const m = prompt.match(/(?:word count(?:\s+of)?|how many words(?:\s+(?:are\s+)?in)?)\s*:?\s*(.+)/i);
  if (!m) return null;
  const txt = m[1].trim().replace(/^["']|["']$/g, '');
  if (!txt) return null;
  return String(txt.split(/\s+/).filter(Boolean).length);
}

// --- character count ---
function charCountOp(prompt) {
  // "character count of: hello world" / "count characters in 'abc'"
  const m = prompt.match(/(?:char(?:acter)?\s+count(?:\s+of)?|count\s+char(?:acter)?s(?:\s+in)?)\s*:?\s*(.+)/i);
  if (!m) return null;
  const txt = m[1].trim().replace(/^["']|["']$/g, '');
  return String(txt.length);
}

// --- string format ops: uppercase / lowercase / reverse ---
function formatOp(prompt) {
  const m = prompt.match(/^\s*(uppercase|lowercase|reverse)\s*:?\s*(.+)/i);
  if (!m) return null;
  const op = m[1].toLowerCase(), txt = m[2].trim().replace(/^["']|["']$/g, '');
  if (op === 'uppercase') return txt.toUpperCase();
  if (op === 'lowercase') return txt.toLowerCase();
  if (op === 'reverse') return txt.split('').reverse().join('');
  return null;
}

// --- slugify ---
function slugifyOp(prompt) {
  const m = prompt.match(/^slugify\s*:?\s*(.+)/i);
  if (!m) return null;
  return m[1].trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// --- title case ---
const TITLE_SMALL = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as', 'is', 'vs']);
function titleCaseOp(prompt) {
  const m = prompt.match(/^title[\s-]?case\s*:?\s*(.+)/i);
  if (!m) return null;
  const txt = m[1].trim().replace(/^["']|["']$/g, '');
  return txt.split(/\s+/).map((w, i) => {
    const lo = w.toLowerCase();
    return (i > 0 && TITLE_SMALL.has(lo)) ? lo : lo.charAt(0).toUpperCase() + lo.slice(1);
  }).join(' ');
}

// --- count occurrences ---
function countOccurrencesOp(prompt) {
  // "count occurrences of 'e' in 'the elephant entered'"
  const m = prompt.match(/count\s+(?:occurrences?|instances?)\s+of\s+["']?(.+?)["']?\s+in\s+["'](.+?)["']/i);
  if (!m) return null;
  const needle = m[1], haystack = m[2];
  if (!needle) return null;
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
  return String(count);
}

// --- date ops ---
function dateOp(prompt) {
  const p = prompt.toLowerCase();
  if (/\b(today'?s? date|what(?:'s| is) (?:the |today'?s? )?date|current date)\b/.test(p)) {
    return new Date().toISOString().slice(0, 10);
  }
  if (/\b(current time|what(?:'s| is) the time|time right now)\b/.test(p)) {
    return new Date().toISOString();
  }
  return null;
}

// --- date math ("days between X and Y", "N days from today", "N days ago") ---
function _localDateStr(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}
function dateMathOp(prompt) {
  const p = prompt.toLowerCase();

  // "days between 2024-01-01 and 2024-12-31" / "how many days between X and Y"
  let m = p.match(/(?:how many\s+)?days\s+between\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d1 = new Date(m[1]), d2 = new Date(m[2]);
    if (isNaN(d1) || isNaN(d2)) return null;
    return String(Math.abs(Math.round((d2 - d1) / 86400000)));
  }

  // "what day is 30 days from today" / "30 days from today"
  m = p.match(/(\d+)\s+days?\s+from\s+(?:now|today)/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date();
    d.setDate(d.getDate() + n);
    return _localDateStr(d);
  }

  // "30 days ago"
  m = p.match(/(\d+)\s+days?\s+ago/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date();
    d.setDate(d.getDate() - n);
    return _localDateStr(d);
  }

  // "N weeks from today"
  m = p.match(/(\d+)\s+weeks?\s+from\s+(?:now|today)/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date();
    d.setDate(d.getDate() + n * 7);
    return _localDateStr(d);
  }

  // "what day of the week is YYYY-MM-DD"
  m = p.match(/(?:what\s+day(?:\s+of\s+(?:the\s+)?week)?\s+is\s+)(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(m[1]);
    if (isNaN(d)) return null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getUTCDay()];
  }

  // "days until 2025-12-31" / "how many days until YYYY-MM-DD"
  m = p.match(/(?:how\s+many\s+)?days?\s+until\s+(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const target = new Date(m[1]);
    if (isNaN(target)) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return String(Math.round((target - today) / 86400000));
  }

  // "N months from today"
  m = p.match(/(\d+)\s+months?\s+from\s+(?:now|today)/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date(); d.setMonth(d.getMonth() + n);
    return _localDateStr(d);
  }

  return null;
}

// --- statistics (average/sum/min/max/median/range/count of a number list) ---
function statsOp(prompt) {
  const p = prompt.trim();
  // Find a stats keyword
  const opMatch = p.match(/\b(average|avg|mean|sum|total|min(?:imum)?|max(?:imum)?|median|range|count|mode)\b/i);
  if (!opMatch) return null;
  const keyword = opMatch[0].toLowerCase();
  const op = keyword.replace('imum', ''); // "minimum" -> "min", "maximum" -> "max"

  // Extract numbers from everything after the keyword position
  const afterKw = p.slice(p.toLowerCase().indexOf(keyword) + keyword.length);
  const nums = afterKw.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null; // require at least 2 numbers (avoids "5 min in hours" etc.)

  const arr = nums.map(Number);
  if (arr.some(isNaN)) return null;
  const sorted = [...arr].sort((a, b) => a - b);

  switch (op) {
    case 'average': case 'avg': case 'mean': {
      const s = arr.reduce((a, b) => a + b, 0);
      return String(Math.round((s / arr.length) * 1e10) / 1e10);
    }
    case 'sum': case 'total':
      return String(arr.reduce((a, b) => a + b, 0));
    case 'min':
      return String(sorted[0]);
    case 'max':
      return String(sorted[sorted.length - 1]);
    case 'median': {
      const mid = Math.floor(sorted.length / 2);
      return String(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
    }
    case 'range':
      return String(sorted[sorted.length - 1] - sorted[0]);
    case 'count':
      return String(arr.length);
    case 'mode': {
      const freq = {};
      for (const x of arr) freq[x] = (freq[x] || 0) + 1;
      const maxF = Math.max(...Object.values(freq));
      const modes = Object.keys(freq).filter(k => freq[k] === maxF).map(Number).sort((a, b) => a - b);
      return modes.join(', ');
    }
    default: return null;
  }
}

// --- roman numerals ---
function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return null;
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r;
}
function fromRoman(s) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  const u = s.toUpperCase();
  for (let i = 0; i < u.length; i++) {
    const cur = map[u[i]], nxt = map[u[i + 1]];
    if (cur === undefined) return null;
    n += (nxt && nxt > cur) ? -cur : cur;
  }
  return n > 0 ? n : null;
}
function romanOp(prompt) {
  const p = prompt.trim();

  // Integer -> Roman numeral
  const toRomMatch =
    p.match(/roman\s+numeral\s+(?:for|of)\s+(\d+)/i) ||
    p.match(/(\d+)\s+(?:in|to|as)\s+roman(?:\s+numeral)?s?/i) ||
    p.match(/convert\s+(\d+)\s+to\s+roman(?:\s+numeral)?s?/i);
  if (toRomMatch) {
    const n = parseInt(toRomMatch[1]);
    return toRoman(n);
  }

  // Roman numeral -> integer
  const fromRomMatch =
    p.match(/what\s+(?:number\s+is|is)\s+([IVXLCDM]+)\s*\??$/i) ||
    p.match(/([IVXLCDM]+)\s+(?:in|to|as)\s+(?:decimal|number|arabic)/i) ||
    p.match(/convert\s+([IVXLCDM]+)\s+to\s+(?:decimal|number|arabic)/i) ||
    p.match(/roman\s+numeral\s+([IVXLCDM]+)\s+(?:to|in)\s+(?:decimal|number)/i);
  if (fromRomMatch) {
    const sym = fromRomMatch[1];
    if (!/^[IVXLCDMivxlcdm]+$/.test(sym)) return null;
    const n = fromRoman(sym);
    return n !== null ? String(n) : null;
  }

  return null;
}

// --- prime check ---
function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  if (n > 1e9) return false; // cap: sqrt(1e9)≈31623 → fast
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}
function primeOp(prompt) {
  const m = prompt.match(/(?:is\s+)?(\d+)\s+(?:a\s+)?prime(?:\s+number)?\s*\??/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (n > 1e9) return null;
  return isPrime(n)
    ? `Yes, ${n} is prime`
    : `No, ${n} is not prime`;
}

// --- gcd/lcm/factorial ---
function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }

function gcdOp(prompt) {
  const m = prompt.match(/\bgcd\s+(?:of\s+)?(\d+)\s+(?:and\s+)?(\d+)/i);
  if (!m) return null;
  const a = parseInt(m[1]), b = parseInt(m[2]);
  return String(_gcd(a, b));
}

function lcmOp(prompt) {
  const m = prompt.match(/\blcm\s+(?:of\s+)?(\d+)\s+(?:and\s+)?(\d+)/i);
  if (!m) return null;
  const a = parseInt(m[1]), b = parseInt(m[2]);
  if (a > 1e9 || b > 1e9) return null;
  const g = _gcd(a, b);
  if (g === 0) return '0';
  const result = Math.abs(a / g * b);
  if (!isFinite(result) || result > Number.MAX_SAFE_INTEGER) return null;
  return String(result);
}

function factorialOp(prompt) {
  const p = prompt.trim();
  let n;
  // "5!" (bare exclamation)
  const bangM = p.match(/^(\d+)\s*!$/);
  if (bangM) {
    n = parseInt(bangM[1]);
  } else {
    // "factorial of 5" / "factorial(5)" / "5 factorial"
    const m = p.match(/(?:factorial\s*(?:of\s*)?(\d+)|(\d+)\s+factorial)/i);
    if (!m) return null;
    n = parseInt(m[1] !== undefined ? m[1] : m[2]);
  }
  if (isNaN(n) || n < 0 || n > 18) return null; // 18! ≤ MAX_SAFE_INTEGER
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return String(r);
}

// --- base conversion (hex / binary / octal / decimal) ---
function baseConvertOp(prompt) {
  const p = prompt.trim().toLowerCase();

  // "0xff in decimal" / "0b1010 to binary" / "0o17 to decimal"
  const prefixM = p.match(/\b(0x[0-9a-f]+|0b[01]+|0o[0-7]+)\s+(?:in|to|as)\s+(decimal|dec(?:imal)?|hex(?:adecimal)?|binary|bin(?:ary)?|octal|oct(?:al)?)\b/);
  if (prefixM) {
    const raw = prefixM[1], target = prefixM[2];
    let n;
    if (raw.startsWith('0x')) n = parseInt(raw, 16);
    else if (raw.startsWith('0b')) n = parseInt(raw.slice(2), 2);
    else n = parseInt(raw.slice(2), 8); // strip "0o" prefix before octal parse
    if (isNaN(n) || n < 0) return null;
    if (target === 'decimal' || target === 'dec') return String(n);
    if (target.startsWith('hex')) return '0x' + n.toString(16).toUpperCase();
    if (target === 'binary' || target === 'bin') return '0b' + n.toString(2);
    if (target === 'octal' || target === 'oct') return '0o' + n.toString(8);
  }

  // "255 in hex" / "255 to binary" / "convert 255 to hex"
  const decM = p.match(/\b(\d+)\s+(?:in|to|as)\s+(hex(?:adecimal)?|binary|bin(?:ary)?|octal|oct(?:al)?|decimal|dec(?:imal)?)\b/);
  if (decM) {
    const n = parseInt(decM[1]);
    const target = decM[2];
    if (isNaN(n) || n < 0) return null;
    if (target === 'decimal' || target === 'dec') return String(n);
    if (target.startsWith('hex')) return '0x' + n.toString(16).toUpperCase();
    if (target === 'binary' || target === 'bin') return '0b' + n.toString(2);
    if (target === 'octal' || target === 'oct') return '0o' + n.toString(8);
  }

  return null;
}

// --- number formatting (add commas) ---
function numberFormatOp(prompt) {
  const m = prompt.match(/(?:format\s+|add\s+commas?\s+to\s+)(-?\d+(?:\.\d+)?)(?:\s+with\s+commas?)?/i)
         || prompt.match(/(-?\d+(?:\.\d+)?)\s+with\s+commas?/i);
  if (!m) return null;
  const raw = m[1];
  const neg = raw.startsWith('-');
  const abs = neg ? raw.slice(1) : raw;
  const parts = abs.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + parts.join('.');
}

// --- parametric templates: recognize a recurring SHAPE and solve any instance ---
const _r2 = (n) => Math.round(n * 100) / 100;

function _percentOf(p) { // "15% of 240"
  const m = p.toLowerCase().match(/(-?\d+\.?\d*)\s*(?:%|percent)\s+of\s+(-?\d+\.?\d*)/);
  return m ? String(_r2((parseFloat(m[1]) / 100) * parseFloat(m[2]))) : null;
}
function _percentOff(p) { // "20% off 50"
  const m = p.toLowerCase().match(/(-?\d+\.?\d*)\s*(?:%|percent)\s+off\s+\$?(-?\d+\.?\d*)/);
  if (!m) return null;
  const base = parseFloat(m[2]), off = (parseFloat(m[1]) / 100) * base;
  return `${_r2(base - off)} (you save ${_r2(off)})`;
}
function _tipCalc(p) { // "tip on 80 at 18%" / "18% tip on $80"
  const s = p.toLowerCase(); let bill, pct;
  let m = s.match(/tip\s+on\s+\$?(-?\d+\.?\d*)\s+(?:at\s+)?(-?\d+\.?\d*)\s*(?:%|percent)/);
  if (m) { bill = parseFloat(m[1]); pct = parseFloat(m[2]); }
  else { m = s.match(/(-?\d+\.?\d*)\s*(?:%|percent)\s+tip\s+on\s+\$?(-?\d+\.?\d*)/); if (!m) return null; pct = parseFloat(m[1]); bill = parseFloat(m[2]); }
  const tip = _r2(bill * pct / 100);
  return `tip ${tip}, total ${_r2(bill + tip)}`;
}
function _percentChange(p) { // "percent change from 80 to 100"
  const m = p.toLowerCase().match(/(?:percent|%)\s*change\s+(?:from\s+)?(-?\d+\.?\d*)\s+to\s+(-?\d+\.?\d*)/);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[2]);
  return a === 0 ? null : `${_r2(((b - a) / Math.abs(a)) * 100)}%`;
}

// --- percent markup ("20% markup on 50") ---
function _percentMarkup(p) {
  const m = p.toLowerCase().match(/(-?\d+\.?\d*)\s*(?:%|percent)\s+markup\s+(?:on\s+)?\$?(-?\d+\.?\d*)/);
  if (!m) return null;
  const base = parseFloat(m[2]), markup = (parseFloat(m[1]) / 100) * base;
  return `${_r2(base + markup)} (markup ${_r2(markup)})`;
}

// --- standard deviation / variance of a list ---
function stddevOp(prompt) {
  const p = prompt.trim();
  const isVariance  = /\bvariance\b/i.test(p);
  const isStddev    = /\b(?:stddev|std\s+dev(?:iation)?|standard\s+deviation)\b/i.test(p);
  if (!isVariance && !isStddev) return null;
  // Extract numbers that appear after the keyword
  const kwMatch = p.match(/\b(?:variance|stddev|std\s+dev(?:iation)?|standard\s+deviation)\b/i);
  if (!kwMatch) return null;
  const afterKw = p.slice(kwMatch.index + kwMatch[0].length);
  const nums = afterKw.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const arr = nums.map(Number);
  if (arr.some(isNaN)) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  if (isVariance) return String(Math.round(variance * 1e10) / 1e10);
  return String(Math.round(Math.sqrt(variance) * 1e10) / 1e10);
}

// --- ratio simplification ("simplify ratio 12:8" → "3:2") ---
function ratioSimplifyOp(prompt) {
  const m = prompt.match(/(?:simplify(?:\s+ratio)?|ratio)\s+(\d+)\s*:\s*(\d+)(?:\s+(?:in\s+)?(?:simplest|lowest)\s+(?:form|terms))?/i)
         || prompt.match(/(\d+)\s*:\s*(\d+)\s+(?:in\s+)?(?:simplest|lowest)\s+(?:form|terms)/i);
  if (!m) return null;
  const a = parseInt(m[1]), b = parseInt(m[2]);
  if (isNaN(a) || isNaN(b) || a === 0 || b === 0) return null;
  const g = _gcd(a, b);
  return `${a / g}:${b / g}`;
}

// --- round to N decimal places ("round 3.14159 to 2 decimal places") ---
function roundToOp(prompt) {
  const m = prompt.match(/round\s+(-?\d+\.?\d*)\s+to\s+(\d+)\s+decimal\s+place/i);
  if (!m) return null;
  const n = parseFloat(m[1]), places = parseInt(m[2]);
  if (isNaN(n) || isNaN(places) || places < 0 || places > 15) return null;
  const factor = Math.pow(10, places);
  return String(Math.round(n * factor) / factor);
}

// --- X out of Y as a percent ("3 out of 4 as a percent" → "75%") ---
function outOfPercentOp(prompt) {
  const m = prompt.match(/(-?\d+\.?\d*)\s+out\s+of\s+(-?\d+\.?\d*)\s+as\s+a?\s*percent(?:age)?/i)
         || prompt.match(/what\s+percent(?:age)?\s+is\s+(-?\d+\.?\d*)\s+out\s+of\s+(-?\d+\.?\d*)/i);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[2]);
  if (isNaN(a) || isNaN(b) || b === 0) return null;
  return `${Math.round((a / b) * 100 * 100) / 100}%`;
}

// --- compound interest ("compound interest on 1000 at 5% for 3 years") ---
function compoundInterestOp(prompt) {
  const m = prompt.match(/compound(?:ed)?\s+interest\s+(?:on\s+)?\$?(-?\d+\.?\d*)\s+at\s+(-?\d+\.?\d*)\s*%\s+for\s+(-?\d+\.?\d*)\s+year/i);
  if (!m) return null;
  const P = parseFloat(m[1]), r = parseFloat(m[2]) / 100, t = parseFloat(m[3]);
  if (isNaN(P) || isNaN(r) || isNaN(t) || t < 0 || t > 200) return null;
  const A = P * Math.pow(1 + r, t);
  if (!isFinite(A)) return null;
  return String(Math.round(A * 100) / 100);
}

// --- monthly loan payment ("monthly payment on 10000 at 5% for 3 years") ---
function loanPaymentOp(prompt) {
  const m = prompt.match(/(?:monthly\s+payment|loan\s+payment|mortgage\s+payment)\s+(?:on\s+|for\s+)?\$?(-?\d+\.?\d*)\s+at\s+(-?\d+\.?\d*)\s*%\s+for\s+(-?\d+\.?\d*)\s+year/i);
  if (!m) return null;
  const P = parseFloat(m[1]), annualRate = parseFloat(m[2]) / 100, years = parseFloat(m[3]);
  if (isNaN(P) || isNaN(annualRate) || isNaN(years) || P <= 0 || annualRate < 0 || years <= 0) return null;
  if (annualRate === 0) {
    const payment = P / (years * 12);
    return `${Math.round(payment * 100) / 100}/month`;
  }
  const r = annualRate / 12, n = years * 12;
  const rn = Math.pow(1 + r, n);
  const pmt = P * r * rn / (rn - 1);
  if (!isFinite(pmt)) return null;
  return `${Math.round(pmt * 100) / 100}/month`;
}

// --- ordinal suffix ("ordinal of 21" → "21st") ---
function ordinalOp(prompt) {
  const m = prompt.match(/(?:what\s+is\s+(?:the\s+)?)?ordinal(?:\s+of)?\s+(\d+)/i)
         || prompt.match(/(\d+)\s+(?:in\s+)?ordinal/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (isNaN(n) || n < 0 || n > 1000000) return null;
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// --- number to English words ("123 in words" → "one hundred twenty-three") ---
function numberToWordsOp(prompt) {
  const m = prompt.match(/(-?\d+)\s+(?:in|to)\s+words?\s*$/i)
         || prompt.match(/number\s+(?:to\s+)?words?\s*:?\s*(-?\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (isNaN(n) || Math.abs(n) > 999999) return null;

  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine',
                'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
                'seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

  function _toW(num) {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + _toW(num % 100) : '');
  }

  if (n < 0) return 'negative ' + _toW(-n);
  if (n === 0) return 'zero';
  if (n < 1000) return _toW(n);
  const thousands = Math.floor(n / 1000), remainder = n % 1000;
  return _toW(thousands) + ' thousand' + (remainder ? ' ' + _toW(remainder) : '');
}

// --- count vowels ("count vowels in 'hello'" → "2") ---
function countVowelsOp(prompt) {
  const m = prompt.match(/(?:count\s+vowels?(?:\s+in)?|how\s+many\s+vowels?(?:\s+(?:are\s+)?in)?)\s*:?\s*["']?(.+?)["']?\s*$/i);
  if (!m) return null;
  const txt = m[1].trim();
  if (!txt) return null;
  return String((txt.match(/[aeiouAEIOU]/g) || []).length);
}

// --- sha256 / md5 hash of text ---
function hashOp(prompt) {
  const m = prompt.match(/\b(sha256|sha512|md5)\s+(?:hash\s+)?of\s+["']?(.+?)["']?\s*$/i);
  if (!m) return null;
  const algo = m[1].toLowerCase(), txt = m[2].trim();
  if (!txt) return null;
  try { return crypto.createHash(algo).update(txt, 'utf8').digest('hex'); } catch (_) { return null; }
}

// --- url encode / decode ---
function urlEncodeDecodeOp(prompt) {
  let m = prompt.match(/url\s+encode\s+["']?(.+?)["']?\s*$/i);
  if (m) { try { return encodeURIComponent(m[1].trim()); } catch (_) { return null; } }
  m = prompt.match(/url\s+decode\s+["']?(.+?)["']?\s*$/i);
  if (m) { try { return decodeURIComponent(m[1].trim()); } catch (_) { return null; } }
  return null;
}

// --- json minify / prettify (parse-guarded) ---
function jsonMinifyPrettifyOp(prompt) {
  let m = prompt.match(/json\s+prettify\s+(.+)/i);
  if (m) { try { return JSON.stringify(JSON.parse(m[1].trim()), null, 2); } catch (_) { return null; } }
  m = prompt.match(/json\s+minify\s+(.+)/i);
  if (m) { try { return JSON.stringify(JSON.parse(m[1].trim())); } catch (_) { return null; } }
  return null;
}

// --- unix timestamp <-> ISO date ---
function unixTimestampOp(prompt) {
  const p = prompt.trim();
  // "unix timestamp for 2024-01-01" or "2024-01-01 to unix timestamp"
  let m = p.match(/unix\s+timestamp\s+(?:for|of)\s+(\d{4}-\d{2}-\d{2})/i)
         || p.match(/(\d{4}-\d{2}-\d{2})\s+(?:to|as)\s+unix(?:\s+timestamp)?/i);
  if (m) {
    const d = new Date(m[1]);
    if (isNaN(d)) return null;
    return String(Math.floor(d.getTime() / 1000));
  }
  // "timestamp 1704067200 to date"
  m = p.match(/(?:unix\s+)?timestamp\s+(\d{9,13})\s+to\s+(?:date|datetime)/i);
  if (m) {
    const ts = parseInt(m[1]);
    const ms = String(m[1]).length >= 13 ? ts : ts * 1000;
    const d = new Date(ms);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// --- hex color <-> rgb ---
function hexColorOp(prompt) {
  const p = prompt.trim();
  // "#FF5733 to rgb" or "hex #FF5733 to rgb"
  let m = p.match(/(?:hex(?:\s+color)?\s+)?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\s+to\s+rgb/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // "rgb(255, 87, 51) to hex" or "rgb 255 87 51 to hex"
  m = p.match(/rgb\s*\(?\s*(\d{1,3})\s*,?\s*(\d{1,3})\s*,?\s*(\d{1,3})\s*\)?\s+to\s+hex/i);
  if (m) {
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
    if (r > 255 || g > 255 || b > 255) return null;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  }
  return null;
}

// --- clamp a number ("clamp 150 between 0 and 100") ---
function clampOp(prompt) {
  const m = prompt.match(/clamp\s+(-?\d+\.?\d*)\s+(?:between|to)\s+(-?\d+\.?\d*)\s+and\s+(-?\d+\.?\d*)/i);
  if (!m) return null;
  const n = parseFloat(m[1]), lo = parseFloat(m[2]), hi = parseFloat(m[3]);
  if (isNaN(n) || isNaN(lo) || isNaN(hi)) return null;
  return String(Math.min(Math.max(n, lo), hi));
}

// --- square root ("sqrt of 144" / "square root of 144") ---
function sqrtOp(prompt) {
  const m = prompt.match(/(?:sqrt|square\s+root)\s+(?:of\s+)?(-?\d+\.?\d*)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n) || n < 0) return null;
  return String(Math.round(Math.sqrt(n) * 1e10) / 1e10);
}

// --- natural-language powers ("2 to the power of 10", "5 squared", "3 cubed") ---
function powerOp(prompt) {
  const p = prompt.toLowerCase();
  let m = p.match(/(-?\d+\.?\d*)\s*(?:to\s+the\s+power\s+of|raised\s+to(?:\s+the\s+power\s+of)?|\*\*)\s*(-?\d+\.?\d*)/);
  if (m) { const r = Math.pow(parseFloat(m[1]), parseFloat(m[2])); return isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : null; }
  m = p.match(/(-?\d+\.?\d*)\s+squared\b/);
  if (m) { const r = Math.pow(parseFloat(m[1]), 2); return isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : null; }
  m = p.match(/(-?\d+\.?\d*)\s+cubed\b/);
  if (m) { const r = Math.pow(parseFloat(m[1]), 3); return isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : null; }
  return null;
}

// --- modulo ("17 mod 5", "17 modulo 5", "remainder of 17 divided by 5") ---
function moduloOp(prompt) {
  let m = prompt.match(/(-?\d+)\s*(?:mod|modulo)\s*(-?\d+)/i);
  if (!m) m = prompt.match(/remainder\s+(?:of\s+)?(-?\d+)\s+divided\s+by\s+(-?\d+)/i);
  if (!m) return null;
  const a = parseInt(m[1]), b = parseInt(m[2]);
  if (b === 0) return null;
  return String(a % b);
}

// --- ceil / floor / round / abs ("round up 4.2", "ceil 4.2", "floor 4.8", "abs of -5", "round 4.6") ---
function roundingOp(prompt) {
  const p = prompt.trim();
  let m = p.match(/(?:round\s+up|ceil(?:ing)?)\s+(?:of\s+)?(-?\d+\.?\d*)/i);
  if (m) return String(Math.ceil(parseFloat(m[1])));
  m = p.match(/(?:round\s+down|floor)\s+(?:of\s+)?(-?\d+\.?\d*)/i);
  if (m) return String(Math.floor(parseFloat(m[1])));
  m = p.match(/abs(?:olute\s+value)?\s+(?:of\s+)?(-?\d+\.?\d*)/i);
  if (m) return String(Math.abs(parseFloat(m[1])));
  m = p.match(/^round\s+(-?\d+\.?\d*)\s*$/i);   // "round 4.6" → nearest int (roundToOp handles "to N places" first)
  if (m) return String(Math.round(parseFloat(m[1])));
  return null;
}

// --- combinations / permutations ("10 choose 3", "nCr 10 3", "permutations of 10 and 3") ---
function combPermOp(prompt) {
  const p = prompt.toLowerCase();
  let m = p.match(/(\d+)\s+choose\s+(\d+)/) || p.match(/\bncr\s+(\d+)\s+(\d+)/) || p.match(/combinations?\s+(?:of\s+)?(\d+)\s+(?:choose\s+|and\s+)?(\d+)/);
  if (m) {
    const n = parseInt(m[1]), r = parseInt(m[2]);
    if (isNaN(n) || isNaN(r) || r > n || n > 170 || r < 0) return null;
    let res = 1; for (let i = 0; i < r; i++) res = res * (n - i) / (i + 1);
    return String(Math.round(res));
  }
  m = p.match(/\bnpr\s+(\d+)\s+(\d+)/) || p.match(/permutations?\s+(?:of\s+)?(\d+)\s+(?:and\s+)?(\d+)/);
  if (m) {
    const n = parseInt(m[1]), r = parseInt(m[2]);
    if (isNaN(n) || isNaN(r) || r > n || n > 170 || r < 0) return null;
    let res = 1; for (let i = 0; i < r; i++) res *= (n - i);
    if (!isFinite(res) || res > Number.MAX_SAFE_INTEGER) return null;
    return String(res);
  }
  return null;
}

// --- fibonacci ("10th fibonacci number", "fibonacci of 10") — 1-indexed: fib(1)=1, fib(2)=1 ---
function fibonacciOp(prompt) {
  const m = prompt.match(/(\d+)(?:st|nd|rd|th)?\s+fibonacci/i) || prompt.match(/fibonacci\s+(?:number\s+)?(?:of\s+)?(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (isNaN(n) || n < 1 || n > 78) return null;   // fib(78) within MAX_SAFE_INTEGER
  let a = 0, b = 1;
  for (let i = 1; i < n; i++) { const t = a + b; a = b; b = t; }
  return String(b);
}

// --- leap year ("is 2024 a leap year") ---
function leapYearOp(prompt) {
  const m = prompt.match(/\bis\s+(\d{1,4})\s+a\s+leap\s+year/i);
  if (!m) return null;
  const y = parseInt(m[1]);
  const leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  return leap ? `Yes, ${y} is a leap year` : `No, ${y} is not a leap year`;
}

// --- circle area / circumference ("area of a circle with radius 5") ---
function circleOp(prompt) {
  const p = prompt.toLowerCase();
  let m = p.match(/area\s+of\s+(?:a\s+)?circle\s+(?:with\s+)?radius\s+(-?\d+\.?\d*)/);
  if (m) { const r = parseFloat(m[1]); if (r < 0) return null; return String(Math.round(Math.PI * r * r * 1e6) / 1e6); }
  m = p.match(/circumference\s+of\s+(?:a\s+)?circle\s+(?:with\s+)?radius\s+(-?\d+\.?\d*)/);
  if (m) { const r = parseFloat(m[1]); if (r < 0) return null; return String(Math.round(2 * Math.PI * r * 1e6) / 1e6); }
  return null;
}

// --- hypotenuse ("hypotenuse of 3 and 4") ---
function hypotenuseOp(prompt) {
  const m = prompt.match(/hypotenuse\s+(?:of\s+)?(-?\d+\.?\d*)\s+and\s+(-?\d+\.?\d*)/i);
  if (!m) return null;
  return String(Math.round(Math.hypot(parseFloat(m[1]), parseFloat(m[2])) * 1e6) / 1e6);
}

// --- BMI ("bmi for 70 kg and 1.8 m") ---
function bmiOp(prompt) {
  const m = prompt.match(/bmi\s+(?:for\s+|of\s+)?(-?\d+\.?\d*)\s*(?:kg)?\s+(?:and\s+)?(-?\d+\.?\d*)\s*m\b/i);
  if (!m) return null;
  const w = parseFloat(m[1]), h = parseFloat(m[2]);
  if (w <= 0 || h <= 0) return null;
  return String(Math.round(w / (h * h) * 10) / 10);
}

/**
 * Try to compute an answer locally. Returns a string answer or null.
 * Ordered so cheap/specific detectors run before generic math.
 */
function compute(prompt) {
  const raw = String(prompt || '').trim();
  if (!raw) return null;

  // 1. Parametric templates (specific shapes the generic math can't parse).
  const pof  = _percentOf(raw);       if (pof  !== null) return pof;
  const poff = _percentOff(raw);      if (poff !== null) return poff;
  const pmk  = _percentMarkup(raw);   if (pmk  !== null) return pmk;
  const tip  = _tipCalc(raw);         if (tip  !== null) return tip;
  const pch  = _percentChange(raw);   if (pch  !== null) return pch;
  const oop  = outOfPercentOp(raw);   if (oop  !== null) return oop;
  const ci   = compoundInterestOp(raw); if (ci !== null) return ci;
  const loan = loanPaymentOp(raw);    if (loan !== null) return loan;

  // 2. Date / time
  const date = dateOp(raw);           if (date !== null) return date;
  const dm   = dateMathOp(raw);       if (dm   !== null) return dm;
  const uts  = unixTimestampOp(raw);  if (uts  !== null) return uts;

  // 3. Encoding / hashing
  const b64  = base64Op(raw);         if (b64  !== null) return b64;
  const hsh  = hashOp(raw);           if (hsh  !== null) return hsh;

  // 4. Text / string ops
  const wc   = wordCountOp(raw);      if (wc   !== null) return wc;
  const cc   = charCountOp(raw);      if (cc   !== null) return cc;
  const fmt  = formatOp(raw);         if (fmt  !== null) return fmt;
  const slug = slugifyOp(raw);        if (slug !== null) return slug;
  const tc   = titleCaseOp(raw);      if (tc   !== null) return tc;
  const occ  = countOccurrencesOp(raw); if (occ !== null) return occ;
  const cvow = countVowelsOp(raw);    if (cvow !== null) return cvow;
  const ued  = urlEncodeDecodeOp(raw); if (ued !== null) return ued;
  const jsn  = jsonMinifyPrettifyOp(raw); if (jsn !== null) return jsn;

  // 5. Number / statistics
  const stat = statsOp(raw);          if (stat !== null) return stat;
  const std  = stddevOp(raw);         if (std  !== null) return std;
  const rom  = romanOp(raw);          if (rom  !== null) return rom;
  const pr   = primeOp(raw);          if (pr   !== null) return pr;
  const gcdR = gcdOp(raw);            if (gcdR !== null) return gcdR;
  const lcmR = lcmOp(raw);            if (lcmR !== null) return lcmR;
  const fact = factorialOp(raw);      if (fact !== null) return fact;
  const base = baseConvertOp(raw);    if (base !== null) return base;
  const numf = numberFormatOp(raw);   if (numf !== null) return numf;
  const rat  = ratioSimplifyOp(raw);  if (rat  !== null) return rat;
  const rnd  = roundToOp(raw);        if (rnd  !== null) return rnd;
  const ord  = ordinalOp(raw);        if (ord  !== null) return ord;
  const n2w  = numberToWordsOp(raw);  if (n2w  !== null) return n2w;
  const clmp = clampOp(raw);          if (clmp !== null) return clmp;
  const sqrtR = sqrtOp(raw);          if (sqrtR !== null) return sqrtR;
  const powR  = powerOp(raw);         if (powR  !== null) return powR;
  const modR  = moduloOp(raw);        if (modR  !== null) return modR;
  const rndg  = roundingOp(raw);      if (rndg  !== null) return rndg;
  const cp    = combPermOp(raw);      if (cp    !== null) return cp;
  const fib   = fibonacciOp(raw);     if (fib   !== null) return fib;
  const leap  = leapYearOp(raw);      if (leap  !== null) return leap;
  const circ  = circleOp(raw);        if (circ  !== null) return circ;
  const hyp   = hypotenuseOp(raw);    if (hyp   !== null) return hyp;
  const bmi   = bmiOp(raw);           if (bmi   !== null) return bmi;

  // 6. Colors
  const hxc  = hexColorOp(raw);       if (hxc  !== null) return hxc;

  // 7. Unit conversions (length/weight/data/time/speed/temperature/area/volume/pressure)
  const conv = convertUnits(raw);     if (conv !== null) return conv;

  // 7. Generic arithmetic — strip natural-language wrapper then evaluate.
  let mathSrc = raw
    .replace(/^\s*(what(?:'s| is)|calculate|compute|solve|eval(?:uate)?|how much is)\b/i, '')
    .replace(/[?=]/g, '')
    .replace(/\bx\b/gi, '*')
    .trim();
  if (/^[\d\s+\-*/%^().]+$/.test(mathSrc) && /\d/.test(mathSrc)) {
    const r = safeMath(mathSrc);
    if (r !== null) return r;
  }

  return null;
}

// ===========================================================================
// PERIODIC IMPROVEMENT PASS
// Every IMPROVE_INTERVAL calls, scan high-miss queries against the live cache
// at a lower similarity threshold (0.72) and auto-seed any near-duplicate
// answers found — so slightly-varied repeats start hitting on the next ask.
// Also records a hit-rate snapshot for the improving-over-time trend.
// ===========================================================================
const IMPROVE_INTERVAL = 100;   // run the pass every N route() calls
const IMPROVE_THRESHOLD = 0.72; // looser threshold for periodic near-dup seeding
let _callCount = 0;

function _periodicImprove() {
  try {
    const s = _initStats();
    const cache = loadCache();

    // Track hit-rate history (rolling last-10 snapshots)
    const total = s.hits + s.misses;
    const snapshot = { ts: Date.now(), hitRate: total ? s.hits / total : 0, uses: total };
    if (!Array.isArray(s.hitRateHistory)) s.hitRateHistory = [];
    s.hitRateHistory.push(snapshot);
    if (s.hitRateHistory.length > 10) s.hitRateHistory.shift();

    // Find frequently-missed queries not yet promoted (>= PROMOTE_THRESHOLD/2)
    const candidates = Object.entries(s.missFreq || {})
      .filter(([, count]) => count >= Math.max(1, Math.floor(PROMOTE_THRESHOLD / 2)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    let seeded = 0;
    const cacheKeys = Object.keys(cache);
    for (const [candidateNorm] of candidates) {
      if (s.promoted[candidateNorm]) continue; // already handled
      // Check if this candidate already has its own cache entry
      if (cache[hashKey(candidateNorm)]) continue;
      // Try fuzzy match at looser threshold against existing cache entries
      const cToks = simToks(candidateNorm);
      if (!cToks.length) continue;
      const cf = {}; for (const t of cToks) cf[t] = (cf[t] || 0) + 1;
      const cMag = Math.sqrt(Object.values(cf).reduce((acc, v) => acc + v * v, 0));
      let bestSim = 0, bestEntry = null;
      for (const ck of cacheKeys) {
        const e = cache[ck];
        if (!e || !e.answer) continue;
        if (isVolatile(e.prompt || '')) continue;
        const eToks = simToks(e.prompt || '');
        if (!eToks.length) continue;
        const ef = {}; for (const t of eToks) ef[t] = (ef[t] || 0) + 1;
        let dot = 0; for (const t of Object.keys(cf)) if (ef[t]) dot += cf[t] * ef[t];
        const eMag = Math.sqrt(Object.values(ef).reduce((acc, v) => acc + v * v, 0));
        const sim = (cMag && eMag) ? dot / (cMag * eMag) : 0;
        if (sim > bestSim) { bestSim = sim; bestEntry = e; }
      }
      if (bestSim >= IMPROVE_THRESHOLD && bestEntry) {
        // Seed cache: map this frequently-missed variant to the existing answer
        const newKey = hashKey(candidateNorm);
        cache[newKey] = { prompt: candidateNorm, answer: bestEntry.answer, ts: Date.now(), ttl: DEFAULT_TTL_MS, _seeded: true };
        seeded++;
        delete s.missFreq[candidateNorm]; // no longer a miss candidate
      }
    }
    if (seeded > 0) {
      try { writeJson(CACHE_FILE, cache); } catch (_) {}
      s.periodicSeeds = (s.periodicSeeds || 0) + seeded;
    }
    _statsDirty = true;
  } catch (_) { /* never throw */ }
}

// ===========================================================================
// VOLATILE detection — time-sensitive answers must NEVER be served from cache
// (a cached "BTC price" from yesterday is a WRONG answer). Excluded from
// FETCH/QUERY hits and never stored. COMPUTE (math/date) stays allowed.
// ===========================================================================
const VOLATILE_RE = /\b(price|prices|worth|market\s*cap|volume|gas\s*price|exchange\s*rate|stock|ticker|quote|weather|temperature|forecast|news|headlines?|trending|latest|current(?:ly)?|live|real[\s-]?time|right\s*now|fear\s*(?:and|&)\s*greed|standings|balance|funding\s*rate|dominance|floor\s*price|\btvl\b|\bapr\b|\bapy\b|yield)\b/i;
function isVolatile(prompt) { try { return VOLATILE_RE.test(String(prompt || '')); } catch (_) { return false; } }

// ── SEED knowledge base — curated, stable, TRUE answers served FREE on the FIRST ask. ──
// Loaded once from aura-seed.json (committed, version-controlled). Each q-phrasing → one
// keyed entry (exact-hash match) + kept in a pool for fuzzy match. Never volatile.
let _seed = null;
function loadSeed() {
  if (_seed) return _seed;
  const out = [];
  try {
    const raw = readJson(SEED_FILE, {});
    const entries = Array.isArray(raw) ? raw : (raw.entries || []);
    for (const e of entries) {
      if (!e || !e.a) continue;
      const phrasings = Array.isArray(e.q) ? e.q : [e.q];
      for (const q of phrasings) {
        if (!q) continue;
        out.push({ prompt: String(q), answer: String(e.a), key: hashKey(String(q)) });
      }
    }
  } catch (_) { /* seed optional */ }
  _seed = out;
  return _seed;
}

// ===========================================================================
// PUBLIC API
// ===========================================================================

/**
 * route(prompt, opts) — attempt a no-LLM answer.
 * @returns {hit:true, method, answer, savedTokensEst} | {hit:false}
 * Never throws.
 */
function route(prompt, opts = {}) {
  try {
    // Periodic improvement pass (every IMPROVE_INTERVAL calls)
    _callCount++;
    if (_callCount % IMPROVE_INTERVAL === 0) {
      try { _periodicImprove(); } catch (_) { /* never throw */ }
    }

    const p = String(prompt || '');
    if (!p.trim()) return { hit: false };

    const cache = pruneCache(loadCache());
    const volatile = isVolatile(p);   // time-sensitive → never serve a cached LLM answer

    // 1) FETCH — exact normalized match (O(1) hash lookup — always cheapest first)
    const key = hashKey(p);
    const exact = cache[key];
    if (!volatile && exact && (exact.ts + (exact.ttl || DEFAULT_TTL_MS)) >= Date.now()) {
      const saved = estTokens(p) + estTokens(exact.answer);
      bumpStats((s) => {
        s.hits++; s.byMethod.fetch++; s.tokensSaved += saved;
        s.recentSaves.unshift({ ts: Date.now(), method: 'fetch', snippet: p.slice(0, 60), tokens: saved });
        if (s.recentSaves.length > MAX_RECENT_SAVES) s.recentSaves.length = MAX_RECENT_SAVES;
      });
      return { hit: true, method: 'fetch', answer: exact.answer, savedTokensEst: saved };
    }

    // 1b) SEED — curated knowledge base: stable, true facts served free on the FIRST ask.
    if (!volatile) {
      const seedExact = loadSeed().find((e) => e.key === key);
      if (seedExact) {
        const saved = estTokens(p) + estTokens(seedExact.answer);
        bumpStats((s) => {
          s.hits++; s.byMethod.seed = (s.byMethod.seed || 0) + 1; s.tokensSaved += saved;
          s.recentSaves.unshift({ ts: Date.now(), method: 'seed', snippet: p.slice(0, 60), tokens: saved });
          if (s.recentSaves.length > MAX_RECENT_SAVES) s.recentSaves.length = MAX_RECENT_SAVES;
        });
        return { hit: true, method: 'seed', answer: seedExact.answer, savedTokensEst: saved };
      }
    }

    // 2) COMPUTE — solve locally before fuzzy search.
    // Running COMPUTE before QUERY is critical: it prevents a cached "min of N..."
    // result from being returned for a "max of N..." query via cosine similarity.
    // Compute gives the exact answer for THIS prompt; QUERY is only for LLM answers.
    const computed = compute(p);
    if (computed !== null) {
      const saved = estTokens(p) + estTokens(computed);
      bumpStats((s) => {
        s.hits++; s.byMethod.compute++; s.tokensSaved += saved;
        s.recentSaves.unshift({ ts: Date.now(), method: 'compute', snippet: p.slice(0, 60), tokens: saved });
        if (s.recentSaves.length > MAX_RECENT_SAVES) s.recentSaves.length = MAX_RECENT_SAVES;
      });
      // Cache compute results so identical future prompts get an O(1) FETCH hit.
      try { recordAnswer(p, computed, opts); } catch (_) { /* ignore */ }
      return { hit: true, method: 'compute', answer: computed, savedTokensEst: saved };
    }

    // 3) QUERY — fuzzy match over cached LLM answers.
    // Only reached when COMPUTE returned null (non-computable prompt).
    // Cached compute results are in the pool but won't match different prompts
    // incorrectly because those prompts would have hit COMPUTE directly first.
    let best = null, bestSim = 0, bestIsSeed = false;
    // Pre-compute stop-word-filtered tokens for near-duplicate matching (improvement loop 4b)
    const pFiltered = simToks(p);
    const pfLen = pFiltered.length;
    const pfFreq = {}; for (const t of pFiltered) pfFreq[t] = (pfFreq[t] || 0) + 1;
    const pfMag = Math.sqrt(Object.values(pfFreq).reduce((acc, v) => acc + v * v, 0));
    for (const k of Object.keys(cache)) {
      const e = cache[k];
      if (!e) continue;
      // Raw cosine similarity (existing path)
      const simRaw = cosineSim(p, e.prompt);
      // Stop-word-filtered cosine — catches "what is X?" vs "X" near-duplicates
      let simFiltered = 0;
      if (pfLen) {
        const eToks = simToks(e.prompt);
        if (eToks.length) {
          const fb = {}; for (const t of eToks) fb[t] = (fb[t] || 0) + 1;
          let dot = 0; for (const t of Object.keys(pfFreq)) if (fb[t]) dot += pfFreq[t] * fb[t];
          const eMag = Math.sqrt(Object.values(fb).reduce((acc, v) => acc + v * v, 0));
          simFiltered = (pfMag && eMag) ? dot / (pfMag * eMag) : 0;
        }
      }
      const sim = Math.max(simRaw, simFiltered);
      if (sim > bestSim) { bestSim = sim; best = e; bestIsSeed = false; }
    }
    // also fuzzy-match the curated SEED (FAQ phrasings) — slightly looser cutoff since they're short + curated
    if (!volatile) {
      for (const e of loadSeed()) {
        const sim = cosineSim(p, e.prompt);
        if (sim > bestSim) { bestSim = sim; best = e; bestIsSeed = true; }
      }
    }
    const cutoff = bestIsSeed ? 0.7 : SIM_THRESHOLD;
    if (!volatile && best && bestSim >= cutoff) {
      const method = bestIsSeed ? 'seed' : 'query';
      const saved = estTokens(p) + estTokens(best.answer);
      bumpStats((s) => {
        s.hits++; s.byMethod[method] = (s.byMethod[method] || 0) + 1; s.tokensSaved += saved;
        s.recentSaves.unshift({ ts: Date.now(), method, snippet: p.slice(0, 60), tokens: saved, similarity: Math.round(bestSim * 1000) / 1000 });
        if (s.recentSaves.length > MAX_RECENT_SAVES) s.recentSaves.length = MAX_RECENT_SAVES;
      });
      return { hit: true, method, answer: best.answer, savedTokensEst: saved, similarity: Math.round(bestSim * 1000) / 1000 };
    }

    // Miss — compress the prompt before the caller hits the LLM.
    // This ensures tokensSaved > 0 on EVERY use (not just cache/compute hits).
    const { compressed, savedByCompression } = compressPrompt(p);
    bumpStats((s) => {
      s.misses++;
      s.tokensSaved += savedByCompression;
      if (savedByCompression > 0) s.missesWithSaving = (s.missesWithSaving || 0) + 1;
    });
    learnMiss(p);
    return { hit: false, compressed, compressionSaved: savedByCompression };
  } catch (_) {
    try {
      const { compressed, savedByCompression } = compressPrompt(String(prompt || ''));
      bumpStats((s) => {
        s.misses++;
        s.tokensSaved += savedByCompression;
        if (savedByCompression > 0) s.missesWithSaving = (s.missesWithSaving || 0) + 1;
      });
      learnMiss(String(prompt || ''));
      return { hit: false, compressed, compressionSaved: savedByCompression };
    } catch (_2) {}
    return { hit: false };
  }
}

/**
 * recordAnswer(prompt, answer, opts) — store an LLM answer for future reuse.
 * opts.ttlMs overrides default TTL. Never throws.
 *
 * Self-improvement: if this prompt has been missed >= PROMOTE_THRESHOLD times
 * (tracked by learnMiss), it is PROMOTED — stored with a 30-day TTL so it
 * never expires from routine cache churn.  The promotions counter in stats
 * reflects how many queries AURA has genuinely self-learned.
 */
function recordAnswer(prompt, answer, opts = {}) {
  try {
    const p = String(prompt || '');
    if (!p.trim() || answer === undefined || answer === null) return false;
    if (isVolatile(p)) { bumpStats((s) => { s.volatileSkips = (s.volatileSkips || 0) + 1; }); return false; }
    const cache = pruneCache(loadCache());
    const key   = hashKey(p);
    const norm  = normalize(p);

    // Determine TTL — promote frequently-missed queries to a 30-day lifetime.
    let ttl = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
    const s = _initStats();
    if (!s.promoted[norm] && (s.missFreq[norm] || 0) >= PROMOTE_THRESHOLD) {
      ttl = PROMOTED_TTL_MS;
      bumpStats((inner) => {
        inner.promoted[norm] = true;
        inner.promotions = (inner.promotions || 0) + 1;
        delete inner.missFreq[norm]; // no longer a miss candidate
      });
    }

    cache[key] = { prompt: p, answer: String(answer), ts: Date.now(), ttl };
    pruneCache(cache);
    return writeJson(CACHE_FILE, cache);
  } catch (_) {
    return false;
  }
}

/**
 * stats() — cumulative savings summary. Never throws.
 * Backward-compatible: all original fields present; new fields added:
 *   uses        — total prompts routed through AURA (hits + misses)
 *   improvements.promoted  — queries AURA auto-promoted to 30-day cache (real self-learning)
 *   improvements.topMissed — top 5 pending candidates (missed but not yet answered)
 */
function stats() {
  try {
    const s = _initStats();
    const total = s.hits + s.misses;
    const hitRate = total ? s.hits / total : 0;
    // everyUseSaveRate: fraction of uses where tokensSaved > 0 (hits always save; misses
    // save via compression). Target is ~1.0 — "every use saves tokens".
    const everyUseSaveRate = total
      ? (s.hits + (s.missesWithSaving || 0)) / total
      : 0;
    const costSavedUsd = (s.tokensSaved / 1000) * COST_PER_1K;
    let cacheEntries = 0; try { cacheEntries = Object.keys(loadCache()).length; } catch (_) {}
    // HONEST monthly projection: actual $ saved / actual days elapsed × 30.
    const elapsedDays = Math.max(1, (Date.now() - (s.firstTs || Date.now())) / 86400000);
    const projMonthlyUsd = Math.round((costSavedUsd / elapsedDays) * 30 * 1e4) / 1e4;

    // Top 5 pending promotion candidates (frequently missed, not yet answered/promoted)
    const topMissed = Object.entries(s.missFreq || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query, misses]) => ({ query, misses }));

    return {
      uses: total,                            // total times AURA was consulted
      hits: s.hits,
      misses: s.misses,
      hitRate: Math.round(hitRate * 1000) / 1000,
      everyUseSaveRate: Math.round(everyUseSaveRate * 1000) / 1000,
      tokensSaved: s.tokensSaved,
      costSavedUsd: Math.round(costSavedUsd * 1e6) / 1e6,
      volatileSkips: s.volatileSkips || 0,
      cacheEntries,
      avgTokensPerHit: s.hits ? Math.round(s.tokensSaved / s.hits) : 0,
      recipeFastPaths: (s.byMethod && s.byMethod.recipe) || 0,
      projMonthlyUsd,
      byMethod: s.byMethod,
      recentSaves: s.recentSaves || [],
      improvements: {
        promoted:      s.promotions || 0,     // queries auto-promoted to 30-day cache
        periodicSeeds: s.periodicSeeds || 0,  // near-dup answers auto-seeded by periodic pass
        topMissed,                            // top pending candidates for promotion
        hitRateHistory: Array.isArray(s.hitRateHistory) ? s.hitRateHistory.slice(-5) : []
      }
    };
  } catch (_) {
    return { uses: 0, hits: 0, misses: 0, hitRate: 0, everyUseSaveRate: 0, tokensSaved: 0,
      costSavedUsd: 0, volatileSkips: 0, cacheEntries: 0, avgTokensPerHit: 0, projMonthlyUsd: 0,
      byMethod: { fetch: 0, query: 0, compute: 0 }, recentSaves: [],
      improvements: { promoted: 0, topMissed: [] } };
  }
}

// ---------------------------------------------------------------------------
// Express router — lazy-require express so this module has ZERO hard deps.
// GET  /stats  -> stats()
// POST /route  -> body { prompt } -> route() result
// ---------------------------------------------------------------------------
function buildRouter() {
  let express;
  try { express = require('express'); } catch (_) { return null; }
  const r = express.Router();

  r.get('/stats', (req, res) => {
    res.json(stats());
  });

  r.post('/route', (req, res) => {
    const prompt = (req.body && req.body.prompt) || '';
    res.json(route(prompt, (req.body && req.body.opts) || {}));
  });

  return r;
}

/**
 * creditDeterministic(prompt, savedTokens) — credit a DETERMINISTIC recipe run.
 * Call this when a task was answered by real tool steps in a fixed order (no LLM
 * orchestration loop). Credits the saved orchestration tokens to AURA so the monitor shows it.
 * Never throws.
 */
function creditDeterministic(prompt, savedTokens) {
  try {
    const tk = Math.max(0, Number(savedTokens) || 0);
    bumpStats((s) => {
      s.hits++; s.tokensSaved += tk;
      s.byMethod.recipe = (s.byMethod.recipe || 0) + 1;
      s.recentSaves.unshift({ ts: Date.now(), method: 'recipe', snippet: String(prompt || '').slice(0, 60), tokens: tk });
      if (s.recentSaves.length > MAX_RECENT_SAVES) s.recentSaves.length = MAX_RECENT_SAVES;
    });
    return true;
  } catch (_) { return false; }
}

module.exports = { route, recordAnswer, creditDeterministic, isVolatile, stats, router: buildRouter() };
