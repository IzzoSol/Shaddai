// node tools/rig-mount.mjs [name...]   (run from the repo root)
// PROCEDURAL RIG for the static mecha-mount GLBs (Meshy meshes are static; Meshy auto-rig is humanoid-only, so no fal spend):
//   public/assets/models/mount-<x>.glb  ->  public/assets/mounts/<x>.glb  (skin + bones + baked clips + a 'saddle' node for riders)
//   quad  (bull, mammoth): root > body > head/tail + 4 legs (upper/lower).  clips idle, walk (diagonal gait), run.
//   biped (gorilla)      : root > spine > head + 2 arms (upper/lower) + 2 legs (upper/lower). clips idle, walk, run (knuckle-walk).
//   bird  (hawk)         : root > body > head/tail + 2 wings (inner/outer). clips idle, fly (flap), glide. The baked-in rock base is cut away.
// Weights are region-based (smooth blends at joints); every vertex gets <= 2 bones. All numbers live in CFG below (model units: unit bbox, +z = front, +x = left).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const CFG = {
  'bot-uni9': { out: 'uni9', kind: 'wheelbot', path: 'fal-assets/characters/bot-uni9/bot-uni9-mesh.glb', outDir: 'public/assets/bots' },
  'bot-analyst': { out: 'analyst', kind: 'wheelbot', path: 'fal-assets/characters/bot-analyst/bot-analyst-mesh.glb', outDir: 'public/assets/bots' },
  'mount-forge-bull': { out: 'bull', kind: 'quad', body: [0, 0.2, -0.05], hip: -0.10, knee: -0.50, legX: 0.32, front: 0.32, rear: -0.45, legRZ: 0.32, legRX: 0.27, head: { joint: [0, 0.25, 0.5], z: 0.5, yMin: -0.2 }, tail: { joint: [0, 0.3, -0.85], z: -0.8 }, saddle: [0, 0.66, -0.1], stride: 0.55, bob: 0.02 },
  'mount-glacier-mammoth': { out: 'mammoth', kind: 'quad', body: [0, 0.1, 0], hip: -0.18, knee: -0.42, legX: 0.31, front: 0.26, rear: -0.34, legRZ: 0.28, legRX: 0.25, head: { joint: [0, 0.05, 0.5], z: 0.5, yMin: -0.42 }, tail: { joint: [0, -0.2, -0.75], z: -0.72 }, saddle: [0, 0.47, -0.05], stride: 0.42, bob: 0.015 },
  'mount-canopy-gorilla': { out: 'gorilla', kind: 'biped', pelvis: [0, -0.12, 0.05], spine: [0, 0.1, 0.05], head: { joint: [0, 0.6, 0.08], y: 0.52 }, shoulderY: 0.42, shoulderX: 0.55, elbowY: -0.05, armX: 0.42, hipX: 0.26, hipY: -0.15, kneeY: -0.58, saddle: [0, 0.72, -0.12], stride: 0.5, bob: 0.03 },
  'mount-sky-hawk': { out: 'hawk', kind: 'bird', body: [0, -0.05, 0], rockCutY: -0.57, wing: { inner: [0.2, 0.22, 0], outer: [0.55, 0.5, 0], zone: 0.3, yMin: 0.0 }, head: { joint: [0, 0.1, 0.5], z: 0.42 }, tail: { joint: [0, -0.1, -0.55], z: -0.5 }, saddle: [0, 0.22, -0.02], flap: 0.65 },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), sst = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const qx = a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)], qy = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)], qz = a => [0, 0, Math.sin(a / 2), Math.cos(a / 2)], QI = [0, 0, 0, 1];

