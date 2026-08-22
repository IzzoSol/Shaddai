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
    '▶️ <b>/play</b> &lt;song&gt; — play any song instantly\n' +
    '🎧 <b>/full</b> &lt;vibe&gt; — full free tracks\n' +
    '🔎 <b>/find</b> &lt;song&gt; — search &amp; pick\n' +
    '🎼 <b>/music</b> &lt;genre&gt; — compose an original\n' +
    '📝 <b>/lyrics</b> artist - title\n\n' +
    'Or just type a song name. Tap a style to start 👇';
}
function helpText() {
  return '🐢 <b>Turtle Music Bot — commands</b>\n\n' +
    '<b>/play</b> &lt;query&gt;\n   Instantly play the top match — full track if available, else preview.\n' +
    '<b>/full</b> &lt;query&gt;\n   Full free tracks only (Audius). e.g. <code>/full lofi study</code>\n' +
    '<b>/find</b> &lt;query&gt;\n   Search all sources → tap 🎧/▶ to play.\n' +
    '<b>/music</b> [genre] [mood] [bars]\n   Original procedural track. e.g. <code>/music lofi chill 12</code>\n' +
    '<b>/lyrics</b> artist - title\n   Song lyrics. e.g. <code>/lyrics daft punk - get lucky</code>\n' +
    '<b>/genres</b> — styles &amp; moods · <b>/help</b> — this list\n\n' +
    'Sources (all free): 🎧 Audius (full tracks) · 🎵 Deezer/iTunes (previews) · 📝 lyrics.ovh\n' +
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
  const msg = update.message; if (!msg) return;
  const chatId = msg.chat && msg.chat.id, userId = msg.from && msg.from.id, text = (msg.text || '').trim();
  if (!chatId || !text) return;
  const m = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) { // bare text → treat as a play query for convenience
    return doPlay(chatId, text, userId);
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
    default: return send(chatId, "Unknown command. Try /help — or just type a song name and I'll play it.");
  }
}

// ── command menu + polling loop ──────────────────────────────────────────────
async function registerCommands() {
  const commands = [
    { command: 'play', description: 'Play a song instantly  e.g. /play blinding lights' },
    { command: 'full', description: 'Full free tracks  e.g. /full lofi study' },
    { command: 'find', description: 'Search real songs → tap to play' },
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
