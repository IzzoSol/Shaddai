#!/usr/bin/env node
/* Design real buildings: HF (FLUX) concept image -> Meshy image->3D -> GLB.
 * Saves public/assets/buildings/<id>.glb (+ .png concept). Keys from runtime-keys.json.
 * Run: node backend/scripts/generate-buildings.js
 */
const fs = require('fs'), path = require('path');
let hf; try { hf = require('../lib/hf-keys'); } catch (e) { console.error('hf-keys missing'); process.exit(1); }
const RK = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')); } catch { return {}; } })();
const MESHY = process.env.MESHY_KEY || RK.MESHY_KEY;
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'buildings');
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Intricate, grand, INSCRIBED architecture — detailed carved relief so the models read as
// monumental landmarks, not basic boxes. Rich concept image => richer Meshy model.
const ISO = ', single isolated monumental building, centered, plain flat light-grey background, full structure visible, 3/4 architectural hero view, ornate carved inscriptions and glowing engraved glyphs across the facade, intricate filigree, sacred-geometry ornament, cinematic neon Tron sci-fi cathedral architecture, ultra detailed, sharp, 8k, no text';
const BUILDINGS = [
  { id: 'markets-exchange', p: 'a grand futuristic stock-exchange trading cathedral, towering amber-gold columns engraved with glowing currency sigils and candlestick-chart reliefs, tiered ticker galleries, ornate dome' },
  { id: 'library',          p: 'a vast tiered futuristic grand library, rose-violet glowing trim, soaring stained-glass windows of light, facades carved with flowing illuminated calligraphy and book reliefs, ornate buttresses' },
  { id: 'aegis',            p: 'a monumental futuristic security fortress with four engraved corner towers, crimson glowing protective runes and shield sigils carved across heavy riveted ramparts, imposing gatehouse' },
  { id: 'museum',           p: 'a sweeping curved futuristic museum gallery, teal glowing trim, ornate art-nouveau relief panels across the walls, luminous dome roof, grand colonnade entrance' },
  { id: 'nexus-hub',        p: 'a colossal domed futuristic information hub, cyan glowing circuit-engravings spiraling across the dome, radial light-bridges, ornate data-glyph reliefs, command-spire crown' },
  { id: 'source-spire',     p: 'a towering radiant golden divine spire monument, sacred Hebrew-style glyphs and seven-glyph crown carved in glowing gold, tiered sacred-geometry base, halo of light' },
  { id: 'oracle-spire',     p: 'a mystic futuristic observatory of twin violet spires, facades engraved with glowing constellations and arcane astrological inscriptions, floating third-eye orb, ornate amethyst filigree' },
  { id: 'bazaar',           p: 'an ornate open-air futuristic market bazaar pavilion, intricately carved canopies and pillars, glowing stalls, mosaic-tiled floor, hanging lanterns of light' },
];

async function meshyImageTo3D(dataUri) {
  const r = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
    method: 'POST', headers: { Authorization: 'Bearer ' + MESHY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: dataUri, should_remesh: true, enable_pbr: true }),
  });
  const j = await r.json(); if (!r.ok) throw new Error('meshy submit ' + r.status + ' ' + JSON.stringify(j));
  const id = j.result;
  for (let i = 0; i < 60; i++) {
    await sleep(15000);
    const s = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d/' + id, { headers: { Authorization: 'Bearer ' + MESHY } });
    const o = await s.json();
    if (o.status === 'SUCCEEDED') return o;
    if (o.status === 'FAILED') throw new Error('meshy failed ' + JSON.stringify(o.task_error));
  }
  throw new Error('meshy timeout');
}
async function dl(url, file) { const r = await fetch(url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

(async () => {
  if (!MESHY) { console.error('no MESHY_KEY'); process.exit(1); }
  const force = process.argv.includes('--force');
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const list = only.length ? BUILDINGS.filter(b => only.includes(b.id)) : BUILDINGS;
  for (const b of list) {
    const glb = path.join(OUT, b.id + '.glb');
    if (fs.existsSync(glb) && !force) { console.log('skip (exists):', b.id); continue; }
    if (fs.existsSync(glb) && force) { const bak = path.join(OUT, b.id + '_basic_backup.glb'); if (!fs.existsSync(bak)) fs.copyFileSync(glb, bak); }
    try {
      console.log('image:', b.id);
      const png = await hf.generate(b.p + ISO);
      fs.writeFileSync(path.join(OUT, 'img', b.id + '.png'), png);
      const dataUri = 'data:image/png;base64,' + png.toString('base64');
      console.log('  -> meshy 3d:', b.id);
      const o = await meshyImageTo3D(dataUri);
      if (o.model_urls && o.model_urls.glb) await dl(o.model_urls.glb, glb);
      console.log('  done:', b.id, (fs.statSync(glb).size / 1024 / 1024).toFixed(2) + 'MB');
    } catch (e) { console.log('  FAIL:', b.id, e.message); }
  }
  console.log('BUILDINGS DONE');
})();
