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
  // filter parameters (apply across the DEX sources)
  chains: 'solana',       // comma list: solana,base,eth,bsc,…
  minLiq: 8000,           // min pair/pool liquidity USD
  minVol24h: 10000,       // min 24h volume USD
  minFdv: 0,              // min fully-diluted valuation USD (0 = off)
  maxFdv: 0,              // max FDV USD (0 = off; use to catch small caps)
  maxPer: 3,              // max posts per poll per source
  rugFilter: true,        // Solana: skip tokens rugcheck.xyz flags as danger; append a safety label
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

module.exports = { token, channel, addChat, removeChat, chats, getConfig, setConfig, send, broadcast };
