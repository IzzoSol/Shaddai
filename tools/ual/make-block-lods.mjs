// make-block-lods.mjs — far-band stand-ins for the Shaddai building library (lod2): a dark block at the building's real footprint/height
// with a warm rooftop skylight (reads at 900-2600 m and in the night top-down). gltf-transform simplify could not get below ~LOD1 on the
// hard-surface kit (docs/SHADDAI-CITY-LODS.md), so lod2 is authored, not simplified. ~24 tris per building.
//   node tools/ual/make-block-lods.mjs   (reads .bl-cache/sc/sc-types.json → public/assets/models/shaddai-city/lod/<key>-lod2.glb)
import fs from 'node:fs'; import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
const META = JSON.parse(fs.readFileSync('.bl-cache/sc/sc-types.json', 'utf8'));
const OUT = 'public/assets/models/shaddai-city/lod'; fs.mkdirSync(OUT, { recursive: true });
function box(w, h, d, y0) {   // 6 faces, flat normals; x = width, z = depth, y up from y0
  const P = [], N = [], I = []; const x = w / 2, z = d / 2, y1 = y0 + h;
  const faces = [[[x, y0, -z], [x, y0, z], [x, y1, z], [x, y1, -z], [1, 0, 0]], [[-x, y0, z], [-x, y0, -z], [-x, y1, -z], [-x, y1, z], [-1, 0, 0]],
    [[-x, y1, -z], [x, y1, -z], [x, y1, z], [-x, y1, z], [0, 1, 0]], [[-x, y0, z], [x, y0, z], [x, y0, -z], [-x, y0, -z], [0, -1, 0]],
    [[-x, y0, z], [-x, y1, z], [x, y1, z], [x, y0, z], [0, 0, 1]].map((v, i) => i < 4 ? v : v), [[x, y0, -z], [x, y1, -z], [-x, y1, -z], [-x, y0, -z], [0, 0, -1]]];
  faces[4] = [[-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z], [0, 0, 1]];
  for (const f of faces) { const b = P.length / 3; for (let k = 0; k < 4; k++) { P.push(...f[k]); N.push(...f[4]); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return { P, N, I };
}
const io = new NodeIO();
for (const [key, m] of Object.entries(META)) {
  const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene(key);
  const body = doc.createMaterial('block-facade').setBaseColorFactor([0.08, 0.09, 0.1, 1]).setRoughnessFactor(0.5).setMetallicFactor(0.4);
  const warm = doc.createMaterial('block-skylight').setBaseColorFactor([1, 0.95, 0.82, 1]).setEmissiveFactor([1, 0.95, 0.82]);
  const band = doc.createMaterial('block-emerald').setBaseColorFactor([0, 1, 0.61, 1]).setEmissiveFactor([0, 1, 0.61]);
  const open = !m.collider;                                   // garden / teleport / market: low slab + canopy, not a solid block
  const parts = open ? [[body, box(m.w, 0.4, m.d, 0)], m.h > 5 ? [body, box(m.w, 0.5, m.d, m.h - 0.5)] : null, [band, box(m.w * 0.5, 0.06, m.d * 0.08, 0.4)]]
                     : [[body, box(m.w, m.h, m.d, 0)], [warm, box(m.w * 0.35, 0.06, m.d * 0.3, m.h)], [band, box(m.w, 0.12, 0.06, Math.min(3.3, m.h * 0.5))]];
  const mesh = doc.createMesh(key + '-block');
  for (const p of parts) {
    if (!p) continue; const [mat, g] = p;
    const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.P)).setBuffer(buf);
    const nor = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.N)).setBuffer(buf);
    const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(g.I)).setBuffer(buf);
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setIndices(idx).setMaterial(mat));
  }
  scene.addChild(doc.createNode(key + '-lod2').setMesh(mesh));
  const f = path.join(OUT, key + '-lod2.glb'); await io.write(f, doc);
  console.log(f, fs.statSync(f).size, 'bytes', open ? '(open)' : '(block)', m.w + 'x' + m.d + 'x' + m.h.toFixed(1) + 'm');
}
