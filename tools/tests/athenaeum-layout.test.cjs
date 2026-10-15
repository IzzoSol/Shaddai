/* athenaeum-layout.test.cjs — node tools/tests/athenaeum-layout.test.cjs
 * Pure layout checks: no three, no browser. Proves every station is reachable and nothing is walled off. */
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const L = require(path.join(ROOT, 'public/athenaeum-layout.js'));
const { FACULTY } = require(path.join(ROOT, 'backend/lib/academy/faculty.js'));
const { ROOMS: PRESS_ROOMS } = require(path.join(ROOT, 'backend/lib/academy/press.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
const C = L.build();

test('six wings plus apse and gate, unique ids and angles', () => {
  assert.strictEqual(C.wings.length, 6);
  assert.strictEqual(new Set(C.wings.map((w) => w.id)).size, 6);
  assert.deepStrictEqual(C.wings.map((w) => w.angleDeg), [30, 90, 150, 210, 270, 330]);
  assert.ok(C.apse && C.gate);
});

test('every faculty room exists, with its own agent, and the extra rooms are named', () => {
  const rooms = new Map(C.rooms.map((r) => [r.id, r]));
  for (const f of FACULTY) {
    assert.ok(rooms.has(f.room), 'missing room ' + f.room);
    if (f.room !== 'trading-desk') assert.strictEqual(rooms.get(f.room).agent, f.agent);
  }
  assert.strictEqual(rooms.get('trading-desk').agent, 'ZEROX');
  for (const extra of ['music-hall', 'admin-office', 'arcade-concourse']) assert.ok(rooms.has(extra), extra);
});

test('stations have unique ids, valid kinds, and sit inside the walkable area but outside colliders', () => {
  const kinds = new Set(['lectern', 'press', 'pods', 'directory', 'teachers', 'trophy', 'trading', 'import', 'admin', 'navi', 'dais', 'portal']);
  assert.strictEqual(new Set(C.stations.map((s) => s.id)).size, C.stations.length);
  for (const s of C.stations) {
    assert.ok(kinds.has(s.kind), 'bad kind ' + s.kind);
    assert.ok(C.contains(s.x, s.z), s.id + ' is outside the building');
    assert.ok(!C.blockedAt(s.x, s.z, 0), s.id + ' is inside a collider');
    assert.ok(s.r >= 2 && s.r <= 6, s.id + ' activation radius');
  }
});

test('press stations are in real Press rooms (matches the backend)', () => {
  const press = C.stations.filter((s) => s.kind === 'press');
  assert.ok(press.length >= 5);
  for (const s of press) assert.ok(PRESS_ROOMS.has(s.room), s.id + ' room ' + s.room + ' is not a Press room');
  const rooms = new Set(press.map((s) => s.room));
  for (const r of ['scriptorium', 'co-creation-studio', 'observatory-lab', 'tool-foundry', 'safety-bureau']) assert.ok(rooms.has(r), r + ' has no press counter');
});

test('exam pods: six on the inner ring, each its own station', () => {
  const pods = C.stations.filter((s) => s.kind === 'pods');
  assert.strictEqual(pods.length, 6);
  const podBodies = C.colliders.filter((c) => c.tag === 'pod');
  assert.strictEqual(podBodies.length, 6);
  for (const b of podBodies) assert.ok(Math.abs(Math.hypot(b.x, b.z) - 21) < 0.01, 'pod body on the r=21 ring');
  for (const p of pods) {                                            // the player stands in front of each pod, on the same bearing, 3 m inside
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - 18) < 0.01);
    const body = podBodies.find((b) => Math.hypot(b.x - p.x, b.z - p.z) < 3.1);
    assert.ok(body, p.id + ' has no pod body in front of it');
  }
});

test('every station and the spawn are reachable on foot with player clearance (BFS)', () => {
  const step = 0.5, R = 0.5, lim = 120;
  const key = (i, j) => i + ',' + j;
  const free = (x, z) => C.contains(x, z) && !C.blockedAt(x, z, R);
  const si = Math.round(C.spawn.x / step), sj = Math.round(C.spawn.z / step);
  assert.ok(free(C.spawn.x, C.spawn.z), 'spawn not free');
  const seen = new Set([key(si, sj)]); const q = [[si, sj]];
  while (q.length) {
    const [i, j] = q.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, x = ni * step, z = nj * step;
      if (Math.abs(x) > lim || Math.abs(z) > lim || seen.has(key(ni, nj)) || !free(x, z)) continue;
      seen.add(key(ni, nj)); q.push([ni, nj]);
    }
  }
  for (const s of C.stations) {
    let ok = false;
    for (let dx = -s.r; dx <= s.r && !ok; dx += step) for (let dz = -s.r; dz <= s.r && !ok; dz += step) {
      const x = s.x + dx, z = s.z + dz;
      if (Math.hypot(dx, dz) <= s.r && seen.has(key(Math.round(x / step), Math.round(z / step)))) ok = true;
    }
    assert.ok(ok, s.id + ' cannot be reached from the spawn');
  }
});

test('the spawn is inside the gate and the gate is the only way out', () => {
  assert.ok(C.contains(C.spawn.x, C.spawn.z));
  assert.ok(C.spawn.z > 0, 'spawn is on the south side');
  assert.ok(!C.contains(C.spawn.x, C.spawn.z + 40));
  assert.ok(!C.contains(200, 0) && !C.contains(0, -200) && !C.contains(-90, 90));
  assert.ok(C.contains(0, 0));
});

test('contains and heightAt agree: flat floor inside, a wall (999) outside', () => {
  assert.strictEqual(C.heightAt(0, 0), 0);
  assert.strictEqual(C.heightAt(300, 300), 999);
  for (const w of C.wings) assert.ok(C.contains(w.cx, w.cz), w.id + ' centre');
});

test('resolve blocks walls and colliders but lets you slide along them', () => {
  const p = { x: 0, z: 0 };
  const out = { x: 0, z: -80 };                                   // north of the apse end: outside
  const hit = C.resolve(Object.assign({}, out), 0, -50);
  assert.ok(C.contains(hit.x, hit.z));
  // walking into the central dais is blocked
  const into = C.resolve({ x: 0, z: 2 }, 0, 12);
  assert.ok(!C.blockedAt(into.x, into.z, 0.5));
  // sliding: aim diagonally into a wall of the gate corridor; x is blocked, z still advances
  const px = 0, pz = C.gate.endZ - 6;
  const wallX = C.gate.halfW + 3;
  const slid = C.resolve({ x: wallX, z: pz - 1 }, px, pz);
  assert.ok(C.contains(slid.x, slid.z));
  assert.ok(slid.z <= pz && Math.abs(slid.x) <= C.gate.halfW);
  assert.ok(p);
});

test('nearestStation returns the closest one in range, else null', () => {
  const s = C.stations.find((x) => x.kind === 'directory');
  assert.strictEqual(C.nearestStation(s.x, s.z).id, s.id);
  assert.strictEqual(C.nearestStation(s.x + 0.5, s.z).id, s.id);
  assert.strictEqual(C.nearestStation(500, 500), null);
});

test('layout is deterministic and does not share mutable state between builds', () => {
  const a = L.build(), b = L.build();
  assert.deepStrictEqual(a.stations, b.stations);
  a.stations[0].x = 999;
  assert.notStrictEqual(L.build().stations[0].x, 999);
});

console.log('\n' + (fail ? fail + ' FAILED' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
