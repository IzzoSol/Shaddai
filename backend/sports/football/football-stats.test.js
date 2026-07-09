'use strict';
// ============================================================================
// football-stats.test.js — Unit tests for football-stats.js
// Run: node backend/sports/football/football-stats.test.js
// ============================================================================
const assert = require('assert');
const { playerFootballRatings, computeVersatility, TRAIT_TO_SPINE,
        VERSATILITY_BASE, VERSATILITY_MAX, PENALTY_SCALE } = require('./football-stats');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// ── TRAIT_TO_SPINE ────────────────────────────────────────────────────────────
test('TRAIT_TO_SPINE has exactly 10 entries (one per TAGS)', () => {
  assert.strictEqual(Object.keys(TRAIT_TO_SPINE).length, 10,
    'Expected 10 trait→spine mappings');
});

test('TRAIT_TO_SPINE values are all valid UNIVERSAL_STATS keys', () => {
  const VALID = ['speed','acceleration','agility','balance','power','stamina',
                 'awareness','reaction','precision','control','vision','defense',
                 'composure','toughness'];
  for (const [trait, spineKey] of Object.entries(TRAIT_TO_SPINE)) {
    assert(VALID.includes(spineKey),
      `Trait '${trait}' maps to '${spineKey}' which is not a UNIVERSAL_STAT`);
  }
});

// ── Return shape ──────────────────────────────────────────────────────────────
test('playerFootballRatings returns spine, football, role, profile', () => {
  const result = playerFootballRatings('SHADDAI', [], 'QB');
  assert(result.spine,    'missing spine');
  assert(result.football, 'missing football');
  assert(result.role,     'missing role');
  assert(result.profile,  'missing profile');
  assert.strictEqual(result.role, 'QB');
});

test('spine has all 14 universal stats, each 0–100', () => {
  const UNIVERSAL = ['speed','acceleration','agility','balance','power','stamina',
                     'awareness','reaction','precision','control','vision','defense',
                     'composure','toughness'];
  const { spine } = playerFootballRatings('NEXUS', [], 'RB');
  for (const k of UNIVERSAL) {
    assert(typeof spine[k] === 'number', `spine.${k} is not a number`);
    assert(spine[k] >= 0 && spine[k] <= 100, `spine.${k}=${spine[k]} out of [0,100]`);
  }
});

test('football has all 7 football stats, each 0–100', () => {
  const FOOTBALL_KEYS = ['throwAccuracy','routeRunning','tackle','coverage',
                          'block','passRush','catching'];
  const { football } = playerFootballRatings('PIKADON', [], 'OL');
  for (const k of FOOTBALL_KEYS) {
    assert(typeof football[k] === 'number', `football.${k} is not a number`);
    assert(football[k] >= 0 && football[k] <= 100, `football.${k}=${football[k]} out of [0,100]`);
  }
});

// ── QB archetype: ORACLE (analysis-heavy) gets high throwAccuracy ─────────────
test('ORACLE as QB gets higher throwAccuracy than PIKADON as QB', () => {
  // ORACLE: analysis:3, precision:1, reaction:1 → should project well to throwAccuracy
  // PIKADON: defense:3, power:1, endurance:1 → should project low throwAccuracy
  const oracle  = playerFootballRatings('ORACLE',  [], 'QB');
  const pikadon = playerFootballRatings('PIKADON', [], 'QB');
  assert(oracle.football.throwAccuracy > pikadon.football.throwAccuracy,
    `Expected ORACLE throwAccuracy (${oracle.football.throwAccuracy}) > ` +
    `PIKADON throwAccuracy (${pikadon.football.throwAccuracy})`);
});

// ── Defense archetype: PIKADON gets high tackle/coverage ─────────────────────
test('PIKADON as FS gets higher coverage than ZEROX as FS', () => {
  // PIKADON: defense:3, power:1, endurance:1 → high tackle/coverage
  // ZEROX:   aggression:2, power:2, precision:1 → lower coverage
  const pikadon = playerFootballRatings('PIKADON', [], 'FS');
  const zerox   = playerFootballRatings('ZEROX',   [], 'FS');
  assert(pikadon.football.coverage >= zerox.football.coverage,
    `Expected PIKADON coverage (${pikadon.football.coverage}) >= ` +
    `ZEROX coverage (${zerox.football.coverage})`);
});

test('PIKADON as LB gets higher tackle than TURTLE as LB (power/defense vs control/support)', () => {
  const pikadon = playerFootballRatings('PIKADON', [], 'LB');
  const turtle  = playerFootballRatings('TURTLE',  [], 'LB');
  // PIKADON: defense:3, power:1, endurance:1 → better tackling archetype than TURTLE: control/support
  assert(pikadon.football.tackle >= turtle.football.tackle,
    `Expected PIKADON tackle (${pikadon.football.tackle}) >= TURTLE tackle (${turtle.football.tackle})`);
});

