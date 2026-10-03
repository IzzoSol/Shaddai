// image-to-3d.mjs — ONE image → textured 3D mesh on fal (fal-ai/hunyuan3d/v2, ~$0.375). For creatures / props / buildings
// that the humanoid auto-rigger can't handle (they get code-driven motion or Blender rigs).
//   FAL_KEY=… node tools/fal/image-to-3d.mjs <id> <image.png|jpg> <out.glb>
// Never prints the key. Logs the spend through fal-assets/production/preflight.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { execFileSync } from 'child_process';
const [id, img, out] = process.argv.slice(2);
if (!id || !img || !out) { console.error('usage: node tools/fal/image-to-3d.mjs <id> <image> <out.glb>'); process.exit(2); }
const key = (process.env.FAL_KEY || '').trim(); if (!key) { console.error('no FAL_KEY'); process.exit(1); }
const mime = extname(img).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const uri = `data:${mime};base64,` + readFileSync(img).toString('base64');
const H = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
const sub = await (await fetch('https://queue.fal.run/fal-ai/hunyuan3d/v2', { method: 'POST', headers: H, body: JSON.stringify({ input_image_url: uri, textured_mesh: true }) })).json();
if (!sub.status_url) { console.error('submit failed', JSON.stringify(sub).slice(0, 300)); process.exit(1); }
let res = null;
for (let t = 0; t < 90 && !res; t++) {
  await new Promise((r) => setTimeout(r, 5000));
  const st = await (await fetch(sub.status_url, { headers: H })).json();
  if (st.status === 'COMPLETED') res = await (await fetch(sub.response_url, { headers: H })).json();
  else if (st.status === 'FAILED' || st.status === 'ERROR') { console.error('failed', JSON.stringify(st).slice(0, 300)); process.exit(1); }
  else console.log('  ...', st.status);
}
if (!res) { console.error('timed out'); process.exit(1); }
const url = res.model_mesh?.url || res.model_glb?.url || res.mesh?.url;
if (!url) { console.error('no mesh url in', Object.keys(res)); process.exit(1); }
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
console.log('saved', out);
try { execFileSync('node', [resolve('fal-assets/production/preflight.mjs'), 'log', id, 'mesh', '0.375', 'fal hunyuan3d/v2 textured mesh (image-to-3d.mjs)'], { stdio: 'inherit' }); } catch (e) { console.log('(spend log skipped:', e.message, ')'); }
