#!/usr/bin/env node
/* Generate a 3D character model per Forge archetype via Meshy text->3D.
 * Saves public/assets/forge-models/<archetype>.glb + .png, writes manifest.json.
 * Skips archetypes whose .glb already exists. Run: node backend/scripts/generate-forge-models-meshy.js
 */
const fs = require('fs'), path = require('path');
const { ARCHETYPES, ASSETS } = require('../forge/forge-core');
const KEY = process.env.MESHY_KEY || (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')).MESHY_KEY || ''; } catch { return ''; } })();
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function promptFor(code) {
  const a = ARCHETYPES[code]; const f = [];
  for (const s of ['body', 'headwear', 'outfit', 'handheld', 'hair', 'eyes', 'aura']) {
    const part = ASSETS[s] && ASSETS[s][a.loadout[s]]; if (part && part.fragment) f.push(part.fragment);
  }
  return f.join(', ') + ', full body character, standing T-pose, game-ready, neon sci-fi, clean topology, centered, no text';
}
async function meshy(prompt) {
  const r = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview', prompt, art_style: 'realistic', should_remesh: true }),
  });
  const j = await r.json(); if (!r.ok) throw new Error('submit ' + r.status + ' ' + JSON.stringify(j));
  const id = j.result;
  for (let i = 0; i < 60; i++) {
    await sleep(15000);
    const s = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d/' + id, { headers: { Authorization: 'Bearer ' + KEY } });
    const o = await s.json();
    if (o.status === 'SUCCEEDED') return o;
    if (o.status === 'FAILED') throw new Error('failed ' + JSON.stringify(o.task_error));
  }
  throw new Error('timeout');
}
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  const manifest = { archetypes: {} };
  for (const code of Object.keys(ARCHETYPES)) {
    const glb = path.join(OUT, code + '.glb');
    const entry = { glb: '/assets/forge-models/' + code + '.glb', thumb: '/assets/forge-models/' + code + '.png', name: ARCHETYPES[code].name };
    if (fs.existsSync(glb)) { manifest.archetypes[code] = entry; console.log('skip (exists):', code); continue; }
    try {
      console.log('generating:', code);
      const o = await meshy(promptFor(code));
      if (o.model_urls && o.model_urls.glb) await dl(o.model_urls.glb, glb);
      if (o.thumbnail_url) await dl(o.thumbnail_url, path.join(OUT, code + '.png'));
      manifest.archetypes[code] = entry;
      console.log('  done:', code, (fs.statSync(glb).size / 1024 / 1024).toFixed(2) + 'MB');
    } catch (e) { console.log('  FAIL:', code, e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('MANIFEST WRITTEN:', Object.keys(manifest.archetypes).length, 'archetypes');
})();
