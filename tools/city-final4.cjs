// node tools/city-final4.cjs <draw3.json> <draw4.json> <v8.json> - owner correction 2026-10-17 (symmetric pass):
// BLUE lines (draw3) are the roads: district circles + the quadrant loop, mirrored to all 4 quadrants (8-fold clean). District buildings inside
// the drawn circles (symmetric average). R back in its circle; white residential dots removed. Park = the space between the west "C" shapes
// (no circle in front of Residential). Offices = the NE yellow-dot pattern mirrored to every quadrant, 3 nearest each district = secondary.
// Red areas = clean 110 m block grid with real roads: large towers alternating with regular buildings. Plot circles kept.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const S3 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), D4 = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), V8 = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const layer = (re) => D4[Object.keys(D4).find((k) => re.test(k))] || [];
const RED = layer(/^Note\.004/), YELLOW = layer(/^Note\.001/);
const D2R = Math.PI / 180, cen = (s) => [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length];
const MIR = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
// districts: the drawn circles (draw3 strokes 10-13), symmetric average
const circ = [10, 11, 12, 13].map((i) => { const c = cen(S3[i]); return [Math.abs(c[0]), Math.abs(c[1]), S3[i].reduce((a, p) => a + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / S3[i].length]; });
const AX = Math.round(circ.reduce((a, c) => a + c[0], 0) / 4), AY = Math.round(circ.reduce((a, c) => a + c[1], 0) / 4), DR = Math.round(circ.reduce((a, c) => a + c[2], 0) / 4);
const DIST = [['athenaeum', -1, 1], ['forge', 1, 1], ['trade', 1, -1], ['residential', -1, -1]].map(([id, sx, sy]) => ({ id, x: sx * AX, y: sy * AY, r: DR }));
const PARK = { x: -880, y: 0, r: 190 };
const items = V8.items.filter((i) => i.role === 'landmark' && DIST.every((d) => Math.hypot(i.x_m - d.x, i.y_m - d.y) > d.r + 25) && Math.hypot(i.x_m - PARK.x, i.y_m - PARK.y) > PARK.r + 25);
const add = (key, x, y, len, role, cl) => items.push({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: len, yaw: +((Math.atan2(-x, -y) / D2R + 360) % 360).toFixed(1), lift_m: 0, by_height: false, cluster: cl, role });
const HERO = { forge: 'sc-civic-tower', trade: 'sc-market', residential: 'sc-storefront-l' };
DIST.forEach((d) => { if (HERO[d.id]) add(HERO[d.id], d.x, d.y, Math.round(d.r * 2 * 0.95), 'district-hero', d.id); });
const free = (x, y, pad) => Math.hypot(x, y) > 440 && DIST.every((d) => Math.hypot(x - d.x, y - d.y) > d.r + pad) && Math.hypot(x - PARK.x, y - PARK.y) > PARK.r + pad && items.every((q) => Math.hypot(q.x_m - x, q.y_m - y) > 42);
// offices: NE yellow dots mirrored to 4 quadrants
const ne = YELLOW.filter((s) => s.length === 1).map(cen).filter((p) => p[0] > 0 && p[1] > 0);
ne.forEach((p) => MIR.forEach(([sx, sy]) => { const x = p[0] * sx, y = p[1] * sy; if (free(x, y, 30)) add('sc-office-mid', x, y, 34, 'office', 'office'); }));
const SEC = { athenaeum: 'sc-techlab', forge: 'sc-civic-tower', trade: 'sc-market', residential: 'sc-storefront-l' };
DIST.forEach((d) => items.filter((i) => i.role === 'office').sort((a, b) => Math.hypot(a.x_m - d.x, a.y_m - d.y) - Math.hypot(b.x_m - d.x, b.y_m - d.y)).slice(0, 3).forEach((i) => Object.assign(i, { key: SEC[d.id], len_m: 60, role: 'district-secondary', cluster: d.id })));
// red areas: N region (hull of its strokes) rotated to E and S; W = the C shapes as drawn
const inPoly = (x, y, Pg) => { let c = false; for (let i = 0, j = Pg.length - 1; i < Pg.length; j = i++) { const xi = Pg[i][0], yi = Pg[i][1], xj = Pg[j][0], yj = Pg[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const hull = (pts) => { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  pts.forEach((p) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }); pts.slice().reverse().forEach((p) => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }); return lo.slice(0, -1).concat(up.slice(0, -1)); };
const bearing = (s) => { const c = cen(s); return (Math.atan2(c[0], c[1]) / D2R + 360) % 360; };
const nHull = hull([].concat(...RED.filter((s) => s.length >= 20 && (bearing(s) > 330 || bearing(s) < 30) && Math.hypot(...cen(s)) < 1060)));
const rot = (Pg, k) => Pg.map(([x, y]) => k === 1 ? [y, -x] : k === 2 ? [-x, -y] : [-y, x]);
const regions = [nHull, rot(nHull, 1), rot(nHull, 2)].concat(RED.filter((s) => s.length > 100 && bearing(s) > 225 && bearing(s) < 315));
const roads = V8.roads.filter((r) => r.ring && r.district === 'ring');
const seg = (a, b, w, d) => roads.push({ district: d, x0: +a[0].toFixed(1), y0: +a[1].toFixed(1), x1: +b[0].toFixed(1), y1: +b[1].toFixed(1), w });
const G = 110, TOW = ['sc-tower-spire', 'sc-tower-slab', 'sc-tower-setback'], REG = ['sc-storefront-l', 'sc-techlab', 'sc-market'];
regions.forEach((Pg, ri) => { const xs = Pg.map((p) => p[0]), ys = Pg.map((p) => p[1]);
  for (let gx = Math.ceil(Math.min(...xs) / G) * G; gx <= Math.max(...xs); gx += G) for (let gy = Math.ceil(Math.min(...ys) / G) * G; gy <= Math.max(...ys); gy += G) {
    const cx = gx + G / 2, cy = gy + G / 2; if (!inPoly(cx, cy, Pg) || !free(cx, cy, 40)) continue;
    const i = Math.round(gx / G), j = Math.round(gy / G), tower = (i + j) % 2 === 0;
    add(tower ? TOW[((i % 3) + 3) % 3] : REG[((j % 3) + 3) % 3], cx, cy, tower ? 34 : 42, tower ? 'tower' : 'regular', 'city');
    if (inPoly(gx, cy, Pg)) seg([gx, gy], [gx, gy + G], 18, 'block'); if (inPoly(cx, gy, Pg)) seg([gx, gy], [gx + G, gy], 18, 'block'); } });
// blue roads: district circles + the NE quadrant loop (draw3 stroke 31) mirrored to all quadrants; park circle; avenue from the core to each district
const circle = (cx, cy, r, w, d) => { const n = Math.max(32, Math.round(r / 6)); for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI; seg([cx + r * Math.sin(a0), cy + r * Math.cos(a0)], [cx + r * Math.sin(a1), cy + r * Math.cos(a1)], w, d); } };
DIST.forEach((d) => { circle(d.x, d.y, d.r + 14, 24, d.id); const L0 = Math.hypot(d.x, d.y), ux = d.x / L0, uy = d.y / L0; seg([ux * 440, uy * 440], [d.x - ux * (d.r + 14), d.y - uy * (d.r + 14)], 28, d.id); });
const loop = S3[31].filter((p, k) => k % 3 === 0).map((p) => [Math.abs(p[0]), Math.abs(p[1])]);
MIR.forEach(([sx, sy]) => { for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; seg([a[0] * sx, a[1] * sy], [b[0] * sx, b[1] * sy], 24, 'quadrant'); } });
circle(PARK.x, PARK.y, PARK.r + 14, 24, 'park'); seg([-440, 0], [PARK.x + PARK.r + 14, 0], 28, 'park');
for (let a = 0; a < 360; a += 90) seg([440 * Math.sin(a * D2R), 440 * Math.cos(a * D2R)], [1150 * Math.sin(a * D2R), 1150 * Math.cos(a * D2R)], 28, 'avenue');
const plots = V8.plots.filter((p) => DIST.every((d) => Math.hypot(p.x_m - d.x, p.y_m - d.y) > d.r + 50));
const L = Object.assign({}, V8, { version: 13, note: 'owner symmetric correction (tools/city-final4.cjs)', items, roads, plots, districts: DIST, park: PARK, counts: { items: items.length, roads: roads.length, plots: plots.length } });
fs.writeFileSync(F, JSON.stringify(L, null, 1));
const Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8')); Z.districts = DIST; Z.park = PARK; fs.writeFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), JSON.stringify(Z));
const by = {}; items.forEach((i) => by[i.role] = (by[i.role] || 0) + 1); console.log('districts at +-' + AX + ',' + AY + ' r' + DR, JSON.stringify(by), 'plots', plots.length, 'roads', roads.length);
