#!/usr/bin/env node
/* grid-city-plan.cjs — deterministic city-block generator for "The Grid" (Map v4 centre district).
 *
 *   node tools/grid-city/grid-city-plan.cjs [--seed 5888] [--out public/assets/world/grid-city-v4.json]
 *
 * WHY a separate plan file: the game builder (public/world-grid-city-v4.js) and the Blender builder
 * (tools/blender/grid-city-v4.py) must place the SAME buildings. Both read this JSON; neither makes layout decisions.
 *
 * Frame (metres): X = east, Y = north, compass c = clockwise from north → (X, Y) = (r·sin c, r·cos c).
 * Game: x = X·U, z = -Y·U (U = terrain.json units_per_m = 7/1.8).
 * rot_deg = rotation about +Z (Blender) / +Y (three.js, rotation.y) — the same number works in both because
 * three's rotation.y maps world (cos ρ, sin ρ) in XY to game (cos ρ, -sin ρ) in xz. Local x (w_m) = tangential,
 * local y (d_m) = radial (outward).
 *
 * Street network (all widths are full widths): core r < 170 (as-built city, empty) · 12 radial avenues every 30°
 * (10 m road + 8 m sidewalks each side) · ring roads at 0.36·R and 0.62·R (12 m) · the Grid edge at R = grid_r_m ·
 * 8 transit hubs on the edge at the station compasses (60 m clear) · 30 m corridor along each station spoke bearing.
 * Every building footprint (incl. cantilevered slabs) keeps a 6 m setback from every road.
 *
 * tiers: [w, d, z0, h, ox, oy, type] in the building's local frame (metres, z0 = base above ground).
 *   type 0 box · 1 tapered (top 0.62) · 2 crown (top 0.25) · 3 slab (cantilevered glass floor plate) · 4 needle (top 0.04)
 */
'use strict';
const fs = require('fs'), path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEED = +arg('--seed', 5888);
const OUT = path.resolve(REPO, arg('--out', 'public/assets/world/grid-city-v4.json'));

const T = JSON.parse(fs.readFileSync(path.join(REPO, 'public/assets/terrain/terrain.json'), 'utf8'));
const R = +T.grid_r_m || 1600, U = +T.units_per_m || 7 / 1.8;
const CORE_R = 170;
const AVE_HALF = 5 + 8;            // road half-width + sidewalk
const RING_HALF = 6;               // 12 m ring roads
const RINGS = [0.36 * R, 0.62 * R];
const SETBACK = 6;
const HUB_CLEAR = 60, SPOKE_HALF = 15;
const STATION_C = (T.stations || []).map(s => +s.compass);
if (!STATION_C.length) STATION_C.push(0, 27, 61, 104, 142, 221, 296, 332);

