// Node harness: runs public/world-colosseum.js (a classic browser IIFE) against the real three.js build with a stubbed DOM.
// three is not a dependency of this repo; point THREE_PATH at any three.module.js (default: Shaddai-Realms' copy).
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const THREE_PATH = process.env.THREE_PATH || 'C:/Users/Brittany/Shaddai-Realms/node_modules/three/build/three.module.js';
export const hasThree = fs.existsSync(THREE_PATH);
export const dimsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'colosseum-dims.json'), 'utf8'));
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))), set: (t, k, v) => { t[k] = v; return true; } });
const mem = {}; const store = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
export function setup(quality) {
  const g = globalThis; g.window = g;
  Object.defineProperty(g, 'localStorage', { value: store, configurable: true, writable: true });
  Object.defineProperty(g, 'location', { value: { search: '', origin: 'http://x' }, configurable: true, writable: true });
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }), activeElement: null };
  g.addEventListener = () => {}; g.setInterval = () => 0; g.__quality = quality;
  return mem;
}
let THREE_M;
export async function loadArena(opts = {}) {
  if (!hasThree) return null;
  THREE_M = THREE_M || await import(pathToFileURL(THREE_PATH).href);
  setup(opts.quality);
  delete globalThis.buildColosseumArena;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'public', 'world-colosseum.js'), 'utf8'), { filename: 'world-colosseum.js' });
  const scene = new THREE_M.Scene();
  const arena = globalThis.buildColosseumArena(THREE_M, { scene, loader: opts.loader });
  return { THREE: THREE_M, scene, arena };
}
// draw-call / triangle estimate for everything visible in the arena group
export function stats(THREE, group) {
  let calls = 0, tris = 0, inst = 0; group.updateMatrixWorld(true);
  group.traverse(o => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible) return;
    let p = o.parent, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return;
    const g = o.geometry, n = o.isInstancedMesh ? o.count : 1; if (!n) return;
    const idx = g.index ? g.index.count : g.attributes.position.count; calls++; if (o.isInstancedMesh) inst += n;
    if (o.isMesh) tris += (idx / 3) * n;
  });
  return { calls, tris: Math.round(tris), instances: inst };
}
