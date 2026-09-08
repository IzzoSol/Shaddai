// call-card.js — SHADDAI Labs call proof card (deterministic SVG → PNG).
//   Text is real vector text rasterized by sharp, so lettering is always crisp
//   and never garbled (zero image-gen tokens). Works with or without MC data.
//
//   Two render modes:
//     • FREE/BASIC     — SVG gradient theme (auto-picked by multiplier tier).
//                        Costs nothing, guaranteed. Use when out of HF tokens.
//     • PREMIUM        — a FLUX-generated background buffer (from the HF key
//                        pool) composited behind the same crisp text layer.
//                        Background only — text is ALWAYS sharp-rendered.
'use strict';
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const W = 1080, H = 1350;

// ---- themes (free/basic), keyed by multiplier tier -------------------------
const THEMES = {
  emerald: { top: '#0b1410', mid: '#0f2318', bot: '#0b1410', accent: '#00ff88', accent2: '#7cf7c4' },
  neon:    { top: '#120a1f', mid: '#1a0f2e', bot: '#100a1c', accent: '#b46bff', accent2: '#d7a7ff' },
  royal:   { top: '#0a0f24', mid: '#11183a', bot: '#0a0f20', accent: '#4d7cff', accent2: '#83a7ff' },
  dark:    { top: '#0b1020', mid: '#101730', bot: '#0b1020', accent: '#00ff88', accent2: '#f7c95c' },
};
function themeFor(mult) {
  if (mult >= 10) return THEMES.emerald;
  if (mult >= 5) return THEMES.neon;
  if (mult >= 2) return THEMES.royal;
  return THEMES.dark;
}

// ---- format helpers ---------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usd = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return 'N/A';
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
};
const xs = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return 'N/A';
  if (v >= 100) return v.toFixed(0) + 'x';
  if (v >= 10) return v.toFixed(1) + 'x';
  return v.toFixed(2) + 'x';
};
const pct = (n) => { const v = Number(n); if (!isFinite(v)) return ''; return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; };
function _ago(ts) { const t = Number(ts); if (!t) return 'N/A'; const s = Math.max(0, (Date.now() - t) / 1000); if (s < 3600) return Math.round(s / 60) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; }

function _row(label, value, opts = {}) {
  const color = opts.color || '#ffffff';
  const sub = opts.sub ? `<tspan x="60" dy="54" font-size="30" fill="#8a93a8">${esc(opts.sub)}</tspan>` : '';
  return `<text x="60" y="${opts.y}" font-family="Segoe UI, Arial, sans-serif">` +
    `<tspan font-size="28" fill="#7d86a0">${esc(label)}</tspan>` +
    `<tspan x="1020" text-anchor="end" font-size="44" font-weight="700" fill="${color}">${esc(value)}</tspan>${sub}</text>`;
}

