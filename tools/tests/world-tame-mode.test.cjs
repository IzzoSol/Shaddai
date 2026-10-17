// node tools/tests/world-tame-mode.test.cjs — dragon taming recipes + passive/fight mode with the Void override
const assert = require('assert'); const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }; global.window = global;
require('../../public/world-tame.js'); require('../../public/world-combat-mode.js');
const T = global.WorldTame, M = global.WorldCombatMode; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const mkInv = o => { const it = Object.assign({}, o); return { it, get: k => it[k] || 0, take(k, n) { if ((it[k] || 0) < n) return false; it[k] -= n; return true; }, add(k, n) { it[k] = (it[k] || 0) + n; } }; };
const sk = (...a) => ({ has: id => a.includes(id) });
t('crafting needs the Academy skill and every material; nothing is consumed on a failure', () => {
  const inv = mkInv({ 'wolf-hide': 6, 'bone-shard': 8, 'ember-herb': 2 });
  assert(!T.craft(inv, 'potion-ember', sk()).ok); assert(/Academy/.test(T.craft(inv, 'potion-ember', sk()).reason));
  const r = T.craft(inv, 'potion-ember', sk('alchemy-1')); assert(!r.ok && /ember-herb/.test(r.reason)); assert.strictEqual(inv.get('wolf-hide'), 6, 'untouched');
  inv.add('ember-herb', 1); assert(T.craft(inv, 'potion-ember', sk('alchemy-1')).ok); assert.strictEqual(inv.get('potion-dragon'), 1); assert.strictEqual(inv.get('wolf-hide'), 0);
});
t('taming: needs tamer skill, a potion and the lure; consumes them, persists, and cannot repeat', () => {
  T._reset(); const inv = mkInv({ 'potion-dragon': 1, 'raw-meat': 4 });
  assert(!T.tame(inv, 'ember', sk()).ok); assert(!T.tame(mkInv({ 'raw-meat': 4 }), 'ember', sk('tamer-1')).ok);
  assert(!T.tame(mkInv({ 'potion-dragon': 1 }), 'ember', sk('tamer-1')).ok);
  assert(T.tame(inv, 'ember', sk('tamer-1')).ok); assert(T.has('ember')); assert.strictEqual(inv.get('potion-dragon'), 0); assert.strictEqual(inv.get('raw-meat'), 0);
  inv.add('potion-dragon', 1); inv.add('raw-meat', 4); assert(!T.tame(inv, 'ember', sk('tamer-1')).ok, 'already tamed'); assert(!T.tame(inv, 'wyrm', sk('tamer-1')).ok);
});
t('passive mode: persists, blocks hurting both ways, mobs ignore you', () => {
  M._reset(); assert(!M.passive()); assert(M.canHurt(false)); const r = M.toggle(); assert(r.passive && M.passive()); assert(!M.canHurt(false) && !M.mobsTarget()); assert(store.shd_cmode_v1 === '1');
  M._reset(); assert(M.canHurt(false)); assert(!M.canHurt(true), 'cannot hit a passive player');
});
t('the Void forces fight mode and refuses the toggle; leaving restores your choice', () => {
  M._reset(); M.setInVoid((x, z) => Math.hypot(x - 9000, z) < 1500); M.toggle(); assert(M.passive()); const seen = [];
  M.onChange((p, f) => seen.push([p, f])); assert(M.update(9000, 0) === false); assert(M.locked()); assert(!M.passive()); assert(M.mobsTarget());
  const r = M.toggle(); assert(r.locked && /Void/.test(r.reason)); assert(M.canHurt(false));
  assert(M.update(0, 0) === true && !M.locked(), 'back to passive outside'); assert(seen.length === 2);
});
console.log(pass + ' passed');
