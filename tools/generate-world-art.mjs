#!/usr/bin/env node
// generate-world-art.mjs — produce pixel-art enemy sprites for the 2D world.
//
// Sources (never committed):
//   - FAL_KEY  : $env:FAL_KEY (or backend/.env FAL_KEY)  — premium FLUX + rembg + seedance
//   - HF pool  : backend/data/runtime-keys.json HF_TOKENS — free FLUX fallback + RMBG
//
// Pipeline per asset: FLUX(schnell) -> background removal (RMBG) -> trim/resize
// (keras 'nearest' to keep crisp pixel edges) -> public/assets/world/<id>.png
// + writes public/assets/world/enemy-manifest.json { id: {prompt, src} }.
//
// Usage:
//   $env:FAL_KEY='<key>'; node tools/generate-world-art.mjs --only wolf,crab
//   node tools/generate-world-art.mjs            # everything in SPRITES

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets', 'world');
const OUT_MANIFEST = path.join(PUBLIC_ASSETS, 'enemy-manifest.json');

// ---- env / keys (never printed, never committed) ---------------------------
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
  const rk = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'data', 'runtime-keys.json'), 'utf8'));
  if (Array.isArray(rk.HF_TOKENS)) HF_TOKENS = rk.HF_TOKENS.filter(Boolean);
} catch { /* ignore */ }
for (const k of ['HF_TOKENS', 'HF_TOKEN']) {
  if (envFiles[k]) HF_TOKENS = HF_TOKENS.concat(String(envFiles[k]).split(',').filter(Boolean));
}
if (process.env.HF_TOKEN) HF_TOKENS = HF_TOKENS.concat(String(process.env.HF_TOKEN).split(',').filter(Boolean));
HF_TOKENS = [...new Set(HF_TOKENS)];
if (!FAL_KEY && !HF_TOKENS.length) {
  console.error('No keys found. Set FAL_KEY (env) or HF pool (runtime-keys/.env).');
  process.exit(1);
}

// ---- tiny HTTP helpers ------------------------------------------------------
async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${String(body).slice(0, 300)}`);
  return body;
}
const FAL_HDRS = () => ({ Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' });

// ---- provider calls ---------------------------------------------------------
async function fluxImage(prompt, w, h) {
  if (FAL_KEY) {
    try {
      const r = await fetchJson('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: FAL_HDRS(),
        body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1 }),
      });
      const url = Array.isArray(r.images) && r.images[0] && r.images[0].url ? r.images[0].url : (r.url || r.image);
      if (url) return { buf: Buffer.from(await (await fetch(url)).arrayBuffer()), provider: 'fal' };
    } catch (e) {
      console.error('  [fal FLUX failed]', e.message);
    }
  }
  let lastErr = null;
  for (const tok of HF_TOKENS) {
    try {
      const r = await fetchJson('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, parameters: { width: w, height: h, guidance_scale: 0.0 } }),
      });
      if (Buffer.isBuffer(r)) return { buf: r, provider: 'hf' };
      if (r && r.body) return { buf: Buffer.from(r.body, 'base64'), provider: 'hf' };
    } catch (e) { lastErr = e.message; }
  }
  throw new Error('FLUX: fal + HF pool both failed: ' + (lastErr || ''));
}

async function removeBg(buf) {
  // 1) HF RMBG (free) — PNG with alpha channel returned
  for (const tok of HF_TOKENS) {
    try {
      const form = new FormData();
      form.append('image', new Blob([buf], { type: 'image/png' }), 'sprite.png');
      const r = await fetchJson('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      if (Buffer.isBuffer(r)) return { buf: r, provider: 'hf-rmbg' };
    } catch (e) { /* try next token */ }
  }
  // 2) fal rembg fallback (premium)
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

// sharp is a backend dep — resolve relative to backend/node_modules
import { createRequire } from 'node:module';
const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const sharp = require('sharp');

// ---- sprite registry ---------------------------------------------------------
// style base: neon-punk voxel beast, matching the game's hard-edge pixel world.
const STYLE =
  '8-bit pixel-art game monster sprite, voxel render, front view, full body centered, ' +
  'flat dark-green solid background, crisp blocky pixels, subtle 2-light iso shading, ' +
  'thick dark outline, single subject, no text, no watermark, no border.';

const SPRITES = {
  boar:         { desc: 'a wild tusked boar, shaggy brown hide, angry red eyes' },
  wolf:         { desc: 'a lean grey wolf, sharp fangs, amber eyes, curled tail' },
  direwolf:     { desc: 'a HUGE dark dire wolf, black fur, glowing red eyes, menacing' },
  gull:         { desc: 'a white seagull with grey wings and a bright orange beak' },
  crab:         { desc: 'a red sand crab with big claws and stalk eyes' },
  scorpion:     { desc: 'a golden desert scorpion with a raised curling stinger' },
  coyote:       { desc: 'a sandy desert coyote, alert ears, golden eyes, lean body' },
  lavahound:    { desc: 'a molten lava hound, cracked obsidian hide glowing orange through cracks' },
  magmagolem:   { desc: 'a massive magma golem made of burning rock, lava veins, glowing fists' },
  mugger:       { desc: 'a street mugger in a dark hoodie and scarf, sneering, holding a bat' },
  drone:        { desc: 'a rogue hovering combat drone, metallic black with a cyan scanning eye' },
  shade:        { desc: 'a shadow wisp beast with no face, wisps of purple smoke, purple eye' },
  bonehound:    { desc: 'a skeletal hound with exposed bones, feral grin, red eyes' },
  wraith:       { desc: 'a hooded purple wraith floating, tattered cloak, glowing violet glare' },
  cultist:      { desc: 'a masked crimson cultist robed in dark fabric, holding a ritual blade' },
  shadow_wraith:{ desc: 'a towering shadow wraith, pure darkness with electric magenta eyes' },
  gate_guardian:{ desc: 'an enormous ancient stone gate guardian golem, crimson runes glowing, boss' },
};

// ---- core pipeline -----------------------------------------------------------
function log(o) {
  console.log(o);
  process.stdout.write('#'.repeat(o.length + 4) + '\n');
}

async function generateOne(id, meta) {
  const dir = PUBLIC_ASSETS;
  fs.mkdirSync(dir, { recursive: true });
  const prompt = `${STYLE} ${meta.desc}, 512x512`;
  const out = path.join(dir, `enemy-${id}.png`);

  const { buf: raw } = await fluxImage(prompt, 512, 512);
  const { buf: nobg } = await removeBg(raw);
  // trim alpha then fit to a 200px canvas, lanczos3 (crisp, high-quality downscale)
  const finalBuf = await sharp(nobg)
    .trim({ threshold: 20 })
    .resize({ width: 200, height: 200, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(out, finalBuf);
  console.log(`  ✔ ${id.padEnd(14)} -> ${out} (${(finalBuf.length / 1024).toFixed(1)}k)`);
  return { id, src: `/assets/world/enemy-${id}.png`, prompt };
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
  const todo = only ? only : Object.keys(SPRITES);

  log(`FAL=${FAL_KEY ? 'on' : 'off'}  HF-pool=${HF_TOKENS.length}  targets=${todo.length}`);
  const manifest = {};
  for (const id of todo) {
    if (!SPRITES[id]) { console.error('  unknown sprite:', id); continue; }
    try {
      manifest[id] = await generateOne(id, SPRITES[id]);
    } catch (e) {
      console.error(`  ✗ ${id}: ${e.message}`);
    }
  }
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  log(`manifest -> ${OUT_MANIFEST} (${Object.keys(manifest).length} done)`);
}

main().catch((e) => { console.error(e); process.exit(1); });