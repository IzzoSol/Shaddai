import test from 'node:test'; import assert from 'node:assert/strict';
import { loadArena, hasThree, dimsJson, stats } from './harness.mjs';
const T = { skip: !hasThree && 'three.module.js not found (set THREE_PATH)' };
let ctx; const get = async () => ctx || (ctx = await loadArena({ quality: 'MEDIUM' }));
const geo = (arena) => ({ U: arena.dims.U, X0: arena.group.position.x, Z0: arena.group.position.z, d: arena.dims });

test('colosseum-dims.json matches the literal embedded in world-colosseum.js', T, async () => {
  const { arena } = await get();
  for (const k of Object.keys(dimsJson)) { if (k[0] === '_') continue; assert.ok(Math.abs(arena.dims[k] - dimsJson[k]) < 1e-9, 'dims drift on ' + k + ': js=' + arena.dims[k] + ' json=' + dimsJson[k]); }
});

test('derived geometry: upper tier 31.4 deg, 8 vomitoria, ~101 m half width', T, async () => {
  const { arena } = await get(); const d = arena.dims;
  assert.ok(Math.abs(Math.atan(d.RISE_U / d.TREAD_U) * 180 / Math.PI - 31.4) < 0.1);
  assert.equal(d.VOMITORIA, 8);
  assert.ok(Math.abs(d.A + d.SHELL - 102.6) < 1e-6);
  assert.ok(Math.abs(d.H_UP - 22.0) < 1e-9);
});

test('contains(): true over the bowl+lobby footprint, false outside (no more +-308 m box)', T, async () => {
  const { arena } = await get(); const { U, X0, Z0 } = geo(arena);
  const P = (mx, mz) => arena.contains(X0 + mx * U, Z0 + mz * U);
  assert.ok(P(0, 0) && P(95, 0) && P(-95, 0) && P(0, -80) && P(0, 100));
  assert.ok(!P(130, 0) && !P(0, 160) && !P(0, -130) && !P(300, 300));
});

test('collision: podium wall solid at a non-gap angle; shell solid', T, async () => {
  const { arena } = await get(); const { U, X0, Z0, d } = geo(arena);
  assert.equal(arena.heightAt(X0, Z0), 0);
  assert.equal(arena.heightAt(X0 + (d.A + d.SHELL + 1) * U, Z0), 999);
  const th = 30 * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), pos = { x: 0, z: 0 };
  let px = X0 + 40 * cs * U, pz = Z0 + 40 * sn * U, blocked = false;
  for (let r = 40; r < 90; r += 0.05) { pos.x = X0 + r * cs * U; pos.z = Z0 + r * sn * U; if (arena.resolve(pos, px, pz)) { blocked = true; break; } px = pos.x; pz = pos.z; }
  assert.ok(blocked, 'podium wall must stop a walker at 30 deg');
});

test('every vomitorium ramp is walkable from the floor to the upper tier top', T, async () => {
  const { arena } = await get(); const { U, X0, Z0, d } = geo(arena);
  for (let k = 0; k < 8; k++) {
    const th = (Math.PI / 8) + k * Math.PI / 4, cs = Math.cos(th), sn = Math.sin(th), pos = { x: 0, z: 0 };
    let px = X0 + 40 * cs * U, pz = Z0 + 40 * sn * U, maxH = 0;
    for (let r = 40; r < 130; r += 0.05) {
      pos.x = X0 + r * cs * U; pos.z = Z0 + r * sn * U;
      const hh = arena.heightAt(pos.x, pos.z); if (hh >= 999) break;
      assert.ok(!arena.resolve(pos, px, pz), 'ray ' + k + ' blocked at r=' + r.toFixed(2)); maxH = Math.max(maxH, hh / U); px = pos.x; pz = pos.z;
    }
    assert.ok(maxH > d.H_UP - 0.6, 'ray ' + k + ' only reached ' + maxH.toFixed(2) + ' m');
  }
});

test('the south grand tunnel still reaches the lobby', T, async () => {
  const { arena } = await get(); const { U, X0, Z0, d } = geo(arena);
  const pos = { x: 0, z: 0 }; let px = X0, pz = Z0;
  for (let z = 0; z < d.LOBBY_Z0 + 10; z += 0.05) { pos.x = X0; pos.z = Z0 + z * U; assert.ok(!arena.resolve(pos, px, pz), 'south tunnel blocked at z=' + z.toFixed(2)); px = pos.x; pz = pos.z; }
  assert.equal(arena.heightAt(X0, Z0 + (d.LOBBY_Z0 + 10) * U), 0);
});

test('ambient life is wired for world-interiors (animObjs / motes / glowEntries) and the clock ticks', T, async () => {
  const { arena } = await get();
  assert.ok(arena.animObjs.length >= 1 && arena.glowEntries.length >= 1 && arena.motes && arena.motes.count > 0);
  const a = arena.animObjs[0]; const t0 = arena.time.value; a.mesh.rotation[a.axis] += a.speed * 0.5; assert.ok(Math.abs(arena.time.value - t0 - 0.5) < 1e-9);
  const g = arena.glowEntries[0]; assert.ok(g.mat && isFinite(g.base) && isFinite(g.amp));
});

