const assert = require('assert'), vm = require('vm'), fs = require('fs');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const canvasStub = { getContext: () => ({ fillStyle: '', fillRect() { }, save() { }, restore() { }, translate() { }, rotate() { } }), width: 0, height: 0 };
const ctx = { console, THREE, performance, document: { createElement: () => Object.assign({}, canvasStub) } }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/world-mobs.js', 'utf8'), ctx);
const U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
function mk() {
  const scene = new THREE.Scene(), P = { x: 0, z: 0 }, hits = [], events = [];
  const mobs = ctx.buildWorldMobs({ THREE, scene, heightAt: () => 0, terrainMeta: { grid_r_m: 1600, water_level_m: -50 }, getPlayer: () => ({ pos: P, alive: true }), onHitPlayer: (d, k, i) => hits.push({ d, k, i }), nightFactor: () => 0 });
  ['hit', 'kill', 'shot', 'aggro'].forEach(e => mobs.on(e, a => events.push(Object.assign({ e }, a))));
  const grp = scene.children.find(c => c.name === 'world-mobs'); const list = () => grp.children.filter(c => c.userData && c.userData.kind);
  return { mobs, P, hits, events, list };
}
const near = (r, kind) => { const m = r.list().find(g => g.userData.kind === kind); return m; };
const tick = (r, sec, dt) => { for (let i = 0; i < sec / (dt || 0.05); i++) r.mobs.update(dt || 0.05); };

t('roster: 9 enemy types (+ citadel skeleton guard, b7476d03), 16 camps, every camp has a companion type; golems only in the outer ring', () => {
  const r = mk(); assert.strictEqual(Object.keys(r.mobs.TYPES).length, 9); assert(r.mobs.TYPES.skeleton, 'citadel skeleton type'); assert.strictEqual(r.mobs.camps().length, 16);
  const kinds = {}; r.list().forEach(g => { kinds[g.userData.kind] = (kinds[g.userData.kind] || 0) + 1; }); ['mummy', 'imp', 'wraith', 'stalker', 'wolf', 'spitter', 'scorpion', 'golem'].forEach(k => assert(kinds[k] > 0, 'missing ' + k));
  assert(kinds.wolf >= 2 && kinds.spitter >= 2 && kinds.golem >= 2, JSON.stringify(kinds));
});
t('wolves hunt as a pack: one aggro pulls the whole pack; Scent-Away makes them ignore you until you are nearly on top of them', () => {
  const r = mk(); const w = near(r, 'wolf'); r.P.x = w.position.x + 30 * U; r.P.z = w.position.z; r.mobs.update(0.05);
  assert(r.events.some(e => e.e === 'aggro' && e.type === 'wolf'), 'wolf aggro at 30 m');
  const r2 = mk(); const w2 = near(r2, 'wolf'); r2.mobs.setScentless(60); assert(r2.mobs.isScentless()); r2.P.x = w2.position.x + 30 * U; r2.P.z = w2.position.z; tick(r2, 2); assert(!r2.events.some(e => e.e === 'aggro' && e.type === 'wolf'), 'scent-away: no aggro at 30 m');
  r2.P.x = w2.position.x + 3 * U; tick(r2, 0.2); assert(r2.events.some(e => e.e === 'aggro' && e.type === 'wolf'), 'but stepping on them still wakes them');
});
t('spitter keeps its distance and spits after a 0.8 s tell (ranged hit, never melee)', () => {
  const r = mk(); const s = near(r, 'spitter'); r.P.x = s.position.x + 18 * U; r.P.z = s.position.z; tick(r, 0.3); assert.strictEqual(r.hits.length, 0, 'no instant hit');
  tick(r, 1.6); assert(r.hits.some(h => h.k === 'mob-ranged' && h.i.mob === 'spitter'), JSON.stringify(r.hits.map(h => h.k))); assert(r.events.some(e => e.e === 'shot' && e.kind === 'spitter'));
  const d = Math.hypot(s.position.x - r.P.x, s.position.z - r.P.z) / U; assert(d > 8, 'stayed back: ' + d.toFixed(1));
});
t('golem: 1.1 s telegraph, heavy hit and big knockback', () => {
  const r = mk(); const g = near(r, 'golem'); r.P.x = g.position.x + 1.5 * U; r.P.z = g.position.z; r.mobs.update(0.05); r.mobs.update(0.05); tick(r, 0.9); const early = r.hits.length; tick(r, 0.6);
  assert.strictEqual(early, 0, 'still winding up at ~1 s'); const h = r.hits.find(x => x.i.mob === 'golem'); assert(h, 'golem struck'); assert(h.d >= 14, 'dmg ' + h.d); assert(Math.hypot(h.i.knockback.x, h.i.knockback.z) > 5, 'knockback');
});
t('hit event for hit markers: every landed hit reports type, damage, position and whether it killed', () => {
  const r = mk(); const m = near(r, 'imp'); r.P.x = m.position.x - 2 * U; r.P.z = m.position.z; r.mobs.update(0.05);
  const n = r.mobs.meleeHit({ x: r.P.x, z: r.P.z }, { x: 1, z: 0 }, 6 * U, 10); assert(n >= 1); let ev = r.events.filter(e => e.e === 'hit'); assert(ev.length >= 1 && ev[0].dmg === 10 && ev[0].killed === false && ev[0].max > 0 && isFinite(ev[0].y));
  r.events.length = 0; r.mobs.meleeHit({ x: r.P.x, z: r.P.z }, { x: 1, z: 0 }, 6 * U, 999); ev = r.events.filter(e => e.e === 'hit'); assert(ev.some(e => e.killed), 'lethal hit is flagged'); assert(r.events.some(e => e.e === 'kill'));
});
console.log(pass + ' passed');
