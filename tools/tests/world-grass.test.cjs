const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const ctx = { console, THREE }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-grass.js', 'utf8'), ctx);
const W = ctx.WorldGrass, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const mk = (o) => { const scene = new THREE.Scene(), P = { pos: { x: 0, y: 0, z: 0 } }; const g = ctx.buildWorldGrass(Object.assign({ THREE, scene, heightAt: () => 0, getPlayer: () => P, quality: 'HIGH' }, o || {})); return { g, scene, P }; };
t('a cell always grows the same tuft (no popping or reshuffling), and about 60% of cells grow one', () => {
  const a = W.tuftFor(12, -7), b = W.tuftFor(12, -7); assert.deepStrictEqual(a, b); let keep = 0; for (let i = 0; i < 4000; i++) if (W.tuftFor(i, i * 3 - 17).keep) keep++; assert(keep / 4000 > 0.55 && keep / 4000 < 0.69, 'keep ' + keep / 4000);
  for (let i = 0; i < 50; i++) { const x = W.tuftFor(i, 3); assert(x.scale >= 0.7 && x.scale <= 1.4 && x.dx >= 0 && x.dx < 1 && x.rot >= 0 && x.rot < 6.29); }
});
t('edge fade: full size well inside the ring, shrinking to zero at the rim, monotonic', () => {
  const R = 100; assert.strictEqual(W.edgeScale(10, R), 1); assert.strictEqual(W.edgeScale(100, R), 0); let prev = 1; for (let d = 70; d <= 100; d += 2) { const s = W.edgeScale(d, R); assert(s <= prev + 1e-12); prev = s; }
});
t('grass appears around the player, inside the ring, within the quality budget, as one draw call', () => {
  const { g, scene, P } = mk(); g.update(0.016); const n = g.stats().tufts; assert(n > 1500 && n <= 7000, 'tufts ' + n); const R = W.R_M * U, M = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let i = 0; i < n; i += 37) { g.mesh.getMatrixAt(i, M); v.setFromMatrixPosition(M); assert(Math.hypot(v.x, v.z) < R + 1e-6, 'inside ring'); } assert.strictEqual(scene.children.filter(c => c.isInstancedMesh).length, 1);
});
t('it follows the player: after moving more than 6 m the ring is rebuilt around the new spot, standing still does not rebuild', () => {
  const { g, P } = mk(); g.update(0.016); const first = g.mesh.instanceMatrix.version; P.pos.x = 2 * U; g.update(0.016); assert.strictEqual(g.mesh.instanceMatrix.version, first, 'small step: no rebuild');
  P.pos.x = 200 * U; g.update(0.016); assert(g.mesh.instanceMatrix.version > first); const M = new THREE.Matrix4(), v = new THREE.Vector3(); g.mesh.getMatrixAt(0, M); v.setFromMatrixPosition(M); assert(Math.abs(v.x - 200 * U) < W.R_M * U);
});
t('grows only where allowed, never on water, never on steep ground', () => {
  const none = mk({ allow: () => false }); none.g.update(0.016); assert.strictEqual(none.g.stats().tufts, 0);
  const half = mk({ allow: (x) => x > 0 }); half.g.update(0.016); const M = new THREE.Matrix4(), v = new THREE.Vector3(); for (let i = 0; i < half.g.stats().tufts; i += 13) { half.g.mesh.getMatrixAt(i, M); v.setFromMatrixPosition(M); assert(v.x > -1e-6); } assert(half.g.stats().tufts > 500);
  const lake = mk({ waterAt: () => 5, heightAt: () => 0 }); lake.g.update(0.016); assert.strictEqual(lake.g.stats().tufts, 0, 'underwater'); const cliff = mk({ heightAt: (x, z) => x * 3 }); cliff.g.update(0.016); assert.strictEqual(cliff.g.stats().tufts, 0, 'steep');
  const dry = mk({ waterAt: () => null }); dry.g.update(0.016); assert(dry.g.stats().tufts > 1000);
});
t('quality tiers cap the count; POTATO grows nothing; switching rebuilds', () => {
  const { g } = mk(); g.update(0.016); const high = g.stats().tufts; g.setQuality('LOW'); g.update(0.016); assert(g.stats().tufts <= 2200 && g.stats().tufts < high); g.setQuality('POTATO'); g.update(0.016); assert.strictEqual(g.stats().tufts, 0); assert.strictEqual(g.mesh.count, 0);
  g.setQuality('HIGH'); g.update(0.016); assert(g.stats().tufts > 1500); g.setQuality('nonsense'); assert.strictEqual(g.stats().quality, 'HIGH');
});
t('over budget keeps the NEAREST tufts (what you stand in), not random ones', () => {
  const reach = (q) => { const { g } = mk({ quality: q }); g.update(0.016); const M = new THREE.Matrix4(), v = new THREE.Vector3(); let far = 0; for (let i = 0; i < g.stats().tufts; i++) { g.mesh.getMatrixAt(i, M); v.setFromMatrixPosition(M); far = Math.max(far, Math.hypot(v.x, v.z)); } return far / U; };
  const low = reach('LOW'), high = reach('HIGH'); assert(low < high - 2, 'LOW reaches ' + low.toFixed(1) + ' m, HIGH ' + high.toFixed(1) + ' m'); assert(low > 20, 'still a decent patch');
});
t('wind + player-push shader patch is applied to the material and exposes its uniforms', () => {
  const { g } = mk(); const mat = g.mesh.material, sh = { uniforms: {}, vertexShader: '#include <common>\nvoid main(){\n#include <project_vertex>\n}' }; mat.onBeforeCompile(sh);
  assert(/uPlayer/.test(sh.vertexShader) && /uTime/.test(sh.vertexShader) && /instanceMatrix \* vec4\(transformed/.test(sh.vertexShader) && /gl_Position = projectionMatrix \* mvPosition/.test(sh.vertexShader)); assert(sh.uniforms.uTime && sh.uniforms.uPlayer && sh.uniforms.uWind);
  g.update(1.5); assert(Math.abs(g.uniforms.uTime.value - 1.5) < 1e-9); g.setWind(0.4); assert.strictEqual(g.uniforms.uWind.value, 0.4);
});
t('dispose removes it from the scene', () => { const { g, scene } = mk(); g.dispose(); assert.strictEqual(scene.children.length, 0); });
t('green mask: grass only where the ground colour map is green (not snow, sand, lava, asphalt, water), correct orientation', () => {
  const n = 4, px = new Uint8Array(n * n * 4), set = (c, r, rgb) => { const i = (r * n + c) * 4; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255; };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) set(c, r, [120, 118, 112]);                                  // asphalt grey
  set(0, 0, [60, 140, 50]); set(3, 3, [90, 160, 70]); set(1, 1, [235, 240, 245]); set(2, 1, [210, 190, 130]); set(1, 2, [200, 70, 30]); set(2, 2, [30, 70, 140]);   // NW green, SE green, snow, sand, lava, water
  const half = 1000, ok = W.greenMask(px, n, half); assert(ok(-1000, -1000), 'north-west corner is green'); assert(ok(1000, 1000), 'south-east corner is green'); assert(!ok(1000, -1000), 'north-east is grey');
  const cell = 2000 / (n - 1); assert(!ok(-1000 + cell, -1000 + cell), 'snow'); assert(!ok(-1000 + 2 * cell, -1000 + cell), 'sand'); assert(!ok(-1000 + cell, -1000 + 2 * cell), 'lava'); assert(!ok(-1000 + 2 * cell, -1000 + 2 * cell), 'water'); assert(!ok(5000, 0) && !ok(0, -5000), 'outside the map');
  assert(Math.abs(ok.coverage - 2 / 16) < 1e-9, 'coverage ' + ok.coverage);
});
console.log(pass + ' passed');
