'use strict';
// tools/tests/world-hoverboards.test.cjs — public/world-hoverboards.js (9 code-built boards, FX, trick core) and the
// fly/trick upgrade of public/world-hoverboard.js, against real three.js. Run: node tools/tests/world-hoverboards.test.cjs < /dev/null
const path = require('path'), assert = require('assert');
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
global.window = {};
require(path.join(__dirname, '..', '..', 'public', 'world-hoverboards.js'));
require(path.join(__dirname, '..', '..', 'public', 'world-hoverboard.js'));
const KIT = window.HoverboardKit, U = 7 / 1.8, D2R = Math.PI / 180;
let pass = 0, fail = 0;
const test = (n, f) => { try { const i = f(); pass++; console.log('  ok  ' + n + (i ? '  — ' + i : '')); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); } };

// ── counting THREE: every Vector3/Quaternion/Matrix4/Euler/Color built through it is tallied ──
let allocs = 0;
const CT = Object.assign({}, T);
['Vector3', 'Quaternion', 'Matrix4', 'Euler', 'Color', 'Box3', 'Object3D', 'Group', 'Mesh'].forEach(k => {
  CT[k] = class extends T[k] { constructor(...a) { super(...a); allocs++; } };
});

function hills(x, z) { const m = 1 / U; x *= m; z *= m; return (6 * Math.sin(x / 40) * Math.cos(z / 35) + 2 * Math.sin((x + z) / 25) + 8) * U; }   // rolling hills
const IN = o => Object.assign({ fwd: false, back: false, left: false, right: false, boost: false, jump: false }, o || {});
function mk(THREE, over) {
  const scene = new THREE.Scene(), playerPos = new THREE.Vector3(0, 0, 0);
  const h = window.buildWorldHoverboard(Object.assign({ THREE, scene, playerPos, heightAt: hills, worldHalf: 1e7, colliders: [] }, over || {}));
  const ev = []; h.onTrick(e => ev.push(e));
  h.mount(null, { yaw: 0 });
  return { h, scene, playerPos, ev, run(secs, inp) { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) h.update(1 / 60, inp, h.heading()); } };
}

console.log('world-hoverboards tests');

test('10 styles, each builds under 2.5k tris with thrusters, flames, underglow, stand socket', () => {
  assert.strictEqual(KIT.STYLES.length, 10);
  assert.strictEqual(new Set(KIT.ids).size, 10);
  const out = [];
  KIT.ids.forEach(id => {
    const g = KIT.build(T, id), ud = g.userData;
    assert(ud.tris > 150 && ud.tris < 2500, id + ' tris ' + ud.tris);
    assert.strictEqual(ud.tris, KIT.countTris(g));
    assert(ud.nozzles.length >= 4, id + ' nozzles');
    assert.strictEqual(ud.flames.length, ud.nozzles.length);
    assert(ud.nozzles.some(n => n.userData.dir === 'back') && ud.nozzles.some(n => n.userData.dir === 'down'), id + ' needs exhaust + hover pads');
    assert(ud.underglow && ud.stand && ud.stand.name === 'stand');
    const box = new T.Box3().setFromObject(g), sz = box.getSize(new T.Vector3());
    assert(sz.z > 1.4 && sz.z < 2.2, id + ' length ' + sz.z.toFixed(2));
    assert(sz.x < 1.5 && sz.y < 0.6, id + ' size ' + sz.x.toFixed(2) + 'x' + sz.y.toFixed(2));
    assert(ud.mats.glow.emissiveIntensity > 1, id + ' emissive glow');
    out.push(id + ':' + ud.tris);
    ud.dispose();
  });
  return out.join(' ');
});

test('palette is recolourable and thrust scales the flames', () => {
  const g = KIT.build(T, 'ringfan', { deck: 0x112233 }), ud = g.userData;
  assert.strictEqual(ud.mats.deck.color.getHex(), 0x112233);
  ud.setPalette({ glow: 0xff0000, trim: 0x00ff00 });
  assert.strictEqual(ud.mats.glow.emissive.getHex(), 0xff0000);
  assert.strictEqual(ud.mats.flame.color.getHex(), 0xff0000);
  assert.strictEqual(ud.mats.trim.color.getHex(), 0x00ff00);
  ud.setThrust(0); const lo = ud.flames.map(f => f.scale.y * f.scale.z);
  ud.setThrust(1.2); const hi = ud.flames.map(f => f.scale.y * f.scale.z);
  assert(hi.every((v, i) => v > lo[i] * 1.5));
});

