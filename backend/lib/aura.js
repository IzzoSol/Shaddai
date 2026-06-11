'use strict';
/**
 * SHADDAI AURA — In-process, dependency-free "token saver".
 *
 * AURA tries to answer prompts WITHOUT calling an LLM, cheapest path first:
 *   1. FETCH   — exact cache hit (normalized prompt -> sha256 key).
 *   2. QUERY   — fuzzy cache hit (word-overlap cosine similarity >= 0.82).
 *   3. COMPUTE — solve locally for pure math / date / unit-convert / base64 /
 *                word-count / simple casing (regex-detected; math uses a SAFE
 *                tokenizing evaluator — NEVER eval()/Function()).
 *
 * If none apply, route() returns { hit:false } and the caller should hit the LLM,
 * then feed the answer back via recordAnswer() so future calls are free.
 *
 * Why: free tiers exhaust fast. Every cache/compute hit = real saved tokens/$$.
 *
 * Uses ONLY node built-ins (fs, path, crypto). Never throws to the caller.
 *
 * Exports: { route, recordAnswer, stats, router }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config + persistence paths
// ---------------------------------------------------------------------------
const DATA_DIR     = path.join(__dirname, '..', 'data');
const CACHE_FILE   = path.join(DATA_DIR, 'aura-cache.json');
const STATS_FILE   = path.join(DATA_DIR, 'aura-stats.json');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ENTRIES    = 1000;                 // cap; evict oldest beyond this
const SIM_THRESHOLD  = 0.82;                 // fuzzy match cutoff
const COST_PER_1K    = 0.0005;               // ~$ per 1k tokens (rough blended)
const CHARS_PER_TOK  = 4;                     // crude tokens ≈ chars / 4

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
// Stats tracking (cumulative, persisted)
// ---------------------------------------------------------------------------
function loadStats() {
  return readJson(STATS_FILE, {
    hits: 0,
    misses: 0,
    tokensSaved: 0,
    byMethod: { fetch: 0, query: 0, compute: 0 }
  });
}
function bumpStats(mut) {
  try {
    const s = loadStats();
    mut(s);
    writeJson(STATS_FILE, s);
  } catch (_) { /* ignore */ }
}
function estTokens(str) {
  return Math.max(1, Math.ceil(String(str || '').length / CHARS_PER_TOK));
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
    let t = m[i];
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
  // Trim float noise
  return String(Math.round(st[0] * 1e10) / 1e10);
}

