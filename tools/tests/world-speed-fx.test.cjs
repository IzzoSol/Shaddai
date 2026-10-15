// world-speed-fx.js — FOV kick, speed-line strength, boost pads, exact FOV hand-back.
const FX = require('../../public/world-speed-fx.js');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
const P = FX.pure;
t('fov: no kick at walking/cruise-low speed', P.fovFor(72, 5, 14, 20, 0) === 72);
t('fov: +14 at boost speed', Math.abs(P.fovFor(72, 20, 14, 20, 0) - 86) < 1e-9);
t('fov: monotonic in speed', P.fovFor(72, 12, 14, 20, 0) < P.fovFor(72, 16, 14, 20, 0));
t('fov: pad kick adds up to +6', Math.abs(P.fovFor(72, 20, 14, 20, 1) - 92) < 1e-9);
t('lines: none below 80% cruise', P.lineAlpha(10, 14, 20, 0) === 0);
t('lines: capped', P.lineAlpha(40, 14, 20, 1) <= 0.9 + 1e-9);

// stateful: camera stub, rider speeds up, hits a pad, stops → fov restored exactly
const cam = { fov: 72, n: 0, updateProjectionMatrix() { this.n++; } };
let riding = true, speed = 0, onPad = false, boosts = 0;
const fx = FX.create({ camera: cam, topMS: 14, boostMS: 20, getRiding: () => riding, getSpeed: () => speed, getPos: () => ({ x: 0, z: 0 }),
  tracks: () => [{ boostAt: () => onPad }], onBoost: () => boosts++ });
fx.update(0.016); t('idle: fov untouched, no projection updates', cam.fov === 72 && cam.n === 0);
speed = 20; for (let i = 0; i < 120; i++) fx.update(0.016);
t('fast: fov widened', cam.fov > 80);
onPad = true; fx.update(0.016); fx.update(0.016); onPad = false;
t('pad: one boost per pass (cooldown)', boosts === 1);
riding = false; for (let i = 0; i < 400; i++) fx.update(0.016);
t('stop riding: fov handed back EXACTLY', cam.fov === 72 && fx.state().base === null);
console.log(ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
