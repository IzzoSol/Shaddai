'use strict';
/**
 * tools/tests/world-sky-traffic.test.cjs — tests for public/world-sky-traffic.js.
 * Loads the classic script in a vm context (same pattern as world-goto.test.cjs), against the
 * REAL three.js build in tools/ual/node_modules/three/build/three.cjs (not a stub), with a fake
 * GLTFLoader that resolves synchronously using real THREE.Mesh/BufferGeometry/Material so the
 * InstancedMesh construction path is exercised for real.
 * Run: node tools/tests/world-sky-traffic.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const U = 7 / 1.8;
const THREE_REAL = require(path.join(ROOT, 'tools', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

// ---- counting THREE wrapper: proxies a handful of ctors so we can prove update() allocates none ----
function makeCountingTHREE(real) {
  const counts = {};
  const wrapped = Object.assign({}, real);
  ['Vector3', 'Quaternion', 'Matrix4', 'Color'].forEach((name) => {
    counts[name] = 0;
    const Target = real[name];
    wrapped[name] = new Proxy(Target, {
      construct(target, args, newTarget) { counts[name]++; return Reflect.construct(target, args, newTarget); },
    });
  });
  return { THREE: wrapped, counts };
}

function fakeScene() {
  const children = [];
  return { children, add: (o) => children.push(o), remove: (o) => { const i = children.indexOf(o); if (i >= 0) children.splice(i, 1); } };
}

// Fake GLTFLoader: resolves synchronously with a real THREE.Mesh (real geometry+material) so
// mesh.geometry/mesh.material/mesh.isMesh all behave exactly like a real GLTFLoader result.
function fakeLoader(THREE) {
  return {
    load(url, onLoad) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      const group = new THREE.Group();
      group.add(mesh);
      onLoad({ scene: group });
    },
  };
}

function loadModule(THREE) {
  const window = {};
  const ctx = { window, Math, console };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-sky-traffic.js'), 'utf8'), ctx, { filename: 'world-sky-traffic.js' });
  return window.buildWorldSkyTraffic;
}

function buildDefault(THREE, extra) {
  const build = loadModule(THREE);
  const scene = fakeScene();
  const loader = fakeLoader(THREE);
  const heightAt = () => 0; // flat ground, game units
  const opts = Object.assign({ THREE, scene, loader, heightAt }, extra);
  return build(opts);
}

(function main() {
  test('build: 5 ship types load synchronously, 20 ships total, ready', () => {
    const traffic = buildDefault(THREE_REAL);
    const s = traffic.stats();
    assert.strictEqual(s.lanes, 12, 'expected 4 ring + 8 commuter lanes');
    assert.strictEqual(s.shipsTotal, 20, 'expected exactly 20 ships total (halved for perf)');
    assert.strictEqual(s.shipsReady, 20, 'all 5 ship types should be ready with the fake loader');
    ['chopper', 'cross', 'gunbike', 'tracer', 'pyramidship'].forEach((id) => {
      assert.ok(s.types[id] && s.types[id].ready, id + ' should be ready');
    });
  });

  test('lanes are closed loops: sampleLane(t) wraps continuously across t=1→0', () => {
    const traffic = buildDefault(THREE_REAL);
    const lanes = traffic._debug.lanes, sampleLane = traffic._debug.sampleLane;
    lanes.forEach((lane, idx) => {
      const a = { x: 0, z: 0, tx: 0, tz: 0 }, b = { x: 0, z: 0, tx: 0, tz: 0 };
      sampleLane(lane, 0, a);
      sampleLane(lane, 1, b); // t mod 1 => identical to t=0
      assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9, 'lane ' + idx + ' t=0 vs t=1 should be identical');
      // also check continuity right across the seam (no positional jump)
      const c = { x: 0, z: 0, tx: 0, tz: 0 }, d = { x: 0, z: 0, tx: 0, tz: 0 };
      sampleLane(lane, 0.999999, c);
      sampleLane(lane, 0.000001, d);
      const jump = Math.hypot(d.x - c.x, d.z - c.z);
      assert.ok(jump < 1, 'lane ' + idx + ' seam jump too large: ' + jump + ' units');
    });
  });

  test('positions stay finite and within the 60-140 m altitude band over 5 minutes of updates', () => {
    const traffic = buildDefault(THREE_REAL);
    const dt = 1 / 30;
    for (let i = 0; i < 300 * 30; i++) traffic.update(dt);
    const ships = traffic._debug.ships;
    assert.strictEqual(ships.length, 20);
    let minAltM = Infinity, maxAltM = -Infinity;
    ships.forEach((w) => {
      assert.ok(isFinite(w.x) && isFinite(w.y) && isFinite(w.z), 'non-finite ship position');
      const altM = (w.y - 0) / U; // heightAt() is flat 0 here
      minAltM = Math.min(minAltM, altM); maxAltM = Math.max(maxAltM, altM);
      assert.ok(altM >= 60 - 1e-6 && altM <= 140 + 1e-6, 'altitude out of band: ' + altM.toFixed(2) + ' m');
    });
    console.log('       altitude band observed: ' + minAltM.toFixed(1) + '–' + maxAltM.toFixed(1) + ' m');
  });

  test('update() allocates no Vector3/Quaternion/Matrix4/Color after build (per-frame allocation-free)', () => {
    const { THREE, counts } = makeCountingTHREE(THREE_REAL);
    const traffic = buildDefault(THREE);
    // reset counts post-build (module-scope scratch + per-instance construction all happens in build)
    Object.keys(counts).forEach((k) => { counts[k] = 0; });
    const dt = 1 / 30;
    for (let i = 0; i < 500; i++) traffic.update(dt);
    Object.keys(counts).forEach((k) => {
      assert.strictEqual(counts[k], 0, 'update() constructed ' + counts[k] + ' new THREE.' + k + '() instances');
    });
  });

  test('night factor ramps running-light emissiveIntensity 0..1', () => {
    let nightVal = 0;
    const traffic = buildDefault(THREE_REAL, { nightFactor: () => nightVal });
    traffic.update(1 / 30);
    const dayEm = traffic._debug.types.chopper.material.emissiveIntensity;
    nightVal = 1;
    traffic.update(1 / 30);
    const nightEm = traffic._debug.types.chopper.material.emissiveIntensity;
    assert.ok(nightEm > dayEm, 'night emissive (' + nightEm + ') should exceed day emissive (' + dayEm + ')');
    assert.ok(dayEm >= 0.14 && dayEm <= 0.16, 'day baseline ~0.15, got ' + dayEm);
    assert.ok(nightEm >= 0.99, 'full night should be ~1.0, got ' + nightEm);
  });

  test('far-away ships (> 2.5 km from player) throttle to 2 Hz instead of every frame', () => {
    // player parked far outside everything (10 km away) so ALL ships are "far"
    const traffic = buildDefault(THREE_REAL, { getPlayer: () => ({ pos: { x: 10000 * U, y: 0, z: 10000 * U } }) });
    const ship = traffic._debug.ships[0];
    const dt = 1 / 30;
    traffic.update(dt); // first call always applies (slowAcc crosses threshold from 0 only after accumulating)
    const tAfterFirst = ship.t;
    let changed = 0;
    for (let i = 0; i < 14; i++) { // 14 more frames @1/30s = ~0.467s, under the 0.5s flush window
      const before = ship.t;
      traffic.update(dt);
      if (ship.t !== before) changed++;
    }
    assert.ok(changed <= 2, 'far ship advanced on ' + changed + '/14 sub-0.5s frames — should mostly hold');
  });

  test('near ships (inside 2.5 km) update every call', () => {
    const traffic = buildDefault(THREE_REAL, { getPlayer: () => ({ pos: { x: 0, y: 0, z: 0 } }) });
    // ring-lane ships (max r=1550 m) are always "near" (< 2.5 km) from the origin
    const ring0 = traffic._debug.ships.find((w) => w.lane.type === 'ring');
    const dt = 1 / 30;
    let changed = 0, prev = ring0.t;
    for (let i = 0; i < 10; i++) { traffic.update(dt); if (ring0.t !== prev) changed++; prev = ring0.t; }
    assert.strictEqual(changed, 10, 'near ring ship should advance every single frame');
  });

  test('dispose() removes the group from the scene', () => {
    const scene = fakeScene();
    const build = loadModule(THREE_REAL);
    const traffic = build({ THREE: THREE_REAL, scene, loader: fakeLoader(THREE_REAL), heightAt: () => 0 });
    assert.ok(scene.children.indexOf(traffic.group) >= 0);
    traffic.dispose();
    assert.ok(scene.children.indexOf(traffic.group) === -1);
  });
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
