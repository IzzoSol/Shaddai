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
t('draw budget: <= 14 meshes even without mergeGeometries (9 with it)', meshes <= 14);
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
console.log(ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
