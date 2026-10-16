// node tools/ual/city-k1-towers.test.mjs — Blender K1 towers in the v4 grid city (REAL plan, REAL GLBs): the picked plan towers collapse
// to zero scale, every other building keeps its instances, and each kit mesh is ONE InstancedMesh standing on the plan spots at plan height.
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js'; import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /create.*Gradient/.test(k) ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
globalThis.window = globalThis; globalThis.self = globalThis; globalThis.document = { createElement: () => ({ style: {}, getContext: () => ctx2d, width: 0, height: 0 }) }; globalThis.location = { search: '' }; globalThis.THREE = THREE;
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(new URL('../../public' + u, import.meta.url), 'utf8')) });
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url, import.meta.url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
require('../../public/world-grid-city-v4.js');
const plan = JSON.parse(fs.readFileSync(new URL('../../public/assets/world/grid-city-v4.json', import.meta.url), 'utf8'));
const pick = JSON.parse(fs.readFileSync(new URL('../../public/assets/world/city-kit-towers.json', import.meta.url), 'utf8'));
let pass = 0, fail = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', String(e.stack).split('\n').slice(0, 2).join(' | ')); } };
const U = plan.units_per_m, scene = new THREE.Scene();
function zeroCount(city) { let z = 0, all = 0; const m = new THREE.Matrix4(); city.group.traverse((o) => { if (o.isInstancedMesh && /^grid-city-box/.test(o.name)) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); all++; if (m.elements[0] === 0 && m.elements[5] === 0) z++; } }); return [z, all]; }

await t('pick list: 24 towers, mix of slab / setback / spire, all are real plan towers', async () => {
  assert.strictEqual(pick.towers.length, 24); const ids = new Set(plan.buildings.filter((b) => b.kind === 'tower').map((b) => b.id));
  pick.towers.forEach((p) => assert(ids.has(p.id), p.id)); const kinds = new Set(pick.towers.map((p) => p.kit)); assert.strictEqual(kinds.size, 3);
});
await t('no loader: the code city is untouched (no K1 group, no zeroed boxes)', async () => {
  delete window.__GLTFLoaderClass; const c = window.buildGridCityV4({ THREE, scene, heightAt: () => 0, plan, rebuildCollision: false }); await new Promise((r) => setTimeout(r, 50));
  assert(!c.kitTowers.group); assert.strictEqual(zeroCount(c)[0], 0); c.dispose && c.dispose();
});
await t('with K1: picked buildings collapse, kit meshes instanced on the plan spots at plan height', async () => {
  window.__GLTFLoaderClass = Loader; const c = window.buildGridCityV4({ THREE, scene, heightAt: () => 0, plan, rebuildCollision: false });
  for (let i = 0; i < 100 && !c.kitTowers.group; i++) await new Promise((r) => setTimeout(r, 30));
  assert(c.kitTowers.group, 'K1 group added'); assert.strictEqual(c.kitTowers.count, 24);
  const [z, all] = zeroCount(c); assert(z > 24 && z < all * 0.25, 'zeroed ' + z + ' of ' + all);
  c.kitTowers.group.children.forEach((im) => { const kit = im.name.split('-')[1]; assert(im.isInstancedMesh && im.count === pick.towers.filter((p) => p.kit === kit).length, im.name + ' count ' + im.count); }); assert(c.kitTowers.group.children.length <= 12, 'merged per material: ' + c.kitTowers.group.children.length + ' draws');
  // every tower's world box: centred on its plan spot, height ~ plan height
  const m = new THREE.Matrix4(), byKit = {}; pick.towers.forEach((p) => (byKit[p.kit] = byKit[p.kit] || []).push(p));
  for (const [kit, list] of Object.entries(byKit)) {
    const meshes = c.kitTowers.group.children.filter((im) => im.name.startsWith('k1-' + kit + '-')); assert(meshes.length, 'no meshes for ' + kit);
    list.forEach((p, i) => { const bb = new THREE.Box3(); meshes.forEach((im) => { im.getMatrixAt(i, m); const b2 = im.geometry.boundingBox || (im.geometry.computeBoundingBox(), im.geometry.boundingBox); bb.union(b2.clone().applyMatrix4(m)); });
      const cx = (bb.min.x + bb.max.x) / 2 / U, cz = -(bb.min.z + bb.max.z) / 2 / U, h = (bb.max.y - bb.min.y) / U;
      assert(Math.hypot(cx - p.x_m, cz - p.y_m) < 12, kit + ' ' + p.id + ' off by ' + Math.hypot(cx - p.x_m, cz - p.y_m).toFixed(1) + ' m');
      assert(Math.abs(h - p.h_m) / p.h_m < 0.12, kit + ' ' + p.id + ' height ' + h.toFixed(0) + ' vs plan ' + p.h_m); });
  }
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
