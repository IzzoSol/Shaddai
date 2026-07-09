'use strict';
// ============================================================================
// playbook.test.js — Plain node:assert tests for playbook.js
// Run: node backend/sports/football/playbook.test.js
// ============================================================================

const assert = require('assert');
const {
  OFFENSE_PLAYS,
  DEFENSE_CALLS,
  pickOffensePlay,
  pickDefenseCall,
} = require('./playbook');

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
  return () => value;
}

console.log('\n── playbook.js ────────────────────────────────────────────');

// ── OFFENSE_PLAYS ─────────────────────────────────────────────────────────────

test('OFFENSE_PLAYS is a non-empty array', () => {
  assert.ok(Array.isArray(OFFENSE_PLAYS) && OFFENSE_PLAYS.length > 0, 'Expected non-empty array');
});

test('OFFENSE_PLAYS has at least 1 run play', () => {
  const runs = OFFENSE_PLAYS.filter(p => p.type === 'run');
  assert.ok(runs.length >= 1, `Expected ≥1 run play, got ${runs.length}`);
});

test('OFFENSE_PLAYS has at least 1 pass play', () => {
  const passes = OFFENSE_PLAYS.filter(p => p.type === 'pass');
  assert.ok(passes.length >= 1, `Expected ≥1 pass play, got ${passes.length}`);
});

test('All OFFENSE_PLAYS IDs are unique', () => {
  const ids = OFFENSE_PLAYS.map(p => p.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'Duplicate play IDs found');
});

test('Every OFFENSE_PLAY has required fields (id, name, type, routes, risk, reward)', () => {
  const REQUIRED = ['id', 'name', 'type', 'routes', 'risk', 'reward'];
  for (const p of OFFENSE_PLAYS) {
    for (const f of REQUIRED) {
      assert.ok(Object.prototype.hasOwnProperty.call(p, f), `Play "${p.id}" missing field: ${f}`);
    }
  }
});

test('Every OFFENSE_PLAY.type is "run" or "pass"', () => {
  for (const p of OFFENSE_PLAYS) {
    assert.ok(['run', 'pass'].includes(p.type), `Play "${p.id}" has invalid type: "${p.type}"`);
  }
});

test('Every OFFENSE_PLAY.routes has WR and RB route trees', () => {
  for (const p of OFFENSE_PLAYS) {
    assert.ok(p.routes.WR, `Play "${p.id}" missing WR route`);
    assert.ok(p.routes.RB, `Play "${p.id}" missing RB route`);
    assert.ok(Array.isArray(p.routes.WR), `Play "${p.id}".routes.WR must be array`);
    assert.ok(Array.isArray(p.routes.RB), `Play "${p.id}".routes.RB must be array`);
  }
});

test('Every route waypoint has dir (string) and ticks (number)', () => {
  const VALID_DIRS = new Set(['up', 'left', 'right', 'back', 'slant']);
  for (const p of OFFENSE_PLAYS) {
    for (const [key, route] of Object.entries(p.routes)) {
      for (const wp of route) {
        assert.ok(typeof wp.dir === 'string' && VALID_DIRS.has(wp.dir), `Play "${p.id}" routes.${key}: invalid dir "${wp.dir}"`);
        assert.ok(typeof wp.ticks === 'number' && wp.ticks > 0, `Play "${p.id}" routes.${key}: ticks must be positive number`);
      }
    }
  }
});

test('risk and reward are numbers in [0, 1]', () => {
  for (const p of OFFENSE_PLAYS) {
    assert.ok(typeof p.risk === 'number' && p.risk >= 0 && p.risk <= 1, `Play "${p.id}".risk must be 0..1`);
    assert.ok(typeof p.reward === 'number' && p.reward >= 0 && p.reward <= 1, `Play "${p.id}".reward must be 0..1`);
  }
});

// ── DEFENSE_CALLS ─────────────────────────────────────────────────────────────

