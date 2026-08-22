# Turtle Music Bot v2 — Design Spec

Date: 2026-08-22
Status: Approved for implementation planning

## Context

`@TurtleMusicBot` (`backend/turtle-music-bot.js`) already ships free,
no-key music lookup: `/find`, `/play`, `/full` (search across Audius
full tracks, Deezer previews, iTunes previews via
`backend/lib/music-sources.js`), `/music` (procedural generation via
`backend/lib/music-gen-node.js`), and `/lyrics`. It runs as an
independent long-polling bot started from `server-production.js`
(no-op unless `TURTLE_MUSIC_BOT_TOKEN` is set — now set in `.env`).

Owner ask: finish it into a bot that plays reliably, has a real
browsable library ("vast selection ... doesn't get mixed up, easy to
find, play, pause, change"), and supports playlists + a per-user
profile. Visualizer/video output is explicitly **deferred** — out of
scope for this spec.

## Goals

1. Fix a real bug: stale search-result buttons can play the wrong
   track after a newer search overwrites the per-chat result cache.
2. Give the bot a session model so playback feels continuous:
   queue, auto-advance, pause/resume, skip.
3. Add a genre/chart-based library browse, distinct from ad-hoc
   search, so users can discover music without knowing what to type.
4. Persist per-user favorites, playlists, and play history; expose a
   `/profile` summary.

## Non-goals

- No visualizer/video generation this round.
- No cross-device "real" playback control — Telegram gives us no way
  to pause an already-sent audio file; "pause" means "stop
  auto-advancing the queue," not stopping in-flight playback.
- No group-shared profiles — favorites/playlists/history are keyed to
  the Telegram **user id**, not the chat id (so a user's library is
  the same in DMs and any group).

## Architecture

Three new/changed pieces, all inside the existing
`backend/turtle-music-bot.js` + `backend/lib/` structure — no new
services, no new processes.

### 1. Result-set fix (`resultStore`)

Replace the single `lastResults: Map<chatId, track[]>` with
short-lived, ID-tagged result sets:

```js
// Map<resultId, { chatId, tracks, ts }>
const resultSets = new Map();
const RESULT_TTL_MS = 30 * 60 * 1000; // 30 min
function newResultSet(chatId, tracks) {
  const id = crypto.randomBytes(4).toString('hex'); // 8 chars
  resultSets.set(id, { chatId, tracks, ts: Date.now() });
  return id;
}
```

Callback data becomes `p:<resultId>:<idx>:<mode>` where `mode` is `p`
(play now) or `q` (queue). `<resultId>` stays within Telegram's 64-byte
callback_data limit (8 hex chars). A periodic sweep (on each callback
handled, cheap) evicts entries older than `RESULT_TTL_MS`. Pressing an
expired button replies "that search expired — try again" instead of
silently playing the wrong song.

This directly fixes the "gets mixed up" complaint and is the only
change to existing `/find` / `/full` behavior.

### 2. Session (`sessions`) — queue + auto-advance

Per-chat, in-memory only (not persisted — resets on server restart,
same limitation the bot already has today for `lastResults`):

```js
// Map<chatId, { queue: track[], pos: number, paused: bool, timer: Timeout|null }>
```

- `/play <query>`: search (existing `src.search`), build a queue from
  the top ~5 matches, set `pos=0`, send `queue[0]` immediately, and
  arm auto-advance.
- Auto-advance: after sending a track, `setTimeout(() => advance(chatId), track.duration * 1000)`.
  Applies uniformly to previews (30s) and full Audius tracks (real
  duration) — owner confirmed "auto-advance everything."
  `advance()` increments `pos`, sends the next track, re-arms the
  timer; if `pos` runs off the end of the queue, session goes idle
  (no error, just stops).
- `/pause`: `clearTimeout(session.timer)`, `paused = true`.
- `/resume`: if paused and queue has a next track, re-arm the timer
  for the *next* track (don't resume mid-track — there's no concept
  of elapsed time to resume from; resuming just means "keep
  advancing").
- `/skip` / `/next`: clear timer, advance immediately.
- `/queue`: list upcoming tracks (`pos+1..`) with a header showing the
  currently-playing one.
- `/np`: show the currently-playing track's info.
- `/clear`: drop the session entirely.
- Tapping "➕ queue" on a `/find` result appends to the session's
  queue (creating one if none exists) instead of playing immediately;
  "▶ play now" jumps the queue to that track and sends it right away.

### 3. Library browse (`/browse`)

New `backend/lib/music-sources.js` export using Deezer's free,
no-key chart/genre endpoints:

- `GET https://api.deezer.com/genre` → list of genres (id, name,
  picture) — cached in-process for 24h.
- `GET https://api.deezer.com/chart/{genre_id}` → `{ tracks, albums,
  artists, playlists }` for that genre; we use `tracks.data` (already
  has `preview` URLs, same shape work as `deezerSearch` output).

Flow: `/browse` → inline keyboard of genre names (paged, 8 per
screen, "More ▶" button) → tap genre → chart tracks for that genre as
a `/find`-style result set (reuses `resultStore` + play/queue
buttons) → tap to play/queue.

This is additive; existing `/find`, `/full`, `/play` are untouched
except for the result-set ID fix.

### 4. Persistence (`backend/data/turtle-music-profiles.json`)

New file via the existing `JsonStore` (`backend/lib/json-store.js`,
already used by the referral/treasury services — atomic write,
serialized lock, proven pattern). Shape:

```json
{
  "users": {
    "<telegram_user_id>": {
      "favorites": [ { "name": "...", "artist": "...", "source": "audius", "stream": "...", "duration": 210 } ],
      "playlists": { "<name>": [ track, ... ] },
      "history": [ { "name": "...", "artist": "...", "ts": 1234567890 } ],
      "defaultGenre": null,
      "joinedAt": 1234567890
    }
  }
}
```

- `history` capped at last 50 entries (push + slice), written on every
  successful `sendAudio`.
- `favorites`/`playlists` capped generously (e.g. 200 tracks / 30
  playlists) to bound file growth — soft caps, reject with a friendly
  message past the cap rather than silently truncating.
- New commands: `/like` (favorite the now-playing track — reads
  `session.queue[session.pos]`), `/favorites` (list, tap to
  play/queue), `/playlist new <name>`, `/playlist add <name>` (adds
  now-playing), `/playlist play <name>` (loads playlist as a new
  session queue and starts it), `/playlist list`, `/playlist view
  <name>`, `/playlist del <name>`.
- `/profile`: summary card — total plays (history length, or a
  separate lifetime counter since history is capped), favorites
  count, playlist count, member-since date.
- `/history`: last N plays, tap to replay.

All persistence calls go through `profileStore.withLock(db => {...})`
— never direct file reads/writes, to avoid the interleaved-write bugs
`JsonStore` was built to prevent.

## Data flow (typical `/play` interaction)

1. User: `/play blinding lights`
2. `doPlay` → `src.search(query, {full:false})` (unchanged) → top 5
   results become a new session queue for that chat.
3. `sendAudio` for `queue[0]`; on success, append to that user's
   `history` in `turtle-music-profiles.json`; arm the auto-advance
   timer for `queue[0].duration` seconds.
4. Timer fires → `advance(chatId)` → sends `queue[1]`, logs history,
   re-arms.
5. User sends `/pause` any time → timer cleared, queue holds at
   current `pos`.
6. User sends `/like` → reads `queue[pos]`, pushes to that user's
   `favorites` (dedup by name+artist).

## Error handling

- Every new network call (Deezer genre/chart) follows the existing
  fail-soft pattern in `music-sources.js` — wrapped in try/catch,
  `AbortSignal.timeout`, returns `[]` on failure, never throws into
  the router.
- `advance()` on an empty/exhausted queue is a no-op, not an error.
- `/playlist add`/`/like` with no active `now playing` track replies
  with usage help instead of throwing.
- `JsonStore` writes are atomic (tmp file + rename), so a crash
  mid-write can't corrupt `turtle-music-profiles.json`; worst case is
  losing the in-flight mutation, not the file.
- Session state living in memory means a server restart silently
  drops all active queues/pauses — acceptable (matches the bot's
  existing restart behavior for `lastResults`), but `/queue` right
  after a restart should say "nothing queued" cleanly, not error.

## Testing

- Unit-level: `music-sources.js` new `genreList()`/`genreChart(id)`
  functions tested the same way `search`/`audiusSearch` were verified
  in this session — direct `node -e` calls against the live free
  APIs, checking non-empty results and correct shape.
- `resultStore` TTL/eviction and the play-vs-queue callback_data
  parsing get plain Node unit tests (no network) since they're pure
  logic.
- `JsonStore`-backed profile mutations (`/like`, `/playlist add`,
  history capping) get unit tests against a temp file path, verifying
  concurrent-write safety isn't broken (reuse the pattern from
  `tests/referral-foundation.test.js` if one exists for `JsonStore`
  consumers).
- End-to-end: manual live test via real Telegram messages to
  `@TurtleMusicBot` (as started this session) — `/browse` → pick
  genre → tap track, `/play` → `/pause` → `/resume` → `/skip`,
  `/like` → `/favorites`, `/playlist new` → `/playlist add` →
  `/playlist play`, `/profile`.

## Rollout

No deploy/env changes beyond the already-added
`TURTLE_MUSIC_BOT_TOKEN` in `.env`. Render env var is a separate,
already-known follow-up (add `TURTLE_MUSIC_BOT_TOKEN` to the Render
service's Environment tab) — not part of this spec's code changes.
