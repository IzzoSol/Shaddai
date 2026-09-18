#!/usr/bin/env node
/* SHADDAI · deterministic duotone + film-grain post-process for character-select icons.
 * Takes the clean cel-shaded raw icons (fal-assets/spike/icon-<id>-raw.png) and forces
 * a true single-hue duotone (every luminance value -> one interpolated hue) plus uniform
 * film grain, since flux keeps reverting to multi-hue palettes and sticker borders no
 * matter how the prompt asks for duotone directly.
 *
 * Usage: node fal-assets/duotone-icons.mjs
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SPIKE = resolve(ROOT, 'fal-assets/spike');
const OUT_DIR = resolve(SPIKE, 'icons');

const HUES = {
  warrior:  { shadow: [0x4a, 0x00, 0x26], highlight: [0xff, 0x2f, 0xb0] }, // magenta
  mage:     { shadow: [0x17, 0x0a, 0x3d], highlight: [0x6a, 0x3d, 0xff] }, // indigo
  explorer: { shadow: [0x04, 0x33, 0x3a], highlight: [0x29, 0xe8, 0xff] }, // cyan
  engineer: { shadow: [0x3d, 0x1c, 0x00], highlight: [0xff, 0x8c, 0x1a] }, // orange
  scout:    { shadow: [0x1c, 0x33, 0x00], highlight: [0x9d, 0xff, 0x29] }, // lime
  shaddai:  { shadow: [0x3d, 0x2e, 0x00], highlight: [0xff, 0xd2, 0x3d] }, // gold
  nexus:    { shadow: [0x22, 0x33, 0x00], highlight: [0xc6, 0xff, 0x29] }, // chartreuse
  zerox:    { shadow: [0x00, 0x1a, 0x3d], highlight: [0x2f, 0x8c, 0xff] }, // electric blue
  oracle:   { shadow: [0x25, 0x0a, 0x3d], highlight: [0xb0, 0x2f, 0xff] }, // violet
  turtle:   { shadow: [0x00, 0x33, 0x1c], highlight: [0x29, 0xff, 0x8c] }, // emerald
  quill:    { shadow: [0x00, 0x33, 0x2e], highlight: [0x29, 0xff, 0xd6] }, // teal
  pikadon:  { shadow: [0x3d, 0x00, 0x00], highlight: [0xff, 0x2f, 0x2f] }, // red
};

const GRAIN_OPACITY = 0.16; // uniform fine-grained noise strength

function buildLut(shadow, highlight) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let l = 0; l < 256; l++) {
    const t = l / 255;
    for (let c = 0; c < 3; c++) {
      lut[l * 3 + c] = shadow[c] + (highlight[c] - shadow[c]) * t;
    }
  }
  return lut;
}

async function duotoneOne(id) {
  const hue = HUES[id];
  if (!hue) throw new Error(`no hue mapping for "${id}"`);
  const lut = buildLut(hue.shadow, hue.highlight);

  const inPath = resolve(SPIKE, `icon-${id}-raw.png`);
  const { data, info } = await sharp(inPath)
    .flatten({ background: '#ffffff' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  const noise = await sharp({
    create: {
      width, height, channels: 1,
      noise: { type: 'gaussian', mean: 128, sigma: 45 },
    },
  }).raw().toBuffer();

  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const grained = Math.max(0, Math.min(255, data[i] + (noise[i] - 128) * GRAIN_OPACITY));
    const l = Math.round(grained);
    rgb[i * 3] = lut[l * 3];
    rgb[i * 3 + 1] = lut[l * 3 + 1];
    rgb[i * 3 + 2] = lut[l * 3 + 2];
  }

  const outPath = resolve(OUT_DIR, `${id}.png`);
  await sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(outPath);
  console.log(`  ✔ ${id} → ${outPath.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const ids = Object.keys(HUES);
  console.log(`▶ duotone + grain — ${ids.length} icons`);
  for (const id of ids) {
    await duotoneOne(id);
  }
  console.log('DONE');
}

main().catch((err) => { console.error(err); process.exit(1); });
