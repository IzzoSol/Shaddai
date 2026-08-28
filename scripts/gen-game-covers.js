// Generate SHADDAI arcade game covers via HF FLUX — featuring the real agents.
// Run: node scripts/gen-game-covers.js  (or pass keys to regen only some: node scripts/gen-game-covers.js hoops soccer)
const fs = require('fs');
const path = require('path');

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
  QUILL:    'QUILL a silver-haired mage youth in glowing orange-and-white flowing robes casting a radiant orange feather spell, warm amber energy',
};

const STYLE = 'vibrant retro arcade cabinet cover art, bold dynamic anime action illustration, dramatic rim lighting, ' +
  'highly detailed symmetric faces, clean linework, cinematic hero poster, epic composition, high detail, ' +
  'no text, no words, no letters, no logos, no watermark';

const COVERS = [
  { key: 'football',       prompt: `Neon American football arcade box art. ${A.PIKADON}, ${A.ZEROX} and ${A.SHADDAI} as futuristic gridiron athletes in glowing armor charging across a red-lit stadium field at night, one carrying a glowing football, crimson energy, floodlights. ${STYLE}, dominant deep red and black palette` },
  { key: 'hoops',          prompt: `Neon basketball arcade box art. ${A.TURTLE} and ${A.ZEROX} leaping for an epic slam dunk with a glowing orange basketball on a vibrant neon night court, electric orange energy trails, glowing hoop, city skyline. ${STYLE}, dominant orange and amber palette` },
  { key: 'starfall',       prompt: `Neon space shooter arcade box art. ${A.NEXUS} and ${A.SHADDAI} piloting sleek chrome-and-cyan starfighters blasting lasers through a field of crystalline asteroids and alien ships, glowing nebula. ${STYLE}, dominant cyan and electric blue palette` },
  { key: 'dodgeball',      prompt: `Neon dodgeball arena arcade box art. ${A.TURTLE}, ${A.ORACLE} and ${A.QUILL} dodging and hurling glowing pink energy dodgeballs mid-air, electric pink sparks, motion blur. ${STYLE}, dominant hot pink and magenta palette` },
  // ── Blackjack — flagship main game, ALL SEVEN agents at a luxury casino table ──
  { key: 'blackjack',      prompt: `Luxurious high-roller casino arcade box art, opulent VIP card table scene. All seven heroes gathered around a lavish green-felt blackjack table under a golden art-deco chandelier: ${A.SHADDAI} as the elegant dealer dealing glowing cards, with ${A.ZEROX}, ${A.TURTLE}, ${A.NEXUS}, ${A.ORACLE}, ${A.PIKADON} and ${A.QUILL} seated as players holding fanned playing cards, stacks of glowing gold and neon chips, an ace and king of spades, floating suits (spades hearts diamonds clubs) sparkling in the air, champagne, velvet and gold trim, dramatic cinematic casino lighting. ${STYLE}, opulent emerald green gold and black palette, luxury casino grandeur` },
  { key: 'xto-adventure',  prompt: `Epic neon action-RPG adventure arcade box art, cinematic key visual. ${A.TURTLE} and ${A.QUILL} as heroic adventurers mid-battle deep in a vast glowing neon-jungle temple, ancient runic portals blazing with mystical emerald energy, floating stone platforms, glowing vines, a colossal ruined god-statue behind them, magical particles, epic scale and depth. ${STYLE}, dominant emerald green and teal palette with warm orange accents` },
  { key: 'shaddai-realms', prompt: `Grand epic strategy-conquest arcade box art, sweeping cinematic vista. ${A.SHADDAI} and ${A.PIKADON} commanding a vast empire of towering glowing golden citadels, sprawling armies and war banners marching across mountains at golden hour, dramatic sun rays, floating fortresses, monumental scale. ${STYLE}, dominant radiant gold and amber palette, majestic and grandiose` },
  { key: 'soccer',         prompt: `Explosive neon soccer stadium arcade box art, dynamic action key visual. ${A.ZEROX} and ${A.TURTLE} striking a blazing golden soccer ball in a mid-air bicycle-kick on a vibrant neon pitch at night, packed roaring stadium, brilliant floodlights, streaking energy trails, confetti and sparks, dramatic low camera angle. ${STYLE}, dominant electric gold and lime-green palette, high-energy stadium spectacle` },
];

const only = process.argv.slice(2);
const jobs = only.length ? COVERS.filter(c => only.includes(c.key)) : COVERS;

// Image generation is delegated to the shared HF key pool, which routes to a
// LIVE inference provider, rotates across keys on depletion, and falls back to
// keyless Pollinations if every key fails. The previous local copy of this
// logic posted to `hf-inference`, a retired provider that returns 410 Gone —
// so it silently fell through to Pollinations on EVERY run and no HF key was
// ever actually used.
const hfPool = require('../backend/lib/hf-keys');

async function gen(prompt) {
  const out = await hfPool.generateSafe(prompt, { width: 768, height: 1024 });
  if (out.buffer) return out.buffer;
  const res = await fetch(out.fallbackUrl);           // keyless free fallback
  if (!res.ok) throw new Error('Pollinations HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4000) throw new Error('Pollinations returned a tiny blob');
  return buf;
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
