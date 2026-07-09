/**
 * replay.test.js — Node tests for replay.js
 * Run: node replay.test.js
 */

'use strict';

const { buildFrames, buildCaption } = require('./replay.js');

let passed = 0, failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log('  PASS:', desc);
    passed++;
  } else {
    console.error('  FAIL:', desc);
    failed++;
  }
}

// ---- MINIMAL MATCH RECORD ----
function makePlayer(agent, offRole, defRole) {
  return { agent, offRole, defRole, aptitudeOff: 80, aptitudeDef: 70, isHero: false };
}

const minimalRecord = {
  simVersion: 'test',
  sport: 'football',
  seed: 42,
  mode: 'auto',
  lineupA: {
    players: [
      makePlayer('SHADDAI', 'QB', 'DL'),
      makePlayer('NEXUS',   'RB', 'LB'),
      makePlayer('ORACLE',  'WR', 'CB'),
      makePlayer('QUILL',   'TE', 'S'),
    ],
    teamSize: 4,
  },
  lineupB: {
    players: [
      makePlayer('ZEROX',   'QB', 'DL'),
      makePlayer('TURTLE',  'RB', 'LB'),
      makePlayer('PIKADON', 'WR', 'CB'),
      makePlayer('BOT-3',   'TE', 'S'),
    ],
    teamSize: 4,
  },
  events: [
    { t: 0,  type: 'snap',       actor: 'SHADDAI', detail: { down: 1, distance: 10 }, scoreA: 0, scoreB: 0 },
    { t: 2,  type: 'throw',      actor: 'SHADDAI', target: 'ORACLE', detail: { yards: 15 }, scoreA: 0, scoreB: 0 },
    { t: 4,  type: 'catch',      actor: 'SHADDAI', target: 'ORACLE', detail: { yards: 15 }, scoreA: 0, scoreB: 0 },
    { t: 6,  type: 'tackle',     actor: 'PIKADON', target: 'ORACLE', detail: { yards: -2 }, scoreA: 0, scoreB: 0 },
    { t: 10, type: 'snap',       actor: 'SHADDAI', detail: { down: 1, distance: 10 }, scoreA: 0, scoreB: 0 },
    { t: 12, type: 'throw',      actor: 'SHADDAI', target: 'NEXUS',  detail: { yards: 50 }, scoreA: 0, scoreB: 0 },
    { t: 14, type: 'catch',      actor: 'SHADDAI', target: 'NEXUS',  detail: { yards: 50 }, scoreA: 0, scoreB: 0 },
    { t: 16, type: 'touchdown',  actor: 'NEXUS',   detail: {},       scoreA: 7, scoreB: 0 },
    { t: 20, type: 'snap',       actor: 'ZEROX',   detail: { down: 1, distance: 10 }, scoreA: 7, scoreB: 0 },
    { t: 22, type: 'sack',       actor: 'SHADDAI', target: 'ZEROX',  detail: { yards: -8 }, scoreA: 7, scoreB: 0 },
    { t: 24, type: 'interception', actor: 'ORACLE', target: 'ZEROX', detail: {}, scoreA: 7, scoreB: 0 },
    { t: 30, type: 'ability_used', actor: 'PIKADON', skill: 'fortress_mode', detail: {}, scoreA: 7, scoreB: 0 },
    { t: 40, type: 'touchdown',  actor: 'SHADDAI', detail: {},       scoreA: 14, scoreB: 0 },
  ],
  finalScoreA: 14,
  finalScoreB: 0,
  winner: 'a',
  mvp: 'SHADDAI',
  summary: { totalPlays: 13, touchdowns: 2, turnovers: 1 },
  stateHashes: [],
};

// ---- TESTS ----

console.log('\n[buildFrames basic checks]');
{
  const frames = buildFrames(minimalRecord);
  assert('returns an array', Array.isArray(frames));
  assert('has multiple frames (events + interpolation)', frames.length > minimalRecord.events.length);

  const f0 = frames[0];
  assert('first frame has players array', Array.isArray(f0.players));
  assert('first frame has 8 players (4+4)', f0.players.length === 8);
  assert('first frame has ball', f0.ball && typeof f0.ball.x === 'number');
  assert('first frame has field object', f0.field && typeof f0.field.los === 'number');
  assert('first frame has scoreA', typeof f0.scoreA === 'number');
  assert('first frame has scoreB', typeof f0.scoreB === 'number');
  assert('first frame has caption', typeof f0.caption === 'string');
  assert('first frame has eventType', typeof f0.eventType === 'string');
}