function svgOf(call, theme) {
  const t = theme || themeFor(Number(call.peakMult) || 1);
  const sym = String(call.symbol || call.name || 'TOKEN').toUpperCase();
  const name = call.name && call.name !== call.symbol ? esc(call.name).slice(0, 28) : 'SHADDAI call';
  const entry = Number(call.entryFdv || call.entryMcap) || 0;
  const cur = Number(call.curFdv) || 0;
  const peakMult = Number(call.peakMult) || 1;
  const curMult = Number(call.curMult) || 1;
  const ath = entry > 0 && peakMult ? entry * peakMult : 0;
  const chg = cur > 0 && entry > 0 ? ((cur - entry) / entry * 100) : null;

  const perfColor = (curMult >= 10) ? '#00ff88' : (curMult >= 5) ? '#7cf7c4' : (curMult >= 2) ? '#f7c95c' : (curMult >= 1) ? '#ffffff' : '#ff5c7a';
  const tagText = curMult >= 10 ? 'HUGE CALL' : curMult >= 5 ? 'STRONG CALL' : curMult >= 2 ? 'RUNNER' : 'LIVE';

  const rows = [];
  let y = 470;
  rows.push(_row('CALLED AT MC', entry > 0 ? usd(entry) : 'N/A', { y, color: '#f7c95c' })); y += 100;
  rows.push(_row('CURRENT MC', cur > 0 ? usd(cur) : 'N/A', { y, color: '#ffffff' })); y += 100;
  if (ath > 0) { rows.push(_row('ALL-TIME HIGH', usd(ath), { y, color: t.accent })); y += 100; }
  rows.push(_row('PEAK', xs(peakMult), { y, color: t.accent2 })); y += 100;
  rows.push(_row('NOW', xs(curMult), { y, color: perfColor, sub: chg != null ? pct(chg) : '' })); y += 90;
  rows.push(_row('AGE', _ago(call.ts), { y, color: '#8a93a8' }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.top}"/><stop offset="0.5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.bot}"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#brand)"/>
  <rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="#1c2340" stroke-width="2" rx="18"/>

  <text x="60" y="130" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="url(#brand)" letter-spacing="6">SHADDAI LABS</text>
  <text x="60" y="172" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#7d86a0">SOVEREIGN SIGNAL CALL</text>

  <text x="60" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="140" font-weight="800" fill="#ffffff">${esc(sym)}</text>
  <text x="60" y="392" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#8a93a8">${name}</text>

  <g font-family="Segoe UI, Arial, sans-serif">
    <text x="858" y="330" font-size="26" fill="${perfColor}" text-anchor="end">● ${tagText}</text>
  </g>
  ${rows.join('\n  ')}

  <line x1="60" y1="${H-150}" x2="${W-60}" y2="${H-150}" stroke="#1c2340" stroke-width="2"/>
  <text x="60" y="${H-105}" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="#5c6680">Signals don't lie.</text>
  <text x="${W-60}" y="${H-105}" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="#5c6680" text-anchor="end">t.me/ShaddaiLabs</text>
</svg>`;
}

// Compose a dark overlay (for legibility) over a FLUX background, then place text.
async function _compositeText(bgBuffer, call, theme) {
  const overlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 8, g: 10, b: 20, alpha: 0.72 } } }).png().toBuffer();
  const base = await sharp(bgBuffer).resize(W, H, { fit: 'cover' }).composite([{ input: overlay }]).png().toBuffer();
  const front = Buffer.from(svgOf(call, theme).replace(/<rect width="1080" height="1350" fill="url\(#bg\)"\/>/, '')); // transparent bg for text-only layer
  return sharp(base).composite([{ input: front }]).png().toBuffer();
}

async function render(call, opts = {}) {
  const theme = opts.theme || themeFor(Number((call || {}).peakMult) || 1);
  if (opts.background && opts.background.length) {
    try { return await _compositeText(opts.background, call || {}, theme); } catch (e) { /* fall through to basic */ }
  }
  return sharp(Buffer.from(svgOf(call || {}, theme))).png().toBuffer();
}

async function renderToFile(call, destPath, opts = {}) {
  const buf = await render(call, opts);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

// ── SHADDAI LABS full signal card (broadcast-time rich data) ─────────────────
// Enriched call shape:
//   { symbol, name, imageUrl, mc (entry FDV), top10Pct, holders,
//     dexPaid (bool), socials:{website,twitter,telegram,discord,instagram},
//     rugScore, source, chain }
// Always renders crisp SVG text over an optional FLUX background. Footer carries
//   @ShaddaiLabs · @shaddaiai · "Built by IzzoSol" · "DM for pro signals".
function _shortAddr(a){ const s=String(a||''); return s.length>10 ? s.slice(0,4)+'…'+s.slice(-4) : s; }
function _socialsTag(socials){
  if(!socials) return '';
  const t=[];
  if(socials.website) t.push('🌐');
  if(socials.twitter) t.push('𝕏');
  if(socials.telegram) t.push('✈');
  if(socials.discord) t.push('💬');
  if(socials.instagram) t.push('📸');
  return t.join(' ');
}
const MONO = 'DejaVu Sans Mono, Courier New, monospace';
const SANS = 'DejaVu Sans, Arial, sans-serif';
function _price(n){ const v=Number(n); if(!isFinite(v)||v===0) return 'N/A'; if(v>=1) return '$'+v.toFixed(4); return '$'+v.toFixed(8); }
function _supply(n){ const v=Number(n); if(!isFinite(v)||!v) return 'N/A'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(2)+'M'; if(v>=1e3) return (v/1e3).toFixed(1)+'K'; return String(Math.round(v)); }
function _ageLong(ms){ const v=Number(ms); if(!isFinite(v)||v==null) return 'N/A'; const h=v/3600000; if(h<1) return Math.round(h*60)+'m'; if(h<48) return Math.round(h)+'h'; return Math.round(h/24)+'d'; }
function _chg(v){ const n=Number(v); if(!isFinite(v)||v==null) return null; return (n>=0?'+':'')+n.toFixed(1)+'%'; }

// Compact stat cell — fits more info per 1080×1350 card (100px rows).
function _c(x, y, label, value, color){
  return `<text x="${x}" y="${y}" font-family="${MONO}"><tspan font-size="19" fill="#6f86a0" letter-spacing="3">${esc(label)}</tspan><tspan x="${x}" dy="40" font-size="36" font-weight="700" fill="${color}">${esc(value)}</tspan></text>`;
}
// Trade-plan chip (ENTRY / TP1 / TP2 / TP3 / STOP).
function _chip(x, y, w, h, label, value, color){
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#090d1a" fill-opacity=".78" stroke="#1c2340" stroke-width="1.5"/>
    <text x="${x + w/2}" y="${y + 30}" text-anchor="middle" font-family="${MONO}" font-size="16" fill="#6f86a0" letter-spacing="2">${esc(label)}</text>
    <text x="${x + w/2}" y="${y + 58}" text-anchor="middle" font-family="${MONO}" font-size="27" font-weight="700" fill="${color}">${esc(value)}</text>
  </g>`;
}
// Compact price for trade-plan chips (keeps "0.0000123" form, no overflow).
function _chipPrice(n){
  const v = Number(n);
  if (!isFinite(v) || !v) return 'N/A';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  if (v >= 1e-5) return '$' + v.toFixed(6);
  return '$' + v.toExponential(1).replace('e-', 'e');
}
// Multi-segment security strip line: 4 fixed columns, per-segment color.
function _secLine(x0, y, parts){
  return parts.map((p, i) =>
    `<text x="${x0 + i * 240}" y="${y}" font-family="${MONO}" font-size="21" font-weight="700" fill="${p[1]}">${esc(p[0])}</text>`
  ).join('\n  ');
}

