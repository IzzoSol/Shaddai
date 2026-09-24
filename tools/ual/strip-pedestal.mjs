// node strip-pedestal.mjs in.glb out.glb — remove a display pedestal/floor slab that image-to-3D fused under a
// character's feet (flat, near y=0, wider than 0.5m). Splits the mesh into connected islands (positions welded
// at 1mm so UV seams don't split islands) and drops islands that are flat + low + wide. Everything else untouched.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [, , IN, OUT] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN);
let removed = 0, kept = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = pos.getCount(), v = [0, 0, 0];
  const P = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos.getElement(i, v); P.set(v, i * 3); }
  let minY = Infinity, maxY = -Infinity; for (let i = 0; i < n; i++) { minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1]); }
  const H = maxY - minY;
  // weld by position so seam-split vertices join the same island
  const key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(P[i * 3] * 1000)},${Math.round(P[i * 3 + 1] * 1000)},${Math.round(P[i * 3 + 2] * 1000)}`; if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
  const par = new Int32Array(n).map((_, i) => i), find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const I = idx.getArray(), T = I.length / 3;
  for (let t = 0; t < T; t++) { const a = find(weld[I[t * 3]]), b = find(weld[I[t * 3 + 1]]), c = find(weld[I[t * 3 + 2]]); par[b] = a; par[find(c)] = a; }
  const st = new Map();   // island -> bounds
  for (let i = 0; i < n; i++) { const r = find(weld[i]); let s = st.get(r); if (!s) st.set(r, s = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity, 0]); const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; s[0] = Math.min(s[0], x); s[1] = Math.max(s[1], x); s[2] = Math.min(s[2], y); s[3] = Math.max(s[3], y); s[4] = Math.min(s[4], z); s[5] = Math.max(s[5], z); s[6]++; }
  const drop = new Set();
  for (const [r, s] of st) {
    const wide = Math.max(s[1] - s[0], s[5] - s[4]), low = s[3] < minY + H * 0.08, flat = (s[3] - s[2]) < H * 0.08;
    if (wide > 0.5 && low && flat) { drop.add(r); console.log(`drop island: ${s[6]} verts, ${(s[1] - s[0]).toFixed(2)} x ${(s[5] - s[4]).toFixed(2)} m, y ${s[2].toFixed(3)}..${s[3].toFixed(3)}`); }
  }
  console.log(`${st.size} islands; height ${H.toFixed(2)}`);
  // fused slab (same island as the boots): a floor-level vertex that is NOT under a boot wall is slab.
  // Boot walls = vertices 6-20% of the height up; their XZ footprint (2cm cells, dilated 2) is where soles may be.
  const cell = (x, z) => `${Math.round(x / 0.02)},${Math.round(z / 0.02)}`, boot = new Set();
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1] - minY; if (y > H * 0.06 && y < H * 0.2) { const cx = Math.round(P[i * 3] / 0.02), cz = Math.round(P[i * 3 + 2] / 0.02); for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) boot.add(`${cx + dx},${cz + dz}`); } }
  const slab = new Uint8Array(n); let slabN = 0;
  for (let i = 0; i < n; i++) if (P[i * 3 + 1] - minY < H * 0.03 && !boot.has(cell(P[i * 3], P[i * 3 + 2]))) { slab[i] = 1; slabN++; }
  // skin test (verified on oracle-v2, 2026-09-24): a fused pedestal is weighted to BOTH feet (~0.5/0.5) and so
  // stretches into a sheet when the legs part. Real boot geometry follows ONE leg. Also: floor-level verts far
  // outside the boots (>0.3m from the body axis) are pedestal.
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const skin = doc.getRoot().listSkins()[0];
  if (J && W && skin) {
    const names = skin.listJoints().map((j) => j.getName().toLowerCase());
    const side = (k) => /^left|_l$|\.l$/.test(names[k]) && /(leg|foot|toe|ball|calf|thigh)/.test(names[k]) ? 'L' : /^right|_r$|\.r$/.test(names[k]) && /(leg|foot|toe|ball|calf|thigh)/.test(names[k]) ? 'R' : '';
    const jv = [0, 0, 0, 0], wv = [0, 0, 0, 0]; let skinN = 0;
    for (let i = 0; i < n; i++) {
      const y = P[i * 3 + 1] - minY; if (y > H * 0.06 || slab[i]) continue;
      J.getElement(i, jv); W.getElement(i, wv);
      let l = 0, r = 0; for (let k = 0; k < 4; k++) { const sd = side(jv[k]); if (sd === 'L') l += wv[k]; else if (sd === 'R') r += wv[k]; }
      const far = Math.hypot(P[i * 3], P[i * 3 + 2]) > 0.26 && y < H * 0.06;
      if ((l >= 0.1 && r >= 0.1) || far) { slab[i] = 1; skinN++; }
    }
    console.log(`both-feet / far floor vertices: ${skinN}`);
  }
  console.log(`fused-slab vertices: ${slabN}`);
  const out = [];
  for (let t = 0; t < T; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    if (drop.has(find(weld[a])) || slab[a] || slab[b] || slab[c]) { removed++; continue; }
    kept++; out.push(a, b, c);
  }
  idx.setArray(new (I.constructor)(out));
}
await io.write(OUT, doc);
console.log(`triangles kept ${kept}, removed ${removed} -> ${OUT}`);
