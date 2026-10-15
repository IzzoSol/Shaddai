// SHADDAI · build-anim-library.mjs — ONE shared animation library for every agent (Meshy v6 24-bone skeleton).
//
//   node tools/anim/build-anim-library.mjs            (deps live in tools/ual/node_modules — run `npm i` there once)
//
// Output: public/assets/anim/agent-clips.glb   (skeleton only: 24 named bones + animations, no mesh/skin/textures)
//         public/assets/anim/agent-clips.json  (per-clip meta: duration, loop, inPlace, speedMps, tags, hitFrames …)
//
// Sources
//   1. Meshy merged-animation GLBs from the owner's Meshy account (same 24 bone NAMES as our v6 rigs).
//   2. Quaternius Universal Animation Library 2 (CC0) — public/assets/anims/ual2-dirs.json, solved onto the
//      canonical rig with the existing direction retargeter (public/ual-retarget.js).
//   3. Three derived clips: Roll (cut from Run_Jump_and_Roll), Sit_Chair_Loop (synthetic UAL-direction pose),
//      Lie_Down (LayToIdle reversed; used as death / knockdown).
//
// Canonical skeleton = ZEROX v6 bind pose (fal-assets/characters/_m6/zerox/zerox-rigged.glb inverse bind matrices).
// Why not copy local quaternions straight across: the bone NAMES match but the bind frames don't — the Enforcer
// source has its Hips frame ~100° off the v6 rigs and limb roll differs up to ~35°. So every source is mapped in
// model space: W_canon(b) = W_src(b) · K(b), K = full bind delta for Hips, twist-about-the-bone only for limbs
// (limb DIRECTIONS come from the source, roll from the canonical bind). world-anim.js applies the same mapping
// per rig at runtime (canonical -> target), which is a no-op for ZEROX and a few degrees of roll for the others.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const UAL = path.join(ROOT, 'tools/ual');
const req = createRequire(path.join(UAL, 'package.json'));
const { NodeIO, Document } = await import(pathToFileURL(req.resolve('@gltf-transform/core')).href);
const THREE = await import(pathToFileURL(path.join(UAL, 'node_modules/three/build/three.module.js')).href);

const DL = 'C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads';
const SOURCES = [
  { id: 'enforcer', file: DL + '/Meshy_AI_Emerald_Enforcer_biped/Meshy_AI_Emerald_Enforcer_biped/Meshy_AI_Emerald_Enforcer_biped_Meshy_AI_Meshy_Merged_Animations.glb' },
  { id: 'valkyrie', file: DL + '/Meshy_AI_Neon_Valkyrie_biped  FINAL UPDATED/Meshy_AI_Neon_Valkyrie_biped/Meshy_AI_Neon_Valkyrie_biped_Meshy_AI_Meshy_Merged_Animations.glb' },
];
const CANON_FILE = path.join(ROOT, 'fal-assets/characters/_m6/zerox/zerox-rigged.glb');
const UAL_JSON = path.join(ROOT, 'public/assets/anims/ual2-dirs.json');
const OUT_DIR = path.join(ROOT, 'public/assets/anim');
const FPS = 30;
const ROT_TOL = +(process.env.ROT_TOL || 0.004);   // rad — keyframe reduction tolerance for rotations (~0.23°)
const POS_TOL = 0.15;     // cm  — for the Hips translation
const UAL_SKIP = /^(A_TPose|Zombie_)/;
const TIPS = new Set(['head_end', 'headfront']);   // leaf markers with no skin weight: one bind key is enough

const BONES = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'Spine02', 'Spine01', 'Spine', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm',
  'RightHand', 'neck', 'Head', 'head_end', 'headfront'];
const NB = BONES.length;
const io = new NodeIO();
const log = (...a) => console.log(...a);

// ── skeleton bind data from a skinned GLB (model space, metres) ─────────────────────────────────────
async function readBind(file) {
  const doc = await io.read(file);
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray();
  const names = joints.map((j) => j.getName());
  for (const b of BONES) if (!names.includes(b)) throw new Error(`${path.basename(file)}: missing bone ${b}`);
  const parentOf = {};
  for (const j of joints) for (const c of j.listChildren()) parentOf[c.getName()] = j.getName();
  const world = {};
  joints.forEach((j, i) => {
    const m = new THREE.Matrix4().fromArray(ibm, i * 16).invert();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s);
    world[j.getName()] = { m, p, q };
  });
  const hipsNode = joints[names.indexOf('Hips')];
  const armature = doc.getRoot().listNodes().find((n) => n.listChildren().includes(hipsNode));
  const armScale = armature ? armature.getScale()[1] : 1;
  return { doc, joints, names, parentOf, world, armScale };
}

