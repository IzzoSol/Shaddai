'use strict';
// ============================================================================
// backend/sports/football/playbook.js — 4v4 Arcade Football V1 Playbook
//
// DATA + deterministic selectors only. No I/O, no built-in randomness.
// Any weighted-choice randomness uses the caller-supplied `rand` closure:
//   rand() → float in [0, 1)
//
// routeTree: deterministic sequence of waypoints/breaks for arcade physics.
//   Each step = { dir: 'up'|'left'|'right'|'back'|'slant', ticks: number }
//   The sim advances the receiver along these waypoints in order.
// ============================================================================

// ── OFFENSE PLAYS ─────────────────────────────────────────────────────────────
const OFFENSE_PLAYS = [
  {
    id:     'inside_run',
    name:   'Inside Run',
    type:   'run',
    routes: {
      WR: [{ dir: 'up', ticks: 3 }, { dir: 'right', ticks: 2 }],   // crack-block motion
      RB: [{ dir: 'up', ticks: 2 }],                                // straight ahead
    },
    risk:   0.3,  // 0..1 — higher = more yards possible, more turnover risk
    reward: 0.5,
    desc:   'RB hits the A/B gap behind the OL. Safe, reliable short-yardage play.',
  },
  {
    id:     'outside_run',
    name:   'Outside Run',
    type:   'run',
    routes: {
      WR: [{ dir: 'up', ticks: 2 }, { dir: 'left', ticks: 1 }],    // perimeter seal
      RB: [{ dir: 'right', ticks: 1 }, { dir: 'up', ticks: 3 }],   // sweep to edge
    },
    risk:   0.4,
    reward: 0.65,
    desc:   'RB bounces outside the OL to the perimeter. Hits big if edge is sealed.',
  },
  {
    id:     'short_pass',
    name:   'Short Pass',
    type:   'pass',
    routes: {
      WR: [{ dir: 'up', ticks: 2 }, { dir: 'slant', ticks: 2 }],   // slant in
      RB: [{ dir: 'right', ticks: 1 }, { dir: 'up', ticks: 1 }],   // flat check-down
    },
    risk:   0.25,
    reward: 0.55,
    desc:   'Quick throw to a slant or flat route. High-percentage, yards-after-catch upside.',
  },
  {
    id:     'deep_pass',
    name:   'Deep Pass',
    type:   'pass',
    routes: {
      WR: [{ dir: 'up', ticks: 6 }, { dir: 'right', ticks: 1 }],   // go/post
      RB: [{ dir: 'up', ticks: 2 }, { dir: 'left', ticks: 1 }],    // seam check
    },
    risk:   0.65,
    reward: 0.90,
    desc:   'QB drops and fires downfield. Huge play potential; higher interception risk.',
  },
  {
    id:     'play_action',
    name:   'Play Action',
    type:   'pass',
    routes: {
      WR: [{ dir: 'up', ticks: 4 }, { dir: 'left', ticks: 2 }],    // crossing route
      RB: [{ dir: 'up', ticks: 1 }, { dir: 'back', ticks: 1 }],    // fake hand-off
    },
    risk:   0.45,
    reward: 0.75,
    desc:   'QB fakes a hand-off to freeze linebackers then throws over the top. Works best after inside_run sets it up.',
  },
];

// ── DEFENSE CALLS ─────────────────────────────────────────────────────────────
const DEFENSE_CALLS = [
  {
    id:       'man',
    name:     'Man Coverage',
    coverage: 'man',      // each defender follows their assigned receiver
    pressure: 0.4,        // 0..1 — pass-rush intensity
    weakness: 'speed',    // fast WRs or RB screens can exploit man
    desc:     'Every DB locks onto a receiver. Strong vs routes, vulnerable to speed mismatches.',
  },
  {
    id:       'zone',
    name:     'Zone Coverage',
    coverage: 'zone',     // defenders guard areas, not people
    pressure: 0.3,
    weakness: 'flood',    // flooding a zone with 2 routes overwhelms it
    desc:     'Defenders protect areas. Stops short crossing routes; susceptible to zone floods.',
  },
  {
    id:       'blitz',
    name:     'Blitz',
    coverage: 'man',      // must cover man when sending extra rushers
    pressure: 0.85,
    weakness: 'quick_pass', // hot routes beat it if QB reads fast
    desc:     'Extra rusher sent off the edge. Huge sack pressure; a quick throw burns it badly.',
  },
  {
    id:       'prevent',
    name:     'Prevent',
    coverage: 'zone',
    pressure: 0.1,
    weakness: 'short_pass', // gives up short yards freely
    desc:     'Defense drops deep and protects against big plays. Gives up short gains to stop the score.',
  },
];

// ── PLAY SELECTOR HELPERS ─────────────────────────────────────────────────────

/**
 * pickOffensePlay(ctx, rand) → { play, reason }
 *
 * Deterministic rule-based selector. Uses `rand` only for weighted choice
 * among equally-viable candidates.
 *
 * ctx shape:
 *   down         {number}  1–4
 *   yardsToGo    {number}  yards needed for a first down
 *   scoreDeficit {number}  own score minus opponent score (negative = trailing)
 *   ticksLeft    {number}  ticks remaining in the game (0 = end)
 *   lastPlayId   {string|null}  id of the previous play (for combo logic)
 *
 * @param {{ down:number, yardsToGo:number, scoreDeficit:number, ticksLeft:number, lastPlayId:?string }} ctx
 * @param {()=>number} rand
 * @returns {{ play: object, reason: string }}
 */
