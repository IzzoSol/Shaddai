'use strict';
/* tools/tests/world-arcade-farm.test.cjs — arcade RTP/cap + farm growth/sell/cap. Run: node tools/tests/world-arcade-farm.test.cjs */
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert'); const ROOT = path.join(__dirname, '..', '..');
const store = {}; let bal = 100000; const win = { localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
win.ShdSparks = { get: () => bal, spend: (n) => { if (bal < n) return false; bal -= n; return true; }, add: (n) => { bal += n; } };
const ctx = { window: win, Math, console, Date, JSON }; vm.createContext(ctx); ['world-inventory.js', 'world-arcade.js', 'world-farm.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'), ctx, { filename: f }));
let pass = 0, fail = 0; const test = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack || e)); } };
const A = win.WorldArcade, F = win.WorldFarm, I = win.ShdInv;
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
test('slots: analytic RTP = target (0.92) and a 300k-spin simulation lands within 3%', () => {
  assert.ok(Math.abs(A.slots.rtp() - A.TUNE.rtp) < 1e-9, 'rtp ' + A.slots.rtp()); const rng = lcg(7); let bet = 0, back = 0; for (let i = 0; i < 300000; i++) { const r = A.slots.spin(100, rng); bet += 100; back += r.win; } const rtp = back / bet; assert.ok(rtp > 0.89 && rtp < 0.95, 'simulated RTP ' + rtp.toFixed(4));
});
test('arcade daily cap: net winnings beyond the cap pay the bet back only', () => {
  Object.keys(store).forEach(k => delete store[k]); bal = 100000; // force wins via the dash perfect hit
  let net0 = bal; for (let i = 0; i < 40; i++) A.dash.play(100, 0.5); const st = A.state(); assert.ok(st.net <= A.TUNE.dailyNetCap, 'net ' + st.net + ' <= cap'); assert.ok(bal - net0 <= A.TUNE.dailyNetCap + 1, 'wallet gain capped: ' + (bal - net0));
});
test('hover dash tiers: perfect x3, good x1.8, ok x1.2, miss 0; higher-lower pushes at streak 0 and pays streak multipliers', () => {
  Object.keys(store).forEach(k => delete store[k]); bal = 1000; let r = A.dash.play(100, 0.5); assert.strictEqual(r.tier, 'PERFECT'); assert.strictEqual(r.credit, 300); r = A.dash.play(100, 0.58); assert.strictEqual(r.tier, 'GOOD'); r = A.dash.play(100, 0.65); assert.strictEqual(r.tier, 'OK'); r = A.dash.play(100, 0.95); assert.strictEqual(r.tier, 'MISS'); assert.strictEqual(r.credit, 0);
  bal = 1000; const rng = lcg(3); assert.strictEqual(A.hl.start(100, rng).ok, true); assert.strictEqual(bal, 900); const c = A.hl.cash(); assert.strictEqual(c.won, false); assert.strictEqual(bal, 1000, 'cash at streak 0 returns the bet');
});
test('farm: plant costs seed, crops grow in real time, water speeds up, harvest -> inventory, sell pays', () => {
  Object.keys(store).forEach(k => delete store[k]); I._reset(); F._reset(); bal = 1000; let t = 1e12; F._now(() => t);
  assert.strictEqual(F.plant(0, 'bean').ok, true); assert.strictEqual(bal, 992); assert.strictEqual(F.plant(0, 'berry').ok, false, 'bed in use'); assert.strictEqual(F.harvest(0).ok, false, 'not ripe');
  t += 60e3; assert.strictEqual(F.water(0).ok, true); assert.strictEqual(F.water(0).ok, false, 'one watering per plant'); const left = F.beds()[0].msLeft; assert.ok(left < 4 * 60e3, 'watering cut the remaining time: ' + left);
  t += 5 * 60e3; assert.ok(F.beds()[0].ready); assert.strictEqual(F.harvest(0).ok, true); assert.strictEqual(I.get('crop-bean'), 1); const before = bal; assert.strictEqual(F.sellAll(), 18); assert.strictEqual(bal - before, 18); assert.strictEqual(I.get('crop-bean'), 0);
});
test('farm daily profit cap: past 400 profit sells at 50%', () => {
  Object.keys(store).forEach(k => delete store[k]); I._reset(); F._reset(); bal = 100000; let t = 2e12; F._now(() => t); I.add('crop-pepper', 10); const g1 = F.sellAll(); assert.ok(g1 < 140 * 10, 'cap reduced the total (' + g1 + ')'); assert.ok(g1 >= 140 * 4, 'first sales at full price');
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
