// Unit tests for public/world-player-controller.js — pure math, no THREE, no browser.
// Run: node tools/tests/player-controller.test.cjs
'use strict';
const path = require('path');
const build = require(path.join(__dirname, '..', '..', 'public', 'world-player-controller.js'));
const U = 7 / 1.8;
const DT = 1 / 60;
const YAW_PX = Math.PI / 2;           // camera yaw whose forward = +X  (fwd = (sin yaw, cos yaw))

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  PASS  ' + name + (info ? '  — ' + info : '')); }
  else { fail++; console.log('  FAIL  ' + name + (info ? '  — ' + info : '')); }
}
const NOIN = {};
const RUN = { fwd: true };
const SPRINT = { fwd: true, sprint: true };
function mk(heightAt, extra) { return build(Object.assign({ heightAt, colliders: { circles: () => [], obbs: () => [] } }, extra || {})); }

// 1. flat ground: feet stay EXACTLY at heightAt
{
  const H = () => 5 * U;
  const c = mk(H); c.setPos(0, undefined, 0);
  let maxErr = 0, allGrounded = true;
  for (let i = 0; i < 300; i++) {
    const o = c.step(DT, i < 200 ? SPRINT : NOIN, 0.7);
    maxErr = Math.max(maxErr, Math.abs(o.pos.y - H(o.pos.x, o.pos.z)));
    if (!o.grounded) allGrounded = false;
  }
  check('flat ground: feet == heightAt', maxErr === 0 && allGrounded, 'max err ' + maxErr);
}

// 2. 30° slope: walking up / down keeps feet on the ground (< 1 cm)
{
  const t = Math.tan(30 * Math.PI / 180);
  const H = (x) => x * t;
  for (const [label, yaw, inp] of [['up/run', YAW_PX, RUN], ['down/sprint', -YAW_PX, SPRINT], ['across', 0, RUN]]) {
    const c = mk(H); c.setPos(0, undefined, 0);
    let maxErr = 0, air = 0;
    for (let i = 0; i < 180; i++) {
      const o = c.step(DT, inp, yaw);
      maxErr = Math.max(maxErr, Math.abs(o.pos.y - H(o.pos.x)) / U);
      if (!o.grounded) air++;
    }
    const p = c.getPos();
    check('30° slope ' + label + ': feet on ground', maxErr < 0.01 && air === 0,
      'max err ' + (maxErr * 100).toFixed(3) + ' cm, airborne frames ' + air + ', moved ' + (Math.hypot(p.x, p.z) / U).toFixed(1) + ' m');
  }
}

// 3. 50° slope slides (no input) and cannot be walked up
{
  const t = Math.tan(50 * Math.PI / 180);
  const H = (x) => x * t;
  const c = mk(H); c.setPos(0, undefined, 0);
  let sawSlide = false;
  for (let i = 0; i < 60; i++) { const o = c.step(DT, NOIN, 0); if (o.state === 'slide') sawSlide = true; }
  const p = c.getPos();
  check('50° slope: slides downhill', sawSlide && p.x < -0.5 * U, 'x after 1 s = ' + (p.x / U).toFixed(2) + ' m, state slide seen: ' + sawSlide);
  const c2 = mk(H); c2.setPos(0, undefined, 0);
  let maxY = 0;
  for (let i = 0; i < 120; i++) { const o = c2.step(DT, SPRINT, YAW_PX); maxY = Math.max(maxY, o.pos.y); }
  check('50° slope: cannot run up it', maxY / U < 0.1, 'max height gained ' + (maxY / U).toFixed(3) + ' m');
}

// 4. curbs: 0.4 m steps up, 0.6 m blocks
for (const [hM, expectUp] of [[0.4, true], [0.6, false]]) {
  const H = (x) => (x > 0 ? hM * U : 0);
  const c = mk(H); c.setPos(-3 * U, undefined, 0);
  let o;
  for (let i = 0; i < 120; i++) o = c.step(DT, RUN, YAW_PX);
  const p = c.getPos();
  if (expectUp) check('curb ' + hM + ' m: steps up', p.x > 2 * U && Math.abs(p.y - hM * U) < 1e-9 && o.grounded, 'x=' + (p.x / U).toFixed(2) + ' m y=' + (p.y / U).toFixed(3) + ' m');
  else check('curb ' + hM + ' m: blocks', p.x < 0 && p.y === 0, 'x=' + (p.x / U).toFixed(3) + ' m y=' + (p.y / U).toFixed(3) + ' m');
}

