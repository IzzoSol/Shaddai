// node tools/tests/world-bots.test.cjs — bot roster rules from the owner's design (2026-09-29)
const assert = require('assert'), store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
require('../../public/world-bots.js'); const B = global.WorldBots;
let pass = 0; const t = (n, f) => { try { B._reset(); f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('roster = 10 bots: 5 humanoid + 5 wheeled; exactly 2 starters', () => {
  assert.strictEqual(B.ROSTER.length, 10); assert.strictEqual(B.ROSTER.filter(b => b.kind === 'humanoid').length, 5); assert.strictEqual(B.ROSTER.filter(b => b.kind === 'wheeled').length, 5);
  assert.deepStrictEqual(B.STARTERS.slice().sort(), ['scrap', 'unicycle']); assert.strictEqual(B.ROSTER.filter(b => b.earn === 'starter').length, 2);
});
t('you pick ONE starter; the other 8 must be earned', () => {
  assert.strictEqual(B.pickStarter('lanky').ok, false, 'a non-starter cannot be picked'); assert.strictEqual(B.pickStarter('scrap').ok, true);
  assert.strictEqual(B.pickStarter('unicycle').ok, false, 'only one pick'); assert.strictEqual(B.unlock('unicycle').ok, false, 'starters are not "earned"');
  assert.strictEqual(B.unlock('lanky', 'academy:class-3').ok, true); assert.strictEqual(B.state().owned.length, 2);
});
t('wheeled bots: cities only (call), never wilderness or fights', () => {
  B.grant('unicycle'); assert.strictEqual(B.call('unicycle', 'city').ok, true); assert.strictEqual(B.call('unicycle', 'wilderness').ok, false); assert.strictEqual(B.call('unicycle', 'fight').ok, false);
});
t('humanoids can go anywhere except fight instances', () => { B.grant('scrap'); assert.strictEqual(B.call('scrap', 'wilderness').ok, true); assert.strictEqual(B.call('scrap', 'void').ok, true); assert.strictEqual(B.call('scrap', 'fight').ok, false); });
t('PvP on bots: only with an accepted challenge, or in the void', () => {
  assert.strictEqual(B.canAttackBot('a', 'b', 'wilderness', []), false); assert.strictEqual(B.canAttackBot('a', 'b', 'void', []), true);
  const ch = [{ from: 'a', to: 'b', accepted: false }]; assert.strictEqual(B.canAttackBot('a', 'b', 'city', ch), false); ch[0].accepted = true; assert.strictEqual(B.canAttackBot('a', 'b', 'city', ch), true);
  assert.strictEqual(B.canAttackBot('a', 'a', 'void', []), false, 'never your own bot');
});
t('destroyed alone: body lost, skill files + storage stay; rebuild costs Sparks', () => {
  B.grant('scrap'); B.addSkill('scrap', 'guard'); B.addSkill('scrap', 'pack-carry'); B.stow('scrap', 'fieldwrap');
  B.damage('scrap', 9999, true); const r = B.rec('scrap'); assert.strictEqual(r.bodyState, 'destroyed'); assert.deepStrictEqual(r.skills, ['guard', 'pack-carry']); assert.strictEqual(r.storage.length, 1);
  assert.strictEqual(B.call('scrap', 'city').ok, false); assert.strictEqual(B.rebuild('scrap', () => false).ok, false); assert.strictEqual(B.rebuild('scrap', () => true).ok, true);
  assert.strictEqual(B.rec('scrap').bodyState, 'stowed'); assert.deepStrictEqual(B.rec('scrap').skills, ['guard', 'pack-carry'], 'skills survive the rebuild');
});
t('storage grows with carry skills; only humanoids carry', () => {
  B.grant('scrap'); B.grant('unicycle'); assert.strictEqual(B.storageCap('scrap'), B.TUNE.baseStorage); B.addSkill('scrap', 'pack-carry'); assert.strictEqual(B.storageCap('scrap'), B.TUNE.baseStorage + B.TUNE.storagePerSkill);
  assert.strictEqual(B.stow('unicycle', 'x').ok, false); for (let i = 0; i < 20; i++) B.stow('scrap', 'i' + i); assert.strictEqual(B.rec('scrap').storage.length, B.storageCap('scrap'));
});
t('follower lags: a humanoid trails the player and never outruns ~90% of their speed', () => {
  const THREE = { Group: class { constructor() { this.position = { set() { }, x: 0, y: 0, z: 0 }; this.rotation = { y: 0 }; this.scale = { setScalar() { } }; this.userData = {}; } add() { } }, MeshLambertMaterial: class { }, Mesh: class { constructor() { this.position = { set() { } }; this.rotation = { set() { } }; } }, BoxGeometry: class { }, CylinderGeometry: class { }, SphereGeometry: class { } };
  const scene = { add() { }, remove() { } }; B.grant('scrap'); B.call('scrap', 'wilderness'); B.spawnBodies(THREE, scene, () => 0);
  const p = { x: 0, z: 0 }; for (let i = 0; i < 600; i++) { p.x += 11 * 3.889 / 60; B.update(1 / 60, p, 'wilderness'); }   // player runs 11 m/s for 10 s
  const sm = B._sim().scrap, gapM = Math.hypot(p.x - sm.x, p.z - sm.z) / 3.889;
  assert(sm.x < p.x, 'bot is behind the player'); assert(gapM > 3 && gapM < 40, 'lags but keeps following: ' + gapM.toFixed(1) + ' m');
  const wheel = 'unicycle'; B.grant(wheel); B.call(wheel, 'city'); B.update(1 / 60, p, 'city'); assert.strictEqual(B.rec(wheel).bodyState, 'active'); B.update(1 / 60, p, 'wilderness'); assert.strictEqual(B.rec(wheel).bodyState, 'stowed', 'wheeled bot is recalled when you leave the city');
});
t('humanoid swims in deep water (pitched, at the surface) and walks on land', () => {
  const THREE = { Group: class { constructor() { this.position = { set() { }, x: 0, y: 0, z: 0 }; this.rotation = { y: 0 }; this.scale = { setScalar() { } }; this.userData = {}; } add() { } }, MeshLambertMaterial: class { }, Mesh: class { constructor() { this.position = { set() { } }; this.rotation = { set() { } }; } }, BoxGeometry: class { }, CylinderGeometry: class { }, SphereGeometry: class { } };
  const scene = { add() { }, remove() { } }; B.grant('scrap'); B.call('scrap', 'wilderness'); let wy = 5 * 3.889;
  B.spawnBodies(THREE, scene, () => 0, { water: () => wy });
  const p = { x: 0, z: 0 }; for (let i = 0; i < 120; i++) { p.x += 3 * 3.889 / 60; B.update(1 / 60, p, 'wilderness'); }
  const m = Object.values(B._sim())[0]; assert.ok(m.swimK > 0.9, 'swimK ' + m.swimK);
  wy = null; for (let i = 0; i < 120; i++) B.update(1 / 60, p, 'wilderness'); assert.ok(B._sim()['scrap'].swimK < 0.1, 'back on land');
});
console.log(pass + ' passed');
