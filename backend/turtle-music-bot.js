// backend/turtle-music-bot.js — @TurtleMusicBot (ShaddaiLabs)
// A DEDICATED Telegram music bot, independent from the signals bot. Own token
// (TURTLE_MUSIC_BOT_TOKEN), own long-polling loop, own command router.
//
// FREE + no keys:
//   • /music — original procedural tracks (backend/lib/music-gen-node.js)
//   • /find, /play — look up real songs via the iTunes Search API (free, no key),
//     stream the 30-second preview back as Telegram audio.
'use strict';

const fs = require('fs');
const path = require('path');
const mg = require('./lib/music-gen-node');
const results = require('./lib/turtle-music-results');
const session = require('./lib/turtle-music-session');
const profiles = require('./lib/turtle-music-profiles');
const lastfm = require('./lib/lastfm');

const TOKEN = () => process.env.TURTLE_MUSIC_BOT_TOKEN || '';
const API = (m) => `https://api.telegram.org/bot${TOKEN()}/${m}`;
const MASCOT = path.join(__dirname, '..', 'public', 'assets', 'turtle-music-bot.png');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── senders ──────────────────────────────────────────────────────────────────
async function send(chatId, html, buttons) {
  try {
    const body = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
    if (buttons) body.reply_markup = buttons;
    const r = await fetch(API('sendMessage'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok;
  } catch (e) { return false; }
}
async function chatAction(chatId, action) {
  try { await fetch(API('sendChatAction'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action }) }); } catch (e) {}
}
async function sendAudio(chatId, bytes, filename, caption, title, buttons) {
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (caption) { fd.append('caption', caption.slice(0, 1024)); fd.append('parse_mode', 'HTML'); }
    if (title) fd.append('title', String(title).slice(0, 64));
    if (buttons) fd.append('reply_markup', JSON.stringify(buttons));
    const mime = /\.mp3$/i.test(filename) ? 'audio/mpeg' : /\.(m4a|aac|mp4)$/i.test(filename) ? 'audio/mp4' : 'audio/wav';
    fd.append('audio', new Blob([bytes], { type: mime }), filename);
    const r = await fetch(API('sendAudio'), { method: 'POST', body: fd });
    return r.ok;
  } catch (e) { return false; }
}
async function sendMascot(chatId, caption, buttons) {
  try {
    if (!fs.existsSync(MASCOT)) return send(chatId, caption, buttons);
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption.slice(0, 1024));
    fd.append('parse_mode', 'HTML');
    if (buttons) fd.append('reply_markup', JSON.stringify(buttons));
    fd.append('photo', new Blob([fs.readFileSync(MASCOT)]), 'turtle.png');
    const r = await fetch(API('sendPhoto'), { method: 'POST', body: fd });
    return r.ok || send(chatId, caption, buttons);
  } catch (e) { return send(chatId, caption, buttons); }
}
async function answerCb(id, text) {
  try { await fetch(API('answerCallbackQuery'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: id, text: text || '' }) }); } catch (e) {}
}

// ── copy ─────────────────────────────────────────────────────────────────────
const GENRE_KEYS = Object.keys(mg.GENRES);
const MOOD_KEYS = Object.keys(mg.MOODS);
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
function genreButtons() {
  const row = (arr) => arr.map((g) => ({ text: mg.GENRES[g].name, callback_data: 'g:' + g }));
  return { inline_keyboard: [row(GENRE_KEYS.slice(0, 3)), row(GENRE_KEYS.slice(3, 6))] };
}

// ── music generation ─────────────────────────────────────────────────────────
async function doMusic(chatId, arg) {
  let genre = null, mood = null, bars = 8;
  String(arg || '').toLowerCase().split(/\s+/).filter(Boolean).forEach((w) => {
    const gk = mg.pickGenre(w), mk = mg.pickMood(w);
    if (!genre && gk) genre = gk; else if (!mood && mk) mood = mk; else if (/^\d+$/.test(w)) bars = Math.max(4, Math.min(16, parseInt(w, 10)));
  });
  await chatAction(chatId, 'record_voice');
  try {
    const { wav, meta } = mg.generate({ genre, mood, bars });
    const cap = '🐢 <b>Turtle Music Bot</b> · ' + meta.genreName + ' · ' + meta.bpm + ' BPM · ' + meta.seconds + 's\n<i>Original · ShaddaiLabs</i>';
    const ok = await sendAudio(chatId, wav, 'turtle-' + meta.genre + '.wav', cap, meta.genreName + ' — Turtle', genreButtons());
    if (!ok) await send(chatId, '⚠️ Could not send the track — try again.');
  } catch (e) { await send(chatId, '⚠️ Music engine hiccup — try <code>/music lofi</code>'); }
}

