const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
const canvasStub = { getContext: () => ({ fillRect() { }, strokeRect() { }, fillText() { }, fillStyle: '', strokeStyle: '' }), width: 0, height: 0 };
const store = {}; let sparks = 0;
const ctx = { console, THREE, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, document: { createElement: () => Object.assign({}, canvasStub), body: { appendChild() { } } }, ShdSparks: { get: () => sparks, spend: n => { if (sparks < n) return false; sparks -= n; return true; } } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-skydock.js', 'utf8'), ctx);
const D = ctx.WorldSkyDock, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
t('ship upgrades: 3 levels each, escalating cost, refuse without Sparks, multipliers stack per level', () => {
  assert(!D.upgrade('engine').ok); sparks = 5000; assert(D.upgrade('engine').ok && sparks === 4700 && D.level('engine') === 1); assert(D.upgrade('engine').ok && sparks === 4000); assert(D.upgrade('engine').ok && sparks === 2500); assert(!D.upgrade('engine').ok && /maxed/.test(D.upgrade('engine').msg));
  D.upgrade('handling'); D.upgrade('hull'); const m = D.mult(); assert(Math.abs(m.speed - 1.18) < 1e-9 && Math.abs(m.turn - 1.08) < 1e-9 && m.hull === 10); assert(!D.upgrade('nope').ok);
});
t('upgrades persist', () => { assert.strictEqual(JSON.parse(store.shd_dock_v1).lv.engine, 3); });
t('4 launch pads on a ring facing OUTWARD, 90 degrees apart', () => {
  const p = D.padLayout({ x: 100, z: -50, y: 200 }, 100, 0); assert.strictEqual(p.length, 4); p.forEach((q, i) => { assert(Math.abs(Math.hypot(q.x - 100, q.z + 50) - 100) < 1e-6 && q.y === 200); const out = Math.atan2(q.x - 100, q.z + 50); assert(Math.abs(Math.cos(out - q.yaw) - 1) < 1e-9, 'pad ' + i + ' faces outward'); });
  assert(Math.abs(p[1].x - p[0].x) > 1);
});
t('launch picks the priciest owned FLYING ride and ignores ground mounts', () => {
  const defs = { bull: { id: 'bull', flying: false, price: 900 }, hawk: { id: 'hawk', flying: true, price: 800 }, skiff: { id: 'skiff', flying: true, price: 2200 } };
  assert.strictEqual(D.pickRide([{ id: 'bull' }, { id: 'hawk' }, { id: 'skiff' }], i => defs[i]), 'skiff'); assert.strictEqual(D.pickRide([{ id: 'bull' }], i => defs[i]), null); assert.strictEqual(D.pickRide([], i => defs[i]), null);
});
t('dock builds on the anchor height with 4 pads + a vendor kiosk whose sign faces the lift side and has a back plane (no mirrored text)', () => {
  const scene = new THREE.Scene(), dock = D.build({ THREE, scene, anchor: { x: 0, z: 0, y: 200 * 1 }, getPlayer: () => ({ pos: { x: 0, y: 200, z: 0 } }) });
  assert(scene.children.includes(dock.group) && dock.pads.length === 4); assert(dock.pads.every(p => Math.hypot(p.x, p.z) < 144), 'pads sit on the 144-unit deck'); assert(Math.hypot(dock.vendor.x, dock.vendor.z) < 144); assert(dock.pads.every(p => p.y === 200)); const kiosk = dock.group.children[dock.group.children.length - 1]; assert(Math.abs(kiosk.position.y - 200) < 1e-9);
  const signs = []; kiosk.traverse(o => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') signs.push(o); }); assert.strictEqual(signs.length, 2, 'front + back'); assert(signs.every(s => s.material.side === THREE.FrontSide)); assert(Math.abs(Math.abs(signs[0].rotation.y - signs[1].rotation.y) - Math.PI) < 1e-9);
  const toAnchor = Math.atan2(-dock.vendor.x, -dock.vendor.z); assert(Math.abs(Math.cos(kiosk.rotation.y - toAnchor) - 1) < 1e-9, 'sign faces the anchor');
  dock.update(0.5); dock.dispose(); assert(!scene.children.includes(dock.group));
});
console.log(pass + ' passed');
