'use strict';
const path = require('path');
const assert = require('assert');
const pub = (f) => require(path.join(__dirname, '..', '..', 'public', f));
const L = pub('world-lockon.js'), M = pub('world-combat-music.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }

function mkLock(extra) {
  const s = { player: { x: 0, z: 0, yaw: 0 }, targets: [], can: true, changes: [] };
  const lk = L.create(Object.assign({
    getPlayer: () => s.player, getTargets: () => s.targets, canLock: () => s.can,
    project: (x, y, z) => ({ x: 100 + x * 10, y: 200 - z, on: true }), onChange: (t) => s.changes.push(t && t.id)
  }, extra || {}));
  return { s, lk };
}
const T = (id, x, z, o) => Object.assign({ id, name: id, x, y: 0, z, hp: 50, maxHp: 100, alive: true }, o || {});

test('pick prefers facing target over slightly nearer one behind', () => {
  const { s, lk } = mkLock();
  s.targets = [T('behind', 0, -5), T('front', 0, 8)];
  assert.strictEqual(lk.toggle().id, 'front');
});
test('ignores dead and out-of-range targets', () => {
  const { s, lk } = mkLock();
  s.targets = [T('dead', 0, 3, { alive: false }), T('hp0', 1, 3, { hp: 0 }), T('far', 0, 25)];
  assert.strictEqual(lk.toggle(), null);
  assert.strictEqual(lk.isLocked(), false);
});
test('toggle again releases; cycle picks next', () => {
  const { s, lk } = mkLock();
  s.targets = [T('a', -3, 6), T('b', 3, 6)];
  const first = lk.toggle().id;
  const second = lk.cycle().id;
  assert.notStrictEqual(first, second);
  lk.toggle();
  assert.strictEqual(lk.isLocked(), false);
});
test('auto-release on death', () => {
  const { s, lk } = mkLock();
  s.targets = [T('a', 0, 5)]; lk.toggle(); assert.ok(lk.isLocked());
  s.targets[0].alive = false; lk.update(0.016);
  assert.strictEqual(lk.isLocked(), false);
});
test('range hysteresis: stays at 19 m, releases at 21 m', () => {
  const { s, lk } = mkLock();
  s.targets = [T('a', 0, 17)]; lk.toggle();
  s.targets[0].z = 19; lk.update(0.016); assert.ok(lk.isLocked());
  s.targets[0].z = 21; lk.update(0.016); assert.ok(!lk.isLocked());
});
test('cannot acquire beyond 18 m even though hysteresis is 20', () => {
  const { s, lk } = mkLock(); s.targets = [T('a', 0, 19)];
  assert.strictEqual(lk.toggle(), null);
});
test('canLock false (passive mode) blocks acquire and releases', () => {
  const { s, lk } = mkLock();
  s.targets = [T('a', 0, 5)]; lk.toggle(); assert.ok(lk.isLocked());
  s.can = false; lk.update(0.016); assert.ok(!lk.isLocked());
  assert.strictEqual(lk.toggle(), null);
});
test('onChange fires on lock and release', () => {
  const { s, lk } = mkLock(); s.targets = [T('a', 0, 5)];
  lk.toggle(); lk.toggle();
  assert.deepStrictEqual(s.changes, ['a', null]);
});
test('yawAssist converges toward bearing and is additive (returns delta)', () => {
  const { s, lk } = mkLock(); s.targets = [T('a', 10, 0)]; lk.toggle(); // bearing = +PI/2
  let yaw = 0; const d0 = lk.yawAssist(yaw, 0.1);
  assert.ok(d0 > 0 && d0 < Math.PI / 2);
  for (let i = 0; i < 120; i++) { s.player.yaw = yaw; yaw += lk.yawAssist(yaw, 1 / 60); }
  assert.ok(Math.abs(yaw - Math.PI / 2) < 0.01, 'yaw=' + yaw);
  assert.strictEqual(s.player.yaw === 0, false);
});
test('yawAssist takes the shortest angle across the wrap', () => {
  const { s, lk } = mkLock(); s.targets = [T('a', -1, -10)]; // bearing ~ -PI+0.1
  lk.toggle();
  const d = lk.yawAssist(Math.PI - 0.1, 0.1); // should go positive across +-PI, not swing back
  assert.ok(d > 0 && d < 0.5, 'd=' + d);
});
test('yawAssist is 0 with no lock', () => {
  const { lk } = mkLock(); assert.strictEqual(lk.yawAssist(1, 0.1), 0);
});

function stubDoc() {
  const writes = { n: 0 };
  function el() {
    const st = {}; const e = { children: [], textContent: '', style: st };
    return new Proxy(e, {
      get: (t, k) => k === 'appendChild' ? (c) => { t.children.push(c); return c; } : t[k],
      set: (t, k, v) => { t[k] = v; return true; }
    });
  }
  const mk = () => {
    const store = {};
    const style = new Proxy(store, { set: (t, k, v) => { if (t[k] !== v) writes.n++; t[k] = v; return true; }, get: (t, k) => k === 'cssText' ? '' : t[k] });
    const children = [];
    return { style, children, textContent: '', appendChild(c) { children.push(c); return c; } };
  };
  return { writes, store: null, createElement: mk, body: mk() };
}
test('felled card fires once per id, holds 1.6 s then fades and hides (fake clock)', () => {
  const doc = stubDoc();
  const { lk } = mkLock({ doc });
  assert.strictEqual(lk.felled('Wolf', 7), true);
  assert.strictEqual(lk.felled('Wolf', 7), false);
  assert.strictEqual(lk.felled('Wolf', 8), true);
  lk.update(1.5); assert.strictEqual(lk.state().cardOpacity, 1);
  lk.update(0.2); assert.ok(lk.state().cardOpacity < 1 && lk.state().cardVisible);
  lk.update(0.5); assert.strictEqual(lk.state().cardVisible, false);
});
test('DOM writes only on change (no per-frame style churn)', () => {
  const doc = stubDoc();
  const { s, lk } = mkLock({ doc });
  s.targets = [T('a', 0, 5)]; lk.toggle();
  lk.update(0.016);
  const after1 = doc.writes.n;
  for (let i = 0; i < 60; i++) lk.update(0.016);
  assert.strictEqual(doc.writes.n, after1);
  s.targets[0].x = 2; lk.update(0.016);
  assert.ok(doc.writes.n > after1);
  const after2 = doc.writes.n;
  s.targets[0].hp = 20; lk.update(0.016);
  assert.ok(doc.writes.n > after2);
});
test('overlay hides when target projects off-screen', () => {
  const doc = stubDoc(); let on = true;
  const { s, lk } = mkLock({ doc, project: () => ({ x: 5, y: 5, on }) });
  s.targets = [T('a', 0, 5)]; lk.toggle(); lk.update(0.016);
  const n = doc.writes.n; on = false; lk.update(0.016);
  assert.ok(doc.writes.n > n);
});

// ---- music ----
function fakeCtx() {
  const log = { osc: [], gains: 0 };
  const param = (v) => ({ value: v, calls: [], setValueAtTime(x, t) { this.calls.push(['set', x, t]); }, exponentialRampToValueAtTime(x, t) { this.calls.push(['exp', x, t]); }, linearRampToValueAtTime(x, t) { this.calls.push(['lin', x, t]); }, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } });
  return {
    log, currentTime: 1, sampleRate: 100, destination: {},
    createGain() { return null; },
  };
}
function ctxFactory() {
  const log = { osc: [], gains: [] };
  const param = (v) => ({ value: v, calls: [], setValueAtTime(x, t) { this.calls.push(['set', x, t]); }, exponentialRampToValueAtTime(x, t) { this.calls.push(['exp', x, t]); }, linearRampToValueAtTime(x, t) { this.calls.push(['lin', x, t]); }, cancelScheduledValues() {} });
  const base = () => ({ connect() {}, disconnect() {}, start() {}, stop() {} });
  return {
    log, currentTime: 1, sampleRate: 100, destination: {},
    createGain() { const g = Object.assign(base(), { gain: param(0) }); log.gains.push(g); return g; },
    createOscillator() { const o = Object.assign(base(), { type: '', frequency: param(0) }); log.osc.push(o); return o; },
    createBiquadFilter() { return Object.assign(base(), { type: '', frequency: param(0) }); },
    createBuffer(c, len) { const d = new Float32Array(len); return { getChannelData: () => d }; },
    createBufferSource() { return Object.assign(base(), { buffer: null, loop: false }); }
  };
}
test('music: no AudioContext is safe and tracks state', () => {
  const m = M.create();
  m.engage(); m.update(1); m.hitThud(); m.release(); m.update(3); m.dispose();
  assert.strictEqual(m.state().engaged, false);
});
test('music: engage twice creates exactly one combat stem', () => {
  const c = ctxFactory(), m = M.create({ ctx: c });
  m.engage(); const n = c.log.osc.length; m.engage(); m.engage();
  assert.strictEqual(c.log.osc.length, n);
  assert.strictEqual(m.state().stems, 1);
});
test('music: fades in on engage', () => {
  const m = M.create({ ctx: ctxFactory() });
  m.engage(); m.update(0.3); const a = m.state().level; m.update(1);
  assert.ok(a > 0 && a < 1); assert.strictEqual(m.state().level, 1);
});
test('music: release fades out over 2 s then stem is removed', () => {
  const m = M.create({ ctx: ctxFactory() });
  m.engage(); m.update(1); m.release();
  m.update(1); assert.ok(Math.abs(m.state().level - 0.5) < 1e-9);
  assert.strictEqual(m.state().stems, 1);
  m.update(1.01); assert.strictEqual(m.state().level, 0); assert.strictEqual(m.state().stems, 0);
});
test('music: 120 bpm pulse = 2 beats per second', () => {
  const m = M.create({ ctx: ctxFactory() });
  m.engage(); for (let i = 0; i < 100; i++) m.update(0.02); // 2.0 s
  assert.ok(Math.abs(m.state().beats - 4) <= 1, 'beats=' + m.state().beats);
});
test('music: re-engage after release works with a single stem', () => {
  const c = ctxFactory(), m = M.create({ ctx: c });
  m.engage(); m.update(1); m.release(); m.update(3); m.engage();
  assert.strictEqual(m.state().stems, 1);
});
test('music: hitThud envelope 180 -> 40 Hz over 0.15 s', () => {
  assert.strictEqual(M.thudFreq(0), 180); assert.strictEqual(M.thudFreq(0.15), 40); assert.strictEqual(M.thudFreq(1), 40);
  const mid = M.thudFreq(0.075); assert.ok(mid < 180 && mid > 40);
  const c = ctxFactory(), m = M.create({ ctx: c }); m.hitThud();
  const o = c.log.osc[c.log.osc.length - 1];
  assert.strictEqual(o.type, 'sine');
  assert.deepStrictEqual(o.frequency.calls, [['set', 180, 1], ['exp', 40, 1.15]]);
});

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
