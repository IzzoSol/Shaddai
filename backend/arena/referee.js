'use strict';
// ============================================================================
// arena/referee.js - Exact match loop: seed -> tick -> timeout -> persist.
// Shared for every tier; only the Ruleset changes. Emits via injected emitter.
// ============================================================================
const replays = require('./replays');

function timeoutRace(promise, ms, label) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ status: 'timeout', seat: label }), ms);
    promise.then(
      value => { clearTimeout(timer); resolve({ status: 'ok', seat: label, value }); },
      err => { clearTimeout(timer); resolve({ status: 'error', seat: label, error: err }); }
    );
  });
}

// emit(type, payload) injected (socket bus / matchmaker logger). Safe no-op default.
async function runMatch(match, ruleset, brains, emit) {
  emit = emit || function () {};
  let state = ruleset.start(match.seed);
  const turns = [];
  const publicFrames = [];

  const brainA = (v) => brains.A.act(v, brains.A.profile);
  const brainB = (v) => brains.B.act(v, brains.B.profile);

  let status = ruleset.status(state);

  while (status === 'playing') {
    const turnN = turns.length;
    const startedAt = new Date().toISOString();
    const deadline = new Date(Date.now() + ruleset.turnMs).toISOString();

    emit('match.turn', { n: turnN, deadline, simultaneous: ruleset.simultaneous });

    const base = { matchId: match.id, you: 'A', rulesetId: match.rulesetId, turn: turnN, deadline };
    const viewA = { ...base, you: 'A', ...ruleset.view(state, 'A') };
    const viewB = { ...base, you: 'B', ...ruleset.view(state, 'B') };

    emit('match.state', { turn: turnN, public: ruleset.view(state, 'A').public });

    const acts = {};

    if (ruleset.simultaneous) {
      const [rA, rB] = await Promise.all([
        timeoutRace(Promise.resolve(brainA(viewA)), ruleset.turnMs, 'A'),
        timeoutRace(Promise.resolve(brainB(viewB)), ruleset.turnMs, 'B')
      ]);
      const actA = rA.status === 'ok' && ruleset.legal(state, 'A', rA.value) ? rA.value : { timeout: true };
      const actB = rB.status === 'ok' && ruleset.legal(state, 'B', rB.value) ? rB.value : { timeout: true };
      state = ruleset.apply(state, 'A', actA);
      state = ruleset.apply(state, 'B', actB);
      if (actA) { acts.A = actA; emit('match.act', { seat: 'A', act: actA }); }
      if (actB) { acts.B = actB; emit('match.act', { seat: 'B', act: actB }); }
    } else {
      const activeSeat = state.activeSeat; // turn-based ruleset exposes activeSeat
      const brain = activeSeat === 'A' ? brainA : brainB;
      const view = activeSeat === 'A' ? viewA : viewB;
      const r = await timeoutRace(Promise.resolve(brain(view)), ruleset.turnMs, activeSeat);
      const act = r.status === 'ok' && ruleset.legal(state, activeSeat, r.value) ? r.value : { timeout: true };
      state = ruleset.apply(state, activeSeat, act);
      acts[activeSeat] = act;
      emit('match.act', { seat: activeSeat, act });
    }

    turns.push({ n: turnN, startedAt, deadline, acts });
    publicFrames.push({ public: ruleset.view(state, 'A').public });

    status = ruleset.status(state);
  }

  const winner = status;
  const replay = {
    match,
    bots: {
      A: { id: match.bots.A, name: match.botNames.A, model: match.models.A },
      B: { id: match.bots.B, name: match.botNames.B, model: match.models.B }
    },
    turns,
    publicFrames,
    winner
  };

  replays.writeReplay(replay);
  emit('match.ended', { status: winner, replayId: match.id });
  return replay;
}

module.exports = { runMatch };
