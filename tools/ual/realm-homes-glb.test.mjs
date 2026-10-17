// node tools/ual/realm-homes-glb.test.mjs — Blender home kits in world-realm-homes.js (REAL GLBs): K21 forest pods + K18 desert homes become home
// types, villages place them on the ground, each (type, material) is ONE InstancedMesh, homes are solid + enterable with a borrowed recipe.
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js'; import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; globalThis.self = globalThis; globalThis.THREE = THREE;
globalThis.Image = class { addEventListener(t, f) { if (t === 'load') setTimeout(() => f({ target: this }), 0); } removeEventListener() {} set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url, import.meta.url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
require('../../public/world-realm-homes.js');
let pass = 0, fail = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', String(e.stack).split('\n').slice(0, 2).join(' | ')); } };
const U = 7 / 1.8, registered = [], layout = { realmColliders: [] };
const rh = window.buildWorldRealmHomes({ THREE, scene: new THREE.Scene(), heightAt: () => 10, layout, interiors: { register: (r) => registered.push(r) } });
const FOREST = ['small', 'long', 'grand'].map((p) => ({ type: 'forest-pod-' + p, node: 'home_forest_pod_' + p, label: p, recipe: 'pod-home' }));
const DESERT = ['twin_dome', 'tower_wing', 'battered_block', 'arch_compound'].map((p) => ({ type: 'desert-' + p.replace('_', '-'), node: 'home_desert_' + p, label: p, recipe: 'cave-home', sink: 0.15 }));
let added = [];
await t('both kits load: 3 forest pods + 4 desert homes become home types', async () => {
  added = (await rh.addGlbKits(new Loader(), '/assets/kits/shaddai_forest_homes_v01.glb', FOREST)).concat(await rh.addGlbKits(new Loader(), '/assets/kits/shaddai_desert_homes_v01.glb', DESERT));
  assert.strictEqual(added.length, 7, added.join());
});
await t('sizes are real homes (5-40 m footprint, 3-20 m tall) and each (type, material) is one InstancedMesh', async () => {
  added.forEach((k) => { const T = rh.types[k]; assert(T.size[0] >= 5 && T.size[0] <= 40 && T.size[1] >= 5 && T.size[1] <= 40 && T.size[2] >= 3 && T.size[2] <= 20, k + ' ' + T.size.map((v) => v.toFixed(1)));
    assert(T.meshes.length >= 1 && T.meshes.length <= 6, k + ' meshes ' + T.meshes.length); T.meshes.forEach((im) => assert(im.isInstancedMesh)); });
});
await t('villages: grounded, solid (collider), enterable with the borrowed recipe, instanced on update', async () => {
  const v = rh.village('desert-twin-dome', 0, 0, 3, { radius: 26, seed: 3 }).concat(rh.village('forest-pod-grand', 500, 0, 2, { radius: 26 }));
  assert.strictEqual(v.length, 5); v.forEach((h) => assert(Math.abs(h.y - (10 - h.T.sink * U)) < 1e-6 || h.y <= 10));
  assert(layout.realmColliders.filter((c) => /realmhome/.test(c.label)).length >= 5);
  const recs = registered.filter((r) => /desert|forest/.test(r.key)); assert.strictEqual(recs.length, 5); assert(recs.every((r) => r.recipe === 'cave-home' || r.recipe === 'pod-home'));
  rh.update(0, 0); assert.strictEqual(rh.types['desert-twin-dome'].meshes[0].count, 3); assert.strictEqual(rh.types['forest-pod-grand'].meshes[0].count, 2);
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
