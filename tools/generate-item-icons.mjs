#!/usr/bin/env node
// generate-item-icons.mjs — produce neon-punk item icons for the world economy
// (GOODS trade goods + FISH catchables) that were rendering as raw emoji.
//
// Sources (never committed):
//   - FAL_KEY  : $env:FAL_KEY (or backend/.env FAL_KEY) — premium FLUX + rembg
//   - HF pool  : backend/data/runtime-keys.json HF_TOKENS — free FLUX + RMBG
//
// Pipeline per asset: FLUX(schnell) -> RMBG -> trim -> fit 512x512 transparent
// -> public/assets/items/goods/<id>.png  |  public/assets/items/fish/<id>.png
// + writes public/assets/items/items-manifest.json.
//
// Usage:
//   $env:FAL_KEY='<key>'; node tools/generate-item-icons.mjs --only wood,minnow
//   node tools/generate-item-icons.mjs            # everything in the registry

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ITEMS = path.join(ROOT, 'public', 'assets', 'items');
const OUT_MANIFEST = path.join(PUBLIC_ITEMS, 'items-manifest.json');

function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}
const envFiles = readDotEnv(path.join(ROOT, 'backend', '.env'));
const FAL_KEY = process.env.FAL_KEY || envFiles.FAL_KEY || '';
let HF_TOKENS = [];
try {
  HF_TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'data', 'runtime-keys.json'), 'utf8')).HF_TOKENS || [];
} catch (_) { /* pool optional */ }

const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const sharp = require('sharp');

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${String(body).slice(0, 300)}`);
  return body;
}
const FAL_HDRS = () => ({ Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' });

async function fluxImage(prompt) {
  if (FAL_KEY) {
    try {
      const r = await fetchJson('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: FAL_HDRS(),
        body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1 }),
      });
      const url = Array.isArray(r.images) && r.images[0] && r.images[0].url ? r.images[0].url : (r.url || r.image);
      if (url) return { buf: Buffer.from(await (await fetch(url)).arrayBuffer()), provider: 'fal' };
    } catch (e) { console.error('  [fal FLUX failed]', e.message); }
  }
  let lastErr = null;
  for (const tok of HF_TOKENS) {
    try {
      const r = await fetchJson('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt }),
      });
      return { buf: Buffer.from(r), provider: 'hf-flux' };
    } catch (e) { lastErr = e; }
  }
  throw new Error(lastErr ? `FLUX failed: ${lastErr.message}` : 'no FLUX provider configured');
}

async function removeBg(buf) {
  for (const tok of HF_TOKENS) {
    try {
      const form = new FormData();
      form.append('image', new Blob([buf], { type: 'image/png' }), 'item.png');
      const r = await fetchJson('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      if (Buffer.isBuffer(r)) return { buf: r, provider: 'hf-rmbg' };
    } catch (e) { /* try next token */ }
  }
  if (FAL_KEY) {
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    const r = await fetchJson('https://fal.run/fal-ai/imageutils/rembg', {
      method: 'POST',
      headers: FAL_HDRS(),
      body: JSON.stringify({ image_url: dataUrl }),
    });
    const url = r.image && r.image.url;
    if (url) return { buf: Buffer.from(await (await fetch(url)).arrayBuffer()), provider: 'fal-rembg' };
  }
  throw new Error('background removal failed on all providers');
}

// style base: matches the fal item icons already in REAL_ART — neon-punk isometric
// loot icon, single subject centered, transparent/plain bg, clean silhouette.
const STYLE =
  'neon-punk isometric game loot icon, single item centered, hard-edged clean ' +
  'silhouette, subtle anime-cell shading, dark background, no text, no watermark, ' +
  'no border, no extra objects.';

const ITEMS = {
  goods: {
    wood:    { desc: 'a neat stack of cut glowing amber logs' },
    hide:    { desc: 'a rolled animal hide pelt, dark rust leather with stitching' },
    water:   { desc: 'a round canteen flask of fresh water, cyan dripping' },
    ore:     { desc: 'raw ore chunks, dull grey rock with glowing orange vein cracks' },
    trinket: { desc: 'a small oval gem trinket, violet crystal on a thin wire' },
  },
  fish: {
    minnow:  { desc: 'a small silver minnow fish, tiny fins, bright eye' },
    bass:    { desc: 'a green-brown bass fish with spiny dorsal fin' },
    salmon:  { desc: 'a salmon fish, pink-orange body with darker back' },
    tuna:    { desc: 'a big fat tuna fish, metallic blue-grey, tall fin' },
    levi:    { desc: 'an enormous shadow leviathan serpent, dark scales, glowing violet eyes' },
  },
};

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

async function generateOne(cat, id, meta) {
  const dir = path.join(PUBLIC_ITEMS, cat);
  fs.mkdirSync(dir, { recursive: true });
  const prompt = `${STYLE} ${meta.desc}, item icon, isometric`;
  const out = path.join(dir, `${id}.png`);

  const { buf: raw } = await fluxImage(prompt);
  const { buf: nobg } = await removeBg(raw);
  const finalBuf = await sharp(nobg)
    .trim()
    .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(out, finalBuf);
  console.log('  OK', path.relative(ROOT, out), finalBuf.length, 'bytes');
  return { prompt, src: `public/assets/items/${cat}/${id}.png` };
}

async function main() {
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(OUT_MANIFEST, 'utf8')); } catch (_) { /* new */ }
  for (const [cat, list] of Object.entries(ITEMS)) {
    for (const [id, meta] of Object.entries(list)) {
      if (only && !only.has(id)) continue;
      console.log(`\n== ${cat}/${id} ==`);
      try {
        const src = await generateOne(cat, id, meta);
        manifest[`${cat}/${id}`] = src;
      } catch (e) {
        console.error('  FAIL', id, e.message);
      }
    }
  }
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log('\nmanifest:', OUT_MANIFEST);
}
main();