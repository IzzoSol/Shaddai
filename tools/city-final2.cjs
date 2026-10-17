// node tools/city-final2.cjs <draw3.json> <v8.json> — owner 2026-10-17 (final): each district building FILLS its drawn circle; a circle road around
// it; a ring of small aligned buildings facing it; 8 streets radiating out. Scribbles = long towers + regular buildings (no offices) on the realm
// grid (avenues every 30 deg, street rings at 576 / 992 m like world-districts.js), only where the owner scribbled. Plot circles + K1 towers kept.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const S = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), V8 = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8')), PARK = Z.park, D = Z.districts;
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)], bearing = (x, y) => (Math.atan2(x, y) / D2R + 360) % 360;
const items = V8.items.filter((i) => i.role === 'landmark'), roads = V8.roads.filter((r) => r.ring && r.district === 'ring');
const seg = (a, b, w, d) => roads.push({ district: d, x0: +a[0].toFixed(1), y0: +a[1].toFixed(1), x1: +b[0].toFixed(1), y1: +b[1].toFixed(1), w });
const circle = (cx, cy, r, w, d, n) => { for (let i = 0; i < n; i++) seg([cx + r * Math.sin(i / n * 2 * Math.PI), cy + r * Math.cos(i / n * 2 * Math.PI)], [cx + r * Math.sin((i + 1) / n * 2 * Math.PI), cy + r * Math.cos((i + 1) / n * 2 * Math.PI)], w, d); };
const add = (key, x, y, len, yaw, role, cl) => items.push({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: len, yaw: +(((yaw % 360) + 360) % 360).toFixed(1), lift_m: 0, by_height: false, cluster: cl, role });
// DISTRICTS
const HERO = { athenaeum: null, forge: 'sc-civic-tower', trade: 'sc-market', residential: 'sc-storefront-l' }, RING = ['sc-storefront-s', 'sc-techlab', 'sc-storefront-l', 'sc-market'];
D.forEach((d) => {
  if (HERO[d.id]) add(HERO[d.id], d.x, d.y, Math.round(d.r * 1.7), bearing(-d.x, -d.y), 'district-hero', d.id);   // fills the whole circle
  circle(d.x, d.y, d.r + 14, 22, d.id, 48);                                                                     // circle road
  const rr = d.r + 52, n = Math.round(2 * Math.PI * rr / 48);                                                  // ring of small buildings facing in
  for (let k = 0; k < n; k++) { const a = k / n * 360; if (k % Math.round(n / 8) === 0) continue;               // gaps where the 8 streets leave
    const x = d.x + rr * Math.sin(a * D2R), y = d.y + rr * Math.cos(a * D2R); add(RING[k % 4], x, y, 26, a + 180, 'district-ring', d.id); }
  for (let s = 0; s < 8; s++) { const a = (s / 8) * 360 + (360 / n) * 0; seg([d.x + (d.r + 14) * Math.sin(a * D2R), d.y + (d.r + 14) * Math.cos(a * D2R)], [d.x + (d.r + 115) * Math.sin(a * D2R), d.y + (d.r + 115) * Math.cos(a * D2R)], 16, d.id); }
});
// REALM GRID ROADS: street rings 576 + 992, avenues every 30 deg from the core edge to the plot ring
circle(0, 0, 576, 24, 'grid', 120); circle(0, 0, 992, 24, 'grid', 160);
for (let a = 0; a < 360; a += 30) seg(P(440, a), P(1150, a), 26, 'grid');
// SCRIBBLE FILL on the grid: slots on rings between the street rings, angular pitch aligned to the 30 deg avenues
const SCR = [22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 63, 64, 65, 67, 68].flatMap((i) => S[i] || []);
const grid = {}; SCR.forEach((p) => { const k = Math.round(p[0] / 50) + ',' + Math.round(p[1] / 50); grid[k] = 1; });
const scribbled = (x, y) => { const i = Math.round(x / 50), j = Math.round(y / 50); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (grid[(i + a) + ',' + (j + b)]) return true; return false; };
const free = (x, y) => D.every((d) => Math.hypot(x - d.x, y - d.y) > d.r + 95) && Math.hypot(x - PARK.x, y - PARK.y) > 230 && items.every((q) => Math.hypot(q.x_m - x, q.y_m - y) > 38);
const TOWERS = ['sc-tower-spire', 'sc-tower-slab', 'sc-tower-setback'], REG = ['sc-storefront-l', 'sc-techlab', 'sc-storefront-s', 'sc-market'];
let nt = 0, nr = 0;
[[640, 1], [720, 0], [800, 1], [880, 0], [1060, 1]].forEach(([r, towerRow]) => { const step = 30 / Math.max(1, Math.round(r * 30 * D2R / 62));   // integer slots per 30 deg sector
  for (let a = step / 2; a < 360; a += step) { const off = a % 30; if (off < 4 || off > 26) continue;          // keep the avenues clear
    const [x, y] = P(r, a); if (!scribbled(x, y) || !free(x, y)) continue; const tower = towerRow && Math.round(a / step) % 2 === 0;
    add(tower ? TOWERS[Math.round(a / step) % 3] : REG[Math.round(a / step) % 4], x, y, tower ? 28 : 30, a + 180, tower ? 'scribble-tower' : 'scribble-bld', 'city'); tower ? nt++ : nr++; } });
const L = Object.assign({}, V8, { version: 11, note: 'owner final: district buildings fill the drawn circles + circle road + aligned ring + 8 streets; scribbles = towers + regular buildings on the realm grid (tools/city-final2.cjs)', items, roads, districts: D, park: PARK, counts: { items: items.length, roads: roads.length, plots: V8.plots.length } });
fs.writeFileSync(F, JSON.stringify(L, null, 1));
const by = {}; items.forEach((i) => by[i.role] = (by[i.role] || 0) + 1); console.log(JSON.stringify(by), 'towers', nt, 'regular', nr, 'roads', roads.length);