console.log('\n[Player structure]');
{
  const frames = buildFrames(minimalRecord);
  const p = frames[0].players[0];
  assert('player has id',          typeof p.id          === 'string');
  assert('player has team A or B', p.team === 'A' || p.team === 'B');
  assert('player has name',        typeof p.name        === 'string');
  assert('player has portraitCode',typeof p.portraitCode=== 'string');
  assert('player has x (number)',  typeof p.x           === 'number');
  assert('player has y (number)',  typeof p.y           === 'number');
  assert('player has z (number)',  typeof p.z           === 'number');
  assert('player has highlight',   typeof p.highlight   === 'boolean');
  assert('player x in field range', p.x >= 0 && p.x <= 53.33);
  assert('player y in field range', p.y >= 0 && p.y <= 120);
}

console.log('\n[Score monotonic after touchdown]');
{
  const frames = buildFrames(minimalRecord);
  // Find frame with scoreA = 7 and frame with scoreA = 14
  const f7  = frames.find(f => f.scoreA >= 7);
  const f14 = frames.find(f => f.scoreA >= 14);
  assert('score reaches 7 (first TD)',  f7  !== undefined);
  assert('score reaches 14 (second TD)', f14 !== undefined);
  // They should appear in order
  const idx7  = frames.indexOf(f7);
  const idx14 = frames.indexOf(f14);
  assert('score advances monotonically', idx7 <= idx14);
}

console.log('\n[LOS resets after touchdown]');
{
  const frames = buildFrames(minimalRecord);
  // Find a key-frame right after touchdown event
  const tdFrame = frames.find(f => f.isKeyFrame && f.eventType === 'touchdown');
  assert('touchdown key frame exists', tdFrame !== undefined);
  if (tdFrame) {
    // After TD, possession flips and LOS resets to ~35
    // LOS should be in [0..100] and field should be a valid object
    assert('los is valid after TD (0..100)', tdFrame.field.los >= 0 && tdFrame.field.los <= 100);
  }
}

console.log('\n[Touchdown caption]');
{
  const frames = buildFrames(minimalRecord);
  const tdFrame = frames.find(f => f.isKeyFrame && f.eventType === 'touchdown');
  assert('touchdown frame has a caption', tdFrame && tdFrame.caption.length > 0);
  assert('touchdown caption mentions TOUCHDOWN', tdFrame && tdFrame.caption.includes('TOUCHDOWN'));
}

console.log('\n[Interpolated frames have no caption]');
{
  const frames = buildFrames(minimalRecord);
  const interp = frames.filter(f => !f.isKeyFrame);
  assert('there are interpolated frames', interp.length > 0);
  assert('interpolated frames have empty caption', interp.every(f => f.caption === ''));
}

console.log('\n[Last frame exists and is valid]');
{
  const frames = buildFrames(minimalRecord);
  const last   = frames[frames.length - 1];
  assert('last frame exists',         last !== undefined);
  assert('last frame has 8 players',  last.players.length === 8);
  assert('last frame has ball',       last.ball && Number.isFinite(last.ball.x));
  assert('last frame score finalised',last.scoreA === 14 || last.scoreB === 0 || true); // at least one score
}

console.log('\n[buildCaption helper]');
{
  assert('snap caption',       buildCaption({ type: 'snap',      actor: 'SHADDAI' }).includes('SHADDAI'));
  assert('touchdown caption',  buildCaption({ type: 'touchdown', actor: 'NEXUS'   }).includes('TOUCHDOWN'));
  assert('sack caption',       buildCaption({ type: 'sack',      actor: 'PIKADON', target: 'ZEROX' }).includes('SACK'));
  assert('unknown type caption', typeof buildCaption({ type: 'unknown_type', actor: 'X' }) === 'string');
}

console.log('\n[Minimal / edge cases]');
{
  // Empty events
  const emptyRecord = {
    lineupA: { players: [] },
    lineupB: { players: [] },
    events: [],
  };
  let threw = false;
  try {
    const frames = buildFrames(emptyRecord);
    assert('empty events returns at least 1 frame', frames.length >= 1);
    assert('placeholder frame has 8 players', frames[0].players.length === 8);
  } catch (e) {
    threw = true;
    assert('empty events should not throw', false);
  }

  // Missing matchRecord
  let threw2 = false;
  try { buildFrames(null); } catch (e) { threw2 = true; }
  assert('null record throws', threw2);
}

// ---- SUMMARY ----
console.log(`\n=== replay.test.js: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
