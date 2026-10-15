/* world-athenaeum.test.cjs — node tools/tests/world-athenaeum.test.cjs  (add --expose-gc for the allocation check)
 * Real three (tools/ual); no browser. Checks the room-record contract, the perf budgets, and that nothing leaks or produces NaN. */
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const THREE = require(path.join(ROOT, 'tools/ual/node_modules/three/build/three.cjs'));
const A = require(path.join(ROOT, 'public/world-athenaeum.js'));
const { FACULTY } = require(path.join(ROOT, 'backend/lib/academy/faculty.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
const ORIGIN = { x: 30000, z: 0 };
function make(opts) { const scene = new THREE.Scene(); const c = A.build(THREE, Object.assign({ scene: scene, originX: ORIGIN.x, originZ: ORIGIN.z }, opts || {})); return { scene, c }; }
function renderables(root) { const out = []; root.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.visible) out.push(o); }); return out; }
function lights(root) { const out = []; root.traverse((o) => { if (o.isLight) out.push(o); }); return out; }
function triangles(root) {
  let t = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    t += n * (o.isInstancedMesh ? o.count : 1);
  });
  return t;
}

const { scene, c } = make();

test('record contract matches the colosseum room record', () => {
  assert.strictEqual(c.code, 'ATHENAEUM');
  assert.ok(c.group && c.group.isGroup && scene.children.includes(c.group));
  assert.strictEqual(c.group.name, 'interior_ATHENAEUM');
  for (const f of ['contains', 'heightAt', 'resolve', 'tick', 'setQuality', 'dispose', 'nearestStation']) assert.strictEqual(typeof c[f], 'function', f);
  assert.ok(c.origin && isFinite(c.origin.x) && isFinite(c.origin.z));
  assert.ok(Array.isArray(c.stations) && c.stations.length >= 25);
  assert.ok(!('glowEntries' in c) && !('animObjs' in c) && !('motes' in c), 'the campus animates itself via tick(); the world loop must not double-animate it');
});

test('origin maps to the layout spawn (interiors add +28 to z) and the spawn is walkable', () => {
  const U = c.layout.U;
  assert.ok(Math.abs(c.origin.x - (ORIGIN.x + c.layout.spawn.x * U)) < 1e-6);
  assert.ok(Math.abs(c.origin.z + 28 - (ORIGIN.z + c.layout.spawn.z * U)) < 1e-6);
  assert.ok(c.contains(c.origin.x, c.origin.z + 28));
  assert.strictEqual(c.heightAt(c.origin.x, c.origin.z + 28), 0);
  assert.strictEqual(c.heightAt(ORIGIN.x + 5000, ORIGIN.z), 999);
  assert.ok(!c.contains(ORIGIN.x + 5000, ORIGIN.z));
  assert.ok(c.contains(ORIGIN.x, ORIGIN.z));
});

test('stations are in world units, findable, and the radius is scaled', () => {
  const U = c.layout.U;
  for (const s of c.stations) {
    assert.ok(Math.abs(s.x - (ORIGIN.x + s.local.x * U)) < 1e-6 && Math.abs(s.z - (ORIGIN.z + s.local.z * U)) < 1e-6);
    assert.ok(Math.abs(s.r - c.layout.stations.find((l) => l.id === s.id).r * U) < 1e-6);
    assert.strictEqual(c.nearestStation(s.x, s.z).id, s.id);
  }
  assert.strictEqual(c.nearestStation(ORIGIN.x + 9000, ORIGIN.z), null);
});

test('resolve mutates pos like the colosseum: walls and colliders block, free space passes', () => {
  const U = c.layout.U;
  const pos = { x: ORIGIN.x, z: ORIGIN.z + 2 * U };
  const prev = { x: ORIGIN.x, z: ORIGIN.z + 12 * U };
  assert.strictEqual(c.resolve(pos, prev.x, prev.z), true);               // inside the central dais: pushed back
  assert.ok(Math.hypot(pos.x - ORIGIN.x, pos.z - ORIGIN.z) / U > 7);
  const ok = { x: ORIGIN.x, z: ORIGIN.z + 20 * U };
  assert.strictEqual(c.resolve(ok, ORIGIN.x, ORIGIN.z + 19 * U), false);   // open floor: untouched
  assert.strictEqual(ok.z, ORIGIN.z + 20 * U);
});

test('perf budget: draw calls, lights, triangles', () => {
  const draws = renderables(c.group).length, ls = lights(c.group).length, tris = triangles(c.group);
  console.log('       draws=' + draws + ' lights=' + ls + ' triangles=' + Math.round(tris));
  assert.ok(draws <= 90, 'draw calls ' + draws);
  assert.ok(ls <= 8, 'lights ' + ls);
  assert.ok(tris <= 350000, 'triangles ' + tris);
  assert.ok(draws >= 20, 'suspiciously empty building');
});

