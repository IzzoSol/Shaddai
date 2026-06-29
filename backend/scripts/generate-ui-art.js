#!/usr/bin/env node
/* Generate future-forward UI background art via HF FLUX → public/assets/ui/*.png.
 * Dark, atmospheric, premium — built to sit BEHIND text (overlays keep it readable).
 * Run: node backend/scripts/generate-ui-art.js [id ...]   (no args = all)
 */
const fs = require('fs'), path = require('path');
let hf; try { hf = require('../lib/hf-keys'); } catch { console.error('hf-keys missing'); process.exit(1); }
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'ui');
fs.mkdirSync(OUT, { recursive: true });

// Shared style spine → one cohesive "SHADDAI future-forward" aesthetic across pages.
const STYLE = ', cinematic, ultra detailed, volumetric light, depth, dark atmospheric background suitable as a UI backdrop, premium high-tech aesthetic, no text, no watermark, no people, 8k, sharp';
const ART = {
  // pricing / landing hero — awe + scale
  'hero-nexus':  'a vast future-forward holographic data-cathedral floating in deep obsidian space, glowing cyan and molten-gold energy lattices, iridescent sacred-geometry structures, soft volumetric god-rays, elegant and minimal negative space at the top',
  // AURA monitor — flowing data/energy
  'aura-field':  'flowing rivers of luminous teal and emerald data particles streaming through dark space, faint neural-network constellations, glassy reflective currents, minimalist, mostly dark with glow concentrated lower-right',
  // the Arcane Foundry forge — molten gold + ember
  'forge-ember': 'molten gold and ember light swirling inside a dark obsidian void, concentric rings of fire and sacred geometry, arcane sci-fi forge atmosphere, dramatic rim glow, deep blacks',
  // generic deep grid — reusable section backdrop
  'grid-deep':   'an infinite dark neon grid receding to a distant horizon, subtle cyan glow lines, atmospheric haze, minimalist retro-futurism, vast empty space, deep black sky',
};

(async () => {
  const only = process.argv.slice(2).filter(a => ART[a]);
  const ids = only.length ? only : Object.keys(ART);
  for (const id of ids) {
    try {
      console.log(id, '— FLUX…');
      const png = await hf.generate(ART[id] + STYLE);
      fs.writeFileSync(path.join(OUT, id + '.png'), png);
      console.log('  saved', id + '.png', (fs.statSync(path.join(OUT, id + '.png')).size / 1024 | 0) + 'KB');
    } catch (e) { console.log('  FAIL', id, e.message); }
  }
  console.log('UI ART DONE');
})();
