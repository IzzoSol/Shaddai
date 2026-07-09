'use strict';
// ============================================================================
// stat-ontology.js — UNIVERSAL 14-STAT SPINE for SHADDAI arcade platform.
// Zero dependencies. All values 0–100, default 50.
//
// Sports plug-ins project this spine down to their own stat sets:
//   - projectToLegacy()  → basketball 7-stat sim (battle-engine.js compatible)
//   - deriveFootball()   → football 7-stat stub
// ============================================================================

// ── 14 UNIVERSAL STATS ──────────────────────────────────────────────────────
const UNIVERSAL_STATS = [
  'speed',        // linear top-end movement velocity
  'acceleration', // time to reach top speed from a standstill
  'agility',      // lateral quickness and direction-change ability
  'balance',      // stability under contact and off-balance moves
  'power',        // raw physical force output (jumps, tackles, dunks)
  'stamina',      // energy pool and recovery rate over game time
  'awareness',    // reading the environment, positioning, and threats
  'reaction',     // response latency to stimuli or opponent actions
  'precision',    // accuracy and fine motor control of actions
  'control',      // hands, ball, or implement mastery and consistency
  'vision',       // anticipation, floor/field reading, passing lanes
  'defense',      // individual defensive technique and fundamentals
  'composure',    // mental steadiness under pressure; clutch factor
  'toughness',    // durability, pain tolerance, and will to compete
];

// ── STAT METADATA ────────────────────────────────────────────────────────────
const STAT_META = {
  speed:        { min: 0, max: 100, default: 50, desc: 'Linear top-end movement velocity.' },
  acceleration: { min: 0, max: 100, default: 50, desc: 'Burst quickness from a standstill to top speed.' },
  agility:      { min: 0, max: 100, default: 50, desc: 'Lateral quickness and direction-change efficiency.' },
  balance:      { min: 0, max: 100, default: 50, desc: 'Stability under contact and while off-balance.' },
  power:        { min: 0, max: 100, default: 50, desc: 'Raw physical force: jumps, tackles, and drives.' },
  stamina:      { min: 0, max: 100, default: 50, desc: 'Energy pool size and in-game recovery rate.' },
  awareness:    { min: 0, max: 100, default: 50, desc: 'Reading the environment, positioning, and threats.' },
  reaction:     { min: 0, max: 100, default: 50, desc: 'Response latency to stimuli or opponent actions.' },
  precision:    { min: 0, max: 100, default: 50, desc: 'Accuracy and fine motor control during actions.' },
  control:      { min: 0, max: 100, default: 50, desc: 'Hands / ball / implement mastery and consistency.' },
  vision:       { min: 0, max: 100, default: 50, desc: 'Anticipation, floor/field reading, and passing lanes.' },
  defense:      { min: 0, max: 100, default: 50, desc: 'Individual defensive technique and fundamentals.' },
  composure:    { min: 0, max: 100, default: 50, desc: 'Mental steadiness under pressure; clutch factor.' },
  toughness:    { min: 0, max: 100, default: 50, desc: 'Durability, pain tolerance, and will to compete.' },
};

// ── LEGACY KEYS (basketball sim, battle-engine.js) ───────────────────────────
const LEGACY_KEYS = ['shooting', 'ballControl', 'speed', 'defense', 'vertical', 'stamina', 'iq'];

// ── HELPERS ──────────────────────────────────────────────────────────────────

/** Clamp a single value to [0, 100]. */
function clampStat(v) {
  return Math.max(0, Math.min(100, typeof v === 'number' && isFinite(v) ? v : 0));
}

/**
 * Build a full 14-key stats object.
 * Starts from defaults (50), overlays `partial`, clamps to [0,100].
 * Unknown keys are silently ignored.
 * @param {Partial<Record<string,number>>} [partial={}]
 * @returns {Record<string,number>}
 */
