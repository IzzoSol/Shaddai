'use strict';
const assert = require('assert');
const { hashState, stableStringify } = require('./state-hash');

console.log('=== state-hash.test.js ===\n');

// Test 1: Same value → same hash
console.log('Test 1: Same value produces same hash...');
const obj1 = { x: 10, y: 20, z: 30 };
const hash1 = hashState(obj1);
const hash2 = hashState(obj1);
assert.strictEqual(hash1, hash2, 'Same object should hash identically');
assert.match(hash1, /^[0-9a-f]{8}$/, 'Hash should be 8-char hex');
console.log(`  PASS: hash="${hash1}"\n`);

// Test 2: Key-order-independent for objects
console.log('Test 2: Object key order does not affect hash...');
const obj2a = { a: 1, b: 2, c: 3 };
const obj2b = { c: 3, a: 1, b: 2 };
const hash2a = hashState(obj2a);
const hash2b = hashState(obj2b);
assert.strictEqual(hash2a, hash2b, 'Same object with different key order should hash identically');
console.log(`  PASS: {a:1,b:2,c:3} === {c:3,a:1,b:2}\n`);

// Test 3: Array order DOES matter
console.log('Test 3: Array order affects hash...');
const arr3a = [1, 2, 3];
const arr3b = [3, 2, 1];
const hash3a = hashState(arr3a);
const hash3b = hashState(arr3b);
assert.notStrictEqual(hash3a, hash3b, '[1,2,3] should differ from [3,2,1]');
console.log(`  PASS: [1,2,3]="${hash3a}" !== [3,2,1]="${hash3b}"\n`);

// Test 4: Changed nested value changes hash
console.log('Test 4: Changed nested value changes hash...');
const obj4a = { nested: { x: 10, y: 20 } };
const obj4b = { nested: { x: 10, y: 21 } };
const hash4a = hashState(obj4a);
const hash4b = hashState(obj4b);
assert.notStrictEqual(hash4a, hash4b, 'Different nested value should produce different hash');
console.log(`  PASS: y:20 hash="${hash4a}" !== y:21 hash="${hash4b}"\n`);

// Test 5: Primitives and edge cases
console.log('Test 5: Primitives and edge cases...');
const hashes = {
  null: hashState(null),
  undef: hashState(undefined),
  true: hashState(true),
  false: hashState(false),
  zero: hashState(0),
  str: hashState('hello'),
  empty_arr: hashState([]),
  empty_obj: hashState({}),
};
console.log(`  null="${hashes.null}", true="${hashes.true}", str="${hashes.str}"`);
console.log(`  empty_arr="${hashes.empty_arr}", empty_obj="${hashes.empty_obj}"`);
// All should be valid 8-char hex
Object.values(hashes).forEach(h => {
  assert.match(h, /^[0-9a-f]{8}$/, `Hash should be 8-char hex, got: ${h}`);
});
console.log('  PASS: All primitives hash correctly\n');

// Test 6: stableStringify is stable across key reordering
console.log('Test 6: stableStringify is order-independent for objects...');
const stable1 = stableStringify({ z: 1, a: 2, m: 3 });
const stable2 = stableStringify({ a: 2, m: 3, z: 1 });
assert.strictEqual(stable1, stable2, 'Key order should not affect stableStringify for objects');
console.log(`  PASS: Stringified forms match\n`);

// Test 7: stableStringify preserves array order
console.log('Test 7: stableStringify preserves array order...');
const stable3 = stableStringify([1, 2, 3]);
const stable4 = stableStringify([3, 2, 1]);
assert.notStrictEqual(stable3, stable4, 'Array order should matter in stableStringify');
console.log(`  PASS: [1,2,3] !== [3,2,1]\n`);

// Test 8: Complex nested structure
console.log('Test 8: Complex nested structure...');
const complex = {
  players: [
    { id: 1, name: 'Alice', stats: { hp: 100, mp: 50 } },
    { id: 2, name: 'Bob', stats: { hp: 80, mp: 60 } },
  ],
  turn: 5,
  active: true,
};
const complexHash1 = hashState(complex);
const complexHash2 = hashState(complex);
assert.strictEqual(complexHash1, complexHash2, 'Complex object should be consistently hashed');
complex.players[0].stats.hp = 99;
const complexHash3 = hashState(complex);
assert.notStrictEqual(complexHash1, complexHash3, 'Changed nested value should change hash');
console.log(`  PASS: Complex nested structure hashes correctly\n`);

// Test 9: All hashes are valid hex
console.log('Test 9: All generated hashes are valid hex...');
const testValues = [
  42, 'string', [1, 2, 3], { a: 1 }, null, true,
  { nested: { deep: { value: 'test' } } },
  [{ x: 1 }, { y: 2 }],
];
testValues.forEach(val => {
  const h = hashState(val);
  assert.match(h, /^[0-9a-f]{8}$/, `hashState(${JSON.stringify(val)}) should be 8-char hex, got: ${h}`);
});
console.log('  PASS: All 8 test values produced valid 8-char hex\n');

console.log('=== All state-hash tests PASSED ===\n');
