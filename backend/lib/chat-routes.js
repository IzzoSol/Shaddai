/**
 * chat-routes.js — SHADDAI Realm Chat Router
 * NEXUS build · PIKADON-guarded · polling-safe (no WebSockets)
 *
 * Mount in server-production.js:
 *   const chatRoutes = require('./lib/chat-routes');
 *   app.use('/api/chat', chatRoutes);
 *
 * Channels:
 *   realm          — global realm-wide chat
 *   <roomId>       — per-building / per-room channel (e.g. "nexus", "dome", "lobby")
 *
 * Endpoints:
 *   GET  /api/chat/:channel[?since=<epoch_ms>]   → { messages, ts }
 *   POST /api/chat/:channel                      body: { name, text }  → { ok, message }
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const router   = express.Router();
const CHAT_FILE = path.join(__dirname, '../data/chat.json');

// ── Constants ──────────────────────────────────────────────────────────────
const CHANNEL_RE   = /^[a-z0-9_-]{1,24}$/i;
const MAX_PER_CHAN  = 500;   // stored messages per channel before oldest are pruned
const MAX_RETURNED  = 100;   // max messages returned per GET
const NAME_MAX      = 24;
const TEXT_MAX      = 300;
const RATE_WINDOW   = 1500;  // ms — 1 message per 1.5 s per IP

// ── Rate-limit store (in-memory, per IP) ──────────────────────────────────
const lastPost = new Map();   // ip → timestamp

function isRateLimited(ip) {
  const now = Date.now();
  const last = lastPost.get(ip) || 0;
  if (now - last < RATE_WINDOW) return true;
  lastPost.set(ip, now);
  // Prune old entries periodically to avoid unbounded growth
  if (lastPost.size > 5000) {
    const cutoff = now - RATE_WINDOW * 10;
    for (const [k, v] of lastPost) if (v < cutoff) lastPost.delete(k);
  }
  return false;
}

// ── Atomic file I/O ───────────────────────────────────────────────────────
let _db = null;  // in-memory cache; flushed to disk on every write

function loadDb() {
  if (_db) return _db;
  try {
    _db = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
  } catch (_) {
    _db = {};  // fresh start — file missing or corrupt
  }
  return _db;
}

function saveDb() {
  const tmp = CHAT_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(_db), 'utf8');
    fs.renameSync(tmp, CHAT_FILE);
  } catch (e) {
    console.error('[chat] save error', e.message);
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function getChannel(channelId) {
  const db = loadDb();
  if (!db[channelId]) db[channelId] = [];
  return db[channelId];
}

// ── Optional PIKADON scan ─────────────────────────────────────────────────
let pikadon = null;
try {
  pikadon = require('./pikadon-scan');
} catch (_) {
  // module absent — skip scanning, log once
  console.warn('[chat] pikadon-scan not found — text scanning disabled');
}

function scanText(raw) {
  if (!pikadon) return { blocked: false, text: raw };
  try {
    const v = pikadon.scanText(raw);
    return { blocked: v.risk === 'blocked', text: v.cleaned || raw };
  } catch (_) {
    return { blocked: false, text: raw };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function sanitizeStr(s, max) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, max);
}

function ts2epoch(s) {
  // Accept numeric string or ISO — return ms epoch or 0
  if (!s) return 0;
  const n = Number(s);
  if (!isNaN(n)) return n;
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ── GET /:channel ─────────────────────────────────────────────────────────
router.get('/:channel', (req, res) => {
  const { channel } = req.params;
  if (!CHANNEL_RE.test(channel)) {
    return res.status(400).json({ error: 'Invalid channel id' });
  }

  const since   = ts2epoch(req.query.since);
  const msgs    = getChannel(channel.toLowerCase());

  // Filter by since, cap to MAX_RETURNED newest
  const filtered = since > 0
    ? msgs.filter(m => m.at > since)
    : msgs;

  const result = filtered.slice(-MAX_RETURNED);

  return res.json({ channel, messages: result, ts: Date.now() });
});

// ── POST /:channel ────────────────────────────────────────────────────────
router.post('/:channel', (req, res) => {
  const { channel } = req.params;
  if (!CHANNEL_RE.test(channel)) {
    return res.status(400).json({ error: 'Invalid channel id' });
  }

  // Rate-limit by IP
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Slow down — 1 message per 1.5 s' });
  }

  // Parse + sanitize body
  const rawName = sanitizeStr(req.body?.name, NAME_MAX);
  const rawText = sanitizeStr(req.body?.text, TEXT_MAX);

  if (!rawName) return res.status(400).json({ error: 'name required (≤24 chars)' });
  if (!rawText) return res.status(400).json({ error: 'text required (≤300 chars)' });

  // PIKADON content scan
  const scan = scanText(rawText);
  if (scan.blocked) {
    return res.status(400).json({ error: 'Message blocked by content filter' });
  }

  const message = {
    id:   crypto.randomBytes(8).toString('hex'),
    name: rawName,
    text: scan.text,
    at:   Date.now(),
  };

  const chanKey = channel.toLowerCase();
  const db      = loadDb();
  if (!db[chanKey]) db[chanKey] = [];
  db[chanKey].push(message);

  // Prune to MAX_PER_CHAN oldest dropped
  if (db[chanKey].length > MAX_PER_CHAN) {
    db[chanKey] = db[chanKey].slice(-MAX_PER_CHAN);
  }

  saveDb();

  return res.status(201).json({ ok: true, message });
});

module.exports = router;
