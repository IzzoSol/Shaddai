#!/usr/bin/env node
/* SHADDAI · build-web-sprites.mjs — package rig-captured sprites for the 2D game.
 * fal-assets/characters/<src>/sprites/*-strip.png (8x 512px, PNG) -> public/assets/characters/<id>/{walk,run,action}.webp
 * (8x 256px) + meta.json, and public/assets/characters/index.json (loaded by pixel-people.js).
 * Same rigs feed the 3D realm, so 2D and 3D show the identical character (parity by construction).
 * usage: node tools/build-web-sprites.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CELL = 256, FRAMES = 8;
// game id -> capture source dir (oracle uses the skin-guided rebuild)
const MAP = {
  zerox: 'zerox-council', quill: 'quill-council', oracle: 'oracle-c2', turtle: 'turtle-council', nexus: 'nexus-council', pikadon: 'pikadon-council', shaddai: 'shaddai-council',
  leadr: 'leadr', gaeli: 'gaeli',
};
const NAMES = { zerox: 'ZEROX', quill: 'QUILL', oracle: 'ORACLE', turtle: 'TURTLE', nexus: 'NEXUS', pikadon: 'PIKADON', shaddai: 'SHADDAI', leadr: 'Leadr', gaeli: 'Gaeli' };
const outRoot = join(ROOT, 'public/assets/characters');
const index = [];
for (const [id, src] of Object.entries(MAP)) {
  const sdir = join(ROOT, 'fal-assets/characters', src, 'sprites');
  if (!existsSync(join(sdir, `${src}-walking-strip.png`))) { console.log(`skip ${id}: no sprites (${src})`); continue; }
  const odir = join(outRoot, id); mkdirSync(odir, { recursive: true });
  const clips = {};
  for (const [clip, file] of [['walk', 'walking'], ['run', 'running'], ['action', 'action']]) {
    const p = join(sdir, `${src}-${file}-strip.png`);
    if (!existsSync(p)) continue;
    await sharp(p).resize({ width: CELL * FRAMES, height: CELL, kernel: 'lanczos3' }).webp({ quality: 88, alphaQuality: 100 }).toFile(join(odir, `${clip}.webp`));
    clips[clip] = `${clip}.webp`;
  }
  // stand metrics from walk frame 0 (non-transparent bbox, in cell px) -> runtime scales every character to the same world height
  const f0 = await sharp(join(sdir, `${src}-walking-strip.png`)).extract({ left: 0, top: 0, width: 512, height: 512 }).resize(CELL, CELL).ensureAlpha().raw().toBuffer();
  let top = CELL, bottom = 0, left = CELL, right = 0;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (f0[(y * CELL + x) * 4 + 3] > 24) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
  const meta = { id, name: NAMES[id], src, cell: CELL, frames: FRAMES, clips, standH: bottom - top, footY: bottom, centerX: (left + right) / 2 };
  writeFileSync(join(odir, 'meta.json'), JSON.stringify(meta, null, 1));
  index.push({ id, dir: `assets/characters/${id}/`, ...meta });
  console.log(`ok ${id}  standH=${meta.standH}px footY=${meta.footY}`);
}
writeFileSync(join(outRoot, 'index.json'), JSON.stringify(index, null, 1));
console.log(`index: ${index.length} characters`);
