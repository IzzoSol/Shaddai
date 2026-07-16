// token-db.js — JSON-file-backed persistence + learning-data layer for the crypto signals bot.
// Stores point-in-time token snapshots and final call outcomes so a later "learning"
// layer can analyze what made calls succeed or fail.
//
// Pure Node.js. NO npm dependencies (only fs + path). Fail-safe: no function throws
// out of the public API — every one returns a safe default on error.
//
// Storage shape (one JSON object):
//   { tokens: { [mintLower]: { mint, symbol, snapshots: [ {ts, ...} ], outcome: {...}|null, lastSeen } } }

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'token-db.json');

const MAX_TOKENS = 5000;          // cap total tokens tracked (evict oldest by lastSeen)
const MAX_SNAPS_PER_TOKEN = 50;   // cap snapshots-per-token (keep most recent)
const DEFAULT_MAX_AGE_MS = 30 * 24 * 3600 * 1000;  // 30 days

// ── low-level helpers (mirror telegram-core.js _ensure/_read/_write) ─────────
function _ensure() { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }
function _read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function _write(f, o) { try { _ensure(); fs.writeFileSync(f, JSON.stringify(o, null, 2)); } catch (e) {} }

function _load() {
  const db = _read(DB_FILE, { tokens: {} });
  if (!db || typeof db !== 'object' || !db.tokens || typeof db.tokens !== 'object') return { tokens: {} };
  return db;
}
function _save(db) { _write(DB_FILE, db); }

function _key(mint) { return String(mint == null ? '' : mint).toLowerCase(); }

// Evict oldest tokens (by lastSeen) if we exceed the cap.
function _evict(db) {
  try {
    const keys = Object.keys(db.tokens);
    if (keys.length <= MAX_TOKENS) return;
    keys.map(k => [k, db.tokens[k] && db.tokens[k].lastSeen || 0])
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - MAX_TOKENS)
        .forEach(([k]) => delete db.tokens[k]);
  } catch (e) {}
}

// ── public API ──────────────────────────────────────────────────────────────

// Append a timestamped snapshot { ...data, ts } under this mint; updates lastSeen.
function snapshot(mint, data) {
  try {
    const k = _key(mint);
    if (!k) return null;
    const db = _load();
    const now = Date.now();
    let rec = db.tokens[k];
    if (!rec) {
      rec = { mint: String(mint), symbol: '', snapshots: [], outcome: null, lastSeen: now };
      db.tokens[k] = rec;
    }
    const d = (data && typeof data === 'object') ? data : {};
    const snap = Object.assign({}, d, { ts: now });
    rec.snapshots.push(snap);
    if (rec.snapshots.length > MAX_SNAPS_PER_TOKEN) {
      rec.snapshots = rec.snapshots.slice(rec.snapshots.length - MAX_SNAPS_PER_TOKEN);
    }
    // capture symbol from snapshot data when present
    if (d.symbol != null && d.symbol !== '') rec.symbol = String(d.symbol);
    rec.lastSeen = now;
    _evict(db);
    _save(db);
    return snap;
  } catch (e) { return null; }
}

// -> array of snapshots (oldest->newest), [] if none.
function getHistory(mint) {
  try {
    const rec = _load().tokens[_key(mint)];
    return (rec && Array.isArray(rec.snapshots)) ? rec.snapshots.slice() : [];
  } catch (e) { return []; }
}

// -> most recent snapshot or null.
function latest(mint) {
  try {
    const rec = _load().tokens[_key(mint)];
    if (!rec || !Array.isArray(rec.snapshots) || !rec.snapshots.length) return null;
    return rec.snapshots[rec.snapshots.length - 1];
  } catch (e) { return null; }
}

// Store final result e.g. { peakMult, result:'win'|'loss'|'neutral', resolvedAt } merged onto the token record.
function recordOutcome(mint, outcome) {
  try {
    const k = _key(mint);
    if (!k) return null;
    const db = _load();
    let rec = db.tokens[k];
    const now = Date.now();
    if (!rec) {
      rec = { mint: String(mint), symbol: '', snapshots: [], outcome: null, lastSeen: now };
      db.tokens[k] = rec;
    }
    const o = (outcome && typeof outcome === 'object') ? outcome : {};
    rec.outcome = Object.assign({}, rec.outcome || {}, o);
    if (rec.outcome.resolvedAt == null) rec.outcome.resolvedAt = now;
    rec.lastSeen = now;
    _save(db);
    return rec.outcome;
  } catch (e) { return null; }
}

// -> outcome object or null.
function getOutcome(mint) {
  try {
    const rec = _load().tokens[_key(mint)];
    return (rec && rec.outcome) ? rec.outcome : null;
  } catch (e) { return null; }
}

