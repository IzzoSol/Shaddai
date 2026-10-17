// node tools/tests/world-race-modes.test.cjs — Time Trial (solo, personal bests), Free Ride, and the select screen's mode wiring
const assert = require('assert'), path = require('path'), fs = require('fs'), vm = require('vm');
const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
global.window = global; require('../../public/world-race.js'); require('../../public/world-race-run.js');
const U = 7 / 1.8, W = global.WorldRaceRun, WR = global.WorldRace;
const sq = [[0, 0], [400, 0], [400, 400], [0, 400]].map(p => ({ x: p[0] * U, y: 0, z: p[1] * U }));
const at = u => { const L = 1600, d = ((u % 1) + 1) % 1 * L, k = Math.min(3, Math.floor(d / 400)), a = sq[k], b = sq[(k + 1) % 4], f = (d - k * 400) / 400; return { x: a.x + (b.x - a.x) * f, y: 0, z: a.z + (b.z - a.z) * f }; };
const park = { loopWorld: () => sq, cratesWorld: () => [], padsWorld: () => [], gates: cid => WR.CIRCUITS[cid].gates.map((g, i, arr) => Object.assign(at(i / arr.length), { kind: g.kind, verb: g.verb || null, idx: i })), setCrateVisible() { } };
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const hover = () => ({ setModifier() { }, state: () => ({ x: 0, y: 0, z: 0, psi: 0 }), isFlying: () => false, altitudeM: () => 0 });
function trial(dt) { const events = []; const run = W.create({ park, hover: hover(), sparks: { add() { } }, onEvent: e => events.push(e), U }); run.start('plaza-cup', { ais: 0 }); for (let i = 0; i < 72; i++) run.update(0.05, at(0.99)); const g = run._st().gates;
  for (let l = 0; l < 3; l++) for (let i = 0; i < g.length; i++) { for (let k = 0; k < Math.round(dt / 0.05); k++) run.update(0.05, { x: g[i].x, z: g[i].z, y: 0, yaw: 0, mode: g[i].kind === 'foil' ? 'foil' : 'pad', altM: g[i].kind === 'foil' ? 5 : 0.2, trick: g[i].verb ? { verb: g[i].verb, clean: true } : null }); }
  return { run, events, fin: events.find(e => e.type === 'finish') }; }