// leg length (thigh + shin, both sides averaged) and ankle height of a bind, model-space metres
function legOf(B) {
  const L = (a, b) => B.world[a].p.distanceTo(B.world[b].p);
  return (L('LeftUpLeg', 'LeftLeg') + L('LeftLeg', 'LeftFoot') + L('RightUpLeg', 'RightLeg') + L('RightLeg', 'RightFoot')) / 2;
}
const ankleOf = (B) => Math.min(B.world.LeftFoot.p.y, B.world.RightFoot.p.y);

// swing/twist: the part of q that rotates about local +Y (the bone axis)
function twistY(q) {
  const t = new THREE.Quaternion(0, q.y, 0, q.w); const l = t.length();
  return l < 1e-6 ? new THREE.Quaternion() : t.normalize();
}
// K(b) mapping model-space rotations of skeleton A onto skeleton B: W_B = W_A · K
function corrections(bindA, bindB) {
  const K = {};
  for (const b of BONES) {
    const O = bindA.world[b].q.clone().invert().multiply(bindB.world[b].q);
    K[b] = b === 'Hips' ? O : twistY(O);
  }
  return K;
}

// ── canonical skeleton (THREE bones at the ZEROX v6 bind) ──────────────────────────────────────────
const canon = await readBind(CANON_FILE);
const PARENT = BONES.map((b) => (canon.parentOf[b] ? BONES.indexOf(canon.parentOf[b]) : -1));
for (let i = 0; i < NB; i++) if (PARENT[i] >= i) throw new Error('bone order is not parent-first: ' + BONES[i]);
function makeCanonScene() {
  const body = new THREE.Object3D(); body.name = 'AgentClips';
  const arm = new THREE.Object3D(); arm.name = 'Armature'; arm.scale.setScalar(canon.armScale); body.add(arm);
  const bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  const armWorld = new THREE.Matrix4().makeScale(canon.armScale, canon.armScale, canon.armScale);
  BONES.forEach((n, i) => {
    const pw = PARENT[i] < 0 ? armWorld : canon.world[BONES[PARENT[i]]].m;
    const local = pw.clone().invert().multiply(canon.world[n].m);
    const s = new THREE.Vector3(); local.decompose(bones[i].position, bones[i].quaternion, s);
    (PARENT[i] < 0 ? arm : bones[PARENT[i]]).add(bones[i]);
  });
  body.updateMatrixWorld(true);
  return { body, arm, bones };
}
const C = makeCanonScene();
const BIND_LQ = C.bones.map((b) => b.quaternion.clone());
const BIND_LP = C.bones.map((b) => b.position.clone());
const CANON_HIPS = BIND_LP[0].clone();                         // cm, Armature space
const CANON_LEG = legOf(canon), CANON_ANKLE = ankleOf(canon);  // m, model space
log(`canonical: ZEROX v6 · hips ${(CANON_HIPS.y * canon.armScale).toFixed(3)} m`);

// clip record: { name, n, q: Float32Array(NB*n*4) canonical LOCAL quats, p: Float32Array(n*3) hips pos (cm), src }
const clips = new Map();
const addClip = (c) => { if (clips.has(c.name)) { log(`  dup skipped: ${c.name} (${c.src})`); return; } clips.set(c.name, c); };

