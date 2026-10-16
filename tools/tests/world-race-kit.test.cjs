// node tools/tests/world-race-kit.test.cjs — race kit dressing on a REAL built circuit (dragon-gate), fake kit GLBs
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const g2d = new Proxy({}, { get: () => function () { } });
const ctx = { console, THREE, Math, Promise, document: { createElement: () => ({ getContext: () => g2d, width: 0, height: 0 }), addEventListener() {} } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['world-race.js', 'world-race-track.js', 'world-race-kit.js']) vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), ctx);
const U = 7 / 1.8;
const groundAt = (x, z) => { const xm = x / U, zm = -z / U; return (Math.hypot(xm - 2100, zm + 300) < 60 ? -25 : 0) * U; };
const tr = ctx.buildRaceTrack({ THREE, scene: new THREE.Scene(), groundAt, WorldRace: ctx.WorldRace, circuit: 'dragon-gate', U, gateTowers: 2 });
const node = (n) => { const g = new THREE.Group(); g.name = n; g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())); return g; };
class Loader { load(url, ok) { const s = new THREE.Group();
  if (/race_kit/.test(url)) ['race_pylon_foot', 'race_pylon_shaft', 'race_pylon_head', 'race_gantry', 'race_checkpoint', 'race_boost_ring', 'race_start_gate'].forEach((n) => s.add(node(n)));
  else ['race_grandstand', 'race_pit_garage', 'race_gate_tower', 'race_holo_billboard', 'race_boost_pad'].forEach((n) => s.add(node(n)));
  ok({ scene: s }); } }
let pass = 0; const t = async (n, fn) => { await fn(); pass++; console.log('  ok ', n); };
(async () => {
  const codeCount = (n) => tr.group.getObjectByName(n).count;
  const nPyl = codeCount('track-pylons'), nGan = codeCount('track-gantries'), nGate = codeCount('track-sector-gates');
  const gan0 = new THREE.Matrix4(); tr.group.getObjectByName('track-gantries').getMatrixAt(0, gan0);
  const player = { x: 0, y: 0, z: 0 };
  const r = await ctx.WorldRaceKit.dress({ THREE, GLTFLoader: Loader, track: tr, U, groundAt, getPlayer: () => player });
  const kit = (n) => r.group.children.find((m) => m.name === 'racekit-' + n);
  await t('code pylons/gantries/gates hidden and replaced one-for-one', () => {
    for (const n of ['track-pylons', 'track-gantries', 'track-gantry-lights', 'track-sector-gates']) assert.strictEqual(tr.group.getObjectByName(n).visible, false, n);
    assert.strictEqual(kit('race_pylon_foot').count, nPyl); assert.strictEqual(kit('race_gantry').count, nGan); assert.strictEqual(kit('race_checkpoint').count, nGate);
    assert(kit('race_boost_ring').count === 4 && kit('start_gate').count === 1 && kit('grandstand') && kit('pits'));
    assert.strictEqual(kit('race_boost_pad').count, 4, 'Blender boost pad on every code pad'); assert.strictEqual(tr.group.getObjectByName('track-boost').visible, false, 'flat decal hidden');
  });
  await t('each shaft reaches its fork head; foot sits on the ground', () => {
    const a = new THREE.Matrix4(), b = new THREE.Matrix4(), c = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < nPyl; i++) {
      kit('race_pylon_shaft').getMatrixAt(i, a); kit('race_pylon_head').getMatrixAt(i, b); kit('race_pylon_foot').getMatrixAt(i, c);
      a.decompose(p, q, s); const shaftTop = p.y + s.y, shaftBot = p.y;
      const hs = new THREE.Vector3(); b.decompose(new THREE.Vector3(), q, hs); const headY = new THREE.Vector3().setFromMatrixPosition(b).y, footY = new THREE.Vector3().setFromMatrixPosition(c).y;
      assert(Math.abs(shaftTop + 3.8 * hs.y - headY) < 1e-3, 'shaft meets head'); assert(Math.abs(shaftBot - 1.6 * hs.y - footY) < 1e-3, 'shaft on foot');
    }
  });
  await t('gantry 0 sits exactly where the code gantry was', () => {
    const m = new THREE.Matrix4(); kit('race_gantry').getMatrixAt(0, m);
    assert(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(new THREE.Vector3().setFromMatrixPosition(gan0)) < 1e-3);
  });
  await t('start gate on the start line; elevator runs ground -> deck', () => {
    const m = new THREE.Matrix4(); kit('start_gate').getMatrixAt(0, m); assert(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(tr.frames[0].P) < 1e-3);
    const L = r.lift; assert(L.top.y > L.base.y); assert(Math.abs(L.top.y - tr.frames[0].P.y) < 1e-6);
  });
  await t('gate towers: kit tower fitted to the code tower box; code slabs + glow hidden', () => {
    assert.strictEqual(tr.group.getObjectByName('track-gate-towers').visible, false); assert.strictEqual(tr.group.getObjectByName('track-gate-tower-glow').visible, false);
    const code = tr.group.getObjectByName('track-gate-towers'), km = kit('race_gate_tower'); assert.strictEqual(km.count, code.count);
    const box = (geo, m) => { geo.computeBoundingBox(); return geo.boundingBox.clone().applyMatrix4(m); }, a = new THREE.Matrix4(), b = new THREE.Matrix4();
    code.getMatrixAt(0, a); km.getMatrixAt(0, b); code.geometry.computeBoundingBox(); const A = code.geometry.boundingBox;   // compare in the track frame: width + height match, depth keeps kit proportions
    const B = box(km.geometry, new THREE.Matrix4().copy(a).invert().multiply(b));
    for (const k of ['x', 'y']) assert(Math.abs(A.min[k] - B.min[k]) < 0.1 * U && Math.abs(A.max[k] - B.max[k]) < 0.1 * U, 'fitted ' + k + ' should match the code tower');
  });
  await t('billboards: one per checkpoint, on the ground, outside the deck, screen (+z) toward the track', () => {
    const km = kit('race_holo_billboard'), gates = tr.group.getObjectByName('track-sector-gates'); assert.strictEqual(km.count, nGate);
    const m = new THREE.Matrix4(), g = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), gp = new THREE.Vector3();
    km.getMatrixAt(0, m); gates.getMatrixAt(0, g); m.decompose(p, q, sc); gp.setFromMatrixPosition(g);
    assert(Math.abs(p.y - groundAt(p.x, p.z)) < 1e-3); assert(Math.hypot(p.x - gp.x, p.z - gp.z) > 40 * U);
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(q), toGate = new THREE.Vector3(gp.x - p.x, 0, gp.z - p.z).normalize(); assert(face.dot(toGate) > 0.99);
  });
  console.log(`${pass} passed, 0 failed`);
})().catch((e) => { console.error('FAIL', e.message); process.exitCode = 1; });
