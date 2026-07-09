'use strict';
/**
 * sim-driver.js — SHADDAI Arcade Platform: Keystone deterministic simulation driver.
 *
 * Implements the shared SportRuleset contract and a single deterministic runMatch()
 * driver that every sport plugs into.  No Date.now / Math.random / performance.now
 * anywhere in the loop — full determinism guaranteed by the seeded PRNG.
 *
 * Zero external dependencies.  Sibling platform modules only.
 *
 * SportRuleset contract (plain object):
 * ─────────────────────────────────────
 *   id                string      e.g. 'football'
 *   tickRate          number      fixed ticks per game-second (informational)
 *   maxTicks          number      hard safety cap on the tick loop
 *   createInitialState(config, rand) → state
 *   update(state, rand, emit)    → void   (mutate state; call emit(evtFields))
 *   isComplete(state)            → boolean
 *   summarize(state)             → { finalScoreA, finalScoreB, winner, mvp, summary }
 *
 * Exports:
 *   runMatch(ruleset, config)                     → matchRecord
 *   runBatch(ruleset, configFactory, { runs, baseSeed }) → { runs, aggregate }
 *   makeMockRuleset()                             → SportRuleset  (for tests)
 */

const { rng }          = require('./prng');
const { hashState }    = require('./state-hash');
const {
  makeEvent,
  createEventLog,
  makeMatchRecord,
}                      = require('./telemetry');

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

/** Default interval (in ticks) between state-hash checkpoints. */
const DEFAULT_HASH_EVERY_TICKS = 32;

// ── runMatch ──────────────────────────────────────────────────────────────────

/**
 * Execute a single deterministic match.
 *
 * @param {Object} ruleset  - A SportRuleset implementation.
 * @param {Object} config   - Match configuration:
 *   {
 *     seed          : number,   // PRNG seed (required for determinism)
 *     mode          : string,   // game mode label
 *     lineupA       : Array,    // team A agents
 *     lineupB       : Array,    // team B agents
 *     hashEveryTicks: number,   // checkpoint interval (default 32)
 *     ...opts                   // sport-specific options forwarded to createInitialState
 *   }
 * @returns {Object} makeMatchRecord result — fully deterministic match record.
 */
function runMatch(ruleset, config) {
  if (!ruleset || typeof ruleset.createInitialState !== 'function') {
    throw new TypeError('runMatch: ruleset must implement the SportRuleset contract');
  }
  if (config == null || config.seed == null) {
    throw new TypeError('runMatch: config.seed is required');
  }

  const hashEveryTicks = (config.hashEveryTicks != null && config.hashEveryTicks > 0)
    ? config.hashEveryTicks
    : DEFAULT_HASH_EVERY_TICKS;

  // 1. Single PRNG for the whole match — created once from config.seed.
  const rand = rng(config.seed);

  // 2. Build initial state.
  const state = ruleset.createInitialState(config, rand);

  // 3. Event log.
  const log = createEventLog();

  // 4. State-hash checkpoints for desync detection / replay verification.
  const stateHashes = [];

  // 5. Tick loop — NO wall-clock calls inside.
  let t = 0;
  const maxTicks = ruleset.maxTicks;

  // emit helper injected into update()
  function emit(fields) {
    log.push(makeEvent({ t, ...fields }));
  }

  while (!ruleset.isComplete(state) && t < maxTicks) {
    ruleset.update(state, rand, emit);

    // Checkpoint every N ticks (and on tick 0).
    if (t % hashEveryTicks === 0) {
      stateHashes.push({ tick: t, hash: hashState(state) });
    }

    t++;
  }

  // Final checkpoint at the tick the loop ended (if not already recorded).
  const lastCheckpointTick = stateHashes.length > 0
    ? stateHashes[stateHashes.length - 1].tick
    : -1;
  if (t - 1 !== lastCheckpointTick) {
    stateHashes.push({ tick: t - 1, hash: hashState(state) });
  }

  // 4. Summarize.
  const s = ruleset.summarize(state);

  // 5. Assemble and return the match record.
  return makeMatchRecord({
    sport       : ruleset.id,
    seed        : config.seed,
    mode        : config.mode || ruleset.id,
    lineupA     : config.lineupA || [],
    lineupB     : config.lineupB || [],
    events      : log.all(),
    stateHashes,
    finalScoreA : s.finalScoreA,
    finalScoreB : s.finalScoreB,
    winner      : s.winner,
    mvp         : s.mvp,
    summary     : s.summary,
  });
}

// ── runBatch ──────────────────────────────────────────────────────────────────

