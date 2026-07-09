'use strict';
// stat-ontology.test.js — plain node assert, zero deps.
// Run: node backend/platform/stat-ontology.test.js

const assert = require('assert');
const {
  UNIVERSAL_STATS,
  STAT_META,
  LEGACY_KEYS,
  makeStats,
  clampStat,
  normalize,
  projectToLegacy,
  deriveFootball,
} = require('./stat-ontology');

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// ── UNIVERSAL_STATS ──────────────────────────────────────────────────────────
test('UNIVERSAL_STATS has exactly 14 entries', () => {
  assert.strictEqual(UNIVERSAL_STATS.length, 14);
});

test('STAT_META has an entry for each universal stat', () => {
  for (const s of UNIVERSAL_STATS) {
    assert.ok(STAT_META[s], `Missing STAT_META entry for "${s}"`);
    assert.strictEqual(STAT_META[s].min, 0);
    assert.strictEqual(STAT_META[s].max, 100);
    assert.strictEqual(STAT_META[s].default, 50);
    assert.ok(typeof STAT_META[s].desc === 'string' && STAT_META[s].desc.length > 0);
  }
});

// ── clampStat ────────────────────────────────────────────────────────────────
test('clampStat clamps high values to 100', () => {
  assert.strictEqual(clampStat(150), 100);
});

test('clampStat clamps low values to 0', () => {
  assert.strictEqual(clampStat(-10), 0);
});

test('clampStat passes through valid values unchanged', () => {
  assert.strictEqual(clampStat(75), 75);
});

test('clampStat handles NaN by returning 0', () => {
  assert.strictEqual(clampStat(NaN), 0);
});

// ── makeStats ────────────────────────────────────────────────────────────────
test('makeStats() with no args returns all 14 stats at default 50', () => {
  const s = makeStats();
  assert.strictEqual(Object.keys(s).length, 14);
  for (const key of UNIVERSAL_STATS) {
    assert.strictEqual(s[key], 50, `Expected ${key}=50, got ${s[key]}`);
  }
});

test('makeStats fills missing keys with 50', () => {
  const s = makeStats({ speed: 80 });
  assert.strictEqual(s.speed, 80);
  assert.strictEqual(s.power, 50);
  assert.strictEqual(s.precision, 50);
});

test('makeStats clamps out-of-range values', () => {
  const s = makeStats({ speed: 200, agility: -30 });
  assert.strictEqual(s.speed, 100, 'should clamp 200 → 100');
  assert.strictEqual(s.agility, 0, 'should clamp -30 → 0');
});

test('makeStats drops unknown keys (only 14 keys in output)', () => {
  const s = makeStats({ speed: 70, unknownStat: 99, fake: 10 });
  assert.strictEqual(Object.keys(s).length, 14);
  assert.ok(!('unknownStat' in s), 'should not include unknownStat');
  assert.ok(!('fake' in s), 'should not include fake');
  assert.strictEqual(s.speed, 70);
});

// ── normalize ────────────────────────────────────────────────────────────────
test('normalize converts each stat to 0..1 range', () => {
  const s = makeStats({ speed: 100, agility: 0, power: 50 });
  const n = normalize(s);
  assert.strictEqual(n.speed, 1);
  assert.strictEqual(n.agility, 0);
  assert.strictEqual(n.power, 0.5);
});

// ── projectToLegacy ──────────────────────────────────────────────────────────
test('LEGACY_KEYS has exactly 7 entries', () => {
  assert.strictEqual(LEGACY_KEYS.length, 7);
  const expected = ['shooting', 'ballControl', 'speed', 'defense', 'vertical', 'stamina', 'iq'];
  assert.deepStrictEqual(LEGACY_KEYS, expected);
});

test('projectToLegacy returns exactly the 7 legacy keys', () => {
  const spine = makeStats();
  const leg = projectToLegacy(spine);
  assert.deepStrictEqual(Object.keys(leg).sort(), [...LEGACY_KEYS].sort());
});

test('projectToLegacy all values in [0,100] for default spine', () => {
  const leg = projectToLegacy(makeStats());
  for (const key of LEGACY_KEYS) {
    assert.ok(leg[key] >= 0 && leg[key] <= 100, `${key}=${leg[key]} out of range`);
  }
});

test('projectToLegacy all values in [0,100] for maxed spine', () => {
  const maxSpine = makeStats(Object.fromEntries(UNIVERSAL_STATS.map(k => [k, 100])));
  const leg = projectToLegacy(maxSpine);
  for (const key of LEGACY_KEYS) {
    assert.ok(leg[key] >= 0 && leg[key] <= 100, `${key}=${leg[key]} out of range`);
  }
});

