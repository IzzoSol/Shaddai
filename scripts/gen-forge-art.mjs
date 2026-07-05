// scripts/gen-forge-art.mjs — pre-generate PREMIUM FLUX art for the forge.
// One high-quality portrait per archetype (the builder shows these instantly so
// it looks like real art, never crude SVG). Re-runnable (skips existing).
// Run: node scripts/gen-forge-art.mjs            (all archetypes)
//      node scripts/gen-forge-art.mjs vanguard   (just one)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const core = require('../backend/forge/forge-core.js');
const hf = require('../backend/lib/hf-keys.js');

const OUT = fileURLToPath(new URL('../backend/data/forge-art/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const only = process.argv[2];
const names = only ? [only] : Object.keys(core.ARCHETYPES);
console.log(`HF keys available: ${hf.keys().length}. Generating ${names.length} archetype portrait(s) → backend/data/forge-art/`);

let done = 0, skip = 0, fail = 0;
for (const arch of names) {
  if (!core.ARCHETYPES[arch]) { console.log(`✗ unknown archetype: ${arch}`); fail++; continue; }
  const out = OUT + `arch-${arch}.png`;
  if (existsSync(out)) { console.log(`· skip ${arch} (exists)`); skip++; continue; }
  const build = core.loadoutFor(arch);
  // seed by archetype index → stable + diverse ethnicity rotation
  const seed = Object.keys(core.ARCHETYPES).indexOf(arch) + 1;
  const prompt = core.assemblePrompt(build, seed);
  const t0 = Date.now();
  try {
    const img = await hf.generate(prompt);
    writeFileSync(out, img);
    console.log(`✓ ${arch} (${core.ARCHETYPES[arch].name}) · ${core.rarityOf(build)} · ${(img.length/1024|0)}KB · ${((Date.now()-t0)/1000).toFixed(1)}s`);
    done++;
  } catch (e) {
    console.log(`✗ ${arch}: ${e.message}`);
    fail++;
    if (e.code === 'NO_KEY' || e.code === 'ALL_FAILED') break;
  }
  await new Promise(s => setTimeout(s, 1500));
}
console.log(`DONE generated:${done} skipped:${skip} failed:${fail}`);
