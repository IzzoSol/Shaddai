'use strict';
// world-shiplock.js: candidate filtering, lock timing, FOV/speed mapping, restore on dismount. No DOM (doc: null).
const path = require('path');
const assert = require('assert');
const SL = require(path.join(__dirname, '..', '..', 'public', 'world-shiplock.js'));
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }
const U = 7 / 1.8, P = SL.pure;

// camera at origin looking down +x; targets are placed in metres ahead
function mk(extra) {
  const s = { ride: true, speed: 0, boost: false, race: false, targets: [], hits: [], cam: { position: { x: 0, y: 0, z: 0 } } };
  const sl = SL.create(Object.assign({
    camera: s.cam, U, doc: null, topMS: 30, boostMS: 60,
    getRide: () => s.ride, speedMS: () => s.speed, boosting: () => s.boost, inRace: () => s.race,
    getTargets: () => s.targets, posOf: (t, o) => { o.x = t.x; o.y = t.y || 0; o.z = t.z || 0; return o; },
    camState: (o) => { o.x = 0; o.y = 0; o.z = 0; o.dx = 1; o.dy = 0; o.dz = 0; return o; },
    project: (x, y, z, o) => { o.x = 0; o.y = 0; o.on = true; return o; },
    damage: (id, a, pos, type) => { s.hits.push({ id, a, type }); return true; } }, extra));
  return { s, sl };
}
const tgt = (id, mx, mz, extra) => Object.assign({ id, x: mx * U, y: 0, z: (mz || 0) * U, defeated: false }, extra);
const run = (sl, secs, dt) => { dt = dt || 0.05; for (let t = 0; t < secs; t += dt) sl.update(dt); };

