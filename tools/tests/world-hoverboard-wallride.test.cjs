// node tools/tests/world-hoverboard-wallride.test.cjs — hoverboard WALL RIDES (pure module + a THREE check of the bank direction)
const assert = require('assert'), path = require('path');
const THREE = require('../ual/node_modules/three/build/three.cjs');
global.window = global; require('../../public/world-hoverboard-wallride.js'); const WR = global.HoverboardWallRide;
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok  ' + n); };
const U = 7 / 1.8, wall = { x0: 0, z0: 0, x1: 0, z1: 100 * U, y0: 0, y1: 10 * U };   // a face along +z at x = 0, 10 m tall
const run = (wr, st, n, inp) => { let o; for (let i = 0; i < n; i++) { o = wr.step(1 / 60, Object.assign({ U, inp: inp || {} }, st)); if (o.lock) { st.x = o.lock.x; st.y = o.lock.y; st.z = o.lock.z; st.v = o.lock.v; st.psi = o.lock.psi; } } return o; };
const downTowardWall = (o, wallX) => { const e = new THREE.Euler(0, o.lock.psi, o.lock.roll, 'YXZ'), d = new THREE.Vector3(0, -1, 0).applyEuler(e); return d.x * Math.sign(wallX - o.lock.x) > 0.7; };

t('locks on: fast, nearly parallel, within reach and inside the face height; stands off the face; sparks at the contact', () => {
  const wr = WR.create(); wr.setWalls([wall]);
  const o = wr.step(1 / 60, { x: 1.0 * U, y: 2 * U, z: 20 * U, psi: 0.2, v: 12, air: true, vy: 0, U });
  assert(o.lock, 'locked'); assert(Math.abs(o.lock.x - WR.TUNE.standM * U) < 1e-6); assert(o.spark && Math.abs(o.spark.x) < 0.2 * U);
  assert(Math.abs(o.lock.psi) < 1e-6, 'heading snaps along the face');
});
t('no lock when slow, head-on, out of reach, or above the face', () => {
  const wr = WR.create(); wr.setWalls([wall]);
  assert(!wr.step(1 / 60, { x: U, y: 2 * U, z: 20 * U, psi: 0, v: 4, U }).lock, 'slow');
  assert(!wr.step(1 / 60, { x: U, y: 2 * U, z: 20 * U, psi: -Math.PI / 2, v: 12, U }).lock, 'head-on');
  assert(!wr.step(1 / 60, { x: 3 * U, y: 2 * U, z: 20 * U, psi: 0, v: 12, U }).lock, 'too far');
  assert(!wr.step(1 / 60, { x: U, y: 11 * U, z: 20 * U, psi: 0, v: 12, U }).lock, 'over the top');
});
t('banks INTO the wall on either side (board underside faces the face), riding either direction', () => {
  for (const [x, psi] of [[U, 0.1], [-U, 0.1], [U, Math.PI - 0.1], [-U, Math.PI - 0.1]]) {
    const wr = WR.create(); wr.setWalls([wall]); const o = wr.step(1 / 60, { x, y: 3 * U, z: 50 * U, psi, v: 12, U });
    assert(o.lock, 'lock ' + x + ' ' + psi); assert(downTowardWall(o, 0), 'underside toward wall for x=' + x + ' psi=' + psi);
  }
});
t('glides along, sinks slowly, loses speed, scores; drops at the face floor with a Wall Ride event', () => {
  const wr = WR.create(); wr.setWalls([wall]); const st = { x: U, y: 2.5 * U, z: 10 * U, psi: 0, v: 14, air: true, vy: 0 };
  let o = run(wr, st, 30); assert(o.lock && st.z > 10 * U + 3 * U && st.v < 14 && st.y < 2.5 * U);
  let ev = null; for (let i = 0; i < 600 && !ev; i++) { o = wr.step(1 / 60, Object.assign({ U, inp: {} }, st)); if (o.lock) { st.y = o.lock.y; st.z = o.lock.z; st.v = o.lock.v; } if (o.events.length) ev = o.events[0]; }
  assert(ev && ev.name === 'Wall Ride' && ev.score > 0 && ev.kind === 'wall' && o.lock.ended);
});
t('JUMP pops off with a bonus and the nose turned away from the wall; cooldown before re-locking', () => {
  const wr = WR.create(); wr.setWalls([wall]); const st = { x: U, y: 3 * U, z: 10 * U, psi: 0, v: 14, air: true, vy: 0 };
  run(wr, st, 20); const o = wr.step(1 / 60, Object.assign({ U, inp: { jump: true } }, st));
  assert(o.pop && o.events[0].name === 'Wall Ride + Pop'); const away = Math.sin(o.lock.psi); assert(away > 0, 'turned toward +x (away from the wall at x=0)');
  assert(!wr.step(1 / 60, Object.assign({ U }, st)).lock, 'cooldown');
});
console.log(`${pass} passed, 0 failed`);
