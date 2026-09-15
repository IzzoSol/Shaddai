#!/usr/bin/env node
// generate-folk-art.mjs — trader bust portraits + forge accessory overlays.
//
// Sources (never committed): FAL_KEY (env or backend/.env), HF pool (runtime-keys).
//
// Portraits: neon-CRT bust, full-bleed 512x512, saved to public/assets/traders/<name>.png
//            (matches the 12 real TRADER_NAMES in game.html) + traders-manifest.json.
// Accessories: FLUX -> RMBG (alpha) -> trim/resize 256 contain -> public/assets/accessories/<id>.png,
//            then UNCONDITIONALLY upserted into public/assets/accessories/catalog.json
//            (the forge vault + pixel-people.js read this file directly).
//
// Usage:
//   $env:FAL_KEY='<key>'; node tools/generate-folk-art.mjs
//   node tools/generate-folk-art.mjs --only=bravo
//   node tools/generate-folk-art.mjs --no-catalog   (skip catalog.json upsert)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TRADER_DIR = path.join(ROOT, 'public', 'assets', 'traders');
const ACC_DIR = path.join(ROOT, 'public', 'assets', 'accessories');
const ACC_CATALOG = path.join(ACC_DIR, 'catalog.json');

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

const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const sharp = require('sharp');

// ---- registries -------------------------------------------------------------
const PORTRAIT_STYLE =
  'neon CRT bust portrait, head and shoulders, Isometric 2D game splash art, ' +
  'dark teal navy background with subtle scanlines, cyan and dark-gold rim lighting, ' +
  'sharp hard-edged highlights, single subject centered, no text, no watermark, no border.';

// names MUST match the 12 TRADER_NAMES in game.html — never invent extras.
const TRADERS = {
  bram:  { desc: 'a grizzled old merchant with a steel-grey beard, leather duster, brass pocket-watch chain, kind tired eyes' },
  sela:  { desc: 'a calm hooded trader woman, dark indigo hood, amber eyes, silver crescent necklace' },
  oona:  { desc: 'a cheerful round merchant with a red bandana, freckles, gold hoop earrings' },
  dax:   { desc: 'a cyborg arms dealer, half-chrome jaw with cyan seams, tusked grin, tactical vest' },
  mira:  { desc: 'a shrewd sharp-eyed trader with a long dark braid, emerald earrings, fitted blazer' },
  tobin: { desc: 'a burly bearded quartermaster with a heavy oilskin coat, rope belt, warm laugh-lines' },
  wren:  { desc: 'a young swift courier girl with brass goggles on her head, short auburn hair, satchel' },
  juno:  { desc: 'an elegant pale dealer with platinum bob, gold geometric earrings, high-neck coat' },
  kesh:  { desc: 'a tall bald hawkish trader with a dyed grey-fade beard, tribal gold nose-bridge mark' },
  pol:   { desc: 'a stocky no-nonsense haggler with a thick moustache, flat cap, suspenders' },
  ada:   { desc: 'a precise silver-haired woman with round spectacles, sharp collar, data-cuff bracelet' },
  fen:   { desc: 'a mysterious hooded hoodlum with faint cyan runes dancing on the cloak, calm glow' },
};

// slot/anchor fields must match the accessories catalog contract consumed by
// pixel-people.js (drawImage at (anchorOffset - dw/2, -(25+walk) + oy - dh/2)).
const ACCESSORIES = [
  { id: 'hat_halo',     slot: 'hat',    anchorOffset: { x: 0, y: -16 }, imgScale: 0.22, rarity: 'rare',  sparksPrice: 120, desc: 'a small golden holographic halo ring hovering above a head, translucent gold light' },
  { id: 'mask_spectre', slot: 'mask',   anchorOffset: { x: 0, y: -10 }, imgScale: 0.2,  rarity: 'rare',  sparksPrice: 90,  desc: 'a wraparound black scouter visor with one glowing magenta lens and a cyan side-light' },
  { id: 'weapon_blade', slot: 'weapon', anchorOffset: { x: 17, y: 7 },  imgScale: 0.25, rarity: 'epic',  sparksPrice: 150, desc: 'a slim futuristic energy sword with a glowing cyan plasma blade, black hilt, held upright' },
  { id: 'pet_owl',      slot: 'pet',    anchorOffset: { x: -26, y: 4 }, imgScale: 0.2,  rarity: 'rare',  sparksPrice: 110, desc: 'a small round holographic owl floating beside a person, teal translucency, tiny glowing eyes' },
];