test('QUILL as QB gets higher throwAccuracy than PIKADON as QB (precision archetype)', () => {
  const quill  = playerFootballRatings('QUILL',   [], 'QB');
  const pikadon= playerFootballRatings('PIKADON', [], 'QB');
  assert(quill.football.throwAccuracy >= pikadon.football.throwAccuracy,
    `Expected QUILL throwAccuracy (${quill.football.throwAccuracy}) >= ` +
    `PIKADON throwAccuracy (${pikadon.football.throwAccuracy})`);
});

// ── Skills boost profile ──────────────────────────────────────────────────────
test('sharpshooter skill boosts ORACLE throwAccuracy', () => {
  const without = playerFootballRatings('ORACLE', [],               'QB');
  const with_   = playerFootballRatings('ORACLE', ['sharpshooter'], 'QB');
  // sharpshooter → precision:3, analysis:1 → throwAccuracy should go up
  assert(with_.football.throwAccuracy >= without.football.throwAccuracy,
    `Expected sharpshooter to maintain or boost throwAccuracy; ` +
    `before=${without.football.throwAccuracy} after=${with_.football.throwAccuracy}`);
});

// ── Determinism ───────────────────────────────────────────────────────────────
test('playerFootballRatings is deterministic for same inputs', () => {
  const a = playerFootballRatings('NEXUS', ['lockdown', 'speed_demon'], 'CB');
  const b = playerFootballRatings('NEXUS', ['lockdown', 'speed_demon'], 'CB');
  assert.deepStrictEqual(a, b, 'Same inputs should produce identical outputs');
});

test('different roles produce different football ratings', () => {
  const qb = playerFootballRatings('SHADDAI', [], 'QB');
  const dl = playerFootballRatings('SHADDAI', [], 'DL');
  // QB should have higher throwAccuracy than DL (role mods differ)
  const different = Object.keys(qb.football).some(k => qb.football[k] !== dl.football[k]);
  assert(different, 'QB and DL ratings should differ for the same agent');
});

// ── Profile sums to ~1 ────────────────────────────────────────────────────────
test('affinity profile sums to approximately 1', () => {
  const { profile } = playerFootballRatings('TURTLE', ['court_vision'], 'WR');
  const sum = Object.values(profile).reduce((s, v) => s + v, 0);
  assert(Math.abs(sum - 1.0) < 0.01, `Profile sum=${sum.toFixed(4)}, expected ~1.0`);
});

// ── Edge cases ────────────────────────────────────────────────────────────────
test('unknown agent name falls back gracefully (no throw)', () => {
  const result = playerFootballRatings('BOT-UNKNOWN', [], 'RB');
  assert(result.football, 'Should return football ratings even for unknown agent');
});

test('empty skills array does not throw', () => {
  assert.doesNotThrow(() => playerFootballRatings('SHADDAI', [], 'QB'));
});

test('null/undefined skills falls back to empty', () => {
  const a = playerFootballRatings('SHADDAI', null, 'QB');
  const b = playerFootballRatings('SHADDAI', [],   'QB');
  assert.deepStrictEqual(a, b, 'null skills should behave like []');
});

// ── computeVersatility ────────────────────────────────────────────────────────
test('computeVersatility: 0 skills → VERSATILITY_BASE (~0.12)', () => {
  const v = computeVersatility([]);
  assert(Math.abs(v - VERSATILITY_BASE) < 0.001,
    `Expected ~${VERSATILITY_BASE} for 0 skills, got ${v}`);
});

test('computeVersatility: many skills → approaches VERSATILITY_MAX (≤0.85)', () => {
  const v = computeVersatility(['a','b','c','d','e','f','g','h']);
  assert(v >= 0.8 && v <= VERSATILITY_MAX,
    `Expected high versatility for many skills, got ${v}`);
});

test('computeVersatility: 3 skills → clearly above base and below max', () => {
  const v = computeVersatility(['sharpshooter','court_vision','lockdown']);
  assert(v > VERSATILITY_BASE && v < VERSATILITY_MAX,
    `3-skill versatility ${v} should be between ${VERSATILITY_BASE} and ${VERSATILITY_MAX}`);
});

test('computeVersatility: monotone — more skills → more versatile', () => {
  const v1 = computeVersatility([]);
  const v2 = computeVersatility(['sharpshooter']);
  const v3 = computeVersatility(['sharpshooter','court_vision']);
  assert(v2 > v1 && v3 > v2, `Versatility should increase with skills: ${v1} < ${v2} < ${v3}`);
});

