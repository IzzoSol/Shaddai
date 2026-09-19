#!/usr/bin/env node
/* SHADDAI · build-item-sprites.mjs — cut item plates out of their flat grey backdrop -> transparent 256px WebP for the in-world shop.
 * Alpha = smoothstep on color distance from the plate's corner color (backgrounds are flat by prompt). */
import sharp from 'sharp';
import { readdirSync } from 'fs';
const dir = 'fal-assets/world/concepts2/items', out = 'public/assets/items';
const clamp = (x) => Math.max(0, Math.min(1, x)), ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
for (const f of readdirSync(dir).filter((x) => x.endsWith('.png') && x.startsWith('item-'))) {
  const { data, info } = await sharp(`${dir}/${f}`).resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = [0, 1, 2].map((c) => (data[c] + data[(511 * 512 + 0) * 4 + c] + data[(511 * 512 + 511) * 4 + c] + data[(511) * 4 + c]) / 4);
  for (let i = 0; i < 512 * 512; i++) {
    const d = Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const lum = 0.3 * r + 0.59 * g + 0.11 * b, bgL = 0.3 * bg[0] + 0.59 * bg[1] + 0.11 * bg[2];
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    let a = ss(24, 60, d);
    if (sat < 0.14 && lum > bgL - 95) a = 0;               // floor shadow: desaturated and only mildly darker than the backdrop
    data[i * 4 + 3] = Math.round(255 * a);
  }
  await sharp(data, { raw: { width: 512, height: 512, channels: 4 } }).trim({ threshold: 1 }).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 95 }).toFile(`${out}/${f.replace('.png', '.webp')}`);
}
console.log('items:', readdirSync(out).length);
