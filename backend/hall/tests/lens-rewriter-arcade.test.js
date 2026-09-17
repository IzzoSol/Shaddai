'use strict';
/**
 * Tests for the arcade-cuts turbine in backend/lib/lens-rewriter.js: per-agent
 * per-game reveal cutscenes for arcade-bet packs (the "<pack>_win"/"<pack>_lose"
 * events), the no-CJK hygiene fix, and proof that the legacy blackjack path is
 * untouched.
 * Run: node backend/hall/tests/lens-rewriter-arcade.test.js
 */
const assert = require('assert');
const { buildLensContract, AGENT_FACES, GAME_RESULTS, LAW, EVENT_SCENES, CAST_LOCK } = require('../../lib/lens-rewriter');
const arcadeSim = require('../../lib/arcade-sim');

const CJK = /[\u4e00-\u9fff]/;

async function run() {
  // 1. Arcade reveal on basketball_win stars the picked agent and drops the
  //    {agent} slot with a real persona, never leaving a bare placeholder.
  {
    const c = buildLensContract({ matchId: 'm1', pack: 'basketball_bet', eventType: 'basketball_bet_win', seatId: 's1', agent: 'ZEROX', game: 'basketball' });
    assert.strictEqual(c.CAST_LOCK, 'ZEROX');
    assert.ok(c.prompt.includes('ZEROX'), 'agent name goes into the cast lock');
    assert.ok(!c.prompt.includes('{agent}'), 'no unresolved placeholder may ship');
    assert.ok(!CJK.test(c.prompt), 'no CJK characters may leak into a scene');
    assert.ok(c.prompt.includes(LAW));
    console.log('PASS: basketball reveal builds a per-agent win cutscene (cast=ZEROX, no CJK, LAW intact)');
  }

  // 2. Loss reveal for football stars NEXUS, and a different agent really
  //    changes the generated prompt (per-agent cutscenes are distinct).
  {
    const a = buildLensContract({ matchId: 'm2', pack: 'football_bet', eventType: 'football_bet_lose', seatId: 's2', agent: 'NEXUS', game: 'football' });
    const b = buildLensContract({ matchId: 'm3', pack: 'football_bet', eventType: 'football_bet_lose', seatId: 's3', agent: 'PIKADON', game: 'football' });
    assert.strictEqual(a.CAST_LOCK, 'NEXUS');
    assert.strictEqual(b.CAST_LOCK, 'PIKADON');
    assert.notStrictEqual(a.prompt, b.prompt);
    assert.ok(!CJK.test(a.prompt) && !CJK.test(b.prompt));
    console.log('PASS: same reveal with a different agent produces a distinct, cast-locked cutscene');
  }

  // 3. Every real arcade-sim game has win+lose scenes (registry coverage), and
  //    every AGENT_FACES persona is usable alongside them.
  {
    for (const game of arcadeSim.GAMES) {
      for (const result of ['win', 'lose']) {
        const c = buildLensContract({ matchId: 'm', pack: `${game}_bet`, eventType: `${game}_bet_${result}`, seatId: 's', agent: 'SHADDAI', game });
        assert.strictEqual(c.CAST_LOCK, 'SHADDAI');
        assert.ok(!CJK.test(c.prompt), `no CJK in ${game}/${result}`);
      }
    }
    for (const agent of Object.keys(AGENT_FACES)) {
      const c = buildLensContract({ matchId: 'm', pack: 'sigil-storm_bet', eventType: 'sigil-storm_bet_win', seatId: 's', agent, game: 'sigil-storm' });
      assert.strictEqual(c.CAST_LOCK, agent);
    }
    console.log(`PASS: all ${arcadeSim.GAMES.length} games × win/lose + ${Object.keys(AGENT_FACES).length} persona faces build clean contracts`);
  }

  // 4. Legacy blackjack path is unchanged: same cast roster, same scenes.
  {
    const legacy = buildLensContract({ matchId: 'm4', pack: 'blackjack', eventType: 'blackjack', seatId: 's4' });
    assert.ok(CAST_LOCK.includes(legacy.CAST_LOCK));
    assert.strictEqual(EVENT_SCENES.blackjack, 'An intense blackjack card game. The seated character reveals a natural blackjack as the dealer turns over the hole card.');
    assert.ok(legacy.prompt.includes(EVENT_SCENES.bust) === false); // prompt uses its own event scene
    console.log('PASS: legacy non-arcade contract path is unchanged (roster cast, stage scene)');
  }

  // 5. Unfilmable events still throw cleanly — including arcade-shaped keys
  //    whose game is unknown (no silent wildcard).
  {
    assert.throws(() => buildLensContract({ matchId: 'm', eventType: 'wat', seatId: 's' }), /unfilmable/i);
    assert.throws(() => buildLensContract({ matchId: 'm', eventType: 'basketball_bet_win', seatId: 's', game: 'nope' }), /unfilmable/i);
    console.log('PASS: unknown events and unknown games still throw (no silent wildcard)');
  }

  console.log('\nAll lens-rewriter arcade checks passed');
}

run().catch((e) => { console.error(e); process.exit(1); });