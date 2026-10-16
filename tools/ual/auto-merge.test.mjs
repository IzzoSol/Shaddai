// node tools/ual/auto-merge.test.mjs - auto merge: static decor merges per material, movers + dynamic groups untouched, world positions kept.
import * as THREE from 'three'; import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'; import assert from 'node:assert';
globalThis.window = globalThis; await import('../../public/world-auto-merge.js');
const scene = new THREE.Scene(), deco = new THREE.Group(); deco.name = 'council-towers'; deco.position.set(100, 0, 50); deco.rotation.y = 0.7; scene.add(deco);
const mat = new THREE.MeshStandardMaterial({ color: 0x336699 }), mat2 = new THREE.MeshStandardMaterial({ color: 0x993333 }), box = new THREE.BoxGeometry(1, 2, 1);
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(box, i < 7 ? mat : mat2); m.position.set(i * 3, 1, 0); deco.add(m); }
const mover = new THREE.Mesh(box, mat); mover.position.set(50, 1, 0); deco.add(mover);
const agents = new THREE.Group(); agents.name = 'agent-bodies'; scene.add(agents); for (let i = 0; i < 6; i++) agents.add(new THREE.Mesh(box, mat));
scene.updateMatrixWorld(true); const probe = new THREE.Vector3(); deco.children[2].getWorldPosition(probe);
const p = window.WorldAutoMerge.run({ THREE, scene, mergeGeometries, watchMs: 30 });
setTimeout(() => { mover.position.x += 5; }, 5);
const r = await p; let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok ', n); };
t('7 + 3 same-material meshes became 2 merged meshes', () => { const merged = deco.children.filter((c) => c.name === 'auto-merge'); assert.strictEqual(merged.length, 2); assert.strictEqual(r.removed, 10); });
t('the mesh that moved during the watch is untouched', () => { assert.ok(deco.children.includes(mover)); });
t('dynamic groups (agents) are never merged', () => { assert.strictEqual(agents.children.length, 6); });
t('world positions preserved (merged vertices sit where the originals were)', () => { const m = deco.children.find((c) => c.name === 'auto-merge' && c.material === mat); m.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m), c = new THREE.Vector3(); assert.ok(bb.containsPoint(probe), 'probe ' + probe.toArray()); });
console.log(pass + ' passed, 0 failed');
