// node tools/tests/world-transit-kit.test.mjs — world-transit-kit.js dressing logic with fake kit scenes (no browser)
import * as THREE from '../../public/vendor/three/three.module.js';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; require('../../public/world-transit-kit.js'); const K = globalThis.WorldTransitKit;
let pass = 0; const t = async (n, fn) => { await fn(); pass++; console.log('  ok ', n); };
const near = (a, b, e = 1e-3) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const PM = 7 / 1.8;

function part(name) { const g = new THREE.Group(); g.name = name; g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())); return g; }
function fakeApi() {
  const group = new THREE.Group(), cols = new THREE.Object3D(), collars = new THREE.Object3D();
  const list = [{ x: 100, z: 0, g: 5 }, { x: 0, z: 100, g: 8 }, { x: -70.7, z: 70.7, g: 2 }];
  const S = new THREE.Group(); const canopy = new THREE.Mesh(); canopy.userData.codeCanopy = true; const plat = new THREE.Mesh(); plat.userData.codePlatform = true; const board = new THREE.Mesh();
  S.add(canopy, plat, board);
  return { group, pylons: { cols, collars, list, deckBottom: 60, PM }, stations: [{ id: 'rift', realm: 'void', top: 64, onRing: true, group: S }, { id: 'central', realm: 'grid', top: 9, onRing: false, group: new THREE.Group() }], _canopy: canopy, _plat: plat, _board: board };
}
class FakeLoader {
  load(url, ok) {
    if (url.endsWith('shaddai_maglev_kit_v01.glb')) { const sc = new THREE.Group(); sc.add(part('maglev_pylon_foot'), part('maglev_pylon_shaft'), part('maglev_pylon_cap')); return ok({ scene: sc }); }
    if (url.endsWith('shaddai_station_void_v01.glb')) { const sc = new THREE.Group(); sc.name = 'void-station'; return ok({ scene: sc }); }
    throw new Error('unexpected url ' + url);
  }
}

await t('pylons: 3 parts x 2 primitives instanced for every pylon, code cylinders hidden', async () => {
  const api = fakeApi(), r = await K.dress({ THREE, GLTFLoader: FakeLoader, api });
  const ims = api.group.children.filter(o => o.isInstancedMesh);
  assert.strictEqual(ims.length, 6); ims.forEach(im => assert.strictEqual(im.count, 3));
  assert.strictEqual(api.pylons.cols.visible, false); assert.strictEqual(api.pylons.collars.visible, false); assert.strictEqual(r.pylons, 3);
});
await t('shaft spans foot top to cap bottom; cap sits under the deck, turned to the ring radius', async () => {
  const api = fakeApi(); await K.dress({ THREE, GLTFLoader: FakeLoader, api });
  const get = (name, i) => { const im = api.group.children.find(o => o.name === 'transit-kit-' + name); const m = new THREE.Matrix4(); im.getMatrixAt(i, m); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q, s }; };
  const sh = get('maglev_pylon_shaft', 0), cap = get('maglev_pylon_cap', 1);
  near(sh.p.y, 5 + 1.5 * PM); near(sh.p.y + sh.s.y, 60 - 3.9 * PM);
  near(cap.p.y, 60); const x = new THREE.Vector3(1, 0, 0).applyQuaternion(cap.q); near(Math.abs(x.z), 1);   // pylon 1 sits at +z: hammerhead along z
});
await t('ring stations get their realm canopy at top - 1 m; code dome + platform hidden, name board kept; off-ring skipped', async () => {
  const api = fakeApi(), r = await K.dress({ THREE, GLTFLoader: FakeLoader, api });
  const m = api.stations[0].group.children.find(o => o.name === 'void-station');
  assert(m); near(m.position.y, 64 - PM); near(m.scale.x, PM);
  assert.strictEqual(api._canopy.visible, false); assert.strictEqual(api._plat.visible, false); assert.strictEqual(api._board.visible, true);
  assert.strictEqual(r.stations, 1);
});
await t('a missing kit leaves the code geometry alone', async () => {
  const api = fakeApi();
  class Missing { load(url, ok, prog, err) { err(new Error('404')); } }
  const r = await K.dress({ THREE, GLTFLoader: Missing, api });
  assert.strictEqual(r.pylons, 0); assert.strictEqual(api.pylons.cols.visible, true); assert.strictEqual(api._canopy.visible, true);
});
console.log(`${pass} passed, 0 failed`);
