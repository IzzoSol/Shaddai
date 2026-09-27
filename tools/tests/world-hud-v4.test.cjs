'use strict';
/**
 * tools/tests/world-hud-v4.test.cjs — tests for public/world-hud-v4.js (fake window/document in a vm context, no deps).
 * The fake DOM counts every write (textContent / className / style.* / appendChild / removeChild) independently of the HUD.
 * Run: node tools/tests/world-hud-v4.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
let DOM_WRITES = 0;

function fakeEl(tag) {
  const style = new Proxy({}, { set(o, k, v) { if (o[k] !== v) DOM_WRITES++; o[k] = v; return true; } });
  let text = '', cls = '';
  const e = {
    tagName: tag.toUpperCase(), style, children: [], parentNode: null, id: '', attrs: {},
    get textContent() { return text; }, set textContent(v) { DOM_WRITES++; text = String(v); },
    get className() { return cls; }, set className(v) { DOM_WRITES++; cls = String(v); },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { DOM_WRITES++; this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { DOM_WRITES++; this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; },
  };
  return e;
}
function allText(n) { return (n.textContent || '') + n.children.map(allText).join(''); }
function find(n, cls) { if ((' ' + n.className + ' ').indexOf(' ' + cls + ' ') >= 0) return n; for (const c of n.children) { const r = find(c, cls); if (r) return r; } return null; }
function has(n, cls) { return (' ' + n.className + ' ').indexOf(' ' + cls + ' ') >= 0; }

const document = { head: fakeEl('head'), body: fakeEl('body'), createElement: fakeEl,
  getElementById(id) { const walk = n => n.id === id ? n : n.children.reduce((a, c) => a || walk(c), null); return walk(this.head) || walk(this.body); } };
const window = {};
const ctx = { window, document, Math, console, JSON, Object, Array, String, Number, isFinite, Error };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'world-hud-v4.js'), 'utf8'), ctx, { filename: 'world-hud-v4.js' });
const build = window.buildHudV4, P = build.pure;

// fake dragons api (same surface as world-dragons.js: on/off/stats/core.byId/dragons)
function fakeDragons() {
  const L = {}, drg = [{ id: 'st-n', name: 'Fire Dragon of North Gate', hp: 1200, hpMax: 1200, defeated: false }];
  const core = { attacker: null, byId: id => drg.find(d => d.id === id) || null };
  return {
    core, dragons: drg,
    on(ev, cb) { (L[ev] = L[ev] || []).push(cb); return () => { L[ev] = L[ev].filter(f => f !== cb); }; },
    off(ev, cb) { L[ev] = (L[ev] || []).filter(f => f !== cb); },
    emit(ev, d) { (L[ev] || []).slice().forEach(f => f(d)); },
    stats() { return { attacker: core.attacker, dragons: drg.length }; },
    count() { return Object.values(L).reduce((a, l) => a + l.length, 0); },
  };
}

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }
function step(h, secs) { for (let i = 0; i < Math.round(secs / (1 / 60)); i++) h.update(1 / 60); }

console.log('world-hud-v4');

test('hpLevel colour thresholds: ok >= 35, warn < 35, crit < 15', () => {
  assert.strictEqual(P.hpLevel(100), 'ok'); assert.strictEqual(P.hpLevel(35), 'ok');
  assert.strictEqual(P.hpLevel(34.9), 'warn'); assert.strictEqual(P.hpLevel(15), 'warn');
  assert.strictEqual(P.hpLevel(14.9), 'crit'); assert.strictEqual(P.hpLevel(0), 'crit');
});

test('HP row class follows thresholds in the DOM', () => {
  let hp = 100; const h = build({ getHP: () => hp, getStamina: () => 1, reducedMotion: true });
  const row = find(h._debug().root, 'hv-hp');
  step(h, 0.2); assert.ok(has(row, 'ok'));
  hp = 30; step(h, 0.2); assert.ok(has(row, 'warn'), row.className);
  hp = 10; step(h, 0.2); assert.ok(has(row, 'crit'), row.className);
  hp = 80; step(h, 0.2); assert.ok(has(row, 'ok'), row.className);
  h.dispose();
});

test('throttle: no DOM writes when values are unchanged; ≤ 10 renders/s when changing', () => {
  let hp = 70, st = 0.5; const h = build({ getHP: () => hp, getStamina: () => st, reducedMotion: true });
  step(h, 0.5);
  const w0 = DOM_WRITES; step(h, 3); assert.strictEqual(DOM_WRITES - w0, 0, 'writes while idle');
  // change every frame for 1 s → HP renders at most ~10×
  const row = find(h._debug().root, 'hv-hp'), num = find(row, 'hv-num');
  let numWrites = 0; const desc = Object.getOwnPropertyDescriptor(num, 'textContent');
  Object.defineProperty(num, 'textContent', { get: desc.get, set(v) { numWrites++; desc.set(v); } });
  for (let i = 0; i < 60; i++) { hp = 70 - i * 0.5; h.update(1 / 60); }
  assert.ok(numWrites <= 11 && numWrites >= 8, 'hp text writes = ' + numWrites);
  h.dispose();
});

test('hit flash on HP drop (and none with reduced motion)', () => {
  let hp = 100; const h = build({ getHP: () => hp, reducedMotion: false });
  const fl = find(h._debug().root, 'hv-flash');
  step(h, 0.2); assert.ok(!has(fl, 'on'));
  hp = 80; step(h, 0.12); assert.ok(has(fl, 'on'));
  step(h, 0.5); assert.ok(!has(fl, 'on'));
  h.dispose();
  let hp2 = 100; const h2 = build({ getHP: () => hp2, reducedMotion: true });
  const fl2 = find(h2._debug().root, 'hv-flash'); step(h2, 0.2); hp2 = 50; step(h2, 0.12); assert.ok(!has(fl2, 'on'));
  h2.dispose();
});

test('toasts: capped at 4, expire after 3 s, SPARKS rendered in gold span', () => {
  const h = build({ reducedMotion: true });
  const box = find(h._debug().root, 'hv-toasts');
  for (let i = 0; i < 7; i++) assert.ok(h.ping({ type: 'sparks', sparks: 5, text: 'Class complete #' + i }));
  assert.strictEqual(box.children.length, 4); assert.strictEqual(h._debug().toasts, 4);
  assert.ok(allText(box.children[0]).indexOf('#3') >= 0, 'oldest dropped first');
  const sp = find(box.children[3], 'hv-sp'); assert.ok(sp && sp.textContent === '+5 SPARKS');
  assert.strictEqual(allText(box.children[3]), '+5 SPARKS · Class complete #6');
  step(h, 2.9); assert.strictEqual(box.children.length, 4);
  step(h, 0.3); assert.strictEqual(box.children.length, 0);
  assert.strictEqual(h.ping(null), false); assert.strictEqual(h.ping({}), true);   // {} → generic "Info"
  h.dispose();
});

test('formatPing: city plot/art events and generic shapes', () => {
  const f = P.formatPing;
  assert.strictEqual(f({ type: 'plot', plot_id: 'PLOT-SW-0012', state: 'claimed' }).text, 'Plot PLOT-SW-0012 claimed');
  assert.strictEqual(f({ type: 'art', slot_id: 'A1', filled: true }).text, 'Art placed');
  assert.strictEqual(f({ type: 'art', slot_id: 'A1', filled: false }).text, 'Art slot cleared');
  const s = f({ type: 'sink', sparks: -12, text: 'Plot rent' }); assert.strictEqual(s.sparks, '−12 SPARKS'); assert.strictEqual(s.kind, 'sink');
  assert.strictEqual(f({ type: 'class_complete' }).text, 'Class complete');
  assert.strictEqual(f({ type: 'sparks', amount: 3 }).sparks, '+3 SPARKS');
  assert.strictEqual(f({ type: 'x"><img', text: 'hi' }).kind, 'ximg');   // class-safe
});

test('boss bar: engages on telegraph, tracks hurt HP, fades 4 s after last contact', () => {
  const D = fakeDragons(); const h = build({ dragons: D, reducedMotion: true });
  const bossEl = find(h._debug().root, 'hv-boss');
  step(h, 0.2); assert.ok(!has(bossEl, 'on'));
  D.emit('telegraph', { id: 'st-n', kind: 'roar' }); step(h, 0.12);
  assert.ok(has(bossEl, 'on')); assert.strictEqual(find(bossEl, 'hv-boss-name').textContent, 'Fire Dragon of North Gate');
  D.dragons[0].hp = 600; D.emit('hurt', { id: 'st-n', hp: 600, hpMax: 1200 }); step(h, 0.12);   // real api: d.hp is set before 'hurt' fires
  assert.strictEqual(find(bossEl, 'hv-boss-pct').textContent, '50%');
  step(h, 3.5); assert.ok(has(bossEl, 'on'), 'still up at 3.7 s');
  step(h, 0.6); assert.ok(!has(bossEl, 'on'), 'faded after 4 s without contact');
  h.dispose();
});

test('boss bar: attacker token keeps it up; defeated fades it (1.5 s hold)', () => {
  const D = fakeDragons(); const h = build({ dragons: D, reducedMotion: true });
  const bossEl = find(h._debug().root, 'hv-boss');
  D.core.attacker = 'st-n'; step(h, 6); assert.ok(has(bossEl, 'on'), 'held by stats().attacker');
  D.core.attacker = null; D.dragons[0].hp = 0; D.dragons[0].defeated = true;
  D.emit('downed', { id: 'st-n' }); D.emit('defeated', { id: 'st-n', name: D.dragons[0].name }); step(h, 0.12);
  assert.ok(has(bossEl, 'down')); assert.ok(/defeated/.test(find(bossEl, 'hv-boss-name').textContent));
  step(h, 1.6); assert.ok(!has(bossEl, 'on'), 'faded after defeat');
  D.emit('telegraph', { id: 'st-n' }); step(h, 0.2); assert.ok(!has(bossEl, 'on'), 'a defeated dragon never re-engages');
  h.dispose();
});

test('setBoss manual + null hides', () => {
  const h = build({ reducedMotion: true }); const bossEl = find(h._debug().root, 'hv-boss');
  h.setBoss('Colossus', 0.4); h.update(0.016); assert.ok(has(bossEl, 'on')); assert.strictEqual(find(bossEl, 'hv-boss-pct').textContent, '40%');
  h.setBoss(null); h.update(0.016); assert.ok(!has(bossEl, 'on'));
  h.dispose();
});

test('pack indicator follows wildlife.stats().hostile', () => {
  const st = { hostile: 0 }; const h = build({ wildlife: { stats: () => st }, reducedMotion: true });
  const pk = find(h._debug().root, 'hv-pack'); step(h, 0.2); assert.ok(!has(pk, 'on'));
  st.hostile = 3; step(h, 0.12); assert.ok(has(pk, 'on')); assert.ok(/3/.test(allText(pk)));
  st.hostile = 0; step(h, 0.12); assert.ok(!has(pk, 'on'));
  h.dispose();
});

test('dispose removes DOM + dragon listeners; calls after dispose are no-ops', () => {
  const D = fakeDragons(); const before = document.body.children.length;
  const h = build({ dragons: D }); assert.strictEqual(document.body.children.length, before + 1); assert.ok(D.count() > 0);
  h.dispose(); assert.strictEqual(document.body.children.length, before); assert.strictEqual(D.count(), 0);
  assert.strictEqual(document.getElementById('hud-v4-style'), null);
  h.update(0.1); assert.strictEqual(h.ping({ type: 'x', text: 'y' }), false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
