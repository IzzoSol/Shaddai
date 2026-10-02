// node tools/tests/world-realm-zones.test.cjs — the runtime: castle gas, mask perks, HP floor, Void forces fight
const assert = require('assert'); const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }; global.window = global;
require('../../public/world-realm-hazards.js'); require('../../public/world-combat-mode.js'); require('../../public/world-realm-zones.js');
const U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const biomes = [{ id: 'grid', center: [0, 0] }, { id: 'darkforest', center: [-5000, -5000] }, { id: 'void', center: [9000, 0] }, { id: 'arctic', center: [0, -9000] }, { id: 'meadow', center: [0, 9000] }];
const layout = { biomeAt: (x, z) => { let b = biomes[0], bd = Infinity; for (const q of biomes) { const d = Math.hypot(x - q.center[0], z - q.center[1]); if (d < bd) { bd = d; b = q; } } return b; } };
function mk(pos, perks) { const s = { hp: 100, pos, toasts: [], hurts: 0 }; const run = global.WorldRealmZones.create({ layout, getPos: () => s.pos, getHP: () => s.hp, setHP: v => { s.hp = v; }, perk: k => (perks || {})[k], onHurt: () => { s.hurts++; }, toast: m => s.toasts.push(m), clock: () => s.t = (s.t || 0) + 20 }); s.run = run; return s; }
const step = (s, sec) => { for (let i = 0; i < sec * 20; i++) s.run.update(0.05); };
t('castle gas near the keep hurts an unprotected player and warns about the mask level', () => { global.WorldCombatMode._reset(); const s = mk({ x: -5000, z: -5000 }); step(s, 5); assert(s.hp < 100 && s.hp >= 25); assert(s.toasts.length >= 1 && /gas mask level 10/.test(s.toasts[0])); assert.strictEqual(s.run.state().zone, 'castle-gas'); });
t('mask level 10 + poison resist nearly stops it, outside the keep radius there is no gas at all', () => {
  const a = mk({ x: -5000, z: -5000 }, { 'mask-gas': 10, 'resist-poison': 0.6 }); step(a, 5); const b = mk({ x: -5000, z: -5000 }); step(b, 5); assert(100 - a.hp < (100 - b.hp) * 0.2, 'protected loses far less: ' + (100 - a.hp) + ' vs ' + (100 - b.hp));
  const far = mk({ x: -5000 + 400 * U, z: -5000 }); step(far, 10); assert.strictEqual(far.hp, 100); assert.strictEqual(far.run.state().zone, null);
});
t('hazards weaken but never kill: HP floors at 25', () => { const s = mk({ x: -5000, z: -5000 }); step(s, 200); assert.strictEqual(s.hp, 25); });
t('arctic realm: deep cold raises the stamina drain multiplier unless an arctic mask is worn', () => { const a = mk({ x: 0, z: -9000 }); step(a, 1); const b = mk({ x: 0, z: -9000 }, { 'mask-arctic': 3 }); step(b, 1); assert(a.run.state().drain > 1.5 && b.run.state().drain === 1); });
t('the Void forces fight mode on entry and restores passive after leaving', () => {
  global.WorldCombatMode._reset(); const s = mk({ x: 0, z: 9000 }); global.WorldCombatMode.setInVoid((x, z) => layout.biomeAt(x, z).id === 'void'); global.WorldCombatMode.toggle(); assert(global.WorldCombatMode.passive());
  s.pos = { x: 9000, z: 0 }; step(s, 1); assert(!global.WorldCombatMode.passive() && s.run.state().forcedFight === false || global.WorldCombatMode.locked()); assert(global.WorldCombatMode.locked());
  s.pos = { x: 0, z: 9000 }; step(s, 1); assert(!global.WorldCombatMode.locked() && global.WorldCombatMode.passive());
});
console.log(pass + ' passed');
