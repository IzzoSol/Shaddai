// Generate fresh ACTION-pose portraits for the 7 SHADDAI agents (character-picker art).
// Portrait 768x1024, saved to public/assets/agents/<CODE>-action.png (OVERWRITE).
// Run: node scripts/gen-agent-action.js   (or regen some: node scripts/gen-agent-action.js SHADDAI ZEROX)
// Models on scripts/gen-game-covers.js — HF FLUX with keyless Pollinations FLUX fallback.
const fs = require('fs');
const path = require('path');

const TOKENS = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backend', 'data', 'runtime-keys.json'), 'utf8'));
    return j.HF_TOKENS || [j.HF_TOKEN];
  } catch { return []; }
})();

const MODEL = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
const OUT = path.join(__dirname, '..', 'public', 'assets', 'agents');
fs.mkdirSync(OUT, { recursive: true });

const STYLE = ', vibrant dynamic anime action illustration, dramatic rim lighting, full body or 3/4 body dynamic hero pose, cinematic, highly detailed, clean dark background with energy glow, no text, no words, no letters, no logos, no watermark';

const AGENTS = [
  { code: 'SHADDAI', prompt: 'SHADDAI a radiant golden god-king in ornate divine gold armor with a sunburst halo crown and flowing white-gold cape, dynamic heroic action pose, raising a glowing hand, divine golden energy' },
  { code: 'ZEROX',   prompt: 'ZEROX a blue-haired anime warrior woman with space-bun braids in a sleek black bodysuit laced with glowing cyan energy lines, mid-action lunging with a glowing cyan katana, electric cyan slash trails' },
  { code: 'ORACLE',  prompt: 'ORACLE a hooded violet sorceress in flowing purple robes, dramatic casting pose conjuring swirling glowing purple cosmic magic, arcane runes orbiting' },
  { code: 'NEXUS',   prompt: 'NEXUS a sleek dark-blue cybernetic armored hero in a full visor helmet glowing with electric-blue circuitry, dynamic combat stance, blue energy surging from fists' },
  { code: 'TURTLE',  prompt: 'TURTLE a green-haired anime warrior woman with long twin-tails in a neon emerald outfit, mid-swing action pose with a glowing emerald spiked ball-and-chain flail, green energy trails' },
  { code: 'QUILL',   prompt: 'QUILL a silver-haired mage youth in glowing orange-and-white flowing robes, dynamic casting pose unleashing a radiant orange feather-spell, warm amber energy swirls' },
  { code: 'PIKADON', prompt: 'PIKADON a crimson-and-black armored knight with a horned helmet, heroic battle stance swinging a glowing red warhammer with a large red diamond shield, crimson sparks' },
];

const only = process.argv.slice(2).map(s => s.toUpperCase());
const jobs = only.length ? AGENTS.filter(a => only.includes(a.code)) : AGENTS;

// Free, keyless Pollinations FLUX fallback (used when HF credits are depleted).
async function genPollinations(prompt, tries = 0) {
  const seed = Math.floor(Math.random() * 999999);
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
    `?width=768&height=1024&model=flux&nologo=true&seed=${seed}`;
  const res = await fetch(url);
  if (res.status === 200) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4000) return buf;              // guard against tiny error blobs
  }
  if (tries < 4) { await new Promise(r => setTimeout(r, 3000)); return genPollinations(prompt, tries + 1); }
  throw new Error(`Pollinations HTTP ${res.status}`);
}

async function gen(prompt, tokenIdx = 0, tries = 0) {
  if (!TOKENS.length) return genPollinations(prompt);   // no HF keys → straight to free fallback
  const token = TOKENS[tokenIdx % TOKENS.length];
  let res;
  try {
    res = await fetch(MODEL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: prompt, parameters: { width: 768, height: 1024 } }),
    });
  } catch (e) { return genPollinations(prompt); }
  if (res.status === 200) return Buffer.from(await res.arrayBuffer());
  if ((res.status === 402 || res.status === 403 || res.status === 429)) {
    if (tokenIdx < TOKENS.length - 1) return gen(prompt, tokenIdx + 1, tries);
    return genPollinations(prompt);                 // all HF keys exhausted → free fallback
  }
  if (res.status === 503 && tries < 4) {
    await new Promise(r => setTimeout(r, 4000));
    return gen(prompt, tokenIdx, tries + 1);
  }
  return genPollinations(prompt);                   // any other HF failure → free fallback
}

// Generate one agent, retrying until the saved PNG is a real image (>20KB).
async function makeOne(a, attempt = 1) {
  const full = a.prompt + STYLE;
  const buf = await gen(full);
  if (buf.length > 20 * 1024) return buf;
  if (attempt < 5) {
    process.stdout.write(`(retry ${attempt}, ${(buf.length / 1024).toFixed(0)}KB) `);
    await new Promise(r => setTimeout(r, 2000));
    return makeOne(a, attempt + 1);
  }
  return buf; // give back whatever we last got; caller reports the size
}

(async () => {
  const results = [];
  for (const a of jobs) {
    process.stdout.write(`  ${a.code} ... `);
    try {
      const buf = await makeOne(a);
      const file = path.join(OUT, `${a.code}-action.png`);
      fs.writeFileSync(file, buf);
      const kb = +(buf.length / 1024).toFixed(0);
      console.log(`${kb > 20 ? 'OK' : 'SMALL'} ${kb}KB`);
      results.push({ code: a.code, file: `${a.code}-action.png`, kb });
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      results.push({ code: a.code, file: `${a.code}-action.png`, kb: 0, err: e.message });
    }
  }
  console.log('\n  CODE      FILE                    KB');
  console.log('  --------  ----------------------  -----');
  for (const r of results) {
    console.log(`  ${r.code.padEnd(8)}  ${r.file.padEnd(22)}  ${String(r.kb).padStart(4)}${r.err ? '  ' + r.err : ''}`);
  }
  console.log('\nDone ->', OUT);
})();