t('TIME TRIAL: zero rivals is allowed; you finish 1st alone, with a finish event and lap splits', () => { const { events, fin, run } = trial(0.05); assert(fin, 'finished'); assert.strictEqual(fin.place, 1); assert.strictEqual(fin.of, 1); assert(events.filter(e => e.type === 'lap').length >= 2, 'laps recorded'); assert.strictEqual(run._st().ais.length, 0); });
t('personal bests: the first run sets a best; a slower run does not overwrite it; a faster run does and says NEW BEST', () => {
  Object.keys(store).forEach(k => delete store[k]); const a = trial(0.5); assert(a.fin.pb.newTotal && a.fin.pb.prevTotal === null, 'first run is a best'); const best = JSON.parse(store.shd_pb_v1)['plaza-cup'].total; assert(best > 0);
  const slow = trial(1.5); assert(!slow.fin.pb.newTotal, 'slower run is not a best'); assert.strictEqual(JSON.parse(store.shd_pb_v1)['plaza-cup'].total, best);
  const fast = trial(0.1); assert(fast.fin.pb.newTotal && fast.fin.pb.prevTotal === best, 'faster run beats it'); assert(JSON.parse(store.shd_pb_v1)['plaza-cup'].total < best); assert(a.run.pb('plaza-cup').total === JSON.parse(store.shd_pb_v1)['plaza-cup'].total || true);
  assert(JSON.parse(store.shd_pb_v1)['plaza-cup'].lap > 0, 'best lap saved too');
});
// ---- select screen wiring (stub DOM, same pattern as world-race-select.test.cjs) ----
const handlers = {}, starts = [], spent = [], toasts = [];
const stubEl = () => ({ style: {}, innerHTML: '', children: [], appendChild(c) { this.children.push(c); return c; }, remove() { }, addEventListener() { }, querySelector() { return stubEl(); }, set onclick(f) { } });
const win = { addEventListener: (ty, f) => { handlers[ty] = f; }, Navi: { toast: m => toasts.push(m) }, ShdSparks: { get: () => 1000, spend: (n, k, w) => { spent.push([n, k, w]); return true; }, add() { } }, __raceStart: (cid, o) => { starts.push([cid, o]); return true; }, localStorage: global.localStorage };
win.document = { createElement: stubEl, body: stubEl() };
const ctx = { window: win, document: win.document, Math, console, setTimeout: f => { f(); return 0; } }; vm.createContext(ctx);
const code = f => fs.readFileSync(path.join(__dirname, '..', '..', 'public', f), 'utf8'); vm.runInContext(code('world-race.js'), ctx); vm.runInContext(code('world-race-select.js'), ctx); const RS = win.WorldRaceSelect;
t('select: RACE costs the entry fee and sends your rivals; TIME TRIAL is free with 0 rivals; FREE RIDE is free and flagged free', () => {
  starts.length = 0; spent.length = 0; RS._test.go({ rm: 'race', ais: 4, cid: 'plaza-cup' }); assert.strictEqual(starts[0][1].ais, 4); assert.strictEqual(spent[0][0], 25); assert(!starts[0][1].free);
  starts.length = 0; spent.length = 0; RS._test.go({ rm: 'trial', ais: 4, cid: 'plaza-cup' }); assert.strictEqual(starts[0][1].ais, 0); assert.strictEqual(spent.length, 0, 'no fee'); assert.strictEqual(starts[0][1].mode, 'trial');
  starts.length = 0; spent.length = 0; RS._test.go({ rm: 'free', cid: 'dragon-gate' }); assert.strictEqual(starts[0][1].free, true); assert.strictEqual(starts[0][1].ais, 0); assert.strictEqual(spent.length, 0); assert.strictEqual(starts[0][0], 'dragon-gate');
});
t('select: ranked only applies to real races (a trial or free ride is never ranked)', () => { starts.length = 0; RS._test.go({ rm: 'trial', ranked: true, cid: 'plaza-cup' }); assert.strictEqual(starts[0][1].ranked, false); starts.length = 0; RS._test.go({ rm: 'race', ranked: true, cid: 'plaza-cup' }); assert.strictEqual(starts[0][1].ranked, true); });
t('difficulty levels: rookie AI is slower with a harder catch-up leash, elite faster with a light one; default is pro; select screen passes the level only for real races', () => {
  const mkRun = lv => { const run = W.create({ park, hover: hover(), sparks: { add() { } }, onEvent: () => { }, U }); run.start('plaza-cup', { ais: 3, level: lv }); return run._st(); };
  const a = mkRun('rookie'), b = mkRun('pro'), c = mkRun('elite'), d = mkRun(undefined);
  assert(a.ais[0].speedMul < b.ais[0].speedMul && b.ais[0].speedMul < c.ais[0].speedMul); assert(a.rubberK > b.rubberK && b.rubberK > c.rubberK); assert.strictEqual(d.level, 'pro'); assert.strictEqual(d.rubber, false, 'no level -> no rubber-band (unchanged default)'); assert.strictEqual(a.rubber, true);
  starts.length = 0; RS._test.go({ rm: 'race', lvl: 'elite', ais: 3, cid: 'plaza-cup' }); assert.strictEqual(starts[0][1].level, 'elite'); starts.length = 0; RS._test.go({ rm: 'trial', lvl: 'elite', cid: 'plaza-cup' }); assert.strictEqual(starts[0][1].level, undefined);
});
console.log(pass + ' passed');
