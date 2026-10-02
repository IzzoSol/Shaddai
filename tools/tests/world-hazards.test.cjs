const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const ctx = { console, THREE }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-hazards.js', 'utf8'), ctx);
const H = ctx.WorldHazards, T = H.TUNE, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('lava mask: molten orange-red only (not sand, grass, snow, asphalt, water), correct orientation', () => {
  const n = 4, px = new Uint8Array(n * n * 4), set = (c, r, rgb) => { const i = (r * n + c) * 4; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255; };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) set(c, r, [120, 118, 112]);
  set(0, 0, [230, 90, 20]); set(3, 3, [200, 60, 15]); set(1, 1, [210, 190, 130]); set(2, 1, [60, 140, 50]); set(1, 2, [235, 240, 245]); set(2, 2, [30, 70, 140]);
  const half = 1000, m = H.lavaMask(px, n, half); assert(m(-1000, -1000) && m(1000, 1000) && !m(1000, -1000)); const c = 2000 / (n - 1); assert(!m(-1000 + c, -1000 + c), 'sand'); assert(!m(-1000 + 2 * c, -1000 + c), 'grass'); assert(!m(-1000 + c, -1000 + 2 * c), 'snow'); assert(!m(-1000 + 2 * c, -1000 + 2 * c), 'water'); assert(Math.abs(m.coverage - 2 / 16) < 1e-9);
});
t('burn model: 14 HP/s in lava, then 4 HP/s for 3 s after stepping out, then nothing', () => {
  const st = { burnT: 0 }; let d = 0; for (let i = 0; i < 100; i++) d += H.burnStep(st, 0.01, { inLava: true }).dmg; assert(Math.abs(d - 14) < 1e-6, 'lava ' + d);
  d = 0; let burning = true; for (let i = 0; i < 400; i++) { const r = H.burnStep(st, 0.01, { inLava: false }); d += r.dmg; if (i === 100) burning = r.burning; } assert(Math.abs(d - 12) < 0.2, 'afterburn ' + d); assert(burning); assert(!H.burnStep(st, 0.01, { inLava: false }).burning && H.burnStep(st, 0.01, { inLava: false }).dmg === 0);
});
t('water puts you out; hovering above lava is safe; Ember Boots cut it by 65 %', () => {
  const st = { burnT: 3 }; assert(H.burnStep(st, 0.1, { inLava: false, swimming: true }).dmg === 0 && st.burnT === 0);
  const s2 = { burnT: 0 }; assert.strictEqual(H.burnStep(s2, 1, { inLava: true, safe: true }).dmg, 0); assert.strictEqual(s2.burnT, 0);
  const s3 = { burnT: 0 }; assert(Math.abs(H.burnStep(s3, 1, { inLava: true, resist: 0.65 }).dmg - 14 * 0.35) < 1e-9); assert(Math.abs(H.burnStep({ burnT: 0 }, 1, { inLava: true, resist: 5 }).dmg - 1.4) < 1e-9, 'resist is capped at 90 %');
});
const mkWorld = (o) => { const scene = new THREE.Scene(), P = { pos: new THREE.Vector3(0, 0, 0), alive: true }, dmg = []; const hz = ctx.buildWorldHazards(Object.assign({ THREE, scene, heightAt: () => 0, getPlayer: () => P, getAvatar: () => ({ position: P.pos }), survival: { damage: (n, k) => dmg.push([n, k]) } }, o || {})); return { hz, P, dmg, scene }; };
t('overworld lava hurts the player through WorldSurvival in whole points, with the burn after; death kind is lava', () => {
  const w = mkWorld({ lavaAllow: (x) => x > 100 }); w.P.pos.set(500, 0, 0); for (let i = 0; i < 60; i++) w.hz.update(1 / 60); const total = w.dmg.reduce((a, d) => a + d[0], 0); assert(total >= 13 && total <= 14, 'one second in lava = ' + total); assert(w.dmg.every(d => d[1] === 'lava' && Number.isInteger(d[0])));
  assert(w.hz.state().inLava && w.hz.state().burning); w.P.pos.set(0, 0, 0); const before = w.dmg.length; for (let i = 0; i < 60 * 4; i++) w.hz.update(1 / 60); assert(w.dmg.length > before, 'afterburn'); assert(!w.hz.state().burning);
});
t('hovering 0.6 m+ above lava is safe (heat warning only); standing on it is not', () => {
  const w = mkWorld({ lavaAllow: () => true }); w.P.pos.set(0, 1.5 * U, 0); for (let i = 0; i < 120; i++) w.hz.update(1 / 60); assert.strictEqual(w.dmg.length, 0); assert(w.hz.state().heat); w.P.pos.set(0, 0.2 * U, 0); for (let i = 0; i < 60; i++) w.hz.update(1 / 60); assert(w.dmg.length > 0);
});
t('dead players and players far from lava take nothing; no lava mask means no overworld lava', () => {
  const w = mkWorld({ lavaAllow: () => true }); w.P.alive = false; for (let i = 0; i < 120; i++) w.hz.update(1 / 60); assert.strictEqual(w.dmg.length, 0); const n = mkWorld({}); for (let i = 0; i < 120; i++) n.hz.update(1 / 60); assert.strictEqual(n.dmg.length, 0);
});
t('Colosseum lava field: burns on the floor, safe on the obsidian islands, nothing when the field is not lava', () => {
  const root = new THREE.Group(); root.scale.setScalar(U); root.position.set(12000, 0, 0); root.updateMatrixWorld(true);
  const A = { root, dims: { A: 62, B: 44 }, floors: { state: { mode: 'lava' }, islands: () => [{ x: 0, z: 0, r: 7 }, { x: 20, z: 10, r: 3.4 }] } };
  let w = mkWorld({ getArena: () => A }); const at = (lx, lz) => { w = mkWorld({ getArena: () => A }); w.P.pos.set(12000 + lx * U, 0.2 * U, lz * U); for (let i = 0; i < 60; i++) w.hz.update(1 / 60); return w.dmg.reduce((a, d) => a + d[0], 0); };
  assert(at(30, -15) >= 13, 'floor burns'); assert.strictEqual(at(2, 2), 0, 'centre island'); assert.strictEqual(at(20.5, 10), 0, 'small island'); assert.strictEqual(w.hz.zoneAt(w.P.pos), null);
  assert(at(80, 0) === 0, 'outside the ellipse'); A.floors.state.mode = 'sand'; assert.strictEqual(at(30, -15), 0, 'not a lava field'); A.floors.state.mode = 'lava'; assert(at(30, -15) >= 13);
});
t('dispose removes the flames from the scene', () => { const w = mkWorld({ lavaAllow: () => true }); assert(w.scene.children.length >= 1); w.hz.dispose(); assert.strictEqual(w.scene.children.length, 0); });
console.log(pass + ' passed');
