#!/usr/bin/env node
/* QUALITY character pipeline (run ONCE, no re-rolling):
 *   HF FLUX full-body portrait  ->  Meshy IMAGE->3D (matches the art)  ->  Meshy rig -> walk/run.
 * Produces proportionate, colored, textured, rigged characters.
 *   hero  -> public/assets/player/hero{,-walk,-run}.glb
 *   8 archetypes -> public/assets/forge-models/<code>{,-walk,-run}.glb
 * Skips a character if its -walk.glb already exists (so reruns only fill gaps — saves credits).
 */
const fs = require('fs'), path = require('path');
let hf; try { hf = require('../lib/hf-keys'); } catch { console.error('hf-keys missing'); process.exit(1); }
const { ARCHETYPES, ASSETS } = require('../forge/forge-core');
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const MESHY = process.env.MESHY_KEY || RK.MESHY_KEY;
const H = { Authorization: 'Bearer ' + MESHY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FRAMING = ', full body character from head to feet, proportionate human anatomy, symmetrical, standing straight neutral A-pose, centered, plain light-grey studio background, neon Tron sci-fi hero, vibrant colors, cinematic rim light, high detail, sharp, 3/4 front view';
const NEG = 'cropped, cut off, deformed, extra limbs, mutated hands, blurry, low quality, multiple characters, text, watermark';

function archPrompt(code) {
  const a = ARCHETYPES[code]; const f = [];
  for (const s of ['body', 'outfit', 'headwear', 'handheld', 'hair', 'eyes', 'aura']) { const p = ASSETS[s] && ASSETS[s][a.loadout[s]]; if (p && p.fragment) f.push(p.fragment); }
  return f.join(', ');
}
const CHARS = [
  { id: 'hero', dir: 'player', prompt: 'an original SHADDAI hero operative, sleek athletic humanoid in neon Tron armor, glowing cyan and gold circuit lines, dark sci-fi bodysuit, confident stance' },
  ...Object.keys(ARCHETYPES).map(code => ({ id: code, dir: 'forge-models', prompt: archPrompt(code) })),
];

async function post(ep, body) { const r = await fetch('https://api.meshy.ai/openapi/v1/' + ep, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(ep + ' ' + r.status + ' ' + JSON.stringify(j)); return j; }
async function waitGet(ep, id) { for (let i = 0; i < 90; i++) { await sleep(15000); const o = await (await fetch('https://api.meshy.ai/openapi/v1/' + ep + '/' + id, { headers: H })).json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error(ep + ' failed ' + JSON.stringify(o.task_error)); } throw new Error(ep + ' timeout'); }
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!MESHY) { console.error('no MESHY_KEY'); process.exit(1); }
  const root = path.join(__dirname, '..', '..', 'public', 'assets');
  const only = process.argv.slice(2);
  const list = only.length ? CHARS.filter(c => only.includes(c.id)) : CHARS;
  for (const c of list) {
    const outDir = path.join(root, c.dir);
    if (fs.existsSync(path.join(outDir, c.id + '-walk.glb'))) { console.log('skip (done):', c.id); continue; }
    try {
      console.log(c.id, '— HF portrait…');
      const png = await hf.generate(c.prompt + FRAMING);
      fs.writeFileSync(path.join(outDir, c.id + '-portrait.png'), png);
      const dataUri = 'data:image/png;base64,' + png.toString('base64');
      console.log(' ', c.id, '— Meshy image->3D…');
      const img = (await post('image-to-3d', { image_url: dataUri, should_remesh: true, enable_pbr: true })).result;
      await waitGet('image-to-3d', img);
      console.log(' ', c.id, '— rig…');
      const rig = (await post('rigging', { input_task_id: img, character_height: 1.8 })).result;
      const res = (await waitGet('rigging', rig)).result || {};
      if (res.rigged_character_glb_url) await dl(res.rigged_character_glb_url, path.join(outDir, c.id + '.glb'));
      const an = res.basic_animations || {};
      if (an.walking_glb_url) await dl(an.walking_glb_url, path.join(outDir, c.id + '-walk.glb'));
      if (an.running_glb_url) await dl(an.running_glb_url, path.join(outDir, c.id + '-run.glb'));
      console.log('  DONE:', c.id);
    } catch (e) { console.log('  FAIL:', c.id, e.message); }
  }
  console.log('QUALITY CHARACTERS DONE');
})();
