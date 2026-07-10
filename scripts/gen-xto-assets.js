// Generate XTO Adventure assets via HF FLUX — clone-flavored RPG portraits of the 7 agents,
// dialog thumbnails, the villain Adragona, and cutscene START/END backdrops.
// Run: node scripts/gen-xto-assets.js            (all)
//      node scripts/gen-xto-assets.js SHADDAI     (only some by key)
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const BASE = path.join(__dirname, '..', 'public', 'assets', 'games', 'xto');
const CHARS = path.join(BASE, 'chars');
const THUMBS = path.join(BASE, 'thumbs');
const SCENES = path.join(BASE, 'scenes');
[CHARS, THUMBS, SCENES].forEach(d => fs.mkdirSync(d, { recursive: true }));

// Real-face descriptors, re-skinned as XTO adventurers (RPG outfits, kept aesthetics).
const LOOK = {
  SHADDAI: 'a radiant golden god-king, ornate divine gold plate armor, sunburst halo crown, flowing white-and-gold cape, glowing amber eyes',
  NEXUS:   'a dark-blue cyber-armored knight, full visor helmet glowing with electric-blue circuitry, sleek techno-plate armor',
  ORACLE:  'a hooded violet sorceress, flowing deep-purple robes, glowing purple runes swirling around her hands, mystic staff',
  ZEROX:   'a blue-haired anime warrior woman with space-bun braids, sleek black bodysuit laced with glowing cyan energy lines, wielding a glowing cyan katana',
  TURTLE:  'a green-haired anime warrior woman with long twin-tails, neon emerald battle outfit, wielding a glowing emerald war-mace, radiating green energy',
  QUILL:   'a silver-haired young mage, purple-and-white flowing scholar robes, casting a glowing pink feather-quill spell, gentle luminous aura',
  PIKADON: 'a crimson-and-black armored knight, horned battle helmet, glowing red warhammer and a large red diamond shield',
};

// Adragona — the dragon-lord villain, consistent across every image she appears in.
const ADRAGONA = 'ADRAGONA a terrifying female dragon-sorceress warlord, obsidian-black dragon-scale armor edged with molten crimson, ' +
  'huge tattered dragon wings, curved black horns, glowing red draconic eyes, a spined tail, wielding a serrated obsidian blade wreathed in dark flame';

const CHAR_STYLE = 'full-body vertical character portrait, heroic RPG adventurer pose, dramatic rim lighting, ' +
  'highly detailed symmetric face, clean anime linework, dark neon fantasy background, cinematic, high detail, ' +
  'no text, no words, no letters, no logos, no watermark';
const THUMB_STYLE = 'head-and-shoulders portrait bust, facing forward, expressive detailed symmetric face, ' +
  'clean anime linework, glowing rim light, simple dark background, high detail, ' +
  'no text, no words, no letters, no logos, no watermark';

const JOBS = [];
for (const [key, look] of Object.entries(LOOK)) {
  JOBS.push({ dir: CHARS, key, w: 768, h: 1024, prompt: `${look}. ${CHAR_STYLE}` });
  JOBS.push({ dir: THUMBS, key, w: 512, h: 512, prompt: `${look}. ${THUMB_STYLE}` });
}
// Adragona portrait + thumb
JOBS.push({ dir: CHARS, key: 'ADRAGONA', w: 768, h: 1024, prompt: `${ADRAGONA}. ${CHAR_STYLE}, dominant black and crimson palette` });
JOBS.push({ dir: THUMBS, key: 'ADRAGONA', w: 512, h: 512, prompt: `${ADRAGONA}. ${THUMB_STYLE}, dominant black and crimson palette` });
// Cutscene backdrops
JOBS.push({ dir: SCENES, key: 'intro', w: 1280, h: 720, prompt:
  `Epic cinematic wide shot: ${ADRAGONA} looming over a shattered glowing forge, spinning up an army of faceless cloned neon warriors in glass vats, crimson lightning, dark fantasy citadel. ${CHAR_STYLE.replace('vertical character portrait, heroic RPG adventurer pose','')} dominant black crimson and cyan palette` });
JOBS.push({ dir: SCENES, key: 'victory', w: 1280, h: 720, prompt:
  `Epic cinematic wide shot: a triumphant band of glowing neon anime heroes standing over the crumbling armor of ${ADRAGONA} at dawn, the reforged glowing forge behind them, hopeful golden and emerald light. ${CHAR_STYLE.replace('vertical character portrait, heroic RPG adventurer pose','')} dominant gold emerald and cyan palette` });

const only = process.argv.slice(2).map(s => s.toUpperCase());
const jobs = only.length ? JOBS.filter(j => only.includes(j.key.toUpperCase())) : JOBS;

(async () => {
  let ok = 0, fail = 0, seed = 7200;
  for (const j of jobs) {
    const out = path.join(j.dir, `${j.key}.png`);
    // skip ones already generated (re-run only fills gaps)
    if (!only.length && fs.existsSync(out) && fs.statSync(out).size > 3000) {
      console.log(`  ${path.basename(j.dir)}/${j.key} ... SKIP (exists)`);
      ok++; continue;
    }
    process.stdout.write(`  ${path.basename(j.dir)}/${j.key} ... `);
    try {
      const buf = await genPollinations(j.prompt, j.w, j.h, seed++);
      fs.writeFileSync(out, buf);
      console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
      ok++;
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(`\nDone. ok=${ok} fail=${fail} -> ${BASE}`);
})();
