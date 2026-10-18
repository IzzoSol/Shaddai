// agent-pipeline-probe.mjs — run the GAME's exact agent pipeline (load -> _safeBox scale -> retarget idle -> mix)
// and CPU-skin vertices to get hard shape stats. Run from a dir whose node_modules/three selects the three version.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
const require2 = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.url.replace(/^file:\/\/\/?/, '').replace(/[^\/]*$/, ''), '..', '..', '..', '..', '..', 'Shaddai-3d');
// resolve repo root robustly: __dirname is where this file sits
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = HERE.includes('Shaddai-3d') ? HERE.slice(0, HERE.indexOf('Shaddai-3d') + 'Shaddai-3d'.length) : process.env.REPO || 'C:/Users/Brittany/Shaddai-3d';
const NM = path.join(REPO, 'tools', 'ual', 'node_modules');

const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { NodeIO } = (await import(pathToFileURL(require2.resolve('@gltf-transform/core', { paths: [NM] })))).default ?? await import(pathToFileURL(require2.resolve('@gltf-transform/core', { paths: [NM] })));
const EXT = await import(pathToFileURL(require2.resolve('@gltf-transform/extensions', { paths: [NM] })));
const MO = await import(pathToFileURL(require2.resolve('meshoptimizer', { paths: [NM] })));
const vm = await import('vm');

const MODEL = process.argv[2] || 'ZEROX';
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

async function loadStripped(file) {
  const io = new NodeIO().registerExtensions(EXT.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MO.MeshoptDecoder, 'meshopt.encoder': MO.MeshoptEncoder });
  const doc = await io.read(file);
  for (const n of ['EXT_meshopt_compression']) { const e = doc.getRoot().listExtensionsUsed().find((x) => x.extensionName === n); if (e) e.dispose(); }
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  const bin = ab(Buffer.from(await io.writeBinary(doc)));
  return await new Promise((res, rej) => new GLTFLoader().parse(bin, '', res, rej));
}

function _safeBox(obj) {
  const box = new THREE.Box3(), bb = new THREE.Box3(), bp = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse(function (o) {
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones) {
      for (let i = 0; i < o.skeleton.bones.length; i++) { const b = o.skeleton.bones[i]; if (b && b.matrixWorld) { bb.makeEmpty(); bb.expandByPoint(bp.setFromMatrixPosition(b.matrixWorld)); box.union(bb); } }
      return;
    }
    if (!o.isMesh || !o.geometry) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingBox) return; bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.union(bb);
  });
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
  return box;
}
function skinStats(root, label) {
  const bb = new THREE.Box3(); const v = new THREE.Vector3(), acc = new THREE.Matrix4();
  const dists = []; let verts = 0, meshes = 0, nan = 0;
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isSkinnedMesh || !o.geometry.attributes.position) return;
    meshes++;
    o.skeleton.update();
    const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const step = Math.max(1, (pos.count / 3000) | 0);
    for (let i = 0; i < pos.count; i += step) {
      verts++;
      v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
      acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = sw.array[i * 4 + k]; if (!w) continue;
        const bi = si.array[i * 4 + k] * 16;
        if (bi < 0 || bi >= o.skeleton.boneMatrices.length) { nan++; continue; }
        for (let c = 0; c < 16; c++) acc.elements[c] += o.skeleton.boneMatrices[bi + c] * w;
      }
      v.applyMatrix4(acc).applyMatrix4(o.bindMatrixInverse);
      if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) { nan++; continue; }
      bb.expandByPoint(v); dists.push(Math.hypot(v.x, v.y, v.z));
    }
  });
  if (!verts) return { label, meshes: 0 };
  dists.sort((a, b) => a - b);
  const med = dists[(dists.length / 2) | 0] || 1e-9, mx = dists[dists.length - 1];
  return { label, meshes, verts, nan, h: +(bb.max.y - bb.min.y).toFixed(3), w: +(bb.max.x - bb.min.x).toFixed(3),
    med: +med.toFixed(3), max: +mx.toFixed(3), spike: +(mx / med).toFixed(1), coherent: +(dists.filter(d => d <= med * 2.5).length / dists.length).toFixed(3) };
}

const report = { model: MODEL, three: THREE.REVISION || (await import('three/package.json', { with: { type: 'json' } }).then(p => p.default.version).catch(() => '?')) };
// raw GLB facts (no loaders): skins, joints per skin, JOINTS_0 accessor max vs joints count
function glbJSON(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x4E4F534A) return JSON.parse(b.slice(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len + ((8 - (len % 8)) % 8); }
  throw new Error('no JSON chunk');
}
try {
  const j = glbJSON(path.join(REPO, 'public', 'assets', 'agents', MODEL + '.glb'));
  const jointsPerSkin = (j.skins || []).map(sk => (sk.joints || []).length);
  const jointsMax = (j.skins || []).map(sk => Math.max(...(sk.joints || [0])));
  const j0max = [];
  (j.meshes || []).forEach((m, mi) => (m.primitives || []).forEach(pr => {
    const a = j.accessors[pr.attributes.JOINTS_0]; if (a) j0max.push({ mesh: mi, max: a.max ? a.max[0] : null, count: a.count });
  }));
  report.raw = { skins: jointsPerSkin, jointsMax, joints0: j0max };
} catch (e) { report.raw = { error: e.message }; }
const gltf = await loadStripped(path.join(REPO, 'public', 'assets', 'agents', MODEL + '.glb'));
const body = gltf.scene;
const box = _safeBox(body); const size = new THREE.Vector3(); box.getSize(size);
const h = size.y || 1; const s = 7.0 / h;
body.scale.setScalar(s);
const box2 = _safeBox(body); const c2 = new THREE.Vector3(); box2.getCenter(c2);
body.position.x = -c2.x; body.position.z = -c2.z; body.position.y -= box2.min.y;
report.measuredH = +h.toFixed(3); report.autoScale = +s.toFixed(3);
report.bind = skinStats(body, 'bind');

// the game's retarget: world-anim.js + shared library idle clip
try {
  const sandbox = { window: {} }; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'public', 'world-anim.js'), 'utf8'), sandbox, { filename: 'world-anim.js' });
  const buildAgentAnimator = sandbox.window.buildAgentAnimator;
  const lib = await loadStripped(path.join(REPO, 'public', 'assets', 'anim', 'agent-clips.glb'));
  const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'public', 'assets', 'anim', 'agent-clips.json'), 'utf8'));
  const anim = buildAgentAnimator({ THREE, model: body, clips: lib.animations, meta });
  const idleName = (meta.locomotion && meta.locomotion.idle) || 'Idle_FoldArms_Loop';
  const clip = anim.has(idleName) ? anim.clip(idleName) : (anim.has('Idle_FoldArms_Loop') ? anim.clip('Idle_FoldArms_Loop') : null);
  if (clip) {
    const mixer = new THREE.AnimationMixer(body);
    const a = mixer.clipAction(clip); a.play();
    mixer.update(0.4); mixer.update(0.6); body.updateMatrixWorld(true);
    report.idleClip = idleName;
    report.animated = skinStats(body, 'animated-idle');
  } else report.animated = { error: 'no idle clip' };
} catch (e) { report.animated = { error: e.message }; }
console.log(JSON.stringify(report, null, 1));
