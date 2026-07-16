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
function resetAlerted() { _alerted = {}; _write(ALERTED_FILE, _alerted); }

// ── SINGLE-BROADCASTER LOCK ─────────────────────────────────────────────────
// Guarantees only ONE process ever broadcasts (kills duplicate sends from a 2nd
// instance — e.g. a dev server + a standalone stack). A live lock heartbeats every
// 30s; a stale one (>90s) is taken over.
const LOCK_FILE = path.join(DATA_DIR, 'tg-lock.json');
const _lockId = 'lk-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
let _lockAcquired = false;
function acquireBroadcastLock() {
  if (_lockAcquired) return true;
  try {
    const cur = _read(LOCK_FILE, null);
    if (cur && cur.id !== _lockId && (Date.now() - (cur.ts || 0)) < 90000) return false;   // another live broadcaster
    _ensure(); fs.writeFileSync(LOCK_FILE, JSON.stringify({ id: _lockId, ts: Date.now() }));
    _lockAcquired = true;
    const hb = setInterval(() => { try { fs.writeFileSync(LOCK_FILE, JSON.stringify({ id: _lockId, ts: Date.now() })); } catch (e) {} }, 30000);
    if (hb.unref) hb.unref();
    return true;
  } catch (e) { return true; }
}

// ── runtime config (dashboard-editable) ─────────────────────────────────────
const _defaults = {
  // feed toggles — tuned to what actually wins (trending/bonded had 0% hit rate)
  signals: true,          // DexScreener trending/boosts
  bonded: false,          // pump.fun graduations — had 0% hit rate, disabled
  newpools: true,         // GeckoTerminal brand-new pools — main winner source
  trending: false,        // GeckoTerminal trending — had 0% hit rate, disabled
  news: true,             // CoinGecko market pulse
  newsIntervalMin: 60,
  headlines: true,        // free RSS crypto news headlines (CoinTelegraph/CoinDesk)
  headlinesIntervalMin: 45,
  promo: true,            // periodic SHADDAI project promo (bio, GitHub star-for-giveaway, socials)
  promoIntervalMin: 240,  // every 4h
  digest: true,           // hourly performance distribution (1-2x/2-5x/5-10x/10x+ + top performers)
  digestIntervalMin: 60,
  autoPrune: false,       // keep honest hit-rate (owner) — don't silently drop losers
  // filter parameters — DEFAULT: sniper_seed preset (best win rate, 50% on seed calls)
  chains: 'solana',       // comma list: solana,base,eth,bsc,…
  minLiq: 2000,           // min pair/pool liquidity USD (catch micro-caps early)
  minVol24h: 1000,        // min 24h volume USD (fresh coins start low)
  minFdv: 0,              // min fully-diluted valuation USD (0 = off)
  maxFdv: 100000,         // max mcap $100K — winners were ALL under $50K entry
  maxPer: 5,              // max posts per poll per source (more coverage for micro-caps)
  rugFilter: true,        // Solana: score tokens via rugcheck (LP-locked, top holders, risks, holders)
  rugMinScore: 45,        // lower threshold to catch early — Solandier would've been caught here
  minHolders: 5,          // token MUST have at least this many holders (fresh coins start low)
  minLiqPct: 2,           // liquidity MUST be ≥ this % of mcap (liq that "matches" the token)
  bullishOnly: false,     // don't filter bearish — some 2x+ calls come from dip-buying
  // HARD REQUIREMENTS — every token must pass these (locked liq, clean holders, no snipers/bundlers)
  requireLocked: true,     // LP MUST be locked (≥50% locked) — no unlock rugs
  maxTop10Pct: 30,         // top 10 holders max 30% — reject whale-dominated bags
  requireNoSnipers: true,  // reject if sniper bots detected (early same-block buys)
  requireNoBundlers: true, // reject if bundler pattern detected (multiple wallets, same amount)
  // social requirements (off by default for sniper_seed, on for higher presets)
  requireWebsite: false,
  requireTwitter: false,
  requireSocial: false,
  minSocialScore: 0,
};
let _config = Object.assign({}, _defaults, _read(CFG_FILE, {}));
// HARD ENFORCE: these filters are non-negotiable — always override saved config
_config.requireLocked = true;
_config.requireNoSnipers = true;
_config.requireNoBundlers = true;
if (!_config.maxTop10Pct || _config.maxTop10Pct > 30) _config.maxTop10Pct = 30;
function getConfig() { return Object.assign({}, _config); }
function setConfig(patch) { _config = Object.assign({}, _config, patch || {}); _write(CFG_FILE, _config); return getConfig(); }

