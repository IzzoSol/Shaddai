#!/usr/bin/env node
/* Rig + animate the 8 Forge archetypes (Meshy preview->refine->rig).
 * Saves per archetype: <code>.glb (rigged+textured base), <code>-walk.glb, <code>-run.glb to public/assets/forge-models/.
 * Skips an archetype if <code>-walk.glb already exists. Keys from runtime-keys.json.
 */
const fs = require('fs'), path = require('path');
const { ARCHETYPES, ASSETS } = require('../forge/forge-core');
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const KEY = process.env.MESHY_KEY || RK.MESHY_KEY;
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const promptFor = (code) => { const a = ARCHETYPES[code]; const f = []; for (const s of ['body','headwear','outfit','handheld','hair','eyes','aura']) { const p = ASSETS[s] && ASSETS[s][a.loadout[s]]; if (p && p.fragment) f.push(p.fragment); } return f.join(', ') + ', full body character, standing T-pose, game-ready, neon sci-fi, centered, no text'; };
async function post(u, b) { const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(r.status + ' ' + JSON.stringify(j)); return j; }
async function waitT2(id) { for (let i = 0; i < 80; i++) { await sleep(15000); const o = await (await fetch('https://api.meshy.ai/openapi/v2/text-to-3d/' + id, { headers: H })).json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error('t2d failed'); } throw new Error('t2d timeout'); }
async function waitRig(id) { for (let i = 0; i < 80; i++) { await sleep(15000); const o = await (await fetch('https://api.meshy.ai/openapi/v1/rigging/' + id, { headers: H })).json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error('rig failed'); } throw new Error('rig timeout'); }
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!KEY) { console.error('no MESHY_KEY'); process.exit(1); }
  const only = process.argv.slice(2).filter(a => ARCHETYPES[a]);
  const codes = only.length ? only : Object.keys(ARCHETYPES);
  for (const code of codes) {
    if (fs.existsSync(path.join(OUT, code + '-walk.glb'))) { console.log('skip (rigged):', code); continue; }
    try {
      console.log(code, 'preview…');
      const prev = (await post('https://api.meshy.ai/openapi/v2/text-to-3d', { mode: 'preview', prompt: promptFor(code), art_style: 'realistic', should_remesh: true })).result;
      await waitT2(prev);
      console.log(' ', code, 'refine…');
      const ref = (await post('https://api.meshy.ai/openapi/v2/text-to-3d', { mode: 'refine', preview_task_id: prev })).result;
      await waitT2(ref);
      console.log(' ', code, 'rig…');
      const rig = (await post('https://api.meshy.ai/openapi/v1/rigging', { input_task_id: ref, character_height: 1.8 })).result;
      const res = (await waitRig(rig)).result || {};
      if (res.rigged_character_glb_url) await dl(res.rigged_character_glb_url, path.join(OUT, code + '.glb'));
      const a = res.basic_animations || {};
      if (a.walking_glb_url) await dl(a.walking_glb_url, path.join(OUT, code + '-walk.glb'));
      if (a.running_glb_url) await dl(a.running_glb_url, path.join(OUT, code + '-run.glb'));
      console.log('  done (rigged+animated):', code);
    } catch (e) { console.log('  FAIL:', code, e.message); }
  }
  console.log('FORGE RIGGED DONE');
})();
