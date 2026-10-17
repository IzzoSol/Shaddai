/* world-dragon-ride.test.cjs — headless tests for public/world-dragon-ride.js (+ the wild-dragon hand-off in world-dragons.js).
 * Run: node tools/tests/world-dragon-ride.test.cjs
 */
'use strict';
const path = require('path');
const assert = require('assert');
const RIDE = require(path.join(__dirname, '..', '..', 'public', 'world-dragon-ride.js'));
const DR = require(path.join(__dirname, '..', '..', 'public', 'world-dragons.js'));
const U = RIDE.U, D2R = Math.PI / 180;
const markers = require(path.join(__dirname, '..', '..', 'public', 'assets', 'world', 'markers-v4.json')).markers;

let pass = 0, fail = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { const info = fn(); pass++; console.log('  ok  ' + name + (info ? '  — ' + info : '') + '  (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
function hills(x, z) { const m = 1 / U; x *= m; z *= m; return (40 * Math.sin(x / 310) * Math.cos(z / 270) + 25 * Math.sin((x + z) / 150 + 1.3) + 10 * Math.sin(x / 47) * Math.sin(z / 53) + 10) * U; }
const flat = () => 6 * U;   // city deck level (markers sit at Z ≈ 6 m)
const M = n => markers.find(m => m.name === n);
const toGame = m => ({ x: m.pos_m[0] * U, y: m.pos_m[2] * U, z: -m.pos_m[1] * U });
function mk(over) {
  const playerPos = { x: 0, y: 6 * U, z: 0 };
  const ev = [];
  const r = RIDE.createRideCore(Object.assign({ heightAt: flat, playerPos, markers, tune: { arriveTime: 0 } }, over || {}));
  ['mount', 'dismount', 'land', 'takeoff', 'refused', 'call', 'fly', 'hover', 'stamina-empty'].forEach(n => r.on(n, d => ev.push(Object.assign({ ev: n }, d))));
  return { r, playerPos, ev, standAt(name, dx) { const g = toGame(M(name)); playerPos.x = g.x + (dx || 0) * U; playerPos.z = g.z; playerPos.y = g.y; } };
}
const IN = (o) => Object.assign({ fwd: false, back: false, left: false, right: false, climb: false, dive: false }, o || {});
function run(r, secs, input) { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) r.update(1 / 60, input); }

console.log('world-dragon-ride tests');

test('markers: PERCH_MAIN, PERCH_A–D and VEH_DRAGON_HARNESS become mount points (metres → units)', () => {
  const { r } = mk();
  const names = r.mountPoints.map(p => p.name).sort();
  assert.deepStrictEqual(names, ['PERCH_A', 'PERCH_B', 'PERCH_C', 'PERCH_D', 'PERCH_MAIN', 'VEH_DRAGON_HARNESS']);
  const main = r.pads.find(p => p.name === 'PERCH_MAIN'), g = toGame(M('PERCH_MAIN'));
  assert(Math.abs(main.x - g.x) < 1e-6 && Math.abs(main.z - g.z) < 1e-6 && Math.abs(main.y - 92.5 * U) < 1e-6, 'bad conversion');
  return r.pads.length + ' pads + harness';
});

test('mount gating: pilot.dragon skill required; must stand at a pad/harness; default hasSkill allows (dev)', () => {
  const A = mk({ hasSkill: () => false }); A.standAt('PERCH_MAIN');
  assert.strictEqual(A.r.mount('tamed'), false); assert.strictEqual(A.r.lastRefusal(), 'skill'); assert(!A.r.isRiding());
  const B = mk({ hasSkill: id => id === 'pilot.dragon' });
  B.playerPos.x = 0; B.playerPos.z = 0;
  assert.strictEqual(B.r.mount('tamed'), false); assert.strictEqual(B.r.lastRefusal(), 'far');
  B.standAt('VEH_DRAGON_HARNESS', 10);
  assert.strictEqual(B.r.mount('tamed'), true); assert(B.r.isRiding());
  const C = mk(); C.standAt('PERCH_B');
  assert(C.r.canMount() && C.r.mount('tamed') && C.r.isRiding(), 'default (no hasSkill) should allow');
  assert.strictEqual(C.r.mount('tamed'), false); assert.strictEqual(C.r.lastRefusal(), 'riding');
  return 'skill / far / riding refusals ok';
});

test('call: the tamed dragon glides in over arriveTime and you are seated on the pad top', () => {
  const A = mk({ tune: { arriveTime: 3.2 } }); A.standAt('PERCH_A');
  assert(A.r.mount('tamed'));
  assert(!A.r.isRiding() && A.r.isArriving());
  let maxStep = 0, px = A.r.dragon.x, pz = A.r.dragon.z;
  for (let i = 0; i < 60 * 4; i++) { A.r.update(1 / 60, IN()); maxStep = Math.max(maxStep, Math.hypot(A.r.dragon.x - px, A.r.dragon.z - pz) / U * 60); px = A.r.dragon.x; pz = A.r.dragon.z; }
  assert(A.r.isRiding(), 'not seated after arrival');
  assert.strictEqual(A.r.dragon.mode, 'ground');
  assert(Math.abs(A.r.dragon.y - 37.2 * U) < 1e-6, 'not on the PERCH_A top');
  assert(maxStep < 80, 'arrival teleported (' + maxStep.toFixed(0) + ' m/s)');
  return 'arrived, peak glide ' + maxStep.toFixed(0) + ' m/s';
});

test('flight: take off, cruise, bank ≤ 55° in turns, climb/dive, never below terrain + 3 m over hills', () => {
  const A = mk({ heightAt: hills }); A.standAt('VEH_DRAGON_HARNESS'); A.playerPos.y = hills(A.playerPos.x, A.playerPos.z);
  assert(A.r.mount('tamed'));
  run(A.r, 4, IN({ fwd: true, climb: true }));
  assert.strictEqual(A.r.dragon.mode, 'fly', 'did not transition hover → fly (mode ' + A.r.dragon.mode + ')');
  let maxBank = 0, minClr = Infinity, yaw0 = A.r.dragon.yaw, y0 = A.r.dragon.y;
  const seq = [[8, IN({ fwd: true, left: true })], [6, IN({ climb: true })], [5, IN({ dive: true })], [8, IN({ right: true })], [20, IN({ fwd: true })]];
  let climbed = 0, dived = 0;
  for (const [s, inp] of seq) {
    const ys = A.r.dragon.y;
    for (let i = 0; i < s * 60; i++) { A.r.update(1 / 60, inp); maxBank = Math.max(maxBank, Math.abs(A.r.dragon.bank)); minClr = Math.min(minClr, (A.r.dragon.y - hills(A.r.dragon.x, A.r.dragon.z)) / U); }
    if (inp.climb) climbed = (A.r.dragon.y - ys) / U;
    if (inp.dive) dived = (ys - A.r.dragon.y) / U;
  }
  assert(maxBank <= 55 * D2R + 1e-9 && maxBank > 20 * D2R, 'bank ' + (maxBank / D2R).toFixed(1));
  assert(minClr >= 3 - 1e-6, 'clearance ' + minClr.toFixed(2));
  assert(climbed > 20 && dived > 10, 'climb ' + climbed.toFixed(0) + ' / dive ' + dived.toFixed(0));
  const P = A.r.saddle(); assert(Math.abs(A.playerPos.x - P.x) < 1e-9 && Math.abs(A.playerPos.y - P.y) < 1e-9, 'player not on the saddle');
  const cam = A.r.camera(); const back = Math.hypot(cam.x - P.x, cam.z - P.z) / U;
  assert(back > 10 && back < 40 && cam.y > P.y - 20 * U, 'camera offset odd: ' + back.toFixed(1) + ' m back');
  void yaw0; void y0;
  return 'max bank ' + (maxBank / D2R).toFixed(1) + '°, min clearance ' + minClr.toFixed(1) + ' m, climb +' + climbed.toFixed(0) + ' m, dive −' + dived.toFixed(0) + ' m, cam ' + back.toFixed(0) + ' m back';
});

test('stamina: boost drains to empty, locks out, then regenerates after release (HUD hook)', () => {
  const A = mk(); A.standAt('VEH_DRAGON_HARNESS'); A.r.mount('tamed');
  run(A.r, 4, IN({ fwd: true, climb: true }));
  let peak = 0;
  for (let i = 0; i < 60 * 8; i++) { A.r.update(1 / 60, IN({ dive: true, climb: true })); peak = Math.max(peak, A.r.dragon.speed); }
  assert(A.r.stamina() === 0 && A.ev.some(e => e.ev === 'stamina-empty'), 'stamina ' + A.r.stamina());
  run(A.r, 0.5, IN({ dive: true }));
  assert(!A.r.boosting(), 'still boosting while exhausted');
  run(A.r, 4, IN({ fwd: true }));
  const h = A.r.hud();
  assert(h.stamina > 0.3 && h.riding && h.mode === 'fly', JSON.stringify(h));
  assert(peak > RIDE.RIDE_TUNE.speedMax + 3, 'boost never exceeded max speed (' + peak.toFixed(1) + ')');
  return 'peak boost ' + peak.toFixed(1) + ' m/s, regen to ' + h.stamina.toFixed(2);
});

test('dismount only when allowed: refused in the air; ok hovering ≤ 10 m over a pad (you step onto its top) or grounded', () => {
  const A = mk(); A.standAt('PERCH_MAIN'); A.r.mount('tamed');
  run(A.r, 4, IN({ fwd: true, climb: true }));
  assert.strictEqual(A.r.dismount(), false); assert.strictEqual(A.r.lastRefusal(), 'airborne'); assert(A.r.isRiding());
  // put the dragon in a hover 6 m over PERCH_C
  const c = toGame(M('PERCH_C')), D = A.r.dragon;
  D.mode = 'hover'; D.x = c.x + 2 * U; D.z = c.z; D.y = c.y + 6 * U; D.hv = 0; D.vy = 0;
  assert(A.r.canDismount());
  assert.strictEqual(A.r.dismount(), true);
  assert(!A.r.isRiding());
  assert(Math.abs(A.playerPos.y - c.y) < 1e-9, 'player not placed on the pad top');
  assert(Math.hypot(A.playerPos.x - c.x, A.playerPos.z - c.z) / U <= 8, 'player off the pad');
  // hovering 25 m over the pad → refused
  const B = mk(); B.standAt('PERCH_MAIN'); B.r.mount('tamed'); B.r.update(1 / 60, IN());
  Object.assign(B.r.dragon, { mode: 'hover', x: c.x, z: c.z, y: c.y + 25 * U });
  assert.strictEqual(B.r.dismount(), false);
  // grounded away from pads → beside the dragon on the terrain
  const C = mk(); C.standAt('VEH_DRAGON_HARNESS'); C.r.mount('tamed'); C.r.update(1 / 60, IN());
  assert.strictEqual(C.r.dragon.mode, 'ground');
  assert.strictEqual(C.r.dismount(), true);
  assert(Math.abs(C.playerPos.y - flat()) < 1e-9);
  assert.strictEqual(C.r.state(), 'parked');
  // re-mount the parked dragon without a pad call
  assert(C.r.mount('tamed') && C.r.isRiding() && !C.ev.filter(e => e.ev === 'call').slice(1).length, 'parked re-mount');
  return 'air refused, pad hover ok, ground ok, parked re-mount ok';
});

test('landing: descending in a hover over a perch pad snaps exactly onto its walkable top (land event names the pad)', () => {
  const A = mk(); A.standAt('PERCH_MAIN'); A.r.mount('tamed');
  run(A.r, 4, IN({ fwd: true, climb: true }));
  const d = toGame(M('PERCH_D')), D = A.r.dragon;
  Object.assign(D, { mode: 'hover', x: d.x + 1.5 * U, z: d.z - 1 * U, y: d.y + 30 * U, hv: 0, vy: 0 });
  let landed = false;
  for (let i = 0; i < 60 * 20 && !landed; i++) { A.r.update(1 / 60, IN({ dive: true })); landed = D.mode === 'ground'; }
  assert(landed, 'never touched down');
  assert.strictEqual(D.y, d.y, 'not snapped onto the PERCH_D top (Δ ' + ((D.y - d.y) / U).toFixed(3) + ' m)');
  const le = A.ev.filter(e => e.ev === 'land').pop();
  assert.strictEqual(le.perch, 'PERCH_D');
  // standing there: stays on the pad top, then can dismount
  run(A.r, 1, IN());
  assert.strictEqual(D.y, d.y);
  assert(A.r.dismount());
  // descending next to the pad (outside its radius) lands on the terrain instead
  const B = mk(); B.standAt('PERCH_MAIN'); B.r.mount('tamed'); B.r.update(1 / 60, IN());
  Object.assign(B.r.dragon, { mode: 'hover', x: d.x + 30 * U, z: d.z, y: d.y + 5 * U, hv: 0, vy: 0 });
  for (let i = 0; i < 60 * 30 && B.r.dragon.mode !== 'ground'; i++) B.r.update(1 / 60, IN({ dive: true }));
  assert.strictEqual(B.r.dragon.y, flat());
  return 'PERCH_D top ' + (d.y / U).toFixed(1) + ' m exact';
});

test('fly → hover flare: S at low speed drops into a hover; W from a hover picks flight back up', () => {
  const A = mk(); A.standAt('VEH_DRAGON_HARNESS'); A.r.mount('tamed');
  run(A.r, 4, IN({ fwd: true, climb: true }));
  assert.strictEqual(A.r.dragon.mode, 'fly');
  for (let i = 0; i < 60 * 10 && A.r.dragon.mode === 'fly'; i++) A.r.update(1 / 60, IN({ back: true }));
  assert.strictEqual(A.r.dragon.mode, 'hover');
  run(A.r, 5, IN({ fwd: true }));
  assert.strictEqual(A.r.dragon.mode, 'fly');
  return 'ok';
});

test('wild dragon: only a DEFEATED one can be ridden; the core skips it while ridden and it flies home on release', () => {
  const L = { stations: [{ id: 'w', pos: [2828 * U, 0], dragon: 'red' }] };
  const core = DR.createDragonsCore({ heightAt: () => 0, layout: L, getPlayer: () => null });
  const w = core.dragons[0];
  const A = mk({ heightAt: () => 0, dragons: { core } });
  A.playerPos.x = w.f.x + 10 * U; A.playerPos.z = w.f.z; A.playerPos.y = 0;
  assert.strictEqual(A.r.mount('w'), false); assert.strictEqual(A.r.lastRefusal(), 'wild');
  w.defeated = true; w.state = 'peaceful';
  assert.strictEqual(A.r.mount('w'), true);
  assert(w.ridden && A.r.isRiding());
  const fx = w.f.x;
  run(A.r, 3, IN({ fwd: true, climb: true }));
  for (let i = 0; i < 120; i++) core.update(1 / 60);
  assert.strictEqual(w.f.x, fx, 'core moved a ridden dragon');
  assert.strictEqual(core.hitTest({ x: w.f.x, y: w.f.y, z: w.f.z }, 5), null, 'ridden dragon hittable');
  for (let i = 0; i < 60 * 20 && A.r.dragon.mode !== 'ground'; i++) A.r.update(1 / 60, IN({ back: true, dive: true }));
  assert.strictEqual(A.r.dragon.mode, 'ground');
  assert(A.r.dismount());
  assert(!w.ridden && Math.abs(w.f.x - A.r.dragon.x) < 1e-6, 'wild dragon not released at the dismount point');
  for (let i = 0; i < 60 * 5; i++) core.update(1 / 60);
  assert(['ambient_takeoff', 'ambient'].indexOf(w.state) >= 0, 'released dragon state ' + w.state);
  return 'refused while hostile, ridden after defeat, released → ' + w.state;
});

// Allocation probe in a FRESH process: minimum new-space growth over several 2000-update bursts (bursts with a
// scavenge are discarded). Flat terrain returns a small integer, so the bytes left are the module's own plus ONE
// unavoidable 16 B box: the double dt the caller passes into update(). Any per-frame object literal adds ≥ 28 B,
// so the budget of < 24 B/update means "nothing but the dt box".
test('perf: 60 000+ riding updates (flying circles with boost) allocate no objects per frame', () => {
  const cp = require('child_process');
  const file = JSON.stringify(path.join(__dirname, '..', '..', 'public', 'world-dragon-ride.js'));
  const src = "const v8=require('v8');const ns=()=>v8.getHeapSpaceStatistics().find(s=>s.space_name==='new_space').space_used_size;" +
    "const R=require(" + file + "),U=R.U;const pp={x:0,y:0,z:0};" +
    "const r=R.createRideCore({heightAt:()=>0,playerPos:pp,markers:[{name:'VEH_DRAGON_HARNESS',pos_m:[0,0,0]}],tune:{arriveTime:0}});" +
    "r.mount('tamed');const a={fwd:true,back:false,left:true,right:false,climb:true,dive:false},b={fwd:true,back:false,left:false,right:true,climb:false,dive:true};" +
    "let n=0;const STEP=()=>{n++;r.update(1/60,(n>>7)&1?a:b);if((n&255)===0)r.hud();};" +
    "for(let i=0;i<60000;i++)STEP();let best=Infinity;for(let k=0;k<12;k++){const x=ns();for(let i=0;i<2000;i++)STEP();const y=ns();if(y>=x)best=Math.min(best,y-x);}" +
    "process.stdout.write(JSON.stringify({best,mode:r.state()}));";
  const out = JSON.parse(cp.execFileSync(process.execPath, ['-e', src], { encoding: 'utf8', timeout: 60000 }));
  assert.strictEqual(out.mode, 'fly');
  assert(out.best / 2000 < 24, (out.best / 2000).toFixed(1) + ' B/update');
  return out.best + ' B over 2000 updates (' + (out.best / 2000).toFixed(2) + ' B/update)';
});

test('element breath (2026-09-28): held breath drains stamina, stops when empty or on dismount; tamed element from opts', () => {
  const A = mk({ element: 'ice' }); A.standAt('PERCH_MAIN');
  const ev = []; A.r.on('breath', e => ev.push(e.on));
  assert(A.r.mount('tamed') && A.r.isRiding());
  run(A.r, 0.5, IN({ breath: true }));
  assert(A.r.breath().on && A.r.element() === 'ice' && A.r.stamina() < 1, 'breathing ice, draining');
  run(A.r, 10, IN({ breath: true }));
  assert(ev.indexOf(false) > 0, 'stops when stamina runs out (stamina ' + A.r.stamina().toFixed(2) + ')');
  run(A.r, 6, IN());
  run(A.r, 0.2, IN({ breath: true })); assert(A.r.breath().on);
  assert(A.r.dismount() && !A.r.breath().on, 'dismount ends the breath');
  assert(ev.length >= 4 && ev.every((v, i) => v === (i % 2 === 0)) && ev[ev.length - 1] === false, 'events ' + ev.join(','));   // resumes once stamina recovers past boostResume
  return 'on/off events ' + ev.join(',');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
