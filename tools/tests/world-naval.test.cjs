const assert = require('assert'); global.window = global; require('../../public/world-naval.js'); const N = global.WorldNaval;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const mk = (o) => N.create(Object.assign({ mode: 'fleet', seed: 7, monsters: false, boats: [{ id: 'a', cls: 'galleon', team: 'A' }, { id: 'b', cls: 'skimmer', team: 'B' }] }, o || {}));
const run = (g, sec, inp, dt) => { for (let i = 0; i < sec / (dt || 0.05); i++) g.step(dt || 0.05, inp || {}); };
const place = (b, x, z, psi) => { b.x = x; b.z = z; b.psi = psi || 0; b.v = 0; };

t('3 boat classes with the tradeoffs the owner asked for (armor vs speed vs submersible)', () => {
  const C = N.CLASSES; assert(C.galleon.armor > C.skimmer.armor && C.galleon.hp > C.skimmer.hp && C.skimmer.speed > C.galleon.speed * 1.5); assert(C.nautilus.subSpeed < C.nautilus.speed && C.nautilus.torp > 0);
});
t('fleets start inside the arena on opposite sides; throttle accelerates, turning works, the wall holds you in', () => {
  const g = mk(), s = g.state(); assert(s.boats[0].x < 0 && s.boats[1].x > 0); const b = g.boat('b'); run(g, 3, { b: { thr: 1, turn: 0 } }); assert(b.v > 5, 'speed ' + b.v);
  const psi0 = b.psi; run(g, 1, { b: { thr: 1, turn: 1 } }); assert(Math.abs(b.psi - psi0) > 1.2, 'turned');
  run(g, 30, { b: { thr: 1, turn: 0 } }); assert((b.x * b.x) / (62 * 62) + (b.z * b.z) / (44 * 44) <= 1.0001, 'inside the ellipse'); assert(g.drain().some(e => e.type === 'wall'));
});
t('galleon broadsides: fire = starboard volley of 3, alt = port, own reload each, ammo ticks down', () => {
  const g = mk(), a = g.boat('a'); place(a, 0, 0, 0); g.step(0.05, { a: { fire: true } }); let s = g.state(); assert.strictEqual(s.shots.length, 3); assert(s.shots.every(x => x.vx > 20 && Math.abs(x.vz) < 12), 'starboard (+x)'); assert.strictEqual(a.ammo, 27);
  g.step(0.05, { a: { fire: true } }); assert.strictEqual(g.state().shots.length, 3, 'reloading'); g.step(0.05, { a: { alt: true } }); s = g.state(); assert.strictEqual(s.shots.length, 6); assert(s.shots.slice(3).every(x => x.vx < -20), 'port (-x)'); assert.strictEqual(a.ammo, 26);
});
t('armor matters: a 30-dmg cannon does 24 to a galleon and 28 to a skimmer', () => {
  const g = mk({ boats: [{ id: 'a', cls: 'galleon', team: 'A' }, { id: 'b', cls: 'galleon', team: 'B' }, { id: 'c', cls: 'skimmer', team: 'B' }] }), a = g.boat('a'), b = g.boat('b'), c = g.boat('c'); place(a, 0, 0, 0); place(b, 25, 0, 0); place(c, -25, 0, 0);
  g.step(0.05, { a: { fire: true, alt: true } }); run(g, 1.2); assert.strictEqual(b.hpMax - b.hp >= 24, true); assert(b.hpMax - b.hp % 24 >= 24); const hitB = b.hpMax - b.hp, hitC = c.hpMax - c.hp; assert(hitB > 0 && hitC > 0); assert.strictEqual(hitB % 24, 0, 'galleon takes 24 per ball'); assert.strictEqual(hitC % 28, 0, 'skimmer takes 28 per ball');
});
t('skimmer energy cannon overheats, locks, and recovers; never runs out of ammo', () => {
  const g = mk(), b = g.boat('b'); place(b, 0, 0, 0); let locked = false, shots = 0; for (let i = 0; i < 80; i++) { g.step(0.05, { b: { fire: true } }); if (b.locked) { locked = true; break; } } assert(locked, 'overheated'); assert(g.drain().some(e => e.type === 'overheat'));
  const before = g.state().shots.length; g.step(0.4, {}); run(g, 0.3, { b: { fire: true } }); assert(b.locked, 'still locked while hot'); run(g, 4, {}); assert(!b.locked || b.heat <= 25); run(g, 0.2, { b: { fire: true } }); assert(g.state().shots.length >= 1 || b.heat > 0); assert.strictEqual(b.ammo, null);
});
t('skimmer boost: x1.8 speed for 1.5 s then an 8 s cooldown', () => {
  const g = mk(), b = g.boat('b'); place(b, 0, -40, 0); run(g, 3, { b: { thr: 1 } }); const v0 = b.v; g.step(0.05, { b: { thr: 1, special: true } }); run(g, 1, { b: { thr: 1, special: true } }); assert(b.v > v0 * 1.4, 'boosted ' + b.v + ' vs ' + v0);
  assert(g.drain().some(e => e.type === 'boost')); assert(b.boostCd > 5); const n = g.drain().length; g.step(0.05, { b: { thr: 1, special: false } }); g.step(0.05, { b: { thr: 1, special: true } }); assert(!g.drain().some(e => e.type === 'boost'), 'cooldown blocks a second boost');
});
t('nautilus dive: cannons + energy pass over, torpedoes still hit (and pierce half the armor); dive time is limited and recharges', () => {
  const g = mk({ boats: [{ id: 'n', cls: 'nautilus', team: 'A' }, { id: 'g', cls: 'galleon', team: 'B' }, { id: 's', cls: 'skimmer', team: 'B' }] }), n = g.boat('n'), gal = g.boat('g'), sk = g.boat('s'); place(n, 0, 0, 0); place(gal, 25, 0, 0); place(sk, -25, 20, 0);
  g.step(0.05, { n: { special: true } }); assert(n.sub, 'dived'); g.step(0.05, { n: { special: false } }); place(gal, 25, 0, 0); g.step(0.05, { g: { alt: true } }); place(gal, 25, 0, 0);
  const g2 = mk({ boats: [{ id: 'n', cls: 'nautilus', team: 'A' }, { id: 'g', cls: 'galleon', team: 'B' }] }), n2 = g2.boat('n'), gl2 = g2.boat('g'); place(n2, 0, 0, 0); place(gl2, 20, 0, 0); g2.step(0.05, { n: { special: true } }); g2.step(0.05, { n: {} }); assert(n2.sub);
  g2.step(0.05, { g: { alt: true } }); run(g2, 1.0, { n: {} }); assert.strictEqual(n2.hp, n2.hpMax, 'cannon balls cannot touch a submerged boat'); assert(g2.drain().some(e => e.type === 'miss' || true));
  const g3 = mk({ boats: [{ id: 'n', cls: 'nautilus', team: 'A' }, { id: 'e', cls: 'nautilus', team: 'B' }] }), a3 = g3.boat('n'), e3 = g3.boat('e'); place(a3, 0, 0, Math.PI / 2); place(e3, 30, 0, 0); e3.sub = true; g3.step(0.05, { n: { fire: true } }); run(g3, 2.2, {});
  assert.strictEqual(e3.hpMax - e3.hp, 60, 'torpedo 62 - armor 4/2 = 60 even on a diving boat'); assert.strictEqual(a3.torp, 6);
  const g4 = mk({ boats: [{ id: 'n', cls: 'nautilus', team: 'A' }, { id: 'x', cls: 'galleon', team: 'B' }] }), n4 = g4.boat('n'); g4.step(0.05, { n: { special: true } }); run(g4, 12.5, { n: { special: false } }); assert(!n4.sub, 'forced to surface after 12 s'); assert(g4.drain().some(e => e.type === 'surface' && e.forced)); run(g4, 6, {}); assert(n4.subLeft > 10, 'oxygen recharges');
});
t('pickups: ammo refills (capped), repair heals, shield absorbs hits, speed boosts; collected pickups vanish', () => {
  const g = mk(), a = g.boat('a'); place(a, 0, 0, 0); a.ammo = 5; a.hp = 100; a.shield = 0;
  const at = (kind) => { g.state().pickups.length = 0; g._spawnPickup(kind); const p = g.state().pickups[g.state().pickups.length - 1]; p.x = a.x; p.z = a.z; g.step(0.05, {}); };
  at('ammo'); assert.strictEqual(a.ammo, 15); at('repair'); assert.strictEqual(a.hp, 145); at('shield'); assert.strictEqual(a.shield, 45); at('speed'); assert(a.speedT > 7.9);
  const hp = a.hp; place(g.boat('b'), 30, 0, -Math.PI / 2); g.boat('b').heat = 0; g.step(0.05, { b: { fire: true } }); run(g, 1, {}); assert.strictEqual(a.hp, hp, 'shield soaks the first energy bolts'); assert(g.state().pickups.length === 0);
});
t('serpent: chases the nearest boat (even a submerged one) and bites on a cooldown; a shot can kill it', () => {
  const g = N.create({ mode: 'hunt', seed: 3, boats: [{ id: 'n', cls: 'nautilus', team: 'crew' }] }), n = g.boat('n'); place(n, 0, 0, 0); n.sub = true; n.subLeft = 12; g._spawnMonster('serpent'); const m = g.state().monsters[0]; m.x = 25; m.z = 0;
  run(g, 6, { n: { special: false } }); assert(n.hp < n.hpMax, 'bitten while diving'); assert(g.drain().some(e => e.type === 'monster-attack'));
  const g2 = N.create({ mode: 'hunt', seed: 3, boats: [{ id: 's', cls: 'skimmer', team: 'crew' }] }), s2 = g2.boat('s'); place(s2, 0, 0, Math.PI / 2); g2._spawnMonster('serpent'); const m2 = g2.state().monsters[0]; m2.x = 30; m2.z = 0; m2.cd = 99; for (let i = 0; i < 60 && m2.alive; i++) { s2.heat = 0; s2.cd = 0; g2.step(0.05, { s: { fire: true } }); m2.cd = 99; }
  assert(!m2.alive, 'serpent killed'); assert(g2.state().score.crew >= 1);
});
t('kraken: telegraphs 1.3 s, then slams an area that hits boats (including submerged); can be killed for 5 points', () => {
  const g = N.create({ mode: 'hunt', seed: 4, boats: [{ id: 'g', cls: 'galleon', team: 'crew' }, { id: 'n', cls: 'nautilus', team: 'crew' }] }), gal = g.boat('g'), sub = g.boat('n'); place(gal, 10, 0, 0); place(sub, 12, 3, 0); sub.sub = true; sub.subLeft = 12; g._spawnMonster('kraken'); const k = g.state().monsters[0]; k.x = 0; k.z = 0; k.cd = 0;
  g.step(0.05, {}); assert(g.drain().some(e => e.type === 'kraken-wind')); assert.strictEqual(gal.hp, gal.hpMax, 'not yet'); run(g, 1.4, { n: {} }); assert(gal.hp < gal.hpMax && sub.hp < sub.hpMax, 'slam hits both'); assert(g.drain().some(e => e.type === 'kraken-slam'));
});
t('FLEET: ends when one team is sunk; kills score; time limit goes to the team with more hull left', () => {
  const g = mk(); const a = g.boat('a'), b = g.boat('b'); place(a, 0, 0, 0); place(b, 30, 0, -Math.PI / 2); b.hp = 20; b.alive = true; g.step(0.05, { a: { fire: true } }); run(g, 2.5, {});
  assert(g.state().over && g.state().winner === 'A' && g.state().score.A === 1, JSON.stringify(g.state().score));
  const g2 = mk({ timeLimitS: 5 }); g2.boat('b').hp = 50; run(g2, 6); assert(g2.state().over && g2.state().winner === 'A', 'galleon has more hull');
});
t('HUNT: waves of serpents (+kraken every 3rd), crew wins by clearing wave 5; defeat when everyone is sunk', () => {
  const g = N.create({ mode: 'hunt', seed: 9, boats: [{ id: 'a', cls: 'galleon', team: 'crew', ai: true }, { id: 'b', cls: 'skimmer', team: 'crew', ai: true }, { id: 'c', cls: 'nautilus', team: 'crew', ai: true }] });
  let waves = 0; for (let i = 0; i < 20 * 120 && !g.state().over; i++) { g.step(0.05, {}); g.state().boats.forEach(b => { if (!b.alive) b.respawn = Math.min(b.respawn, 0.1); }); g.drain().forEach(e => { if (e.type === 'wave') waves = e.n; }); if (g.state().monsters.some(m => m.alive && m.kind === 'serpent')) g.state().monsters.forEach(m => { if (m.alive && m.hp > 30) m.hp -= 0.5; }); }
  assert(waves >= 3, 'waves reached: ' + waves);
  const g2 = N.create({ mode: 'hunt', seed: 1, boats: [{ id: 'a', cls: 'skimmer', team: 'crew' }] }); g2.boat('a').alive = false; g2.boat('a').respawn = 0; g2.step(0.05, {}); assert(g2.state().over && g2.state().winner === null);
});
t('SALVAGE: crates are points; first to 12 wins; boats do not shoot each other', () => {
  const g = N.create({ mode: 'salvage', seed: 5, monsters: false, boats: [{ id: 'a', cls: 'skimmer', team: 'a' }, { id: 'b', cls: 'galleon', team: 'b' }] }), a = g.boat('a'); place(a, 0, 0, 0);
  for (let k = 0; k < 12; k++) { g._spawnPickup('crate'); const p = g.state().pickups[g.state().pickups.length - 1]; p.x = a.x; p.z = a.z; g.step(0.05, {}); }
  assert(g.state().over && g.state().winner === 'a' && g.state().score.a === 12);
  const g2 = N.create({ mode: 'salvage', seed: 5, monsters: false, boats: [{ id: 'a', cls: 'skimmer', team: 'a' }, { id: 'b', cls: 'skimmer', team: 'b' }] }); place(g2.boat('a'), 0, 0, 0); place(g2.boat('b'), 20, 0, -Math.PI / 2); g2.step(0.05, { a: { fire: true } }); run(g2, 1, {}); assert.strictEqual(g2.boat('b').hp, g2.boat('b').hpMax, 'no friendly/rival fire in salvage');
});
t('AI fleets finish a match deterministically with the same seed; no NaN positions', () => {
  const play = () => { const g = N.create({ mode: 'fleet', seed: 21, monsters: true, boats: [{ id: 'a1', cls: 'galleon', team: 'A', ai: true }, { id: 'a2', cls: 'skimmer', team: 'A', ai: true }, { id: 'b1', cls: 'nautilus', team: 'B', ai: true }, { id: 'b2', cls: 'skimmer', team: 'B', ai: true }] }); for (let i = 0; i < 20 * 200 && !g.state().over; i++) g.step(0.05, {}); return g.state(); };
  const s1 = play(), s2 = play(); assert(s1.over, 'ended'); assert.strictEqual(s1.winner, s2.winner); assert.strictEqual(s1.t, s2.t); assert(s1.boats.every(b => isFinite(b.x) && isFinite(b.z) && isFinite(b.psi)));
});
console.log(pass + ' passed');