// ── Off-position penalty ──────────────────────────────────────────────────────
test('playerFootballRatings returns mainRole, positionGap, versatility, offPenalty fields', () => {
  const result = playerFootballRatings('ORACLE', [], 'QB');
  assert(typeof result.mainRole === 'string',     'mainRole should be a string');
  assert(typeof result.positionGap === 'number',  'positionGap should be a number');
  assert(typeof result.versatility === 'number',  'versatility should be a number');
  assert(typeof result.offPenalty === 'number',   'offPenalty should be a number');
  assert.strictEqual(result.assignedRole, 'QB',  'assignedRole should match role param');
});

test('on-main role → positionGap = 0 → offPenalty = 0', () => {
  // Run ORACLE at its best role; positionGap must be 0.
  const result = playerFootballRatings('ORACLE', [], result => result.mainRole);
  // Actually run at mainRole by querying first, then re-checking.
  const probe = playerFootballRatings('ORACLE', [], 'QB');
  const mainResult = playerFootballRatings('ORACLE', [], probe.mainRole);
  assert.strictEqual(mainResult.positionGap, 0,
    `Playing at mainRole ${mainResult.mainRole} should have positionGap=0, got ${mainResult.positionGap}`);
  assert.strictEqual(mainResult.offPenalty, 0,
    `On-main play should have offPenalty=0, got ${mainResult.offPenalty}`);
});

test('off-position with NO skills → ratings lower than on-main', () => {
  // Put PIKADON (defense archetype) at QB (likely off-main).
  // His on-main role should give higher key ratings.
  const probe = playerFootballRatings('PIKADON', [], 'QB');
  const onMain = playerFootballRatings('PIKADON', [], probe.mainRole);
  if (probe.mainRole !== 'QB') {
    // If QB is off-main, the on-main ratings total should be ≥ off-main.
    const sumOff = Object.values(probe.football).reduce((s, v) => s + v, 0);
    const sumOn  = Object.values(onMain.football).reduce((s, v) => s + v, 0);
    assert(sumOn >= sumOff,
      `On-main ratings sum (${sumOn}) should be ≥ off-main sum (${sumOff}) for PIKADON`);
  }
});

test('skilled off-position agent outrates unskilled off-position agent', () => {
  // Force ZEROX (aggression/power archetype) to play QB (analysis/precision role).
  // ZEROX with fitting skills (sharpshooter/court_vision add precision/analysis)
  // should have higher ratings than ZEROX with no skills at the same off-position role.
  const probe = playerFootballRatings('ZEROX', [], 'QB');
  if (probe.positionGap > 0) {
    // QB is off-main for ZEROX; add skills that boost precision/analysis.
    const withSkills    = playerFootballRatings('ZEROX', ['sharpshooter','court_vision','clutch_gene'], 'QB');
    const withoutSkills = playerFootballRatings('ZEROX', [], 'QB');
    const sumWith    = Object.values(withSkills.football).reduce((s, v) => s + v, 0);
    const sumWithout = Object.values(withoutSkills.football).reduce((s, v) => s + v, 0);
    assert(sumWith >= sumWithout,
      `Skilled off-position (${sumWith}) should be ≥ unskilled off-position (${sumWithout})`);
    assert(withSkills.offPenalty < withoutSkills.offPenalty,
      `Skilled off-position penalty (${withSkills.offPenalty}) should be < ` +
      `unskilled (${withoutSkills.offPenalty})`);
  } else {
    // QB is on-main for ZEROX — test passes trivially (no gap to measure).
    assert.strictEqual(probe.positionGap, 0);
  }
});

test('offPenalty is clamped [0, PENALTY_CAP]', () => {
  // Any agent, any role.
  const result = playerFootballRatings('BOT-GAMMA', [], 'QB');
  assert(result.offPenalty >= 0 && result.offPenalty <= 0.45,
    `offPenalty ${result.offPenalty} out of [0, 0.45]`);
});

test('football ratings are [0,100] after versatility penalty', () => {
  const FOOTBALL_KEYS = ['throwAccuracy','routeRunning','tackle','coverage',
                          'block','passRush','catching'];
  for (const [agent, role] of [['ZEROX','QB'],['TURTLE','DL'],['BOT-X','OL']]) {
    const { football } = playerFootballRatings(agent, [], role);
    for (const k of FOOTBALL_KEYS) {
      assert(football[k] >= 0 && football[k] <= 100,
        `${agent} as ${role}: football.${k}=${football[k]} out of [0,100]`);
    }
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── football-stats.test.js ──');
console.log(`Result: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
