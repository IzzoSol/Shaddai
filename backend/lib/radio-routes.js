// backend/lib/radio-routes.js — SHADDAI RADIO + City Bulletin
// ZEROX + NEXUS build — v1.0.0
//
// Mounted at /api/radio by server-production.js:
//   app.use('/api/radio', require('./lib/radio-routes'));
//
// Data shape in backend/data/radio.json:
//   { "tracks": [...], "bulletin": [...] }
//
// Endpoints:
//   POST   /api/radio/tracks         — submit a track to the rotation
//   GET    /api/radio/tracks         — get current rotation
//   DELETE /api/radio/tracks/:id     — remove your own track (?owner=submittedBy)
//   POST   /api/radio/bulletin       — post to city bulletin
//   GET    /api/radio/bulletin       — recent bulletin posts (newest first)

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const router   = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'radio.json');

// ─── Limits ──────────────────────────────────────────────────────────────────
const MAX_TRACKS   = 200;
const MAX_BULLETIN = 200;
const MAX_TITLE    = 120;
const MAX_ARTIST   = 80;
const MAX_URL      = 512;
const MAX_NAME     = 60;
const MAX_MESSAGE  = 400;
const MAX_TAG      = 30;
const ALLOWED_TAGS = ['collab', 'gig', 'post', 'wanted', 'event', 'other'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Load store from disk; returns default shape on any error. */
function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { tracks: [], bulletin: [] };
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      tracks:   Array.isArray(parsed.tracks)   ? parsed.tracks   : [],
      bulletin: Array.isArray(parsed.bulletin) ? parsed.bulletin : [],
    };
  } catch (_) {
    return { tracks: [], bulletin: [] };
  }
}

/** Write store atomically via a tmp file → rename. */
function save(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

/** Strip HTML tags and trim; cap to maxLen. */
function sanitize(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

/** Validate that a URL is http(s) and looks like an audio/stream resource.
 *  We accept any http(s) URL — browsers will tell the user if it's not audio. */
function isValidAudioUrl(val) {
  if (typeof val !== 'string') return false;
  let u;
  try { u = new URL(val); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  // Reject bare IP-only localhost to block SSRF to internal endpoints
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
  return true;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/radio/tracks
// body: { title, artist, url, submittedBy }
router.post('/tracks', express.json({ limit: '16kb' }), (req, res) => {
  try {
    const b = req.body || {};

    const title       = sanitize(b.title,       MAX_TITLE);
    const artist      = sanitize(b.artist,      MAX_ARTIST);
    const url         = sanitize(b.url,         MAX_URL);
    const submittedBy = sanitize(b.submittedBy, MAX_NAME) || 'anonymous';

    if (!title)              return res.status(400).json({ ok: false, error: 'title is required' });
    if (!artist)             return res.status(400).json({ ok: false, error: 'artist is required' });
    if (!url)                return res.status(400).json({ ok: false, error: 'url is required' });
    if (!isValidAudioUrl(url)) return res.status(400).json({ ok: false, error: 'url must be a public http(s) audio/stream link' });

    // ── PIKADON security scan (SSRF / malicious URL) ──
    try {
      const v = require('./pikadon-scan').scanUrl(url, { expect: 'audio' });
      if (v.risk === 'blocked') return res.status(400).json({ ok: false, error: 'URL blocked by PIKADON', reasons: v.reasons });
    } catch (_e) {}

    const store = load();

    // Cap rotation
    if (store.tracks.length >= MAX_TRACKS) {
      store.tracks = store.tracks.slice(store.tracks.length - (MAX_TRACKS - 1));
    }

    const track = {
      id:          newId(),
      title,
      artist,
      url,
      submittedBy,
      createdAt:   new Date().toISOString(),
    };

    store.tracks.push(track);
    save(store);

    res.status(201).json({ ok: true, track });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// GET /api/radio/tracks
router.get('/tracks', (req, res) => {
  try {
    const store = load();
    res.json({ ok: true, tracks: store.tracks });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// DELETE /api/radio/tracks/:id?owner=submittedBy
router.delete('/tracks/:id', (req, res) => {
  try {
    const store  = load();
    const id     = String(req.params.id || '');
    const owner  = sanitize(req.query.owner, MAX_NAME);
    const idx    = store.tracks.findIndex(t => t.id === id);

    if (idx === -1) return res.status(404).json({ ok: false, error: 'track not found' });

    const track = store.tracks[idx];
    // Allow removal if owner matches submittedBy, or if submittedBy is 'anonymous'
    if (track.submittedBy !== 'anonymous' && owner !== track.submittedBy) {
      return res.status(403).json({ ok: false, error: 'only the track submitter can remove it' });
    }

    store.tracks.splice(idx, 1);
    save(store);
    res.json({ ok: true, removed: track });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// POST /api/radio/bulletin
// body: { name, message, tag }
router.post('/bulletin', express.json({ limit: '16kb' }), (req, res) => {
  try {
    const b = req.body || {};

    const name    = sanitize(b.name,    MAX_NAME)    || 'Anonymous';
    const message = sanitize(b.message, MAX_MESSAGE);
    let   tag     = sanitize(b.tag,     MAX_TAG).toLowerCase();

    if (!message) return res.status(400).json({ ok: false, error: 'message is required' });
    if (!ALLOWED_TAGS.includes(tag)) tag = 'post';

    // ── PIKADON scan bulletin text (XSS/injection) — use the cleaned version ──
    let _msg = message;
    try {
      const v = require('./pikadon-scan').scanText(message);
      if (v.risk === 'blocked') return res.status(400).json({ ok: false, error: 'Content blocked by PIKADON', reasons: v.reasons });
      if (v.cleaned) _msg = v.cleaned;
    } catch (_e) {}

    const store = load();

    // Cap bulletin
    if (store.bulletin.length >= MAX_BULLETIN) {
      store.bulletin = store.bulletin.slice(store.bulletin.length - (MAX_BULLETIN - 1));
    }

    const post = {
      id:        newId(),
      name,
      tag,
      message: _msg,
      createdAt: new Date().toISOString(),
    };

    store.bulletin.push(post);
    save(store);

    res.status(201).json({ ok: true, post });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// GET /api/radio/bulletin
router.get('/bulletin', (req, res) => {
  try {
    const store = load();
    // newest first
    const posts = store.bulletin.slice().reverse();
    res.json({ ok: true, posts });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

module.exports = router;
