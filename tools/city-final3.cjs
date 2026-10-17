// node tools/city-final3.cjs <draw4.json> <v8.json> - owner's COLOUR-CODED final map (Blender 2026-10-17):
// red = big towers + regular buildings (N/E/S grids, W "C" shapes), yellow dots = office buildings, white dots = residential buildings,
// letters A (NW) F (NE) T (SE) R (SW) at the diagonals, each inside a circular road; the district building fills the WHOLE circle (no extra room).
// H = hoverskate park (black scribble circle). Grid roads (30 deg avenues + rings 576/992) + plot circles kept. Buildings sit exactly on the dots.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const D4 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), V8 = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const layer = (re) => D4[Object.keys(D4).find((k) => re.test(k))] || [];
const RED = layer(/^Note\.004/), WHITE = layer(/^Note\.002/), BLACK = layer(/^Note\.003/), YELLOW = layer(/^Note\.001/);
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)];
const cen = (s) => [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length];
const hc = cen(BLACK[0]), hr = Math.max(...BLACK[0].map((p) => Math.hypot(p[0] - hc[0], p[1] - hc[1]))) * 0.9;
const PARK = { x: Math.round(hc[0]), y: Math.round(hc[1]), r: Math.round(hr) };
const outer = BLACK.slice(1).map(cen).concat(RED.filter((s) => s.length < 70).map(cen)).filter((m) => Math.hypot(m[0], m[1]) > 1000);
const R0 = Math.round(outer.reduce((a, m) => a + Math.hypot(m[0], m[1]), 0) / Math.max(1, outer.length)) - 60, DR = 165;
const DIST = [['athenaeum', 315], ['forge', 45], ['trade', 135], ['residential', 225]].map(([id, b]) => { const p = P(R0, b); return { id, x: +p[0].toFixed(1), y: +p[1].toFixed(1), r: DR }; });
const items = V8.items.filter((i) => i.role === 'landmark' && DIST.every((d) => Math.hypot(i.x_m - d.x, i.y_m - d.y) > d.r + 20) && Math.hypot(i.x_m - PARK.x, i.y_m - PARK.y) > PARK.r + 20);
const add = (key, x, y, len, role, cl) => items.push({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: len, yaw: +((Math.atan2(-x, -y) / D2R + 360) % 360).toFixed(1), lift_m: 0, by_height: false, cluster: cl, role });
const HERO = { forge: 'sc-civic-tower', trade: 'sc-market', residential: 'sc-storefront-l' };
DIST.forEach((d) => { if (HERO[d.id]) add(HERO[d.id], d.x, d.y, Math.round(d.r * 2 * 0.95), 'district-hero', d.id); });
const placeDots = (strokes, keys, role, cl) => { const pts = [];
  strokes.forEach((s) => { const c = cen(s); if (!pts.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 12)) pts.push(c); });
  let n = 0; pts.forEach((p, i) => { if (DIST.some((d) => Math.hypot(p[0] - d.x, p[1] - d.y) < d.r + 10)) return; add(keys[i % keys.length], p[0], p[1], 32, role, cl); n++; }); return n; };
