'use strict';
// ============================================================================
// backend/sports/football/football-stats.js — Agent → Football Rating Resolver
//
// playerFootballRatings(agentName, skillIds, role) → { spine, football, role, profile,
//   mainRole, assignedRole, positionGap, versatility, offPenalty }
//
// Pipeline:
//   1. agentAffinity(skillIds, agentName)  → normalized trait profile (10 tags, sum~1)
//   2. TRAIT_TO_SPINE table → map each trait to a UNIVERSAL_STATS key
//   3. Scale profile[trait] (0..1) to a 40–90 band: stat = 40 + profile[trait]*10 * 5
//      (i.e. 40 + profile * 50, so a perfectly focused agent in one trait → 90,
//       flat NEUTRAL profile (0.1 each) → 40 + 5 = 45 per stat)
//   4. makeStats(partial) → full 14-stat spine (unknowns default to 50)
//   5. deriveFootball(spine) → football ratings
//      {throwAccuracy, routeRunning, tackle, coverage, block, passRush, catching}
//   6. roleStatMods('gridiron', role) → apply aptitude multipliers to relevant ratings
//      (bounded by applyFootballMods)
//   7. VERSATILITY PENALTY → scale ratings down when agent plays off their main role;
//      penalty is softened by skill count/quality (skilled agents adapt).
//
// Pure / deterministic. No I/O, no randomness, no Date.now.
// Zero external runtime deps beyond sibling platform modules.
// ============================================================================

const { agentAffinity, roleStatMods, bestRole, roleAptitude, rolePool } = require('../../platform/affinity');
const { makeStats, deriveFootball }   = require('../../platform/stat-ontology');

// ── TRAIT_TO_SPINE ────────────────────────────────────────────────────────────
// Maps each of the 10 affinity TAGS to the UNIVERSAL_STATS key it most directly
// drives in the football context. A trait's profile share (0..1) is scaled to
// the 40-90 band and sets that spine stat.  Unmapped spine stats default to 50
// via makeStats.  One trait can strengthen multiple spine stats (via the weighting
// in the band formula) but each pair here is the PRIMARY mapping.
//
// Rationale:
//   analysis  → awareness  (reads the field; positional knowledge)
//   defense   → defense    (fundamentals, man coverage technique)
//   aggression→ power      (physical dominance, rushing force)
//   speed     → speed      (straight-line 40-yard-dash velocity)
//   precision → precision  (accuracy of throws and catches)
//   endurance → stamina    (late-game conditioning, drive sustain)
//   control   → control    (ball security, grip, hands)
//   power     → toughness  (breaks tackles, absorbs hits)
//   support   → vision     (playmaking sense, finding open receivers)
//   reaction  → reaction   (reflex closes, jump the route instincts)
const TRAIT_TO_SPINE = {
  analysis:  'awareness',
  defense:   'defense',
  aggression: 'power',
  speed:     'speed',
  precision: 'precision',
  endurance: 'stamina',
  control:   'control',
  power:     'toughness',
  support:   'vision',
  reaction:  'reaction',
};

// Scale band constants.
// Wider band (30–95) vs old (40–90) gives more spread from profile concentration.
// A focused agent (trait share ~0.3) now reaches ~50 vs a neutral agent at ~37,
// which produces a meaningful 13-point rating delta before role mods.
const BAND_MIN = 30;  // floor stat value for a completely absent trait
const BAND_MAX = 95;  // ceiling for a fully concentrated trait
const BAND_RANGE = BAND_MAX - BAND_MIN; // 65

// ── VERSATILITY CONSTANTS ─────────────────────────────────────────────────────
// PENALTY_SCALE: tunable knob. With scale=0.75, a fully off-position, zero-skill
// agent (positionGap~0.5, versatility~0.12) suffers ~0.75*0.5*0.88 ≈ 33% penalty
// (clamped to max 45%). A 3-skill agent (versatility~0.5) only suffers ~19%.
const PENALTY_SCALE = 0.75;

// Base versatility for a zero-skill agent (bots are stiff one-position players).
const VERSATILITY_BASE = 0.12;

// How much each equipped skill adds to versatility (caps approach 0.85).
const VERSATILITY_PER_SKILL = 0.18;

// Maximum versatility a highly-skilled agent can achieve.
const VERSATILITY_MAX = 0.85;

// Maximum fraction of ratings the penalty can remove (keep games fun even off-pos).
const PENALTY_CAP = 0.45;

/**
 * Compute how versatile (0..1) an agent is based purely on their equipped skills.
 * Zero skills → ~0.12 (bots are stiff). Each skill adds ~0.18, capped at 0.85.
 * Pure / deterministic.
 *
 * @param {string[]} skillIds — equipped skill ids
 * @returns {number} versatility in [VERSATILITY_BASE, VERSATILITY_MAX]
 */
