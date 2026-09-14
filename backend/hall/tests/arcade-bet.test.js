'use strict';
/**
 * Self-running test for backend/hall/packs/arcade-bet.js (Shaddai-Arcade
 * issue #10, second re-scope: bet packs now call ../lib/arcade-sim.js
 * in-process instead of an external HTTP service). arcade-sim.play() is
 * genuinely randomized (skill-weighted, not deterministic -- see its own
 * `bell()` helper), so this file tests the STATE MACHINE mechanics
 * (legality, phase transitions, leak-safety), not a specific win/lose
 * outcome -- asserting a fixed outcome here would be testing arcade-sim's
 * RNG, not this pack's contract.
 * Run: node backend/hall/tests/arcade-bet.test.js
 */
const assert = require('assert');
const { makeArcadeBetPack } = require('../packs/arcade-bet');

function run() {
  const pack = makeArcadeBetPack('test_bet', { game: 'basketball', label: 'Neon Hoops', agents: ['ZEROX', 'SHADDAI'] });

  // 1. getButtons offers exactly the configured agents, only in 'pick' phase.
  {
    const state = pack.startMatch(['seatA'], 25);
    const legal = pack.getButtons(state);
    assert.strictEqual(legal.length, 2);
    assert.deepStrictEqual(legal.map((b) => b.id).sort(), ['SHADDAI', 'ZEROX']);
    console.log('PASS: getButtons offers exactly the configured agents in pick phase');
  }

  // 2. Before a pick, resolve() reports no score yet.
  {
    const state = pack.startMatch(['seatA'], 25);
    const { score, events } = pack.resolve(state);
    assert.strictEqual(score, null);
    assert.deepStrictEqual(events, []);
    console.log('PASS: resolve() before a pick reports no score/events');
  }

  // 3. applyMove rejects an illegal pick and a move from the wrong seat.
  {
    const state = pack.startMatch(['seatA'], 25);
    assert.throws(() => pack.applyMove(state, 'seatA', 'NOT_AN_AGENT'), /illegal move/);
    assert.throws(() => pack.applyMove(state, 'seatB', 'ZEROX'), /not this seat/);
    console.log('PASS: applyMove rejects an illegal pick and a move from the wrong seat');
  }

  // 4. A legal pick resolves to a real win/lose, is idempotent once settled,
  //    and the outcome is one of the two real possibilities every time
  //    across many trials (proves the state machine, not a specific draw).
  {
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      let state = pack.startMatch(['seatA'], 25);
      state = pack.applyMove(state, 'seatA', 'ZEROX');
      const { score, nextState, events } = pack.resolve(state);
      assert.ok(score === 'win' || score === 'lose', `unexpected score '${score}'`);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(nextState.phase, 'settled');
      seen.add(score);
      // idempotent once settled
      const again = pack.resolve(nextState);
      assert.strictEqual(again.score, score);
    }
    assert.ok(seen.size >= 1, 'expected at least one real outcome across 30 trials');
    console.log(`PASS: 30 real trials all resolved to a valid win/lose outcome (saw: ${[...seen].join(', ')})`);
  }

  // 5. summary() hides the result until settled, and never invents a
  //    'winner' field before the bettor has even picked -- there is no such
  //    field in this design (arcade-sim decides at resolve() time, not
  //    startMatch time), unlike the old cross-service design this replaced.
  {
    const state = pack.startMatch(['seatA'], 25);
    const preSummary = pack.summary(state);
    assert.strictEqual(preSummary.result, undefined);
    assert.strictEqual(preSummary.simSummary, undefined);
    assert.deepStrictEqual(preSummary.agents, ['ZEROX', 'SHADDAI']);
    console.log('PASS: summary() never leaks a result before settlement');
  }

  // 6. Constructor guards: bad game id, wrong agent count.
  {
    assert.throws(() => makeArcadeBetPack('bad', { game: 'not_a_real_game', label: 'x', agents: ['A', 'B'] }), /not a real arcade-sim game/);
    assert.throws(() => makeArcadeBetPack('bad2', { game: 'basketball', label: 'x', agents: ['A'] }), /2-3 council agent ids/);
    console.log('PASS: constructor rejects an unknown game and a bad agent count');
  }

  console.log('\n6/6 arcade-bet checks passed');
}

run();
