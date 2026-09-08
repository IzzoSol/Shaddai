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

// Two-column stat cell for the dense signal card.
function _cell(x, y, label, value, color){
  return `<text x="${x}" y="${y}" font-family="${MONO}"><tspan font-size="20" fill="#6f86a0" letter-spacing="3">${esc(label)}</tspan><tspan x="${x}" dy="44" font-size="38" font-weight="700" fill="${color}">${esc(value)}</tspan></text>`;
}

function svgSignal(call, theme) {
  const t = theme || themeFor(Math.round(Number(call.mc)||0) >= 150000 ? 10 : 1);
  const sym = String(call.symbol || call.name || 'TOKEN').toUpperCase();
  const name = call.name && call.name !== call.symbol ? esc(call.name).slice(0, 34) : '';
  const mc = Number(call.mc) || 0;
  const price = Number(call.priceUsd) || 0;
  const vol24 = Number(call.volume24h) || 0;
  const liq = Number(call.liq) || 0;
  const supply = _supply(call.supply);
  const chg1h = _chg(call.chg1h);
  const chg24h = _chg(call.chg24h);
  const age = _ageLong(call.ageMs);
  const top10 = Number(call.top10Pct);
  const holders = Number(call.holders) || 0;
  const fresh = Number(call.freshWallets);
  const bundlers = !!call.bundlers;
  const snipers = !!call.snipers;
  const dexPaid = !!call.dexPaid;
  const rug = Number(call.rugScore);
  const socialsTag = _socialsTag(call.socials);
  const chain = String(call.chain || 'SOLANA').toUpperCase();
  const venue = call.dexId ? ' · '+esc(String(call.dexId).replace(/-/g,' ').toUpperCase()) : '';
  const chg1hColor = !chg1h ? '#ffffff' : (chg1h.startsWith('-') ? '#ff5c7a' : '#00ff88');
  const img = call.imageUrl ? `<image href="${esc(call.imageUrl)}" x="${W-210}" y="222" width="150" height="150" preserveAspectRatio="xMidYMid slice" clip-path="url(#tickclip)"/>` : '';

  const L = 60, R = W/2 + 20;      // left & right column x
  const cells = [];
  let y = 470;
  cells.push(_cell(L, y, 'PRICE', _price(price), '#ffffff'));
  cells.push(_cell(R, y, 'MARKET CAP', usd(mc), '#f7c95c')); y += 108;
  cells.push(_cell(L, y, 'VOLUME 24H', usd(vol24), '#ffffff'));
  cells.push(_cell(R, y, 'LIQUIDITY', usd(liq), '#7cf7c4')); y += 108;
  cells.push(_cell(L, y, 'SUPPLY', supply, '#ffffff'));
  cells.push(_cell(R, y, '1H', chg1h||'N/A', chg1hColor)); y += 108;
  cells.push(_cell(L, y, 'AGE', age, '#ffffff'));
  cells.push(_cell(R, y, '24H', chg24h||'N/A', '#8a93a8')); y += 108;
  // security strip
  const secLine = `TOP10 ${isFinite(top10)?top10.toFixed(1)+'%':'N/A'} · ${holders.toLocaleString()} HOLDERS · ${isFinite(fresh)?fresh+' FRESH':'0 FRESH'}${bundlers?' · 📦 BUNDLER':''}${snipers?' · 🔫 SNIPER':''}`;
  cells.push(`<text x="${L}" y="${y+6}" font-family="${MONO}" font-size="24" font-weight="700" fill="${(top10>50)?'#ff5c7a':'#7cf7c4'}">${esc(secLine)}</text>`); y += 60;
  cells.push(_cell(L, y, 'DEX PAID', dexPaid?'YES':'NO', dexPaid?'#f7c95c':'#7cf7c4'));
  cells.push(_cell(R, y, 'RUG SCORE', isFinite(rug)?rug.toFixed(0)+'/100':'N/A', (rug>=80?'#00ff88':rug>=50?'#f7c95c':'#ff5c7a'))); y += 108;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.top}"/><stop offset="0.5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.bot}"/></linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>
    <clipPath id="tickclip"><circle cx="${W-135}" cy="297" r="75"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#brand)"/>
  <rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="#1c2340" stroke-width="2" rx="18"/>

  <!-- header plate -->
  <rect x="0" y="0" width="${W}" height="190" fill="rgba(5,8,18,.72)"/>
  <line x1="0" y1="190" x2="${W}" y2="190" stroke="${t.accent}" stroke-width="1.5" opacity=".45"/>

  <text x="60" y="112" font-family="${SANS}" font-size="40" font-weight="800" fill="url(#brand)" letter-spacing="10">SHADDAI LABS</text>
  <text x="60" y="158" font-family="${MONO}" font-size="17" fill="#7d86a0" letter-spacing="6">${chain}${venue}</text>

  <text x="60" y="330" font-family="${SANS}" font-size="108" font-weight="800" fill="#ffffff">$${esc(sym)}</text>
  ${name ? `<text x="60" y="378" font-family="${SANS}" font-size="28" fill="#8a93a8">${name}</text>` : ''}
  ${img}

  ${cells.join('\n  ')}

  <line x1="60" y1="${H-190}" x2="${W-60}" y2="${H-190}" stroke="#1c2340" stroke-width="2"/>
  <text x="60" y="${H-145}" font-family="${MONO}" font-size="21" fill="#8a93a8" letter-spacing="2">@ShaddaiLabs ${socialsTag ? ' · ' + socialsTag : ''}</text>
  <text x="${W-60}" y="${H-145}" font-family="${MONO}" font-size="21" fill="#8a93a8" text-anchor="end">@shaddaiai</text>
  <text x="60" y="${H-108}" font-family="${MONO}" font-size="15" fill="#5c6680">Built by IzzoSol</text>
  <text x="${W-60}" y="${H-108}" font-family="${MONO}" font-size="15" fill="#5c6680" text-anchor="end">DM for pro signals</text>
</svg>`;
}

// Render the full signal card. opts.background = optional FLUX buffer.
async function renderSignalCard(call, opts = {}) {
  const theme = themeFor(Number(call && call.top10Pct) >= 50 ? 1 : (Number(call && call.mc)||0) >= 50000 ? 5 : 2);
  if (opts.background && opts.background.length) {
    try {
      const overlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 6, g: 8, b: 16, alpha: 0.87 } } }).png().toBuffer();
      const base = await sharp(opts.background).resize(W, H, { fit: 'cover' }).composite([{ input: overlay }]).png().toBuffer();
      return sharp(base).composite([{ input: Buffer.from(svgSignal(call || {}, theme).replace(/<rect width="1080" height="1350" fill="url\(#bg\)"\/>/, '')) }]).png().toBuffer();
    } catch (e) { /* fall through to basic */ }
  }
  return sharp(Buffer.from(svgSignal(call || {}, theme))).png().toBuffer();
}

module.exports = { render, renderToFile, svgOf, themeFor, THEMES, usd, xs, pct, _ago, renderSignalCard, svgSignal };