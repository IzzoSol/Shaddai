'use strict';
const path = require('path');
const assert = require('assert');
const R = require(path.join(__dirname, '..', '..', 'public', 'world-rng.js'));
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }

test('determinism: same seed -> same sequence, different seed differs', () => {
  const a = R.create(42), b = R.create(42), c = R.create(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 100; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
});
test('range: floats in [0,1), int(n) in [0,n), pick from array', () => {
  const r = R.create(7);
  for (let i = 0; i < 5000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); const k = r.int(6); assert.ok(Number.isInteger(k) && k >= 0 && k < 6); }
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
  assert.strictEqual(r.pick([]), undefined);
});
test('shuffle: in place, permutation, deterministic', () => {
  const base = []; for (let i = 0; i < 52; i++) base.push(i);
  const a = base.slice(), b = base.slice();
  assert.strictEqual(R.create(9).shuffle(a), a, 'returns same array');
  R.create(9).shuffle(b);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a.slice().sort((x, y) => x - y), base);
  assert.notDeepStrictEqual(a, base);
});
test('hashSeed: stable FNV-1a 32-bit', () => {
  assert.strictEqual(R.hashSeed(''), 0x811c9dc5);
  assert.strictEqual(R.hashSeed('a'), 0xe40c292c);
  assert.strictEqual(R.hashSeed('hello'), R.hashSeed('hello'));
  assert.notStrictEqual(R.hashSeed('hello'), R.hashSeed('hellp'));
  assert.deepStrictEqual([R.create('x')(), R.create('x')()].length, 2);
  assert.strictEqual(R.create('x')(), R.create(R.hashSeed('x'))());
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