test('DEFENSE_CALLS has exactly 4 calls', () => {
  assert.strictEqual(DEFENSE_CALLS.length, 4, `Expected 4 defense calls, got ${DEFENSE_CALLS.length}`);
});

test('DEFENSE_CALLS contains man, zone, blitz, prevent', () => {
  const ids = new Set(DEFENSE_CALLS.map(c => c.id));
  for (const id of ['man', 'zone', 'blitz', 'prevent']) {
    assert.ok(ids.has(id), `Missing defense call: ${id}`);
  }
});

test('Every DEFENSE_CALL has required fields (id, name, coverage, pressure, weakness)', () => {
  const REQUIRED = ['id', 'name', 'coverage', 'pressure', 'weakness'];
  for (const c of DEFENSE_CALLS) {
    for (const f of REQUIRED) {
      assert.ok(Object.prototype.hasOwnProperty.call(c, f), `Defense call "${c.id}" missing field: ${f}`);
    }
  }
});

test('Every DEFENSE_CALL.coverage is "man" or "zone"', () => {
  for (const c of DEFENSE_CALLS) {
    assert.ok(['man', 'zone'].includes(c.coverage), `Defense call "${c.id}" has invalid coverage: "${c.coverage}"`);
  }
});

test('Every DEFENSE_CALL.pressure is a number in [0, 1]', () => {
  for (const c of DEFENSE_CALLS) {
    assert.ok(typeof c.pressure === 'number' && c.pressure >= 0 && c.pressure <= 1, `Defense call "${c.id}".pressure must be 0..1`);
  }
});

// ── pickOffensePlay determinism ───────────────────────────────────────────────

test('pickOffensePlay returns { play, reason } shape', () => {
  const ctx = { down: 1, yardsToGo: 10, scoreDeficit: 0, ticksLeft: 100, lastPlayId: null };
  const result = pickOffensePlay(ctx, seededRand(0.5));
  assert.ok(result.play, 'Expected result.play');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'Expected non-empty result.reason');
});

test('pickOffensePlay result.play is from OFFENSE_PLAYS', () => {
  const playIds = new Set(OFFENSE_PLAYS.map(p => p.id));
  const ctxs = [
    { down: 1, yardsToGo: 10, scoreDeficit: 0, ticksLeft: 100, lastPlayId: null },
    { down: 4, yardsToGo: 1,  scoreDeficit: 0, ticksLeft: 50,  lastPlayId: null },
    { down: 2, yardsToGo: 15, scoreDeficit: -10, ticksLeft: 5, lastPlayId: null },
  ];
  for (const ctx of ctxs) {
    const { play } = pickOffensePlay(ctx, seededRand(0.5));
    assert.ok(playIds.has(play.id), `pickOffensePlay returned unknown play id: "${play.id}"`);
  }
});

test('pickOffensePlay is deterministic for same ctx and rand', () => {
  const ctx = { down: 2, yardsToGo: 8, scoreDeficit: 0, ticksLeft: 60, lastPlayId: 'inside_run' };
  const r1 = pickOffensePlay(ctx, seededRand(0.42)).play.id;
  const r2 = pickOffensePlay(ctx, seededRand(0.42)).play.id;
  assert.strictEqual(r1, r2, 'pickOffensePlay must be deterministic');
});

test('pickOffensePlay: 4th down short → inside_run', () => {
  const ctx = { down: 4, yardsToGo: 1, scoreDeficit: 0, ticksLeft: 50, lastPlayId: null };
  const { play, reason } = pickOffensePlay(ctx, seededRand(0.5));
  assert.strictEqual(play.id, 'inside_run', `Expected inside_run on 4th & 1, got ${play.id}. Reason: ${reason}`);
});

test('pickOffensePlay: 4th down long → deep_pass', () => {
  const ctx = { down: 4, yardsToGo: 12, scoreDeficit: 0, ticksLeft: 50, lastPlayId: null };
  const { play } = pickOffensePlay(ctx, seededRand(0.5));
  assert.strictEqual(play.id, 'deep_pass', `Expected deep_pass on 4th & long, got ${play.id}`);
});

