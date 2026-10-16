'use strict';
/**
 * tools/tests/world-clusters-fabric.test.cjs — pure-function tests for public/world-clusters-v4.js (no THREE, no browser).
 * Loads the classic script in a vm context with a fake `window`, then tests window.__clustersV4Internals.
 * Run: node tools/tests/world-clusters-fabric.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-clusters-v4.js'), 'utf8'), { window, Math, console }, { filename: 'world-clusters-v4.js' });
const I = window.__clustersV4Internals;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

const FABRIC_KEYS = ['sc-storefront-s', 'sc-storefront-l', 'sc-office', 'sc-office-mid', 'sc-market', 'sc-techlab', 'sc-garden', 'sc-teleport', 'sc-civic-tower', 'sc-ad-pylon', 'sc-tower-slab', 'sc-tower-setback', 'sc-tower-spire']   // sc-tower-* = Blender K1 towers (tools/grid-city/k1-fabric-pick.cjs);

test('script exposes loader + internals', () => {
  assert.strictEqual(typeof window.buildWorldClustersV4, 'function');
  assert.ok(I && typeof I.urlOf === 'function' && typeof I.pickTier === 'function' && typeof I.presetFor === 'function');
  assert.ok(Math.abs(I.U - 7 / 1.8) < 1e-12);
});

test('urlOf: realm keys unchanged (root vs fal, lod dir)', () => {
  assert.strictEqual(I.urlOf('bld-apartment-pod-block', 0), '/assets/models/bld-apartment-pod-block.glb');
  assert.strictEqual(I.urlOf('volcano-gate', 0), '/assets/models/volcano-gate.glb');
  assert.strictEqual(I.urlOf('some-fal-thing', 0), '/assets/models/fal/some-fal-thing.glb');
  assert.strictEqual(I.urlOf('bld-apartment-pod-block', 1), '/assets/models/lod/bld-apartment-pod-block-lod1.glb');
  assert.strictEqual(I.urlOf('some-fal-thing', 2), '/assets/models/lod/some-fal-thing-lod2.glb');
});

test('urlOf: sc- keys → shaddai-city (full, lod1, lod2)', () => {
  assert.strictEqual(I.urlOf('sc-office', 0), '/assets/models/shaddai-city/sc-office.glb');
  assert.strictEqual(I.urlOf('sc-office', 1), '/assets/models/shaddai-city/lod/sc-office-lod1.glb');
  assert.strictEqual(I.urlOf('sc-office', 2), '/assets/models/shaddai-city/lod/sc-office-lod2.glb');
  assert.strictEqual(I.urlOf('sc-office', undefined), '/assets/models/shaddai-city/sc-office.glb');
});

test('presetFor: realm default keeps rev-2 distances, no lod2 band', () => {
  for (const u of [undefined, '/assets/world/realm-clusters-v4.json']) {
    const p = I.presetFor(u);
    assert.strictEqual(p.near_m, 450); assert.strictEqual(p.far_m, 2500); assert.strictEqual(p.hide_m, 2500);
    assert.strictEqual(p.name, 'world-clusters-v4');
  }
});

test('presetFor: grid fabric = 250 / 900 / 2600 m', () => {
  const p = I.presetFor('/assets/world/grid-fabric-v4.json');
  assert.deepStrictEqual([p.near_m, p.far_m, p.hide_m, p.name], [250, 900, 2600, 'grid-fabric-v4']);
});

test('pickTier: fabric distances, all lods present', () => {
  const U = I.U, P = I.presetFor('/assets/world/grid-fabric-v4.json');
  const T = m => I.pickTier(m * U, P.near_m * U, P.far_m * U, P.hide_m * U, true, true);
  assert.strictEqual(T(-500), 0); assert.strictEqual(T(0), 0); assert.strictEqual(T(249), 0);
  assert.strictEqual(T(250), 1); assert.strictEqual(T(899), 1);
  assert.strictEqual(T(900), 2); assert.strictEqual(T(2599), 2);
  assert.strictEqual(T(2600), 3); assert.strictEqual(T(99999), 3);
});

test('pickTier: missing lod2 → lod1 covers the lod2 band; missing both → full', () => {
  const n = 250, f = 900, h = 2600;
  assert.strictEqual(I.pickTier(1500, n, f, h, true, false), 1);
  assert.strictEqual(I.pickTier(1500, n, f, h, false, false), 0);
  assert.strictEqual(I.pickTier(500, n, f, h, false, true), 0);
  assert.strictEqual(I.pickTier(1500, n, f, h, false, true), 2);
  assert.strictEqual(I.pickTier(3000, n, f, h, true, false), 3);
});

test('pickTier: realm (hide == far) reproduces rev-2 near/mid/hidden exactly', () => {
  const n = 450, f = 2500;
  for (let d = -1000; d < 4000; d += 7) {
    for (const has1 of [true, false]) {
      const old = d < n ? 0 : (d < f && has1 ? 1 : (d < f ? 0 : 2));      // rev-2 formula
      const t = I.pickTier(d, n, f, f, has1, false);
      assert.strictEqual(t === 3 ? 2 : t, old, 'd=' + d + ' has1=' + has1);
    }
  }
});

test('grid-fabric-v4.json: every item maps to a known sc- key and a shaddai-city URL', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'world', 'grid-fabric-v4.json'), 'utf8'));
  assert.ok(Array.isArray(plan.items) && plan.items.length > 4000, 'items: ' + (plan.items && plan.items.length));
  const seen = new Set(), clusters = new Set();
  for (const it of plan.items) {
    assert.ok(FABRIC_KEYS.includes(it.key), 'unknown key ' + it.key);
    for (const f of ['x_m', 'y_m', 'len_m']) assert.ok(Number.isFinite(it[f]), it.key + ' bad ' + f);
    assert.ok(it.len_m > 0);
    seen.add(it.key); clusters.add(it.cluster);
    assert.ok(/^\/assets\/models\/shaddai-city\/sc-[a-z-]+\.glb$/.test(I.urlOf(it.key, 0)));
  }
  assert.deepStrictEqual([...clusters].sort(), ['commons', 'ne-campus', 'nw-race']);
  console.log('       ' + plan.items.length + ' items · ' + seen.size + ' keys · clusters ' + [...clusters].join(','));
});

test('grid-fabric-v4.json: cell count estimate (draw-call budget)', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'world', 'grid-fabric-v4.json'), 'utf8'));
  const cell = I.CELL_M * I.U, cells = new Map();
  for (const it of plan.items) {
    const ck = Math.floor(it.x_m * I.U / cell) + ',' + Math.floor(-it.y_m * I.U / cell);
    (cells.get(ck) || cells.set(ck, new Set()).get(ck)).add(it.key);
  }
  let pairs = 0; for (const s of cells.values()) pairs += s.size;
  assert.ok(cells.size > 0 && pairs <= cells.size * FABRIC_KEYS.length);
  console.log('       ' + cells.size + ' cells · ' + pairs + ' (cell, key) instanced batches per visible tier (× mesh parts per model)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
