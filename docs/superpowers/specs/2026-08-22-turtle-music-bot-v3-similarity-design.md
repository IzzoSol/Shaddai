# Turtle Music Bot v3 — Similarity, Radio Mode, Album Art — Design Spec

Date: 2026-08-22
Status: Approved for implementation planning

## Context

`@TurtleMusicBot` v2 (`backend/turtle-music-bot.js`) ships a working
player: search/play/queue across Audius/Deezer/iTunes, auto-advance
via `backend/lib/turtle-music-session.js`, a genre-chart `/browse` via
`backend/lib/music-sources.js`'s `genreList`/`genreChart`, and
persisted favorites/playlists/history via
`backend/lib/turtle-music-profiles.js`.

Owner ask: "make better music and more in-depth stuff" — specifically
(1) recommend a *similar* next track rather than just stopping, (2)
richer track/artist metadata (album art, artist bio), (3) make
playlist-building easier than "play it first, then `/playlist add`".

## Goals

1. A real "similar song" engine using Last.fm's free API (genuine
   listening-graph similarity, not a genre-matching approximation).
2. Radio mode: when a session's queue drains, it doesn't go idle — it
   auto-continues with tracks similar to whatever just finished.
   Default **on**; `/radio off` / `/radio on` to control it.
3. `/similar [song]` — tappable similar-track results seeded from a
   given song or whatever's currently playing.
4. Album art sent alongside tracks (Deezer/iTunes/Audius already
   carry cover-art URLs we currently discard).
5. `/about` — artist bio + tags for the currently-playing track
   (Last.fm `artist.getInfo`), on demand rather than bolted onto
   every play message.
6. One-tap "add to playlist" on every tappable result (`/find`,
   `/similar`, `/browse`), not just on whatever's currently playing.
7. Search results are too often covers/tributes/karaoke knockoffs
   instead of the real track — filter these out and rank the licensed
   Deezer catalog above Audius's user-uploads for `/play`'s default
   pick (Audius stays available, unfiltered of this concern, via
   `/full` for anyone who specifically wants a complete-length track).
8. Results should favor the actual, canonical artist over
   loosely-matched or misattributed results, without going as far as
   hard-requiring an exact artist match (owner explicitly wants
   filter + soft reorder, not strict-only matching).
9. Album search/browse (`/album`), not just individual tracks.
10. Curated quick-pick entry points: pinned genres (Japanese jazz
   fusion, hip-hop) surfaced first in `/browse`, and a new `/artists`
   command with a curated, genre-spanning starter roster.
11. The bot must stay quiet in group ("coin") chats unless directly
   invoked — plain chat text and unrecognized commands should never
   trigger a reply there; explicit `/commands` the bot owns still work
   for anyone, in any chat.

## Non-goals

- No changes to the underlying audio sources or how tracks stream —
  Last.fm is metadata/graph-only, never used for playback URLs.
- No UI beyond Telegram's existing inline-keyboard/message primitives.
- No per-track auto-appended artist bios (spam risk) — `/about` is
  opt-in.

## Architecture

### 1. `backend/lib/lastfm.js` (new)

Same fail-soft, timeout-wrapped pattern as the rest of
`backend/lib/music-sources.js`. Requires a free API key
(`LASTFM_API_KEY` env var — 2-minute signup at last.fm/api, no
payment, no OAuth needed for these read-only public endpoints).

```js
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

module.exports = { similarTracks, artistInfo };
```

`similarTracks` returns *candidates*, not playable tracks — Last.fm
has no stream URLs. Resolving each candidate into something playable
reuses the existing `src.search` from `music-sources.js`.

### 2. Similarity resolution helper (new, in `turtle-music-bot.js`)

