// node tools/ual/landmark-kits.test.mjs — Blender landmark kits swapped into the game (REAL GLBs, REAL GLTFLoader):
// K15 Athenaeum rotunda replaces the code rotunda shell + balconies in buildAthenaeumCampus; K13 grand lobby matches the Colosseum lobby frame.
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js'; import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /create.*Gradient/.test(k) ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
function el() { return { style: {}, getContext: () => ctx2d, width: 0, height: 0, addEventListener() {}, appendChild() {} }; }
globalThis.window = globalThis; globalThis.self = globalThis; globalThis.document = { createElement: el, body: el() }; globalThis.location = { search: '' }; globalThis.THREE = THREE;
globalThis.Image = class { addEventListener(t, f) { if (t === 'load') setTimeout(() => f({ target: this }), 0); } removeEventListener() {} set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url.split('?')[0], import.meta.url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
let pass = 0, fail = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', String(e.stack).split('\n').slice(0, 2).join(' | ')); } };
require('../../public/athenaeum-layout.js'); require('../../public/world-athenaeum.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await t('Athenaeum without a loader: code rotunda only, nothing hidden', async () => {
  delete window.__GLTFLoaderClass; const c = window.buildAthenaeumCampus(THREE, { scene: new THREE.Scene() }); let hidden = 0, rot = 0;
  c.group.traverse((o) => { if (o.isMesh && !o.visible) hidden++; if (/#rot/.test(o.name)) rot++; }); assert.strictEqual(rot, 0); assert.strictEqual(hidden, 0); c.dispose && c.dispose();
});
await t('Athenaeum with K15: rotunda shell + balconies hide, the Blender rotunda is added at the centre, wings stay', async () => {
  window.__GLTFLoaderClass = Loader; const c = window.buildAthenaeumCampus(THREE, { scene: new THREE.Scene() }); await wait(300);
  const kit = c.group.getObjectByName('athenaeum-k15'); assert(kit, 'kit added'); assert.strictEqual(kit.parent.name, 'athenaeum-root');
  let rot = 0, rotHidden = 0, bal = 0, wings = 0; c.group.traverse((o) => { if (/#rot/.test(o.name)) { rot++; if (!o.visible) rotHidden++; } if (/^athenaeum-balcony/.test(o.name)) { bal++; assert(!o.visible); } if (o.name === 'static:obsidian' && o.visible) wings++; });
  assert(rot > 3 && rot === rotHidden, rot + '/' + rotHidden); assert.strictEqual(bal, 4); assert.strictEqual(wings, 1, 'wing walls stay');
  const b = new THREE.Box3().setFromObject(kit), s = b.getSize(new THREE.Vector3()); assert(s.x / 1 > 60 && s.x < 90 && s.y > 25 && s.y < 40, 'rotunda ~68 m wide, ~30 m tall: ' + s.toArray().map((v) => v.toFixed(1)));
  assert(Math.abs(b.getCenter(new THREE.Vector3()).x) < 6, 'centred on the rotunda');
  delete window.__GLTFLoaderClass;
});
await t('K13 lobby: 60 x 32 m footprint, origin on the back wall, opens toward +z (the code lobby frame)', async () => {
  const g = await new Promise((res, rej) => new Loader().load('/assets/kits/shaddai_colosseum_lobby_v01.glb', res, null, rej));
  const k = g.scene.getObjectByName('shaddai_colosseum_lobby').clone(true); k.position.set(0, 0, 0); k.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(k), s = b.getSize(new THREE.Vector3());
  assert(Math.abs(s.x - 60) < 6 && s.z > 28 && s.z < 46 && s.y > 22, s.toArray().map((v) => v.toFixed(1)).join(' x '));
  assert(b.min.z > -3 && b.max.z > 28, 'extends from the back wall toward +z: ' + b.min.z.toFixed(1) + '..' + b.max.z.toFixed(1));
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
