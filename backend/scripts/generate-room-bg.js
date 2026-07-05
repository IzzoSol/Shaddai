// generate-room-bg.js — real HF FLUX room backdrops, one per council agent, each in that
// agent's own aesthetic. The agent's full-body art stands in front of this in the Rooms tab.
// Run: node backend/scripts/generate-room-bg.js
const fs = require('fs');
const path = require('path');
const hf = require('../lib/hf-keys');

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'rooms');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = ', wide interior environment concept art, empty clear floor in the center foreground for a character to stand, atmospheric depth, neon Tron aesthetic, glowing circuit accents, cinematic volumetric lighting, deep rich detail, no people, no characters, landscape 16:9';

const ROOMS = {
  shaddai: 'a radiant golden divine throne room inside a grand temple, towering gold pillars, a solar halo of light, ornate sacred-geometry floor, brilliant warm gold glow',
  nexus:   'a high-tech azure architect command lab, floating holographic blueprints and schematics, sleek blue circuit walls, glowing data servers, electric blue glow',
  zerox:   'an opulent gold-and-green trading floor, giant holographic market candlestick charts, cascading ticker data streams, luxurious financial vault, emerald and gold glow',
  oracle:  'a violet mystic observatory, swirling cosmic nebula through a great dome window, floating sacred-geometry runes and crystals, arcane altar, deep purple glow',
  turtle:  'a vibrant teal creative art studio, easels and glowing canvases, floating color palettes and sculpting tools, playful jade ambiance, emerald glow',
  quill:   'a warm amber grand library and scriptorium, towering bookshelves, floating glowing scrolls and an ink well, candlelit reading desks, soft amber glow',
  pikadon: 'a crimson security fortress command center, red firewall energy grids, armored vault doors, tactical holo-shields and monitors, intense crimson glow',
};

(async () => {
  if (!hf || !hf.keys || !hf.keys().length) { console.log('[room-bg] no HF keys — aborting'); process.exit(0); }
  let ok = 0;
  for (const [id, desc] of Object.entries(ROOMS)) {
    const fp = path.join(OUT, id + '.png');
    if (fs.existsSync(fp)) { console.log('[room-bg] skip (exists):', id); ok++; continue; }
    try {
      const buf = await hf.generate(desc + STYLE);
      fs.writeFileSync(fp, buf);
      ok++; console.log('[room-bg] ✓', id, '→', fp);
    } catch (e) { console.warn('[room-bg] ✗', id, ':', e.message); }
  }
  console.log(`[room-bg] done — ${ok}/${Object.keys(ROOMS).length} room backdrops ready in ${OUT}`);
})();
