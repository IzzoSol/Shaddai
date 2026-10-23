/* tools/gen-realm-towns.cjs — writes public/assets/world/realm-towns-v2.json: a real TOWN at the end of every realm road (owner 2026-10-23:
 * "every realm fully finished with its city and buildings set"; the Emberfall terrace read as a ring of grey boxes). Station towns
 * (realm-dress-v1.json, authored in Blender) are untouched; these are the realm-heart towns further out.
 * Layout patterns + counts + heights from TURTLE (2026-10-23): radial "sun-ray / wave-crest", Z "ice-vein / canopy grid", F "flow street",
 * hybrid, and "fracture". Buildings are the realm's own Blender kit (shaddai_dist_<realm>_b1..b4, home_a/b, farm) scaled to TURTLE's heights;
 * the signature landmark is the realm landmark kit where one exists. A 20 m corridor is kept clear along the incoming road.
 * Frame: GAME metres (x east, z south = -Blender y), item x/z relative to the town centre. node tools/gen-realm-towns.cjs
 */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '../public/assets/world/realm-towns-v2.json');
const KIT = '/assets/kits/', LM = { arctic: 1, desert: 1, ocean: 1, void: 1, volcano: 1 };
const P = (deg, r) => [r * Math.sin(deg * Math.PI / 180), -r * Math.cos(deg * Math.PI / 180)];   // game frame
// TURTLE table -> pattern, building count, height range (m); centre = road heart (gen-realm-roads.cjs), volcano = inside the Emberfall terrace
const TOWNS = [
  { realm: 'arctic',     at: [330, 3420],   pat: 'grid',     n: 14, h: [6, 18] },
  { realm: 'darkforest', at: [290, 3420],   pat: 'flow',     n: 18, h: [5, 16] },
  { realm: 'desert',     at: [29, 3430],    pat: 'radial',   n: 16, h: [7, 22] },
  { realm: 'volcano',    at: [58, 3270],    pat: 'flow',     n: 16, h: [8, 25], clearR: 0, maxR: 100 },   // EMB_Terrace_Towers ring r ~120-138 m
  { realm: 'forest',     at: [103, 2500],   pat: 'grid',     n: 15, h: [6, 14] },
  { realm: 'meadow',     at: [147, 3430],   pat: 'hybrid',   n: 14, h: [5, 12] },
  { realm: 'ocean',      at: [228, 3120],   pat: 'radial',   n: 11, h: [7, 20], pier: true },
  { realm: 'void',       at: [0, 3430],     pat: 'fracture', n: 10, h: [9, 30] },
];
const FILES = ['b1', 'b2', 'b3', 'b4', 'home_a', 'home_b'];
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const r1 = v => Math.round(v * 10) / 10;
const towns = TOWNS.map((T, ti) => {
  const R = rng(9001 + ti * 77), c = P(T.at[0], T.at[1]), items = [], taken = [];
  const toCity = Math.atan2(-c[0], -c[1]);   // bearing (atan2(x,z)) from the centre back toward the city = the incoming road
  function clear(x, z, rad) {
    if (Math.hypot(x, z) < 34) return false;                                   // central plaza
    const along = x * Math.sin(toCity) + z * Math.cos(toCity), across = -x * Math.cos(toCity) + z * Math.sin(toCity);
    if (along > 0 && Math.abs(across) < 10 + rad) return false;                // road corridor (20 m)
    if (T.maxR && Math.hypot(x, z) > T.maxR) return false;
    return taken.every(t => Math.hypot(t[0] - x, t[1] - z) > t[2] + rad + 6);
  }
  function put(x, z, yawDeg, file, h, rad, col) { taken.push([x, z, rad]); items.push({ file, x: r1(x), z: r1(z), yaw: Math.round(yawDeg), h: r1(h), col: col == null ? Math.round(rad * 0.8) : col }); }
  function bld(x, z, faceDeg) {   // a building facing faceDeg (toward the street / plaza)
    const k = items.length, f = FILES[k % FILES.length], home = /home/.test(f);
    const h = home ? T.h[0] + R() * 3 : T.h[0] + (T.h[1] - T.h[0]) * (0.35 + 0.65 * R()), rad = home ? 8 : 10;
    if (!clear(x, z, rad)) return false; put(x, z, faceDeg, KIT + 'shaddai_dist_' + T.realm + '_' + f + '_v01.glb', h, rad); return true;
  }
  const face = (x, z) => Math.atan2(-x, -z) * 180 / Math.PI;   // face the plaza centre
  // signature landmark on the plaza edge opposite the road (realms without a landmark kit get the tallest b4 tower ring)
  const back = toCity + Math.PI, lx = Math.sin(back) * 52, lz = Math.cos(back) * 52;
  if (LM[T.realm]) put(lx, lz, face(lx, lz), KIT + 'shaddai_realm_landmarks_' + T.realm + '_v01.glb', T.h[1] * 1.9, 30, 22);
  else for (let k = 0; k < 3; k++) { const a = back + (k - 1) * 0.35, x = Math.sin(a) * 52, z = Math.cos(a) * 52; put(x, z, face(x, z), KIT + 'shaddai_dist_' + T.realm + '_b4_v01.glb', T.h[1] * (k === 1 ? 2.2 : 1.6), 7); }
  let guard = 0;
  while (items.length < T.n + 2 && guard++ < 4000) {
    let x, z, fd;
    if (T.pat === 'radial') {        // sun-ray: 8 rays, buildings stepping out along each ray, facing the plaza
      const ray = Math.floor(R() * 8), ring = 1 + Math.floor(R() * 3), a = toCity + Math.PI / 8 + ray * Math.PI / 4 + (R() - 0.5) * 0.12;
      const rr = 30 + ring * 26 + (R() - 0.5) * 6, off = (R() < 0.5 ? -1 : 1) * 12; x = Math.sin(a) * rr + Math.cos(a) * off; z = Math.cos(a) * rr - Math.sin(a) * off; fd = face(x, z);
    } else if (T.pat === 'grid') {   // Z / ice-vein grid: 34 m blocks rotated to the road, alternate rows offset
      const gi = Math.floor(R() * 7) - 3, gj = Math.floor(R() * 7) - 3, ca = Math.cos(toCity), sa = Math.sin(toCity), u = gi * 34 + (gj & 1) * 17, v = gj * 34;
      x = u * ca + v * sa; z = -u * sa + v * ca; fd = toCity * 180 / Math.PI + (gi & 1 ? 90 : -90);
    } else if (T.pat === 'flow') {   // F: one main street (continues the road through town) + two cross streets; buildings line both sides
      const main = R() < 0.6, s = (R() - 0.5) * 2 * (T.maxR || 120), side = R() < 0.5 ? -1 : 1, cross = R() < 0.5 ? -40 : 40;
      const ca = Math.sin(toCity), cz = Math.cos(toCity), px = -cz, pz = ca;    // along / perpendicular unit vectors
      if (main) { x = ca * s + px * side * 24; z = cz * s + pz * side * 24; fd = Math.atan2(-px * side, -pz * side) * 180 / Math.PI; }
      else { x = ca * (cross + side * 18) + px * s; z = cz * (cross + side * 18) + pz * s; fd = Math.atan2(-ca * side, -cz * side) * 180 / Math.PI; }
    } else if (T.pat === 'hybrid') { // F core + Z edges
      if (items.length < T.n / 2) { const s = (R() - 0.5) * 140, side = R() < 0.5 ? -1 : 1, ca = Math.sin(toCity), cz = Math.cos(toCity); x = ca * s - cz * side * 24; z = cz * s + ca * side * 24; fd = face(x, z); }
      else { const a = R() * Math.PI * 2, rr = 80 + R() * 40; x = Math.sin(a) * rr; z = Math.cos(a) * rr; fd = face(x, z) + 90 * Math.round(R() * 2 - 1); }
    } else {                         // fracture: shards at irregular radii and angles, rotated off-axis
      const a = R() * Math.PI * 2, rr = 40 + Math.pow(R(), 0.7) * 100; x = Math.sin(a) * rr; z = Math.cos(a) * rr; fd = R() * 360;
    }
    bld(x, z, fd);
  }
  // a farm on the outskirts and, for the harbor, a pier out over the water (the pier is the farm platform kit)
  for (let k = 0; k < 40; k++) { const a = back + (R() - 0.5) * 1.6, rr = (T.maxR || 150) * (T.maxR ? 0.85 : 1), x = Math.sin(a) * rr, z = Math.cos(a) * rr; if (clear(x, z, 18)) { put(x, z, face(x, z), KIT + 'shaddai_dist_' + T.realm + '_farm_v01.glb', 7, 18, 0); break; } }
  return { id: 'town2-' + T.realm, realm: T.realm, pattern: T.pat, c: [r1(c[0]), r1(c[1])], items };
});
fs.writeFileSync(OUT, JSON.stringify({ version: 2, note: 'generated by tools/gen-realm-towns.cjs (TURTLE patterns) - edit there', towns }));
towns.forEach(t => console.log(t.id.padEnd(18), t.pattern.padEnd(9), t.items.length, 'items'));
