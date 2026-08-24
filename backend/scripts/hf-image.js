#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// HF IMAGE — generate council art via Hugging Face inference.
//
// Token comes from backend/hf.key (gitignored via *.key) or HF_API_TOKEN.
// Never pass the token on the command line; it would land in shell history.
//
// Usage:
//   node hf-image.js --out=../public/assets/council/SHADDAI.png --prompt="..."
//   node hf-image.js --list-models
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

const KEY = (() => {
  if (process.env.HF_API_TOKEN) return process.env.HF_API_TOKEN.trim();
  const f = path.join(__dirname, '..', 'hf.key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  throw new Error('no HF token (backend/hf.key or HF_API_TOKEN)');
})();

// Router endpoint — the classic api-inference host 404s for many models now.
const MODELS = [
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-dev',
  'stabilityai/stable-diffusion-xl-base-1.0',
];

async function generate(prompt, model) {
  const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4 } }),
  });
  if (!r.ok) {
    const body = await r.text();
    return { ok: false, status: r.status, note: body.slice(0, 200) };
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) {
    return { ok: false, status: r.status, note: (await r.text()).slice(0, 200) };
  }
  return { ok: true, buf: Buffer.from(await r.arrayBuffer()) };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (p) => { const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };
  const prompt = get('--prompt=');
  const out = get('--out=');
  if (!prompt || !out) throw new Error('need --prompt= and --out=');

  for (const model of MODELS) {
    process.stdout.write(`[hf] ${model} … `);
    const res = await generate(prompt, model);
    if (res.ok) {
      fs.writeFileSync(out, res.buf);
      console.log(`OK → ${out} (${(res.buf.length / 1024).toFixed(0)} KB)`);
      return;
    }
    console.log(`${res.status} ${res.note.replace(/\s+/g, ' ').slice(0, 110)}`);
  }
  throw new Error('all models failed');
}

main().catch((e) => { console.error('[hf] FATAL:', e.message); process.exit(1); });
