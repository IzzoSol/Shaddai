// world-race-track.js — anti-grav track geometry: path smoothing, deck profile over dips, banking, ride surface, draw budget.
const vm = require('vm'), fs = require('fs');
const THREE = require('../ual/node_modules/three/build/three.cjs');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
const g2d = new Proxy({}, { get: () => function () { } });
const ctx = { console, THREE, Math, document: { createElement: () => ({ getContext: () => g2d, width: 0, height: 0 }) } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['world-race.js', 'world-race-track.js']) vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), ctx);
const U = 7 / 1.8, B = ctx.buildRaceTrack, P = B.pure;

// pure: resample keeps a closed loop at even spacing
const sq = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 400 }, { x: 0, z: 400 }];
const rs = P.resample(sq, 10), gaps = rs.map((p, i) => Math.hypot(rs[(i + 1) % rs.length].x - p.x, rs[(i + 1) % rs.length].z - p.z));
t('resample: many even samples', rs.length > 100 && Math.max(...gaps.slice(0, -1)) < 10.5 && Math.min(...gaps.slice(0, -1)) > 9.5);
// pure: deck bridges a dip and never goes under ground + clearance
const ground = Array.from({ length: 200 }, (_, i) => (i > 90 && i < 110 ? -30 : 0));
const deck = P.deckProfile(ground, 2, 10, 1.5);
t('deck: never below ground + clearance', deck.every((d, i) => d >= ground[i] + 2 - 1e-9));
t('deck: dip is bridged (deck stays near the rim height)', deck[100] > -5);
t('deck: grade limited', deck.every((d, i) => Math.abs(d - deck[(i + 1) % deck.length]) <= 1.5 + 1e-9));
// pure: banking is zero on a straight, signed and capped in a turn
const stadium = []; for (let i = 0; i <= 10; i++) stadium.push({ x: i * 60, z: 0 }); for (let i = 1; i < 12; i++) stadium.push({ x: 600 + 120 * Math.sin(i / 12 * Math.PI), z: 120 - 120 * Math.cos(i / 12 * Math.PI) }); for (let i = 10; i >= 0; i--) stadium.push({ x: i * 60, z: 240 }); for (let i = 1; i < 12; i++) stadium.push({ x: -120 * Math.sin(i / 12 * Math.PI), z: 120 + 120 * Math.cos(i / 12 * Math.PI) });
const bk = P.bankProfile(P.resample(stadium, 10), 0.25, 9);
t('bank: capped', bk.every(b => Math.abs(b) <= 0.25 + 1e-9));
t('bank: corners bank, straights do not', Math.max(...bk.map(Math.abs)) > 0.1 && bk.some(b => Math.abs(b) < 0.02));

// full build on dragon-gate over terrain with a 25 m dip
const groundAt = (x, z) => { const xm = x / U, zm = -z / U; return (Math.hypot(xm - 2100, zm + 300 - 0) < 60 ? -25 : 0) * U; };
const scene = new THREE.Scene();
const tr = B({ THREE, scene, groundAt, WorldRace: ctx.WorldRace, circuit: 'dragon-gate', U });
t('built', !!tr && tr.group.parent === scene);
t('length ~1.57 km', Math.abs(tr.lengthM - 1570) < 60);
let meshes = 0, nan = false; tr.group.traverse(o => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) { nan = true; break; } } });
t('no NaN vertices', !nan);
console.log('  meshes in the built track:', meshes);
t('draw budget: <= 24 meshes even without mergeGeometries (2026-10-11: + force field, markings, sector gates, gate towers; 9 base)', meshes <= 24);
const F = tr.frames;
t('deck up vectors point up', F.every(f => f.N.y > 0.9));
const f0 = F[5], y0 = tr.surfaceAt(f0.P.x, f0.P.z);
t('surfaceAt on the centreline = deck height', y0 !== null && Math.abs(y0 - f0.P.y) < 0.5 * U);
t('surfaceAt off the track = null', tr.surfaceAt(f0.P.x + 200 * U, f0.P.z + 200 * U) === null);
t('pylons where the deck crosses the dip', !!tr.group.getObjectByName('track-pylons'));
t('4 boost pads, boostAt true on one', tr.pads.length === 4 && tr.boostAt(F[tr.pads[0]].P.x, F[tr.pads[0]].P.z));
t('gantries + chevrons placed', !!tr.group.getObjectByName('track-gantries') && !!tr.group.getObjectByName('track-chevrons'));
// figure-8 crossing = flyover: where two strands overlap in plan, decks differ by >= 8 m (no barrier across the other road)
let minSep = Infinity; const n = F.length;
for (let i = 0; i < n; i++) for (let k = i + 30; k < n; k++) { if (Math.min(k - i, n - (k - i)) < 30) continue; if (Math.hypot(F[i].P.x - F[k].P.x, F[i].P.z - F[k].P.z) < 4 * U) minSep = Math.min(minSep, Math.abs(F[i].P.y - F[k].P.y)); }
t('figure-8 crossing is a flyover (>= 8 m vertical separation), sep=' + (minSep / U).toFixed(1) + ' m', minSep >= 8 * U);

