/* ══════════════════════════════════════════════════════════════════════════
   api-keys.js — free-tier API key store + rate limiting for the public API.
   Keys are HASHED at rest (sha256); the raw key is shown only once at mint.
   Zero dependencies. Persists to backend/data/api-keys.json.

   NOTE: Render's free plan has no persistent disk, so runtime-minted keys reset
   on redeploy (documented limitation — users re-mint in one click at /api).
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'api-keys.json');

// Per-tier limits. Adding a paid tier later = one entry here (no rewrite).
const LIMITS = {
  free: { perMin: 60, perDay: 10000 },
};

function _read() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { keys: [] }; } }
function _write(o) { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(o, null, 2)); } catch (e) { /* fail-safe */ } }

let _state = _read();
if (!_state.keys) _state.keys = [];

const _hash = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');

// Mint a new free-tier key. Returns the RAW key (shown once) + id/tier.
function mint(label) {
  const raw = 'sk_live_' + crypto.randomBytes(24).toString('hex');
  const rec = {
    id: crypto.randomBytes(6).toString('hex'),
    hash: _hash(raw),
    prefix: raw.slice(0, 14) + '…',
    label: String(label || '').slice(0, 80),
    tier: 'free',
    createdAt: Date.now(),
    lastUsedAt: 0,
    count: 0,
  };
  _state.keys.push(rec);
  _write(_state);
  return { key: raw, id: rec.id, tier: rec.tier };
}

// Validate a raw key → its record, or null.
function validate(raw) {
  if (!raw) return null;
  const h = _hash(raw);
  return _state.keys.find(k => k.hash === h) || null;
}

// ── per-key sliding rate windows (in-memory) ────────────────────────────────
const _win = new Map();  // id → { minStart, minCount, dayStart, dayCount }
function rateCheck(rec) {
  const now = Date.now();
  const L = LIMITS[rec.tier] || LIMITS.free;
  let w = _win.get(rec.id);
  if (!w) { w = { minStart: now, minCount: 0, dayStart: now, dayCount: 0 }; _win.set(rec.id, w); }
  if (now - w.minStart >= 60000) { w.minStart = now; w.minCount = 0; }
  if (now - w.dayStart >= 86400000) { w.dayStart = now; w.dayCount = 0; }
  w.minCount++; w.dayCount++;
  const okMin = w.minCount <= L.perMin;
  const okDay = w.dayCount <= L.perDay;
  return {
    ok: okMin && okDay,
    limit: L.perMin,
    remaining: Math.max(0, L.perMin - w.minCount),
    reset: Math.ceil((w.minStart + 60000) / 1000),
    perDay: L.perDay,
    dayRemaining: Math.max(0, L.perDay - w.dayCount),
  };
}

function recordUse(rec) {
  rec.lastUsedAt = Date.now();
  rec.count = (rec.count || 0) + 1;
  if (rec.count % 25 === 0) _write(_state);   // lazy persist (avoid a write per request)
}

function info(rec) {
  const w = _win.get(rec.id) || {};
  return {
    tier: rec.tier,
    created: rec.createdAt,
    count: rec.count || 0,
    limits: LIMITS[rec.tier] || LIMITS.free,
    usage: { minute: w.minCount || 0, today: w.dayCount || 0 },
  };
}

// ── per-IP throttle on key minting (anti-spam) ──────────────────────────────
const _ipWin = new Map();
function mintAllowed(ip) {
  const now = Date.now();
  let w = _ipWin.get(ip);
  if (!w) { w = { start: now, count: 0 }; _ipWin.set(ip, w); }
  if (now - w.start >= 3600000) { w.start = now; w.count = 0; }
  w.count++;
  return w.count <= 5;   // max 5 keys/hour/IP
}

module.exports = { mint, validate, rateCheck, recordUse, info, mintAllowed, LIMITS, _hash };
