/* world-city-heights.js — O(1) "what is the tallest building top at (x,z)?" lookup for the race track (plan step S2.2, 2026-10-09).
 *
 *   var H = WorldCityHeights.build({ plan, footprints?, U?, cell? })
 *   H.topAt(x, z)  -> building top in WORLD units above local ground (flat Grid disc: ~absolute y), or -Infinity if open air
 *   H.stats        -> { cells, bytes, mb, bbox:{x0,x1,z0,z1}, cellU, cellM, boxes, filledCells }
 *
 * plan       the grid-city-v4.json object: buildings[] with { x_m, y_m (north), rot_deg (CCW), w_m, d_m, h_m, tiers:[[w,d,z0,h,ox,oy,type],...] } in METRES.
 *            Each tier is rasterised as its own rotated rectangle (top = z0 + h), so set-back crowns/podiums are honoured; type 2/4 (crown, needle)
 *            are treated as full boxes (conservative). Buildings without tiers fall back to one w_m x d_m x h_m box.
 *            world x = east_m * U, world z = -north_m * U (same as world-grid-city-v4.js).
 * footprints optional extra obstacles in WORLD units (x, z, h = top height in world units):
 *              { x, z, w, d, rot?, h }   rotated box, w across local-x, d across local-z, rot = radians about +y (THREE rotation.y; world-space CCW seen from +y)
 *              { x, z, r, h }            circle
 * cell       raster cell in METRES (default 2). Storage = one Float32Array over the occupied bbox only; cells are padded by half a cell
 *            diagonal so thin walls are never missed (the lookup errs on the high side, never low).
 */
(function (root) {
  'use strict';
  var M = 7 / 1.8;
  function build(o) {
    o = o || {};
    var U = o.U || M, cellM = o.cell || 2, C = cellM * U, pad = C * 0.7072, boxes = [], i, k;
    // 1. collect oriented rects in world space: { cx, cz, ax, az (unit axis of w), hw, hd, h }
    function addRect(cx, cz, ux, uz, hw, hd, h) { boxes.push({ cx: cx, cz: cz, ux: ux, uz: uz, hw: hw, hd: hd, h: h, r2: 0 }); }
    var plan = o.plan, B = plan && plan.buildings || [];
    for (i = 0; i < B.length; i++) {
      var b = B[i], rho = (b.rot_deg || 0) * Math.PI / 180, c = Math.cos(rho), s = Math.sin(rho), tiers = b.tiers && b.tiers.length ? b.tiers : [[b.w_m, b.d_m, 0, b.h_m || 0, 0, 0, 0]];
      for (k = 0; k < tiers.length; k++) {
        var t = tiers[k], ox = t[4] || 0, oy = t[5] || 0, e = b.x_m + ox * c - oy * s, nth = b.y_m + ox * s + oy * c;
        // local +x axis in world (east, north) = (c, s) -> world (x, z) = (c, -s)
        addRect(e * U, -nth * U, c, -s, t[0] * 0.5 * U, t[1] * 0.5 * U, (t[2] + t[3]) * U);
      }
    }
    var F = o.footprints || [];
    for (i = 0; i < F.length; i++) {
      var f = F[i];
      if (f.r != null) addRect(f.x, f.z, 1, 0, f.r, f.r, f.h);   // circle -> bounding square, then trimmed below
      else { var a = f.rot || 0; addRect(f.x, f.z, Math.cos(a), -Math.sin(a), f.w * 0.5, f.d * 0.5, f.h); }
      if (f.r != null) boxes[boxes.length - 1].circle = true;
    }
    // 2. bbox -> grid
    var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (i = 0; i < boxes.length; i++) {
      var q = boxes[i], ex = Math.abs(q.ux) * q.hw + Math.abs(q.uz) * q.hd, ez = Math.abs(q.uz) * q.hw + Math.abs(q.ux) * q.hd;
      q.ex = ex; q.ez = ez;
      if (q.cx - ex < x0) x0 = q.cx - ex; if (q.cx + ex > x1) x1 = q.cx + ex; if (q.cz - ez < z0) z0 = q.cz - ez; if (q.cz + ez > z1) z1 = q.cz + ez;
    }
    if (!boxes.length) return { topAt: function () { return -Infinity; }, stats: { cells: 0, bytes: 0, mb: 0, boxes: 0, filledCells: 0, cellU: C, cellM: cellM } };
    x0 -= C; z0 -= C; x1 += C; z1 += C;
    var nx = Math.ceil((x1 - x0) / C) + 1, nz = Math.ceil((z1 - z0) / C) + 1, grid = new Float32Array(nx * nz).fill(-Infinity), filled = 0;
    // 3. rasterise (cell centre inside the rect inflated by pad)
    for (i = 0; i < boxes.length; i++) {
      var r = boxes[i], ia = Math.max(0, Math.floor((r.cx - r.ex - pad - x0) / C)), ib = Math.min(nx - 1, Math.floor((r.cx + r.ex + pad - x0) / C)),
        ja = Math.max(0, Math.floor((r.cz - r.ez - pad - z0) / C)), jb = Math.min(nz - 1, Math.floor((r.cz + r.ez + pad - z0) / C));
      for (var j = ja; j <= jb; j++) for (var ii = ia; ii <= ib; ii++) {
        var px = x0 + (ii + 0.5) * C - r.cx, pz = z0 + (j + 0.5) * C - r.cz;
        var u = px * r.ux + pz * r.uz, v = -px * r.uz + pz * r.ux;
        if (r.circle ? (px * px + pz * pz > (r.hw + pad) * (r.hw + pad)) : (Math.abs(u) > r.hw + pad || Math.abs(v) > r.hd + pad)) continue;
        var idx = j * nx + ii; if (grid[idx] === -Infinity) filled++; if (r.h > grid[idx]) grid[idx] = r.h;
      }
    }
    return {
      topAt: function (x, z) {
        var ii = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
        if (ii < 0 || j < 0 || ii >= nx || j >= nz) return -Infinity;
        return grid[j * nx + ii];
      },
      stats: { cells: nx * nz, nx: nx, nz: nz, bytes: grid.byteLength, mb: grid.byteLength / 1048576, bbox: { x0: x0, x1: x1, z0: z0, z1: z1 }, cellU: C, cellM: cellM, boxes: boxes.length, filledCells: filled }
    };
  }
  var api = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldCityHeights = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
