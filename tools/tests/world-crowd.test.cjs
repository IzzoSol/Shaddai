const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const ctx = { console, THREE, performance }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-crowd.js', 'utf8'), ctx);
const U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
function mk(o) { const scene = new THREE.Scene(), P = { pos: { x: 0, y: 0, z: 0 } }; const c = ctx.buildWorldCrowd(Object.assign({ THREE, scene, heightAt: () => 0, getPlayer: () => P }, o || {})); return { c, scene, P }; }
const pos = (mesh, i) => { const m = new THREE.Matrix4(), v = new THREE.Vector3(); mesh.getMatrixAt(i, m); v.setFromMatrixPosition(m); return v; };
const rotX = (mesh, i) => { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(); mesh.getMatrixAt(i, m); m.decompose(p, q, s); return new THREE.Euler().setFromQuaternion(q, 'YXZ').x; };
t('7 instanced parts per citizen (torso, 2 legs, 2 arms, head, hair) = 7 draw calls for 90 people', () => { const { c, scene } = mk(); assert.deepStrictEqual(Object.keys(c.parts).sort(), ['armL', 'armR', 'hair', 'head', 'legL', 'legR', 'torso']); assert.strictEqual(scene.children.filter(m => m.isInstancedMesh).length, 7); Object.values(c.parts).forEach(m => assert.strictEqual(m.count, 90)); });
t('people vary: several skin tones, hair colours and trousers (not clones)', () => {
  const { c } = mk(); const uniq = (mesh) => { const s = new Set(), col = new THREE.Color(); for (let i = 0; i < 90; i++) { mesh.getColorAt(i, col); s.add(col.getHex()); } return s.size; };
  assert(uniq(c.parts.head) >= 4, 'skin ' + uniq(c.parts.head)); assert(uniq(c.parts.hair) >= 4, 'hair ' + uniq(c.parts.hair)); assert(uniq(c.parts.legL) >= 4, 'pants ' + uniq(c.parts.legL)); assert(uniq(c.parts.torso) >= 8, 'outfits ' + uniq(c.parts.torso));
});
t('anatomy: head above torso above legs; legs and arms hang from hip/shoulder height; feet touch the ground', () => {
  const { c, P } = mk(); P.pos.x = 0; for (let i = 0; i < 5; i++) c.update(0.05); let checked = 0;
  for (let i = 0; i < 90 && checked < 10; i++) { const h = pos(c.parts.head, i); if (h.y < -1000) continue; const t0 = pos(c.parts.torso, i), l = pos(c.parts.legL, i), a = pos(c.parts.armL, i); assert(h.y > t0.y && t0.y > l.y - 1e-6, 'order'); assert(a.y > t0.y && a.y < h.y, 'shoulder between torso and head'); const sc = U * (c._people[i].h / 1.7); assert(Math.abs(l.y - 0.82 * sc) < 0.2 * sc, 'hip height'); assert(Math.abs(h.y - 1.63 * sc) < 0.2 * sc, 'head height'); checked++; }
  assert(checked >= 5, 'people near the player are drawn');
});
t('walking swings legs and arms in anti-phase (left leg forward = right leg back = left arm back)', () => {
  const { c } = mk(); for (let i = 0; i < 3; i++) c.update(0.05); let moving = null; for (let i = 0; i < 90; i++) if (c._people[i].pause <= 0 && pos(c.parts.head, i).y > -1000) { moving = i; break; } assert(moving != null, 'someone is walking');
  let seen = 0; for (let f = 0; f < 60; f++) { c.update(0.05); const L = rotX(c.parts.legL, moving), R = rotX(c.parts.legR, moving), AL = rotX(c.parts.armL, moving); if (Math.abs(L) > 0.3) { seen++; assert(Math.abs(L + R) < 1e-6, 'legs opposite'); assert(L * AL < 0, 'arm opposes the same-side leg'); } } assert(seen > 5, 'swing happened ' + seen);
});
t('standing citizens do not swing their legs (idle)', () => {
  const { c } = mk(); for (let i = 0; i < 3; i++) c.update(0.05); const i0 = c._people.findIndex((p, i) => pos(c.parts.head, i).y > -1000); const p = c._people[i0]; p.pause = 99; for (let f = 0; f < 5; f++) { c.update(0.05); p.pause = 99; } assert(Math.abs(rotX(c.parts.legL, i0)) < 1e-6 && Math.abs(rotX(c.parts.legR, i0)) < 1e-6);
});
t('citizens beyond draw range (330 m) are hidden under the world; inside it they are drawn at person scale', () => {
  const { c } = mk(); for (let i = 0; i < 3; i++) c.update(0.05); const p = c._people[0]; p.x = 400 * U; p.z = 0; p.tx = p.x; p.tz = p.z; p.pause = 99; c.update(0.001); assert(pos(c.parts.torso, 0).y < -1000, 'hidden at 400 m');
  p.x = 100 * U; p.tx = p.x; p.pause = 99; c.update(0.001); assert(pos(c.parts.torso, 0).y > 0, 'drawn at 100 m'); const sc = new THREE.Vector3(); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(); c.parts.head.getMatrixAt(0, m); m.decompose(pp, q, sc); assert(Math.abs(sc.y - U * p.h / 1.7) < 1e-6);
});
t('dispose removes all parts; stats still report totals', () => { const { c, scene } = mk(); c.update(0.05); assert.strictEqual(c.stats().total, 90); c.dispose(); assert.strictEqual(scene.children.length, 0); });
console.log(pass + ' passed');
