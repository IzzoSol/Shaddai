'use strict';
// ============================================================================
// arena/rulesets/hi-lo.js - Guess a secret 1-100 (Tier 0)
// Simultaneous closest-to-secret guess. Secret is PRIVATE (fog). Timeout skips.
// ============================================================================

module.exports = {
  id: 'hi-lo',
  simultaneous: true,
  turnMs: 8000,
  start(seed) {
    const hash = String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const secret = (hash % 100) + 1;
    return { secret, guesses: {}, locked: {} };
  },
  view(state, seat) {
    return {
      public: { locked: state.locked, guesses: state.guesses },
      private: { secret: state.secret } // fog: only the viewing seat sees secret
    };
  },
  legal(state, seat, act) {
    if (!act || act.type !== 'guess') return false;
    const n = act.payload && act.payload.n;
    return typeof n === 'number' && n >= 1 && n <= 100;
  },
  apply(state, seat, act) {
    if (act && act.timeout) {
      return { ...state, locked: { ...state.locked, [seat]: true } };
    }
    const n = act.payload.n;
    return { ...state, guesses: { ...state.guesses, [seat]: n }, locked: { ...state.locked, [seat]: true } };
  },
  status(state) {
    if (state.locked.A && state.locked.B) {
      if (state.guesses.A === undefined && state.guesses.B === undefined) return 'draw';
      if (state.guesses.A === undefined) return 'b_win';
      if (state.guesses.B === undefined) return 'a_win';
      const diffA = Math.abs(state.guesses.A - state.secret);
      const diffB = Math.abs(state.guesses.B - state.secret);
      if (diffA === diffB) return 'draw';
      return diffA < diffB ? 'a_win' : 'b_win';
    }
    return 'playing';
  }
};