function skeleton(c) {   // [name, parent, worldPos]
  if (c.kind === 'quad') return [['root', null, [0, 0, 0]], ['body', 'root', c.body], ['head', 'body', c.head.joint], ['tail', 'body', c.tail.joint],
    ['legFL_u', 'body', [c.legX, c.hip, c.front]], ['legFL_l', 'legFL_u', [c.legX, c.knee, c.front]], ['legFR_u', 'body', [-c.legX, c.hip, c.front]], ['legFR_l', 'legFR_u', [-c.legX, c.knee, c.front]],
    ['legBL_u', 'body', [c.legX, c.hip, c.rear]], ['legBL_l', 'legBL_u', [c.legX, c.knee, c.rear]], ['legBR_u', 'body', [-c.legX, c.hip, c.rear]], ['legBR_l', 'legBR_u', [-c.legX, c.knee, c.rear]]];
  if (c.kind === 'biped') return [['root', null, [0, 0, 0]], ['pelvis', 'root', c.pelvis], ['spine', 'pelvis', c.spine], ['head', 'spine', c.head.joint],
    ['armL_u', 'spine', [c.shoulderX, c.shoulderY, 0]], ['armL_l', 'armL_u', [c.shoulderX + 0.2, c.elbowY, 0.1]], ['armR_u', 'spine', [-c.shoulderX, c.shoulderY, 0]], ['armR_l', 'armR_u', [-c.shoulderX - 0.2, c.elbowY, 0.1]],
    ['legL_u', 'pelvis', [c.hipX, c.hipY, 0.1]], ['legL_l', 'legL_u', [c.hipX + 0.02, c.kneeY, 0.15]], ['legR_u', 'pelvis', [-c.hipX, c.hipY, 0.1]], ['legR_l', 'legR_u', [-c.hipX - 0.02, c.kneeY, 0.15]]];
  if (c.kind === 'wheelbot') return [['root', null, [0, 0, 0]], ['body', 'root', [0, c.cy, c.cz]], ['wheel', 'root', [c.cx, c.cy, c.cz]], ['head', 'body', [0, c.headY, c.cz]],
    ['armL_u', 'body', [c.armX, c.shY, c.cz]], ['armL_l', 'armL_u', [c.armX + 0.06 * c.H, c.elY, c.cz + 0.02 * c.H]], ['armR_u', 'body', [-c.armX, c.shY, c.cz]], ['armR_l', 'armR_u', [-c.armX - 0.06 * c.H, c.elY, c.cz + 0.02 * c.H]]];
  return [['root', null, [0, 0, 0]], ['body', 'root', c.body], ['head', 'body', c.head.joint], ['tail', 'body', c.tail.joint],
    ['wingL_i', 'body', c.wing.inner], ['wingL_o', 'wingL_i', c.wing.outer], ['wingR_i', 'body', [-c.wing.inner[0], c.wing.inner[1], c.wing.inner[2]]], ['wingR_o', 'wingR_i', [-c.wing.outer[0], c.wing.outer[1], c.wing.outer[2]]]];
}

