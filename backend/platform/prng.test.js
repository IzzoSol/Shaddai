'use strict';
const assert = require('assert');
const { rng, randInt, randFloat, pick, chance, shuffle } = require('./prng');

console.log('=== prng.test.js ===\n');

// Test 1: Same seed → identical sequence
console.log('Test 1: Same seed produces identical sequence...');
const rand1 = rng(12345);
const rand2 = rng(12345);
const seq1 = Array.from({ length: 20 }, () => rand1());
const seq2 = Array.from({ length: 20 }, () => rand2());
assert.deepStrictEqual(seq1, seq2, 'Sequences should be identical');
console.log('  PASS: 20 values match exactly\n');

// Test 2: Different seeds → different sequences
console.log('Test 2: Different seeds produce different sequences...');
const rand3 = rng(12345);
const rand4 = rng(54321);
const seq3 = Array.from({ length: 20 }, () => rand3());
const seq4 = Array.from({ length: 20 }, () => rand4());
assert.notDeepStrictEqual(seq3, seq4, 'Sequences should differ');
console.log('  PASS: Different seeds produce different sequences\n');

// Test 3: randInt is deterministic and in range
console.log('Test 3: randInt stays in range and is deterministic...');
const rand5 = rng(999);
// Check range on first generator
for (let i = 0; i < 100; i++) {
  const val = randInt(rand5, 10, 20);
  assert(val >= 10 && val <= 20, `randInt(10, 20) out of range: ${val}`);
}
// Fresh generators for comparison
const rand5b = rng(999);
const rand6 = rng(999);
const ints1 = Array.from({ length: 50 }, () => randInt(rand5b, 0, 100));
const ints2 = Array.from({ length: 50 }, () => randInt(rand6, 0, 100));
assert.deepStrictEqual(ints1, ints2, 'randInt sequences should match with same seed');
console.log('  PASS: In range and deterministic\n');

// Test 4: randFloat is deterministic and in range
console.log('Test 4: randFloat stays in range and is deterministic...');
const rand7 = rng(777);
for (let i = 0; i < 100; i++) {
  const val = randFloat(rand7, 5.5, 10.5);
  assert(val >= 5.5 && val < 10.5, `randFloat(5.5, 10.5) out of range: ${val}`);
}
// Fresh generators for comparison
const rand7b = rng(777);
const rand8 = rng(777);
const floats1 = Array.from({ length: 50 }, () => randFloat(rand7b, -1, 1));
const floats2 = Array.from({ length: 50 }, () => randFloat(rand8, -1, 1));
assert.deepStrictEqual(floats1, floats2, 'randFloat sequences should match');
console.log('  PASS: In range and deterministic\n');

// Test 5: pick is deterministic
console.log('Test 5: pick is deterministic...');
const arr = ['a', 'b', 'c', 'd', 'e'];
const rand9 = rng(111);
const rand10 = rng(111);
const picks1 = Array.from({ length: 30 }, () => pick(rand9, arr));
const picks2 = Array.from({ length: 30 }, () => pick(rand10, arr));
assert.deepStrictEqual(picks1, picks2, 'pick sequences should match');
assert(picks1.every(p => arr.includes(p)), 'All picks should be from array');
console.log('  PASS: Deterministic and valid\n');

// Test 6: chance is deterministic
console.log('Test 6: chance is deterministic...');
const rand11 = rng(222);
const rand12 = rng(222);
const chances1 = Array.from({ length: 50 }, () => chance(rand11, 0.5));
const chances2 = Array.from({ length: 50 }, () => chance(rand12, 0.5));
assert.deepStrictEqual(chances1, chances2, 'chance sequences should match');
assert(chances1.every(c => typeof c === 'boolean'), 'All chances should be boolean');
console.log('  PASS: Deterministic and boolean\n');

// Test 7: shuffle is deterministic and preserves elements
console.log('Test 7: shuffle is deterministic and preserves elements...');
const toShuffle = [1, 2, 3, 4, 5];
const rand13 = rng(333);
const rand14 = rng(333);
const shuffle1 = shuffle(rand13, toShuffle);
const shuffle2 = shuffle(rand14, toShuffle);
assert.deepStrictEqual(shuffle1, shuffle2, 'Shuffles should match with same seed');
assert.deepStrictEqual(shuffle1.sort((a, b) => a - b), [1, 2, 3, 4, 5], 'Shuffled array should contain same elements');
const rand15 = rng(444);
const shuffle3 = shuffle(rand15, toShuffle);
assert.notDeepStrictEqual(shuffle1, shuffle3, 'Different seed should produce different shuffle');
console.log('  PASS: Deterministic and all elements preserved\n');

// Test 8: Falsy seed uses Math.random()
console.log('Test 8: Falsy seed uses Math.random()...');
const rand16 = rng();
const rand17 = rng(null);
const val16 = rand16();
const val17 = rand17();
assert(typeof val16 === 'number' && val16 >= 0 && val16 < 1, 'Falsy seed should produce valid float');
assert(typeof val17 === 'number' && val17 >= 0 && val17 < 1, 'Null seed should produce valid float');
console.log('  PASS: Falsy seeds work\n');

console.log('=== All prng tests PASSED ===\n');