// 5. sprint/roll into OBB walls + circles: never ends inside (1000 random runs, random dt)
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const R = 0.35 * U;
  function distToObb(b, x, z) {
    const co = Math.cos(b.rot), si = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
    const lx = dx * co - dz * si, lz = dx * si + dz * co;
    const ex = Math.max(Math.abs(lx) - b.hx, 0), ez = Math.max(Math.abs(lz) - b.hz, 0);
    const inside = Math.abs(lx) < b.hx && Math.abs(lz) < b.hz;
    return inside ? -1 : Math.hypot(ex, ez);
  }
  let worstPen = 0, insideCount = 0, frames = 0, runs = 1000;
  for (let r = 0; r < runs; r++) {
    const b = { x: 0, z: 0, hx: (0.02 + rnd() * 3) * U, hz: (0.02 + rnd() * 3) * U, rot: rnd() * Math.PI * 2 };
    const circ = rnd() < 0.3 ? [{ x: (rnd() - 0.5) * 4 * U, z: (rnd() - 0.5) * 4 * U, r: (0.1 + rnd()) * U }] : [];
    const c = build({ heightAt: () => 0, colliders: { circles: () => circ, obbs: () => [b] } });
    const ang = rnd() * Math.PI * 2, d = (6 + rnd() * 6) * U;
    c.setPos(Math.sin(ang) * d, undefined, Math.cos(ang) * d);
    const yaw = ang + Math.PI + (rnd() - 0.5) * 0.8;                 // run roughly at the box
    const dt = 1 / (20 + rnd() * 124);
    const steps = Math.ceil(3 / dt);
    for (let i = 0; i < steps; i++) {
      const inp = { fwd: true, sprint: true, roll: (i % 40) === 5, jump: rnd() < 0.02 };
      const o = c.step(dt, inp, yaw + Math.sin(i * 0.05) * 0.4);
      frames++;
      const dd = distToObb(b, o.pos.x, o.pos.z);
      if (dd < 0) insideCount++;
      else worstPen = Math.max(worstPen, R - dd);
      for (const cc of circ) { const dc = Math.hypot(o.pos.x - cc.x, o.pos.z - cc.z); worstPen = Math.max(worstPen, cc.r + R - dc); }
    }
  }
  check('sprint/roll into OBB+circle walls (1000 runs)', insideCount === 0 && worstPen < 1e-6,
    frames + ' frames, centre-inside ' + insideCount + ', worst capsule penetration ' + (worstPen / U * 1000).toFixed(4) + ' mm');
}

// 6. jump apex ≈ 1.35 m (held) + variable height on early release
{
  const c = mk(() => 0); c.setPos(0, undefined, 0);
  let apex = 0, sawJumpStart = false, landed = false;
  for (let i = 0; i < 120; i++) {
    const o = c.step(DT, { jump: true }, 0);
    apex = Math.max(apex, o.pos.y);
    if (o.state === 'jumpStart') sawJumpStart = true;
    if (i > 5 && o.events.some(e => e.type === 'land')) landed = true;
  }
  check('jump apex ≈ 1.35 m', Math.abs(apex / U - 1.35) < 0.02 && sawJumpStart && landed, 'apex ' + (apex / U).toFixed(4) + ' m');
  const c2 = mk(() => 0); c2.setPos(0, undefined, 0);
  let apex2 = 0;
  for (let i = 0; i < 120; i++) { const o = c2.step(DT, { jump: i < 6 }, 0); apex2 = Math.max(apex2, o.pos.y); }
  check('early release → lower jump', apex2 / U < 1.0, 'tap apex ' + (apex2 / U).toFixed(3) + ' m');
}

// 7. coyote time + jump buffer
{
  const H = (x) => (x < 0 ? 3 * U : 0);           // 3 m cliff edge at x=0
  const c = mk(H); c.setPos(-0.2 * U, undefined, 0);
  let left = -1, jumped = false;
  for (let i = 0; i < 40; i++) {
    const o = c.step(DT, { fwd: true, jump: left >= 0 && i === left + 4 }, YAW_PX);   // jump ~0.067 s after leaving ground
    if (left < 0 && o.events.some(e => e.type === 'leaveGround')) left = i;
    if (o.events.some(e => e.type === 'jump')) jumped = true;
  }
  check('coyote time: jump shortly after walking off a ledge', left >= 0 && jumped);
  const c2 = mk(() => 0); c2.setPos(0, 2 * U, 0);          // falling from 2 m
  let jumpedOnLand = false, landFrame = -1;
  for (let i = 0; i < 60; i++) {
    const o = c2.step(DT, { jump: true }, 0);              // held + pressed on frame 0 — too early...
    if (o.events.some(e => e.type === 'land')) landFrame = i;
    if (o.events.some(e => e.type === 'jump')) jumpedOnLand = true;
  }
  const c3 = mk(() => 0); c3.setPos(0, 2 * U, 0);
  let buffered = false, lf = -1;
  for (let i = 0; i < 60; i++) {                            // press 3 frames before landing (landing at ~frame 25)
    const o = c3.step(DT, { jump: i >= landFrame - 3 && i <= landFrame + 10 }, 0);
    if (o.events.some(e => e.type === 'jump')) buffered = true;
  }
  check('jump buffer: early press fires on landing; stale press does not', buffered && !jumpedOnLand, 'land frame ' + landFrame);
}

