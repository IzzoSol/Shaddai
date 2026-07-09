'use strict';
// ============================================================================
// backend/sports/football/roles.js — 4v4 Arcade Football Role Definitions
//
// DATA module only. No I/O, no randomness, zero dependencies beyond the
// affinity engine (required lazily so tests may stub it).
//
// Roles align with ROLE_WEIGHTS.gridiron in backend/platform/affinity.js.
// Stat names come from deriveFootball() in backend/platform/stat-ontology.js:
//   throwAccuracy, routeRunning, tackle, coverage, block, passRush, catching
// ============================================================================

// ── 4v4 ROLE POOLS ──────────────────────────────────────────────────────────
const OFFENSE_ROLES = ['QB', 'RB', 'WR', 'OL'];
const DEFENSE_ROLES = ['DL', 'LB', 'CB', 'FS'];

// ── ROLE INFO ────────────────────────────────────────────────────────────────
// keyStats: the football-derived stat names (from deriveFootball) this role
//           most heavily emphasizes.
// affinityRole: maps to the role key inside ROLE_WEIGHTS.gridiron in affinity.js.
//   Note: DL and LB use their own gridiron weight entries; OL maps to 'OL'.
//   (DB exists in affinity but is excluded from the 4v4 roster — CB/FS cover it.)
const ROLE_INFO = {
  // ── OFFENSE ──
  QB: {
    side:        'off',
    name:        'Quarterback',
    blurb:       'Field general. Reads the defense, makes decisions, and delivers the ball.',
    keyStats:    ['throwAccuracy', 'catching'],
    affinityRole: 'QB',
  },
  RB: {
    side:        'off',
    name:        'Running Back',
    blurb:       'Ball-carrier. Breaks tackles, finds holes, and turns short gains into big ones.',
    keyStats:    ['tackle', 'block'],
    affinityRole: 'RB',
  },
  WR: {
    side:        'off',
    name:        'Wide Receiver',
    blurb:       'Route runner and pass-catcher. Gets open and makes plays down the field.',
    keyStats:    ['routeRunning', 'catching'],
    affinityRole: 'WR',
  },
  OL: {
    side:        'off',
    name:        'Offensive Lineman',
    blurb:       'Protector. Keeps the QB clean and opens running lanes with elite blocking.',
    keyStats:    ['block', 'tackle'],
    affinityRole: 'OL',
  },

  // ── DEFENSE ──
  DL: {
    side:        'def',
    name:        'Defensive Lineman',
    blurb:       'Pass rusher. Collapses the pocket and disrupts the backfield on run plays.',
    keyStats:    ['passRush', 'tackle'],
    affinityRole: 'DL',
  },
  LB: {
    side:        'def',
    name:        'Linebacker',
    blurb:       'Tackling core. Plays the run first, drops into short zone, pressures when called.',
    keyStats:    ['tackle', 'coverage'],
    affinityRole: 'LB',
  },
  CB: {
    side:        'def',
    name:        'Cornerback',
    blurb:       'Press/man specialist. Locks down receivers with speed and reactive instincts.',
    keyStats:    ['coverage', 'routeRunning'],
    affinityRole: 'CB',
  },
  FS: {
    side:        'def',
    name:        'Free Safety',
    blurb:       'Deep center fielder. Reads routes before the snap and closes on the ball in flight.',
    keyStats:    ['coverage', 'throwAccuracy'],
    affinityRole: 'FS',
  },
};

// ── AGENT ROLE PRIORS ────────────────────────────────────────────────────────
// Starting priors for each council agent — preferred roles, not locks.
// The ruleset (and bestFootballRole) may override based on computed aptitude.
// ZEROX is the canonical code name (owner alias "XEROX" → "ZEROX").
const AGENT_ROLE_PRIORS = {
  SHADDAI: ['QB'],
  NEXUS:   ['RB', 'QB'],
  PIKADON: ['OL', 'FS'],
  ZEROX:   ['WR', 'CB'],
  TURTLE:  ['WR', 'QB'],
  ORACLE:  ['FS', 'LB'],   // research/intel → reads the field; no explicit prior set so defaults to aptitude-driven
  QUILL:   ['CB', 'WR'],   // precision/accuracy → clean coverage routes
};

// ── bestFootballRole(profile, side) ──────────────────────────────────────────
// Returns the best gridiron role for `profile` restricted to `side` ('off'|'def').
// Defers to affinity.bestRole with the appropriate pool.
// `profile` must be a normalized trait object as returned by agentAffinity().
// Pure: no I/O, no randomness.
function bestFootballRole(profile, side) {
  const { bestRole } = require('../../platform/affinity');
  const pool = side === 'off' ? OFFENSE_ROLES : side === 'def' ? DEFENSE_ROLES : [...OFFENSE_ROLES, ...DEFENSE_ROLES];
  return bestRole(profile, 'gridiron', pool);
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  OFFENSE_ROLES,
  DEFENSE_ROLES,
  ROLE_INFO,
  AGENT_ROLE_PRIORS,
  bestFootballRole,
};
