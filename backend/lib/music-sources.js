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
        art: (t.artwork && (t.artwork['480x480'] || t.artwork['150x150'])) || null,
        stream: host + '/v1/tracks/' + t.id + '/stream?app_name=TurtleMusicBot' }));
  } catch (_) { return []; }
}

async function deezerSearch(term, limit = 8) {
  try {
    const j = await (await fetch('https://api.deezer.com/search?limit=' + limit + '&q=' + encodeURIComponent(term), { signal: TO(10000) })).json();
    return (j.data || []).filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || '', album: (x.album && x.album.title) || '',
      art: (x.album && x.album.cover_medium) || null, duration: 30, stream: x.preview }));
  } catch (_) { return []; }
}

async function itunesSearch(term, limit = 6) {
  try {
    const j = await (await fetch('https://itunes.apple.com/search?media=music&limit=' + limit + '&term=' + encodeURIComponent(term), { signal: TO(10000) })).json();
    return (j.results || []).filter((x) => x.previewUrl).map((x) => ({ source: 'itunes', full: false, name: x.trackName,
      artist: x.artistName, album: x.collectionName, art: x.artworkUrl100 || null, duration: 30, stream: x.previewUrl }));
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
    const mapped = tracks.filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || '', album: (x.album && x.album.title) || '',
      art: (x.album && x.album.cover_medium) || null, duration: x.duration || 30, stream: x.preview }));
    return filterKnockoffs(mapped, '');
  } catch (_) { return []; }
}

// ── Deezer album search & browse (free, no key) ─────────────────────────────
async function albumSearch(term, limit = 6) {
  try {
    const j = await (await fetch('https://api.deezer.com/search/album?limit=' + limit + '&q=' + encodeURIComponent(term), { signal: TO(10000) })).json();
    return (j.data || []).map((a) => ({ id: a.id, title: a.title, artist: (a.artist && a.artist.name) || '', cover: a.cover_medium || null, trackCount: a.nb_tracks || 0 }));
  } catch (_) { return []; }
}

async function albumTracks(albumId) {
  try {
    const j = await (await fetch('https://api.deezer.com/album/' + encodeURIComponent(albumId), { signal: TO(10000) })).json();
    const tracks = (j.tracks && j.tracks.data) || [];
    return tracks.filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || (j.artist && j.artist.name) || '', album: j.title || '',
      art: j.cover_medium || null, duration: x.duration || 30, stream: x.preview }));
  } catch (_) { return []; }
}

// ── search-quality: filter knockoffs, prefer the canonical artist ──────────
const KNOCKOFF_RE = /\b(cover|tribute|karaoke|instrumental|made famous by|in the style of|originally performed by)\b/i;

// Drop cover/tribute/karaoke-style results UNLESS the user's own query
// already contains one of those words (so /find "yellow cover" still works).
function filterKnockoffs(tracks, query) {
  if (KNOCKOFF_RE.test(query || '')) return tracks;
  return tracks.filter((t) => !KNOCKOFF_RE.test(t.name) && !KNOCKOFF_RE.test(t.album || ''));
}

// Soft reorder (never drops anything): a track whose artist is named in the
// query sorts ahead of one that isn't. Stable — ties keep their prior order.
function boostCanonicalArtist(tracks, query) {
  const q = (query || '').toLowerCase();
  return [...tracks].sort((a, b) => {
    const am = a.artist && q.includes(String(a.artist).toLowerCase()) ? 0 : 1;
    const bm = b.artist && q.includes(String(b.artist).toLowerCase()) ? 0 : 1;
    return am - bm;
  });
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
  let out = [...d, ...a];
  if (!out.length) out = await itunesSearch(term, 6);
  const seen = new Set();
  out = out.filter((t) => { const k = (t.name + '|' + t.artist).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  out = filterKnockoffs(out, term);
  out = boostCanonicalArtist(out, term);
  return out.slice(0, 8);
}

module.exports = { search, audiusSearch, deezerSearch, itunesSearch, getLyrics, audiusHost, genreList, genreChart, filterKnockoffs, boostCanonicalArtist, albumSearch, albumTracks };