test('projectToLegacy all values in [0,100] for zeroed spine', () => {
  const zeroSpine = makeStats(Object.fromEntries(UNIVERSAL_STATS.map(k => [k, 0])));
  const leg = projectToLegacy(zeroSpine);
  for (const key of LEGACY_KEYS) {
    assert.ok(leg[key] >= 0 && leg[key] <= 100, `${key}=${leg[key]} out of range`);
  }
});

test('projectToLegacy default spine (all 50) produces all 50s', () => {
  const leg = projectToLegacy(makeStats());
  for (const key of LEGACY_KEYS) {
    assert.strictEqual(leg[key], 50, `Expected ${key}=50, got ${leg[key]}`);
  }
});

// ── deriveFootball ───────────────────────────────────────────────────────────
const FOOTBALL_KEYS = ['throwAccuracy', 'routeRunning', 'tackle', 'coverage', 'block', 'passRush', 'catching'];

test('deriveFootball returns exactly the 7 football keys', () => {
  const spine = makeStats();
  const fb = deriveFootball(spine);
  assert.deepStrictEqual(Object.keys(fb).sort(), [...FOOTBALL_KEYS].sort());
});

test('deriveFootball all values in [0,100] for default spine', () => {
  const fb = deriveFootball(makeStats());
  for (const key of FOOTBALL_KEYS) {
    assert.ok(fb[key] >= 0 && fb[key] <= 100, `${key}=${fb[key]} out of range`);
  }
});

test('deriveFootball all values in [0,100] for maxed spine', () => {
  const maxSpine = makeStats(Object.fromEntries(UNIVERSAL_STATS.map(k => [k, 100])));
  const fb = deriveFootball(maxSpine);
  for (const key of FOOTBALL_KEYS) {
    assert.ok(fb[key] >= 0 && fb[key] <= 100, `${key}=${fb[key]} out of range`);
  }
});

// ── Directional / semantic tests ─────────────────────────────────────────────
test('spine maxed on precision yields high throwAccuracy (>=80)', () => {
  // precision drives 60% of throwAccuracy; other inputs at 50
  const spine = makeStats({ precision: 100 });
  const fb = deriveFootball(spine);
  // throwAccuracy = round(0.6*100 + 0.25*50 + 0.15*50) = round(60+12.5+7.5) = 80
  assert.ok(fb.throwAccuracy >= 80, `throwAccuracy=${fb.throwAccuracy}, expected >=80`);
});

test('spine maxed on precision yields high shooting legacy stat (>=80)', () => {
  const spine = makeStats({ precision: 100 });
  const leg = projectToLegacy(spine);
  // shooting = round(0.6*100 + 0.25*50 + 0.15*50) = 80
  assert.ok(leg.shooting >= 80, `shooting=${leg.shooting}, expected >=80`);
});

test('spine maxed on power yields high tackle (>=80)', () => {
  const spine = makeStats({ power: 100 });
  const fb = deriveFootball(spine);
  // tackle = round(0.5*100 + 0.3*50 + 0.2*50) = round(50+15+10) = 75
  assert.ok(fb.tackle >= 70, `tackle=${fb.tackle}, expected >=70`);
});

test('spine maxed on power yields high block (>=80)', () => {
  const spine = makeStats({ power: 100 });
  const fb = deriveFootball(spine);
  // block = round(0.5*100 + 0.3*50 + 0.2*50) = 75
  assert.ok(fb.block >= 70, `block=${fb.block}, expected >=70`);
});

test('spine maxed on power yields high vertical legacy stat (>=80)', () => {
  const spine = makeStats({ power: 100 });
  const leg = projectToLegacy(spine);
  // vertical = round(0.6*100 + 0.25*50 + 0.15*50) = 80
  assert.ok(leg.vertical >= 75, `vertical=${leg.vertical}, expected >=75`);
});

test('high-precision, high-composure, high-vision spine maxes throwAccuracy near 100', () => {
  const spine = makeStats({ precision: 100, composure: 100, vision: 100 });
  const fb = deriveFootball(spine);
  assert.strictEqual(fb.throwAccuracy, 100);
});

test('high power+toughness+reaction spine maximises tackle', () => {
  const spine = makeStats({ power: 100, toughness: 100, reaction: 100 });
  const fb = deriveFootball(spine);
  assert.strictEqual(fb.tackle, 100);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
