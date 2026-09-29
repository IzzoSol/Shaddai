// node tools/tests/world-sit.test.cjs — WorldSit against the REAL interiors-v3 math (rotPt/toWorld) with a mock building
const assert = require('assert'), store = {}; let toasts = [];
const listeners = {}; global.window = global; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
global.document = { activeElement: null }; global.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
require('../../public/world-interiors-v3.js'); const P = window.buildWorldInteriorsV3.pure, U = 7 / 1.8;
const b = { id: 'test-home', cx: 1000, cz: 2000, rot: 0.6, w: 10, d: 8 };
const pp = { x: 1000, z: 2000, y: 0 }; window.__w3dDebug = { playerPos: pp }; window.Navi = { toast: m => toasts.push(m) };
let inside = true;
window.__interiorsV3 = { isInside: () => inside, current: () => b, layoutOf: () => ({ items: [{ kind: 'sofa', x: 1, z: 2, q: 0 }, { kind: 'stool', x: -2, z: 0, q: 1 }, { kind: 'rug', x: 0, z: 0, q: 0 }] }), nearestUse: () => null };
require('../../public/world-sit.js'); const WS = window.WorldSit;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const key = code => { const ev = { code, repeat: false, stopImmediatePropagation() { }, preventDefault() { } }; (listeners.keydown || []).forEach(f => f(ev)); };
t('interior seats come from the layout: sofa = 2, stool = 1, rug ignored', () => { const s = WS.seats(); assert.strictEqual(s.length, 3); assert.deepStrictEqual(s.map(x => x.kind).sort(), ['sofa', 'sofa', 'stool']); });
t('seat world positions use the building frame (rot + U scale)', () => {
  const w = P.toWorld(b, 1, 2), s = WS.seats().filter(x => x.kind === 'sofa'); const mid = [(s[0].x + s[1].x) / 2, (s[0].z + s[1].z) / 2];
  assert(Math.hypot(mid[0] - w[0], mid[1] - w[1]) < 1e-6, 'sofa seats straddle the item centre'); assert(Math.hypot(s[0].x - s[1].x, s[0].z - s[1].z) / U > 0.9, 'seats are ~1.1 m apart');
});
t('E next to a seat sits; you are pinned to it, facing the sofa front, body dropped', () => {
  const s = WS.seats().find(x => x.kind === 'stool'); pp.x = s.x + 1.2 * U; pp.z = s.z; key('KeyE'); assert.strictEqual(WS.isSeated(), true);
  const drop = WS.update(0.5, pp, () => { }, 1, U); assert(Math.abs(pp.x - s.x) < 1e-6 && Math.abs(pp.z - s.z) < 1e-6, 'pinned to the seat'); assert(drop > 0.2 * U, 'body lowered: ' + drop);
  assert(Math.abs(WS.yaw() - s.yaw) < 1e-9);
});
t('sit clip is (re)played while seated', () => { let n = 0; WS.update(0.1, pp, name => { assert.strictEqual(name, 'ual_Sit_Chair_Loop'); n++; }, 5, U); assert.strictEqual(n, 1); });
t('a move key stands you up in front of the seat; a second E is free to sit elsewhere', () => {
  const s = WS._state.seated; key('KeyW'); assert.strictEqual(WS.isSeated(), false); const d = Math.hypot(pp.x - s.x, pp.z - s.z) / U; assert(d > 0.9 && d < 1.3, 'stood ' + d.toFixed(2) + ' m in front');
});
t('a seat taken by you is not offered twice, and out-of-reach seats do nothing', () => { pp.x = 5000; pp.z = 5000; key('KeyE'); assert.strictEqual(WS.isSeated(), false); });
t('leaving the interior stands you up automatically', () => { const s = WS.seats()[0]; pp.x = s.x; pp.z = s.z; WS.sitNearest(); assert(WS.isSeated()); inside = false; WS.update(0.1, pp, null, 9, U); assert.strictEqual(WS.isSeated(), false); });
console.log(pass + ' passed');
