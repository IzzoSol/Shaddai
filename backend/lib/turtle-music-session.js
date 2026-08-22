// backend/lib/turtle-music-session.js — per-chat play queue + auto-advance
// timer for @TurtleMusicBot. In-memory only (resets on server restart, same
// limitation the bot already had for its old per-chat result cache).
// Pure state container: sending tracks and pushing history are the caller's
// job (backend/turtle-music-bot.js) — this module never touches Telegram.
'use strict';

const sessions = new Map(); // chatId(string) -> { queue, pos, paused, timer, ownerId }

function key(chatId) { return String(chatId); }

function startSession(chatId, tracks, ownerId) {
  clearSession(chatId);
  const s = { queue: (tracks || []).slice(), pos: 0, paused: false, timer: null, ownerId, radio: true };
  sessions.set(key(chatId), s);
  return s;
}

function getSession(chatId) { return sessions.get(key(chatId)) || null; }

function setRadio(chatId, on) {
  const s = getSession(chatId);
  if (s) s.radio = !!on;
  return !!on;
}

function isRadio(chatId) {
  const s = getSession(chatId);
  return s ? s.radio !== false : true; // no session yet → the next one will default to radio-on
}

function current(chatId) {
  const s = getSession(chatId);
  return s ? (s.queue[s.pos] || null) : null;
}

function upcoming(chatId) {
  const s = getSession(chatId);
  return s ? s.queue.slice(s.pos + 1) : [];
}

function lastPlayed(chatId) {
  const s = getSession(chatId);
  if (!s || !s.queue.length) return null;
  return s.queue[s.queue.length - 1];
}

function advance(chatId) {
  const s = getSession(chatId);
  if (!s) return null;
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  s.pos += 1;
  return s.queue[s.pos] || null;
}

function appendAndAdvance(chatId, tracks) {
  const s = getSession(chatId);
  if (!s || !tracks || !tracks.length) return null;
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  const startIndex = s.queue.length;
  s.queue.push(...tracks);
  s.pos = startIndex; // position at the first newly-appended track
  return s.queue[s.pos] || null;
}

function armTimer(chatId, cb) {
  const s = getSession(chatId);
  if (!s || s.paused) return false;
  const track = s.queue[s.pos];
  if (!track) return false;
  if (s.timer) clearTimeout(s.timer);
  const ms = Math.max(5, Number(track.duration) || 30) * 1000;
  s.timer = setTimeout(cb, ms);
  return true;
}

function pause(chatId) {
  const s = getSession(chatId);
  if (!s) return false;
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  s.paused = true;
  return true;
}

function resume(chatId) {
  const s = getSession(chatId);
  if (!s || !s.paused) return false;
  s.paused = false;
  return true;
}

function enqueue(chatId, track) {
  const s = getSession(chatId);
  if (!s) { startSession(chatId, [track]); return [track]; }
  s.queue.push(track);
  return s.queue;
}

function clearSession(chatId) {
  const s = getSession(chatId);
  if (s && s.timer) clearTimeout(s.timer);
  sessions.delete(key(chatId));
}

function _clearAll() {
  for (const [, s] of sessions) { if (s.timer) clearTimeout(s.timer); }
  sessions.clear();
}

module.exports = {
  startSession, getSession, current, upcoming, advance, armTimer,
  pause, resume, enqueue, clearSession, _clearAll,
  setRadio, isRadio, lastPlayed, appendAndAdvance,
};
