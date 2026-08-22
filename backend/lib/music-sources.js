// backend/lib/music-sources.js — FREE, no-key music sources for @TurtleMusicBot.
//   • Audius   — FULL streamable tracks (MP3), no key  → real complete songs
//   • Deezer   — 30s MP3 previews, no key              → mainstream lookup
//   • iTunes   — 30s m4a previews, no key              → fallback
//   • lyrics.ovh — song lyrics, no key
// All calls are wrapped + timed out; every function fails soft to [] / null.
'use strict';

const TO = (ms) => { try { return AbortSignal.timeout(ms); } catch (_) { return undefined; } };

// ── Audius host discovery (cached 1h; random pick for load-spread) ────────────
let _host = null, _hostAt = 0;
async function audiusHost() {
  if (_host && Date.now() - _hostAt < 3600e3) return _host;
  try {
    const j = await (await fetch('https://api.audius.co', { signal: TO(8000) })).json();
    const hosts = (j.data || []).filter(Boolean);
    _host = hosts[Math.floor(Math.random() * hosts.length)] || 'https://discoveryprovider.audius.co';
  } catch (_) { _host = 'https://discoveryprovider.audius.co'; }
  _hostAt = Date.now();
  return _host;
}

// FULL tracks. Capped to 20s–15min so a stream fits Telegram's 50MB audio limit.
async function audiusSearch(term, limit = 8) {
  try {
    const host = await audiusHost();
    const j = await (await fetch(host + '/v1/tracks/search?query=' + encodeURIComponent(term) + '&app_name=TurtleMusicBot', { signal: TO(12000) })).json();
    return (j.data || [])
      .filter((t) => t.is_streamable !== false && t.duration > 20 && t.duration <= 900)
      .slice(0, limit)
      .map((t) => ({ source: 'audius', full: true, name: t.title, artist: (t.user && t.user.name) || '', duration: t.duration,
        stream: host + '/v1/tracks/' + t.id + '/stream?app_name=TurtleMusicBot' }));
  } catch (_) { return []; }
}

async function deezerSearch(term, limit = 8) {
  try {
    const j = await (await fetch('https://api.deezer.com/search?limit=' + limit + '&q=' + encodeURIComponent(term), { signal: TO(10000) })).json();
    return (j.data || []).filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || '', album: (x.album && x.album.title) || '', duration: 30, stream: x.preview }));
  } catch (_) { return []; }
}

async function itunesSearch(term, limit = 6) {
  try {
    const j = await (await fetch('https://itunes.apple.com/search?media=music&limit=' + limit + '&term=' + encodeURIComponent(term), { signal: TO(10000) })).json();
    return (j.results || []).filter((x) => x.previewUrl).map((x) => ({ source: 'itunes', full: false, name: x.trackName,
      artist: x.artistName, album: x.collectionName, duration: 30, stream: x.previewUrl }));
  } catch (_) { return []; }
}

// ── Deezer genre browse (free, no key) ─────────────────────────────────────
let _genres = null, _genresAt = 0;
async function genreList() {
  if (_genres && Date.now() - _genresAt < 24 * 3600e3) return _genres;
  try {
    const j = await (await fetch('https://api.deezer.com/genre', { signal: TO(10000) })).json();
    _genres = (j.data || []).filter((g) => g.id !== 0).map((g) => ({ id: g.id, name: g.name, picture: g.picture }));
  } catch (_) { _genres = _genres || []; }
  _genresAt = Date.now();
  return _genres;
}

async function genreChart(genreId, limit = 10) {
  try {
    const j = await (await fetch('https://api.deezer.com/chart/' + encodeURIComponent(genreId) + '?limit=' + limit, { signal: TO(10000) })).json();
    const tracks = (j.tracks && j.tracks.data) || [];
    return tracks.filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || '', album: (x.album && x.album.title) || '', duration: x.duration || 30, stream: x.preview }));
  } catch (_) { return []; }
}

async function getLyrics(artist, title) {
  try {
    const j = await (await fetch('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title), { signal: TO(11000) })).json();
    return (j && j.lyrics) ? j.lyrics.replace(/\r/g, '').trim() : null;
  } catch (_) { return null; }
}

// Unified search. full=true → prefer Audius complete tracks; else mix Audius+Deezer
// (parallel), fall back to iTunes. De-dupes by name+artist.
async function search(term, opts) {
  opts = opts || {};
  if (opts.full) { const a = await audiusSearch(term, 8); if (a.length) return a; }
  const [a, d] = await Promise.all([audiusSearch(term, 6), deezerSearch(term, 6)]);
  let out = [...a, ...d];
  if (!out.length) out = await itunesSearch(term, 6);
  const seen = new Set();
  return out.filter((t) => { const k = (t.name + '|' + t.artist).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

module.exports = { search, audiusSearch, deezerSearch, itunesSearch, getLyrics, audiusHost, genreList, genreChart };
