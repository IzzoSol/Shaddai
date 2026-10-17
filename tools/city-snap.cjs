// node tools/city-snap.cjs — SLIGHT re-organisation (owner 2026-10-17: "same districts, same buildings, just moving, no rebuilds, no delete; evenly spaced /
// sacred geometry"). Every existing building keeps its model, district and role and moves to the nearest free slot on evenly spaced concentric rings
// (60 m apart, ~55 m arc spacing, slots identical in every 45 deg sector = 8-fold symmetry, a clear lane on every avenue at 22.5 + 45k deg).
// Every existing plot moves to the nearest slot of 3 outer plot rows (r 1155 / 1255 / 1355) with ring roads between. K1 towers stay put.
// Faces the Grid centre. Count in = count out. Re-runnable on its own output.
const fs = require('fs'), path = require('path');
const F = path.join(__dirname, '..', 'public/assets/world/grid-fabric-districts-v1.json'), L = JSON.parse(fs.readFileSync(F, 'utf8'));
const D2R = Math.PI / 180, P = (r, b) => [r * Math.sin(b * D2R), r * Math.cos(b * D2R)];
const PARK = { x: -264, y: -1636 }, ATH = { x: 1017.98, y: 801.67 }, towers = L.items.filter((i) => i.role === 'landmark');
const okSlot = (x, y, r) => Math.hypot(x - ATH.x, y - ATH.y) > 200 + r && Math.hypot(x - PARK.x, y - PARK.y) > 230 + r && towers.every((t) => Math.hypot(t.x_m - x, t.y_m - y) > 28 + r);
function slots(radii, arc, lane) {   // same slot pattern in each 45 deg sector, mirrored about the sector centre (sector centres at 0, 45, 90 ...)
  const out = []; radii.forEach((r) => { const span = 45 - 2 * lane, n = Math.max(1, Math.round(r * span * D2R / arc));
    for (let s = 0; s < 8; s++) for (let k = 0; k < n; k++) { const b = s * 45 - span / 2 + span * (k + 0.5) / n, [x, y] = P(r, b); if (okSlot(x, y, 14)) out.push({ x, y, b, r, used: false }); } }); return out; }
function assign(list, S) {   // greedy: closest (item, slot) pairs first, so everything moves as little as possible
  const pairs = []; list.forEach((it, i) => S.forEach((s, j) => { const d = Math.hypot(it.x_m - s.x, it.y_m - s.y); if (d < 600) pairs.push([d, i, j]); }));
  pairs.sort((a, b) => a[0] - b[0]); const done = new Set(); let moved = 0;
  pairs.forEach(([d, i, j]) => { if (done.has(i) || S[j].used) return; S[j].used = true; done.add(i); const it = list[i], s = S[j];
    it.x_m = +s.x.toFixed(1); it.y_m = +s.y.toFixed(1); it.yaw = +((s.b + 180) % 360).toFixed(1); moved += d; });
  return { placed: done.size, avgMove: Math.round(moved / Math.max(1, done.size)) };
}
const bld = L.items.filter((i) => i.role !== 'landmark');
const radii = []; for (let r = 480; r <= 1140; r += 60) radii.push(r);
const rb = assign(bld, slots(radii, 48, 3.5));
const rp = assign(L.plots, slots([1155, 1255, 1355], 82, 3.5)); L.plots.forEach((p) => { p.size_m = 66; p.yaw = +((Math.atan2(p.x_m, p.y_m) / D2R + 360) % 360).toFixed(1); });
L.roads = L.roads.filter((r) => !r.ring && r.district !== 'ring' && r.district !== 'core' && r.district !== 'avenue');
const ring = (r, w) => { for (let i = 0; i < 96; i++) { const [x0, y0] = P(r, i / 96 * 360), [x1, y1] = P(r, (i + 1) / 96 * 360); L.roads.push({ district: 'ring', ring: true, x0: +x0.toFixed(1), y0: +y0.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1), w }); } };
[450, 1170 - 65, 1205, 1305, 1405].forEach((r) => ring(r, 22));
for (let a = 22.5; a < 360; a += 45) { const [x0, y0] = P(430, a), [x1, y1] = P(1405, a); L.roads.push({ district: 'avenue', ring: true, x0: +x0.toFixed(1), y0: +y0.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1), w: 30 }); }
L.version = 7; L.counts = { items: L.items.length, roads: L.roads.length, plots: L.plots.length }; L.note = 'owner layout snapped to evenly spaced 8-fold rings (tools/city-snap.cjs) - same buildings, same plots, nothing deleted';
fs.writeFileSync(F, JSON.stringify(L, null, 1));
console.log('buildings', bld.length, 'placed', rb.placed, 'avg move m', rb.avgMove, '| plots', L.plots.length, 'placed', rp.placed, 'avg move', rp.avgMove, '| roads', L.roads.length);
