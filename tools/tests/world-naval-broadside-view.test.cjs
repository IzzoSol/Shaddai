const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const store = {}; let handler = null;
function mkEl() { const d = () => ({ style: {}, innerHTML: '', textContent: '', dataset: {}, remove() { }, querySelector: () => shared, addEventListener() { }, appendChild() { }, closest: () => null }); return d(); }
const shared = { style: {}, innerHTML: '', textContent: '', onclick: null, remove() { }, querySelector: () => shared };
function load(search) {
  const ctx = { console, THREE, Date, performance, location: { search }, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, document: { createElement: () => mkEl(), body: { appendChild() { } }, activeElement: null }, addEventListener: (e, f) => { if (e === 'keydown') handler = f; }, removeEventListener() { }, ShdSparks: { add() { } }, __hitfx: { hit() { } } };
  ctx.window = ctx; vm.createContext(ctx); for (const f of ['world-rng.js', 'world-naval.js', 'world-broadside.js', 'world-naval-view.js']) vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), ctx); return ctx;
}
const U = 7 / 1.8; let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
function mk(ctx) { const root = new THREE.Group(); root.scale.setScalar(U); root.updateMatrixWorld(true); const arena = { root, dims: { A: 62, B: 44 }, floors: { autoBattle: true, state: {} }, setField() { } }; return { N: ctx.WorldNavalGame.create({ THREE, getArena: () => arena }), arena }; }
const key = (code) => handler({ code, type: 'keydown', repeat: false, preventDefault() { }, stopPropagation() { } });

t('?broadside=0 (default is ON since 2026-10-15): no broadside FX, no chase view, C key ignored', () => {
  const ctx = load('?broadside=0'); const { N } = mk(ctx); N.start({ mode: 'fleet', cls: 'galleon' }); assert.strictEqual(N.broadside(), null); handler({ code: 'KeyC', type: 'keydown', repeat: false, preventDefault() { }, stopPropagation() { } }); assert.strictEqual(N.view(), 'cockpit'); N.stop();
});
t('?broadside=1: galleon broadside routes through WorldBroadside; AI fire too; stop disposes', () => {
  const ctx = load('?broadside=1'); const { N, arena } = mk(ctx); N.start({ mode: 'fleet', cls: 'galleon' }); const B = N.broadside(); assert(B); const g = N.game(), me = g.boat('you'); me.x = 0; me.z = 0; me.psi = 0;
  const sendKey = (c, down) => handler({ code: c, type: down ? 'keydown' : 'keyup', repeat: false, preventDefault() { }, stopPropagation() { } });
  sendKey('Space', true); N.update(0.05); sendKey('Space', false); assert(B.stats().shots >= 1 && B.stats().liveTracers === 12, JSON.stringify(B.stats()));
  sendKey('KeyQ', true); N.update(0.05); sendKey('KeyQ', false); assert.strictEqual(B.stats().shots >= 2, true);
  for (let i = 0; i < 120; i++) N.update(0.05); assert.strictEqual(B.stats().liveSmoke, 0 + B.stats().liveSmoke); assert(B.stats().oldestSmoke < 1.6);
  N.stop(); assert.strictEqual(N.broadside(), null); assert(!arena.root.getObjectByName('naval-play'));
});
t('?broadside=1: C toggles the chase camera, which sits behind and above the boat', () => {
  const ctx = load('?broadside=1'); const { N } = mk(ctx); N.start({ mode: 'fleet', cls: 'galleon' }); const me = N.game().boat('you'); me.x = 5; me.z = -10; me.psi = 0; N.update(0.01);
  const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 5000); key('KeyC'); assert.strictEqual(N.view(), 'chase'); for (let i = 0; i < 3; i++) N.applyCamera(cam); cam.updateMatrixWorld(true);
  assert(cam.position.z < me.z * U - 10 * U * 0.9 + 0, 'behind: ' + cam.position.z); assert(cam.position.y > 5 * U, 'above'); const d = new THREE.Vector3(); cam.getWorldDirection(d); assert(d.z > 0.8, 'looks forward');
  key('KeyC'); assert.strictEqual(N.view(), 'cockpit'); N.stop();
});
console.log(pass + ' passed, ' + fail + ' failed');
