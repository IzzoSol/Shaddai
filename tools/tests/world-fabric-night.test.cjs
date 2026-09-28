'use strict';
/**
 * tools/tests/world-fabric-night.test.cjs — Task 2 (night glow for grid-fabric buildings).
 * Tests public/world-clusters-v4.js's pure `glowFor` classifier AND the `opts.onMaterial` hook end to end
 * (real `three` from tools/ual, a fake GLTFLoader + fake fetch — no browser, no GPU, no real GLBs).
 * Mirrors exactly what the host (public/SHADDAI-WORLD-3D.html) is expected to wire for the fabric step:
 *   onMaterial: function (mat) { var g = I.glowFor(mat); if (g) _v4Sky.addEmissive(mat, g); }
 *
 * Fix round 1 (review task-2-review.md): glowFor used to take just a material NAME and false-positived on
 * non-emissive materials whose names happen to match a bucket regex, and false-negatived real emissive
 * materials whose names match no regex. glowFor now takes the MATERIAL and gates on it actually emitting
 * (isEmissive: non-black `.emissive` or an `.emissiveMap`) before the name even picks a bucket; any
 * genuinely emissive material with no name match gets DEFAULT_GLOW instead of being silently skipped.
 * The material names/emissiveFactors/emissiveMap flags below are the REAL values from a full sweep of every
 * public/assets/models/shaddai-city/*.glb and lod/*.glb via `node <tmp>/inspect-emissive.mjs <file>`
 * (@gltf-transform/core, same lib tools/ual/inspect-glb.mjs uses, extended to print emissiveFactor /
 * KHR_materials_emissive_strength / emissive texture presence) — see task-2-report.md "Fix round 1" for the
 * full per-file listing.
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
// A plain object shaped like a THREE material is enough for glowFor (it only reads .name/.emissive/.emissiveMap/.emissiveIntensity).
function fakeMat(name, rgb, hasMap) {
  return { name, emissive: { r: (rgb && rgb[0]) || 0, g: (rgb && rgb[1]) || 0, b: (rgb && rgb[2]) || 0 }, emissiveMap: hasMap ? {} : null, emissiveIntensity: 1 };
}
function assertGlow(mat, dayMul, nightMul, msg) {   // I.glowFor's object is built in the vm's own realm: compare fields, not deepStrictEqual (cross-realm prototypes differ)
  const g = I.glowFor(mat);
  assert.ok(g, (msg || mat.name) + ': expected a bucket, got null');
  assert.strictEqual(g.dayMul, dayMul, (msg || mat.name) + ' dayMul');
  assert.strictEqual(g.nightMul, nightMul, (msg || mat.name) + ' nightMul');
}
function assertSkipped(mat, msg) { assert.strictEqual(I.glowFor(mat), null, (msg || mat.name) + ': expected null (skipped)'); }

test('glowFor: real emissive materials get the briefed multipliers, by name pattern', () => {
  assertGlow(fakeMat('M_Glass', [0.25, 0.2, 0.1375], false), 0.2, 2.4, 'M_Glass (sc-* buildings)');
  assertGlow(fakeMat('MI_Trim_01', [0, 1, 0.61], true), 0.6, 1.8, 'MI_Trim_01 (real emerald trim, strength 6)');
  assertGlow(fakeMat('SciFi_Trim', [1, 1, 1], true), 0.6, 1.8);
  assertGlow(fakeMat('Urban_Trim', [1, 1, 1], true), 0.6, 1.8);
  assertGlow(fakeMat('block-skylight', [1, 0.95, 0.82], false), 0.3, 2.0, 'lod2 block-skylight');
  assertGlow(fakeMat('block-emerald', [0, 1, 0.61], false), 0.6, 1.8, 'lod2 block-emerald folded into trim bucket (controller ruling)');
  assertGlow(fakeMat('artslot-05-GREEN GLITCH', [1, 1, 1], true), 0.8, 1.4);
  assertGlow(fakeMat('artslot-01-Gemini_Generated_Image_2', [1, 1, 1], true), 0.8, 1.4);
});

test('glowFor Fix#2: MI_PaddedWall (real emissive, emerald, matches no old regex) → trim bucket via /padd/i', () => {
  assertGlow(fakeMat('MI_PaddedWall', [0, 1, 0.61], true), 0.6, 1.8);
});

test('glowFor Fix#3: real emissive materials with NO name match → DEFAULT_GLOW (0.6/1.8), not skipped', () => {
  assertGlow(fakeMat('Atlas_Sign', [1, 1, 1], true), 0.6, 1.8, 'Atlas_Sign (lit signage, real material, no name match)');
  assertGlow(fakeMat('M_Light', [1, 1, 1], false), 0.6, 1.8, 'M_Light (real material, no name match)');
});

test('glowFor Fix#1: non-emissive materials are skipped EVEN when the name matches a bucket regex', () => {
  // real "Trim" family: emissiveFactor is genuinely [0,0,0] and no emissiveMap for these three
  assertSkipped(fakeMat('MI_Trim_02', [0, 0, 0], false));
  assertSkipped(fakeMat('MI_Trim_03', [0, 0, 0], false));
  assertSkipped(fakeMat('MI_Trim_03_Dark', [0, 0, 0], false));
  assertSkipped(fakeMat('MI_Trim_MetalConcrete', [0, 0, 0], false), 'name matches /trim/i but is not emissive');
});

test('glowFor: other non-emissive / unrelated real materials are skipped', () => {
  ['block-facade', 'Table_Futuristic_01', 'Teleporter', 'HoloPOAP', 'HoloPot', 'MI_Decal_Grey',
    'M_Decal_Screen', 'M_Black', 'M_LightFade_Red', 'Colony_Marbres_01_Mat', 'MI_Dirt', 'BC_Code_Bush_Mat',
    'Seat_01', 'Plant_01_Mat'].forEach(n => assertSkipped(fakeMat(n, [0, 0, 0], false)));
  assertSkipped(fakeMat('', null, false));
  assert.strictEqual(I.glowFor(null), null);
  assert.strictEqual(I.glowFor(undefined), null);
});

// ---- part 2: buildWorldClustersV4 + opts.onMaterial, end to end -------------------------------
// Fake building library: each sc- key resolves to one "gltf" with fixed materials (some SHARED
// across keys/instances/cells, exactly like real glTF materials reused across many placements).
// Names/emissive data below are the REAL ones from sc-office.glb / lod/sc-office-lod2.glb / sc-storefront-s.glb.
function realMat(name, rgb, hasMap, intensity) {
  const m = new THREE.MeshStandardMaterial({ name, emissive: new THREE.Color(rgb ? rgb[0] : 0, rgb ? rgb[1] : 0, rgb ? rgb[2] : 0), emissiveIntensity: intensity != null ? intensity : 1 });
  if (hasMap) m.emissiveMap = new THREE.Texture();   // presence is all glowFor checks
  return m;
}
const matGlass = realMat('M_Glass', [0.25, 0.2, 0.1375], false);
const matTrim01 = realMat('MI_Trim_01', [0, 1, 0.61], true, 6);
const matTrimDead = realMat('MI_Trim_02', [0, 0, 0], false);          // Fix#1 regression: name matches /trim/i, NOT emissive
const matPaddedWall = realMat('MI_PaddedWall', [0, 1, 0.61], true, 6); // Fix#2: real emissive, no old regex match
const matAtlasSign = realMat('Atlas_Sign', [1, 1, 1], true);           // Fix#3: real emissive, no name match → default bucket
const matArtslot = realMat('artslot-01-Gemini_Generated_Image_2', [1, 1, 1], true, 2.5);
const matSkylight = realMat('block-skylight', [1, 0.95, 0.82], false);

const MODELS = {
  'sc-office': [matGlass, matTrim01, matTrimDead, matPaddedWall, matAtlasSign],
  'sc-office-mid': [matGlass],       // same M_Glass instance as sc-office: dedupe across KEYS
  'sc-storefront-s': [matArtslot],
  'sc-techlab': [matSkylight],
  'sc-market': [matTrimDead]         // same dead-trim instance reused: still must never register
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
function hostOnMaterial(sky) { return function (mat) { const g = I.glowFor(mat); if (g) sky.addEmissive(mat, g); }; }   // exactly the host snippet

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
    assert.strictEqual(byUuid[matTrim01.uuid], 1);
    assert.strictEqual(byUuid[matPaddedWall.uuid], 1);
    assert.strictEqual(byUuid[matAtlasSign.uuid], 1);
    assert.strictEqual(byUuid[matArtslot.uuid], 1);
    assert.strictEqual(byUuid[matSkylight.uuid], 1);
  });

  test('Fix#1 regression: non-emissive MI_Trim_02 never reaches addEmissive, even reused across two keys', () => {
    assert.ok(!sky.calls.some(c => c.uuid === matTrimDead.uuid));
  });

  test('Fix#2: MI_PaddedWall (real emissive, matched no old regex) now registers with the trim bucket', () => {
    const c = sky.calls.find(x => x.uuid === matPaddedWall.uuid);
    assert.ok(c, 'MI_PaddedWall should have registered');
    assert.deepStrictEqual([c.dayMul, c.nightMul], [0.6, 1.8]);
  });

  test('Fix#3: Atlas_Sign (real emissive, no name match) now registers with the default bucket', () => {
    const c = sky.calls.find(x => x.uuid === matAtlasSign.uuid);
    assert.ok(c, 'Atlas_Sign should have registered');
    assert.deepStrictEqual([c.dayMul, c.nightMul], [0.6, 1.8]);
  });

  test('right multipliers by material-name pattern (glass / trim / skylight / artslot)', () => {
    const find = uuid => sky.calls.find(c => c.uuid === uuid);
    assert.deepStrictEqual([find(matGlass.uuid).dayMul, find(matGlass.uuid).nightMul], [0.2, 2.4]);
    assert.deepStrictEqual([find(matTrim01.uuid).dayMul, find(matTrim01.uuid).nightMul], [0.6, 1.8]);
    assert.deepStrictEqual([find(matSkylight.uuid).dayMul, find(matSkylight.uuid).nightMul], [0.3, 2.0]);
    assert.deepStrictEqual([find(matArtslot.uuid).dayMul, find(matArtslot.uuid).nightMul], [0.8, 1.4]);
  });

  test('total addEmissive calls == unique GENUINELY emissive materials seen (6), dead trim excluded', () => {
    assert.strictEqual(sky.calls.length, 6);
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
