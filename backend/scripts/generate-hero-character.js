#!/usr/bin/env node
/* Generate an ORIGINAL SHADDAI hero character via Meshy (text->3D preview->refine),
 * then attempt Meshy rigging + walk animation. Saves to public/assets/player/hero*.glb.
 * Best-effort: if rigging isn't available, saves the textured static hero.
 */
const fs = require('fs'), path = require('path');
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const KEY = process.env.MESHY_KEY || RK.MESHY_KEY;
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'player');
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROMPT = 'an original SHADDAI hero operative, sleek humanoid in neon Tron armor, glowing cyan and gold circuit lines, dark sci-fi bodysuit, heroic standing T-pose, full body, game-ready, clean topology, centered';

async function post(url, body) { const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(url.split('/').pop() + ' ' + r.status + ' ' + JSON.stringify(j)); return j; }
async function waitT2(id) { for (let i = 0; i < 80; i++) { await sleep(15000); const s = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d/' + id, { headers: H }); const o = await s.json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error('t2d failed'); } throw new Error('t2d timeout'); }
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!KEY) { console.error('no MESHY_KEY'); process.exit(1); }
  try {
    console.log('hero preview…');
    const prev = (await post('https://api.meshy.ai/openapi/v2/text-to-3d', { mode: 'preview', prompt: PROMPT, art_style: 'realistic', should_remesh: true })).result;
    await waitT2(prev);
    console.log('hero refine (textures)…');
    const ref = (await post('https://api.meshy.ai/openapi/v2/text-to-3d', { mode: 'refine', preview_task_id: prev })).result;
    const refined = await waitT2(ref);
    if (refined.model_urls && refined.model_urls.glb) await dl(refined.model_urls.glb, path.join(OUT, 'hero.glb'));
    if (refined.thumbnail_url) await dl(refined.thumbnail_url, path.join(OUT, 'hero.png'));
    console.log('  saved hero.glb (static, textured, original)');
    // best-effort rigging + walk animation
    try {
      console.log('attempting rig…');
      const rig = await post('https://api.meshy.ai/openapi/v1/rigging', { input_task_id: ref, character_height: 1.8 });
      const rigId = rig.result;
      let rigged = null;
      for (let i = 0; i < 80; i++) { await sleep(15000); const s = await fetch('https://api.meshy.ai/openapi/v1/rigging/' + rigId, { headers: H }); const o = await s.json(); if (o.status === 'SUCCEEDED') { rigged = o; break; } if (o.status === 'FAILED') throw new Error('rig failed ' + JSON.stringify(o.task_error)); }
      if (rigged) {
        const res = rigged.result || rigged;
        if (res.rigged_character_glb_url) { await dl(res.rigged_character_glb_url, path.join(OUT, 'hero-rigged.glb')); console.log('  saved hero-rigged.glb'); }
        const anims = res.basic_animations;
        console.log('  basic_animations:', JSON.stringify(anims).slice(0, 400));
        if (anims) {
          const list = Array.isArray(anims) ? anims : Object.entries(anims).map(([k, v]) => ({ name: k, glb_url: (v && (v.glb_url || v.url)) || (typeof v === 'string' ? v : null) }));
          for (const a of list) { const u = a.glb_url || a.url; const nm = String(a.name || 'anim').toLowerCase().replace(/[^a-z]/g, ''); if (u) { try { await dl(u, path.join(OUT, 'hero-' + nm + '.glb')); console.log('  anim:', nm); } catch {} } }
        }
      }
    } catch (e) { console.log('  rigging not completed:', e.message, '(use static hero or robot for walking)'); }
    console.log('HERO DONE');
  } catch (e) { console.log('HERO FAIL:', e.message); }
})();
