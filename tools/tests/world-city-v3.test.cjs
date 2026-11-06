'use strict';
/**
 * tools/tests/world-city-v3.test.cjs — tests for public/world-city-v3.js (real `three` from tools/ual, fake window/document).
 * Loads the classic script in a vm context, then builds it against the REAL city JSON files read from disk via fetchJSON.
 * Run: node tools/tests/world-city-v3.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const THREE = require(path.join(ROOT, 'tools', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));

// ── minimal fake DOM + window (event target) ──
function fakeEl(tag) {
  return { tagName: tag.toUpperCase(), style: {}, children: [], textContent: '', parentNode: null,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; } };
}
const document = { body: fakeEl('body'), activeElement: null, createElement: fakeEl };
const listeners = {};
const window = {
  addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
  dispatch(t, e) { (listeners[t] || []).slice().forEach(f => f(e)); }
};
// ?fullcity=1: the game thins the 208 garden plots to ~10% by default (owner: "too many plots", world-city-v3.js); these tests check the full data set
const ctx = { window, document, Math, console, Promise, JSON, Object, Array, String, Number, isFinite, Infinity, location: { search: '?fullcity=1' } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-city-v3.js'), 'utf8'), ctx, { filename: 'world-city-v3.js' });
const build = window.buildWorldCityV3, P = build.pure, U = 7 / 1.8;

const fetchJSON = url => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, 'public', url.replace(/^\//, '').split('?')[0]), 'utf8')));

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);

(async function main() {
  await test('coordinate conversion: X east, Y north, Z up → x = X·U, y = Z·U, z = -Y·U', () => {
    const g = P.toGame([10, 20, 6]);
    assert.ok(near(g.x, 10 * U) && near(g.y, 6 * U) && near(g.z, -20 * U));
    assert.ok(near(P.U, 7 / 1.8));
    assert.ok(near(P.yawToRotY(90), -Math.PI / 2));
    assert.ok(near(P.yawToRotY(-180), Math.PI));
  });

  await test('props: JSON strings are parsed defensively, bad JSON left as-is', () => {
    const p = P.normProps('{"a":"[1,2]","b":"{bad","c":"music.compose|music.perform","d":{"x":1}}');
    assert.deepStrictEqual(Array.from(p.a), [1, 2]);
    assert.strictEqual(p.b, '{bad');
    assert.strictEqual(p.c, 'music.compose|music.perform');
    assert.strictEqual(p.d.x, 1);
    assert.deepStrictEqual(Object.keys(P.normProps(null)), []);
    assert.deepStrictEqual(Object.keys(P.normProps('not json')), []);
  });

  await test('marker normalise: interactive keys, title, skill split, numeric string price', () => {
    const hb = P.normMarker({ name: 'OBJ_HIRING_BOARD', pos_m: [1, 2, 6], props: { dashboard_id: 'hiring', skill_required: 'work.hire' } });
    assert.ok(hb.interactive); assert.strictEqual(hb.title, 'Hiring Board'); assert.deepStrictEqual(Array.from(hb.skills), ['work.hire']);
    assert.strictEqual(P.promptParts(hb).main, 'E — Hiring Board · work.hire');
    assert.strictEqual(P.promptParts(hb).price, null);
    const gate = P.normMarker({ name: 'GATE_START', pos_m: [0, 1600, 6], props: { sparks_price: '10', skill_required: 'race.circuit' } });
    assert.strictEqual(gate.sparks_price, 10); assert.strictEqual(P.promptParts(gate).price, '10 SPARKS');
    const free = P.normMarker({ name: 'STALL_001', pos_m: [0, 0, 6], props: { sparks_price: 0, paybox_merchant_id: 'stall.001' } });
    assert.strictEqual(P.promptParts(free).price, null);
    const bc = P.normMarker({ name: 'BLD_BROADCAST', pos_m: [0, 0, 6], props: { skill_required: 'music.compose|music.perform' } });
    assert.deepStrictEqual(Array.from(bc.skills), ['music.compose', 'music.perform']);
    assert.ok(!P.normMarker({ name: 'CP_00', pos_m: [0, 0, 6], props: {} }).interactive);
    assert.ok(P.normMarker({ name: 'VEH_X', pos_m: [0, 0, 6], props: { skill_gate: 'drive.ground' } }).interactive);
  });

  await test('nearest-interactive: closest within radius wins, non-interactive and out-of-range ignored, vertical tolerance', () => {
    const L = [
      P.normMarker({ name: 'CP_00', pos_m: [0, 0, 6], props: {} }),                          // not interactive, closest
      P.normMarker({ name: 'A', pos_m: [2, 0, 6], props: { dashboard_id: 'a' } }),
      P.normMarker({ name: 'B', pos_m: [0, 1, 6], props: { endpoint: 'x' } }),
      P.normMarker({ name: 'HIGH', pos_m: [0, 0.5, 92.5], props: { dashboard_id: 'perch' } }),
      P.normMarker({ name: 'FAR', pos_m: [5, 0, 6], props: { dashboard_id: 'far' } })
    ];
    const at = (x, y, z) => ({ x: x * U, y: z * U, z: -y * U });
    assert.strictEqual(P.nearestIn(L, at(0, 0, 6), 3, 6).name, 'B');
    assert.strictEqual(P.nearestIn(L, at(1.8, 0, 6), 3, 6).name, 'A');
    assert.strictEqual(P.nearestIn(L, at(0, 0, 92), 3, 6).name, 'HIGH');
    assert.strictEqual(P.nearestIn(L, { x: 0, z: 0 }, 3, 6).name, 'HIGH');               // no y → horizontal only
    assert.strictEqual(P.nearestIn(L, at(9, 0, 6), 3, 6), null);
    assert.strictEqual(P.nearestIn(L, at(9, 0, 6), 4.5, 6).name, 'FAR');
  });

  await test('plot state → colour mapping (lights = ledger)', () => {
    const hex = s => P.STATE_COLORS[s];
    assert.strictEqual(hex('empty'), 0x000000);
    assert.strictEqual(hex('claimed'), 0x00ff9c);
    assert.strictEqual(hex('built'), 0xfff2d0);
    assert.strictEqual(hex('listed'), 0x3dfff0);
    const c = new THREE.Color(hex('lapsed'));
    assert.ok(c.r > 0 && c.r < 0.3 && Math.abs(c.r - c.g) < 0.05, 'lapsed = dim grey');
    assert.deepStrictEqual(Array.from(P.STATES), ['empty', 'claimed', 'built', 'listed', 'lapsed']);
  });

  // ── integration: real JSON files, real THREE ──
  const scene = new THREE.Scene(), pings = [], interacted = [];
  let playerPos = new THREE.Vector3(0, 0, 0);
  const api = build({ THREE, scene, fetchJSON, getPlayer: () => ({ pos: playerPos }),
    onInteract: m => interacted.push(m.name), onPing: e => pings.push(e) });
  api.setPlotState('PLOT-SW-0002', 'claimed');     // before load → queued
  await api.ready;

  await test('loads the real markers / plots / art-slots JSON from disk', () => {
    const s = api.stats();
    assert.ok(s.loaded);
    assert.strictEqual(s.markers, 108);
    assert.ok(s.interactive > 60 && s.interactive < 108, 'interactive ' + s.interactive);
    assert.ok(s.plots > 1000, 'plots ' + s.plots);
    assert.ok(s.slots > 7000, 'slots ' + s.slots);
    assert.strictEqual(s.filledSlots, 0);
    const hb = api.marker('OBJ_HIRING_BOARD');
    assert.ok(hb && hb.interactive && hb.skill === 'work.hire' && hb.merchant === 'city.hiring');
    assert.ok(near(hb.pos.x, 1073.97 * U, 1e-6) && near(hb.pos.z, -717.61 * U, 1e-6) && near(hb.pos.y, 6 * U, 1e-6));
    ['HUB_HOME_A', 'NODE_SKILL_INSTALL', 'GATE_START', 'DEED_OFFICE', 'PERCH_MAIN'].forEach(n => assert.ok(api.marker(n) && api.marker(n).interactive, n));
    assert.ok(!api.marker('CP_03').interactive && !api.marker('AGENT_PROXY_01').interactive);
  });

  await test('beacons: ONE InstancedMesh, one instance per plot at beacon_m, 3.3 m up', () => {
    const b = api._beacons();
    assert.ok(b && b.isInstancedMesh);
    const meshes = []; scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    assert.strictEqual(meshes.length, 1, 'only the beacon mesh exists before any art is placed');
    assert.strictEqual(b.count, api.stats().plots);
    const p = api.plot('PLOT-SW-0001'), m = new THREE.Matrix4(), v = new THREE.Vector3();
    b.getMatrixAt(0, m); v.setFromMatrixPosition(m);
    assert.ok(near(v.x, p.beacon_m[0] * U, 1e-3) && near(v.z, -p.beacon_m[1] * U, 1e-3) && near(v.y, (6 + 3.3) * U, 1e-3));
  });

  await test('setPlotState: colours one instance, pings, validates, queued-before-load applied', () => {
    const idx = id => Number(id.slice(-4)) - 1, col = new THREE.Color(), b = api._beacons();
    b.getColorAt(idx('PLOT-SW-0002'), col); assert.strictEqual(col.getHex(), 0x00ff9c, 'queued claim applied');
    b.getColorAt(idx('PLOT-SW-0003'), col); assert.strictEqual(col.getHex(), 0x000000, 'empty = dark');
    pings.length = 0;
    assert.strictEqual(api.setPlotState('PLOT-SW-0003', 'built'), true);
    b.getColorAt(idx('PLOT-SW-0003'), col); assert.strictEqual(col.getHex(), 0xfff2d0);
    assert.strictEqual(JSON.stringify(pings[0]), JSON.stringify({ type: 'plot', plot_id: 'PLOT-SW-0003', state: 'built' }));
    api.setPlotState('PLOT-SW-0003', 'listed'); b.getColorAt(idx('PLOT-SW-0003'), col); assert.strictEqual(col.getHex(), 0x3dfff0);
    api.setPlotState('PLOT-SW-0003', 'listed'); assert.strictEqual(pings.length, 2, 'no ping for a no-op');
    assert.strictEqual(api.setPlotState('PLOT-SW-0003', 'owned'), false);
    assert.strictEqual(api.setPlotState('PLOT-NOPE', 'claimed'), false);
    b.getColorAt(idx('PLOT-SW-0004'), col); assert.strictEqual(col.getHex(), 0x000000, 'neighbours untouched');
    const s = api.stats().plotsByState;
    assert.strictEqual(s.claimed, 1); assert.strictEqual(s.listed, 1); assert.strictEqual(s.empty, api.stats().plots - 2);
  });

  await test('placeArt: lazy mesh at pos/yaw sized w×h with emissive map; replace; remove', () => {
    pings.length = 0;
    const id = 'SLOT_FACADE_00001', s = api.slot(id), tex = new THREE.Texture();
    assert.strictEqual(api._artMesh(id), null);
    assert.strictEqual(api.placeArt(id, tex), true);
    const m = api._artMesh(id);
    assert.ok(m && m.material.emissiveMap === tex && m.material.map === tex);
    assert.ok(near(m.rotation.y, -s.yaw * Math.PI / 180, 1e-9));
    const pp = m.geometry.parameters; assert.ok(near(pp.width, s.w_m * U) && near(pp.height, s.h_m * U));
    assert.ok(Math.hypot(m.position.x - s.pos_m[0] * U, m.position.z + s.pos_m[1] * U) < 0.06 * U, 'at slot xz (5 cm proud)');
    assert.ok(near(m.position.y, (s.pos_m[2] + s.h_m / 2) * U, 1e-6), 'centred on the panel');
    assert.strictEqual(s.filled, true); assert.strictEqual(api.stats().filledSlots, 1);
    const tex2 = new THREE.Texture(); api.placeArt(id, tex2);
    assert.strictEqual(api._artMesh(id), m, 'replace reuses mesh'); assert.strictEqual(m.material.emissiveMap, tex2);
    api.placeArt(api.plot('PLOT-SW-0001').art_slot, tex);
    assert.strictEqual(api._artMesh('SLOT_FACADE_00001').geometry === api._artMesh(api.plot('PLOT-SW-0001').art_slot).geometry, false, 'different sizes → different geo');
    assert.strictEqual(api.stats().filledSlots, 2);
    assert.strictEqual(api.placeArt(id, null), true);
    assert.strictEqual(api._artMesh(id), null); assert.strictEqual(m.parent, null); assert.strictEqual(s.filled, null);
    assert.strictEqual(api.stats().filledSlots, 1);
    assert.strictEqual(api.placeArt('SLOT_NOPE', tex), false);
    assert.deepStrictEqual(pings.map(p => p.filled), [true, true, true, false]);
    api.placeArt(api.plot('PLOT-SW-0001').art_slot, null);
  });

  await test('update(): ~5 Hz scan picks the nearest interactive marker, prompt + E key → onInteract', () => {
    const hb = api.marker('OBJ_HIRING_BOARD');
    playerPos = new THREE.Vector3(hb.pos.x + 1 * U, 6 * U, hb.pos.z);
    api.update(0.05); api.update(0.05);                           // throttle: first call scans (acc starts full), then waits
    assert.strictEqual(api.current() && api.current().name, 'OBJ_HIRING_BOARD');
    const el = document.body.children[0];
    assert.ok(el && el.style.display === 'block');
    assert.strictEqual(el.children[0].textContent, 'E — Hiring Board · work.hire');
    assert.ok(/#06080b/.test(el.style.cssText) && /#00ff9c/.test(el.style.cssText) && /#e8c45c/.test(el.children[1].style.cssText));
    window.dispatch('keydown', { key: 'e', target: document.body });
    window.dispatch('keydown', { key: 'e', target: { tagName: 'INPUT' } });        // typing → ignored
    window.dispatch('keydown', { key: 'e', target: document.body, repeat: true }); // key repeat → ignored
    assert.deepStrictEqual(interacted, ['OBJ_HIRING_BOARD']);
    const gate = api.marker('GATE_START');
    playerPos = new THREE.Vector3(gate.pos.x, 6 * U, gate.pos.z + 0.5 * U);
    api.update(0.1); assert.strictEqual(api.current().name, 'OBJ_HIRING_BOARD', 'throttled: no rescan yet');
    api.update(0.1); assert.notStrictEqual(api.current().name, 'OBJ_HIRING_BOARD');
    assert.ok(/SPARKS/.test(el.children[1].textContent), 'gold price shown: ' + el.children[1].textContent);
    playerPos = new THREE.Vector3(0, 6 * U, 0); api.update(0.3);
    assert.strictEqual(api.current(), null); assert.strictEqual(el.style.display, 'none');
    window.dispatch('keydown', { key: 'e', target: document.body });
    assert.strictEqual(interacted.length, 1, 'no marker → no interact');
  });

  await test('dispose removes listener, prompt and group', () => {
    api.dispose();
    assert.strictEqual((listeners.keydown || []).length, 0);
    assert.strictEqual(document.body.children.length, 0);
    assert.strictEqual(scene.children.length, 0);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
