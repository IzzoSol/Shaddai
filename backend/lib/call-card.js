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

module.exports = { render, renderToFile, svgOf, themeFor, THEMES, usd, xs, pct, _ago };