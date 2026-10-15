// node tools/ual/park-dress.test.mjs — K25 park dressing on the REAL park v2 (real GLB + placement JSON, real GLTFLoader)
import * as THREE from 'three';
import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; globalThis.location = { search: '' }; globalThis.WORLD_LAYOUT = { realmColliders: [] }; let rebuilt = 0; globalThis.buildWorldCollision = () => { rebuilt++; };
const pub = (u) => new URL('../../public' + u, import.meta.url);
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(pub(u))) });
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };   // no images in node
require('../../public/world-hoverpark-v2.js'); require('../../public/world-park-dress.js');
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(pub(url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const U = 7 / 1.8, scene = new THREE.Scene(), anchor = { x: 5000, z: -3000 }, yaw = 0.7;
const park = window.WorldHoverPark.build({ THREE, scene, U, anchor, heightAt: () => 10, yaw });
const r = await window.WorldParkDress.dress({ THREE, GLTFLoader: Loader, park, U });
const J = JSON.parse(fs.readFileSync(pub('/assets/world/park-dress-v2.json')));
t('every piece in the plan is instanced (one InstancedMesh per primitive)', () => {
  assert(r && r.stats.pieces === J.pieces.length, r && r.stats.pieces + ' vs ' + J.pieces.length);
  const names = new Set(J.pieces.map((p) => p[0])); names.forEach((n) => assert(r.group.children.some((m) => m.name === 'parkdress-' + n), n));
  assert(r.stats.instancedMeshes <= 45, 'draws ' + r.stats.instancedMeshes);   // FPS pass TODO: BatchedMesh per material -> ~10
});
t('placements land in world space: park-local metres x U, rotated with the park, gate at the entrance side', () => {
  scene.updateMatrixWorld(true);
  const im = r.group.children.find((m) => m.name === 'parkdress-park_gate'), m = new THREE.Matrix4(), p = new THREE.Vector3();
  im.getMatrixAt(0, m); p.setFromMatrixPosition(m.premultiply(im.matrixWorld));
  const ex = new THREE.Vector3(0, 0, 164 * U).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  assert(Math.abs(p.x - (anchor.x + ex.x)) < 2 * U && Math.abs(p.z - (anchor.z + ex.z)) < 2 * U, `gate ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
  assert(Math.abs(p.y - park.deckY) < 0.5 * U, 'gate stands on the deck');
});
t('crown sits on the drop-tower roof (27 m preview height = 25.8 m above the deck)', () => {
  const pl = window.WorldParkDress._plan(J).park_crown[0]; assert(Math.abs(pl.y - 25.8) < 1e-6);
});
t('MATRIX walls: code-rain material on the wall panels, ride faces in world space on the rim, colliders pushed + collision rebuilt', () => {
  const mx = r.group.children.filter((m) => m.material && m.material.name === 'wall_matrix'); assert(mx.length >= 3, 'matrix meshes ' + mx.length);
  assert(typeof mx[0].onBeforeRender === 'function');
  const curves = J.pieces.filter((p) => p[0] === 'wall_curve').length; assert(r.walls.length >= curves * 8, 'faces ' + r.walls.length);
  const rim = r.walls.slice(0, 8).map((w) => Math.hypot((w.x0 + w.x1) / 2 - anchor.x, (w.z0 + w.z1) / 2 - anchor.z) / U);
  rim.forEach((d) => assert(d > 145 && d < 151, 'curved wall face radius ' + d.toFixed(1)));
  r.walls.forEach((w) => assert(w.y1 - w.y0 > 5 * U && Math.abs(w.y0 - park.deckY) < 0.5 * U, 'face height'));
  assert(WORLD_LAYOUT.realmColliders.length > 200 && WORLD_LAYOUT.realmColliders.length < 450 && WORLD_LAYOUT.realmColliders.every((c) => /^parkwall:/.test(c.label)) && rebuilt === 1);
});
t('?parkdress=0 = nothing', async () => { globalThis.location = { search: '?parkdress=0' }; assert.strictEqual(await window.WorldParkDress.dress({ THREE, GLTFLoader: Loader, park, U }), null); globalThis.location = { search: '' }; });
console.log(`${pass} passed, 0 failed`); process.exit(0);
