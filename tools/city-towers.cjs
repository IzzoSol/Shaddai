// node tools/city-towers.cjs <v8.json> — owner 2026-10-17: KEEP the buildings (v8: one per district square + towers + plot circles), add ONE big
// district building in the middle of each district (A = the Athenaeum exterior, already placed), and fill the scribble areas (the four cardinal
// sectors) with LARGE TOWERS + a few small buildings on a symmetric road grid. District ring roads from the owner's drawing (city-zones districts).
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const V8 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8'));
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)], PARK = Z.park || { x: -854, y: -18 };
const items = V8.items.filter((i) => i.role !== 'sprinkle'), roads = V8.roads.slice(), dists = Z.districts || [];
// district centrepieces (Colosseum-scale): F, T, R; A = Athenaeum exterior (CLASS_01)
const HERO = { forge: ['sc-civic-tower', 120], trade: ['sc-market', 130], residential: ['sc-office-mid', 110] };
dists.forEach((d) => { const h = HERO[d.id]; if (h) items.push({ key: h[0], x_m: d.x, y_m: d.y, len_m: h[1], yaw: +((Math.atan2(d.x, d.y) / D2R + 180) % 360).toFixed(1), lift_m: 0, by_height: false, cluster: d.id, role: 'district-hero' });
  for (let i = 0; i < 48; i++) { const a0 = i / 48 * 2 * Math.PI, a1 = (i + 1) / 48 * 2 * Math.PI; roads.push({ district: d.id, x0: +(d.x + d.r * Math.sin(a0)).toFixed(1), y0: +(d.y + d.r * Math.cos(a0)).toFixed(1), x1: +(d.x + d.r * Math.sin(a1)).toFixed(1), y1: +(d.y + d.r * Math.cos(a1)).toFixed(1), w: 24 }); } });
// cardinal tower clusters: same 3x3 pattern in N/E/S/W (r 880), towers on the corners + centre, small buildings on the edges, roads between
const clear = (x, y, r) => Math.hypot(x - PARK.x, y - PARK.y) > 230 + r && items.every((q) => Math.hypot(q.x_m - x, q.y_m - y) > 40 + r);
const T = ['sc-tower-spire', 'sc-tower-slab', 'sc-tower-setback'], SMALL = ['sc-storefront-s', 'sc-storefront-l'];
let added = 0;
[0, 90, 180, 270].forEach((c) => { const br = c * D2R, vx = Math.sin(br), vy = Math.cos(br), ux = Math.cos(br), uy = -Math.sin(br), at = (u, v) => [ux * u + vx * v, uy * u + vy * v];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const [x, y] = at(i * 95, 880 + j * 95), tower = (i === 0) === (j === 0) || (i !== 0 && j !== 0);
    if (!clear(x, y, 0)) continue; const key = tower ? T[(i + j + 3) % 3] : SMALL[(i + 2) % 2];
    items.push({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: tower ? 30 : 34, yaw: (c + 180) % 360, lift_m: 0, by_height: false, cluster: 'towers', role: 'tower-cluster' }); added++; }
  [-142, -47, 47, 142].forEach((o) => { const a = at(o, 880 - 142), b = at(o, 880 + 142), e = at(-142, 880 + o), f = at(142, 880 + o);
    roads.push({ district: 'towers', x0: +a[0].toFixed(1), y0: +a[1].toFixed(1), x1: +b[0].toFixed(1), y1: +b[1].toFixed(1), w: 18 }, { district: 'towers', x0: +e[0].toFixed(1), y0: +e[1].toFixed(1), x1: +f[0].toFixed(1), y1: +f[1].toFixed(1), w: 18 }); }); });
const L = Object.assign({}, V8, { version: 10, note: 'v8 kept + district centrepieces + symmetric cardinal tower clusters (tools/city-towers.cjs)', items, roads, districts: dists, park: PARK, counts: { items: items.length, roads: roads.length, plots: V8.plots.length } });
fs.writeFileSync(F, JSON.stringify(L, null, 1));
const by = {}; items.forEach((i) => by[i.role] = (by[i.role] || 0) + 1); console.log(JSON.stringify(by), 'plots', V8.plots.length);
