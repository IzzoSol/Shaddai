// unstick-markers.mjs — interactive markers must be reachable: any marker buried inside a solid building OBB is moved to
// DOOR_M outside the nearest façade (the minimal-penetration face) and dropped to street level. Same algorithm as
// unstick() in tools/blender/canon/city_v3.py (keep them identical). Verifies with the game's own _pushOut math.
//   node tools/city/unstick-markers.mjs [--check]
import fs from 'node:fs';
const U = 7 / 1.8, DOOR_M = 1.2, REACH_M = 3.0, GZ = 6.0;
const MF = 'public/assets/world/markers-v4.json', CF = 'public/assets/world/canon-colliders-v4.json';
const M = JSON.parse(fs.readFileSync(MF, 'utf8')), CO = JSON.parse(fs.readFileSync(CF, 'utf8'));
// colliders back to Blender metres (x east, y north); rot keeps its sign (see canon-colliders note)
const OBB = CO.obb.map((o) => ({ x: o.x / U, y: -o.z / U, hx: o.hx / U, hy: o.hz / U, rot: o.rot, top: o.top / U, kind: o.kind }));
const interactive = (m) => { const p = m.props || {}; return !!(p.dashboard_id || (p.endpoints && p.endpoints.length) || p.paybox_merchant_id || p.skill_required || p.skill_gate); };
function inside(o, x, y, z) {   // Blender box convention: world = (x + lx*c - ly*s, y + lx*s + ly*c)
  if (z >= o.top - 0.3) return null;   // standing on / above the roof (perch pads, observation deck)
  const c = Math.cos(o.rot), s = Math.sin(o.rot), dx = x - o.x, dy = y - o.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  return Math.abs(lx) < o.hx && Math.abs(ly) < o.hy ? { lx, ly, c, s } : null;
}
const PLACED = [];
function unstick(m) {
  let [x, y, z] = m.pos_m, moved = false, tan = null;
  for (let it = 0; it < 6; it++) {
    const hit = OBB.map((o) => [o, inside(o, x, y, z)]).find(([, h]) => h); if (!hit) break;
    const [o, { lx, ly, c, s }] = hit; let nx = lx, ny = ly;
    if (o.hx - Math.abs(lx) < o.hy - Math.abs(ly)) { nx = (lx < 0 ? -1 : 1) * (o.hx + DOOR_M); tan = [-s, c]; } else { ny = (ly < 0 ? -1 : 1) * (o.hy + DOOR_M); tan = [c, s]; }
    x = o.x + nx * c - ny * s; y = o.y + nx * s + ny * c; z = Math.min(z, GZ); moved = true;
  }
  if (moved) {   // markers that shared a building must not share a doorway point: slide 3 m along the façade (+, -, +2, -2 ...)
    const x0 = x, y0 = y;
    for (let k = 1; PLACED.some(([px, py]) => Math.hypot(px - x, py - y) < 1.5) && k < 12; k++) {
      const st = Math.ceil(k / 2) * 3 * (k % 2 ? 1 : -1); x = x0 + tan[0] * st; y = y0 + tan[1] * st;
    }
    PLACED.push([x, y]);
  }
  return moved ? [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)] : null;
}
function gameBlocked(pm) {   // the game's own test (world-collision.js _pushOut, local x = (c,-s), local z = (s,c)); no player buffer
  const gx = pm[0] * U, gz = -pm[1] * U, gy = pm[2] * U;
  return CO.obb.some((o) => { if (gy >= o.top - 0.3 * U) return false; const dx = gx - o.x, dz = gz - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < o.hx - 0.01 && Math.abs(lz) < o.hz - 0.01; });
}
const check = process.argv.includes('--check'); let moved = 0; const still = [];
for (const m of M.markers) {
  if (!interactive(m)) continue;
  const np = unstick(m);
  if (np) { moved++; if (!check) { m.legacy = Object.assign({}, m.legacy, { pos_m_buried: m.pos_m }); m.pos_m = np; } console.log('moved', m.name, '->', np.join(', ')); }
  if (gameBlocked(check && np ? np : m.pos_m)) still.push(m.name);
}
if (!check && moved) fs.writeFileSync(MF, JSON.stringify(M, null, 0).replace(/\},\{"name"/g, '},\n{"name"'));
console.log(check ? 'CHECK' : 'WROTE', 'moved', moved, '| still inside a solid box (game math):', still.length ? still.join(', ') : 'none');
if (still.length) process.exit(1);
