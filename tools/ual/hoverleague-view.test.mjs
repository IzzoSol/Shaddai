// node tools/ual/hoverleague-view.test.mjs — HOVER LEAGUE view + host glue (REAL three, REAL K26 GLB, stub DOM): build the field in a
// scaled arena root, play a 2v2 match against a scripted board, check ground/walls/ball looks/HUD/cleanup.
import * as THREE from 'three';
import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// ── stub DOM (enough for the HUD + canvas floor) ──
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
function el() { const e = { style: { setProperty() {} }, dataset: {}, children: [], innerHTML: '', textContent: '', width: 0, height: 0,
  getContext: () => ctx2d, appendChild(c) { this.children.push(c); return c; }, remove() { e.removed = true; }, addEventListener() {}, removeEventListener() {},
  querySelector() { return e._q || (e._q = el()); }, querySelectorAll() { return []; }, closest() { return null; } }; return e; }
globalThis.window = globalThis; globalThis.document = { createElement: el, body: el(), addEventListener() {}, removeEventListener() {} };
globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(fs.readFileSync(new URL('../../public' + url, import.meta.url), 'utf8')) });
require('../../public/world-hoverboards.js'); require('../../public/world-hoverleague-core.js'); require('../../public/world-colosseum-hoverleague.js');
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url, import.meta.url)); } catch (e) { return err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
let pass = 0, fail = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); } };

const U = 7 / 1.8, scene = new THREE.Scene(), group = new THREE.Group(); group.position.set(12000, 0, 0); scene.add(group);
const aroot = new THREE.Group(); aroot.scale.setScalar(U); group.add(aroot); scene.updateMatrixWorld(true);
const arena = { root: aroot, group, floors: { clear() { arena.cleared = true; } }, setCrowdMood() {} };
const S = { x: 0, y: 0, z: 0, psi: 0, v: 0, air: false };
let walls = [], mods = [];
const hover = { state: () => S, velocity: () => ({ x: Math.sin(S.psi) * S.v * U, z: Math.cos(S.psi) * S.v * U }), heading: () => S.psi, setModifier: (m) => mods.push(m), wallride: { setWalls: (w) => { walls = w; } } };
const playerPos = new THREE.Vector3();
window.__rideBoard = () => true;
const HL = window.HoverLeague.create({ THREE, GLTFLoader: Loader, getArena: () => arena, isInside: () => true, getHover: () => hover, getPlayerPos: () => playerPos });

await t('starts a 2v2 league match inside the arena (K26 kit, bots, HUD, walls)', async () => {
  const ok = await HL.start({ mode: 'league', ball: 'void', size: 2, seed: 7 }); assert.strictEqual(ok, true); assert(HL.active()); assert(arena.cleared, 'other floors cleared');
  const v = HL._view(); assert(v.group.parent === aroot); assert.strictEqual(Object.keys(v.bots).length, 3); assert(v.pads.length === 22 && v.ups.length === 4);
  let goals = 0; v.group.traverse((c) => { if (c.name === 'hl_goal_hoop') goals++; }); assert.strictEqual(goals, 2, 'two Blender goals');
  assert(walls.length > 40, 'rim wall-ride faces handed to the board'); assert(walls[0].x0 > 11000, 'walls in WORLD units');
});
await t('board ground: flat field, quarter-pipe at the rim, NaN outside (world units)', async () => {
  assert(Math.abs(HL.heightAtWorld(12000, 0)) < 1e-6);
  const rim = HL.heightAtWorld(12000 + (62 - 0.5) * U, 0); assert(rim > 5 * U, 'rim ' + rim / U);
  assert(Number.isNaN(HL.heightAtWorld(12000 + 70 * U, 0)));
});
await t('void ball: energy shader + crystal shards; tick animates', async () => {
  const b = HL._view().ball; let shader = 0, inst = 0; b.traverse((c) => { if (c.material && c.material.isShaderMaterial) shader++; if (c.isInstancedMesh) inst++; }); assert(shader >= 2 && inst === 1);
  b.userData.tick(0.016, 1.0);
});
await t('plays 90 s: player rides through the ball, shoots with F, bots score, HUD + paint stay sane', async () => {
  const g = HL.game(); g.state.wait = 0;
  let shots = 0, grabbed = false;
  for (let i = 0; i < 60 * 90; i++) {
    const b = g.state.ball, lp = new THREE.Vector3(S.x, 0, S.z); aroot.worldToLocal(lp);
    const dx = b.x - lp.x, dz = b.z - lp.z; S.psi = g.state.ball.holder === 'you' ? -Math.PI / 2 : Math.atan2(dx, dz); S.v = 14;
    const nl = new THREE.Vector3(lp.x + Math.sin(S.psi) * S.v / 60, 0, lp.z + Math.cos(S.psi) * S.v / 60); aroot.localToWorld(nl); S.x = nl.x; S.z = nl.z;
    if (g.state.ball.holder === 'you') grabbed = true;
    if (g.state.ball.holder === 'you' && lp.x < -25) { g.attack('you'); shots++; }
    HL.update(1 / 60);
  }
  assert(grabbed, 'player picked the ball up'); assert(shots > 0, 'player shot');
  assert(g.state.score.cyon + g.state.score.magma > 0, 'someone scored'); assert(mods.length > 100, 'board modifiers driven');
  console.log('       score', JSON.stringify(g.state.score), 'player shots', shots);
});
await t('paint mode: ball hidden, floor paints, % HUD', async () => {
  await HL.start({ mode: 'paint', ball: 'solar', size: 1 }); const g = HL.game(); g.state.wait = 0; assert(!HL._view().ball.visible);
  for (let i = 0; i < 60 * 10; i++) { S.psi = 1.2; S.v = 12; S.x += Math.sin(S.psi) * 0.2 * U; S.z += Math.cos(S.psi) * 0.2 * U; if (Math.hypot((S.x - 12000) / U, S.z / U) > 40) { S.x = 12000; S.z = 0; } HL.update(1 / 60); }
  assert(g.state.paint.cyon > 10 && g.state.paint.magma > 10, JSON.stringify(g.state.paint));
});
await t('stop(): removes the field, restores walls, frees the HUD', async () => {
  HL.stop(true); assert(!HL.active()); let left = 0; aroot.traverse((c) => { if (c.name === 'hover-league') left++; }); assert.strictEqual(left, 0); assert(Array.isArray(walls));
});
for (const k of ['shaddai', 'regular', 'plasma', 'inferno', 'solar']) await t('ball look builds: ' + k, async () => { await HL.start({ mode: 'league', ball: k, size: 1 }); HL._view().ball.userData.tick(0.016, 2); HL.stop(true); });
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
