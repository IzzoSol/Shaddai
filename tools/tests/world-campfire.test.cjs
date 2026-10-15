const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const store = {}; let sparks = 0;
const ctx = { console, THREE, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, ShdSparks: { spend: n => { if (sparks < n) return false; sparks -= n; return true; } } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-campfire.js', 'utf8'), ctx);
const C = ctx.WorldCampfire, T = C.T, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const fire = (age, burnS) => ({ age, burnS: burnS || T.burnBase, seed: 1, x: 0, z: 0, U });
t('ignition timeline: kneel 1.0 s, sparks 0.8 s, catch 1.5 s, burning, dying (last 20 s), coals 30 s, out', () => {
  const at = a => C.phaseOf(fire(a)); assert.strictEqual(at(0.5), 'kneel'); assert.strictEqual(at(1.5), 'spark'); assert.strictEqual(at(2.5), 'catch'); assert.strictEqual(at(10), 'burning'); const end = 1 + 0.8 + 1.5 + 360;
  assert.strictEqual(at(end - 25), 'burning'); assert.strictEqual(at(end - 10), 'dying'); assert.strictEqual(at(end + 10), 'coals'); assert.strictEqual(at(end + 21 + 30), 'out');
});
t('the flame grows while catching, is full while burning, shrinks while dying, and is gone as coals', () => {
  const s = a => C.flameScale(fire(a)); assert.strictEqual(s(0.5), 0); assert(s(1.7) > 0 && s(1.7) < 0.2); assert(s(3.0) > 0.2 && s(3.0) < 0.9); assert.strictEqual(s(20), 1); const end = 3.3 + 360; assert(s(end - 10) < 1 && s(end - 10) > 0.25, 'dying'); assert.strictEqual(s(end + 10), 0, 'coals have no flame');
});
t('light flickers within bounds, follows the flame, is much brighter at night than by day (never invisible by day)', () => {
  const f = fire(20); let mn = 9, mx = 0; for (let i = 0; i < 400; i++) { const v = C.lightLevel(f, 1, i * 0.037); mn = Math.min(mn, v); mx = Math.max(mx, v); } assert(mn > 1.55 && mx < 2.45 && mx > mn, mn + ' ' + mx);
  const day = C.lightLevel(f, 0, 1), night = C.lightLevel(f, 1, 1); assert(night > day * 3 && day > 0.3); assert.strictEqual(C.lightLevel(fire(0.5), 1, 1), 0);
});
t('warmth heals 1.5 HP/s within 9 m of a burning fire, only after 3 s without a hit, never beyond range or from coals', () => {
  const fs2 = [fire(30)]; assert.strictEqual(C.healPerSecond(fs2, 3 * U, 0, 10), 1.5); assert.strictEqual(C.healPerSecond(fs2, 3 * U, 0, 1), 0, 'recently hit'); assert.strictEqual(C.healPerSecond(fs2, 20 * U, 0, 10), 0, 'too far');
  assert.strictEqual(C.healPerSecond([fire(3.3 + 360 + 40)], 0, 0, 10), 0, 'coals do not heal'); assert.strictEqual(C.healPerSecond([fire(2.6)], 0, 0, 10), 0, 'still catching: no heal yet');
});
t('safe zone: animals keep away only while a fire is really burning, within 12 m', () => { const fs2 = [fire(30)]; assert(C.isSafe(fs2, 10 * U, 0)); assert(!C.isSafe(fs2, 14 * U, 0)); assert(!C.isSafe([fire(1.2)], 0, 0), 'not yet lit'); assert(!C.isSafe([fire(3.3 + 360 + 40)], 0, 0), 'coals'); });
t('shop: kit 80, log 45, flame cosmetics 250 (blue 400); refuses without Sparks; equip needs ownership', () => {
  C._reset(); sparks = 0; assert(!C.buyKit().ok); sparks = 2000; assert(C.buyKit().ok && sparks === 1920 && C.state().kits === 1); assert(C.buyLog().ok && sparks === 1875); assert(!C.equipStyle('emerald').ok);
  assert(C.buyStyle('emerald').ok && sparks === 1625 && C.state().style === 'emerald'); assert(!C.buyStyle('emerald').ok); assert(C.buyStyle('blue').ok && sparks === 1225); assert(C.equipStyle('classic').ok && C.state().style === 'classic'); assert(!C.buyStyle('nope').ok);
});
function world(o) { const scene = new THREE.Scene(), P = { pos: { x: 0, y: 0, z: 0 } }, heals = [], kneels = []; const c = C.create(Object.assign({ THREE, scene, heightAt: () => 0, getPlayer: () => P, getYaw: () => 0, getNight: () => 1, onKneel: v => kneels.push(v), onHeal: h => heals.push(h) }, o || {})); return { c, scene, P, heals, kneels }; }
t('placing: needs a kit, kneels first then stands up, builds logs, a stone ring, flames and one real light', () => {
  C._reset(); const w = world(); assert(!w.c.place().ok, 'no kit'); sparks = 500; C.buyKit(); const r = w.c.place(); assert(r.ok); assert.strictEqual(C.state().kits, 0); assert.deepStrictEqual(w.kneels, [true]);
  const f = w.c.fires()[0]; assert(Math.abs(f.z - 2.2 * U) < 1e-6, 'two metres in front'); assert(w.scene.children.includes(f.v.group) && w.scene.children.some(c => c.isPointLight)); assert(f.v.group.children.filter(c => c.geometry && c.geometry.type === 'CylinderGeometry').length === 3);
  for (let i = 0; i < 80; i++) w.c.update(0.02); assert.deepStrictEqual(w.kneels, [true, false], 'stands up after kneeling');
});
t('a lit fire burns, lights the night, heals the player, protects, then goes out and the scene is clean', () => {
  C._reset(); sparks = 500; C.buyKit(); const w = world(); w.c.place(); for (let i = 0; i < 60 * 8; i++) w.c.update(1 / 60); const f = w.c.fires()[0]; assert.strictEqual(C.phaseOf(f), 'burning'); assert(w.c.light.intensity > 100, 'real light at night ' + w.c.light.intensity); assert(w.c.isSafe(f.x, f.z));
  const healed = w.heals.reduce((a, b) => a + b, 0); assert(healed > 5, 'healed ' + healed); const before = w.heals.length; w.c.hurt(); for (let i = 0; i < 60 * 2; i++) w.c.update(1 / 60); assert.strictEqual(w.heals.length, before, 'no healing for 3 s after a hit');
  for (let i = 0; i < 20 * 440; i++) w.c.update(0.05); assert.strictEqual(w.c.fires().length, 0); assert.strictEqual(w.c.light.intensity, 0); assert(!w.scene.children.some(c => c.isGroup));
});
t('rules: max 3 fires, 4 m apart, 5 s cooldown, not in water; logs extend burning up to the 15 min cap', () => {
  C._reset(); sparks = 9000; for (let i = 0; i < 5; i++) C.buyKit(); const w = world(); assert(w.c.place().ok); assert(!w.c.place().ok, 'cooldown');
  for (let i = 0; i < 6 * 20; i++) w.c.update(0.05); assert(!w.c.place().ok, 'too close to the first fire'); w.P.pos.x = 30 * U; assert(w.c.place().ok); for (let i = 0; i < 6 * 20; i++) w.c.update(0.05); w.P.pos.x = 60 * U; assert(w.c.place().ok); for (let i = 0; i < 6 * 20; i++) w.c.update(0.05);
  w.P.pos.x = 90 * U; const r4 = w.c.place(); assert(!r4.ok && /Too many/.test(r4.msg), r4.msg);
  C._reset(); sparks = 9000; C.buyKit(); const wet = world({ waterAt: () => 5 }); assert(!wet.c.place().ok); assert.strictEqual(C.state().kits, 1, 'the kit is not used up by a refused placement');
  C._reset(); sparks = 9000; C.buyKit(); for (let i = 0; i < 10; i++) C.buyLog(); const w2 = world(); w2.c.place(); for (let i = 0; i < 6 * 20; i++) w2.c.update(0.05); const f = w2.c.fires()[0]; w2.P.pos.x = f.x; w2.P.pos.z = f.z; let n = 0; while (w2.c.addLog().ok) n++; assert.strictEqual(f.burnS, 900); assert(n >= 4 && n <= 5, 'logs used ' + n);
});
t('flame style cosmetics change the cone colours and the light', () => {
  C._reset(); sparks = 5000; C.buyKit(); C.buyStyle('violet'); const w = world(); w.c.place(); const f = w.c.fires()[0]; assert.strictEqual(f.v.flames[1].material.color.getHex(), 0xb06bff); for (let i = 0; i < 400; i++) w.c.update(0.02); assert.strictEqual(w.c.light.color.getHex(), 0xa070ff);
});
console.log(pass + ' passed');
