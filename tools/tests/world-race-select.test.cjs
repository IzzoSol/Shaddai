'use strict';
/* tools/tests/world-race-select.test.cjs — Grand Prix series logic + start flow of public/world-race-select.js (vm, stub DOM). Run: node tools/tests/world-race-select.test.cjs */
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const handlers = {}, starts = [], toasts = [], adds = [];
const stubEl = () => { const e = { style: {}, innerHTML: '', children: [], appendChild(c) { this.children.push(c); return c; }, remove() { }, addEventListener() { }, querySelector() { return stubEl(); }, set onclick(f) { } }; return e; };
const win = { addEventListener: (t, f) => { handlers[t] = f; }, Navi: { toast: m => toasts.push(m) }, ShdSparks: { get: () => 1000, spend: () => true, add: (n, k, w) => adds.push([n, k, w]) }, __raceStart: (cid, o) => { starts.push([cid, o]); return true; } };
win.document = { createElement: stubEl, body: stubEl() };
const ctx = { window: win, document: win.document, Math, console, setTimeout: (f) => { f(); return 0; } }; vm.createContext(ctx);
const code = (f) => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
vm.runInContext(code('world-race.js'), ctx); vm.runInContext(code('world-race-select.js'), ctx);
let pass = 0, fail = 0; const test = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack || e)); } };
const RS = win.WorldRaceSelect, fire = (place) => handlers['shaddai:race']({ detail: { type: 'finish', id: 'you', place, of: 6 } });

test('config: Grand Prix = the 3 park cups; points 10/8/6/5/4/3/2/1; medals gold/silver/bronze', () => {
  assert.deepStrictEqual(Array.from(RS._cfg.GP_CUPS), ['plaza-cup', 'spine-cup', 'forum-grand']); assert.strictEqual(RS._cfg.GP_PTS[0], 10); assert.strictEqual(RS._cfg.GP_MEDAL[0].bonus, 120);
  RS._cfg.GP_CUPS.forEach(c => assert.ok(win.WorldRace.CIRCUITS[c], c));
});
test('Grand Prix: three wins in a row (24+ pts) pay GOLD +120 and auto-start legs 2 and 3 with the same ride', () => {
  starts.length = 0; adds.length = 0; RS._test.gpBegin('kart-pod', 5); fire(1); assert.strictEqual(starts.length, 1); assert.strictEqual(starts[0][0], 'spine-cup'); assert.strictEqual(starts[0][1].vehicle, 'kart-pod');
  fire(1); assert.strictEqual(starts.length, 2); assert.strictEqual(starts[1][0], 'forum-grand'); fire(1); assert.deepStrictEqual(adds.pop(), [120, 'race-win', 'grand prix GOLD']); assert.strictEqual(RS.gp(), null, 'series ends');
});
test('Grand Prix: P2/P3/P4 = 8+6+5 = 19 pts -> SILVER +60; weak finish pays nothing', () => {
  adds.length = 0; RS._test.gpBegin('board-sunburst', 3); fire(2); fire(3); fire(4); assert.deepStrictEqual(adds.pop(), [60, 'race-win', 'grand prix SILVER']);
  adds.length = 0; RS._test.gpBegin('kart-van', 3); fire(8); fire(8); fire(8); assert.strictEqual(adds.length, 0, '3 pts: no medal');
});
test('board rides start with style; kart rides with vehicle id', () => {
  starts.length = 0; RS._test.gpBegin('board-batwing', 4); fire(1); assert.strictEqual(starts[0][1].style, 'batwing'); assert.strictEqual(starts[0][1].vehicle, undefined);
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
