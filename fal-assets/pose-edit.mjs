#!/usr/bin/env node
/* SHADDAI · pose-edit.mjs — turn an approved reference into a rig-ready T-pose.
 * Same character, same outfit, only the pose/props change (seedream v4 edit, ~$0.03/img).
 * usage: node fal-assets/pose-edit.mjs <ref.png> <outPrefix> [n=2] ["extra instruction"]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = readFileSync(join(ROOT, '.env'), 'utf8').match(/^FAL_KEY\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const [, , ref, outPrefix, nArg, extra] = process.argv;
const n = parseInt(nArg || '2', 10);
const small = await sharp(resolve(ROOT, ref)).resize({ height: 1536, withoutEnlargement: true }).png().toBuffer();
const RIGSPEC = ' RIG-READY T-POSE SPEC: realistic 7.5-head adult anatomy; legs exactly half of height; both feet FLAT on the ground pointing straight at the camera at normal adult size (foot length about one head); arms perfectly symmetrical and perfectly horizontal at shoulder height with fingertip-to-fingertip span 1.05 times body height, straight elbows, normal-size open hands with separated fingers and a clear gap from the torso; orthographic front view, no perspective, symmetrical body, plain flat light grey background.';
const prompt = 'Keep this exact character: identical face, hair, skin tone, outfit, colors, materials, glowing trim, jewelry and boots. ' +
  'Change ONLY the pose: strict scarecrow T-pose facing the camera dead-on, both arms locked completely straight out horizontally to the sides at exactly shoulder height, elbows straight, both open empty hands with fingers spread, large visible gap of empty background between each hand and the torso, legs straight shoulder-width apart, feet flat. ' +
  'Nothing held: remove any weapon, prop or chain from the hands. Full body head to toe. Plain flat light-grey studio background, no shadows on the background, no text. ' + RIGSPEC + ' ' + (extra || '');
for (let i = 1; i <= n; i++) {
  const res = await fetch('https://fal.run/fal-ai/bytedance/seedream/v4/edit', {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_urls: ['data:image/png;base64,' + small.toString('base64')], image_size: { width: 1152, height: 1728 }, num_images: 1 }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const url = j?.images?.[0]?.url;
  if (!url) throw new Error('no image: ' + JSON.stringify(j).slice(0, 200));
  const out = `${outPrefix}-${i}.png`;
  writeFileSync(resolve(ROOT, out), Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log('saved', out);
}
