#!/usr/bin/env node
/* SHADDAI · fal/HF art pipeline utility — adaptive background-strip + tight-crop + resize.
 * Unlike remove-white-bg.cjs (fixed near-white key, no crop), this samples the border
 * color from each image itself (so gray/vignetted backs read as background too), keys it
 * out with a soft feather, auto-crops to the opaque content the way sharp's trim() would
 * but with a controllable pad, and resizes down to a sprite-friendly width.
 *
 * Lives under fal-assets/ so it can resolve backend/node_modules/sharp (not installed at root).
 *
 * Usage: node fal-assets/prepare-icons.cjs <in.png> <out.png> [maxWidth] [pad]
 *   maxWidth (default 128) — longest edge after crop is scaled to this.
 *   pad      (default 4)    — transparent padding px added around the cropped content.
 */
const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sharp'));

async function prepare(inPath, outPath, maxWidth = 128, pad = 4) {
  const img = sharp(path.resolve(inPath)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // border background color = mean of the 4 corners (they're background for these
  // centered icon generations; anything that touches a corner is NOT a flat icon).
  const corner = (x, y) => [data[(y * width + x) * channels], data[(y * width + x) * channels + 1], data[(y * width + x) * channels + 2]];
  let br = 0, bg = 0, bb = 0;
  for (const [x, y] of [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]]) {
    const c = corner(Math.max(0, x), Math.max(0, y)); br += c[0]; bg += c[1]; bb += c[2];
  }
  br = Math.round(br / 4); bg = Math.round(bg / 4); bb = Math.round(bb / 4);

  let minX = width, minY = height, maxX = -1, maxY = -1;
  const distCut = 28, soft = 26;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      let a;
      if (d >= distCut + soft) a = 255;
      else if (d >= distCut) a = Math.round(((d - distCut) / soft) * 255);
      else a = 0;
      data[i + 3] = a;
      if (a > 60) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('no content found in ' + inPath);

  // crop to content + pad, then resize longest edge to maxWidth (upscale small icons slightly)
  let crop = { left: Math.max(0, minX - pad), top: Math.max(0, minY - pad), width: Math.min(width, maxX - minX + 1 + pad * 2), height: Math.min(height, maxY - minY + 1 + pad * 2) };
  crop.left = Math.min(crop.left, width - crop.width);
  crop.top = Math.min(crop.top, height - crop.height);

  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  await sharp(data, { raw: { width, height, channels } })
    .extract(crop)
    .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: false })
    .png()
    .toFile(absOut);
  return absOut;
}

if (require.main === module) {
  const [, , inPath, outPath, maxWidthArg, padArg] = process.argv;
  if (!inPath || !outPath) {
    console.error('usage: node prepare-icons.cjs <in.png> <out.png> [maxWidth=128] [pad]');
    process.exit(1);
  }
  prepare(inPath, outPath, maxWidthArg ? Number(maxWidthArg) : undefined, padArg ? Number(padArg) : undefined)
    .then(out => console.log('✔', out))
    .catch(e => { console.error('✖', e.message); process.exit(1); });
}

module.exports = { prepare };