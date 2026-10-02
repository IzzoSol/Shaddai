const vm = require('vm'), fs = require('fs'), assert = require('assert');
const THREE = require('../ual/node_modules/three/build/three.cjs');
function mkEl() { const dummy = () => ({ style: {}, innerHTML: '', textContent: '', dataset: {}, onclick: null, remove() { }, querySelector: () => dummy(), addEventListener() { }, appendChild() { }, closest: () => null }); const e = Object.assign(dummy(), { querySelector: () => shared, addEventListener() { } }); return e; }
const shared = { style: {}, innerHTML: '', textContent: '', onclick: null, remove() { }, querySelector: () => shared };
const store = {}, adds = [];
const ctx = { console, THREE, Date, performance, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v }, document: { createElement: () => mkEl(), body: { appendChild() { } }, activeElement: null }, addEventListener() { }, removeEventListener() { }, ShdSparks: { add: (n) => adds.push(n) }, __hitfx: { hit() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['world-naval.js', 'world-naval-view.js']) vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), ctx);
const U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
function mkArena() { const root = new THREE.Group(); root.scale.setScalar(U); root.position.set(12000, 0, 0); root.updateMatrixWorld(true); const floors = { autoBattle: true, state: { mode: null } }; return { root, dims: { A: 62, B: 44 }, floors, fields: [], setField(m) { this.fields.push(m); floors.state.mode = m; } }; }
function mk() { const arena = mkArena(), scene = new THREE.Scene(); scene.add(arena.root); let entered = 0; const N = ctx.WorldNavalGame.create({ THREE, getArena: () => arena, enter: () => entered++ }); return { N, arena, scene, entered: () => entered }; }

t('start builds boats, switches the field to water, stops the auto-battle galleys, blocks walking; stop undoes all of it', () => {
  const { N, arena, entered } = mk(); assert(N.start({ mode: 'fleet', cls: 'galleon' })); assert(N.active()); assert.strictEqual(entered(), 1); assert.strictEqual(arena.floors.autoBattle, false); assert(arena.fields.includes('water')); assert.strictEqual(ctx.__noWalk, true);
  const grp = arena.root.getObjectByName('naval-play'); assert(grp && grp.children.length === N.game().state().boats.length, 'one mesh per boat');
  N.stop(); assert(!N.active()); assert.strictEqual(arena.floors.autoBattle, true); assert.strictEqual(ctx.__noWalk, false); assert(!arena.root.getObjectByName('naval-play'));
});
t('every mode and boat class starts with the right crew and builds without errors', () => {
  const { N } = mk(); ['fleet', 'hunt', 'salvage'].forEach(m => ['galleon', 'skimmer', 'nautilus'].forEach(c => { assert(N.start({ mode: m, cls: c }), m + c); const b = N.game().state().boats; assert(b.length >= 3 && b[0].id === 'you' && b[0].cls === c); for (let i = 0; i < 40; i++) N.update(0.05); N.stop(); }));
});
t('meshes follow the sim; sunk boats disappear; the camera sits on YOUR bow in world space (island at x=12000)', () => {
  const { N, arena } = mk(); N.start({ mode: 'fleet', cls: 'skimmer' }); const g = N.game(), me = g.boat('you'); me.x = 10; me.z = -8; me.psi = 0; N.update(0.001);
  const grp = arena.root.getObjectByName('naval-play'), mesh = grp.children[0]; assert(Math.abs(mesh.position.x - me.x) < 1.5 && Math.abs(mesh.position.z - me.z) < 1.5);
  const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 5000); N.applyCamera(cam); cam.updateMatrixWorld(true); const worldX = 12000 + me.x * U; assert(Math.abs(cam.position.x - worldX) < 4 * U, 'camera x ' + cam.position.x + ' vs ' + worldX); assert(cam.position.y > 0.7 * U && cam.position.y < 6 * U);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir); assert(dir.z > 0.9, 'looking along the heading (+z)');
  const foe = g.state().boats.find(b => b.team === 'B'); foe.alive = false; N.update(0.05); assert.strictEqual(grp.children.find(c => c === arena.root.getObjectByName('naval-play').children[g.state().boats.indexOf(foe)]).visible, false);
  N.stop();
});
t('keys drive the boat (W throttle, D turns starboard) and the sim reads them', () => {
  const { N } = mk(); N.start({ mode: 'fleet', cls: 'skimmer' }); let handler; const g = N.game(); const me = g.boat('you'); me.x = 0; me.z = -30; me.psi = 0;
  const calls = []; ctx.addEventListener = (ev, f) => { if (ev === 'keydown') handler = f; }; N.stop(); N.start({ mode: 'fleet', cls: 'skimmer' }); const g2 = N.game(), m2 = g2.boat('you'); m2.x = 0; m2.z = -30; m2.psi = 0;
  handler({ code: 'KeyW', type: 'keydown', preventDefault() { }, stopPropagation() { } }); handler({ code: 'KeyD', type: 'keydown', preventDefault() { }, stopPropagation() { } }); for (let i = 0; i < 30; i++) N.update(0.05);
  assert(m2.v > 2, 'moving ' + m2.v); assert(m2.psi < 0, 'D = starboard = psi decreasing (west of south is... turn to the right when facing +z)'); N.stop(); ctx.addEventListener = () => { };
});
t('rewards: Sparks are granted but capped at 250/day, then 0', () => {
  const { N } = mk(); assert.strictEqual(N._dayReward(), 0); assert.strictEqual(N._reward(100), 100); assert.strictEqual(N._reward(200), 150); assert.strictEqual(N._reward(50), 0); assert.deepStrictEqual(adds, [100, 150]); assert.strictEqual(N._dayReward(), 250);
});
t('a full AI-vs-AI fleet match with the player idling runs to the end without errors and pays the loser a small amount', () => {
  const { N } = mk(); store.shd_naval_day_v1 = JSON.stringify({ d: new Date().toISOString().slice(0, 10), n: 0 }); adds.length = 0; N.start({ mode: 'fleet', cls: 'galleon' }); for (let i = 0; i < 20 * 400 && !N.game().state().over; i++) N.update(0.05); assert(N.game().state().over, 'match ended');
  assert(adds.length === 1 && adds[0] >= 8, 'reward ' + adds); N.stop();
});
console.log(pass + ' passed');
