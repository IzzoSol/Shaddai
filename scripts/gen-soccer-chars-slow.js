// SLOW/paced variant of gen-soccer-chars for when Pollinations is 429-throttling.
// Long exponential backoff on 429, generous gap between images, skip-if-exists.
// Run: node scripts/gen-soccer-chars-slow.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'games', 'soccer', 'chars');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'vibrant neon arcade anime character art, dramatic rim lighting, highly detailed symmetric face, ' +
  'dynamic action soccer pose, glowing neon soccer jersey and shorts and cleats, esports uniform, ' +
  'clean linework, cinematic hero illustration, plain dark gradient background, ' +
  'no text, no words, no letters, no numbers, no logos, no watermark, no ui';

const AGENTS = {
  SHADDAI: 'a radiant golden god-king with ornate divine gold armor plating over a glowing golden neon soccer kit, a sunburst halo crown above his head, warm gold energy aura, majestic captain',
  ZEROX:   'a blue-haired anime warrior woman with space-bun braids in a sleek glowing cyan neon soccer kit, a cyan katana sheathed on her back, electric cyan energy aura, confident striker',
  TURTLE:  'a green-haired anime warrior woman with long hair in a glowing emerald-green neon soccer kit, an emerald war-mace strapped to her back, green energy aura, powerful forward',
  NEXUS:   'a dark-blue cyber-armored figure with a glowing electric-blue circuitry visor helmet, wearing a deep-blue neon soccer kit laced with blue circuit lines, electric blue energy aura, tactical midfielder',
  ORACLE:  'a hooded violet sorceress in a flowing purple-hooded neon soccer kit, faint purple magic swirling around her, glowing violet eyes, purple energy aura, graceful playmaker',
  PIKADON: 'a crimson-and-black horned knight in red armor plating over a glowing crimson neon soccer kit, a red horned helmet, deep red energy aura, fierce defender',
  QUILL:   'a silver-haired mage youth in a white-and-pink neon soccer kit with flowing accents, a glowing pink feather quill, soft pink energy aura, agile winger',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOne(prompt, w, h, seed){
  // Up to 8 attempts; on 429 back off 15s,20s,25s,... ; on other errors short retry.
  let s = seed;
  for(let a=0; a<8; a++){
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${w}&height=${h}&model=flux&nologo=true&enhance=false&seed=${s}`;
    try {
      const res = await fetch(url);
      if(res.status === 200){
        const buf = Buffer.from(await res.arrayBuffer());
        if(buf.length > 3000) return buf;
        throw new Error(`tiny ${buf.length}b`);
      }
      if(res.status === 429){ await sleep(15000 + a*5000); s++; continue; }
      throw new Error(`HTTP ${res.status}`);
    } catch(e){
      if(a === 7) throw e;
      await sleep(6000); s++;
    }
  }
  throw new Error('exhausted');
}

(async () => {
  let seed = 5200;
  for(const [id, desc] of Object.entries(AGENTS)){
    const dest = path.join(OUT, `${id}.png`);
    if(fs.existsSync(dest) && fs.statSync(dest).size > 3000){ console.log(`  ${id}.png ... skip`); continue; }
    process.stdout.write(`  ${id}.png ... `);
    const prompt = `Full-body vertical portrait of ${desc}. ${STYLE}`;
    try {
      const buf = await fetchOne(prompt, 768, 1024, seed++);
      fs.writeFileSync(dest, buf);
      console.log(`OK ${(buf.length/1024).toFixed(0)}KB`);
    } catch(e){ console.log(`FAIL ${e.message}`); }
    await sleep(8000);
  }
  console.log('Done ->', OUT);
})();
