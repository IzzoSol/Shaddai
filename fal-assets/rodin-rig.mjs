#!/usr/bin/env node
/* Rodin v2 (Hyper3D) mesh + Meshy auto-rig. usage: node fal-assets/rodin-rig.mjs <name> <tpose.png> [actionId] */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'; import { resolve, dirname, join } from 'path'; import { fileURLToPath } from 'url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = readFileSync(join(ROOT, '.env'), 'utf8').match(/^FAL_KEY\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
const [, , name, img, act, engine = 'rodin'] = process.argv, H = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
const sub = async (m, i) => { const r = await fetch(`https://queue.fal.run/${m}`, { method: 'POST', headers: H, body: JSON.stringify(i) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j; };
const poll = async (s, label, max = 900000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { await new Promise((r) => setTimeout(r, 5000)); const st = await (await fetch(s.status_url, { headers: H })).json(); if (st.status === 'COMPLETED') return (await fetch(s.response_url, { headers: H })).json(); if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(label + ' ' + JSON.stringify(st).slice(0, 200)); } throw new Error(label + ' timeout'); };
const dl = async (u, p) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, Buffer.from(await (await fetch(u)).arrayBuffer())); };
const out = resolve(ROOT, `fal-assets/characters/${name}`);
const data = 'data:image/png;base64,' + readFileSync(resolve(ROOT, img)).toString('base64');
const upload = async () => { const buf = readFileSync(resolve(ROOT, img)); const i = await (await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: H, body: JSON.stringify({ content_type: 'image/png', file_name: name + '.png' }) })).json(); if (!i.upload_url) throw new Error('upload init ' + JSON.stringify(i).slice(0, 200)); const put = await fetch(i.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: buf }); if (!put.ok) throw new Error('upload put ' + put.status); return i.file_url; };
console.log('1/2 mesh (' + engine + ')...');
let r1, meshUrl;
if (engine === 'tripo') { r1 = await poll(await sub('tripo3d/tripo/v2.5/image-to-3d', { image_url: await upload(), texture: 'HD', pbr: true, orientation: 'align_image' }), 'tripo'); console.log('   tripo keys:', Object.keys(r1).join(','), JSON.stringify(r1.detail || '').slice(0, 400)); const cand = [r1.pbr_model, r1.model_mesh, r1.base_model].find((x) => x && x.url) || Object.values(r1).find((x) => x && x.url && /\.glb/i.test(x.url)); meshUrl = cand.url; }
else { r1 = await poll(await sub('fal-ai/hyper3d/rodin/v2', { input_image_urls: [data], TAPose: true, quality_mesh_option: '50K Quad', material: 'PBR', geometry_file_format: 'glb' }), 'rodin'); meshUrl = r1.model_mesh.url; } await dl(meshUrl, join(out, `${name}-mesh.glb`)); console.log('   mesh saved');
console.log('2/2 meshy rigging...');
const inp = { model_url: meshUrl }; if (act) { inp.enable_animation = true; inp.animation_action_id = parseInt(act, 10); }
const r2 = await poll(await sub('fal-ai/meshy/rigging', inp), 'rigging', 900000);
if (r2.detail) throw new Error('RIG FAILED ' + JSON.stringify(r2.detail));
for (const [k, f] of [['rigged_character_glb', 'rigged.glb'], ['animation_glb', 'action.glb']]) if (r2[k]?.url) await dl(r2[k].url, join(out, `${name}-${f}`));
for (const [k, v] of Object.entries(r2.basic_animations || {})) if (v?.url && k.endsWith('glb')) await dl(v.url, join(out, `${name}-${k.replace(/_glb$/, '')}.glb`));
console.log('DONE', name);
