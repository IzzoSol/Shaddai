'use strict';
/** WorldTrickScore: deterministic scripted chains - exact totals, bail/banking, repeat/variety, grind/manual links, grade thresholds, window expiry. */
const path = require('path'), assert = require('assert');
const W = require(path.join(__dirname, '..', '..', 'public', 'world-trick-score.js'));
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }
const tr = (name, base, sub, extra) => Object.assign({ kind: 'trick', name, base, sub, clean: true }, extra || {});
const land = extra => Object.assign({ kind: 'land', clean: true }, extra || {});
const snap = sc => { const s = sc.state(); return { banked: s.banked, pending: s.pending, mult: s.mult, chain: s.chain, lastGrade: s.lastGrade, feed: s.feed.slice() }; };

test('single clean trick + land banks base x1', () => {
  const sc = W.create(); sc.event(tr('Kickflip', 100, 'flip'), 0);
  assert.strictEqual(snap(sc).pending, 100); sc.event(land(), 0.5);
  const s = snap(sc); assert.strictEqual(s.banked, 100); assert.strictEqual(s.pending, 0);
});
test('two different kinds: 100 + 100*1.5*1.1 = 265', () => {
  const sc = W.create(); sc.event(tr('Spin 360', 100, 'spin'), 0); sc.event(tr('Front Flip', 100, 'flip'), 1); sc.event(land(), 1.5);
  assert.strictEqual(snap(sc).banked, 265);
});
test('repeat penalty: same name within last 3 links halves (100 + 75 = 175)', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(tr('A', 100, 'spin'), 1);
  assert.strictEqual(snap(sc).pending, 175);
});
test('repeat window is 3 links: A,B,C,A penalised (575) but A,B,C,D,A not (1000)', () => {
  let sc = W.create(); ['A', 'B', 'C', 'A'].forEach((n, i) => sc.event(tr(n, 100, 'spin'), i)); assert.strictEqual(snap(sc).pending, 575);
  sc = W.create(); ['A', 'B', 'C', 'D', 'A'].forEach((n, i) => sc.event(tr(n, 100, 'spin'), i)); assert.strictEqual(snap(sc).pending, 1000);
});
test('variety bonus is capped at +50% (7 distinct kinds = 2375)', () => {
  const sc = W.create(); ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((k, i) => sc.event(tr('T' + i, 100, k), i * 0.5));
  assert.strictEqual(snap(sc).pending, 2375); sc.event(land(), 4); assert.strictEqual(snap(sc).banked, 2375);
});
test('multiplier climbs 0.5 per link and caps at 6', () => {
  const sc = W.create(); for (let i = 0; i < 14; i++) sc.event(tr('T' + i, 10, 'spin'), i * 0.3);
  const s = snap(sc); assert.strictEqual(s.mult, 6); assert.strictEqual(s.chain, 14);
});
test('bail loses pending, keeps banked, resets chain', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(land(), 0.5);
  sc.event(tr('B', 200, 'spin'), 1); assert.strictEqual(snap(sc).pending, 300);
  sc.event({ kind: 'bail', name: 'bail' }, 1.5);
  const s = snap(sc); assert.strictEqual(s.banked, 100); assert.strictEqual(s.pending, 0); assert.strictEqual(s.chain, 0); assert.strictEqual(s.mult, 1); assert.strictEqual(s.lastGrade, 'BAIL');
});
test('unclean trick event behaves as a bail', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(tr('B', 100, 'spin', { clean: false }), 1);
  assert.strictEqual(snap(sc).pending, 0); assert.strictEqual(snap(sc).chain, 0);
});
test('grind keeps the chain alive past the first 4 s window (100 + 165 = 265)', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(land(), 0.5);
  sc.event({ kind: 'grind', name: 'Rail', base: 100, sub: 'grind', clean: true }, 4.2);   // 4.2 s after trick, 3.7 s after landing
  assert.strictEqual(snap(sc).chain, 2); sc.event(land(), 5); assert.strictEqual(snap(sc).banked, 265);
});
test('manual within 0.6 s of a landing links (chain continues)', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(land(), 0);
  sc.event({ kind: 'manual', name: 'Manual', base: 100, sub: 'manual', clean: true }, 0.6);
  assert.strictEqual(snap(sc).chain, 2); assert.strictEqual(snap(sc).pending, 165);
});
test('manual after 0.6 s starts a fresh chain (mult back to 1)', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(land(), 0);
  sc.event({ kind: 'manual', name: 'Manual', base: 100, sub: 'manual', clean: true }, 0.75);
  const s = snap(sc); assert.strictEqual(s.chain, 1); assert.strictEqual(s.pending, 100); assert.strictEqual(s.banked, 100);
});
test('window expiry: exactly 4.0 s alive, past it pending is dropped', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0);
  assert.strictEqual(sc.tick(4.0), false); assert.strictEqual(snap(sc).pending, 100);
  assert.strictEqual(sc.tick(4.01), true); const s = snap(sc); assert.strictEqual(s.pending, 0); assert.strictEqual(s.banked, 0); assert.strictEqual(s.chain, 0);
});
test('window expiry after a clean land keeps banked and clears the chain', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(land(), 1); sc.tick(5.01);
  const s = snap(sc); assert.strictEqual(s.banked, 100); assert.strictEqual(s.chain, 0); assert.strictEqual(s.mult, 1);
});
test('grade thresholds at exact boundaries (spin tol 30)', () => {
  const tol = { spin: 30, flip: 35, tilt: 45 };
  assert.strictEqual(W.grade({ spin: 0 }, tol), 'PERFECT'); assert.strictEqual(W.grade({ spin: 10.5 }, tol), 'PERFECT'); assert.strictEqual(W.grade({ spin: 10.6 }, tol), 'CLEAN');
  assert.strictEqual(W.grade({ spin: 30 }, tol), 'CLEAN'); assert.strictEqual(W.grade({ spin: 30.1 }, tol), 'SLOPPY');
  assert.strictEqual(W.grade({ spin: 45 }, tol), 'SLOPPY'); assert.strictEqual(W.grade({ spin: 45.1 }, tol), 'BAIL');
});
test('grade uses the worst axis, sign-insensitive, defaults to CLEAN with no residual', () => {
  const tol = { spin: 30, flip: 35, tilt: 45 };
  assert.strictEqual(W.grade({ spin: 5, flip: 12.25, tilt: 0 }, tol), 'PERFECT'); assert.strictEqual(W.grade({ spin: 5, flip: -36, tilt: 0 }, tol), 'SLOPPY');
  assert.strictEqual(W.grade({ spin: 1, flip: 1, tilt: -46 }, tol), 'SLOPPY'); assert.strictEqual(W.grade({ spin: 1, flip: 1, tilt: 68 }, tol), 'BAIL');
  assert.strictEqual(W.grade(null, tol), 'CLEAN');
});
test('SLOPPY x0.7 keeps chain; PERFECT x1.25; BAIL residual bails', () => {
  let sc = W.create(); sc.event(tr('S', 100, 'spin', { residual: { spin: 40 } }), 0);
  assert.strictEqual(snap(sc).pending, 70); assert.strictEqual(snap(sc).chain, 1); assert.strictEqual(snap(sc).lastGrade, 'SLOPPY');
  sc = W.create(); sc.event(tr('P', 100, 'spin', { residual: { spin: 10 } }), 0); assert.strictEqual(snap(sc).pending, 125);
  sc = W.create(); sc.event(tr('X', 100, 'spin'), 0); sc.event(tr('B', 100, 'spin', { residual: { spin: 60 } }), 1);
  assert.strictEqual(snap(sc).pending, 0); assert.strictEqual(snap(sc).chain, 0);
});
test('land grade scales the banked pending (PERFECT 100 -> 125)', () => {
  const sc = W.create(); sc.event(tr('A', 100, 'spin'), 0); sc.event(land({ residual: { tilt: 5 } }), 1);
  assert.strictEqual(snap(sc).banked, 125);
});
test('feed keeps the last 3 names; state() is a reused object (no per-call allocation)', () => {
  const sc = W.create(); ['A', 'B', 'C', 'D'].forEach((n, i) => sc.event(tr(n, 10, 'spin'), i));
  assert.deepStrictEqual(snap(sc).feed, ['B', 'C', 'D']); assert.strictEqual(sc.state(), sc.state());
});
test('deterministic: replaying the same script gives identical state', () => {
  const run = () => { const sc = W.create(); [['A', 'spin'], ['B', 'flip'], ['C', 'grab']].forEach(([n, k], i) => sc.event(tr(n, 120, k), i)); sc.event(land(), 3.5); return snap(sc); };
  assert.deepStrictEqual(run(), run());
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
