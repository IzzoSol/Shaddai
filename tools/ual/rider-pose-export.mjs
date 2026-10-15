// node tools/ual/rider-pose-export.mjs <out.obj> [AGENT] - posed rider+board OBJ per move (stance/pop/boost/wall/carry/shoot/bolt/ram/stun) for the Blender clay contact sheet
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
const U = 7 / 1.8, scene = new THREE.Scene();

function rider(heightAt) {
  const own = new THREE.Vector3(); const hb = window.buildWorldHoverboard({ THREE, scene, loader: new Loader(), playerPos: own, heightAt: heightAt || (() => 0), colliders: () => [] });
  return hb;
}
function snap(av) { const out = []; av.traverse((b) => { if (b.isBone) out.push(b.quaternion.clone()); }); return out; }
function diff(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += 1 - Math.abs(a[i].dot(b[i])); return d; }
function finite(av) { let ok = true; av.traverse((b) => { if (b.isBone) [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].forEach((v) => { if (!Number.isFinite(v)) ok = false; }); }); return ok; }
// export each move as one OBJ (posed skinned agent + board), laid out in a row, for the Blender clay contact sheet
const OUT = process.argv[2]; const g0 = await loadAgent(process.argv[3] || 'NEXUS'), av = cloneSkinned(g0.scene); scene.add(av);
av.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(av, true), sz = new THREE.Vector3(); bx.getSize(sz); av.scale.multiplyScalar(7 / (sz.y || 1));
const hb = rider(); const S = hb.state(); hb.mount(av, { yaw: 0 });
if (hb.setStyle) hb.setStyle('bluejet');
const moves = [['stance', () => {}], ['pop', () => { S.air = true; }], ['boost', () => { S.v = hb.tune.boostMS || 30; }], ['wall', () => { S.wallriding = true; S.wallRoll = 1.1; }],
  ['carry', () => hb.setAction('carry-on')], ['shoot', () => hb.setAction('shoot')], ['bolt', () => hb.setAction('bolt')], ['ram', () => hb.setAction('ram')], ['stun', () => hb.setAction('stun', 0.7)]];
const reset = () => { S.air = false; S.v = 0; S.wallriding = false; S.wallRoll = 0; hb.setAction('carry-off'); for (let i = 0; i < 90; i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); } };
const frames = { stance: 30, pop: 14, boost: 30, wall: 30, carry: 30, shoot: 22, bolt: 9, ram: 15, stun: 6 };
let obj = '', vo = 1; const v = new THREE.Vector3();
function dump(root, dx, name) {
  obj += 'o ' + name + '\n'; root.updateMatrixWorld(true); root.traverse((m) => { if (m.isSkinnedMesh) m.skeleton.update(); });
  root.traverse((m) => { if (!m.isMesh || !m.visible) return; const p = m.geometry.attributes.position, idx = m.geometry.index; if (!p) return;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (m.isSkinnedMesh) m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); obj += `v ${(v.x / U + dx).toFixed(4)} ${(v.y / U).toFixed(4)} ${(v.z / U).toFixed(4)}\n`; }
    const n = idx ? idx.count : p.count; for (let i = 0; i < n; i += 3) { const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2; obj += `f ${a + vo} ${b + vo} ${c + vo}\n`; } vo += p.count; });
}
moves.forEach(([name, set], k) => { reset(); set(); for (let i = 0; i < frames[name]; i++) { S.t += 1 / 60; hb.pose(1 / 60, {}); } const save = av.position.clone(); dump(av, k * 3.2, name + '_rider'); dump(hb.board, k * 3.2, name + '_board'); });
fs.writeFileSync(OUT, obj); console.log('wrote', OUT, moves.length, 'poses');
