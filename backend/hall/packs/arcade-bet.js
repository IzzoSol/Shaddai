'use strict';
/**
 * backend/hall/packs/arcade-bet.js — "watch and bet" pack factory for the
 * Agent Arcade titles (Shaddai-Arcade issue #10, twice re-scoped).
 *
 * HISTORY, read before touching this again: issue #10 originally assumed
 * the 4 shaddai-games titles were turn-based and could wrap into the Hall
 * like blackjack -- they aren't (real-time WASD/physics games, no
 * server-side turn structure). First re-scope (docs/HALL-SKILLPLAY-BET-
 * PACKS.md, written before the Shaddai-Arcade -> Shaddai merge) wrapped
 * them as bet packs scored via a cross-service HTTP call to the separate
 * shaddai-games repo's SKILLPLAY ability-matching engine.
 *
 * SECOND re-scope, this file: once Royale/Hall merged into this repo
 * (2026-09-14), it turned out THIS repo already has its own, simpler,
 * already-in-production headless simulator for these exact titles --
 * backend/lib/arcade-sim.js, used by backend/arcade-routes.js's existing
 * /api/arcade endpoints. It's in-process (no HTTP, no SHADDAI_GAMES_URL
 * env var needed at all) and models a picked agent against a house CPU,
 * which maps onto "watch and bet" even more naturally than the old
 * two-contender design: the bettor picks ONE agent to back against the
 * house, exactly like every other table in the Hall is already solo-vs-
 * house. arcade-sim.js's own GAMES list also settles the "sigil-storm"
 * naming question from the original issue text: it's real, it's just in
 * THIS repo (public/games/sigil-storm.html), not the separate
 * shaddai-games repo (which uses different names -- Gridiron/Neon Hoops/
 * Starfall -- for a different, real-time set of titles).
 *
 * Because arcade-sim.play() is synchronous and local, resolve() can call it
 * directly AFTER the bettor's pick, instead of the old design's need to
 * pre-decide the outcome at startMatch time and hide it from the public
 * room listing until settlement. Simpler and removes an entire class of
 * "don't leak the answer early" bugs that design had to guard against.
 */

const arcadeSim = require('../../lib/arcade-sim');

/**
 * makeArcadeBetPack(key, { game, label, agents })
 *   key: unique pack id (e.g. 'basketball_bet').
 *   game: an backend/lib/arcade-sim.js GAMES id ('basketball'|'football'|
 *     'dodgeball'|'sigil-storm').
 *   label: human-readable title for button copy.
 *   agents: 2-3 council agent ids the bettor can pick from (becomes
 *     getButtons(); ENGINE-VISION.md's own "always <=3" rule caps this).
 */
function makeArcadeBetPack(key, { game, label, agents }) {
  if (!arcadeSim.GAMES.includes(game)) {
    throw new Error(`${key}: '${game}' is not a real arcade-sim game (valid: ${arcadeSim.GAMES.join(', ')})`);
  }
  if (!Array.isArray(agents) || agents.length < 2 || agents.length > 3) {
    throw new Error(`${key}: agents must list 2-3 council agent ids`);
  }

  function startMatch(seats, wager) {
    if (!Array.isArray(seats) || seats.length < 1) {
      throw new Error(`${key}: startMatch requires at least one seat`);
    }
    return {
      pack: key, seats: [seats[0], null], wager: Number(wager) || 0,
      turnSeat: seats[0], game, label, agents,
      phase: 'pick', // pick -> resolving -> settled
      pick: null, result: null, simSummary: null, simScore: null,
    };
  }

  function getButtons(state) {
    if (!state || state.phase !== 'pick') return [];
    return state.agents.map((a) => ({ id: a, label: `${a} — ${state.label}` }));
  }

  function applyMove(state, seatId, moveId) {
    if (state.phase !== 'pick') throw new Error(`${key}: no move accepted outside pick phase`);
    if (seatId !== state.turnSeat) throw new Error(`${key}: not this seat's turn`);
    if (!state.agents.includes(moveId)) {
      throw new Error(`${key}: illegal move '${moveId}' (legal: ${state.agents.join(', ')})`);
    }
    return { ...state, pick: moveId, phase: 'resolving' };
  }

  function resolve(state) {
    if (state.phase === 'pick') return { score: null, nextState: state, events: [] };
    if (state.phase === 'settled') return { score: state.result, nextState: state, events: [] };

    const sim = arcadeSim.play(state.game, state.pick); // synchronous, in-process, no leak window
    const result = sim.win ? 'win' : 'lose';
    const next = { ...state, phase: 'settled', result, simSummary: sim.summary, simScore: sim.score };
    const events = [result === 'win' ? `${key}_win` : `${key}_lose`]; // filmable -- Lens can clip the reveal
    return { score: result, nextState: next, events };
  }

  function summary(state) {
    const s = { phase: state.phase, game: state.game, label: state.label, agents: state.agents, pick: state.pick };
    if (state.phase === 'settled') {
      s.result = state.result;
      s.simSummary = state.simSummary;
      s.simScore = state.simScore;
    }
    return s;
  }

  return { key, game, label, startMatch, getButtons, applyMove, resolve, summary };
}

module.exports = { makeArcadeBetPack };
