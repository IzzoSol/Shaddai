// node tools/ual/naval-kit.test.mjs — Blender K24 boats (galleon / skimmer / nautilus) used by the naval battle game (REAL GLB + GLTFLoader)
import * as THREE from 'three';
import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const el = () => { const e = { style: {}, innerHTML: '', textContent: '', dataset: {}, onclick: null, remove() { }, addEventListener() { }, appendChild() { }, closest: () => null }; e.querySelector = () => el(); e.querySelectorAll = () => []; return e; };
globalThis.window = globalThis; globalThis.addEventListener = () => { }; globalThis.removeEventListener = () => { }; globalThis.document = { createElement: el, body: { appendChild() { } }, activeElement: null, addEventListener() { }, removeEventListener() { } };
const store = {}; globalThis.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } };
require('../../public/world-naval.js'); require('../../public/world-naval-view.js');
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url, import.meta.url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const U = 7 / 1.8;
const n = await window.WorldNavalGame.loadKit(THREE, Loader);
t('three Blender boats load', () => assert.strictEqual(n, 3));
const root = new THREE.Group(); root.scale.setScalar(U); const arena = { root, dims: { A: 62, B: 44 }, floors: { autoBattle: true, state: {} }, fields: { setField() { }, include: [] } };
const N = window.WorldNavalGame.create({ THREE, getArena: () => arena });
for (const cls of ['galleon', 'skimmer', 'nautilus']) t(cls + ': every boat in the battle uses its Blender model, team trim re-tinted per team', () => {
  assert(N.start({ mode: 'fleet', cls }));
  const grp = root.getObjectByName('naval-play'), boats = N.game().state().boats; assert.strictEqual(grp.children.length, boats.length);
  boats.forEach((b, i) => {
    let kit = null; grp.children[i].traverse((o) => { if (/^naval_(galleon|skimmer|nautilus)$/.test(o.name)) kit = o; }); assert(kit && kit.name === 'naval_' + b.cls, 'kit model for ' + b.cls);
    let trims = 0; kit.traverse((o) => { if (o.isMesh && o.material && !/naval_trim/.test(o.material.name) && o.material.emissive && o.material.emissive.getHex() === o.material.color.getHex() && o.material.color.getHex() !== 0) trims++; });
    assert(trims > 0, 'team trim material applied');
  });
  if (cls === 'galleon') { root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(grp.children[0].children[0]), sz = box.getSize(new THREE.Vector3()); assert(sz.z / U > 10 && sz.z / U < 17 && sz.x / U > 4 && sz.x / U < 7.5, 'galleon footprint ' + (sz.x / U).toFixed(1) + 'x' + (sz.z / U).toFixed(1) + ' m'); }
  N.stop();
});
console.log(`${pass} passed, 0 failed`); process.exit(0);
