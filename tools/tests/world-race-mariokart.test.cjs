// node tools/tests/world-race-mariokart.test.cjs — rank-based items, Seeker Missile, drift mini-turbos, slipstream, rocket start, lap splits
const assert = require('assert'); global.window = global; require('../../public/world-race.js'); require('../../public/world-race-run.js');
const U = 7 / 1.8; const W = global.WorldRaceRun, WR = global.WorldRace;
const sq = [[0, 0], [400, 0], [400, 400], [0, 400]].map(p => ({ x: p[0] * U, y: 0, z: p[1] * U }));
const at = u => { const L = 1600, d = ((u % 1) + 1) % 1 * L, k = Math.min(3, Math.floor(d / 400)), a = sq[k], b = sq[(k + 1) % 4], f = (d - k * 400) / 400; return { x: a.x + (b.x - a.x) * f, y: 0, z: a.z + (b.z - a.z) * f }; };
const park = { loopWorld: () => sq, cratesWorld: () => [0.1, 0.3, 0.5, 0.7, 0.85, 0.95].map(u => at(u)), padsWorld: () => [0.2, 0.6, 0.9].map(u => Object.assign(at(u), { yaw: 0 })), gates: cid => WR.CIRCUITS[cid].gates.map((g, i, arr) => Object.assign(at(i / arr.length), { kind: g.kind, verb: g.verb || null, idx: i })), setCrateVisible() { } };
const mkHover = () => { const h = { calls: [], setModifier(o) { h.calls.push(o); }, state: () => ({ x: 0, y: 0, z: 0, psi: 0 }), isFlying: () => false, altitudeM: () => 0 }; return h; };
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const mk = (o) => { const hover = mkHover(), events = []; const run = W.create({ park, hover, sparks: { add() { } }, onEvent: e => events.push(e), U }); return { run, hover, events }; };
const tick = (run, pose, sec, dt) => { for (let i = 0; i < sec / (dt || 0.05); i++) run.update(dt || 0.05, typeof pose === 'function' ? pose(i) : pose); };
let seed = 11; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

