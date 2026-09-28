'use strict';
// tools/tests/world-train-v2.test.cjs — public/world-train-v2.js against real three.js. Run: node tools/tests/world-train-v2.test.cjs
const path = require('path'), assert = require('assert');
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
global.window = {}; require(path.join(__dirname, '..', '..', 'public', 'world-train-v2.js'));
let pass = 0, fail = 0; const test = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const g = window.buildMaglevTrainV2({ THREE: T }), ud = g.userData, box = new T.Box3().setFromObject(g);
test('metres, length along Z, base on y=0', () => { assert(Math.abs(box.max.z - box.min.z - ud.lengthM) < 0.2); assert(box.min.y >= 0 && box.min.y < 0.1); assert(box.max.x - box.min.x <= 3.6); assert(box.max.y < 4.5); });
test('double-ended: symmetric about z=0', () => assert(Math.abs(box.max.z + box.min.z) < 0.05));
let tris = 0; g.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
test('triangle budget < 40k per trainset', () => assert(tris < 40000, tris));
test('every material slot is used by the skins (body, glass, door, light line, lamp, gold, skirt)', () => {
  const used = new Set(); g.children.filter(o => Array.isArray(o.material)).forEach(o => o.geometry.groups.forEach(q => used.add(q.materialIndex)));
  [0, 1, 2, 3, 4, 5, 6].forEach(i => assert(used.has(i), 'slot ' + i + ' unused'));
});
test('seats inside the body, two pilot seats, doors both sides', () => {
  assert(ud.seats.length > 100); assert.strictEqual(ud.seats.filter(s => s.pilot).length, 2);
  ud.seats.forEach(s => { assert(Math.abs(s.x) < 1.5 && s.y > 0.5 && s.y < 3 && Math.abs(s.z) < ud.lengthM / 2); });
  assert.strictEqual(ud.doors.filter(d => d.side > 0).length, ud.doors.filter(d => d.side < 0).length);
});
test('skin normals face outward', () => {
  const sk = g.children.find(o => Array.isArray(o.material)).geometry, P = sk.attributes.position, N = sk.attributes.normal; let ok = 0, n = 0;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i) - 2.4; if (Math.hypot(x, y) < 0.8) continue; n++; if (x * N.getX(i) + y * N.getY(i) > 0) ok++; }
  assert(ok / n > 0.9, ok + '/' + n);
});
test('emissive materials exposed for the day/night ramp', () => assert(ud.emissiveMats.length >= 4 && ud.emissiveMats.every(m => m.emissiveIntensity > 0)));
test('clone(true) keeps instanced seats (transit clones the model per track)', () => { const c = g.clone(true); let inst = 0; c.traverse(o => { if (o.isInstancedMesh) inst += o.count; }); assert.strictEqual(inst, ud.seats.length * 2); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
