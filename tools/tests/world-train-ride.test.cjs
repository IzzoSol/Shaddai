'use strict';
/**
 * tools/tests/world-train-ride.test.cjs — the WALKABLE maglev ride (public/world-transit.js + public/world-train-v2.js).
 * Loads both classic scripts in a vm context against the REAL three.js (tools/ual/node_modules/three), with a fake
 * layout / DOM / keyboard registry. Same pattern as world-sky-traffic.test.cjs.
 * Run: node tools/tests/world-train-ride.test.cjs < /dev/null   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const PM = 7 / 1.8;
const THREE_REAL = require(path.join(ROOT, 'tools', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

function makeCountingTHREE(real) {
  const counts = {};
  const wrapped = Object.assign({}, real);
  ['Vector3', 'Quaternion', 'Matrix4', 'Color', 'Euler'].forEach((name) => {
    counts[name] = 0;
    wrapped[name] = new Proxy(real[name], { construct(t, a, nt) { counts[name]++; return Reflect.construct(t, a, nt); } });
  });
  return { THREE: wrapped, counts };
}

// fake DOM: canvas stubs for the station name boards, a body that records appends, a counter on createElement
function fakeDocument(stats) {
  const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
  return {
    createElement(tag) {
      stats.created++;
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ctx2d };
      const el = { style: {}, innerHTML: '', _l: {}, remove() { stats.removed++; }, addEventListener(t, f) { this._l[t] = f; } };
      return el;
    },
    body: { appendChild() { stats.appended++; } },
    exitPointerLock() { stats.unlocked++; },
  };
}

function load(opts) {
  opts = opts || {};
  const THREE = opts.THREE || THREE_REAL;
  const stats = { created: 0, appended: 0, removed: 0, unlocked: 0, toasts: [] };
  const listeners = [];
  const R = 1150;
  const window = {
    WORLD_LAYOUT: {
      transit: { radius: R }, realmColliders: [], biomes: [], city: { radius: 650 }, landmark: () => null,
      stations: [
        { id: 'central', name: 'Central Station', pos: [700, 0] },
        { id: 'east', name: 'East Terminal', pos: [R, 0] },
        { id: 'north', name: 'North Halt', pos: [0, R] },
        { id: 'west', name: 'West Station', pos: [-R, 0] },
      ],
    },
    __w3dDebug: { playerPos: new THREE_REAL.Vector3(R - 30, 0, 0) },
    __toast: (m) => stats.toasts.push(m),
    enterPlayMode: () => { stats.play = (stats.play || 0) + 1; },
  };
  if (opts.dragons) window.__dragons = opts.dragons;
  const ctx = { window, Math, console, document: fakeDocument(stats), addEventListener: (type, fn, cap) => listeners.push({ type, fn, cap }) };
  vm.createContext(ctx);
  ['world-train-v2.js', 'world-transit.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'), ctx, { filename: f }));
  const scene = { add() {}, remove() {} };
  const api = window.buildWorldTransit({ THREE, scene, heightAt: () => 0 });
  let train = null;
  if (opts.glb) { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(3, 4, 60), new THREE.MeshStandardMaterial())); api.setTrainModel(g, 60); }
  else { train = window.buildMaglevTrainV2({ THREE }); api.setTrainModel(train, train.userData.lengthM, 1); }
  function key(code) {
    const ev = { code, key: code, repeat: false, stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
    for (const l of listeners) { if (l.type !== 'keydown') continue; l.fn(ev); if (ev.stopped) break; }
    return ev;
  }
  const station = (id) => api.stations.find((s) => s.id === id);
  return { window, api, train, ud: train && train.userData, key, stats, station, P: window.__w3dDebug.playerPos, THREE };
}

// walk in MODEL space direction (mx, mz) using the host camYaw convention (world dir → atan2(x, z))
function camYawFor(W, mx, mz) {
  const tr = W.api._debug.trains[0], a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  W.api._debug.toWorld(tr, 0, 0, 0, a); W.api._debug.toWorld(tr, mx, 0, mz, b);
  return Math.atan2(b.x - a.x, b.z - a.z);
}
function walkFor(W, mx, mz, secs, sprint) {
  const dt = 1 / 30;
  for (let i = 0; i < secs * 30; i++) { W.api.update(i * dt, dt); W.api.walk(dt, { fwd: true, sprint: !!sprint }, camYawFor(W, mx, mz)); }
}
function run(W, secs) { const dt = 1 / 30; for (let i = 0; i < secs * 30; i++) W.api.update(i * dt, dt); }
function board(W, from, to) {   // start a ride, walk in through the door, wait until the doors shut
  W.api.ride(W.station(from || 'east'), W.station(to || 'north'));
  const side = W.api.aboardInfo().side;
  run(W, 1);                    // doors open
  walkFor(W, -side, 0, 1.3);    // walk in off the platform
  run(W, 2);                    // doors close → 'run'
}
function expectedWorld(W) {   // three.js ground truth: model point through the clone's real matrixWorld
  const w = W.api._debug.trains[0].cars[0], ab = W.api._debug.ab;
  w.updateMatrixWorld(true);
  return new THREE_REAL.Vector3(ab.x, ab.y, ab.z).applyMatrix4(w.children[0].matrixWorld);
}

(function main() {
  test('seat classes: standard 2+2, lounge sofas, window-bar stools, 2 pilot seats — all inside their car', () => {
    const W = load(), ud = W.ud, cab = ud.cabin, k = {};
    ud.seats.forEach((s) => { k[s.kind] = (k[s.kind] || 0) + 1; });
    assert.ok(k.standard >= 100, 'standard ' + k.standard); assert.ok(k.lounge >= 8, 'lounge ' + k.lounge);
    assert.ok(k.bar >= 8, 'bar ' + k.bar); assert.strictEqual(k.pilot, 2);
    ud.seats.forEach((s, i) => {
      const c = cab.cars[s.car];
      assert.ok(s.z > c.z0 && s.z < c.z1, 'seat ' + i + ' outside car ' + s.car + ' z');
      assert.ok(Math.abs(s.x) < cab.halfW && s.y > cab.floorY && s.y < cab.floorY + 1, 'seat ' + i + ' outside cabin x/y');
      if (s.kind === 'lounge' || s.kind === 'bar') assert.ok(c.lounge, s.kind + ' seat not in the lounge car');
      if (s.kind === 'lounge') assert.ok(Math.abs(Math.abs(Math.sin(s.yaw)) - 1) < 1e-9 && Math.sign(Math.sin(s.yaw)) === -Math.sign(s.x), 'sofa must face across the car');
      if (s.kind === 'bar') assert.ok(Math.sign(Math.sin(s.yaw)) === Math.sign(s.x), 'stool must face the window');
      if (s.kind === 'pilot') assert.ok(Math.sign(Math.cos(s.yaw)) === Math.sign(c.nose), 'pilot must face its nose');
      assert.ok(W.api._debug.ok(s.ax, s.az), 'seat ' + i + ' (' + s.kind + ') stand-up spot is not walkable');
    });
  });

  test('boarding: doors open, the player walks in from the platform, doors shut, train departs', () => {
    const W = load();
    W.api.ride(W.station('east'), W.station('north'));
    let I = W.api.aboardInfo();
    assert.strictEqual(I.phase, 'board'); assert.ok(W.api.aboard());
    assert.ok(Math.abs(I.x) > W.ud.cabin.A, 'starts outside, on the platform');
    assert.ok(Math.abs(I.y - W.api._debug.platY) < 1e-9);
    const side = I.side;
    // platform is the inner (city) side of the ring
    const a = { x: 0, y: 0, z: 0 }; W.api._debug.toWorld(W.api._debug.trains[0], side * 3, 0, 0, a);
    const b = { x: 0, y: 0, z: 0 }; W.api._debug.toWorld(W.api._debug.trains[0], -side * 3, 0, 0, b);
    assert.ok(Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z));
    run(W, 1); assert.ok(W.api.aboardInfo().doors > 0.85, 'doors open');
    walkFor(W, -side, 0, 1.3);
    I = W.api.aboardInfo(); assert.ok(Math.abs(I.x) < W.ud.cabin.halfW, 'walked in'); assert.ok(Math.abs(I.y - W.ud.cabin.floorY) < 1e-9, 'on the cabin floor');
    run(W, 2);
    assert.strictEqual(W.api.aboardInfo().phase, 'run');
    run(W, 2); assert.ok(W.api.aboardInfo().doors < 0.05, 'doors shut while running');
  });

  test('player world position tracks the moving train (standing) — matches three.js matrices', () => {
    const W = load(); board(W);
    const p0 = W.P.clone();
    run(W, 5);
    assert.ok(W.P.distanceTo(p0) > 20 * PM, 'player should have travelled with the train (moved ' + W.P.distanceTo(p0).toFixed(1) + ')');
    const e = expectedWorld(W);
    assert.ok(W.P.distanceTo(e) < 1e-6, 'standing: off by ' + W.P.distanceTo(e));
  });

  test('player world position tracks the moving train (seated)', () => {
    const W = load(); board(W);
    const ev = W.key('KeyE'); assert.ok(ev.stopped, 'E consumed aboard');
    const I = W.api.aboardInfo(); assert.ok(I.seat >= 0, 'sat down');
    const s = W.ud.seats[I.seat]; assert.ok(Math.abs(I.x - s.x) < 1e-9 && Math.abs(I.z - s.z) < 1e-9);
    const p0 = W.P.clone(); run(W, 4);
    assert.ok(W.P.distanceTo(p0) > 10 * PM);
    assert.ok(W.P.distanceTo(expectedWorld(W)) < 1e-6);
    const w0 = W.P.clone(); W.api.walk(1 / 30, { fwd: true }, 0);   // seated: WASD does not move you
    assert.ok(W.P.distanceTo(w0) < 1e-9);
    assert.ok(typeof W.api.seatYaw() === 'number');
  });

  test('walking is clamped by the interior colliders (walls, seat rows, closed doors)', () => {
    const W = load(); board(W);
    const ab = W.api._debug.ab, cab = W.ud.cabin;
    // standard car aisle, clear of doors: shove sideways into the seat rows / wall for 3 s each way
    const row = W.ud.seats.find((s) => s.kind === 'standard' && s.car === 1);
    ab.x = 0; ab.z = row.z; W.api.walk(1 / 30, {}, 0);
    [1, -1].forEach((sd) => {
      walkFor(W, sd, 0, 3, true);
      assert.ok(Math.abs(ab.x) < 0.37 - 0.2, 'walked into the seat row: x=' + ab.x.toFixed(3));
      ab.x = 0;
    });
    // at a CLOSED door (running) you cannot step outside the cabin
    const door = W.ud.doors.find((d) => d.car === 1 && d.side === 1);
    ab.x = 0; ab.z = door.z; walkFor(W, 1, 0, 3, true);
    assert.ok(ab.x < cab.halfW, 'passed a closed door: x=' + ab.x);
    ab.x = 0; ab.z = door.z; walkFor(W, -1, 0, 3, true);
    assert.ok(ab.x > -cab.halfW, 'passed a closed door: x=' + ab.x);
    // along the aisle: through the gangway into the next car, but never out the front of the cockpit
    ab.x = 0; ab.z = row.z; walkFor(W, 0, 1, 40, true);
    const front = cab.cars[3].z1 - 11 - 0 + 2.6;   // nose car: cabin end + cockpit depth
    assert.ok(ab.z > cab.cars[2].z1, 'walked through the gangways (z=' + ab.z.toFixed(2) + ')');
    assert.ok(ab.z < front, 'walked out of the cockpit front (z=' + ab.z.toFixed(2) + ')');
    // every position visited is legal
    assert.ok(W.api._debug.ok(ab.x, ab.z));
  });

  test('E sits you in the NEAREST FREE seat; E again stands you up at the aisle', () => {
    const W = load(); board(W);
    const ab = W.api._debug.ab, occ = W.api._debug.occ();
    const lounge = W.ud.seats.map((s, i) => [s, i]).filter(([s]) => s.kind === 'lounge');
    const [s0, i0] = lounge[1];
    ab.x = s0.ax; ab.z = s0.az;
    const d2 = (s) => (s.x - ab.x) ** 2 + (s.z - ab.z) ** 2;
    const order = W.ud.seats.map((s, i) => [d2(s), i]).sort((a, b) => a[0] - b[0]);
    assert.strictEqual(order[0][1], i0, 'fixture: nearest seat is the lounge sofa seat');
    W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().seat, i0); assert.strictEqual(W.api.aboardInfo().kind, 'lounge');
    W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().seat, -1);
    assert.ok(Math.abs(ab.x - s0.ax) < 1e-9 && Math.abs(ab.z - s0.az) < 1e-9, 'stood up at the aisle spot');
    occ[i0] = true;   // someone else took it
    W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().seat, order[1][1], 'should pick the next nearest free seat');
    W.key('KeyE');
    // bar stool + pilot seat are sittable too
    const bar = W.ud.seats.findIndex((s) => s.kind === 'bar'), pil = W.ud.seats.findIndex((s) => s.kind === 'pilot');
    ab.x = W.ud.seats[bar].ax; ab.z = W.ud.seats[bar].az; W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().kind, 'bar'); W.key('KeyE');
    ab.x = W.ud.seats[pil].ax; ab.z = W.ud.seats[pil].az; W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().kind, 'pilot'); W.key('KeyE');
    // nothing within reach → stays standing
    ab.x = 0; ab.z = W.ud.cabin.cars[1].z1 + 0.5;   // gangway
    const nearest = Math.min(...W.ud.seats.map((s) => Math.hypot(s.x - ab.x, s.z - ab.z)));
    if (nearest > 1.8) { W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().seat, -1); }
  });

  test('arrival: doors open on the platform side, walking out releases you at the destination station', () => {
    const W = load(); board(W, 'east', 'north');
    W.key('KeyE'); assert.ok(W.api.aboardInfo().seat >= 0);
    run(W, 25);   // east → north is a 20 s ride (min duration)
    const I = W.api.aboardInfo(); assert.strictEqual(I.phase, 'arrive');
    run(W, 1); assert.ok(W.api.aboardInfo().doors > 0.85);
    W.key('KeyE'); assert.strictEqual(W.api.aboardInfo().seat, -1, 'stand up');
    const ab = W.api._debug.ab, door = W.ud.doors.filter((d) => d.side === I.side).sort((a, b) => Math.abs(a.z - ab.z) - Math.abs(b.z - ab.z))[0];
    ab.x = 0; ab.z = door.z;
    walkFor(W, I.side, 0, 3);
    assert.ok(!W.api.aboard(), 'released');
    const n = W.station('north'); assert.ok(Math.abs(W.P.x - n.x) < 1e-6 && Math.abs(W.P.z - n.z) < 1e-6, 'set down at North Halt');
    assert.ok(W.stats.toasts.some((t) => /Arrived: North Halt/.test(t)));
    // seat freed, train keeps looping
    assert.ok(W.api._debug.occ().every((o) => !o));
    run(W, 1);
  });

  test('arrival: staying aboard 45 s after the doors open auto-releases onto the platform', () => {
    const W = load(); board(W, 'east', 'north');
    run(W, 70 + 46);
    assert.ok(!W.api.aboard());
    const n = W.station('north'); assert.ok(Math.abs(W.P.x - n.x) < 1e-6);
  });

  test('HUD / map / phone / inventory / chat keys are NOT consumed while riding; nothing hidden, no camera override', () => {
    const W = load();
    const before = { created: W.stats.created, appended: W.stats.appended };
    board(W);
    ['KeyM', 'KeyC', 'KeyI', 'KeyP', 'Tab', 'KeyT', 'KeyJ', 'Escape', 'KeyN', 'KeyG', 'KeyV', 'Digit1', 'KeyH', 'KeyB', 'KeyO', 'Backquote', 'Enter'].forEach((code) => {
      const ev = W.key(code);
      assert.ok(!ev.stopped && !ev.prevented, code + ' was swallowed by the ride');
    });
    assert.ok(W.key('KeyE').stopped, 'E is the one key the ride owns');
    assert.strictEqual(W.window.__probeCam, undefined, 'walkable ride must not take over the camera');
    assert.strictEqual(W.stats.created, before.created, 'ride created DOM');
    assert.strictEqual(W.stats.appended, before.appended, 'ride appended DOM (overlay over the HUD)');
    assert.strictEqual(W.stats.unlocked, 0, 'ride released the pointer');
  });

  test('update() + walk() allocate no THREE objects across board → run → arrive → release', () => {
    const { THREE, counts } = makeCountingTHREE(THREE_REAL);
    const W = load({ THREE });
    W.api.ride(W.station('east'), W.station('west'));
    Object.keys(counts).forEach((k) => { counts[k] = 0; });
    const side = W.api.aboardInfo().side, dt = 1 / 30, yIn = camYawFor(W, -side, 0);
    for (let i = 0; i < 30 * 80; i++) {
      W.api.update(i * dt, dt);
      W.api.walk(dt, { fwd: i < 90, left: i % 200 > 150, sprint: i % 3 === 0 }, yIn);
      W.api.aboardYawDelta(); W.api.aboardInfo(); W.api.seatYaw();
    }
    Object.keys(counts).forEach((k) => assert.strictEqual(counts[k], 0, 'constructed ' + counts[k] + ' THREE.' + k));
  });

  test('view turns with the train: yaw delta equals the train heading change', () => {
    const W = load(); board(W);
    const w = W.api._debug.trains[0].cars[0]; let y0 = w.rotation.y, sum = 0;
    for (let i = 0; i < 90; i++) { W.api.update(i / 30, 1 / 30); sum += W.api.aboardYawDelta(); }
    assert.ok(Math.abs(sum - (w.rotation.y - y0)) < 1e-9 && Math.abs(sum) > 1e-4, 'sum ' + sum);
  });

  test('dragon gate kept: a guarded destination refuses the ride', () => {
    const W = load({ dragons: { isOpen: (id) => id !== 'north' } });
    W.api.ride(W.station('east'), W.station('north'));
    assert.ok(!W.api.aboard() && W.api.status() === null);
    assert.ok(W.stats.toasts.some((t) => /dragon guards/.test(t)));
  });

  test('downloaded-GLB fallback (no interior) keeps the legacy camera-follow ride', () => {
    const W = load({ glb: true });
    W.api.ride(W.station('east'), W.station('north'));
    assert.ok(!W.api.aboard(), 'GLB has no walkable interior');
    run(W, 1); assert.ok(W.window.__probeCam, 'legacy follow cam');
    run(W, 13); assert.ok(!W.window.__probeCam && W.api.status() === null);
    const n = W.station('north'); assert.ok(Math.abs(W.P.x - n.x) < 1e-6);
  });

  test('addStation hook: an underground stop is served, sets y and calls onArrive', () => {
    const W = load(); let arrived = null;
    const st = W.api.addStation({ id: 'colosseum', name: 'Colosseum Underground', x: 0, z: -900, underground: true, y: -8, onArrive: (s) => { arrived = s.id; } });
    assert.ok(st && W.station('colosseum') === st && st.underground);
    assert.strictEqual(W.api.addStation({ id: 'x' }), null, 'rejects a stop without coordinates');
    board(W, 'east', 'colosseum');
    run(W, 70); run(W, 46);
    assert.ok(!W.api.aboard()); assert.strictEqual(arrived, 'colosseum');
    assert.ok(Math.abs(W.P.x) < 1e-6 && Math.abs(W.P.z + 900) < 1e-6 && W.P.y === -8);
    assert.ok(W.api.removeStation('colosseum') && !W.station('colosseum'));
    assert.ok(!W.api.removeStation('east'), 'built-in stations cannot be removed');
  });
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
