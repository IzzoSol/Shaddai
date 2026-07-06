'use strict';
// ============================================================================
// profile-routes.js — user PROFILE / ACCOUNT persistence.
// Mounted by server-production.js at base path `/api/profile`.
//   POST /api/profile        { uid, displayName, bio, goal, avatarEmoji }
//   GET  /api/profile/:uid   -> { ok:true, profile }
//
// Durable-first: writes to Firestore (collection 'shaddai_profiles') via
// backend/lib/fire-store.js so profiles survive Render redeploys for FREE.
// Always ALSO mirrors to a local backend/data/profiles.json so it works even
// when Firestore is down / unconfigured. Defensive: never throws to Express.
// ============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// fire-store is best-effort; if it can't load we just use local JSON.
let store = null;
try { store = require('./lib/fire-store'); } catch (_) { store = null; }

const FS_COLLECTION = 'shaddai_profiles';
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_FILE = path.join(DATA_DIR, 'profiles.json');

// ── local JSON helpers (never throw) ────────────────────────────────────────
function readLocal() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return {};
    const raw = fs.readFileSync(LOCAL_FILE, 'utf8');
    const obj = JSON.parse(raw || '{}');
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (_) { return {}; }
}
function writeLocal(all) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(all, null, 2));
    return true;
  } catch (_) { return false; }
}

// ── sanitize + shape the incoming profile ───────────────────────────────────
function str(v, max) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}
function buildProfile(uid, body) {
  return {
    uid: String(uid),
    displayName: str(body.displayName, 80),
    bio: str(body.bio, 500),
    goal: str(body.goal, 280),
    avatarEmoji: str(body.avatarEmoji, 8) || '👤',
    updatedAt: Date.now()
  };
}

// ── POST /  (base path is /api/profile) ──────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const uid = str(body.uid, 128);
    if (!uid) return res.status(400).json({ ok: false, error: 'uid required' });

    // Beta capacity gate — only blocks BRAND-NEW accounts once BETA_USER_CAP is hit.
    // No-op when the cap is unset (default). Existing profiles are always allowed.
    try {
      const betaCap = require('./beta-cap');
      const isExisting = !!readLocal()[uid];
      const cap = betaCap.check(uid, isExisting);
      if (!cap.admit) return res.status(403).json({ ok: false, full: true, error: "SHADDAI's private beta is full right now — join the waitlist and we'll let you in soon.", cap: cap.cap });
    } catch (_) {}

    const profile = buildProfile(uid, body);

    // Durable write (best-effort — returns false if Firestore unavailable).
    if (store && typeof store.saveDoc === 'function') {
      try { await store.saveDoc(FS_COLLECTION, uid, profile); } catch (_) {}
    }
    // Always mirror locally so reads work without Firestore.
    const all = readLocal();
    all[uid] = profile;
    writeLocal(all);

    return res.json({ ok: true, profile });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
});

// ── GET /:uid ────────────────────────────────────────────────────────────────
router.get('/:uid', async (req, res) => {
  try {
    const uid = str(req.params.uid, 128);
    if (!uid) return res.status(400).json({ ok: false, error: 'uid required' });

    // Firestore first (survives redeploys), then local fallback.
    let profile = null;
    if (store && typeof store.loadDoc === 'function') {
      try { profile = await store.loadDoc(FS_COLLECTION, uid); } catch (_) { profile = null; }
    }
    if (!profile) {
      const all = readLocal();
      profile = all[uid] || null;
    }
    return res.json({ ok: true, profile: profile || null });
  } catch (e) {
    return res.status(200).json({ ok: true, profile: null, error: String(e && e.message || e) });
  }
});

module.exports = router;
