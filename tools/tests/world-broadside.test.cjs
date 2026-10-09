const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const ctx = { console, THREE }; ctx.window = ctx; vm.createContext(ctx);
const SRC = fs.readFileSync('public/world-broadside.js', 'utf8');
vm.runInContext(fs.readFileSync('public/world-rng.js', 'utf8'), ctx); vm.runInContext(SRC, ctx);
const WB = ctx.WorldBroadside, RNG = ctx.WorldRNG; let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const ship = { x: 0, z: 0, psi: 0, y: 0.7, v: 0 };
function mk(extra) { const scene = new THREE.Scene(); const B = WB.create(Object.assign({ THREE, scene, rng: RNG.create(7), waterHeightAt: () => -50 }, extra || {})); return { B, scene }; }

t('no Math.random and no lights in the module', () => { const s = SRC.replace(/\/\*[\s\S]*?\*\//, ''); assert(!/Math\.random/.test(s)); assert(!/Light\s*\(/.test(s)); });
t('6 shots: no smoke ever older than 1.6 s; per-side spacing >= 0.35 s', () => {
  const { B } = mk(); const fired = { starboard: [], port: [] }; let now = 0, maxOld = 0;
  for (let i = 0; i < 200; i++) {   // 10 ms steps, ask to fire every step on both sides until 6 shots landed
    now += 0.01; ['starboard', 'port'].forEach(sd => { if (fired.starboard.length + fired.port.length < 6 && B.fire(sd, ship)) fired[sd].push(now); }); B.update(0.01); maxOld = Math.max(maxOld, B.stats().oldestSmoke);
  }
  assert.strictEqual(fired.starboard.length + fired.port.length, 6); [fired.starboard, fired.port].forEach(a => { for (let i = 1; i < a.length; i++) assert(a[i] - a[i - 1] >= 0.35 - 1e-6, 'spacing ' + (a[i] - a[i - 1])); });
  for (let i = 0; i < 400; i++) { B.update(0.016); const s = B.stats(); assert(s.oldestSmoke < 1.6, 'smoke age ' + s.oldestSmoke); maxOld = Math.max(maxOld, s.oldestSmoke); }
  assert(maxOld > 1.3 && maxOld < 1.6, 'smoke lived its full life: ' + maxOld); assert.strictEqual(B.stats().liveSmoke, 0);
});
t('a salvo is 4 flashes, 12 tracers, 4 smoke; second fire inside the cooldown is refused', () => {
  const { B } = mk(); assert(B.fire('starboard', ship)); const s = B.stats(); assert.strictEqual(s.liveTracers, 0); B.update(0.001); const s2 = B.stats(); assert.strictEqual(s2.liveTracers, 12); assert.strictEqual(s2.liveSmoke, 4); assert.strictEqual(s2.liveFlash, 4); assert(!B.fire('starboard', ship)); assert(B.fire('port', ship));
});
t('tracer count is bounded however hard you mash fire', () => {
  const { B } = mk(); let peak = 0; for (let i = 0; i < 600; i++) { B.fire('starboard', ship); B.fire('port', ship); B.update(0.016); peak = Math.max(peak, B.stats().liveTracers); assert(B.stats().liveSmoke <= 48); } assert(peak <= 128, 'peak ' + peak); assert(peak >= 24);
});
t('pool objects are reused (identity) and the scene never gains children', () => {
  const { B, scene } = mk(); const base = scene.children.length, grpKids = B.group.children.length, ids = new Set(B.group.children.map(c => c.uuid));
  for (let i = 0; i < 40; i++) { B.fire('starboard', ship); B.fire('port', ship); for (let j = 0; j < 30; j++) B.update(0.0125); }
  assert.strictEqual(scene.children.length, base); assert.strictEqual(B.group.children.length, grpKids); B.group.children.forEach(c => assert(ids.has(c.uuid)));
});
t('scene child count returns to baseline after 3 s and everything is hidden', () => {
  const { B, scene } = mk(); const base = scene.children.length; B.fire('starboard', ship); B.fire('port', ship); for (let i = 0; i < 200; i++) B.update(0.015);
  assert.strictEqual(scene.children.length, base); const s = B.stats(); assert.strictEqual(s.draws, 0); assert(B.group.children.every(c => !c.visible));
});
t('tracers below the water surface spawn a column that lasts 0.5 s', () => {
  const { B } = mk({ waterHeightAt: () => 100 }); B.fire('starboard', ship); B.update(0.016); const s = B.stats(); assert(s.impacts >= 1 && s.liveColumns >= 1, JSON.stringify(s)); assert.strictEqual(s.liveTracers, 0);
  for (let i = 0; i < 40; i++) B.update(0.0125); assert.strictEqual(B.stats().liveColumns, 0);
});
t('some tracers splash on a normal sea (pitch spread), and vfx/flash/audio callbacks are honoured', () => {
  const calls = { burst: [], flash: 0, boom: 0 }; const { B } = mk({ waterHeightAt: () => 0.7, vfx: { burst: (k) => calls.burst.push(k) }, flash: () => calls.flash++, audio: (k) => { if (k === 'boom') calls.boom++; } });
  for (let i = 0; i < 10; i++) { B.fire('starboard', ship); for (let j = 0; j < 40; j++) B.update(0.0125); }
  assert(calls.burst.includes('muzzle') && calls.burst.includes('splash'), calls.burst.join()); assert.strictEqual(calls.flash, 40); assert.strictEqual(calls.boom, 10); assert.strictEqual(B.stats().liveFlash, 0);
});
t('sides: starboard tracers leave along ship-local +x, port along -x (psi=0 -> world +x / -x)', () => {
  const a = mk(), b = mk(); a.B.fire('starboard', ship); a.B.update(0.05); b.B.fire('port', ship); b.B.update(0.05);
  const pa = a.B._pool.lines.geometry.attributes.position.array, pb = b.B._pool.lines.geometry.attributes.position.array; assert(pa[0] > 2.5 && pb[0] < -2.5, pa[0] + ' ' + pb[0]);
});
t('deterministic: same seed -> identical tracer positions', () => {
  const a = mk(), b = mk(); a.B.fire('starboard', ship); b.B.fire('starboard', ship); a.B.update(0.3); b.B.update(0.3); const x = a.B._pool.lines.geometry.attributes.position.array, y = b.B._pool.lines.geometry.attributes.position.array; for (let i = 0; i < x.length; i++) assert.strictEqual(x[i], y[i]);
});
console.log(pass + ' passed, ' + fail + ' failed');