```js
const lastfm = require('./lib/lastfm');

// Resolve up to `limit` Last.fm similar-track candidates into real,
// playable tracks via the existing multi-source search. Runs
// sequentially and stops once `limit` resolve, to avoid hammering
// three APIs for candidates we'll never use.
async function resolveSimilar(seedArtist, seedTitle, limit = 6) {
  const candidates = await lastfm.similarTracks(seedArtist, seedTitle, limit * 2);
  const out = [];
  for (const c of candidates) {
    if (out.length >= limit) break;
    const hits = await src.search(c.artist + ' ' + c.name, { full: false });
    if (hits[0]) out.push(hits[0]);
  }
  return out;
}
```

Fetching `limit * 2` candidates and stopping once `limit` resolve
accounts for candidates that don't resolve to any playable source.

### 3. Album art in the unified track shape

`backend/lib/music-sources.js`'s three search functions and
`genreChart` each already receive art-bearing API responses they
currently discard. Add an `art: string|null` field to the unified
track shape:

- `audiusSearch`: Audius track objects carry `artwork['480x480']` (or
  `'150x150'` as a smaller fallback) — `t.artwork && (t.artwork['480x480'] || t.artwork['150x150']) || null`.
- `deezerSearch` / `genreChart`: Deezer track objects carry
  `album.cover_medium` — `(x.album && x.album.cover_medium) || null`.
- `itunesSearch`: iTunes results carry `artworkUrl100` —
  `x.artworkUrl100 || null`.

`resolveSimilar`'s output already carries `art` since it's built from
`src.search`, which now includes it.

### 4. Radio mode (`turtle-music-session.js` + `turtle-music-bot.js`)

Add a `radio` boolean to the session shape (default `true`), plus
`setRadio(chatId, on)` / `isRadio(chatId)` to
`backend/lib/turtle-music-session.js`:

```js
function setRadio(chatId, on) {
  const s = getSession(chatId);
  if (s) s.radio = !!on;
  return !!on;
}
function isRadio(chatId) {
  const s = getSession(chatId);
  return s ? s.radio !== false : true; // no session yet → treat as "on" for the next one
}
```

`startSession` sets `radio: true` on the new session object by
default (matching the owner's "default ON" decision).

In `turtle-music-bot.js`, `scheduleNext`'s auto-advance callback
changes from "queue exhausted → stop" to "queue exhausted → try radio
continuation, else stop":

```js
function scheduleNext(chatId) {
  session.armTimer(chatId, async () => {
    let track = session.advance(chatId);
    if (!track) {
      if (session.isRadio(chatId)) track = await extendRadio(chatId);
      if (!track) return; // radio off, or no similar tracks resolved — go idle
    }
    const s = session.getSession(chatId);
    const ok = await playTrack(chatId, track);
    if (ok && s) await profiles.pushHistory(s.ownerId, track);
    scheduleNext(chatId);
  });
}

async function extendRadio(chatId) {
  const last = session.lastPlayed(chatId); // see below
  if (!last) return null;
  const more = await resolveSimilar(last.artist, last.name, 5);
  if (!more.length) return null;
  return session.appendAndAdvance(chatId, more);
}
```

Two small additions needed to `turtle-music-session.js`:
- `lastPlayed(chatId)`: the track at `queue[queue.length - 1]` right
  before it drained — simplest correct source is just "the last item
  of the current queue array" (since `advance()` only nulls out once
  `pos` runs past the array, the array itself still holds the last
  track that played). Implementation: `queue[queue.length - 1] || null`.
- `appendAndAdvance(chatId, tracks)`: push `tracks` onto the session's
  queue and advance `pos` to the first newly-added one, returning it —
  the moral equivalent of `enqueue` + `advance` in one atomic step so
  `armTimer`'s caller always gets back a concrete "what to play next".

`doSkip` and manual `/skip` past an exhausted queue get the same
radio-continuation treatment for consistency — `doSkip` calls
`extendRadio` when `session.advance` returns null and radio is on,
mirroring `scheduleNext`.

`/radio` command:

