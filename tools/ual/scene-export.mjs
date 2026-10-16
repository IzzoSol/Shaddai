// node tools/ual/scene-export.mjs <what> <out.obj> <out.json> — builds a game module EXACTLY as the world does (v4 layout, real v4 terrain
// heights, real kits) and exports every visible mesh (instanced meshes expanded) for the Blender world: one OBJ object per (mesh, material)
// in metres (Blender frame via OBJ import forward -Z / up Y) + a sidecar JSON of material colours { name: {color, emissive, ei, metal, rough, opacity} }.
//   what = colosseum   (world-colosseum.js buildColosseumExterior + the K13 Blender lobby)
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public'), U = 7 / 1.8;
const [what = 'colosseum', OBJ, MAT] = process.argv.slice(2);
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /create.*Gradient/.test(k) ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
globalThis.window = globalThis; globalThis.self = globalThis; globalThis.THREE = THREE; globalThis.location = { search: '' };
globalThis.document = { createElement: () => ({ style: {}, getContext: () => ctx2d, width: 0, height: 0 }), addEventListener() {} };
globalThis.XMLHttpRequest = class { open(m, u) { this.u = u; } send() { try { this.responseText = fs.readFileSync(path.join(PUB, this.u.split('?')[0]), 'utf8'); this.status = 200; } catch (e) { this.status = 404; } } };
globalThis.Image = class { addEventListener(t, f) { if (t === 'load') setTimeout(() => f({ target: this }), 0); } removeEventListener() {} set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(path.join(PUB, url.split('?')[0])); } catch (e) { return err && err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
globalThis.__GLTFLoaderClass = Loader;
// real v4 heights (mirrors world-terrain-v4.js)
const META = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/terrain/terrain.json'), 'utf8')), hb = fs.readFileSync(path.join(PUB, 'assets/terrain/height16.bin'));
const HD = new Uint16Array(hb.buffer, hb.byteOffset, hb.length >> 1), N = Math.round(Math.sqrt(HD.length)), NM1 = N - 1, HALF = +META.half_units, INV = NM1 / (2 * HALF), PM = +META.units_per_m, HA = META.min_m * PM, HB = (META.max_m - META.min_m) / 65535 * PM;
const heightAt = (x, z) => { let u = Math.max(0, Math.min(NM1, (x + HALF) * INV)), v = Math.max(0, Math.min(NM1, (z + HALF) * INV)); let i = u | 0, j = v | 0; if (i >= NM1) i = NM1 - 1; if (j >= NM1) j = NM1 - 1; const fx = u - i, fy = v - j, k = j * N + i, t = HD[k] + (HD[k + 1] - HD[k]) * fx, b2 = HD[k + N] + (HD[k + N + 1] - HD[k + N]) * fx; return HA + HB * (t + (b2 - t) * fy); };
require(path.join(PUB, 'world-layout.js'));
const scene = new THREE.Scene(); let root = null;
if (what === 'colosseum') {
  try { require(path.join(PUB, 'world-merge.js')); } catch (_) {}
  require(path.join(PUB, 'world-colosseum.js'));
  root = window.buildColosseumExterior(THREE, { scene, heightAt }).group;
  for (let i = 0; i < 80 && !root.userData.lobbyKit; i++) await new Promise((r) => setTimeout(r, 25));   // K13 lobby lands async
}
if (!root) throw new Error('unknown target ' + what);
scene.updateMatrixWorld(true);
let obj = '', vo = 1, n = 0; const mats = {}, v = new THREE.Vector3(), m = new THREE.Matrix4(), w = new THREE.Matrix4();
const hidden = (o) => { for (let a = o; a; a = a.parent) if (!a.visible) return true; return false; };
const matName = (mt) => { const nm = (mt.name || ('m' + mt.id)).replace(/\W+/g, '_'); if (!mats[nm]) mats[nm] = { color: mt.color ? '#' + mt.color.getHexString() : '#cccccc', emissive: mt.emissive ? '#' + mt.emissive.getHexString() : '#000000', ei: mt.emissiveIntensity || 0, metal: mt.metalness || 0, rough: mt.roughness == null ? 0.6 : mt.roughness, opacity: mt.transparent ? mt.opacity : 1 }; return nm; };
function emit(geo, mtx, mt) {
  const p = geo.attributes.position, idx = geo.index, name = matName(Array.isArray(mt) ? mt[0] : mt); obj += 'o ' + name + '__' + (n++) + '\nusemtl ' + name + '\n';
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mtx); obj += `v ${(v.x / U).toFixed(3)} ${(v.y / U).toFixed(3)} ${(v.z / U).toFixed(3)}\n`; }
  const c = idx ? idx.count : p.count; for (let i = 0; i < c; i += 3) { const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, d = idx ? idx.getX(i + 2) : i + 2; obj += `f ${a + vo} ${b + vo} ${d + vo}\n`; } vo += p.count;
}
root.traverse((o) => { if (!o.isMesh || hidden(o) || !o.geometry || !o.geometry.attributes.position) return;
  if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); emit(o.geometry, w.multiplyMatrices(o.matrixWorld, m), o.material); } } else emit(o.geometry, o.matrixWorld, o.material); });
fs.writeFileSync(OBJ, obj); fs.writeFileSync(MAT, JSON.stringify(mats));
console.log(what, 'objects', n, 'verts', vo - 1, 'materials', Object.keys(mats).length);
