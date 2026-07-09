'use strict';
// ============================================================================
// backend/sports/football/abilities-kit.js
//
// Shared ability model that derives a football agent's ABILITIES from their
// REAL skills (via affinity.js) and provides council presets.
//
// Pure + deterministic: no I/O, no randomness, ZERO dependencies beyond the
// existing affinity engine.
// ============================================================================

const { agentAffinity, bestRole } = require('../../platform/affinity');

// ── ABILITY VOCABULARY ───────────────────────────────────────────────────────
// 10 football abilities: 6 offense, 4 defense.
// Each has { id, name, side, desc, effect } where `effect` is a short keyword
// the sim (or future expansions) can read to apply the bonus.
const ABILITIES = [
  // ── OFFENSE ──────────────────────────────────────────────────────────────
  {
    id:     'cannon_arm',
    name:   'Cannon Arm',
    side:   'off',
    desc:   'Fires the ball with elite zip and pinpoint accuracy. +QB throw accuracy on deep and mid routes.',
    effect: 'throwAccuracy+',
  },
  {
    id:     'field_general',
    name:   'Field General',
    side:   'off',
    desc:   'Reads the defense pre-snap and post-snap, makes correct decisions under pressure. +IQ/reads.',
    effect: 'decision+',
  },
  {
    id:     'sticky_hands',
    name:   'Sticky Hands',
    side:   'off',
    desc:   'Catches everything in radius, including contested and off-target throws. +catch rate.',
    effect: 'catching+',
  },
  {
    id:     'ankle_breaker',
    name:   'Ankle Breaker',
    side:   'off',
    desc:   'Lethal juke step leaves defenders on the ground. +route running and open-field evasion.',
    effect: 'routeRunning+',
  },
  {
    id:     'truck_stick',
    name:   'Truck Stick',
    side:   'off',
    desc:   'RB steamrolls the first attempted tackle, converting short gains into positive yards. +run power.',
    effect: 'runPower+',
  },
  {
    id:     'burner',
    name:   'Burner',
    side:   'off',
    desc:   'Pure top-end speed that stresses every defense. Wins deep routes and separation in the open field.',
    effect: 'speed+',
  },

  // ── DEFENSE ──────────────────────────────────────────────────────────────
  {
    id:     'lockdown',
    name:   'Lockdown',
    side:   'def',
    desc:   'Blanket man-coverage; eliminates the assigned receiver from the play. +coverage.',
    effect: 'coverage+',
  },
  {
    id:     'big_hit',
    name:   'Big Hit',
    side:   'def',
    desc:   'Delivers a thunderous tackle that jars the ball loose and demoralizes ball-carriers. +tackle.',
    effect: 'tackle+',
  },
  {
    id:     'ball_hawk',
    name:   'Ball Hawk',
    side:   'def',
    desc:   'Elite interception instincts — reads the QB\'s eyes and breaks on the ball before release. +INT.',
    effect: 'interception+',
  },
  {
    id:     'pass_rush',
    name:   'Pass Rush',
    side:   'def',
    desc:   'Relentless pressure off the edge collapses the pocket and forces errant throws. +passRush.',
    effect: 'passRush+',
  },
];

// Quick lookup: id → ability object
const ABILITY_MAP = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

// ── COUNCIL PRESETS ──────────────────────────────────────────────────────────
// Hard-coded ability presets for the 7 council agents — reflects their domain
// flavor (strategist / architect / wealth / research / creative / writing / security).
const COUNCIL_ABILITIES = {
  SHADDAI: ['field_general', 'cannon_arm'],
  NEXUS:   ['cannon_arm',    'field_general'],
  ORACLE:  ['field_general', 'ball_hawk'],
  ZEROX:   ['truck_stick',   'big_hit'],
  TURTLE:  ['ankle_breaker', 'sticky_hands'],
  QUILL:   ['sticky_hands',  'cannon_arm'],
  PIKADON: ['lockdown',      'big_hit',       'ball_hawk'],
};

// ── TRAIT → ABILITY MAPPING ──────────────────────────────────────────────────
// Maps the 10 affinity traits onto football abilities.
// Multiple abilities per trait: the first is the primary candidate.
// `endurance` intentionally empty — it feeds stamina/blocking but not a
// distinct football ability in this 10-ability vocab.
const TRAIT_TO_ABILITY = {
  analysis:   ['field_general', 'ball_hawk'],
  precision:  ['cannon_arm',    'sticky_hands'],
  speed:      ['burner',        'ankle_breaker'],
  power:      ['truck_stick',   'big_hit'],
  defense:    ['lockdown',      'big_hit'],
  reaction:   ['ball_hawk',     'lockdown'],
  control:    ['sticky_hands',  'ankle_breaker'],
  aggression: ['pass_rush',     'truck_stick'],
  support:    ['field_general'],
  endurance:  [],
};

// ── abilitiesForCouncil(agentName) ───────────────────────────────────────────
// Returns the full ability objects for a council agent's preset list.
// Falls back to [] for unknown names.
function abilitiesForCouncil(agentName) {
  const key = String(agentName || '').toUpperCase().trim();
  const ids = COUNCIL_ABILITIES[key] || [];
  return ids.map(id => ABILITY_MAP[id]).filter(Boolean);
}

// ── abilitiesForSkills(skillIds, agentName) ──────────────────────────────────
// Derive football abilities for a forged operative from their equipped skills.
// Steps:
//   1. Run agentAffinity() to get a normalized 10-trait profile.
//   2. Sort traits by weight desc.
//   3. Walk top traits → TRAIT_TO_ABILITY → collect ability ids in order.
//   4. Dedup, cap at 3, return full ability objects.
//
// agentName is optional but improves accuracy for council agents; pass the
// codename or archetype string for forged operatives.
function abilitiesForSkills(skillIds, agentName) {
  const skills = Array.isArray(skillIds) ? skillIds : (skillIds ? [skillIds] : []);
  const profile = agentAffinity(skills, agentName || '');

  // Sort traits by their normalized weight, highest first.
  const sortedTraits = Object.entries(profile)
    .sort(([, a], [, b]) => b - a)
    .map(([trait]) => trait);

  // Collect ability ids in trait-weight order, deduping.
  const seen = new Set();
  const collected = [];
  for (const trait of sortedTraits) {
    const candidates = TRAIT_TO_ABILITY[trait] || [];
    for (const id of candidates) {
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(id);
      }
      if (collected.length >= 3) break;
    }
    if (collected.length >= 3) break;
  }

  return collected.map(id => ABILITY_MAP[id]).filter(Boolean);
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  ABILITIES,
  ABILITY_MAP,
  COUNCIL_ABILITIES,
  TRAIT_TO_ABILITY,
  abilitiesForCouncil,
  abilitiesForSkills,
};
