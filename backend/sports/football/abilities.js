'use strict';
// ============================================================================
// backend/sports/football/abilities.js — 4v4 Arcade Football Ability Set
//
// DATA + deterministic helpers only. No I/O, no built-in randomness.
// Any tie-breaking randomness uses the caller-supplied `rand` closure:
//   rand() → float in [0, 1)
//
// Stat names from deriveFootball() in backend/platform/stat-ontology.js:
//   throwAccuracy, routeRunning, tackle, coverage, block, passRush, catching
//
// categories: read | burst | execution | disruption | composure
// ============================================================================

// ── ABILITY DEFINITIONS ──────────────────────────────────────────────────────
// Each ability:
//   id             — machine key (unique)
//   name           — display name
//   role           — the 4v4 role it belongs to
//   side           — 'off' | 'def'
//   category       — read | burst | execution | disruption | composure
//   cooldownTicks  — minimum ticks between activations
//   triggerWindow  — { minTick, maxTick } within a play where it can fire
//   telegraphTicks — ticks of visible wind-up before effect applies (0 = instant)
//   effect         — deterministic modifier descriptor (pure data, no functions)
//   desc           — human-readable description

const ABILITIES = [
  // ── OFFENSE ──────────────────────────────────────────────────────────────

  {
    id:             'read_the_blitz',
    name:           'Read the Blitz',
    role:           'QB',
    side:           'off',
    category:       'read',
    cooldownTicks:  8,
    triggerWindow:  { minTick: 0, maxTick: 3 },  // fires in the pre-snap/early snap window
    telegraphTicks: 1,
    effect: {
      type:          'statMult',
      stat:          'throwAccuracy',
      mult:          1.25,
      durationTicks: 6,
      also: { stat: 'coverage', mult: 1.10, durationTicks: 6 }, // awareness boost (reads coverage)
    },
    desc: 'QB identifies the blitz pre-snap. Throw accuracy surges for the next 6 ticks; also reads coverage lanes briefly.',
  },

  {
    id:             'burst_route',
    name:           'Burst Route',
    role:           'WR',
    side:           'off',
    category:       'burst',
    cooldownTicks:  10,
    triggerWindow:  { minTick: 1, maxTick: 5 },  // fires mid-route
    telegraphTicks: 1,
    effect: {
      type:          'statMult',
      stat:          'routeRunning',
      mult:          1.30,
      durationTicks: 4,
    },
    desc: 'WR plants and explodes off the break, generating instant separation from the defender.',
  },

  {
    id:             'truck',
    name:           'Truck',
    role:           'RB',
    side:           'off',
    category:       'execution',
    cooldownTicks:  12,
    triggerWindow:  { minTick: 2, maxTick: 8 },  // fires on contact
    telegraphTicks: 0,
    effect: {
      type:          'forceOutcome',
      outcome:       'beat_first_tackle',
      bonusStat:     'tackle',
      bonusMult:     1.20,
      durationTicks: 3,
    },
    desc: 'RB lowers the shoulder and bulldozes through the first attempted tackle.',
  },

  {
    id:             'anchor',
    name:           'Anchor',
    role:           'OL',
    side:           'off',
    category:       'composure',
    cooldownTicks:  10,
    triggerWindow:  { minTick: 0, maxTick: 4 },  // fires at snap or during rush
    telegraphTicks: 1,
    effect: {
      type:          'statMult',
      stat:          'block',
      mult:          1.28,
      durationTicks: 5,
      counter: { stat: 'passRush', reduction: 0.85, durationTicks: 5 }, // lowers opponent passRush
    },
    desc: 'OL sets a deep base and neutralizes the pass rush, holding the pocket for an extra 5 ticks.',
  },

  // ── DEFENSE ──────────────────────────────────────────────────────────────

  {
    id:             'jump_the_route',
    name:           'Jump the Route',
    role:           'CB',
    side:           'def',
    category:       'disruption',
    cooldownTicks:  12,
    triggerWindow:  { minTick: 2, maxTick: 6 },  // fires as ball leaves QB's hand
    telegraphTicks: 0,
    effect: {
      type:          'forceOutcome',
      outcome:       'interception_chance',
      chanceDelta:   0.35,   // additive probability boost for next throw targeting this CB's zone
      durationTicks: 4,
    },
    desc: 'CB reads the QB\'s eyes and breaks on the route early, creating a high interception window on the next throw.',
  },

  {
    id:             'center_field',
    name:           'Center Field',
    role:           'FS',
    side:           'def',
    category:       'read',
    cooldownTicks:  10,
    triggerWindow:  { minTick: 0, maxTick: 3 },
    telegraphTicks: 1,
    effect: {
      type:          'statMult',
      stat:          'coverage',
      mult:          1.30,
      durationTicks: 6,
      zoneBoost:     'deep',  // bonus applies specifically to deep coverage checks
    },
    desc: 'FS locks into deep coverage, reading route combinations and erasing throws behind the linebackers.',
  },

  {
    id:             'bull_rush',
    name:           'Bull Rush',
    role:           'DL',
    side:           'def',
    category:       'burst',
    cooldownTicks:  10,
    triggerWindow:  { minTick: 0, maxTick: 4 },
    telegraphTicks: 1,
    effect: {
      type:          'statMult',
      stat:          'passRush',
      mult:          1.35,
      durationTicks: 4,
    },
    desc: 'DL fires off the line with explosive power, collapsing the pocket in 4 ticks if the OL cannot anchor.',
  },

  {
    id:             'fill_the_gap',
    name:           'Fill the Gap',
    role:           'LB',
    side:           'def',
    category:       'execution',
    cooldownTicks:  8,
    triggerWindow:  { minTick: 1, maxTick: 6 },
    telegraphTicks: 0,
    effect: {
      type:          'statMult',
      stat:          'tackle',
      mult:          1.25,
      durationTicks: 4,
      counter: { stat: 'routeRunning', reduction: 0.90, durationTicks: 4 }, // disrupts short crossers
    },
    desc: 'LB diagnoses the run and shoots the gap, stuffing the carrier before the line of scrimmage.',
  },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * All abilities belonging to a specific role.
 * @param {string} role
 * @returns {Array}
 */
function abilitiesForRole(role) {
  return ABILITIES.filter(a => a.role === role);
}

/**
 * shouldActivate(ability, ctx, rand) → { activate: boolean, reason: string }
 *
 * Deterministic rule-based heuristic. `rand` is used ONLY for tie-breaking
 * (never called if the decision is clear-cut). Returns an inspectable reason.
 *
 * ctx shape:
 *   currentTick      {number}  — tick within the current play
 *   lastActivated    {number}  — tick when this ability last fired (-Infinity if never)
 *   contextScore     {number}  — 0..1 situational relevance score from the sim
 *   scoreThreshold   {number}  — threshold above which we strongly want to fire (default 0.5)
 *
 * Rules (checked in order; first matching rule wins):
 *   1. Off cooldown?        No  → don't activate.
 *   2. In trigger window?   No  → don't activate.
 *   3. contextScore >= 0.70 → activate (strong signal, no rand needed).
 *   4. contextScore <= 0.25 → don't activate (weak signal, save for later).
 *   5. contextScore in (0.25, 0.70) → use rand against scoreThreshold for tie-break.
 *
 * @param {{ id:string, cooldownTicks:number, triggerWindow:{minTick:number,maxTick:number} }} ability
 * @param {{ currentTick:number, lastActivated:number, contextScore:number, scoreThreshold?:number }} ctx
 * @param {()=>number} rand  — caller-supplied random source
 * @returns {{ activate: boolean, reason: string }}
 */
function shouldActivate(ability, ctx, rand) {
  const { currentTick, lastActivated, contextScore } = ctx;
  const scoreThreshold = typeof ctx.scoreThreshold === 'number' ? ctx.scoreThreshold : 0.5;

  // Rule 1: cooldown
  const ticksSinceLast = currentTick - (typeof lastActivated === 'number' ? lastActivated : -Infinity);
  if (ticksSinceLast < ability.cooldownTicks) {
    return { activate: false, reason: `cooldown (${Math.ceil(ability.cooldownTicks - ticksSinceLast)} ticks remaining)` };
  }

  // Rule 2: trigger window
  const { minTick, maxTick } = ability.triggerWindow;
  if (currentTick < minTick || currentTick > maxTick) {
    return { activate: false, reason: `outside trigger window [${minTick},${maxTick}] at tick ${currentTick}` };
  }

  // Rule 3: strong signal — always fire
  if (contextScore >= 0.70) {
    return { activate: true, reason: `strong context score ${contextScore.toFixed(2)} >= 0.70` };
  }

  // Rule 4: weak signal — hold back
  if (contextScore <= 0.25) {
    return { activate: false, reason: `weak context score ${contextScore.toFixed(2)} <= 0.25` };
  }

  // Rule 5: tie-break via rand (mid-range signal)
  const roll = rand();
  const activate = roll < (contextScore / scoreThreshold);
  return {
    activate,
    reason: `mid-range score ${contextScore.toFixed(2)}, rand=${roll.toFixed(3)}, threshold ratio=${(contextScore / scoreThreshold).toFixed(3)} → ${activate ? 'fire' : 'hold'}`,
  };
}

/**
 * applyEffect(effect, target) → new target object with effect applied.
 * PURE: never mutates the input. Returns a shallow-cloned target with
 * the effect's stat modifications merged in.
 *
 * Supports effect types:
 *   'statMult'     — multiplies target[stat] by effect.mult; applies .also if present
 *   'forceOutcome' — adds an outcomeFlags key and optionally a bonusStat mult
 *
 * @param {object} effect
 * @param {object} target  — stat-like object (e.g. { throwAccuracy:70, ... })
 * @returns {object}
 */
function applyEffect(effect, target) {
  // Always clone — never mutate
  const out = Object.assign({}, target);

  if (effect.type === 'statMult') {
    if (typeof out[effect.stat] === 'number') {
      out[effect.stat] = +(out[effect.stat] * effect.mult).toFixed(4);
    }
    // secondary stat boost (e.g. read_the_blitz → also boosts coverage)
    if (effect.also && typeof out[effect.also.stat] === 'number') {
      out[effect.also.stat] = +(out[effect.also.stat] * effect.also.mult).toFixed(4);
    }
    // counter modifier (debuff on opponent stat representation)
    if (effect.counter) {
      const cKey = `_counter_${effect.counter.stat}`;
      out[cKey] = +(effect.counter.reduction);
    }
  } else if (effect.type === 'forceOutcome') {
    out._forceOutcome = effect.outcome;
    if (effect.chanceDelta !== undefined) {
      out._interceptionDelta = effect.chanceDelta;
    }
    if (effect.bonusStat && typeof out[effect.bonusStat] === 'number') {
      out[effect.bonusStat] = +(out[effect.bonusStat] * effect.bonusMult).toFixed(4);
    }
    if (effect.counter) {
      const cKey = `_counter_${effect.counter.stat}`;
      out[cKey] = +(effect.counter.reduction);
    }
  }

  return out;
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  ABILITIES,
  abilitiesForRole,
  shouldActivate,
  applyEffect,
};
