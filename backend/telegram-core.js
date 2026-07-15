/* ══════════════════════════════════════════════════════════════════════════
   telegram-core.js — shared Telegram layer used by the bot, signals & news.
   • Chat registry (persisted) so we can broadcast to EVERY chat the bot is in
     (DMs, groups, channels) plus the configured main channel.
   • send() / broadcast() helpers.
   • Runtime config (toggles + intervals) the dashboard can read/update.
   SECURITY: token from env only. Fail-safe: no-op without a token; never throws.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_FILE = path.join(DATA_DIR, 'tg-chats.json');
const CFG_FILE = path.join(DATA_DIR, 'tg-config.json');
const ALERTED_FILE = path.join(DATA_DIR, 'tg-alerted.json');
const ALERT_TTL = 30 * 24 * 3600 * 1000;   // re-alert a coin at most once per 30 days
const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

function _ensure() { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }
function _read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function _write(f, o) { try { _ensure(); fs.writeFileSync(f, JSON.stringify(o, null, 2)); } catch (e) {} }

function token() { return process.env.TELEGRAM_BOT_TOKEN || ''; }
function channel() { return process.env.TELEGRAM_CHANNEL || ''; }

// ── chat registry ──────────────────────────────────────────────────────────
let _chats = _read(CHATS_FILE, {});   // { id: {id, type, title, at} }
function addChat(chat) {
  if (!chat || chat.id == null) return;
  const id = String(chat.id);
  if (!_chats[id]) { _chats[id] = { id: chat.id, type: chat.type || '', title: chat.title || chat.username || chat.first_name || '', at: Date.now() }; _write(CHATS_FILE, _chats); }
}
function removeChat(id) { const k = String(id); if (_chats[k]) { delete _chats[k]; _write(CHATS_FILE, _chats); } }
function chats() { return Object.values(_chats); }

// ── GLOBAL de-dupe: one alert per coin across ALL sources (persisted, TTL) ──
let _alerted = _read(ALERTED_FILE, {});   // { mintLower: ts }
function wasAlerted(mint) {
  const k = String(mint == null ? '' : mint).toLowerCase(); if (!k) return false;
  const ts = _alerted[k]; if (!ts) return false;
  if (Date.now() - ts > ALERT_TTL) { delete _alerted[k]; return false; }
  return true;
}
function markAlerted(mint) {
  const k = String(mint == null ? '' : mint).toLowerCase(); if (!k) return;
  _alerted[k] = Date.now();
  const keys = Object.keys(_alerted);
  if (keys.length > 8000) { keys.map(x => [x, _alerted[x]]).sort((a, b) => a[1] - b[1]).slice(0, 2000).forEach(([x]) => delete _alerted[x]); }
  _write(ALERTED_FILE, _alerted);
}

// ── runtime config (dashboard-editable) ─────────────────────────────────────
const _defaults = {
  // feed toggles
  signals: true,          // DexScreener trending/boosts
  bonded: true,           // pump.fun graduations
  newpools: true,         // GeckoTerminal brand-new pools
  trending: true,         // GeckoTerminal trending pools
  news: true,             // CoinGecko market pulse
  newsIntervalMin: 60,
  headlines: true,        // free RSS crypto news headlines (CoinTelegraph/CoinDesk)
  headlinesIntervalMin: 45,
  promo: true,            // periodic SHADDAI project promo (bio, GitHub star-for-giveaway, socials)
  promoIntervalMin: 240,  // every 4h
  // filter parameters (apply across the DEX sources)
  chains: 'solana',       // comma list: solana,base,eth,bsc,…
  minLiq: 8000,           // min pair/pool liquidity USD
  minVol24h: 10000,       // min 24h volume USD
  minFdv: 0,              // min fully-diluted valuation USD (0 = off)
  maxFdv: 0,              // max FDV USD (0 = off; use to catch small caps)
  maxPer: 3,              // max posts per poll per source
  rugFilter: true,        // Solana: skip tokens rugcheck.xyz flags as danger; append a safety label
  bullishOnly: true,      // public feed: skip clearly-bearish calls (24h < -10%) to funnel Pro
};
let _config = Object.assign({}, _defaults, _read(CFG_FILE, {}));
function getConfig() { return Object.assign({}, _config); }
function setConfig(patch) { _config = Object.assign({}, _config, patch || {}); _write(CFG_FILE, _config); return getConfig(); }

// ── send / broadcast ────────────────────────────────────────────────────────
async function send(chatId, html, extra) {
  const t = token(); if (!t || chatId == null) return false;
  try {
    const r = await fetch(TG(t, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, extra || {})),
    });
    if (!r.ok) {
      // 403 = bot blocked/kicked → prune the chat so we stop trying it
      if (r.status === 403) removeChat(chatId);
      return false;
    }
    return true;
  } catch (e) { return false; }
}

// Send a photo (local file path → uploaded bytes, or a public URL) with an HTML caption.
async function sendPhoto(chatId, photo, caption) {
  const t = token(); if (!t || chatId == null || !photo) return false;
  try {
    if (!/^https?:/i.test(photo) && fs.existsSync(photo)) {
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      if (caption) { fd.append('caption', caption.slice(0, 1024)); fd.append('parse_mode', 'HTML'); }
      fd.append('photo', new Blob([fs.readFileSync(photo)]), 'img.png');
      const r = await fetch(TG(t, 'sendPhoto'), { method: 'POST', body: fd });
      if (r.status === 403) removeChat(chatId);
      return r.ok;
    }
    const r = await fetch(TG(t, 'sendPhoto'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo, caption: (caption || '').slice(0, 1024), parse_mode: 'HTML' }),
    });
    if (r.status === 403) removeChat(chatId);
    return r.ok;
  } catch (e) { return false; }
}
async function broadcastPhoto(photo, caption) {
  const t = token(); if (!t) return 0;
  const targets = new Set(); const ch = channel(); if (ch) targets.add(ch);
  chats().forEach(c => targets.add(c.id));
  let ok = 0; for (const id of targets) { if (await sendPhoto(id, photo, caption)) ok++; }
  return ok;
}

// Broadcast to the main channel + every registered chat. Returns count delivered.
async function broadcast(html, opts) {
  const t = token(); if (!t) return 0;
  const targets = new Set();
  const ch = channel(); if (ch && !(opts && opts.skipChannel)) targets.add(ch);
  chats().forEach(c => targets.add(c.id));
  let ok = 0;
  for (const id of targets) { if (await send(id, html)) ok++; }
  return ok;
}

module.exports = { token, channel, addChat, removeChat, chats, getConfig, setConfig, send, broadcast, sendPhoto, broadcastPhoto, wasAlerted, markAlerted };
