// Generate per-agent THEMED UNIFORM character portraits for the sport games via free Pollinations FLUX.
// Vertical 768x1024, saved to public/assets/games/<game>/chars/<AGENT>.png. Skip-if-exists.
// Run: node scripts/gen-sport-chars.js               (all games)
//      node scripts/gen-sport-chars.js hoops soccer  (only some games)
const fs = require('fs');
const path = require('path');
const { genPollinations } = require('./pollinate');

const LOOK = {
  SHADDAI: 'SHADDAI a radiant golden god-king with sunburst halo crown and glowing amber eyes, gold-and-white',
  NEXUS:   'NEXUS a dark-blue cybernetic athlete with a glowing electric-blue visor and circuitry lines',
  ORACLE:  'ORACLE a violet-haired mystic woman with hooded purple aura and glowing violet eyes',
  ZEROX:   'ZEROX a blue-haired anime woman with space-bun braids and glowing cyan energy accents',
  TURTLE:  'TURTLE a green-haired anime woman with long twin-tails and glowing emerald energy accents',
  QUILL:   'QUILL a silver-haired youth with soft glowing pink energy accents',
  PIKADON: 'PIKADON a crimson-armored fighter with a horned helmet motif and glowing red accents',
};

const GAMES = {
  football:  { theme: 'wearing a futuristic neon American-football uniform with shoulder pads and helmet in their signature colors', accent: 'red neon stadium light' },
  hoops:     { theme: 'wearing a neon basketball jersey and shorts in their signature colors', accent: 'orange neon court light' },
  dodgeball: { theme: 'wearing a sleek neon dodgeball athletic uniform in their signature colors, holding a glowing dodgeball', accent: 'hot-pink neon arena light' },
  soccer:    { theme: 'wearing a neon soccer kit jersey and shorts with cleats in their signature colors', accent: 'golden neon stadium light' },
};

const STYLE = 'full-body vertical character portrait, dynamic athletic action pose, dramatic rim lighting, ' +
  'highly detailed symmetric face, clean anime linework, neon arcade illustration, plain dark gradient background, ' +
  'high detail, no text, no words, no letters, no logos, no watermark';

const only = process.argv.slice(2).map(s => s.toLowerCase());
const games = only.length ? Object.keys(GAMES).filter(g => only.includes(g)) : Object.keys(GAMES);

(async () => {
  let seed = 3300, ok = 0, fail = 0;
  for (const g of games) {
    const dir = path.join(__dirname, '..', 'public', 'assets', 'games', g, 'chars');
    fs.mkdirSync(dir, { recursive: true });
    const gm = GAMES[g];
    for (const [key, look] of Object.entries(LOOK)) {
      const out = path.join(dir, `${key}.png`);
      if (fs.existsSync(out) && fs.statSync(out).size > 3000) { console.log(`  ${g}/${key} ... skip`); ok++; continue; }
      process.stdout.write(`  ${g}/${key} ... `);
      const prompt = `${look}, ${gm.theme}. ${gm.accent}. ${STYLE}`;
      try {
        const buf = await genPollinations(prompt, 768, 1024, seed++);
        fs.writeFileSync(out, buf);
        console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
        ok++;
      } catch (e) { console.log(`FAIL ${e.message}`); fail++; }
      await new Promise(r => setTimeout(r, 800));
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
})();
