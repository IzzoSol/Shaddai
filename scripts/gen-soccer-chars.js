// Generate SHADDAI SOCCER character-selector art via FREE Pollinations FLUX (no HF, no key).
// Per agent: one VERTICAL (768x1024) neon soccer-kit portrait, matching their face/aesthetic.
// Saves to public/assets/games/soccer/chars/<AGENT>.png (UPPERCASE).
// Sequential, skip-if-exists, retries on 429/transient (handled inside pollinate.js).
// Run: node scripts/gen-soccer-chars.js            (all)
//      node scripts/gen-soccer-chars.js shaddai turtle
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'soccer', 'chars');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'vibrant neon arcade anime character art, dramatic rim lighting, highly detailed symmetric face, ' +
  'dynamic action soccer pose, glowing neon soccer jersey and shorts and cleats, esports uniform, ' +
  'clean linework, cinematic hero illustration, plain dark gradient background, ' +
  'no text, no words, no letters, no numbers, no logos, no watermark, no ui';

// Each: a soccer kit in the agent's signature color, matching their canonical face/aesthetic.
const AGENTS = {
  SHADDAI: 'a radiant golden god-king with ornate divine gold armor plating over a glowing golden neon soccer kit, ' +
    'a sunburst halo crown above his head, warm gold energy aura, majestic captain',
  ZEROX:   'a blue-haired anime warrior woman with space-bun braids in a sleek glowing cyan neon soccer kit, ' +
    'a cyan katana sheathed on her back, electric cyan energy aura, confident striker',
  TURTLE:  'a green-haired anime warrior woman with long hair in a glowing emerald-green neon soccer kit, ' +
    'an emerald war-mace strapped to her back, green energy aura, powerful forward',
  NEXUS:   'a dark-blue cyber-armored figure with a glowing electric-blue circuitry visor helmet, wearing a ' +
    'deep-blue neon soccer kit laced with blue circuit lines, electric blue energy aura, tactical midfielder',
  ORACLE:  'a hooded violet sorceress in a flowing purple-hooded neon soccer kit, faint purple magic swirling around her, ' +
    'glowing violet eyes, purple energy aura, graceful playmaker',
  PIKADON: 'a crimson-and-black horned knight in red armor plating over a glowing crimson neon soccer kit, ' +
    'a red horned helmet, deep red energy aura, fierce defender',
  QUILL:   'a silver-haired mage youth in a white-and-pink neon soccer kit with flowing accents, a glowing pink feather quill, ' +
    'soft pink energy aura, agile winger',
};

const only = process.argv.slice(2).map(s => s.toUpperCase());
const entries = Object.entries(AGENTS).filter(([id]) => !only.length || only.includes(id));

(async () => {
  let seed = 5200;
  for (const [id, desc] of entries) {
    const dest = path.join(OUT, `${id}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 3000) { console.log(`  ${id}.png ... skip (exists)`); continue; }
    process.stdout.write(`  ${id}.png ... `);
    const prompt = `Full-body vertical portrait of ${desc}. ${STYLE}`;
    try {
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