// ── 1. Meshy sources ───────────────────────────────────────────────────────────────────────────────
function sampler(ch) {
  const s = ch.getSampler(); return { t: s.getInput().getArray(), v: s.getOutput().getArray(), step: s.getInterpolation() === 'STEP', k: ch.getTargetPath() === 'rotation' ? 4 : 3 };
}
function sampleAt(S, time, out) {
  const { t, v, k } = S; const n = t.length;
  if (time <= t[0] || n === 1) { for (let i = 0; i < k; i++) out[i] = v[i]; return out; }
  if (time >= t[n - 1]) { for (let i = 0; i < k; i++) out[i] = v[(n - 1) * k + i]; return out; }
  let i = 0; while (i < n - 2 && t[i + 1] < time) i++;
  const a = (time - t[i]) / (t[i + 1] - t[i]);
  if (S.step) { for (let j = 0; j < k; j++) out[j] = v[i * k + j]; return out; }
  if (k === 4) THREE.Quaternion.slerpFlat(out, 0, v, i * 4, v, (i + 1) * 4, a);
  else for (let j = 0; j < 3; j++) out[j] = v[i * 3 + j] + (v[(i + 1) * 3 + j] - v[i * 3 + j]) * a;
  return out;
}
for (const src of SOURCES) {
  log(`reading ${src.id} …`);
  const S = await readBind(src.file);
  const K = corrections(S, canon);
  const hipsBindS = S.world.Hips.p.clone().divideScalar(S.armScale);   // cm, Armature space
  // Hips path: scaled by the LEG-length ratio and re-based on the ankle height, so the feet land on the floor
  // (hips-height scaling put ZEROX's ankles 8 cm under it — its legs are relatively longer than the source's)
  const legRatio = CANON_LEG / legOf(S), ankS = ankleOf(S) / S.armScale, ankC = CANON_ANKLE / canon.armScale;
  const restL = {}; for (const j of S.joints) restL[j.getName()] = j.getRotation();
  const restT = S.joints[S.names.indexOf('Hips')].getTranslation();
  for (const anim of S.doc.getRoot().listAnimations()) {
    const name = anim.getName();
    const rot = {}; let hipsT = null; let dur = 0;
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(); if (!node) continue;
      const S2 = sampler(ch); dur = Math.max(dur, S2.t[S2.t.length - 1]);
      if (ch.getTargetPath() === 'rotation') rot[node.getName()] = S2;
      else if (ch.getTargetPath() === 'translation' && node.getName() === 'Hips') hipsT = S2;
    }
    const n = Math.max(2, Math.round(dur * FPS) + 1);
    const q = new Float32Array(NB * n * 4), p = new Float32Array(n * 3);
    const tmp = [0, 0, 0, 0], Ws = BONES.map(() => new THREE.Quaternion()), Wc = BONES.map(() => new THREE.Quaternion()), lq = new THREE.Quaternion();
    for (let f = 0; f < n; f++) {
      const time = Math.min(dur, f / FPS);
      for (let i = 0; i < NB; i++) {
        const b = BONES[i];
        if (rot[b]) sampleAt(rot[b], time, tmp); else { const r = restL[b]; tmp[0] = r[0]; tmp[1] = r[1]; tmp[2] = r[2]; tmp[3] = r[3]; }
        lq.set(tmp[0], tmp[1], tmp[2], tmp[3]).normalize();
        Ws[i].copy(PARENT[i] < 0 ? lq : Ws[PARENT[i]].clone().multiply(lq));             // source model space (Armature has no rotation)
        Wc[i].copy(Ws[i]).multiply(K[b]);                                               // canonical model space
        const L = PARENT[i] < 0 ? Wc[i] : Wc[PARENT[i]].clone().invert().multiply(Wc[i]);
        q.set([L.x, L.y, L.z, L.w], (f * NB + i) * 4);
      }
      if (hipsT) sampleAt(hipsT, time, tmp); else { tmp[0] = restT[0]; tmp[1] = restT[1]; tmp[2] = restT[2]; }
      p[f * 3] = CANON_HIPS.x + (tmp[0] - hipsBindS.x) * legRatio;
      p[f * 3 + 1] = ankC + (tmp[1] - ankS) * legRatio;
      p[f * 3 + 2] = CANON_HIPS.z + (tmp[2] - hipsBindS.z) * legRatio;
    }
    addClip({ name, n, q, p, src: 'meshy:' + src.id });
  }
  S.doc.dispose?.();
}

// ── 2. UAL2 (CC0) via the existing direction retargeter, solved on the canonical bones ─────────────
const ualData = JSON.parse(fs.readFileSync(UAL_JSON, 'utf8'));
const ualSrc = fs.readFileSync(path.join(ROOT, 'public/ual-retarget.js'), 'utf8');
const { attachUAL } = await import('data:text/javascript,' + encodeURIComponent(ualSrc));
function solveUAL(data, names) {
  const U = makeCanonScene();
  const mixer = new THREE.AnimationMixer(U.body);
  const origFetch = globalThis.fetch; globalThis.fetch = () => Promise.reject(new Error('offline'));   // attachUAL prefetches its URL
  const api = attachUAL(THREE, U.body, mixer, {}, { prefix: '' });
  globalThis.fetch = origFetch;
  api.ready.catch(() => {});
  if (!api.ok) throw new Error('ual: rig not recognised');
  api._data = data;
  const byUuid = new Map(U.bones.map((b, i) => [b.uuid, i]));
  const out = [];
  for (const name of names) {
    const action = api.add(name); if (!action) continue;
    const clip = action.getClip(), src = data.clips[name], n = src.n;
    const q = new Float32Array(NB * n * 4), p = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) for (let i = 0; i < NB; i++) q.set([BIND_LQ[i].x, BIND_LQ[i].y, BIND_LQ[i].z, BIND_LQ[i].w], (f * NB + i) * 4);   // undriven bones (hands, toes, head) hold bind
    for (let f = 0; f < n; f++) p.set([CANON_HIPS.x, CANON_HIPS.y, CANON_HIPS.z], f * 3);
    for (const tr of clip.tracks) {
      const [uuid, prop] = tr.name.split('.'); const i = byUuid.get(uuid); if (i === undefined) continue;
      if (prop === 'quaternion') for (let f = 0; f < n; f++) q.set(tr.values.subarray(f * 4, f * 4 + 4), (f * NB + i) * 4);
      else if (prop === 'position' && i === 0) p.set(tr.values.subarray(0, n * 3));
    }
    out.push({ name, n, q, p, src: 'ual2' });
  }
  return out;
}
process.removeAllListeners('warning');
const ualNames = Object.keys(ualData.clips).filter((n) => !UAL_SKIP.test(n));
for (const c of solveUAL(ualData, ualNames)) addClip(c);

