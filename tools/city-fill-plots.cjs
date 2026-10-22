/* tools/city-fill-plots.cjs — fill the SHADDAI Grid (layer ON TOP of tools/city-polar.cjs output; re-run after it): themed buildings in the 4 district circles + one building per ring plot (2026-10-23).
 *   node tools/city-fill-plots.cjs            writes public/assets/world/grid-fabric-districts-v1.json (backup first, once)
 *   node tools/city-fill-plots.cjs --undo     removes every item tagged role 'fill-20261023'
 * The live city is the owner's polar drawing (151 buildings, 1501 roads, 159 empty ring plots). Every added item is a normal fabric
 * item (keys sc-*), so world-clusters-v4 renders/LODs it, world-facade-details dresses it and world-interiors-v3 gives it a walk-in
 * room automatically. Rules: clear of every road (half width + 4 m + building half), every existing item, the park and the council
 * core (r < 470 m); faces the nearest road; plots stay 1 building each with space around (future owned property). */
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'public/assets/world/grid-fabric-districts-v1.json');
const BACKUP = path.join(__dirname, '..', 'fal-assets/backups/grid-fabric-districts-v1.pre-fill-20261023.json');
const TAG = 'fill-20261023';
const F = JSON.parse(fs.readFileSync(FILE, 'utf8'));
F.items = F.items.filter((i) => i.role !== TAG);
if (process.argv.includes('--undo')) { fs.writeFileSync(FILE, JSON.stringify(F, null, 1)); console.log('undone, items', F.items.length); process.exit(0); }
if (!fs.existsSync(BACKUP)) { fs.mkdirSync(path.dirname(BACKUP), { recursive: true }); fs.copyFileSync(FILE, BACKUP); }

const LEN = { 'sc-storefront-s': 18, 'sc-techlab': 24, 'sc-garden': 25, 'sc-office': 21, 'sc-office-mid': 21, 'sc-storefront-l': 25, 'sc-market': 29 };
const THEME = {
  trade: ['sc-market', 'sc-storefront-l', 'sc-office', 'sc-storefront-s'],
  residential: ['sc-garden', 'sc-storefront-s', 'sc-office-mid', 'sc-garden'],
  athenaeum: ['sc-techlab', 'sc-office', 'sc-office-mid', 'sc-techlab'],
  forge: ['sc-techlab', 'sc-market', 'sc-office-mid', 'sc-techlab'],
};
// ring plots cycle styles by bearing so the ring reads as varied neighbourhoods
const RING = [['sc-garden', 'sc-office-mid'], ['sc-storefront-l', 'sc-office'], ['sc-techlab', 'sc-garden'], ['sc-market', 'sc-storefront-s'],
  ['sc-office', 'sc-garden'], ['sc-office-mid', 'sc-techlab'], ['sc-storefront-s', 'sc-garden'], ['sc-garden', 'sc-office']];

const roads = F.roads;
function segDist(px, py, r) {
  const dx = r.x1 - r.x0, dy = r.y1 - r.y0, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - r.x0) * dx + (py - r.y0) * dy) / L2));
  return Math.hypot(px - (r.x0 + t * dx), py - (r.y0 + t * dy));
}
function nearestRoad(px, py) { let best = null, bd = 1e9; for (const r of roads) { const d = segDist(px, py, r); if (d < bd) { bd = d; best = r; } } return { r: best, d: bd }; }
const placed = F.items.map((i) => ({ x: i.x_m, y: i.y_m, half: (i.len_m || 20) / 2 }));
function clear(x, y, len) {
  const half = len / 2 + 4;
  if (Math.hypot(x, y) < 470) return false;                                                   // council core / plazas
  if (F.park && Math.hypot(x - F.park.x, y - F.park.y) < F.park.r + half) return false;
  for (const r of roads) if (segDist(x, y, r) < (r.w || 12) / 2 + half) return false;
  for (const p of placed) if (Math.hypot(x - p.x, y - p.y) < p.half + half + 4) return false;
  return true;
}
function faceRoad(x, y) {   // yaw (deg) so the building front looks at the nearest road point
  const n = nearestRoad(x, y), r = n.r, dx = r.x1 - r.x0, dy = r.y1 - r.y0, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - r.x0) * dx + (y - r.y0) * dy) / L2)), qx = r.x0 + t * dx, qy = r.y0 + t * dy;
  return Math.round(Math.atan2(qx - x, qy - y) * 180 / Math.PI * 10) / 10;
}
const added = { trade: 0, residential: 0, athenaeum: 0, forge: 0, ring: 0 };
function add(key, x, y, cluster, extra) {
  const len = LEN[key]; if (!clear(x, y, len)) return false;
  F.items.push(Object.assign({ key, x_m: +x.toFixed(1), y_m: +y.toFixed(1), len_m: len, yaw: faceRoad(x, y), lift_m: 0, by_height: false, cluster, role: TAG }, extra || {}));
  placed.push({ x, y, half: len / 2 }); added[cluster === 'ring' ? 'ring' : cluster]++; return true;
}
// 1) districts: hex lattice inside each district circle (and its 2 approach corridors), spacing 48 m, themed keys
for (const d of F.districts) {
  const keys = THEME[d.id]; let k = 0;
  for (let gy = -d.r; gy <= d.r; gy += 42) for (let gx = -d.r; gx <= d.r; gx += 48) {
    const x = d.x + gx + ((Math.round(gy / 42) % 2) ? 24 : 0), y = d.y + gy;
    if (Math.hypot(x - d.x, y - d.y) > d.r) continue;
    if (add(keys[k % keys.length], x, y, d.id)) k++;
  }
}
// 2) ring plots: one building per plot, centred, style by bearing
F.plots.forEach((p, idx) => { if (idx % 2) return;   // every OTHER plot gets a pre-built property; the rest stay open claimable land (world-city-layout pads)
  const b = ((Math.atan2(p.x_m, p.y_m) * 180 / Math.PI) + 360) % 360, set = RING[Math.floor(b / 45) % 8];
  const key = set[Math.round(b) % 2];
  if (!add(key, p.x_m, p.y_m, 'ring', { plot: p.id })) {
    for (const [ox, oy] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) if (add(key, p.x_m + ox, p.y_m + oy, 'ring', { plot: p.id })) break;
  }
});
F.counts = Object.assign({}, F.counts, { items: F.items.length, fill: Object.values(added).reduce((a, b) => a + b, 0) });
fs.writeFileSync(FILE, JSON.stringify(F, null, 1));
console.log('added', added, 'items now', F.items.length);
