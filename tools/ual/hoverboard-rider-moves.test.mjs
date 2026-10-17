// node tools/ual/hoverboard-rider-moves.test.mjs — RIDER MOVES on the hoverboard with a REAL rigged agent (NEXUS.glb, SkeletonUtils clone):
// surf stance + pop / land / boost tuck / wall-ride hand / bail and the league actions carry / shoot / bolt / ram / stun all pose real bones
// (finite, distinct from each other), and the league drives real agent bot riders through world-hoverboard instances.
import * as THREE from 'three';
import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
function el() { const e = { style: { setProperty() {} }, dataset: {}, children: [], innerHTML: '', textContent: '', width: 0, height: 0, getContext: () => ctx2d, appendChild(c) { this.children.push(c); return c; }, remove() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return e._q || (e._q = el()); }, querySelectorAll() { return []; } }; return e; }
globalThis.window = globalThis; globalThis.document = { createElement: el, body: el(), addEventListener() {}, removeEventListener() {} }; globalThis.location = { search: '' };
globalThis.fetch = async (url) => ({ json: async () => JSON.parse(fs.readFileSync(new URL('../../public' + url, import.meta.url), 'utf8')) });
globalThis.THREE = THREE; globalThis.self = globalThis;
globalThis.Image = class { constructor() { this.width = 1; this.height = 1; } addEventListener(t, f) { if (t === 'load') setTimeout(() => f({ target: this }), 0); } removeEventListener() {} set src(v) { this._s = v; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } };
for (const f of ['world-actions.js', 'world-hoverboards.js', 'world-hoverboard-wallride.js', 'world-hoverboard.js', 'world-hoverleague-core.js', 'world-colosseum-hoverleague.js']) { try { require('../../public/' + f); } catch (e) { console.log('  (load ' + f + ': ' + e.message + ')'); } }
const gl = new GL(); gl.setMeshoptDecoder(MeshoptDecoder);
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url.split('?')[0], import.meta.url)); } catch (e) { return err(e); } gl.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
const loadAgent = (code) => new Promise((res, rej) => new Loader().load('/assets/agents/' + code + '.glb', res, null, rej));
let pass = 0, fail = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', String(e.stack).split('\n').slice(0, 3).join('\n       ')); } };
const U = 7 / 1.8, scene = new THREE.Scene();

function rider(heightAt) {
  const own = new THREE.Vector3(); const hb = window.buildWorldHoverboard({ THREE, scene, loader: new Loader(), playerPos: own, heightAt: heightAt || (() => 0), colliders: () => [] });
  return hb;
}
function snap(av) { const out = []; av.traverse((b) => { if (b.isBone) out.push(b.quaternion.clone()); }); return out; }
function diff(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += 1 - Math.abs(a[i].dot(b[i])); return d; }
function finite(av) { let ok = true; av.traverse((b) => { if (b.isBone) [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].forEach((v) => { if (!Number.isFinite(v)) ok = false; }); }); return ok; }

