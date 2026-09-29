// node tools/simplify-heavy.mjs <dir> [maxTris=70000] [--dry]  -> in-place meshopt simplify of GLBs above maxTris (ratio clamped 0.3-0.7). Originals stay in git.
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, meshopt } from '@gltf-transform/functions'; import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const [dir, max = '70000'] = process.argv.slice(2), dry = process.argv.includes('--dry'), MAX = +max;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tris = d => { let t = 0; d.getRoot().listMeshes().forEach(m => m.listPrimitives().forEach(p => { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; })); return Math.round(t); };
let sb = 0, sa = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.glb'))) {
  const fp = path.join(dir, f); if (/^(mount-|char)/.test(f)) continue; const d = await io.read(fp); const t0 = tris(d); if (t0 <= MAX || d.getRoot().listSkins().length) continue;
  const ratio = Math.min(0.7, Math.max(0.3, MAX / t0));
  if (dry) { console.log('would simplify', f, t0, 'x', ratio.toFixed(2)); continue; }
  await d.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: true }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const t1 = tris(d); await io.write(fp, d); sb += t0; sa += t1; console.log(f, t0, '->', t1);
}
console.log('total', sb, '->', sa);