test('pickOffensePlay: trailing late → deep_pass', () => {
  const ctx = { down: 2, yardsToGo: 7, scoreDeficit: -7, ticksLeft: 10, lastPlayId: null };
  const { play, reason } = pickOffensePlay(ctx, seededRand(0.5));
  assert.strictEqual(play.id, 'deep_pass', `Expected deep_pass when trailing late, got ${play.id}. Reason: ${reason}`);
});

test('pickOffensePlay: play action after inside_run', () => {
  const ctx = { down: 2, yardsToGo: 6, scoreDeficit: 0, ticksLeft: 80, lastPlayId: 'inside_run' };
  const { play, reason } = pickOffensePlay(ctx, seededRand(0.5));
  assert.strictEqual(play.id, 'play_action', `Expected play_action after inside_run setup, got ${play.id}. Reason: ${reason}`);
});

// ── pickDefenseCall determinism ───────────────────────────────────────────────

test('pickDefenseCall returns { call, reason } shape', () => {
  const ctx = { down: 1, yardsToGo: 10, scoreLead: 0, ticksLeft: 100, lastPlayType: null };
  const result = pickDefenseCall(ctx, seededRand(0.5));
  assert.ok(result.call, 'Expected result.call');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'Expected non-empty result.reason');
});

test('pickDefenseCall result.call is from DEFENSE_CALLS', () => {
  const callIds = new Set(DEFENSE_CALLS.map(c => c.id));
  const ctxs = [
    { down: 1, yardsToGo: 10, scoreLead: 0, ticksLeft: 100, lastPlayType: null },
    { down: 4, yardsToGo: 5,  scoreLead: 0, ticksLeft: 50,  lastPlayType: 'pass' },
    { down: 2, yardsToGo: 2,  scoreLead: 10, ticksLeft: 5,  lastPlayType: 'run' },
  ];
  for (const ctx of ctxs) {
    const { call } = pickDefenseCall(ctx, seededRand(0.5));
    assert.ok(callIds.has(call.id), `pickDefenseCall returned unknown call id: "${call.id}"`);
  }
});

test('pickDefenseCall is deterministic for same ctx and rand', () => {
  const ctx = { down: 2, yardsToGo: 8, scoreLead: 0, ticksLeft: 60, lastPlayType: 'pass' };
  const r1 = pickDefenseCall(ctx, seededRand(0.77)).call.id;
  const r2 = pickDefenseCall(ctx, seededRand(0.77)).call.id;
  assert.strictEqual(r1, r2, 'pickDefenseCall must be deterministic');
});

test('pickDefenseCall: 4th down → blitz', () => {
  const ctx = { down: 4, yardsToGo: 6, scoreLead: 0, ticksLeft: 30, lastPlayType: null };
  const { call, reason } = pickDefenseCall(ctx, seededRand(0.5));
  assert.strictEqual(call.id, 'blitz', `Expected blitz on 4th down, got ${call.id}. Reason: ${reason}`);
});

test('pickDefenseCall: big lead late → prevent', () => {
  const ctx = { down: 2, yardsToGo: 10, scoreLead: 8, ticksLeft: 10, lastPlayType: null };
  const { call, reason } = pickDefenseCall(ctx, seededRand(0.5));
  assert.strictEqual(call.id, 'prevent', `Expected prevent with big lead late, got ${call.id}. Reason: ${reason}`);
});

test('pickDefenseCall: short yardage → man', () => {
  const ctx = { down: 3, yardsToGo: 2, scoreLead: 0, ticksLeft: 80, lastPlayType: 'pass' };
  const { call, reason } = pickDefenseCall(ctx, seededRand(0.5));
  assert.strictEqual(call.id, 'man', `Expected man on short yardage, got ${call.id}. Reason: ${reason}`);
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
