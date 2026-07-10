// Generate STARFALL character-selector art via HF FLUX.
// Per agent: a VERTICAL "pilot standing next to their ship" portrait + a square thumbnail.
// Plus 2 cinematic space backgrounds (start / end screens).
// Sequential (one at a time), token-rotating on 402/403/429, retry on 503.
// Run: node scripts/gen-starfall-art.js            (all)
//      node scripts/gen-starfall-art.js shaddai bg (only some keys)
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'starfall');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'vibrant anime sci-fi character art, dramatic rim lighting, highly detailed symmetric face, ' +
  'clean linework, cinematic hero illustration, glossy hard-surface starfighter, plain dark gradient background, ' +
  'no text, no words, no letters, no logos, no watermark, no ui';

// pilot + their ship, matching each agent's face & signature energy color
const AGENTS = {
  shaddai: 'a radiant golden god-king pilot in ornate divine gold power-armor spacesuit with a sunburst halo crown, ' +
    'standing beside a majestic golden starfighter with sunburst wings, warm gold energy glow',
  nexus: 'a sleek dark-blue cybernetic armored pilot in a full glowing electric-blue visor helmet with circuitry lines, ' +
    'standing beside an angular teal-and-chrome cyber starfighter, electric blue energy glow',
  zerox: 'a blue-haired anime pilot woman with space-bun braids in a sleek black flight bodysuit laced with glowing cyan energy lines, ' +
    'standing beside a fast sapphire-blue interceptor starfighter, cyan energy glow',
  oracle: 'a hooded violet sorceress pilot in a flowing purple robe flight suit conjuring faint purple magic, ' +
    'standing beside a mystical violet starfighter with a crystal core, purple energy glow',
  turtle: 'a green-haired anime pilot woman with long twin-tails in a neon emerald flight suit, ' +
    'standing beside an emerald-green agile starfighter with green thrusters, green energy glow',
  quill: 'a silver-haired mage youth pilot in purple-and-white flowing flight robes with a glowing pink feather, ' +
    'standing beside a white-and-pink swift scout starfighter, soft pink energy glow',
  pikadon: 'a crimson-and-black armored knight pilot with a horned helmet and a red diamond shield, ' +
    'standing beside a heavy crimson armored gunship starfighter, deep red energy glow',
};

const jobs = [];
for (const [id, desc] of Object.entries(AGENTS)) {
  jobs.push({ file: `${id}-select.png`, w: 768, h: 1024,
    prompt: `Full-body vertical portrait of ${desc}. ${STYLE}` });
  jobs.push({ file: `${id}-thumb.png`, w: 512, h: 512,
    prompt: `Close-up face-and-shoulders portrait of ${desc.split(',')[0]}. ${STYLE}` });
}
// cinematic backgrounds
jobs.push({ file: 'bg-start.png', w: 1024, h: 768,
  prompt: `Cinematic deep-space vista, glowing cyan and blue nebula, drifting crystalline asteroids, ` +
    `distant galaxy, star field, epic sci-fi. ${STYLE}` });
jobs.push({ file: 'bg-win.png', w: 1024, h: 768,
  prompt: `Cinematic victorious dawn over a bright golden nebula in deep space, radiant sunburst light, ` +
    `sparkling stars, triumphant epic sci-fi. ${STYLE}` });
jobs.push({ file: 'bg-lose.png', w: 1024, h: 768,
  prompt: `Cinematic ominous deep-space debris field, dark crimson nebula, shattered asteroids, ` +
    `smoldering red glow, somber epic sci-fi. ${STYLE}` });

const only = process.argv.slice(2).map(s => s.toLowerCase());
const run = only.length ? jobs.filter(j => only.some(o => j.file.startsWith(o))) : jobs;

(async () => {
  let seed = 4100;
  for (const j of run) {
    const dest = path.join(OUT, j.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 3000) { console.log(`  ${j.file} ... skip (exists)`); continue; }
    process.stdout.write(`  ${j.file} ... `);
    try {
      const buf = await genPollinations(j.prompt, j.w, j.h, seed++);
      fs.writeFileSync(dest, buf);
      console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`FAIL ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  console.log('Done ->', OUT);
})();
