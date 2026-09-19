'use strict';
/**
 * Tests for the SKATE additions to backend/lib/lens-rewriter.js (Gate A5,
 * SKATE-MASTER-PLAN.md). Covers the two real bugs caught and fixed while
 * wiring this up, not just the happy path:
 *   1. dodgeball already owns the bare EVENT_SCENES key 'bail' -- SKATE's
 *      pack also emits 'bail', and a naive flat lookup would have silently
 *      resolved SKATE clips to dodgeball's "knocked out" scene.
 *   2. {rider} in the scene template and CAST_LOCK must always name the
 *      SAME rider -- a caller-supplied slots.rider could otherwise disagree
 *      with the deterministic seatId->rider mapping.
 * Run: node backend/hall/tests/lens-rewriter-skate.test.js
 */
const assert = require('assert');
const { buildLensContract, SKATE_RIDERS } = require('../../lib/lens-rewriter');

// 1. dodgeball's bare 'bail' is untouched by SKATE's addition.
{
  const c = buildLensContract({ pack: 'dodgeball', eventType: 'bail', seatId: 's1' });
  assert.ok(c.SCENE_LOCK.includes('knocked out'), 'dodgeball bail scene must be unchanged');
  console.log('PASS: dodgeball\'s pre-existing bare "bail" key is unaffected');
}

// 2. skate's 'bail' resolves to the SKATE scene, never dodgeball's.
{
  const c = buildLensContract({
    pack: 'skate', eventType: 'bail', seatId: 'alice',
    slots: { trick: 'Kickflip', style: 'Flip', weather: 'sunset_gold', accent: 'crowd_gasp' },
  });
  assert.ok(!c.SCENE_LOCK.includes('knocked out'), 'must not collide with dodgeball\'s bail scene');
  assert.ok(c.SCENE_LOCK.includes('bails hard'), 'must resolve to the skate_bail template');
  console.log('PASS: skate "bail" resolves to skate_bail, not dodgeball\'s bail');
}

// 3. skate's 'land' resolves distinctly from 'bail'.
{
  const c = buildLensContract({
    pack: 'skate', eventType: 'land', seatId: 'alice',
    slots: { trick: 'Ollie', style: 'Grind', weather: 'clear_grid', accent: 'confetti' },
  });
  assert.ok(c.SCENE_LOCK.includes('lands a clean'), 'must resolve to the skate_land template');
  console.log('PASS: skate "land" resolves to a distinct skate_land template');
}

// 4. All named slots ({trick}/{style}/{weather}/{accent}) actually fill in --
//    no literal "{...}" braces leak into the final prompt sent to Fal.
{
  const c = buildLensContract({
    pack: 'skate', eventType: 'land', seatId: 'bob',
    slots: { trick: 'Heelflip', style: 'Air', weather: 'storm', accent: 'lens_flares' },
  });
  assert.ok(!/\{[a-z]+\}/i.test(c.SCENE_LOCK), 'no unfilled {slot} should remain: ' + c.SCENE_LOCK);
  assert.ok(!/\{[a-z]+\}/i.test(c.prompt), 'no unfilled {slot} should reach the final prompt');
  console.log('PASS: all named slots fill in, nothing leaks as literal braces');
}

// 5. {rider} in the scene text always matches CAST_LOCK, even if a caller
//    tries to supply a conflicting slots.rider.
{
  const c = buildLensContract({
    pack: 'skate', eventType: 'land', seatId: 'alice',
    slots: { rider: 'rider_99_spoofed', trick: 'Ollie', style: 'Flip', weather: 'clear_grid', accent: 'confetti' },
  });
  assert.ok(c.SCENE_LOCK.includes(c.CAST_LOCK), 'scene text must name the same rider as CAST_LOCK');
  assert.ok(!c.SCENE_LOCK.includes('rider_99_spoofed'), 'caller-supplied rider slot must be overridden, not trusted');
  console.log('PASS: {rider} slot cannot be spoofed away from the real CAST_LOCK rider');
}

// 6. The deterministic seatId->rider mapping is stable and draws from the
//    real 6-rider roster (not the generic CAST_LOCK pool used by other games).
{
  const c1 = buildLensContract({ pack: 'skate', eventType: 'land', seatId: 'same-seat', slots: {} });
  const c2 = buildLensContract({ pack: 'skate', eventType: 'bail', seatId: 'same-seat', slots: {} });
  assert.strictEqual(c1.CAST_LOCK, c2.CAST_LOCK, 'same seatId must always map to the same rider');
  assert.ok(SKATE_RIDERS.includes(c1.CAST_LOCK), 'cast must come from SKATE_RIDERS, not the generic CAST_LOCK pool');
  console.log('PASS: seatId->rider mapping is deterministic and draws from SKATE_RIDERS');
}

console.log('\n6/6 skate lens-rewriter tests passed');
