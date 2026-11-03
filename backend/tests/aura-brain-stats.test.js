'use strict';
/**
 * backend/tests/aura-brain-stats.test.js
 *
 * Regression cover for the AURA brain stats() helper that backs
 * GET /api/aura-brain (and the (still-unwired) dashboard widget).
 * Dependency-free: no express, no supertest.
 */
const assert = require('assert');
const brain = require('../aura-brain');

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

check('stats() returns an object', () => {
  const s = brain.stats();
  assert.ok(s && typeof s === 'object', 'stats() must return an object');
});

check('stats() has boxes (number)', () => {
  const s = brain.stats();
  assert.strictEqual(typeof s.boxes, 'number', 'boxes must be a number');
  assert.ok(s.boxes >= 0, 'boxes must be >= 0');
});

check('stats() has chunks (number)', () => {
  const s = brain.stats();
  assert.strictEqual(typeof s.chunks, 'number', 'chunks must be a number');
  assert.ok(s.chunks >= 0, 'chunks must be >= 0');
});

check('stats() has freePerDay (number)', () => {
  const s = brain.stats();
  assert.strictEqual(typeof s.freePerDay, 'number', 'freePerDay must be a number');
  assert.ok(s.freePerDay >= 0, 'freePerDay must be >= 0');
});

check('stats() has adapters (array)', () => {
  const s = brain.stats();
  assert.ok(Array.isArray(s.adapters), 'adapters must be an array');
  assert.ok(s.adapters.length > 0, 'adapters must be non-empty');
});

check('stats() has dataDir (string)', () => {
  const s = brain.stats();
  assert.strictEqual(typeof s.dataDir, 'string', 'dataDir must be a string');
  assert.ok(s.dataDir.length > 0, 'dataDir must be non-empty');
});

check('quotaLeftFor returns an object with left/cap/day for anon', () => {
  const q = brain.quotaLeftFor('anon');
  assert.ok(q && typeof q === 'object', 'quotaLeftFor must return an object');
  assert.strictEqual(typeof q.left, 'number', 'left must be a number');
  assert.strictEqual(typeof q.cap, 'number', 'cap must be a number');
  assert.strictEqual(typeof q.day, 'string', 'day must be a string');
  assert.ok(q.left >= 0, 'left must be >= 0');
});

console.log('\n' + passed + ' checks passed');