// tg-alerts.js — SHADDAI personal alerts (per-user, self-serve, free).
//   A user subscribes to alert types and gets them pushed to their DM on a
//   daily schedule of THEIR choice. Sources reuse the existing free pipes:
//     • price     — live prices for specific tickers (Kraken + CoinGecko)
//     • movers    — top 24h/7d/30d movers (CoinGecko)
//     • feargreed — Crypto Fear & Greed (alternative.me)
//     • news      — crypto headlines (CoinTelegraph/CoinDesk/Decrypt RSS)
//     • horoscope — ORACLE daily horoscope + moon phase (eco-community astro)
//   Store: backend/data/tg-alerts.json (runtime, gitignored).
//   The bot passes in a `send(chatId, html)` fn so this module never calls Telegram direct.
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'tg-alerts.json');

const DEFAULT_HOUR = 9; // default delivery: 09:00 UTC

let _store = _read();
let _send = null;          // set via configure()
let _timer = null;

function _read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return { users: {}, lastDelivered: {} }; }
}
function _write() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_store, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) {}
}
function _uid(u) { return String(u == null ? '' : u).trim(); }

function _user(uid) {
  uid = _uid(uid); if (!uid) return null;
  if (!_store.users[uid]) { _store.users[uid] = { hour: DEFAULT_HOUR, alerts: [] }; _write(); }
  return _store.users[uid];
}

// ── source renderers (each returns HTML string, or null) ──────────────────────
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function _renderPrice(params) {
  const tickers = (Array.isArray(params) ? params : (params || '').split(/[\s,]+/)).map(s => String(s).toUpperCase()).filter(Boolean).slice(0, 10);
  if (!tickers.length) return null;
  const rows = [];
  for (const t of tickers) {
    try {
      let p = null, c = null;
      if (['BTC', 'ETH', 'SOL'].includes(t)) {
        const pair = { BTC: 'XBTUSD', ETH: 'ETHUSD', SOL: 'SOLUSD' }[t];
        const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + pair);
        if (r.ok) { const res = (await r.json()).result || {}; const k = Object.keys(res)[0]; if (k) { p = Number(res[k].c[0]); const o = Number(res[k].o); c = o ? ((p - o) / o * 100) : null; } }
      }
      if (p == null) {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(t.toLowerCase()) + '&vs_currencies=usd&include_24hr_change=true');
        if (!r.ok) continue;
        const j = await r.json(); const id = Object.keys(j)[0];
        if (id) { p = j[id].usd; c = j[id].usd_24h_change; }
      }
      if (p != null) {
        const fmt = p < 1 ? p.toFixed(5) : p < 100 ? p.toFixed(2) : p.toLocaleString(undefined, { maximumFractionDigits: 0 });
        rows.push(`${t}: <b>$${fmt}</b>${c != null ? '  ' + (c >= 0 ? '🟢 +' : '🔴 ') + c.toFixed(1) + '%' : ''}`);
      }
    } catch (e) {}
  }
  return rows.length ? '💹 <b>PRICE WATCH</b>\n' + rows.join('\n') : null;
}

async function _renderMovers() {
  try {
    const news = require('./telegram-news');
    return await news.topMoversLeaderboard();
  } catch (e) { return null; }
}

async function _renderFearGreed() {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = ((await r.json()).data || [])[0];
    if (!d) return null;
    const v = Number(d.value); const cls = d.value_classification || '';
    const label = (v <= 20 ? '😱 Extreme Fear' : v <= 40 ? '😟 Fear' : v <= 60 ? '😐 Neutral' : v <= 80 ? '😊 Greed' : '🥳 Extreme Greed');
    const bar = '█'.repeat(Math.round(v / 10)) + '░'.repeat(10 - Math.round(v / 10));
    return `🧭 <b>FEAR &amp; GREED</b>\n${bar} <b>${v}</b> — ${cls}\n\n<i>${label} · NFA</i>`;
  } catch (e) { return null; }
}

async function _renderNews() {
  try {
    const news = require('./telegram-news');
    const feeds = (process.env.TG_NEWS_RSS || 'https://cointelegraph.com/rss,https://www.coindesk.com/arc/outboundfeeds/rss/,https://decrypt.co/feed').split(',').map(s => s.trim()).filter(Boolean);
    const items = [];
    for (const feed of feeds) {
      if (items.length >= 5) break;
      try {
        const r = await fetch(feed, { headers: { 'user-agent': 'Mozilla/5.0 (SHADDAI)' } });
        if (!r.ok) continue;
        const xml = await r.text();
        const re = /<item[\s\S]*?<\/item>/gi; let m;
        while ((m = re.exec(xml)) && items.length < 5) {
          const t = (m[0].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1];
          const l = (m[0].match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1];
          if (t && l) items.push({ t: t.trim(), l: l.trim() });
        }
      } catch (e) {}
    }
    if (!items.length) return null;
    return '📰 <b>CRYPTO HEADLINES</b>\n' + items.map(i => '• <a href="' + _esc(i.l) + '">' + _esc(i.t) + '</a>').join('\n');
  } catch (e) { return null; }
}