```js
async function doRadio(chatId, arg) {
  const a = (arg || '').trim().toLowerCase();
  if (a === 'off') { session.setRadio(chatId, false); return send(chatId, '📻 Radio mode off — playback will stop when the queue ends.'); }
  if (a === 'on') { session.setRadio(chatId, true); return send(chatId, '📻 Radio mode on — I\'ll keep going with similar tracks.'); }
  return send(chatId, '📻 Radio mode is currently ' + (session.isRadio(chatId) ? '<b>on</b>' : '<b>off</b>') + '. Use <code>/radio on</code> or <code>/radio off</code>.');
}
```

### 5. `/similar [song]`

```js
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
  const btns = similar.map((tr, i) => resultRow(tr, rid, i)); // see §6, shared row builder
  return send(chatId, '🎯 Similar to <b>' + esc(trackLabel(seed)) + '</b>:', { inline_keyboard: btns });
}
```

Tapping ▶ on a `/similar` result calls the existing `playNow`, which
starts a fresh (radio-on-by-default) session — so continuing to play
naturally keeps recommending from there.

### 6. One-tap "add to playlist" on every result row

Every place that currently builds `[{▶}, {➕}]` button rows
(`doFind`, `doFull`, `doBrowseGenre`, the new `doSimilar`) switches to
a shared row builder that adds a third button:

```js
function resultRow(tr, rid, i) {
  return [
    { text: '▶ ' + trackLabel(tr).slice(0, 30), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
    { text: '📃', callback_data: 'pl:' + rid + ':' + i },
  ];
}
```

Tapping 📃 shows the user's playlists as buttons (plus "＋ New"):

```js
async function doPlaylistPicker(chatId, userId, rid, idx) {
  const tracks = results.get(rid, chatId);
  const tr = tracks && tracks[idx];
  if (!tr) { return send(chatId, 'That result expired — search again.'); }
  const names = await profiles.listPlaylists(userId);
  // Re-use the SAME result id + index in the picker's own callback_data so the
  // eventual "add" step can re-resolve the exact track without re-encoding it.
  const rows = names.map((n) => [{ text: '📃 ' + n, callback_data: 'pa:' + rid + ':' + idx + ':' + encodeURIComponent(n) }]);
  rows.push([{ text: '＋ New playlist…', callback_data: 'pn:' + rid + ':' + idx }]);
  return send(chatId, 'Add <b>' + esc(trackLabel(tr)) + '</b> to which playlist?', { inline_keyboard: rows });
}
```

`pa:<rid>:<idx>:<name>` (add to an existing playlist) and
`pn:<rid>:<idx>` (start "new playlist" flow — replies asking the user
to type `/playlist new <name>` then re-tap 📃, since Telegram bots
can't natively prompt for free-text input inline without a
`ForceReply`, which is out of scope for this round) are new
callback_data prefixes routed in `handle()`'s callback branch,
alongside the existing `g:`/`br:`/`bp:`/`p:`/`q:`.

`pa:` encodes the playlist name via `encodeURIComponent` to keep it
callback_data-safe; Telegram's 64-byte limit means playlist names used
this way are implicitly capped short (already true in practice since
users type them by hand).

### 7. `/about`

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

### 8. Album art delivery

`playTrack` sends a small `sendPhoto` (art URL directly, Telegram
accepts an HTTP(S) URL string for `photo`) immediately before the
existing `sendAudio` call, only when `tr.art` is present:

```js
async function sendArt(chatId, tr) {
  if (!tr.art) return;
  try {
    await fetch(API('sendPhoto'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: tr.art }) });
  } catch (_) {} // best-effort, never blocks playback
}
```

Called from `playTrack` right before the `sendAudio` call, fire-and-forget
style (`await`ed but its own failure never affects the return value
`playTrack` reports — wrapped in its own try/catch as shown, no `return`
on failure).

## Data flow (radio mode, typical session)

1. `/play daft punk` → `doPlay` searches, `session.startSession` (radio
   defaults `true`), plays track 1 of up to 5 matches, `scheduleNext`
   arms a timer for its duration.
2. Explicit queue (the other up-to-4 matches) plays out normally via
   existing `advance()`.
