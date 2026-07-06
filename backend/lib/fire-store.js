'use strict';
// ============================================================================
// fire-store.js — FREE persistence via Firebase Firestore.
// Render's free tier has an ephemeral disk: backend/data/*.json is wiped on every
// redeploy/restart. This mirrors critical state (billing/customers/credits) into
// Firestore so it survives. Best-effort + graceful: if Firestore isn't configured
// or enabled, every call no-ops and callers keep using local JSON. Never throws.
// Reuses the firebase-admin app that auth-guard initializes (same service account).
// ============================================================================
let admin = null; try { admin = require('firebase-admin'); } catch (_) {}
let _db = null, _warned = false, _capWarned = false;

// ── Free-tier write budget ────────────────────────────────────────────────────
// Firebase Spark (free) allows 20,000 Firestore writes/day. We stay comfortably
// under that so we can NEVER hit a quota error or a surprise bill. When the daily
// budget is spent, saveDoc() no-ops and callers keep using local JSON — data is
// still safe in memory/disk that day; durable backups resume at UTC midnight.
const DAILY_WRITE_CAP = Number(process.env.FIRESTORE_DAILY_WRITE_CAP) || 18000;
let _writeDay = new Date().toISOString().slice(0, 10);
let _writes = 0;
function _rollWriteDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== _writeDay) { _writeDay = d; _writes = 0; _capWarned = false; }
}
function _budgetOk() { _rollWriteDay(); return _writes < DAILY_WRITE_CAP; }

function _ensureApp() {
  if (!admin) return false;
  if (admin.apps && admin.apps.length) return true; // reuse the app auth-guard made
  // Prefer the env-var JSON, but if it's absent/malformed, fall through to the
  // Render Secret File (GOOGLE_APPLICATION_CREDENTIALS). Having both is safe.
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }); return true; }
    catch (_) { /* env var mangled — try the Secret File path below */ }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { admin.initializeApp({ credential: admin.credential.applicationDefault() }); return true; }
    catch (_) {}
  }
  return false;
}

function db() {
  if (_db) return _db;
  if (!_ensureApp()) return null;
  try { _db = admin.firestore(); return _db; } catch (_) { return null; }
}

// true if a Firestore handle is available (creds present). Does not prove the API
// is enabled/reachable — use ping() for that.
function ready() { return !!db(); }

// Best-effort durable write. Fire-and-forget friendly (returns a promise but
// callers need not await). Wraps the payload so we can store arbitrary objects.
async function saveDoc(collection, id, obj) {
  const d = db(); if (!d) return false;
  if (!_budgetOk()) {
    if (!_capWarned) { _capWarned = true; console.warn(`[fire-store] daily Firestore write budget (${DAILY_WRITE_CAP}) reached — pausing durable backups until UTC midnight; local JSON still active`); }
    return false;
  }
  try {
    await d.collection(collection).doc(id).set({ data: obj, _updatedAt: Date.now() });
    _writes++;
    return true;
  } catch (e) {
    if (!_warned) { _warned = true; console.warn('[fire-store] save failed (will keep using local JSON):', e.message); }
    return false;
  }
}

async function loadDoc(collection, id) {
  const d = db(); if (!d) return null;
  try {
    const snap = await d.collection(collection).doc(id).get();
    return snap.exists ? (snap.data().data ?? null) : null;
  } catch (e) { return null; }
}

// Health probe — actually writes+reads a doc to confirm Firestore is enabled.
async function ping() {
  const d = db(); if (!d) return { ok: false, reason: 'firestore not configured (no key or admin sdk)' };
  try {
    await d.collection('_healthcheck').doc('ping').set({ t: Date.now(), from: 'shaddai' });
    const s = await d.collection('_healthcheck').doc('ping').get();
    return { ok: !!s.exists };
  } catch (e) {
    return { ok: false, code: e.code, reason: String(e.message).slice(0, 160) };
  }
}

// Usage snapshot for monitoring / the persistence health endpoint.
function stats() {
  _rollWriteDay();
  return { ready: ready(), writesToday: _writes, dailyWriteCap: DAILY_WRITE_CAP, budgetLeft: Math.max(0, DAILY_WRITE_CAP - _writes), day: _writeDay };
}

module.exports = { ready, saveDoc, loadDoc, ping, stats };