// --- unit conversions (length / weight / temperature) ---
const UNIT_FACTORS = {
  // length -> meters
  mm: 0.001, cm: 0.01, m: 1, km: 1000,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
  yd: 0.9144, yard: 0.9144, yards: 0.9144,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  // weight -> grams
  mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592
};
const LENGTH = new Set(['mm', 'cm', 'm', 'km', 'in', 'inch', 'inches', 'ft', 'foot', 'feet', 'yd', 'yard', 'yards', 'mi', 'mile', 'miles']);
const WEIGHT = new Set(['mg', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds']);

function convertUnits(prompt) {
  // e.g. "convert 10 km to miles" / "10 kg in lbs"
  const m = prompt.toLowerCase().match(/(-?\d+\.?\d*)\s*([a-z]+)\s*(?:to|in|into)\s*([a-z]+)/);
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
  const sameDim = (LENGTH.has(from) && LENGTH.has(to)) || (WEIGHT.has(from) && WEIGHT.has(to));
  if (!sameDim) return null;
  const r = (val * UNIT_FACTORS[from]) / UNIT_FACTORS[to];
  return `${Math.round(r * 1e6) / 1e6} ${to}`;
}

function base64Op(prompt) {
  // "base64 encode hello" / "base64 decode aGVsbG8="
  let m = prompt.match(/base64\s+encode\s+(.+)/i);
  if (m) return Buffer.from(m[1].trim(), 'utf8').toString('base64');
  m = prompt.match(/base64\s+decode\s+(.+)/i);
  if (m) {
    try { return Buffer.from(m[1].trim(), 'base64').toString('utf8'); } catch (_) { return null; }
  }
  return null;
}

function wordCountOp(prompt) {
  // "word count of: the quick brown fox" / "how many words in <text>"
  let m = prompt.match(/(?:word count(?:\s+of)?|how many words(?:\s+(?:are\s+)?in)?)\s*:?\s*(.+)/i);
  if (!m) return null;
  const txt = m[1].trim().replace(/^["']|["']$/g, '');
  if (!txt) return null;
  return String(txt.split(/\s+/).filter(Boolean).length);
}

function formatOp(prompt) {
  // "uppercase: hello" / "lowercase hello" / "reverse: abc"
  let m = prompt.match(/^\s*(uppercase|lowercase|reverse)\s*:?\s*(.+)/i);
  if (!m) return null;
  const op = m[1].toLowerCase(), txt = m[2].trim().replace(/^["']|["']$/g, '');
  if (op === 'uppercase') return txt.toUpperCase();
  if (op === 'lowercase') return txt.toLowerCase();
  if (op === 'reverse') return txt.split('').reverse().join('');
  return null;
}

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

/**
 * Try to compute an answer locally. Returns a string answer or null.
 * Ordered so cheap/specific detectors run before generic math.
 */
function compute(prompt) {
  const raw = String(prompt || '').trim();
  if (!raw) return null;

  // Non-math specialized solvers first (they have keywords).
  const date = dateOp(raw);        if (date !== null) return date;
  const b64 = base64Op(raw);       if (b64 !== null) return b64;
  const wc = wordCountOp(raw);     if (wc !== null) return wc;
  const fmt = formatOp(raw);       if (fmt !== null) return fmt;
  const conv = convertUnits(raw);  if (conv !== null) return conv;

  // Math: strip a leading natural-language wrapper, keep the arithmetic core.
  let mathSrc = raw
    .replace(/^\s*(what(?:'s| is)|calculate|compute|solve|eval(?:uate)?|how much is)\b/i, '')
    .replace(/[?=]/g, '')
    .replace(/\bx\b/gi, '*')   // "3 x 4" -> "3 * 4"
    .trim();
  // Only attempt if it looks purely arithmetic (digits + operators/parens).
  if (/^[\d\s+\-*/%^().]+$/.test(mathSrc) && /\d/.test(mathSrc)) {
    const r = safeMath(mathSrc);
    if (r !== null) return r;
  }
  return null;
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
    const p = String(prompt || '');
    if (!p.trim()) return { hit: false };

    const cache = pruneCache(loadCache());

    // 1) FETCH — exact normalized match
    const key = hashKey(p);
    const exact = cache[key];
    if (exact && (exact.ts + (exact.ttl || DEFAULT_TTL_MS)) >= Date.now()) {
      const saved = estTokens(p) + estTokens(exact.answer);
      bumpStats((s) => { s.hits++; s.byMethod.fetch++; s.tokensSaved += saved; });
      return { hit: true, method: 'fetch', answer: exact.answer, savedTokensEst: saved };
    }

    // 2) QUERY — fuzzy match over cached prompts
    let best = null, bestSim = 0;
    for (const k of Object.keys(cache)) {
      const e = cache[k];
      if (!e) continue;
      const sim = cosineSim(p, e.prompt);
      if (sim > bestSim) { bestSim = sim; best = e; }
    }
    if (best && bestSim >= SIM_THRESHOLD) {
      const saved = estTokens(p) + estTokens(best.answer);
      bumpStats((s) => { s.hits++; s.byMethod.query++; s.tokensSaved += saved; });
      return { hit: true, method: 'query', answer: best.answer, savedTokensEst: saved, similarity: Math.round(bestSim * 1000) / 1000 };
    }

    // 3) COMPUTE — solve locally
    const computed = compute(p);
    if (computed !== null) {
      const saved = estTokens(p) + estTokens(computed);
      bumpStats((s) => { s.hits++; s.byMethod.compute++; s.tokensSaved += saved; });
      // Cache compute results too (cheap future fetch hits).
      try { recordAnswer(p, computed, opts); } catch (_) { /* ignore */ }
      return { hit: true, method: 'compute', answer: computed, savedTokensEst: saved };
    }

    // Miss — caller should hit the LLM.
    bumpStats((s) => { s.misses++; });
    return { hit: false };
  } catch (_) {
    // Resilient: any failure = treat as miss (caller falls back to LLM).
    try { bumpStats((s) => { s.misses++; }); } catch (_) {}
    return { hit: false };
  }
}

/**
 * recordAnswer(prompt, answer, opts) — store an LLM answer for future reuse.
 * opts.ttlMs overrides default TTL. Never throws.
 */
function recordAnswer(prompt, answer, opts = {}) {
  try {
    const p = String(prompt || '');
    if (!p.trim() || answer === undefined || answer === null) return false;
    const cache = pruneCache(loadCache());
    const key = hashKey(p);
    cache[key] = {
      prompt: p,
      answer: String(answer),
      ts: Date.now(),
      ttl: Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS
    };
    pruneCache(cache); // re-cap after insert
    return writeJson(CACHE_FILE, cache);
  } catch (_) {
    return false;
  }
}

/**
 * stats() — cumulative savings summary. Never throws.
 */
function stats() {
  try {
    const s = loadStats();
    const total = s.hits + s.misses;
    const hitRate = total ? s.hits / total : 0;
    const costSavedUsd = (s.tokensSaved / 1000) * COST_PER_1K;
    return {
      hits: s.hits,
      misses: s.misses,
      hitRate: Math.round(hitRate * 1000) / 1000,
      tokensSaved: s.tokensSaved,
      costSavedUsd: Math.round(costSavedUsd * 1e6) / 1e6,
      byMethod: s.byMethod
    };
  } catch (_) {
    return { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0, costSavedUsd: 0, byMethod: { fetch: 0, query: 0, compute: 0 } };
  }
}

// ---------------------------------------------------------------------------
// AURA local capabilities (what COMPUTE can solve without an LLM).
// Surfaced via GET /tools so the dashboard can list AURA's offline powers.
// ---------------------------------------------------------------------------
const CAPABILITIES = [
  'fetch-cache',     // exact normalized cache hit
  'fuzzy-cache',     // word-overlap similarity cache hit
  'math',            // safe arithmetic evaluator
  'unit-convert',    // length / weight / temperature
  'base64',          // encode / decode
  'word-count',      // count words in text
  'text-format',     // uppercase / lowercase / reverse
  'date-time'        // current date / time
];

// Extract the user message from a flexible chat/task body shape.
function extractMessage(body) {
  if (!body || typeof body !== 'object') return '';
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  if (typeof body.task === 'string' && body.task.trim()) return body.task;
  if (typeof body.prompt === 'string' && body.prompt.trim()) return body.prompt;
  if (Array.isArray(body.messages) && body.messages.length) {
    const last = body.messages[body.messages.length - 1];
    if (last && typeof last.content === 'string') return last.content;
    if (typeof last === 'string') return last;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Express router — lazy-require express so this module has ZERO hard deps.
// GET  /stats  -> stats()
// POST /route  -> body { prompt } -> route() result
// GET  /health -> liveness + stats
// POST /chat   -> body { message | messages } -> route() result (cache/compute or miss)
// POST /task   -> body { task | message } -> route() result
// GET  /tools  -> AURA local capability names
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

  // Liveness — lets the dashboard confirm AURA is mounted and alive.
  r.get('/health', (req, res) => {
    try {
      res.json({ ok: true, enabled: true, stats: stats() });
    } catch (_) {
      res.json({ ok: true, enabled: true, stats: null });
    }
  });

  // Chat — try a no-LLM answer; on miss, tell caller to use the LLM.
  // AURA NEVER calls an LLM itself; the main app handles that on a miss.
  r.post('/chat', (req, res) => {
    try {
      const message = extractMessage(req.body);
      const opts = (req.body && req.body.opts) || {};
      const result = route(message, opts);
      if (result && result.hit) {
        res.json({
          ok: true,
          source: 'aura-' + result.method,
          response: result.answer,
          savedTokensEst: result.savedTokensEst,
          hit: true
        });
      } else {
        res.json({
          ok: true,
          hit: false,
          source: 'miss',
          note: 'no cache/compute hit — caller should use the LLM'
        });
      }
    } catch (_) {
      res.json({ ok: true, hit: false, source: 'miss', note: 'no cache/compute hit — caller should use the LLM' });
    }
  });

  // Task — same idea as /chat; treat the task text as the message.
  r.post('/task', (req, res) => {
    try {
      const message = extractMessage(req.body);
      const opts = (req.body && req.body.opts) || {};
      const result = route(message, opts);
      if (result && result.hit) {
        res.json({
          ok: true,
          source: 'aura-' + result.method,
          response: result.answer,
          savedTokensEst: result.savedTokensEst,
          hit: true
        });
      } else {
        res.json({
          ok: true,
          hit: false,
          source: 'miss',
          note: 'no cache/compute hit — caller should use the LLM'
        });
      }
    } catch (_) {
      res.json({ ok: true, hit: false, source: 'miss', note: 'no cache/compute hit — caller should use the LLM' });
    }
  });

  // Tools — AURA's offline capability list (non-404 so the panel renders).
  r.get('/tools', (req, res) => {
    try {
      res.json({ ok: true, tools: CAPABILITIES.slice() });
    } catch (_) {
      res.json({ ok: true, tools: [] });
    }
  });

  return r;
}

module.exports = { route, recordAnswer, stats, router: buildRouter() };