test('static geometry is merged: the shared structural materials are used by very few meshes', () => {
  const byMat = new Map();
  renderables(c.group).forEach((o) => { if (o.material && o.material.name) byMat.set(o.material.name, (byMat.get(o.material.name) || 0) + 1); });
  for (const name of ['obsidian', 'floor']) assert.ok((byMat.get(name) || 0) >= 1 && byMat.get(name) <= 4, name + ' meshes: ' + byMat.get(name));
});

test('every faculty agent stands in the campus as a named figure at their own station', () => {
  for (const f of FACULTY) {
    const fig = c.group.getObjectByName('npc:' + f.agent);
    assert.ok(fig, 'no figure for ' + f.agent);
    const st = c.stations.filter((s) => s.agent === f.agent && (s.kind === 'lectern' || s.kind === 'trading'));
    assert.ok(st.length, f.agent + ' has no lectern');
    const near = st.some((s) => Math.hypot(fig.getWorldPosition(new THREE.Vector3()).x - s.x, fig.getWorldPosition(new THREE.Vector3()).z - s.z) < 9 * c.layout.U);
    assert.ok(near, f.agent + ' figure is not near its lectern');
  }
});

test('station rings are one instanced mesh with one instance per station', () => {
  const rings = c.group.getObjectByName('station-rings');
  assert.ok(rings && rings.isInstancedMesh);
  assert.strictEqual(rings.count, c.stations.length);
});

test('no NaN or infinite vertices anywhere, and the building stays inside a sane box', () => {
  const box = new THREE.Box3().setFromObject(c.group);
  const U = c.layout.U;
  assert.ok(isFinite(box.min.x) && isFinite(box.max.y));
  assert.ok(box.max.y <= 45 * U, 'too tall: ' + (box.max.y / U).toFixed(1) + ' m');
  assert.ok(box.min.x >= ORIGIN.x - 110 * U && box.max.x <= ORIGIN.x + 110 * U && box.min.z >= ORIGIN.z - 110 * U && box.max.z <= ORIGIN.z + 110 * U, 'outside the island footprint');
  c.group.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const a = o.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new Error('bad vertex in ' + (o.name || o.type));
  });
});

test('tick runs and animates: orbit ring turns, no exceptions over 600 frames', () => {
  const ring = c.group.getObjectByName('orbit-ring');
  assert.ok(ring);
  const r0 = ring.rotation.y;
  for (let i = 0; i < 600; i++) c.tick(1 / 60);
  assert.ok(ring.rotation.y !== r0);
  c.tick(0); c.tick(5);                                                    // zero and huge steps are survivable
});

test('tick does not allocate (heap growth bounded over 5000 frames)', () => {
  if (typeof global.gc !== 'function') { console.log('       (skipped: run with --expose-gc)'); return; }
  for (let i = 0; i < 200; i++) c.tick(1 / 60);
  global.gc(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 5000; i++) c.tick(1 / 60);
  global.gc(); const grown = process.memoryUsage().heapUsed - h0;
  assert.ok(grown < 3 * 1024 * 1024, 'heap grew ' + Math.round(grown / 1024) + ' KB');
});

test('setQuality LOW turns off the accent lights and ignores unknown names', () => {
  const m = make(); const mc = m.c;
  const on = () => lights(mc.group).filter((l) => l.visible && l.intensity > 0).length;
  const high = on();
  assert.strictEqual(mc.setQuality('low'), 'LOW');
  assert.ok(on() < high, 'LOW should drop lights: ' + high + ' -> ' + on());
  assert.strictEqual(mc.setQuality('nonsense'), 'LOW');
  assert.strictEqual(mc.setQuality('HIGH'), 'HIGH');
  assert.strictEqual(on(), high);
  mc.dispose();
});

test('dispose frees geometries and materials, removes the group, and is idempotent', () => {
  const m = make(); let geo = 0, mat = 0;
  const g0 = THREE.BufferGeometry.prototype.dispose, m0 = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { geo++; return g0.call(this); };
  THREE.Material.prototype.dispose = function () { mat++; return m0.call(this); };
  try {
    m.c.dispose();
    assert.ok(geo >= 10 && mat >= 5, 'disposed geo=' + geo + ' mat=' + mat);
    assert.ok(!m.scene.children.includes(m.c.group));
    const before = geo; m.c.dispose();
    assert.strictEqual(geo, before);
  } finally { THREE.BufferGeometry.prototype.dispose = g0; THREE.Material.prototype.dispose = m0; }
});

test('two builds are independent and identical in cost', () => {
  const a = make(), b = make();
  assert.strictEqual(renderables(a.c.group).length, renderables(b.c.group).length);
  assert.strictEqual(Math.round(triangles(a.c.group)), Math.round(triangles(b.c.group)));
  a.c.stations[0].x = -1;
  assert.notStrictEqual(b.c.stations[0].x, -1);
  a.c.dispose(); b.c.dispose();
});

console.log('\n' + (fail ? fail + ' FAILED' : 'all ' + pass + ' passed'));
process.exit(fail ? 1 : 0);
