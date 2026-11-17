/* world-pvs-lite.js — C-6: hide LOW per-cell dressing that the WorldCityHeights
 * raster PROVES invisible from the camera's current position. Conservative by
 * construction: a ray is blocked when any of its 8 sightline samples spears a
 * building (raster top above the sightline + 2 m there — a straight ray through
 * a solid building column is a proof, not a guess), and a cell hides only when
 * all 5 rays (target centre + its 4 top corners — FPS_RESEARCH_2's "expand
 * sight cones") are blocked. Tall content is never registered: register()
 * refuses anything whose own bounding height exceeds 15 m, so towers/buildings
 * are exempt forever, even if a call site mislabels them. A cell whose centre
 * is within 0.75 cell of the camera is never hidden. Recompute at most every
 * 500 ms, and only when the camera moved >= 10 m or the raster instance changed.
 * ?pvslite=0 = off (no-op register/update, everything visible, as before).
 * Fails open on any doubt: no raster yet, any exception -> visibility untouched. */
(function (root) {
  'use strict';
  if (/[?&]pvslite=0/.test(location.search)) { root.WorldPVS = { register: function () {}, update: function () {}, _cells: {} }; return; }
  var CELL_M = 250, U = 7 / 1.8, CELL = CELL_M * U, MAX_LOW_H = 15 * U, SAMPLES = 8, MARGIN = 2 * U;
  var NEAR = CELL * 0.75;
  var cells = {};   // "cx,cz" in C-5's keying (cx = floor(x / CELL), cz = floor(-z / CELL)) -> { objs, topY, pts, cx, cz }
  var tmpBox = null;
  function key(cx, cz) { return cx + ',' + cz; }
  function register(obj, opts) {
    try {
      if (!obj || !opts || !opts.low) return;
      var THREE = opts.THREE || root.__THREE__;
      if (!THREE || !THREE.Box3) return;
      if (!tmpBox) tmpBox = new THREE.Box3();
      var box = tmpBox.setFromObject(obj);
      if (!box || box.isEmpty()) return;
      var h = box.max.y - box.min.y;
      if (!(h <= MAX_LOW_H)) return;                       // tall content: exempt forever
      var cxw = (box.min.x + box.max.x) / 2, czw = (box.min.z + box.max.z) / 2;
      var cx = Math.floor(cxw / CELL), cz = Math.floor(-czw / CELL);
      var k = key(cx, cz), c = cells[k];
      if (!c) {
        c = cells[k] = { objs: [], topY: box.max.y, cx: cx, cz: cz,
          pts: [[cxw, czw], [box.min.x, box.min.z], [box.min.x, box.max.z], [box.max.x, box.min.z], [box.max.x, box.max.z]] };
      }
      if (box.max.y > c.topY) c.topY = box.max.y;
      c.objs.push(obj);
    } catch (e) { /* fail open */ }
  }
  function rayBlocked(H, ex, ey, ez, tx, ty, tz) {
    for (var i = 1; i <= SAMPLES; i++) {
      var t = i / (SAMPLES + 1);
      var top = H.topAt(ex + (tx - ex) * t, ez + (tz - ez) * t);
      if (top > ey + (ty - ey) * t + MARGIN) return true;   // the ray spears a building at this sample: proven blocked
    }
    return false;
  }
  var lastX = 1e12, lastZ = 1e12, lastAt = 0, lastH = null;
  function update(camera) {
    try {
      var H = root.__cityHeights; if (!H || !H.topAt || !camera || !camera.position) return;
      var now = performance.now();
      var cp = camera.position;
      if (H === lastH && now - lastAt < 500 && Math.hypot(cp.x - lastX, cp.z - lastZ) < 10) return;
      lastAt = now; lastX = cp.x; lastZ = cp.z; lastH = H;
      for (var k in cells) {
        var c = cells[k], hide = false;
        if (Math.hypot(cp.x - c.pts[0][0], cp.z - c.pts[0][1]) >= NEAR) {
          hide = true;
          for (var p = 0; p < c.pts.length; p++) {
            if (!rayBlocked(H, cp.x, cp.y, cp.z, c.pts[p][0], c.topY, c.pts[p][1])) { hide = false; break; }
          }
        }
        for (var j = 0; j < c.objs.length; j++) {
          var o = c.objs[j];
          if (o.visible === hide) o.visible = !hide;
        }
      }
    } catch (e) { /* fail open: leave visibility as-is */ }
  }
  root.WorldPVS = { register: register, update: update, _cells: cells };
})(typeof window !== 'undefined' ? window : globalThis);
