'use strict';
/**
 * sim-driver.test.js — Plain Node.js assert tests for sim-driver.js.
 * No test framework required. Run with: node backend/platform/sim-driver.test.js
 *
 * Covers:
 *   1. Same seed → byte-identical match record (JSON comparison), including stateHashes.
 *   2. Different seed → different result.
 *   3. Record carries simVersion, seed, both lineups, non-empty events, ≥1 stateHash.
 *   4. Loop always terminates (respects maxTicks even if isComplete never fires).
 *   5. runBatch over 50 seeds is deterministic (re-run → identical aggregate).
 */

const assert = require('assert');
const { runMatch, runBatch, makeMockRuleset } = require('./sim-driver');
const { SIM_VERSION } = require('./telemetry');

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function makeConfig(seed, overrides) {
  return {
    seed,
    mode   : 'test',
    lineupA: [{ id: 'alpha', role: 'scorer' }, { id: 'beta', role: 'defender' }],
    lineupB: [{ id: 'gamma', role: 'scorer' }, { id: 'delta', role: 'defender' }],
    ...overrides,
  };
}

// ── test suite ────────────────────────────────────────────────────────────────

console.log('\nsim-driver.test.js\n');

// ── 1. Determinism: same seed → identical JSON ────────────────────────────────
test('same seed → byte-identical JSON match record', () => {
  const ruleset = makeMockRuleset();
  const cfg     = makeConfig(42);

  const r1 = runMatch(ruleset, cfg);
  const r2 = runMatch(ruleset, cfg);

  const j1 = JSON.stringify(r1);
  const j2 = JSON.stringify(r2);

  assert.strictEqual(j1, j2, 'JSON of both records must be byte-identical');
});

// ── 2. Determinism: same seed → identical stateHashes ────────────────────────
test('same seed → identical stateHashes array', () => {
  const ruleset = makeMockRuleset();
  const cfg     = makeConfig(99);

  const r1 = runMatch(ruleset, cfg);
  const r2 = runMatch(ruleset, cfg);

  assert.deepStrictEqual(
    r1.stateHashes,
    r2.stateHashes,
    'stateHashes must be identical for the same seed'
  );
});

// ── 3. Different seed → different result ─────────────────────────────────────
test('different seed → different match record', () => {
  const ruleset = makeMockRuleset();

  const r1 = runMatch(ruleset, makeConfig(1));
  const r2 = runMatch(ruleset, makeConfig(2));

  // At least one of: scores, events length, or stateHashes differs.
  const same =
    r1.finalScoreA === r2.finalScoreA &&
    r1.finalScoreB === r2.finalScoreB &&
    r1.events.length === r2.events.length &&
    JSON.stringify(r1.stateHashes) === JSON.stringify(r2.stateHashes);

  assert.ok(!same, 'Different seeds should (almost certainly) produce different records');
});

// ── 4. Record carries required fields ────────────────────────────────────────
test('record carries simVersion', () => {
  const record = runMatch(makeMockRuleset(), makeConfig(7));
  assert.strictEqual(record.simVersion, SIM_VERSION, 'simVersion must match telemetry.SIM_VERSION');
});

test('record carries seed', () => {
  const record = runMatch(makeMockRuleset(), makeConfig(123));
  assert.strictEqual(record.seed, 123, 'record.seed must equal config.seed');
});

test('record carries both lineups', () => {
  const cfg    = makeConfig(55);
  const record = runMatch(makeMockRuleset(), cfg);
  assert.deepStrictEqual(record.lineupA, cfg.lineupA, 'lineupA must match');
  assert.deepStrictEqual(record.lineupB, cfg.lineupB, 'lineupB must match');
});

test('record.events is non-empty', () => {
  const record = runMatch(makeMockRuleset(), makeConfig(11));
  assert.ok(Array.isArray(record.events), 'events must be an array');
  assert.ok(record.events.length > 0, `events must be non-empty (got ${record.events.length})`);
});

test('record.stateHashes has ≥1 checkpoint', () => {
  const record = runMatch(makeMockRuleset(), makeConfig(17));
  assert.ok(Array.isArray(record.stateHashes), 'stateHashes must be an array');
  assert.ok(record.stateHashes.length >= 1, `stateHashes must have ≥1 entry (got ${record.stateHashes.length})`);
});

test('each stateHash entry has tick (number) and hash (8-char hex string)', () => {
  const record = runMatch(makeMockRuleset(), makeConfig(33));
  for (const cp of record.stateHashes) {
    assert.ok(typeof cp.tick === 'number', `tick must be a number, got ${typeof cp.tick}`);
    assert.ok(typeof cp.hash === 'string' && /^[0-9a-f]{8}$/.test(cp.hash),
      `hash must be 8-char hex, got "${cp.hash}"`);
  }
});

// ── 5. Loop always terminates (maxTicks respected) ───────────────────────────
test('loop terminates even when isComplete never fires (maxTicks cap)', () => {
  // A ruleset whose isComplete always returns false — the loop must cap at maxTicks.
  const neverDoneRuleset = {
    id      : 'never-done',
    tickRate: 1,
    maxTicks: 50,
    createInitialState() { return { scoreA: 0, scoreB: 0 }; },
    update(state, rand, emit) {
      emit({ type: 'action_started', actor: 'x', detail: 'tick', scoreA: 0, scoreB: 0 });
    },
    isComplete() { return false; },
    summarize(state) {
      return { finalScoreA: 0, finalScoreB: 0, winner: null, mvp: null, summary: {} };
    },
  };

  const record = runMatch(neverDoneRuleset, makeConfig(1, { seed: 1 }));

  // The loop runs maxTicks=50 iterations (t=0..49), so events = 50.
  assert.strictEqual(
    record.events.length,
    50,
    `expected 50 events (one per tick up to maxTicks), got ${record.events.length}`
  );
});

