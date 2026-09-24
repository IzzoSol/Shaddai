// SHADDAI · bake-ual.mjs — Quaternius Universal Animation Library 2 (CC0) -> public/assets/anims/ual2-dirs.json
//
//   cd tools/ual && npm install && node bake-ual.mjs "<path to UAL2_Standard.glb>"
//
// Why directions, not rotations: our Meshy rigs have different rest orientations per body (NEXUS/PIKADON
// hips are axis-rotated vs QUILL/ZEROX), and copying bone rotations across skeletons is what deformed the
// agents before (see world3d.html charSrc note). So we record, per frame, WHERE each limb points (unit
// vectors), plus the hip frame and hip height, in a normalised space (facing +Z, hip height 1). At runtime
// ual-retarget.js aims each agent's own bones along those directions — bone lengths never change, so
// nothing stretches, and feet are aimed heel->toe explicitly.
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const SRC = process.argv[2];
const OUT = new URL('../../public/assets/anims/ual2-dirs.json', import.meta.url);
const FPS = 30;

// canonical key -> [from bone, to bone] in the UAL (Unreal mannequin) skeleton
const PAIRS = {
  spineA: ['spine_01', 'spine_02'], spineB: ['spine_02', 'spine_03'], spineC: ['spine_03', 'neck_01'], neck: ['neck_01', 'Head'],
  clavL: ['clavicle_l', 'upperarm_l'], armL: ['upperarm_l', 'lowerarm_l'], foreL: ['lowerarm_l', 'hand_l'], handL: ['hand_l', 'middle_01_l'],
  clavR: ['clavicle_r', 'upperarm_r'], armR: ['upperarm_r', 'lowerarm_r'], foreR: ['lowerarm_r', 'hand_r'], handR: ['hand_r', 'middle_01_r'],
  legL: ['thigh_l', 'calf_l'], shinL: ['calf_l', 'foot_l'], footL: ['foot_l', 'ball_l'],
  legR: ['thigh_r', 'calf_r'], shinR: ['calf_r', 'foot_r'], footR: ['foot_r', 'ball_r'],
};
const KEYS = Object.keys(PAIRS);

const buf = fs.readFileSync(SRC);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
const root = gltf.scene;
const bone = {}; root.traverse((o) => { if (o.name) bone[o.name] = o; });
for (const [a, b] of Object.values(PAIRS)) if (!bone[a] || !bone[b]) throw new Error('missing bone ' + a + '/' + b);

const P = (n) => { bone[n].updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(bone[n].matrixWorld); };
function hipFrame() {   // orthonormal frame: x = left-right across the thighs, y = up the spine
  const x = P('thigh_l').sub(P('thigh_r')).normalize();
  const y = P('spine_02').sub(P('pelvis'));
  y.sub(x.clone().multiplyScalar(y.dot(x))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// rest pose (loaded scene = bind pose): facing from the feet, hip height from pelvis above the lowest foot
root.updateMatrixWorld(true);
const fwd = P('ball_l').sub(P('foot_l')).add(P('ball_r').sub(P('foot_r'))); fwd.y = 0; fwd.normalize();
const A = new THREE.Quaternion().setFromUnitVectors(fwd, new THREE.Vector3(0, 0, 1));   // source facing -> +Z
const Ainv = A.clone().invert();
const restPelvis = P('pelvis');
const hipH = restPelvis.y - Math.min(P('foot_l').y, P('foot_r').y);
const restHipInv = hipFrame().invert();
const r3 = (v) => Math.round(v * 1000) / 1000;

const mixer = new THREE.AnimationMixer(root);
const clips = {};
for (const clip of gltf.animations) {
  const action = mixer.clipAction(clip); action.play();
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const dirs = [], hipQ = [], hipP = [];
  for (let f = 0; f < n; f++) {
    mixer.setTime(Math.min(clip.duration, f / FPS));
    root.updateMatrixWorld(true);
    for (const k of KEYS) {
      const [a, b] = PAIRS[k];
      const d = P(b).sub(P(a)).normalize().applyQuaternion(A);
      dirs.push(r3(d.x), r3(d.y), r3(d.z));
    }
    const q = A.clone().multiply(hipFrame().multiply(restHipInv)).multiply(Ainv);   // hip rotation since rest, in +Z space
    hipQ.push(r3(q.x), r3(q.y), r3(q.z), r3(q.w));
    const p = P('pelvis').sub(restPelvis).applyQuaternion(A).divideScalar(hipH);
    hipP.push(r3(p.x), r3(p.y), r3(p.z));
  }
  action.stop(); mixer.uncacheAction(clip);
  clips[clip.name] = { dur: r3(clip.duration), n, dirs, hipQ, hipP };
}

fs.mkdirSync(new URL('.', OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  v: 1, source: 'Universal Animation Library 2 [Standard] by Quaternius — CC0 1.0 (public domain)', fps: FPS,
  keys: KEYS, clips,
}));
console.log(`baked ${Object.keys(clips).length} clips · ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB -> public/assets/anims/ual2-dirs.json`);
