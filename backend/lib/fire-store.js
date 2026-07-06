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
let _db = null, _warned = false;

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
  try {
    await d.collection(collection).doc(id).set({ data: obj, _updatedAt: Date.now() });
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

module.exports = { ready, saveDoc, loadDoc, ping };
