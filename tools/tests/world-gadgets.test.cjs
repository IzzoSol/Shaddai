const vm = require('vm'), fs = require('fs'), assert = require('assert');
const store = {}; let sparks = 0, scentCalls = [];
const ctx = { console, Date, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, ShdSparks: { spend: n => { if (sparks < n) return false; sparks -= n; return true; } }, __mobs: { setScentless: s => scentCalls.push(s) } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-gadgets.js', 'utf8'), ctx);
const G = ctx.WorldGadgets, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('radar: forward is up, right is right, rear is down; yaw rotates the picture', () => {
  const me = { x: 0, z: 0 }, pl = (b, yaw) => G.radarPlot([b], me, yaw || 0, 100, 100, U)[0];
  const ahead = pl({ x: 0, z: 50 * U }), right = pl({ x: 50 * U, z: 0 }), behind = pl({ x: 0, z: -50 * U });
  assert(ahead.y < 50 && Math.abs(ahead.x - 50) < 1e-6, 'ahead is up'); assert(right.x < 50 && Math.abs(right.y - 50) < 1e-6, 'facing +z (south) east is on your LEFT'); assert(behind.y > 50, 'behind is down');
});
t('radar: facing +z, a blip at -x (the rider\'s right) appears on the right', () => {
  const p = G.radarPlot([{ x: -50 * U, z: 0 }], { x: 0, z: 0 }, 0, 100, 100, U)[0]; assert(p.x > 50, 'x ' + p.x);
  const q = G.radarPlot([{ x: 0, z: 50 * U }], { x: 0, z: 0 }, Math.PI, 100, 100, U)[0]; assert(q.y > 50, 'turned around: the +z blip is now behind you');
});
t('radar: out-of-range blips pin to the rim and are marked edge; in-range are not', () => {
  const far = G.radarPlot([{ x: 0, z: 400 * U }], { x: 0, z: 0 }, 0, 100, 100, U)[0], near = G.radarPlot([{ x: 0, z: 40 * U }], { x: 0, z: 0 }, 0, 100, 100, U)[0];
  assert(far.edge && !near.edge); assert(Math.hypot(far.x - 50, far.y - 50) <= 50 * 0.92 + 1e-6 && Math.hypot(far.x - 50, far.y - 50) > 40);
});
t('gadgets cost Sparks; one-off ones cannot be bought twice; scent stacks to 5', () => {
  assert(!G.buy('radar').ok); sparks = 5000; assert(G.buy('radar').ok && sparks === 4600); assert(!G.buy('radar').ok);
  assert(G.buy('binoculars').ok && G.buy('jetpack').ok); assert(sparks === 4600 - 250 - 1800); for (let i = 0; i < 5; i++) assert(G.buy('scent').ok); assert(!G.buy('scent').ok, 'max 5'); assert.strictEqual(G.state().scent, 5);
});
t('scent-away: consumes one, masks wolves for 90 s through WorldMobs, refuses at zero', () => {
  assert(G.useScent().ok && G.state().scent === 4 && scentCalls[0] === 90); for (let i = 0; i < 4; i++) G.useScent(); assert(!G.useScent().ok, 'none left');
});
t('jetpack: 0.3 s grace so normal jumps are untouched, then climbs (capped 8 m/s) and burns fuel', () => {
  const st = { fuel: 100, airT: 0, lockT: 0 }; let vy = 4, r;
  for (let i = 0; i < 5; i++) { r = G.jetStep(st, 0.05, { airborne: true, hold: true, vy }); vy = r.vy; } assert(!r.burning && vy === 4, 'no thrust in the grace window');
  for (let i = 0; i < 10; i++) { r = G.jetStep(st, 0.05, { airborne: true, hold: true, vy }); vy = r.vy; } assert(r.burning && vy > 4.5); for (let i = 0; i < 40; i++) { r = G.jetStep(st, 0.05, { airborne: true, hold: true, vy }); vy = r.vy; } assert(Math.abs(vy - 8) < 1e-9, 'capped ' + vy);
  assert(st.fuel < 100 && st.fuel > 0);
});
t('jetpack: runs dry after ~3.5 s, locks for 1 s, recharges on the ground, releasing Space stops thrust', () => {
  const st = { fuel: 100, airT: 1, lockT: 0 }; let r, burnT = 0; for (let i = 0; i < 100; i++) { r = G.jetStep(st, 0.05, { airborne: true, hold: true, vy: 0 }); if (r.burning) burnT += 0.05; } assert(burnT > 3.3 && burnT < 3.9, 'burn ' + burnT); assert.strictEqual(st.fuel, 0);
  r = G.jetStep(st, 0.05, { airborne: true, hold: true, vy: 0 }); assert(!r.burning, 'empty'); for (let i = 0; i < 40; i++) G.jetStep(st, 0.05, { airborne: false, hold: false, vy: 0 }); assert(st.fuel > 30, 'regen ' + st.fuel);
  const s2 = { fuel: 100, airT: 1, lockT: 0 }; assert(!G.jetStep(s2, 0.05, { airborne: true, hold: false, vy: 0 }).burning); assert.strictEqual(s2.airT, 0);
});
t('jetpack gadget not owned -> no thrust; binoculars zoom eases in and out and restores the FOV exactly', () => {
  G._reset(); assert(!G.jet(0.05, { airborne: true, hold: true, vy: 1 }).burning); sparks = 999; G.buy('binoculars'); const cam = { fov: 70, updateProjectionMatrix() { } };
  G.setZoom(true); for (let i = 0; i < 60; i++) G.applyFov(cam, 0.02); assert(cam.fov < 25 && cam.fov > 20, 'zoomed ' + cam.fov); G.setZoom(false); for (let i = 0; i < 120; i++) G.applyFov(cam, 0.02); assert.strictEqual(cam.fov, 70);
  G._reset(); G.setZoom(true); G.applyFov(cam, 0.5); assert.strictEqual(cam.fov, 70, 'cannot zoom without owning them');
});
console.log(pass + ' passed');
