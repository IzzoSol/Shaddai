'use strict';
// ============================================================================
// backend/sports/football/lab.js — SHADDAI Football Batch-Simulation Lab
//
// Provides three high-level analysis tools built on runMatch + football ruleset:
//
//   runLab({ lineupA, lineupB, runs, baseSeed })
//     → Aggregate metrics over N deterministic matches (memory-safe, no full records).
//
//   compareLoadouts({ agent, roleForAgent, loadoutX, loadoutY, opponentPool, runs, baseSeed })
//     → Side-by-side metrics: same agent at same role with two different skill sets.
//
//   roleLab({ agent, skills, roles, opponentPool, runs })
//     → Empirical win-rate per candidate role so you can pick the best fit.
//
//   recentLabResults(limit)
//     → Read the last N compact summaries from the persisted JSON store.
//
// Persistence: compact summaries are appended to backend/data/football-lab.json
// via atomic temp-then-rename write, capped at MAX_PERSIST entries.
//
// Zero new external dependencies. Fully deterministic (same inputs → same output).
// ============================================================================

const fs   = require('fs');
const path = require('path');

const { runMatch }                          = require('../../platform/sim-driver');
const { makeBatchResult, SIM_VERSION }      = require('../../platform/telemetry');
const { buildMatchup, buildLineup }         = require('../../platform/roster');
const {
  footballRuleset,
  makeFootballConfig,
  COUNCIL_POOL,
  FOOTBALL_SPEC,
}                                            = require('./ruleset');

// ── Persistence config ────────────────────────────────────────────────────────

const DATA_FILE  = path.join(__dirname, '../../data/football-lab.json');
const MAX_PERSIST = 500; // cap entries in the JSON store

// ── Internal: metric accumulator ─────────────────────────────────────────────

/**
 * Create a blank per-team accumulator for one batch run.
 */
function _blankAccum() {
  return {
    wins:         0,
    totalScore:   0,
    totalYards:   0,
    totalPlays:   0,
    totalTDs:     0,
    totalTurnovers: 0,
    totalSacks:   0,
  };
}

/**
 * Harvest raw telemetry from a single match record into per-team accumulators.
 * Reads record.summary (yardsA/B, turnoversA/B, touchdownsA/B, playsRun)
 * and event types (sack) directly from the event log.
 */
function _harvest(record, accumA, accumB) {
  const s = record.summary || {};

  // Yards
  accumA.totalYards   += (s.yardsA || 0);
  accumB.totalYards   += (s.yardsB || 0);

  // TDs
  accumA.totalTDs     += (s.touchdownsA || 0);
  accumB.totalTDs     += (s.touchdownsB || 0);

  // Turnovers
  accumA.totalTurnovers += (s.turnoversA || 0);
  accumB.totalTurnovers += (s.turnoversB || 0);

  // Plays run (shared count — we apportion equally)
  const plays = s.playsRun || 0;
  accumA.totalPlays += plays;
  accumB.totalPlays += plays;

  // Scores
  accumA.totalScore += (record.finalScoreA || 0);
  accumB.totalScore += (record.finalScoreB || 0);

  // Sacks: count events where type === 'sack'; actor is on defense
  // Team A is on defense when Team B has possession — we attribute sacks
  // to the defense so: sack_event.actor ∈ defPlayers means that team scores
  // a defensive sack. We count by score side: when scoreB went up on a sack
  // event that's a sack against A, and vice versa.
  // Simpler: count all sack events, assume 50/50 split per team unless we
  // can trace. We DO trace: record.lineupA names are Team A players.
  const lineupANames = new Set(
    (record.lineupA || []).map(p => (p.agent && p.agent.name) || p.name || '')
  );

  for (const evt of (record.events || [])) {
    if (evt.type === 'sack') {
      // actor is the defensive player making the sack
      if (lineupANames.has(evt.actor)) {
        // Team A player made a sack → Team A's defense sacked Team B's QB
        accumA.totalSacks += 1;
      } else {
        accumB.totalSacks += 1;
      }
    }
  }

  // Wins
  if (record.winner === 'a')      accumA.wins += 1;
  else if (record.winner === 'b') accumB.wins += 1;
}

/**
 * Convert accumulators + run count into the canonical metrics block.
 */
function _toMetrics(accumA, accumB, runs) {
  const r = runs || 1;
  const safePlaysA = accumA.totalPlays || 1;
  const safePlaysB = accumB.totalPlays || 1;

  const winsA = accumA.wins;
  const winsB = accumB.wins;
  const ties  = r - winsA - winsB;

  return {
    runs,
    simVersion:        SIM_VERSION,
    winRateA:          winsA / r,
    winRateB:          winsB / r,
    tieRate:           ties  / r,
    avgScoreA:         accumA.totalScore    / r,
    avgScoreB:         accumB.totalScore    / r,
    avgYardsPerPlayA:  accumA.totalYards    / safePlaysA,
    avgYardsPerPlayB:  accumB.totalYards    / safePlaysB,
    turnoverRateA:     accumA.totalTurnovers / r,
    turnoverRateB:     accumB.totalTurnovers / r,
    sackRateA:         accumA.totalSacks     / r,
    sackRateB:         accumB.totalSacks     / r,
    touchdownsPerGameA: accumA.totalTDs     / r,
    touchdownsPerGameB: accumB.totalTDs     / r,
    avgPlays:          accumA.totalPlays     / r,   // same denominator for both
  };
}

