// node tools/tests/world-agent-gear.test.mjs — bind-pose bone attach math for world-agent-gear.js (no browser, vendored three)
import * as THREE from '../../public/vendor/three/three.module.js';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; require('../../public/world-agent-gear.js'); const G = globalThis.WorldAgentGear;

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ok ', name); };
const near = (a, b, eps = 1e-4) => assert(Math.abs(a - b) < eps, `${a} != ${b}`);

// mock agent: root scaled x2 and turned 90 deg; Hips > Spine02 > neck > Head > head_end ; Hips > LeftForeArm / RightForeArm
function agent() {
  const model = new THREE.Group(); model.scale.setScalar(2); model.rotation.y = Math.PI / 2; model.position.set(5, 0, -3);
  const mk = (n, p, parent) => { const b = new THREE.Bone(); b.name = n; b.position.set(...p); parent.add(b); return b; };
  const hips = mk('Hips', [0, 1, 0], model), sp = mk('Spine02', [0, 0.12, 0], hips), neck = mk('neck', [0, 0.31, 0], sp);
  const head = mk('Head', [0, 0.085, 0], neck); mk('head_end', [0, 0.25, 0], head);          // head 0.25 (ref 0.196) -> x1.2755, x2 model
  mk('LeftForeArm', [0.27, 0.1, 0], hips); mk('RightForeArm', [-0.27, 0.1, 0], hips);
  model.updateMatrixWorld(true); return model;
}
function gearNode(name, bone, slot, offset) {
  const o = new THREE.Object3D(); o.name = name; o.userData = { bone, slot, ref_head_m: 0.196 };
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)); m.position.set(...offset); o.add(m); return o;
}
G._add(gearNode('acc_head_cap', 'Head', 'head', [0, 0.1, -0.05]), THREE);
G._add(gearNode('acc_head_halo', 'Head', 'head', [0, 0.3, 0]));
G._add(gearNode('acc_wrist_bangles_L', 'LeftForeArm', 'wrist', [0.05, 0, 0]));
G._add(gearNode('acc_wrist_bangles_R', 'RightForeArm', 'wrist', [-0.05, 0, 0]));

t('item lands on the bone joint, scaled by head size (incl. model scale)', () => {
  const a = agent(), it = G.equip(a, 'acc_head_cap'); a.updateMatrixWorld(true);
  const head = a.getObjectByName('Head'), hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  const ip = new THREE.Vector3().setFromMatrixPosition(it.matrixWorld); near(ip.distanceTo(hp), 0);
  const ws = new THREE.Vector3(); it.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
  near(ws.y, (0.25 * 2) / 0.196);
});
t('item offsets follow the model rotation (front stays front)', () => {
  const a = agent(), it = G.equip(a, 'acc_head_cap'); a.updateMatrixWorld(true);
  const child = new THREE.Vector3().setFromMatrixPosition(it.children[0].matrixWorld), base = new THREE.Vector3().setFromMatrixPosition(it.matrixWorld);
  const k = (0.25 * 2) / 0.196, exp = new THREE.Vector3(0, 0.1, -0.05).multiplyScalar(k).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  near(child.x - base.x, exp.x); near(child.y - base.y, exp.y); near(child.z - base.z, exp.z);
});
t('item rides the bone when it animates', () => {
  const a = agent(), it = G.equip(a, 'acc_head_cap'), head = a.getObjectByName('Head');
  head.rotation.x = 0.6; a.updateMatrixWorld(true);
  const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld), ip = new THREE.Vector3().setFromMatrixPosition(it.matrixWorld);
  near(ip.distanceTo(hp), 0); assert(it.parent === head);
});
t('one item per slot+bone: halo replaces cap; left and right wrists coexist', () => {
  const a = agent(); G.equip(a, 'acc_head_cap'); G.equip(a, 'acc_head_halo'); G.equip(a, 'acc_wrist_bangles_L'); G.equip(a, 'acc_wrist_bangles_R');
  const e = G.equipped(a);
  assert.deepStrictEqual(e, { 'head:Head': 'acc_head_halo', 'wrist:LeftForeArm': 'acc_wrist_bangles_L', 'wrist:RightForeArm': 'acc_wrist_bangles_R' });
  G.unequip(a, 'head:Head'); assert(!G.equipped(a)['head:Head']);
});
t('unknown item or missing bone returns null, never throws', () => {
  const a = agent(); assert.strictEqual(G.equip(a, 'acc_nope'), null);
  G._add(gearNode('acc_tail_x', 'Tail', 'tail', [0, 0, 0])); assert.strictEqual(G.equip(a, 'acc_tail_x'), null);
});
console.log(`${pass} passed, 0 failed`);
