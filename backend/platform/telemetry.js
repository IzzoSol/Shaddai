'use strict';

// ============================================================================
// telemetry.js — SHADDAI Arcade Platform: Unified Match/Event Telemetry Schema
// ============================================================================
// Zero-dependency module for standardizing event logs across all arcade sports
// (Hoops, Dodgeball, Soccer, Shooting, Gridiron, etc.).
//
// Every sport emits events in the canonical shape inherited from battle-engine.js:
//   { t, type, actor, target?, detail, scoreA, scoreB, skill? }
//
// This module extends that shape + provides builders for deterministic match records,
// batch results, and event logs. No Date.now/Math.random inside—all randomness
// must be seeded externally and passed in (or omitted for deterministic replay).
// ============================================================================

// ── VERSION ───────────────────────────────────────────────────────────────
// Every match record carries this version. Increment on schema changes.
const SIM_VERSION = 'shaddai-sim-0.1.0';

// ── EVENT FAMILIES ────────────────────────────────────────────────────────
// The 12 cross-sport event families. Every arcade event belongs to one family.
const EVENT_FAMILIES = [
  'match_started',       // Match initialized; carrying mode, lineups, seed.
  'phase_started',       // New period/quarter/half/round starts.
  'action_started',      // A discrete action begins (possession, drive, etc).
  'ability_used',        // A skill/ability fires (flavor: "Sharpshooter proc").
  'contest',             // Direct contest: tackle, block, steal, coverage.
  'score_event',         // A score occurs (goal, basket, point, touchdown, etc).
  'turnover_event',      // Turnover: interception, fumble, steal, missed FG.
  'stamina_event',       // Fatigue/conditioning applied.
  'role_assignment',     // Positional/affinity role assigned (QB, WR, DB, etc).
  'loadout_evaluation',  // Loadout stats resolved (before match starts).
  'match_ended',         // Match concluded; carrying winner, MVP, summary.
  'batch_sim_completed', // 1000-sim batch finished; carrying aggregate metrics.
];

// ── SPORT-SPECIFIC SUBTYPES ───────────────────────────────────────────────
// Each sport defines concrete event subtypes within its families.

const FOOTBALL_SUBTYPES = [
  'snap', 'throw', 'catch', 'tackle', 'interception', 'touchdown',
  'field_goal', 'sack', 'fumble', 'handoff', 'route_break', 'drive_ended',
  'punt', 'turnover_on_downs',
];

const BASKETBALL_SUBTYPES = [
  'dribble_move', 'pass', 'shot_attempt', 'rebound', 'steal', 'block',
];

const SOCCER_SUBTYPES = [
  'pass', 'dribble', 'tackle', 'save', 'shot', 'goal',
];

const DODGEBALL_SUBTYPES = [
  'throw', 'dodge', 'catch', 'elimination',
];

const SHOOTING_SUBTYPES = [
  'target_acquired', 'shot_fired', 'hit', 'miss', 'combo',
];

// ── CANONICAL EVENT BUILDER ───────────────────────────────────────────────
/**
 * Normalize an event to the canonical shape.
 *
 * @param {Object} evt - Raw event with fields: t, type, actor, detail, scoreA, scoreB, ...
 * @returns {Object} Normalized event in canonical shape.
 */
function makeEvent(evt) {
  if (!evt) return null;

  const normalized = {
    t: evt.t != null ? evt.t : 0,                    // tick
    type: evt.type || 'unknown',                     // event type/family
    actor: evt.actor || null,                        // who performed the action
    detail: evt.detail != null ? evt.detail : '',    // description or { numeric outcomes }
    scoreA: evt.scoreA != null ? evt.scoreA : 0,     // team A score at this tick
    scoreB: evt.scoreB != null ? evt.scoreB : 0,     // team B score at this tick
  };

  // Optional fields: preserve if present.
  if (evt.target != null) normalized.target = evt.target;
  if (evt.skill != null) normalized.skill = evt.skill;
  if (evt.role != null) normalized.role = evt.role;
  if (evt.lineupIds != null) normalized.lineupIds = evt.lineupIds;
  if (evt.skillIds != null) normalized.skillIds = evt.skillIds;

  return normalized;
}

