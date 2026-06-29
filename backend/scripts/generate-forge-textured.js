#!/usr/bin/env node
/* Regenerate Forge archetype models WITH textures: Meshy preview -> refine (textured).
 * Overwrites public/assets/forge-models/<archetype>.glb. Keys from runtime-keys.json.
 */
const fs = require('fs'), path = require('path');
const { ARCHETYPES, ASSETS } = require('../forge/forge-core');
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const KEY = process.env.MESHY_KEY || RK.MESHY_KEY;
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

function promptFor(code) {
  const a = ARCHETYPES[code]; const f = [];
  for (const s of ['body', 'headwear', 'outfit', 'handheld', 'hair', 'eyes', 'aura']) {
    const p = ASSETS[s] && ASSETS[s][a.loadout[s]]; if (p && p.fragment) f.push(p.fragment);
  }
  return f.join(', ') + ', full body character, standing T-pose, game-ready, neon sci-fi, centered, no text';
}
async function submit(body) { const r = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d', { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error('submit ' + r.status + ' ' + JSON.stringify(j)); return j.result; }
async function wait(id) { for (let i = 0; i < 80; i++) { await sleep(15000); const s = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d/' + id, { headers: H }); const o = await s.json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error('failed ' + JSON.stringify(o.task_error)); } throw new Error('timeout'); }
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!KEY) { console.error('no MESHY_KEY'); process.exit(1); }
  const manifest = { archetypes: {} };
  for (const code of Object.keys(ARCHETYPES)) {
    const glbp = path.join(OUT, code + '.glb');
    if (fs.existsSync(glbp) && fs.statSync(glbp).size > 3 * 1024 * 1024) {
      console.log('skip (already textured):', code);
      manifest.archetypes[code] = { glb: '/assets/forge-models/' + code + '.glb', thumb: '/assets/forge-models/' + code + '.png', name: ARCHETYPES[code].name };
      continue;
    }
    try {
      console.log('preview:', code);
      const prev = await submit({ mode: 'preview', prompt: promptFor(code), art_style: 'realistic', should_remesh: true });
      await wait(prev);
      console.log('  refine (textures):', code);
      const ref = await submit({ mode: 'refine', preview_task_id: prev });
      const o = await wait(ref);
      if (o.model_urls && o.model_urls.glb) await dl(o.model_urls.glb, path.join(OUT, code + '.glb'));
      if (o.thumbnail_url) await dl(o.thumbnail_url, path.join(OUT, code + '.png'));
      console.log('  done (textured):', code);
    } catch (e) { console.log('  FAIL:', code, e.message); }
    manifest.archetypes[code] = { glb: '/assets/forge-models/' + code + '.glb', thumb: '/assets/forge-models/' + code + '.png', name: ARCHETYPES[code].name };
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('FORGE TEXTURED DONE');
})();
