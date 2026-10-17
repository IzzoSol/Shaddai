// node tools/districts-select.cjs — apply the Blender-authored districts (public/assets/world/districts-v1.json) to the Grid fabric plan.
// Per district: candidates = fabric items whose kind is in the district's kinds and that sit inside its sector + radius band (and outside the
// hoverskate park keep-out). Rank by distance to the district's centroid (bearing mid, radius mid) + a small stable hash, keep `target`.
// Every sc-tower-* (24 K1 landmark towers) is always kept. Writes districts[].keep (count) and keep: ["x,y", ...] back into the JSON.
// Deterministic: same JSON + plan -> same list. The game (world-clusters-v4.js) shows exactly these buildings.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), DF = path.join(PUB, 'assets/world/districts-v1.json');
const D = JSON.parse(fs.readFileSync(DF, 'utf8')), plan = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/grid-fabric-v4.json'), 'utf8'));
const kindOf = (k) => String(k).replace(/^sc-/, '').split('-')[0];
const hash = (x, y) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
const bearing = (x, y) => (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
const inPark = (it) => Math.hypot(it.x_m + 694.46, it.y_m - 1039.34) < 172 + (it.len_m || 0) * 0.5;
const keep = new Set(), used = new Set();
plan.items.forEach((it) => { if (/^sc-tower-/.test(it.key)) keep.add(it.x_m + ',' + it.y_m); });
D.districts.forEach((d) => {
  const [b0, b1] = d.bearing, [r0, r1] = d.radius_m, full = b1 - b0 >= 359, bm = (b0 + b1) / 2, rm = (r0 + r1) / 2;
  const cx = rm * Math.sin(bm * Math.PI / 180), cy = rm * Math.cos(bm * Math.PI / 180);
  const cand = plan.items.filter((it) => {
    if (!d.kinds.includes(kindOf(it.key)) || /^sc-tower-/.test(it.key) || inPark(it) || used.has(it.x_m + ',' + it.y_m)) return false;
    const r = Math.hypot(it.x_m, it.y_m), b = bearing(it.x_m, it.y_m); return r >= r0 && r <= r1 && (full || (b >= b0 && b <= b1));
  }).map((it) => ({ it, s: (full ? Math.hypot(it.x_m, it.y_m) : Math.hypot(it.x_m - cx, it.y_m - cy)) / (r1 || 1) + 0.15 * hash(it.x_m, it.y_m) }))
    .sort((a, b) => a.s - b.s).slice(0, d.target);
  cand.forEach((c) => { const k = c.it.x_m + ',' + c.it.y_m; keep.add(k); used.add(k); });
  d.keep = cand.length;
});
D.keep = [...keep]; D.keepCount = keep.size; D.towers = plan.items.filter((it) => /^sc-tower-/.test(it.key)).length;
fs.writeFileSync(DF, JSON.stringify(D, null, 1));
console.log('kept', keep.size, '(towers ' + D.towers + ') ->', D.districts.map((d) => d.id + ':' + d.keep + '/' + d.target).join(' '));
