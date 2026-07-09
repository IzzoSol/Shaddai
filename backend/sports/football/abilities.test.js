'use strict';
// ============================================================================
// abilities.test.js — Plain node:assert tests for abilities.js
// Run: node backend/sports/football/abilities.test.js
// ============================================================================

const assert = require('assert');
const {
  ABILITIES,
  abilitiesForRole,
  shouldActivate,
  applyEffect,
} = require('./abilities');

const REQUIRED_FIELDS = ['id', 'name', 'role', 'side', 'category', 'cooldownTicks', 'triggerWindow', 'telegraphTicks', 'effect', 'desc'];
const VALID_CATEGORIES = new Set(['read', 'burst', 'execution', 'disruption', 'composure']);
const VALID_SIDES = new Set(['off', 'def']);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// Deterministic rand factories
function seededRand(value) {
  // Always returns the same value — useful for tie-break control
  return () => value;
}

console.log('\n── abilities.js ───────────────────────────────────────────');

test('ABILITIES is a non-empty array', () => {
  assert.ok(Array.isArray(ABILITIES) && ABILITIES.length > 0, 'ABILITIES must be a non-empty array');
});

test('ABILITIES has at least 6 entries (launch requirement)', () => {
  assert.ok(ABILITIES.length >= 6, `Expected ≥6 abilities, got ${ABILITIES.length}`);
});

test('At least 1 offensive ability', () => {
  const off = ABILITIES.filter(a => a.side === 'off');
  assert.ok(off.length >= 1, `Expected ≥1 offensive ability, got ${off.length}`);
});

test('At least 1 defensive ability', () => {
  const def = ABILITIES.filter(a => a.side === 'def');
  assert.ok(def.length >= 1, `Expected ≥1 defensive ability, got ${def.length}`);
});

test('All ability IDs are unique', () => {
  const ids = ABILITIES.map(a => a.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, `Duplicate ability IDs found`);
});

test('Every ability has all required fields', () => {
  for (const a of ABILITIES) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(a, field), `Ability "${a.id}" missing field: ${field}`);
    }
  }
});

test('Every ability.category is valid', () => {
  for (const a of ABILITIES) {
    assert.ok(VALID_CATEGORIES.has(a.category), `Ability "${a.id}" has invalid category: "${a.category}"`);
  }
});

test('Every ability.side is "off" or "def"', () => {
  for (const a of ABILITIES) {
    assert.ok(VALID_SIDES.has(a.side), `Ability "${a.id}" has invalid side: "${a.side}"`);
  }
});

test('Every ability has numeric cooldownTicks and telegraphTicks', () => {
  for (const a of ABILITIES) {
    assert.ok(typeof a.cooldownTicks === 'number' && a.cooldownTicks >= 0, `ability "${a.id}".cooldownTicks must be ≥0 number`);
    assert.ok(typeof a.telegraphTicks === 'number' && a.telegraphTicks >= 0, `ability "${a.id}".telegraphTicks must be ≥0 number`);
  }
});

test('Every ability.triggerWindow has minTick and maxTick numbers with min<=max', () => {
  for (const a of ABILITIES) {
    const { minTick, maxTick } = a.triggerWindow;
    assert.ok(typeof minTick === 'number' && typeof maxTick === 'number', `ability "${a.id}".triggerWindow must have numeric minTick/maxTick`);
    assert.ok(minTick <= maxTick, `ability "${a.id}".triggerWindow: minTick (${minTick}) must be ≤ maxTick (${maxTick})`);
  }
});

test('Every ability.effect has a type', () => {
  for (const a of ABILITIES) {
    assert.ok(a.effect && typeof a.effect.type === 'string', `ability "${a.id}".effect.type must be a string`);
  }
});

// ── shouldActivate tests ─────────────────────────────────────────────────────

test('shouldActivate returns { activate, reason } shape', () => {
  const ab = ABILITIES[0];
  const ctx = { currentTick: ab.triggerWindow.minTick, lastActivated: -999, contextScore: 0.8 };
  const result = shouldActivate(ab, ctx, seededRand(0.5));
  assert.ok(typeof result.activate === 'boolean', 'activate must be boolean');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'reason must be non-empty string');
});

test('shouldActivate respects cooldown — does NOT fire when on cooldown', () => {
  const ab = ABILITIES[0]; // cooldownTicks typically >= 8
  const ctx = {
    currentTick:   ab.cooldownTicks - 1, // within trigger window just barely
    lastActivated: 0,                     // fired at tick 0; still cooling down
    contextScore:  0.99,                  // would fire if not on cooldown
  };
  // Make currentTick actually inside trigger window too
  const tickWithinWindow = Math.max(ab.triggerWindow.minTick, 0);
  ctx.currentTick = tickWithinWindow + (ab.cooldownTicks - 1); // after last activation by (cooldown-1) ticks
  ctx.lastActivated = tickWithinWindow;  // just fired at start of window

  const result = shouldActivate(ab, ctx, seededRand(0.5));
  assert.strictEqual(result.activate, false, `Expected no activation during cooldown. Reason: ${result.reason}`);
  assert.ok(result.reason.includes('cooldown'), `Reason should mention cooldown, got: ${result.reason}`);
});

test('shouldActivate does NOT fire outside trigger window', () => {
  const ab = ABILITIES[0];
  const ctx = {
    currentTick:   ab.triggerWindow.maxTick + 5,  // past the window
    lastActivated: -999,
    contextScore:  1.0,
  };
  const result = shouldActivate(ab, ctx, seededRand(0.5));
  assert.strictEqual(result.activate, false, `Should not fire outside window. Reason: ${result.reason}`);
  assert.ok(result.reason.includes('outside trigger window'), `Reason should mention window, got: ${result.reason}`);
});

