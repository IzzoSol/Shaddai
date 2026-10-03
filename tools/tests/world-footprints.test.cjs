// node tools/tests/world-footprints.test.cjs — snow/sand footprints: stride, alternating feet, no air/teleport/idle prints, fade, one draw call
const assert = require('assert'), path = require('path'); global.window = global;
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs')); require('../../public/world-footprints.js');
const F = global.WorldFootprints, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('stepper: one print per stride of ground travel, feet alternate left/right of the track, oriented along travel', () => {
  const s = F.createStepper(), out = []; for (let i = 0; i <= 100; i++) { const r = s.update(0, i * 0.1, true, 0.016); if (r) out.push(r); }   // walk 10 m north-south (+z)
  assert(out.length >= 15 && out.length <= 17, 'prints: ' + out.length); assert(out.every((p, i) => i === 0 || p.foot === -out[i - 1].foot)); assert(out.every(p => Math.abs(p.yaw) < 1e-9)); assert(out[0].x * out[1].x < 0, 'left and right sides');
});
t('no prints while standing, airborne, or after a teleport; the stride counter resets in the air', () => {
  const s = F.createStepper(); s.update(0, 0, true, .016); for (let i = 0; i < 50; i++) assert.strictEqual(s.update(0, 0, true, .016), null);
  let n = 0; for (let i = 1; i < 40; i++) if (s.update(0, i * 0.2, false, .016)) n++; assert.strictEqual(n, 0); assert.strictEqual(s.update(500, 500, true, .016), null, 'teleport is not a step');
});
const mk = (kind) => { const scene = new T.Scene(), P = { pos: { x: 0, y: 0, z: 0 }, grounded: true }; const fp = global.buildWorldFootprints({ THREE: T, scene, heightAt: () => 0, getPlayer: () => P, surfaceAt: () => kind }); return { scene, P, fp }; };
t('built effect: walking on snow stamps instanced prints (1 draw call), walking on grass stamps none', () => {
  const a = mk('snow'); for (let i = 0; i < 200; i++) { a.P.pos.z += 0.05 * U; a.fp.update(0.016); } assert(a.fp.stats().prints >= 10, 'prints ' + a.fp.stats().prints); assert.strictEqual(a.scene.children.length, 1);
  const b = mk(null); for (let i = 0; i < 200; i++) { b.P.pos.z += 0.05 * U; b.fp.update(0.016); } assert.strictEqual(b.fp.stats().prints, 0);
});
t('prints fade back into the surface and shrink away after ~14 s, and the pool never exceeds its cap', () => {
  const a = mk('sand'); a.P.pos.z = 0; for (let i = 0; i < 40; i++) { a.P.pos.z += 0.1 * U; a.fp.update(0.016); } const first = a.fp._prints[0]; assert(first); for (let i = 0; i < 900; i++) a.fp.update(0.016);
  assert(first.t > F.LIFE_S - 0.5, 'aged ' + first.t); const im = a.scene.children[0], m = new T.Matrix4(); im.getMatrixAt(0, m); const sc = new T.Vector3(); m.decompose(new T.Vector3(), new T.Quaternion(), sc); assert(sc.x < 0.01 * U, 'shrunk away: ' + sc.x);
  const b = mk('snow'); for (let i = 0; i < 6000; i++) { b.P.pos.z += 0.04 * U; b.fp.update(0.016); } assert(b.fp.stats().prints <= F.MAX);
});
console.log(pass + ' passed');
