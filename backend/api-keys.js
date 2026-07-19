/* ══════════════════════════════════════════════════════════════════════════
   api-keys.js — free-tier API key store + rate limiting for the public API.
   Keys are HASHED at rest (sha256); the raw key is shown only once at mint.
   Zero dependencies. Persists to backend/data/api-keys.json.

   Hardened (PIKADON audits 2026-07-19):
     • O(1) validate via a hash→record Map.
     • Token-bucket per-key limiter (no fixed-window 2× boundary burst) + daily cap.
     • Revocation / disable / idle-expiry — a leaked or abusive key can be killed.
     • Bounded key table: evicts DISABLED/EXPIRED/never-used keys first, so
       adversarial minting cannot silently evict legitimate active keys.
     • Atomic, non-blocking writes (temp-file + rename via an async queue); write
       failures are logged, never silently swallowed.
     • Callers MUST pass a TRUSTED ip (req.ip under `trust proxy`) to mintAllowed.

   NOTE: Render's free plan has no persistent disk, so runtime-minted keys reset
   on redeploy (documented). Multi-instance scaling would need a shared DB.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'api-keys.json');
const TMP = FILE + '.tmp';

const LIMITS = { free: { perMin: 60, perDay: 10000 } };  // add paid tiers here later
const MAX_KEYS = 20000;                 // cap on stored keys (evict spent/expired first)
const IDLE_TTL_MS = 90 * 24 * 3600 * 1000;   // keys idle > 90d are considered expired
const MAX_IP_WINDOWS = 20000;

function _read() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { keys: [] }; } }

// ── atomic, non-blocking persistence (temp-file + rename; serialized queue) ──
let _writing = false, _dirty = false;
function _persist() {
  if (_writing) { _dirty = true; return; }
  _writing = true;
  const json = JSON.stringify(_state, null, 2);
  fs.promises.writeFile(TMP, json)
    .then(() => fs.promises.rename(TMP, FILE))
    .catch((e) => { try { console.warn('[api-keys] persist failed:', e && e.message); } catch (_) {} })
    .finally(() => { _writing = false; if (_dirty) { _dirty = false; _persist(); } });
}
// synchronous atomic write (used once at seed reset / tests)
function _persistSync() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(TMP, JSON.stringify(_state, null, 2)); fs.renameSync(TMP, FILE); }
  catch (e) { try { console.warn('[api-keys] sync persist failed:', e && e.message); } catch (_) {} }
}

let _state = _read();
if (!_state.keys) _state.keys = [];

const _byHash = new Map();
for (const k of _state.keys) if (k && k.hash) _byHash.set(k.hash, k);

const _hash = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');
const _expired = (rec, now) => (rec.expiresAt && now >= rec.expiresAt) || (rec.lastUsedAt ? (now - rec.lastUsedAt) > IDLE_TTL_MS : (now - rec.createdAt) > IDLE_TTL_MS);
const _sanitizeLabel = (s) => String(s || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80);   // strip control chars (log-injection safe)

function _removeAt(i) {
  const dead = _state.keys.splice(i, 1)[0];
  if (dead) { _byHash.delete(dead.hash); _win.delete(dead.id); }
}
// Make room by dropping only DEAD keys (disabled → expired → never-used). If the
// table is genuinely full of live, used keys, REFUSE (return false) rather than
// evict a legitimate active key — so adversarial minting can't silently 401 a real user.
function _makeRoom() {
  const now = Date.now();
  if (_state.keys.length < MAX_KEYS) return true;
  let idx = _state.keys.findIndex(k => k.disabled);
  if (idx < 0) idx = _state.keys.findIndex(k => _expired(k, now));
  if (idx < 0) idx = _state.keys.findIndex(k => !k.count);
  if (idx < 0) return false;   // full of live keys → refuse (caller returns 503)
  _removeAt(idx);
  return true;
}

// Returns { key,id,tier } on success, or null if the store is at capacity (503).
function mint(label) {
  if (!_makeRoom()) return null;
  const raw = 'sk_live_' + crypto.randomBytes(24).toString('hex');
  const rec = {
    id: crypto.randomBytes(6).toString('hex'),
    hash: _hash(raw),
    prefix: raw.slice(0, 14) + '…',
    label: _sanitizeLabel(label),
    tier: 'free',
    createdAt: Date.now(),
    lastUsedAt: 0,
    count: 0,
    disabled: false,
  };
  _state.keys.push(rec);
  _byHash.set(rec.hash, rec);
  _persist();
  return { key: raw, id: rec.id, tier: rec.tier };
}

// Validate a raw key → record, or null. O(1). Rejects disabled/expired keys.
function validate(raw) {
  if (!raw) return null;
  const rec = _byHash.get(_hash(raw));
  if (!rec || rec.disabled) return null;
  if (_expired(rec, Date.now())) return null;
  return rec;
}

// Revoke by id or raw key. Returns true if a key was disabled.
function revoke(idOrKey) {
  let rec = _byHash.get(_hash(idOrKey));
  if (!rec) rec = _state.keys.find(k => k.id === idOrKey);
  if (!rec) return false;
  rec.disabled = true;
  _persist();
  return true;
}

// ── token-bucket per-key limiter (no boundary burst) + rolling daily cap ────
const _win = new Map();  // id → { tokens, last, dayStart, dayCount }
function rateCheck(rec) {
  const now = Date.now();
  const L = LIMITS[rec.tier] || LIMITS.free;
  let w = _win.get(rec.id);
  if (!w) { w = { tokens: L.perMin, last: now, dayStart: now, dayCount: 0 }; _win.set(rec.id, w); }
  // refill: perMin tokens per 60s, capped at perMin
  const refill = ((now - w.last) / 60000) * L.perMin;
  w.tokens = Math.min(L.perMin, w.tokens + refill);
  w.last = now;
  if (now - w.dayStart >= 86400000) { w.dayStart = now; w.dayCount = 0; }
  const haveToken = w.tokens >= 1;
  const underDay = w.dayCount < L.perDay;
  const ok = haveToken && underDay;
  if (ok) { w.tokens -= 1; w.dayCount += 1; }
  return {
    ok,
    limit: L.perMin,
    remaining: Math.max(0, Math.floor(w.tokens)),
    reset: Math.ceil((now + (1 - Math.min(w.tokens, 1)) * (60000 / L.perMin)) / 1000),
    perDay: L.perDay,
    dayRemaining: Math.max(0, L.perDay - w.dayCount),
  };
}

function recordUse(rec) {
  rec.lastUsedAt = Date.now();
  rec.count = (rec.count || 0) + 1;
  if (rec.count % 25 === 0) _persist();   // lazy persist (async, non-blocking)
}

function info(rec) {
  const w = _win.get(rec.id) || {};
  return {
    tier: rec.tier,
    created: rec.createdAt,
    count: rec.count || 0,
    limits: LIMITS[rec.tier] || LIMITS.free,
    usage: { remaining: Math.floor(w.tokens != null ? w.tokens : (LIMITS[rec.tier] || LIMITS.free).perMin), today: w.dayCount || 0 },
  };
}

// ── per-IP throttle on key minting (anti-spam). Pass a TRUSTED ip (req.ip). ──
const _ipWin = new Map();
function mintAllowed(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  if (_ipWin.size > MAX_IP_WINDOWS) { for (const [k, w] of _ipWin) if (now - w.start >= 3600000) _ipWin.delete(k); }
  let w = _ipWin.get(key);
  if (!w) { w = { start: now, count: 0 }; _ipWin.set(key, w); }
  if (now - w.start >= 3600000) { w.start = now; w.count = 0; }
  w.count++;
  return w.count <= 5;   // max 5 keys/hour/IP
}

module.exports = { mint, validate, revoke, rateCheck, recordUse, info, mintAllowed, LIMITS, _hash, _persistSync, _state };
