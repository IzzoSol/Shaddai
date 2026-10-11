// node tools/tests/world-race.test.cjs — Hoverskate race rules (owner's bank, 2026-09-29)
const assert = require('assert'); global.window = global; require('../../public/world-race.js'); const W = global.WorldRace;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const mk = (id, ranked) => W.create(W.CIRCUITS[id], { ranked, riders: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], rng: () => 0.01 });
const lap = (r, id, over) => { const g = r.circuit.gates; for (let i = 0; i < g.length; i++) { const k = g[i].kind, s = Object.assign({ mode: k === 'foil' ? 'foil' : 'pad', altM: k === 'foil' ? 6 : 0.3, kissed: true, trick: g[i].verb ? { verb: g[i].verb, clean: true } : null }, over || {}); const res = r.passGate(id, i, s); assert(res.ok, id + ' gate ' + i + ' ' + JSON.stringify(res)); } };
t('8 circuits (incl. Dragon Gate); Rift Cut is Prime + lava kills', () => { const ids = Object.keys(W.CIRCUITS); ['plaza-cup', 'spine-cup', 'forum-grand', 'rift-cut', 'quarter-loop', 'grid-ring', 'train-ring', 'dragon-gate'].forEach(c => assert(ids.includes(c), 'circuit ' + c));   // 2026-10-11: + meridian-8 / 8b / tri and the single-lobe short laps
          ['meridian-8', 'meridian-8b', 'meridian-tri', 'meridian-8-lobe-n'].forEach(c => assert(ids.includes(c), 'circuit ' + c)); assert(W.CIRCUITS['rift-cut'].prime && W.CIRCUITS['rift-cut'].lavaKill); });
