/* tools/gen-biome-scatter.cjs — writes public/assets/world/biome-scatter-v1.json (owner 2026-10-23: "there should be a forest in the green and
 * desert in the sand mountains and terrain in the mountains"). The CC0 nature pass (world-nature.js) is ~60 trees/km2 in one forest and nothing
 * in the desert or mountains; this adds code-built species (world-biome-scatter.js / tools/blender/realm_finish_to_blender.py build the same
 * meshes) at real densities, per realm, on the real heightfield (height16.bin) so slopes and summits get rocks and snow pines.
 * Entry = [species, x_m, z_m (game frame, z south), scale, rot_deg]. Ground height is resolved at runtime (game heightAt / Blender raycast).
 *   node tools/gen-biome-scatter.cjs
 */
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '../public'), M = JSON.parse(fs.readFileSync(PUB + '/assets/terrain/terrain.json'));
const HB = fs.readFileSync(PUB + '/assets/terrain/height16.bin'), N = Math.round(Math.sqrt(HB.length / 2)), HALF = M.half_m, NM1 = N - 1;
const HD = new Uint16Array(HB.buffer, HB.byteOffset, N * N);
function h(x, z) { let u = (x + HALF) * NM1 / (2 * HALF), v = (z + HALF) * NM1 / (2 * HALF); u = Math.max(0, Math.min(NM1 - 1e-6, u)); v = Math.max(0, Math.min(NM1 - 1e-6, v));
  const i = u | 0, j = v | 0, fx = u - i, fy = v - j, k = j * N + i, t = HD[k] + (HD[k + 1] - HD[k]) * fx, b = HD[k + N] + (HD[k + N + 1] - HD[k + N]) * fx; return M.min_m + (M.max_m - M.min_m) / 65535 * (t + (b - t) * fy); }
function slope(x, z) { const d = 6; return Math.hypot(h(x + d, z) - h(x - d, z), h(x, z + d) - h(x, z - d)) / (2 * d); }
const ROADS = JSON.parse(fs.readFileSync(PUB + '/assets/world/realm-roads-v1.json')), TOWNS = JSON.parse(fs.readFileSync(PUB + '/assets/world/realm-towns-v2.json'));
const ZONES = JSON.parse(fs.readFileSync(PUB + '/assets/world/city-zones-v1.json'));
// keep-outs in the game frame (x, z south): road + spur polylines (Blender y -> -z), river lines, town discs, station towns, star city, terrace
const segs = []; const CELL = 100, grid = {};
function addLine(pts, pad) { for (let i = 0; i + 1 < pts.length; i++) { const s = { a: pts[i], b: pts[i + 1], pad }; segs.push(s);
  for (let gx = Math.floor((Math.min(s.a[0], s.b[0]) - pad) / CELL); gx <= Math.floor((Math.max(s.a[0], s.b[0]) + pad) / CELL); gx++)
    for (let gz = Math.floor((Math.min(s.a[1], s.b[1]) - pad) / CELL); gz <= Math.floor((Math.max(s.a[1], s.b[1]) + pad) / CELL); gz++) (grid[gx + ',' + gz] = grid[gx + ',' + gz] || []).push(s); } }
