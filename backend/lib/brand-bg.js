// brand-bg.js — SHADDAI Labs rotating brand background (every 6 hours).
//   Generates one FLUX image (agent-likeness, masterful prompt) per cycle via the
//   HF key pool, caches it to backend/data/brand-bg/latest.jpg, and serves it as
//   the card background until the next rotation. Falls back to the last cached
//   image (or nothing) if HF is out of tokens — text stays crisp regardless.
//   The prompt rotates through the seven agents so the brand never looks static.
'use strict';
const fs = require('fs');
const path = require('path');

const hf = require('./hf-keys');
const DATA_DIR = process.env.TG_DATA_DIR || path.join(__dirname, '..', 'data');
const DIR = path.join(DATA_DIR, 'brand-bg');
const LATEST = path.join(DIR, 'latest.jpg');

const ROTATION_MS = 6 * 60 * 60 * 1000; // 6 hours

// Masterful prompts, one per agent — used as the card background (no text, no letters).
const PROMPTS = [
  { agent: 'SHADDAI', prompt: 'a colossal obsidian monolith crowned with a radiant seven-point star, electric-gold circuit veins running down volcanic stone, floating holographic exchange graphs and nebulae of coins, volumetric god rays through dark haze, hyper-detailed premium fintech poster, cinematic, high contrast, deep blacks, no text, no letters, no watermark' },
  { agent: 'ZEROX', prompt: 'an obsidian bull forged from molten candlestick charts and cascading golden coins, emerald smoke and ember sparks rising, dramatic rim light, dark exchange floor below, hyper-detailed premium fintech poster, cinematic, high contrast, no text, no letters' },
  { agent: 'ORACLE', prompt: 'a great third eye made of violet nebulae and tarot glyph geometry, concentric sacred rings orbiting a black crystal core, deep indigo cosmos scattered with gold dust and star trails, hyper-detailed premium spiritual poster, cinematic, luminous, no text, no letters' },
  { agent: 'NEXUS', prompt: 'a neural lattice of emerald circuitry rising into a vaulted cathedral of light, floating blueprint holograms and wireframe worlds, dark glass floors reflecting green code rain, hyper-detailed premium tech poster, cinematic, depth of field, no text, no letters' },
  { agent: 'TURTLE', prompt: 'a luminous cyan turtle built from pixel voxels and flowing synthwave waves, teal data-shards orbiting, neon grid horizon with a glowing sun, soft haze and bloom, hyper-detailed premium poster, cinematic, high contrast, no text, no letters' },
  { agent: 'QUILL', prompt: 'a giant floating quill of violet light writing a constellation of glyphs across a deep navy sky, ink-nebula trails curling behind it, tiny gold letter sparkles, hyper-detailed premium literary poster, cinematic, atmospheric, no text, no letters' },
  { agent: 'PIKADON', prompt: 'a crimson shield forged of cryptographic runes and warden chains guarding a dark vault doorway, deep red glow slicing through smoke, ember motes and sigil rings, hyper-detailed premium security poster, cinematic, high contrast, no text, no letters' },
];

let _idx = 0;
let _timer = null;
let _last = null;   // cached Buffer

function _nextPrompt() {
  const p = PROMPTS[_idx % PROMPTS.length];
  _idx++;
  return p;
}

// Generate + cache one background. Returns { buffer, agent, ts } or null.
async function generate() {
  const p = _nextPrompt();
  try {
    const out = await hf.generateSafe(p.prompt, { width: 1024, height: 1280 });
    let buffer = null;
    if (out.buffer) buffer = out.buffer;
    else if (out.fallbackUrl) { try { const r = await fetch(out.fallbackUrl); if (r.ok) buffer = Buffer.from(await r.arrayBuffer()); } catch (e) {} }
    if (buffer) {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(LATEST, buffer);
      _last = buffer;
      return { buffer, agent: p.agent, ts: Date.now() };
    }
    return null;
  } catch (e) { return null; }
}

function _loadCached() {
  if (_last) return _last;
  try { _last = fs.readFileSync(LATEST); return _last; } catch (e) { return null; }
}

// Current background (cached buffer or null). Never triggers a network call.
function current() { return _loadCached(); }

// Start the 6-hour rotation. `immediate` = generate one right away (for boot).
function start(immediate = true) {
  if (_timer) return;
  if (immediate) generate().catch(() => {});
  _timer = setInterval(() => { generate().catch(() => {}); }, ROTATION_MS);
  if (_timer.unref) _timer.unref();
  return true;
}

function stop() { if (_timer) { clearInterval(_timer); _timer = null; } }

module.exports = { current, generate, start, stop, ROTATION_MS, PROMPTS };