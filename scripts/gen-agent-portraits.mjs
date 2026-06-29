// scripts/gen-agent-portraits.mjs — detailed, 3D-looking FLUX portraits of the 7
// council agents for the Skills/swivel/character-sheet tab. File-disjoint from the
// dashboard (writes backend/data/forge-art/agent-<id>.png). Re-runnable (skips done).
// Run: node scripts/gen-agent-portraits.mjs   (or pass an id to do just one)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const hf = require('../backend/lib/hf-keys.js');

const OUT = fileURLToPath(new URL('../backend/data/forge-art/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const STYLE = 'ultra-detailed 3D-rendered character portrait, octane render, volumetric rim lighting, ' +
  'intricate fine detail, dramatic cinematic lighting, premium NFT trading-card hero shot, sharp focus, ' +
  'centered bust, dark atmospheric background with teal and gold glow, highly detailed, no text, no watermark';

// Established looks preserved: TURTLE = green-hair anime girl from helmet; ZEROX = blue hair; ORACLE = gold halo.
const AGENTS = {
  shaddai:  'SHADDAI the supreme orchestrator, an ethereal divine being formed of pure radiant golden light and starlight rather than human skin, a luminous translucent body of glowing golden energy, a brilliant golden crown of light, flowing cosmic-gold robes of liquid light, a glowing third-eye of cosmic energy, halo of divine golden radiance, transcendent otherworldly presence, godlike luminous aura',
  zerox:    'ZEROX the revenue engine, a sleek confident operative with vibrant electric-blue hair, gold-accented techwear, holographic profit charts swirling around, wealthy aura',
  oracle:   'ORACLE the market intelligence seer, a mystic operative with a radiant golden halo above the head, glowing third-eye, flowing violet robes, floating data crystals',
  nexus:    'NEXUS the backend architect, a precise cyber-engineer cyborg with chrome-and-teal techwear, holographic API schematics and circuit patterns, technical confident expression',
  turtle:   'TURTLE the UI/UX designer, a cute anime girl operative with vibrant green hair flowing from an open futuristic helmet, soft friendly youthful features, colorful creative aura, artist',
  quill:    'QUILL the content studio writer, a scholarly elegant operative with violet-toned robes, glowing runic quill and floating pages of text, thoughtful refined expression',
  pikadon:  'PIKADON the security auditor, a vigilant guardian operative in dark tactical armor with red-and-gold accents, a glowing protective shield rune, intense defensive stance',
};

const only = process.argv[2];
const ids = only ? [only] : Object.keys(AGENTS);
console.log(`HF keys: ${hf.keys().length}. Generating ${ids.length} agent portrait(s) → backend/data/forge-art/agent-*.png`);

let done = 0, skip = 0, fail = 0;
for (const id of ids) {
  if (!AGENTS[id]) { console.log(`✗ unknown agent: ${id}`); fail++; continue; }
  const out = OUT + `agent-${id}.png`;
  if (existsSync(out) && !only) { console.log(`· skip ${id} (exists)`); skip++; continue; } // explicit id → force regen
  const prompt = `${AGENTS[id]}, ${STYLE}`;
  const t0 = Date.now();
  try {
    const img = await hf.generate(prompt);
    writeFileSync(out, img);
    console.log(`✓ ${id.toUpperCase()} · ${(img.length/1024|0)}KB · ${((Date.now()-t0)/1000).toFixed(1)}s`);
    done++;
  } catch (e) {
    console.log(`✗ ${id}: ${e.message}`); fail++;
    if (e.code === 'NO_KEY' || e.code === 'ALL_FAILED') break;
  }
  await new Promise(s => setTimeout(s, 1500));
}
console.log(`DONE generated:${done} skipped:${skip} failed:${fail}`);