function weightsFor(c, p, names) {   // -> [[boneName, w], ...] (sum 1)
  const [x, y, z] = p, W = [];
  const add = (n, w) => { if (w > 1e-3) W.push([n, w]); };
  if (c.kind === 'quad') {
    let legs = 0; const parts = [];
    for (const [tag, cx, cz] of [['FL', c.legX, c.front], ['FR', -c.legX, c.front], ['BL', c.legX, c.rear], ['BR', -c.legX, c.rear]]) {
      const inLane = sst(c.legRX + 0.12, c.legRX - 0.02, Math.abs(x - cx)) * sst(c.legRZ + 0.12, c.legRZ - 0.02, Math.abs(z - cz));
      const wy = sst(c.hip, c.hip - 0.2, y) * inLane;                     // fades in below the hip
      if (wy > 0.02) { const low = sst(c.knee + 0.07, c.knee - 0.07, y); parts.push([`leg${tag}_u`, wy * (1 - low)], [`leg${tag}_l`, wy * low]); legs += wy; }
    }
    if (legs > 1) parts.forEach(q => q[1] /= legs), legs = 1;
    parts.forEach(q => add(q[0], q[1]));
    const rest = 1 - legs, hd = sst(c.head.z - 0.12, c.head.z + 0.12, z) * sst(c.head.yMin - 0.1, c.head.yMin + 0.1, y), tl = sst(c.tail.z + 0.12, c.tail.z - 0.12, z);
    add('head', rest * hd); add('tail', rest * tl * (1 - hd)); add('body', rest * (1 - hd) * (1 - tl));
  } else if (c.kind === 'wheelbot') {
    const ax = Math.abs(x), side = x >= 0 ? 'L' : 'R', dy = y - c.cy, dz = z - c.cz, rad = Math.sqrt(dy * dy + dz * dz);
    const wheelW = sst(c.R * 0.92, c.R * 0.7, rad) * sst(c.cy + c.R * 0.15, c.cy - c.R * 0.35, y) * sst(c.tireHalf + 0.05 * c.H, c.tireHalf - 0.02 * c.H, ax);   // the tire (lower ring around the axle); the fender/shell above stays put
    const armW = sst(c.armX - 0.06 * c.H, c.armX + 0.04 * c.H, ax) * sst(c.cy + 0.25 * c.H, c.cy + 0.45 * c.H, y) * sst(c.headY + 0.05 * c.H, c.headY - 0.12 * c.H, y) * (1 - wheelW), armLow = sst(c.elY + 0.06 * c.H, c.elY - 0.06 * c.H, y);
    const headW = sst(c.headY - 0.1 * c.H, c.headY + 0.03 * c.H, y) * (1 - armW) * (1 - wheelW);
    add('wheel', wheelW); add(`arm${side}_u`, armW * (1 - armLow)); add(`arm${side}_l`, armW * armLow); add('head', headW); add('body', Math.max(0, 1 - wheelW - armW - headW));
  } else if (c.kind === 'biped') {
    const side = Math.sign(x) >= 0 ? 'L' : 'R', ax = Math.abs(x);
    const armW = sst(c.armX - 0.08, c.armX + 0.08, ax) * sst(-0.9, -0.7, y) * sst(0.62, 0.5, y);   // outer columns between shoulder and hand
    const legW = sst(c.armX + 0.05, c.armX - 0.08, ax) * sst(c.hipY + 0.05, c.hipY - 0.15, y) * (1 - armW);
    const headW = sst(c.head.y - 0.1, c.head.y + 0.1, y) * sst(0.55, 0.4, ax) * (1 - armW);
    const armLow = sst(c.elbowY + 0.1, c.elbowY - 0.1, y), legLow = sst(c.kneeY + 0.1, c.kneeY - 0.1, y);
    add(`arm${side}_u`, armW * (1 - armLow)); add(`arm${side}_l`, armW * armLow); add(`leg${side}_u`, legW * (1 - legLow)); add(`leg${side}_l`, legW * legLow);
    add('head', headW); const rest = clamp(1 - armW - legW - headW, 0, 1); add('spine', rest * sst(-0.12, 0.05, y)); add('pelvis', rest * (1 - sst(-0.12, 0.05, y)));
  } else {
    const side = x >= 0 ? 'L' : 'R', ax = Math.abs(x), wz = sst(c.wing.zone - 0.1, c.wing.zone + 0.1, ax) * sst(c.wing.yMin - 0.15, c.wing.yMin + 0.1, y);
    const outer = sst(c.wing.outer[0] - 0.25, c.wing.outer[0] + 0.15, ax);
    add(`wing${side}_i`, wz * (1 - outer)); add(`wing${side}_o`, wz * outer);
    const rest = 1 - wz, hd = sst(c.head.z - 0.1, c.head.z + 0.1, z) * sst(-0.2, 0.0, y), tl = sst(c.tail.z + 0.1, c.tail.z - 0.1, z);
    add('head', rest * hd); add('tail', rest * tl * (1 - hd)); add('body', rest * (1 - hd) * (1 - tl));
  }
  let s = W.reduce((a, b) => a + b[1], 0); if (s < 1e-6) return [['root', 1]];
  W.sort((a, b) => b[1] - a[1]); const top = W.slice(0, 2); s = top.reduce((a, b) => a + b[1], 0); return top.map(q => [q[0], q[1] / s]);
}

