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
    'I make music, free, right here in chat.\n\n' +
    '🎼 <b>/music</b> — compose an original track\n' +
    '   e.g. <code>/music synthwave hype</code>\n' +
    '🔎 <b>/find</b> &lt;song&gt; — look up real songs\n' +
    '▶️ <b>/play</b> &lt;song&gt; — play a track instantly\n' +
    '🎛 <b>/genres</b> — all styles &amp; moods\n\n' +
    'Tap a style to start 👇';
}
function helpText() {
  return '🐢 <b>Turtle Music Bot — commands</b>\n\n' +
    '<b>/music</b> [genre] [mood] [bars]\n   Original procedural track. e.g. <code>/music lofi chill 12</code>\n' +
    '<b>/find</b> &lt;query&gt;\n   Search real songs (title/artist) → tap ▶ to play.\n' +
    '<b>/play</b> &lt;query&gt;\n   Instantly play the top match (30-sec preview).\n' +
    '<b>/genres</b> — list styles &amp; moods\n' +
    '<b>/help</b> — this list\n\n' +
    '🎵 Genres: ' + GENRE_KEYS.join(', ') + '\n' +
    '🎨 Moods: ' + MOOD_KEYS.join(', ');
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

// ── real-song lookup via iTunes (free, no key; 30s previews) ──────────────────
const lastResults = new Map(); // chatId -> [{name,artist,album,url}]
async function searchITunes(term, limit) {
  const r = await fetch('https://itunes.apple.com/search?media=music&limit=' + (limit || 6) + '&term=' + encodeURIComponent(term), { signal: AbortSignal.timeout(12000) });
  const j = await r.json();
  return (j.results || []).filter((x) => x.previewUrl).map((x) => ({ name: x.trackName, artist: x.artistName, album: x.collectionName, url: x.previewUrl }));
}
async function playTrack(chatId, tr) {
  await chatAction(chatId, 'upload_voice');
  try {
    const r = await fetch(tr.url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return send(chatId, '⚠️ Could not fetch that preview.');
    const buf = Buffer.from(await r.arrayBuffer());
    const fn = (tr.name || 'track').replace(/[^\w]+/g, '_').slice(0, 40) + '.m4a';
    const cap = '🎵 <b>' + esc(tr.name) + '</b>\n' + esc(tr.artist) + (tr.album ? ' · ' + esc(tr.album) : '') + '\n<i>30-sec preview · iTunes</i>';
    await sendAudio(chatId, buf, fn, cap, (tr.name || 'Track') + ' — ' + (tr.artist || ''));
  } catch (e) { await send(chatId, '⚠️ Playback failed — try /play again.'); }
}
async function doFind(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/find &lt;song or artist&gt;</code>  e.g. <code>/find daft punk</code>');
  await chatAction(chatId, 'typing');
  const res = await searchITunes(arg, 6);
  if (!res.length) return send(chatId, 'No tracks found for <b>' + esc(arg) + '</b>.');
  lastResults.set(String(chatId), res);
  const btns = res.map((tr, i) => [{ text: '▶ ' + (tr.name + ' — ' + tr.artist).slice(0, 55), callback_data: 'p:' + i }]);
  return send(chatId, '🔎 Results for <b>' + esc(arg) + '</b> — tap to play:', { inline_keyboard: btns });
}
async function doPlay(chatId, arg) {
  if (!arg) return send(chatId, 'Usage: <code>/play &lt;song&gt;</code>  e.g. <code>/play blinding lights</code>');
  await chatAction(chatId, 'typing');
  const res = await searchITunes(arg, 1);
  if (!res.length) return send(chatId, 'No playable match for <b>' + esc(arg) + '</b>. Try /find.');
  return playTrack(chatId, res[0]);
}

// ── router ───────────────────────────────────────────────────────────────────
async function handle(update) {
  if (update.callback_query) {
    const cq = update.callback_query, chatId = cq.message && cq.message.chat && cq.message.chat.id, data = String(cq.data || '');
    if (data.startsWith('g:')) { await answerCb(cq.id, '🎼 composing…'); return doMusic(chatId, data.slice(2)); }
    if (data.startsWith('p:')) {
      const arr = lastResults.get(String(chatId)) || []; const tr = arr[parseInt(data.slice(2), 10)];
      await answerCb(cq.id, tr ? '▶ ' + tr.name : 'expired'); return tr ? playTrack(chatId, tr) : send(chatId, 'That result expired — search again with /find.');
    }
    return answerCb(cq.id);
  }
  const msg = update.message; if (!msg) return;
  const chatId = msg.chat && msg.chat.id, text = (msg.text || '').trim();
  if (!chatId || !text) return;
  const m = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) { // bare text → treat as a play query for convenience
    return doPlay(chatId, text);
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
    case 'play': case 'p': return doPlay(chatId, arg);
    default: return send(chatId, "Unknown command. Try /help — or just type a song name and I'll play it.");
  }
}

// ── command menu + polling loop ──────────────────────────────────────────────
async function registerCommands() {
  const commands = [
    { command: 'music', description: 'Compose an original track  e.g. /music synthwave hype' },
    { command: 'play', description: 'Play a song instantly  e.g. /play blinding lights' },
    { command: 'find', description: 'Search real songs → tap to play' },
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
