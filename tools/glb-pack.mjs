// tools/glb-pack.mjs — shrink a kit GLB for fast loading with NO visible loss (2026-10-23): dedup + weld + KHR_mesh_quantization
// (positions 14-bit, normals 10, colours 16 - read natively by three.js GLTFLoader, no decoder). Backs up to fal-assets/backups/glb-prepack/.
// Aborts a file if it would not get smaller.   node tools/glb-pack.mjs <file.glb> [...]
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, quantize, prune } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync('fal-assets/backups/glb-prepack', { recursive: true });
for (const f of process.argv.slice(2)) {
  const before = fs.statSync(f).size, doc = await io.read(f);
  await doc.transform(dedup(), weld(), prune({ keepLeaves: true, keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 16, quantizeTexcoord: 12 }));
  const out = await io.writeBinary(doc);
  if (out.byteLength >= before) { console.log('skip (not smaller)', f); continue; }
  fs.copyFileSync(f, path.join('fal-assets/backups/glb-prepack', path.basename(f))); fs.writeFileSync(f, out);
  console.log(path.basename(f), (before / 1e6).toFixed(2), '->', (out.byteLength / 1e6).toFixed(2), 'MB');
}