function pickOffensePlay(ctx, rand) {
  const { down = 1, yardsToGo = 10, scoreDeficit = 0, ticksLeft = 999, lastPlayId = null } = ctx;

  // Rule 1: Desperation — trailing late, go deep
  if (scoreDeficit <= -7 && ticksLeft < 20) {
    return { play: byId('deep_pass'), reason: 'trailing late: go deep' };
  }

  // Rule 2: 4th down short — sneak/inside run
  if (down === 4 && yardsToGo <= 2) {
    return { play: byId('inside_run'), reason: '4th and short: secure the conversion with inside run' };
  }

  // Rule 3: 4th down and long — must pass
  if (down === 4 && yardsToGo > 2) {
    return { play: byId('deep_pass'), reason: '4th and long: must throw deep' };
  }

  // Rule 4: Short yardage (≤3) — run first
  if (yardsToGo <= 3) {
    return { play: byId('inside_run'), reason: 'short yardage: power run' };
  }

  // Rule 5: Play action setup — if last play was inside_run, sneak in a PA
  if (lastPlayId === 'inside_run' && yardsToGo <= 8) {
    return { play: byId('play_action'), reason: 'play action off prior inside run' };
  }

  // Rule 6: Long yardage (>10) — weighted pass-heavy
  if (yardsToGo > 10) {
    const candidates = [
      { play: byId('short_pass'),  weight: 2 },
      { play: byId('deep_pass'),   weight: 3 },
      { play: byId('play_action'), weight: 1 },
    ];
    return weightedPick(candidates, rand, 'long yardage: pass-heavy selection');
  }

  // Rule 7: Medium yardage — balanced
  const candidates = [
    { play: byId('inside_run'),  weight: 2 },
    { play: byId('outside_run'), weight: 2 },
    { play: byId('short_pass'),  weight: 3 },
    { play: byId('play_action'), weight: 1 },
  ];
  return weightedPick(candidates, rand, 'medium yardage: balanced selection');
}

/**
 * pickDefenseCall(ctx, rand) → { call, reason }
 *
 * Deterministic rule-based selector.
 *
 * ctx shape:
 *   down         {number}  1–4
 *   yardsToGo    {number}
 *   scoreLead    {number}  own score minus opponent (positive = leading)
 *   ticksLeft    {number}
 *   lastPlayType {string|null}  'run'|'pass'|null
 *
 * @param {{ down:number, yardsToGo:number, scoreLead:number, ticksLeft:number, lastPlayType:?string }} ctx
 * @param {()=>number} rand
 * @returns {{ call: object, reason: string }}
 */
function pickDefenseCall(ctx, rand) {
  const { down = 1, yardsToGo = 10, scoreLead = 0, ticksLeft = 999, lastPlayType = null } = ctx;

  // Rule 1: Protect a big lead late — prevent
  if (scoreLead >= 8 && ticksLeft < 20) {
    return { call: byDefId('prevent'), reason: 'protecting a big lead late: prevent' };
  }

  // Rule 2: 4th down — all-out blitz to force incompletion
  if (down === 4) {
    return { call: byDefId('blitz'), reason: '4th down: force a stop with blitz' };
  }

  // Rule 3: They keep running — commit to run-stop zone
  if (lastPlayType === 'run' && yardsToGo <= 5) {
    return { call: byDefId('zone'), reason: 'opponent running: zone to clog running lanes' };
  }

  // Rule 4: Long yardage — blitz or zone
  if (yardsToGo > 10) {
    const candidates = [
      { call: byDefId('blitz'), weight: 3 },
      { call: byDefId('zone'),  weight: 2 },
    ];
    return weightedPickDef(candidates, rand, 'long yardage: pressure or prevent running room');
  }

  // Rule 5: Short yardage — man up
  if (yardsToGo <= 3) {
    return { call: byDefId('man'), reason: 'short yardage: lock down receivers man-to-man' };
  }

  // Rule 6: Default balanced
  const candidates = [
    { call: byDefId('man'),  weight: 3 },
    { call: byDefId('zone'), weight: 3 },
    { call: byDefId('blitz'),weight: 2 },
  ];
  return weightedPickDef(candidates, rand, 'balanced down: mixed coverage selection');
}

// ── INTERNAL UTILITIES ────────────────────────────────────────────────────────

function byId(id) {
  const p = OFFENSE_PLAYS.find(p => p.id === id);
  if (!p) throw new Error(`Unknown offense play: ${id}`);
  return p;
}

function byDefId(id) {
  const c = DEFENSE_CALLS.find(c => c.id === id);
  if (!c) throw new Error(`Unknown defense call: ${id}`);
  return c;
}

/**
 * Weighted random pick from [{play, weight}] candidates.
 * @returns {{ play:object, reason:string }}
 */
function weightedPick(candidates, rand, baseReason) {
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let cursor = rand() * total;
  for (const c of candidates) {
    cursor -= c.weight;
    if (cursor <= 0) return { play: c.play, reason: `${baseReason} → ${c.play.id}` };
  }
  // fallback (floating-point edge)
  const last = candidates[candidates.length - 1];
  return { play: last.play, reason: `${baseReason} → ${last.play.id} (fallback)` };
}

/**
 * Weighted random pick from [{call, weight}] candidates.
 * @returns {{ call:object, reason:string }}
 */
function weightedPickDef(candidates, rand, baseReason) {
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let cursor = rand() * total;
  for (const c of candidates) {
    cursor -= c.weight;
    if (cursor <= 0) return { call: c.call, reason: `${baseReason} → ${c.call.id}` };
  }
  const last = candidates[candidates.length - 1];
  return { call: last.call, reason: `${baseReason} → ${last.call.id} (fallback)` };
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  OFFENSE_PLAYS,
  DEFENSE_CALLS,
  pickOffensePlay,
  pickDefenseCall,
};
