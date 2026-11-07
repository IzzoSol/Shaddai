// node tools/tests/world-rider-chain.test.cjs — WorldRiderPose binds hands/feet through their OWN limb chain (2026-11-07).
// Bug: side was taken from bone POSITION for every bone, so a folded-arms idle (SHADDAI, ORACLE: right hand on the body's left)
// wired handL = RightHand and the solver twisted the left forearm toward the right hand. Only the limb ROOT is picked by position now.
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert');
const THREE = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'world-actions.js'), 'utf8');
const win = {}; vm.runInNewContext(src.slice(0, src.indexOf('window.buildWorldActions = function')), { window: win });
let pass = 0, fail = 0; const t = (n, fn) => { try { fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } };

function bone(name, x, y, z, parent) { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; }
function rig(folded) {
  const avatar = new THREE.Group(), model = new THREE.Group(); avatar.add(model);
  const hips = bone('Hips', 0, 3.6, 0); model.add(hips);
  const spine = bone('Spine', 0, 0.8, 0, hips), neck = bone('neck', 0, 1.6, 0, spine); bone('Head', 0, 0.4, 0, neck);
  ['Left', 'Right'].forEach(function (s) {
    const k = s === 'Left' ? 1 : -1;                          // +X = the character's left
    const sh = bone(s + 'Shoulder', 0.3 * k, 1.4, 0, spine), arm = bone(s + 'Arm', 0.4 * k, 0, 0, sh);
    // folded arms: the forearm turns across the chest, so the HAND ends on the OTHER side of the body
    const fore = folded ? bone(s + 'ForeArm', 0, -1.0, 0.3, arm) : bone(s + 'ForeArm', 1.0 * k, 0, 0, arm);
    bone(s + 'Hand', folded ? -1.5 * k : 0.8 * k, 0, folded ? 0.2 : 0, fore);
    const up = bone(s + 'UpLeg', 0.4 * k, -0.2, 0, hips), leg = bone(s + 'Leg', 0, -1.6, 0, up); bone(s + 'Foot', 0, -1.6, 0.2, leg);
  });
  avatar.updateMatrixWorld(true); return avatar;
}

t('folded arms: the hand on the far side still binds to its own arm', () => {
  const av = rig(true), w = new THREE.Vector3();
  const rh = av.getObjectByName('RightHand'); av.worldToLocal(rh.getWorldPosition(w)); assert(w.x > 0, 'setup: right hand sits on the left side');
  const r = win.WorldRiderPose.create(THREE).bind(av);
  assert.strictEqual(r.b.handL.name, 'LeftHand'); assert.strictEqual(r.b.handR.name, 'RightHand');
  assert.strictEqual(r.b.foreL.name, 'LeftForeArm'); assert.strictEqual(r.b.foreR.name, 'RightForeArm');
});
t('legs and feet bind through their own chain; hasBones true', () => {
  const r = win.WorldRiderPose.create(THREE).bind(rig(true));
  assert.deepStrictEqual([r.b.uplegL, r.b.legL, r.b.footL, r.b.uplegR, r.b.legR, r.b.footR].map(b => b.name), ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
  assert.strictEqual(r.hasBones, true);
});
t('T-pose rig binds the same as before', () => {
  const r = win.WorldRiderPose.create(THREE).bind(rig(false));
  assert.deepStrictEqual(['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'].map(k => r.b[k].name), ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']);
});
console.log(`world-rider-chain: ${pass} passed, ${fail} failed`);
