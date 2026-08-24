#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// FAL IMAGE — generate council art via fal.ai FLUX.
//
// Why not Hugging Face? hf-inference now returns 410 "model is deprecated" for
// FLUX.1-schnell, FLUX.1-dev and SDXL alike, so the HF image path is dead for
// these. fal.ai is the route this project already used for its generated art.
//
// Key from backend/fal.key (gitignored via *.key) or FAL_KEY. Never passed on
// the command line — that would put it in shell history.
//
// Usage:
//   node fal-image.js --out=../public/assets/council/SHADDAI.png --prompt="…"
//   node fal-image.js --out=… --prompt="…" --size=portrait_4_3
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

const KEY = (() => {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  const f = path.join(__dirname, '..', 'fal.key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  throw new Error('no fal key (backend/fal.key or FAL_KEY)');
})();

const MODEL = process.env.FAL_MODEL || 'fal-ai/flux/schnell';

async function main() {
  const args = process.argv.slice(2);
  const get = (p) => { const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };
  const prompt = get('--prompt=');
  const out = get('--out=');
  const size = get('--size=') || 'square_hd';
  if (!prompt || !out) throw new Error('need --prompt= and --out=');

  const r = await fetch(`https://fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: size, num_images: 1, num_inference_steps: 4 }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`fal ${r.status}: ${text.slice(0, 240)}`);

  const j = JSON.parse(text);
  const url = j?.images?.[0]?.url;
  if (!url) throw new Error(`no image url in response: ${text.slice(0, 240)}`);

  const img = await fetch(url);
  if (!img.ok) throw new Error(`download failed ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log(`[fal] wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error('[fal] FATAL:', e.message); process.exit(1); });
