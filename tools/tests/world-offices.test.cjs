'use strict';
/* tools/tests/world-offices.test.cjs — office services (unique verb per office), perks consumed by other systems. Run: node tools/tests/world-offices.test.cjs */
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert'); const ROOT = path.join(__dirname, '..', '..');
const store = {}; const win = { localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } }; let bal = 1000; const log = [];
win.ShdSparks = { get: () => bal, spend: (n, k, w) => { if (bal < n) return false; bal -= n; log.push(['spend', n, w]); return true; }, add: (n, k, w) => { bal += n; log.push(['add', n, w]); } };
const ctx = { window: win, Math, console, Date, JSON, setInterval: undefined }; vm.createContext(ctx); const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'), ctx, { filename: f });
['world-inventory.js', 'world-offices.js', 'world-mounts.js', 'world-bots.js'].forEach(run);
let pass = 0, fail = 0; const test = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack || e)); } };
const O = win.WorldOffices, I = win.ShdInv;
test('every office has exactly one distinct verb (no redundant offices)', () => { const v = Object.keys(O.OFFICES).map(k => O.OFFICES[k].verb); assert.strictEqual(v.length, 7); assert.strictEqual(new Set(v).size, 7, 'verbs unique: ' + v.join(',')); });
test('NEXUS fabricates: spends Sparks, grants items/perks (turbo capped at +30%)', () => {
  I._reset(); bal = 1000; assert.strictEqual(O.act('NEXUS', 'craft', 'decal').ok, true); assert.strictEqual(I.get('decal-pack'), 1); assert.strictEqual(bal, 940);
  for (let i = 0; i < 5; i++) O.act('NEXUS', 'craft', 'thruster'); assert.ok(Math.abs(I.perk('boostBonus') - 0.3) < 1e-9, 'capped at 0.3'); bal = 5; assert.strictEqual(O.act('NEXUS', 'craft', 'thruster').ok, false, 'no Sparks, no kit');
});
test('PIKADON insurance: a destroyed mount is kept ONCE, the policy is consumed', () => {
  I._reset(); bal = 1000; const M = win.WorldMounts; M._reset && M._reset(); assert.ok(M.buy('bull', n => true).ok, 'own a bull'); assert.strictEqual(O.act('PIKADON', 'insure', 'insure', 'bull').ok, true);
  assert.strictEqual(M.lose('bull', 'destroyed'), false, 'insured: not lost'); assert.ok(M.has('bull')); assert.strictEqual(M.lose('bull', 'destroyed') !== false, true, 'second loss is real'); assert.ok(!M.has('bull'));
});
test('NEXUS bot parts: rebuild costs 20% less after the pack', () => {
  I._reset(); const B = win.WorldBots; B.pickStarter('scrap'); const rec = B.rec('scrap'); rec.bodyState = 'destroyed'; let paid = 0; I.setPerk('rebuildDiscount', 0.2); const r = B.rebuild('scrap', n => { paid = n; return true; }); assert.strictEqual(r.ok, true); assert.strictEqual(paid, Math.round(B.TUNE.rebuildSparks * 0.8));
});
test('TURTLE dye sets/clears the perk; SHADDAI check-in pays once a day', () => {
  I._reset(); O.act('TURTLE', 'studio', 'dye-gold'); assert.strictEqual(I.perk('dye'), '#e8c45c'); O.act('TURTLE', 'studio', 'dye-clear'); assert.strictEqual(I.perk('dye'), null);
  bal = 0; const a = O.act('SHADDAI', 'hub', 'checkin'); assert.strictEqual(a.ok, true); assert.strictEqual(bal, 100); assert.strictEqual(O.act('SHADDAI', 'hub', 'checkin').ok, false, 'second check-in same day refused'); assert.strictEqual(bal, 100);
});
test('QUILL ledger reads kill + jam records; unknown office/service rejected', () => {
  store.shd_mobkills_v1 = JSON.stringify({ total: 7, by: { mummy: 4, imp: 3 } }); store.shd_jam_lb_v1 = JSON.stringify([{ score: 1320 }]); const r = O.act('QUILL', 'ledger', 'read'); assert.strictEqual(r.ok, true); assert.match(r.msg, /Mob kills 7/); assert.match(r.msg, /1320/);
  assert.strictEqual(O.act('NOPE', 'x', 'y').ok, false); assert.strictEqual(O.act('NEXUS', 'x', 'y').ok, false);
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
