// Generates full-bleed banner backgrounds for the SHADDAI dashboard nav buttons.
// Lane: HF FLUX key pool first; when the pool is quota-exhausted (402) it falls
// back to the keyless Pollinations FLUX lane (the same fallback hf-keys.js ships).
// Saves JPGs to public/assets/nav/{key}.jpg — wide 4:1 strips that cover the
// whole button. No text in the art (labels render in HTML on top).
const fs = require('fs');
const path = require('path');
const hf = require('../lib/hf-keys.js');

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
  const only = process.argv[2]; // optional: single key by name
  const list = only ? NAV.filter(n => n[0] === only.toLowerCase()) : NAV;
  console.log('keys:', hf.keys().length, '| generating', list.length, 'nav banner(s)');
  let ok = 0;
  for (const [key, desc] of list) {
    const t0 = Date.now();
    try {
      const out = await hf.generateSafe(desc + STYLE, { width: W, height: H });
      if (out.buffer) {
        const f = path.join(OUT, key + '.jpg');
        fs.writeFileSync(f, out.buffer);
        console.log(`  ${key}: ${(out.buffer.length/1024).toFixed(0)}KB ${out.provider} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
        ok++;
      } else if (out.fallbackUrl) {
        const r = await fetch(out.fallbackUrl);
        if (!r.ok) throw new Error('fallback HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        const f = path.join(OUT, key + '.jpg');
        fs.writeFileSync(f, buf);
        console.log(`  ${key}: ${(buf.length/1024).toFixed(0)}KB ${out.provider} (HF ${out.hfError}) in ${((Date.now()-t0)/1000).toFixed(1)}s`);
        ok++;
      } else {
        console.log(`  ${key}: NO OUTPUT (${out.provider}) ${out.hfError || ''}`);
      }
    } catch (e) {
      console.log(`  ${key}: FAIL ${e.code || ''} ${e.message}`);
    }
  }
  console.log(`done: ${ok}/${list.length} in ${((Date.now()-t0all)/1000).toFixed(1)}s`);
})();
