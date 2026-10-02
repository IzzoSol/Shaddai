'use strict';
/* tools/tests/world-hovercars.test.cjs — hover car kit + air traffic (REAL three.js build, vm context). Run: node tools/tests/world-hovercars.test.cjs */
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..'), U = 7 / 1.8;
const THREE = require(path.join(ROOT, 'tools', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
const win = { document: undefined }; const ctx = { window: win, Math, console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'world-hovercars.js'), 'utf8'), ctx, { filename: 'world-hovercars.js' });
const HC = win.WorldHoverCars;
let pass = 0, fail = 0; const test = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack || e)); } };
const scene = () => { const c = []; return { children: c, add: o => c.push(o), remove: o => { const i = c.indexOf(o); if (i >= 0) c.splice(i, 1); } }; };

test('11 designs from the owner refs (sedan..pod); every one builds a group with a saddle and sane triangle budget', () => {
  assert.strictEqual(HC.TYPES.length, 11); assert.ok(HC.TYPES.some(t => t.id === 'pod'), 'Rimba pod racer');
  HC.TYPES.forEach(t => { const g = HC.buildGroup(THREE, t.id); assert.ok(g.userData.saddle, t.id + ' saddle'); const tris = g.userData.tris; assert.ok(tris > 200 && tris < 800, t.id + ' tris ' + tris);
    const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3()); assert.ok(sz.z > t.len * 0.6 && sz.z < t.len * 1.6, t.id + ' length ' + sz.z.toFixed(2)); assert.ok(isFinite(sz.x + sz.y + sz.z)); });
});
test('traffic: ~100 cars + 18 flying riders, <= 20 draw calls, matrices stay finite over 3 simulated minutes', () => {
  const sc = scene(), P = { x: 0, y: 0, z: 200 }, T = HC.buildTraffic({ THREE, scene: sc, heightAt: () => 20, getPlayer: () => ({ pos: P }) });
  const s = T.stats(); assert.ok(s.cars >= 90 && s.cars <= 120, 'cars ' + s.cars); assert.strictEqual(s.riders, 18); assert.ok(s.drawCalls <= 20, 'draw calls ' + s.drawCalls);
  for (let i = 0; i < 1800; i++) { P.x += 0.5; T.update(0.1); }
  T.group.children.forEach(m => { if (m.isInstancedMesh) { const a = m.instanceMatrix.array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) throw new Error('non-finite matrix in ' + m.name); } });
  assert.ok(T.stats().nearPlayer >= 1, 'local ring keeps traffic near the player (' + T.stats().nearPlayer + ')');
});
test('cars stay above the ground and below the sky ceiling', () => {
  const sc = scene(), T = HC.buildTraffic({ THREE, scene: sc, heightAt: () => 30, getPlayer: () => ({ pos: { x: 0, z: 0 } }) }); for (let i = 0; i < 50; i++) T.update(0.2);
  const m = T.group.children.find(c => c.name === 'air-sedan'), a = m.instanceMatrix.array; for (let i = 0; i < m.count; i++) { const y = a[i * 16 + 13]; assert.ok(y > 30 + 4 * U && y < 30 + 70 * U, 'y ' + y); }
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
