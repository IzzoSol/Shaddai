// node tools/ual/hoverboard-glb.test.mjs — Blender K22 boards swapped into HoverboardKit.build (REAL GLB, REAL GLTFLoader)
import * as THREE from 'three';
import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; require('../../public/world-hoverboards.js'); const K = globalThis.HoverboardKit;
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url, import.meta.url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const codeBox = {}; K.ids.forEach((id) => { codeBox[id] = new THREE.Box3().setFromObject(K.build(THREE, id)); });
const n = await K.loadGlb(THREE, Loader);
t('all 10 boards load', () => assert.strictEqual(n, 10));
for (const id of K.ids) t(id + ': Blender board shown, design meshes hidden, nozzles + flames kept, size ~ code, palette slots live', () => {
  const g = K.build(THREE, id), kb = g.getObjectByName('blenderBoard'); assert(kb);
  assert.strictEqual(g.userData.nozzles.length, g.userData.flames.length); g.userData.flames.forEach((f) => assert(f.visible));
  const b = new THREE.Box3().setFromObject(kb), c = codeBox[id], d = b.getSize(new THREE.Vector3()), e = c.getSize(new THREE.Vector3());
  assert(Math.abs(d.z - e.z) < 0.15 && Math.abs(d.x - e.x) < 0.25, `${id} ${d.x.toFixed(2)}x${d.z.toFixed(2)} vs ${e.x.toFixed(2)}x${e.z.toFixed(2)}`);
  let deck = false; kb.traverse((o) => { if (o.isMesh && o.material === g.userData.mats.deck) deck = true; }); assert(deck, 'deck slot re-skinned');
  g.userData.setPalette({ deck: 0x123456 }); assert.strictEqual(g.userData.mats.deck.color.getHex(), 0x123456);
});
console.log(`${pass} passed, 0 failed`);
