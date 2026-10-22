// tools/glb-webp.mjs — re-encode a GLB's textures as WebP (EXT_texture_webp) at FULL resolution, in place.  node tools/glb-webp.mjs <file.glb> [...] [--q=90]
// Detail is not capped (owner rule): no resize, quality 90. Mesh, skin and clips are untouched. Aborts a file if the result is not smaller.
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const q = +((process.argv.find((a) => a.startsWith('--q=')) || '--q=90').slice(4));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const before = fs.statSync(f).size, doc = await io.read(f);
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: q }));
  const out = Buffer.from(await io.writeBinary(doc));
  if (out.length >= before) { console.log('skip', f, '(not smaller)'); continue; }
  fs.writeFileSync(f, out); console.log(f, (before / 1048576).toFixed(2) + ' MB -> ' + (out.length / 1048576).toFixed(2) + ' MB');
}