/**
 * Run N deterministic matches and return lightweight aggregate statistics.
 * Seeds are derived as baseSeed + i, guaranteeing each run is independent
 * but the full batch is reproducible.
 *
 * @param {Object}   ruleset        - A SportRuleset implementation.
 * @param {Function} configFactory  - (i, seed) → config  (called once per run)
 * @param {Object}   opts
 *   @param {number} opts.runs      - Number of matches to simulate.
 *   @param {number} opts.baseSeed  - Starting seed (seed_i = baseSeed + i).
 *   @param {boolean} [opts.keepRecords=false] - If true, attach full records array.
 * @returns {{ runs: number, aggregate: Object, records?: Array }}
 */
function runBatch(ruleset, configFactory, { runs = 1, baseSeed = 0, keepRecords = false } = {}) {
  if (typeof configFactory !== 'function') {
    throw new TypeError('runBatch: configFactory must be a function (i, seed) → config');
  }

  const records = [];
  let winsA = 0;
  let winsB = 0;
  let ties  = 0;
  let totalScoreA = 0;
  let totalScoreB = 0;
  let totalTicks  = 0;
  let totalEvents = 0;

  for (let i = 0; i < runs; i++) {
    const seed   = (baseSeed + i) >>> 0; // keep it a safe uint32
    const config = configFactory(i, seed);
    // Ensure the derived seed is used (configFactory may override — honour it if set,
    // but fall back to derived seed for determinism).
    const effectiveConfig = { seed, ...config };
    const record = runMatch(ruleset, effectiveConfig);
    records.push(record);

    totalScoreA += record.finalScoreA;
    totalScoreB += record.finalScoreB;
    totalEvents += record.events.length;
    // stateHashes last entry tick ≈ total ticks
    const lastHash = record.stateHashes[record.stateHashes.length - 1];
    totalTicks += lastHash ? lastHash.tick + 1 : 0;

    if (record.winner === 'a') winsA++;
    else if (record.winner === 'b') winsB++;
    else ties++;
  }

  const aggregate = {
    totalRuns   : runs,
    winsA,
    winsB,
    ties,
    winRateA    : runs > 0 ? winsA / runs : 0,
    winRateB    : runs > 0 ? winsB / runs : 0,
    avgScoreA   : runs > 0 ? totalScoreA / runs : 0,
    avgScoreB   : runs > 0 ? totalScoreB / runs : 0,
    avgEvents   : runs > 0 ? totalEvents / runs : 0,
    avgTicks    : runs > 0 ? totalTicks  / runs : 0,
  };

  const result = { runs, aggregate };
  if (keepRecords) result.records = records;
  return result;
}

// ── makeMockRuleset ───────────────────────────────────────────────────────────

/**
 * A trivial but fully deterministic SportRuleset used by the test suite.
 *
 * Mechanics (simple, no real sport logic):
 *   - State tracks { tick, scoreA, scoreB, possession } — no agent objects needed.
 *   - Each tick: possession alternates stochastically; scoring chance = 30%.
 *   - Match ends when either team reaches TARGET_SCORE or maxTicks is hit.
 *   - MVP is always the "top scorer" label (deterministic per seed).
 *
 * @returns {Object} SportRuleset
 */
function makeMockRuleset() {
  const TARGET_SCORE = 5; // first to 5 wins

  return {
    id      : 'mock',
    tickRate: 10,
    maxTicks: 200, // generous cap so tests always terminate

    createInitialState(config, rand) {
      return {
        tick       : 0,
        scoreA     : 0,
        scoreB     : 0,
        possession : rand() < 0.5 ? 'a' : 'b', // coin-flip via rand — deterministic
        totalEvents: 0,
      };
    },

    update(state, rand, emit) {
      state.tick++;

      // Occasionally switch possession (40% chance).
      if (rand() < 0.4) {
        state.possession = state.possession === 'a' ? 'b' : 'a';
        emit({
          type  : 'action_started',
          actor : state.possession,
          detail: 'possession_change',
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        state.totalEvents++;
      }

      // Scoring chance: 30%.
      if (rand() < 0.3) {
        if (state.possession === 'a') {
          state.scoreA++;
        } else {
          state.scoreB++;
        }
        emit({
          type  : 'score_event',
          actor : state.possession,
          detail: 'point_scored',
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        state.totalEvents++;
      }
    },

    isComplete(state) {
      return state.scoreA >= TARGET_SCORE || state.scoreB >= TARGET_SCORE;
    },

    summarize(state) {
      let winner = null;
      if (state.scoreA > state.scoreB) winner = 'a';
      else if (state.scoreB > state.scoreA) winner = 'b';

      return {
        finalScoreA: state.scoreA,
        finalScoreB: state.scoreB,
        winner,
        mvp    : winner ? `team_${winner}_mvp` : null,
        summary: {
          totalTicks  : state.tick,
          totalEvents : state.totalEvents,
          scoreA      : state.scoreA,
          scoreB      : state.scoreB,
        },
      };
    },
  };
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = { runMatch, runBatch, makeMockRuleset };