function svgSignal(call, theme, scrims) {
  const t = theme || themeFor(Math.round(Number(call.mc)||0) >= 150000 ? 10 : 1);
  const sym = String(call.symbol || call.name || 'TOKEN').toUpperCase();
  const name = call.name && call.name !== call.symbol ? esc(call.name).slice(0, 34) : '';
  const mc = Number(call.mc) || 0;
  const price = Number(call.priceUsd) || 0;
  const vol24 = Number(call.volume24h) || 0;
  const vol1 = Number(call.volume1h) || 0;
  const liq = Number(call.liq) || 0;
  const supply = _supply(call.supply);
  const chg1h = _chg(call.chg1h);
  const chg24h = _chg(call.chg24h);
  const chg5m = _chg(call.chg5m);
  const age = _ageLong(call.ageMs);
  const top10 = Number(call.top10Pct);
  const top1 = Number(call.topPct);
  const lp = Number(call.lpPct);
  const holders = Number(call.holders) || 0;
  const fresh = Number(call.freshWallets);
  const bundlers = !!call.bundlers;
  const snipers = !!call.snipers;
  const bundlePct = Number(call.bundlePct);
  const bs = call.buySell || null;
  const buyRatio = (bs && isFinite(Number(bs.ratio))) ? Number(bs.ratio) : null;
  const dexPaid = !!call.dexPaid;
  const rug = Number(call.rugScore);
  const socialsTag = _socialsTag(call.socials);
  const chain = String(call.chain || 'SOLANA').toUpperCase();
  const venue = call.dexId ? ' · '+esc(String(call.dexId).replace(/-/g,' ').toUpperCase()) : '';
  const rank = Number(call.rank) || 0;
  const boostAmt = Number(call.boostAmount) || 0;
  const chg1hColor = !chg1h ? '#ffffff' : (chg1h.startsWith('-') ? '#ff5c7a' : '#00ff88');
  const chg24hColor = !chg24h ? '#8a93a8' : (chg24h.startsWith('-') ? '#ff5c7a' : '#00ff88');
  const chg5mColor = !chg5m ? '#8a93a8' : (chg5m.startsWith('-') ? '#ff5c7a' : '#00ff88');
  const top10Color = (top10 > 50) ? '#ff5c7a' : (top10 > 30 ? '#f7c95c' : '#7cf7c4');
  const top1Color  = (top1  > 30) ? '#ff5c7a' : (top1  > 10 ? '#f7c95c' : '#7cf7c4');
  const lpColor    = (lp >= 80) ? '#00ff88' : (lp > 0 ? '#f7c95c' : '#ff5c7a');
  const buyColor   = buyRatio == null ? '#ffffff' : (buyRatio >= 0.6 ? '#00ff88' : (buyRatio >= 0.5 ? '#ffffff' : '#ff5c7a'));
  const img = call.imageUrl ? `<image href="${esc(call.imageUrl)}" x="${W-210}" y="222" width="150" height="150" preserveAspectRatio="xMidYMid slice" clip-path="url(#tickclip)"/>` : '';

  const L = 60, R = W/2 + 20;      // left & right column x
  const cells = [];
  let y = 470;
  cells.push(_c(L, y, 'PRICE', _price(price), '#ffffff'));
  cells.push(_c(R, y, 'MARKET CAP', usd(mc), '#f7c95c')); y += 100;
  cells.push(_c(L, y, 'VOLUME 24H', usd(vol24), '#ffffff'));
  cells.push(_c(R, y, 'VOLUME 1H', usd(vol1), '#ffffff')); y += 100;
  cells.push(_c(L, y, 'LIQUIDITY', usd(liq), '#7cf7c4'));
  cells.push(_c(R, y, 'SUPPLY', supply, '#ffffff')); y += 100;
  cells.push(_c(L, y, 'AGE', age, '#ffffff'));
  cells.push(_c(R, y, '1H', chg1h||'N/A', chg1hColor)); y += 100;
  cells.push(_c(L, y, '24H', chg24h||'N/A', chg24hColor));
  cells.push(_c(R, y, '5M', chg5m||'N/A', chg5mColor)); y += 100;
  cells.push(_c(L, y, 'TOP1 HOLDER', isFinite(top1) ? top1.toFixed(1)+'%' : 'N/A', top1Color));
  cells.push(_c(R, y, 'BUYS', buyRatio != null ? Math.round(buyRatio*100)+'%' : 'N/A', buyColor)); y += 100;
  cells.push(_c(L, y, 'DEX PAID', dexPaid?'YES':'NO', dexPaid?'#f7c95c':'#7cf7c4'));
  cells.push(_c(R, y, 'RUG SCORE', isFinite(rug) ? rug.toFixed(0)+'/100' : 'N/A', (rug>=80?'#00ff88':rug>=50?'#f7c95c':'#ff5c7a')));

  // concentrated-ownership + buy pressure strip
  const sec1 = _secLine(L, 1054, [
    ['TOP10 ' + (isFinite(top10) ? top10.toFixed(1)+'%' : 'N/A'), top10Color],
    ['TOP1 ' + (isFinite(top1) ? top1.toFixed(1)+'%' : 'N/A'), top1Color],
    ['LP ' + (isFinite(lp) ? (lp >= 99 ? '100%' : lp.toFixed(0)+'%') : 'N/A'), lpColor],
    [(holders ? holders.toLocaleString() : 'N/A') + ' HOLDERS', '#ffffff'],
  ]);
  const sec2 = _secLine(L, 1092, [
    ['BUYS ' + (buyRatio != null ? Math.round(buyRatio*100)+'%' : 'N/A'), buyColor],
    [(fresh ? fresh+' FRESH' : '0 FRESH'), '#9aa6c4'],
    [bundlers ? ('📦 ' + (bundlePct > 0 ? bundlePct.toFixed(0)+'%' : 'yes')) : '✓ BUNDLERS CLEAN', bundlers ? '#ff5c7a' : '#00ff88'],
    [snipers ? ('🔫 ' + (fresh ? fresh : '?')) : '✓ SNIPERS CLEAN', snipers ? '#ff5c7a' : '#00ff88'],
  ]);

  // entry / take-profit / stop-loss plan
  let trade = '';
  if (price > 0) {
    const plan = [
      ['ENTRY', _chipPrice(price), '#ffffff'],
      ['TP1 · 50%', _chipPrice(price * 1.5), '#00ff88'],
      ['TP2 · 200%', _chipPrice(price * 3), '#00ff88'],
      ['TP3 · 500%', _chipPrice(price * 5), '#00ff88'],
      ['STOP · -15%', _chipPrice(price * 0.85), '#ff5c7a'],
    ];
    const cxs = [60, 255, 450, 645, 840];
    trade = `<text x="60" y="1132" font-family="${MONO}" font-size="17" fill="#6f86a0" letter-spacing="3">TRADE PLAN</text>\n  ` +
      plan.map((p, i) => _chip(cxs[i], 1146, 180, 74, p[0], p[1], p[2])).join('\n  ');
  }

  // ranking / paid-boost badge line
  const badge = [
    (rank >= 1 && rank <= 25) ? `<text x="60" y="420" font-family="${MONO}" font-size="22" font-weight="700" fill="#f7c95c">★ #${rank} TRENDING</text>` : '',
    (boostAmt > 0) ? `<text x="${W-60}" y="420" text-anchor="end" font-family="${MONO}" font-size="22" font-weight="700" fill="#b46bff">📣 BOOSTED</text>` : '',
  ].filter(Boolean).join('\n  ');

  const scrimDefs = scrims ? `<linearGradient id="scrT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070e" stop-opacity=".96"/><stop offset="1" stop-color="#05070e" stop-opacity="0"/></linearGradient>
    <linearGradient id="scrB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070e" stop-opacity="0"/><stop offset="1" stop-color="#05070e" stop-opacity=".96"/></linearGradient>` : '';
  const scrimsBody = scrims ? `<rect x="0" y="0" width="${W}" height="560" fill="url(#scrT)"/>
  <rect x="0" y="700" width="${W}" height="${H-700}" fill="url(#scrB)"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.top}"/><stop offset="0.5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.bot}"/></linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>
    <clipPath id="tickclip"><circle cx="${W-135}" cy="297" r="75"/></clipPath>
    ${scrimDefs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#brand)"/>
  <rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="#1c2340" stroke-width="2" rx="18"/>
  ${scrimsBody}

  <!-- header plate -->
  <rect x="0" y="0" width="${W}" height="190" fill="rgba(5,8,18,.72)"/>
  <line x1="0" y1="190" x2="${W}" y2="190" stroke="${t.accent}" stroke-width="1.5" opacity=".45"/>

  <text x="60" y="112" font-family="${SANS}" font-size="40" font-weight="800" fill="url(#brand)" letter-spacing="10">SHADDAI LABS</text>
  <text x="60" y="158" font-family="${MONO}" font-size="17" fill="#7d86a0" letter-spacing="6">${chain}${venue}</text>

  <text x="60" y="330" font-family="${SANS}" font-size="108" font-weight="800" fill="#ffffff">$${esc(sym)}</text>
  ${name ? `<text x="60" y="378" font-family="${SANS}" font-size="28" fill="#8a93a8">${name}</text>` : ''}
  ${img}
  ${badge}

  ${cells.join('\n  ')}
  ${sec1}
  ${sec2}
  ${trade}

  <line x1="60" y1="1240" x2="${W-60}" y2="1240" stroke="#1c2340" stroke-width="2"/>
  <text x="60" y="1283" font-family="${MONO}" font-size="21" fill="#8a93a8" letter-spacing="2">@ShaddaiLabs ${socialsTag ? ' · ' + socialsTag : ''}</text>
  <text x="${W-60}" y="1283" font-family="${MONO}" font-size="21" fill="#8a93a8" text-anchor="end">@shaddaiai</text>
  <text x="60" y="1316" font-family="${MONO}" font-size="15" fill="#5c6680">Built by IzzoSol</text>
  <text x="${W-60}" y="1316" font-family="${MONO}" font-size="15" fill="#5c6680" text-anchor="end">DM for pro signals</text>
</svg>`;
}