// ── deterministic RNG (mulberry32) ──
let _s = SEED >>> 0;
function rnd() { _s = (_s + 0x6D2B79F5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function weighted(w) { let s = 0; for (const k in w) s += w[k]; let x = rnd() * s; for (const k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; }
const r1 = (v) => Math.round(v * 10) / 10;
const rad = (d) => d * Math.PI / 180;
const at = (c, r) => [r * Math.sin(rad(c)), r * Math.cos(rad(c))];

// ── clearance: signed distance from a point to the nearest road edge (≥ SETBACK required) ──
function lineDist(x, y, c) {   // perpendicular distance to the half-line from the origin along compass c (∞ behind it)
  const ux = Math.sin(rad(c)), uy = Math.cos(rad(c));
  if (x * ux + y * uy <= 0) return Infinity;
  return Math.abs(x * uy - y * ux);
}
function clearance(x, y) {
  const r = Math.hypot(x, y);
  let d = r - CORE_R;                                              // core disc
  d = Math.min(d, R - r);                                          // Grid edge
  for (const Rr of RINGS) d = Math.min(d, Math.abs(r - Rr) - RING_HALF);
  for (let k = 0; k < 12; k++) d = Math.min(d, lineDist(x, y, k * 30) - AVE_HALF);
  for (const c of STATION_C) {
    d = Math.min(d, lineDist(x, y, c) - SPOKE_HALF);
    const h = at(c, R); d = Math.min(d, Math.hypot(x - h[0], y - h[1]) - HUB_CLEAR);
  }
  return d;
}
// footprint rectangle (local w × d centred at local ox, oy) → world points to test (corners + edge midpoints)
function rectPts(cx, cy, rot, w, d, ox, oy) {
  const c = Math.cos(rad(rot)), s = Math.sin(rad(rot)), pts = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const lx = (ox || 0) + a * w / 2, ly = (oy || 0) + b * d / 2;
    pts.push([cx + lx * c - ly * s, cy + lx * s + ly * c]);
  }
  return pts;
}
function fits(cx, cy, rot, tiers) {
  for (const t of tiers) for (const p of rectPts(cx, cy, rot, t[0], t[1], t[4], t[5])) if (clearance(p[0], p[1]) < SETBACK) return false;
  return true;
}

// ── lots: sector = 30° wedge × ring band; rows radially, lots tangentially (≈ 40–70 m) ──
const BANDS = [
  { id: 0, r0: CORE_R + RING_HALF, r1: RINGS[0] - RING_HALF, lot: [50, 64] },
  { id: 1, r0: RINGS[0] + RING_HALF, r1: RINGS[1] - RING_HALF, lot: [60, 74] },
  { id: 2, r0: RINGS[1] + RING_HALF, r1: R - 8, lot: [66, 80] },
];
const LOCAL_ST = 14;   // local street every 2–3 rows (between blocks) — keeps the blocks readable
const lots = [];
for (let k = 0; k < 12; k++) {
  const ca = k * 30;
  for (const B of BANDS) {
    let r = B.r0, rowN = 0;
    while (r < B.r1 - 30) {
      const depth = Math.min(rr(B.lot[0], B.lot[1]), B.r1 - r);
      if (depth < 34) break;
      const rm = r + depth / 2;
      // usable angular range at the INNER edge of the row (the tightest point against both avenues)
      const phi = Math.asin(Math.min(0.99, (AVE_HALF + SETBACK) / Math.max(r, 1))) * 180 / Math.PI;
      const a0 = ca + phi, a1 = ca + 30 - phi, arc = rad(a1 - a0) * rm;
      if (arc > 30) {
        const n = Math.max(1, Math.round(arc / rr(B.lot[0], B.lot[1])));
        for (let i = 0; i < n; i++) {
          const c0 = a0 + (a1 - a0) * i / n, c1 = a0 + (a1 - a0) * (i + 1) / n, cm = (c0 + c1) / 2;
          const p = at(cm, rm);
          lots.push({ band: B.id, sector: k, c: cm, r: rm, x: p[0], y: p[1], w: rad(c1 - c0) * r - 8, d: depth - 8,
            aveDist: Math.min(cm - ca, ca + 30 - cm) * Math.PI / 180 * rm });
        }
      }
      r += depth; rowN++;
      if (rowN % 3 === 0) r += LOCAL_ST;
    }
  }
}

// ── archetypes ──
const MIX = [
  { tower: 44, podium: 22, terrace: 14, hall: 4, plaza: 9, park: 7 },
  { tower: 34, podium: 18, terrace: 18, hall: 10, plaza: 8, park: 12 },
  { tower: 22, podium: 12, terrace: 20, hall: 18, plaza: 8, park: 20 },
];
function baseHeight(L) {   // taller toward the centre and along avenues
  const f = 1 - Math.min(1, (L.r - CORE_R) / (R - CORE_R));
  let h = 60 + 150 * Math.pow(f, 1.3) * rr(0.55, 1.0);
  if (L.aveDist < 45) h += rr(15, 35);
  return Math.max(60, Math.min(220, h));
}
function towerTiers(w, d, h, z0, ox, oy) {   // shaft with 0–2 setbacks + crown
  const t = [], nSet = h > 150 ? 2 : h > 95 ? 1 : 0, crownH = Math.min(18, h * 0.08);
  let z = z0, cw = w, cd = d; const shaftH = h - crownH, segs = nSet + 1;
  for (let i = 0; i < segs; i++) {
    const sh = shaftH / segs * (i === 0 ? 1.25 : (segs === 1 ? 1 : (1 - 0.25 / (segs - 1))));
    const top = i === segs - 1 ? z0 + shaftH : z + sh;
    t.push([cw, cd, z, top - z, ox, oy, i === segs - 1 && rnd() < 0.3 ? 1 : 0]);
    z = top; cw *= 0.8; cd *= 0.8;
  }
  t.push([cw, cd, z, crownH, ox, oy, 2]);
  return t;
}
function buildLot(L) {
  const rot = r1(-L.c);   // local x tangential, local y radial
  const maxFoot = Math.min(L.w, L.d);
  let kind = weighted(MIX[L.band]);
  // landmark spires: lots touching the 0.36 ring (either side), chosen sparsely below
  if (kind === 'podium' && (L.w < 54 || L.d < 54)) kind = 'tower';
  if (kind === 'hall' && (L.w < 62 || L.d < 32)) kind = maxFoot >= 32 ? 'terrace' : 'tower';
  if (kind === 'plaza' || kind === 'park') return { kind, rot };
  let tiers, w, d, h;
  if (kind === 'tower') {
    w = r1(Math.min(maxFoot - 2, rr(24, 40))); d = r1(Math.min(maxFoot - 2, w * rr(0.75, 1.15))); h = baseHeight(L);
    tiers = towerTiers(w, d, h, 0, 0, 0);
  } else if (kind === 'podium') {
    const pw = 50, ph = 12; w = pw; d = pw; h = baseHeight(L) + ph;
    const tw = r1(rr(24, 34)), td = r1(tw * rr(0.8, 1.1)), tox = r1(rr(-6, 6)), toy = r1(rr(-6, 6));
    tiers = [[pw, pw, 0, ph, 0, 0, 0]].concat(towerTiers(tw, td, h - ph, ph, tox, toy));
  } else if (kind === 'terrace') {
    const cw = r1(Math.min(maxFoot - 14, rr(18, 26))), n = 3 + Math.floor(rnd() * 4);
    h = Math.max(60, baseHeight(L) * rr(0.55, 0.8)); w = cw; d = cw;
    tiers = [[cw, cw, 0, h, 0, 0, 0]];
    for (let i = 0; i < n; i++) {   // cantilevered slabs, alternating overhang (the sky-terrace reference)
      const z = h * (0.28 + 0.66 * (i + 0.5) / n), sw = r1(cw + rr(10, 18)), sd = r1(cw + rr(6, 14));
      const ox = r1((i % 2 ? 1 : -1) * rr(3, 8)), oy = r1(rr(-4, 4));
      tiers.push([sw, sd, r1(z), r1(rr(3.5, 5)), ox, oy, 3]);
    }
    tiers.push([cw * 0.6, cw * 0.6, h, 8, 0, 0, 2]);
    h += 8;
  } else { // hall
    w = 60; d = 30; h = 14;
    tiers = [[60, 30, 0, 14, 0, 0, 0], [56, 26, 14, 3.5, 0, 0, 1]];
    h = 17.5;
  }
  return { kind, rot, w, d, h, tiers };
}

const buildings = [], plazas = [], parks = [];
const accents = ['teal', 'emerald', 'gold'];
let nid = 0;
// pick landmark lots first: up to 10 lots whose row touches the 0.36 ring, spread by angle
const ringLots = lots.filter(L => Math.abs(L.r - RINGS[0]) < 70 && L.w >= 40 && L.d >= 40);
const landmarkIdx = new Set();
for (let k = 0; k < 10 && ringLots.length; k++) {
  const target = k * 36 + 12; let best = null, bd = 1e9;
  for (const L of ringLots) { const dd = Math.abs(((L.c - target + 540) % 360) - 180); if (dd < bd) { bd = dd; best = L; } }
  if (best && bd < 14) landmarkIdx.add(best);
}
for (const L of lots) {
  let B;
  if (landmarkIdx.has(L)) {
    const h = rr(260, 320), w = r1(Math.min(L.w, L.d, 44) - 2);
    B = { kind: 'spire', rot: r1(-L.c), w, d: w, h, tiers: [
      [w, w, 0, 16, 0, 0, 0],
      [w * 0.72, w * 0.72, 16, h * 0.55 - 16, 0, 0, 1],
      [w * 0.46, w * 0.46, h * 0.55, h * 0.3, 0, 0, 1],
      [w * 0.3, w * 0.3, h * 0.85, h * 0.07, 0, 0, 2],
      [2.4, 2.4, h * 0.92, h * 0.08, 0, 0, 4]] };
  } else B = buildLot(L);
  if (B.kind === 'plaza' || B.kind === 'park') {
    const w = r1(L.w), d = r1(L.d);
    if (!fits(L.x, L.y, B.rot, [[w, d, 0, 1, 0, 0, 0]])) continue;
    const id = (B.kind === 'plaza' ? 'pz' : 'pk') + (nid++);
    if (B.kind === 'plaza') plazas.push({ id, x_m: r1(L.x), y_m: r1(L.y), rot_deg: B.rot, w_m: w, d_m: d, fountain_r_m: r1(rr(4, 8)) });
    else {
      const trees = [], n = Math.round(w * d / rr(180, 260)), c = Math.cos(rad(B.rot)), s = Math.sin(rad(B.rot));
      for (let i = 0; i < n; i++) {
        const lx = rr(-w / 2 + 3, w / 2 - 3), ly = rr(-d / 2 + 3, d / 2 - 3);
        trees.push([r1(L.x + lx * c - ly * s), r1(L.y + lx * s + ly * c), r1(rr(2.5, 5.5))]);
      }
      parks.push({ id, x_m: r1(L.x), y_m: r1(L.y), rot_deg: B.rot, w_m: w, d_m: d, trees });
    }
    continue;
  }
  // shrink until the whole thing (incl. cantilevers) keeps its setback; drop the lot if it never fits
  let ok = fits(L.x, L.y, B.rot, B.tiers), tries = 0;
  while (!ok && tries++ < 4) {
    B.tiers = B.tiers.map(t => [t[0] * 0.85, t[1] * 0.85, t[2], t[3], t[4] * 0.85, t[5] * 0.85, t[6]]);
    B.w *= 0.85; B.d *= 0.85; ok = fits(L.x, L.y, B.rot, B.tiers);
  }
  if (!ok) continue;
  const accent = B.kind === 'spire' ? 'gold' : pick(accents);
  buildings.push({ id: 'b' + (nid++), kind: B.kind, x_m: r1(L.x), y_m: r1(L.y), rot_deg: B.rot, w_m: r1(B.w), d_m: r1(B.d), h_m: r1(B.h),
    tiers: B.tiers.map(t => t.map((v, i) => i === 6 ? v : r1(v))), accent, _band: L.band });
}

// ── skybridges: pair tall neighbours 40–95 m apart in the same band (each building joins at most one) ──
const tall = buildings.filter(b => b.h_m >= 90 && b.kind !== 'hall');
const used = new Set();
let bridges = 0;
for (const a of tall) {
  if (used.has(a.id) || rnd() > 0.45) continue;
  let best = null, bd = 1e9;
  for (const b of tall) {
    if (b === a || used.has(b.id) || b._band !== a._band) continue;
    const dd = Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m);
    if (dd > 40 && dd < 95 && dd < bd) { bd = dd; best = b; }
  }
  if (!best) continue;
  // the bridge must not cross an avenue / ring road at street level? It is elevated (≥ 40 m) — fine; but skip
  // bridges whose midpoint sits in a hub clear zone so the transit hubs stay open to the sky.
  const mx = (a.x_m + best.x_m) / 2, my = (a.y_m + best.y_m) / 2;
  if (STATION_C.some(c => { const h = at(c, R); return Math.hypot(mx - h[0], my - h[1]) < HUB_CLEAR + 20; })) continue;
  a.skybridgeTo = best.id; used.add(a.id); used.add(best.id); bridges++;
}
buildings.forEach(b => { delete b._band; });

// ── lamps: every 40 m along both sides of each avenue and ring road (sidewalk kerb line) ──
const lamps = [];
const okLamp = (x, y) => { const r = Math.hypot(x, y); if (r < CORE_R + 4 || r > R - 4) return false;
  return !STATION_C.some(c => { const h = at(c, R); return Math.hypot(x - h[0], y - h[1]) < HUB_CLEAR; }); };
for (let k = 0; k < 12; k++) {
  const c = k * 30, ux = Math.sin(rad(c)), uy = Math.cos(rad(c)), off = 5 + 1.5;
  for (let r = CORE_R + 20; r < R - 10; r += 40) for (const sd of [-1, 1]) {
    const x = ux * r + uy * off * sd, y = uy * r - ux * off * sd;
    if (okLamp(x, y)) lamps.push({ x_m: r1(x), y_m: r1(y) });
  }
}
for (const Rr of RINGS) for (const sd of [-1, 1]) {
  const rl = Rr + sd * (RING_HALF + 1.5), n = Math.round(2 * Math.PI * rl / 40);
  for (let i = 0; i < n; i++) {
    const c = i / n * 360;
    if (Math.min(...Array.from({ length: 12 }, (_, k) => Math.abs(((c - k * 30 + 540) % 360) - 180))) * Math.PI / 180 * rl < 12) continue;   // not in an intersection
    const p = at(c, rl); if (okLamp(p[0], p[1])) lamps.push({ x_m: r1(p[0]), y_m: r1(p[1]) });
  }
}

const count = (k) => buildings.filter(b => b.kind === k).length;
const stats = {
  lots: lots.length, buildings: buildings.length,
  byKind: { tower: count('tower'), podium: count('podium'), terrace: count('terrace'), hall: count('hall'), spire: count('spire') },
  plazas: plazas.length, parks: parks.length, trees: parks.reduce((s, p) => s + p.trees.length, 0),
  skybridges: bridges, lamps: lamps.length, tiers: buildings.reduce((s, b) => s + b.tiers.length, 0),
  maxHeight_m: Math.max(...buildings.map(b => b.h_m)),
};
const plan = { version: 1, seed: SEED, units_per_m: U, grid_r_m: R, core_r_m: CORE_R, rings_m: RINGS.map(r1), setback_m: SETBACK,
  tier_format: '[w,d,z0,h,ox,oy,type] local metres; type 0 box,1 taper,2 crown,3 slab,4 needle',
  buildings, plazas, parks, lamps, stats };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const txt = JSON.stringify(plan);
fs.writeFileSync(OUT, txt);
console.log('grid-city-v4 →', path.relative(REPO, OUT), (txt.length / 1024).toFixed(0) + ' KB');
console.log(JSON.stringify(stats));