const g0 = await loadAgent('NEXUS'), av = cloneSkinned(g0.scene); scene.add(av);
const box = new THREE.Box3().setFromObject(av), sz = new THREE.Vector3(); box.getSize(sz); av.scale.multiplyScalar(7 / (sz.y || 1));
const hb = rider(); const S = hb.state();
await t('NEXUS mounts a board; the surf stance poses real bones', async () => {
  let bones = 0; av.traverse((b) => { if (b.isBone) bones++; }); assert(bones > 15, 'bones ' + bones);
  const rest = snap(av); hb.mount(av, { yaw: 0 }); for (let i = 0; i < 40; i++) { S.t += 1 / 60; hb.pose(1 / 60, { showRider: true }); }
  assert(finite(av)); assert(diff(rest, snap(av)) > 0.05, 'stance changed bones');
});
const base = (() => { for (let i = 0; i < 30; i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); } return snap(av); })();
async function move(name, setup, frames, teardown) {
  await t('move: ' + name + ' poses differently from the stance (finite bones)', async () => {
    setup(); let maxD = 0; for (let i = 0; i < (frames || 12); i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); maxD = Math.max(maxD, diff(base, snap(av))); }
    assert(finite(av), 'NaN bones'); assert(maxD > 0.01, name + ' delta ' + maxD.toFixed(4)); if (teardown) teardown(); for (let i = 0; i < 40; i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); }
  });
}
await move('pop (jump take-off)', () => { S.air = true; }, 10, () => { S.air = false; });
await move('land (absorb)', () => { S.air = true; hb.pose(1 / 60, {}); S.air = false; }, 8);
await move('boost tuck', () => { S.v = hb.tune.boostMS || 30; }, 20, () => { S.v = 0; });
await move('wall-ride hand drag', () => { S.wallriding = true; S.wallRoll = 1.1; }, 20, () => { S.wallriding = false; S.wallRoll = 0; });
await move('bail flail', () => { S.bail = hb.tune.bailTime || 0.8; }, 10, () => { S.bail = 0; });
await move('carry energy ball', () => hb.setAction('carry-on'), 20, () => hb.setAction('carry-off'));
await move('shoot (throw)', () => hb.setAction('shoot'), 24);
await move('bolt (punch)', () => hb.setAction('bolt'), 20);
await move('ram (shoulder charge)', () => hb.setAction('ram'), 20);
await move('stun (flinch)', () => hb.setAction('stun', 0.7), 20);
await t('actions are distinct from each other (shoot vs bolt vs carry)', async () => {
  const shot = (k) => { if (k === 'carry') hb.setAction('carry-on'); else hb.setAction(k); for (let i = 0; i < 12; i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); } const q = snap(av); hb.setAction('carry-off'); for (let i = 0; i < 50; i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); } return q; };
  const a = shot('shoot'), b = shot('bolt'), c = shot('carry'); assert(diff(a, b) > 0.01 && diff(b, c) > 0.01 && diff(a, c) > 0.01);
});
await t('league: bots are real rigged agents on board rigs; events drive their actions', async () => {
  const g = new THREE.Group(); scene.add(g); const aroot = new THREE.Group(); aroot.scale.setScalar(U); g.position.set(12000, 0, 0); g.add(aroot); scene.updateMatrixWorld(true);
  const arena = { root: aroot, group: g, floors: { clear() {} }, setCrowdMood() {} };
  const ps = { x: 12000, y: 0, z: 0, psi: 0, v: 0, air: false };
  const player = { state: () => ps, velocity: () => ({ x: 0, z: 0 }), heading: () => 0, setModifier() {}, setAction() {}, wallride: { setWalls() {} } };
  const codes = ['NEXUS', 'ORACLE', 'PIKADON']; let made = 0;
  window.__rideBoard = () => true;
  const HL = window.HoverLeague.create({ THREE, GLTFLoader: Loader, getArena: () => arena, isInside: () => true, getHover: () => player, getPlayerPos: () => new THREE.Vector3(),
    makeBotRider: async (i) => { const gg = await loadAgent(codes[i % 3]); const a = cloneSkinned(gg.scene); scene.add(a); made++; return { hover: rider((x, z) => { const h = HL.heightAtWorld(x, z); return Number.isFinite(h) ? h : 0; }), avatar: a }; } });
  await HL.start({ mode: 'league', ball: 'shaddai', size: 2 }); await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(made, 3); assert.strictEqual(Object.keys(HL._view().riders).length, 3);
  const game = HL.game(); game.state.wait = 0; let acts = 0;
  for (let i = 0; i < 60 * 40; i++) { HL.update(1 / 60); Object.values(HL._view().riders).forEach((r) => { const a = r.hover.action(); if (a.kind || a.carry) acts++; }); }
  Object.values(HL._view().riders).forEach((r) => { assert(finite(r.avatar), 'bot bones finite'); const p = r.hover.board.position; assert(Number.isFinite(p.x) && Math.abs(p.x - 12000) < 70 * U, 'board in arena'); });
  assert(acts > 50, 'bot riders performed actions: ' + acts);
  HL.stop(true); let left = 0; scene.traverse((c) => { if (c.name === 'hover-league') left++; }); assert.strictEqual(left, 0);
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