// ── 3. derived clips ───────────────────────────────────────────────────────────────────────────────
function sliceClip(c, name, t0, t1, src) {
  const f0 = Math.max(0, Math.round(t0 * FPS)), f1 = Math.min(c.n - 1, Math.round(t1 * FPS)), n = f1 - f0 + 1;
  return { name, n, q: c.q.slice(f0 * NB * 4, (f1 + 1) * NB * 4), p: c.p.slice(f0 * 3, (f1 + 1) * 3), src };
}
function reverseClip(c, name, src) {
  const q = new Float32Array(c.q.length), p = new Float32Array(c.p.length);
  for (let f = 0; f < c.n; f++) { q.set(c.q.subarray((c.n - 1 - f) * NB * 4, (c.n - f) * NB * 4), f * NB * 4); p.set(c.p.subarray((c.n - 1 - f) * 3, (c.n - f) * 3), f * 3); }
  return { name, n: c.n, q, p, src };
}
// Sit: a UAL-direction pose (thighs level, shins down, forearms on the thighs), upper body from Idle_FoldArms frame 0
// replaced by relaxed arms. Solved by the same retargeter so it lands exactly on the canonical bones.
{
  const K = ualData.keys, base = ualData.clips.Idle_FoldArms_Loop;
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => Math.round((x / l) * 1000) / 1000); };
  const set = {
    spineA: [0, 1, 0.08], spineB: [0, 1, 0.02], spineC: [0, 1, 0], neck: [0, 1, 0.12],
    armL: [0.25, -0.85, 0.35], foreL: [0.1, -0.3, 1], handL: [0.02, -0.4, 1],
    armR: [-0.25, -0.85, 0.35], foreR: [-0.1, -0.3, 1], handR: [-0.02, -0.4, 1],
    legL: [0.12, -0.08, 1], shinL: [0.02, -1, 0.06], footL: [0.05, -0.25, 1],
    legR: [-0.12, -0.08, 1], shinR: [-0.02, -1, 0.06], footR: [-0.05, -0.25, 1],
  };
  const frame = K.flatMap((k, i) => (set[k] ? nrm(set[k]) : base.dirs.slice(i * 3, i * 3 + 3)));
  // hips drop: thighs level => pelvis at knee height. Knee height ≈ (shin + ankle) of the canonical rig.
  const Lp = (b) => canon.world[b].p;
  const knee = Lp('LeftLeg').y, hipH = Lp('Hips').y - Math.min(Lp('LeftFoot').y, Lp('RightFoot').y);
  const drop = Math.round(((knee - Lp('Hips').y) / hipH) * 1000) / 1000;
  const n = 2, sit = { dur: 1, n, dirs: [...frame, ...frame], hipQ: [0, 0, 0, 1, 0, 0, 0, 1], hipP: [0, drop, 0, 0, drop, 0] };
  const [c] = solveUAL({ ...ualData, clips: { Sit_Chair_Loop: sit } }, ['Sit_Chair_Loop']);
  // resample the 1-second hold to 2 keys (duration 1 s) — the reducer keeps it tiny
  c.n = 31; const q = new Float32Array(NB * 31 * 4), p = new Float32Array(31 * 3);
  for (let f = 0; f < 31; f++) { q.set(c.q.subarray(0, NB * 4), f * NB * 4); p.set(c.p.subarray(0, 3), f * 3); }
  c.q = q; c.p = p; c.src = 'ual2-synthetic (UAL direction pose)';
  addClip(c);
}

