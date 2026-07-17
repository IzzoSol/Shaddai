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

const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'tg-calls.json');
const BOT_DIR = path.join(__dirname, '..', 'public', 'assets', 'bot');
const MILESTONES_DIR = path.join(BOT_DIR, 'milestones');
// pick a random existing PNL celebration image (pnl-1..10.png) or null
function _pnlImage() {
  try {
    const imgs = [];
    for (let i = 1; i <= 10; i++) { const f = path.join(BOT_DIR, 'pnl-' + i + '.png'); if (fs.existsSync(f)) imgs.push(f); }
    if (!imgs.length) return null;
    return imgs[Math.floor(Math.random() * imgs.length)];
  } catch (e) { return null; }
}
// milestone image: returns themed image for 2x,5x,10x,15x,20x,25x,30x,35x,40x,45x,50x
const MILESTONE_LEVELS = [2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
function milestoneImage(mult) {
  const m = Math.floor(Number(mult) || 0);
  // find the highest milestone image <= current mult
  let best = 0;
  for (const lvl of MILESTONE_LEVELS) { if (m >= lvl) best = lvl; }
  if (!best) return null;
  const f = path.join(MILESTONES_DIR, 'milestone-' + best + 'x.png');
  return fs.existsSync(f) ? f : null;
}
// get PNL image for /pnl command: use milestone image if at milestone, else random pnl image
function _pnlImageForCall(call) {
  const m = Math.floor(Number(call.curMult || call.peakMult || 0));
  const msImg = milestoneImage(m);
  if (msImg) return msImg;
  return _pnlImage();
}
const DS_TOKENS = (addrs) => `https://api.dexscreener.com/latest/dex/tokens/${addrs}`;
const MILESTONES = [2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];   // every milestone level
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
      holders: Number(c.holders) || 0,
      ts: _now, peakMult: 1, curMult: 1, curFdv: entry, milestones: [], closed: false,
    });
    if (_state.calls.length > 5000) _state.calls = _state.calls.slice(-5000);
    _write(_state);
    // Also log to token-db for ZEROX learning (bridge the two databases)
    try { require('./token-db').recordOutcome(c); } catch (e) { console.warn('[pnl] token-db recordOutcome error:', e.message); }
  } catch (e) { console.warn('[pnl] recordCall error:', e.message); }
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
    if (call.curMult > call.peakMult) {
      call.peakMult = call.curMult; changed = true;
      // feed the new peak into token-db so ZEROX learning has real win/loss outcomes (closes the loop)
      try { require('./token-db').updateOutcome(call.mint, { peakMult: call.peakMult, curMult: call.curMult, curFdv: call.curFdv }); } catch (e) { console.warn('[pnl] updateOutcome error:', e.message); }
    }
    // fire the highest newly-crossed milestone (winners only → funnel)
    let hit = 0;
    for (const m of MILESTONES) { if (call.peakMult >= m && !call.milestones.includes(m)) hit = m; }
    if (hit) {
      // record EVERY newly-crossed milestone ≤ peak so skipped lower ones don't re-fire (out of order) on later ticks
      for (const m of MILESTONES) { if (call.peakMult >= m && !call.milestones.includes(m)) call.milestones.push(m); }
      changed = true;
      const img = milestoneImage(hit) || _pnlImage();
      const btns = core.buildButtons(call.mint, call.chain || 'solana', null, { pnl: true });   // Chart + 📸 PNL Card tap-button
      if (img) await core.broadcastPhoto(img, _milestoneCard(call, hit), btns);
      else await core.broadcast(_milestoneCard(call, hit), { buttons: btns });
    }
  }
  if (changed) _write(_state);
  // auto-prune aged losers → keeps the public scoreboard winners-fresh
  try { if (core.getConfig().autoPrune !== false) pruneLosers(1.5, 6); } catch (e) {}
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
  const best = rows.slice().filter(c => c.symbol || c.name).sort((a, b) => b.peakMult - a.peakMult).slice(0, 6);
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