// 8. landing from 10 m: land event, compression > 0.8, hardLand, recovery, then decays
{
  const c = mk(() => 0); c.setPos(0, 10 * U, 0);
  let landEv = null, hard = false, compAtLand = 0, i;
  for (i = 0; i < 200 && !landEv; i++) {
    const o = c.step(DT, NOIN, 0);
    for (const e of o.events) { if (e.type === 'land') landEv = e; if (e.type === 'hardLand') hard = true; }
    if (landEv) compAtLand = o.compression;
  }
  let o2; for (let j = 0; j < 60; j++) o2 = c.step(DT, NOIN, 0);
  check('10 m fall → land event + compression > 0.8', !!landEv && compAtLand > 0.8 && hard,
    'impact ' + (landEv ? landEv.impact.toFixed(2) : '?') + ' m/s, compression ' + compAtLand.toFixed(3) + ', 1 s later ' + o2.compression.toFixed(3));
  check('compression springs back', o2.compression < 0.05);
}

// 9. roll: ≈ 7 m/s × 0.55 s on flat, then cooldown
{
  const c = mk(() => 0); c.setPos(0, undefined, 0);
  let startX = null, endX = null, t = 0, sawIF = false, sawRoll = false;
  c.setFacing(YAW_PX);                                                  // no input → roll along facing (+X)
  for (let i = 0; i < 60; i++) {
    const o = c.step(DT, { roll: i === 0 }, YAW_PX);
    t += DT;
    if (o.events.some(e => e.type === 'iframes')) sawIF = true;
    if (o.state === 'roll') sawRoll = true;
    if (i === 0) startX = 0;
    if (o.events.some(e => e.type === 'rollEnd')) { endX = o.pos.x; break; }
  }
  const dist = (endX - startX) / U;
  check('roll distance ≈ 3.85 m', Math.abs(dist - 7 * 0.55) < 0.15 && sawIF && sawRoll, 'rolled ' + dist.toFixed(3) + ' m');
  const o = c.step(DT, { roll: true }, YAW_PX);                        // immediately again → cooldown blocks
  check('roll cooldown blocks immediate re-roll', !o.events.some(e => e.type === 'roll'));
}

// 10. OBB top: stand on a platform; step onto a 0.4 m box; ledge-climb a 1.1 m box
{
  const box = { x: 3 * U, z: 0, hx: 1 * U, hz: 3 * U, rot: 0, top: 0.4 * U };
  const c = build({ heightAt: () => 0, colliders: { circles: () => [], obbs: () => [box] } });
  c.setPos(0, undefined, 0);
  let o; for (let i = 0; i < 40; i++) o = c.step(DT, RUN, YAW_PX);
  check('walk onto 0.4 m OBB top', Math.abs(o.pos.y - 0.4 * U) < 1e-9 && o.grounded, 'y=' + (o.pos.y / U).toFixed(3) + ' x=' + (o.pos.x / U).toFixed(2));

  const box2 = { x: 3 * U, z: 0, hx: 1 * U, hz: 3 * U, rot: 0, top: 1.1 * U };
  const c2 = build({ heightAt: () => 0, colliders: { circles: () => [], obbs: () => [box2] } });
  c2.setPos(0, undefined, 0);
  let climbed = false, blockedX = 0;
  for (let i = 0; i < 40; i++) { o = c2.step(DT, RUN, YAW_PX); blockedX = o.pos.x; }
  check('1.1 m OBB blocks walking', blockedX < 2 * U - 0.35 * U + 1e-6 && o.pos.y === 0, 'x=' + (blockedX / U).toFixed(3));
  let yEnd = null, gEnd = false;
  for (let i = 0; i < 80 && yEnd === null; i++) {
    o = c2.step(DT, { fwd: true, jump: i < 30 }, YAW_PX);
    if (o.events.some(e => e.type === 'climb')) climbed = true;
    if (o.events.some(e => e.type === 'climbEnd')) { yEnd = o.pos.y; gEnd = o.grounded; }
  }
  check('jump into 1.1 m ledge → climb onto it', climbed && yEnd !== null && Math.abs(yEnd - 1.1 * U) < 1e-9 && gEnd, 'y at climbEnd=' + (yEnd / U).toFixed(3));

  const box3 = { x: 3 * U, z: 0, hx: 1 * U, hz: 3 * U, rot: 0, top: 2.5 * U };
  const c3 = build({ heightAt: () => 0, colliders: { circles: () => [], obbs: () => [box3] } });
  c3.setPos(0, undefined, 0); let cl3 = false;
  let maxX3 = 0;
  for (let i = 0; i < 150; i++) { o = c3.step(DT, { fwd: true, jump: (i % 50) < 30 }, YAW_PX); maxX3 = Math.max(maxX3, o.pos.x); if (o.events.some(e => e.type === 'climb')) cl3 = true; }
  check('2.5 m wall is NOT climbable', !cl3 && maxX3 <= 1.65 * U + 1e-6, 'max x ' + (maxX3 / U).toFixed(3));
}

