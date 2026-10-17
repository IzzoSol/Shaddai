// node tools/ual/measure-agents.mjs — diagnose GIANT agents straight from the GLB data (no three needed):
// bone-union height (bind pose) vs raw-geometry-bounds height (what yesterday's _safeBox measured).
import fs from 'fs';
import path from 'path';
const PUB = path.join(import.meta.dirname, '..', '..', 'public');

function glbJSON(file) {
  const b = fs.readFileSync(file);
  let off = 12; // magic + version + length
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x4E4F534A) return JSON.parse(b.slice(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len + ((8 - (len % 8)) % 8);
  }
  throw new Error('no JSON chunk');
}
function compose(n) {
  if (n.matrix) return mat(n.matrix);
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const m = [
    (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0],
    (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1],
    (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2],
    t[0], t[1], t[2]
  ];
  return m; // column-major 3x4 like glTF
}
function mul(a, b) { // a * b (3x4 column-major)
  const r = new Array(12);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 3; rr++) {
    r[c * 3 + rr] = a[0 * 3 + rr] * b[c * 3 + 0] + a[1 * 3 + rr] * b[c * 3 + 1] + a[2 * 3 + rr] * b[c * 3 + 2] + (c === 3 ? a[3 * 3 + rr] : 0);
  }
  return r;
}
const f2 = n => n.toFixed(3);
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['ZEROX', 'TURTLE']) {
  const p = path.join(PUB, 'assets', 'agents', name + '.glb');
  if (!fs.existsSync(p)) { console.log(name + ': missing'); continue; }
  const j = glbJSON(p);
  const world = new Map(); // node index -> 3x4 world matrix
  const walk = (i, parent) => { const n = j.nodes[i]; world.set(i, parent ? mul(parent, compose(n)) : compose(n)); (n.children || []).forEach(c => walk(c, world.get(i))); };
  (j.scenes?.[j.scene || 0]?.roots || j.scenes?.[0]?.roots || Object.keys(j.nodes).map(Number)).forEach(r => walk(r, null));
  // bone union (bind pose)
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], boneCount = 0;
  (j.skins || []).forEach(sk => sk.joints.forEach(ji => {
    boneCount++; const m = world.get(ji); if (!m) return;
    const px = m[9], py = m[10], pz = m[11];
    lo = [Math.min(lo[0], px), Math.min(lo[1], py), Math.min(lo[2], pz)];
    hi = [Math.max(hi[0], px), Math.max(hi[1], py), Math.max(hi[2], pz)];
  }));
  const boneH = hi[1] - lo[1];
  // raw-geometry bounds in each mesh node's local space, x its world matrix (yesterday's _safeBox)
  let oLo = [1e9, 1e9, 1e9], oHi = [-1e9, -1e9, -1e9];
  (j.meshes || []).forEach((mesh, mi) => {
    const nodeIdx = j.nodes.findIndex(n => n.mesh === mi); if (nodeIdx < 0) return;
    const m = world.get(nodeIdx); if (!m) return;
    (Array.isArray(mesh.primitives) ? mesh.primitives : [mesh.primitives]).forEach(pr => {
      const acc = j.accessors[pr.attributes.POSITION]; if (!acc || !acc.min) return;
      // transform the 8 box corners by the node's world 3x4
      for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) for (let cz = 0; cz < 2; cz++) {
        const x = cx ? acc.max[0] : acc.min[0], y = cy ? acc.max[1] : acc.min[1], z = cz ? acc.max[2] : acc.min[2];
        const wx = m[0] * x + m[3] * y + m[6] * z + m[9];
        const wy = m[1] * x + m[4] * y + m[7] * z + m[10];
        const wz = m[2] * x + m[5] * y + m[8] * z + m[11];
        oLo = [Math.min(oLo[0], wx), Math.min(oLo[1], wy), Math.min(oLo[2], wz)];
        oHi = [Math.max(oHi[0], wx), Math.max(oHi[1], wy), Math.max(oHi[2], wz)];
      }
    });
  });
  const oldH = oHi[1] - oLo[1];
  console.log(`${name}: bones=${boneCount}`);
  console.log(`  bone union height ${f2(boneH)} -> scale 7/h = ${f2(7 / Math.max(1e-6, boneH))}`);
  console.log(`  old _safeBox height ${f2(oldH)} -> scale 7/h = ${f2(7 / Math.max(1e-6, oldH))}`);
}
