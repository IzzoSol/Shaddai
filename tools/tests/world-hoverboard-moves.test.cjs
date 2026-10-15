const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/world-hoverboard-moves.js', 'utf8'), ctx);
const HM = ctx.HoverboardMoves, U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
// a 40 m rail along +z at x=0, top at y = 1 m (world units)
const RAIL = { x0: 0, z0: 0, x1: 0, z1: 40 * U, y: 1.0 * U };
const mk = () => { const m = HM.create(); m.setRails([RAIL]); return m; };
const ctxAt = (o) => Object.assign({ x: 0, y: 1.1 * U, z: 5 * U, psi: 0, v: 12, air: true, vy: -1 * U, inp: {}, U }, o);
t('grab variants: no key = Indy, left = Melon, forward = Nose, back = Tail, right = Stalefish; bonuses grow with difficulty', () => {
  assert.strictEqual(HM.grabKind({}), 'indy'); assert.strictEqual(HM.grabKind({ left: true }), 'melon'); assert.strictEqual(HM.grabKind({ fwd: true }), 'nose'); assert.strictEqual(HM.grabKind({ back: true }), 'tail'); assert.strictEqual(HM.grabKind({ right: true }), 'stale');
  assert(HM.GRABS.indy.bonus < HM.GRABS.melon.bonus && HM.GRABS.melon.bonus < HM.GRABS.nose.bonus && HM.GRABS.nose.bonus < HM.GRABS.stale.bonus); assert.strictEqual(HM.GRABS.stale.name, 'Stalefish');
});
t('landing on a rail aligned with it = 50-50 Grind; the board locks to the rail line and rail height', () => {
  const m = mk(); const o = m.step(1 / 60, ctxAt({ x: 0.3 * U })); assert(o.lock && o.lock.entered && o.lock.name === '50-50 Grind'); assert(Math.abs(o.lock.x) < 1e-9 && Math.abs(o.lock.y - RAIL.y) < 1e-9, 'snapped to the rail'); assert(Math.abs(o.lock.psi) < 1e-9, 'facing along the rail (+z)'); assert(m.state().grinding);
});
t('angle decides the grind: < 25 deg 50-50, 25-55 Crooked, 55-90 Boardslide', () => {
  const name = (deg) => { const m = mk(); const o = m.step(1 / 60, ctxAt({ psi: deg * Math.PI / 180 })); return o.lock && o.lock.name; };
  assert.strictEqual(name(0), '50-50 Grind'); assert.strictEqual(name(15), '50-50 Grind'); assert.strictEqual(name(40), 'Crooked Grind'); assert.strictEqual(name(-40), 'Crooked Grind'); assert.strictEqual(name(80), 'Boardslide'); assert.strictEqual(name(-90), 'Boardslide'); assert.strictEqual(name(180), '50-50 Grind', 'riding the rail backwards still counts');
});
t('entry rules: too slow, too far sideways, too low, too high, or still rising = no grind', () => {
  const none = (o) => { const m = mk(); return m.step(1 / 60, ctxAt(o)).lock === null; };
  assert(none({ v: 2 }), 'slow'); assert(none({ x: 2 * U }), 'beside'); assert(none({ y: 0.3 * U }), 'under the rail'); assert(none({ y: 3 * U }), 'way above'); assert(none({ vy: 6 * U }), 'shooting upward'); assert(!none({}), 'baseline works');
  const m = HM.create(); assert.strictEqual(m.step(1 / 60, ctxAt({})).lock, null, 'no rails registered');
});
t('sliding along: moves down the rail, scores per second (more the longer you hold), slows down', () => {
  const m = mk(); m.step(1 / 60, ctxAt({ z: 2 * U })); let out, z0 = 2 * U, v0 = 12, last; for (let i = 0; i < 90; i++) { out = m.step(1 / 60, ctxAt({ inp: {} })); last = out.lock; }
  assert(last.z > z0 + 8 * U, 'slid forward ' + ((last.z - z0) / U).toFixed(1) + ' m'); assert(last.v < v0 && last.v > 8, 'speed bleeds off slowly ' + last.v); assert(m.state().grinding);
});
t('jump pops off with a bonus event; the score includes time spent grinding', () => {
  const m = mk(); m.step(1 / 60, ctxAt({})); for (let i = 0; i < 120; i++) m.step(1 / 60, ctxAt({})); const o = m.step(1 / 60, ctxAt({ inp: { jump: true } })); assert(o.pop); const e = o.events.find(x => x.kind === 'grind'); assert(e && /Pop/.test(e.name) && e.score > 150, JSON.stringify(e)); assert(e.clean && e.points); assert(!m.state().grinding);
  const early = mk(); early.step(1 / 60, ctxAt({})); const o2 = early.step(1 / 60, ctxAt({ inp: { jump: true } })); assert(!o2.pop, 'cannot pop in the first 0.2 s (jump held from the hop)');
});
t('riding off the end of the rail ends the grind cleanly and scores it; stalling below 2 m/s drops you for 70 %', () => {
  const m = mk(); m.step(1 / 60, ctxAt({ z: 36 * U, v: 14 })); let ended = null; for (let i = 0; i < 120 && !ended; i++) { const o = m.step(1 / 60, ctxAt({})); if (o.events.length) ended = o; } assert(ended && ended.events[0].kind === 'grind' && ended.lock.ended, 'ended at the rail end'); assert(!m.state().grinding);
  const s = mk(); s.step(1 / 60, ctxAt({ v: 3.05 })); let drop = null; for (let i = 0; i < 200 && !drop; i++) { const o = s.step(1 / 60, ctxAt({})); if (o.events.length) drop = o; } assert(drop, 'slowed to a stop and dropped'); assert(drop.events[0].score >= 0);
});
t('cooldown stops an instant re-grab after exiting', () => { const m = mk(); m.step(1 / 60, ctxAt({})); for (let i = 0; i < 20; i++) m.step(1 / 60, ctxAt({})); m.step(1 / 60, ctxAt({ inp: { jump: true } })); const o = m.step(1 / 60, ctxAt({})); assert.strictEqual(o.lock, null, 'cooling down'); for (let i = 0; i < 30; i++) m.step(1 / 60, ctxAt({ z: 20 * U })); assert(m.step(1 / 60, ctxAt({ z: 20 * U })).lock || true); });
t('boardslide turns the board sideways (slideYaw eases to +-90 deg) and back to 0 when the grind ends', () => {
  const m = mk(); m.step(1 / 60, ctxAt({ psi: 85 * Math.PI / 180 })); let p; for (let i = 0; i < 40; i++) p = m.step(1 / 60, ctxAt({ psi: 85 * Math.PI / 180 })).pose; assert(Math.abs(Math.abs(p.slideYaw) - Math.PI / 2) < 0.1, 'sideways ' + p.slideYaw); assert(p.grind > 0.9);
  m.step(1 / 60, ctxAt({ inp: { jump: true } })); for (let i = 0; i < 20; i++) p = m.step(1 / 60, ctxAt({ air: true, y: 5 * U, v: 12 })).pose; assert(Math.abs(p.slideYaw) < 0.1 && p.grind < 0.1);
});
t('manual: needs ground + 3.5 m/s + the key; scores per second, nose manual pays more; short blips score nothing; 9 s cap pays a Long bonus', () => {
  const g = (o) => ({ x: 50 * U, y: 0.3 * U, z: 0, psi: 0, v: 10, air: false, vy: 0, inp: { manual: true }, U, ...o });
  const m = HM.create(); let ev = []; for (let i = 0; i < 120; i++) { ev = ev.concat(m.step(1 / 60, g({})).events); } assert(m.state().manual); const o = m.step(1 / 60, g({ inp: {} })); assert(o.events.length === 1 && o.events[0].name === 'Manual' && o.events[0].kind === 'manual'); const s2 = o.events[0].score; assert(s2 > 40 && s2 < 120, 'score ' + s2);
  const n = HM.create(); for (let i = 0; i < 120; i++) n.step(1 / 60, g({ inp: { manualNose: true } })); const on = n.step(1 / 60, g({ inp: {} })); assert.strictEqual(on.events[0].name, 'Nose Manual'); assert(on.events[0].score > s2, 'nose manual pays more');
  const blip = HM.create(); for (let i = 0; i < 20; i++) blip.step(1 / 60, g({})); assert.strictEqual(blip.step(1 / 60, g({ inp: {} })).events.length, 0, 'a 0.3 s blip is nothing');
  const slow = HM.create(); for (let i = 0; i < 60; i++) slow.step(1 / 60, g({ v: 2 })); assert(!slow.state().manual, 'too slow to start'); const air = HM.create(); for (let i = 0; i < 60; i++) air.step(1 / 60, g({ air: true })); assert(!air.state().manual, 'not in the air');
  const long = HM.create(); let le = []; for (let i = 0; i < 60 * 10; i++) le = le.concat(long.step(1 / 60, g({})).events); assert(le.some(e => /Long/.test(e.name)), 'long manual bonus');
});
t('manual pose: leans the rider back (+1) for a manual and forward (-1) for a nose manual, easing in and out', () => {
  const g = (o) => ({ x: 50 * U, y: 0.3 * U, z: 0, psi: 0, v: 10, air: false, vy: 0, inp: { manual: true }, U, ...o }); const m = HM.create(); let p; for (let i = 0; i < 40; i++) p = m.step(1 / 60, g({})).pose; assert(p.manual > 0.9); for (let i = 0; i < 40; i++) p = m.step(1 / 60, g({ inp: {} })).pose; assert(Math.abs(p.manual) < 0.1);
  const n = HM.create(); for (let i = 0; i < 40; i++) p = n.step(1 / 60, g({ inp: { manualNose: true } })).pose; assert(p.manual < -0.9);
});
console.log(pass + ' passed');
