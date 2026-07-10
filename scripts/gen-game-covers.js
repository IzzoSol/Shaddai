// Generate SHADDAI arcade game covers via HF FLUX — featuring the real agents.
// Run: node scripts/gen-game-covers.js  (or pass keys to regen only some: node scripts/gen-game-covers.js hoops soccer)
const fs = require('fs');
const path = require('path');

const TOKENS = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backend', 'data', 'runtime-keys.json'), 'utf8'));
    return j.HF_TOKENS || [j.HF_TOKEN];
  } catch { return []; }
})();

const MODEL = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'covers');
fs.mkdirSync(OUT, { recursive: true });

// Signature agent descriptors so the heroes read as the SHADDAI roster.
const A = {
  SHADDAI:  'SHADDAI a radiant golden god-king in ornate divine gold armor with a sunburst halo crown and flowing white-gold cape',
  ZEROX:    'ZEROX a blue-haired anime warrior woman with space-bun braids in a sleek black bodysuit laced with glowing cyan energy lines wielding a glowing cyan katana',
  TURTLE:   'TURTLE a green-haired anime warrior woman with long twin-tails in a neon emerald outfit radiating green energy',
  NEXUS:    'NEXUS a sleek dark-blue cybernetic armored hero in a full visor helmet glowing with electric-blue circuitry',
  ORACLE:   'ORACLE a hooded violet sorceress in flowing purple robes conjuring glowing purple magic',
  PIKADON:  'PIKADON a crimson-and-black armored knight with a horned helmet, glowing red warhammer and a large red diamond shield',
  QUILL:    'QUILL a silver-haired mage youth in purple-and-white flowing robes casting a glowing pink feather spell',
};

const STYLE = 'vibrant retro arcade cabinet cover art, bold dynamic anime action illustration, dramatic rim lighting, ' +
  'highly detailed symmetric faces, clean linework, cinematic hero poster, epic composition, high detail, ' +
  'no text, no words, no letters, no logos, no watermark';

const COVERS = [
  { key: 'football',       prompt: `Neon American football arcade box art. ${A.PIKADON}, ${A.ZEROX} and ${A.SHADDAI} as futuristic gridiron athletes in glowing armor charging across a red-lit stadium field at night, one carrying a glowing football, crimson energy, floodlights. ${STYLE}, dominant deep red and black palette` },
  { key: 'hoops',          prompt: `Neon basketball arcade box art. ${A.TURTLE} and ${A.ZEROX} leaping for an epic slam dunk with a glowing orange basketball on a vibrant neon night court, electric orange energy trails, glowing hoop, city skyline. ${STYLE}, dominant orange and amber palette` },
  { key: 'starfall',       prompt: `Neon space shooter arcade box art. ${A.NEXUS} and ${A.SHADDAI} piloting sleek chrome-and-cyan starfighters blasting lasers through a field of crystalline asteroids and alien ships, glowing nebula. ${STYLE}, dominant cyan and electric blue palette` },
  { key: 'dodgeball',      prompt: `Neon dodgeball arena arcade box art. ${A.TURTLE}, ${A.ORACLE} and ${A.QUILL} dodging and hurling glowing pink energy dodgeballs mid-air, electric pink sparks, motion blur. ${STYLE}, dominant hot pink and magenta palette` },
  { key: 'xto-adventure',  prompt: `Neon action-RPG adventure arcade box art. ${A.TURTLE} and ${A.QUILL} adventuring through a lush glowing neon-jungle ruin with ancient glowing portals and mystical emerald energy. ${STYLE}, dominant emerald green palette` },
  { key: 'shaddai-realms', prompt: `Epic strategy-conquest arcade box art. ${A.SHADDAI} and ${A.PIKADON} commanding a vast empire of glowing golden citadels and marching armies at golden hour, war banners. ${STYLE}, dominant gold and amber palette` },
  { key: 'soccer',         prompt: `Neon soccer stadium arcade box art. ${A.ZEROX} and ${A.TURTLE} striking a glowing golden soccer ball mid bicycle-kick on a vibrant neon pitch at night, floodlights, roaring crowd. ${STYLE}, dominant gold and yellow palette` },
];

const only = process.argv.slice(2);
const jobs = only.length ? COVERS.filter(c => only.includes(c.key)) : COVERS;

async function gen(prompt, tokenIdx = 0, tries = 0) {
  const token = TOKENS[tokenIdx % TOKENS.length];
  const res = await fetch(MODEL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt, parameters: { width: 768, height: 1024 } }),
  });
  if (res.status === 200) return Buffer.from(await res.arrayBuffer());
  const msg = await res.text();
  if ((res.status === 402 || res.status === 403 || res.status === 429) && tokenIdx < TOKENS.length - 1) {
    return gen(prompt, tokenIdx + 1, tries);
  }
  if (res.status === 503 && tries < 4) {
    await new Promise(r => setTimeout(r, 4000));
    return gen(prompt, tokenIdx, tries + 1);
  }
  throw new Error(`HTTP ${res.status}: ${msg.slice(0, 160)}`);
}

(async () => {
  for (const c of jobs) {
    process.stdout.write(`  ${c.key} ... `);
    try {
      const buf = await gen(c.prompt);
      fs.writeFileSync(path.join(OUT, `${c.key}.png`), buf);
      console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`FAIL ${e.message}`);
    }
  }
  console.log('Done ->', OUT);
})();