async function _renderHoroscope(sign) {
  try {
    const eco = require(path.join(__dirname, '..', '..', 'shaddai-mcp', 'lib', 'eco-community'));
    return eco.astro(String(sign || 'aries'));
  } catch (e) { return null; }
}

const RENDERERS = { price: _renderPrice, movers: _renderMovers, feargreed: _renderFearGreed, news: _renderNews, horoscope: _renderHoroscope };
const TYPE_LABEL = { price: '💹 Price watch', movers: '📈 Top movers', feargreed: '🧭 Fear & Greed', news: '📰 News', horoscope: '🔮 Horoscope' };

// ── CRUD ─────────────────────────────────────────────────────────────────────
function list(uid) {
  const u = _user(uid); if (!u) return null;
  return { hour: u.hour, alerts: (u.alerts || []).slice() };
}

function add(uid, type, params) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  type = String(type || '').toLowerCase();
  if (!RENDERERS[type]) return { ok: false, error: 'unknown type — try price, movers, feargreed, news, or horoscope' };
  // de-dupe on type+params
  const key = type + ':' + String(params || '').toLowerCase();
  if ((u.alerts || []).some(a => (a.type + ':' + String(a.params || '').toLowerCase()) === key)) return { ok: false, error: 'you already have that alert' };
  const alert = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, params: params || '' };
  u.alerts = u.alerts || [];
  if (u.alerts.length >= 12) return { ok: false, error: 'max 12 alerts — remove one first (/alerts)' };
  u.alerts.push(alert);
  _write();
  return { ok: true, alert };
}

function remove(uid, id) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  const before = (u.alerts || []).length;
  u.alerts = (u.alerts || []).filter(a => a.id !== id);
  if (u.alerts.length === before) return { ok: false, error: 'alert not found' };
  _write();
  return { ok: true };
}

function setHour(uid, hour) {
  const u = _user(uid); if (!u) return { ok: false, error: 'unknown user' };
  hour = Math.floor(Number(hour));
  if (!isFinite(hour) || hour < 0 || hour > 23) return { ok: false, error: 'hour must be 0–23 (UTC)' };
  u.hour = hour;
  _write();
  return { ok: true, hour };
}

// ── delivery ────────────────────────────────────────────────────────────────
async function deliver(uid) {
  if (!_send) return [];
  const u = _store.users[uid];
  if (!u || !(u.alerts || []).length) return [];
  const sent = [];
  for (const a of u.alerts) {
    try {
      const r = RENDERERS[a.type];
      if (!r) continue;
      const html = await r(a.params);
      if (!html) continue;
      await _send(uid, html);
      sent.push(a.type);
    } catch (e) {}
  }
  return sent;
}

// Run the scheduler: every minute, fire users whose hour matches the current UTC hour
// and who haven't been delivered this (day:hour) bucket yet.
function _nowUTC() { const d = new Date(); return { hour: d.getUTCHours(), day: d.toISOString().slice(0, 13) }; }
function start(intervalMs = 60000) {
  if (_timer) return;
  _timer = setInterval(() => {
    const { hour, day } = _nowUTC();
    const key = day;
    if (_store.lastDelivered[key] === hour) return; // already did this hour
    _store.lastDelivered[key] = hour;
    let fired = 0;
    for (const uid of Object.keys(_store.users)) {
      const u = _store.users[uid];
      if (u && u.hour === hour && (u.alerts || []).length) { deliver(uid); fired++; }
    }
    if (_store.lastDelivered && Object.keys(_store.lastDelivered).length > 48) {
      const k = Object.keys(_store.lastDelivered)[0]; delete _store.lastDelivered[k];
    }
    if (fired) _write();
  }, intervalMs);
  if (_timer.unref) _timer.unref();
  return true;
}

function configure(sendFn) { _send = sendFn; }
function nowPreview() { return _nowUTC(); }

module.exports = { list, add, remove, setHour, deliver, start, configure, nowPreview, RENDERERS, TYPE_LABEL };