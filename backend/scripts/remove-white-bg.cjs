#!/usr/bin/env node
/* SHADDAI · fal/HF art pipeline utility — naive near-white chroma-key removal.
 * Generation outputs (fal flux/dev, HF FLUX) come back on a flat white/light
 * background, never real transparency; this converts near-white pixels to
 * alpha=0 with a soft feather at the edge. Lives under backend/ so it can
 * resolve backend/node_modules/sharp (not installed at repo root).
 *
 * Usage: node backend/scripts/remove-white-bg.cjs <in.png> <out.png> [threshold=235]
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function removeWhite(inPath, outPath, threshold = 235) {
  const img = sharp(path.resolve(inPath)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0; // fully transparent
    } else if (r >= threshold - 25 && g >= threshold - 25 && b >= threshold - 25) {
      // soft edge feather for anti-aliased near-white pixels
      const avg = (r + g + b) / 3;
      data[i + 3] = Math.max(0, Math.min(255, Math.round((threshold - avg) * (255 / 25))));
    }
  }
  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  await sharp(data, { raw: { width, height, channels } }).png().toFile(absOut);
  return absOut;
}

if (require.main === module) {
  const [, , inPath, outPath, thresholdArg] = process.argv;
  if (!inPath || !outPath) {
    console.error('usage: node remove-white-bg.cjs <in.png> <out.png> [threshold=235]');
    process.exit(1);
  }
  removeWhite(inPath, outPath, thresholdArg ? Number(thresholdArg) : undefined)
    .then(out => console.log('✔', out))
    .catch(e => { console.error('✖', e.message); process.exit(1); });
}

module.exports = { removeWhite };