3. Once `advance()` returns `null` (queue truly exhausted) and
   `session.isRadio(chatId)` is `true`: `extendRadio` calls
   `resolveSimilar(lastTrack.artist, lastTrack.name)`, gets back up to
   5 playable tracks, `session.appendAndAdvance` pushes them and
   returns the first — playback continues seamlessly, no user action
   needed.
4. This repeats indefinitely (each new "last track" reseeds the next
   `resolveSimilar` call) until `/pause`, `/clear`, `/stop`, or
   `/radio off` (which only stops *future* auto-continuation, not the
   currently-playing track).
5. If `resolveSimilar` ever returns nothing (Last.fm has no data for
   an obscure artist, or `LASTFM_API_KEY` is unset/rate-limited), the
   session goes idle exactly like today — no crash, no infinite retry
   loop, no user-facing error spam.

## Error handling

- `lastfm.js` follows the file-wide fail-soft convention: unset API
  key or any network/parse failure → `[]`/`null`, never throws.
- `resolveSimilar` degrades gracefully at every step: no Last.fm
  candidates → `[]`; a candidate that doesn't resolve via `src.search`
  is simply skipped, not retried.
- `sendArt`'s failure (bad URL, Telegram rejects the photo, network
  blip) never blocks or fails the subsequent `sendAudio` — art is a
  nice-to-have, not a playback dependency.
- `doPlaylistPicker`/`pa:`/`pn:` reuse the existing `results.get(rid,
  chatId)` TTL/chat-scoping — an expired result behaves exactly like
  the existing `p:`/`q:` "expired" path.
- Radio continuation never loops forever on failure: one
  `resolveSimilar` call per exhaustion event, and a `null` result
  simply ends the session (matches pre-radio-mode behavior) rather
  than retrying.

## Testing

- `backend/lib/lastfm.js`: manual `node -e` verification against the
  live API (same pattern used for `music-sources.js`'s `genreList`/
  `genreChart` in the previous round) — no jest tests, consistent with
  every other network-dependent function in this codebase having none.
- `turtle-music-session.js` additions (`setRadio`/`isRadio`/
  `lastPlayed`/`appendAndAdvance`): plain jest unit tests, same style
  as the existing `turtle-music-session.test.js` (fake timers not
  required for these — pure state transitions).
- `resolveSimilar` and the button-row/callback-data plumbing: `node -e`
  smoke tests calling `handle()` with synthetic updates, same pattern
  used throughout the v2 implementation, plus a live manual Telegram
  walkthrough covering: `/similar` with and without an argument,
  letting radio mode actually kick in after a short queue drains,
  `/radio off` then confirming playback stops at the end of the
  explicit queue, `/about`, and the 📃 add-to-playlist flow end to end
  (tap 📃 → tap an existing playlist → confirm via `/playlist view`).
- `filterKnockoffs`: plain jest unit tests (pure function, no
  network) — asserts a "cover"/"karaoke"/"tribute" titled track is
  dropped by default, and kept when the query itself contains that
  word. `search()`'s Deezer-first reordering is covered by the same
  live-API manual verification pattern as the rest of
  `music-sources.js` (no jest tests for network-dependent functions).
- Group-chat quiet mode (§9) is already shipped and was smoke-tested
  this session (group bare text / unknown command / recognized
  command, private bare text — commit `44e6369`); no additional
  testing needed for it in this plan.

### 9. Group-chat quiet mode

**Already shipped ahead of this spec** (commit `44e6369`, live before
this plan is implemented — the owner needed it immediately since the
bot was already live in several group chats and disrupting them).
Documented here for completeness since it changes `handle()`'s
control flow that the rest of this spec builds on:

- `handle()` now computes `isPrivate = !msg.chat || msg.chat.type === 'private'`.
- The bare-text-as-play convenience (`if (!m) { ... }`) only fires
  when `isPrivate` — in any group/supergroup/channel, plain chat text
  is ignored entirely.