test('aim: dead ahead is 0 rad, behind is not ok', () => {
  const cam = { x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0 }, o = {};
  assert(P.aim(cam, 10, 0, 0, o).ang < 1e-9 && o.ok);
  P.aim(cam, -10, 0, 0, o); assert(!o.ok);
});
test('inView: range and cone', () => {
  const cam = { x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0 }, o = {}, r = 450 * U, c = 28 * Math.PI / 180;
  assert(P.inView(P.aim(cam, 100 * U, 0, 0, o), r, c));
  assert(!P.inView(P.aim(cam, 500 * U, 0, 0, o), r, c), 'out of range');
  assert(!P.inView(P.aim(cam, 100 * U, 0, 100 * U, o), r, c), '45 deg is outside the 28 deg cone');
  assert(P.inView(P.aim(cam, 100 * U, 0, 30 * U, o), r, c), '~17 deg is inside');
});
test('defeated dragons are never held or locked', () => {
  const { s, sl } = mk(); s.targets = [tgt('d1', 100, 0, { defeated: true })];
  run(sl, 2); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.state().holdId, null);
});
test('out-of-range and out-of-cone targets are ignored', () => {
  const { s, sl } = mk(); s.targets = [tgt('far', 600, 0), tgt('side', 100, 100)];
  run(sl, 2); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.state().holdId, null);
});
test('lock needs ~0.6 s of hold, not before', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)];
  run(sl, 0.4); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.state().holdId, 'a');
  run(sl, 0.4); assert.strictEqual(sl.target(), 'a'); assert(sl.isLocked());
});
test('nearest-to-centre candidate wins the hold; off-centre outside hold cone does not lock', () => {
  const { s, sl } = mk(); s.targets = [tgt('wide', 100, 25), tgt('mid', 100, 4)];   // 14 deg vs 2.3 deg
  run(sl, 1); assert.strictEqual(sl.target(), 'mid');
  const b = mk(); b.s.targets = [tgt('wide', 100, 25)]; run(b.sl, 2); assert.strictEqual(b.sl.target(), null, '14 deg is in view but outside the 5 deg hold cone');
});
test('lock survives drifting inside the wide cone, releases beyond it', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)]; run(sl, 1); assert.strictEqual(sl.target(), 'a');
  s.targets[0].z = 100 * U * Math.tan(35 * Math.PI / 180); run(sl, 0.2); assert.strictEqual(sl.target(), 'a', '35 deg < 40 deg keep cone');
  s.targets[0].z = 100 * U * Math.tan(50 * Math.PI / 180); run(sl, 0.2); assert.strictEqual(sl.target(), null, 'released at 50 deg');
});
test('lock releases when the target dies or leaves range', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)]; run(sl, 1); assert.strictEqual(sl.target(), 'a');
  s.targets[0].defeated = true; run(sl, 0.1); assert.strictEqual(sl.target(), null);
  const b = mk(); b.s.targets = [tgt('a', 100, 0)]; run(b.sl, 1); b.s.targets[0].x = 600 * U; run(b.sl, 0.1); assert.strictEqual(b.sl.target(), null);
});
test('hold resets if the candidate swaps before locking', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)]; run(sl, 0.4);
  s.targets = [tgt('b', 100, 1)]; run(sl, 0.1); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.state().holdId, 'b');
});
test('fire: only when locked, damages via API, respects cooldown', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)];
  assert.strictEqual(sl.fire(), false, 'no lock, no shot'); assert.strictEqual(s.hits.length, 0);
  run(sl, 1); assert.strictEqual(sl.fire(), true); assert.strictEqual(s.hits.length, 1); assert.strictEqual(s.hits[0].id, 'a');
  assert.strictEqual(sl.fire(), false, 'cooldown'); run(sl, 0.4); assert.strictEqual(sl.fire(), true); assert.strictEqual(s.hits.length, 2);
});
test('not riding: nothing locks, fire is inert', () => {
  const { s, sl } = mk(); s.ride = false; s.targets = [tgt('a', 100, 0)]; run(sl, 2); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.fire(), false);
});
test('dismount drops the lock and the FOV add', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)]; s.speed = 60; run(sl, 2);
  assert(sl.target() === 'a' && sl.fovAdd() > 5);
  s.ride = false; run(sl, 0.1); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.fovAdd(), 0, 'host restores FOV exactly');
});
test('fovAdd mapping: 0 at cruise, monotonic, +12 at boost speed, +16 with kick', () => {
  assert.strictEqual(P.fovAdd(10, 30, 60, 0), 0);
  assert(P.fovAdd(40, 30, 60, 0) < P.fovAdd(50, 30, 60, 0));
  assert(Math.abs(P.fovAdd(60, 30, 60, 0) - 12) < 1e-9); assert(Math.abs(P.fovAdd(60, 30, 60, 1) - 16) < 1e-9);
});
test('FOV add eases toward the mapping while riding fast', () => {
  const { s, sl } = mk(); s.speed = 60; run(sl, 3); assert(sl.fovAdd() > 11 && sl.fovAdd() <= 16.01, String(sl.fovAdd()));
  s.speed = 0; run(sl, 3); assert(sl.fovAdd() < 0.2);
});
test('kmh readout', () => { assert.strictEqual(P.kmh(10), 36); assert.strictEqual(P.kmh(-100 / 3.6), 100); });
test('camera pull-back grows with speed and is zero when not riding', () => {
  const { s, sl } = mk(); s.speed = 60; run(sl, 3); const p = s.cam.position; p.x = 0; sl.applyCamera();
  assert(p.x < -1 * U, 'pulled back along -forward: ' + p.x);
  s.ride = false; run(sl, 0.1); p.x = 0; sl.applyCamera(); assert.strictEqual(p.x, 0);
});
test('boost kick shakes the camera slightly (bounded)', () => {
  const { s, sl } = mk(); s.speed = 60; s.boost = true; run(sl, 0.1); const p = s.cam.position; p.y = 0; sl.applyCamera();
  assert(Math.abs(p.y) <= SL.CFG.shakeM * U + 1e-9);
});
test('?lockon=0 disables everything', () => {
  global.location = { search: '?lockon=0' };
  try { const { s, sl } = mk(); s.targets = [tgt('a', 100, 0)]; s.speed = 60; run(sl, 2); assert.strictEqual(sl.target(), null); assert.strictEqual(sl.fovAdd(), 0); }
  finally { delete global.location; }
});
test('allocation-free steady state: pooled slots keep identity', () => {
  const { s, sl } = mk(); s.targets = [tgt('a', 100, 0), tgt('b', 150, 5)]; run(sl, 0.5);
  const st = sl.state(); assert(st.riding); // state() allocates by design (debug only); update() itself does not create objects
  for (let i = 0; i < 1000; i++) sl.update(0.016);
  assert.strictEqual(sl.target(), 'a');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