// ── FK on the canonical bones: foot/hand positions per frame (metres, model space) ────────────────
const FK_BONES = ['Hips', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftHand', 'RightHand', 'Spine'];
function fk(c) {
  const out = {}; for (const b of FK_BONES) out[b] = new Float32Array(c.n * 3);
  const v = new THREE.Vector3();
  for (let f = 0; f < c.n; f++) {
    for (let i = 0; i < NB; i++) C.bones[i].quaternion.fromArray(c.q, (f * NB + i) * 4);
    C.bones[0].position.fromArray(c.p, f * 3);
    C.body.updateMatrixWorld(true);
    for (const b of FK_BONES) { v.setFromMatrixPosition(C.bones[BONES.indexOf(b)].matrixWorld); out[b].set([v.x, v.y, v.z], f * 3); }
  }
  for (let i = 0; i < NB; i++) { C.bones[i].quaternion.copy(BIND_LQ[i]); C.bones[i].position.copy(BIND_LP[i]); }
  C.body.updateMatrixWorld(true);
  return out;
}

// the roll: the lowest-hips stretch of Run_Jump_and_Roll (the tuck), padded to a full roll
{
  const src = clips.get('Run_Jump_and_Roll');
  if (src) {
    const P = fk(src).Hips; let fmin = 0;
    for (let f = 0; f < src.n; f++) if (P[f * 3 + 1] < P[fmin * 3 + 1]) fmin = f;
    const standY = P[1], thr = standY * 0.72;                // the roll = hips below 72% of standing height
    let a = fmin, b = fmin;
    while (a > 0 && P[(a - 1) * 3 + 1] < thr) a--;
    while (b < src.n - 1 && P[(b + 1) * 3 + 1] < thr) b++;
    const t0 = Math.max(0, a / FPS - 0.15), t1 = Math.min((src.n - 1) / FPS, b / FPS + 0.25);
    addClip(sliceClip(src, 'Roll', t0, t1, 'meshy:enforcer, cut from Run_Jump_and_Roll ' + t0.toFixed(2) + '-' + t1.toFixed(2) + 's'));
  }
  const lay = clips.get('LayToIdle');
  if (lay) addClip(reverseClip(lay, 'Lie_Down', 'ual2, LayToIdle reversed'));
}

// ── classify ───────────────────────────────────────────────────────────────────────────────────────
const LOCO = /^(Walking|Running|Sneaky_Walk_inplace|Flirty_Strut_inplace|Walk_Carry_Loop)$/;   // Confident_Strut walks out 2 m and back: emote
const TAGS = [
  ['locomotion', LOCO],
  ['attack', /kick|punch|slash|combo|jab|attack|Sword_(Regular|Heavy|Dash)|Melee|Boxing|Fist|Blade|Shield_(Dash|OneShot)|Throw|360_Power_Spin_Jump/i],
  ['block', /Sword_Block|Idle_Shield_(Loop|Break)/],
  ['traversal', /Jump|Roll|Vault|Backflip$|Climb|Slide|Handstand/],
  ['emote', /Danc|Groove|Swing|Beads|Strut|Handstand|^Yes$|Idle_No/i],
  ['social', /Phone|^Yes$|Idle_No|Rail|Sit_|Consume|Idle_FoldArms/],
  ['work', /Farm_|TreeChopping|Chest_Open|Carry|Consume/],
  ['idle', /Idle/],
  ['react', /Hit_|Knockback|Lie_Down|LayToIdle/],
  ['death', /^Lie_Down$/],
  ['getup', /^LayToIdle$/],
  ['sit', /^Sit_/],
];
const LOOP = /Loop|^(Walking|Running|Sneaky_Walk_inplace|Confident_Strut|Flirty_Strut_inplace|Boxing_Practice|Indoor_Swing|Gangnam_Groove|Cardio_Dance|Crystal_Beads|Denim_Pop_Dance|FunnyDancing_03|Hip_Hop_Dance_4)$/;

// ── in place + natural speed + foot phase + hit frames ───────────────────────────────────────────────
const NO_GROUND = /Lie_Down|LayToIdle|Roll|Slide|Sit_|Handstand|Climb|Vault|Backflip$|Jump_Idle_Loop/;
const FIXES = {};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const srcKey = (src) => (/meshy/.test(src) ? 'meshy' : 'ual2');
function sourceFix(src) { const k = srcKey(src); return FIXES[k] && FIXES[k].length ? median(FIXES[k]) : 0; }
function analyse(c) {
  const tags = TAGS.filter(([, re]) => re.test(c.name)).map(([t]) => t);
  const loop = LOOP.test(c.name), dur = (c.n - 1) / FPS, cm = canon.armScale;   // cm -> m
  // root motion = the straight line start -> end of the hips over the clip (metres)
  const dx = (c.p[(c.n - 1) * 3] - c.p[0]) * cm, dz = (c.p[(c.n - 1) * 3 + 2] - c.p[2]) * cm;
  // strip it: hips XZ minus the linear trend, so the sway stays but the body never leaves its origin
  for (let f = 0; f < c.n; f++) {
    const a = c.n > 1 ? f / (c.n - 1) : 0;
    c.p[f * 3] -= (dx / cm) * a; c.p[f * 3 + 2] -= (dz / cm) * a;
  }
  // ground contact: Meshy's own clips sink the ankle ~3-4 cm below its bind height (Walking: toe 6 cm under) and the
  // struts float 3-5 cm. Re-seat each clip so its lowest ankle sits at the bind ankle height. Not for clips whose
  // lowest point is not a standing foot (lying, sitting, rolling, sliding, handstand, climbing, vaults).
  let groundFix = 0;
  if (NO_GROUND.test(c.name)) groundFix = sourceFix(c.src);          // airborne / lying: use the source's typical offset
  else {
    const F0 = fk(c); let lo = Infinity;
    for (let f = 0; f < c.n; f++) lo = Math.min(lo, F0.LeftFoot[f * 3 + 1], F0.RightFoot[f * 3 + 1]);
    groundFix = CANON_ANKLE - lo; (FIXES[srcKey(c.src)] ||= []).push(groundFix);
  }
  if (Math.abs(groundFix) > 0.005) for (let f = 0; f < c.n; f++) c.p[f * 3 + 1] += groundFix / cm; else groundFix = 0;
  let excursion = 0;
  for (let f = 0; f < c.n; f++) excursion = Math.max(excursion, Math.hypot(c.p[f * 3] - c.p[0], c.p[f * 3 + 2] - c.p[2]) * cm);
  let speedMps = 0, speedFrom = null, footPhase = 0;
  const F = fk(c);
  if (tags.includes('locomotion')) {
    const rootSpeed = Math.hypot(dx, dz) / Math.max(dur, 1e-3);
    // planted-foot cadence: while a foot is the lowest and near the floor it moves backwards at walking speed
    const vs = [], fl = F.LeftFoot, fr = F.RightFoot;
    let minY = Infinity; for (let f = 0; f < c.n; f++) minY = Math.min(minY, fl[f * 3 + 1], fr[f * 3 + 1]);
    for (let f = 1; f < c.n; f++) {
      const L = fl[f * 3 + 1] <= fr[f * 3 + 1], A = L ? fl : fr;
      if (A[f * 3 + 1] > minY + 0.04) continue;
      const v = Math.hypot(A[f * 3] - A[(f - 1) * 3], A[f * 3 + 2] - A[(f - 1) * 3 + 2]) * FPS;
      if (v < 12) vs.push(v);
    }
    const footSpeed = median(vs);
    if (rootSpeed > 0.25) { speedMps = rootSpeed; speedFrom = 'root'; } else { speedMps = footSpeed; speedFrom = 'feet'; }
    c.check = { rootSpeed: +rootSpeed.toFixed(3), footSpeed: +footSpeed.toFixed(3) };
    // heel strike of the left foot = its most-forward point along the travel direction (+Z = facing)
    let best = -Infinity, bf = 0;
    for (let f = 0; f < c.n; f++) { const z = fl[f * 3 + 2] - F.Hips[f * 3 + 2]; if (z > best) { best = z; bf = f; } }
    footPhase = +(bf / Math.max(1, c.n - 1)).toFixed(3);
  }
  // hit frames: fastest end-effector moments (hips-relative), nudged forward to peak extension
  let hitFrames = [];
  if (tags.includes('attack')) {
    const E = ['LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase'];
    const rel = (b, f) => [F[b][f * 3] - F.Hips[f * 3], F[b][f * 3 + 1] - F.Hips[f * 3 + 1], F[b][f * 3 + 2] - F.Hips[f * 3 + 2]];
    const spd = new Float32Array(c.n), ext = new Float32Array(c.n);
    for (let f = 1; f < c.n; f++) for (const b of E) {
      const a = rel(b, f), p0 = rel(b, f - 1), r = rel(b, 0);
      spd[f] = Math.max(spd[f], Math.hypot(a[0] - p0[0], a[1] - p0[1], a[2] - p0[2]) * FPS);
      ext[f] = Math.max(ext[f], Math.hypot(a[0] - r[0], a[1] - r[1], a[2] - r[2]));
    }
    const sm = spd.map((_, f) => (spd[Math.max(0, f - 1)] + spd[f] * 2 + spd[Math.min(c.n - 1, f + 1)]) / 4);
    const mx = Math.max(...sm), minGap = Math.round(0.28 * FPS), maxHits = Math.max(1, Math.min(6, Math.round(dur / 0.55)));
    const peaks = [];
    for (let f = 2; f < c.n - 2; f++) if (sm[f] >= sm[f - 1] && sm[f] > sm[f + 1] && sm[f] > mx * 0.55) peaks.push(f);
    peaks.sort((a, b) => sm[b] - sm[a]);
    for (const f of peaks) if (hitFrames.length < maxHits && hitFrames.every((h) => Math.abs(h - f) >= minGap)) hitFrames.push(f);
    hitFrames = hitFrames.map((f) => { let g = f; for (let k = f; k <= Math.min(c.n - 1, f + Math.round(0.15 * FPS)); k++) if (ext[k] > ext[g]) g = k; return g; }).sort((a, b) => a - b);
  }
  // attacks that read fine on the upper body alone while the legs keep walking (no kicks, flips, lunges)
  const upperOk = tags.includes('attack') && !/kick|flip|spin|jump|roll|dash|lunge|sweep|handstand|vault/i.test(c.name) && Math.hypot(dx, dz) < 0.5;
  return {
    // inPlace: start = end on the spot and the hips never wander more than 0.6 m (lunges/strut excursions are flagged)
    name: c.name, duration: +dur.toFixed(4), frames: c.n, loop, inPlace: excursion < 0.6, excursionM: +excursion.toFixed(3), ...(upperOk ? { upperOk } : {}),
    speedMps: +speedMps.toFixed(3), ...(speedFrom ? { speedFrom, footPhase } : {}),
    rootMotionM: [+dx.toFixed(3), +dz.toFixed(3)], ...(groundFix ? { groundFixM: +groundFix.toFixed(3) } : {}), tags,
    ...(hitFrames.length ? { hitFrames, hitTimes: hitFrames.map((f) => +(f / FPS).toFixed(3)) } : {}),
    source: c.src,
  };
}

// ── keyframe reduction + GLB ───────────────────────────────────────────────────────────────────────
function reduce(times, vals, k, tol) {           // greedy: drop keys that interpolation reproduces within tol
  const n = times.length; if (n <= 2) return [...Array(n).keys()];
  const keep = [0]; let a = 0;
  const err = (a, b, i) => {
    const u = (times[i] - times[a]) / (times[b] - times[a]);
    if (k === 4) {
      const o = [0, 0, 0, 0]; THREE.Quaternion.slerpFlat(o, 0, vals, a * 4, vals, b * 4, u);
      const d = Math.abs(o[0] * vals[i * 4] + o[1] * vals[i * 4 + 1] + o[2] * vals[i * 4 + 2] + o[3] * vals[i * 4 + 3]);
      return 2 * Math.acos(Math.min(1, d));
    }
    let e = 0; for (let j = 0; j < 3; j++) e = Math.max(e, Math.abs(vals[a * 3 + j] + (vals[b * 3 + j] - vals[a * 3 + j]) * u - vals[i * 3 + j])); return e;
  };
  for (let b = 2; b < n; b++) {
    let ok = true; for (let i = a + 1; i < b; i++) if (err(a, b, i) > tol) { ok = false; break; }
    if (!ok) { keep.push(b - 1); a = b - 1; }
  }
  keep.push(n - 1);
  return keep;
}
const constant = (vals, k, n, tol) => { for (let i = 1; i < n; i++) for (let j = 0; j < k; j++) if (Math.abs(vals[i * k + j] - vals[j]) > tol) return false; return true; };

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('AgentClips');
const armN = doc.createNode('Armature').setScale([canon.armScale, canon.armScale, canon.armScale]);
scene.addChild(armN);
const nodes = C.bones.map((b) => doc.createNode(b.name).setTranslation(b.position.toArray()).setRotation(b.quaternion.toArray()));
BONES.forEach((_, i) => (PARENT[i] < 0 ? armN : nodes[PARENT[i]]).addChild(nodes[i]));

const inputCache = new Map();
function timeAccessor(times) {
  const key = times.length + ':' + Array.from(times, (t) => Math.round(t * FPS)).join(',');
  if (!inputCache.has(key)) inputCache.set(key, doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer));
  return inputCache.get(key);
}
const metaClips = [];
const order = [...clips.values()].sort((a, b) => a.name.localeCompare(b.name));
order.sort((a, b) => NO_GROUND.test(a.name) - NO_GROUND.test(b.name));   // grounded clips first: they set the per-source fix
const metaByName = {};
for (const c of order) {
  const m = analyse(c); metaByName[c.name] = m;
  metaClips.push(m);
  const anim = doc.createAnimation(c.name);
  const times = Float32Array.from({ length: c.n }, (_, f) => f / FPS);
  // long emote loops (dances) are fed to the reducer at 15 fps — about 40% of the raw data, and slerp hides it
  const stride = m.tags.includes('emote') && !m.tags.includes('locomotion') && m.duration > 4 ? 2 : 1;
  const cand = []; for (let f = 0; f < c.n; f += stride) cand.push(f); if (cand[cand.length - 1] !== c.n - 1) cand.push(c.n - 1);
  const reduceOn = (vals, k, tol) => {
    const t = Float32Array.from(cand, (f) => times[f]), v = new Float32Array(cand.length * k);
    cand.forEach((f, j) => v.set(vals.subarray(f * k, f * k + k), j * k));
    return reduce(t, v, k, tol).map((j) => cand[j]);
  };
  for (let i = 0; i < NB; i++) {
    const v = new Float32Array(c.n * 4);
    for (let f = 0; f < c.n; f++) {
      v.set(c.q.subarray((f * NB + i) * 4, (f * NB + i) * 4 + 4), f * 4);
      if (f && v[f * 4] * v[f * 4 - 4] + v[f * 4 + 1] * v[f * 4 - 3] + v[f * 4 + 2] * v[f * 4 - 2] + v[f * 4 + 3] * v[f * 4 - 1] < 0) for (let j = 0; j < 4; j++) v[f * 4 + j] *= -1;   // hemisphere continuity
    }
    if (TIPS.has(BONES[i])) for (let f = 0; f < c.n; f++) v.set(BIND_LQ[i].toArray(), f * 4);
    const keep = constant(v, 4, c.n, 2e-4) ? [0] : reduceOn(v, 4, ROT_TOL);
    const q16 = new Int16Array(keep.length * 4);
    keep.forEach((f, j) => { for (let k = 0; k < 4; k++) q16[j * 4 + k] = Math.round(Math.max(-1, Math.min(1, v[f * 4 + k])) * 32767); });
    const out = doc.createAccessor().setType('VEC4').setArray(q16).setNormalized(true).setBuffer(buffer);
    const smp = doc.createAnimationSampler().setInput(timeAccessor(keep.map((f) => times[f]))).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(nodes[i]).setTargetPath('rotation').setSampler(smp));
  }
  const keepP = constant(c.p, 3, c.n, 0.05) ? [0, c.n - 1] : reduceOn(c.p, 3, POS_TOL);   // >= 2 keys: the clip keeps its duration
  const pv = new Float32Array(keepP.length * 3); keepP.forEach((f, j) => pv.set(c.p.subarray(f * 3, f * 3 + 3), j * 3));
  const ps = doc.createAnimationSampler().setInput(timeAccessor(keepP.map((f) => times[f]))).setOutput(doc.createAccessor().setType('VEC3').setArray(pv).setBuffer(buffer)).setInterpolation('LINEAR');
  anim.addSampler(ps).addChannel(doc.createAnimationChannel().setTargetNode(nodes[0]).setTargetPath('translation').setSampler(ps));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const glbPath = path.join(OUT_DIR, 'agent-clips.glb');
