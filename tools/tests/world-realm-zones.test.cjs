// node tools/tests/world-realm-zones.test.cjs — the runtime: castle gas + pit lava, mask perks, HP floor, STRICT realm membership, Void forces fight
const assert = require('assert'); const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }; global.window = global;
require('../../public/world-realm-hazards.js'); require('../../public/world-combat-mode.js'); require('../../public/world-realm-zones.js');
const U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
// compass wedges like the real layout (c0..c1 degrees clockwise from north, radius band in game units)
const sec = (c0, c1, r0m, r1m) => ({ c0, c1, r0: r0m * U, r1: r1m * U });
const layout = { biomes: [{ id: 'grid' }, { id: 'void', sector: sec(344, 16, 1900, 4800) }, { id: 'arctic', sector: sec(314, 346, 1900, 4800) }, { id: 'volcano', sector: sec(45, 80, 1900, 4800) }, { id: 'meadow', sector: sec(122, 172, 1900, 4800) }] };
const at = (deg, rm) => ({ x: Math.sin(deg * Math.PI / 180) * rm * U, z: -Math.cos(deg * Math.PI / 180) * rm * U });
const keep = at(0, 3700 + 180), castle = { castle: { x: keep.x, y: 60 * U, z: keep.z }, pitCentre: at(0, 3700) };
function mk(pos, perks) { const s = { hp: 100, pos, toasts: [], hurts: 0 }; s.run = global.WorldRealmZones.create({ layout, castle: () => castle, getPos: () => s.pos, getHP: () => s.hp, setHP: v => { s.hp = v; }, perk: k => (perks || {})[k], onHurt: () => { s.hurts++; }, toast: m => s.toasts.push(m), clock: () => s.t = (s.t || 0) + 20 }); return s; }
const step = (s, sec2) => { for (let i = 0; i < sec2 * 20; i++) s.run.update(0.05); };
const P = (p, y) => Object.assign({ y: y == null ? 60 * U : y }, p);
t('poison gas around the castle keep hurts an unprotected player and names the mask level', () => { global.WorldCombatMode._reset(); const s = mk(P(keep)); step(s, 5); assert(s.hp < 100 && s.hp >= 25); assert(/gas mask level 10/.test(s.toasts[0])); assert.strictEqual(s.run.state().zone, 'castle-gas'); });
t('NO hazards in the Grid or the ring zone, anywhere near the old false-positive spots', () => { for (const [d, rm] of [[307, 542], [45, 300], [200, 900], [300, 1700], [90, 2500]]) { const s = mk(P(at(d, rm))); step(s, 5); assert.strictEqual(s.hp, 100, d + '/' + rm); assert.strictEqual(s.run.state().zone, null); } });
t('mask level 10 + poison resist nearly stops the gas; far from the keep there is none', () => {
  const a = mk(P(keep), { 'mask-gas': 10, 'resist-poison': 0.6 }); step(a, 5); const b = mk(P(keep)); step(b, 5); assert(100 - a.hp < (100 - b.hp) * 0.2);
  const far = mk(P(at(0, 3700 + 180 + 400))); step(far, 10); assert.strictEqual(far.hp, 100);
});
t('purple lava fills the pit BELOW the lip only: on the bridge (high) it is safe, falling in (low) burns; lava mask + fire clothing cut it', () => {
  const high = mk(P(castle.pitCentre, 60 * U)); step(high, 3); assert.strictEqual(high.run.state().zone === 'castle-lava', false);
  const low = mk(P(castle.pitCentre, 10 * U)); step(low, 3); assert.strictEqual(low.run.state().zone, 'castle-lava'); assert(low.hp < 100);
  const prot = mk(P(castle.pitCentre, 10 * U), { 'mask-lava': 5, 'resist-fire': 0.85 }); step(prot, 3); assert(100 - prot.hp < (100 - low.hp) * 0.2);
});
t('hazards weaken but never kill: HP floors at 25', () => { const s = mk(P(keep)); step(s, 200); assert.strictEqual(s.hp, 25); });
t('arctic realm: deep cold raises the stamina drain multiplier unless an arctic mask is worn', () => { const a = mk(P(at(330, 3000))); step(a, 1); const b = mk(P(at(330, 3000)), { 'mask-arctic': 3 }); step(b, 1); assert(a.run.state().zone === 'arctic-cold' && a.run.state().drain > 1.5 && b.run.state().drain === 1); });
t('the Void realm forces fight mode on entry and restores passive after leaving (strict wedge, not nearest realm)', () => {
  global.WorldCombatMode._reset(); const s = mk(P(at(150, 3000))); global.WorldCombatMode.toggle(); assert(global.WorldCombatMode.passive());
  s.pos = P(at(5, 2500)); step(s, 1); assert(global.WorldCombatMode.locked() && !global.WorldCombatMode.passive());
  s.pos = P(at(150, 3000)); step(s, 1); assert(!global.WorldCombatMode.locked() && global.WorldCombatMode.passive());
  s.pos = P(at(5, 800)); step(s, 1); assert(!global.WorldCombatMode.locked(), 'inside the Grid is never the Void');
});
console.log(pass + ' passed');
