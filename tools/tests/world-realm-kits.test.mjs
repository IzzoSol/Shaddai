// node tools/tests/world-realm-kits.test.mjs — realm towns around ring stations (world-realm-kits.js), fake kits, no browser
import * as THREE from '../../public/vendor/three/three.module.js';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; globalThis.WORLD_LAYOUT = { realmColliders: [] }; let rebuilt = 0; globalThis.buildWorldCollision = () => { rebuilt++; };
require('../../public/world-realm-kits.js'); const K = globalThis.WorldRealmKits;
let pass = 0; const t = async (n, fn) => { await fn(); pass++; console.log('  ok ', n); };
const near = (a, b, e = 1e-3) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const PM = 7 / 1.8;

function node(name) { const g = new THREE.Group(); g.name = name; g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())); return g; }
function station(id, realm, x, z, rot) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; return { id, realm, onRing: true, group: g }; }
const transit = { stations: [station('forge', 'volcano', 1000, 0, 0.3), station('desert', 'desert', 0, 20000, 1.2), station('central', 'grid', 0, 700, 0)] };
transit.stations[2].onRing = false;
class Loader {
  load(url, ok, _p, err) {
    if (url.endsWith('shaddai_realm_props_v01.glb')) { const s = new THREE.Group(); ['emberfall_rune_pad', 'emberfall_obsidian_spire', 'emberfall_ember_vent', 'emberfall_lava_rock', 'desert_sand_arch', 'desert_hoodoo'].forEach((n) => s.add(node('prop_' + n))); return ok({ scene: s }); }
    if (url.endsWith('shaddai_realm_buildings_volcano_v01.glb')) { const s = new THREE.Group(); ['shop', 'hall', 'tower'].forEach((k) => s.add(node('shaddai_bld_volcano_' + k))); return ok({ scene: s }); }
    err(new Error('404 ' + url));                                          // desert buildings + desert mesa missing on purpose
  }
}

await t('placements: station-local metres -> world units with the station rotation; mirrored pairs stay symmetric', () => {
  const st = { x: 100, z: 50, rot: Math.PI / 2 };
  const [a, b] = K._placements(st, [['x', 10, 20, 0, 1], ['x', -10, 20, 0, 1]]);
  near(a.x, 100 + 20 * PM); near(a.z, 50 - 10 * PM);                     // rot 90: local +z -> world +x, local +x -> world -z
  near((a.x + b.x) / 2, 100 + 20 * PM); near((a.z + b.z) / 2, 50);
});
await t('the hall faces back toward the station (door +z rotated 180)', () => {
  const [h] = K._placements({ x: 0, z: 0, rot: 0 }, [K.BUILDINGS[0]]);
  const door = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw);
  assert(door.z < -0.99, 'hall door should face -z (the station)');
});
await t('only ring stations get towns; every piece is instanced; colliders only for models that exist; collision rebuilt', async () => {
  const scene = new THREE.Scene();
  const r = await K.build({ THREE, GLTFLoader: Loader, scene, transit, heightAt: () => 5 });
  assert.strictEqual(r.stats.towns, 2);
  const ims = []; r.group.traverse((o) => { if (o.isInstancedMesh) ims.push(o); }); assert(ims.length > 0);
  assert(ims.some((m) => /bld:volcano:hall/.test(m.name)) && !ims.some((m) => /bld:desert/.test(m.name)) && !ims.some((m) => /mesa/.test(m.name)));
  const labels = WORLD_LAYOUT.realmColliders.map((c) => c.label);
  assert(labels.some((l) => /bld:volcano:hall$/.test(l)) && !labels.some((l) => /bld:desert|mesa/.test(l)), 'colliders follow loaded models');
  assert.strictEqual(rebuilt, 1);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(); ims[0].getMatrixAt(0, m); p.setFromMatrixPosition(m); near(p.y, 5);
});
await t('FPS: each town is its own group and only towns near the player draw', async () => {
  globalThis.WORLD_LAYOUT = { realmColliders: [] };
  const me = { x: 1000, z: 0 };
  const r = await K.build({ THREE, GLTFLoader: Loader, scene: new THREE.Scene(), transit, heightAt: () => 0, getPlayer: () => me, autoUpdate: false });
  assert.strictEqual(r.group.children.length, 2);                         // forge town + desert town (desert has props only)
  assert.strictEqual(r.towns.forge.visible, true); assert.strictEqual(r.towns.desert.visible, false);
  me.x = 0; me.z = 20000; r.update(me); assert.strictEqual(r.towns.forge.visible, false); assert.strictEqual(r.towns.desert.visible, true);
});
console.log(`${pass} passed, 0 failed`);
