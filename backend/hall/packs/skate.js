'use strict';
/**
 * backend/hall/packs/skate.js — SKATE, rebuilt as a REAL game (not a simulator).
 *
 * Ported from the Shaddai-Arcade repo (`Shaddai-Royale/hall/packs/skate.js`,
 * same tested logic, 8/8 tests) into the main repo's merged Hall per the
 * SKATE Master Plan's ground-truth table — this is now the source of truth;
 * keep both in sync manually until Shaddai-Royale's Hall is retired in favor
 * of this one, or update Shaddai-Royale to require this file instead.
 *
 * Owner rejected the first version ("no visuals, a simulator, not a game").
 * The mechanic is now hidden-and-simultaneous, explicitly likened to rock-
 * paper-scissors: both seats pick a trick STYLE blind, then reveal together;
 * styles counter each other and the loser of the style-clash bails and takes
 * a letter. No hidden per-trick dice rolls anywhere — the only unpredictability
 * is what the other player picks.
 *
 * Keep the ENGINE-VISION.md pack contract (this file is a drop-in for the
 * hall/routes.js resolve loop):
 *   startMatch(seats, wager)      -> initial state
 *   getButtons(state) -> legal[]  -> 3 style buttons while a round is open
 *   applyMove(state, seatId, moveId) -> records one seat's blind pick
 *   resolve(state)                -> { score, nextState, events[] }
 *
 * Action shape: fixed. Every EXCHANGE emits one filmable event PER ATTEMPT
 * ('land'/'bail'), so a single round films two real clips (one per rider);
 * a full match is ~9 rounds -> ~18 clips, matching the owner's "every attempt"
 * video cadence decision (SHADDAI_ARCADE_SKATE_REAL_VISION_20260918.md).
 *
 * Styles & counters (RPS cycle, closed and balanced):
 *   flip  crushes  air       — you flip into the trick while they're in the air
 *   air   crushes  grind     — you ollie/wallride right over their grind line
 *   grind crushes  flip      — you carve the rail while they're flipping in
 *   same style               — both land the identical trick: no letter, no bail
 *
 * Letters: LOSER of a decisive clash takes the next letter of S-K-A-T-E.
 * First to spell all five loses. Deterministic — no Math.random in this pack.
 */

const LETTERS = ['S', 'K', 'A', 'T', 'E'];
const STYLES = ['flip', 'air', 'grind'];
const STYLE_LABELS = { flip: 'Flip', air: 'Air', grind: 'Grind' };

// crushes[style] = the style it beats. flips the RPS loop so each style
// beats exactly one other and is beaten by exactly one other.
const CRUSHES = { flip: 'air', air: 'grind', grind: 'flip' };

// 9 rounds, not 5: each decisive round awards exactly one letter to someone,
// so 9 rounds keep the "spell all five" win condition reachable (max 9
// letters per rider) while bounding the match for the Hall's per-turn
// timeout mailbox — same arithmetic rationale the old 9-spot version used.
const ROUND_TRICKS = [
  { label: 'The Ledge', tricks: ['Kickflip', 'Wallride', 'Boardslide'] },
  { label: 'The Big Stairs', tricks: ['Heelflip', 'Ollie', '5-0 Grind'] },
  { label: 'The Handrail', tricks: ['360 Flip', 'Air', 'Nosegrind'] },
  { label: 'The Manual Pad', tricks: ['Shove-it', 'Manual', 'Feeble Grind'] },
  { label: 'The Bank to Wall', tricks: ['Kickflip', 'Wallride', 'Nosegrind'] },
  { label: 'The Gap', tricks: ['360 Flip', 'Ollie', 'Boardslide'] },
  { label: 'The Curb Cut', tricks: ['Heelflip', 'Air', '5-0 Grind'] },
  { label: 'The Quarterpipe', tricks: ['Shove-it', 'Wallride', 'Feeble Grind'] },
  { label: 'The Flatbar', tricks: ['Kickflip', 'Ollie', '50-50'] },
];

/**
 * startMatch(seats, wager) -> state
 *   seats: [seatIdA, seatIdB] -- exactly 2, no solo/crowd mode.
 *   wager: integer Sparks buy-in per seat (ledger handled by the Hall).
 */
function startMatch(seats, wager) {
  if (!Array.isArray(seats) || seats.length < 2 || !seats[0] || !seats[1]) {
    throw new Error('skate: startMatch requires exactly two seats');
  }
  return {
    pack: 'skate',
    seats: [seats[0], seats[1]],
    wager: Number(wager) || 0,
    round: 0,
    letters: { [seats[0]]: [], [seats[1]]: [] },
    phase: 'picking',          // picking -> resolved -> (picking | settled)
    picks: {},                 // { [seatId]: { style, trick } } -- both sides blind until resolve
    result: null,              // 'win' | 'lose' | 'push', from seats[0]'s perspective
    log: [],                   // [{round, seatA, seatB, winner, loser, trick, landed}] -- spectator feed
    pendingEvent: null,        // events queued by the last applyMove pair -- consumed once by resolve(),
                               // so repeat resolve() calls are idempotent (blackjack.js contract).
  };
}

/** offerFor(state) -> style buttons for the current round (same for both seats). */
function offerFor(state) {
  return STYLES.map((style, i) => ({
    id: 'style_' + style,
    label: STYLE_LABELS[style],
    style,
    trick: ROUND_TRICKS[state.round].tricks[i],
  }));
}

/**
 * getButtons(state) -> legal[]
 * ALWAYS exactly 3 while a round is open (both seats pick from the same 3
 * styles, blind). A seat that has already locked a pick gets [] here — the
 * engine simply stops asking them; "or fewer if rules force it" per
 * ENGINE-VISION.md. Settled states offer nothing.
 */
