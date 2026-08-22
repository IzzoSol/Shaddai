// backend/lib/lastfm.js — Last.fm free API for @TurtleMusicBot: real
// listening-graph similarity (not a genre-matching approximation), artist
// bios/tags, and tag-based browse. Metadata/graph only — never a stream
// source; callers resolve candidates into playable tracks via
// backend/lib/music-sources.js's search().
//
// Requires LASTFM_API_KEY (free, no OAuth — sign up at last.fm/api). Every
// function fails soft to [] / null when the key is unset or any call fails,
// so the bot stays fully functional without it, just without this layer.
'use strict';

const TO = (ms) => { try { return AbortSignal.timeout(ms); } catch (_) { return undefined; } };
const KEY = () => process.env.LASTFM_API_KEY || '';
const BASE = 'https://ws.audioscrobbler.com/2.0/';

async function similarTracks(artist, track, limit = 10) {
  if (!KEY()) return [];
  try {
    const url = BASE + '?method=track.getsimilar&artist=' + encodeURIComponent(artist) +
      '&track=' + encodeURIComponent(track) + '&api_key=' + KEY() + '&format=json&limit=' + limit;
    const j = await (await fetch(url, { signal: TO(10000) })).json();
    const arr = (j.similartracks && j.similartracks.track) || [];
    return arr.map((t) => ({ name: t.name, artist: (t.artist && t.artist.name) || '', match: Number(t.match) || 0 }));
  } catch (_) { return []; }
}

async function artistInfo(name) {
  if (!KEY()) return null;
  try {
    const url = BASE + '?method=artist.getinfo&artist=' + encodeURIComponent(name) +
      '&api_key=' + KEY() + '&format=json';
    const j = await (await fetch(url, { signal: TO(10000) })).json();
    const a = j.artist;
    if (!a) return null;
    const rawBio = (a.bio && a.bio.summary) || '';
    // Last.fm bios end with a "Read more on Last.fm" link + license text — strip it.
    const bio = rawBio.replace(/<a[^>]*>.*?<\/a>\.?\s*$/is, '').trim();
    const tags = ((a.tags && a.tags.tag) || []).map((t) => t.name).slice(0, 6);
    return { name: a.name, bio, tags, listeners: (a.stats && a.stats.listeners) || null };
  } catch (_) { return null; }
}

async function tagTopTracks(tag, limit = 10) {
  if (!KEY()) return [];
  try {
    const url = BASE + '?method=tag.gettoptracks&tag=' + encodeURIComponent(tag) +
      '&api_key=' + KEY() + '&format=json&limit=' + limit;
    const j = await (await fetch(url, { signal: TO(10000) })).json();
    const arr = (j.tracks && j.tracks.track) || [];
    return arr.map((t) => ({ name: t.name, artist: (t.artist && t.artist.name) || '' }));
  } catch (_) { return []; }
}

module.exports = { similarTracks, artistInfo, tagTopTracks };
