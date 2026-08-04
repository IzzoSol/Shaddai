#!/usr/bin/env node
/**
 * Generate full-bleed nav banners via fal.ai FLUX (the owner's personal paid key —
 * never stored, passed as FAL_KEY env var or in .env.local). Saves JPGs to
 * public/assets/nav/{key}.jpg (overwrites). 640x160 wide strips, no text in art.
 *   node backend/scripts/generate-nav-fal.js            (all 14)
 *   node backend/scripts/generate-nav-fal.js markets    (single)
 * Requires FAL_KEY (env or .env.local).
 */
const fs = require('fs');
const path = require('path');

function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.replace(/^["']|["']$/g, '');
  try { const t = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8');
    const m = t.match(/FAL_KEY\s*=\s*["']?([^"'\r\n]+)["']?/); if (m) return m[1].trim(); } catch {}
  return null;
}
const FAL_KEY = loadFalKey();
if (!FAL_KEY) { console.error('FAL_KEY not found'); process.exit(1); }

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'nav');
fs.mkdirSync(OUT, { recursive: true });

const W = 640, H = 160;

// Shared brand style keeps every button on the same neon-on-dark look.
const STYLE = ', ultra wide banner composition, dark navy sci-fi, neon cyan and emerald accents, ' +
  'cinematic lighting, high detail, no text, no watermark, no letters, no logos';

const NAV = [
  ['dashboard',  'a futuristic command-center HUD dashboard with glowing holographic status panels and charts'],
  ['agents',     'seven glowing AI agent silhouettes standing in a dark neon council chamber with golden crown motif'],
  ['workflow',   'glowing connected neural nodes and pipeline branches flowing across the frame, cyan circuit automation'],
  ['markets',    'a dark trading terminal with neon green and red candlestick charts and holographic market tickers'],
  ['office',     'a dark sci-fi command office desk with holographic agent panels, emerald neon work board'],
  ['chat',       'glowing holographic chat bubbles and speech waveforms on a dark mission-control wall'],
  ['apis',       'glowing API connection hubs and server racks with neon cable links on dark blue'],
  ['social',     'glowing social network nodes and broadcast waves, violet and cyan on dark navy'],
  ['media',      'a dark video studio with a neon editing timeline and glowing film frames, magenta and cyan'],
  ['automation', 'glowing robotic arms and precision gears with blue circuits, dark industrial future'],
  ['forge',      'an arcane glowing forge with floating crystalline agent shards and emerald sparks, dark fantasy sci-fi'],
  ['aura',       'a glowing electric aura orb with lightning arcs and energy rings, neon cyan purple on dark'],
  ['worlds',     'futuristic floating islands with a glowing portal gateway, dark starry sky, purple cyan neon'],
  ['plans',      'a dark royal golden crown with sparkling coins and glowing price gems, deep navy'],
];

const t0all = Date.now();
(async () => {
  const only = process.argv[2];
  const list = only ? NAV.filter(n => n[0] === only.toLowerCase()) : NAV;
  console.log('fal.ai FLUX | generating', list.length, 'nav banner(s)');
  let ok = 0;
  for (const [key, desc] of list) {
    const t0 = Date.now();
    try {
      const r = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { Authorization: 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: desc + STYLE, image_size: { width: W, height: H }, num_images: 1, seed: Math.floor(Math.random() * 1e6) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error('fal ' + r.status + ': ' + JSON.stringify(j).slice(0, 200));
      const url = (j.image && j.image.url) || (j.images && j.images[0] && j.images[0].url);
      if (!url) throw new Error('no image url: ' + JSON.stringify(j).slice(0, 200));
      const img = await fetch(url); const buf = Buffer.from(await img.arrayBuffer());
      fs.writeFileSync(path.join(OUT, key + '.jpg'), buf);
      console.log(`  ${key}: ${(buf.length/1024).toFixed(0)}KB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      ok++;
    } catch (e) { console.log(`  ${key}: FAIL ${e.message}`); }
  }
  console.log(`done: ${ok}/${list.length} in ${((Date.now()-t0all)/1000).toFixed(1)}s`);
})();