// -> [{ mint, symbol, ...outcome, firstSnapshot }] for every token that has an outcome (for the learning layer).
function allOutcomes() {
  try {
    const db = _load();
    const out = [];
    for (const k of Object.keys(db.tokens)) {
      const rec = db.tokens[k];
      if (!rec || !rec.outcome) continue;
      const first = (Array.isArray(rec.snapshots) && rec.snapshots.length) ? rec.snapshots[0] : null;
      out.push(Object.assign({ mint: rec.mint, symbol: rec.symbol || '' }, rec.outcome, { firstSnapshot: first }));
    }
    return out;
  } catch (e) { return []; }
}

// -> [{ mint, symbol, snapshots:n, lastSeen, outcome }] summary list.
function allTokens() {
  try {
    const db = _load();
    return Object.keys(db.tokens).map(k => {
      const rec = db.tokens[k];
      return {
        mint: rec.mint,
        symbol: rec.symbol || '',
        snapshots: Array.isArray(rec.snapshots) ? rec.snapshots.length : 0,
        lastSeen: rec.lastSeen || 0,
        outcome: rec.outcome || null,
      };
    });
  } catch (e) { return []; }
}

// -> { tokens, withOutcomes, wins, losses, totalSnapshots }.
function stats() {
  try {
    const db = _load();
    let tokens = 0, withOutcomes = 0, wins = 0, losses = 0, totalSnapshots = 0;
    for (const k of Object.keys(db.tokens)) {
      const rec = db.tokens[k];
      if (!rec) continue;
      tokens++;
      if (Array.isArray(rec.snapshots)) totalSnapshots += rec.snapshots.length;
      if (rec.outcome) {
        withOutcomes++;
        if (rec.outcome.result === 'win') wins++;
        else if (rec.outcome.result === 'loss') losses++;
      }
    }
    return { tokens, withOutcomes, wins, losses, totalSnapshots };
  } catch (e) { return { tokens: 0, withOutcomes: 0, wins: 0, losses: 0, totalSnapshots: 0 }; }
}

// Remove tokens whose lastSeen older than maxAgeMs (default 30 days); returns count removed.
function prune(maxAgeMs) {
  try {
    const age = (typeof maxAgeMs === 'number' && maxAgeMs > 0) ? maxAgeMs : DEFAULT_MAX_AGE_MS;
    const cutoff = Date.now() - age;
    const db = _load();
    let removed = 0;
    for (const k of Object.keys(db.tokens)) {
      const rec = db.tokens[k];
      if (!rec || (rec.lastSeen || 0) < cutoff) { delete db.tokens[k]; removed++; }
    }
    if (removed) _save(db);
    return removed;
  } catch (e) { return 0; }
}

module.exports = {
  snapshot,
  getHistory,
  latest,
  recordOutcome,
  getOutcome,
  allOutcomes,
  allTokens,
  stats,
  prune,
};

// ── self-test ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const M = 'TEST_MINT_' + Date.now() + 'AbCdEf';   // mixed-case to prove normalization
  console.log('== token-db self-test ==');
  console.log('DB file:', DB_FILE);

  snapshot(M, { symbol: 'FAKE', price: 0.001, mcap: 12000, holders: 40 });
  snapshot(M, { symbol: 'FAKE', price: 0.004, mcap: 48000, holders: 130 });
  recordOutcome(M, { peakMult: 4.2, result: 'win', resolvedAt: Date.now() });

  console.log('\ngetHistory(mint) [oldest->newest]:');
  console.log(JSON.stringify(getHistory(M), null, 2));

  console.log('\nlatest(mint):');
  console.log(JSON.stringify(latest(M), null, 2));

  console.log('\ngetOutcome(mint):');
  console.log(JSON.stringify(getOutcome(M), null, 2));

  console.log('\nallOutcomes() (filtered to this mint):');
  console.log(JSON.stringify(allOutcomes().filter(o => o.mint === M), null, 2));

  console.log('\nstats():');
  console.log(JSON.stringify(stats(), null, 2));

  // round-trip proof: re-require a fresh view from disk via _load
  console.log('\nround-trip latest price from disk:', (latest(M) || {}).price);

  // clean up the test entry (easy — just delete it and save)
  try {
    const db = _load();
    delete db.tokens[M.toLowerCase()];
    _save(db);
    console.log('\ncleaned up test entry:', getOutcome(M) === null ? 'OK (removed)' : 'still present');
  } catch (e) { console.log('cleanup skipped:', e.message); }

  console.log('\nfile exists on disk:', fs.existsSync(DB_FILE));
  console.log('== done ==');
}
