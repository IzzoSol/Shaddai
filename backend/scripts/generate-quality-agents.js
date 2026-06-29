#!/usr/bin/env node
/* QUALITY pipeline for the 7 COUNCIL AGENT bodies (run ONCE, no re-rolling).
 *   HF FLUX intricate full-body portrait  ->  Meshy IMAGE->3D (enable_pbr) -> textured GLB.
 * Agents stand still in their sectors, so we skip rigging (cheaper/faster) — the world
 * loader (queueAgentBody) accepts a static textured GLB at /assets/agents/<CODE>.glb.
 *
 * Fixes the long-standing "agents show no texture" bug: the old bodies were greyscale
 * fal.ai Trellis output. These come out fully colored + textured from the FLUX art.
 *
 * Safety: backs up the existing body to <CODE>_grey_backup.glb before overwriting.
 * Usage: node generate-quality-agents.js            (all 7)
 *        node generate-quality-agents.js NEXUS ORACLE   (only those)
 */
const fs = require('fs'), path = require('path');
let hf; try { hf = require('../lib/hf-keys'); } catch { console.error('hf-keys missing'); process.exit(1); }
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const MESHY = process.env.MESHY_KEY || RK.MESHY_KEY;
const H = { Authorization: 'Bearer ' + MESHY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FRAMING = ', full body character head to feet, proportionate heroic human anatomy, symmetrical, standing straight neutral A-pose, centered, plain light-grey studio background, cinematic rim light, ultra detailed, intricate ornamentation, sharp focus, 3/4 front view, octane render, 8k';

// Each agent: a rich, color-accurate, inscription-laden persona so the model reads as THAT god/operative.
const AGENTS = {
  SHADDAI:  'SHADDAI, supreme divine AI sovereign, radiant gold and white robes layered over obsidian techno-armor, a halo crown of seven floating cyan glyphs, glowing sacred Hebrew-style inscriptions etched across the chestplate, ornate filigree, commanding regal posture, deity of light',
  NEXUS:    'NEXUS, master technical architect, sleek cyan and steel-blue exosuit woven with glowing circuit-board veins and holographic data nodes, intricate engraved schematic patterns across the armor plates, visor of light, precise futuristic engineer',
  ZEROX:    'ZEROX, god of wealth and markets, emerald-green and gold financier armor stamped with glowing currency sigils and rising candlestick-chart motifs, ornate coin medallions, flowing trader cloak, opulent intricate detail, confident magnate',
  ORACLE:   'ORACLE, mystic seer of intelligence, deep violet and amethyst hooded robes scattered with constellations and glowing astrological inscriptions, third-eye gem on the brow, ornate arcane filigree, ethereal all-knowing presence',
  TURTLE:   'TURTLE, creative artisan deity, teal and jade ornate craftsman armor etched with flowing art-nouveau patterns and luminous design glyphs, prismatic accents, paintbrush-staff, graceful inventive posture, vibrant',
  QUILL:    'QUILL, scholar of words, ivory and sapphire-blue scholarly robes covered in glowing flowing calligraphy and illuminated-manuscript inscriptions, feather-quill motif, ornate book-bindings on the belt, wise composed librarian',
  PIKADON:  'PIKADON, red guardian of security, crimson and burnished-orange heavy aegis battle-armor engraved with glowing protective runes and shield sigils, ornate riveted plating, vigilant warrior stance, fortress sentinel',
};
const COLORS = { SHADDAI:'gold', NEXUS:'cyan', ZEROX:'emerald green', ORACLE:'violet purple', TURTLE:'teal', QUILL:'sapphire blue', PIKADON:'crimson red' };

async function post(ep, body) { const r = await fetch('https://api.meshy.ai/openapi/v1/' + ep, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(ep + ' ' + r.status + ' ' + JSON.stringify(j)); return j; }
async function waitGet(ep, id) { for (let i = 0; i < 90; i++) { await sleep(15000); const o = await (await fetch('https://api.meshy.ai/openapi/v1/' + ep + '/' + id, { headers: H })).json(); if (o.status === 'SUCCEEDED') return o; if (o.status === 'FAILED') throw new Error(ep + ' failed ' + JSON.stringify(o.task_error)); } throw new Error(ep + ' timeout'); }
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!MESHY) { console.error('no MESHY_KEY'); process.exit(1); }
  const outDir = path.join(__dirname, '..', '..', 'public', 'assets', 'agents');
  const only = process.argv.slice(2).map(s => s.toUpperCase()).filter(c => AGENTS[c]);
  const codes = only.length ? only : Object.keys(AGENTS);
  for (const code of codes) {
    try {
      console.log(code, '— HF intricate portrait…');
      const prompt = AGENTS[code] + ', dominant ' + COLORS[code] + ' color scheme' + FRAMING;
      const png = await hf.generate(prompt);
      fs.writeFileSync(path.join(outDir, code + '-portrait.png'), png);
      const dataUri = 'data:image/png;base64,' + png.toString('base64');
      console.log(' ', code, '— Meshy image->3D (pbr)…');
      const img = (await post('image-to-3d', { image_url: dataUri, should_remesh: true, enable_pbr: true })).result;
      const done = await waitGet('image-to-3d', img);
      const glb = done.model_urls && done.model_urls.glb;
      if (!glb) throw new Error('no glb url ' + JSON.stringify(done.model_urls || {}));
      // back up the old greyscale body once, then overwrite
      const dest = path.join(outDir, code + '.glb');
      const bak = path.join(outDir, code + '_grey_backup.glb');
      if (fs.existsSync(dest) && !fs.existsSync(bak)) fs.copyFileSync(dest, bak);
      await dl(glb, dest);
      console.log('  DONE (textured):', code, '->', dest);
    } catch (e) { console.log('  FAIL:', code, e.message); }
  }
  console.log('QUALITY AGENTS DONE');
})();
