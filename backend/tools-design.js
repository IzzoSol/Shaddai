/* ══════════════════════════════════════════════════════════════════
   tools-design.js — REAL design/visual tools (TURTLE cluster).

   Two executor types, both real:
     • compute — deterministic color math / CSS / SVG generation (no keys)
     • LLM     — creative briefs & microcopy via callLLM

   Merged into agent-engine TOOLS; `agents:[]` routes to the dashboard.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

let callLLM;
try { ({ callLLM } = require('./llm-client')); } catch (e) { callLLM = null; }

const ok = (o) => JSON.stringify(o);
const err = (e) => JSON.stringify({ error: (e && e.message) || String(e) });

// ── color helpers ──────────────────────────────────────────────────
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, l = (max + min) / 2; if (max === min) { h = s = 0; } else { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; } h /= 6; } return [h * 360, s * 100, l * 100]; }
function hslToHex(h, s, l) { h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100; let r, g, b; if (s === 0) { r = g = b = l; } else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3); } return rgbToHex(r * 255, g * 255, b * 255); }
function relLum(hex) { const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function seedHue(str) { let h = 0; for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360; return h; }

// ── LLM factory (local, mirrors tools-content) ─────────────────────
const DESIGN_SYS = 'You are TURTLE, a world-class product designer & creative director on the SHADDAI team. Output ONLY the requested deliverable — concrete, tasteful, ship-ready. No preamble.';
function llmTool(def) {
  return {
    name: def.key, description: def.desc, schema: def.schema || {}, agents: def.agents || ['TURTLE'], category: 'Design & Creative',
    async execute(p = {}) {
      if (!callLLM) return err('LLM client unavailable');
      try {
        const r = await callLLM([{ role: 'system', content: DESIGN_SYS }, { role: 'user', content: def.prompt(p || {}) }], { maxTokens: def.maxTokens || 600, temperature: def.temp ?? 0.8, agentName: 'TURTLE' });
        const out = (r && r.content ? String(r.content) : '').trim();
        return out || err('empty model output');
      } catch (e) { return err(e); }
    },
  };
}
const T = (p, ...keys) => { for (const k of keys) if (p && p[k]) return String(p[k]); return ''; };

const TOOLS_DESIGN = {

  color_palette: {
    name: 'color_palette', description: 'Generate a harmonious 5-color palette from a base hex or seed word.', category: 'Design & Creative',
    schema: { base: 'string — hex like #ff6b35 (optional)', seed: 'string — word to derive a hue (optional)', scheme: 'string — analogous|complementary|triadic|monochrome (default analogous)' },
    agents: ['TURTLE', 'ZEROX', 'QUILL'],
    async execute({ base, seed, scheme = 'analogous' }) {
      try {
        let h, s = 70, l = 55;
        if (base && /^#?[0-9a-f]{3,6}$/i.test(base)) { const hsl = rgbToHsl(...hexToRgb(base)); h = hsl[0]; s = Math.max(45, hsl[1]); l = Math.min(60, Math.max(45, hsl[2])); }
        else h = seedHue(seed || base || 'shaddai');
        const sc = String(scheme).toLowerCase();
        let hues;
        if (sc === 'complementary') hues = [h, h, h + 180, h + 180, h + 30];
        else if (sc === 'triadic') hues = [h, h + 120, h + 240, h + 120, h + 240];
        else if (sc === 'monochrome') hues = [h, h, h, h, h];
        else hues = [h - 30, h - 15, h, h + 15, h + 30];
        const ls = sc === 'monochrome' ? [30, 42, 55, 68, 80] : [50, 55, 55, 60, 65];
        const palette = hues.map((hh, i) => hslToHex(hh, s, ls[i]));
        return ok({ scheme: sc, baseHue: Math.round(h), palette });
      } catch (e) { return err(e); }
    },
  },

  contrast_check: {
    name: 'contrast_check', description: 'WCAG contrast ratio between two colors + AA/AAA pass for normal & large text.', category: 'Design & Creative',
    schema: { fg: 'string — foreground hex', bg: 'string — background hex' },
    agents: ['TURTLE', 'PIKADON'],
    async execute({ fg, bg }) {
      try {
        if (!fg || !bg) return err('fg and bg required');
        const L1 = relLum(fg), L2 = relLum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const r = Math.round(ratio * 100) / 100;
        return ok({ fg, bg, ratio: r + ':1', AA_normal: ratio >= 4.5, AA_large: ratio >= 3, AAA_normal: ratio >= 7, AAA_large: ratio >= 4.5 });
      } catch (e) { return err(e); }
    },
  },

  tailwind_scale: {
    name: 'tailwind_scale', description: 'Generate a Tailwind-style 50→900 shade scale from a base hex.', category: 'Design & Creative',
    schema: { base: 'string — base hex like #00e5a0' },
    agents: ['TURTLE', 'NEXUS'],
    async execute({ base }) {
      try {
        if (!base || !/^#?[0-9a-f]{3,6}$/i.test(base)) return err('valid base hex required');
        const [h, s] = rgbToHsl(...hexToRgb(base));
        const steps = { 50: 96, 100: 92, 200: 83, 300: 72, 400: 62, 500: 52, 600: 44, 700: 36, 800: 28, 900: 18 };
        const scale = {}; for (const k in steps) scale[k] = hslToHex(h, s, steps[k]);
        return ok({ base, scale });
      } catch (e) { return err(e); }
    },
  },

  gradient_css: {
    name: 'gradient_css', description: 'Produce ready-to-paste CSS for a linear gradient between colors.', category: 'Design & Creative',
    schema: { colors: 'string — comma-separated hex e.g. #ff6b35,#7c3aed', angle: 'number — degrees (default 135)' },
    agents: ['TURTLE', 'NEXUS'],
    async execute({ colors = '#ff6b35,#7c3aed', angle = 135 }) {
      try {
        const list = String(colors).split(',').map((c) => c.trim()).filter(Boolean);
        if (list.length < 2) return err('need 2+ colors');
        const css = `background: linear-gradient(${Number(angle) || 135}deg, ${list.join(', ')});`;
        return ok({ css, colors: list, angle: Number(angle) || 135 });
      } catch (e) { return err(e); }
    },
  },

  favicon_svg: {
    name: 'favicon_svg', description: 'Generate an SVG favicon/logo mark from initials on a colored rounded square (returns SVG + data URI).', category: 'Design & Creative',
    schema: { initials: 'string — 1–2 letters', color: 'string — bg hex (optional)' },
    agents: ['TURTLE'],
    async execute({ initials = 'S', color }) {
      try {
        const txt = String(initials).slice(0, 2).toUpperCase();
        const bg = (color && /^#?[0-9a-f]{3,6}$/i.test(color)) ? (color[0] === '#' ? color : '#' + color) : hslToHex(seedHue(txt), 70, 52);
        const fg = relLum(bg) > 0.4 ? '#0a0a14' : '#ffffff';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${txt.length > 1 ? 28 : 36}" fill="${fg}">${txt}</text></svg>`;
        const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
        return ok({ initials: txt, bg, svg, dataUri });
      } catch (e) { return err(e); }
    },
  },

  shadow_css: {
    name: 'shadow_css', description: 'Generate a layered, natural box-shadow CSS at a given elevation.', category: 'Design & Creative',
    schema: { elevation: 'number — 1–5 (default 3)', color: 'string — shadow rgb/hex (optional)' },
    agents: ['TURTLE', 'NEXUS'],
    async execute({ elevation = 3, color = '0,0,0' }) {
      try {
        const e = Math.max(1, Math.min(5, Number(elevation) || 3));
        const c = color.includes(',') ? color : hexToRgb(color).join(',');
        const layers = [];
        for (let i = 1; i <= e; i++) { const y = i * 2; const blur = i * 4; const a = (0.06 + i * 0.02).toFixed(2); layers.push(`0 ${y}px ${blur}px rgba(${c},${a})`); }
        return ok({ css: 'box-shadow: ' + layers.join(', ') + ';', elevation: e });
      } catch (e) { return err(e); }
    },
  },

  glassmorphism_css: {
    name: 'glassmorphism_css', description: 'Generate glassmorphism (frosted glass) CSS for a card.', category: 'Design & Creative',
    schema: { tint: 'string — rgb tint (default 255,255,255)', blur: 'number — px (default 12)' },
    agents: ['TURTLE'],
    async execute({ tint = '255,255,255', blur = 12 }) {
      const t = tint.includes(',') ? tint : hexToRgb(tint).join(',');
      const b = Number(blur) || 12;
      const css = `background: rgba(${t},0.08);\nbackdrop-filter: blur(${b}px);\n-webkit-backdrop-filter: blur(${b}px);\nborder: 1px solid rgba(${t},0.18);\nbox-shadow: 0 8px 32px rgba(0,0,0,0.24);\nborder-radius: 14px;`;
      return ok({ css });
    },
  },

  color_info: {
    name: 'color_info', description: 'Break down a color — hex, rgb, hsl, luminance, and best readable text color on it.', category: 'Design & Creative',
    schema: { color: 'string — hex' },
    agents: ['TURTLE'],
    async execute({ color }) {
      try {
        if (!color || !/^#?[0-9a-f]{3,6}$/i.test(color)) return err('valid hex required');
        const rgb = hexToRgb(color); const hsl = rgbToHsl(...rgb).map((n) => Math.round(n));
        const lum = relLum(color);
        return ok({ hex: color[0] === '#' ? color : '#' + color, rgb: `rgb(${rgb.join(',')})`, hsl: `hsl(${hsl[0]},${hsl[1]}%,${hsl[2]}%)`, luminance: Math.round(lum * 100) / 100, readableText: lum > 0.4 ? '#0a0a14 (dark)' : '#ffffff (light)' });
      } catch (e) { return err(e); }
    },
  },

  // ── LLM-backed creative tools ────────────────────────────────────
  ...Object.fromEntries([
    { key: 'logo_brief', agents: ['TURTLE', 'ZEROX'], maxTokens: 600, desc: 'Write a professional logo design brief for a brand.',
      schema: { brand: 'string — brand name + what it does' },
      prompt: (p) => `Write a logo design brief for: "${T(p, 'brand', 'topic', 'subject')}". Cover: concept direction, 3 style options, color direction (with hex suggestions), typography feel, do’s & don’ts, and 2 symbol ideas.` },
    { key: 'ui_copy', agents: ['TURTLE', 'QUILL'], maxTokens: 400, desc: 'Write UI microcopy (button, empty-state, error, tooltip) for a feature.',
      schema: { feature: 'string — the feature/screen', kind: 'string — button|empty|error|tooltip|onboarding (optional)' },
      prompt: (p) => `Write UI microcopy for "${T(p, 'feature', 'topic', 'subject')}"${p.kind ? ' (' + p.kind + ')' : ''}. Give 5 short, on-brand options. Clear, human, no jargon.` },
    { key: 'image_prompt', agents: ['TURTLE', 'ORACLE'], maxTokens: 300, temp: 0.9, desc: 'Turn a rough idea into a rich text-to-image (FLUX/SD) prompt with style, lighting, composition.',
      schema: { idea: 'string — what you want to generate' },
      prompt: (p) => `Write ONE detailed text-to-image prompt for: "${T(p, 'idea', 'topic', 'subject')}". Include subject, style, lighting, composition, color palette, mood, and a few quality tags. Single paragraph, no explanation.` },
    { key: 'moodboard', agents: ['TURTLE'], maxTokens: 400, temp: 0.9, desc: 'Describe a moodboard (aesthetic keywords, colors, textures, references) for a brand/vibe.',
      schema: { vibe: 'string — the brand/aesthetic' },
      prompt: (p) => `Create a moodboard spec for the vibe: "${T(p, 'vibe', 'topic', 'subject')}". List: 8 aesthetic keywords, a 5-color palette (hex), 3 texture/material notes, 2 typography directions, and 3 reference styles.` },
    { key: 'design_critique', agents: ['TURTLE', 'PIKADON'], maxTokens: 500, desc: 'Give a sharp design critique + concrete fixes for a described UI/layout.',
      schema: { description: 'string — describe the design/screen' },
      prompt: (p) => `Critique this design and give concrete fixes: "${T(p, 'description', 'text', 'input')}". Cover hierarchy, contrast, spacing, typography, and one "hero" improvement. Bullet points.` },
  ].map((d) => [d.key, llmTool(d)])),

};

module.exports = { TOOLS_DESIGN };
