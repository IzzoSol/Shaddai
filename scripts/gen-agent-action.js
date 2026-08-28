// Generate fresh ACTION-pose portraits for the 7 SHADDAI agents (character-picker art).
// Portrait 768x1024, saved to public/assets/agents/<CODE>-action.png (OVERWRITE).
// Run: node scripts/gen-agent-action.js   (or regen some: node scripts/gen-agent-action.js SHADDAI ZEROX)
// Models on scripts/gen-game-covers.js — HF FLUX with keyless Pollinations FLUX fallback.
const fs = require('fs');
const path = require('path');

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