- An unrecognized `/command` only gets the "Unknown command" reply
  when `isPrivate` — in a group, it's silently ignored (busy coin
  chats have many other bots' commands flying around; ours shouldn't
  reply to all of them).
- Explicit `/commands` this bot actually owns (`/play`, `/find`,
  `/similar`, etc.) still work for **anyone** in **any** chat type —
  the owner explicitly chose not to require `@mention`-style
  addressing on top of this.

No further work needed for this item in the implementation plan below
— it's already in `main`.

### 10. Search-quality filtering + Deezer-first ranking

`backend/lib/music-sources.js` gains a shared filter, exported so
`turtle-music-bot.js` can reuse it wherever results are built
(`doFind`, `doPlay`, `doSimilar`'s `resolveSimilar`, `doBrowseGenre`):

```js
const KNOCKOFF_RE = /\b(cover|tribute|karaoke|instrumental|made famous by|in the style of|originally performed by)\b/i;

// Drop cover/tribute/karaoke-style results UNLESS the user's own query
// already contains one of those words (so /find "yellow cover" still works).
function filterKnockoffs(tracks, query) {
  if (KNOCKOFF_RE.test(query || '')) return tracks;
  return tracks.filter((t) => !KNOCKOFF_RE.test(t.name) && !KNOCKOFF_RE.test(t.album || ''));
}
```

`search(term, opts)` changes in two ways:
1. Applies `filterKnockoffs(out, term)` to its merged result set
   before de-duping/slicing.
2. Default (non-`full`) ordering changes from `[...audius, ...deezer]`
   to `[...deezer, ...audius]` — Deezer is a licensed commercial
   catalog (far less prone to user-uploaded covers/knockoffs than
   Audius, which anyone can upload to); putting it first means the
   *default* top pick is more likely the real, correct track. The
   `opts.full` path (used by `/full`, which explicitly wants complete
   Audius tracks) is unchanged — Audius stays primary there since
   completeness is the explicit ask in that command.

`doPlay` changes from `src.search(arg, { full: true })` to
`src.search(arg)` — this is a deliberate behavior change from v2:
`/play`'s default pick now favors "the correct, real track" (a 30s
Deezer preview of the right song) over "a complete track that might
be a knockoff" (Audius). Anyone who wants a full-length listen can
still reach it via `/full` or by tapping a result explicitly.

