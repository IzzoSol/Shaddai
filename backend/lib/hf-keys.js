// backend/lib/hf-keys.js — HuggingFace key pool with auto-rotation.
// Loads keys from env (HF_TOKENS csv, or HF_TOKEN/HUGGINGFACE_API_KEY) or the
// gitignored backend/data/runtime-keys.json. On a 402 "depleted" / 429 from one
// key, transparently retries the next. The token NEVER leaves the server.
const fs = require('fs');
const path = require('path');

const FLUX = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';

function keys() {
  const out = [];
  const add = (k) => { if (k && /^hf_/.test(String(k).trim()) && !out.includes(k.trim())) out.push(k.trim()); };
  if (process.env.HF_TOKENS) String(process.env.HF_TOKENS).split(',').forEach(add);
  add(process.env.HF_TOKEN); add(process.env.HUGGINGFACE_API_KEY);
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8'));
    if (Array.isArray(j.HF_TOKENS)) j.HF_TOKENS.forEach(add);
    add(j.HF_TOKEN); add(j.HUGGINGFACE_API_KEY);
  } catch {}
  return out;
}

// Generate one image; rotates across all keys on depletion/rate-limit. Returns a Buffer.
async function generate(prompt, { model = FLUX } = {}) {
  const pool = keys();
  if (!pool.length) { const e = new Error('No HF token configured (set HF_TOKENS env or backend/data/runtime-keys.json)'); e.code = 'NO_KEY'; throw e; }
  let lastErr;
  for (let i = 0; i < pool.length; i++) {
    try {
      const r = await fetch(model, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + pool[i], 'Content-Type': 'application/json', 'x-wait-for-model': 'true' },
        body: JSON.stringify({ inputs: prompt }),
      });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.startsWith('image')) return Buffer.from(await r.arrayBuffer());
      // depleted / rate-limited / unauthorized → try next key
      if ([402, 429, 401, 403].includes(r.status)) { lastErr = new Error(`HF ${r.status} on key#${i + 1}`); continue; }
      // model warming up → wait once then retry same key
      if (r.status === 503) { await new Promise(s => setTimeout(s, 8000)); i--; continue; }
      let body = ''; try { body = (await r.text()).slice(0, 160); } catch {}
      lastErr = new Error(`HF ${r.status} ${body}`);
    } catch (e) { lastErr = e; }
  }
  const e = new Error('All HF keys failed: ' + (lastErr && lastErr.message || 'unknown')); e.code = 'ALL_FAILED'; throw e;
}

module.exports = { keys, generate, FLUX };
