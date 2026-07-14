/* ══════════════════════════════════════════════════════════════════
   tools-turtle.js — REAL design/CSS/color tools (compute, keyless).
   Color math, CSS generators, SVG shapes, typography scales. Every
   executor returns real, correct output. TURTLE-led.
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const TU = ['TURTLE', 'NEXUS', 'QUILL'];
const ok = (o) => (typeof o === 'string' ? o : JSON.stringify(o));
const err = (m) => JSON.stringify({ error: m });
const need = (v, n) => { if (v == null || v === '') throw new Error(n + ' required'); return v; };
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); if (isNaN(n)) throw new Error('invalid hex'); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s, l = (mx + mn) / 2; if (mx === mn) h = s = 0; else { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h * 360, s * 100, l * 100]; }
function hslToHex(h, s, l) { h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100; let r, g, b; if (s === 0) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3); } return rgbToHex(r * 255, g * 255, b * 255); }
const crypto = require('crypto');
function tool(name, desc, schema, fn) { return { name, description: desc, schema: schema || {}, agents: TU, category: 'Design & Creative', async execute(p = {}) { try { return ok(fn(p || {})); } catch (e) { return err(e.message); } } }; }
const TOOLS_TURTLE2 = {};
const reg = (t) => { TOOLS_TURTLE2[t.name] = t; };

reg(tool('hex_to_rgb', 'Convert a hex color to rgb().', { hex: 'string' }, (p) => { const [r, g, b] = hexToRgb(need(p.hex, 'hex')); return { rgb: `rgb(${r}, ${g}, ${b})`, values: [r, g, b] }; }));
reg(tool('rgb_to_hex', 'Convert rgb values to hex.', { r: 'number', g: 'number', b: 'number' }, (p) => ({ hex: rgbToHex(Number(p.r) || 0, Number(p.g) || 0, Number(p.b) || 0) })));
reg(tool('hex_to_hsl', 'Convert a hex color to hsl().', { hex: 'string' }, (p) => { const [h, s, l] = rgbToHsl(...hexToRgb(need(p.hex, 'hex'))).map(Math.round); return { hsl: `hsl(${h}, ${s}%, ${l}%)` }; }));
reg(tool('lighten_color', 'Lighten a hex color by N%.', { hex: 'string', amount: 'number — %, default 10' }, (p) => { const [h, s, l] = rgbToHsl(...hexToRgb(need(p.hex, 'hex'))); return { result: hslToHex(h, s, Math.min(100, l + (Number(p.amount) || 10))) }; }));
reg(tool('darken_color', 'Darken a hex color by N%.', { hex: 'string', amount: 'number — %, default 10' }, (p) => { const [h, s, l] = rgbToHsl(...hexToRgb(need(p.hex, 'hex'))); return { result: hslToHex(h, s, Math.max(0, l - (Number(p.amount) || 10))) }; }));
reg(tool('complementary_color', 'Get the complementary (opposite) color.', { hex: 'string' }, (p) => { const [h, s, l] = rgbToHsl(...hexToRgb(need(p.hex, 'hex'))); return { complementary: hslToHex(h + 180, s, l) }; }));
reg(tool('analogous_colors', 'Get 2 analogous colors (±30°).', { hex: 'string' }, (p) => { const [h, s, l] = rgbToHsl(...hexToRgb(need(p.hex, 'hex'))); return { colors: [hslToHex(h - 30, s, l), need(p.hex, 'hex'), hslToHex(h + 30, s, l)] }; }));
reg(tool('triadic_colors', 'Get the triadic color scheme (120° apart).', { hex: 'string' }, (p) => { const [h, s, l] = rgbToHsl(...hexToRgb(need(p.hex, 'hex'))); return { colors: [need(p.hex, 'hex'), hslToHex(h + 120, s, l), hslToHex(h + 240, s, l)] }; }));
reg(tool('blend_colors', 'Blend two hex colors at a ratio.', { a: 'string — hex', b: 'string — hex', ratio: 'number — 0-1, default 0.5' }, (p) => { const A = hexToRgb(need(p.a, 'a')), B = hexToRgb(need(p.b, 'b')), r = Number(p.ratio) || 0.5; return { result: rgbToHex(A[0] + (B[0] - A[0]) * r, A[1] + (B[1] - A[1]) * r, A[2] + (B[2] - A[2]) * r) }; }));
reg(tool('random_color', 'Generate a random hex color.', {}, () => ({ hex: '#' + crypto.randomBytes(3).toString('hex') })));
reg(tool('duotone_palette', 'Generate a duotone (shadow + highlight) pair from a hue.', { hue: 'number — 0-360, default 210' }, (p) => { const h = Number(p.hue) || 210; return { shadow: hslToHex(h, 60, 22), highlight: hslToHex((h + 40) % 360, 85, 70) }; }));

reg(tool('text_shadow_css', 'Generate a neon/glow text-shadow CSS.', { color: 'string — hex, default #00e5a0' }, (p) => { const c = p.color || '#00e5a0'; return { css: `text-shadow: 0 0 4px ${c}, 0 0 12px ${c}, 0 0 24px ${c};` }; }));
reg(tool('neon_glow_css', 'Generate a neon box-glow CSS for a color.', { color: 'string — hex' }, (p) => { const c = p.color || '#00e5a0'; const [r, g, b] = hexToRgb(c); return { css: `box-shadow: 0 0 8px rgba(${r},${g},${b},.7), 0 0 24px rgba(${r},${g},${b},.4); border:1px solid ${c};` }; }));
reg(tool('border_radius_css', 'Generate an organic blob border-radius.', {}, () => { const rnd = () => 30 + Math.floor(Math.random() * 40); return { css: `border-radius: ${rnd()}% ${rnd()}% ${rnd()}% ${rnd()}% / ${rnd()}% ${rnd()}% ${rnd()}% ${rnd()}%;` }; }));
reg(tool('transition_css', 'Generate a smooth CSS transition shorthand.', { property: 'string — default all', ms: 'number — default 200' }, (p) => ({ css: `transition: ${p.property || 'all'} ${Number(p.ms) || 200}ms cubic-bezier(.4,0,.2,1);` })));
reg(tool('flexbox_css', 'Generate flexbox CSS for a layout intent (center, row, spread).', { intent: 'string — center|row|spread|column' }, (p) => { const map = { center: 'display:flex;align-items:center;justify-content:center;', row: 'display:flex;flex-direction:row;gap:12px;', spread: 'display:flex;align-items:center;justify-content:space-between;', column: 'display:flex;flex-direction:column;gap:12px;' }; return { css: map[String(p.intent || 'center')] || map.center }; }));
reg(tool('grid_css', 'Generate a responsive CSS grid.', { min: 'number — min col px, default 220' }, (p) => ({ css: `display:grid;grid-template-columns:repeat(auto-fill,minmax(${Number(p.min) || 220}px,1fr));gap:16px;` })));
reg(tool('keyframes_css', 'Generate a CSS @keyframes animation (pulse, float, spin, fade).', { name: 'string — pulse|float|spin|fade' }, (p) => { const K = { pulse: '@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}', float: '@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}', spin: '@keyframes spin{to{transform:rotate(360deg)}}', fade: '@keyframes fade{from{opacity:0}to{opacity:1}}' }; return { css: K[String(p.name || 'pulse')] || K.pulse }; }));
reg(tool('clamp_css', 'Generate a fluid-typography clamp() value.', { min: 'number — px', max: 'number — px' }, (p) => { const mn = Number(p.min) || 16, mx = Number(p.max) || 32; return { css: `font-size: clamp(${mn}px, ${(mn / 16).toFixed(2)}rem + 2vw, ${mx}px);` }; }));

reg(tool('svg_circle', 'Generate an SVG circle with a fill.', { color: 'string — hex', size: 'number — px, default 64' }, (p) => { const s = Number(p.size) || 64; return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 2}" fill="${p.color || '#00e5a0'}"/></svg>` }; }));
reg(tool('svg_wave', 'Generate a decorative SVG wave divider.', { color: 'string — hex' }, (p) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 120"><path fill="${p.color || '#00e5a0'}" d="M0,64L60,80C120,96,240,128,360,122.7C480,117,600,75,720,64C840,53,960,75,1080,80C1200,85,1320,75,1380,69.3L1440,64L1440,120L0,120Z"/></svg>` })));
reg(tool('svg_star', 'Generate an SVG star.', { color: 'string — hex' }, (p) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="${p.color || '#ffd700'}" d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17.8 5.9 21.2l1.4-6.8L2.2 9.7l6.9-.7z"/></svg>` })));

reg(tool('type_scale', 'Generate a modular typographic scale (base × ratio).', { base: 'number — px, default 16', ratio: 'number — default 1.25' }, (p) => { const b = Number(p.base) || 16, r = Number(p.ratio) || 1.25; const steps = {}; for (let i = -1; i <= 5; i++) steps['step' + i] = Math.round(b * Math.pow(r, i) * 100) / 100 + 'px'; return { ratio: r, scale: steps }; }));
reg(tool('golden_ratio', 'Split a length by the golden ratio (1.618).', { total: 'number' }, (p) => { const t = Number(need(p.total, 'total')); return { larger: Math.round(t / 1.618 * 100) / 100, smaller: Math.round((t - t / 1.618) * 100) / 100 }; }));
reg(tool('aspect_ratio', 'Compute height for a width at an aspect ratio (e.g. 16:9).', { width: 'number', ratio: 'string — like 16:9' }, (p) => { const [a, b] = String(p.ratio || '16:9').split(':').map(Number); return { width: Number(need(p.width, 'width')), height: Math.round(Number(p.width) * b / a) }; }));
reg(tool('px_to_rem', 'Convert px to rem (16px base).', { px: 'number' }, (p) => ({ rem: Number(need(p.px, 'px')) / 16 + 'rem' })));
reg(tool('rem_to_px', 'Convert rem to px (16px base).', { rem: 'number' }, (p) => ({ px: Number(need(p.rem, 'rem')) * 16 + 'px' })));

module.exports = { TOOLS_TURTLE2, _count: Object.keys(TOOLS_TURTLE2).length };
