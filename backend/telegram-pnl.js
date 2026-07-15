/* ══════════════════════════════════════════════════════════════════════════
   telegram-pnl.js — call performance tracker.
   • recordCall(): logs each posted signal's entry (mcap/FDV, price, time).
   • startTracker(): re-prices tracked calls, tracks peak multiple ("Xs"), and
     auto-posts milestone WINS (2x/5x/10x…) to the channel — winners funnel.
   • stats(period): daily/weekly/monthly hit-rate + best calls (public teaser;
     full per-call PNL incl. misses is the Pro view).
   Uses the FREE DexScreener tokens endpoint (batched). Metric = FDV/mcap.
   Persists to backend/data/tg-calls.json. Fail-safe.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./telegram-core');

const FILE = path.join(__dirname, 'data', 'tg-calls.json');
const BOT_DIR = path.join(__dirname, '..', 'public', 'assets', 'bot');
// pick a random existing PNL celebration image (pnl-1..10.png) or null if none generated yet
function _pnlImage() {
  try {
    const imgs = [];
    for (let i = 1; i <= 10; i++) { const f = path.join(BOT_DIR, 'pnl-' + i + '.png'); if (fs.existsSync(f)) imgs.push(f); }
    if (!imgs.length) return null;
    return imgs[Math.floor(Math.random() * imgs.length)];
  } catch (e) { return null; }
}
const DS_TOKENS = (addrs) => `https://api.dexscreener.com/latest/dex/tokens/${addrs}`;
const MILESTONES = [2, 3, 5, 10, 25, 50, 100];
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;   // stop tracking after 30 days
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _usd(n) { const v = Number(n) || 0; if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'; return '$' + v.toFixed(0); }
function _ago(ts) { const s = Math.max(0, (nowMs() - ts) / 1000); if (s < 3600) return Math.round(s / 60) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; }
function nowMs() { return _now; }
let _now = 0;   // stamped per tick (Date.now unavailable in some sandboxes; set on each call)

function _read() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { calls: [] }; } }
function _write(o) { try { const d = path.dirname(FILE); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(o, null, 2)); } catch (e) {} }

let _state = _read();

// Log a fresh call (dedupe: one active entry per mint).
function recordCall(c) {
  try {
    _now = Date.now();
    const mint = c && (c.mint || c.address);
    const entry = Number(c && (c.entryFdv || c.entryMcap)) || 0;
    if (!mint || entry <= 0) return;                       // need a mint + a starting mcap to compute Xs
    if (_state.calls.some(x => x.mint === mint && !x.closed)) return;   // already tracking
    _state.calls.push({
      mint, chain: (c.chain || '').toLowerCase(), name: c.name || '', symbol: c.symbol || '',
      source: c.source || '', entryFdv: entry, entryPrice: Number(c.entryPrice) || 0,
      ts: _now, peakMult: 1, curMult: 1, curFdv: entry, milestones: [], closed: false,
    });
    if (_state.calls.length > 5000) _state.calls = _state.calls.slice(-5000);
    _write(_state);
  } catch (e) {}
}

async function _priceMap(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 30) {
    const batch = mints.slice(i, i + 30);
    try {
      const r = await fetch(DS_TOKENS(batch.join(',')));
      if (!r.ok) continue;
      const j = await r.json();
      (j && j.pairs || []).forEach(p => {
        const addr = p.baseToken && p.baseToken.address;
        const fdv = Number(p.fdv || p.marketCap || 0);
        if (!addr || !fdv) return;
        if (!out[addr] || fdv > out[addr]) out[addr] = fdv;   // keep the richest pair
      });
    } catch (e) {}
  }
  return out;
}

function _milestoneCard(call, x) {
  return (
    `🎯 <b>CALL UPDATE — ${x}x</b> 🚀\n` +
    `<b>$${_esc(call.symbol || call.name || 'TOKEN')}</b> is up <b>${x}x</b> since our call (${_ago(call.ts)} ago)\n` +
    `Entry: <b>${_usd(call.entryFdv)}</b> → Now: <b>${_usd(call.curFdv)}</b>\n` +
    `\n📡 Live calls: ${core.channel() || '@ShaddaiLabs'}`
  );
}

async function trackTick() {
  if (!core.token()) return;
  _now = Date.now();
  const active = _state.calls.filter(c => !c.closed && (_now - c.ts) < MAX_AGE_MS);
  if (!active.length) return;
  const prices = await _priceMap([...new Set(active.map(c => c.mint))]);
  let changed = false;
  for (const call of active) {
    const cur = prices[call.mint];
    if (!cur) continue;
    call.curFdv = cur;
    call.curMult = cur / call.entryFdv;
    if (call.curMult > call.peakMult) { call.peakMult = call.curMult; changed = true; }
    // fire the highest newly-crossed milestone (winners only → funnel)
    let hit = 0;
    for (const m of MILESTONES) { if (call.peakMult >= m && !call.milestones.includes(m)) hit = m; }
    if (hit) {
      call.milestones.push(hit);
      changed = true;
      const img = _pnlImage();
      if (img) await core.broadcastPhoto(img, _milestoneCard(call, hit));
      else await core.broadcast(_milestoneCard(call, hit));
    }
  }
  if (changed) _write(_state);
}

// ── stats: daily / weekly / monthly ─────────────────────────────────────────
function stats(period) {
  _now = Date.now();
  const span = period === 'week' ? 7 : period === 'month' ? 30 : 1;
  const since = _now - span * 24 * 3600 * 1000;
  const rows = _state.calls.filter(c => c.ts >= since);
  const total = rows.length;
  const hits = rows.filter(c => c.peakMult >= 2).length;         // "hit" = 2x+
  const hitRate = total ? Math.round((hits / total) * 100) : 0;
  const best = rows.slice().sort((a, b) => b.peakMult - a.peakMult).slice(0, 5);
  const label = period === 'week' ? 'WEEKLY' : period === 'month' ? 'MONTHLY' : 'DAILY';
  const bestTxt = best.length
    ? best.map(c => `• <b>$${_esc(c.symbol || c.name || '?')}</b> — <b>${c.peakMult.toFixed(1)}x</b>`).join('\n')
    : '• (no calls in range yet)';
  return (
    `📊 <b>SHADDAI ${label} SCORECARD</b>\n\n` +
    `Calls: <b>${total}</b>  ·  Hits (2x+): <b>${hits}</b>  ·  Hit rate: <b>${hitRate}%</b>\n\n` +
    `🏆 <b>Best calls</b>\n${bestTxt}\n\n` +
    `<i>Public shows winners — full PNL on every call (incl. misses & live positions) is a Pro feature.</i>`
  );
}

// ── /pnl card: a random polished image + a branded best-calls scoreboard ─────
function pnlImage() { return _pnlImage(); }
function pnlCaption(period) {
  _now = Date.now();
  const span = period === 'month' ? 30 : period === 'all' ? 3650 : 7;
  const since = _now - span * 24 * 3600 * 1000;
  const rows = _state.calls.filter(c => c.ts >= since);
  const best = rows.slice().sort((a, b) => b.peakMult - a.peakMult).slice(0, 6);
  const hits = rows.filter(c => c.peakMult >= 2).length;
  const hitRate = rows.length ? Math.round((hits / rows.length) * 100) : 0;
  const ch = core.channel() || '@ShaddaiLabs';
  const bestTxt = best.length
    ? best.map(c => `• <b>$${_esc(c.symbol || c.name || '?')}</b> — <b>${c.peakMult.toFixed(1)}x</b>`).join('\n')
    : '• (calls are being tracked — check back soon)';
  return (
    `📊 <b>SHADDAI PNL</b> · ${_esc(ch)}\n\n` +
    `🏆 <b>Best calls</b>\n${bestTxt}\n\n` +
    `Hit rate: <b>${hitRate}%</b>  ·  Calls tracked: <b>${rows.length}</b>\n` +
    `📡 Live calls: ${_esc(ch)}\n<i>Not financial advice. DYOR.</i>`
  );
}

let _timer = null;
function startTracker() {
  if (!core.token()) { console.log('[tg-pnl] disabled (no token).'); return; }
  if (_timer) return;
  console.log('[tg-pnl] call tracker armed — re-pricing + milestone wins.');
  setTimeout(() => { trackTick().catch(() => {}); }, 12000);
  _timer = setInterval(() => { trackTick().catch(() => {}); }, 8 * 60000);   // every 8 min
  if (_timer.unref) _timer.unref();
}

function resetCalls() { _state = { calls: [] }; _write(_state); }

module.exports = { recordCall, trackTick, stats, startTracker, pnlImage, pnlCaption, resetCalls };
