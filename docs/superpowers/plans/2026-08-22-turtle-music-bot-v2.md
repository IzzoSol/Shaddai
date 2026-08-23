# Turtle Music Bot v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `@TurtleMusicBot` from one-shot search/play into a full player: fixed result-buttons, a queue with auto-advance, a genre-browse library, and persisted favorites/playlists/history/profile.

**Architecture:** Three new small, dependency-free-of-Telegram library modules under `backend/lib/` (`turtle-music-results.js`, `turtle-music-session.js`, `turtle-music-profiles.js`) hold all new state/logic and are unit tested in isolation. `backend/lib/music-sources.js` gains two Deezer-chart functions. `backend/turtle-music-bot.js` (the Telegram-facing router) is then rewired to use all four, adding new commands. No new services, no new processes, no schema changes to existing files.

**Tech Stack:** Node.js (CommonJS), native `fetch`, Telegram Bot HTTP API, Jest (`npx jest`, not a project devDependency — resolved via npm's package-runner cache, confirmed working: `npx jest --version` → `30.4.1`).

**Spec:** `docs/superpowers/specs/2026-08-22-turtle-music-bot-v2-design.md`

## Global Constraints

- No new npm dependencies — everything free/no-key (Deezer, Audius, iTunes, lyrics.ovh), matching the existing bot's "FREE + no keys" design.
- Every new network call in `music-sources.js` must fail soft (`try/catch` → `[]`/`null`), matching the existing pattern in that file — never throw into the router.
- All profile persistence goes through `backend/lib/json-store.js`'s `JsonStore` (atomic write, serialized lock) — never a direct `fs.writeFileSync` on `turtle-music-profiles.json`.
- Favorites/playlists/history are keyed by Telegram **user id** (`msg.from.id` / `cq.from.id`), not chat id — a user's library is the same in DMs and groups.
- Session/queue state stays in-memory only (matches the bot's existing restart behavior for its old `lastResults` cache) — do not persist it.
- Visualizer/video generation is out of scope for this plan.
- Tests run with `npx jest <path>` from `SHADDAI MASTER FINAL BUILD/` (repo root for this project); no jest config exists, none is needed for these plain `.test.js` files.

---

## Task 1: Result-set store (fixes the stale-button bug)

**Files:**
- Create: `backend/lib/turtle-music-results.js`
- Test: `backend/tests/turtle-music-results.test.js`

**Interfaces:**
- Consumes: nothing (pure, no deps beyond Node's `crypto`).
- Produces: `create(chatId, tracks, now = Date.now()) -> id: string`, `get(id, chatId, now = Date.now()) -> tracks|null`, `sweep(now = Date.now())`, `TTL_MS: number`, `_clear()` (test-only, wipes all state).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/turtle-music-results.test.js`:

```js
'use strict';
const results = require('../lib/turtle-music-results');

beforeEach(() => results._clear());

describe('turtle-music-results', () => {
  test('create returns an id and get retrieves the tracks for the right chat', () => {
    const tracks = [{ name: 'A', artist: 'X' }, { name: 'B', artist: 'Y' }];
    const id = results.create('123', tracks);
    expect(typeof id).toBe('string');
    expect(results.get(id, '123')).toEqual(tracks);
  });

  test('get returns null for the wrong chat id', () => {
    const id = results.create('123', [{ name: 'A', artist: 'X' }]);
    expect(results.get(id, '999')).toBeNull();
  });

  test('get returns null for an unknown id', () => {
    expect(results.get('deadbeef', '123')).toBeNull();
  });

  test('get returns null once the entry is older than the TTL', () => {
    const id = results.create('123', [{ name: 'A', artist: 'X' }], 1000);
    expect(results.get(id, '123', 1000 + results.TTL_MS + 1)).toBeNull();
  });

  test('get still returns the tracks just under the TTL', () => {
    const id = results.create('123', [{ name: 'A', artist: 'X' }], 1000);
    expect(results.get(id, '123', 1000 + results.TTL_MS - 1)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `SHADDAI MASTER FINAL BUILD/`): `npx jest backend/tests/turtle-music-results.test.js`
Expected: FAIL — `Cannot find module '../lib/turtle-music-results'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/lib/turtle-music-results.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest backend/tests/turtle-music-results.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/lib/turtle-music-results.js backend/tests/turtle-music-results.test.js
git commit -m "feat(turtle-music-bot): add TTL'd result-set store, fixes stale-button playback"
```

---

## Task 2: Queue/session engine

**Files:**
- Create: `backend/lib/turtle-music-session.js`
- Test: `backend/tests/turtle-music-session.test.js`

**Interfaces:**
- Consumes: nothing (pure, in-memory, uses Node's `setTimeout`/`clearTimeout`).
- Produces: `startSession(chatId, tracks, ownerId) -> session`, `getSession(chatId) -> session|null` (session shape: `{queue, pos, paused, timer, ownerId}`), `current(chatId) -> track|null`, `upcoming(chatId) -> track[]`, `advance(chatId) -> track|null`, `armTimer(chatId, cb) -> boolean`, `pause(chatId) -> boolean`, `resume(chatId) -> boolean` (does **not** re-arm the timer itself — caller must call `armTimer` again), `enqueue(chatId, track) -> track[]`, `clearSession(chatId)`, `_clearAll()` (test-only).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/turtle-music-session.test.js`:

```js
'use strict';
const session = require('../lib/turtle-music-session');

beforeEach(() => { session._clearAll(); jest.useRealTimers(); });

describe('turtle-music-session', () => {
  test('startSession sets the queue and current track at position 0', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c1', tracks, 'u1');
    expect(session.current('c1')).toEqual(tracks[0]);
    expect(session.upcoming('c1')).toEqual([tracks[1]]);
    expect(session.getSession('c1').ownerId).toBe('u1');
  });

  test('advance moves to the next track and returns null past the end', () => {
    const tracks = [{ name: 'A', duration: 10 }, { name: 'B', duration: 10 }];
    session.startSession('c1', tracks, 'u1');
    expect(session.advance('c1')).toEqual(tracks[1]);
    expect(session.advance('c1')).toBeNull();
  });

  test('armTimer fires the callback after the current track duration', () => {
    jest.useFakeTimers();
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    const cb = jest.fn();
    session.armTimer('c1', cb);
    jest.advanceTimersByTime(9999);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('pause cancels a pending timer and armTimer no-ops while paused', () => {
    jest.useFakeTimers();
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    const cb = jest.fn();
    session.armTimer('c1', cb);
    expect(session.pause('c1')).toBe(true);
    jest.advanceTimersByTime(20000);
    expect(cb).not.toHaveBeenCalled();
    expect(session.armTimer('c1', cb)).toBe(false);
    jest.useRealTimers();
  });

  test('resume clears the paused flag but does not itself re-arm', () => {
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    session.pause('c1');
    expect(session.resume('c1')).toBe(true);
    expect(session.getSession('c1').paused).toBe(false);
    expect(session.resume('c1')).toBe(false); // already resumed, nothing to do
  });

  test('enqueue appends to an existing session or starts a new one', () => {
    expect(session.enqueue('c2', { name: 'A' })).toEqual([{ name: 'A' }]);
    expect(session.current('c2')).toEqual({ name: 'A' });
    session.enqueue('c2', { name: 'B' });
    expect(session.upcoming('c2')).toEqual([{ name: 'B' }]);
  });

  test('clearSession removes the session and cancels any timer', () => {
    jest.useFakeTimers();
    session.startSession('c1', [{ name: 'A', duration: 10 }], 'u1');
    const cb = jest.fn();
    session.armTimer('c1', cb);
    session.clearSession('c1');
    jest.advanceTimersByTime(20000);
    expect(cb).not.toHaveBeenCalled();
    expect(session.getSession('c1')).toBeNull();
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest backend/tests/turtle-music-session.test.js`
Expected: FAIL — `Cannot find module '../lib/turtle-music-session'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/lib/turtle-music-session.js`:

```js
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
  const s = { queue: (tracks || []).slice(), pos: 0, paused: false, timer: null, ownerId };
  sessions.set(key(chatId), s);
  return s;
}

function getSession(chatId) { return sessions.get(key(chatId)) || null; }

function current(chatId) {
  const s = getSession(chatId);
  return s ? (s.queue[s.pos] || null) : null;
}

function upcoming(chatId) {
  const s = getSession(chatId);
  return s ? s.queue.slice(s.pos + 1) : [];
}

function advance(chatId) {
  const s = getSession(chatId);
  if (!s) return null;
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  s.pos += 1;
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
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest backend/tests/turtle-music-session.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/lib/turtle-music-session.js backend/tests/turtle-music-session.test.js
git commit -m "feat(turtle-music-bot): add per-chat queue + auto-advance session engine"
```

---

## Task 3: Profile persistence (favorites, playlists, history)

**Files:**
- Create: `backend/lib/turtle-music-profiles.js`
- Test: `backend/tests/turtle-music-profiles.test.js`

**Interfaces:**
- Consumes: `JsonStore` from `backend/lib/json-store.js` — `new JsonStore(filePath, emptyShape)`, `.withLock(async db => ...)`, `.read()`.
- Produces: `getProfile(userId) -> {favorites, playlists, history, defaultGenre, joinedAt, totalPlays}`, `addFavorite(userId, track) -> {ok, dup?, reason?}`, `listFavorites(userId) -> track[]`, `createPlaylist(userId, name) -> {ok, reason?}`, `addToPlaylist(userId, name, track) -> {ok, reason?}`, `getPlaylist(userId, name) -> track[]|null`, `listPlaylists(userId) -> string[]`, `deletePlaylist(userId, name) -> {ok, reason?}`, `pushHistory(userId, track) -> history[]`, `getHistory(userId) -> history[]`, `profileSummary(userId) -> {totalPlays, favorites, playlists, joinedAt}`, plus test hooks `makeStore(filePath)`, `_useStore(store)`, and constants `FAV_CAP=200`, `PLAYLIST_CAP=30`, `PLAYLIST_TRACK_CAP=200`, `HISTORY_CAP=50`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/turtle-music-profiles.test.js`:

```js
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const profiles = require('../lib/turtle-music-profiles');

function tmpFile(tag) {
  return path.join(os.tmpdir(), `tmb-${tag}-${crypto.randomBytes(6).toString('hex')}.json`);
}

let file;
beforeEach(() => {
  file = tmpFile('profiles');
  profiles._useStore(profiles.makeStore(file));
});
afterEach(() => { try { fs.unlinkSync(file); } catch (_) {} });

describe('turtle-music-profiles', () => {
  const track = { name: 'Yellow', artist: 'Coldplay' };

  test('getProfile returns an empty shape for a new user', async () => {
    const p = await profiles.getProfile('u1');
    expect(p.favorites).toEqual([]);
    expect(p.playlists).toEqual({});
    expect(p.history).toEqual([]);
  });

  test('addFavorite adds a track and dedupes on a repeat add', async () => {
    const r1 = await profiles.addFavorite('u1', track);
    expect(r1).toEqual({ ok: true, dup: false });
    const r2 = await profiles.addFavorite('u1', track);
    expect(r2).toEqual({ ok: true, dup: true });
    const favs = await profiles.listFavorites('u1');
    expect(favs).toHaveLength(1);
  });

  test('addFavorite rejects once the cap is reached', async () => {
    for (let i = 0; i < profiles.FAV_CAP; i++) {
      await profiles.addFavorite('u1', { name: 'T' + i, artist: 'A' });
    }
    const r = await profiles.addFavorite('u1', { name: 'over', artist: 'A' });
    expect(r).toEqual({ ok: false, reason: 'cap' });
  });

  test('playlist create/add/get/list/delete round-trip', async () => {
    expect(await profiles.createPlaylist('u1', 'Chill')).toEqual({ ok: true });
    expect(await profiles.createPlaylist('u1', 'Chill')).toEqual({ ok: false, reason: 'exists' });
    expect(await profiles.addToPlaylist('u1', 'Chill', track)).toEqual({ ok: true });
    expect(await profiles.addToPlaylist('u1', 'Missing', track)).toEqual({ ok: false, reason: 'missing' });
    expect(await profiles.getPlaylist('u1', 'Chill')).toEqual([track]);
    expect(await profiles.listPlaylists('u1')).toEqual(['Chill']);
    expect(await profiles.deletePlaylist('u1', 'Chill')).toEqual({ ok: true });
    expect(await profiles.getPlaylist('u1', 'Chill')).toBeNull();
  });

  test('pushHistory caps history at HISTORY_CAP and increments totalPlays', async () => {
    for (let i = 0; i < profiles.HISTORY_CAP + 5; i++) {
      await profiles.pushHistory('u1', { name: 'T' + i, artist: 'A' });
    }
    const h = await profiles.getHistory('u1');
    expect(h).toHaveLength(profiles.HISTORY_CAP);
    expect(h[h.length - 1].name).toBe('T' + (profiles.HISTORY_CAP + 4));
    const s = await profiles.profileSummary('u1');
    expect(s.totalPlays).toBe(profiles.HISTORY_CAP + 5);
  });

  test('profileSummary reflects favorites and playlist counts', async () => {
    await profiles.addFavorite('u1', track);
    await profiles.createPlaylist('u1', 'Chill');
    const s = await profiles.profileSummary('u1');
    expect(s.favorites).toBe(1);
    expect(s.playlists).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest backend/tests/turtle-music-profiles.test.js`
Expected: FAIL — `Cannot find module '../lib/turtle-music-profiles'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/lib/turtle-music-profiles.js`:

```js
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

async function createPlaylist(userId, name) {
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
  makeStore, _useStore, FAV_CAP, PLAYLIST_CAP, PLAYLIST_TRACK_CAP, HISTORY_CAP,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest backend/tests/turtle-music-profiles.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/lib/turtle-music-profiles.js backend/tests/turtle-music-profiles.test.js
git commit -m "feat(turtle-music-bot): add persisted favorites/playlists/history profiles"
```

---

## Task 4: Deezer genre browse in music-sources.js

**Files:**
- Modify: `backend/lib/music-sources.js:1-73` (append new functions + extend the final `module.exports`)

**Interfaces:**
- Consumes: nothing new (same `fetch`/`TO` helpers already in the file).
- Produces: `genreList() -> Promise<{id, name, picture}[]>` (cached in-process 24h, fail-soft to `[]`), `genreChart(genreId, limit = 10) -> Promise<track[]>` (same unified track shape as `deezerSearch`: `{source:'deezer', full:false, name, artist, album, duration, stream}`, fail-soft to `[]`).

No jest tests for this task — these two functions hit the live Deezer API with no request/response mocking available in this codebase (the existing `search`/`audiusSearch`/`deezerSearch`/`itunesSearch` have no jest tests either, for the same reason). Verify with a direct `node -e` call instead, matching how `search`/`audiusSearch`/`getLyrics` were verified earlier this session.

- [ ] **Step 1: Add `genreList()` and `genreChart()`**

In `backend/lib/music-sources.js`, insert after the `itunesSearch` function (after line 51, before `getLyrics`):

```js
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
```

- [ ] **Step 2: Export the new functions**

Change the final line of `backend/lib/music-sources.js` from:

```js
module.exports = { search, audiusSearch, deezerSearch, itunesSearch, getLyrics, audiusHost };
```

to:

```js
module.exports = { search, audiusSearch, deezerSearch, itunesSearch, getLyrics, audiusHost, genreList, genreChart };
```

- [ ] **Step 3: Verify live against the real Deezer API**

Run:

```bash
node -e "
const src = require('./backend/lib/music-sources');
(async () => {
  const genres = await src.genreList();
  console.log('genres:', genres.length, genres.slice(0, 3));
  const g = genres.find((x) => /pop/i.test(x.name)) || genres[0];
  const chart = await src.genreChart(g.id, 5);
  console.log('chart for', g.name, ':', chart.length, chart[0]);
})().catch(e => console.error('FAIL', e));
"
```

Expected: `genres:` a non-empty list (Deezer has ~20 top-level genres); `chart for <name> :` 5 tracks each with a non-empty `stream` URL.

- [ ] **Step 4: Commit**

```bash
git add backend/lib/music-sources.js
git commit -m "feat(turtle-music-bot): add Deezer genre-chart browse to music-sources"
```

---

## Task 5: Wire results + session into the core commands (`/play`, `/find`, `/full`, `/pause`, `/resume`, `/skip`, `/queue`, `/np`, `/clear`)

This is the task that actually fixes the reported bug and turns the bot into a real player. It replaces `turtle-music-bot.js`'s old single-slot `lastResults` cache and one-shot `/play` with the new `turtle-music-results` + `turtle-music-session` modules, and adds queue-control commands. Favorites/playlists/browse/profile land in Tasks 6-7; this task only needs `results`, `session`, and `profiles.pushHistory` (already built in Tasks 1-3).

**Files:**
- Modify: `backend/turtle-music-bot.js` (multiple regions, see below — current file is 249 lines, read before editing since line numbers shift as you go)

**Interfaces:**
- Consumes: `results.create/get` (Task 1), `session.startSession/getSession/current/upcoming/advance/armTimer/pause/resume/enqueue/clearSession` (Task 2), `profiles.pushHistory` (Task 3).
- Produces: `playTrack(chatId, tr) -> Promise<boolean>` (now returns success/failure instead of nothing), `playNow(chatId, tr, userId)`, `queueTrack(chatId, tr, userId)`, `scheduleNext(chatId)` — all used by Task 6 and Task 7's handlers.

- [ ] **Step 1: Add the new requires**

At the top of `backend/turtle-music-bot.js`, after the existing `const mg = require('./lib/music-gen-node');` line, add:

```js
const results = require('./lib/turtle-music-results');
const session = require('./lib/turtle-music-session');
const profiles = require('./lib/turtle-music-profiles');
```

- [ ] **Step 2: Remove the old `lastResults` cache**

Delete this line (in the "real-song lookup" section):

```js
const lastResults = new Map(); // chatId -> unified track[]
```

(`results.create`/`results.get` from Task 1 replace it — every remaining reference to `lastResults` in this file is rewritten in the steps below.)

- [ ] **Step 3: Make `playTrack` report success/failure**

Replace the whole `playTrack` function with:

```js
async function playTrack(chatId, tr) {
  await chatAction(chatId, 'upload_voice');
  try {
    const r = await fetch(tr.stream, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!r.ok) { await send(chatId, '⚠️ Could not fetch that track.'); return false; }
    const clen = parseInt(r.headers.get('content-length') || '0', 10);
    if (clen && clen > TG_AUDIO_MAX) { await send(chatId, '🎧 <b>' + esc(tr.name) + '</b> is too long to send here.\n<a href="' + tr.stream + '">▶ Stream it</a>'); return false; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > TG_AUDIO_MAX) { await send(chatId, '🎧 <b>' + esc(tr.name) + '</b> is too long to send here.\n<a href="' + tr.stream + '">▶ Stream it</a>'); return false; }
    const fn = (tr.name || 'track').replace(/[^\w]+/g, '_').slice(0, 40) + ext(tr);
    const dur = tr.duration ? ' · ' + Math.floor(tr.duration / 60) + ':' + String(tr.duration % 60).padStart(2, '0') : '';
    const cap = '🎵 <b>' + esc(tr.name) + '</b>\n' + esc(tr.artist) + (tr.album ? ' · ' + esc(tr.album) : '') + '\n<i>' + srcTag(tr) + dur + '</i>';
    const ok = await sendAudio(chatId, buf, fn, cap, trackLabel(tr));
    if (!ok) { await send(chatId, '⚠️ Telegram rejected that file. <a href="' + tr.stream + '">▶ Stream it</a>'); return false; }
    return true;
  } catch (e) { await send(chatId, '⚠️ Playback failed — try /play again.'); return false; }
}
```

- [ ] **Step 4: Add the queue engine, replace `doFind`/`doPlay`/`doFull`**

Immediately after the new `playTrack` function, add:

```js
// ── queue engine — auto-advance via turtle-music-session ──────────────────
function scheduleNext(chatId) {
  session.armTimer(chatId, async () => {
    const track = session.advance(chatId);
    if (!track) return; // queue exhausted; session stays idle at its last position
    const s = session.getSession(chatId);
    const ok = await playTrack(chatId, track);
    if (ok && s) await profiles.pushHistory(s.ownerId, track);
    scheduleNext(chatId);
  });
}

async function playNow(chatId, tr, userId) {
  session.startSession(chatId, [tr], userId);
  const ok = await playTrack(chatId, tr);
  if (ok) { await profiles.pushHistory(userId, tr); scheduleNext(chatId); }
}

async function queueTrack(chatId, tr, userId) {
  const s = session.getSession(chatId);
  if (!s) return playNow(chatId, tr, userId);
  session.enqueue(chatId, tr);
  return send(chatId, '➕ Queued: <b>' + esc(trackLabel(tr)) + '</b>');
}
```

Then replace `doFind`, `doPlay`, and `doFull` entirely with:

```js
async function doFind(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/find &lt;song or artist&gt;</code>  e.g. <code>/find daft punk</code>');
  await chatAction(chatId, 'typing');
  const res = await src.search(arg);
  if (!res.length) return send(chatId, 'No tracks found for <b>' + esc(arg) + '</b>.');
  const rid = results.create(chatId, res);
  const btns = res.map((tr, i) => [
    { text: '▶ ' + trackLabel(tr).slice(0, 40), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
  ]);
  return send(chatId, '🔎 <b>' + esc(arg) + '</b> — 🎧 full · ▶ play now · ➕ queue:', { inline_keyboard: btns });
}
async function doPlay(chatId, arg, userId) {
  if (!arg) return send(chatId, 'Usage: <code>/play &lt;song&gt;</code>  e.g. <code>/play blinding lights</code>');
  await chatAction(chatId, 'typing');
  const res = await src.search(arg, { full: true });
  if (!res.length) return send(chatId, 'No playable match for <b>' + esc(arg) + '</b>. Try /find.');
  session.startSession(chatId, res.slice(0, 5), userId);
  const track = session.current(chatId);
  const ok = await playTrack(chatId, track);
  if (ok) { await profiles.pushHistory(userId, track); scheduleNext(chatId); }
}
async function doFull(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/full &lt;song or vibe&gt;</code> — full free tracks (Audius). e.g. <code>/full lofi study</code>');
  await chatAction(chatId, 'typing');
  const res = await src.audiusSearch(arg, 8);
  if (!res.length) return send(chatId, 'No full tracks for <b>' + esc(arg) + '</b>. Try /play for previews.');
  const rid = results.create(chatId, res);
  const btns = res.map((tr, i) => [
    { text: '▶ ' + trackLabel(tr).slice(0, 40), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
  ]);
  return send(chatId, '🎧 Full free tracks for <b>' + esc(arg) + '</b>:', { inline_keyboard: btns });
}
```

(`doLyrics` is unchanged — leave it in place as-is.)

- [ ] **Step 5: Add queue-control commands**

After `doFull` (and before `doLyrics`), add:

```js
async function doPause(chatId) {
  const ok = session.pause(chatId);
  return send(chatId, ok ? '⏸ Paused — auto-advance stopped. /resume to continue.' : 'Nothing playing right now.');
}
async function doResume(chatId) {
  const ok = session.resume(chatId);
  if (ok) scheduleNext(chatId);
  return send(chatId, ok ? '▶️ Resumed.' : 'Nothing to resume — try /play.');
}
async function doSkip(chatId, userId) {
  const s = session.getSession(chatId);
  if (!s) return send(chatId, 'Nothing queued — try /play.');
  const track = session.advance(chatId);
  if (!track) return send(chatId, '⏭ Queue finished.');
  const ok = await playTrack(chatId, track);
  if (ok) { await profiles.pushHistory(userId, track); scheduleNext(chatId); }
}
async function doQueueList(chatId) {
  const s = session.getSession(chatId);
  if (!s) return send(chatId, 'Nothing queued — try /play.');
  const cur = session.current(chatId);
  const up = session.upcoming(chatId);
  let txt = '🎵 <b>Now playing:</b> ' + (cur ? esc(trackLabel(cur)) : '—') + '\n';
  txt += up.length ? '\n<b>Up next:</b>\n' + up.map((t, i) => (i + 1) + '. ' + esc(trackLabel(t))).join('\n') : '\n<i>Queue is empty after this.</i>';
  return send(chatId, txt);
}
async function doNowPlaying(chatId) {
  const cur = session.current(chatId);
  return send(chatId, cur ? '🎵 Now playing: <b>' + esc(trackLabel(cur)) + '</b>' : 'Nothing playing — try /play.');
}
async function doClear(chatId) {
  session.clearSession(chatId);
  return send(chatId, '🧹 Queue cleared.');
}
```

- [ ] **Step 6: Rewrite the router's callback-query branch**

Replace the `if (update.callback_query) { ... }` block inside `handle()` with:

```js
  if (update.callback_query) {
    const cq = update.callback_query, chatId = cq.message && cq.message.chat && cq.message.chat.id, userId = cq.from && cq.from.id, data = String(cq.data || '');
    if (data.startsWith('g:')) { await answerCb(cq.id, '🎼 composing…'); return doMusic(chatId, data.slice(2)); }
    if (data.startsWith('p:') || data.startsWith('q:')) {
      const mode = data[0];
      const [rid, idxStr] = data.slice(2).split(':');
      const idx = parseInt(idxStr, 10);
      const tracks = results.get(rid, chatId);
      const tr = tracks && tracks[idx];
      if (!tr) { await answerCb(cq.id, 'expired'); return send(chatId, 'That result expired — search again.'); }
      await answerCb(cq.id, (mode === 'p' ? '▶ ' : '➕ ') + tr.name);
      return mode === 'p' ? playNow(chatId, tr, userId) : queueTrack(chatId, tr, userId);
    }
    return answerCb(cq.id);
  }
```

- [ ] **Step 7: Rewrite the router's command switch**

Replace the `switch (cmd) { ... }` block inside `handle()` with:

```js
  switch (cmd) {
    case 'start': return sendMascot(chatId, startText(), genreButtons());
    case 'help': return send(chatId, helpText());
    case 'music': case 'song': case 'beat': case 'track': case 'make':
      return arg ? doMusic(chatId, arg) : send(chatId, '🎼 Pick a style:', genreButtons());
    case 'genres': case 'styles':
      return send(chatId, '🎵 <b>Genres</b>: ' + GENRE_KEYS.map((g) => mg.GENRES[g].name).join(', ') +
        '\n🎨 <b>Moods</b>: ' + MOOD_KEYS.join(', ') + '\n\nUse: <code>/music &lt;genre&gt; &lt;mood&gt; [bars]</code>');
    case 'find': case 'search': case 'lookup': return doFind(chatId, arg);
    case 'play': case 'p': return doPlay(chatId, arg, userId);
    case 'full': case 'song2': return doFull(chatId, arg);
    case 'lyrics': case 'words': return doLyrics(chatId, arg);
    case 'pause': return doPause(chatId);
    case 'resume': return doResume(chatId);
    case 'skip': case 'next': return doSkip(chatId, userId);
    case 'queue': return doQueueList(chatId);
    case 'np': case 'nowplaying': return doNowPlaying(chatId);
    case 'clear': case 'stop': return doClear(chatId);
    default: return send(chatId, "Unknown command. Try /help — or just type a song name and I'll play it.");
  }
```

Also update the bare-text fallback a few lines above the command match (currently `return doPlay(chatId, text);`) to pass `userId`:

```js
  if (!m) { // bare text → treat as a play query for convenience
    return doPlay(chatId, text, userId);
  }
```

And add `userId = msg.from && msg.from.id,` to the destructuring line just above it, which currently reads:

```js
  const chatId = msg.chat && msg.chat.id, text = (msg.text || '').trim();
```

Change to:

```js
  const chatId = msg.chat && msg.chat.id, userId = msg.from && msg.from.id, text = (msg.text || '').trim();
```

- [ ] **Step 8: Manual smoke test — module loads and router doesn't throw on a synthetic update**

Run:

```bash
node -e "
const bot = require('./backend/turtle-music-bot');
bot.handle({ message: { chat: { id: 999 }, from: { id: 999 }, text: '/queue' } })
  .then(() => console.log('OK: /queue on empty session did not throw'))
  .catch((e) => { console.error('FAIL', e); process.exit(1); });
"
```

Expected: `OK: /queue on empty session did not throw` (the `send()` call inside will fail soft since `TURTLE_MUSIC_BOT_TOKEN`/network aren't exercised meaningfully here, but the router logic itself must not throw).

- [ ] **Step 9: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): wire result-store + queue/auto-advance into play/find/full and add pause/resume/skip/queue/np/clear"
```

---

## Task 6: `/browse` genre library

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `src.genreList`, `src.genreChart` (Task 4), `results.create` (Task 1), `queueTrack`/`playNow` (Task 5, already wired via the shared callback branch).
- Produces: `doBrowse(chatId, page)`, `doBrowseGenre(chatId, genreId)` — invoked from `/browse` and new `br:`/`bp:` callback prefixes.

- [ ] **Step 1: Add the browse handlers**

After `doClear` (added in Task 5, Step 5), add:

```js
async function doBrowse(chatId, page) {
  page = page || 0;
  await chatAction(chatId, 'typing');
  const genres = await src.genreList();
  if (!genres.length) return send(chatId, '⚠️ Could not load genres right now — try again shortly.');
  const perPage = 8;
  const slice = genres.slice(page * perPage, page * perPage + perPage);
  const rows = [];
  for (let i = 0; i < slice.length; i += 2) rows.push(slice.slice(i, i + 2).map((g) => ({ text: g.name, callback_data: 'br:' + g.id })));
  if ((page + 1) * perPage < genres.length) rows.push([{ text: 'More ▶', callback_data: 'bp:' + (page + 1) }]);
  return send(chatId, '📚 <b>Browse by genre</b> — tap a genre:', { inline_keyboard: rows });
}
async function doBrowseGenre(chatId, genreId) {
  await chatAction(chatId, 'typing');
  const tracks = await src.genreChart(genreId, 10);
  if (!tracks.length) return send(chatId, 'No chart tracks for that genre right now.');
  const rid = results.create(chatId, tracks);
  const btns = tracks.map((tr, i) => [
    { text: '▶ ' + trackLabel(tr).slice(0, 40), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
  ]);
  return send(chatId, '📚 Top tracks:', { inline_keyboard: btns });
}
```

- [ ] **Step 2: Route the new callback prefixes**

In the callback-query branch (from Task 5, Step 6), add two lines right after the `g:` check:

```js
    if (data.startsWith('br:')) { await answerCb(cq.id); return doBrowseGenre(chatId, data.slice(3)); }
    if (data.startsWith('bp:')) { await answerCb(cq.id); return doBrowse(chatId, parseInt(data.slice(3), 10) || 0); }
```

- [ ] **Step 3: Route the `/browse` command**

In the command switch (from Task 5, Step 7), add next to `case 'clear': case 'stop': return doClear(chatId);`:

```js
    case 'browse': case 'library': return doBrowse(chatId, 0);
```

- [ ] **Step 4: Manual live test**

With the server running (`node backend/server-production.js`, or already running from earlier this session — restart if it's stale) and `TURTLE_MUSIC_BOT_TOKEN` set in `.env`, message `@TurtleMusicBot` with `/browse`, tap a genre button, then tap a track's ▶ button. Confirm: genre buttons render, tapping one replaces the message flow with a track list, and tapping ▶ sends playable audio.

- [ ] **Step 5: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): add /browse genre-chart library"
```

---

## Task 7: Favorites, playlists, profile, history

**Files:**
- Modify: `backend/turtle-music-bot.js`

**Interfaces:**
- Consumes: `profiles.addFavorite/listFavorites/createPlaylist/addToPlaylist/getPlaylist/listPlaylists/deletePlaylist/profileSummary/getHistory` (Task 3), `session.current`/`startSession` (Task 2), `results.create` (Task 1), `playTrack`/`scheduleNext` (Task 5).
- Produces: `doLike`, `doFavorites`, `doPlaylist`, `doProfile`, `doHistory` — invoked from `/like`, `/favorites`, `/playlist`, `/profile`, `/history`.

- [ ] **Step 1: Add the handlers**

After `doBrowseGenre` (added in Task 6, Step 1), add:

```js
async function doLike(chatId, userId) {
  const cur = session.current(chatId);
  if (!cur) return send(chatId, 'Nothing playing to like — /play something first.');
  const r = await profiles.addFavorite(userId, cur);
  if (!r.ok) return send(chatId, r.reason === 'cap' ? '⚠️ Favorites list is full (200 max).' : '⚠️ Could not save that.');
  return send(chatId, r.dup ? '💛 Already in your favorites.' : '💛 Added to favorites: <b>' + esc(trackLabel(cur)) + '</b>');
}
async function doFavorites(chatId, userId) {
  const favs = await profiles.listFavorites(userId);
  if (!favs.length) return send(chatId, "No favorites yet — /like a track while it's playing.");
  const rid = results.create(chatId, favs);
  const btns = favs.map((tr, i) => [{ text: '▶ ' + trackLabel(tr).slice(0, 50), callback_data: 'p:' + rid + ':' + i }]);
  return send(chatId, '💛 <b>Your favorites</b>:', { inline_keyboard: btns });
}
async function doPlaylist(chatId, userId, argRaw) {
  const parts = (argRaw || '').trim().split(/\s+/);
  const sub = (parts.shift() || '').toLowerCase();
  const rest = parts.join(' ').trim();
  switch (sub) {
    case 'new': {
      if (!rest) return send(chatId, 'Usage: <code>/playlist new &lt;name&gt;</code>');
      const r = await profiles.createPlaylist(userId, rest);
      return send(chatId, r.ok ? '✅ Created playlist <b>' + esc(rest) + '</b>.' : r.reason === 'exists' ? 'You already have a playlist named that.' : '⚠️ Playlist limit reached (30 max).');
    }
    case 'add': {
      if (!rest) return send(chatId, 'Usage: <code>/playlist add &lt;name&gt;</code> (adds the currently playing track)');
      const cur = session.current(chatId);
      if (!cur) return send(chatId, 'Nothing playing to add — /play something first.');
      const r = await profiles.addToPlaylist(userId, rest, cur);
      return send(chatId, r.ok ? '✅ Added to <b>' + esc(rest) + '</b>.' : r.reason === 'missing' ? 'No playlist named that — /playlist new first.' : '⚠️ That playlist is full (200 tracks max).');
    }
    case 'play': {
      if (!rest) return send(chatId, 'Usage: <code>/playlist play &lt;name&gt;</code>');
      const tracks = await profiles.getPlaylist(userId, rest);
      if (!tracks || !tracks.length) return send(chatId, "No playlist named that (or it's empty).");
      session.startSession(chatId, tracks, userId);
      const track = session.current(chatId);
      const ok = await playTrack(chatId, track);
      if (ok) { await profiles.pushHistory(userId, track); scheduleNext(chatId); }
      return;
    }
    case 'list': {
      const names = await profiles.listPlaylists(userId);
      return send(chatId, names.length ? '📃 <b>Your playlists</b>:\n' + names.map((n) => '• ' + esc(n)).join('\n') : 'No playlists yet — /playlist new <name>');
    }
    case 'view': {
      if (!rest) return send(chatId, 'Usage: <code>/playlist view &lt;name&gt;</code>');
      const tracks = await profiles.getPlaylist(userId, rest);
      if (!tracks) return send(chatId, 'No playlist named that.');
      return send(chatId, '📃 <b>' + esc(rest) + '</b> (' + tracks.length + ' tracks):\n' + tracks.map((t, i) => (i + 1) + '. ' + esc(trackLabel(t))).join('\n'));
    }
    case 'del': case 'delete': case 'remove': {
      if (!rest) return send(chatId, 'Usage: <code>/playlist del &lt;name&gt;</code>');
      const r = await profiles.deletePlaylist(userId, rest);
      return send(chatId, r.ok ? '🗑️ Deleted <b>' + esc(rest) + '</b>.' : 'No playlist named that.');
    }
    default:
      return send(chatId, 'Usage: <code>/playlist new|add|play|list|view|del &lt;name&gt;</code>');
  }
}
async function doProfile(chatId, userId) {
  const s = await profiles.profileSummary(userId);
  const since = new Date(s.joinedAt).toISOString().slice(0, 10);
  return send(chatId, '👤 <b>Your profile</b>\n\nPlays: ' + s.totalPlays + '\nFavorites: ' + s.favorites + '\nPlaylists: ' + s.playlists + '\nMember since: ' + since);
}
async function doHistory(chatId, userId) {
  const h = await profiles.getHistory(userId);
  if (!h.length) return send(chatId, 'No plays yet — /play something!');
  const recent = h.slice(-15).reverse();
  return send(chatId, '🕓 <b>Recent plays</b>:\n' + recent.map((t) => '• ' + esc(t.name) + ' — ' + esc(t.artist)).join('\n'));
}
```

- [ ] **Step 2: Route the new commands**

In the command switch, add next to `case 'browse': case 'library': return doBrowse(chatId, 0);`:

```js
    case 'like': case 'fav': return doLike(chatId, userId);
    case 'favorites': case 'likes': return doFavorites(chatId, userId);
    case 'playlist': case 'pl': return doPlaylist(chatId, userId, arg);
    case 'profile': case 'me': return doProfile(chatId, userId);
    case 'history': return doHistory(chatId, userId);
```

- [ ] **Step 3: Manual live test**

Via real Telegram messages to `@TurtleMusicBot`: `/play <song>` → `/like` → `/favorites` (confirm the liked track appears and its ▶ button replays it) → `/playlist new Test` → `/playlist add Test` → `/playlist play Test` → `/profile` (counts reflect the above) → `/history` (shows recent plays).

- [ ] **Step 4: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): add /like /favorites /playlist /profile /history"
```

---

## Task 8: Update copy, command menu, and final end-to-end verification

**Files:**
- Modify: `backend/turtle-music-bot.js` (`startText`, `helpText`, `registerCommands`)

- [ ] **Step 1: Update `startText()`**

Replace the function with:

```js
function startText() {
  return '🐢 <b>Turtle Music Bot</b> — <i>by ShaddaiLabs</i>\n\n' +
    'Free music, right here in chat. No ads, no keys.\n\n' +
    '▶️ <b>/play</b> &lt;song&gt; — play instantly, auto-advances to more\n' +
    '📚 <b>/browse</b> — explore by genre\n' +
    '🔎 <b>/find</b> &lt;song&gt; — search &amp; pick\n' +
    '⏯️ <b>/pause /resume /skip /queue</b> — control what\'s playing\n' +
    '💛 <b>/like</b> · 📃 <b>/playlist</b> · 👤 <b>/profile</b>\n' +
    '🎼 <b>/music</b> &lt;genre&gt; — compose an original\n\n' +
    'Or just type a song name. Tap a style to start 👇';
}
```

- [ ] **Step 2: Update `helpText()`**

Replace the function with:

```js
function helpText() {
  return '🐢 <b>Turtle Music Bot — commands</b>\n\n' +
    '<b>/play</b> &lt;query&gt;\n   Play the top match and auto-advance through more like it.\n' +
    '<b>/browse</b>\n   Explore real charts by genre.\n' +
    '<b>/find</b> &lt;query&gt;\n   Search all sources → ▶ play now or ➕ queue.\n' +
    '<b>/full</b> &lt;query&gt;\n   Full free tracks only (Audius).\n' +
    '<b>/pause</b> / <b>/resume</b> / <b>/skip</b> / <b>/queue</b> / <b>/np</b> / <b>/clear</b>\n   Control the current session.\n' +
    '<b>/like</b> — favorite what\'s playing · <b>/favorites</b> — list them\n' +
    '<b>/playlist</b> new|add|play|list|view|del &lt;name&gt;\n' +
    '<b>/profile</b> — your stats · <b>/history</b> — recent plays\n' +
    '<b>/music</b> [genre] [mood] [bars]\n   Original procedural track. e.g. <code>/music lofi chill 12</code>\n' +
    '<b>/lyrics</b> artist - title\n   Song lyrics. e.g. <code>/lyrics daft punk - get lucky</code>\n' +
    '<b>/genres</b> — styles &amp; moods · <b>/help</b> — this list\n\n' +
    'Sources (all free): 🎧 Audius (full tracks) · 🎵 Deezer/iTunes (previews &amp; charts) · 📝 lyrics.ovh\n' +
    '🎵 Genres: ' + GENRE_KEYS.join(', ') + '\n🎨 Moods: ' + MOOD_KEYS.join(', ');
}
```

- [ ] **Step 3: Update `registerCommands()`**

Replace the `commands` array inside `registerCommands()` with:

```js
  const commands = [
    { command: 'play', description: 'Play a song, auto-advance queue  e.g. /play blinding lights' },
    { command: 'browse', description: 'Explore music by genre chart' },
    { command: 'find', description: 'Search real songs → tap to play or queue' },
    { command: 'full', description: 'Full free tracks  e.g. /full lofi study' },
    { command: 'pause', description: 'Stop auto-advance' },
    { command: 'resume', description: 'Continue auto-advance' },
    { command: 'skip', description: 'Skip to the next queued track' },
    { command: 'queue', description: 'Show what\'s playing and up next' },
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

- [ ] **Step 4: Run the full unit test suite**

Run: `npx jest backend/tests/turtle-music-results.test.js backend/tests/turtle-music-session.test.js backend/tests/turtle-music-profiles.test.js`
Expected: PASS (18 tests total across the three files)

- [ ] **Step 5: Restart the local server and re-register commands**

```bash
netstat -ano | grep ":3000" | grep LISTENING
```

If a process is listed, stop it (`powershell -Command "Stop-Process -Id <PID> -Force"`), then:

```bash
cd "SHADDAI MASTER FINAL BUILD"
nohup node backend/server-production.js > /tmp/shaddai-server.log 2>&1 &
sleep 8
grep -i turtle /tmp/shaddai-server.log
```

Expected: `[turtle-music-bot] ENABLED — @TurtleMusicBot · /music /play /find /genres` (the startup log line itself doesn't need updating — it's just a boot message).

- [ ] **Step 6: Full manual live-Telegram walkthrough**

Message `@TurtleMusicBot` directly and confirm each of the following works end-to-end (this is the "finished, working perfectly" bar from the spec):

1. `/start` — mascot photo + updated welcome text with genre buttons.
2. `/play blinding lights` — sends a track immediately; wait out its duration (or use a short preview result) and confirm the next queued track auto-sends without another command.
3. `/pause` mid-session, wait past when the next track would have auto-sent — confirm nothing sends. `/resume` — confirm the next track sends.
4. `/skip` — confirms immediate advance.
5. `/queue` and `/np` — confirm they reflect current state accurately.
6. `/find daft punk` — tap a ▶ button (plays immediately) on one result, then tap ➕ on another (confirms "Queued: ..." reply, and that track eventually auto-plays).
7. Search again with `/find` before tapping the first search's remaining buttons — confirm tapping the **old** message's button either still plays the correct original track or replies "expired," never the new search's track. This is the regression test for the original bug report.
8. `/browse` → tap a genre → tap a track — confirms the chart pipeline.
9. `/like` while something is playing, then `/favorites` — confirms the liked track is listed and tappable.
10. `/playlist new Test`, `/playlist add Test`, `/playlist play Test` — confirms playlists persist and load as a session.
11. `/profile` — confirms play/favorite/playlist counts look right.
12. `/history` — confirms recent plays are listed.
13. `/music lofi`, `/lyrics coldplay - yellow` — confirm the pre-existing features still work unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/turtle-music-bot.js
git commit -m "feat(turtle-music-bot): update help/start copy and command menu for v2"
```
