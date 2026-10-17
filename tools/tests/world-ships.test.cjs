const vm = require('vm'), fs = require('fs'), assert = require('assert');
const store = {}; let sparks = 0; const spent = [];
const ctx = { console, Date, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, ShdSparks: { spend: (n, k, id) => { if (sparks < n) return false; sparks -= n; spent.push([n, k, id]); return true; } } };
ctx.window = ctx; vm.createContext(ctx);
const SRC = fs.readFileSync('public/world-ships.js', 'utf8'); vm.runInContext(SRC, ctx);
const W = ctx.WorldShips; let pass = 0, fail = 0;
const t = (n, f) => { try { W._reset(); sparks = 0; spent.length = 0; f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };

t('catalog is 3 classes x 3 tiers with rising price and stats', () => {
  assert.strictEqual(W.CATALOG.length, 9);
  ['galleon', 'skimmer', 'nautilus'].forEach(c => { const l = W.ofClass(c); assert.strictEqual(l.length, 3); for (let i = 1; i < 3; i++) { assert(l[i].price > l[i - 1].price && l[i].hp > l[i - 1].hp && l[i].speed > l[i - 1].speed && l[i].reload < l[i - 1].reload); } });
});
t('buy refused when unaffordable: no state change, no spend', () => {
  sparks = 100; const r = W.buy('galleon-1'); assert(!r.ok); assert(!W.has('galleon-1')); assert.strictEqual(sparks, 100); assert.strictEqual(spent.length, 0); assert.strictEqual(W.selected(), null); assert.strictEqual(store.shd_ships_v1 && JSON.parse(store.shd_ships_v1).owned.length || 0, 0);
  assert(!W.buy('nope').ok);
});
t('buy deducts, owns, auto-selects; double buy refused without a second charge', () => {
  sparks = 2000; const r = W.buy('galleon-1'); assert(r.ok && r.paid === 500); assert.strictEqual(sparks, 1500); assert(W.has('galleon-1')); assert.strictEqual(W.selected(), 'galleon-1');
  assert(!W.buy('galleon-1').ok); assert.strictEqual(sparks, 1500); assert(W.buy('skimmer-2').ok); assert(W.select('skimmer-2')); assert.strictEqual(W.selected(), 'skimmer-2'); assert(!W.select('nautilus-3'));
  assert(JSON.parse(store.shd_ships_v1).owned.length === 2, 'persisted');
});
t('injected spend() is used instead of ShdSparks', () => { const calls = []; const r = W.buy('nautilus-1', (n, k, id) => { calls.push([n, k, id]); return true; }); assert(r.ok); assert.strictEqual(JSON.stringify(calls), JSON.stringify([[600, 'ship', 'nautilus-1']])); assert.strictEqual(spent.length, 0); });
t('upgrade costs 300/700/1500, caps at 3, refuses without Sparks', () => {
  assert(!W.upgrade('engine').ok); assert.strictEqual(W.level('engine'), 0); sparks = 10000;
  [300, 700, 1500].forEach((c, i) => { const r = W.upgrade('engine'); assert(r.ok && r.paid === c, 'lvl ' + i); assert.strictEqual(W.level('engine'), i + 1); });
  const before = sparks; const m = W.upgrade('engine'); assert(!m.ok && /maxed/.test(m.msg)); assert.strictEqual(sparks, before); assert(!W.upgrade('warp').ok);
});
t('mult composes tier x upgrades; reload only from tier', () => {
  let m = W.mult('galleon-1'); assert.strictEqual(JSON.stringify(m), JSON.stringify({ speed: 1, turn: 1, hp: 1, reload: 1 }));
  sparks = 99999; W.upgrade('engine'); W.upgrade('engine'); W.upgrade('handling'); W.upgrade('hull'); m = W.mult('skimmer-3'); const d = W.def('skimmer-3');
  assert(Math.abs(m.speed - d.speed * 1.12) < 1e-9 && Math.abs(m.turn - d.turn * 1.08) < 1e-9 && Math.abs(m.hp - d.hp * 1.10) < 1e-9 && m.reload === d.reload);
  assert.deepStrictEqual(W.mult('bogus').reload, 1);
});
t('lose removes the ship, reselects, rebuy is discounted; summon only when owned', () => {
  sparks = 99999; W.buy('galleon-2'); W.buy('galleon-1'); assert.strictEqual(W.selected(), 'galleon-2'); assert(W.summon('galleon-2').cls === 'galleon'); assert(!W.summon('skimmer-1'));
  assert(W.lose('galleon-2', 'sunk')); assert(!W.has('galleon-2')); assert.strictEqual(W.selected(), 'galleon-1'); assert(!W.lose('galleon-2')); assert.strictEqual(W.summon('galleon-2'), null);
  assert.strictEqual(W.replaceCost('galleon-2'), Math.round(1400 * 0.85)); const before = sparks; assert(W.buy('galleon-2').ok); assert.strictEqual(before - sparks, 1190);
});
t('closed loop: source never mints Sparks (no .add / mint / earn calls)', () => {
  assert(!/ShdSparks\.add|\.add\(\s*\d|mint|earn|payout|withdraw|cashout/i.test(SRC.replace(/\/\*[\s\S]*?\*\//, '')), 'value-out found');
});
console.log(pass + ' passed, ' + fail + ' failed');