t('item odds: back of the pack gets boosts/triples/seekers; the leader gets defence and never a Seeker', () => {
  const lead = WR.itemWeights(1, 8, false), last = WR.itemWeights(8, 8, false), mid = WR.itemWeights(4, 8, false);
  assert(last.boost > lead.boost * 1.8 && last.triple > lead.triple * 4 && last.seeker > 5 && lead.seeker === 0 && mid.seeker === 0 || mid.seeker < last.seeker);
  assert(lead.ward > last.ward && lead.ink > last.ink && lead.shell > last.shell); assert.strictEqual(lead.blue, 0, 'Blue Line is Prime only'); assert(WR.itemWeights(8, 8, true).blue > 5);
  Object.values(last).concat(Object.values(lead)).forEach(w => assert(w >= 0 && isFinite(w)));
});
t('rolling many crates: last place really does get far more Seekers/Boosts than first; first never gets a Seeker', () => {
  const roll = (place) => { const counts = {}; for (let i = 0; i < 4000; i++) { const R = WR.create(WR.CIRCUITS['plaza-cup'], { rng, riders: Array.from({ length: 8 }, (_, k) => ({ id: 'r' + k })) }); const ord = R.standings(); R.rider(ord[place - 1].id); const id = ord[place - 1].id; const it = R.grabCrate(id, false); counts[it.id] = (counts[it.id] || 0) + 1; } return counts; };
  const first = roll(1), lastP = roll(8); assert(!first.seeker, 'leader never gets a seeker'); assert(lastP.seeker > 150, 'last place seekers ' + lastP.seeker); assert(lastP.boost > first.boost, 'boosts ' + lastP.boost + ' vs ' + first.boost);
});
t('Seeker Missile: homes on FIRST place, hits for 30 and stalls them 2 s; the target gets an INCOMING warning if it is the player', () => {
  const { run, events } = mk(); run.start('plaza-cup', { ais: 3 }); tick(run, at(0.2), 3.6); const st = run._st(), R = run.race(); st.ais.forEach((a, i) => { a.tot = 0.5 + i * 0.01; a.u = a.tot; }); const me = at(0.05); R.rider('you').item = 'seeker'; run.update(0.05, me); const lead = R.standings()[0].id; assert.notStrictEqual(lead, 'you', 'AI leads');
  run.useItem(); assert(events.some(e => e.type === 'seeker' && e.to === lead)); assert.strictEqual(st.shells.length, 1); assert.strictEqual(st.shells[0].kind, 'seeker'); R.rider(lead).ward = false; const hp0 = R.rider(lead).hp; for (let i = 0; i < 400 && st.shells.length; i++) { R.rider(lead).ward = false; run.update(0.05, me); } assert.strictEqual(hp0 - R.rider(lead).hp, 30, 'seeker damage'); const a = st.ais.find(x => x.id === lead); assert(a.stun >= 1.5, 'stunned ' + a.stun);
});
t('if the PLAYER is first, an enemy seeker warns them and hits them for 30 (less with hull plating)', () => {
  const { run, events, hover } = mk(); run.start('plaza-cup', { ais: 2 }); tick(run, at(0.99), 3.6); const st = run._st(), R = run.race(); st.ais.forEach(a => { a.tot = 0.1; a.u = a.tot; }); const me = at(0.4); R.rider('you').gate = 6; run.update(0.05, me); assert.strictEqual(R.standings()[0].id, 'you', 'player leads'); R.rider('ai0').item = 'seeker'; st.ais[0].itemT = 0; for (let i = 0; i < 400 && R.rider('you').hp === 100; i++) run.update(0.05, me);
  assert(events.some(e => e.type === 'warn' && e.kind === 'incoming'), 'incoming warning'); assert.strictEqual(100 - R.rider('you').hp, 30); assert(hover.calls.some(c => c.stun === 2.0), 'stun 2 s');
});
t('drift: needs the key + speed + a hard turn; charges blue 0.9 s / orange 1.8 s / purple 2.8 s; release pays the mini-turbo', () => {
  const S = { active: false, dir: 0, charge: 0, level: 0 }, c = (o) => Object.assign({ drift: true, speed: 20, yawRate: 1.2 }, o);
  assert(!WR.driftStep(S, 0.05, c({ drift: false })).active && !WR.driftStep(S, 0.05, c({ speed: 8 })).active && !WR.driftStep(S, 0.05, c({ yawRate: 0.2 })).active, 'needs key, speed and turn'); assert(WR.driftStep(S, 0.05, c()).active);
  let lv = []; for (let i = 0; i < 70; i++) { const o = WR.driftStep(S, 0.05, c()); if (lv[lv.length - 1] !== o.level) lv.push(o.level); } assert.deepStrictEqual(lv, [0, 1, 2, 3], JSON.stringify(lv));   // 3.5 s total
  const rel = WR.driftStep(S, 0.05, c({ drift: false })); assert.strictEqual(rel.released.level, 3); assert.strictEqual(rel.released.mul, 1.5); assert.strictEqual(rel.released.dur, 1.8); assert(!S.active);
  const S2 = { active: false, dir: 0, charge: 0, level: 0 }; WR.driftStep(S2, 0.05, c()); for (let i = 0; i < 24; i++) WR.driftStep(S2, 0.05, c()); const r2 = WR.driftStep(S2, 0.05, c({ drift: false })); assert.strictEqual(r2.released.level, 1); assert.strictEqual(r2.released.mul, 1.25);
  const S3 = { active: false, dir: 0, charge: 0, level: 0 }; WR.driftStep(S3, 0.05, c()); for (let i = 0; i < 6; i++) WR.driftStep(S3, 0.05, c()); assert.strictEqual(WR.driftStep(S3, 0.05, c({ drift: false })).released, null, 'a tiny drift pays nothing');
});
t('drift: swerving the other way bleeds the charge; losing speed ends the drift and still pays what you built', () => {
  const S = { active: false, dir: 0, charge: 0, level: 0 }, c = (o) => Object.assign({ drift: true, speed: 20, yawRate: 1.2 }, o); WR.driftStep(S, 0.05, c()); for (let i = 0; i < 16; i++) WR.driftStep(S, 0.05, c()); const before = S.charge; WR.driftStep(S, 0.05, c({ yawRate: -1.2 })); assert(S.charge < before - 0.5, 'charge bled'); assert.strictEqual(S.dir, -1);
  const S2 = { active: false, dir: 0, charge: 0, level: 0 }; WR.driftStep(S2, 0.05, c()); for (let i = 0; i < 30; i++) WR.driftStep(S2, 0.05, c()); const slow = WR.driftStep(S2, 0.05, c({ speed: 5 })); assert(!slow.active && slow.released && slow.released.level >= 1);
});
t('drift in a race: holding drift in a hard turn tightens the arc (turn modifier) and releasing fires the mini-turbo through the vehicle', () => {
  const { run, hover, events } = mk(); run.start('plaza-cup', { ais: 1 }); tick(run, at(0.99), 3.6); let yaw = 0, x = 10 * U, z = 10 * U; run.setInput({ drift: true }); const pose = () => { yaw += 0.06; x += Math.sin(yaw) * 20 * U * 0.05; z += Math.cos(yaw) * 20 * U * 0.05; return { x, y: 0, z, yaw, mode: 'pad', altM: 0 }; };
  tick(run, pose, 2.2); assert(hover.calls.some(c => c.turn != null && c.turn > 1), 'turn modifier while drifting'); assert(events.some(e => e.type === 'drift' && e.level >= 1), 'drift level event'); run.setInput({ drift: false }); tick(run, pose, 0.2);
  const b = events.find(e => e.type === 'driftboost'); assert(b && b.level >= 1 && b.mul >= 1.25, JSON.stringify(b)); assert(hover.calls.some(c => c.mul === b.mul && c.dur === b.dur), 'boost applied to the ride');
});
t('slipstream: tailing a rider in a narrow cone within 16 m for 1 s gives a speed bonus; sideways or far away does not', () => {
  const me = { x: 0, z: 0, yaw: 0 }, ahead = (d, lat, yaw) => [{ id: 'a', x: lat * U, z: d * U, yaw: yaw || 0 }];
  assert(WR.slipstream(me, ahead(10, 0), U)); assert(!WR.slipstream(me, ahead(20, 0), U), 'too far'); assert(!WR.slipstream(me, ahead(10, 6), U), 'out of the cone'); assert(!WR.slipstream(me, ahead(10, 0, Math.PI), U), 'driving toward you'); assert(!WR.slipstream(me, [{ id: 'b', x: 0, z: -10 * U, yaw: 0 }], U), 'behind you');
  const { run, hover, events } = mk(); run.start('plaza-cup', { ais: 1 }); tick(run, at(0.99), 3.6); const st = run._st(); const a = st.ais[0]; a.tot = 0.3; a.u = 0.3; const ap = at(0.3);
  const pose = () => ({ x: a.x, z: a.z - 9 * U, y: 0, yaw: a.yaw, mode: 'pad', altM: 0 }); a.speedMul = 0; tick(run, pose, 2.0); assert(events.some(e => e.type === 'slipstream' && e.on), 'in the wake'); assert(hover.calls.some(c => c.mul === 1.12), 'bonus applied');
});
t('rocket start: throttle held in the last 0.7 s before GO = x1.3 for 1.2 s; mashing it too early = no rocket', () => {
  const good = mk(); good.run.start('plaza-cup', { ais: 1 }); const p = at(0.99); tick(good.run, p, 2.0); good.run.setInput({ accel: true }); tick(good.run, p, 1.6); assert(good.events.some(e => e.type === 'rocket')); assert(good.hover.calls.some(c => c.mul === 1.3 && c.dur === 1.2));
  const early = mk(); early.run.start('plaza-cup', { ais: 1 }); early.run.setInput({ accel: true }); tick(early.run, p, 3.8); assert(!early.events.some(e => e.type === 'rocket') && early.events.some(e => e.type === 'warn' && e.kind === 'earlystart'), 'early = no rocket');
  const none = mk(); none.run.start('plaza-cup', { ais: 1 }); tick(none.run, p, 3.8); assert(!none.events.some(e => e.type === 'rocket'));
});
t('lap splits: each lap fires a lap event with its time and the best so far', () => {
  const { run, events } = mk(); run.start('plaza-cup', { ais: 1 }); tick(run, at(0.99), 3.6); const R = run.race(), me = R.rider('you'); const pose = at(0.1); tick(run, pose, 5); me.lap = 1; run.update(0.05, pose); tick(run, pose, 7); me.lap = 2; run.update(0.05, pose);
  const laps = events.filter(e => e.type === 'lap'); assert.strictEqual(laps.length, 2); assert(laps[0].timeS > 4 && laps[0].timeS < 6.5, 'lap 1 ' + laps[0].timeS); assert(laps[1].timeS > 6 && laps[1].timeS < 8.5, 'lap 2 ' + laps[1].timeS); assert.strictEqual(laps[1].bestS, laps[0].timeS);
});
console.log(pass + ' passed');
