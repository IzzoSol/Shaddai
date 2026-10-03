// node tools/tests/world-buffs.test.cjs — food/drink buffs: map from vendor items, expiry, no stacking, feed hazard resistance + drain
const assert = require('assert'); const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }; global.window = global;
require('../../public/world-buffs.js'); require('../../public/world-realm-hazards.js'); require('../../public/world-combat-mode.js'); require('../../public/world-realm-zones.js');
const B = global.WorldBuffs; let now = 1e12; B._setClock(() => now); let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('vendor items map to buffs; unknown items map to nothing', () => { assert.strictEqual(B.fromItem('Ember Skewer'), 'warm'); assert.strictEqual(B.fromItem('Aurora Tea'), 'calm'); assert.strictEqual(B.fromItem('Neon Deck Decal'), null); });
t('a buff lasts its duration, then expires; re-eating refreshes instead of stacking', () => {
  B.clear(); assert(B.add('warm')); assert.strictEqual(B.active().length, 1); assert(Math.abs(B.resist('cold') - 0.25) < 1e-9); now += 200 * 1000; B.add('warm'); assert.strictEqual(B.active().length, 1); assert(Math.abs(B.resist('cold') - 0.25) < 1e-9, 'not stacked');
  now += 301 * 1000; assert.strictEqual(B.active().length, 0); assert.strictEqual(B.resist('cold'), 0); assert(!B.add('nope'));
});
t('different buffs combine (resist capped at 60 %, drain multiplier floored at 0.5); persisted across reloads', () => {
  B.clear(); B.add('rested'); B.add('fizzed'); assert(Math.abs(B.drainMult() - 0.72) < 1e-9); B.add('warm'); B.add('calm'); B.add('kicked'); assert(B.resist('cold') > 0 && B.resist('poison') > 0); assert(JSON.parse(store.shd_buffs_v1).warm > now);
});
t('realm hazards use the buffs: a warm player takes less cold damage in the Arctic; a rested player drains stamina slower', () => {
  const U = 7 / 1.8, sec = (c0, c1) => ({ c0, c1, r0: 1900 * U, r1: 4800 * U }), layout = { biomes: [{ id: 'grid' }, { id: 'arctic', sector: sec(314, 346) }] };
  const pos = { x: Math.sin(330 * Math.PI / 180) * 3000 * U, z: -Math.cos(330 * Math.PI / 180) * 3000 * U, y: 0 };
  const run = (buffs) => { const s = { hp: 100 }; const z = global.WorldRealmZones.create({ layout, getPos: () => pos, getHP: () => s.hp, setHP: v => { s.hp = v; }, perk: () => 0, toast() { }, clock: () => 0, buffs }); for (let i = 0; i < 400; i++) z.update(0.05); return { hp: s.hp, drain: z.state().drain }; };
  B.clear(); const bare = run(B); B.add('warm'); B.add('rested'); const fed = run(B); assert(fed.hp > bare.hp, 'warm takes less damage ' + fed.hp + ' vs ' + bare.hp); assert(fed.drain < bare.drain);
});
console.log(pass + ' passed');
