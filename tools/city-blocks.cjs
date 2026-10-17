// node tools/city-blocks.cjs — owner 2026-10-17: "1 building in each square, not 4-5 per square; ~15 offices per district then filler; plots = a circle,
// a road, another circle behind the districts; hover skate park IN the circle; sprinkle the good towers in the open spots". Source = the owner-placed
// layout v3 (commit da34ada9). Squares = groups of the owner's block buildings (they were placed 4 per square): one building at each square centre.
const fs = require('fs'), path = require('path');
const F = path.join(__dirname, '..', 'public/assets/world/grid-fabric-districts-v1.json');
const V3 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)];
const PARK = { x: -820, y: 0 }, ATH = { x: 1017.98, y: 801.67 };   // park moves INTO the circle: west cardinal sector (open after the cleanup)
const towers = V3.items.filter((i) => i.role === 'landmark'), out = towers.slice();
// 1) one building per square: cluster block buildings (linkage 60 m), keep the cluster centre
['academy', 'trade', 'forge', 'residential'].forEach((d) => {
  const bl = V3.items.filter((i) => i.cluster === d && i.role === 'block'), sq = [];
  const B = { academy: 315, trade: 45, forge: 225, residential: 135 }[d], br = B * D2R, vx = Math.sin(br), vy = Math.cos(br), ux = Math.cos(br), uy = -Math.sin(br);
  const BLOCK = 140, ROAD = 34, COLS = 5, ROWS = 4, W = COLS * BLOCK + (COLS - 1) * ROAD, H = ROWS * BLOCK + (ROWS - 1) * ROAD, R = 860;   // the grid that drew the squares
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { if (c === 2 && (r === 1 || r === 2)) continue;   // hero plaza blocks
    const u = -W / 2 + BLOCK / 2 + c * (BLOCK + ROAD), v = R - H / 2 + BLOCK / 2 + r * (BLOCK + ROAD), x = ux * u + vx * v, y = uy * u + vy * v;
    const near = bl.slice().sort((p, q) => Math.hypot(p.x_m - x, p.y_m - y) - Math.hypot(q.x_m - x, q.y_m - y)).slice(0, 4);
    sq.push({ x, y, keys: near.map((q) => q.key), yaw: (B + 180) % 360 }); }
  let offices = 0;
  sq.forEach((s, k) => { let key = s.keys.find((x) => /office/.test(x)) && offices < 15 ? (offices++, s.keys.find((x) => /office/.test(x))) : (s.keys.find((x) => !/office/.test(x)) || 'sc-storefront-l');
    out.push({ key, x_m: +s.x.toFixed(1), y_m: +s.y.toFixed(1), len_m: 46, yaw: s.yaw, lift_m: 0, by_height: false, cluster: d, role: 'block' }); });
  V3.items.filter((i) => i.cluster === d && i.role === 'hero').forEach((h) => out.push(h));
  console.log(d, 'squares', sq.length, 'offices', offices);
});
const free = (x, y, r) => Math.hypot(x, y) > 440 && Math.hypot(x - PARK.x, y - PARK.y) > 230 + r && Math.hypot(x - ATH.x, y - ATH.y) > 200 + r && out.every((q) => Math.hypot(q.x_m - x, q.y_m - y) > 70 + r);
// 2) sprinkle the good towers + big kit buildings in the open cardinal sectors (mirrored: same pattern N/E/S/W)
const SPR = [['sc-tower-spire', 640, -10], ['sc-tower-slab', 640, 10], ['sc-tower-setback', 860, 0], ['sc-storefront-l', 760, -16], ['sc-storefront-l', 760, 16], ['sc-market', 980, -8], ['sc-market', 980, 8]];
let spr = 0; [0, 90, 180, 270].forEach((c) => SPR.forEach(([key, r, db]) => { const [x, y] = P(r, c + db); if (!free(x, y, 0)) return; out.push({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: /tower/.test(key) ? 26 : 46, yaw: (c + db + 180) % 360, lift_m: 0, by_height: false, cluster: 'sprinkle', role: 'sprinkle' }); spr++; }));
// 3) plots: circle, road, circle (r 1200 / road 1250 / r 1300), even spacing, clear of the Athenaeum
const plots = []; [1200, 1300].forEach((r, ri) => { const n = Math.round(2 * Math.PI * r / 90); for (let k = 0; k < n; k++) { const b = (k + (ri ? 0.5 : 0)) / n * 360, [x, y] = P(r, b);
  if (Math.hypot(x - ATH.x, y - ATH.y) < 230) continue; plots.push({ id: 'PLOT-R' + (ri + 1) + '-' + String(k + 1).padStart(3, '0'), district: 'ring', x_m: +x.toFixed(1), y_m: +y.toFixed(1), size_m: 70, yaw: +b.toFixed(1) }); } });
const roads = (V3.roads || []).filter((r) => !r.ring);
const ring = (r, w) => { for (let i = 0; i < 128; i++) { const [x0, y0] = P(r, i / 128 * 360), [x1, y1] = P(r, (i + 1) / 128 * 360); roads.push({ district: 'ring', ring: true, x0: +x0.toFixed(1), y0: +y0.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1), w }); } };
ring(1150, 24); ring(1250, 24); ring(1350, 20);
const L = { version: 8, note: 'owner v3 layout: 1 building per square, <=15 offices/district, towers sprinkled in the cardinals, plot circle-road-circle (tools/city-blocks.cjs)', units_per_m: V3.units_per_m, park: PARK, items: out, roads, plots, counts: { items: out.length, roads: roads.length, plots: plots.length } };
fs.writeFileSync(F, JSON.stringify(L, null, 1));
console.log('items', out.length, 'sprinkled', spr, 'plots', plots.length, 'roads', roads.length);
