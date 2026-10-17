// world-city-heights.js — footprint raster lookup: boxes, rotation, overlaps, tiers, circles, memory.
const vm = require('vm'), fs = require('fs');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
const ctx = { console, Math, Float32Array }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/world-city-heights.js', 'utf8'), ctx);
const W = ctx.WorldCityHeights, U = 7 / 1.8;

// A: axis-aligned 20x10 m tower, 50 m tall, centred at east 100 / north 200
const plan = { buildings: [
  { x_m: 100, y_m: 200, rot_deg: 0, w_m: 20, d_m: 10, h_m: 50, tiers: [[20, 10, 0, 50, 0, 0, 0]] },
  // B: same footprint rotated 90 deg -> 10 wide (east) x 20 deep (north)
  { x_m: 400, y_m: 0, rot_deg: 90, w_m: 20, d_m: 10, h_m: 30, tiers: [[20, 10, 0, 30, 0, 0, 0]] },
  // C/D overlap: max wins
  { x_m: -100, y_m: -100, rot_deg: 0, w_m: 20, d_m: 20, h_m: 40, tiers: [[20, 20, 0, 40, 0, 0, 0]] },
  { x_m: -105, y_m: -100, rot_deg: 0, w_m: 20, d_m: 20, h_m: 90, tiers: [[20, 20, 0, 90, 0, 0, 0]] },
  // E: no tiers -> fallback box from w/d/h
  { x_m: 0, y_m: 0, rot_deg: 0, w_m: 8, d_m: 8, h_m: 12 },
  // F: podium 60 m wide x 20 m tall with a 10 m tower offset +15 m east, 80 m tall
  { x_m: -300, y_m: 300, rot_deg: 0, w_m: 60, d_m: 30, h_m: 80, tiers: [[60, 30, 0, 20, 0, 0, 0], [10, 10, 20, 60, 15, 0, 0]] },
  // G: 45 deg diamond 20x20
  { x_m: 300, y_m: -300, rot_deg: 45, w_m: 20, d_m: 20, h_m: 70, tiers: [[20, 20, 0, 70, 0, 0, 0]] }
] };
const H = W.build({ plan, U, cell: 2 });
const at = (e, n) => H.topAt(e * U, -n * U);
t('inside A = 50 m', Math.abs(at(100, 200) - 50 * U) < 1e-3);
t('A x-extent ok (east +8 inside, +14 outside)', at(108, 200) > 0 && at(114, 200) === -Infinity);
t('A z-extent ok (north +3 inside, +9 outside)', at(100, 203) > 0 && at(100, 209) === -Infinity);
t('open air = -Infinity', at(0, 1000) === -Infinity && at(-5000, 5000) === -Infinity);
t('edge cell of A found (conservative, 1 m inside)', at(109, 200) > 0 && at(100, 204) > 0);
t('B rotated 90: long axis runs north', at(400, 8) > 0 && at(408, 0) === -Infinity && at(400, 14) === -Infinity && at(404, 0) > 0);
t('overlap -> max (90 m)', Math.abs(at(-100, -100) - 90 * U) < 1e-3 && Math.abs(at(-112, -100) - 90 * U) < 1e-3);
t('only the lower box -> 40 m; beyond both -> open', Math.abs(at(-92, -100) - 40 * U) < 1e-3 && at(-80, -100) === -Infinity);
t('fallback box (no tiers)', Math.abs(at(0, 0) - 12 * U) < 1e-3);
t('podium 20 m, tower 80 m', Math.abs(at(-320, 300) - 20 * U) < 1e-3 && Math.abs(at(-285, 300) - 80 * U) < 1e-3 && at(-300 + 22, 300) > 0);
t('diamond G: corner on axis in, square-corner out', at(300, -300 + 13) > 0 && at(310, -300 - 10) === -Infinity && at(300 + 9, -300) > 0);
// footprints in world units: rotated box (THREE rotation.y) + circle
const H2 = W.build({ U, footprints: [{ x: 1000, z: 0, w: 40, d: 10, rot: 0, h: 99 }, { x: 0, z: 1000, w: 40, d: 10, rot: Math.PI / 2, h: 55 }, { x: -1000, z: -1000, r: 30, h: 77 }] });
t('footprint box rot 0 (long in x)', H2.topAt(1015, 0) === 99 && H2.topAt(1000, 20) === -Infinity);
t('footprint box rot 90deg (long in z)', H2.topAt(0, 1015) === 55 && H2.topAt(20, 1000) === -Infinity);
t('footprint circle', H2.topAt(-1000 + 20, -1000) === 77 && H2.topAt(-1000 + 20, -1000 + 20) === 77);
t('circle trims corners', H2.topAt(-1000 + 29, -1000 + 29) === -Infinity && H2.topAt(-1000, -1000 + 28) === 77);
t('empty build is safe', W.build({}).topAt(0, 0) === -Infinity);

// real data memory bound
const plan4 = JSON.parse(fs.readFileSync('public/assets/world/grid-city-v4.json', 'utf8'));
const t0 = Date.now(), R = W.build({ plan: plan4, U, cell: 2 }), ms = Date.now() - t0;
console.log('real city: ' + R.stats.nx + 'x' + R.stats.nz + ' cells, ' + R.stats.mb.toFixed(1) + ' MB, ' + R.stats.filledCells + ' filled, ' + R.stats.boxes + ' boxes, ' + ms + ' ms');
t('memory <= 16 MB at 2 m', R.stats.mb <= 16);
t('real city: tallest top ~ 320 m', (() => { let mx = -Infinity; for (let x = -1700; x <= 1700; x += 4) for (let y = -1700; y <= 1700; y += 4) mx = Math.max(mx, R.topAt(x * U, -y * U)); return mx / U > 300 && mx / U < 330; })());
console.log(ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