// Render the full signal card. opts.background = optional FLUX buffer.
// The HF background now actually shows: lighter global scrim (0.60) plus
// top/bottom gradient scrims only where the text lives — the middle band stays live.
async function renderSignalCard(call, opts = {}) {
  const theme = themeFor(Number(call && call.top10Pct) >= 50 ? 1 : (Number(call && call.mc)||0) >= 50000 ? 5 : 2);
  if (opts.background && opts.background.length) {
    try {
      const overlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 6, g: 8, b: 16, alpha: 0.60 } } }).png().toBuffer();
      const base = await sharp(opts.background).resize(W, H, { fit: 'cover' }).composite([{ input: overlay }]).png().toBuffer();
      const textLayer = Buffer.from(svgSignal(call || {}, theme, true).replace(/<rect width="1080" height="1350" fill="url\(#bg\)"\/>/, ''));
      return sharp(base).composite([{ input: textLayer }]).png().toBuffer();
    } catch (e) { /* fall through to basic */ }
  }
  return sharp(Buffer.from(svgSignal(call || {}, theme, false))).png().toBuffer();
}

// ── PNL template card ────────────────────────────────────────────────────────
// "PNL IMAGES" the way they should work: a branded template that says when the
// call happened, how many Xs it went, and the token info — NOT a random art
// picture. Crisp sharp-rendered text over the rotating HF background.
function _when(ts) {
  const d = new Date(Number(ts) || NaN);
  if (isNaN(d.getTime())) return 'N/A';
  const s = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(', ', ' ');
  return s.replace(/:00$/, '');
}