t('gates must be taken in order; a foil gate needs foil; a kiss gate needs a rail skim', () => {
  const r = mk('spine-cup'); r.start(); assert.strictEqual(r.passGate('a', 3, { mode: 'pad' }).ok, false, 'wrong gate'); assert.strictEqual(r.passGate('a', 0, { mode: 'pad', altM: 0.2 }).ok, true);
  assert.strictEqual(r.passGate('a', 1, { mode: 'foil', kissed: false }).ok, false, 'kiss without a rail'); assert.strictEqual(r.passGate('a', 1, { mode: 'foil', kissed: true }).ok, true);
  assert.strictEqual(r.passGate('a', 2, { mode: 'pad' }).ok, false, 'foil gate on the pad');
});
t('score = time + wash 1.2 s + missed pad gate 0.8 s - trick bonus (capped 8% of a clean run)', () => {
  const r = mk('plaza-cup'); r.start(); for (let i = 0; i < 620; i++) r.update(0.1);   // 62 s on the clock for rider a... all riders share the clock
  r.wash('a'); r.wash('a'); assert.strictEqual(r.rider('a').penaltyS, 2.4);
  r.passGate('a', 0, { mode: 'foil', altM: 3 }); assert.strictEqual(r.rider('a').misses, 1); assert.strictEqual(+r.rider('a').penaltyS.toFixed(1), 3.2);
  r.rider('a').trickS = 999; const cap = W.CIRCUITS['plaza-cup'].cleanLapS * 0.08 * 3; assert.strictEqual(r.score('a'), +(r.rider('a').time + 3.2 - cap).toFixed(2));
});
t('a full race finishes; standings order by score; DNF sinks to the bottom', () => {
  const r = mk('plaza-cup'); r.start(); const N = r.circuit.gates.length;
  for (let l = 0; l < 3; l++) { lap(r, 'a'); lap(r, 'b'); } r.update(30); r.lavaTouch('c'); assert(r.rider('c').dnf); assert(r.finished());
  const s = r.standings(); assert.strictEqual(s[2].id, 'c'); assert(s[0].finished && s[1].finished); assert.deepStrictEqual(s.map(x => x.place), [1, 2, 3]);
});
t('lava = DNF on lava circuits', () => { const r = mk('rift-cut'); r.start(); assert.strictEqual(r.lavaTouch('a').dnf, true); });
t('ram: closing speed drives damage 8..18 (x1.25 boosting); wall ram = 6; hp<=0 respawns at the last checkpoint, frozen 1.4 s, item cleared, energy 40%', () => {
  const r = mk('forum-grand'); r.start(); r.passGate('a', 0, { mode: 'pad', altM: 0 }); r.passGate('b', 0, { mode: 'pad', altM: 0 });
  assert.strictEqual(r.ram('a', 'b', 0).damage, 8); assert.strictEqual(r.ram('a', 'b', 20).damage, 18); r.rider('a').boosting = true; assert.strictEqual(r.ram('a', 'b', 20).damage, 22.5);
  assert.strictEqual(r.wallRam('c').hp, 94); r.rider('b').item = 'boost'; r.update(2); const dead = r.hit('b', 999); assert(dead.respawned); const b = r.rider('b'); assert.strictEqual(b.freeze, 1.4); assert.strictEqual(b.item, null); assert.strictEqual(b.energy, 0.4); assert.strictEqual(b.hp, 100);
});
t('items: weighted crate roll, Orbital Lance is Prime-only, shell 22 dmg, Aegis Field eats one hit', () => {
  const r = mk('plaza-cup'); r.start(); assert.strictEqual(r.grabCrate('a').id, 'boost'); assert.strictEqual(r.grabCrate('a'), null, 'one item slot');
  const r2 = W.create(W.CIRCUITS['plaza-cup'], { riders: [{ id: 'a' }, { id: 'b' }], rng: () => 0.9999 }); r2.start(); let sawBlue = false; for (let q = 0; q < 200; q++) { const v = q / 200; const rn = W.create(W.CIRCUITS['plaza-cup'], { riders: [{ id: 'a' }, { id: 'b' }], rng: () => v }); rn.start(); assert.notStrictEqual(rn.grabCrate('a', false).id, 'blue'); const rp = W.create(W.CIRCUITS['plaza-cup'], { riders: [{ id: 'a' }], rng: () => v }); if (rp.grabCrate('a', true).id === 'blue') sawBlue = true; } assert(sawBlue, 'Orbital Lance can roll in a Prime heat');   // robust to new items (mine, phase, chrono, warp)
  r.rider('b').item = null; r.rider('a').item = 'shell'; assert.strictEqual(r.useItem('a', 'b').hit.hp, 78); r.rider('b').ward = true; assert(r.hit('b', 50).blocked);
});
t('ranked heats: Pad Rush / Foil Sip pocket vials are OFF; casual allows them', () => { assert.strictEqual(mk('plaza-cup', true).canUsePocket('pad-rush'), false); assert.strictEqual(mk('plaza-cup', true).canUsePocket('foil-sip'), false); assert.strictEqual(mk('plaza-cup', false).canUsePocket('pad-rush'), true); });
t('max 8 riders per heat', () => { const r = W.create(W.CIRCUITS['plaza-cup'], { riders: Array.from({ length: 12 }, (_, i) => ({ id: 'r' + i })) }); assert.strictEqual(r.standings().length, 8); });
t('3 city-scale tracks: Quarter Loop ~4.4 km, Grid Ring = the whole r1600 circle (~10 km, 8 CP gates), Train Ring r2829 (~17.8 km, map-wide)', () => {
  const near = (a, b, tol) => Math.abs(a - b) / b < tol;
  assert(near(W.trackLengthM('grid-ring'), 2 * Math.PI * 1600, 0.01), 'grid ' + W.trackLengthM('grid-ring')); assert(near(W.trackLengthM('train-ring'), 2 * Math.PI * 2829, 0.01), 'train ' + W.trackLengthM('train-ring')); assert(near(W.trackLengthM('quarter-loop'), 4427, 0.03), 'quarter ' + W.trackLengthM('quarter-loop'));
  assert.strictEqual(W.CIRCUITS['grid-ring'].gates.length, 8); assert.strictEqual(W.CIRCUITS['grid-ring'].laps, 1); assert(W.CIRCUITS['train-ring'].openWorld); assert.strictEqual(W.CIRCUITS['quarter-loop'].scale, 'quarter');
  const U = 7 / 1.8, g = W.trackWorld('grid-ring', U); assert(Math.abs(g[0].x) < 1e-6 && Math.abs(g[0].z + 1600 * U) < 1e-6, 'starts at the north gate (0, 1600 m) = world z -1600U'); const q = g[24]; assert(q.x < 0, 'counter-clockwise: 90 deg along the ring is WEST (CP_02 = (-1600, 0))');
});

t('after a hit a rider is immune for 1.2 s (no chain-stun), then hittable again; ward still eats a hit first; respawn grants immunity', () => {
  const r = mk('plaza-cup'); r.start(); assert.strictEqual(r.hit('a', 20).hp, 80); assert(r.hit('a', 20).immune); assert.strictEqual(r.rider('a').hp, 80); r.update(1.3); assert.strictEqual(r.hit('a', 20).hp, 60);
  r.rider('a').ward = true; assert(r.hit('a', 5).blocked); r.update(1.3); r.hit('a', 999); assert(r.rider('a').grace > 1.4, 'immune through the respawn freeze');
});

console.log(pass + ' passed');
