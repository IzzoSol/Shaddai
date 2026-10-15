// node tools/ual/hovership-glb.test.mjs — Blender K5 race-ship hulls swapped into WorldHoverCars.buildGroup (REAL GLBs, REAL GLTFLoader)
import * as THREE from 'three';
import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; require('../../public/world-hovercars.js'); const HC = globalThis.WorldHoverCars;
class Loader { load(url, ok, _p, err) { const f = '../../public' + url; let b; try { b = fs.readFileSync(new URL(f, import.meta.url)); } catch (e) { return err(e); }
  new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const before = HC.buildGroup(THREE, 'arrow');
const n = await HC.loadShips(THREE, Loader);
t('all five Blender hulls load', () => assert.strictEqual(n, 5));
for (const id of ['arrow', 'viper', 'raptor', 'lancer', 'bruiser']) t(id + ': Blender hull shown, code hull hidden, effects + saddle kept, size matches TYPES', () => {
  const g = HC.buildGroup(THREE, id), hull = g.getObjectByName('blenderHull'); assert(hull);
  g.children.forEach((c) => { if (c !== hull && c.isMesh && c.name !== 'hoverSkirt' && c.name !== 'boostRing' && c.material && c.material.blending !== THREE.AdditiveBlending) assert.strictEqual(c.visible, false, 'code mesh visible'); });
  assert(g.getObjectByName('hoverSkirt') && g.getObjectByName('flame') && g.userData.saddle);
  const box = new THREE.Box3().setFromObject(hull), sz = box.getSize(new THREE.Vector3()), m = HC.TYPES.find((x) => x.id === id);
  assert(Math.abs(sz.z - m.len) < 0.6 && Math.abs(sz.x - m.w) < 0.6, `${id} size ${sz.x.toFixed(2)}x${sz.z.toFixed(2)} vs ${m.w}x${m.len}`);
  let sd; hull.traverse((o) => { if (o.name === 'saddle_' + id) sd = o.position; }); assert(sd && g.userData.saddle.position.distanceTo(sd) < 1e-6);
  g.children.filter((c) => /^exhaust/.test(c.name)).forEach((e) => { let ok = false; hull.traverse((o) => { if (/^hook_exhaust_/.test(o.name) && o.position.distanceTo(e.position) < 1e-6) ok = true; }); assert(ok, 'exhaust on a hook'); });
});
t('built before load / road cars: code hull', () => { assert(!before.getObjectByName('blenderHull')); assert(!HC.buildGroup(THREE, 'sedan').getObjectByName('blenderHull')); });
console.log(`${pass} passed, 0 failed`);
