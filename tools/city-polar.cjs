// node tools/city-polar.cjs <draw5.json> <v8.json> - owner's final grid drawing (2026-10-17), cleaned with geometry (drawing is a sketch):
// BLUE = a polar road grid round the city: ring roads at 560/690/820/950/1080 m, a radial street every 15 deg. Light-blue dots = one building
// per cell (SW quadrant = homes, others = offices). RED sectors (N, E, S) = towers: the same grid subdivided (7.5 deg / half rings), red lines
// are roads too, nothing stands on a road. Districts A/F/T/R at the diagonals: the district building fills a 170 m circle with a circle road;
// green dots = district secondary buildings (snapped to cells). H = hoverskate park in the west between the C shapes. Plot circles kept.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), F = path.join(PUB, 'assets/world/grid-fabric-districts-v1.json');
const D5 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), V8 = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const layer = (n) => D5[Object.keys(D5).find((k) => k.split('|')[0] === n)] || [];
const LB = layer('Note.005'), GREEN = layer('Note.001');
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)], brg = (x, y) => (Math.atan2(x, y) / D2R + 360) % 360;
const cen = (s) => [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length];
const RINGS = [560, 690, 820, 950, 1080], STEP = 15;
const DR = 170, DC = 1030, DIST = [['athenaeum', 315], ['forge', 45], ['trade', 135], ['residential', 225]].map(([id, b]) => { const p = P(DC, b); return { id, b, x: +p[0].toFixed(1), y: +p[1].toFixed(1), r: DR }; });
const PARK = { x: -880, y: 0, r: 200 };
const RED = [[345, 30], [60, 105], [158, 202]];   // tower sectors (bearing ranges) N, E, S from the red drawing
const inRed = (b) => RED.some(([a0, a1]) => (a0 < a1 ? b >= a0 && b <= a1 : b >= a0 || b <= a1));
const blocked = (x, y, pad) => DIST.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + pad) || Math.hypot(x - PARK.x, y - PARK.y) < PARK.r + pad;
const items = [], roads = V8.roads.filter((r) => r.ring && r.district === 'ring');
const add = (key, x, y, len, role, cl, yaw) => items.push({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: len, yaw: +(((yaw != null ? yaw : brg(-x, -y)) % 360 + 360) % 360).toFixed(1), lift_m: 0, by_height: false, cluster: cl, role });
const seg = (a, b, w, d) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (blocked(m[0], m[1], 4)) return; roads.push({ district: d, x0: +a[0].toFixed(1), y0: +a[1].toFixed(1), x1: +b[0].toFixed(1), y1: +b[1].toFixed(1), w }); };
// ROADS: rings + radials (+ red-sector subdivisions)
RINGS.forEach((r) => { for (let b = 0; b < 360; b += 2.5) seg(P(r, b), P(r, b + 2.5), r === 560 ? 30 : 22, 'grid'); });
for (let b = 0; b < 360; b += STEP) seg(P(RINGS[0], b), P(RINGS[RINGS.length - 1], b), 22, 'grid');
for (let b = STEP / 2; b < 360; b += STEP) if (inRed(b)) seg(P(RINGS[0], b), P(RINGS[RINGS.length - 1], b), 14, 'red');
for (let i = 0; i + 1 < RINGS.length; i++) { const r = (RINGS[i] + RINGS[i + 1]) / 2; for (let b = 0; b < 360; b += 2.5) if (inRed(b + 1.25)) seg(P(r, b), P(r, b + 2.5), 14, 'red'); }
// district circle roads + avenue from the inner ring; park circle road + avenue
const circle = (cx, cy, r, w, d) => { const n = 48; for (let i = 0; i < n; i++) { const a0 = i / n * 360, a1 = (i + 1) / n * 360; roads.push({ district: d, x0: +(cx + r * Math.sin(a0 * D2R)).toFixed(1), y0: +(cy + r * Math.cos(a0 * D2R)).toFixed(1), x1: +(cx + r * Math.sin(a1 * D2R)).toFixed(1), y1: +(cy + r * Math.cos(a1 * D2R)).toFixed(1), w }); } };
DIST.forEach((d) => circle(d.x, d.y, d.r + 14, 24, d.id)); circle(PARK.x, PARK.y, PARK.r + 14, 24, 'park');
// CELLS: centre of every grid cell
const cells = []; for (let i = 0; i + 1 < RINGS.length; i++) for (let b = 0; b < 360; b += STEP) { const r = (RINGS[i] + RINGS[i + 1]) / 2, bc = b + STEP / 2, p = P(r, bc); cells.push({ r, b: bc, x: p[0], y: p[1], used: false, red: inRed(bc) }); }
DIST.forEach((d) => { const HERO = { athenaeum: null, forge: 'sc-civic-tower', trade: 'sc-market', residential: 'sc-storefront-l' }[d.id]; if (HERO) add(HERO, d.x, d.y, Math.round(d.r * 1.9), 'district-hero', d.id); });
const nearest = (x, y) => { let best = null, bd = 1e9; cells.forEach((c) => { if (c.used || c.red || blocked(c.x, c.y, 30)) return; const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }); return bd < 280 ? best : null; };
const quad = (x, y) => (x < 0 && y < 0 ? 'residential' : x >= 0 && y >= 0 ? 'forge' : x >= 0 ? 'trade' : 'athenaeum');
const SEC = { athenaeum: 'sc-techlab', forge: 'sc-civic-tower', trade: 'sc-market', residential: 'sc-storefront-l' };
GREEN.filter((s) => s.length <= 3).map(cen).forEach((p) => { const c = nearest(p[0], p[1]); if (!c) return; c.used = true; const q = quad(c.x, c.y); add(SEC[q], c.x, c.y, 62, 'district-secondary', q, c.b + 180); });
LB.map(cen).forEach((p) => { const c = nearest(p[0], p[1]); if (!c) return; c.used = true; const q = quad(c.x, c.y), home = q === 'residential';
  add(home ? ['sc-storefront-s', 'sc-storefront-l'][Math.round(c.b / STEP) % 2] : ['sc-office', 'sc-office-mid'][Math.round(c.b / STEP) % 2], c.x, c.y, 44, home ? 'home' : 'office', q, c.b + 180); });
