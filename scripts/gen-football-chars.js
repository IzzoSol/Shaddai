// Generate GRIDIRON (football) character-selector art via FREE Pollinations FLUX.
// Per agent: ONE vertical (768x1024) portrait wearing a football uniform/armor in
// their signature colors, matching their real face/aesthetic.
// Saved to public/assets/games/football/chars/<AGENT>.png (uppercase agent id).
// Sequential, skip-if-exists, helper retries on 429/503.
// Run: node scripts/gen-football-chars.js            (all)
//      node scripts/gen-football-chars.js shaddai     (only some)
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'football', 'chars');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'neon arcade sci-fi character art, dramatic rim lighting, highly detailed symmetric face, ' +
  'clean linework, cinematic hero illustration, glossy futuristic gridiron football pads and armor, ' +
  'dynamic action pose holding a football, plain dark gradient background, ' +
  'no text, no words, no letters, no numbers, no logos, no watermark, no ui';

// Each agent in a themed FOOTBALL uniform/armor, matching face + signature colors.
const AGENTS = {
  SHADDAI: 'a radiant golden god-king quarterback in ornate divine gold football power-armor and shoulder pads ' +
    'with a glowing sunburst halo above his helmet, warm gold energy glow',
  NEXUS: 'a sleek dark-blue cybernetic armored linebacker in a full glowing electric-blue visor football helmet ' +
    'with circuitry lines across chrome-and-teal pads, electric blue energy glow',
  ORACLE: 'a hooded violet sorceress wide receiver in a flowing purple robe over glowing amethyst football pads, ' +
    'faint purple magic swirling, purple energy glow',
  ZEROX: 'a blue-haired anime warrior girl running back with space-bun braids in sleek black-and-sapphire football pads ' +
    'laced with glowing cyan energy lines, a katana slung on her back, cyan energy glow',
  TURTLE: 'a green-haired anime warrior girl receiver with long twin-tails in neon emerald football pads and shoulder armor, ' +
    'green thruster glow, emerald green energy glow',
  QUILL: 'a silver-haired mage youth kicker in white-and-purple flowing football robes with a glowing pink feather crest ' +
    'on the helmet, soft pink energy glow',
  PIKADON: 'a crimson-and-black armored knight defensive lineman with a horned football helmet and a red diamond shield ' +
    'on one arm, heavy crimson armor plating, deep red energy glow',
};

const only = process.argv.slice(2).map(s => s.toUpperCase());
const ids = only.length ? Object.keys(AGENTS).filter(k => only.includes(k)) : Object.keys(AGENTS);

(async () => {
  let seed = 7200;
  for (const id of ids) {
    const dest = path.join(OUT, id + '.png');
    if (fs.existsSync(dest) && fs.statSync(dest).size > 3000) { console.log(`  ${id}.png ... skip (exists)`); continue; }
    process.stdout.write(`  ${id}.png ... `);
    try {
      const prompt = `Full-body vertical portrait of ${AGENTS[id]}. ${STYLE}`;
      const buf = await genPollinations(prompt, 768, 1024, seed++);
      fs.writeFileSync(dest, buf);
      console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`FAIL ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  console.log('Done ->', OUT);
})();