fs.writeFileSync(glbPath, await io.writeBinary(doc));

metaClips.sort((a, b) => a.name.localeCompare(b.name));
const byName = Object.fromEntries(metaClips.map((m) => [m.name, m]));
const pick = (...n) => n.find((x) => byName[x]) || null;
const meta = {
  v: 1, fps: FPS,
  credits: {
    meshy: 'Meshy AI animation library, generated on the owner\'s Meshy account (Emerald Enforcer + Neon Valkyrie merged-animation exports)',
    ual2: 'Universal Animation Library 2 [Standard] by Quaternius — CC0 1.0',
  },
  skeleton: {
    rig: 'meshy-v6 (canonical bind = ZEROX _m6)', bones: BONES, parents: PARENT,
    armatureScale: canon.armScale, hipsY: +CANON_HIPS.y.toFixed(3),
    legM: +CANON_LEG.toFixed(4), ankleM: +CANON_ANKLE.toFixed(4), hipsM: canon.world.Hips.p.toArray().map((x) => +x.toFixed(4)), hipM: +(CANON_HIPS.y * canon.armScale).toFixed(4),
    bindWorldQ: Object.fromEntries(BONES.map((b) => [b, canon.world[b].q.toArray().map((x) => +x.toFixed(6))])),
    upper: BONES.filter((b, i) => { for (let j = i; j >= 0; j = PARENT[j]) if (BONES[j] === 'Spine02') return true; return false; }),
  },
  locomotion: { idle: pick('Idle_No_Loop', 'Idle_FoldArms_Loop'), walk: pick('Walking'), run: pick('Running'), sprint: null },
  actions: {
    jumpStart: pick('NinjaJump_Start'), jumpLoop: pick('NinjaJump_Idle_Loop'), jumpLand: pick('NinjaJump_Land'),
    doubleJump: pick('Backflip'), roll: pick('Roll'), vault: pick('Parkour_Vault_with_Roll'), climb: pick('ClimbUp_1m'),
    slideStart: pick('Slide_Start'), slideLoop: pick('Slide_Loop'), slideExit: pick('Slide_Exit'),
    hit: pick('Hit_Knockback'), death: pick('Lie_Down'), getUp: pick('LayToIdle'), sit: pick('Sit_Chair_Loop'), block: pick('Sword_Block'),
  },
  clips: metaClips,
};
fs.writeFileSync(path.join(OUT_DIR, 'agent-clips.json'), JSON.stringify(meta, null, 1));

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1) + ' KB';
log(`\n${metaClips.length} clips -> ${path.relative(ROOT, glbPath)} ${kb(glbPath)} · agent-clips.json ${kb(path.join(OUT_DIR, 'agent-clips.json'))}`);
for (const m of metaClips) log(`  ${m.name.padEnd(26)} ${m.duration.toFixed(2).padStart(6)}s ${m.loop ? 'loop' : 'once'} ${m.speedMps ? (m.speedMps.toFixed(2) + 'm/s(' + m.speedFrom + ')') : ''} [${m.tags.join(',')}]${m.hitFrames ? ' hits@' + m.hitTimes.join('/') : ''} root ${m.rootMotionM.join(',')} gf ${m.groundFixM || 0} exc ${m.excursionM}${m.inPlace ? '' : ' NOT-IN-PLACE'} ${clips.get(m.name).check ? JSON.stringify(clips.get(m.name).check) : ''}`);