const nOff = placeDots(YELLOW.filter((s) => s.length === 1), ['sc-office', 'sc-office-mid'], 'office', 'office');
const nRes = placeDots(WHITE.filter((s) => s.length <= 25 && Math.hypot(...cen(s)) > 450), ['sc-storefront-s', 'sc-storefront-l'], 'residential', 'residential');
const inPoly = (x, y, Pg) => { let c = false; for (let i = 0, j = Pg.length - 1; i < Pg.length; j = i++) { const xi = Pg[i][0], yi = Pg[i][1], xj = Pg[j][0], yj = Pg[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const hull = (pts) => { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  pts.forEach((p) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
  pts.slice().reverse().forEach((p) => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }); return lo.slice(0, -1).concat(up.slice(0, -1)); };
const big = RED.filter((s) => s.length >= 70 || Math.hypot(...cen(s)) < 1050), regions = [];
['N', 'E', 'S', 'W'].forEach((q) => { const sel = big.filter((s) => { const c = cen(s), b = (Math.atan2(c[0], c[1]) / D2R + 360) % 360;
    return q === 'N' ? (b > 315 || b < 45) : q === 'E' ? (b >= 45 && b < 135) : q === 'S' ? (b >= 135 && b < 225) : (b >= 225 && b <= 315); });
  if (!sel.length) return; if (q === 'W') sel.filter((s) => s.length > 100).forEach((s) => regions.push(s)); else regions.push(hull([].concat(...sel))); });
const TOW = ['sc-tower-spire', 'sc-tower-slab', 'sc-tower-setback'], REG = ['sc-storefront-l', 'sc-techlab', 'sc-market', 'sc-storefront-s'];
let nT = 0, nR = 0;
for (let gx = -1400; gx <= 1400; gx += 70) for (let gy = -1400; gy <= 1400; gy += 70) {
  if (!regions.some((Pg) => inPoly(gx, gy, Pg))) continue;
  if (Math.hypot(gx, gy) < 440 || DIST.some((d) => Math.hypot(gx - d.x, gy - d.y) < d.r + 40) || Math.hypot(gx - PARK.x, gy - PARK.y) < PARK.r + 30) continue;
  if (items.some((q) => Math.hypot(q.x_m - gx, q.y_m - gy) < 40)) continue;
  const i = Math.round(gx / 70), j = Math.round(gy / 70), tower = (i + j) % 2 === 0;
  add(tower ? TOW[((i % 3) + 3) % 3] : REG[((j % 4) + 4) % 4], gx, gy, tower ? 28 : 30, tower ? 'tower' : 'regular', 'city'); if (tower) nT++; else nR++; }
const roads = V8.roads.filter((r) => r.ring && r.district === 'ring');
const seg = (a, b, w, d) => roads.push({ district: d, x0: +a[0].toFixed(1), y0: +a[1].toFixed(1), x1: +b[0].toFixed(1), y1: +b[1].toFixed(1), w });
const circle = (cx, cy, r, w, d) => { const n = Math.max(32, Math.round(r / 6)); for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI; seg([cx + r * Math.sin(a0), cy + r * Math.cos(a0)], [cx + r * Math.sin(a1), cy + r * Math.cos(a1)], w, d); } };
circle(0, 0, 576, 24, 'grid'); circle(0, 0, 992, 24, 'grid'); for (let a = 0; a < 360; a += 30) seg(P(440, a), P(1150, a), 26, 'grid');
DIST.concat([{ id: 'park', x: PARK.x, y: PARK.y, r: PARK.r }]).forEach((d) => { circle(d.x, d.y, d.r + 14, 24, d.id); const len = Math.hypot(d.x, d.y), ux = d.x / len, uy = d.y / len;
  seg([ux * 440, uy * 440], [d.x - ux * (d.r + 14), d.y - uy * (d.r + 14)], 26, d.id); });
const plots = V8.plots.filter((p) => DIST.every((d) => Math.hypot(p.x_m - d.x, p.y_m - d.y) > d.r + 50));
const L = Object.assign({}, V8, { version: 12, note: 'owner colour-coded final map (tools/city-final3.cjs)', items, roads, plots, districts: DIST, park: PARK, counts: { items: items.length, roads: roads.length, plots: plots.length } });
fs.writeFileSync(F, JSON.stringify(L, null, 1));
const Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8')); Z.districts = DIST; Z.park = PARK; fs.writeFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), JSON.stringify(Z));
console.log('districts', JSON.stringify(DIST), 'park', JSON.stringify(PARK), '| offices', nOff, 'residential', nRes, 'towers', nT, 'regular', nR, '| plots', plots.length, '| items', items.length);
