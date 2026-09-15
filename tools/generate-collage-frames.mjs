import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire('C:/Users/Brittany/Shaddai/backend/');
const sharp = require('sharp');

const FAL_KEY = process.env.FAL_KEY;
const OUT = 'C:/Users/Brittany/Shaddai/public/assets/journey';

const JOBS = [
  { out: 'grass-1.jpg', w: 2752, h: 1536, prompt: 'extreme macro photograph, golden blades of wild grass at dawn, dew droplets, shallow depth of field, warm golden-amber rim light, dark moody background, cinematic, photorealistic, landscape orientation, no text, no watermark' },
  { out: 'grass-2.jpg', w: 2752, h: 1536, prompt: 'extreme macro photograph, wild grass silhouettes catching low golden-hour sun, drifting pollen motes, soft bokeh, warm amber golden tones, dark atmospheric background, cinematic, photorealistic, landscape orientation, no text, no watermark' },
  { out: 'grass-3.jpg', w: 2752, h: 1536, prompt: 'extreme macro photograph, close-up of tall grass stems backlit by warm dawn light, glints and lens flare, dark moody depth, rich gold and umber tones, cinematic, photorealistic, landscape orientation, no text, no watermark' },
  { out: 'molecules-1.jpg', w: 971, h: 607, prompt: 'dark cinematic neon scene, glowing molecular lattice of translucent spheres and bonds floating in deep space, cyan and gold highlights, faint depth haze, occult chemistry, no text, no watermark' },
  { out: 'molecules-2.jpg', w: 971, h: 607, prompt: 'dark cinematic neon scene, swirling chain of luminous molecules and orbitals, crimson and violet glow, glowing core particles, deep black background, no text, no watermark' },
  { out: 'molecules-3.jpg', w: 971, h: 607, prompt: 'dark cinematic neon scene, abstract covalent lattice glowing from within, teal and amber nodes connected by light filaments, floating dust motes, deep shadows, no text, no watermark' },
];

async function retryFetch(url, times = 6) {
  let last;
  for (let i = 0; i < times; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.arrayBuffer();
      last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw last;
}

for (const job of JOBS) {
  const abs = path.join(OUT, job.out);
  if (fs.existsSync(abs)) { console.log('skip (exists):', job.out); continue; }
  const gen = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { Authorization: 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: job.prompt, image_size: 'landscape_16_9', num_images: 1 }),
  });
  if (!gen.ok) throw new Error('generate ' + job.out + ' HTTP ' + gen.status);
  const j = await gen.json();
  const raw = Buffer.from(await retryFetch(j.images[0].url));
  let buf = raw;
  if (sharp) buf = await sharp(raw).resize({ width: job.w, height: job.h, fit: 'cover', position: 'attention' }).jpeg({ quality: 84 }).toBuffer();
  fs.writeFileSync(abs, buf);
  console.log('SAVED', job.out, buf.length, 'bytes');
}
console.log('done');