// RED sectors: each cell split 2x2 by the red roads -> 2 towers + 2 compact buildings, diagonal pattern
const TOW = ['sc-tower-spire', 'sc-tower-slab', 'sc-tower-setback'], SMALL = ['sc-storefront-s', 'sc-storefront-l', 'sc-techlab'];
let nt = 0, ns = 0; cells.filter((c) => c.red && !blocked(c.x, c.y, 40)).forEach((c, k) => { const dr = (c.r === 625 ? 65 : 65) / 2;
  [[-1, -1], [1, 1], [-1, 1], [1, -1]].forEach(([si, sj], q) => { const p = P(c.r + si * dr, c.b + sj * STEP / 4), h = Math.abs(Math.sin(p[0] * 12.9898 + p[1] * 78.233) * 43758.5453) % 1, tower = h < 0.5;
    add(tower ? TOW[Math.floor(h * 6) % 3] : SMALL[Math.floor(h * 7) % 3], p[0], p[1], tower ? 26 : 22, tower ? 'tower' : 'compact', 'towers', c.b + 180); tower ? nt++ : ns++; }); });   // Shaddai towers + Shaddai buildings, randomized (owner)
// SYMMETRY (owner): every office/home cell is mirrored into all 4 quadrants (b, 360-b, 180-b, 180+b); SW = homes
const used = new Set(cells.filter((c) => c.used).map((c) => c.r + '|' + c.b));
items.filter((i) => i.role === 'office' || i.role === 'home').slice().forEach((i) => { const r = Math.round(Math.hypot(i.x_m, i.y_m)), b = brg(i.x_m, i.y_m);
  [360 - b, 180 - b, 180 + b].forEach((bb) => { bb = ((bb % 360) + 360) % 360; const c = cells.find((q) => Math.abs(q.r - r) < 5 && Math.abs(((q.b - bb + 540) % 360) - 180) < 1);
    if (!c || c.red || used.has(c.r + '|' + c.b) || blocked(c.x, c.y, 30)) return; used.add(c.r + '|' + c.b); const q = quad(c.x, c.y), home = q === 'residential';
    add(home ? 'sc-storefront-s' : 'sc-office-mid', c.x, c.y, 44, home ? 'home' : 'office', q, c.b + 180); }); });
// NOTHING ON A ROAD: drop any building whose footprint touches a road segment (district centrepieces excepted - they sit inside their circle road)
const segDist = (x, y, r) => { const dx = r.x1 - r.x0, dy = r.y1 - r.y0, t = Math.max(0, Math.min(1, ((x - r.x0) * dx + (y - r.y0) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - r.x0 - dx * t, y - r.y0 - dy * t); };
for (let k = items.length - 1; k >= 0; k--) { const it = items[k]; if (it.role === 'district-hero') continue; const half = it.len_m * 0.75;   // full footprint + margin: touching a road = removed (owner)
  if (roads.some((r) => segDist(it.x_m, it.y_m, r) < r.w / 2 + half)) items.splice(k, 1); }
const plots = V8.plots.filter((p) => !blocked(p.x_m, p.y_m, 40));
const L = Object.assign({}, V8, { version: 14, note: 'owner final grid drawing, geometric polar grid (tools/city-polar.cjs)', items, roads, plots, districts: DIST, park: PARK, counts: { items: items.length, roads: roads.length, plots: plots.length } });
fs.writeFileSync(F, JSON.stringify(L, null, 1));
const Z = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), 'utf8')); Z.districts = DIST; Z.park = PARK; fs.writeFileSync(path.join(PUB, 'assets/world/city-zones-v1.json'), JSON.stringify(Z));
const by = {}; items.forEach((i) => by[i.role] = (by[i.role] || 0) + 1); console.log(JSON.stringify(by), 'towers', nt, 'compact', ns, 'roads', roads.length, 'plots', plots.length);