function clips(c) {   // -> { name: { dur, tracks: { bone: fn(t01) -> quat|null }, root?: fn(t01)->[x,y,z] } }
  const T = Math.PI * 2, out = {};
  if (c.kind === 'quad') {
    const gait = (dur, amp, bob) => { const tr = {}, ph = { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI };
      for (const k of Object.keys(ph)) { tr[`leg${k}_u`] = t => qx(-Math.sin(t * T + ph[k]) * amp); tr[`leg${k}_l`] = t => qx(Math.max(0, Math.sin(t * T + ph[k] - 0.9)) * amp * 1.1); }
      tr.body = t => qx(Math.sin(t * T * 2) * 0.03); tr.head = t => qx(Math.sin(t * T * 2 + 0.6) * 0.06); tr.tail = t => qy(Math.sin(t * T) * 0.3);
      return { dur, tracks: tr, root: t => [0, Math.abs(Math.sin(t * T)) * bob, 0] }; };
    out.idle = { dur: 3, tracks: { body: t => qx(Math.sin(t * T) * 0.015), head: t => qx(Math.sin(t * T + 0.8) * 0.05), tail: t => qy(Math.sin(t * T) * 0.2) } };
    out.walk = gait(1.0, c.stride, c.bob); out.run = gait(0.6, c.stride * 1.5, c.bob * 2);
  } else if (c.kind === 'wheelbot') {
    const roll = (dur, lean, arms, spin) => ({ dur, tracks: { wheel: t => qx(t * T * spin), body: t => qx(lean + Math.sin(t * T * 2) * 0.02), head: t => qy(Math.sin(t * T) * 0.1), armL_u: t => qx(-0.4 + Math.sin(t * T * 2) * arms), armR_u: t => qx(-0.4 - Math.sin(t * T * 2) * arms), armL_l: t => qx(-0.3), armR_l: t => qx(-0.3) } });
    out.walk = roll(1.0, 0.1, 0.12, 0); out.run = roll(0.6, 0.2, 0.2, 0);   // no tire spin: Meshy fenders wrap the tire so a spinning wheel bone tears them (lean + arm swing + bob sell the roll)
    out.idle = { dur: 3.2, tracks: { body: t => qx(Math.sin(t * T) * 0.015), head: t => qy(Math.sin(t * T) * 0.3), armL_u: t => qx(-0.15 + Math.sin(t * T + 1) * 0.06), armR_u: t => qx(-0.15 + Math.sin(t * T + 2) * 0.06) } };
  } else if (c.kind === 'biped') {
    const gait = (dur, amp, bob) => { const tr = {};
      tr.legL_u = t => qx(-Math.sin(t * T) * amp); tr.legR_u = t => qx(Math.sin(t * T) * amp); tr.legL_l = t => qx(Math.max(0, Math.sin(t * T - 0.9)) * amp); tr.legR_l = t => qx(Math.max(0, -Math.sin(t * T - 0.9)) * amp);
      tr.armL_u = t => qx(Math.sin(t * T) * amp * 0.9); tr.armR_u = t => qx(-Math.sin(t * T) * amp * 0.9); tr.spine = t => qz(Math.sin(t * T) * 0.05); tr.head = t => qx(Math.sin(t * T * 2) * 0.04);
      return { dur, tracks: tr, root: t => [0, Math.abs(Math.sin(t * T)) * bob, 0] }; };
    out.idle = { dur: 3, tracks: { spine: t => qx(Math.sin(t * T) * 0.02), head: t => qy(Math.sin(t * T) * 0.08), armL_u: t => qx(Math.sin(t * T + 1) * 0.04), armR_u: t => qx(Math.sin(t * T + 2) * 0.04) } };
    out.walk = gait(1.1, c.stride, c.bob); out.run = gait(0.65, c.stride * 1.4, c.bob * 2);
  } else {
    const flap = (dur, a) => ({ dur, tracks: { wingL_i: t => qz(Math.sin(t * T) * a), wingR_i: t => qz(-Math.sin(t * T) * a), wingL_o: t => qz(Math.sin(t * T - 0.7) * a * 0.7), wingR_o: t => qz(-Math.sin(t * T - 0.7) * a * 0.7), body: t => qx(Math.sin(t * T) * 0.04), tail: t => qx(Math.sin(t * T - 0.5) * 0.12), head: t => qx(-Math.sin(t * T) * 0.04) }, root: t => [0, Math.sin(t * T - 0.3) * 0.03, 0] });
    out.fly = flap(0.9, c.flap); out.glide = { dur: 4, tracks: { wingL_i: t => qz(0.08 + Math.sin(t * T) * 0.03), wingR_i: t => qz(-0.08 - Math.sin(t * T) * 0.03), body: t => qx(Math.sin(t * T) * 0.02), tail: t => qx(Math.sin(t * T) * 0.06) } };
    out.idle = { dur: 3, tracks: { wingL_i: t => qz(-0.25 + Math.sin(t * T) * 0.02), wingR_i: t => qz(0.25 - Math.sin(t * T) * 0.02), wingL_o: t => qz(-0.2), wingR_o: t => qz(0.2), head: t => qy(Math.sin(t * T) * 0.12), body: t => qx(Math.sin(t * T) * 0.02) } };
  }
  return out;
}

