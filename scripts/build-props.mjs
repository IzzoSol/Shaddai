// Optimize static VFX prop meshes (Oracle glow, SHADDAI blast, thrown blade) → assets/vfx.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const W = 'C:\\Users\\Brittany\\OneDrive\\Desktop\\SHADDAI WORLD';
const DL = 'C:\\Users\\Brittany\\OneDrive\\Desktop\\New folder\\Downloads';
const OUT = 'C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\public\\assets\\vfx';
fs.mkdirSync(OUT, { recursive: true });

const PROPS = {
  'oracle-glow': `${W}\\Meshy_AI_Violet_Storm_Core_0707071909_texture.glb`,
  'shaddai-blast': `${DL}\\Meshy_AI_Solar_Tempest_0707164922_texture.glb`,
  'emberblade': `${W}\\Meshy_AI_Emberblade_0707081646_texture.glb`,
};

for(const [name, src] of Object.entries(PROPS)){
  if(!fs.existsSync(src)){ console.log(`skip ${name} (missing: ${src})`); continue; }
  const doc = await io.read(src);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.01 }), dedup(), prune());
  for(const tex of doc.getRoot().listTextures()){
    const img = tex.getImage(); if(!img) continue;
    const p = sharp(Buffer.from(img)).resize(1024, 1024, { fit:'inside', withoutEnlargement:true });
    const buf = tex.getMimeType() === 'image/png' ? await p.png().toBuffer() : await p.jpeg({ quality:88 }).toBuffer();
    tex.setImage(new Uint8Array(buf));
  }
  const outPath = path.join(OUT, `${name}.glb`);
  await io.write(outPath, doc);
  console.log(`✓ ${name}.glb  ${(fs.statSync(outPath).size/1024).toFixed(0)} KB`);
}
console.log('Done.');