// 11. walking off a platform: falls, lands, state machine sane
{
  const box = { x: 0, z: 0, hx: 2 * U, hz: 2 * U, rot: 0.3, top: 2 * U };
  const c = build({ heightAt: () => 0, colliders: { circles: () => [], obbs: () => [box] } });
  c.setPos(0, 2 * U, 0);
  const states = new Set(); let o;
  for (let i = 0; i < 120; i++) { o = c.step(DT, RUN, YAW_PX); states.add(o.state); }
  check('walk off 2 m platform → airborne → land → run', states.has('airborne') && o.grounded && o.pos.y === 0 && o.state === 'run', [...states].join(','));
}

// 12. stamina: sprint drains in ~8 s then falls back to run
{
  const c = mk(() => 0); c.setPos(0, undefined, 0);
  let emptyAt = -1, o;
  for (let i = 0; i < 600; i++) { o = c.step(DT, SPRINT, 0); if (emptyAt < 0 && o.events.some(e => e.type === 'staminaEmpty')) emptyAt = i * DT; }
  check('stamina empties ≈ 8 s, then run speed', Math.abs(emptyAt - 8) < 0.1 && Math.abs(o.speedMs - 6.5) < 0.01, 'empty at ' + emptyAt.toFixed(2) + ' s, speed ' + o.speedMs.toFixed(2) + ' m/s');
}

// 13. swim handoff
{
  const H = (x) => (x > 0 ? -3 * U : 0);           // deep water past x=0
  const c = mk(H, { waterHeightAt: () => -0.2 * U });
  c.setPos(-1 * U, undefined, 0);
  let o, swam = false;
  for (let i = 0; i < 120; i++) { o = c.step(DT, RUN, YAW_PX); if (o.state === 'swim') swam = true; }
  check('deep water → swim at 2.5 m/s, buoyant', swam && Math.abs(o.speedMs - 2.5) < 0.01 && Math.abs(o.pos.y - (-0.2 - 1.25) * U) < 1e-9, 'speed ' + o.speedMs.toFixed(2) + ' y=' + (o.pos.y / U).toFixed(2));
}

// 14. perf sanity: 100 circles + 50 obbs, 10k steps
{
  const circles = [], obbs = [];
  for (let i = 0; i < 100; i++) circles.push({ x: Math.cos(i) * 200, z: Math.sin(i * 1.3) * 200, r: 5 });
  for (let i = 0; i < 50; i++) obbs.push({ x: Math.cos(i * 2.1) * 150, z: Math.sin(i * 0.7) * 150, hx: 4, hz: 6, rot: i });
  const c = build({ heightAt: (x, z) => Math.sin(x * 0.01) * 10 + Math.cos(z * 0.013) * 8, colliders: { circles: () => circles, obbs: () => obbs } });
  c.setPos(0, undefined, 0);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 10000; i++) c.step(DT, { fwd: true, sprint: (i % 900) < 400, left: (i % 300) < 50, jump: (i % 120) === 0 }, i * 0.003);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('perf: 10k steps', ms < 2000, (ms / 10000 * 1000).toFixed(1) + ' µs/step');
}

