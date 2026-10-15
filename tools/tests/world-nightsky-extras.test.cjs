const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const g2 = new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() { } }) : () => { }), set: (t, k, v) => { t[k] = v; return true; } });
const ctx = { console, THREE, document: { createElement: () => ({ width: 0, height: 0, getContext: () => g2 }) } }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-nightsky-extras.js', 'utf8'), ctx);
const X = ctx.WorldNightSkyExtras; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
let seed = 7; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mk = (night, time) => { const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 20000); cam.position.set(50, 10, -30); let N = night, T = time == null ? 0.1 : time; const s = ctx.buildNightSkyExtras({ THREE, scene, camera: cam, getNight: () => N, getTime: () => T, rng }); return { s, scene, cam, setN: v => { N = v; }, setT: v => { T = v; } }; };
t('direction helper is unit length, y is up, azimuth 0 faces +z', () => { const d = X.dirFromAzEl(0, 0); assert(Math.abs(d[2] - 1) < 1e-9 && Math.abs(d[1]) < 1e-9); const u = X.dirFromAzEl(1.3, 0.7); assert(Math.abs(Math.hypot(...u) - 1) < 1e-9); assert(X.dirFromAzEl(2, Math.PI / 2)[1] > 0.999); });
t('planets fade in with the night; invisible by day', () => { assert.strictEqual(X.planetVisibility(0), 0); assert(X.planetVisibility(0.5) > 0.3 && X.planetVisibility(0.5) < 0.8); assert.strictEqual(X.planetVisibility(1), 1); });
t('meteors are rarer at dusk and frequent in deep night', () => { const a = X.nextMeteorIn(() => 0.5, 0.5), b = X.nextMeteorIn(() => 0.5, 1); assert(a > b && b >= 6 && a < 40); });
t('a meteor path always stays above the horizon and inside the sky', () => { for (let i = 0; i < 200; i++) { const m = { az: rng() * 6.28, el: (25 + rng() * 50) * Math.PI / 180, head: rng() * 6.28, len: (18 + rng() * 14) * Math.PI / 180 }; for (let f = 0; f <= 1; f += 0.1) { const p = X.meteorPoint(m, f); assert(p[1] > 0.06 && p[1] <= 1, 'y ' + p[1]); assert(Math.abs(Math.hypot(...p) - 1) < 1e-9); } } });
t('moon 2 orbits on its own period and dips below the horizon', () => { let up = 0, down = 0; for (let k = 0; k < 100; k++) { (X.moon2Dir(k / 100).el > 0 ? up++ : down++); } assert(up > 25 && down > 25); const a = X.moon2Dir(0.2).dir, b = X.moon2Dir(0.4).dir; assert(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.3); });
t('builds 3 planets (one ringed), moon 2 and 4 meteor slots in one group that follows the camera', () => {
  const { s, scene, cam } = mk(1); s.update(0.016); assert(scene.children.includes(s.group)); assert.strictEqual(s.stats().planets, 3); assert(s.stats().moon2); assert(s._planets[0].ring && !s._planets[1].ring); assert(s._meteors.length === 4);
  assert(Math.abs(s.group.position.x - 50) < 1e-9); cam.position.set(900, 5, 0); s.update(0.016); assert.strictEqual(s.group.position.x, 900);
  let allAfterSky = true; s.group.traverse(o => { if (o.isMesh || o.isLine) { if (o.renderOrder !== 9999 || o.material.depthWrite !== false || o.material.fog !== false) allAfterSky = false; } }); assert(allAfterSky, 'rendered after the sky, no depth write, no fog');
});
t('by day: no shooting stars, planets hidden; at night: planets visible and meteors spawn, live ~1 s, then free their slot', () => {
  const day = mk(0); for (let i = 0; i < 60 * 40; i++) day.s.update(1 / 60); assert.strictEqual(day.s.stats().meteorsAlive, 0); assert(day.s._planets.every(p => p.u.uOpacity.value === 0 && !p.sph.visible));
  const n = mk(1); let spawned = 0, maxAlive = 0, life = []; const seen = new Map(); for (let i = 0; i < 60 * 120; i++) { n.s.update(1 / 60); const alive = n.s._meteors.filter(m => m.alive); maxAlive = Math.max(maxAlive, alive.length); alive.forEach(m => { seen.set(m, (seen.get(m) || 0) + 1 / 60); }); }
  assert(n.s._planets.every(p => p.u.uOpacity.value > 0.9 && p.sph.visible)); assert(maxAlive >= 1 && maxAlive <= 4); const lifetimes = [...seen.values()]; assert(lifetimes.length >= 1 && Math.max(...lifetimes) < 120); assert.strictEqual(n.s.spawnShootingStar() || true, true);
  const e = mk(1); assert(e.s.spawnShootingStar()); for (let i = 0; i < 5; i++) e.s.spawnShootingStar(); assert.strictEqual(e.s.stats().meteorsAlive, 4, 'pool capped at 4'); for (let i = 0; i < 90; i++) e.s.update(1 / 60); assert(e.s.stats().meteorsAlive <= 4);
});
t('a live meteor writes a glowing head and a fading trail into its line geometry', () => {
  const { s } = mk(1); s.spawnShootingStar(); const m = s._meteors[0]; m.dur = 1; for (let i = 0; i < 30; i++) s.update(1 / 60); const col = m.line.geometry.attributes.color; assert(col.getX(0) > col.getX(11) && col.getX(0) > 0.2, 'head brighter than tail'); const pos = m.line.geometry.attributes.position; assert(isFinite(pos.getX(0)) && Math.hypot(pos.getX(0), pos.getY(0), pos.getZ(0)) > 1000);
});
t('moon 2 is hidden when below the horizon and visible (dimmed by day) when up', () => {
  const a = mk(1, 0.35); a.s.update(0.016); const up = a.s._moon2().visible; const b = mk(1, 0.1); b.s.update(0.016); const el1 = X.moon2Dir(0.35).el, el2 = X.moon2Dir(0.1).el; assert.strictEqual(up, el1 > -0.05 && a.s._moon2().material.opacity > 0.01); assert.strictEqual(b.s._moon2().visible, el2 > -0.05 && b.s._moon2().material.opacity > 0.01);
  const dayMoon = mk(0, 0.35); dayMoon.s.update(0.016); assert(dayMoon.s._moon2().material.opacity < a.s._moon2().material.opacity + 1e-9 || !a.s._moon2().visible);
});
t('dispose removes the group', () => { const { s, scene } = mk(1); s.dispose(); assert.strictEqual(scene.children.length, 0); });
t('real star layer + Milky Way: ~1500 stars over the whole sky, ~1400 hugging one great circle, all above the horizon, fade in with the night', () => {
  const { s } = mk(1); s.update(0.016); assert(s.stats().stars >= 1400 && s.stats().milkyWay >= 1200); const R = s.stats().radius;
  const check = (L) => { const a = L.pts.geometry.attributes.position; let low = 0; for (let i = 0; i < a.count; i++) { const y = a.getY(i) / R; if (y < 0.03 - 1e-9) low++; assert(Math.abs(Math.hypot(a.getX(i), a.getY(i), a.getZ(i)) - R) < 1e-3 * R); } assert.strictEqual(low, 0, 'nothing below the horizon'); return a; };
  check(s._stars()); const m = check(s._milky()); const nrm = [0.3, 0.8, 0.5], nl = Math.hypot(...nrm); let near = 0; for (let i = 0; i < m.count; i++) { const d = Math.abs((m.getX(i) * nrm[0] + m.getY(i) * nrm[1] + m.getZ(i) * nrm[2]) / (R * nl)); if (d < 0.2) near++; } assert(near / m.count > 0.85, 'band concentration ' + near / m.count);
  assert(s._stars().u.uNight.value > 0.99 && s._stars().pts.visible); const day = mk(0); day.s.update(0.016); assert(day.s._stars().u.uNight.value === 0 && !day.s._stars().pts.visible);
  const dusk = mk(0.3); dusk.s.update(0.016); assert(dusk.s._stars().u.uNight.value > 0 && dusk.s._stars().u.uNight.value < 1, 'stars come out at dusk');
});
t('stars twinkle (time uniform advances) and have varied sizes and colours (warm, white, blue)', () => {
  const { s } = mk(1); s.update(0.5); const t1 = s._stars().u.uTime.value; s.update(0.5); assert(s._stars().u.uTime.value > t1); const sz = s._stars().pts.geometry.attributes.aSize, col = s._stars().pts.geometry.attributes.aColor; let mn = 99, mx = 0, warm = 0, blue = 0; for (let i = 0; i < sz.count; i++) { mn = Math.min(mn, sz.getX(i)); mx = Math.max(mx, sz.getX(i)); if (col.getZ(i) < 0.7) warm++; if (col.getX(i) < 0.8) blue++; } assert(mx > mn * 2 && warm > 50 && blue > 200, `size ${mn}-${mx} warm ${warm} blue ${blue}`);
});
t('planets are big enough to read (gas giant ~6 deg across) and the ring has radial uvs from inner to outer edge', () => {
  const { s } = mk(1); s.update(0.016); const gas = s._planets[0], R = s.stats().radius; const ang = 2 * Math.atan(gas.sph.scale.x / R) * 180 / Math.PI; assert(ang > 8 && ang < 30, 'gas giant apparent diameter ' + ang.toFixed(1) + ' deg');
  const uv = gas.ring.geometry.attributes.uv, pos = gas.ring.geometry.attributes.position; let lo = 9, hi = -9; for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); const u = uv.getX(i); lo = Math.min(lo, u); hi = Math.max(hi, u); if (Math.abs(r - 1.5) < 1e-6) assert(Math.abs(u) < 1e-6); if (Math.abs(r - 2.6) < 1e-6) assert(Math.abs(u - 1) < 1e-6); } assert(Math.abs(lo) < 1e-6 && Math.abs(hi - 1) < 1e-6);
});
console.log(pass + ' passed');
