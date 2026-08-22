// backend/lib/turtle-music-profiles.js — per-Telegram-user favorites,
// playlists, and play history for @TurtleMusicBot, backed by the existing
// JsonStore atomic-write helper. Keyed by user id (msg.from.id), not chat
// id, so a user's library is the same in DMs and any group.
'use strict';

const path = require('path');
const { JsonStore } = require('./json-store');

const FAV_CAP = 200;
const PLAYLIST_CAP = 30;
const PLAYLIST_TRACK_CAP = 200;
const HISTORY_CAP = 50;

const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'turtle-music-profiles.json');

function makeStore(filePath) { return new JsonStore(filePath, { users: {} }); }

let store = makeStore(DEFAULT_PATH);
function _useStore(customStore) { store = customStore; }

function emptyUser() {
  return { favorites: [], playlists: {}, history: [], defaultGenre: null, joinedAt: Date.now(), totalPlays: 0 };
}

function trackKey(t) { return (String(t.name) + '|' + String(t.artist)).toLowerCase(); }

async function getProfile(userId) {
  const db = await store.read();
  return db.users[String(userId)] || emptyUser();
}

async function addFavorite(userId, track) {
  return store.withLock(async (db) => {
    const u = db.users[String(userId)] || (db.users[String(userId)] = emptyUser());
    const k = trackKey(track);
    if (u.favorites.some((t) => trackKey(t) === k)) return { ok: true, dup: true };
    if (u.favorites.length >= FAV_CAP) return { ok: false, reason: 'cap' };
    u.favorites.push(track);
    return { ok: true, dup: false };
  });
}

async function listFavorites(userId) {
  const p = await getProfile(userId);
  return p.favorites;
}

const PLAYLIST_NAME_MAX = 24; // keeps 'pa:'+rid(8)+':'+idx+':'+encodeURIComponent(name) under Telegram's 64-byte callback_data limit

async function createPlaylist(userId, name) {
  if (String(name).length > PLAYLIST_NAME_MAX) return { ok: false, reason: 'toolong' };
  return store.withLock(async (db) => {
    const u = db.users[String(userId)] || (db.users[String(userId)] = emptyUser());
    if (u.playlists[name]) return { ok: false, reason: 'exists' };
    if (Object.keys(u.playlists).length >= PLAYLIST_CAP) return { ok: false, reason: 'cap' };
    u.playlists[name] = [];
    return { ok: true };
  });
}

async function addToPlaylist(userId, name, track) {
  return store.withLock(async (db) => {
    const u = db.users[String(userId)] || (db.users[String(userId)] = emptyUser());
    if (!u.playlists[name]) return { ok: false, reason: 'missing' };
    if (u.playlists[name].length >= PLAYLIST_TRACK_CAP) return { ok: false, reason: 'cap' };
    u.playlists[name].push(track);
    return { ok: true };
  });
}

async function getPlaylist(userId, name) {
  const p = await getProfile(userId);
  return p.playlists[name] || null;
}

async function listPlaylists(userId) {
  const p = await getProfile(userId);
  return Object.keys(p.playlists);
}

async function deletePlaylist(userId, name) {
  return store.withLock(async (db) => {
    const u = db.users[String(userId)];
    if (!u || !u.playlists[name]) return { ok: false, reason: 'missing' };
    delete u.playlists[name];
    return { ok: true };
  });
}

async function pushHistory(userId, track) {
  return store.withLock(async (db) => {
    const u = db.users[String(userId)] || (db.users[String(userId)] = emptyUser());
    u.history.push({ name: track.name, artist: track.artist, ts: Date.now() });
    if (u.history.length > HISTORY_CAP) u.history = u.history.slice(-HISTORY_CAP);
    u.totalPlays = (u.totalPlays || 0) + 1;
    return u.history;
  });
}

async function getHistory(userId) {
  const p = await getProfile(userId);
  return p.history;
}

async function profileSummary(userId) {
  const p = await getProfile(userId);
  return {
    totalPlays: p.totalPlays || 0,
    favorites: p.favorites.length,
    playlists: Object.keys(p.playlists).length,
    joinedAt: p.joinedAt,
  };
}

module.exports = {
  getProfile, addFavorite, listFavorites, createPlaylist, addToPlaylist,
  getPlaylist, listPlaylists, deletePlaylist, pushHistory, getHistory, profileSummary,
  makeStore, _useStore, FAV_CAP, PLAYLIST_CAP, PLAYLIST_TRACK_CAP, HISTORY_CAP, PLAYLIST_NAME_MAX,
};