test('shouldActivate fires with strong signal (score >= 0.70) without rand', () => {
  const ab = ABILITIES[0];
  // "score >= 0.70" path is deterministic — rand is never called
  let randCalled = false;
  const trackingRand = () => { randCalled = true; return 0.5; };
  const ctx = {
    currentTick:   ab.triggerWindow.minTick,
    lastActivated: -999,
    contextScore:  0.70,
  };
  const result = shouldActivate(ab, ctx, trackingRand);
  assert.strictEqual(result.activate, true, `Should activate on score=0.70. Reason: ${result.reason}`);
  assert.strictEqual(randCalled, false, 'rand should NOT be called for strong signal');
});

test('shouldActivate does NOT fire with weak signal (score <= 0.25)', () => {
  const ab = ABILITIES[0];
  let randCalled = false;
  const trackingRand = () => { randCalled = true; return 0.5; };
  const ctx = {
    currentTick:   ab.triggerWindow.minTick,
    lastActivated: -999,
    contextScore:  0.25,
  };
  const result = shouldActivate(ab, ctx, trackingRand);
  assert.strictEqual(result.activate, false, `Should NOT activate on score=0.25. Reason: ${result.reason}`);
  assert.strictEqual(randCalled, false, 'rand should NOT be called for weak signal');
});

test('shouldActivate uses rand only for mid-range score (0.25 < score < 0.70)', () => {
  const ab = ABILITIES[0];
  let randCalled = false;
  const trackingRand = () => { randCalled = true; return 0.99; }; // high roll → won't activate
  const ctx = {
    currentTick:   ab.triggerWindow.minTick,
    lastActivated: -999,
    contextScore:  0.50,
  };
  shouldActivate(ab, ctx, trackingRand);
  assert.strictEqual(randCalled, true, 'rand SHOULD be called for mid-range score');
});

test('shouldActivate is deterministic for same rand seed (mid-range)', () => {
  const ab = ABILITIES[0];
  const ctx = { currentTick: ab.triggerWindow.minTick, lastActivated: -999, contextScore: 0.50 };
  const r1 = shouldActivate(ab, ctx, seededRand(0.3)).activate;
  const r2 = shouldActivate(ab, ctx, seededRand(0.3)).activate;
  assert.strictEqual(r1, r2, 'same rand seed must produce same result');
});

// ── applyEffect tests ─────────────────────────────────────────────────────────

test('applyEffect is pure — does not mutate input', () => {
  const effect = ABILITIES.find(a => a.effect.type === 'statMult').effect;
  const original = { throwAccuracy: 70, routeRunning: 60 };
  const frozen = Object.freeze(Object.assign({}, original));
  assert.doesNotThrow(() => applyEffect(effect, frozen), 'applyEffect should not throw on frozen object (no mutation)');
  // verify original values unchanged by checking returned object is different
  const out = applyEffect(effect, original);
  assert.notStrictEqual(out, original, 'applyEffect must return a new object');
});

test('applyEffect statMult multiplies the correct stat', () => {
  const ab = ABILITIES.find(a => a.effect.type === 'statMult' && a.effect.stat === 'throwAccuracy');
  assert.ok(ab, 'Need a throwAccuracy statMult ability for this test');
  const target = { throwAccuracy: 80, routeRunning: 60 };
  const out = applyEffect(ab.effect, target);
  const expected = +(80 * ab.effect.mult).toFixed(4);
  assert.strictEqual(out.throwAccuracy, expected, `Expected throwAccuracy=${expected}, got ${out.throwAccuracy}`);
  assert.strictEqual(out.routeRunning, 60, 'routeRunning should be unchanged');
});

test('applyEffect forceOutcome sets _forceOutcome key', () => {
  const ab = ABILITIES.find(a => a.effect.type === 'forceOutcome');
  assert.ok(ab, 'Need a forceOutcome ability for this test');
  const target = { tackle: 70 };
  const out = applyEffect(ab.effect, target);
  assert.ok(out._forceOutcome, 'Expected _forceOutcome to be set');
  assert.strictEqual(out._forceOutcome, ab.effect.outcome);
});

test('applyEffect leaves unknown stats untouched', () => {
  const effect = { type: 'statMult', stat: 'throwAccuracy', mult: 1.10, durationTicks: 3 };
  const target = { throwAccuracy: 50, someOtherStat: 99 };
  const out = applyEffect(effect, target);
  assert.strictEqual(out.someOtherStat, 99, 'Other stats must not be modified');
});

// ── abilitiesForRole ─────────────────────────────────────────────────────────

test('abilitiesForRole(QB) returns at least 1 ability', () => {
  const qbAbilities = abilitiesForRole('QB');
  assert.ok(qbAbilities.length >= 1, `Expected ≥1 QB ability, got ${qbAbilities.length}`);
});

test('abilitiesForRole returns only abilities for the given role', () => {
  for (const role of ['QB', 'WR', 'RB', 'OL', 'CB', 'FS', 'DL', 'LB']) {
    const roleAbilities = abilitiesForRole(role);
    for (const a of roleAbilities) {
      assert.strictEqual(a.role, role, `Ability "${a.id}" has role "${a.role}" but was returned for "${role}"`);
    }
  }
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
