// node tools/ual/strip-signs.mjs — removes the tall vertical sign (material Atlas_Sign) and its pylon (SciFi_Trim, the sign-height primitive) from
// the city library models that carry it (owner 2026-10-16: "not add the asian sign on all of them"). Originals stay in git history.
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { prune, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'; import path from 'path'; import { fileURLToPath } from 'url';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets/models/shaddai-city');
for (const f of ['sc-storefront-s.glb', 'sc-office.glb', 'lod/sc-storefront-s-lod1.glb', 'lod/sc-office-lod1.glb']) {
  const fp = path.join(DIR, f), d = await io.read(fp); let cut = 0;
  d.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const n = p.getMaterial() && p.getMaterial().getName(); if (n === 'Atlas_Sign' || n === 'SciFi_Trim') { m.removePrimitive(p); p.dispose(); cut++; } }));
  await d.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' })); await io.write(fp, d); console.log(f, 'removed', cut, 'sign primitives');
}
