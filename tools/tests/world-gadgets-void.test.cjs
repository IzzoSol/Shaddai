// node tools/tests/world-gadgets-void.test.cjs — Void Respirator (gas perks) + EMP Charge (dragon stagger/damage)
const assert = require('assert');
const store = {}; global.window = global;
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
let sparks = 5000; global.ShdSparks = { spend: n => (sparks >= n ? (sparks -= n, true) : false), get: () => sparks };
const perks = {}; global.ShdInv = { perk: k => perks[k], setPerk: (k, v) => { perks[k] = v; } };
const dmg = []; const dragons = [{ id: 'd1', f: { x: 10, z: 0 }, staggerT: 0 }, { id: 'd2', f: { x: 500, z: 0 }, staggerT: 0 }, { id: 'd3', f: { x: 5, z: 5 }, defeated: true, staggerT: 0 }];
global.__worldDragons = { dragons, damage: (id, a, p, type) => { dmg.push([id, a, type]); return true; } };
require('../../public/world-gadgets.js'); const G = global.WorldGadgets;
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };

t('respirator: buying sets the gas perks world-realm-zones reads; never lowers a better perk', () => {
  perks['resist-void'] = 0.4;
  const r = G.buy('respirator'); assert(r.ok, r.msg);
  assert.strictEqual(perks['mask-gas'], 1); assert.strictEqual(perks['resist-poison'], 0.5); assert.strictEqual(perks['resist-void'], 0.4);
  assert.strictEqual(G.buy('respirator').ok, false);   // worn once
});
t('emp: stack of 3, costs 150 each', () => {
  const before = sparks; for (let i = 0; i < 3; i++) assert(G.buy('emp').ok); assert.strictEqual(G.buy('emp').ok, false); assert.strictEqual(before - sparks, 450);
});
t('empHits: in range only, skips defeated and ridden dragons', () => {
  assert.deepStrictEqual(G.empHits(dragons, { x: 0, z: 0 }, 30 * 7 / 1.8), ['d1']);
});
t('useEmp: staggers + storm damage in range, spends a charge; empty -> refused', () => {
  const r = G.useEmp({ x: 0, z: 0 }); assert(r.ok); assert.deepStrictEqual(r.hits, ['d1']);
  assert.strictEqual(dragons[0].staggerT, G.EMP.stagger); assert.deepStrictEqual(dmg[0], ['d1', 40, 'lightning']); assert.strictEqual(dragons[1].staggerT, 0);
  G.useEmp({ x: 0, z: 0 }); G.useEmp({ x: 0, z: 0 }); assert.strictEqual(G.useEmp({ x: 0, z: 0 }).ok, false);
});
console.log(`${pass} passed, 0 failed`);
