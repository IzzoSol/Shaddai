// world-vfx.js — budgets, ring buffer, partial uploads, zero-alloc update, trails, soft material, draw budget.
const THREE = require('../ual/node_modules/three/build/three.cjs');
const V = require('../../public/world-vfx.js');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); camera.position.set(0, 5, 20);
const flashes = [];
const lightsBefore = (() => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; })();
const E = V.create({ THREE, scene, camera, getTier: () => 'MEDIUM', flash: (p, c, i, ms) => flashes.push([i, ms]) });

// budgets
const P = V.pure;
t('budget POTATO', P.budget('POTATO').total === 4000);
t('budget LOW', P.budget('LOW').total === 8000);
t('budget MEDIUM', P.budget('MEDIUM').total === 20000);
t('budget HIGH', P.budget('HIGH').total === 40000);
t('budget ULTRA', P.budget('ULTRA').total === 60000);
t('budget split 70/30', P.budget('HIGH').add === 28000 && P.budget('HIGH').normal === 12000);
['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'].forEach(n => { E.setTier(n); t('engine cap ' + n, E.stats().cap === V.TIER_BUDGET[n]); });
E.setTier(2);
t('setTier by index', E.getTier() === 'MEDIUM' && E.stats().cap === 20000);
t('atlas null in node, no crash', E.atlas === null && V.makeAtlas(THREE) === null);
t('CELLS exposed', ['dot', 'smoke', 'spark', 'ring', 'chevron', 'scorch', 'footprint', 'drop'].every(k => V.CELLS[k] && V.CELLS[k].u1 > V.CELLS[k].u0));

// burst spawns only its slot range
const A = E.systems[0], N = E.systems[1];
const before = Float32Array.from(A.p0);
const n1 = E.burst('hit', { x: 1, y: 2, z: 3 });
t('hit spawns 15', n1 === 15);
let changed = 0, outside = 0;
for (let i = 0; i < A.p0.length; i++) if (A.p0[i] !== before[i]) { changed++; if (i >= 15 * 3) outside++; }
t('only slots 0..14 written', changed > 0 && outside === 0);
t('addUpdateRange called on p0', A.aP0.updateRanges.length >= 1 && A.aP0.updateRanges[0].start === 0 && A.aP0.updateRanges[0].count === 45);
t('head advanced', A.head === 15);
t('dust goes to normal system', E.burst('dust', { x: 0, y: 0, z: 0 }) === 20 && N.head === 20);
t('muzzle triggers flash callback only', E.burst('muzzle', { x: 0, y: 0, z: 0 }) === 12 && flashes.length === 1 && flashes[0][1] === 90);
t('presets counts', E.burst('boost', { x: 0, y: 0, z: 0 }) === 30 && E.burst('loot', { x: 0, y: 0, z: 0 }) === 30 && E.burst('splash', { x: 0, y: 0, z: 0 }) === 80 && E.burst('levelup', { x: 0, y: 0, z: 0 }) === 150 && E.burst('portal', { x: 0, y: 0, z: 0 }) === 200);
t('unknown kind ignored', E.burst('nope', { x: 0, y: 0, z: 0 }) === 0);
t('opts override count', E.burst('hit', { x: 0, y: 0, z: 0 }, { count: 7 }) === 7);
t('per-category cap', E.burst('hit', { x: 0, y: 0, z: 0 }, { count: 9999 }) === V.CAPS.hit);

// ring wrap + range split at the tail
E.setTier('POTATO'); // add cap 2800
const cap = A.cap; A.head = cap - 10;
const w = E.burst('levelup', { x: 5, y: 5, z: 5 }, { count: 100 });
t('wraps ring', w === 35 && A.head === 25);
const rs = A.aP0.updateRanges, last2 = rs.slice(-2);
t('wrap splits into two ranges', last2.length === 2 && last2[0].start === (cap - 10) * 3 && last2[0].count === 30 && last2[1].start === 0 && last2[1].count === 75);
// count never exceeds cap even with absurd overrides on a tiny tier
t('never exceeds system cap', E.burst('portal', { x: 0, y: 0, z: 0 }, { count: 1e6 }) <= V.CAPS.portal);
// many bursts: ranges list stays bounded
for (let i = 0; i < 200; i++) E.burst('hit', { x: 0, y: 0, z: 0 });
t('update ranges stay bounded', A.aP0.updateRanges.length <= 26);
t('head stays in range', A.head >= 0 && A.head < A.cap);
E.setTier('MEDIUM');