// ── real-song lookup — multi-source, all FREE/no-key ──────────────────────────
// Audius (full tracks) + Deezer/iTunes (previews) + lyrics.ovh. See lib/music-sources.
const src = require('./lib/music-sources');
const TG_AUDIO_MAX = 48 * 1024 * 1024; // Telegram bot audio ~50MB; keep headroom

const trackLabel = (tr) => (tr.name + ' — ' + tr.artist).trim();
const srcTag = (tr) => tr.source === 'audius' ? '🎧 full track · Audius' : tr.source === 'deezer' ? '🎵 preview · Deezer' : '🎵 preview · iTunes';
const ext = (tr) => tr.source === 'itunes' ? '.m4a' : '.mp3';

async function sendArt(chatId, tr) {
  if (!tr.art) return;
  try {
    await fetch(API('sendPhoto'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: tr.art }) });
  } catch (_) {} // best-effort only, never affects playback
}

function resultRow(tr, rid, i) {
  return [
    { text: '▶ ' + trackLabel(tr).slice(0, 30), callback_data: 'p:' + rid + ':' + i },
    { text: '➕', callback_data: 'q:' + rid + ':' + i },
    { text: '📃', callback_data: 'pl:' + rid + ':' + i },
  ];
}

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
    await sendArt(chatId, tr);
    const ok = await sendAudio(chatId, buf, fn, cap, trackLabel(tr));
    if (!ok) { await send(chatId, '⚠️ Telegram rejected that file. <a href="' + tr.stream + '">▶ Stream it</a>'); return false; }
    return true;
  } catch (e) { await send(chatId, '⚠️ Playback failed — try /play again.'); return false; }
}

// ── queue engine — auto-advance via turtle-music-session ──────────────────
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

async function playNow(chatId, tr, userId) {
  const hadUpcoming = session.upcoming(chatId).length > 0; // about to be discarded by startSession
  session.startSession(chatId, [tr], userId);
  const ok = await playTrack(chatId, tr);
  if (ok) { await profiles.pushHistory(userId, tr); scheduleNext(chatId); }
  if (hadUpcoming) await send(chatId, 'ℹ️ Started a new queue — your previous queue was cleared.');
}

async function queueTrack(chatId, tr, userId) {
  const cur = session.current(chatId);
  if (!cur) return playNow(chatId, tr, userId);
  session.enqueue(chatId, tr);
  return send(chatId, '➕ Queued: <b>' + esc(trackLabel(tr)) + '</b>');
}

async function doFind(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/find &lt;song or artist&gt;</code>  e.g. <code>/find daft punk</code>');
  await chatAction(chatId, 'typing');
  const res = await src.search(arg);
  if (!res.length) return send(chatId, 'No tracks found for <b>' + esc(arg) + '</b>.');
  const rid = results.create(chatId, res);
  const btns = res.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '🔎 <b>' + esc(arg) + '</b> — 🎧 full · ▶ play now · ➕ queue:', { inline_keyboard: btns });
}
async function doPlay(chatId, arg, userId) {
  if (!arg) return send(chatId, 'Usage: <code>/play &lt;song&gt;</code>  e.g. <code>/play blinding lights</code>');
  await chatAction(chatId, 'typing');
  const res = await src.search(arg);
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
  const btns = res.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '🎧 Full free tracks for <b>' + esc(arg) + '</b>:', { inline_keyboard: btns });
}

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
  let track = session.advance(chatId);
  if (!track && session.isRadio(chatId)) track = await extendRadio(chatId);
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

async function doBrowseGenre(chatId, genreId) {
  await chatAction(chatId, 'typing');
  const tracks = await src.genreChart(genreId, 10);
  if (!tracks.length) return send(chatId, 'No chart tracks for that genre right now.');
  const rid = results.create(chatId, tracks);
  const btns = tracks.map((tr, i) => resultRow(tr, rid, i));
  return send(chatId, '📚 Top tracks:', { inline_keyboard: btns });
}

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
      return send(chatId, names.length ? '📃 <b>Your playlists</b>:\n' + names.map((n) => '• ' + esc(n)).join('\n') : 'No playlists yet — <code>/playlist new &lt;name&gt;</code>');
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

