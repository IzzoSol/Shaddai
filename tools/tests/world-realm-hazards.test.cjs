// node tools/tests/world-realm-hazards.test.cjs — castle gas needs mask level 10; per-realm clothing; arctic mask saves stamina
const assert = require('assert'); global.window = global; require('../../public/world-realm-hazards.js'); const H = global.WorldRealmHazards;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('desert sun: bare = 2 hp/s + drain + warn naming the wrap; Desert Wrap (mask-wrap 1) blocks the drain and 70 % of the damage', () => {
  const bare = H.tick('desert-sun', {}, 1), wrapped = H.tick('desert-sun', { masks: { wrap: 1 }, resist: { sun: 0.5 } }, 1);
  assert.strictEqual(bare.hp, 2); assert(bare.stamina > 0 && /wrap/.test(bare.warn)); assert(wrapped.stamina === 0 && wrapped.warn === null && wrapped.hp < 0.31);
});
t('no gear: full damage and a warning that names the mask and level', () => { const r = H.tick('castle-gas', {}, 1); assert.strictEqual(r.hp, 6); assert(/gas mask level 10/.test(r.warn)); });
t('gas mask scales with level: level 10 blocks 70 % of damage and all the drain, level 5 about half of that', () => {
  const a = H.tick('castle-gas', { masks: { gas: 10 } }, 1), b = H.tick('castle-gas', { masks: { gas: 5 } }, 1);
  assert(Math.abs(a.hp - 1.8) < 1e-9 && a.stamina === 0 && a.warn === null); assert(b.hp > a.hp && b.hp < 6 && b.stamina > 0 && b.warn);
});
t('clothing for the element cuts health damage and stacks to a cap; the wrong element does nothing', () => {
  const fire = H.tick('castle-lava', { resist: { fire: 0.5 } }, 1), none = H.tick('castle-lava', {}, 1), wrong = H.tick('castle-lava', { resist: { cold: 0.6 } }, 1);
  assert(Math.abs(fire.hp - none.hp * 0.5) < 1e-9); assert.strictEqual(wrong.hp, none.hp);
  const capped = H.tick('castle-lava', { resist: { fire: 3 } }, 1); assert(Math.abs(capped.hp - none.hp * 0.15) < 1e-9, 'capped at 85 %');
});
t('arctic mask removes the extra stamina drain of deep cold; the cold still bites a bare player', () => {
  const bare = H.tick('arctic-cold', {}, 1), masked = H.tick('arctic-cold', { masks: { arctic: 3 } }, 1); assert(bare.stamina > 1 && masked.stamina === 0); assert(masked.hp < bare.hp);
});
t('mask + full suit makes the hardest hazard nearly harmless; the void drain has no counter mask', () => {
  const g = { masks: { lava: 5 }, resist: { fire: 0.85 } }; assert(H.tick('castle-lava', g, 1).hp < 0.7); assert(Math.abs(H.tick('void-drain', { masks: { gas: 1 } }, 1).hp - 1.2) < 1e-9);   // owner 2026-10-22: the Void Respirator (gas mask) now counters the void drain (was: no mask helps)
});
t('zoneAt finds circle and box zones, null outside; unknown zones are harmless', () => {
  const z = [{ id: 'a', x: 0, z: 0, r: 10 }, { id: 'b', x0: 50, x1: 60, z0: 0, z1: 5 }]; assert.strictEqual(H.zoneAt(z, 3, 4).id, 'a'); assert.strictEqual(H.zoneAt(z, 55, 2).id, 'b'); assert.strictEqual(H.zoneAt(z, 30, 30), null); assert.strictEqual(H.tick('nope', {}, 1).hp, 0);
});
console.log(pass + ' passed');
