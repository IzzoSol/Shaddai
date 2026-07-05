#!/usr/bin/env node
/* PRO agent-body pipeline (see AGENT_BODY_SPEC.md). Fixes "fused hands / short / misfigured":
 *   HF FLUX clean T-POSE art (arms out, fingers spread, heroic proportions, fitted silhouette)
 *   -> Meshy image->3D (remesh + pbr) -> Meshy rigging -> walk + run(sprint) GLBs.
 * Identical framing for every agent => one consistent, interchangeable, portable family.
 *
 * Usage:  node generate-agents-pro.js vanguard            (validate ONE first)
 *         node generate-agents-pro.js                      (all 8)
 * Writes <id>{,-walk,-run}.glb + <id>-portrait.png to public/assets/forge-models/.
 * Backs up the previous model to forge-models/_v1_backup/ before overwriting.
 */
const fs = require('fs'), path = require('path');
let hf; try { hf = require('../lib/hf-keys'); } catch { console.error('hf-keys missing'); process.exit(1); }
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const MESHY = process.env.MESHY_KEY || RK.MESHY_KEY;
const H = { Authorization: 'Bearer ' + MESHY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// THE shared art direction — clean T-pose, separated limbs, heroic proportions, fitted silhouette.
const POSE = ', single full-body game character complete from head to feet, standing in a strict symmetric T-pose with both arms extended straight out horizontally to the sides at shoulder height, palms facing forward, fingers spread apart with clear empty space between the arms and the torso, legs straight and apart at shoulder width, facing the camera directly, front orthographic view, tall heroic athletic proportions about eight heads tall with long legs, anatomically correct and perfectly bilaterally symmetric, fitted form-hugging outfit with NO loose cloth no cape no flowing fabric, hair short or tied back, clean readable silhouette, plain solid light-grey background, flat even studio lighting, ultra detailed, sharp focus, 8k, entire body head to toe visible and centered';

// Per-agent design — distinct silhouette, IDENTICAL proportions/pose (via POSE above).
const AGENTS = {
  vanguard:      { color: 'cyan and steel',            desc: 'a broad-shouldered armored guardian in heavy fitted sci-fi plate armor with a sleek closed helm, glowing cyan trim and circuitry' },
  ghost:         { color: 'violet and black',          desc: 'a lean agile stealth operative in a fitted hooded matte-black bodysuit with a smooth featureless mask, glowing violet accents' },
  artisan:       { color: 'teal and bronze',           desc: 'an athletic engineer-creator in a fitted teal utility tech-suit with a slim tool harness, glowing teal seams' },
  oracle:        { color: 'deep purple and gold',      desc: 'a tall mystic seer in a fitted ceremonial bodysuit with ornate gold filigree and a thin circlet, glowing amethyst runes, NO loose robe' },
  'street-deity':{ color: 'gold and white',            desc: 'an urban hustler deity in fitted futuristic techwear with gold trim and sleek panels, confident, glowing gold accents' },
  'gaia-link':   { color: 'emerald green',             desc: 'a muscular HUMANOID bio-warrior with a clearly human body, two human arms and two human legs, wearing fitted smooth green carapace armor over human anatomy, subtle leaf motifs, glowing green bioluminescent accents' },
  psionic:       { color: 'magenta pink and silver',   desc: 'a psychic operative in a sleek fitted silver bodysuit with glowing magenta neural channels running across it' },
  harvester:     { color: 'crimson red and black',     desc: 'a dark-ops reaper in fitted tactical armor with a hood down, sharp angular plates, glowing crimson optics' },
};

async function post(ep, body) { const r = await fetch('https://api.meshy.ai/openapi/v1/' + ep, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(ep + ' ' + r.status + ' ' + JSON.stringify(j)); return j; }
async function waitGet(ep, id) { for (let i = 0; i < 100; i++) { await sleep(15000); const o = await (await fetch('https://api.meshy.ai/openapi/v1/' + ep + '/' + id, { headers: H })).json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error(ep + ' failed ' + JSON.stringify(o.task_error)); } throw new Error(ep + ' timeout'); }
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!MESHY) { console.error('no MESHY_KEY'); process.exit(1); }
  const outDir = path.join(__dirname, '..', '..', 'public', 'assets', 'forge-models');
  const bak = path.join(outDir, '_v1_backup'); fs.mkdirSync(bak, { recursive: true });
  const only = process.argv.slice(2).filter(a => AGENTS[a]);
  const ids = only.length ? only : Object.keys(AGENTS);
  for (const id of ids) {
    const a = AGENTS[id];
    try {
      console.log(id, '— HF T-pose art…');
      const png = await hf.generate(a.desc + ', dominant ' + a.color + ' color scheme' + POSE);
      fs.writeFileSync(path.join(outDir, id + '-portrait.png'), png);
      const dataUri = 'data:image/png;base64,' + png.toString('base64');
      console.log(' ', id, '— Meshy image->3D (remesh+pbr)…');
      const img = (await post('image-to-3d', { image_url: dataUri, should_remesh: true, enable_pbr: true })).result;
      await waitGet('image-to-3d', img);
      console.log(' ', id, '— rigging (walk + run)…');
      const rig = (await post('rigging', { input_task_id: img, character_height: 1.8 })).result;
      const res = (await waitGet('rigging', rig)).result || {};
      // back up the previous model files once, then overwrite
      for (const suf of ['.glb', '-walk.glb', '-run.glb']) { const f = path.join(outDir, id + suf); if (fs.existsSync(f) && !fs.existsSync(path.join(bak, id + suf))) fs.copyFileSync(f, path.join(bak, id + suf)); }
      if (res.rigged_character_glb_url) await dl(res.rigged_character_glb_url, path.join(outDir, id + '.glb'));
      const an = res.basic_animations || {};
      if (an.walking_glb_url) await dl(an.walking_glb_url, path.join(outDir, id + '-walk.glb'));
      if (an.running_glb_url) await dl(an.running_glb_url, path.join(outDir, id + '-run.glb'));
      console.log('  DONE:', id);
    } catch (e) { console.log('  FAIL:', id, e.message); }
  }
  console.log('AGENTS-PRO DONE');
})();
