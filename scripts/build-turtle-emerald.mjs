/**
 * build-turtle-emerald.mjs
 * Rebuilds TURTLE's body from the new Meshy "Emerald Enforcer" biped export.
 *
 * Takes the Merged_Animations GLB (mesh + 20 raw Meshy clips), keeps the 7
 * canonical clips the world expects, renames them to idle/walk/run/attack1/
 * attack2/heavy/flip, prunes everything else, and shrinks textures to 1024 so
 * the world stays fast. Output is a drop-in replacement for the existing
 * /assets/agents/TURTLE.glb (same 24-joint Meshy skeleton).
 *
 *   node scripts/build-turtle-emerald.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = 'C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads/Meshy_AI_Emerald_Enforcer_biped/Meshy_AI_Emerald_Enforcer_biped/Meshy_AI_Emerald_Enforcer_biped_Meshy_AI_Meshy_Merged_Animations.glb';
const OUT = path.resolve('public/assets/agents/TURTLE.glb');

// canonical world clip name  <-  Meshy source clip name
const CLIP_MAP = {
  idle:    'Boxing_Practice',      // in-place combat-ready stance
  walk:    'Walking',
  run:     'Running',
  attack1: 'Kung_Fu_Punch',
  attack2: 'Triple_Combo_Attack',
  heavy:   'Charged_Upward_Slash',
  flip:    'Backflip_Sweep_Kick',
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const doc = await io.read(SRC);
const root = doc.getRoot();

// index animations by name
const byName = new Map();
for (const anim of root.listAnimations()) byName.set(anim.getName(), anim);

// verify every source clip exists
for (const [canon, src] of Object.entries(CLIP_MAP)) {
  if (!byName.has(src)) throw new Error(`source clip "${src}" (for ${canon}) not found in export`);
}

const keep = new Set(Object.values(CLIP_MAP));
// dispose clips we are not keeping
for (const anim of root.listAnimations()) {
  if (!keep.has(anim.getName())) anim.dispose();
}
// rename kept clips to canonical names
for (const [canon, src] of Object.entries(CLIP_MAP)) {
  byName.get(src).setName(canon);
}

await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, resize: [1024, 1024] }), // resize only, keep original format (loader dislikes webp)
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('wrote', OUT, kb + ' KB');
console.log('clips:', root.listAnimations().map(a => a.getName()).join(', '));
