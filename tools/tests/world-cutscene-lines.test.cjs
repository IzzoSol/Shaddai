// node tools/tests/world-cutscene-lines.test.cjs — tunnel lines: Colosseum metro -> Reef (undersea) + Void Undercroft (gas mask rule)
const assert = require('assert');
const els = []; const mk = () => { const e = { style: {}, innerHTML: '', children: [], parentNode: null, querySelector: () => null, addEventListener() {}, appendChild(c) { c.parentNode = e; e.children.push(c); return c; }, removeChild(c) { c.parentNode = null; } }; els.push(e); return e; };
global.window = global; global.location = { search: '' }; global.document = { body: mk(), createElement: mk, addEventListener() {} };
let ivs = []; global.setInterval = (fn) => { ivs.push(fn); return ivs.length; }; global.clearInterval = (i) => { ivs[i - 1] = null; };
const tos = []; global.setTimeout = (fn) => { tos.push(fn); return 1; }; global.requestAnimationFrame = (fn) => fn();
const toasts = []; global.Navi = { toast: (m) => toasts.push(m) };
const perks = {}; global.ShdInv = { perk: (k) => perks[k] };
require('../../public/world-cutscene-travel.js'); const C = global.WorldCutsceneTravel;
const U = 7 / 1.8; let pos = { x: 0, z: 0 }; const tele = [];
C.init({ getPos: () => pos, teleport: (x, z) => { pos = { x, z }; tele.push([x, z]); }, enter() {}, exit() {}, inside: () => false,
  layout: { stations: [{ id: 'central', pos: [0, 700] }, { id: 'harbor', pos: [-2000, -2000] }, { id: 'rift', pos: [0, -2800 * U] }] }, reef: () => ({ x: -9000, z: 9000 }) });
global.COLOSSEUM_ISLAND = { x: 0, z: 12000, U }; global.COLOSSEUM_METRO = { metroPad: [156, 100] };
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const tick = () => ivs.slice().forEach((f) => f && f());
t('Colosseum metro reaches Central, Harbor, Reef (undersea) and the Void Undercroft; void returns only to the Colosseum', () => {
  assert.deepStrictEqual(C._lines.colosseum, ['shore', 'central', 'harbor', 'reef', 'void']);
  // 2026-10-16 reef line: shore <-> Colosseum subway is the maglev; Reef A <-> Reef B and either reef <-> shore are undersea
  assert.ok(C._lines.shore.includes('colosseum') && C._lines.reef.includes('reef2') && C._lines.reef2.includes('shore'));
  assert.strictEqual(C._style('shore', 'colosseum'), 'rail'); assert.strictEqual(C._style('reef2', 'shore'), 'water'); assert.strictEqual(C._style('reef', 'reef2'), 'water'); assert.deepStrictEqual(C._lines.void, ['colosseum']);
  assert.strictEqual(C._style('colosseum', 'reef'), 'water'); assert.strictEqual(C._style('colosseum', 'void'), 'void'); assert.strictEqual(C._style('colosseum', 'central'), 'rail');
});
t('Void Undercroft sits 150 m beyond Rift Gate Station (outward), flagged toxic', () => {
  const v = C._zones().find((z) => z.id === 'void'); assert(v && v.toxic);
  assert(Math.abs(v.x) < 1e-6); assert(Math.abs(v.z - (-2800 * U - 150 * U)) < 1e-6);
});
t('no gas mask: countdown, then auto-evacuation to the Colosseum', () => {
  const v = C._zones().find((z) => z.id === 'void'); pos = { x: v.x, z: v.z }; ivs = []; tos.length = 0;
  C._toxic(v);
  for (let i = 0; i < C.TOXIC_S; i++) tick();
  tos.slice().forEach((f) => f()); tos.slice().forEach((f) => f());     // run the cutscene timers
  const last = tele[tele.length - 1]; assert(last, 'teleported'); assert(Math.hypot(last[0] - 156 * U, last[1] - (12000 + 100 * U)) < 1, 'back at the Colosseum metro pad');
});
t('with the Void Respirator perk: no countdown', () => {
  perks['mask-gas'] = 1; ivs = []; const n = toasts.length; C._toxic(C._zones().find((z) => z.id === 'void'));
  assert.strictEqual(ivs.filter(Boolean).length, 0); assert(/mask sealed/i.test(toasts[toasts.length - 1]));
});
console.log(`${pass} passed, 0 failed`);