test('shd_dist_visited writer counts distinct districts (Ring Train unlock needs >= 3)', T, async () => {
  await get(); const mem = globalThis.localStorage;
  for (const k of ['shd_dist_seen', 'shd_dist_visited']) mem.removeItem(k);
  assert.equal(window.__shdVisitDistrict('colosseum'), 1); assert.equal(window.__shdVisitDistrict('colosseum'), 1); assert.equal(window.__shdVisitDistrict('arcade'), 2);
  assert.equal(mem.getItem('shd_dist_visited'), '2');
});

test('perf report (informational)', T, async () => {
  const { THREE, arena } = await get(); arena.group.visible = true; const s = stats(THREE, arena.group); arena.group.visible = false;
  console.log('   [perf] draw calls ~' + s.calls + ', triangles ~' + s.tris + ', instances ' + s.instances);
  assert.ok(s.calls < 200);
});

test('stage 3 dead band: 160 VIP seats in 40 loggias, 24 agent slots at y=32, arched bays at the shell', T, async () => {
  const { THREE, arena } = await get(); const d = arena.dims;
  assert.equal(arena.vipSeats.length, 160);
  assert.equal(new Set(arena.vipSeats.map(s => s.loggia)).size, 40);
  assert.equal(arena.agentSlots.length, 24); assert.ok(arena.agentSlots.every(s => s.y === 32));
  for (const s of arena.vipSeats) { assert.ok(s.y > d.H_UP && s.y < d.CROWN_H); const off = Math.hypot(s.x / (d.A + d.SHELL), s.z / (d.B + d.SHELL)); assert.ok(off < 1, 'seat inside shell'); }
  const names = []; arena.group.traverse(o => { if (o.isInstancedMesh) names.push(o.name + ':' + o.count); });
  for (const want of ['bays-lower:80', 'bays-attic:80', 'statues:80', 'vip-seats:160', 'agent-desks:24', 'banners:40', 'screens:4']) assert.ok(names.includes(want), 'missing ' + want + ' in ' + names.join(','));
  const bays = []; arena.group.traverse(o => { if (o.name === 'bays-lower') bays.push(o); });
  assert.ok(bays[0].geometry.attributes.position.count / 3 > 40, 'arched bay has real triangles');
  void THREE;
});

test('themes drive the emissive neon + velarium; velarium retracts/extends via one uniform', T, async () => {
  const { arena } = await get();
  arena.setTheme('festival'); assert.equal(arena.glowEntries[0].base, 2.2); assert.equal(arena.velarium.target, 1);
  arena.setTheme('night'); assert.equal(arena.velarium.target, 0); assert.ok(arena.glowEntries[0].base > 1);
  arena.setVelarium(0.5); for (let i = 0; i < 400; i++) arena.tick(0.05); assert.ok(Math.abs(arena.velarium.open - 0.5) < 0.01);
  arena.setTheme('classic');
});

test('stage 4 crowd: instanced, per-tier counts, seats sit on hLocal, quality hook scales cost', T, async () => {
  const { THREE, arena } = await get(); const c = arena.crowd;
  const total = c.seatsLower + c.seatsUpper; console.log('   [crowd] seats lower ' + c.seatsLower + ' upper ' + c.seatsUpper + ' total ' + total);
  assert.ok(total > 24000, 'about 26k seats at 0.55 m spacing');
  // every crowd instance stands on the walkable surface hLocal defines (never inside a tunnel / vomitorium)
  const m = new THREE.Matrix4(), p = new THREE.Vector3(); let bad = 0;
  for (const im of [c.farL, c.farU]) for (let i = 0; i < im.instanceMatrix.count; i += 7) { im.getMatrixAt(i, m); p.setFromMatrixPosition(m); const h = arena.hLocal(p.x, p.z); if (!(p.y - h > -0.01 && p.y - h < 0.6)) bad++; }
  assert.equal(bad, 0, bad + ' crowd instances off the hLocal surface');
  const rows = [];
  for (const q of ['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA']) {
    arena.setQuality(q); arena.group.visible = true; const s = stats(THREE, arena.group); arena.group.visible = false;
    rows.push(q + ': calls ' + s.calls + ' tris ' + s.tris + ' inst ' + s.instances);
  }
  console.log('   [quality] ' + rows.join(' | '));
  arena.setQuality('POTATO'); assert.ok(!c.farL.visible && !c.nearL.visible);
  arena.setQuality('LOW'); assert.ok(c.farL.visible && c.farU.visible && !c.nearL.visible);
  arena.setQuality('HIGH'); assert.ok(c.nearL.visible && c.farU.visible && !c.farL.visible);
  arena.setQuality('ULTRA'); assert.ok(c.nearL.visible && c.nearU.visible);
  arena.setQuality('MEDIUM'); assert.equal(arena.quality(), 'MEDIUM');
});

test('window.__quality string is honoured at build (POTATO builds no crowd, real lights <= tier)', T, async () => {
  const r = await loadArena({ quality: 'POTATO' }); assert.equal(r.arena.quality(), 'POTATO'); assert.equal(r.arena.crowd.farL.count, 0);
  let lights = 0; r.arena.group.traverse(o => { if (o.isPointLight && o.visible) lights++; }); assert.equal(lights, 0);
  const h = await loadArena({ quality: 'HIGH' }); h.arena.setTheme('night'); let hl = 0; h.arena.group.traverse(o => { if (o.isPointLight && o.visible) hl++; }); assert.equal(hl, 4);
  ctx = null;
});
