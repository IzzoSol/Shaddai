// Generates a themed HF FLUX room backdrop per agent → public/assets/rooms/<AGENT>.png
//   node backend/scripts/gen-room-art.js
const fs = require('fs');
const path = require('path');
const { generate } = require('../lib/hf-keys.js');

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'rooms');
fs.mkdirSync(OUT, { recursive: true });

const SUFFIX = ' — private sanctum interior of a SHADDAI AI agent, wide-angle empty room, no people, cinematic video-game environment art, volumetric light, ultra-detailed, 16:9';
const ROOMS = {
  SHADDAI: 'opulent celestial command sanctum, golden sacred-geometry architecture, floating holographic thrones, warm gold and deep obsidian, godlike orchestrator chamber',
  NEXUS:   'sleek server-architect laboratory, glowing cyan circuit walls, floating holographic code and schematics, cool blue neon, clean technical chamber',
  ZEROX:   'luxurious wealth trading sanctum, emerald green and gold, floating candlestick charts and ticker holograms, opulent financier office',
  ORACLE:  'mystical research observatory, deep violet, floating constellations of data, ancient-futuristic seer chamber with glowing orbs and star maps',
  TURTLE:  'vibrant creative design atelier, warm colorful neon, floating art canvases and 3D sculpts, playful futuristic studio',
  QUILL:   'grand futuristic library scriptorium, warm parchment and ink tones, floating glowing books and luminous quills, scholarly chamber',
  PIKADON: 'high-security fortress command room, red alert lighting, shielded vault walls and tactical holo-displays, dark steel and crimson',
};

(async () => {
  for (const [agent, prompt] of Object.entries(ROOMS)) {
    process.stdout.write(`generating ${agent} room … `);
    try {
      const buf = await generate(prompt + SUFFIX);
      fs.writeFileSync(path.join(OUT, agent + '.png'), buf);
      console.log(`saved ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  console.log('done — rooms in public/assets/rooms/');
})();
