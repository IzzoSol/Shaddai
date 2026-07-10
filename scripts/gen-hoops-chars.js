// Generate NEON HOOPS themed uniform character-selector art via Pollinations FLUX (FREE, no key).
// Per agent: a VERTICAL 768x1024 portrait in a NEON BASKETBALL JERSEY in their signature colors,
// matching each agent's real face/aesthetic. Saved UPPERCASE to public/assets/games/hoops/chars/<AGENT>.png
// Sequential (one at a time), retry on 429/failure (handled inside genPollinations).
// Run: node scripts/gen-hoops-chars.js            (all)
//      node scripts/gen-hoops-chars.js SHADDAI     (only some)
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'hoops', 'chars');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'vibrant neon arcade anime character art, dramatic rim lighting, highly detailed symmetric face, ' +
  'clean linework, cinematic hero illustration, dynamic athletic basketball pose holding or spinning a glowing basketball, ' +
  'plain dark gradient background, no text, no words, no letters, no logos, no numbers, no watermark, no ui';

// Each agent in a NEON BASKETBALL JERSEY / kit in their signature colors, matching their real face & energy.
const AGENTS = {
  SHADDAI: 'a radiant golden god-king with a glowing sunburst halo crown and ornate divine gold armored shoulders, ' +
    'wearing a luminous golden neon basketball jersey and gold shorts, warm radiant gold energy aura',
  ZEROX: 'a blue-haired anime warrior woman with space-bun braids and a sheathed cyan katana on her back, ' +
    'wearing a sleek cyan-and-black neon basketball jersey with glowing cyan energy lines, electric cyan aura',
  TURTLE: 'a green-haired anime warrior woman with long twin-tails, emerald battle aesthetic, ' +
    'wearing a bright emerald-green neon basketball jersey with glowing green trim, vivid green energy aura',
  NEXUS: 'a dark-blue cybernetic armored figure with a glowing electric-blue circuitry visor helmet, ' +
    'wearing a dark-blue neon basketball jersey laced with glowing blue circuit lines, electric blue energy aura',
  ORACLE: 'a hooded violet sorceress with faint glowing purple runes and a mystic hood, ' +
    'wearing a flowing violet-purple neon basketball jersey, ethereal purple magic aura',
  PIKADON: 'a crimson-and-black horned armored knight with a fierce horned helmet, ' +
    'wearing a deep-crimson-red neon basketball jersey over dark armor plating, blazing red energy aura',
  QUILL: 'a silver-haired mage youth with a glowing pink feather quill accent and soft mystic robes, ' +
    'wearing a silver-and-pink neon basketball jersey, gentle glowing pink energy aura',
};

const jobs = [];
for (const [id, desc] of Object.entries(AGENTS)) {
  jobs.push({ file: `${id}.png`, w: 768, h: 1024,
    prompt: `Full-body vertical portrait of ${desc}. ${STYLE}` });
}

const only = process.argv.slice(2).map(s => s.toUpperCase());
const run = only.length ? jobs.filter(j => only.some(o => j.file.startsWith(o))) : jobs;

(async () => {
  let seed = 7300;
  for (const j of run) {
    const dest = path.join(OUT, j.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 3000) { console.log(`  ${j.file} ... skip (exists)`); continue; }
    process.stdout.write(`  ${j.file} ... `);
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        const buf = await genPollinations(j.prompt, j.w, j.h, seed++);
        fs.writeFileSync(dest, buf);
        console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
        ok = true;
      } catch (e) {
        if (attempt < 4) {
          const wait = 8000 * (attempt + 1); // 8s,16s,24s,32s escalating backoff
          process.stdout.write(`(429 retry in ${wait/1000}s) `);
          await new Promise(r => setTimeout(r, wait));
        } else {
          console.log(`FAIL ${e.message}`);
        }
      }
    }
    await new Promise(r => setTimeout(r, 6000)); // patient spacing to dodge Pollinations 429 wall
  }
  console.log('Done ->', OUT);
})();