// ---- pipeline ---------------------------------------------------------------
function log(o) {
  console.log(o);
  process.stdout.write('#'.repeat(o.length + 4) + '\n');
}

async function generatePortrait(name, meta) {
  fs.mkdirSync(TRADER_DIR, { recursive: true });
  const out = path.join(TRADER_DIR, `${name}.png`);
  const prompt = `${PORTRAIT_STYLE} ${meta.desc}, 512x512`;
  const { buf: raw } = await fluxImage(prompt, 512, 512);
  const finalBuf = await sharp(raw)
    .resize(512, 512, { fit: 'contain', background: { r: 10, g: 14, b: 24, alpha: 1 } })
    .png()
    .toBuffer();
  fs.writeFileSync(out, finalBuf);
  console.log(`  ✔ trader ${name.padEnd(8)} -> ${out} (${(finalBuf.length / 1024).toFixed(1)}k)`);
  return { id: name, file: `traders/${name}.png`, src: `/assets/traders/${name}.png`, prompt };
}

async function generateAccessory(item) {
  fs.mkdirSync(ACC_DIR, { recursive: true });
  const out = path.join(ACC_DIR, `${item.id}.png`);
  const prompt = `Transparent sticker of ${item.desc}, centered, full body of the item only, ` +
    'flat hard-edged 2D game asset, subtle neon rim, no background, no drop shadow, no text, no watermark.';
  const { buf: raw } = await fluxImage(prompt, 512, 512);
  const { buf: nobg } = await removeBg(raw);
  const finalBuf = await sharp(nobg)
    .trim({ threshold: 20 })
    .resize({ width: 256, height: 256, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(out, finalBuf);
  console.log(`  ✔ acc ${item.id.padEnd(14)} -> ${out} (${(finalBuf.length / 1024).toFixed(1)}k)`);
  return { ...item, imageFile: `${item.id}.png`, kit: 'any', prompt };
}

function upsertCatalog(newItems) {
  if (!fs.existsSync(ACC_CATALOG)) return;
  const raw = fs.readFileSync(ACC_CATALOG, 'utf8');
  const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  const byId = {};
  const extra = { desc: null, prompt: null };
  for (const it of arr) {
    const { desc, prompt, ...rest } = it;
    byId[it.id] = rest;
    if (desc) extra.desc = 1;
    if (prompt) extra.prompt = 1;
  }
  let changed = 0;
  for (const it of newItems) {
    const { desc, prompt, ...entry } = it;
    if (byId[it.id]) continue;
    if (extra.desc) entry.desc = desc || '';
    if (extra.prompt) entry.prompt = prompt || '';
    arr.push(entry);
    byId[it.id] = entry;
    changed++;
  }
  if (changed) {
    fs.writeFileSync(ACC_CATALOG, JSON.stringify(arr, null, 2) + '\n');
    console.log(`  catalog.json: +${changed} accessory entries`);
  } else {
    console.log('  catalog.json: all accessory ids already present');
  }
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
  const doCatalog = !process.argv.includes('--no-catalog');

  log(`PORTRAITS=${Object.keys(TRADERS).length}  ACCESSORIES=${ACCESSORIES.length}  FAL=${FAL_KEY ? 'on' : 'off'}  HF-pool=${HF_TOKENS.length}`);
  const manifest = { generatedAt: new Date().toISOString(), portraits: {}, accessories: {} };

  for (const name of Object.keys(TRADERS)) {
    if (only && !only.includes(name)) continue;
    try { manifest.portraits[name] = await generatePortrait(name, TRADERS[name]); }
    catch (e) { console.error(`  ✗ trader ${name}: ${e.message}`); }
  }
  for (const item of ACCESSORIES) {
    if (only && !only.includes(item.id)) continue;
    try { manifest.accessories[item.id] = await generateAccessory(item); }
    catch (e) { console.error(`  ✗ acc ${item.id}: ${e.message}`); }
  }

  fs.writeFileSync(path.join(TRADER_DIR, 'traders-manifest.json'), JSON.stringify(manifest.portraits, null, 2));
  console.log(`  manifest -> ${path.join(TRADER_DIR, 'traders-manifest.json')}`);
  if (doCatalog) upsertCatalog(Object.values(manifest.accessories).filter((a) => a && a.imageFile));
  log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });