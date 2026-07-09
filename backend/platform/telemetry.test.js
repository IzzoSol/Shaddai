'use strict';

// ============================================================================
// telemetry.test.js — Test suite for the arcade telemetry module.
// Run with: node telemetry.test.js
// ============================================================================

const assert = require('assert');
const {
  SIM_VERSION,
  EVENT_FAMILIES,
  FOOTBALL_SUBTYPES,
  BASKETBALL_SUBTYPES,
  SOCCER_SUBTYPES,
  DODGEBALL_SUBTYPES,
  SHOOTING_SUBTYPES,
  makeEvent,
  createEventLog,
  makeMatchRecord,
  makeBatchResult,
} = require('./telemetry.js');

// ── HELPERS ───────────────────────────────────────────────────────────────
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

function eq(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, msg);
}

function ok(value, msg) {
  assert.ok(value, msg);
}

// ============================================================================
// TESTS
// ============================================================================

// ── VERSION ───────────────────────────────────────────────────────────────
test('SIM_VERSION is a string', () => {
  eq(typeof SIM_VERSION, 'string');
  eq(SIM_VERSION, 'shaddai-sim-0.1.0');
});

// ── EVENT FAMILIES ────────────────────────────────────────────────────────
test('EVENT_FAMILIES is an array with 12 families', () => {
  ok(Array.isArray(EVENT_FAMILIES));
  eq(EVENT_FAMILIES.length, 12);
});

test('EVENT_FAMILIES contains expected families', () => {
  const expected = [
    'match_started', 'phase_started', 'action_started', 'ability_used',
    'contest', 'score_event', 'turnover_event', 'stamina_event',
    'role_assignment', 'loadout_evaluation', 'match_ended', 'batch_sim_completed',
  ];
  eq(EVENT_FAMILIES, expected);
});

// ── FOOTBALL SUBTYPES ─────────────────────────────────────────────────────
test('FOOTBALL_SUBTYPES contains expected subtypes', () => {
  ok(FOOTBALL_SUBTYPES.includes('snap'));
  ok(FOOTBALL_SUBTYPES.includes('throw'));
  ok(FOOTBALL_SUBTYPES.includes('catch'));
  ok(FOOTBALL_SUBTYPES.includes('touchdown'));
  ok(FOOTBALL_SUBTYPES.includes('interception'));
  ok(FOOTBALL_SUBTYPES.includes('sack'));
  ok(FOOTBALL_SUBTYPES.includes('fumble'));
  ok(FOOTBALL_SUBTYPES.includes('field_goal'));
  ok(FOOTBALL_SUBTYPES.includes('punt'));
  ok(FOOTBALL_SUBTYPES.includes('turnover_on_downs'));
});

test('BASKETBALL_SUBTYPES is defined', () => {
  ok(Array.isArray(BASKETBALL_SUBTYPES));
  ok(BASKETBALL_SUBTYPES.includes('dribble_move'));
  ok(BASKETBALL_SUBTYPES.includes('pass'));
  ok(BASKETBALL_SUBTYPES.includes('shot_attempt'));
  ok(BASKETBALL_SUBTYPES.includes('rebound'));
  ok(BASKETBALL_SUBTYPES.includes('steal'));
  ok(BASKETBALL_SUBTYPES.includes('block'));
});

test('SOCCER_SUBTYPES is defined', () => {
  ok(Array.isArray(SOCCER_SUBTYPES));
  ok(SOCCER_SUBTYPES.includes('pass'));
  ok(SOCCER_SUBTYPES.includes('dribble'));
  ok(SOCCER_SUBTYPES.includes('tackle'));
  ok(SOCCER_SUBTYPES.includes('save'));
  ok(SOCCER_SUBTYPES.includes('shot'));
  ok(SOCCER_SUBTYPES.includes('goal'));
});

test('DODGEBALL_SUBTYPES is defined', () => {
  ok(Array.isArray(DODGEBALL_SUBTYPES));
  ok(DODGEBALL_SUBTYPES.includes('throw'));
  ok(DODGEBALL_SUBTYPES.includes('dodge'));
  ok(DODGEBALL_SUBTYPES.includes('catch'));
  ok(DODGEBALL_SUBTYPES.includes('elimination'));
});

test('SHOOTING_SUBTYPES is defined', () => {
  ok(Array.isArray(SHOOTING_SUBTYPES));
  ok(SHOOTING_SUBTYPES.includes('target_acquired'));
  ok(SHOOTING_SUBTYPES.includes('shot_fired'));
  ok(SHOOTING_SUBTYPES.includes('hit'));
  ok(SHOOTING_SUBTYPES.includes('miss'));
  ok(SHOOTING_SUBTYPES.includes('combo'));
});

// ── makeEvent ─────────────────────────────────────────────────────────────
test('makeEvent preserves all canonical fields', () => {
  const evt = {
    t: 5,
    type: 'score_event',
    actor: 'ZEROX',
    target: 'ORACLE',
    detail: 'drills a three',
    scoreA: 10,
    scoreB: 8,
    skill: 'sharpshooter',
  };
  const result = makeEvent(evt);

  eq(result.t, 5);
  eq(result.type, 'score_event');
  eq(result.actor, 'ZEROX');
  eq(result.target, 'ORACLE');
  eq(result.detail, 'drills a three');
  eq(result.scoreA, 10);
  eq(result.scoreB, 8);
  eq(result.skill, 'sharpshooter');
});

test('makeEvent provides sensible defaults for missing fields', () => {
  const evt = { type: 'match_started' };
  const result = makeEvent(evt);

  eq(result.t, 0);
  eq(result.type, 'match_started');
  eq(result.actor, null);
  eq(result.detail, '');
  eq(result.scoreA, 0);
  eq(result.scoreB, 0);
  ok(!('target' in result));
  ok(!('skill' in result));
});

test('makeEvent handles null/undefined gracefully', () => {
  const result = makeEvent(null);
  eq(result, null);
});

test('makeEvent normalizes detail as object (numeric outcomes)', () => {
  const evt = {
    t: 3,
    type: 'score_event',
    actor: 'SHADDAI',
    detail: { pts: 3, bonus: 1 },
    scoreA: 15,
    scoreB: 10,
  };
  const result = makeEvent(evt);

  eq(result.detail, { pts: 3, bonus: 1 });
  eq(result.scoreA, 15);
  eq(result.scoreB, 10);
});

test('makeEvent includes optional role, lineupIds, skillIds if present', () => {
  const evt = {
    t: 1,
    type: 'role_assignment',
    actor: 'NEXUS',
    detail: 'assigned QB',
    scoreA: 0,
    scoreB: 0,
    role: 'QB',
    lineupIds: ['agent-1', 'agent-2'],
    skillIds: ['sharpshooter', 'speed_demon'],
  };
  const result = makeEvent(evt);

  eq(result.role, 'QB');
  eq(result.lineupIds, ['agent-1', 'agent-2']);
  eq(result.skillIds, ['sharpshooter', 'speed_demon']);
});

// ── createEventLog ────────────────────────────────────────────────────────
test('createEventLog.push normalizes and appends events', () => {
  const log = createEventLog();
  log.push({ t: 0, type: 'match_started', actor: 'SHADDAI', scoreA: 0, scoreB: 0 });
  log.push({ t: 1, type: 'score_event', actor: 'ZEROX', detail: 'scores', scoreA: 2, scoreB: 0 });

  eq(log.count(), 2);
});

test('createEventLog.all preserves insertion order', () => {
  const log = createEventLog();
  log.push({ t: 0, type: 'event1', actor: 'A', scoreA: 0, scoreB: 0 });
  log.push({ t: 1, type: 'event2', actor: 'B', scoreA: 1, scoreB: 0 });
  log.push({ t: 2, type: 'event3', actor: 'C', scoreA: 1, scoreB: 1 });

  const all = log.all();
  eq(all.length, 3);
  eq(all[0].t, 0);
  eq(all[0].type, 'event1');
  eq(all[1].t, 1);
  eq(all[1].type, 'event2');
  eq(all[2].t, 2);
  eq(all[2].type, 'event3');
});

test('createEventLog.count returns event count', () => {
  const log = createEventLog();
  eq(log.count(), 0);
  log.push({ t: 0, type: 'event1', actor: 'A', scoreA: 0, scoreB: 0 });
  eq(log.count(), 1);
  log.push({ t: 1, type: 'event2', actor: 'B', scoreA: 1, scoreB: 0 });
  eq(log.count(), 2);
});

test('createEventLog.hashCheckpoints returns array of tick checkpoints', () => {
  const log = createEventLog();
  log.push({ t: 0, type: 'event1', actor: 'A', scoreA: 0, scoreB: 0 });
  log.push({ t: 0, type: 'event1b', actor: 'A', scoreA: 0, scoreB: 0 });
  log.push({ t: 1, type: 'event2', actor: 'B', scoreA: 1, scoreB: 0 });

  const checkpoints = log.hashCheckpoints();
  eq(checkpoints.length, 2);
  eq(checkpoints[0].tick, 0);
  eq(checkpoints[1].tick, 1);
});

// ── makeMatchRecord ───────────────────────────────────────────────────────
test('makeMatchRecord includes simVersion', () => {
  const record = makeMatchRecord({
    sport: 'hoops',
    seed: 12345,
    lineupA: [{ id: 'ZEROX', role: 'SF' }],
    lineupB: [{ id: 'ORACLE', role: 'PG' }],
  });

  eq(record.simVersion, SIM_VERSION);
  eq(record.simVersion, 'shaddai-sim-0.1.0');
});

test('makeMatchRecord carries sport, seed, mode, lineups', () => {
  const lineupA = [{ id: 'SHADDAI', role: 'C' }];
  const lineupB = [{ id: 'PIKADON', role: 'PF' }];
  const record = makeMatchRecord({
    sport: 'gridiron',
    seed: 999,
    mode: 'gridiron',
    lineupA,
    lineupB,
  });

  eq(record.sport, 'gridiron');
  eq(record.seed, 999);
  eq(record.mode, 'gridiron');
  eq(record.lineupA, lineupA);
  eq(record.lineupB, lineupB);
});

test('makeMatchRecord normalizes events via makeEvent', () => {
  const events = [
    { t: 0, type: 'match_started', actor: 'A', scoreA: 0, scoreB: 0 },
    { t: 1, type: 'score_event', actor: 'B', detail: 'goal', scoreA: 0, scoreB: 1 },
  ];
  const record = makeMatchRecord({
    sport: 'soccer',
    events,
  });

  eq(record.events.length, 2);
  eq(record.events[0].t, 0);
  eq(record.events[1].t, 1);
});

test('makeMatchRecord includes stateHashes, finalScore, winner, mvp, summary', () => {
  const stateHashes = [{ tick: 0, hash: 'abc123' }, { tick: 5, hash: 'def456' }];
  const summary = { avgPts: 50, duration: 48 };
  const record = makeMatchRecord({
    sport: 'hoops',
    stateHashes,
    finalScoreA: 98,
    finalScoreB: 94,
    winner: 'a',
    mvp: 'ZEROX',
    summary,
  });

  eq(record.stateHashes, stateHashes);
  eq(record.finalScoreA, 98);
  eq(record.finalScoreB, 94);
  eq(record.winner, 'a');
  eq(record.mvp, 'ZEROX');
  eq(record.summary, summary);
});

test('makeMatchRecord provides sensible defaults', () => {
  const record = makeMatchRecord({});

  eq(record.sport, 'hoops');
  eq(record.seed, 0);
  eq(record.mode, 'hoops');
  eq(record.lineupA.length, 0);
  eq(record.lineupB.length, 0);
  eq(record.events.length, 0);
  eq(record.stateHashes.length, 0);
  eq(record.finalScoreA, 0);
  eq(record.finalScoreB, 0);
  eq(record.winner, null);
  eq(record.mvp, null);
});

// ── makeBatchResult ───────────────────────────────────────────────────────
test('makeBatchResult includes simVersion', () => {
  const result = makeBatchResult({
    sport: 'hoops',
    runs: 1000,
  });

  eq(result.simVersion, SIM_VERSION);
});

test('makeBatchResult carries sport, loadoutId, seedFamily, runs, metrics', () => {
  const metrics = { winRate: 0.62, avgPtsA: 98.5, avgPtsB: 93.2 };
  const result = makeBatchResult({
    sport: 'dodgeball',
    loadoutId: 'build-001',
    seedFamily: 42,
    runs: 1000,
    metrics,
  });

  eq(result.sport, 'dodgeball');
  eq(result.loadoutId, 'build-001');
  eq(result.seedFamily, 42);
  eq(result.runs, 1000);
  eq(result.metrics, metrics);
});

test('makeBatchResult provides sensible defaults', () => {
  const result = makeBatchResult({});

  eq(result.sport, 'hoops');
  eq(result.loadoutId, null);
  eq(result.seedFamily, 0);
  eq(result.runs, 0);
  eq(result.metrics, {});
});

// ── INTEGRATION ───────────────────────────────────────────────────────────
test('Full workflow: create event log, build match record', () => {
  const log = createEventLog();
  log.push({ t: 0, type: 'match_started', actor: 'SHADDAI', scoreA: 0, scoreB: 0 });
  log.push({ t: 1, type: 'score_event', actor: 'ZEROX', detail: { pts: 3 }, scoreA: 3, scoreB: 0 });
  log.push({ t: 2, type: 'score_event', actor: 'ORACLE', detail: { pts: 2 }, scoreA: 3, scoreB: 2 });
  log.push({ t: 3, type: 'match_ended', actor: 'SHADDAI', scoreA: 3, scoreB: 2 });

  const record = makeMatchRecord({
    sport: 'shooting',
    seed: 100,
    mode: 'shooting',
    lineupA: [{ id: 'ZEROX', role: 'Shooter' }],
    lineupB: [{ id: 'ORACLE', role: 'Shooter' }],
    events: log.all(),
    finalScoreA: 3,
    finalScoreB: 2,
    winner: 'a',
    mvp: 'ZEROX',
    summary: { avgAcc: 0.78, totalShots: 10 },
  });

  eq(record.simVersion, SIM_VERSION);
  eq(record.sport, 'shooting');
  eq(record.events.length, 4);
  eq(record.finalScoreA, 3);
  eq(record.finalScoreB, 2);
  eq(record.winner, 'a');
  eq(record.mvp, 'ZEROX');
  eq(record.summary.avgAcc, 0.78);
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n✓ All tests passed!');
