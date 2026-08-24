#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// HF IMAGE — generate council art through Hugging Face's inference router.
//
// IMPORTANT: the legacy `hf-inference` provider returns 410 "model is
// deprecated" for FLUX.1-schnell, FLUX.1-dev and SDXL. That is provider
// deprecation, not an auth problem — more keys do not help. What DOES work is
// the router with an explicit live provider:
//
//   POST https://router.huggingface.co/<provider>/<providerId>
//
// Live providers for FLUX.1-schnell (checked via the model's
// inferenceProviderMapping): nscale, fal-ai, wavespeed.
//
// Keys: backend/hf.key, one per line (gitignored via *.key). Each is tried in
// turn, so a rate-limited or dead key falls through to the next rather than
// failing the run.
//
// Usage:
//   node hf-image.js --out=path.png --prompt="…" [--size=1024x1024]
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

function loadKeys() {
  if (process.env.HF_API_TOKEN) return [process.env.HF_API_TOKEN.trim()];
  const f = path.join(__dirname, '..', 'hf.key');
  if (!fs.existsSync(f)) throw new Error('no HF keys (backend/hf.key or HF_API_TOKEN)');
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// provider → the id that provider knows the model by
const ROUTES = [
  ['fal-ai',    'fal-ai/flux/schnell'],
  ['nscale',    'black-forest-labs/FLUX.1-schnell'],
  ['wavespeed', 'wavespeed-ai/flux-schnell'],
];

async function tryRoute(key, provider, providerId, prompt, size) {
  const [w, h] = size.split('x').map(Number);
  const body = provider === 'fal-ai'
    ? { prompt, image_size: { width: w, height: h }, num_images: 1, num_inference_steps: 4 }
    : { prompt, width: w, height: h, num_inference_steps: 4 };

  const r = await fetch(`https://router.huggingface.co/${provider}/${providerId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) return { ok: false, note: `${r.status} ${(await r.text()).slice(0, 120)}` };

  if (ct.startsWith('image/')) return { ok: true, buf: Buffer.from(await r.arrayBuffer()) };

  // some providers answer with JSON carrying a URL
  const j = await r.json().catch(() => null);
  const url = j?.images?.[0]?.url || j?.image?.url || j?.output?.[0];
  if (!url) return { ok: false, note: `no image in response: ${JSON.stringify(j).slice(0, 120)}` };
  const img = await fetch(url);
  if (!img.ok) return { ok: false, note: `download ${img.status}` };
  return { ok: true, buf: Buffer.from(await img.arrayBuffer()) };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (p) => { const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };
  const prompt = get('--prompt=');
  const out = get('--out=');
  const size = get('--size=') || '1024x1024';
  if (!prompt || !out) throw new Error('need --prompt= and --out=');

  const keys = loadKeys();
  console.log(`[hf] ${keys.length} key(s), ${ROUTES.length} provider route(s)`);

  for (const [provider, providerId] of ROUTES) {
    for (let i = 0; i < keys.length; i++) {
      process.stdout.write(`[hf] ${provider} key#${i + 1} … `);
      let res;
      try { res = await tryRoute(keys[i], provider, providerId, prompt, size); }
      catch (e) { res = { ok: false, note: e.message.slice(0, 100) }; }
      if (res.ok) {
        fs.writeFileSync(out, res.buf);
        console.log(`OK → ${out} (${(res.buf.length / 1024).toFixed(0)} KB)`);
        return;
      }
      console.log(res.note.replace(/\s+/g, ' ').slice(0, 110));
    }
  }
  throw new Error('every provider/key combination failed');
}

main().catch((e) => { console.error('[hf] FATAL:', e.message); process.exit(1); });