test('host board uses a kit style by default; setStyle swaps it', () => {
  const { h } = mk(T, { style: 'batwing' });
  assert.strictEqual(h.style(), 'batwing');
  h.setStyle('racer', { glow: 0x00ff00 });
  assert.strictEqual(h.style(), 'racer');
  assert.strictEqual(h.kit().userData.mats.glow.color.getHex(), 0x00ff00);
  let n = 0; h.board.traverse(o => { if (o.name && o.name.indexOf('hoverboard-') === 0 && o !== h.board) n++; });
  assert.strictEqual(n, 1, 'old kit must be removed');
});

test('hover height tracks the terrain while cruising over hills', () => {
  const { h, playerPos, run } = mk(T);
  run(1.5, IN({ fwd: true }));
  let worst = 0, n = 0, path = 0, px = playerPos.x, pz = playerPos.z;
  for (let i = 0; i < 480; i++) {
    h.update(1 / 60, IN({ fwd: true, left: i % 200 < 60 }), h.heading() + (i % 200 < 60 ? 0.4 : 0));
    const s = h.state(), err = Math.abs(s.y - (hills(s.x, s.z) + h.tune.hoverM * U)) / U;
    worst = Math.max(worst, err); n++;
    path += Math.hypot(playerPos.x - px, playerPos.z - pz); px = playerPos.x; pz = playerPos.z;
  }
  assert(path > 60 * U, 'should have travelled ' + (path / U).toFixed(1) + ' m');
  assert(worst < 0.3, 'hover error ' + worst.toFixed(3) + ' m');
  return 'worst ' + worst.toFixed(3) + ' m over ' + n + ' frames';
});

test('FLY: hold Space climbs, altitude capped at flyMaxAltM, stamina drains to 0, then glides down', () => {
  const { h, run } = mk(T, { heightAt: () => 0 });
  run(0.5, IN());
  let maxAlt = 0, minSt = 1;
  for (let i = 0; i < 60 * 14; i++) { h.update(1 / 60, IN({ jump: true, fwd: true }), h.heading()); maxAlt = Math.max(maxAlt, h.altitudeM()); minSt = Math.min(minSt, h.stamina()); assert(h.stamina() >= 0 && h.stamina() <= 1); }
  assert(h.isFlying(), 'should be flying');
  assert(maxAlt > 25, 'climbed ' + maxAlt.toFixed(1));
  assert(maxAlt <= h.tune.flyMaxAltM + 0.01, 'cap broken: ' + maxAlt.toFixed(2));
  assert.strictEqual(minSt, 0, 'stamina must run dry');
  const a0 = h.altitudeM();
  run(3, IN({ jump: true }));                     // still holding, but exhausted → glides down, cannot climb
  assert(h.altitudeM() < a0 - 2, 'exhausted rider must sink');
  const vy = h.state().vy / U;
  assert(vy < 0 && vy >= -h.tune.glideSinkMS - 1e-6, 'glide sink rate ' + vy.toFixed(2));
  run(40, IN());
  assert(!h.isAirborne(), 'lands eventually');
  run(4, IN());
  assert(h.stamina() > 0.9, 'stamina regenerates on the ground: ' + h.stamina().toFixed(2));
  return 'max ' + maxAlt.toFixed(1) + ' m';
});

test('a tap of Space is a hop, not a flight', () => {
  const { h, run } = mk(T, { heightAt: () => 0 });
  run(0.5, IN()); run(0.1, IN({ jump: true })); run(2, IN());
  assert(!h.isFlying() && !h.isAirborne());
  assert(h.stamina() === 1);
});