`genreChart` also runs its output through `filterKnockoffs` (Deezer
chart data is generally official, but tribute-act charts and karaoke
compilations do occasionally place, so it's a cheap safety net) —
called with an empty `query` string so the "user asked for it"
exemption never applies there (nobody explicitly searched a genre
chart for "karaoke").

**Soft artist-preference boost.** After filtering, `search()` does a
stable sort pass: if the query text contains a token that matches a
result's artist name (case-insensitive, e.g. searching `"blinding
lights the weeknd"` matches artist `"The Weeknd"`), that result sorts
before results whose artist isn't mentioned in the query. This is a
*soft* reorder, not a filter — a result with no artist-name overlap
is never dropped, just ranked lower, since plenty of legitimate
searches are title-only (`/play yellow`) and have nothing to match
against:

```js
function boostCanonicalArtist(tracks, query) {
  const q = (query || '').toLowerCase();
  return [...tracks].sort((a, b) => {
    const am = q.includes(String(a.artist || '').toLowerCase()) ? 0 : 1;
    const bm = q.includes(String(b.artist || '').toLowerCase()) ? 0 : 1;
    return am - bm; // stable: ties keep their existing relative order
  });
}
```

Applied in `search()` right after `filterKnockoffs`, before the
final `.slice(0, 8)`.

### 11. Album search & browse

Two new functions in `backend/lib/music-sources.js` (Deezer's album
endpoints, free/no-key, same fail-soft pattern):

```js
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
      artist: (x.artist && x.artist.name) || j.artist && j.artist.name || '', album: j.title || '',
      art: j.cover_medium || null, duration: x.duration || 30, stream: x.preview }));
  } catch (_) { return []; }
}
```

New `/album <name>` command in `turtle-music-bot.js`:

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

New callback prefix `al:<albumId>` routed alongside `br:`/`bp:` in
`handle()`'s callback branch, calling `doAlbumTracks`.

### 12. Curated quick-pick genres and artists

`doBrowse` (from v2) changes to pin favorites to the front of the
genre list before pagination, rather than using Deezer's raw
ordering:

```js
const PINNED_GENRES = ['Rap/Hip Hop', 'Jazz']; // Deezer's actual genre names to surface first
async function doBrowse(chatId, page) {
  page = page || 0;
  await chatAction(chatId, 'typing');
  const genres = await src.genreList();
  if (!genres.length) return send(chatId, '⚠️ Could not load genres right now — try again shortly.');
  const pinned = PINNED_GENRES.map((n) => genres.find((g) => g.name === n)).filter(Boolean);
  const rest = genres.filter((g) => !pinned.includes(g));
  const ordered = page === 0
    ? [{ id: 'jjf', name: '🎌 Japanese Jazz Fusion' }, ...pinned, ...rest]
    : rest.slice((page - 1) * 8 - Math.max(0, 8 - pinned.length - 1)); // simplified: see plan task for exact pagination math
  // ...render as before, using `ordered`
}
```

("Japanese Jazz Fusion" isn't a real Deezer genre id — it's not a
mainstream taxonomy category anywhere in Deezer/iTunes/Audius's genre
lists — so it's a synthetic entry: tapping it (`callback_data:
'jjt:jjf'`, a new prefix) calls a small helper that pulls from
Last.fm's tag-based browse instead of a Deezer genre id:

```js
async function tagTopTracks(tag, limit = 10) {
  if (!KEY()) return [];
  try {
    const url = BASE + '?method=tag.gettoptracks&tag=' + encodeURIComponent(tag) + '&api_key=' + KEY() + '&format=json&limit=' + limit;
    const j = await (await fetch(url, { signal: TO(10000) })).json();
    const arr = (j.tracks && j.tracks.track) || [];
    return arr.map((t) => ({ name: t.name, artist: (t.artist && t.artist.name) || '' }));
  } catch (_) { return []; }
}
```

— added to `backend/lib/lastfm.js` alongside `similarTracks`/
`artistInfo`, and resolved into playable tracks the same way
`resolveSimilar` does (both share a single generic
`resolveCandidates(candidates, limit)` helper in `turtle-music-bot.js`
that `resolveSimilar` and the new tag-browse path both call, instead
of duplicating the "search each candidate, keep first hit" loop).

New `/artists` command — a curated, genre-spanning starter roster
(owner-specified core plus a few for range):

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
  const res = await src.search(name); // filtered + Deezer-first + artist-boosted, same as /find
  if (!res.length) return send(chatId, 'No tracks found for <b>' + esc(name) + '</b>.');
  const rid = results.create(chatId, res);
  const btns = res.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '🎤 <b>' + esc(name) + '</b>:', { inline_keyboard: btns });
}
```

`Nujabes` and `Fleetwood Mac` round out the roster toward the
"Japanese jazz fusion" / classic-rock ends of the spectrum
respectively, alongside the hip-hop/R&B core the owner named, so the
starter list itself spans genres rather than being hip-hop-only —
this list is easy to edit later (it's a plain array, not derived from
any API), so the owner can freely add/remove/reorder names post-launch
without touching any other logic.

## Rollout

Requires one new env var, `LASTFM_API_KEY`, added to `.env` locally
and to Render's Environment tab — owner needs to sign up for a free
key at last.fm/api and provide it (same pattern as
`TURTLE_MUSIC_BOT_TOKEN`/`HELIUS_API_KEY` in this codebase's history).
Every Last.fm-dependent feature (`/similar`, `/about`, radio-mode
continuation) fails soft to "not available right now" if the key is
missing — the bot remains fully functional on v2 behavior without it,
just without the new discovery layer.