function getButtons(state) {
  if (!state || state.phase !== 'picking') return [];
  const offer = offerFor(state);
  return offer.map((o) => ({ id: o.id, label: o.label }));
}

function otherSeat(state, seatId) {
  return state.seats[0] === seatId ? state.seats[1] : state.seats[0];
}

function styleWinner(styleA, styleB) {
  if (styleA === styleB) return null;               // same style -> both land, no letter
  return CRUSHES[styleA] === styleB ? styleA : styleB;
}

/**
 * applyMove(state, seatId, moveId) -> new state
 * Records ONE seat's hidden pick. Moves are validated against the style
 * offer; a seat cannot pick twice and cannot pick after the round resolved.
 * When the second seat submits, phase -> 'resolved' and the next resolve()
 * compares the two blind picks.
 */
function applyMove(state, seatId, moveId) {
  if (!state || state.phase === 'settled') throw new Error('skate: match already settled');
  if (state.phase !== 'picking') throw new Error(`skate: no move accepted in phase ${state.phase}`);
  if (!state.seats.includes(seatId)) throw new Error(`skate: seat ${seatId} is not at this table`);
  if (state.picks[seatId]) throw new Error(`skate: seat ${seatId} has already picked this round`);

  const offer = offerFor(state);
  const chosen = offer.find((o) => o.id === moveId);
  if (!chosen) {
    throw new Error(`skate: illegal move '${moveId}' (legal: ${offer.map((o) => o.id).join(', ')})`);
  }

  const next = {
    ...state,
    letters: {
      [state.seats[0]]: state.letters[state.seats[0]].slice(),
      [state.seats[1]]: state.letters[state.seats[1]].slice(),
    },
    picks: { ...state.picks, [seatId]: { style: chosen.style, trick: chosen.trick } },
    log: state.log.slice(),
  };

  const [a, b] = next.seats;
  if (next.picks[a] && next.picks[b]) {
    return { ...next, phase: 'resolved' };
  }
  return next;
}

/**
 * resolve(state) -> { score, nextState, events[] }
 * Compares the two blind picks:
 *   - same style      -> both land (events ['land','land']), no letter, next round
 *   - decisive clash  -> winner lands, loser bails and takes the next letter
 *                        (events ordered by seats: [winnerOrLoserSeat0, ...])
 * Emits exactly one event PER ATTEMPT so LENS films a real clip for every
 * rider (the owner's "every attempt" cadence). Consumes pendingEvent on the
 * returned nextState -> repeat resolve() calls report no events (idempotent,
 * same tested property as blackjack.js).
 */
function resolve(state) {
  // Build a defensive copy of anything we mutate (letters, log, picks).
  const base = {
    ...state,
    letters: {
      [state.seats[0]]: state.letters[state.seats[0]].slice(),
      [state.seats[1]]: state.letters[state.seats[1]].slice(),
    },
    picks: { ...state.picks },
    log: state.log.slice(),
  };

  if (state.phase !== 'resolved') {
    const events = state.pendingEvent ? state.pendingEvent.slice() : [];
    return { score: base.phase === 'settled' ? base.result : null, nextState: base, events };
  }

  const [a, b] = state.seats;
  const pickA = state.picks[a], pickB = state.picks[b];
  const consumedEvents = (state.pendingEvent || []).slice();

  let roundEvents;
  let winner = null;
  let loser = null;

  // Track both the decision AND the filmable event per rider.

  if (pickA.style === pickB.style) {
    // Identical blind picks -> both ride the same line, both land. No letter.
    roundEvents = ['land', 'land'];
  } else {
    const winnerStyle = styleWinner(pickA.style, pickB.style);
    // Map winning STYLE back to the seat that elected it.
    winner = state.picks[a].style === winnerStyle ? a : b;
    loser = otherSeat(state, winner);
    const winnerPicksWinner = winner === a;
    roundEvents = winnerPicksWinner ? ['land', 'bail'] : ['bail', 'land'];
    // Loser bails -> takes the next letter.
    base.letters[loser] = base.letters[loser].concat([LETTERS[base.letters[loser].length]]);
  }

  base.log.push({
    round: state.round, seatA: a, seatB: b,
    trickA: pickA.trick, trickB: pickB.trick,
    winner, loser, landed: winner === a,
  });

  // Next round, or settle.
  const aCount = base.letters[a].length, bCount = base.letters[b].length;
  if (aCount >= LETTERS.length || bCount >= LETTERS.length) {
    base.phase = 'settled';
    base.result = bCount >= LETTERS.length ? 'win' : 'lose';
  } else if (state.round + 1 >= ROUND_TRICKS.length) {
    base.phase = 'settled';
    base.result = aCount === bCount ? 'push' : (aCount < bCount ? 'win' : 'lose');
  } else {
    base.round = state.round + 1;
    base.picks = {};
    base.phase = 'picking';
  }

  return {
    score: base.phase === 'settled' ? base.result : null,
    nextState: base,
    events: consumedEvents.concat(roundEvents),
  };
}

/** summary(state) -> spectator-safe view: round, letters, whose picks are in. */
function summary(state) {
  const [a, b] = state.seats;
  return {
    phase: state.phase,
    round: state.round,
    spot: ROUND_TRICKS[state.round] ? ROUND_TRICKS[state.round].label : null,
    letters: state.letters,
    seatsLocked: { [a]: !!state.picks[a], [b]: !!state.picks[b] },
    result: state.result,
    lastExchange: state.log.length ? state.log[state.log.length - 1] : null,
  };
}

module.exports = {
  // exported for tests / reuse; not part of the public pack contract itself
  LETTERS, STYLES, STYLE_LABELS, CRUSHES, ROUND_TRICKS, styleWinner,
  // the pack contract
  startMatch, getButtons, applyMove, resolve, summary,
};