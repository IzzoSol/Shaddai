#!/usr/bin/env node
/* SHADDAI · make-seamless.mjs — turn any texture into a tile that repeats with no visible seam.
 * Method: cross-fade the image with a half-offset copy using a soft cosine mask that is 0 at the
 * center-lines (where the original edges meet after offset) so the seam is always inside blended pixels.
 * usage: node tools/make-seamless.mjs <in.png> <out.png> [size=1024]
 */
import sharp from 'sharp';
const [, , inp, out, sz] = process.argv, N = parseInt(sz || '1024', 10);
const src = await sharp(inp).resize(N, N).removeAlpha().raw().toBuffer();
const dst = Buffer.alloc(N * N * 3);
const h = N / 2;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  // weight of the ORIGINAL pixel: 1 at the tile center, 0 at the tile borders (cosine falloff on both axes)
  const wx = Math.sin(Math.PI * x / N), wy = Math.sin(Math.PI * y / N);
  const w = wx * wx * wy * wy;                       // 0 on all four borders
  const ox = (x + h) % N, oy = (y + h) % N;          // half-offset source
  const i = (y * N + x) * 3, o = (oy * N + ox) * 3;
  for (let c = 0; c < 3; c++) dst[i + c] = Math.round(src[i + c] * w + src[o + c] * (1 - w));
}
await sharp(dst, { raw: { width: N, height: N, channels: 3 } }).png().toFile(out);
console.log('seamless', out);
