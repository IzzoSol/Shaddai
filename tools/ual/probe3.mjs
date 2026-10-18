// probe3.mjs — game-faithful agent probe: strip ONLY textures via JSON surgery (BIN untouched),
// parse with r180 GLTFLoader + the REAL MeshoptDecoder (exactly like the game), then CPU-skin stats.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = HERE.includes('Shaddai-3d') ? HERE.slice(0, HERE.indexOf('Shaddai-3d') + 'Shaddai-3d'.length) : 'C:/Users/Brittany/Shaddai-3d';
const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');

function stripTextures(glbBuf) {
  const b = glbBuf; let off = 12, jsonEnd = 0, jsonTxt = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x4E4F534A) { jsonTxt = b.slice(off + 8, off + 8 + len).toString('utf8'); jsonEnd = off + 8 + len; }
    else if (bin === null) bin = b.slice(off + 8, off + 8 + len);
    off += 8 + len + ((8 - (len % 8)) % 8);
  }
  const j = JSON.parse(jsonTxt);
  delete j.images; delete j.textures; delete j.samplers;
  delete j.materials;
  (j.meshes || []).forEach(m => (m.primitives || []).forEach(p => { delete p.material; }));
  (j.nodes || []).forEach(n => { if (n.mesh != null && n.materials) delete n.materials; });
  let txt = JSON.stringify(j);
  const enc = Buffer.from(txt, 'utf8'); const pad = (4 - (enc.length % 4)) % 4;
  const jsonChunk = Buffer.concat([enc, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + jsonChunk.length + (bin ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546C67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12); out.writeUInt32LE(0x4E4F534A, 16); jsonChunk.copy(out, 20);
  if (bin) { out.writeUInt32LE(bin.length, 20 + jsonChunk.length); out.writeUInt32LE(0x004E4942, 24 + jsonChunk.length); bin.copy(out, 28 + jsonChunk.length); }
  return out;
}
function skinStats(root, label) {
  const bb = new THREE.Box3(); const v = new THREE.Vector3(), acc = new THREE.Matrix4();
  const dists = []; let verts = 0, meshes = 0, nanIdx = 0, nanNaN = 0;
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isSkinnedMesh || !o.geometry.attributes.position) return;
    meshes++;
    o.skeleton.update();
    const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const step = Math.max(1, (pos.count / 2500) | 0);
    for (let i = 0; i < pos.count; i += step) {
      verts++;
      v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
      acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let used = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k); if (!w) continue;
        const bi = si.getComponent(i, k) * 16;
        if (bi < 0 || bi >= o.skeleton.boneMatrices.length) { nanIdx++; continue; }
        used++;
        for (let c = 0; c < 16; c++) acc.elements[c] += o.skeleton.boneMatrices[bi + c] * w;
      }
      v.applyMatrix4(acc).applyMatrix4(o.bindMatrixInverse);
      if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) { nanNaN++; continue; }
      bb.expandByPoint(v); dists.push(Math.hypot(v.x, v.y, v.z));
    }
  });
  if (!verts) return { label, meshes: 0 };
  dists.sort((a, b) => a - b);
  const med = dists[(dists.length / 2) | 0] || 1e-9, mx = dists[dists.length - 1];
  return { label, meshes, verts, badIndex: nanIdx, nanNaN, h: +(bb.max.y - bb.min.y).toFixed(3), w: +(bb.max.x - bb.min.x).toFixed(3),
    med: +med.toFixed(2), max: +mx.toFixed(2), spike: +(mx / med).toFixed(1), coherent: +(dists.filter(d => d <= med * 2.5).length / dists.length).toFixed(3) };
}
const arg = process.argv[2] || 'ZEROX';
const file = arg.includes('\\') || arg.includes('/') ? path.resolve(REPO, arg) : path.join(REPO, 'public', 'assets', 'agents', arg + '.glb');
const out = { model: path.basename(file, '.glb'), three: THREE.REVISION };
const raw = fs.readFileSync(file);
const stripped = Buffer.from(stripTextures(raw));
const gltf = await new Promise((res, rej) => {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  L.parse(stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength), '', res, rej);
});
const body = gltf.scene;
// game pipeline: _safeBox (bone union) -> scale 7/h -> center/ground
const box = (function () { const b = new THREE.Box3(), bb2 = new THREE.Box3(), bp = new THREE.Vector3(); body.updateMatrixWorld(true);
  body.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones) { for (const bn of o.skeleton.bones) if (bn && bn.matrixWorld) { bb2.makeEmpty(); bb2.expandByPoint(bp.setFromMatrixPosition(bn.matrixWorld)); b.union(bb2); } return; }
    if (!o.isMesh || !o.geometry) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (g.boundingBox) { bb2.copy(g.boundingBox).applyMatrix4(o.matrixWorld); b.union(bb2); } });
  return b; })();
const size = new THREE.Vector3(); box.getSize(size);
const h = size.y || 1, s = 7.0 / h;
body.scale.setScalar(s);
out.measuredH = +h.toFixed(3);
out.bind = skinStats(body, 'bind');
console.log(JSON.stringify(out));
