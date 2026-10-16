// node tools/ual/bots-k14.test.mjs — Blender K14 wheel-bots (REAL GLBs) as the PORTER (Grok) and CLERK (Muse) bodies: no AnimationMixer for the
// clip-less node rig, the wheel node spins while following, bodies get sized like companions, the follow loop never throws.
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js'; import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const store = {}; globalThis.window = globalThis; globalThis.self = globalThis; globalThis.THREE = THREE;
globalThis.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
class Loader { load(url, ok, _p, err) { let b; try { b = fs.readFileSync(new URL('../../public' + url, import.meta.url)); } catch (e) { return err && err(e); } new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, err); } }
try { require('../../public/world-bot-bodies.js'); } catch (_) {}
require('../../public/world-bots.js');
const B = window.WorldBots; let pass = 0, fail = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log('  ok ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } };
const scene = new THREE.Scene(), U = 3.889;
for (const [id, rig] of [['porter', 'grok'], ['clerk', 'muse']]) await t(id.toUpperCase() + ' wears the K14 ' + rig + ' body and follows you with a spinning wheel (no mixer, no throw)', async () => {
  B._reset && B._reset(); B.unlock(id, 'test'); const c = B.call(id, 'city'); assert(c.ok !== false, 'call ' + JSON.stringify(c));
  const sc = new THREE.Scene(); B.spawnBodies(THREE, sc, () => 0, { loader: new Loader(), cloneSkinned: clone });
  let wheel = null; for (let i = 0; i < 80 && !wheel; i++) { await new Promise((r) => setTimeout(r, 25)); sc.traverse((o) => { if (!wheel && new RegExp('^wheel_' + rig).test(o.name)) wheel = o; }); }
  assert(wheel, 'K14 wheel node in the scene');
  const player = new THREE.Vector3(30 * U, 0, 0), r0 = wheel.rotation.x;
  for (let i = 0; i < 120; i++) { B.update(1 / 60, player, 'city'); player.x += 0.2 * U; }
  assert(Math.abs(wheel.rotation.x - r0) > 0.5, 'wheel spun while following: ' + (wheel.rotation.x - r0).toFixed(2));
  const bb = new THREE.Box3().setFromObject(B._sim ? sc : sc), h = (bb.max.y - bb.min.y) / U; assert(h > 0.6 && h < 3, 'companion size ' + h.toFixed(2) + ' m');
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1;
