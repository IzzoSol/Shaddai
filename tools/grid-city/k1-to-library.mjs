// node tools/grid-city/k1-to-library.mjs — Blender K1 towers -> grid-fabric library models (world-clusters-v4.js keys sc-tower-*).
//   public/assets/kits/shaddai_tower_<kind>_v01.glb  ->  public/assets/models/shaddai-city/sc-tower-<kind>.glb (parts joined per material)
// Same pipeline as the other sc-* models (gltf-transform + meshopt). Re-run after a Blender re-export of K1.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, flatten, join, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tris = (d) => { let t = 0; d.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; })); return t; };
const draws = (d) => d.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
for (const kind of ['slab', 'setback', 'spire']) {
  const src = path.join(ROOT, 'kits', `shaddai_tower_${kind}_v01.glb`);
  const base = async () => { const d = await io.read(src); await d.transform(dedup(), flatten(), join({ keepNamed: false }), weld(), prune()); return d; };
  const full = await base(); const t0 = tris(full);
  await full.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(ROOT, 'models/shaddai-city', `sc-tower-${kind}.glb`), full);
  const out = [`sc-tower-${kind}: ${t0} tris, ${draws(full)} draws`];
  // LODs: meshopt can't thin these hard-edged box towers (split normals) -> no lod files, the loader falls back to the full model.
  // Proper LOD meshes come from Blender (decimate / hull) in the FPS pass (docs/MASTER-TRACKER.md section 8).
  console.log(out.join(' · '));
}