// /pnl <token> — a card for one specific tracked call
function pnlForToken(q) {
  _now = Date.now();
  const s = String(q || '').toLowerCase().replace(/^\$/, '').trim(); if (!s) return null;
  const c = _state.calls.find(x => (x.symbol || '').toLowerCase() === s || (x.name || '').toLowerCase() === s || (x.mint || '').toLowerCase() === s)
    || _state.calls.find(x => (x.symbol || '').toLowerCase().includes(s) || (x.name || '').toLowerCase().includes(s));
  if (!c) return null;
  const ch = core.channel() || '@ShaddaiLabs';
  const realMint = c.mint && !String(c.mint).startsWith('seed-');
  return (
    `📊 <b>PNL — $${_esc(c.symbol || c.name || '?')}</b>\n\n` +
    `Entry: <b>${_usd(c.entryFdv)}</b>\nNow: <b>${_usd(c.curFdv || c.entryFdv)}</b>\n` +
    `Peak: <b>${c.peakMult.toFixed(1)}x</b>  ·  Current: <b>${(c.curMult || 1).toFixed(1)}x</b>\n` +
    `Called: ${_ago(c.ts)} ago\n` +
    (realMint ? `📋 CA: <code>${_esc(c.mint)}</code>\n` : '') +
    `\n📡 ${_esc(ch)}  ·  <i>Not financial advice.</i>`
  );
}

// hourly PERFORMANCE distribution: 1-2x / 2-5x / 5-10x / 10x+ + top performers
function distribution() {
  _now = Date.now();
  const rows = _state.calls;
  const total = rows.length;
  const inB = (lo, hi) => rows.filter(c => c.peakMult >= lo && (hi ? c.peakMult < hi : true)).length;
  const b12 = inB(1, 2), b25 = inB(2, 5), b510 = inB(5, 10), b10 = inB(10, 0);
  const hits = b25 + b510 + b10;
  const hitRate = total ? Math.round((hits / total) * 100) : 0;
  const avg = total ? (rows.reduce((s, c) => s + c.peakMult, 0) / total) : 0;
  const top = rows.slice().filter(c => c.symbol || c.name).sort((a, b) => b.peakMult - a.peakMult).slice(0, 5);
  const ch = core.channel() || '@ShaddaiLabs';
  const topTxt = top.length ? top.map(c => `• <b>$${_esc(c.symbol || c.name)}</b> — <b>${c.peakMult.toFixed(1)}x</b>`).join('\n') : '• (tracking…)';
  return (
    `📊 <b>SHADDAI PERFORMANCE</b> · ${_esc(ch)}\n\n` +
    `<b>Distribution</b> (${total} calls)\n` +
    `🟡 1–2x: <b>${b12}</b>\n🟢 2–5x: <b>${b25}</b>\n🔥 5–10x: <b>${b510}</b>\n🚀 10x+: <b>${b10}</b>\n\n` +
    `✅ Hit rate (2x+): <b>${hitRate}%</b>  ·  Avg peak: <b>${avg.toFixed(1)}x</b>\n\n` +
    `🏆 <b>Top performers</b>\n${topTxt}\n\n` +
    `📡 ${_esc(ch)}  ·  <i>Not financial advice. DYOR.</i>`
  );
}

