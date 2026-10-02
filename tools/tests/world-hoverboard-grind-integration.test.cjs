'use strict';
// Integration: the REAL hoverboard physics + trick core + moves module (rails, manuals, grab names). node tools/tests/world-hoverboard-grind-integration.test.cjs
const path = require('path'), assert = require('assert');
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
global.window = {};
['world-hoverboard-moves.js', 'world-hoverboards.js', 'world-hoverboard.js'].forEach(f => require(path.join(__dirname, '..', '..', 'public', f)));
const U = 7 / 1.8; let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); process.exitCode = 1; } };
const IN = o => Object.assign({ fwd: false, back: false, left: false, right: false, boost: false, jump: false }, o || {});
function mk() { const scene = new T.Scene(), playerPos = new T.Vector3(0, 0, 0); const h = window.buildWorldHoverboard({ THREE: T, scene, playerPos, heightAt: () => 0, worldHalf: 1e7, colliders: [] }); const ev = []; h.onTrick(e => ev.push(e)); h.mount(null, { yaw: 0 }); return { h, scene, playerPos, ev, run(secs, inp) { for (let i = 0; i < Math.round(secs * 60); i++) h.update(1 / 60, inp, h.heading()); } }; }
t('the board exposes the moves module and accepts rails', () => { const { h } = mk(); assert(h.moves && typeof h.moves.setRails === 'function'); });
t('riding into a rail at speed locks you to it (50-50), keeps you on the rail line and height, and scores while sliding', () => {
  const w = mk(); w.h.moves.setRails([{ x0: 0, z0: 60 * U, x1: 0, z1: 200 * U, y: 0.5 * U }]); w.run(0.5, IN({ fwd: true }));
  let locked = false, y = null; for (let i = 0; i < 60 * 12 && !locked; i++) { w.h.update(1 / 60, IN({ fwd: true }), w.h.heading()); if (w.h.moves.state().grinding) { locked = true; y = w.h.state().y; } }
  assert(locked, 'reached the rail and locked (z=' + (w.h.state().z / U).toFixed(1) + ' m)'); assert(Math.abs(y - 0.5 * U) < 0.05 * U, 'board at rail height ' + y / U); w.run(1.0, IN({ fwd: true })); assert(Math.abs(w.h.state().x) < 0.05 * U, 'on the rail line'); assert(w.h.moves.state().grinding, 'still grinding');
  w.run(0.2, IN({ fwd: true, jump: true })); const g = w.ev.filter(e => e.kind === 'grind'); assert(g.length === 1 && /Pop/.test(g[0].name) && g[0].score > 40, JSON.stringify(g)); assert(!w.h.moves.state().grinding, 'popped off');
});
t('after popping off the board is airborne (ballistic), then lands and the score total includes the grind', () => {
  const w = mk(); w.h.moves.setRails([{ x0: 0, z0: 40 * U, x1: 0, z1: 300 * U, y: 0.5 * U }]); for (let i = 0; i < 60 * 12 && !w.h.moves.state().grinding; i++) w.h.update(1 / 60, IN({ fwd: true }), w.h.heading()); w.run(0.6, IN({ fwd: true })); w.run(0.1, IN({ fwd: true, jump: true })); assert(w.h.state().air || w.h.state().vy > 0, 'airborne after the pop');
  w.run(4, IN()); assert(!w.h.state().air, 'landed'); assert(w.h.tricks.state.total >= 40, 'grind points banked: ' + w.h.tricks.state.total);
});
t('riding off the end of a short rail drops you into the air and keeps going without errors', () => {
  const w = mk(); w.h.moves.setRails([{ x0: 0, z0: 40 * U, x1: 0, z1: 60 * U, y: 0.5 * U }]); let grinded = false; for (let i = 0; i < 60 * 14; i++) { w.h.update(1 / 60, IN({ fwd: true }), w.h.heading()); if (w.h.moves.state().grinding) grinded = true; } assert(grinded, 'grabbed it'); assert(!w.h.moves.state().grinding, 'left the end'); assert(w.ev.some(e => e.kind === 'grind'), 'scored'); assert(w.h.state().z / U > 60, 'carried on past the rail');
});
t('manual: hold the key at speed -> nose lifts and the rider leans back; release scores a Manual', () => {
  const w = mk(); w.run(2.5, IN({ fwd: true })); const v0 = w.h.speedMS(); assert(v0 > 5, 'speed ' + v0); w.run(1.5, IN({ fwd: true, manual: true })); assert(w.h.moves.state().manual, 'balancing'); w.run(0.2, IN({ fwd: true })); const m = w.ev.filter(e => e.kind === 'manual'); assert(m.length === 1 && m[0].name === 'Manual' && m[0].score > 20, JSON.stringify(m));
  const n = mk(); n.run(2.5, IN({ fwd: true })); n.run(1.5, IN({ fwd: true, manualNose: true })); n.run(0.2, IN({ fwd: true })); assert(n.ev.some(e => e.name === 'Nose Manual'));
});
t('grab styles: Melon / Nose / Tail / Stalefish are named and scored higher than Indy', () => {
  const grab = (kind) => { const w = mk(); w.run(2, IN({ fwd: true })); w.run(0.1, IN({ fwd: true, jump: true })); w.run(0.2, IN({ boost: true, grabKind: kind })); for (let i = 0; i < 90; i++) w.h.update(1 / 60, IN({ boost: true, grab: true, grabKind: kind }), w.h.heading()); w.run(6, IN()); return w.ev.find(e => e.kind === 'grab'); };
  const indy = grab('indy'), stale = grab('stale'), melon = grab('melon'); assert(indy && /Grab/.test(indy.name), JSON.stringify(indy)); assert(stale && /Stalefish/.test(stale.name), JSON.stringify(stale)); assert(melon && /Melon/.test(melon.name)); assert(stale.score >= indy.score, 'stalefish ' + stale.score + ' vs indy ' + indy.score);
});
t('a rail in the way never breaks plain riding when the moves are disabled', () => { const w = mk(); w.h.moves.setRails([]); w.run(5, IN({ fwd: true })); assert(w.h.speedMS() > 5 && !w.h.moves.state().grinding); });
console.log(pass + ' passed');