async function rig(src) {
  const c = CFG[src]; const doc = await io.read(c.path || `public/assets/models/${src}.glb`); const R = doc.getRoot(), buf = R.listBuffers()[0], scene = R.getDefaultScene() || R.listScenes()[0];
  if (c.kind === 'wheelbot') {   // derive every joint from the mesh's own bounding box (Meshy static output, real-world scale, +z front)
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = [0, 0, 0], lowZ = 0, lowN = 0; const P = [];
    R.listMeshes().forEach(m => m.listPrimitives().forEach(pr => { const pos = pr.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); P.push([v[0], v[1], v[2]]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } }));
    const H = mx[1] - mn[1]; P.forEach(q => { if (q[1] < mn[1] + 0.25 * H) { lowZ += q[2]; lowN++; } });
    c.H = H; c.R = 0.24 * H; c.cy = mn[1] + c.R; c.cx = 0; c.cz = lowN ? lowZ / lowN : (mn[2] + mx[2]) / 2; c.tireHalf = 0.09 * H; c.headY = mn[1] + 0.8 * H; c.shY = mn[1] + 0.62 * H; c.elY = mn[1] + 0.45 * H; c.armX = 0.2 * H; c.saddle = [0, mn[1] + 0.7 * H, c.cz - 0.02 * H];
    console.log('  wheelbot', src, 'H', H.toFixed(2), 'wheel R', c.R.toFixed(2), 'axle z', c.cz.toFixed(2), 'bbox x', mn[0].toFixed(2), mx[0].toFixed(2));
  }
  const meshNode = R.listNodes().find(n => n.getMesh()); const mesh = meshNode.getMesh(); const bones = skeleton(c), idx = {}; const nodes = {};
  // bones
  bones.forEach(([n, parent, w], i) => { const nd = doc.createNode(n); const pw = parent ? bones.find(b => b[0] === parent)[2] : [0, 0, 0]; nd.setTranslation([w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]]); nodes[n] = nd; idx[n] = i; if (parent) nodes[parent].addChild(nd); });
  scene.addChild(nodes.root);
  const sad = doc.createNode('saddle'); const bodyName = c.kind === 'biped' ? 'spine' : 'body', bw = bones.find(b => b[0] === bodyName)[2]; sad.setTranslation([c.saddle[0] - bw[0], c.saddle[1] - bw[1], c.saddle[2] - bw[2]]); nodes[bodyName].addChild(sad);
  const skin = doc.createSkin('rig'); bones.forEach(([n]) => skin.addJoint(nodes[n])); skin.setSkeleton(nodes.root);
  const ibm = new Float32Array(bones.length * 16); bones.forEach(([, , w], i) => { const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1]; ibm.set(m, i * 16); });
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
  // weights (+ hawk: cut the baked-in rock base)
  let cut = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), n = pos.getCount(), J = new Uint16Array(n * 4), Wt = new Float32Array(n * 4), v = [0, 0, 0];
    for (let i = 0; i < n; i++) { pos.getElement(i, v); const ws = weightsFor(c, v, bones); ws.forEach(([nm, w], k) => { J[i * 4 + k] = idx[nm]; Wt[i * 4 + k] = w; }); }
    prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf)); prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Wt).setBuffer(buf));
    if (c.rockCutY != null) { const ia = prim.getIndices(), arr = ia.getArray(), keep = [], a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0]; for (let t = 0; t < arr.length; t += 3) { pos.getElement(arr[t], a); pos.getElement(arr[t + 1], b); pos.getElement(arr[t + 2], d); if (Math.max(a[1], b[1], d[1]) < c.rockCutY) { cut++; continue; } keep.push(arr[t], arr[t + 1], arr[t + 2]); } ia.setArray(new Uint32Array(keep)); }
  }
  meshNode.setSkin(skin);
  // clips
  const all = clips(c);
  for (const [cn, cl] of Object.entries(all)) {
    const anim = doc.createAnimation(cn), steps = Math.max(12, Math.round(cl.dur * 20)), times = new Float32Array(steps + 1); for (let i = 0; i <= steps; i++) times[i] = cl.dur * i / steps;
    const tIn = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf), mk = (node, path, comps, fn) => { const out = new Float32Array((steps + 1) * comps); for (let i = 0; i <= steps; i++) { const val = fn(i / steps); for (let k = 0; k < comps; k++) out[i * comps + k] = val[k]; }
      const sm = doc.createAnimationSampler().setInput(tIn).setOutput(doc.createAccessor().setType(comps === 4 ? 'VEC4' : 'VEC3').setArray(out).setBuffer(buf)).setInterpolation('LINEAR');
      anim.addSampler(sm); anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sm)); };
    for (const [bn, fn] of Object.entries(cl.tracks)) if (nodes[bn]) mk(nodes[bn], 'rotation', 4, fn);
    if (cl.root) { const base = nodes.root.getTranslation(); mk(nodes.root, 'translation', 3, t => { const o = cl.root(t); return [base[0] + o[0], base[1] + o[1], base[2] + o[2]]; }); }
  }
  await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const outDir = c.outDir || 'public/assets/mounts'; fs.mkdirSync(outDir, { recursive: true }); await io.write(`${outDir}/${c.out}.glb`, doc);
  console.log(c.out, 'bones', bones.length, 'clips', Object.keys(all).join(','), cut ? 'rock tris cut ' + cut : '', Math.round(fs.statSync(`${outDir}/${c.out}.glb`).size / 1024) + ' KB');
}
const want = process.argv.slice(2); for (const k of Object.keys(CFG)) if (!want.length || want.some(w => k.includes(w))) await rig(k);
