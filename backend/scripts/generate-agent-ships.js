// Generates the 7 agent ship sprites for SIGIL STORM (and reusable elsewhere)
// via the project's free HF FLUX.1-schnell key pool. Saves PNGs to
// public/assets/games/ships/{AGENT}.png  — top-down, black bg for additive blend.
const fs = require('fs');
const path = require('path');
const hf = require('../lib/hf-keys.js');

const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'games', 'ships');
fs.mkdirSync(OUT, { recursive: true });

// shared style keeps all 7 visually consistent (arcade shmup, black bg, neon)
const STYLE = ', top-down centered spaceship, symmetrical, arcade shoot-em-up fighter craft, ' +
  'pure solid black background, strong neon rim glow, clean vector-like sci-fi, ' +
  'high detail, game sprite, no text, no watermark';

const AGENTS = [
  ['SHADDAI',  'a regal golden flagship with a glowing crown motif and radiant gold energy'],
  ['NEXUS',    'a cyan cybernetic architect fighter, sharp geometric hull, glowing blue circuitry'],
  ['ORACLE',   'a violet mystic starship with a central all-seeing eye and constellation patterns'],
  ['ZEROX',    'an aggressive orange trader interceptor, angular blades, holographic market glow'],
  ['TURTLE',   'a magenta creative artist ship, flowing artistic curves, paint-splash energy trails'],
  ['QUILL',    'an elegant gold scribe vessel shaped like a feathered quill with scroll-wing fins'],
  ['PIKADON',  'a red armored guardian gunship, heavy shield plating, alert warning glow'],
];

(async () => {
  const only = process.argv[2]; // optional: generate a single agent by name
  const list = only ? AGENTS.filter(a => a[0] === only.toUpperCase()) : AGENTS;
  console.log('keys:', hf.keys().length, '| generating', list.length, 'ship(s)');
  let ok = 0;
  for (const [name, desc] of list) {
    const t0 = Date.now();
    try {
      const buf = await hf.generate(desc + STYLE);
      const f = path.join(OUT, name + '.png');
      fs.writeFileSync(f, buf);
      console.log(`  ${name}: ${(buf.length/1024).toFixed(0)}KB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      ok++;
    } catch (e) {
      console.log(`  ${name}: FAIL ${e.code||''} ${e.message}`);
    }
  }
  console.log(`done: ${ok}/${list.length}`);
})();