ROADS.roads.forEach(r => addLine(r.pts.map(p => [p[0], -p[1]]), 14)); ROADS.spurs.forEach(r => addLine(r.pts.map(p => [p[0], -p[1]]), 12));
ZONES.rivers.forEach(rv => addLine((rv.points || rv).map(p => [p[0], -p[1]]), 22));
const discs = TOWNS.towns.map(t => [t.c[0], t.c[1], 175]);
(M.stations || []).forEach(s => { const p = s.pos_m || s.pos || s.at; if (p) discs.push([p[0], -p[1], 240]); });
[[0, 2829], [31, 2829], [54, 2829], [90, 2829], [142.1, 2829], [225, 2829], [299.1, 2829], [333.4, 2829]].forEach(([d, r]) => discs.push([r * Math.sin(d * Math.PI / 180), -r * Math.cos(d * Math.PI / 180), 240]));
discs.push([4330 * Math.sin(97 * Math.PI / 180), -4330 * Math.cos(97 * Math.PI / 180), 560]);
const EMB = M.features && M.features.emberfall; if (EMB) discs.push([EMB.terrace_centre_m[0], -EMB.terrace_centre_m[1], (EMB.terrace_r_m || 175) + 10]);
const VOIDF = M.features && M.features.void; if (VOIDF) discs.push([VOIDF.pit_centre_m[0], -VOIDF.pit_centre_m[1], VOIDF.pit_r_m + 40]);
function blocked(x, z) {
  for (const d of discs) if (Math.hypot(x - d[0], z - d[1]) < d[2]) return true;
  const L = grid[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)] || [];
  for (const s of L) { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2)); if (Math.hypot(x - s.a[0] - dx * t, z - s.a[1] - dz * t) < s.pad) return true; }
  return false;
}
function realmAt(x, z) {   // compass: 0 = north (-z), clockwise
  const c = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360, r = Math.hypot(x, z);
  let best = null; for (const R of M.realms) { const c0 = R.c0, c1 = R.c1 < c0 ? R.c1 + 360 : R.c1, cc = c < c0 ? c + 360 : c; if (cc >= c0 && cc <= c1 && r >= R.r0_m && r <= (R.r1_m || M.rim_m)) { if (!best || R.id === 'forest') best = R; } }
  return best ? best.id : null;
}
let seed = 20261023; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// species weights per realm (per km2). Clustered species place in groves: a seed point then 4-14 neighbours within 40 m.
const PLAN = {
  forest:     { pine: 260, broad: 360, shrub: 80 },
  darkforest: { pine: 170, crystal: 12, boulder: 20 },
  meadow:     { broad: 55, shrub: 90 },
  arctic:     { snowpine: 120, boulder: 40 },
  desert:     { hoodoo: 55, crystal: 45, shrub: 70, boulder: 25 },
  volcano:    { lavarock: 120, boulder: 35 },
  void:       { crystal: 45, boulder: 15 },
  suburb:     { shrub: 30 },
};
const GROVE = { pine: 1, broad: 1, snowpine: 1, hoodoo: 1, crystal: 1 };
const SIZE = { pine: [0.8, 1.35], broad: [0.8, 1.3], snowpine: [0.8, 1.4], shrub: [0.7, 1.4], hoodoo: [0.6, 1.6], crystal: [0.6, 1.5], boulder: [0.6, 2.2], lavarock: [0.6, 1.8], arch: [1, 1] };
const out = [], counts = {};
function tryPut(sp, x, z) {
  const r = Math.hypot(x, z); if (r < 1760 || r > 4650 || blocked(x, z)) return false;
  const g = h(x, z), sl = slope(x, z); if (g < (M.water_level_m || 2) + 0.6) return false;
  if (sl > 0.9 && sp !== 'boulder') return false;                                       // cliffs: only rocks hold
  let spp = sp;
  if ((sp === 'pine' || sp === 'broad') && g > 190) spp = 'snowpine';                    // summits turn to snow pines
  if (sp === 'broad' && sl > 0.45) spp = 'pine';
  const s = SIZE[spp], sc = s[0] + rnd() * (s[1] - s[0]);
  out.push([spp, Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(sc * 100) / 100, Math.round(rnd() * 360)]); counts[spp] = (counts[spp] || 0) + 1; return true;
}
// sample the annulus on a jittered 40 m lattice: each cell rolls each species of its realm with p = density * cellArea
const STEP = 40, A = STEP * STEP / 1e6;
for (let x = -4700; x <= 4700; x += STEP) for (let z = -4700; z <= 4700; z += STEP) {
  const jx = x + (rnd() - 0.5) * STEP, jz = z + (rnd() - 0.5) * STEP, R = realmAt(jx, jz); if (!R || !PLAN[R]) continue;
  for (const sp in PLAN[R]) {
    const dens = PLAN[R][sp], groveN = GROVE[sp] ? 8 : 1;
    if (rnd() < dens * A / groveN) { if (tryPut(sp, jx, jz) && GROVE[sp]) for (let k = 0; k < 4 + Math.floor(rnd() * 10); k++) tryPut(sp, jx + (rnd() - 0.5) * 80, jz + (rnd() - 0.5) * 80); }
  }
  // MOUNTAINS anywhere outside the city: steep ground gets scree boulders, high ground gets snow pines
  const sl = slope(jx, jz), g = h(jx, jz);
  if (Math.hypot(jx, jz) > 1760 && sl > 0.5 && rnd() < 0.35) tryPut('boulder', jx, jz);
  if (Math.hypot(jx, jz) > 1760 && g > 220 && sl < 0.8 && rnd() < 0.25) tryPut('snowpine', jx, jz);
}
// TREE MAZE around the Meadowfields town (owner 2026-10-23: "add trees around the city here like a circle of trees in a maze"): three rings of
// broadleaf trees at 190 / 215 / 240 m, ~9 m apart, each ring with 3 openings staggered so you wind through; the road entrance stays open.
{ const T = TOWNS.towns.find(t => t.realm === 'meadow'); if (T) { const cx = T.c[0], cz = T.c[1], road = Math.atan2(-cx, -cz);
  [190, 215, 240].forEach((rr, ri) => { const n = Math.round(2 * Math.PI * rr / 9);
    for (let k = 0; k < n; k++) { const a = road + 2 * Math.PI * k / n, rel = ((a - road) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      if (rel < 0.09 || rel > 2 * Math.PI - 0.09) continue;                                                    // road gap
      if ([0, 1, 2].some(g => Math.abs(rel - (ri * 0.7 + 0.9 + g * 2.1)) < 0.07)) continue;                    // staggered maze openings
      const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr; out.push([ri === 1 ? 'pine' : 'broad', Math.round(x * 10) / 10, Math.round(z * 10) / 10, 0.9 + rnd() * 0.25, Math.round(rnd() * 360)]); counts.maze = (counts.maze || 0) + 1; } }); } }
// three colossal rock arches in the Sand Sea (TURTLE: rock arches), on open dune ground
for (const [d, r] of [[22, 3900], [36, 3650], [27, 4300]]) { const x = r * Math.sin(d * Math.PI / 180), z = -r * Math.cos(d * Math.PI / 180); if (!blocked(x, z)) { out.push(['arch', Math.round(x), Math.round(z), 1, Math.round(d + 90)]); counts.arch = (counts.arch || 0) + 1; } }
fs.writeFileSync(PUB + '/assets/world/biome-scatter-v1.json', JSON.stringify({ version: 1, note: 'generated by tools/gen-biome-scatter.cjs - [species, x_m, z_m (game, z south), scale, rot_deg]', items: out }));
console.log('biome scatter', out.length, JSON.stringify(counts), (fs.statSync(PUB + '/assets/world/biome-scatter-v1.json').size / 1024).toFixed(0) + ' KB');