test('trick core: 360 spin auto-completes after release and lands clean; tilt / mid-rotation = bail', () => {
  const C = window.HoverboardTricks.create(), ev = []; C.onTrick(e => ev.push(e));
  const I = o => Object.assign({ spinL: false, spinR: false, flipF: false, flipB: false, grab: false, varialL: false, varialR: false }, o);
  for (let i = 0; i < 30; i++) C.step(1 / 60, I({ spinR: true }), true);       // 0.5 s → 3.5 rad
  for (let i = 0; i < 60; i++) C.step(1 / 60, I({}), true);                    // settles to 2π
  assert(Math.abs(C.angles.spin - 2 * Math.PI) < 1e-6, 'spin settles on 360: ' + C.angles.spin);
  assert.strictEqual(C.land(0), true);
  assert.deepStrictEqual(ev.map(e => e.name), ['Spin 360', 'combo']);
  assert(ev[0].clean && ev[0].score > 0 && ev[0].kind === 'spin' && ev[0].deg === 360);
  ev.length = 0;
  for (let i = 0; i < 36; i++) C.step(1 / 60, I({ spinR: true }), true);   // 4.2 rad: 60° past a 180
  assert.strictEqual(C.land(0), false, 'landing mid-spin must bail');
  assert.deepStrictEqual(ev.map(e => [e.name, e.clean, e.score]), [['Spin 180', false, 0], ['bail', false, 0]]);
  ev.length = 0;
  for (let i = 0; i < 40; i++) C.step(1 / 60, I({ spinR: i < 30 }), true);
  for (let i = 0; i < 40; i++) C.step(1 / 60, I({}), true);
  assert.strictEqual(C.land(60 * D2R), false, 'too tilted must bail');
});

test('trick core: flip + varial + grab combo multiplies the score', () => {
  const C = window.HoverboardTricks.create(), ev = []; C.onTrick(e => ev.push(e));
  const I = o => Object.assign({ spinL: false, spinR: false, flipF: false, flipB: false, grab: false, varialL: false, varialR: false }, o);
  for (let i = 0; i < 20; i++) C.step(1 / 60, I({ flipB: true, varialL: true }), true);
  for (let i = 0; i < 90; i++) C.step(1 / 60, I({ grab: i < 40 }), true);
  assert(C.land(0));
  const names = ev.map(e => e.name);
  assert(names.includes('Back Flip') && names.includes('Varial 180') && names.includes('Grab') && names[names.length - 1] === 'combo', names.join(','));
  const flip = ev.find(e => e.kind === 'flip');
  assert.strictEqual(flip.combo, 3);
  assert.strictEqual(flip.score, 300 * 3);
});

test('on the board: fly up, Shift+W front flip + A spin, land clean → onTrick events (SKATE feed)', () => {
  const { h, run, ev } = mk(T, { heightAt: () => 0 });
  run(0.5, IN());
  run(1.2, IN({ jump: true }));                        // hop → fly
  assert(h.isFlying());
  run(0.25, IN({ boost: true, fwd: true }));           // Shift+W: front flip (auto-completes)
  run(0.5, IN({ left: true }));                        // A: spin
  run(20, IN());                                       // glide down + land
  assert(!h.isAirborne());
  const names = ev.map(e => e.name);
  assert(names.includes('Front Flip') && names.includes('Spin 360'), names.join(','));
  assert(ev.every(e => e.clean), 'clean landing expected');
  assert(!h.isBailing());
  return names.join(' + ');
});

test('on the board: still mid-flip at touchdown → bail, speed cut, board wobbles', () => {
  const { h, run, ev } = mk(T, { heightAt: () => 0 });
  h.tune.hopMS = 4.2;                                   // a SHORT hop so the flip is still unfinished at touchdown (the default hop now gives full trick time)
  run(3, IN({ fwd: true }));
  const v0 = h.speedMS();
  run(0.05, IN({ fwd: true, jump: true }));            // hop
  for (let i = 0; i < 60 && (h.isAirborne() || i < 3); i++) h.update(1 / 60, IN({ flipF: true }), h.heading());   // hold the flip into the ground
  assert(!h.isAirborne());
  assert(ev.some(e => e.name === 'bail' && !e.clean), ev.map(e => e.name).join(','));
  assert(h.isBailing());
  assert(h.speedMS() < v0 * 0.5, 'bail must cut speed');
});