// ── 6. stateHash checkpoints land on correct tick multiples ──────────────────
test('hashEveryTicks config controls checkpoint frequency', () => {
  const record = runMatch(makeMockRuleset(), makeConfig(77, { hashEveryTicks: 8 }));

  // Every checkpoint at tick 0, 8, 16, ... should appear.
  const ticks = record.stateHashes.map(c => c.tick);
  // tick 0 must always be first.
  assert.strictEqual(ticks[0], 0, 'first checkpoint must be tick 0');

  // Interior ticks (all except possibly the last trailing checkpoint) must be multiples of 8.
  // (The last entry may be the final tick for a trailing checkpoint.)
  for (let i = 0; i < ticks.length - 1; i++) {
    assert.strictEqual(ticks[i] % 8, 0,
      `checkpoint at index ${i} tick ${ticks[i]} should be a multiple of 8`);
  }
});

// ── 7. runBatch determinism ───────────────────────────────────────────────────
test('runBatch over 50 seeds is deterministic (two runs → identical aggregate)', () => {
  const ruleset       = makeMockRuleset();
  const configFactory = (i, seed) => makeConfig(seed);
  const opts          = { runs: 50, baseSeed: 1000 };

  const batch1 = runBatch(ruleset, configFactory, opts);
  const batch2 = runBatch(ruleset, configFactory, opts);

  assert.deepStrictEqual(
    batch1.aggregate,
    batch2.aggregate,
    'batch aggregate must be identical across two identical runBatch calls'
  );
});

test('runBatch aggregate has expected shape', () => {
  const batch = runBatch(makeMockRuleset(), (i, seed) => makeConfig(seed), { runs: 10, baseSeed: 500 });

  const agg = batch.aggregate;
  assert.strictEqual(typeof agg.totalRuns,  'number');
  assert.strictEqual(typeof agg.winsA,      'number');
  assert.strictEqual(typeof agg.winsB,      'number');
  assert.strictEqual(typeof agg.ties,       'number');
  assert.strictEqual(typeof agg.winRateA,   'number');
  assert.strictEqual(typeof agg.winRateB,   'number');
  assert.strictEqual(typeof agg.avgScoreA,  'number');
  assert.strictEqual(typeof agg.avgScoreB,  'number');
  assert.strictEqual(typeof agg.avgEvents,  'number');
  assert.ok(agg.totalRuns === 10, 'totalRuns must equal the requested runs count');
  assert.ok(agg.winsA + agg.winsB + agg.ties === 10, 'win/tie counts must sum to total runs');
  assert.ok(agg.winRateA >= 0 && agg.winRateA <= 1, 'winRateA must be in [0,1]');
});

test('runBatch keepRecords returns full records array', () => {
  const batch = runBatch(
    makeMockRuleset(),
    (i, seed) => makeConfig(seed),
    { runs: 5, baseSeed: 200, keepRecords: true }
  );
  assert.ok(Array.isArray(batch.records), 'records must be an array when keepRecords=true');
  assert.strictEqual(batch.records.length, 5, 'records length must equal runs');
});

// ── 8. runBatch different baseSeed → different aggregate ─────────────────────
test('runBatch with different baseSeed produces different aggregate', () => {
  const ruleset       = makeMockRuleset();
  const configFactory = (i, seed) => makeConfig(seed);

  const b1 = runBatch(ruleset, configFactory, { runs: 20, baseSeed: 0 });
  const b2 = runBatch(ruleset, configFactory, { runs: 20, baseSeed: 9999 });

  const same =
    b1.aggregate.winsA    === b2.aggregate.winsA &&
    b1.aggregate.winsB    === b2.aggregate.winsB &&
    b1.aggregate.avgScoreA === b2.aggregate.avgScoreA;

  assert.ok(!same, 'Different baseSeed should (very likely) produce different aggregates');
});

// ── 9. makeMockRuleset smoke test ─────────────────────────────────────────────
test('makeMockRuleset returns an object implementing all SportRuleset fields', () => {
  const r = makeMockRuleset();
  assert.ok(typeof r.id                   === 'string',   'id must be a string');
  assert.ok(typeof r.tickRate             === 'number',   'tickRate must be a number');
  assert.ok(typeof r.maxTicks             === 'number',   'maxTicks must be a number');
  assert.ok(typeof r.createInitialState   === 'function', 'createInitialState must be a function');
  assert.ok(typeof r.update               === 'function', 'update must be a function');
  assert.ok(typeof r.isComplete           === 'function', 'isComplete must be a function');
  assert.ok(typeof r.summarize            === 'function', 'summarize must be a function');
});

// ── 10. Error handling ────────────────────────────────────────────────────────
test('runMatch throws TypeError for missing ruleset', () => {
  assert.throws(
    () => runMatch(null, makeConfig(1)),
    TypeError,
    'Should throw TypeError for null ruleset'
  );
});

test('runMatch throws TypeError for missing seed', () => {
  assert.throws(
    () => runMatch(makeMockRuleset(), { lineupA: [], lineupB: [] }),
    TypeError,
    'Should throw TypeError when config.seed is missing'
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
