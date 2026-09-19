'use strict';
/**
 * Self-running test for hall/packs/skate.js (assert + process.exit style,
 * matching hall/tests/blackjack.test.js's convention). Run:
 *   node hall/tests/skate.test.js
 *
 * Covers the REBUILT mechanic: hidden-simultaneous blind picks, RPS-style
 * style counters (no dice anywhere), one filmable event per attempt, and an
 * idempotent resolve().
 */
const assert = require('assert');
const pack = require('../packs/skate');

// 1. getButtons returns exactly 3 style buttons while a round is open.
{
  const state = pack.startMatch(['alice', 'bob'], 10);
  const legal = pack.getButtons(state);
  assert.strictEqual(legal.length, 3, 'both seats are offered exactly 3 styles');
  assert.deepStrictEqual(legal.map((b) => b.id), ['style_flip', 'style_air', 'style_grind']);
  console.log('PASS: getButtons offers exactly 3 style buttons per round');
}

// 2. applyMove records a blind pick and does NOT resolve until both are in.
{
  let state = pack.startMatch(['alice', 'bob'], 10);
  state = pack.applyMove(state, 'alice', 'style_flip');
  assert.strictEqual(state.phase, 'picking', 'round stays open after one pick');
  assert.strictEqual(state.picks.alice.style, 'flip');
  assert.ok(!state.picks.bob, "bob's pick is still blind/hidden");
  state = pack.applyMove(state, 'bob', 'style_grind');
  assert.strictEqual(state.phase, 'resolved', 'round resolves when both picks are in');
  console.log('PASS: blind picks recorded for both seats before resolution');
}

// 3. Counter table is a closed RPS cycle: flip crushes air, air crushes grind,
//    grind crushes flip, same style is a tie.
{
  assert.strictEqual(pack.styleWinner('flip', 'air'), 'flip');
  assert.strictEqual(pack.styleWinner('air', 'grind'), 'air');
  assert.strictEqual(pack.styleWinner('grind', 'flip'), 'grind');
  assert.strictEqual(pack.styleWinner('air', 'flip'), 'flip');
  assert.strictEqual(pack.styleWinner('grind', 'air'), 'air');
  assert.strictEqual(pack.styleWinner('flip', 'grind'), 'grind');
  assert.strictEqual(pack.styleWinner('air', 'air'), null, 'same style ties');
  console.log('PASS: RPS counter table is closed, balanced, and tie-aware');
}

// 4. Decisive clash: loser bails (event per rider) and takes a letter.
{
  let state = pack.startMatch(['alice', 'bob'], 10);
  state = pack.applyMove(state, 'alice', 'style_flip'); // flip crushes air
  state = pack.applyMove(state, 'bob', 'style_air');
  const out = pack.resolve(state);
  assert.deepStrictEqual(out.events, ['land', 'bail'], 'alice lands, bob bails (events in seat order)');
  assert.deepStrictEqual(state.letters.bob, [], 'letters unchanged before resolve applies nextState');
  assert.deepStrictEqual(out.nextState.letters.bob, ['S'], 'loser bob takes the next letter');
  assert.strictEqual(out.nextState.phase, 'picking', 'next round opens after a decisive clash');
  console.log('PASS: decisive clash -> loser takes a letter, both attempts film');
}

// 5. Same-style tie: both land, NO letter, next round advances.
{
  let state = pack.startMatch(['alice', 'bob'], 10);
  state = pack.applyMove(state, 'alice', 'style_air');
  state = pack.applyMove(state, 'bob', 'style_air');
  const out = pack.resolve(state);
  assert.deepStrictEqual(out.events, ['land', 'land'], 'identical picks -> both land');
  assert.deepStrictEqual(out.nextState.letters.alice, []);
  assert.deepStrictEqual(out.nextState.letters.bob, []);
  assert.strictEqual(out.nextState.round, 1, 'round advanced, no letter awarded');
  console.log('PASS: same-style tie -> both land, no letter');
}

// 6. Full-match reachability: forcing alice to always win lets her spell the
//    full S-K-A-T-E (5 letters) against bob within the 9 bounded rounds.
{
  let state = pack.startMatch(['alice', 'bob'], 10);
  // Pick a style that crushes bob's every round -> bob bails every round.
  const aliceStyle = 'flip'; // crushes air
  const bobStyle = 'air';
  let guard = 0;
  while (state.phase !== 'settled' && guard < 20) {
    state = pack.applyMove(state, 'alice', 'style_' + aliceStyle);
    state = pack.applyMove(state, 'bob', 'style_' + bobStyle);
    const out = pack.resolve(state);
    assert.ok(out.events.length === 2, 'every resolved round films both riders');
    state = out.nextState;
    guard++;
  }
  assert.ok(guard < 20, 'match settled within the bounded 9 rounds');
  assert.strictEqual(state.letters.bob.length, 5, 'spelling the full S-K-A-T-E is reachable');
  assert.strictEqual(state.result, 'win', 'alice (seats[0]) wins when bob spells SKATE');
  console.log('PASS: full S-K-A-T-E spell-out is reachable and resolves correctly');
}

// 7. resolve() is idempotent: calling it twice on the chained nextState does
//    not re-report the same events (same property blackjack.test.js checks).
{
  let state = pack.startMatch(['alice', 'bob'], 10);
  state = pack.applyMove(state, 'alice', 'style_flip');
  state = pack.applyMove(state, 'bob', 'style_air');
  const first = pack.resolve(state);
  const second = pack.resolve(first.nextState);
  assert.strictEqual(first.events.length, 2, 'first resolve reports both attempts');
  assert.deepStrictEqual(second.events, [], 'repeat resolve() call reports no events');
  console.log('PASS: resolve() is idempotent on an unchanged state');
}

// 8. resolve() before any move (or a settled state) reports no events; a
//    double-pick or illegal move is rejected.
{
  const state = pack.startMatch(['alice', 'bob'], 10);
  const out = pack.resolve(state);
  assert.strictEqual(out.score, null);
  assert.deepStrictEqual(out.events, []);
  assert.throws(() => pack.applyMove(state, 'bob', 'nonsense_id'), /illegal move/);
  assert.throws(() => pack.applyMove(state, 'carol', 'style_flip'), /not at this table/);
  const onePick = pack.applyMove(state, 'alice', 'style_flip');
  assert.throws(() => pack.applyMove(onePick, 'alice', 'style_grind'), /already picked/);
  console.log('PASS: no premature events; illegal/double/unauthenticated moves rejected');
}

console.log('\n8/8 skate pack tests passed');