// ── CONVICTION HOLDS ("held well") — long-term survivors from the day/week before ──
// A coin that ran 10x and still holds 7x (70% retention) is more bullish than one that
// ran 10x and fell to 3x (30%). Ranks by current gain weighted by how well it held its ATH.
// Only includes calls still in the GREEN (survived — didn't round-trip to zero).
function survivors(period) {
  _now = Date.now();
  const wk = period === 'week';
  const minAge = wk ? 24 * 3600 * 1000 : 12 * 3600 * 1000;         // day view: 12h+ old · week view: 1d+ old
  const maxAge = wk ? 9 * 24 * 3600 * 1000 : 3 * 24 * 3600 * 1000; // week view: up to ~9d · day view: up to 3d
  const scored = _state.calls
    .filter(c => { if (c.source === 'seed') return false; const age = _now - c.ts; return age >= minAge && age <= maxAge && (c.curMult || 1) >= 1; })  // live survivors only, still green
    .map(c => {
      const peak = c.peakMult || 1, cur = c.curMult || 1;
      const retention = peak > 0 ? cur / peak : 0;                 // how much of ATH it holds
      const holderBoost = 1 + Math.min(0.5, (c.holders || 0) / 1000);   // real-holder conviction: up to +50% at 1000+ holders
      const held = cur * (0.4 + 0.6 * retention) * holderBoost;    // current gain, boosted by ATH retention + holder base
      return { c, peak, cur, retention, held };
    })
    .sort((a, b) => b.held - a.held)
    .slice(0, 8);
  const ch = core.channel() || '@ShaddaiLabs';
  const label = wk ? 'WEEK' : 'DAY';
  if (!scored.length) {
    return `💎 <b>SHADDAI CONVICTION HOLDS — ${label}</b>\n\n<i>No surviving calls in range yet — check back once calls mature.</i>\n\n📡 ${_esc(ch)}`;
  }
  const lines = scored.map(s => {
    const sym = _esc(s.c.symbol || s.c.name || '?');
    const ret = Math.round(s.retention * 100);
    const bar = ret >= 70 ? '🟢' : ret >= 40 ? '🟡' : '🟠';
    const hold = s.c.holders ? ` · 👥 ${s.c.holders}` : '';
    const ca = s.c.mint && !String(s.c.mint).startsWith('seed-') ? `\n   <code>${_esc(s.c.mint)}</code>` : '';
    return `${bar} <b>$${sym}</b> — now <b>${s.cur.toFixed(1)}x</b> · ATH ${s.peak.toFixed(1)}x · held <b>${ret}%</b>${hold} · ${_ago(s.c.ts)}${ca}`;
  }).join('\n');
  return (
    `💎 <b>SHADDAI CONVICTION HOLDS — ${label}</b>\n` +
    `<i>Calls still in the green, ranked by how well they held their ATH</i>\n` +
    `━━━━━━━━━━━━━\n` +
    lines +
    `\n\n🟢 held ATH well  ·  🟡 pulled back  ·  🟠 deep retrace\n` +
    `📡 ${_esc(ch)}  ·  <i>Real holder conviction — long-term survivors. NFA.</i>`
  );
}

// manually add a (historical) winning call — locked/closed so it isn't re-priced
function seedCall(o) {
  _now = Date.now();
  const peak = Number(o.peakMult) || 1;
  const entry = Number(o.entryFdv || o.entryMcap) || 20000;
  _state.calls.push({
    mint: o.mint || ('seed-' + (o.symbol || 'x') + '-' + _state.calls.length), chain: o.chain || 'solana',
    name: o.name || o.symbol || '', symbol: o.symbol || o.name || '', source: 'seed',
    entryFdv: entry, entryPrice: 0, ts: _now - (Number(o.daysAgo) || 1) * 24 * 3600 * 1000,
    peakMult: peak, curMult: peak, curFdv: entry * peak, milestones: [], closed: true,
  });
  _write(_state);
  return true;
}

let _timer = null, _digestTimer = null, _heldTimer = null;
function startTracker() {
  if (!core.token()) { console.log('[tg-pnl] disabled (no token).'); return; }
  if (_timer) return;
  if (!core.acquireBroadcastLock()) { console.log('[tg-pnl] another instance owns broadcasting — tracker not started here.'); return; }
  console.log('[tg-pnl] call tracker armed — re-pricing + milestone wins.');
  setTimeout(() => { trackTick().catch(() => {}); }, 12000);
  _timer = setInterval(() => { trackTick().catch(() => {}); }, 8 * 60000);   // every 8 min
  if (_timer.unref) _timer.unref();
  // hourly performance distribution digest (with a polished image)
  let lastD = Date.now();
  _digestTimer = setInterval(() => {
    const cfg = core.getConfig(); if (cfg.digest === false) return;
    const everyMs = Math.max(30, cfg.digestIntervalMin || 60) * 60000;
    if (Date.now() - lastD >= everyMs) { lastD = Date.now(); const img = _pnlImage(); const cap = distribution(); (img ? core.broadcastPhoto(img, cap) : core.broadcast(cap)).catch(() => {}); }
  }, 60000);
  if (_digestTimer.unref) _digestTimer.unref();
  // conviction holds — auto-post long-term survivors on its own cadence (default hourly). Stays QUIET when none.
  let lastH = Date.now();
  _heldTimer = setInterval(() => {
    const cfg = core.getConfig(); if (cfg.heldPost === false) return;
    const everyMs = Math.max(30, cfg.heldIntervalMin || 60) * 60000;
    if (Date.now() - lastH >= everyMs) {
      lastH = Date.now();
      const cap = survivors('day');
      if (cap.includes('No surviving calls')) return;   // nothing matured yet — don't spam an empty card
      const img = _pnlImage();
      (img ? core.broadcastPhoto(img, cap) : core.broadcast(cap)).catch(() => {});
    }
  }, 60000);
  if (_heldTimer.unref) _heldTimer.unref();
}

