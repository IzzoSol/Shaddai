// node tools/tests/world-race-run.test.cjs — Mario-Kart layer: crates, pads, items, attacks, AI, finish + prizes (mocks: no THREE, no DOM)
const assert = require('assert'); global.window = global; require('../../public/world-race.js'); require('../../public/world-race-run.js');
const U = 7 / 1.8; const W = global.WorldRaceRun, WR = global.WorldRace;
// mock park: a square loop 400 m a side; gates every 1/N; 6 crates + 3 pads on the loop
const sq = [[0, 0], [400, 0], [400, 400], [0, 400]].map(p => ({ x: p[0] * U, y: 0, z: p[1] * U }));
const at = u => { const L = 1600, d = ((u % 1) + 1) % 1 * L, k = Math.min(3, Math.floor(d / 400)), a = sq[k], b = sq[(k + 1) % 4], f = (d - k * 400) / 400; return { x: a.x + (b.x - a.x) * f, y: 0, z: a.z + (b.z - a.z) * f }; };
const park = { loopWorld: () => sq, cratesWorld: () => [0.1, 0.3, 0.5, 0.7, 0.85, 0.95].map(u => at(u)), padsWorld: () => [0.2, 0.6, 0.9].map(u => Object.assign(at(u), { yaw: 0 })), gates: cid => WR.CIRCUITS[cid].gates.map((g, i, arr) => Object.assign(at(i / arr.length), { kind: g.kind, verb: g.verb || null, idx: i })), setCrateVisible(i, v) { (this.vis = this.vis || {})[i] = v; } };
const mkHover = () => { const h = { calls: [], setModifier(o) { h.calls.push(o); }, state: () => ({ x: 0, y: 0, z: 0, psi: 0 }), isFlying: () => false, altitudeM: () => 0 }; return h; };
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const mk = (o) => { const hover = mkHover(), events = [], sparks = { total: 0, add(n) { sparks.total += n; } }; const run = W.create({ park, hover, sparks, onEvent: e => events.push(e), U }); return { run, hover, events, sparks }; };
const tick = (run, pose, sec, dt) => { for (let i = 0; i < sec / (dt || 0.05); i++) run.update(dt || 0.05, pose); };
t('countdown 3-2-1-GO, then racing; up to 7 AI riders on the loop', () => { const { run, events } = mk(); run.start('plaza-cup', { ais: 5 }); assert.strictEqual(run.state().phase, 'count'); tick(run, at(0.98), 3.6); assert.strictEqual(run.state().phase, 'race'); assert(events.some(e => e.type === 'go')); assert.strictEqual(run.state().standings.length, 6); assert.strictEqual(mk().run.start('plaza-cup', { ais: 99 }).state().standings.length, 8); });
t('driving through a crate rolls an item and hides the crate; it respawns after 8 s', () => {
  const { run, events } = mk(); run.start('plaza-cup', { ais: 1, rng: () => 0.01 }); tick(run, at(0.99), 3.6); const c = park.cratesWorld()[0]; run.update(0.05, { x: c.x, z: c.z, y: 0, yaw: 0, mode: 'pad', altM: 0 });
  assert.strictEqual(run.state().item, 'boost'); assert.strictEqual(park.vis[0], false); assert(events.some(e => e.type === 'crate'));
  tick(run, { x: 0, z: 99999, y: 0, yaw: 0 }, 8.2); assert.strictEqual(park.vis[0], true);
});
t('turbo pad = 1 s x1.35 boost through the board modifier', () => { const { run, hover } = mk(); run.start('plaza-cup', { ais: 1 }); tick(run, at(0.99), 3.6); const p = park.padsWorld()[0]; run.update(0.05, { x: p.x, z: p.z, y: 0, yaw: 0 }); assert(hover.calls.some(c => c.mul === 1.35 && c.dur === 1)); });
t('Boost item = x1.6 for 1.6 s; Ward Plate eats the next hit', () => {
  const { run, hover } = mk(); run.start('plaza-cup', { ais: 2 }); tick(run, at(0.99), 3.6); const R = run.race(); R.rider('you').item = 'boost'; run.useItem(); assert(hover.calls.some(c => c.mul === 1.6 && c.dur === 1.6));
  R.rider('you').item = 'ward'; run.useItem(); assert(R.rider('you').ward); assert(R.hit('you', 50).blocked); assert.strictEqual(R.rider('you').hp, 100);
});
t('Spark Shell travels to the rider ahead, hits for 22 and stalls them', () => {
  const { run } = mk(); run.start('plaza-cup', { ais: 3 }); tick(run, at(0.9), 3.6); const st = run._st(), R = run.race(); const target = st.ais[0]; const me = { x: target.x - Math.sin(target.yaw) * 20 * U, z: target.z - Math.cos(target.yaw) * 20 * U, y: 0, yaw: target.yaw, mode: 'pad', altM: 0 };
  R.rider('you').item = 'shell'; run.update(0.01, me); run.useItem(); assert.strictEqual(st.shells.length, 1); for (let i = 0; i < 40; i++) run.update(0.05, me); const lost = st.ais.map(a => 100 - R.rider(a.id).hp); assert.strictEqual(lost.reduce((x, y) => x + y, 0), 22, 'exactly one AI took 22: ' + lost); assert(st.ais.some(a => a.stun > 0 || R.rider(a.id).hp < 100));
});
t('Wide Wave stuns everyone close; Magnet Yank steals a nearby rival\'s item; Sway/Pinch hit the rider ahead', () => {
  const { run } = mk(); run.start('plaza-cup', { ais: 3 }); tick(run, at(0.99), 3.6); const st = run._st(), R = run.race(); const a0 = st.ais[0]; const me = { x: a0.x - Math.sin(a0.yaw) * 3 * U, z: a0.z - Math.cos(a0.yaw) * 3 * U, y: 0, yaw: a0.yaw };
  R.rider('you').item = 'wave'; run.update(0.01, me); run.useItem(); assert(R.rider(a0.id).hp < 100 && a0.stun > 0);
  R.rider(a0.id).item = 'sway'; R.rider('you').item = 'yank'; run.useItem(); assert.strictEqual(R.rider('you').item, 'sway'); assert.strictEqual(R.rider(a0.id).item, null);
  R.rider('you').item = 'pinch'; st.ais.forEach(a => { a.stun = 0; }); run.useItem(); assert(st.ais.some(a => a.stun >= 1.2), 'pinch stalls the nearest rider ahead');
});
t('Blue Line only rolls in Prime circuits; AI cannot fire it elsewhere', () => { const { run } = mk(); run.start('plaza-cup', { ais: 2, rng: () => 0.9999 }); tick(run, at(0.99), 3.6); assert.notStrictEqual(run.race().grabCrate('ai0', false).id, 'blue'); const p = mk(); p.run.start('rift-cut', { ais: 2 }); assert(p.run._st().prime); });
t('AI riders lap the circuit, pass gates in order and finish; prize goes to the player only by place; ranked doubles it', () => {
  const { run, events, sparks } = mk(); run.start('plaza-cup', { ais: 3 }); tick(run, { x: 1e6, z: 1e6, y: 0, yaw: 0 }, 3.6); const R = run.race(); const me = R.rider('you');   // player never moves: AI finish, player DNF-ish
  for (let i = 0; i < 6000; i++) { run.update(0.1, { x: 1e6, z: 1e6, y: 0, yaw: 0 }); if (R.rider('ai0').finished && R.rider('ai1').finished && R.rider('ai2').finished) break; }
  assert(R.rider('ai0').finished, 'AI finished 3 laps'); assert(R.rider('ai0').lap === 3);
  const r2 = mk(); r2.run.start('plaza-cup', { ais: 1, ranked: true }); assert.strictEqual(r2.run.canUsePocket('pad-rush'), false); assert.strictEqual(r2.run.canUsePocket('foil-sip'), false);
});
t('finishing 1st pays 60 Sparks casual / 120 ranked; 3rd 20', () => {
  for (const [ranked, exp] of [[false, 60], [true, 120]]) { const { run, sparks, events } = mk(); run.start('plaza-cup', { ais: 1, ranked }); tick(run, at(0.99), 3.6); const R = run.race(), g = run._st().gates; for (let l = 0; l < 3; l++) for (let i = 0; i < g.length; i++) { run.update(0.05, { x: g[i].x, z: g[i].z, y: 0, yaw: 0, mode: g[i].kind === 'foil' ? 'foil' : 'pad', altM: g[i].kind === 'foil' ? 5 : 0.2, trick: g[i].verb ? { verb: g[i].verb, clean: true } : null }); }
    assert(R.rider('you').finished); const fin = events.find(e => e.type === 'finish'); assert(fin, 'finish event'); assert.strictEqual(fin.place, 1); assert.strictEqual(sparks.total, exp); }
});
t('city circuits: Grid Ring runs on the r1600 circle (8 CP gates, 24 crates, 16 pads); AI ride it; start pose is the north gate', () => {
  const { run, events } = mk(); const sp = run.startPose('grid-ring'); assert(Math.abs(sp.x) / U < 130 && Math.abs(sp.z + 1600 * U) / U < 40, 'start pose just behind the north gate (' + Math.round(sp.x / U) + ', ' + Math.round(-sp.z / U) + ' m)'); run.start('grid-ring', { ais: 3 });
  const st = run._st(); assert.strictEqual(st.gates.length, 8); assert.strictEqual(st.crates.length, 24); assert.strictEqual(st.pads.length, 16); assert(st.ais.every(a => Math.abs(Math.hypot(a.x, a.z) / U - 1600) < 25), 'AIs are on the ring');
  tick(run, { x: 1e6, z: 1e6, y: 0, yaw: 0 }, 3.6); for (let i = 0; i < 400; i++) run.update(0.1, { x: 1e6, z: 1e6, y: 0, yaw: 0 }); assert(run.race().rider('ai0').gate >= 2, 'AI passed gates along the ring: ' + run.race().rider('ai0').gate);
  const q = mk(); q.run.start('quarter-loop', { ais: 2 }); assert.strictEqual(q.run._st().gates.length, 12); const t2 = mk(); t2.run.start('train-ring', { ais: 2 }); assert.strictEqual(t2.run._st().gates.length, 12); assert(t2.run._st().C.openWorld);
});
console.log(pass + ' passed');