function computeVersatility(skillIds) {
  const skills = Array.isArray(skillIds) ? skillIds : [];
  const raw = VERSATILITY_BASE + skills.length * VERSATILITY_PER_SKILL;
  return Math.min(VERSATILITY_MAX, Math.max(VERSATILITY_BASE, raw));
}

/**
 * Build the 14-stat spine from an affinity trait profile.
 * Each trait in TRAIT_TO_SPINE maps its share (0..1) to the 40–90 band.
 * Traits that share the SAME spine key are SUMMED (capped at 100 by makeStats).
 *
 * @param {Object} profile  — normalized trait bag from agentAffinity()
 * @returns {Object}        — partial stats fed into makeStats()
 */
function _profileToSpinePartial(profile) {
  const partial = {};
  for (const [trait, spineKey] of Object.entries(TRAIT_TO_SPINE)) {
    const traitValue = profile[trait] || 0; // 0..1 (NEUTRAL ≈ 0.1)
    // Scale: 0 → BAND_MIN, 1 → BAND_MAX.
    // Two traits can map to the same spine key; accumulate additive contribution.
    const contribution = BAND_MIN + traitValue * BAND_RANGE;
    if (partial[spineKey] === undefined) {
      partial[spineKey] = contribution;
    } else {
      // Take the higher contribution (max, not sum) — traits reinforce each other
      // at the spine level rather than stacking past natural ceilings.
      partial[spineKey] = Math.max(partial[spineKey], contribution);
    }
  }
  return partial;
}

// ── Football-stat role mod multipliers ────────────────────────────────────────
// roleStatMods from affinity returns {aptitude, mods} where mods keys are the
// LEGACY basketball stats (shooting/ballControl/speed/defense/vertical/stamina/iq).
// We translate those to the football rating keys here.
const LEGACY_TO_FOOTBALL = {
  shooting:    'throwAccuracy',  // precision → throw accuracy
  ballControl: 'catching',       // control → ball security / catching
  speed:       'routeRunning',   // speed/aggression → route explosiveness
  defense:     'coverage',       // defense/reaction → coverage (and also feeds tackle via toughness)
  vertical:    'passRush',       // power → pass rush (jump off the line)
  stamina:     null,             // no direct football analogue — skip
  iq:          null,             // already baked in via awareness → coverage
};

// ── Role-fit direct bonus table ───────────────────────────────────────────────
// For each gridiron role, the 1–2 football stats that role most depends on.
// A well-fit agent (aptitude near 1.0) gains up to ROLE_FIT_MAX_BONUS points
// on these stats, linearly scaled by aptitude.  A zero-aptitude agent gets 0.
// This creates a clear, role-specific rating spread without changing the formula
// math for every intermediate stat.
const ROLE_FIT_BONUS_STATS = {
  QB:  ['throwAccuracy'],
  RB:  ['tackle', 'routeRunning'],   // tackle doubles as carry-power here
  WR:  ['routeRunning', 'catching'],
  OL:  ['block'],
  DL:  ['passRush'],
  LB:  ['tackle', 'coverage'],
  CB:  ['coverage', 'routeRunning'],
  FS:  ['coverage', 'tackle'],
  DB:  ['coverage'],
};
// Maximum flat-point bonus for a perfect-fit (aptitude=1.0) agent on that role's key stat.
const ROLE_FIT_MAX_BONUS = 18; // 0–18 pts depending on aptitude; linear

/**
 * Apply role-stat multipliers (from affinity.roleStatMods) onto football ratings,
 * then add the role-fit flat bonus scaled by aptitude.
 *
 * Two-step:
 *   1. Multiply each relevant rating by its legacy→football multiplier (from roleStatMods).
 *   2. Add aptitude × ROLE_FIT_MAX_BONUS flat points to the role's key stat(s).
 *
 * All output values are clamped to [0, 100].
 *
 * @param {Object} football  — output of deriveFootball()
 * @param {Object} mods      — { legacyStat: multiplier } from roleStatMods().mods
 * @param {number} aptitude  — 0..1 role fit score
 * @param {string} role      — gridiron role key (QB|RB|WR|OL|DL|LB|CB|FS)
 * @returns {Object}         — new football ratings object (shallow clone)
 */