// update: no allocation / identity stable
const arrs = [A.p0, A.v0, A.life, A.col, A.aP0.array], geoA = A.geo, ptsA = A.pts;
const decalMesh = E.decals.mesh;
const tr = E.trail({ n: 16, width: 0.5, color: 0x66ccff });
for (let i = 0; i < 5000; i++) E.update(1 / 60);
t('update keeps array identity', arrs.every((a, i) => a === [A.p0, A.v0, A.life, A.col, A.aP0.array][i]) && geoA === A.geo && ptsA === A.pts && decalMesh === E.decals.mesh);
const s = E.stats();
t('stats shape', typeof s.live === 'number' && s.cap === 20000 && typeof s.cpuMs === 'number');
t('everything dead after 83s', s.live === 0);
E.burst('hit', { x: 0, y: 0, z: 0 }); t('live > 0 after burst', E.stats().live === 15);
if (global.gc) { global.gc(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 20000; i++) E.update(1 / 60); global.gc(); t('update heap growth small', process.memoryUsage().heapUsed - h0 < 1.5e6); }

// trail
const arr0 = tr.positions, hist0 = tr.hist, pv = { x: 0, y: 0, z: 0 };
for (let i = 0; i < 1000; i++) { pv.x = i * 0.1; pv.y = Math.sin(i * 0.1); pv.z = 0; tr.push(pv); }
t('trail keeps Float32Array instances', tr.positions === arr0 && tr.hist === hist0 && arr0 instanceof Float32Array);
t('trail count capped at n', tr.count() === 16);
let nan = false; for (let i = 0; i < arr0.length; i++) if (!isFinite(arr0[i])) nan = true;
t('trail finite', !nan);
t('trail draw range', tr.mesh.geometry.drawRange.count === 15 * 6);
tr.clear(); t('trail clear', tr.count() === 0 && tr.mesh.geometry.drawRange.count === 0);

// decals
E.decals.add({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 'scorch', 2, 5);
for (let i = 0; i < 100; i++) E.decals.add({ x: i, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 'footprint', 1, 3);
t('decals capped at 64 instances', E.decals.mesh.count === 64 && E.decals.mesh.isInstancedMesh);

// soft material
const m = V.softPointsMaterial(THREE, { color: 0xff8800, size: 0.5, additive: true, opacity: 0.6 });
t('softPoints is ShaderMaterial', m.isShaderMaterial && m.transparent === true && m.depthWrite === false);
t('softPoints size/opacity accessors', m.size === 0.5 && (m.opacity = 0.3, m.uniforms.uOpacity.value === 0.3));
t('softPoints additive', m.blending === THREE.AdditiveBlending && V.softPointsMaterial(THREE, { additive: false }).blending === THREE.NormalBlending);
const pt = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), m);
t('usable with THREE.Points', pt.isPoints);

// lifeSize formula
t('lifeSize dead = 0', P.lifeSize(2, 1, 0.5) === 0 && P.lifeSize(1, 1, 0.5) === 0);
t('lifeSize unspawned = 0', P.lifeSize(-0.1, 1, 0.5) === 0 && P.lifeSize(0, 0, 0.5) === 0);
t('lifeSize alive > 0', P.lifeSize(0.5, 1, 0.5) > 0 && P.lifeSize(0.5, 1, 0.5) <= 0.5);
t('lifeAlpha dead = 0', P.lifeAlpha(5, 1, 1) === 0 && P.lifeAlpha(0.3, 1, 1) > 0);

// draws and lights
for (let i = 0; i < 10; i++) E.trail({ n: 8 });
const st = E.stats();
t('draws <= 8 (max trails)', st.draws <= 8 && st.trails === 5);
let lights = 0; scene.traverse(o => { if (o.isLight) lights++; });
t('no lights created', lights === lightsBefore);
E.dispose();

console.log(ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
