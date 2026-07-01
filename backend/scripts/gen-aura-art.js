// Generates the AURA monitor's FLUX backdrop via HuggingFace.
//   node backend/scripts/gen-aura-art.js
const fs = require('fs');
const path = require('path');
const { generate } = require('../lib/hf-keys.js');

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'ui');
fs.mkdirSync(OUT, { recursive: true });

const JOBS = [
  { file: 'aura-field.png',
    prompt: 'abstract dark energy field, flowing ribbons of luminous cyan and emerald-green data light, aurora of glowing particle streams and fine neural filaments arcing across a near-black void, volumetric bloom, deep teal atmosphere, sense of intelligence flowing, cinematic, ultra-detailed, high contrast, 8k wallpaper' },
  { file: 'aura-orb.png',
    prompt: 'a single radiant orb of condensed cyan and green energy floating in black space, concentric glowing rings, electric filaments, soft volumetric halo, dark moody background, futuristic AI core, cinematic product render, centered, ultra-detailed' },
];

(async () => {
  for (const j of JOBS) {
    process.stdout.write(`generating ${j.file} … `);
    try {
      const buf = await generate(j.prompt);
      fs.writeFileSync(path.join(OUT, j.file), buf);
      console.log(`saved ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  console.log('done.');
})();