// ── S2.2 obstacles: optional obstacleAt(x,z) keeps the deck above buildings; absent = unchanged ──
const wide = (x, z) => 0;
const blocks = [];   // synthetic tower field across the first part of dragon-gate: 40 m wide towers every 60 m, 60-90 m tall
const rawDG = ctx.WorldRace.trackWorld('dragon-gate', U);
for (let i = 0; i < 12; i++) { const a = rawDG[i % rawDG.length], b = rawDG[(i + 1) % rawDG.length]; blocks.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: 22 * U, h: (60 + (i % 4) * 10) * U }); }
const obstacleAt = (x, z) => { let m = -Infinity; for (const b of blocks) if (Math.hypot(x - b.x, z - b.z) <= b.r && b.h > m) m = b.h; return m; };
const plain = B({ THREE, groundAt: wide, WorldRace: ctx.WorldRace, circuit: 'dragon-gate', U });
const same = B({ THREE, groundAt: wide, WorldRace: ctx.WorldRace, circuit: 'dragon-gate', U, obstacleAt: undefined });
t('no obstacleAt: identical deck', plain.frames.every((f, i) => f.P.y === same.frames[i].P.y));
const ob = B({ THREE, groundAt: wide, WorldRace: ctx.WorldRace, circuit: 'dragon-gate', U, obstacleAt });
let minClr = Infinity, maxDeck = 0;
for (const f of ob.frames) for (let l = -7; l <= 7; l += 1.75) { const x = f.P.x + f.S.x * l * U, z = f.P.z + f.S.z * l * U, top = obstacleAt(x, z); if (top > -Infinity) minClr = Math.min(minClr, f.P.y + f.S.y * l * U - top); }
for (const f of ob.frames) maxDeck = Math.max(maxDeck, f.P.y);
t('obstacles: every deck sample clears obstacle + 10 m over its width, min=' + (minClr / U).toFixed(1) + ' m', minClr >= 10 * U);
t('obstacles: deck stays under ground + 250 m', maxDeck <= 250 * U + 1);
t('obstacles: deck actually lifted over the towers', maxDeck > 70 * U);
const pyl = ob.group.getObjectByName('track-pylons');
let inside = 0; if (pyl) { const m4 = new THREE.Matrix4(); for (let i = 0; i < pyl.count; i++) { pyl.getMatrixAt(i, m4); const p = new THREE.Vector3().setFromMatrixPosition(m4); if (obstacleAt(p.x, p.z) > 1 * U) inside++; } }
t('obstacles: no pylon stands inside a footprint (pylons=' + (pyl ? pyl.count : 0) + ')', inside === 0);
t('obstacles: surfaceAt still rides the deck', Math.abs(ob.surfaceAt(ob.frames[5].P.x, ob.frames[5].P.z) - ob.frames[5].P.y) < 0.5 * U);

// real data: grid-city-v4 heights under the 'quarter-loop' circuit on flat ground
{
  const vm2 = require('vm'); const c2 = { console, Math, Float32Array }; c2.window = c2; vm2.createContext(c2);
  vm2.runInContext(fs.readFileSync('public/world-city-heights.js', 'utf8'), c2);
  const plan = JSON.parse(fs.readFileSync('public/assets/world/grid-city-v4.json', 'utf8'));
  const H = c2.WorldCityHeights.build({ plan, U, cell: 2 });
  const q = B({ THREE, groundAt: wide, WorldRace: ctx.WorldRace, circuit: 'quarter-loop', U, obstacleAt: H.topAt });
  let mc = Infinity, mx = 0, sum = 0, hi = 0;
  for (const f of q.frames) {
    mx = Math.max(mx, f.P.y); sum += f.P.y; if (f.P.y > 20 * U) hi++;
    for (let l = -7; l <= 7; l += 1.75) { const top = H.topAt(f.P.x + f.S.x * l * U, f.P.z + f.S.z * l * U); if (top > -Infinity) mc = Math.min(mc, f.P.y + f.S.y * l * U - top); }
  }
  console.log('quarter-loop real city: length ' + q.lengthM.toFixed(0) + ' m, max deck ' + (mx / U).toFixed(0) + ' m, mean deck ' + (sum / q.frames.length / U).toFixed(0) + ' m, ' + (100 * hi / q.frames.length).toFixed(0) + '% > 20 m, min clearance ' + (mc / U).toFixed(1) + ' m, heights ' + H.stats.mb.toFixed(1) + ' MB');
  t('real city quarter-loop: min clearance >= 10 m', mc >= 10 * U - 1e-6);
  t('real city quarter-loop: max deck <= 250 m', mx <= 250 * U + 1);
}
console.log(ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
