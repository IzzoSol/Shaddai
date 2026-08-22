# Turtle Music Bot v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@TurtleMusicBot` real music discovery: Last.fm-powered "similar track" recommendations, radio mode (never really stops, keeps playing similar music), album art, artist info, album browsing, curated genre/artist quick-picks, one-tap playlist-add from any result, and better default search quality (fewer covers/knockoffs, canonical artist preferred).

**Architecture:** One new library module (`backend/lib/lastfm.js`, same fail-soft pattern as the rest of `backend/lib/`), targeted additions to the two existing library modules (`music-sources.js` gains art/filtering/album functions, `turtle-music-session.js` gains radio-mode state), and a large but incremental set of additions to the router (`backend/turtle-music-bot.js`) that reuse a new shared 3-button result-row builder everywhere results are shown.

**Tech Stack:** Node.js (CommonJS), native `fetch`, Telegram Bot HTTP API, Last.fm API (free key, `ws.audioscrobbler.com`), Deezer's free album/genre/chart/search endpoints, Jest (`npx jest`, confirmed working this session).

**Spec:** `docs/superpowers/specs/2026-08-22-turtle-music-bot-v3-similarity-design.md`

## Global Constraints

- No new npm dependencies — everything free, `fetch`-based, matching the existing bot's convention.
- Every new network call fails soft (`try/catch` → `[]`/`null`), never throws into the router — same as every existing function in `music-sources.js`/`lastfm.js`.
- `LASTFM_API_KEY` is a new required env var for Last.fm-dependent features (`/similar`, `/about`, radio-mode continuation, the "Japanese Jazz Fusion" quick-pick). Every function that needs it checks `if (!KEY()) return []/null` first — the bot must remain fully functional on v2 behavior with the key unset, just without the new discovery layer. **The owner needs to obtain this key (free signup at last.fm/api) and add it to `.env` as `LASTFM_API_KEY=...` before live verification of Last.fm-dependent tasks can fully succeed** — code review and unit tests do not require it; live `node -e` verification of `lastfm.js` itself does.
- Group-chat quiet mode is already shipped (commit `44e6369`) — no task in this plan touches that logic; `isPrivate` is available in `handle()`'s message branch for any task that needs it.
- Test runner: `npx jest <path>` from `SHADDAI MASTER FINAL BUILD/` (confirmed working, no jest devDependency needed — npm's package-runner resolves it).
- Reuse the existing per-file patterns: `TO(ms)` timeout helper and the exact fail-soft `try { ... } catch (_) { return []; }` shape already in `music-sources.js`; the `JsonStore`-backed pattern already in `turtle-music-profiles.js` (not touched by this plan — playlist mutation reuses existing `profiles.addToPlaylist`, no new persistence needed).

---

## Task 1: `music-sources.js` — album art, knockoff filtering, artist-match boost, album search

**Files:**
- Modify: `backend/lib/music-sources.js`
- Test: `backend/tests/turtle-music-sources.test.js` (new — pure functions only)

**Interfaces:**
- Consumes: nothing new.
- Produces: unified track shape gains `art: string|null` on `audiusSearch`/`deezerSearch`/`itunesSearch`/`genreChart`'s outputs. New exports: `filterKnockoffs(tracks, query) -> track[]`, `boostCanonicalArtist(tracks, query) -> track[]`, `albumSearch(term, limit=6) -> Promise<{id,title,artist,cover,trackCount}[]>`, `albumTracks(albumId) -> Promise<track[]>` (same unified shape, `art` set from the album cover).

- [ ] **Step 1: Write the failing tests for the two pure functions**

Create `backend/tests/turtle-music-sources.test.js`:

```js
'use strict';
const src = require('../lib/music-sources');

describe('filterKnockoffs', () => {
  test('drops cover/tribute/karaoke/instrumental titled tracks by default', () => {
    const tracks = [
      { name: 'Yellow', artist: 'Coldplay' },
      { name: 'Yellow (Karaoke Version)', artist: 'Karaoke Kings' },
      { name: 'Yellow - Tribute to Coldplay', artist: 'Tribute Band' },
      { name: 'Yellow (Instrumental)', artist: 'Session Musicians' },
      { name: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories (Cover Version)' },
    ];
    const out = src.filterKnockoffs(tracks, 'yellow');
    expect(out.map((t) => t.name)).toEqual(['Yellow']);
  });

  test('keeps knockoff-flagged results when the query itself asked for them', () => {
    const tracks = [{ name: 'Yellow (Karaoke Version)', artist: 'Karaoke Kings' }];
    const out = src.filterKnockoffs(tracks, 'yellow karaoke version');
    expect(out).toHaveLength(1);
  });
});

describe('boostCanonicalArtist', () => {
  test('sorts a track whose artist is named in the query ahead of one that is not', () => {
    const tracks = [
      { name: 'Yellow', artist: 'Random Cover Band' },
      { name: 'Yellow', artist: 'Coldplay' },
    ];
    const out = src.boostCanonicalArtist(tracks, 'yellow coldplay');
    expect(out[0].artist).toBe('Coldplay');
  });

  test('does not reorder when the query names no artist at all', () => {
    const tracks = [
      { name: 'Yellow', artist: 'Coldplay' },
      { name: 'Yellow', artist: 'Someone Else' },
    ];
    const out = src.boostCanonicalArtist(tracks, 'yellow');
    expect(out.map((t) => t.artist)).toEqual(['Coldplay', 'Someone Else']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest backend/tests/turtle-music-sources.test.js`
Expected: FAIL — `filterKnockoffs is not a function` (and `boostCanonicalArtist`)

- [ ] **Step 3: Add `art` to the unified track shape**

In `backend/lib/music-sources.js`, modify `audiusSearch`'s map callback (currently ends `stream: host + '/v1/tracks/' + t.id + '/stream?app_name=TurtleMusicBot' }));`) to add an `art` field. Audius track objects carry `artwork` with size-keyed URLs:

```js
      .map((t) => ({ source: 'audius', full: true, name: t.title, artist: (t.user && t.user.name) || '', duration: t.duration,
        art: (t.artwork && (t.artwork['480x480'] || t.artwork['150x150'])) || null,
        stream: host + '/v1/tracks/' + t.id + '/stream?app_name=TurtleMusicBot' }));
```

Modify `deezerSearch`'s map callback to add `art` from the album cover:

```js
    return (j.data || []).filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || '', album: (x.album && x.album.title) || '', duration: 30,
      art: (x.album && x.album.cover_medium) || null, stream: x.preview }));
```

Modify `itunesSearch`'s map callback to add `art`:

```js
    return (j.results || []).filter((x) => x.previewUrl).map((x) => ({ source: 'itunes', full: false, name: x.trackName,
      artist: x.artistName, album: x.collectionName, art: x.artworkUrl100 || null, duration: 30, stream: x.previewUrl }));
```

Modify `genreChart`'s map callback to add `art`:

```js
    return tracks.filter((x) => x.preview).map((x) => ({ source: 'deezer', full: false, name: x.title,
      artist: (x.artist && x.artist.name) || '', album: (x.album && x.album.title) || '',
      art: (x.album && x.album.cover_medium) || null, duration: x.duration || 30, stream: x.preview }));
```

- [ ] **Step 4: Add `filterKnockoffs` and `boostCanonicalArtist`**

In `backend/lib/music-sources.js`, add after `genreChart` and before `getLyrics`:

```js
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
    const am = q.includes(String(a.artist || '').toLowerCase()) ? 0 : 1;
    const bm = q.includes(String(b.artist || '').toLowerCase()) ? 0 : 1;
    return am - bm;
  });
}
```

- [ ] **Step 5: Apply both in `search()`, reorder Deezer-first by default**

Replace the existing `search` function body:

```js
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
```

(Only the two lines building `out` before the dedupe loop changed order to `[...d, ...a]` from `[...a, ...d]`, and three lines were added after dedupe: the knockoff filter, the artist boost, and the final slice replacing the old inline `.slice(0, 8)` on the filter chain.)

- [ ] **Step 6: Apply `filterKnockoffs` to `genreChart`'s output**

In `genreChart`, change the `return tracks.filter(...)` line (already updated in Step 3 to include `art`) to pipe through the filter before returning:

```js
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
```

- [ ] **Step 7: Add `albumSearch` and `albumTracks`**

Add after `genreChart`/before the knockoff-filtering section (or anywhere after `genreChart`, before `getLyrics` — exact position doesn't matter, keep it grouped with the other Deezer functions):

```js
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
```

- [ ] **Step 8: Update `module.exports`**

Change the final line to:

```js
module.exports = { search, audiusSearch, deezerSearch, itunesSearch, getLyrics, audiusHost, genreList, genreChart, filterKnockoffs, boostCanonicalArtist, albumSearch, albumTracks };
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx jest backend/tests/turtle-music-sources.test.js`
Expected: PASS (4 tests)

- [ ] **Step 10: Live verification of the network-dependent additions**

```bash
node -e "
const src = require('./backend/lib/music-sources');
(async () => {
  const r = await src.search('blinding lights the weeknd');
  console.log('search (art present?):', r.length, r[0] && { name: r[0].name, artist: r[0].artist, art: !!r[0].art });
  const albums = await src.albumSearch('random access memories', 3);
  console.log('albumSearch:', albums.length, albums[0]);
  if (albums[0]) {
    const tracks = await src.albumTracks(albums[0].id);
    console.log('albumTracks:', tracks.length, tracks[0]);
  }
})().catch(e => console.error('FAIL', e));
"
```

Expected: `search` returns results with `art: true` on at least the top hit; `albumSearch` returns 1-3 albums; `albumTracks` returns a non-empty track list with `art` set from the album cover.

- [ ] **Step 11: Commit**

```bash
git add backend/lib/music-sources.js backend/tests/turtle-music-sources.test.js
git commit -m "feat(turtle-music-bot): add album art, knockoff filtering, artist-match boost, album search to music-sources"
```

---

## Task 2: `backend/lib/lastfm.js` — similarity, artist info, tag browse

**Files:**
- Create: `backend/lib/lastfm.js`

**Interfaces:**
- Consumes: nothing (standalone, same `TO()`-style timeout pattern as `music-sources.js` — define its own local copy of that helper since these are independent library files with no shared-utility module in this codebase).
- Produces: `similarTracks(artist, track, limit=10) -> Promise<{name,artist,match}[]>`, `artistInfo(name) -> Promise<{name,bio,tags,listeners}|null>`, `tagTopTracks(tag, limit=10) -> Promise<{name,artist}[]>`.

No jest tests for this task — network-dependent, no mocking infra in this codebase (same reasoning as `music-sources.js`'s `genreList`/`genreChart`/`albumSearch` having none). Verification is a manual `node -e` script.

- [ ] **Step 1: Create the module**

Create `backend/lib/lastfm.js`:

```js
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
```

- [ ] **Step 2: Live verification**

```bash
node -e "
require('dotenv').config();
const lf = require('./backend/lib/lastfm');
(async () => {
  console.log('LASTFM_API_KEY set:', !!process.env.LASTFM_API_KEY);
  const sim = await lf.similarTracks('The Weeknd', 'Blinding Lights', 5);
  console.log('similarTracks:', sim.length, sim[0]);
  const info = await lf.artistInfo('The Weeknd');
  console.log('artistInfo:', info && { name: info.name, tags: info.tags, bioLen: info.bio.length });
  const tag = await lf.tagTopTracks('japanese jazz fusion', 5);
  console.log('tagTopTracks:', tag.length, tag[0]);
})().catch(e => console.error('FAIL', e));
"
```

If `LASTFM_API_KEY` is not yet set in `.env` (check first — this plan's Global Constraints flag that the owner needs to provide one), every array will legitimately be empty and `artistInfo` will be `null` — that is CORRECT fail-soft behavior, not a bug. Report both outcomes clearly in the task report: "key present, live data returned" vs. "key absent, correctly returned empty/null everywhere — re-verify once a key is available." Do not treat an absent key as a task failure.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/lastfm.js
git commit -m "feat(turtle-music-bot): add lastfm.js — similarity, artist info, tag browse"
```

---

## Task 3: `turtle-music-session.js` — radio-mode state

**Files:**
- Modify: `backend/lib/turtle-music-session.js`
- Modify: `backend/tests/turtle-music-session.test.js` (add new tests, don't remove existing ones)

**Interfaces:**
- Consumes: nothing new.
- Produces: `startSession(chatId, tracks, ownerId)`'s returned session object gains a `radio: true` field by default. New exports: `setRadio(chatId, on) -> boolean`, `isRadio(chatId) -> boolean`, `lastPlayed(chatId) -> track|null`, `appendAndAdvance(chatId, tracks) -> track|null`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/turtle-music-session.test.js` (add these `test()` blocks inside the existing `describe('turtle-music-session', ...)` block, after the existing tests — do not modify or remove any existing test):

```js
  test('startSession defaults radio to true; setRadio/isRadio toggle it', () => {
    session.startSession('c3', [{ name: 'A', duration: 10 }], 'u1');
    expect(session.isRadio('c3')).toBe(true);
    expect(session.setRadio('c3', false)).toBe(false);
    expect(session.isRadio('c3')).toBe(false);
    expect(session.setRadio('c3', true)).toBe(true);
    expect(session.isRadio('c3')).toBe(true);
  });

  test('isRadio defaults to true when no session exists yet', () => {
    expect(session.isRadio('never-started')).toBe(true);
  });

  test('lastPlayed returns the last track in the queue even after it drains', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c4', tracks, 'u1');
    session.advance('c4');
    session.advance('c4'); // drains past the end
    expect(session.current('c4')).toBeNull();
    expect(session.lastPlayed('c4')).toEqual(tracks[1]);
  });

  test('appendAndAdvance pushes new tracks and returns the first newly-added one', () => {
    const tracks = [{ name: 'A', duration: 10 }];
    session.startSession('c5', tracks, 'u1');
    session.advance('c5'); // drain
    expect(session.current('c5')).toBeNull();
    const next = session.appendAndAdvance('c5', [{ name: 'B', duration: 10 }, { name: 'C', duration: 10 }]);
    expect(next).toEqual({ name: 'B', duration: 10 });
    expect(session.current('c5')).toEqual({ name: 'B', duration: 10 });
    expect(session.upcoming('c5')).toEqual([{ name: 'C', duration: 10 }]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest backend/tests/turtle-music-session.test.js`
Expected: FAIL — `session.isRadio is not a function` (and similar for the others)

- [ ] **Step 3: Implement the additions**

In `backend/lib/turtle-music-session.js`, change `startSession` to default `radio: true` on the session object:

```js
function startSession(chatId, tracks, ownerId) {
  clearSession(chatId);
  const s = { queue: (tracks || []).slice(), pos: 0, paused: false, timer: null, ownerId, radio: true };
  sessions.set(key(chatId), s);
  return s;
}
```

Add after `getSession`:

```js
function setRadio(chatId, on) {
  const s = getSession(chatId);
  if (s) s.radio = !!on;
  return !!on;
}

function isRadio(chatId) {
  const s = getSession(chatId);
  return s ? s.radio !== false : true; // no session yet → the next one will default to radio-on
}
```

Add after `upcoming`:

```js
function lastPlayed(chatId) {
  const s = getSession(chatId);
  if (!s || !s.queue.length) return null;
  return s.queue[s.queue.length - 1];
}
```

Add after `advance` (needs `advance`'s own logic reused, so place it right after that function's definition):

```js
function appendAndAdvance(chatId, tracks) {
  const s = getSession(chatId);
  if (!s || !tracks || !tracks.length) return null;
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  s.queue.push(...tracks);
  s.pos += 1; // move onto the first newly-appended track
  return s.queue[s.pos] || null;
}
```

- [ ] **Step 4: Update `module.exports`**

Change:

```js
module.exports = {
  startSession, getSession, current, upcoming, advance, armTimer,
  pause, resume, enqueue, clearSession, _clearAll,
};
```

to:

```js
module.exports = {
  startSession, getSession, current, upcoming, advance, armTimer,
  pause, resume, enqueue, clearSession, _clearAll,
  setRadio, isRadio, lastPlayed, appendAndAdvance,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest backend/tests/turtle-music-session.test.js`
Expected: PASS (11 tests: 7 existing + 1 from the v2 fix wave + 4 new = 12 — count what's actually in the file and confirm all pass, exact total isn't the point, zero failures is)

- [ ] **Step 6: Commit**

```bash
git add backend/lib/turtle-music-session.js backend/tests/turtle-music-session.test.js
git commit -m "feat(turtle-music-bot): add radio-mode state to turtle-music-session"
```

---

## Task 4: Shared result-row builder — album art delivery + one-tap playlist-add

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `src.filterKnockoffs`/`boostCanonicalArtist`/album art (Task 1, already applied inside `search()`/`genreChart()` — this task doesn't call them directly), `profiles.listPlaylists`/`addToPlaylist` (already exist from v2).
- Produces: `resultRow(tr, rid, i) -> [button,button,button]` (used by every later task that builds result buttons — Tasks 5, 7, 8 all consume this instead of building their own 2-button rows), `sendArt(chatId, tr) -> Promise<void>`, `doPlaylistPicker(chatId, userId, rid, idx)`.

- [ ] **Step 1: Add `sendArt` and call it from `playTrack`**

After the `srcTag`/`ext` helper lines (right before `async function playTrack`), add:

```js
async function sendArt(chatId, tr) {
  if (!tr.art) return;
  try {
    await fetch(API('sendPhoto'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: tr.art }) });
  } catch (_) {} // best-effort only, never affects playback
}
```

In `playTrack`, right before the line `const ok = await sendAudio(chatId, buf, fn, cap, trackLabel(tr));`, add:

```js
    await sendArt(chatId, tr);
```

- [ ] **Step 2: Add the shared `resultRow` builder**

Add right after `sendArt` (before `playTrack`):

```js
function resultRow(tr, rid, i) {
  return [
    { text: '▶ ' + trackLabel(tr).slice(0, 30), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
    { text: '📃', callback_data: 'pl:' + rid + ':' + i },
  ];
}
```

- [ ] **Step 3: Replace the inline 2-button rows in `doFind`, `doFull`, `doBrowseGenre` with `resultRow`**

In `doFind`, replace:

```js
  const btns = res.map((tr, i) => [
    { text: '▶ ' + trackLabel(tr).slice(0, 40), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
  ]);
```

with:

```js
  const btns = res.map((tr, i) => resultRow(tr, rid, i));
```

Do the exact same replacement (the button-array literal is byte-for-byte identical in both places) in `doFull` and `doBrowseGenre`.

- [ ] **Step 4: Add `doPlaylistPicker` and the "add to this playlist" confirm step**

Add after `doBrowseGenre` (before `doLike`):

```js
async function doPlaylistPicker(chatId, userId, rid, idx) {
  const tracks = results.get(rid, chatId);
  const tr = tracks && tracks[idx];
  if (!tr) return send(chatId, 'That result expired — search again.');
  const names = await profiles.listPlaylists(userId);
  const rows = names.map((n) => [{ text: '📃 ' + n, callback_data: 'pa:' + rid + ':' + idx + ':' + encodeURIComponent(n) }]);
  rows.push([{ text: '＋ New playlist…', callback_data: 'pn:' + rid + ':' + idx }]);
  return send(chatId, 'Add <b>' + esc(trackLabel(tr)) + '</b> to which playlist?', { inline_keyboard: rows });
}
async function doPlaylistAdd(chatId, userId, rid, idx, name) {
  const tracks = results.get(rid, chatId);
  const tr = tracks && tracks[idx];
  if (!tr) return send(chatId, 'That result expired — search again.');
  const r = await profiles.addToPlaylist(userId, name, tr);
  return send(chatId, r.ok ? '✅ Added to <b>' + esc(name) + '</b>.' : r.reason === 'missing' ? 'No playlist named that anymore.' : '⚠️ That playlist is full (200 tracks max).');
}
```

- [ ] **Step 5: Route `pl:`, `pa:`, `pn:` in the callback-query branch**

In `handle()`'s callback-query branch, add these checks right after the existing `p:`/`q:` block (before `return answerCb(cq.id);`):

```js
    if (data.startsWith('pl:')) {
      const [rid, idxStr] = data.slice(3).split(':');
      await answerCb(cq.id);
      return doPlaylistPicker(chatId, userId, rid, parseInt(idxStr, 10));
    }
    if (data.startsWith('pa:')) {
      const parts = data.slice(3).split(':');
      const rid = parts[0], idx = parseInt(parts[1], 10), name = decodeURIComponent(parts.slice(2).join(':'));
      await answerCb(cq.id, '✅');
      return doPlaylistAdd(chatId, userId, rid, idx, name);
    }
    if (data.startsWith('pn:')) {
      await answerCb(cq.id);
      return send(chatId, 'Create it first: <code>/playlist new &amp;lt;name&amp;gt;</code>, then tap 📃 on this track again.');
    }
```

- [ ] **Step 6: Smoke test**

```bash
node -e "
const bot = require('./backend/turtle-music-bot');
(async () => {
  await bot.handle({ callback_query: { id: '1', from: { id: 1 }, message: { chat: { id: 999 } }, data: 'pl:deadbeef:0' } });
  console.log('OK: pl: on unknown result did not throw');
  await bot.handle({ callback_query: { id: '2', from: { id: 1 }, message: { chat: { id: 999 } }, data: 'pa:deadbeef:0:MyList' } });
  console.log('OK: pa: on unknown result did not throw');
  await bot.handle({ callback_query: { id: '3', from: { id: 1 }, message: { chat: { id: 999 } }, data: 'pn:deadbeef:0' } });
  console.log('OK: pn: did not throw');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
"
```

- [ ] **Step 7: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): add album art delivery + one-tap playlist-add to every result"
```

---

## Task 5: Radio mode + `/similar`

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `session.isRadio`/`lastPlayed`/`appendAndAdvance`/`setRadio` (Task 3), `lastfm.similarTracks` (Task 2), `resultRow` (Task 4).
- Produces: `resolveCandidates(candidates, limit) -> Promise<track[]>`, `resolveSimilar(seedArtist, seedTitle, limit) -> Promise<track[]>`, `extendRadio(chatId) -> Promise<track|null>`, `doRadio(chatId, arg)`, `doSimilar(chatId, arg)` — `extendRadio` and `resolveSimilar` are consumed by Task 8's tag-browse (which reuses `resolveCandidates` directly).

- [ ] **Step 1: Add the require**

At the top of `backend/turtle-music-bot.js`, after `const profiles = require('./lib/turtle-music-profiles');`, add:

```js
const lastfm = require('./lib/lastfm');
```

- [ ] **Step 2: Add `resolveCandidates` and `resolveSimilar`**

Add after `sendArt`/`resultRow` (from Task 4), before `playTrack`:

```js
// Resolve abstract (artist,name) candidates (from Last.fm similarity or tag
// browse — neither carries a stream URL) into real playable tracks via the
// existing multi-source search. Stops once `limit` resolve, so a long
// candidate list doesn't hammer three search APIs for hits we'll discard.
async function resolveCandidates(candidates, limit) {
  const out = [];
  for (const c of candidates) {
    if (out.length >= limit) break;
    const hits = await src.search(c.artist + ' ' + c.name, { full: false });
    if (hits[0]) out.push(hits[0]);
  }
  return out;
}

async function resolveSimilar(seedArtist, seedTitle, limit = 6) {
  const candidates = await lastfm.similarTracks(seedArtist, seedTitle, limit * 2);
  return resolveCandidates(candidates, limit);
}
```

- [ ] **Step 3: Add `extendRadio` and wire it into `scheduleNext`/`doSkip`**

Replace the existing `scheduleNext` function:

```js
function scheduleNext(chatId) {
  session.armTimer(chatId, async () => {
    let track = session.advance(chatId);
    if (!track) {
      if (session.isRadio(chatId)) track = await extendRadio(chatId);
      if (!track) return; // radio off, or nothing similar resolved — go idle
    }
    const s = session.getSession(chatId);
    const ok = await playTrack(chatId, track);
    if (ok && s) await profiles.pushHistory(s.ownerId, track);
    scheduleNext(chatId);
  });
}

async function extendRadio(chatId) {
  const last = session.lastPlayed(chatId);
  if (!last) return null;
  const more = await resolveSimilar(last.artist, last.name, 5);
  if (!more.length) return null;
  return session.appendAndAdvance(chatId, more);
}
```

Replace `doSkip` to get the same radio-continuation treatment:

```js
async function doSkip(chatId, userId) {
  const s = session.getSession(chatId);
  if (!s) return send(chatId, 'Nothing queued — try /play.');
  let track = session.advance(chatId);
  if (!track && session.isRadio(chatId)) track = await extendRadio(chatId);
  if (!track) return send(chatId, '⏭ Queue finished.');
  const ok = await playTrack(chatId, track);
  if (ok) { await profiles.pushHistory(userId, track); scheduleNext(chatId); }
}
```

- [ ] **Step 4: Add `doRadio` and `doSimilar`**

Add after `doClear` (before `doBrowse`):

```js
async function doRadio(chatId, arg) {
  const a = (arg || '').trim().toLowerCase();
  if (a === 'off') { session.setRadio(chatId, false); return send(chatId, '📻 Radio mode off — playback will stop when the queue ends.'); }
  if (a === 'on') { session.setRadio(chatId, true); return send(chatId, "📻 Radio mode on — I'll keep going with similar tracks."); }
  return send(chatId, '📻 Radio mode is currently ' + (session.isRadio(chatId) ? '<b>on</b>' : '<b>off</b>') + '. Use <code>/radio on</code> or <code>/radio off</code>.');
}
async function doSimilar(chatId, arg) {
  await chatAction(chatId, 'typing');
  let seed;
  if (arg) {
    const hits = await src.search(arg, { full: false });
    seed = hits[0];
    if (!seed) return send(chatId, 'No match for <b>' + esc(arg) + '</b> to find similar tracks from.');
  } else {
    seed = session.current(chatId);
    if (!seed) return send(chatId, 'Nothing playing — <code>/similar &lt;song&gt;</code> or start something with /play first.');
  }
  const similar = await resolveSimilar(seed.artist, seed.name, 8);
  if (!similar.length) return send(chatId, 'No similar tracks found for <b>' + esc(trackLabel(seed)) + '</b> right now.');
  const rid = results.create(chatId, similar);
  const btns = similar.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '🎯 Similar to <b>' + esc(trackLabel(seed)) + '</b>:', { inline_keyboard: btns });
}
```

- [ ] **Step 5: Route `/radio` and `/similar` in the command switch**

Add to the `switch (cmd)` block, next to `case 'clear': case 'stop': return doClear(chatId);`:

```js
    case 'radio': return doRadio(chatId, arg);
    case 'similar': case 'like2': return doSimilar(chatId, arg);
```

(`like2` is a harmless throwaway alias to avoid any chance of collision with the existing `like`/`fav` case — feel free to drop it if it feels unnecessary; it's not load-bearing.)

- [ ] **Step 6: Smoke test**

```bash
node -e "
const bot = require('./backend/turtle-music-bot');
(async () => {
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/radio' } });
  console.log('OK: /radio status did not throw');
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/radio off' } });
  console.log('OK: /radio off did not throw');
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/similar' } });
  console.log('OK: /similar with nothing playing did not throw');
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/similar blinding lights' } });
  console.log('OK: /similar <song> did not throw');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
"
```

Note: `/similar blinding lights` will legitimately return "No similar tracks found" if `LASTFM_API_KEY` isn't set yet — that's correct fail-soft behavior per this task's design, not a bug; report which outcome occurred.

- [ ] **Step 7: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): add radio-mode auto-continuation + /radio + /similar"
```

---

## Task 6: `/about`

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `lastfm.artistInfo` (Task 2), `session.current` (existing).
- Produces: `doAbout(chatId)`.

- [ ] **Step 1: Add `doAbout`**

Add after `doHistory` (before `doLyrics`):

```js
async function doAbout(chatId) {
  const cur = session.current(chatId);
  if (!cur) return send(chatId, 'Nothing playing — /play something first, then /about.');
  const info = await lastfm.artistInfo(cur.artist);
  if (!info) return send(chatId, 'No artist info available for <b>' + esc(cur.artist) + '</b> right now.');
  let txt = '🎤 <b>' + esc(info.name) + '</b>\n';
  if (info.tags.length) txt += '<i>' + info.tags.map(esc).join(', ') + '</i>\n';
  if (info.listeners) txt += Number(info.listeners).toLocaleString() + ' Last.fm listeners\n';
  txt += '\n' + esc(info.bio || 'No bio available.').slice(0, 800);
  return send(chatId, txt);
}
```

- [ ] **Step 2: Route `/about`**

Add to the command switch, next to `case 'history': return doHistory(chatId, userId);`:

```js
    case 'about': return doAbout(chatId);
```

- [ ] **Step 3: Smoke test**

```bash
node -e "
const bot = require('./backend/turtle-music-bot');
bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/about' } })
  .then(() => console.log('OK: /about with nothing playing did not throw'))
  .catch((e) => { console.error('FAIL', e); process.exit(1); });
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): add /about — artist bio + tags via Last.fm"
```

---

## Task 7: `/album`

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `src.albumSearch`/`albumTracks` (Task 1), `resultRow` (Task 4).
- Produces: `doAlbum(chatId, arg)`, `doAlbumTracks(chatId, albumId)`.

- [ ] **Step 1: Add the handlers**

Add after `doAbout` (before `doLyrics`):

```js
async function doAlbum(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/album &lt;name or artist&gt;</code>  e.g. <code>/album random access memories</code>');
  await chatAction(chatId, 'typing');
  const albums = await src.albumSearch(arg, 6);
  if (!albums.length) return send(chatId, 'No albums found for <b>' + esc(arg) + '</b>.');
  const btns = albums.map((al) => [{ text: '💿 ' + al.title + ' — ' + al.artist, callback_data: 'al:' + al.id }]);
  return send(chatId, '💿 Albums matching <b>' + esc(arg) + '</b>:', { inline_keyboard: btns });
}
async function doAlbumTracks(chatId, albumId) {
  await chatAction(chatId, 'typing');
  const tracks = await src.albumTracks(albumId);
  if (!tracks.length) return send(chatId, 'Could not load that album right now.');
  const rid = results.create(chatId, tracks);
  const btns = tracks.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '💿 <b>' + esc(tracks[0].album) + '</b> — ' + esc(tracks[0].artist) + ':', { inline_keyboard: btns });
}
```

- [ ] **Step 2: Route `/album` and the `al:` callback prefix**

Add to the command switch, next to `case 'about': return doAbout(chatId);`:

```js
    case 'album': return doAlbum(chatId, arg);
```

In the callback-query branch, add right after the `br:`/`bp:` checks:

```js
    if (data.startsWith('al:')) { await answerCb(cq.id); return doAlbumTracks(chatId, data.slice(3)); }
```

- [ ] **Step 3: Smoke test**

```bash
node -e "
const bot = require('./backend/turtle-music-bot');
(async () => {
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/album random access memories' } });
  console.log('OK: /album <name> did not throw');
  await bot.handle({ callback_query: { id: '1', from: { id: 1 }, message: { chat: { id: 999 } }, data: 'al:999999999' } });
  console.log('OK: al: on a bogus id did not throw');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): add /album search and browse"
```

---

## Task 8: Curated `/browse` pinning + Japanese Jazz Fusion + `/artists`

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `lastfm.tagTopTracks` (Task 2), `resolveCandidates` (Task 5), `resultRow` (Task 4), `src.genreList` (existing).
- Produces: modified `doBrowse`, new `doArtists`, `doArtistTracks`.

- [ ] **Step 1: Replace `doBrowse` with a pinned-genre + synthetic-entry version**

Replace the existing `doBrowse` function:

```js
const PINNED_GENRES = ['Rap/Hip Hop', 'Jazz'];
async function doBrowse(chatId, page) {
  page = page || 0;
  await chatAction(chatId, 'typing');
  const genres = await src.genreList();
  if (!genres.length) return send(chatId, '⚠️ Could not load genres right now — try again shortly.');
  const pinned = PINNED_GENRES.map((n) => genres.find((g) => g.name === n)).filter(Boolean);
  const rest = genres.filter((g) => !pinned.includes(g));
  const perPage = 8;
  let slice, hasMore;
  if (page === 0) {
    const jjf = { id: 'jjf', name: '🎌 Japanese Jazz Fusion' };
    const room = Math.max(0, perPage - 1 - pinned.length);
    slice = [jjf, ...pinned, ...rest.slice(0, room)];
    hasMore = rest.length > room;
  } else {
    const room = Math.max(0, perPage - 1 - pinned.length);
    const idx = room + (page - 1) * perPage;
    slice = rest.slice(idx, idx + perPage);
    hasMore = rest.length > idx + perPage;
  }
  const rows = [];
  for (let i = 0; i < slice.length; i += 2) {
    rows.push(slice.slice(i, i + 2).map((g) => g.id === 'jjf'
      ? { text: g.name, callback_data: 'jjt:jjf' }
      : { text: g.name, callback_data: 'br:' + g.id }));
  }
  if (hasMore) rows.push([{ text: 'More ▶', callback_data: 'bp:' + (page + 1) }]);
  return send(chatId, '📚 <b>Browse by genre</b> — tap a genre:', { inline_keyboard: rows });
}

async function doTagBrowse(chatId, tag) {
  await chatAction(chatId, 'typing');
  const candidates = await lastfm.tagTopTracks(tag, 16);
  if (!candidates.length) return send(chatId, 'No tracks found for that right now — try again shortly.');
  const tracks = await resolveCandidates(candidates, 10);
  if (!tracks.length) return send(chatId, 'No playable matches found for that right now.');
  const rid = results.create(chatId, tracks);
  const btns = tracks.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '🎌 <b>Japanese Jazz Fusion</b>:', { inline_keyboard: btns });
}
```

(`doTagBrowse` is written generically — takes any tag string — even though only `jjt:jjf` routes to it in this task, so a future pinned tag-based entry doesn't need new plumbing, only a new callback prefix check and button.)

- [ ] **Step 2: Route the new `jjt:` callback prefix**

In the callback-query branch, add right after the `al:` check (from Task 7):

```js
    if (data.startsWith('jjt:')) { await answerCb(cq.id); return doTagBrowse(chatId, 'japanese jazz fusion'); }
```

- [ ] **Step 3: Add `/artists`**

Add after `doTagBrowse` (before `doLike`):

```js
const FEATURED_ARTISTS = [
  'Mac Miller', 'Nipsey Hussle', 'Drake', 'Stevie Wonder', 'André 3000',
  'A Boogie Wit da Hoodie', 'Tory Lanez', 'T-Pain',
  'Tyler, The Creator', 'SZA', 'Fleetwood Mac', 'Nujabes',
];
async function doArtists(chatId, page) {
  page = page || 0;
  const perPage = 8;
  const slice = FEATURED_ARTISTS.slice(page * perPage, page * perPage + perPage);
  const rows = [];
  for (let i = 0; i < slice.length; i += 2) rows.push(slice.slice(i, i + 2).map((n) => ({ text: n, callback_data: 'ar:' + encodeURIComponent(n) })));
  if ((page + 1) * perPage < FEATURED_ARTISTS.length) rows.push([{ text: 'More ▶', callback_data: 'ap:' + (page + 1) }]);
  return send(chatId, '🎤 <b>Featured artists</b> — tap one to explore:', { inline_keyboard: rows });
}
async function doArtistTracks(chatId, name) {
  await chatAction(chatId, 'typing');
  const res = await src.search(name);
  if (!res.length) return send(chatId, 'No tracks found for <b>' + esc(name) + '</b>.');
  const rid = results.create(chatId, res);
  const btns = res.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '🎤 <b>' + esc(name) + '</b>:', { inline_keyboard: btns });
}
```

- [ ] **Step 4: Route `/artists` and its `ar:`/`ap:` callback prefixes**

Add to the command switch, next to `case 'browse': case 'library': return doBrowse(chatId, 0);`:

```js
    case 'artists': return doArtists(chatId, 0);
```

In the callback-query branch, add right after the `jjt:` check:

```js
    if (data.startsWith('ar:')) { await answerCb(cq.id); return doArtistTracks(chatId, decodeURIComponent(data.slice(3))); }
    if (data.startsWith('ap:')) { await answerCb(cq.id); return doArtists(chatId, parseInt(data.slice(3), 10) || 0); }
```

- [ ] **Step 5: Smoke test**

```bash
node -e "
const bot = require('./backend/turtle-music-bot');
(async () => {
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/browse' } });
  console.log('OK: /browse (pinned+jjf) did not throw');
  await bot.handle({ callback_query: { id: '1', from: { id: 1 }, message: { chat: { id: 999 } }, data: 'jjt:jjf' } });
  console.log('OK: jjt: did not throw');
  await bot.handle({ message: { chat: { id: 999, type: 'private' }, from: { id: 1 }, text: '/artists' } });
  console.log('OK: /artists did not throw');
  await bot.handle({ callback_query: { id: '2', from: { id: 1 }, message: { chat: { id: 999 } }, data: 'ar:' + encodeURIComponent('Drake') } });
  console.log('OK: ar: did not throw');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
"
```

- [ ] **Step 6: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): pin favorite genres + Japanese Jazz Fusion in /browse, add /artists"
```

---

## Task 9: Wire `/play`'s search-quality default, finish copy + command menu, full verification

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: nothing new — this is the polish/integration-finishing task.

- [ ] **Step 1: Change `/play`'s default search to favor correctness over completeness**

In `doPlay`, change:

```js
  const res = await src.search(arg, { full: true });
```

to:

```js
  const res = await src.search(arg);
```

(This is the deliberate v3 behavior change from the spec: `/play`'s top pick now favors "the correct, real track" — filtered, Deezer-first, artist-boosted — over "a complete track that might be a knockoff." `/full` is unchanged and still explicitly Audius-first for anyone who wants a complete-length listen.)

- [ ] **Step 2: Update `startText()`**

Replace the function:

```js
function startText() {
  return '🐢 <b>Turtle Music Bot</b> — <i>by ShaddaiLabs</i>\n\n' +
    'Free music, right here in chat. No ads, no keys.\n\n' +
    '▶️ <b>/play</b> &lt;song&gt; — play instantly, radio-mode keeps it going\n' +
    '🎯 <b>/similar</b> · 💿 <b>/album</b> · 🎤 <b>/artists</b> · 📚 <b>/browse</b>\n' +
    '🔎 <b>/find</b> &lt;song&gt; — search &amp; pick\n' +
    '⏯️ <b>/pause /resume /skip /queue /radio</b> — control what\'s playing\n' +
    '💛 <b>/like</b> · 📃 <b>/playlist</b> · 👤 <b>/profile</b>\n' +
    '🎼 <b>/music</b> &lt;genre&gt; — compose an original\n\n' +
    'Or just type a song name (in our DM). Tap a style to start 👇';
}
```

- [ ] **Step 3: Update `helpText()`**

Replace the function:

```js
function helpText() {
  return '🐢 <b>Turtle Music Bot — commands</b>\n\n' +
    '<b>/play</b> &lt;query&gt;\n   Play the top match — radio mode keeps going with similar tracks after.\n' +
    '<b>/similar</b> [song]\n   Find tracks like the given song, or what\'s playing now.\n' +
    '<b>/radio</b> [on|off]\n   Toggle whether the queue auto-continues with similar tracks.\n' +
    '<b>/album</b> &lt;name&gt;\n   Search and browse full albums.\n' +
    '<b>/artists</b>\n   Tap a featured artist to explore their tracks.\n' +
    '<b>/browse</b>\n   Explore real charts by genre — includes Japanese Jazz Fusion.\n' +
    '<b>/find</b> &lt;query&gt;\n   Search all sources → ▶ play now, ➕ queue, or 📃 add to a playlist.\n' +
    '<b>/full</b> &lt;query&gt;\n   Full free tracks only (Audius).\n' +
    '<b>/pause</b> / <b>/resume</b> / <b>/skip</b> / <b>/queue</b> / <b>/np</b> / <b>/clear</b>\n   Control the current session.\n' +
    '<b>/about</b>\n   Artist bio + tags for what\'s playing now.\n' +
    '<b>/like</b> — favorite what\'s playing · <b>/favorites</b> — list them\n' +
    '<b>/playlist</b> new|add|play|list|view|del &lt;name&gt;\n' +
    '<b>/profile</b> — your stats · <b>/history</b> — recent plays\n' +
    '<b>/music</b> [genre] [mood] [bars]\n   Original procedural track. e.g. <code>/music lofi chill 12</code>\n' +
    '<b>/lyrics</b> artist - title\n   Song lyrics. e.g. <code>/lyrics daft punk - get lucky</code>\n' +
    '<b>/genres</b> — styles &amp; moods · <b>/help</b> — this list\n\n' +
    'Sources (all free): 🎧 Audius (full tracks) · 🎵 Deezer/iTunes (previews, charts &amp; albums) · 🎯 Last.fm (similarity &amp; artist info) · 📝 lyrics.ovh\n' +
    '🎵 Genres: ' + GENRE_KEYS.join(', ') + '\n🎨 Moods: ' + MOOD_KEYS.join(', ');
}
```

- [ ] **Step 4: Update `registerCommands()`'s commands array**

Replace the `commands` array inside `registerCommands()`:

```js
  const commands = [
    { command: 'play', description: 'Play a song, radio mode keeps it going' },
    { command: 'similar', description: 'Find tracks like a song or what\'s playing' },
    { command: 'radio', description: 'on|off — toggle auto-continue with similar tracks' },
    { command: 'browse', description: 'Explore music by genre, incl. Japanese Jazz Fusion' },
    { command: 'artists', description: 'Tap a featured artist to explore' },
    { command: 'album', description: 'Search and browse full albums' },
    { command: 'find', description: 'Search real songs → tap to play, queue, or save' },
    { command: 'full', description: 'Full free tracks  e.g. /full lofi study' },
    { command: 'pause', description: 'Stop auto-advance' },
    { command: 'resume', description: 'Continue auto-advance' },
    { command: 'skip', description: 'Skip to the next queued track' },
    { command: 'queue', description: 'Show what\'s playing and up next' },
    { command: 'about', description: 'Artist bio + tags for what\'s playing' },
    { command: 'like', description: 'Favorite the current track' },
    { command: 'favorites', description: 'List your favorites' },
    { command: 'playlist', description: 'new|add|play|list|view|del <name>' },
    { command: 'profile', description: 'Your stats' },
    { command: 'history', description: 'Recent plays' },
    { command: 'music', description: 'Compose an original track  e.g. /music synthwave hype' },
    { command: 'lyrics', description: 'Get lyrics  e.g. /lyrics coldplay - yellow' },
    { command: 'genres', description: 'All styles & moods' },
    { command: 'help', description: 'All commands' },
    { command: 'start', description: 'Welcome' },
  ];
```

- [ ] **Step 5: Run the full unit test suite**

Run: `npx jest backend/tests/turtle-music-results.test.js backend/tests/turtle-music-session.test.js backend/tests/turtle-music-profiles.test.js backend/tests/turtle-music-sources.test.js`
Expected: PASS, zero failures (exact count includes everything from v2 plus Task 1's 4 and Task 3's 4 new tests — report the actual total, don't guess it in advance)

- [ ] **Step 6: Restart the local server and re-register commands**

```bash
netstat -ano | grep ":3000" | grep LISTENING
```

Stop whatever's listed (`powershell -Command "Stop-Process -Id <PID> -Force"`), then:

```bash
cd "SHADDAI MASTER FINAL BUILD"
nohup node backend/server-production.js > /tmp/shaddai-server.log 2>&1 &
sleep 8
grep -i turtle /tmp/shaddai-server.log
```

Expected: `[turtle-music-bot] ENABLED — @TurtleMusicBot · /music /play /find /genres` (the boot log line itself is unchanged, cosmetic only).

- [ ] **Step 7: Report on `LASTFM_API_KEY` status**

Check whether `LASTFM_API_KEY` is present in `.env`:

```bash
grep -c LASTFM_API_KEY "SHADDAI MASTER FINAL BUILD/.env" || echo "0 — not set"
```

If it's not set, state this clearly and prominently in the task report — every Last.fm-dependent feature (`/similar`, `/about`, radio-mode continuation past the explicit queue, the Japanese Jazz Fusion browse entry) will reply with a graceful "not available right now" instead of real data until the owner provides one. This is expected, correct behavior, not a defect — but it means full live verification of those specific features is blocked until the key exists.

- [ ] **Step 8: Full manual live-Telegram walkthrough (controller performs this with the owner, not a subagent — no live Telegram access)**

Once `LASTFM_API_KEY` is available, message `@TurtleMusicBot` directly and confirm:

1. `/play <song>` — top result is the real track, not a cover (spot-check a song known to have lots of karaoke/cover uploads, e.g. a very popular pop song).
2. Let an explicit `/play` queue run out — confirm radio mode kicks in automatically with a similar track, without any command from you.
3. `/radio off`, let the queue run out again — confirm it actually stops this time.
4. `/similar` with an argument, and `/similar` with nothing (while something's playing).
5. `/about` while something's playing.
6. `/album <name>` → tap an album → tap ▶ on a track.
7. `/browse` → confirm Hip-Hop/Jazz and 🎌 Japanese Jazz Fusion appear near the top → tap the Japanese Jazz Fusion entry.
8. `/artists` → tap one of the named artists (e.g. Drake) → tap ▶.
9. On any `/find` result, tap 📃 → tap an existing playlist → confirm via `/playlist view <name>` that the track landed there.
10. Confirm album art photos are appearing alongside tracks that have it.

- [ ] **Step 9: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): default /play to filtered+ranked search, update copy and command menu for v3"
```
