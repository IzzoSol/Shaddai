// scripts/gen-module-art.mjs — square icon-style FLUX art for the dashboard's
// Media and Workflow tab modules (replacing emoji icons with real art). File-disjoint
// from the dashboard (writes backend/data/forge-art/module-<key>.png). Re-runnable
// (skips done). Run: node scripts/gen-module-art.mjs   (or pass a key to do just one)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const hf = require('../backend/lib/hf-keys.js');

const OUT = fileURLToPath(new URL('../backend/data/forge-art/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const STYLE = 'glowing 3D app icon, dark teal-and-gold UI aesthetic, neon rim light, ' +
  'centered emblem on dark background, premium, sharp, no text, no watermark';

// Media + Workflow tab modules. key → subject (icon concept).
const MODULES = {
  // Media modules
  imagegen:      'AI image generation, a glowing paintbrush + photo frame emblem',
  videostudio:   'AI video studio, a glowing film clapperboard + play button emblem',
  musicaudio:    'AI music studio, glowing waveform + musical note emblem',
  voicetts:      'AI voice / text-to-speech, glowing microphone + soundwave emblem',
  aiwriter:      'AI writing, a glowing quill pen + document emblem',
  gallery:       'media gallery, a glowing grid of images emblem',
  videoclipper:  'video clipper, a glowing scissors cutting a film strip emblem',
  chartsignal:   'chart signal, a glowing candlestick trading chart emblem',
  contentseries: 'content series, a glowing stacked-cards/calendar emblem',
  // Workflow modules
  automation:    'automation engine, glowing interlocking gears emblem',
  pipeline:      'workflow pipeline, glowing connected-nodes flowchart emblem',
  scheduler:     'scheduler, a glowing clock + calendar emblem',
  triggers:      'triggers, a glowing lightning bolt + switch emblem',
};

const only = process.argv[2];
const keys = only ? [only] : Object.keys(MODULES);
console.log(`HF keys: ${hf.keys().length}. Generating ${keys.length} module icon(s) → backend/data/forge-art/module-*.png`);

let done = 0, skip = 0, fail = 0;
for (const key of keys) {
  if (!MODULES[key]) { console.log(`✗ unknown module: ${key}`); fail++; continue; }
  const out = OUT + `module-${key}.png`;
  if (existsSync(out)) { console.log(`· skip ${key} (exists)`); skip++; continue; }
  const prompt = `${MODULES[key]}, ${STYLE}`;
  const t0 = Date.now();
  try {
    const img = await hf.generate(prompt);
    writeFileSync(out, img);
    console.log(`✓ ${key} · ${(img.length/1024|0)}KB · ${((Date.now()-t0)/1000).toFixed(1)}s`);
    done++;
  } catch (e) {
    console.log(`✗ ${key}: ${e.message}`); fail++;
    if (e.code === 'NO_KEY' || e.code === 'ALL_FAILED') break;
  }
  await new Promise(s => setTimeout(s, 1500));
}
console.log(`DONE generated:${done} skipped:${skip} failed:${fail}`);