// ── Internal: build a fixed-lineup config from two lineup objects ─────────────

/**
 * Build a runMatch config from two lineup objects (already built by roster module).
 * @param {Object} lineupA - { players: [...] }
 * @param {Object} lineupB - { players: [...] }
 * @param {number} seed
 * @returns {Object} config
 */
function _makeConfigFromLineups(lineupA, lineupB, seed) {
  return {
    seed,
    mode:    'gridiron',
    lineupA: lineupA.players || lineupA,
    lineupB: lineupB.players || lineupB,
  };
}

// ── Internal: auto-build a default matchup if lineups not supplied ────────────

function _autoMatchup(seed) {
  return buildMatchup({
    hero: COUNCIL_POOL[0],
    pool: COUNCIL_POOL,
    spec: FOOTBALL_SPEC,
    seed,
  });
}

// ── 1. runLab ─────────────────────────────────────────────────────────────────

/**
 * Aggregate N deterministic football matches over the SAME two lineups.
 *
 * Seeds: baseSeed + i for i in [0, runs).  Deterministic: same inputs → identical output.
 * Memory-safe: no match records are retained; only accumulators are kept.
 *
 * @param {Object} opts
 *   @param {Object} [opts.lineupA]   - { players: [...] } from roster module (auto-built if omitted)
 *   @param {Object} [opts.lineupB]   - { players: [...] } from roster module (auto-built if omitted)
 *   @param {number} [opts.runs=1000] - number of simulated matches
 *   @param {number} [opts.baseSeed=1]- starting seed
 * @returns {Object} Aggregate metrics block.
 */
function runLab({ lineupA, lineupB, runs = 1000, baseSeed = 1 } = {}) {
  const r = Math.max(1, runs | 0);
  const base = (baseSeed | 0) >>> 0;

  // Auto-build lineups if not supplied.
  let la = lineupA;
  let lb = lineupB;
  if (!la || !lb) {
    const matchup = _autoMatchup(base);
    la = matchup.lineupA;
    lb = matchup.lineupB;
  }

  const accumA = _blankAccum();
  const accumB = _blankAccum();

  for (let i = 0; i < r; i++) {
    const seed   = ((base + i) >>> 0);
    const config = _makeConfigFromLineups(la, lb, seed);
    const record = runMatch(footballRuleset, config);
    _harvest(record, accumA, accumB);
  }

  const metrics = _toMetrics(accumA, accumB, r);

  // Persist a compact summary (best-effort, never throws).
  _persistSummary({
    type:     'runLab',
    runs:     r,
    baseSeed: base,
    metrics,
  });

  return metrics;
}

// ── 2. compareLoadouts ────────────────────────────────────────────────────────

/**
 * Compare two skill loadouts for the same agent at the same role vs a fixed opponent.
 *
 * Each loadout is run independently (loadoutX vs opponent, loadoutY vs opponent)
 * using the same base seeds so the comparison is fair.
 *
 * @param {Object} opts
 *   @param {Object}   opts.agent        - { id, name, skills?: [...] } (the agent being tested)
 *   @param {string}   opts.roleForAgent - offensive role override (e.g. 'QB')
 *   @param {string[]} opts.loadoutX     - skill array for loadout X
 *   @param {string[]} opts.loadoutY     - skill array for loadout Y
 *   @param {Object[]} [opts.opponentPool=COUNCIL_POOL] - pool for opponent team
 *   @param {number}   [opts.runs=500]   - runs per loadout
 *   @param {number}   [opts.baseSeed=1]
 * @returns {{ x: Object, y: Object, verdict: string, deltaWinRate: number }}
 */
function compareLoadouts({
  agent,
  roleForAgent,
  loadoutX,
  loadoutY,
  opponentPool,
  runs    = 500,
  baseSeed = 1,
} = {}) {
  const r      = Math.max(1, runs | 0);
  const base   = (baseSeed | 0) >>> 0;
  const pool   = opponentPool || COUNCIL_POOL;

  function _runLoadout(skillSet) {
    // Build a hero agent with the given skill set.
    const hero = {
      id:     (agent && agent.id)   || 'hero',
      name:   (agent && agent.name) || 'HERO',
      skills: Array.isArray(skillSet) ? skillSet : [],
    };

    // Build lineupA (hero's team) and lineupB (opponent) using a fixed seed so
    // the roster composition is the same for X and Y.
    const matchup = buildMatchup({
      hero,
      heroRole: roleForAgent || null,
      pool,
      spec:    FOOTBALL_SPEC,
      seed:    base,
    });

    const accumA = _blankAccum();
    const accumB = _blankAccum();

    for (let i = 0; i < r; i++) {
      const seed   = ((base + i) >>> 0);
      const config = _makeConfigFromLineups(matchup.lineupA, matchup.lineupB, seed);
      const record = runMatch(footballRuleset, config);
      _harvest(record, accumA, accumB);
    }

    return _toMetrics(accumA, accumB, r);
  }

  const x = _runLoadout(loadoutX);
  const y = _runLoadout(loadoutY);

  const delta     = x.winRateA - y.winRateA; // positive → X is better
  let verdict;
  if (Math.abs(delta) < 0.02) verdict = 'tie';
  else if (delta > 0)          verdict = 'X wins';
  else                         verdict = 'Y wins';

  const result = { x, y, verdict, deltaWinRate: delta };

  _persistSummary({
    type:    'compareLoadouts',
    agent:   (agent && agent.name) || 'unknown',
    role:    roleForAgent || null,
    runs:    r,
    verdict,
    deltaWinRate: delta,
  });

  return result;
}

