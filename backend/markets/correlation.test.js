'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { alignSeries, matrix, computeRegime, regimeAdjust } = require('./correlation');

const mk = (vals, start = 1) => vals.map((c, i) => ({ d: `2026-09-${String(start + i).padStart(2, '0')}`, c }));

test('alignSeries keeps only common dates', () => {
  const a = alignSeries({ A: mk([1, 2, 3, 4], 1), B: mk([5, 6, 7], 2) });
  assert.deepStrictEqual(a.dates, ['2026-09-02', '2026-09-03', '2026-09-04']);
  assert.deepStrictEqual(a.closes.A, [2, 3, 4]);
});

test('matrix: diagonal 1, proportional = 1, opposite = -1, flat = null', () => {
  const up = [10, 11, 10.5, 12, 11.8, 13, 12.5, 14];
  const m = matrix({ A: mk(up), B: mk(up.map((x) => x * 2)), C: mk(up.map((x) => 30 - x)), F: mk(up.map(() => 5)) });
  const i = (s) => m.symbols.indexOf(s);
  assert.ok(Math.abs(m.values[i('A')][i('A')] - 1) < 1e-9);
  assert.ok(Math.abs(m.values[i('A')][i('B')] - 1) < 1e-9);
  assert.ok(m.values[i('A')][i('C')] < -0.9);
  assert.strictEqual(m.values[i('A')][i('F')], null);
  JSON.stringify(m); // must serialise without NaN
});

test('computeRegime: risk-on, risk-off, mixed, and missing data', () => {
  const grow = mk([100, 101, 102, 103, 104, 105, 106]);
  const fall = mk([106, 105, 104, 103, 102, 101, 100]);
  assert.strictEqual(computeRegime({ SPY: grow, BTC: grow }).riskOn, true);
  assert.strictEqual(computeRegime({ SPY: fall, BTC: fall }).riskOn, false);
  assert.strictEqual(computeRegime({ SPY: grow, BTC: fall }).riskOn, null);
  assert.strictEqual(computeRegime({}).riskOn, null);
});

test('regimeAdjust nudges aligned/unaligned signals by 0.05, leaves others and null regime alone', () => {
  const sig = (side, assetClass = 'stock') => ({ side, assetClass, confidence: 0.6, rationale: 'r' });
  assert.strictEqual(regimeAdjust(sig('buy'), { riskOn: true }).confidence, 0.65);
  assert.strictEqual(regimeAdjust(sig('buy'), { riskOn: false }).confidence, 0.55);
  assert.strictEqual(regimeAdjust(sig('sell'), { riskOn: false }).confidence, 0.65);
  assert.strictEqual(regimeAdjust(sig('buy'), { riskOn: null }).confidence, 0.6);
  assert.strictEqual(regimeAdjust(sig('buy', 'prediction'), { riskOn: true }).confidence, 0.6);
  assert.match(regimeAdjust(sig('buy'), { riskOn: true }).rationale, /risk-on/);
});
