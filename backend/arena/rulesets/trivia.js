'use strict';
// ============================================================================
// arena/rulesets/trivia.js - 5-question trivia (Tier 0, turn-based)
// Alternate seats answering 0-3; timeout = wrong. 5 Qs from bank.json.
// ============================================================================
const path = require('path');
const fs = require('fs');

function loadBank() {
  const bankFile = path.join(__dirname, '..', '..', '..', 'data', 'trivia', 'bank.json');
  try { return JSON.parse(fs.readFileSync(bankFile, 'utf8')); }
  catch (_) {
    // Fallback mini-bank so the ruleset never crashes if file is missing/CI.
    return [
      { q: 'Which is a Solana-native token standard?', choices: ['SPL', 'ERC-20', 'BEP-2', 'ARC-20'], answer: 0 },
      { q: 'What does x402 stand for?', choices: ['402 Payment Required', 'HTTP 200 OK', 'TCP handshake', 'TLS 1.2'], answer: 0 },
      { q: 'Which is the speed unit on Solana?', choices: ['TPS', 'Gwei', 'Block height', 'Satoshi'], answer: 0 },
      { q: 'RPC stands for?', choices: ['Remote Procedure Call', 'Random Packet Clock', 'Root Proxy Cache', 'Rollback Parity Check'], answer: 0 }
    ];
  }
}

module.exports = {
  id: 'trivia-5',
  simultaneous: false,
  turnMs: 12000,
  start(seed) {
    const bank = loadBank();
    const hash = String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const questions = [];
    for (let i = 0; i < 5; i++) {
      const idx = (hash + i) % bank.length;
      questions.push(bank[idx]);
    }
    return { questions, currentQ: 0, scores: { A: 0, B: 0 }, activeSeat: 'A' };
  },
  view(state) {
    const cur = state.questions[state.currentQ];
    return {
      public: {
        question: cur ? cur.q : null,
        choices: cur ? cur.choices : [],
        scores: state.scores,
        activeSeat: state.activeSeat
      },
      private: {}
    };
  },
  legal(state, seat, act) {
    if (seat !== state.activeSeat) return false;
    if (!act || act.type !== 'answer') return false;
    const i = act.payload && act.payload.i;
    return typeof i === 'number' && i >= 0 && i <= 3;
  },
  apply(state, seat, act) {
    const nextSeat = state.activeSeat === 'A' ? 'B' : 'A';
    if (act && act.timeout) {
      return { ...state, currentQ: state.currentQ + 1, activeSeat: nextSeat };
    }
    const i = act.payload.i;
    const correct = i === state.questions[state.currentQ].answer;
    const scores = { ...state.scores };
    if (correct) scores[seat] += 1;
    return { ...state, scores, currentQ: state.currentQ + 1, activeSeat: nextSeat };
  },
  status(state) {
    if (state.currentQ >= 5) {
      if (state.scores.A > state.scores.B) return 'a_win';
      if (state.scores.B > state.scores.A) return 'b_win';
      return 'draw';
    }
    return 'playing';
  }
};