// ── 3. roleLab ────────────────────────────────────────────────────────────────

/**
 * Run the same agent across multiple candidate roles vs a fixed opponent to
 * determine empirically which role yields the best performance.
 *
 * @param {Object} opts
 *   @param {Object}   opts.agent        - { id, name, skills?: [...] }
 *   @param {string[]} [opts.skills]     - optional skill override (appended to agent.skills)
 *   @param {string[]} opts.roles        - candidate roles to test (e.g. ['QB','RB','WR','OL'])
 *   @param {Object[]} [opts.opponentPool=COUNCIL_POOL]
 *   @param {number}   [opts.runs=300]
 * @returns {{ roleResults: Array<{ role, ...metrics }>, bestRole: string }}
 */
function roleLab({ agent, skills, roles, opponentPool, runs = 300 } = {}) {
  const r    = Math.max(1, runs | 0);
  const pool = opponentPool || COUNCIL_POOL;

  const hero = {
    id:     (agent && agent.id)   || 'hero',
    name:   (agent && agent.name) || 'HERO',
    skills: [
      ...((agent && agent.skills) || []),
      ...(Array.isArray(skills) ? skills : []),
    ],
  };

  const roleList = Array.isArray(roles) && roles.length ? roles : ['QB', 'RB', 'WR', 'OL'];

  const roleResults = [];

  for (const role of roleList) {
    // Build the matchup with hero in this role; use the same base seed per role
    // so comparisons are fair.
    const matchup = buildMatchup({
      hero,
      heroRole: role,
      pool,
      spec:    FOOTBALL_SPEC,
      seed:    1,
    });

    const accumA = _blankAccum();
    const accumB = _blankAccum();

    for (let i = 0; i < r; i++) {
      const seed   = ((1 + i) >>> 0);
      const config = _makeConfigFromLineups(matchup.lineupA, matchup.lineupB, seed);
      const record = runMatch(footballRuleset, config);
      _harvest(record, accumA, accumB);
    }

    const m = _toMetrics(accumA, accumB, r);
    roleResults.push({ role, ...m });
  }

  // Pick the role with the highest win rate for the hero (Team A).
  roleResults.sort((a, b) => b.winRateA - a.winRateA);
  const best = roleResults[0] ? roleResults[0].role : null;

  const result = { roleResults, bestRole: best };

  _persistSummary({
    type:     'roleLab',
    agent:    hero.name,
    roles:    roleList,
    runs:     r,
    bestRole: best,
  });

  return result;
}

// ── 4. Persistence ────────────────────────────────────────────────────────────

/**
 * Append a compact summary to the football-lab.json store.
 * Uses atomic temp-then-rename so concurrent writes are safe.
 * All I/O wrapped in try/catch — never throws.
 *
 * @param {Object} entry - Compact summary to store.
 */
function _persistSummary(entry) {
  try {
    // Ensure the data directory exists.
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing entries (or start fresh).
    let entries = [];
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) entries = parsed;
      } catch (_) {
        // Corrupted file — start fresh.
        entries = [];
      }
    }

    // Build the batch result wrapper.
    const record = makeBatchResult({
      sport:     'football',
      loadoutId: entry.agent || null,
      seedFamily: entry.baseSeed || 0,
      runs:      entry.runs || 0,
      metrics:   entry,
    });

    entries.push(record);

    // Cap to MAX_PERSIST most-recent entries.
    if (entries.length > MAX_PERSIST) {
      entries = entries.slice(entries.length - MAX_PERSIST);
    }

    // Atomic write: write to a temp file then rename.
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (_) {
    // Never break a request due to persistence failure.
  }
}

/**
 * Read the N most-recent lab result summaries from the JSON store.
 *
 * @param {number} [limit=20] - Maximum entries to return.
 * @returns {Object[]} Array of batch result records (newest last).
 */
function recentLabResults(limit = 20) {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw     = fs.readFileSync(DATA_FILE, 'utf8');
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    const n = Math.max(1, limit | 0);
    return entries.slice(-n);
  } catch (_) {
    return [];
  }
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = { runLab, compareLoadouts, roleLab, recentLabResults };
