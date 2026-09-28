'use strict';
/**
 * tools/tests/world-fabric-night.test.cjs — Task 2 (night glow for grid-fabric buildings).
 * Tests public/world-clusters-v4.js's pure `glowFor` classifier AND the `opts.onMaterial` hook end to end
 * (real `three` from tools/ual, a fake GLTFLoader + fake fetch — no browser, no GPU, no real GLBs).
 * Mirrors exactly what the host (public/SHADDAI-WORLD-3D.html) is expected to wire for the fabric step:
 *   onMaterial: function (mat) { var g = I.glowFor(mat.name); if (g) _v4Sky.addEmissive(mat, g); }
 * Run: node tools/tests/world-fabric-night.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const THREE = require(path.join(ROOT, 'tools', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));

const window = {};
const ctx = { window, Math, console, fetch: undefined };   // `fetch` is set per-build below (lives in this SAME contextified sandbox)
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-clusters-v4.js'), 'utf8'), ctx, { filename: 'world-clusters-v4.js' });
const I = window.__clustersV4Internals;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

// ---- part 1: the pure classifier (no build needed) --------------------------------------------
function assertGlow(name, dayMul, nightMul, msg) {   // I.glowFor's object is built in the vm's own realm: compare fields, not deepStrictEqual (cross-realm prototypes differ)
  const g = I.glowFor(name);
  assert.ok(g, msg || name);
  assert.strictEqual(g.dayMul, dayMul, (msg || name) + ' dayMul');
  assert.strictEqual(g.nightMul, nightMul, (msg || name) + ' nightMul');
}
test('glowFor: matches by material-name pattern with the exact briefed multipliers', () => {
  assertGlow('M_Glass', 0.2, 2.4);
  assertGlow('Glass_smoked_02', 0.2, 2.4);
  assertGlow('trim_emerald', 0.6, 1.8);
  assertGlow('M_EmeraldTrim', 0.6, 1.8);
  assertGlow('block-emerald', 0.6, 1.8, 'lod2 emerald block reuses the trim multipliers');
  assertGlow('block-skylight', 0.3, 2.0);
  assertGlow('artslot-02', 0.8, 1.4);
});

test('glowFor: non-emissive / unrecognised materials return null (skip)', () => {
  assert.strictEqual(I.glowFor('M_Concrete'), null);
  assert.strictEqual(I.glowFor('sidewalk'), null);
  assert.strictEqual(I.glowFor(''), null);
  assert.strictEqual(I.glowFor(undefined), null);
});

// ---- part 2: buildWorldClustersV4 + opts.onMaterial, end to end -------------------------------
// Fake building library: each sc- key resolves to one "gltf" with fixed materials (some SHARED
// across keys/instances/cells, exactly like real glTF materials reused across many placements).
const matGlass = new THREE.MeshStandardMaterial({ name: 'M_Glass' });
const matTrim = new THREE.MeshStandardMaterial({ name: 'trim_emerald' });
const matArtslot = new THREE.MeshStandardMaterial({ name: 'artslot-02' });
const matSkylight = new THREE.MeshStandardMaterial({ name: 'block-skylight' });
const matPlain = new THREE.MeshStandardMaterial({ name: 'M_Concrete' });   // no known pattern → skipped

const MODELS = {
  'sc-office': [matGlass, matTrim],
  'sc-office-mid': [matGlass],       // same M_Glass instance as sc-office: dedupe across KEYS
  'sc-storefront-s': [matArtslot],
  'sc-techlab': [matSkylight],
  'sc-market': [matPlain]
};

function makeGltf(mats) {
  const g = new THREE.Group();
  mats.forEach((m, i) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m); mesh.position.set(i * 0.05, 0, 0); g.add(mesh); });
  return { scene: g };
}

const fakeLoader = {
  load(url, onLoad, onProgress, onError) {
    const base = url.split('/').pop().replace(/\.glb$/, '');
    const lodMatch = /^(.*)-lod([12])$/.exec(base);
    if (lodMatch) { onError(new Error('no lod ' + lodMatch[2] + ' for ' + lodMatch[1])); return; }   // every key: full model only
    const mats = MODELS[base];
    if (!mats) { onError(new Error('unknown key ' + base)); return; }
    onLoad(makeGltf(mats));
  }
};

// plan.items: 'sc-office' placed twice, in two DIFFERENT 250 m cells (dedupe across CELLS too)
const PLAN = {
  items: [
    { key: 'sc-office', cluster: 'commons', x_m: 0, y_m: 0, len_m: 10 },
    { key: 'sc-office', cluster: 'commons', x_m: 2000, y_m: 2000, len_m: 10 },
    { key: 'sc-office-mid', cluster: 'commons', x_m: 100, y_m: 100, len_m: 10 },
    { key: 'sc-storefront-s', cluster: 'commons', x_m: 50, y_m: 50, len_m: 8 },
    { key: 'sc-techlab', cluster: 'commons', x_m: 500, y_m: 500, len_m: 12 },
    { key: 'sc-market', cluster: 'commons', x_m: 10, y_m: 10, len_m: 6 }
  ]
};
ctx.fetch = function () { return Promise.resolve({ json: () => Promise.resolve(PLAN) }); };

function fakeSky() { return { calls: [], addEmissive(mat, o) { this.calls.push({ uuid: mat.uuid, name: mat.name, dayMul: o.dayMul, nightMul: o.nightMul }); } }; }
function hostOnMaterial(sky) { return function (mat) { const g = I.glowFor(mat.name); if (g) sky.addEmissive(mat, g); }; }

async function main() {
  let sky, api;
  await (async () => {
    sky = fakeSky();
    api = await window.buildWorldClustersV4({
      THREE, scene: new THREE.Scene(), loader: fakeLoader, heightAt: () => 0,
      url: '/assets/world/grid-fabric-v4.json', onMaterial: hostOnMaterial(sky)
    });
  })();

  test('fabric build with onMaterial: builds successfully (5 unique keys, 6 placements)', () => {
    assert.ok(api && api.group);
    const s = api.stats();
    assert.strictEqual(s.types, 5); assert.strictEqual(s.items, 6);
  });

  test('each unique emissive material is registered exactly once, even shared across keys/cells', () => {
    const byUuid = {};
    sky.calls.forEach(c => { byUuid[c.uuid] = (byUuid[c.uuid] || 0) + 1; });
    assert.strictEqual(byUuid[matGlass.uuid], 1, 'M_Glass shared by sc-office (×2 cells) + sc-office-mid → still 1 call');
    assert.strictEqual(byUuid[matTrim.uuid], 1);
    assert.strictEqual(byUuid[matArtslot.uuid], 1);
    assert.strictEqual(byUuid[matSkylight.uuid], 1);
  });

  test('non-emissive material (M_Concrete) is skipped: never reaches addEmissive', () => {
    assert.ok(!sky.calls.some(c => c.uuid === matPlain.uuid));
  });

  test('right multipliers by material-name pattern', () => {
    const find = uuid => sky.calls.find(c => c.uuid === uuid);
    assert.deepStrictEqual([find(matGlass.uuid).dayMul, find(matGlass.uuid).nightMul], [0.2, 2.4]);
    assert.deepStrictEqual([find(matTrim.uuid).dayMul, find(matTrim.uuid).nightMul], [0.6, 1.8]);
    assert.deepStrictEqual([find(matSkylight.uuid).dayMul, find(matSkylight.uuid).nightMul], [0.3, 2.0]);
    assert.deepStrictEqual([find(matArtslot.uuid).dayMul, find(matArtslot.uuid).nightMul], [0.8, 1.4]);
  });

  test('total addEmissive calls == unique emissive materials seen (4), not one per instance/cell/key-repeat', () => {
    assert.strictEqual(sky.calls.length, 4);
  });

  await (async () => {
    // same build, but WITHOUT onMaterial (realm-cluster call shape): must not throw and must register nothing.
    const sky2 = fakeSky();
    const api2 = await window.buildWorldClustersV4({
      THREE, scene: new THREE.Scene(), loader: fakeLoader, heightAt: () => 0,
      url: '/assets/world/grid-fabric-v4.json'   // no onMaterial
    });
    test('call without opts.onMaterial (realm-cluster shape): builds fine, registers nothing', () => {
      assert.ok(api2 && api2.group);
      assert.strictEqual(sky2.calls.length, 0);
    });
  })();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