test('thrusters: flames grow with throttle, particle trail emits from the pool', () => {
  const { h, run } = mk(T, { heightAt: () => 0 });
  run(0.3, IN());
  const idle = h.kit().userData.flames[0].scale.clone();
  run(3, IN({ fwd: true, boost: true }));
  const fast = h.kit().userData.flames[0].scale;
  assert(fast.y * fast.z > idle.y * idle.z * 1.3);
  assert(h.fx.live() > 20, 'live particles ' + h.fx.live());
  assert(h.fx.live() <= 160);
});

test('no allocation: cruise, fly, tricks and FX frames build no THREE objects', () => {
  const { h } = mk(CT, { heightAt: hills });
  const frame = (i) => h.update(1 / 60, IN({ fwd: true, jump: (i % 400) < 150, left: (i % 97) < 20, boost: (i % 300) > 250 }), h.heading());
  for (let i = 0; i < 300; i++) frame(i);        // warm-up (WorldRiderPose absent here → no rider)
  allocs = 0;
  for (let i = 300; i < 1500; i++) frame(i);
  assert.strictEqual(allocs, 0, allocs + ' THREE objects allocated in 1200 frames');
});

test('trick core: barrel ROLL auto-completes, scores, lands clean; mid-roll = bail; flip+roll = Hurricane', () => {
  const C = window.HoverboardTricks.create(), ev = []; C.onTrick(e => ev.push(e));
  const I = o => Object.assign({ spinL: false, spinR: false, flipF: false, flipB: false, grab: false, varialL: false, varialR: false, rollL: false, rollR: false }, o);
  for (let i = 0; i < 30; i++) C.step(1 / 60, I({ rollR: true }), true);
  for (let i = 0; i < 60; i++) C.step(1 / 60, I({}), true);
  assert(Math.abs(C.angles.roll - 2 * Math.PI) < 1e-6, 'roll settles on 360: ' + C.angles.roll);
  assert.strictEqual(C.land(0), true);
  assert.deepStrictEqual(ev.map(e => e.name), ['Barrel Roll', 'combo']);
  assert(ev[0].kind === 'roll' && ev[0].clean && ev[0].score > 0 && ev[0].points === true);
  ev.length = 0;
  for (let i = 0; i < 20; i++) C.step(1 / 60, I({ rollL: true }), true);
  assert.strictEqual(C.land(0), false, 'landing mid-roll must bail');
  ev.length = 0;
  for (let i = 0; i < 30; i++) C.step(1 / 60, I({ rollR: true, flipF: true }), true);
  for (let i = 0; i < 80; i++) C.step(1 / 60, I({}), true);
  assert.strictEqual(C.land(0), true);
  assert(ev.some(e => e.name === 'Hurricane' && e.kind === 'named' && e.score > 0), 'flip + roll names a Hurricane: ' + ev.map(e => e.name));
});

test('trick core: BATTLE mode = no points, tricks become combat moves; Hoverskate mode scores', () => {
  const I = o => Object.assign({ spinL: false, spinR: false, flipF: false, flipB: false, grab: false, varialL: false, varialR: false, rollL: false, rollR: false }, o);
  const run = mode => {
    const C = window.HoverboardTricks.create(), ev = []; C.setMode(mode); C.onTrick(e => ev.push(e));
    for (let i = 0; i < 30; i++) C.step(1 / 60, I({ flipF: true, spinR: true }), true);
    for (let i = 0; i < 80; i++) C.step(1 / 60, I({}), true);
    C.land(0); return { C, ev };
  };
  const b = run('battle'), h = run('hoverskate');
  assert.strictEqual(b.C.getMode(), 'battle');
  assert(b.ev.every(e => e.score === 0), 'battle events never carry points');
  assert.strictEqual(b.C.state.total, 0, 'battle never accrues a total');
  const flip = b.ev.find(e => e.kind === 'flip'), spin = b.ev.find(e => e.kind === 'spin');
  assert(flip && flip.move && flip.move.move === 'flip-dodge' && flip.move.iframesS > 0, 'flip = dodge with i-frames');
  assert(spin && spin.move && spin.move.move === 'spin-strike' && spin.move.strikeR > 0, 'spin = strike');
  assert(h.ev.some(e => e.score > 0) && h.C.state.total > 0, 'hoverskate scores');
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