// 15. fixed timestep: same result regardless of render frame rate
{
  function runAt(dt) {                                            // y at every 4th physics tick (shared by 30/60/120 fps)
    const c = mk((x, z) => Math.sin(x * 0.05) * 3);
    c.setPos(0, undefined, 0);
    const rec = {}; let ticks = 0;
    const frames = Math.round(2 / dt);
    for (let f = 0; f < frames; f++) { const t = f * dt; const o = c.step(dt, { fwd: true, jump: t > 0.5 - 1e-6 && t < 1.0 - 1e-6 }, YAW_PX); ticks += o.ticks; if (ticks % 4 === 0) rec[ticks] = o.pos.y; }
    return { x: c.getPos().x, rec };
  }
  const a = runAt(1 / 60), b = runAt(1 / 30), d = runAt(1 / 120);
  let maxDy = 0, apex = 0;
  for (const k in a.rec) { maxDy = Math.max(maxDy, Math.abs(a.rec[k] - b.rec[k]), Math.abs(a.rec[k] - d.rec[k])); apex = Math.max(apex, a.rec[k]); }
  check('fixed timestep: 30/60/120 fps give the same trajectory', Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.x - d.x) < 1e-6 && maxDy < 1e-9 && apex > 0,
    'x=' + (a.x / U).toFixed(4) + ' m at all rates, max y diff ' + maxDy.toExponential(1));
  const c = mk(() => 0); c.setPos(0, undefined, 0);
  const o = c.step(1 / 144, RUN, YAW_PX);
  check('renderPos interpolates between ticks', o.renderPos && isFinite(o.renderPos.x) && o.renderPos.x <= c.getPos().x + 1e-12);
}

// 16. rotation convention: local x axis = (cos rot, -sin rot)
{
  const rot = 0.6;
  const box = { x: 0, z: 0, hx: 10 * U, hz: 0.5 * U, rot };      // a long thin wall along local x
  const c = build({ heightAt: () => 0, colliders: { circles: () => [], obbs: () => [box] } });
  const ax = Math.cos(rot), az = -Math.sin(rot);                   // local x axis in world
  c.setPos(ax * 8 * U, undefined, az * 8 * U);                     // standing ON the wall line 8 m along it → pushed out sideways only
  c.step(DT, NOIN, 0);
  const p = c.getPos();
  const along = p.x * ax + p.z * az, side = p.x * -az + p.z * ax;
  check('OBB rot convention (local x = (cos,-sin))', Math.abs(along - 8 * U) < 1e-6 && Math.abs(Math.abs(side) - (0.5 + 0.35) * U) < 1e-6,
    'along ' + (along / U).toFixed(3) + ' m, side ' + (side / U).toFixed(3) + ' m');
}

// 17. world adapter: realm boxes + tops, stand-alone decks, hub colliders
{
  const win = {
    WORLD_LAYOUT: { realmColliders: [
      { x: 10 * U, z: 0, hx: 2 * U, hz: 2 * U, rot: 0.3, label: 'canon:block' },
      { x: -10 * U, z: 0, r: 1 * U, label: 'tree' },
    ] },
    WORLD_WALKABLE_TOPS: [
      { type: 'obb', x: 10 * U, z: 0, hx: 2 * U, hz: 2 * U, rot: 0.3, top: 1.0 * U, kind: 'block' },
      { type: 'circle', x: 0, z: 20 * U, r: 4 * U, top: 5 * U, kind: 'deck' },
    ],
    __hubColliders: [{ cx: 0, cz: -10 * U, r: 1 * U }],
  };
  const adapter = build.worldColliders(win);
  const cs = adapter.circles(), bs = adapter.obbs();
  check('adapter: box gets roof top; tree + hub + deck circles', bs.length === 1 && bs[0].top === 1.0 * U && cs.length === 3 && cs.some(c => c.label && c.label.indexOf('deck') === 0 && c.bottom < 5 * U));
  const c = build({ heightAt: () => 0, colliders: adapter });
  c.setPos(0, undefined, 20 * U);
  let o; for (let i = 0; i < 30; i++) o = c.step(DT, RUN, 0);
  check('adapter: walk UNDER a raised deck', o.pos.y === 0 && c.getPos().z > 22 * U, 'z=' + (c.getPos().z / U).toFixed(2));
  c.setPos(0, 5 * U, 20 * U);
  o = c.step(DT, NOIN, 0);
  check('adapter: stand ON the raised deck', o.grounded && o.pos.y === 5 * U);
  c.setPos(10 * U, 1.0 * U, 0);
  for (let i = 0; i < 10; i++) o = c.step(DT, NOIN, 0);
  check('adapter: stand on the roof of a solid canon block', o.grounded && o.pos.y === 1.0 * U);
  c.setPos(0, undefined, -14 * U);
  for (let i = 0; i < 90; i++) o = c.step(DT, RUN, 0);
  const dz = Math.hypot(c.getPos().x, c.getPos().z + 10 * U);
  check('adapter: hub collider is solid', dz >= (1 + 0.35) * U - 1e-6, 'dist ' + (dz / U).toFixed(3) + ' m');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