// ── PRESETS: one-click filter bundles (tuned to actual win data) ────────────
// Social scoring: website=+2, twitter=+2, telegram=+1, discord=+1, locked=+2, ANY=+1
// Holder scoring: top10<18%=+3, no insiders=+2, no snipers=+2
const PRESETS = {
  sniper_seed: {
    label: '🏆 Sniper Seed',
    desc: 'Ultra-low FDV, max upside, the Solandier formula — locked + clean only',
    maxFdv: 100000, minLiq: 2000, minVol24h: 1000, minHolders: 5,
    minLiqPct: 2, rugMinScore: 45, bullishOnly: false, bonded: false,
    newpools: true, trending: false, maxPer: 5,
    requireWebsite: false, requireTwitter: false, requireSocial: false,
    requireLocked: true, minSocialScore: 0,
    maxTop10Pct: 30, requireNoSnipers: true, requireNoBundlers: true,
  },
  anti_sniper: {
    label: '🎯 Anti-Sniper',
    desc: 'Locked LP + no snipers/bundlers + top 10 <25%',
    maxFdv: 200000, minLiq: 2000, minVol24h: 1000, minHolders: 10,
    minLiqPct: 2, rugMinScore: 50, bullishOnly: false, bonded: false,
    newpools: true, trending: false, maxPer: 5,
    requireWebsite: false, requireTwitter: false, requireSocial: false,
    requireLocked: true, minSocialScore: 0,
    maxTop10Pct: 25, requireNoSnipers: true, requireNoBundlers: true,
  },
  social_micro: {
    label: '💎 Social Micro',
    desc: 'Locked LP + website & X + top 10 <25% = real team, not a rug',
    maxFdv: 300000, minLiq: 3000, minVol24h: 2000, minHolders: 10,
    minLiqPct: 2, rugMinScore: 50, bullishOnly: false, bonded: false,
    newpools: true, trending: false, maxPer: 5,
    requireWebsite: true, requireTwitter: true, requireSocial: false,
    requireLocked: true, minSocialScore: 3,
    maxTop10Pct: 25, requireNoSnipers: true, requireNoBundlers: true,
  },
  full_stack: {
    label: '🔥 Full Stack',
    desc: 'Locked + social stack + clean holders = premium quality',
    maxFdv: 500000, minLiq: 5000, minVol24h: 3000, minHolders: 15,
    minLiqPct: 3, rugMinScore: 55, bullishOnly: false, bonded: false,
    newpools: true, trending: false, maxPer: 4,
    requireWebsite: true, requireTwitter: true, requireSocial: true,
    requireLocked: true, minSocialScore: 5,
    maxTop10Pct: 25, requireNoSnipers: true, requireNoBundlers: true,
  },
  momentum: {
    label: '⚡ Momentum',
    desc: 'Locked runners with social proof & clean structure',
    maxFdv: 2000000, minLiq: 15000, minVol24h: 30000, minHolders: 40,
    minLiqPct: 5, rugMinScore: 65, bullishOnly: true, bonded: false,
    newpools: true, trending: false, maxPer: 3,
    requireWebsite: true, requireTwitter: true, requireSocial: false,
    requireLocked: true, minSocialScore: 4,
    maxTop10Pct: 30, requireNoSnipers: true, requireNoBundlers: true,
  },
  safe_swing: {
    label: '🛡 Safe Swing',
    desc: 'Locked + full social + clean holders = institutional quality',
    maxFdv: 50000000, minLiq: 40000, minVol24h: 25000, minHolders: 80,
    minLiqPct: 8, rugMinScore: 75, bullishOnly: true, bonded: false,
    newpools: false, trending: false, maxPer: 2,
    requireWebsite: true, requireTwitter: true, requireSocial: true,
    requireLocked: true, minSocialScore: 6,
    maxTop10Pct: 25, requireNoSnipers: true, requireNoBundlers: true,
  },
};
function listPresets() { return Object.keys(PRESETS).map(k => ({ key: k, label: PRESETS[k].label, desc: PRESETS[k].desc })); }
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return null;
  const patch = Object.assign({}, p); delete patch.label; delete patch.desc;
  patch.rugFilter = true;
  setConfig(patch);
  return getConfig();
}
function getPreset(name) { return PRESETS[name] || null; }
function activePresetKey() {
  const cfg = getConfig();
  for (const [k, v] of Object.entries(PRESETS)) {
    if (cfg.maxFdv === v.maxFdv && cfg.minLiq === v.minLiq && cfg.minVol24h === v.minVol24h) return k;
  }
  return null;
}

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

module.exports = { token, channel, addChat, removeChat, chats, getConfig, setConfig, send, broadcast, sendPhoto, broadcastPhoto, wasAlerted, markAlerted, resetAlerted, acquireBroadcastLock, listPresets, applyPreset, getPreset, activePresetKey };
