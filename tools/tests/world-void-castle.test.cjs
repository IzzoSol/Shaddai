'use strict';
/**
 * tools/tests/world-void-castle.test.cjs — tests for public/world-void-castle.js (real `three` from tools/ual, no browser, no GPU).
 * Loads the classic script in a vm context and builds it against the REAL terrain (terrain.json + height16.bin, same bilinear
 * sampling as world-terrain-v4.js heightAt). Shaders are only checked as strings (no WebGL here).
 * Run: node tools/tests/world-void-castle.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const THREE = require(path.join(ROOT, 'tools', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'terrain', 'terrain.json'), 'utf8'));
const U = 7 / 1.8;
// a real gc() even without --expose-gc (so the allocation check is strict in a plain `node` run)
require('v8').setFlagsFromString('--expose_gc');
const gc = global.gc || vm.runInNewContext('gc');

// real heightAt (game units → game units), mirrors world-terrain-v4.js
const buf = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'terrain', 'height16.bin'));
const HD = new Uint16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
const N = Math.round(Math.sqrt(HD.length)), NM1 = N - 1, HALF = +META.half_units, PM = +META.units_per_m, INV = NM1 / (2 * HALF);
const HA = META.min_m * PM, HB = (META.max_m - META.min_m) / 65535 * PM;
function heightAt(x, z) {
  let u = (x + HALF) * INV, v = (z + HALF) * INV;
  u = Math.max(0, Math.min(NM1, u)); v = Math.max(0, Math.min(NM1, v));
  let i = u | 0, j = v | 0; if (i >= NM1) i = NM1 - 1; if (j >= NM1) j = NM1 - 1;
  const fx = u - i, fy = v - j, k = j * N + i;
  const top = HD[k] + (HD[k + 1] - HD[k]) * fx, bot = HD[k + N] + (HD[k + N + 1] - HD[k + N]) * fx;
  return HA + HB * (top + (bot - top) * fy);
}

const window = {};
const ctx = { window, Math, console: { info() {}, warn: console.warn, log: console.log }, JSON, Object, Array, String, Number, isFinite, Infinity };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-void-castle.js'), 'utf8'), ctx, { filename: 'world-void-castle.js' });

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

let api, scene = new THREE.Scene(), night = 0.8;
const PLAYER = { pos: { x: 0, y: 0, z: -3600 * U } };   // cached: the host's getPlayer allocation is not ours to measure
test('builds without throwing and adds its group to the scene', () => {
  api = window.buildWorldVoidCastle({ THREE, scene, heightAt, terrainMeta: META, nightFactor: () => night,
    getPlayer: () => PLAYER });
  assert.ok(api && api.group && typeof api.update === 'function' && typeof api.dispose === 'function');
  assert.strictEqual(api.group.parent, scene);
  const s = api.stats();
  console.log('       ' + JSON.stringify(s));
});

function meshesOf(root) { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; }
function tris(m) { const g = m.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; return n * (m.isInstancedMesh ? m.count : 1); }

test('triangle budget < 60k (instances counted)', () => {
  const t = meshesOf(api.group).reduce((a, m) => a + tris(m), 0);
  console.log('       triangles: ' + Math.round(t));
  assert.ok(t < 60000, 'triangles ' + t);
  assert.strictEqual(Math.round(t), api.stats().triangles);
});

test('draw calls (meshes) < 20; at most 4 point lights; braziers + spires are InstancedMesh', () => {
  const ms = meshesOf(api.group);
  console.log('       draw calls: ' + ms.length + ' → ' + ms.map(m => m.name).join(', '));
  assert.ok(ms.length < 20, 'draws ' + ms.length);
  let lights = 0; api.group.traverse(o => { if (o.isPointLight) lights++; });
  assert.ok(lights <= 4, 'lights ' + lights);
  const inst = ms.filter(m => m.isInstancedMesh).map(m => m.name);
  assert.ok(inst.includes('void-causeway-braziers') && inst.includes('void-castle-spires'), inst.join(','));
  const sp = ms.find(m => m.name === 'void-castle-spires');
  assert.ok(sp.count >= 5 && sp.count <= 7, 'spires ' + sp.count);
});

test('all vertex positions and instance matrices are finite', () => {
  meshesOf(api.group).forEach(m => {
    const a = m.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), m.name + ' pos[' + i + ']');
    if (m.isInstancedMesh) { const e = m.instanceMatrix.array; for (let i = 0; i < m.count * 16; i++) assert.ok(Number.isFinite(e[i]), m.name + ' inst'); }
    ['aS', 'aD', 'aCorner', 'aSeed', 'normal', 'color'].forEach(k => { const at = m.geometry.attributes[k]; if (at) for (let i = 0; i < at.array.length; i++) assert.ok(Number.isFinite(at.array[i]), m.name + ' ' + k); });
  });
});

test('castle stands on the far (north) lip, within 400 m of the pit centre; causeway starts at the overlook', () => {
  const V = META.features.void, A = api.anchors;
  const pc = { x: V.pit_centre_m[0] * U, z: -V.pit_centre_m[1] * U };
  const d = Math.hypot(A.castle.x - pc.x, A.castle.z - pc.z) / U;
  console.log('       castle ↔ pit centre ' + d.toFixed(1) + ' m · causeway ' + api.stats().causewayLength_m + ' m');
  assert.ok(d < 400 && d > V.pit_r_m, 'distance ' + d);
  assert.ok(-A.castle.z / U > V.pit_centre_m[1], 'castle should be north of the pit (opposite the overlook)');
  const ov = { x: V.overlook_m[0] * U, z: -V.overlook_m[1] * U };
  assert.ok(Math.hypot(A.causewayStart.x - ov.x, A.causewayStart.z - ov.z) / U < 20, 'causeway start near overlook');
  assert.ok(Math.hypot(A.causewayEnd.x - A.gate.x, A.causewayEnd.z - A.gate.z) / U < 12, 'causeway end at the gate apron');
  const bb = new THREE.Box3().setFromObject(api.group);
  assert.ok(Number.isFinite(bb.min.x) && Number.isFinite(bb.max.y));
  // castle + central tower height: dome well above the plinth (~55 m tower + dome)
  assert.ok((A.dome.y - A.castle.y) / U >= 50, 'tower height');
  // deck never below the ground it crosses; plinth top at the lip
  assert.ok(Math.abs(A.castle.y / U - V.lip_z_m) < 1.5, 'plinth top ≈ lip');
  api.walkableTops.filter(t => t.deck).forEach(t => assert.ok(t.top >= heightAt(t.x, t.z) + 0.2 * U, 'deck under ground at ' + t.x + ',' + t.z));
});

test('collider records are well-formed (world-collision.js / player-controller shapes)', () => {
  const C = api.colliders;
  assert.ok(C.length > 20, 'count ' + C.length);
  let obb = 0, circ = 0;
  C.forEach(c => {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.top), JSON.stringify(c));
    assert.ok(typeof c.label === 'string' && c.label.indexOf('void-castle:') === 0);
    if (c.hx != null) { assert.ok(c.hx > 0 && c.hz > 0 && Number.isFinite(c.rot)); obb++; }
    else { assert.ok(c.r > 0); circ++; }
  });
  assert.ok(obb > 0 && circ > 0);
  ['plinth', 'wall-n', 'gatehouse', 'keep', 'tower-nw', 'parapet'].forEach(l => assert.ok(C.some(c => c.label === 'void-castle:' + l), 'missing ' + l));
  // every solid has a matching top (so the controller can stand you on it) and decks are stand-alone
  C.forEach(c => assert.ok(api.walkableTops.some(t => t.x === c.x && t.z === c.z && t.top === c.top && !t.deck)));
  const decks = api.walkableTops.filter(t => t.deck);
  assert.ok(decks.length > 20 && decks.every(t => t.type === 'obb' && t.hx > 0 && t.hz > 0));
  // gate-side point in front of the portcullis is blocked by the gatehouse OBB (rotated-box test from world-collision.js)
  const g = C.find(c => c.label === 'void-castle:gatehouse'), cs = Math.cos(g.rot), sn = Math.sin(g.rot);
  const inside = (px, pz, b) => { const dx = px - b.x, dz = pz - b.z; return Math.abs(dx * cs - dz * sn) < b.hx && Math.abs(dx * sn + dz * cs) < b.hz; };
  assert.ok(inside(g.x, g.z, g));
  // the causeway walkway centre is NOT inside any parapet collider (walkable)
  const mid = decks[Math.floor(decks.length / 2)];
  assert.ok(!C.filter(c => c.label === 'void-castle:parapet').some(p => { const c2 = Math.cos(p.rot), s2 = Math.sin(p.rot), dx = mid.x - p.x, dz = mid.z - p.z;
    return Math.abs(dx * c2 - dz * s2) < p.hx && Math.abs(dx * s2 + dz * c2) < p.hz; }), 'walkway blocked by parapet');
});

test('shaders are GLSL strings with void main (deck Worley, dome, vortex, flames)', () => {
  const S = api.shaders;
  ['deck', 'beds', 'dome', 'vortex', 'flame'].forEach(k => {
    assert.ok(typeof S[k].vs === 'string' && /void\s+main\s*\(/.test(S[k].vs), k + ' vs');
    assert.ok(typeof S[k].fs === 'string' && /void\s+main\s*\(/.test(S[k].fs), k + ' fs');
    assert.ok(/gl_FragColor/.test(S[k].fs), k + ' writes gl_FragColor');
    assert.ok(!/\bin\s+vec|\bout\s+vec4|texture\(/.test(S[k].fs), k + ' is WebGL1-style (three converts for WebGL2)');
  });
  assert.ok(/vcWorley/.test(S.deck.fs));
  const mats = meshesOf(api.group).map(m => m.material).filter(m => m.isShaderMaterial);
  assert.ok(mats.length >= 5, 'shader materials ' + mats.length);
  mats.forEach(m => assert.ok(/void\s+main/.test(m.vertexShader) && /void\s+main/.test(m.fragmentShader)));
  const vort = meshesOf(api.group).find(m => m.name === 'void-galaxy-vortex');
  assert.ok(vort && vort.material.depthWrite === false && vort.material.blending === THREE.AdditiveBlending);
});

test('update() runs, animates uniforms, flickers ember lights, no throw over many frames', () => {
  const deck = meshesOf(api.group).find(m => m.name === 'void-causeway-deck');
  let t = 0;
  for (let i = 0; i < 300; i++) { t += 1 / 60; api.update(t, 1 / 60); }
  assert.ok(Math.abs(deck.material.uniforms.uTime.value - t) < 1e-9);
  const embers = []; api.group.traverse(o => { if (o.isPointLight && o.userData.kind === 'ember') embers.push(o); });
  const a = embers[0].intensity; api.update(t + 0.05, 0.05); assert.ok(embers[0].intensity !== a && embers[0].intensity > 0);
  night = 0; api.update(t + 0.1, 0.05); const dayGlow = deck.material.uniforms.uGlow.value;
  night = 1; api.update(t + 0.15, 0.05); assert.ok(deck.material.uniforms.uGlow.value > dayGlow, 'brighter at night');
  api.update(undefined, 0.016);   // dt-only clock
});

test('update() allocation check: heap stays flat across 20k calls (no per-frame garbage of note)', () => {
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20000; i++) api.update(i / 60, 1 / 60);
  gc();
  const after = process.memoryUsage().heapUsed, grow = (after - before) / 1024;
  console.log('       heap Δ over 20k updates: ' + grow.toFixed(0) + ' KB');
  assert.ok(grow < 256, 'heap grew ' + grow + ' KB');
});

test('quality LOW skips the galaxy vortex; lights cap respected', () => {
  const s2 = new THREE.Scene();
  const lo = window.buildWorldVoidCastle({ THREE, scene: s2, heightAt, terrainMeta: META, quality: 'LOW', lights: 2 });
  assert.ok(!meshesOf(lo.group).some(m => m.name === 'void-galaxy-vortex'));
  let n = 0; lo.group.traverse(o => { if (o.isPointLight) n++; }); assert.strictEqual(n, 2);
  lo.update(1, 0.016);
  lo.dispose(); assert.strictEqual(lo.group.parent, null);
});

test('builds with missing terrain metadata / flat ground (defaults)', () => {
  const s3 = new THREE.Scene();
  const d = window.buildWorldVoidCastle({ THREE, scene: s3, heightAt: () => 0, terrainMeta: {} });
  assert.ok(d.colliders.length > 20 && d.stats().triangles < 60000);
  d.dispose();
});

test('dispose removes the group', () => { api.dispose(); assert.strictEqual(api.group.parent, null); });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
