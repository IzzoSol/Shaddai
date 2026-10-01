// node tools/tests/world-mounts.test.cjs — mount stores, prices, loss + rebuy (owner rules 2026-09-29)
const assert = require('assert'), store = {}; global.window = global; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
require('../../public/world-mounts.js'); const M = global.WorldMounts;
let pass = 0; const t = (n, f) => { try { M._reset(); f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const wallet = b => { const w = { bal: b, spend: n => { if (w.bal < n) return false; w.bal -= n; return true; } }; return w; };
t('4 rigged mounts + the Aero Skiff + 3 hover cars + 2 boards; each realm store sells its own', () => { assert.strictEqual(M.CATALOG.filter(c => c.kind === 'mount').length, 8); assert.strictEqual(M.CATALOG.filter(c => c.kind === 'board').length, 2); assert.deepStrictEqual(M.storesAt('arctic').map(c => c.id), ['mammoth']); assert(M.storesAt('forge').some(c => c.id === 'bull')); });
t('the FLYING mount and the FLYING board cost more than their ground siblings', () => {
  const ground = M.CATALOG.filter(c => c.kind === 'mount' && !c.flying).map(c => c.price), fly = M.def('hawk').price; assert(fly > Math.max(...ground), 'hawk ' + fly + ' > ' + Math.max(...ground)); assert(M.def('board-foil').price > M.def('board-street').price);
});
t('buy only at a store that sells it, only once, only with enough Sparks', () => {
  const w = wallet(5000); assert.strictEqual(M.buy('mammoth', w.spend, 'forge').ok, false, 'wrong store'); assert.strictEqual(M.buy('mammoth', w.spend, 'arctic').ok, true); assert.strictEqual(w.bal, 5000 - 600);
  assert.strictEqual(M.buy('mammoth', w.spend, 'arctic').why, 'you already own it'); assert.strictEqual(M.buy('hawk', wallet(10).spend, 'harbor').ok, false);
});
t('you can LOSE a mount or board; the rebuy is a little cheaper; the record is gone until rebought', () => {
  const w = wallet(5000); M.buy('bull', w.spend, 'forge'); assert(M.has('bull')); assert(M.lose('bull', 'destroyed')); assert(!M.has('bull')); assert.strictEqual(M.summon('bull'), null);
  assert(M.replaceCost('bull') < M.def('bull').price); const quote = M.replaceCost('bull'), before = w.bal; M.buy('bull', w.spend, 'forge'); assert.strictEqual(before - w.bal, quote); assert.strictEqual(quote, Math.round(400 * 0.85));
});
t('damage destroys at 0 HP; summon returns the model, clips and saddle node for the rider', () => {
  M.buy('hawk', wallet(99999).spend, 'harbor'); const s = M.summon('hawk'); assert(s.flying && s.model === '/assets/mounts/hawk.glb' && s.clips.fly === 'fly' && s.saddle === 'saddle'); assert.strictEqual(M.damage('hawk', 60), 40); M.damage('hawk', 60); assert(!M.has('hawk'));
});
console.log(pass + ' passed');
