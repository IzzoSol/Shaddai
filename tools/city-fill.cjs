// node tools/city-fill.cjs — apply the OWNER'S DRAWING (assets/world/city-zones-v1.json, drawn in Blender 2026-10-16):
//   4 loops marked "C" = put the city buildings we removed back there (the ORIGINAL grid-fabric buildings at their original spots - no remakes);
//   the line all around = the plot ring. Keeps every owner-placed item (hero/block/landmark). The basic canon blocks inside the loops come back in
//   world-canon-v4.js (clipped to the same loops). Re-runnable (drops its own previous output first). Deterministic.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), U = 7 / 1.8, F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const L = JSON.parse(fs.readFileSync(F, 'utf8')), Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8'));
const fabric = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/grid-fabric-v4.json'), 'utf8'));
const canon = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/canon-colliders-v4.json'), 'utf8'));
L.items = L.items.filter((it) => it.role !== 'fill' && it.role !== 'restored'); L.roads = L.roads.filter((r) => !r.ring); L.plots = [];
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inZone = (x, y) => Z.buildingZones.some((P) => inPoly(x, y, P));
const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
const KEEP = [{ x: -1382, y: 1647, r: 230 }, { x: 1017.98, y: 801.67, r: 230 }];   // hoverskate park, Athenaeum
const isFiller = (k) => k === 'grid-block' || k === 'suburb-block' || /^(commons|ne-campus|nw-race)-/.test(k);
canon.obb.filter((b) => !isFiller(b.kind)).forEach((b) => KEEP.push({ x: b.x / U, y: -b.z / U, r: Math.hypot(b.hx, b.hz) / U + 10 }));
const clear = (x, y, rad) => !KEEP.some((k) => Math.hypot(k.x - x, k.y - y) < k.r + rad);
// (1) RESTORE the original detailed buildings inside the owner's loops (gardens are plots now; 60% kept so they don't stack on the restored blocks)
let restored = 0;
fabric.items.forEach((it) => {
  if (/^sc-(tower|garden)/.test(it.key) || !inZone(it.x_m, it.y_m) || !clear(it.x_m, it.y_m, 12)) return;
  if (/office/.test(it.key) ? hash(it.x_m, it.y_m) > 0.25 : hash(it.x_m, it.y_m) > 0.6) return;   // some offices, most of the rest
  if (L.items.some((q) => Math.hypot(q.x_m - it.x_m, q.y_m - it.y_m) < 18)) return;
  L.items.push(Object.assign({}, it, { role: 'restored' })); restored++;
});
// (2) PLOTS along the owner's ring line, one every ~110 m of line
let acc = 0, last = null;
Z.plotRing.concat([Z.plotRing[0]]).forEach((p) => { if (last) acc += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p;
  if (acc >= 110) { acc = 0; if (!clear(p[0], p[1], 45)) return; const b = (Math.atan2(p[0], p[1]) * 180 / Math.PI + 360) % 360;
    L.plots.push({ id: 'PLOT-RING-' + String(L.plots.length + 1).padStart(2, '0'), district: b < 90 ? 'trade' : b < 180 ? 'residential' : b < 270 ? 'forge' : 'academy', x_m: +p[0].toFixed(1), y_m: +p[1].toFixed(1), size_m: 84, yaw: +b.toFixed(1) }); } });
// (2b) INNER PLOT ROW behind the districts (owner: "fill the plots in behind the districts" - the drawn line was not perfect): r 1250, every 105 m
for (let i = 0, N = Math.floor(2 * Math.PI * 1250 / 105); i < N; i++) { const b = i / N * 360, br = b * Math.PI / 180, x = 1250 * Math.sin(br), y = 1250 * Math.cos(br);
  if (!clear(x, y, 45) || L.items.some((q) => Math.hypot(q.x_m - x, q.y_m - y) < 50) || L.plots.some((q) => Math.hypot(q.x_m - x, q.y_m - y) < 90)) continue;
  L.plots.push({ id: 'PLOT-INNER-' + String(i + 1).padStart(2, '0'), district: b < 90 ? 'trade' : b < 180 ? 'residential' : b < 270 ? 'forge' : 'academy', x_m: +x.toFixed(1), y_m: +y.toFixed(1), size_m: 80, yaw: +b.toFixed(1) }); }
// (2c) CITY BUILDINGS next to the districts: open land r 480-1120 gets 4-building blocks of our existing models (>= 45 m from anything placed)
const MIX = { academy: ['sc-techlab', 'sc-storefront-s', 'sc-techlab', 'sc-office-mid'], trade: ['sc-storefront-s', 'sc-storefront-l', 'sc-market', 'sc-storefront-s'], forge: ['sc-storefront-l', 'sc-techlab', 'sc-storefront-l', 'sc-office'], residential: ['sc-storefront-s', 'sc-storefront-l', 'sc-office-mid', 'sc-storefront-s'] };
for (let gx = -1120; gx <= 1120; gx += 115) for (let gy = -1120; gy <= 1120; gy += 115) { const r = Math.hypot(gx, gy); if (r < 480 || r > 1120) continue;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], k) => { const x = gx + sx * 30, y = gy + sy * 30; if (!clear(x, y, 14) || L.items.some((q) => Math.hypot(q.x_m - x, q.y_m - y) < 45) || L.plots.some((q) => Math.hypot(q.x_m - x, q.y_m - y) < 70)) return;
    const b = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360, d = b < 90 ? 'trade' : b < 180 ? 'residential' : b < 270 ? 'forge' : 'academy';
    L.items.push({ key: MIX[d][Math.floor(hash(Math.round(x) + k, Math.round(y)) * 4)], x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: 30, yaw: sx > 0 ? 90 : 270, lift_m: 0, by_height: false, cluster: d, role: 'fill' }); }); }
// (3) ROAD along the inside of the plot ring
for (let i = 0; i < Z.plotRing.length; i++) { const a = Z.plotRing[i], b = Z.plotRing[(i + 1) % Z.plotRing.length], s = 0.95; L.roads.push({ district: 'ring', ring: true, x0: +(a[0] * s).toFixed(1), y0: +(a[1] * s).toFixed(1), x1: +(b[0] * s).toFixed(1), y1: +(b[1] * s).toFixed(1), w: 26 }); }
L.version = 5; L.note = 'owner-placed (Blender) + owner drawing (city-zones-v1.json): original buildings restored inside the C loops, plot ring on the drawn line';
L.counts = { items: L.items.length, roads: L.roads.length, plots: L.plots.length };
fs.writeFileSync(F, JSON.stringify(L, null, 1));
const by = {}; L.items.forEach((i) => by[i.role] = (by[i.role] || 0) + 1);
console.log('items', L.items.length, JSON.stringify(by), '| restored', restored, '| plots', L.plots.length, '| roads', L.roads.length);
