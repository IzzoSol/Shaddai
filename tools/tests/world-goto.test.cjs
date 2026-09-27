'use strict';
/**
 * tools/tests/world-goto.test.cjs — tests for public/world-goto.js (the `?goto=` deep link).
 * Loads the classic script in a vm context against a `city.marker`-like stub built from the REAL
 * markers-v4.json, and the REAL canon-colliders-v4.json for the collision-clear check.
 * Run: node tools/tests/world-goto.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const U = 7 / 1.8;

function toGame(p) { return { x: (+p[0] || 0) * U, y: (+p[2] || 0) * U, z: -(+p[1] || 0) * U }; }

// ── real city data, normalised just enough to be a `city.marker`-like stub ──
const markersRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'world', 'markers-v4.json'), 'utf8')).markers;
const markers = markersRaw.map(m => ({
  name: m.name,
  dashboard_id: (m.props && m.props.dashboard_id != null) ? m.props.dashboard_id : null,
  pos: toGame(m.pos_m)
}));
function makeCity(list) {
  return { markers: list, marker: id => list.find(m => m.name === id) || null };
}
const city = makeCity(markers);

const canon = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'world', 'canon-colliders-v4.json'), 'utf8'));
const canonBoxes = canon.obb.map(b => ({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot }));

// ── load the real module in a vm context ──
const window = { location: { search: '' } };
const ctx = { window, Math, console, String, Array, Object, isFinite, decodeURIComponent };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-goto.js'), 'utf8'), ctx, { filename: 'world-goto.js' });
const build = window.buildWorldGoto, P = build.pure;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

function fakePlayer(x, z) { return { x: x, z: z, y: 0 }; }

(function main() {
  test('id match: dashboard_id resolves to the marker', () => {
    window.location.search = '?map=v4&goto=hiring';
    const g = build({ city, getPlayerHandle: () => fakePlayer(0, 0), isReady: () => true }).resolve();
    assert.ok(g.target && g.target.name === 'OBJ_HIRING_BOARD');
  });

  test('name match: falls back to marker name when dashboard_id does not match', () => {
    window.location.search = '?goto=NODE_MAIL';
    const g = build({ city, getPlayerHandle: () => fakePlayer(0, 0), isReady: () => true }).resolve();
    assert.ok(g.target && g.target.name === 'NODE_MAIL');
  });

  test('case-insensitivity: both dashboard_id and name match regardless of case', () => {
    window.location.search = '?goto=HIRING';
    let g = build({ city, getPlayerHandle: () => fakePlayer(0, 0), isReady: () => true }).resolve();
    assert.ok(g.target && g.target.name === 'OBJ_HIRING_BOARD', 'dashboard_id ci');
    window.location.search = '?goto=node_mail';
    g = build({ city, getPlayerHandle: () => fakePlayer(0, 0), isReady: () => true }).resolve();
    assert.ok(g.target && g.target.name === 'NODE_MAIL', 'name ci');
  });

  test('unknown target: target stays null, toast fires, onDone(false)', () => {
    window.location.search = '?goto=totally-not-a-place';
    let toasted = null; window.__toast = msg => { toasted = msg; };
    let done = 'never';
    const g = build({ city, getPlayerHandle: () => fakePlayer(0, 0), isReady: () => true, onDone: found => { done = found; } }).resolve();
    assert.strictEqual(g.target, null);
    assert.strictEqual(toasted, "Couldn't find that place");
    assert.strictEqual(done, false);
    delete window.__toast;
  });

  test('no ?goto= at all: no-op, no toast, no onDone call', () => {
    window.location.search = '?map=v4&overhead=1,2';
    let toasted = false; window.__toast = () => { toasted = true; };
    let done = 'never';
    const g = build({ city, getPlayerHandle: () => fakePlayer(0, 0), isReady: () => true, onDone: found => { done = found; } }).resolve();
    assert.strictEqual(g.target, null);
    assert.strictEqual(toasted, false);
    assert.strictEqual(done, 'never');
    delete window.__toast;
  });

  test('apply(): waits for isReady(), moves x/z only (leaves y alone), onDone(true)', () => {
    window.location.search = '?goto=hiring';
    let ready = false, done = 'never';
    const player = fakePlayer(999, 999);
    const g = build({ city, getPlayerHandle: () => player, isReady: () => ready, onDone: found => { done = found; } }).resolve();
    assert.ok(g.target);
    assert.strictEqual(g.apply(), false, 'not ready yet');
    assert.strictEqual(player.x, 999, 'untouched before ready');
    ready = true;
    assert.strictEqual(g.apply(), true);
    assert.strictEqual(done, true);
    assert.strictEqual(player.y, 0, 'y left alone (host re-derives ground height)');
    assert.ok(Math.hypot(player.x - g.target.pos.x, player.z - g.target.pos.z) > 0, 'moved away from 999,999 to near the marker');
    const distM = Math.hypot(player.x - g.target.pos.x, player.z - g.target.pos.z) / U;
    assert.ok(Math.abs(distM - 3) < 1e-6, '3 m from the marker, got ' + distM);
    assert.strictEqual(g.apply(), false, 'apply is one-shot');
  });

  test('faces the marker: bearing is one of the 8 compass ticks, and running it backwards lands back on the marker', () => {
    window.location.search = '?goto=hiring';
    const player = fakePlayer(0, 0);
    const g = build({ city, getPlayerHandle: () => player, isReady: () => true }).resolve();
    g.apply();
    assert.ok(P.BEARINGS.indexOf(g.approach.bearing) >= 0);
    const back = { x: g.approach.x - Math.sin(g.approach.bearing) * P.APPROACH_M * U, z: g.approach.z - Math.cos(g.approach.bearing) * P.APPROACH_M * U };
    assert.ok(Math.hypot(back.x - g.target.pos.x, back.z - g.target.pos.z) < 1e-6);
  });

  test('collision: the 3 m offset lands outside every solid box in canon-colliders-v4.json, for every interactive marker', () => {
    const interactive = markers.filter(m => m.dashboard_id != null);
    assert.ok(interactive.length > 40, 'sanity: ' + interactive.length);
    interactive.forEach(mk => {
      const spot = P.computeApproach(mk.pos, canonBoxes, null, 3);
      const blocked = canonBoxes.some(b => P.pointInBox(spot.x, spot.z, b));
      assert.ok(!blocked, mk.name + ' approach still inside a collider: ' + JSON.stringify(spot));
    });
  });

  test('collision: when the default bearing (0) is blocked, a different clear bearing is chosen', () => {
    const markerPos = { x: 0, z: 0 };
    // box straddles bearing 0 (straight +Z) out to well past the 3 m approach distance
    const boxes = [{ x: 0, z: 3 * U, hx: 2 * U, hz: 6 * U, rot: 0 }];
    const spot = P.computeApproach(markerPos, boxes, null, 3);
    assert.notStrictEqual(spot.bearing, 0, 'bearing 0 was blocked, must pick another');
    assert.ok(!boxes.some(b => P.pointInBox(spot.x, spot.z, b)), 'chosen spot must be clear');
  });

  test('collision: window.WORLD_COLLIDES is used when no `colliders` opt is given', () => {
    window.location.search = '?goto=hiring';
    window.WORLD_COLLIDES = (x, z) => { window.WORLD_COLLIDES.calls = (window.WORLD_COLLIDES.calls || 0) + 1; return false; };
    const player = fakePlayer(0, 0);
    const g = build({ city, getPlayerHandle: () => player, isReady: () => true }).resolve();
    g.apply();
    assert.ok(window.WORLD_COLLIDES.calls > 0, 'WORLD_COLLIDES was consulted');
    delete window.WORLD_COLLIDES;
  });

  test('getGotoParam: reads goto from a mixed query string, decodes it, ignores other params', () => {
    assert.strictEqual(P.getGotoParam({ location: { search: '?map=v4&goto=stall.001&room=x' } }), 'stall.001');
    assert.strictEqual(P.getGotoParam({ location: { search: '?goto=a%20b' } }), 'a b');
    assert.strictEqual(P.getGotoParam({ location: { search: '' } }), null);
    assert.strictEqual(P.getGotoParam({}), null);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
