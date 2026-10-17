// node tools/city-final.cjs <draw3.json> — the OWNER'S FINAL city drawing (Blender, 2026-10-17): A (Athenaeum, NW), F (Forge, NE), T (Trade, SE),
// R (Residential, SW) each inside a drawn circle = the district ring road; dense scribbles = city buildings/towers; extra river lines.
// Keeps: plot circles + their ring roads, the 24 K1 towers. District buildings themselves come later (owner) - each district gets its ring road
// and a reserved core; the Athenaeum (already built) moves to A (CLASS_01 marker). Deterministic.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const S = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), L = JSON.parse(fs.readFileSync(F, 'utf8'));
const DIST = { athenaeum: { s: 13, c: [-634, 604] }, forge: { s: 12, c: [626, 616] }, trade: { s: 11, c: [638, -535] }, residential: { s: 10, c: [-572, -615] } };
const SCRIBBLES = [22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 63, 64, 65, 67, 68];
const RIVERS = [2, 77, 78, 79, 80, 6];
const PARK = { x: -854, y: -18 };
const towers = L.items.filter((i) => i.role === 'landmark');
const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
const roads = L.roads.filter((r) => r.ring && r.district === 'ring');   // plot circle roads stay
// district ring roads from the drawn circles (fit: centroid + mean radius)
const dists = [];
Object.keys(DIST).forEach((id) => { const pts = S[DIST[id].s], cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const r = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length; dists.push({ id, x: +cx.toFixed(1), y: +cy.toFixed(1), r: +r.toFixed(1) });
  for (let i = 0; i < 48; i++) { const a0 = i / 48 * 2 * Math.PI, a1 = (i + 1) / 48 * 2 * Math.PI; roads.push({ district: id, x0: +(cx + r * Math.sin(a0)).toFixed(1), y0: +(cy + r * Math.cos(a0)).toFixed(1), x1: +(cx + r * Math.sin(a1)).toFixed(1), y1: +(cy + r * Math.cos(a1)).toFixed(1), w: 24 }); }
  const len = Math.hypot(cx, cy), ux = cx / len, uy = cy / len; roads.push({ district: id, x0: +(ux * 440).toFixed(1), y0: +(uy * 440).toFixed(1), x1: +(cx - ux * r).toFixed(1), y1: +(cy - uy * r).toFixed(1), w: 30 }); });   // avenue from the core
const reserved = (x, y, pad) => dists.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + pad) || Math.hypot(x - PARK.x, y - PARK.y) < 220 + pad || Math.hypot(x, y) < 440 || towers.some((t) => Math.hypot(t.x_m - x, t.y_m - y) < 30);
// city buildings: every 46 m cell the scribbles pass through (deep scribbles = dense), towers mixed in
const MIX = ['sc-storefront-l', 'sc-storefront-s', 'sc-techlab', 'sc-office-mid', 'sc-market', 'sc-storefront-l', 'sc-tower-slab', 'sc-storefront-s', 'sc-techlab', 'sc-tower-setback', 'sc-office', 'sc-tower-spire'];
const CELL = 46, cells = new Map();
SCRIBBLES.forEach((i) => (S[i] || []).forEach((p) => { const k = Math.round(p[0] / CELL) + ',' + Math.round(p[1] / CELL); cells.set(k, (cells.get(k) || 0) + 1); }));
const items = towers.slice();
cells.forEach((n, k) => { const [i, j] = k.split(',').map(Number), x = i * CELL, y = j * CELL; if (reserved(x, y, 12)) return;
  const key = MIX[Math.floor(hash(i, j) * MIX.length)], ang = (Math.atan2(x, y) * 180 / Math.PI + 180 + 360) % 360;
  items.push({ key, x_m: x, y_m: y, len_m: /tower/.test(key) ? 22 : 30, yaw: +ang.toFixed(1), lift_m: 0, by_height: false, cluster: 'city', role: 'city' }); });
const Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8'));
RIVERS.forEach((i) => { if (S[i] && S[i].length > 3) Z.rivers.push(S[i].filter((p, k) => k % 2 === 0 || k === S[i].length - 1)); });
Z.districts = dists; Z.park = PARK; Z.note += '; final owner drawing 2026-10-17 (districts A/F/T/R, scribble buildings, more river)';
fs.writeFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), JSON.stringify(Z));
Object.assign(L, { version: 9, note: 'owner final drawing (tools/city-final.cjs): districts A/F/T/R with ring roads, scribble city buildings, plot circles', items, roads, districts: dists, park: PARK, counts: { items: items.length, roads: roads.length, plots: L.plots.length } });
fs.writeFileSync(F, JSON.stringify(L, null, 1));
console.log('districts', JSON.stringify(dists), '| city buildings', items.length - towers.length, '| plots', L.plots.length, '| rivers', Z.rivers.length);
