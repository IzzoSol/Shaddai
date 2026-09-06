'use strict';
// ============================================================================
// arena/rulesets/rps.js - Rock Paper Scissors Ruleset (Tier 0)
// Simultaneous throw; timeout -> random legal throw. Winner per RPS rules.
// ============================================================================

const HANDS = ['rock', 'paper', 'scissors'];

module.exports = {
  id: 'rps',
  simultaneous: true,
  turnMs: 8000,
  start(seed) {
    return { throws: {}, locked: {} };
  },
  view(state) {
    return {
      public: { locked: state.locked },
      private: {}
    };
  },
  legal(state, seat, act) {
    if (!act || act.type !== 'throw') return false;
    const hand = act.payload && act.payload.hand;
    return HANDS.includes(hand);
  },
  apply(state, seat, act) {
    if (act && act.timeout) {
      const randomHand = HANDS[Math.floor(Math.random() * HANDS.length)];
      return { ...state, throws: { ...state.throws, [seat]: randomHand }, locked: { ...state.locked, [seat]: true } };
    }
    const hand = act.payload.hand;
    return { ...state, throws: { ...state.throws, [seat]: hand }, locked: { ...state.locked, [seat]: true } };
  },
  status(state) {
    if (state.locked.A && state.locked.B) {
      const a = state.throws.A;
      const b = state.throws.B;
      if (a === b) return 'draw';
      if (
        (a === 'rock' && b === 'scissors') ||
        (a === 'paper' && b === 'rock') ||
        (a === 'scissors' && b === 'paper')
      ) return 'a_win';
      return 'b_win';
    }
    return 'playing';
  }
};