function makeStats(partial = {}) {
  const out = {};
  for (const key of UNIVERSAL_STATS) {
    out[key] = STAT_META[key].default;
  }
  if (partial && typeof partial === 'object') {
    for (const key of UNIVERSAL_STATS) {
      if (Object.prototype.hasOwnProperty.call(partial, key)) {
        out[key] = clampStat(partial[key]);
      }
    }
  }
  return out;
}

/**
 * Normalize a stats object: returns a new object with each value divided by 100.
 * @param {Record<string,number>} stats
 * @returns {Record<string,number>}
 */
function normalize(stats) {
  const out = {};
  for (const key of Object.keys(stats)) {
    out[key] = stats[key] / 100;
  }
  return out;
}

// ── LEGACY PROJECTION (basketball) ──────────────────────────────────────────
// Weight tables are top-level consts so sports tuners can adjust without
// touching the formula logic.

const LEGACY_WEIGHTS = {
  shooting:    { precision: 0.60, composure: 0.25, vision:     0.15 },
  ballControl: { control:   0.60, agility:   0.25, balance:    0.15 },
  speed:       { speed:     0.70, acceleration: 0.30 },
  defense:     { defense:   0.70, awareness:  0.15, reaction:  0.15 },
  vertical:    { power:     0.60, agility:    0.25, balance:   0.15 },
  stamina:     { stamina:   0.70, toughness:  0.30 },
  iq:          { awareness: 0.50, vision:     0.30, composure: 0.20 },
};

/**
 * Project 14-stat spine to the 7 legacy basketball stats used by battle-engine.js.
 * Returns exactly {shooting, ballControl, speed, defense, vertical, stamina, iq},
 * each clamped to [0,100].
 * @param {Record<string,number>} spine  — full 14-stat object (from makeStats)
 * @returns {Record<string,number>}
 */
function projectToLegacy(spine) {
  const out = {};
  for (const legacyKey of LEGACY_KEYS) {
    const weights = LEGACY_WEIGHTS[legacyKey];
    let sum = 0;
    for (const [spineKey, w] of Object.entries(weights)) {
      sum += w * (typeof spine[spineKey] === 'number' ? spine[spineKey] : 50);
    }
    out[legacyKey] = clampStat(Math.round(sum));
  }
  return out;
}

// ── FOOTBALL PROJECTION (sport plug-in stub) ─────────────────────────────────
// Weight tables for the 7 football-derived stats.

const FOOTBALL_WEIGHTS = {
  throwAccuracy: { precision: 0.60, composure:   0.25, vision:       0.15 },
  routeRunning:  { agility:   0.40, acceleration: 0.30, awareness:   0.30 },
  tackle:        { power:     0.50, toughness:   0.30, reaction:    0.20 },
  coverage:      { reaction:  0.40, speed:       0.30, awareness:   0.30 },
  block:         { power:     0.50, balance:     0.30, toughness:   0.20 },
  passRush:      { power:     0.40, acceleration: 0.30, reaction:   0.30 },
  catching:      { control:   0.50, precision:   0.30, reaction:    0.20 },
};

/**
 * Derive football-specific stats from the 14-stat spine.
 * Returns {throwAccuracy, routeRunning, tackle, coverage, block, passRush, catching},
 * each clamped to [0,100].
 * @param {Record<string,number>} spine
 * @returns {Record<string,number>}
 */
function deriveFootball(spine) {
  const out = {};
  for (const footballKey of Object.keys(FOOTBALL_WEIGHTS)) {
    const weights = FOOTBALL_WEIGHTS[footballKey];
    let sum = 0;
    for (const [spineKey, w] of Object.entries(weights)) {
      sum += w * (typeof spine[spineKey] === 'number' ? spine[spineKey] : 50);
    }
    out[footballKey] = clampStat(Math.round(sum));
  }
  return out;
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  UNIVERSAL_STATS,
  STAT_META,
  LEGACY_KEYS,
  makeStats,
  clampStat,
  normalize,
  projectToLegacy,
  deriveFootball,
};
