'use strict';
const path = require('path');
const assert = require('assert');
const PUB = path.join(__dirname, '..', '..', 'public');
const R = require(path.join(PUB, 'world-rng.js'));
const E = require(path.join(PUB, 'world-economy.js'));
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }
const sum = a => a.reduce((s, x) => s + x, 0);

test('wager: 100 x 3, one winner -> 285 + 15 burn', () => {
  const w = E.wager({ stake: 100, n: 3 }), p = w.payout(1);
  assert.strictEqual(w.pot, 300); assert.strictEqual(w.burn, 15);
  assert.deepStrictEqual(p.payouts, [285]); assert.strictEqual(p.burn, 15);
});
test('wager conservation across 2000 seeded cases (any winner count, any fee)', () => {
  const r = R.create(1234);
  for (let i = 0; i < 2000; i++) {
    const stake = 1 + r.int(5000), n = 1 + r.int(8), fee = r.pick([0, 0.01, 0.05, 0.1, 0.333]);
    const w = E.wager({ stake, n, feePct: fee }), winners = 1 + r.int(n), p = w.payout(winners);
    assert.strictEqual(sum(p.payouts) + p.burn, stake * n, JSON.stringify({ stake, n, fee, winners }));
    assert.ok(p.payouts.every(x => Number.isInteger(x) && x >= 0));
    assert.ok(sum(p.payouts) <= stake * n);
  }
});
test('settle 60/25/15 conserves and orders payouts', () => {
  const r = R.create(99);
  for (let i = 0; i < 2000; i++) {
    const n = 3 + r.int(10), stakes = []; for (let k = 0; k < n; k++) stakes.push(r.int(3000));
    const s = E.settle({ stakes, shares: [0.6, 0.25, 0.15], feePct: 0.05 });
    assert.strictEqual(sum(s.payouts) + s.burn, sum(stakes));
    assert.ok(s.payouts[0] >= s.payouts[1] && s.payouts[1] >= s.payouts[2]);
    assert.ok(s.payouts.every(Number.isInteger));
  }
  const s = E.settle({ stakes: [100, 100, 100, 100], shares: [0.6, 0.25, 0.15], feePct: 0.05 });
  assert.deepStrictEqual(s.payouts, [228, 95, 57]); assert.strictEqual(s.burn, 20);
});
test('refundAll: pushes return exactly the stakes, burn 0', () => {
  const r = R.create(5), stakes = []; for (let i = 0; i < 20; i++) stakes.push(r.int(1000));
  const f = E.refundAll(stakes);
  assert.deepStrictEqual(f.refunds, stakes); assert.strictEqual(f.burn, 0);
});
test('degenerate: zero winners burns the pot only; bad input is safe', () => {
  const p = E.wager({ stake: 50, n: 2 }).payout(0);
  assert.deepStrictEqual(p.payouts, []); assert.strictEqual(p.burn, 100);
  const w = E.wager({ stake: -5, n: NaN }); assert.strictEqual(w.pot, 0);
  assert.strictEqual(E.settle({ stakes: [10, 10], shares: [] }).burn, 20);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
