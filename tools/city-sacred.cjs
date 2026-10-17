// node tools/city-sacred.cjs — SACRED-GEOMETRY city (owner 2026-10-16: "organize it fully, sacred geometry, symmetrical, aligned, not janky";
// the drawing was reference). 8-fold radial symmetry: avenues every 45 deg, building rings at fixed radii with the same slot pattern mirrored in
// every 45 deg sector, a hero plaza on each diagonal (districts), cardinal sectors = city buildings (the C areas), and 3 rows of plots in the outer
// ring with ring roads between them. Writes assets/world/grid-fabric-districts-v1.json (v6). Keep-outs: core r<430, Athenaeum, park, K1 towers, river.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const fabric = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/grid-fabric-v4.json'), 'utf8'));
const Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8'));
const PARK = { x: -264, y: -1636 }, ATH = { x: 1017.98, y: 801.67 };
const towers = fabric.items.filter((it) => /^sc-tower-/.test(it.key));
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)];
const districtOf = (b) => { b = (b + 360) % 360; const d = Math.round(b / 45) % 8; return ['north', 'trade', 'east', 'residential', 'south', 'forge', 'west', 'academy'][d]; };
const MIX = { academy: ['sc-techlab', 'sc-techlab', 'sc-office-mid'], trade: ['sc-market', 'sc-storefront-l', 'sc-storefront-s'], forge: ['sc-storefront-l', 'sc-techlab', 'sc-storefront-l'],
  residential: ['sc-storefront-s', 'sc-office-mid', 'sc-storefront-s'], north: ['sc-storefront-l', 'sc-office', 'sc-storefront-s'], east: ['sc-storefront-s', 'sc-techlab', 'sc-storefront-l'],
  south: ['sc-storefront-l', 'sc-storefront-s', 'sc-office'], west: ['sc-techlab', 'sc-storefront-s', 'sc-storefront-l'] };
const segD = (x, y, R) => { let b = 1e9; for (let i = 0; i + 1 < R.length; i++) { const [ax, ay] = R[i], [bx, by] = R[i + 1], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); b = Math.min(b, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return b; };
const blocked = (x, y, r) => Math.hypot(x - ATH.x, y - ATH.y) < 200 + r || Math.hypot(x - PARK.x, y - PARK.y) < 230 + r || towers.some((t) => Math.hypot(t.x_m - x, t.y_m - y) < 26 + r) || (Z.rivers || []).some((R) => segD(x, y, R) < 24 + r);
const items = [], plots = [], roads = [];
const AV = 7;   // half-angle (deg) kept clear around every 45 deg avenue
// BUILDING RINGS: radii 520..1060 step 90; slots per sector chosen so the arc spacing is ~70 m; pattern mirrored about each sector centre
[520, 610, 700, 790, 880, 970, 1060].forEach((r, ri) => {
  const span = 45 - 2 * AV, n = Math.max(1, Math.round(r * span * D2R / 70));
  for (let s = 0; s < 8; s++) { const c = s * 45;   // sector centres on N, NE, E... (districts on the diagonals), avenues between at 22.5 + 45k
    for (let k = 0; k < n; k++) { const b = c - span / 2 + span * (k + 0.5) / n, [x, y] = P(r, b), d = districtOf(c);
      const hero = (s % 2 === 1) && ri === 3 && Math.abs(k - (n - 1) / 2) <= 1;   // hero plaza on each district diagonal
      if (blocked(x, y, 14)) continue;
      items.push({ key: MIX[d][(ri + Math.abs(k - (n - 1) / 2) | 0) % 3], x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: hero ? 48 : 30, yaw: +((b + 180) % 360).toFixed(1), lift_m: 0, by_height: false, cluster: d, role: hero ? 'hero' : 'ring' }); } }
});
towers.forEach((it) => items.push(Object.assign({}, it, { role: 'landmark' })));
// RING ROADS between building rings + plot rings, and 8 avenues (core edge -> city rim)
const ring = (r, w) => { const N = 96; for (let i = 0; i < N; i++) { const [x0, y0] = P(r, i / N * 360), [x1, y1] = P(r, (i + 1) / N * 360); roads.push({ district: 'ring', x0: +x0.toFixed(1), y0: +y0.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1), w }); } };
[475, 1105, 1205, 1305, 1405].forEach((r) => ring(r, r > 1100 ? 22 : 26));
for (let a = 22.5; a < 360; a += 45) { const [x0, y0] = P(430, a), [x1, y1] = P(1405, a); roads.push({ district: 'avenue', x0: +x0.toFixed(1), y0: +y0.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1), w: 30 }); }
// PLOTS: 3 rows (r 1155, 1255, 1355) between the outer ring roads, ~85 m pitch, mirrored per sector, clear of avenues
[1155, 1255, 1355].forEach((r) => { const span = 45 - 2 * AV, n = Math.max(1, Math.round(r * span * D2R / 85));
  for (let s = 0; s < 8; s++) { const c = s * 45; for (let k = 0; k < n; k++) { const b = c - span / 2 + span * (k + 0.5) / n, [x, y] = P(r, b); if (blocked(x, y, 36)) continue;
    plots.push({ id: 'PLOT-' + r + '-' + s + '-' + k, district: districtOf(c), x_m: +x.toFixed(1), y_m: +y.toFixed(1), size_m: 70, yaw: +b.toFixed(1) }); } } });
const L = { version: 6, note: 'sacred-geometry city (tools/city-sacred.cjs): 8-fold symmetric rings, avenues every 45 deg, 3 plot rows', units_per_m: fabric.units_per_m,
  counts: { items: items.length, roads: roads.length, plots: plots.length }, park: PARK, items, roads, plots };
fs.writeFileSync(F, JSON.stringify(L, null, 1));
console.log('items', items.length, 'plots', plots.length, 'roads', roads.length);
