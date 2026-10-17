// node tools/ual/race-kit-export.mjs <circuit=dragon-gate> <out.json> <deck.obj> — the game's race circuit EXACTLY as world-race-track.js +
// world-race-kit.js build it (REAL v4 terrain heights, REAL K6/K6b GLBs), exported for the Blender world: every kit instance as
// { node, m (game 4x4, units) } + the visible code deck/rails as one OBJ in metres (Blender frame: X east, Y north, Z up).
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js'; import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), PUB = path.join(ROOT, 'public');
const [cid = 'dragon-gate', OUT, OBJ] = process.argv.slice(2);
globalThis.self = globalThis;
const META = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/terrain/terrain.json'), 'utf8')), buf = fs.readFileSync(path.join(PUB, 'assets/terrain/height16.bin'));
const HD = new Uint16Array(buf.buffer, buf.byteOffset, buf.length >> 1), N = Math.round(Math.sqrt(HD.length)), NM1 = N - 1, HALF = +META.half_units, PM = +META.units_per_m, INV = NM1 / (2 * HALF);
const HA = META.min_m * PM, HB = (META.max_m - META.min_m) / 65535 * PM;
function heightAt(x, z) {   // mirrors world-terrain-v4.js (game units)
  let u = (x + HALF) * INV, v = (z + HALF) * INV; u = Math.max(0, Math.min(NM1, u)); v = Math.max(0, Math.min(NM1, v));
  let i = u | 0, j = v | 0; if (i >= NM1) i = NM1 - 1; if (j >= NM1) j = NM1 - 1;
  const fx = u - i, fy = v - j, k = j * N + i, top = HD[k] + (HD[k + 1] - HD[k]) * fx, bot = HD[k + N] + (HD[k + N + 1] - HD[k + N]) * fx;
  return HA + HB * (top + (bot - top) * fy);
}
const g2d = new Proxy({}, { get: () => function () { } });
const ctx = { console: { info() {}, warn: console.warn, log() {} }, THREE, Math, Promise, document: { createElement: () => ({ getContext: () => g2d, width: 0, height: 0 }), addEventListener() {} }, location: { search: '' } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['world-race.js', 'world-race-track.js', 'world-race-kit.js']) vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), ctx);
const U = 7 / 1.8, C = ctx.WorldRace.CIRCUITS[cid] || {};
// CITY CIRCUITS (Skyline / Meridian): the deck clears building tops like the game (world-city-heights.js on grid-city-v4.json)
let obstacleAt; if (/^(meridian-(8|tri)|grand-course|quarter-loop|grid-ring)/.test(cid)) { vm.runInContext(fs.readFileSync(path.join(PUB, 'world-city-heights.js'), 'utf8'), ctx);
  obstacleAt = ctx.WorldCityHeights.build({ plan: JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/grid-city-v4.json'), 'utf8')), U: 7 / 1.8, cell: 2 }).topAt; }
const tr = ctx.buildRaceTrack({ THREE, scene: new THREE.Scene(), groundAt: heightAt, WorldRace: ctx.WorldRace, circuit: cid, U, mergeGeometries, tunnels: C.tunnels, gateTowers: C.gateTowers || 0, obstacleAt, obstacleClearM: 12, maxDeckM: 250, padCount: /^(meridian|grand)/.test(cid) ? 6 : 4 });
if (tr.frames) { const hs = tr.frames.map((f) => (f.P.y - heightAt(f.P.x, f.P.z)) / U), q = (i) => hs[Math.floor(i * hs.length)].toFixed(0); console.log('deck above ground m: start', hs[0].toFixed(1), 'min', Math.min(...hs).toFixed(1), 'max', Math.max(...hs).toFixed(1), '| at 5/10/25/50/75/90/95%:', [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].map(q).join(' '), '| length m', Math.round(tr.lengthM)); }
class Loader { load(url, ok, _p, err) { const b = fs.readFileSync(path.join(PUB, url)); new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
const r = await ctx.WorldRaceKit.dress({ THREE, GLTFLoader: Loader, track: tr, U, groundAt: heightAt, getPlayer: () => ({ x: 1e9, y: 0, z: 1e9 }) });
tr.group.updateMatrixWorld(true); if (r) r.group.updateMatrixWorld(true);
// kit instances: one record per (node, instance); parts of the same node share the instance matrix -> keep the first part only
const inst = [], seen = new Set(), m = new THREE.Matrix4(), w = new THREE.Matrix4();
const grab = (root) => root.traverse((o) => {
  if (!o.visible) return;
  if (o.isInstancedMesh) { const node = o.name.replace(/^racekit-/, ''); if (seen.has(node)) return; seen.add(node); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); w.multiplyMatrices(o.matrixWorld, m); inst.push({ node, m: w.toArray() }); } }
  else if (o.isMesh && /^racekit-/.test(o.name)) { const node = o.name.replace(/^racekit-/, ''); inst.push({ node, m: o.matrixWorld.toArray(), single: true }); }
});
if (r) grab(r.group);
// visible non-instanced code meshes of the track (deck ribbon, rails, edges) -> one OBJ in Blender metres
let obj = '', vo = 1; const v = new THREE.Vector3(), hidden = (o) => { for (let a = o; a; a = a.parent) if (!a.visible) return true; return false; };
tr.group.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || hidden(o)) return; const p = o.geometry.attributes.position, uv = o.geometry.attributes.uv, idx = o.geometry.index; obj += 'o ' + (o.name || 'deck') + '\n';
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); obj += `v ${(v.x / U).toFixed(3)} ${(v.y / U).toFixed(3)} ${(v.z / U).toFixed(3)}\n`; }
  for (let i = 0; i < p.count; i++) obj += uv ? `vt ${uv.getX(i).toFixed(4)} ${uv.getY(i).toFixed(4)}\n` : 'vt 0 0\n';   // UVs: the neon deck / kerb / wall textures are rebuilt in Blender
  const n = idx ? idx.count : p.count; for (let i = 0; i < n; i += 3) { const a = (idx ? idx.getX(i) : i) + vo, b = (idx ? idx.getX(i + 1) : i + 1) + vo, c = (idx ? idx.getX(i + 2) : i + 2) + vo; obj += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`; } vo += p.count; });
fs.writeFileSync(OUT, JSON.stringify({ circuit: cid, U, instances: inst })); if (OBJ) fs.writeFileSync(OBJ, obj);
const by = {}; inst.forEach((i) => (by[i.node] = (by[i.node] || 0) + 1)); console.log(cid, 'kit instances', inst.length, JSON.stringify(by), '| deck verts', vo - 1);