// ── EVENT LOG BUILDER ─────────────────────────────────────────────────────
/**
 * Create a deterministic event log builder. Preserves insertion order.
 *
 * @returns {Object} { push(evt), all(), count(), hashCheckpoints }
 */
function createEventLog() {
  const log = [];

  return {
    push(evt) {
      const normalized = makeEvent(evt);
      if (normalized) log.push(normalized);
      return this;
    },
    all() {
      return [...log];  // copy for immutability
    },
    count() {
      return log.length;
    },
    hashCheckpoints() {
      // Return an array of {tick, hash} for all distinct tick values.
      // (In a real implementation, this would compute a rolling hash of the state.)
      const checkpoints = [];
      const seen = new Set();
      for (const evt of log) {
        if (!seen.has(evt.t)) {
          seen.add(evt.t);
          checkpoints.push({ tick: evt.t, hash: null }); // placeholder
        }
      }
      return checkpoints;
    },
  };
}

// ── MATCH RECORD BUILDER ──────────────────────────────────────────────────
/**
 * Build a complete match record (deterministic, no clock calls).
 *
 * @param {Object} opts - { sport, seed, mode, lineupA, lineupB, events, finalScoreA, finalScoreB, winner, mvp, stateHashes, summary }
 * @returns {Object} Full match record with simVersion, lineups, events, etc.
 */
function makeMatchRecord(opts) {
  opts = opts || {};

  const record = {
    simVersion: SIM_VERSION,
    sport: opts.sport || 'hoops',
    seed: opts.seed != null ? opts.seed : 0,
    mode: opts.mode || 'hoops',

    // Lineups: array of { id, role, ... } OR a roster object { players, teamSize }.
    // Preserve whatever shape the caller passes; only default when truly absent.
    // (The old Array.isArray guard silently dropped object lineups → empty record.)
    lineupA: opts.lineupA != null ? opts.lineupA : [],
    lineupB: opts.lineupB != null ? opts.lineupB : [],

    // Events: array of canonical event objects.
    events: Array.isArray(opts.events) ? opts.events.map(e => makeEvent(e)) : [],

    // State hashes for determinism verification: [{tick, hash}, ...]
    stateHashes: Array.isArray(opts.stateHashes) ? opts.stateHashes : [],

    // Final outcome
    finalScoreA: opts.finalScoreA != null ? opts.finalScoreA : 0,
    finalScoreB: opts.finalScoreB != null ? opts.finalScoreB : 0,
    winner: opts.winner || null,  // 'a', 'b', or null for tie
    mvp: opts.mvp || null,         // MVP agent name or null

    // Aggregate metrics: { pts, fg, tov, reb, etc. }
    summary: opts.summary || {},
  };

  return record;
}

// ── BATCH RESULT BUILDER ──────────────────────────────────────────────────
/**
 * Build a batch result for 1000-sim aggregates.
 *
 * @param {Object} opts - { sport, loadoutId, seedFamily, runs, metrics }
 * @returns {Object} Batch result with simVersion, aggregates, etc.
 */
function makeBatchResult(opts) {
  opts = opts || {};

  const result = {
    simVersion: SIM_VERSION,
    sport: opts.sport || 'hoops',
    loadoutId: opts.loadoutId || null,
    seedFamily: opts.seedFamily || 0,
    runs: opts.runs || 0,

    // Aggregate metrics: { winRate, avgPtsA, avgPtsB, avgDuration, ... }
    metrics: opts.metrics || {},
  };

  return result;
}

// ── EXPORTS ───────────────────────────────────────────────────────────────
module.exports = {
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
};
