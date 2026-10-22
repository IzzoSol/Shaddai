'use strict';
/**
 * tools/tests/world-gear-wear.test.cjs — realm protective gear is drawn on the body only where it matters (2026-10-22).
 * Run: node tools/tests/world-gear-wear.test.cjs < /dev/null
 */
const path = require('path'), assert = require('assert');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..'), NM = path.join(ROOT, 'tools', 'ual', 'node_modules');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + ((e && e.stack) || e)); } };
(async () => {
  const THREE = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
  global.window = global; require(path.join(ROOT, 'public/world-gear-wear.js'));
  const W = global.WorldGearWear;
  function rig() {   // avatar with Head / LeftFoot / RightFoot bones at known world positions (units)
    const av = new THREE.Group(), hips = new THREE.Bone(), head = new THREE.Bone(), lf = new THREE.Bone(), rf = new THREE.Bone();
    hips.name = 'Hips'; head.name = 'Head'; lf.name = 'LeftFoot'; rf.name = 'RightFoot';
    hips.position.set(0, 3.5, 0); head.position.set(0, 2.8, 0); lf.position.set(0.4, -3.2, 0); rf.position.set(-0.4, -3.2, 0);
    hips.add(head, lf, rf); av.add(hips); av.position.set(100, 0, 50); return av;
  }
  function make(perks, realmId, av) {
    const scene = new THREE.Scene(), avatar = av || rig();
    const w = W.build({ THREE, scene, height: 7, getAvatar: () => avatar, perk: (k) => perks[k] || 0, realm: () => realmId });
    w.update(0.016); return { w, scene, avatar };
  }
  t('nothing owned: nothing shown, in any realm', () => {
    for (const r of ['void', 'desert', 'arctic', 'grid']) { const s = make({}, r).w.state(); assert(!s.respirator && !s.wrap && !s.frost); }
  });
  t('owned gear shows ONLY in its realm (no gas mask walking the city)', () => {
    const all = { 'mask-gas': 1, 'mask-wrap': 1, 'mask-arctic': 3 };
    assert.deepStrictEqual(make(all, 'void').w.state(), { respirator: true, wrap: false, frost: false });
    assert.deepStrictEqual(make(all, 'desert').w.state(), { respirator: false, wrap: true, frost: false });
    assert.deepStrictEqual(make(all, 'arctic').w.state(), { respirator: false, wrap: false, frost: true });
    assert.deepStrictEqual(make(all, 'grid').w.state(), { respirator: false, wrap: false, frost: false });
  });
  t('frost kit needs the full arctic level (3), matching world-realm-hazards arctic-cold', () => {
    assert.strictEqual(make({ 'mask-arctic': 2 }, 'arctic').w.state().frost, false);
  });
  t('head piece sits on the Head bone, foot pieces on the feet, facing the avatar', () => {
    const { w, avatar } = make({ 'mask-wrap': 1 }, 'desert'); avatar.rotation.y = 0.7; w.update(0.016);
    const g = w.group, vis = g.children.filter((c) => c.visible), head = new THREE.Vector3(), lf = new THREE.Vector3();
    avatar.updateMatrixWorld(true); avatar.getObjectByName('Head').getWorldPosition(head); avatar.getObjectByName('LeftFoot').getWorldPosition(lf);
    assert.strictEqual(vis.length, 3, 'head wrap + 2 foot wraps');
    assert(vis.some((c) => c.position.distanceTo(head) < 1e-6), 'a piece at the head');
    assert(vis.some((c) => c.position.distanceTo(lf) < 1e-6), 'a piece at the left foot');
    vis.forEach((c) => assert(Math.abs(c.rotation.y - 0.7) < 1e-9));
  });
  t('boneless body: falls back to body-height fractions instead of throwing', () => {
    const av = new THREE.Group(); av.position.set(5, 0, 5);
    const { w } = make({ 'mask-gas': 1 }, 'void', av);
    const vis = w.group.children.filter((c) => c.visible); assert.strictEqual(vis.length, 1); assert(Math.abs(vis[0].position.y - 0.9 * 7) < 1e-9);
  });
  t('no avatar: group hidden, no throw', () => {
    const scene = new THREE.Scene(), w = W.build({ THREE, scene, height: 7, getAvatar: () => null, perk: () => 1, realm: () => 'void' });
    w.update(0.016); assert.strictEqual(w.group.visible, false);
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
