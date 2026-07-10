// Generate DODGEBALL character-selector art via free Pollinations FLUX.
// One vertical (768x1024) portrait per agent, each in a NEON DODGEBALL ATHLETIC UNIFORM
// in their signature colors, matching their real face/aesthetic.
// Saved UPPERCASE to public/assets/games/dodgeball/chars/<AGENT>.png
// Sequential, skip-if-exists, retries on failure (via pollinate.js).
// Run: node scripts/gen-dodgeball-chars.js           (all)
//      node scripts/gen-dodgeball-chars.js SHADDAI    (only some)
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'dodgeball', 'chars');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'dynamic action pose, neon arcade video-game character art, vibrant rim lighting, ' +
  'highly detailed symmetric face, clean linework, cinematic hero illustration, ' +
  'sporty athletic build, plain dark gradient background, ' +
  'no text, no words, no letters, no logos, no watermark, no ui';

// Each agent in a NEON DODGEBALL ATHLETIC UNIFORM in their signature colors, real face/aesthetic.
const AGENTS = {
  SHADDAI: 'a radiant golden god-king in a glowing neon-gold sleeveless dodgeball athletic uniform with gold armor trim and a bright sunburst halo above his head, holding a glowing gold dodgeball, warm gold energy glow',
  ZEROX:   'a blue-haired anime warrior woman with cyan highlights in a sleek cyan-and-black neon dodgeball athletic jersey and shorts, a katana sheathed on her back, holding a glowing cyan dodgeball, electric cyan energy glow',
  TURTLE:  'a green-haired anime warrior woman with emerald twin-tails in a neon emerald-green dodgeball athletic jersey and shorts, an emerald warrior mace at her side, holding a glowing green dodgeball, bright green energy glow',
  NEXUS:   'a dark-blue cyber-armored figure with a glowing electric-blue circuitry visor helmet in a navy-and-electric-blue neon dodgeball athletic uniform laced with glowing circuit lines, holding a glowing blue dodgeball, electric blue energy glow',
  ORACLE:  'a hooded violet sorceress in a purple neon dodgeball athletic jersey worn over flowing violet robes, faint purple magic swirling, holding a glowing violet dodgeball, mystical purple energy glow',
  PIKADON: 'a crimson horned knight in crimson-and-black armored neon dodgeball athletic uniform with a red horned helmet, holding a glowing red dodgeball, deep crimson energy glow',
  QUILL:   'a silver-haired mage youth with a soft pink glow in a silver-and-pink neon dodgeball athletic jersey and shorts, a glowing pink feather quill accent, holding a glowing pink dodgeball, soft pink energy glow',
};

const only = process.argv.slice(2).map(s => s.toUpperCase());
const keys = only.length ? Object.keys(AGENTS).filter(k => only.includes(k)) : Object.keys(AGENTS);

(async () => {
  let seed = 7200;
  for (const id of keys) {
    const dest = path.join(OUT, `${id}.png`);
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
    await new Promise(r => setTimeout(r, 900));
  }
  console.log('Done ->', OUT);
})();