function resetCalls() { _state = { calls: [] }; _write(_state); }

// Remove "bad" calls — aged calls that never reached minPeak. Keeps seeds, winners,
// and young calls (they still have time to run). Powers the winners-fresh public feed.
function pruneLosers(minPeak, minAgeHours) {
  _now = Date.now();
  const mp = Number(minPeak) || 1.5;
  const ageMs = (Number(minAgeHours) || 6) * 3600 * 1000;
  const before = _state.calls.length;
  _state.calls = _state.calls.filter(c => c.source === 'seed' || c.peakMult >= mp || (_now - c.ts) < ageMs);
  const removed = before - _state.calls.length;
  if (removed > 0) _write(_state);
  return removed;
}

// /pnl <CA> save — generate a PNL snapshot image on demand and return it
async function savePnlSnapshot(q) {
  _now = Date.now();
  const s = String(q || '').toLowerCase().replace(/^\$/, '').trim();
  if (!s) return { error: 'No token provided.' };
  const c = _state.calls.find(x => (x.mint || '').toLowerCase() === s)
    || _state.calls.find(x => (x.symbol || '').toLowerCase() === s || (x.name || '').toLowerCase() === s)
    || _state.calls.find(x => (x.symbol || '').toLowerCase().includes(s) || (x.name || '').toLowerCase().includes(s));
  if (!c) return { error: 'No tracked call found for <b>' + _esc(s) + '</b>.' };

  const mult = Number(c.peakMult || c.curMult || 1);
  const symbol = c.symbol || c.name || 'TOKEN';
  const img = await pnlImages.generatePnlImage(c);
  const ch = core.channel() || '@ShaddaiLabs';
  const cap = (
    `📊 <b>PNL SNAPSHOT — $${_esc(symbol)}</b>\n\n` +
    `Entry: <b>${_usd(c.entryFdv)}</b>\n` +
    `ATH: <b>${mult.toFixed(1)}x</b>  →  <b>${_usd(c.entryFdv * mult)}</b>\n` +
    `Current: <b>${(c.curMult || 1).toFixed(1)}x</b>\n` +
    (c.mint && !String(c.mint).startsWith('seed-') ? `📋 CA: <code>${_esc(c.mint)}</code>\n` : '') +
    `\n📡 ${_esc(ch)}  ·  <i>Saved PNL snapshot.</i>`
  );
  return { img, cap, symbol, mult };
}

// find a previously saved PNL image for a token (no generation)
function savedPnlImage(q) {
  const s = String(q || '').toLowerCase().replace(/^\$/, '').trim();
  if (!s) return null;
  const GENERATED_DIR = path.join(__dirname, '..', 'public', 'assets', 'bot', 'pnl-generated');
  try {
    if (!fs.existsSync(GENERATED_DIR)) return null;
    const files = fs.readdirSync(GENERATED_DIR);
    const match = files.find(f => f.toLowerCase().includes(s));
    if (match) return path.join(GENERATED_DIR, match);
  } catch (e) {}
  return null;
}

// find a call by ticker/name/mint (for /pnl image lookup)
function _findCall(q) {
  _now = Date.now();
  const s = String(q || '').toLowerCase().replace(/^\$/, '').trim();
  if (!s) return null;
  return _state.calls.find(x => (x.symbol || '').toLowerCase() === s || (x.name || '').toLowerCase() === s || (x.mint || '').toLowerCase() === s)
    || _state.calls.find(x => (x.symbol || '').toLowerCase().includes(s) || (x.name || '').toLowerCase().includes(s));
}

module.exports = { recordCall, trackTick, stats, startTracker, pnlImage, pnlCaption, resetCalls, pnlForToken, distribution, seedCall, pruneLosers, savePnlSnapshot, savedPnlImage, milestoneImage, survivors, _findCall };
