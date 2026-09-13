'use strict';
/**
 * backend/lib/lens-rewriter.js — LENS's locked-contract rewriter
 * (Shaddai-Arcade issue #5, docs/HALL-PHASE1-SPEC.md's "LENS (Fal)" section).
 *
 * Compresses a resolved filmable table event (bust/win/blackjack) into the
 * locked contract {SCENE_LOCK, CAST_LOCK, EVENT, LAW, DURATION} before it
 * ever reaches a Fal prompt. This is enforced structurally, not by a filter:
 * buildLensContract()'s input has no field for freeform/chat text at all --
 * there is nothing here a caller could smuggle raw chat into even by
 * accident. CAST_LOCK is picked deterministically from the seat id (never
 * from caller-supplied text), so a request can never name anyone outside
 * the fixed original-cast roster.
 */

// Original-cast-only roster. Hard-coded per the spec: "no real celebrity
// names or likenesses, ever (this was tested and refused earlier in this
// session for a separate request; the rule is absolute, not a suggestion)."
const CAST_LOCK = Object.freeze(['Nova', 'Patch', 'Volt', 'Sol', 'Player (red beanie)', 'Gunner']);

const LAW = 'Original cast only. No real celebrity names or likenesses, ever.';

// Filmable events per blackjack.js's resolve() (docs/ENGINE-VISION.md's own
// roster: "card snap, chip push, bust"). 'lose'/'push' are not filmable --
// resolve() itself never emits an event for them, so there's nothing to
// compress; buildLensContract() rejects any eventType not listed here.
const EVENT_SCENES = Object.freeze({
  bust: 'A blackjack table under low casino light. The seated character looks at a busted hand as the total passes 21 and the dealer sweeps the bet.',
  win: 'A blackjack table under low casino light. The seated character reacts as chips are pushed toward them after a winning hand.',
  blackjack: 'A blackjack table under low casino light. The seated character reveals a natural blackjack as the dealer turns over the hole card.',
});

const DEFAULT_DURATION_SEC = 5;
const MAX_DURATION_SEC = 10;

/** Deterministic seat->cast mapping. Never influenced by free text. */
function pickCast(seatId) {
  const s = String(seatId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAST_LOCK[h % CAST_LOCK.length];
}

/**
 * buildLensContract({ matchId, pack, eventType, seatId, durationSec })
 *   -> { SCENE_LOCK, CAST_LOCK, EVENT, LAW, DURATION, matchId, pack, prompt }
 * Throws on an eventType outside EVENT_SCENES -- callers (lens-routes.js)
 * turn that into a clean 400, never a silent fallback to some other scene.
 */
function buildLensContract(opts) {
  const { matchId, pack, eventType, seatId, durationSec } = opts || {};
  const scene = EVENT_SCENES[eventType];
  if (!scene) {
    throw new Error(`lens-rewriter: unfilmable event type '${eventType}' (expected one of: ${Object.keys(EVENT_SCENES).join(', ')})`);
  }
  const cast = pickCast(seatId);
  const duration = Number(durationSec) > 0 ? Math.min(Number(durationSec), MAX_DURATION_SEC) : DEFAULT_DURATION_SEC;
  const contract = {
    SCENE_LOCK: scene,
    CAST_LOCK: cast,
    EVENT: eventType,
    LAW,
    DURATION: duration,
  };
  const prompt = `${contract.SCENE_LOCK} Character: ${contract.CAST_LOCK}. ${contract.LAW} Duration: ${contract.DURATION} seconds.`;
  return { ...contract, matchId: matchId || null, pack: pack || null, prompt };
}

module.exports = { buildLensContract, CAST_LOCK, LAW, EVENT_SCENES };