async function doLyrics(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/lyrics artist - title</code>  e.g. <code>/lyrics coldplay - yellow</code>');
  await chatAction(chatId, 'typing');
  let artist, title;
  const dash = arg.split(/\s+[-–]\s+/);
  if (dash.length >= 2) { artist = dash[0].trim(); title = dash.slice(1).join(' - ').trim(); }
  else { const res = await src.deezerSearch(arg, 1); const t = res[0];
    if (!t) return send(chatId, 'Add an artist: <code>/lyrics &lt;artist&gt; - &lt;title&gt;</code>');
    artist = t.artist; title = t.name; }
  const ly = await src.getLyrics(artist, title);
  if (!ly) return send(chatId, 'No lyrics found for <b>' + esc(artist) + ' — ' + esc(title) + '</b>.');
  const body = ly.length > 3500 ? ly.slice(0, 3500) + '\n…' : ly;
  return send(chatId, '📝 <b>' + esc(title) + '</b> — ' + esc(artist) + '\n\n' + esc(body));
}

// ── router ───────────────────────────────────────────────────────────────────
async function handle(update) {
  if (update.callback_query) {
    const cq = update.callback_query, chatId = cq.message && cq.message.chat && cq.message.chat.id, userId = cq.from && cq.from.id, data = String(cq.data || '');
    if (data.startsWith('g:')) { await answerCb(cq.id, '🎼 composing…'); return doMusic(chatId, data.slice(2)); }
    if (data.startsWith('br:')) { await answerCb(cq.id); return doBrowseGenre(chatId, data.slice(3)); }
    if (data.startsWith('bp:')) { await answerCb(cq.id); return doBrowse(chatId, parseInt(data.slice(3), 10) || 0); }
    if (data.startsWith('al:')) { await answerCb(cq.id); return doAlbumTracks(chatId, data.slice(3)); }
    if (data.startsWith('jjt:')) { await answerCb(cq.id); return doTagBrowse(chatId, 'japanese jazz fusion'); }
    if (data.startsWith('ar:')) { await answerCb(cq.id); return doArtistTracks(chatId, decodeURIComponent(data.slice(3))); }
    if (data.startsWith('ap:')) { await answerCb(cq.id); return doArtists(chatId, parseInt(data.slice(3), 10) || 0); }
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
    return answerCb(cq.id);
  }
  const msg = update.message; if (!msg) return;
  const chatId = msg.chat && msg.chat.id, userId = msg.from && msg.from.id, text = (msg.text || '').trim();
  if (!chatId || !text) return;
  const isPrivate = !msg.chat || msg.chat.type === 'private';
  const m = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) { // bare text → treat as a play query, but only in a 1:1 DM
    if (isPrivate) return doPlay(chatId, text, userId);
    return; // groups/supergroups/channels: never react to plain chat text
  }
  const cmd = m[1].toLowerCase(), arg = (m[2] || '').trim();
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
    case 'radio': return doRadio(chatId, arg);
    case 'similar': case 'like2': return doSimilar(chatId, arg);
    case 'browse': case 'library': return doBrowse(chatId, 0);
    case 'artists': return doArtists(chatId, 0);
    case 'like': case 'fav': return doLike(chatId, userId);
    case 'favorites': case 'likes': return doFavorites(chatId, userId);
    case 'playlist': case 'pl': return doPlaylist(chatId, userId, arg);
    case 'profile': case 'me': return doProfile(chatId, userId);
    case 'history': return doHistory(chatId, userId);
    case 'about': return doAbout(chatId);
    case 'album': return doAlbum(chatId, arg);
    default:
      // Groups are full of other bots' commands — stay quiet unless it's ours.
      if (!isPrivate) return;
      return send(chatId, "Unknown command. Try /help — or just type a song name and I'll play it.");
  }
}

// ── command menu + polling loop ──────────────────────────────────────────────
async function registerCommands() {
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
  for (const scope of [{ type: 'default' }, { type: 'all_private_chats' }, { type: 'all_group_chats' }]) {
    try { await fetch(API('setMyCommands'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commands, scope }) }); } catch (e) {}
  }
}
async function getUpdates(offset) {
  const r = await fetch(API('getUpdates') + '?timeout=30&offset=' + offset, { signal: AbortSignal.timeout(40000) });
  const j = await r.json(); return (j && j.result) || [];
}
let running = false;
async function loop() {
  await registerCommands();
  let offset = 0, fails = 0;
  while (running) {
    try {
      const ups = await getUpdates(offset); fails = 0;
      for (const u of ups) { offset = u.update_id + 1; handle(u).catch(() => {}); }
    } catch (e) { fails++; await sleep(Math.min(30000, 2000 * fails)); }
  }
}
function start() {
  if (!TOKEN()) { console.log('[turtle-music-bot] disabled — set TURTLE_MUSIC_BOT_TOKEN to enable.'); return; }
  if (running) return; running = true;
  console.log('[turtle-music-bot] ENABLED — @TurtleMusicBot · /music /play /find /genres');
  loop();
}
function stop() { running = false; }

module.exports = { start, stop, handle };
