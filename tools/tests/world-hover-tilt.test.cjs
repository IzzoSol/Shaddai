// node tools/tests/world-hover-tilt.test.cjs — hover cars follow slopes and lean into turns (pure helper from world-mount-ride)
const assert = require('assert'); global.window = global; require('../../public/world-mount-ride.js');
const tilt = global.buildMountRide.hoverTilt, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const flat = () => 0, rampN = (x, z) => -z * 0.2;          // ground rises toward -z? (z decreases -> height increases)
const hl = 2 * U, hw = 0.9 * U;
t('flat ground, no steering: level', () => { const r = tilt(flat, 0, 0, 0, hl, hw, 0, 0); assert(Math.abs(r.pitch) < 1e-12 && Math.abs(r.bank) < 1e-12); });
t('facing uphill pitches the nose up (and downhill nose down); the size follows the slope but is damped', () => {
  const up = tilt(rampN, 0, 0, Math.PI, hl, hw, 0, 0), down = tilt(rampN, 0, 0, 0, hl, hw, 0, 0); assert(up.pitch !== 0 && Math.sign(up.pitch) === -Math.sign(down.pitch), up.pitch + ' vs ' + down.pitch);
  assert(Math.abs(up.pitch) < Math.atan(0.2) + 1e-9, 'damped below the true slope angle');
});
t('cross-slope rolls the car; turning leans it, more with speed; no lean when stopped', () => {
  const side = (x) => x * 0.2; const r = tilt(side, 0, 0, 0, hl, hw, 0, 0); assert(r.bank !== 0);
  const a = tilt(flat, 0, 0, 0, hl, hw, 1, 1), b = tilt(flat, 0, 0, 0, hl, hw, 1, 0.3), c = tilt(flat, 0, 0, 0, hl, hw, 1, 0), d = tilt(flat, 0, 0, 0, hl, hw, -1, 1);
  assert(Math.abs(a.bank) > Math.abs(b.bank) && Math.abs(c.bank) < 1e-12 && Math.sign(a.bank) === -Math.sign(d.bank));
});
console.log(pass + ' passed');