function svgPnl(call, theme, scrims) {
  const t = theme || themeFor(Math.max(1, Math.round(Number((call && call.peakMult) || 1))));
  const sym = String((call && (call.symbol || call.name)) || 'TOKEN').toUpperCase();
  const name = call && call.name && call.name !== call.symbol ? esc(String(call.name)).slice(0, 34) : '';
  const entryFdv = Number((call && (call.entryFdv || call.entryMcap)) || 0);
  const curFdv = Number((call && call.curFdv) || 0) || entryFdv;
  const currMult = Number((call && call.curMult) || 1);
  const peakMult = Math.max(currMult, Number((call && call.peakMult) || 1));
  const entryPrice = Number((call && call.entryPrice) || 0);
  const athFdv = entryFdv * peakMult;
  const chg = (curFdv > 0 && entryFdv > 0) ? ((curFdv - entryFdv) / entryFdv * 100) : null;
  const perfColor = (currMult >= 10) ? '#00ff88' : (currMult >= 5) ? '#7cf7c4' : (currMult >= 2) ? '#f7c95c' : (currMult >= 1) ? '#ffffff' : '#ff5c7a';
  const holders = Number((call && call.holders) || 0);
  const top10 = Number((call && call.top10Pct));
  const lp = Number((call && call.lpPct));
  const rug = Number((call && call.rugScore));
  const insiders = Number((call && call.insiders) || 0);
  const bundlers = !!(call && call.bundlers);
  const snipers = !!(call && call.snipers);
  const milestones = Array.isArray(call && call.milestones) ? call.milestones : [];
  const chain = String((call && call.chain) || 'SOLANA').toUpperCase();
  const venue = (call && call.dexId) ? ' · ' + esc(String(call.dexId).replace(/-/g, ' ').toUpperCase()) : '';
  const img = (call && call.imageUrl) ? `<image href="${esc(call.imageUrl)}" x="${W-210}" y="212" width="150" height="150" preserveAspectRatio="xMidYMid slice" clip-path="url(#tickclip)"/>` : '';

  const L = 60, R = W/2 + 20;
  const cells = [];
  let y = 576;
  cells.push(_c(L, y, 'CALLED', _when(call && call.ts), '#ffffff'));
  cells.push(_c(R, y, 'CALLED AGO', _ago(call && call.ts), '#7cf7c4')); y += 96;
  cells.push(_c(L, y, 'ENTRY MC', usd(entryFdv), '#f7c95c'));
  cells.push(_c(R, y, 'ENTRY PRICE', _price(entryPrice), '#ffffff')); y += 96;
  cells.push(_c(L, y, 'CURRENT MC', usd(curFdv), '#ffffff'));
  cells.push(_c(R, y, 'NOW', xs(currMult), perfColor)); y += 96;
  cells.push(_c(L, y, 'PEAK', xs(peakMult), t.accent));
  cells.push(_c(R, y, 'ATH MC', usd(athFdv), '#ffffff')); y += 96;
  cells.push(_c(L, y, 'HOLDERS', holders ? holders.toLocaleString() : 'N/A', '#ffffff'));
  cells.push(_c(R, y, 'TOP10', isFinite(top10) ? top10.toFixed(1)+'%' : 'N/A', (top10 > 50 ? '#ff5c7a' : (top10 > 30 ? '#f7c95c' : '#7cf7c4')))); y += 96;
  cells.push(_c(L, y, 'LP LOCK', isFinite(lp) ? (lp >= 99 ? '100%' : lp.toFixed(0)+'%') : 'N/A', (lp >= 80 ? '#00ff88' : (lp > 0 ? '#f7c95c' : '#ff5c7a'))));
  cells.push(_c(R, y, 'RUG SCORE', isFinite(rug) ? rug.toFixed(0)+'/100' : 'N/A', (rug >= 80 ? '#00ff88' : rug >= 50 ? '#f7c95c' : '#ff5c7a')));

  // ownership/attack-line strip + milestones hit
  const strip = _secLine(L, 1136, [
    ['INSIDERS ' + (insiders || '0'), insiders > 0 ? '#f7c95c' : '#7cf7c4'],
    ['BUNDLERS ' + (bundlers ? 'YES' : 'CLEAN'), bundlers ? '#ff5c7a' : '#00ff88'],
    ['SNIPERS ' + (snipers ? 'YES' : 'CLEAN'), snipers ? '#ff5c7a' : '#00ff88'],
    ['RANK ' + (Number((call && call.rank) || 0) || '—'), '#9aa6c4'],
  ]);
  const msTxt = milestones.length ? milestones.map(m => m + 'x').join('  →  ') : '';

  const scrimDefs = scrims ? `<linearGradient id="scrT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070e" stop-opacity=".96"/><stop offset="1" stop-color="#05070e" stop-opacity="0"/></linearGradient>
    <linearGradient id="scrB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070e" stop-opacity="0"/><stop offset="1" stop-color="#05070e" stop-opacity=".96"/></linearGradient>` : '';
  const scrimsBody = scrims ? `<rect x="0" y="0" width="${W}" height="560" fill="url(#scrT)"/>
  <rect x="0" y="680" width="${W}" height="${H-680}" fill="url(#scrB)"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.top}"/><stop offset="0.5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.bot}"/></linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>
    <clipPath id="tickclip"><circle cx="${W-135}" cy="287" r="75"/></clipPath>
    ${scrimDefs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#brand)"/>
  <rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="#1c2340" stroke-width="2" rx="18"/>
  ${scrimsBody}

  <rect x="0" y="0" width="${W}" height="190" fill="rgba(5,8,18,.72)"/>
  <line x1="0" y1="190" x2="${W}" y2="190" stroke="${t.accent}" stroke-width="1.5" opacity=".45"/>

  <text x="60" y="112" font-family="${SANS}" font-size="40" font-weight="800" fill="url(#brand)" letter-spacing="10">SHADDAI LABS</text>
  <text x="60" y="158" font-family="${MONO}" font-size="17" fill="#7d86a0" letter-spacing="6">PNL · ${chain}${venue}</text>

  <text x="60" y="318" font-family="${SANS}" font-size="96" font-weight="800" fill="#ffffff">$${esc(sym)}</text>
  ${name ? `<text x="60" y="372" font-family="${SANS}" font-size="28" fill="#8a93a8">${name}</text>` : ''}
  ${img}

  <rect x="60" y="428" width="${W-120}" height="96" rx="16" fill="rgba(5,8,18,.6)" stroke="${t.accent}" stroke-width="1.5" stroke-opacity=".5"/>
  <text x="88" y="472" font-family="${MONO}" font-size="20" fill="#6f86a0" letter-spacing="4">${currMult >= 1 ? 'NOW' : 'DOWN'}</text>
  <text x="88" y="506" font-family="${SANS}" font-size="54" font-weight="900" fill="${perfColor}">${xs(currMult)}${chg != null ? '   ' + (chg >= 0 ? '+' : '') + chg.toFixed(0) + '%' : ''}</text>
  <text x="${W-88}" y="472" text-anchor="end" font-family="${MONO}" font-size="20" fill="#6f86a0" letter-spacing="4">PEAK</text>
  <text x="${W-88}" y="506" text-anchor="end" font-family="${SANS}" font-size="54" font-weight="900" fill="${t.accent}">${xs(peakMult)}</text>

  ${cells.join('\n  ')}
  ${strip}
  ${msTxt ? `<text x="60" y="1174" font-family="${MONO}" font-size="22" font-weight="700" fill="#f7c95c">MILESTONES HIT · ${esc(msTxt)}</text>` : ''}

  <line x1="60" y1="1215" x2="${W-60}" y2="1215" stroke="#1c2340" stroke-width="2"/>
  <text x="60" y="1257" font-family="${MONO}" font-size="21" fill="#8a93a8" letter-spacing="2">@ShaddaiLabs</text>
  <text x="${W-60}" y="1257" font-family="${MONO}" font-size="21" fill="#8a93a8" text-anchor="end">@shaddaiai</text>
  <text x="60" y="1290" font-family="${MONO}" font-size="15" fill="#5c6680">Built by IzzoSol</text>
  <text x="${W-60}" y="1290" font-family="${MONO}" font-size="15" fill="#5c6680" text-anchor="end">${msTxt ? 'pro signals · live feed' : 'DM for pro signals'}</text>
</svg>`;
}

// Render the PNL template card. opts.background = HF/FLUX buffer (brand-bg).
async function renderPnlCard(call, opts = {}) {
  const theme = themeFor(Math.max(1, Math.round(Number((call && (call.peakMult || call.curMult)) || 1))));
  if (opts.background && opts.background.length) {
    try {
      const overlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 6, g: 8, b: 16, alpha: 0.60 } } }).png().toBuffer();
      const base = await sharp(opts.background).resize(W, H, { fit: 'cover' }).composite([{ input: overlay }]).png().toBuffer();
      const textLayer = Buffer.from(svgPnl(call || {}, theme, true).replace(/<rect width="1080" height="1350" fill="url\(#bg\)"\/>/, ''));
      return sharp(base).composite([{ input: textLayer }]).png().toBuffer();
    } catch (e) { /* fall through to basic */ }
  }
  return sharp(Buffer.from(svgPnl(call || {}, theme, false))).png().toBuffer();
}

module.exports = { render, renderToFile, svgOf, themeFor, THEMES, usd, xs, pct, _ago, renderSignalCard, svgSignal, renderPnlCard, svgPnl };