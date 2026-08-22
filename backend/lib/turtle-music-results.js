// backend/lib/turtle-music-results.js — short-lived, ID-tagged search-result
// sets for @TurtleMusicBot. Replaces a single per-chat "last results" slot
// (which let a newer search silently make an older message's buttons play
// the wrong track) with independent, TTL'd sets addressed by a short id
// embedded in each button's callback_data.
'use strict';

const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const sets = new Map(); // id -> { chatId: string, tracks: object[], ts: number }

function sweep(now = Date.now()) {
  for (const [id, s] of sets) {
    if (now - s.ts > TTL_MS) sets.delete(id);
  }
}

function create(chatId, tracks, now = Date.now()) {
  sweep(now);
  const id = crypto.randomBytes(4).toString('hex');
  sets.set(id, { chatId: String(chatId), tracks, ts: now });
  return id;
}

function get(id, chatId, now = Date.now()) {
  const s = sets.get(id);
  if (!s) return null;
  if (now - s.ts > TTL_MS) { sets.delete(id); return null; }
  if (String(chatId) !== s.chatId) return null;
  return s.tracks;
}

function _clear() { sets.clear(); }

module.exports = { create, get, sweep, TTL_MS, _clear };
