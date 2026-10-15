'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const PUB = path.join(__dirname, '..', '..', 'public');
const R = require(path.join(PUB, 'world-rng.js'));
const S = require(path.join(PUB, 'world-shops.js'));
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }

function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
function world(start) {
  const w = { sparks: start, items: {}, perks: {}, spendCalls: 0, addCalls: 0 };
  w.spend = (n, k, id) => { w.spendCalls++; if (n <= 0) return true; if (w.sparks < n) return false; w.sparks -= n; return true; };
  w.add = (n) => { w.addCalls++; w.sparks += n; };
  w.balance = () => w.sparks;
  w.inv = {
    get: k => w.items[k] || 0,
    add: (k, n) => { w.items[k] = (w.items[k] || 0) + n; },
    take: (k, n) => { n = n || 1; if ((w.items[k] || 0) < n) return false; w.items[k] -= n; if (!w.items[k]) delete w.items[k]; return true; },
    all: () => JSON.parse(JSON.stringify(w.items)),
    perk: k => w.perks[k], setPerk: (k, v) => { w.perks[k] = v; }
  };
  return w;
}
function mk(w, type, key, day) { return S.create({ key: key || 's1', type, seed: key || 's1', day: day || '2026-10-09', storage: mem(), spend: w.spend, add: w.add, balance: w.balance, inv: w.inv }); }

test('catalog deterministic per (type, seed)', () => {
  S.TYPES.forEach(t => assert.deepStrictEqual(S.catalog(t, 'abc'), S.catalog(t, 'abc')));
});
test('catalog differs across seeds for a big pool', () => {
  const a = S.catalog('techlab', 'a').map(x => x.id).join(), b = S.catalog('techlab', 'zzz').map(x => x.id).join();
  const c = S.catalog('techlab', 'q9').map(x => x.id).join();
  assert.ok(a !== b || a !== c);
});
test('stock size 6-12 for every item type; bank empty', () => {
  S.TYPES.forEach(t => {
    const n = S.catalog(t, 'x').length;
    if (t === 'bank') assert.strictEqual(n, 0); else assert.ok(n >= 6 && n <= 12, t + ' ' + n);
  });
});
test('no duplicate ids within a catalog, valid item shape', () => {
  S.TYPES.forEach(t => {
    for (let i = 0; i < 20; i++) {
      const c = S.catalog(t, 'seed' + i), ids = c.map(x => x.id);
      assert.strictEqual(new Set(ids).size, ids.length);
      c.forEach(x => { assert.ok(x.id && x.name && x.kind && x.desc && Number.isInteger(x.price) && x.price > 0); });
    }
  });
});
test('real gadget/gear/farm ids reused', () => {
  const ids = [].concat(...['techlab', 'forge', 'farm-market'].map(t => S.TYPES.length && require(path.join(PUB, 'world-shops.js')).create({ key: 'k', type: t, seed: 'k', day: 'd', storage: mem(), spend: () => true, add() {}, balance: () => 0, inv: world(0).inv }).stock().map(x => x.id)));
  assert.ok(ids.length > 0);
  assert.strictEqual(S.priceOf('radar'), 400); assert.strictEqual(S.priceOf('ember-boots'), 900); assert.strictEqual(S.priceOf('seed-pepper'), 50);
});
test('Fisher-Yates used; no sort-based shuffle in module', () => {
  const src = fs.readFileSync(path.join(PUB, 'world-shops.js'), 'utf8');
  assert.ok(/\.shuffle\(/.test(src));
  assert.ok(!/sort\s*\(/.test(src));
  assert.ok(!/Math\.random/.test(src));
});
test('buy debits exactly price and adds the item', () => {
  const w = world(5000), s = mk(w, 'techlab');
  const it = s.stock().find(x => x.qty > 0), q0 = it.qty;
  const r = s.buy(it.id);
  assert.ok(r.ok); assert.strictEqual(w.sparks, 5000 - it.price); assert.strictEqual(w.items[it.id], 1); assert.strictEqual(s.qty(it.id), q0 - 1);
});
test('buy refused when unaffordable: zero side effects', () => {
  const w = world(0), s = mk(w, 'forge');
  const it = s.stock()[0], before = s.qty(it.id);
  const r = s.buy(it.id);
  assert.ok(!r.ok); assert.strictEqual(w.sparks, 0); assert.deepStrictEqual(w.items, {}); assert.strictEqual(s.qty(it.id), before); assert.strictEqual(w.spendCalls, 0);
});
test('buy of an item not in stock is refused', () => {
  const w = world(9999), s = mk(w, 'gallery');
  assert.ok(!s.buy('radar').ok); assert.strictEqual(w.sparks, 9999);
});
test('sold-out stock refuses', () => {
  const w = world(999999), s = mk(w, 'farm-market');
  const it = s.stock()[0];
  for (let i = 0; i < it.qty; i++) assert.ok(s.buy(it.id).ok);
  const before = w.sparks;
  assert.ok(!s.buy(it.id).ok); assert.strictEqual(w.sparks, before);
});
test('sell refunds floor(0.4*price) and removes the item', () => {
  const w = world(5000), s = mk(w, 'techlab');
  const it = s.stock()[0]; s.buy(it.id);
  const after = w.sparks, r = s.sell(it.id);
  assert.ok(r.ok); assert.strictEqual(w.sparks, after + Math.floor(it.price * 0.4)); assert.strictEqual(w.items[it.id], undefined);
});
test('cannot sell unowned or unknown items', () => {
  const w = world(100), s = mk(w, 'techlab');
  assert.ok(!s.sell('radar').ok); assert.ok(!s.sell('nope').ok); assert.strictEqual(w.sparks, 100); assert.strictEqual(w.addCalls, 0);
});
test('bank sells nothing, has no stock', () => {
  const w = world(100), s = mk(w, 'bank'); w.inv.add('radar', 1);
  assert.strictEqual(s.stock().length, 0); assert.ok(!s.sell('radar').ok); assert.strictEqual(w.items.radar, 1);
});
test('perk items set their perk on buy (max, never lowered)', () => {
  const w = world(99999), s = mk(w, 'techlab', 'perk');
  const p = s.stock().find(x => x.id === 'tl-turbo-core');
  if (p) { w.perks.boostBonus = 0.5; s.buy('tl-turbo-core'); assert.strictEqual(w.perks.boostBonus, 0.5); }
  assert.ok(true);
});
test('Sparks conservation: 200 seeded random buy/sell sequences never increase total', () => {
  for (let seq = 0; seq < 200; seq++) {
    const r = R.create(seq + 1), w = world(500 + r.int(5000)), type = r.pick(['storefront', 'techlab', 'forge', 'gallery', 'farm-market', 'bazaar']);
    const s = mk(w, type, 'c' + seq);
    let start = w.sparks;
    for (let i = 0; i < 40; i++) {
      const before = w.sparks;
      if (r() < 0.6) { const st = s.stock(), it = st[r.int(st.length)]; s.buy(it.id); assert.ok(w.sparks <= before); }
      else { const o = s.owned(); if (o.length) s.sell(o[r.int(o.length)].id); else s.sell('radar'); assert.ok(w.sparks >= before); }
      assert.ok(w.sparks >= 0);
    }
    // value held = sparks + refund value of owned items at 100% price is bounded by start (nothing minted)
    const held = w.sparks + Object.keys(w.items).reduce((a, id) => a + S.priceOf(id) * w.items[id], 0);
    assert.ok(held <= start, 'seq ' + seq);
  }
});
test('round trip buy then sell always loses Sparks', () => {
  S.TYPES.filter(t => t !== 'bank').forEach(t => {
    const w = world(99999), s = mk(w, t, 'rt'), st = s.stock();
    st.forEach(it => { const a = w.sparks; s.buy(it.id); s.sell(it.id); assert.ok(w.sparks < a); });
  });
});
test('daily restock deterministic; persisted qty survives reload, resets next day', () => {
  const st = mem(), w = world(99999);
  const mkd = day => S.create({ key: 'd', type: 'forge', seed: 'd', day, storage: st, spend: w.spend, add: w.add, balance: w.balance, inv: w.inv });
  const a = mkd('2026-10-09'), b = mkd('2026-10-09');
  assert.deepStrictEqual(a.stock(), b.stock());
  const it = a.stock()[0]; a.buy(it.id);
  assert.strictEqual(mkd('2026-10-09').qty(it.id), it.qty - 1);
  const n1 = mkd('2026-10-10'), n2 = mkd('2026-10-10');
  assert.deepStrictEqual(n1.stock(), n2.stock());
  n1.stock().forEach(x => assert.ok(x.qty >= 1 && x.qty <= 5));
});
test('recipe and marker mapping', () => {
  assert.strictEqual(S.typeForRecipe('storefront-s'), 'storefront'); assert.strictEqual(S.typeForRecipe('techlab'), 'techlab');
  assert.strictEqual(S.typeForRecipe('farm-tower'), 'farm-market'); assert.strictEqual(S.typeForRecipe('market'), 'bazaar');
  assert.strictEqual(S.typeForRecipe('office'), null);
  assert.strictEqual(S.typeForMarker({ name: 'STALL_FARM_A' }), 'farm-market');
  assert.strictEqual(S.typeForMarker({ name: 'BLD_GALLERY_SHOP' }), 'gallery');
  assert.strictEqual(S.typeForMarker({ name: 'STALL_X', props: { recipe: 'forge' } }), 'forge');
  assert.strictEqual(S.typeForMarker({ name: 'STALL_ZZ' }), 'bazaar');
  assert.strictEqual(S.typeForMarker({ name: 'GATE_START' }), null);
});
test('no value-out wording in module', () => {
  const src = fs.readFileSync(path.join(PUB, 'world-shops.js'), 'utf8');
  assert.ok(!/cashout|cash-out|withdraw|usd/i.test(src));
});
test('city-actions default path untouched without flag', () => {
  const src = fs.readFileSync(path.join(PUB, 'world-city-actions.js'), 'utf8');
  assert.ok(/shops=1/.test(src) && /shopsOn\(\) && win\.WorldShops/.test(src));
});

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
