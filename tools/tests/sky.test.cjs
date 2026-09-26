'use strict';
/**
 * tools/tests/sky.test.cjs — pure-function tests for public/world-sky-v4.js (no THREE, no browser).
 * Run: node tools/tests/sky.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const assert = require('assert');
const S = require(path.join(__dirname, '..', '..', 'public', 'world-sky-v4.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const N = 4000;

test('sun elevation rises monotonically midnight→noon, falls noon→midnight', () => {
  let prev = S.sunElevation(0);
  for (let i = 1; i <= N / 2; i++) { const e = S.sunElevation(i / N); assert.ok(e > prev, 'not rising at t=' + i / N); prev = e; }
  for (let i = N / 2 + 1; i <= N; i++) { const e = S.sunElevation(i / N); assert.ok(e < prev, 'not falling at t=' + i / N); prev = e; }
  assert.ok(Math.abs(S.sunElevation(0.25)) < 1e-9 && Math.abs(S.sunElevation(0.75)) < 1e-9, 'horizon at 0.25 / 0.75');
  assert.ok(S.sunElevation(0.5) > 0.9, 'noon high');
});

test('sunDirection is unit length and matches sunElevation (same path as world-water.js)', () => {
  for (let i = 0; i < 50; i++) {
    const t = i / 50, d = S.sunDirection(t);
    assert.ok(Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-9);
    assert.ok(Math.abs(d[1] - S.sunElevation(t)) < 1e-12);
  }
});

test('night factor: 1 at midnight, 0 at noon, within [0,1]', () => {
  assert.strictEqual(S.nightFactor(S.sunElevation(0)), 1);
  assert.strictEqual(S.nightFactor(S.sunElevation(0.5)), 0);
  for (let i = 0; i <= N; i++) { const n = S.nightFactor(S.sunElevation(i / N)); assert.ok(n >= 0 && n <= 1); }
});

test('phases run night → dawn → day → dusk → night', () => {
  const seq = [];
  for (let i = 0; i <= N; i++) { const p = S.phaseFor(i / N); if (seq[seq.length - 1] !== p) seq.push(p); }
  assert.deepStrictEqual(seq, ['night', 'dawn', 'day', 'dusk', 'night']);
  assert.strictEqual(S.phaseFor(0), 'night'); assert.strictEqual(S.phaseFor(0.5), 'day');
});

test('fog (= horizon) colour is continuous across the whole day incl. the midnight wrap', () => {
  // max per-step change, including the t=1 → t=0 wrap; a true jump would NOT shrink when the step halves
  function worstStep(n) {
    let prev = S.samplePalette(S.sunElevation(0)).hor.slice(), worst = 0;
    for (let i = 1; i <= n; i++) {
      const h = S.samplePalette(S.sunElevation((i % n) / n)).hor;
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(h[k] - prev[k]));
      prev = h.slice();
    }
    return worst;
  }
  const w1 = worstStep(20000), w2 = worstStep(40000);
  console.log('       max fog step Δ (linear): ' + w1.toFixed(5) + ' @1/20000 day (0.07 s real @24 min), ' + w2.toFixed(5) + ' @1/40000');
  assert.ok(w1 < 0.004, 'fog step too large ' + w1);
  assert.ok(w1 / w2 > 1.8, 'fog change does not scale with the step → discontinuity');
});

test('all palette channels are continuous (no key discontinuity)', () => {
  const keys = ['zen', 'hor', 'glow', 'cLit', 'cDark', 'hSky', 'hGnd'];
  let prev = JSON.parse(JSON.stringify(S.samplePalette(-1)));
  for (let i = 1; i <= 20000; i++) {
    const e = -1 + 2 * i / 20000, p = S.samplePalette(e);
    keys.forEach(k => { for (let c = 0; c < 3; c++) assert.ok(Math.abs(p[k][c] - prev[k][c]) < 0.01, k + ' jump at e=' + e); });
    ['warm', 'em', 'stars', 'fog'].forEach(k => assert.ok(Math.abs(p[k] - prev[k]) < 0.01, k + ' jump at e=' + e));
    prev = JSON.parse(JSON.stringify(p));
  }
});

const T = { sunMax: 2.4, moonFrac: 0.15, hemiDay: 1.05, hemiNight: 0.35, ambDay: 0.25, ambNight: 0.12, nightExposure: 0.8, moonIllum: 1 };
test('light: white-ish sun at noon, warm at dusk, blue moon ~15% at midnight, intensity continuous', () => {
  const noon = S.lightState(0.5, T), dusk = S.lightState(0.745, T), night = S.lightState(0, T);
  assert.ok(!noon.moon && Math.abs(noon.intensity - 2.4) < 1e-9);
  assert.ok(noon.color[2] / noon.color[0] > 0.8, 'noon near-white');
  assert.ok(!dusk.moon && dusk.color[0] > dusk.color[2] * 1.5, 'dusk warm');
  assert.ok(night.moon && night.color[2] > night.color[0], 'moon blue');
  assert.ok(Math.abs(night.intensity / 2.4 - 0.15) < 1e-9, 'moon 15%');
  assert.ok(night.dir[1] > 0 && noon.dir[1] > 0, 'light always from above');
  assert.ok(night.exposureMul < noon.exposureMul);
  let prev = S.lightState(0, T).intensity, worst = 0;
  for (let i = 1; i <= N; i++) { const I = S.lightState(i / N, T).intensity; worst = Math.max(worst, Math.abs(I - prev)); prev = I; }
  assert.ok(worst < 0.05, 'intensity jump ' + worst);
});

test('shadow frustum snapping is deterministic, on-grid and depth-preserving', () => {
  const texel = (2 * 60 * 7 / 1.8) / 2048;
  const dirs = [S.sunDirection(0.3), S.sunDirection(0.5), S.sunDirection(0.7), [0, 1, 0]];
  dirs.forEach(dir => {
    const c = [1234.567, 88.9, -4321.123];
    const a = S.snapShadowCenter(c, dir, texel), b = S.snapShadowCenter(c.slice(), dir, texel);
    assert.deepStrictEqual(a, b, 'deterministic');
    // light-space axes (same as the builder)
    let xx = dir[2], xz = -dir[0], xl = Math.hypot(xx, xz); if (xl < 1e-6) { xx = 1; xz = 0; xl = 1; } xx /= xl; xz /= xl;
    const x = [xx, 0, xz], y = [dir[1] * xz, dir[2] * xx - dir[0] * xz, -dir[1] * xx];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const ga = dot(a, x) / texel, gb = dot(a, y) / texel;
    assert.ok(Math.abs(ga - Math.round(ga)) < 1e-6 && Math.abs(gb - Math.round(gb)) < 1e-6, 'on texel grid');
    assert.ok(Math.abs(dot(a, dir) - dot(c, dir)) < 1e-6, 'depth kept');
    assert.ok(Math.abs(dot(a, x) - dot(c, x)) <= texel / 2 + 1e-9 && Math.abs(dot(a, y) - dot(c, y)) <= texel / 2 + 1e-9, 'within half a texel');
    // sub-texel wobble of the player never moves the snapped frustum sideways
    const c2 = [c[0] + x[0] * texel * 0.01, c[1], c[2] + x[2] * texel * 0.01];
    const a2 = S.snapShadowCenter(c2, dir, texel);
    assert.ok(Math.abs(dot(a2, x) - dot(a, x)) < 1e-6 || Math.abs(Math.abs(dot(a2, x) - dot(a, x)) - texel) < 1e-6, 'whole-texel steps only');
  });
});

test('URL overrides ?time= / ?daylen=', () => {
  assert.deepStrictEqual(S.parseUrlOverrides('?map=v4&time=0.8&daylen=6'), { time: 0.8, daylen: 6 });
  assert.deepStrictEqual(S.parseUrlOverrides('?map=v4'), { time: null, daylen: null });
  assert.strictEqual(S.parseUrlOverrides('?time=1.25').time, 0.25);
  assert.strictEqual(S.parseUrlOverrides('?daylen=0').daylen, null);
});

test('night ramp (city emissive strips / lamps): day value at noon, night value at midnight, clamped', () => {
  assert.strictEqual(S.nightRamp(S.nightFactor(S.sunElevation(0.5)), 0.3, 1.6), 0.3);
  assert.strictEqual(S.nightRamp(S.nightFactor(S.sunElevation(0)), 0.3, 1.6), 1.6);
  assert.strictEqual(S.nightRamp(2, 0, 1), 1); assert.strictEqual(S.nightRamp(-1, 0, 1), 0);
});

test('kelvin: 1900K warm, 6500K ~neutral', () => {
  const w = S.kelvinToLinear(1900), n = S.kelvinToLinear(6500);
  assert.ok(w[0] === 1 && w[2] < 0.1);
  assert.ok(n[0] > 0.95 && n[2] > 0.9);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