function applyFootballMods(football, mods, aptitude, role) {
  const out = Object.assign({}, football);

  // Step 1: apply legacy multipliers (unchanged from before)
  for (const [legacyKey, mult] of Object.entries(mods)) {
    const fbKey = LEGACY_TO_FOOTBALL[legacyKey];
    if (!fbKey) continue;
    if (typeof out[fbKey] === 'number') {
      out[fbKey] = Math.max(0, Math.min(100, Math.round(out[fbKey] * mult)));
    }
  }

  // Step 2: role-fit flat bonus — gives a clear edge to well-fit agents
  const bonusStats = ROLE_FIT_BONUS_STATS[role] || [];
  const apt = typeof aptitude === 'number' ? Math.max(0, Math.min(1, aptitude)) : 0;
  const bonus = Math.round(apt * ROLE_FIT_MAX_BONUS);
  for (const fbKey of bonusStats) {
    if (typeof out[fbKey] === 'number') {
      out[fbKey] = Math.max(0, Math.min(100, out[fbKey] + bonus));
    }
  }

  return out;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Resolve an agent's football ratings for a given role, including a positional
 * versatility penalty when the agent plays off their main/best role.
 *
 * Penalty model:
 *   positionGap = max(0, mainAptitude - assignedAptitude)   [0..1]
 *   versatility = computeVersatility(skillIds)               [0.12..0.85]
 *   offPenalty  = positionGap × (1 - versatility) × PENALTY_SCALE
 *   rating      *= (1 - clamp(offPenalty, 0, PENALTY_CAP))
 *
 * On-main agents suffer no penalty. Off-main agents with many skills adapt;
 * off-main agents with no skills (bots) take the steepest cut.
 *
 * @param {string}   agentName  — e.g. 'SHADDAI', 'ZEROX', 'BOT-ALPHA'
 * @param {string[]} skillIds   — equipped skill ids (may be empty)
 * @param {string}   role       — gridiron role key: QB | RB | WR | OL | DL | LB | CB | FS
 * @returns {{
 *   spine:        Object,   // 14-stat universal spine (0–100 each)
 *   football:     Object,   // 7-stat football ratings after role mods + versatility penalty
 *   role:         string,
 *   profile:      Object,   // normalized affinity trait profile (10 traits, sum~1)
 *   aptitude:     number,   // role-fit aptitude for the assigned role
 *   mainRole:     string,   // agent's best-fit role from their affinity profile
 *   assignedRole: string,   // the role they are actually playing (= role param)
 *   positionGap:  number,   // how far off-main they are (0 = on-main)
 *   versatility:  number,   // skill-driven adaptability [0.12..0.85]
 *   offPenalty:   number,   // actual penalty fraction applied [0..PENALTY_CAP]
 * }}
 */
function playerFootballRatings(agentName, skillIds, role) {
  const safeRole = String(role || 'QB');
  const safeSkills = Array.isArray(skillIds) ? skillIds : [];

  // 1. Affinity profile (10 traits, sum ≈ 1).
  const profile = agentAffinity(safeSkills, agentName);

  // 2. Map profile to 14-stat spine.
  const spinePartial = _profileToSpinePartial(profile);
  const spine = makeStats(spinePartial); // clamps & fills missing with 50

  // 3. Derive football ratings from spine.
  const baseFootball = deriveFootball(spine);

  // 4. Apply role multipliers from affinity engine + role-fit flat bonus.
  const { aptitude, mods } = roleStatMods(profile, 'gridiron', safeRole);
  const roleFitFootball = applyFootballMods(baseFootball, mods, aptitude, safeRole);

  // 5. Versatility penalty (Part 1 of feature).
  //    Determine the agent's MAIN role across the full gridiron pool.
  const pool = rolePool('gridiron');
  const mainRole = bestRole(profile, 'gridiron', pool);
  const mainApt = roleAptitude(profile, 'gridiron', mainRole);
  const assignedApt = roleAptitude(profile, 'gridiron', safeRole);

  // positionGap: 0 when playing on-main; positive when playing a worse-fit role.
  const positionGap = Math.max(0, mainApt - assignedApt);

  // versatility: base 0.12 for zero skills, +0.18 per skill, capped at 0.85.
  const versatility = computeVersatility(safeSkills);

  // offPenalty: scaled by gap and (1 - versatility). Clamped to [0, PENALTY_CAP].
  const rawPenalty = positionGap * (1 - versatility) * PENALTY_SCALE;
  const offPenalty = Math.min(PENALTY_CAP, Math.max(0, rawPenalty));

  // Apply multiplicative penalty to every football rating.
  const football = {};
  const multiplier = 1 - offPenalty;
  for (const [k, v] of Object.entries(roleFitFootball)) {
    football[k] = Math.min(100, Math.max(0, Math.round(v * multiplier)));
  }

  return {
    spine,
    football,
    role: safeRole,
    profile,
    aptitude,
    mainRole,
    assignedRole: safeRole,
    positionGap,
    versatility,
    offPenalty,
  };
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  playerFootballRatings,
  computeVersatility,
  TRAIT_TO_SPINE,
  BAND_MIN,
  BAND_MAX,
  PENALTY_SCALE,
  VERSATILITY_BASE,
  VERSATILITY_PER_SKILL,
  VERSATILITY_MAX,
  PENALTY_CAP,
};
