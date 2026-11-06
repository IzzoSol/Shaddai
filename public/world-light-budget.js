/* world-light-budget.js — LIGHT BUDGET (2026-11-05, owner: "get the textures and speed and fps down"). Measured: 40 lights in the scene. three.js
 * shades every lit pixel against EVERY point/spot light each frame, near or far, so 30+ decorative point lights multiply the fragment cost of the
 * whole world. This keeps only the nearest MAX_POINT point lights and MAX_SPOT spot lights switched on (by distance to the camera, re-picked every
 * 0.5 s). The NUMBER switched on never changes once the pool is full, only WHICH ones, because three recompiles every material when the light count
 * changes (that would stutter). Never touched: shadow-casting lights, lights tagged userData.keepLight, directional / hemisphere / ambient lights.
 *   WorldLightBudget.tick(dt, camera, scene) · .stats() · .enable(bool)      ?lightbudget=0 = off   ?lights=N = point budget
 */
(function (root) {
  'use strict';
  var q = (typeof location !== 'undefined' && location.search) || '', m = /[?&]lights=(\d+)/.exec(q);
  var MAX_POINT = m ? Math.max(1, +m[1]) : 8, MAX_SPOT = 2, EVERY = 0.5;
  var S = { on: !/[?&]lightbudget=0\b/.test(q), t: 0, point: 0, spot: 0, managedPoint: 0, managedSpot: 0, off: 0 };
  var _v = null;
  function managed(l) { return l.isLight && (l.isPointLight || l.isSpotLight) && !l.castShadow && !(l.userData && l.userData.keepLight); }
  function pick(list, cam, max) {
    for (var i = 0; i < list.length; i++) { var l = list[i]; l.getWorldPosition(_v); l.userData.__lbD = _v.distanceToSquared(cam.position); }
    list.sort(function (a, b) { return a.userData.__lbD - b.userData.__lbD; });
    var off = 0;
    for (var j = 0; j < list.length; j++) {
      var want = j < max;
      if (want && !list[j].visible && list[j].userData.__lbOff) { list[j].visible = true; list[j].userData.__lbOff = false; }
      else if (!want && list[j].visible) { list[j].visible = false; list[j].userData.__lbOff = true; }
      if (!want) off++;
    }
    return off;
  }
  function tick(dt, cam, scene) {
    if (!S.on || !cam || !scene) return; S.t -= dt; if (S.t > 0) return; S.t = EVERY;
    if (!_v) _v = new cam.position.constructor();
    var pts = [], sps = [];
    scene.traverse(function (o) {
      if (!managed(o)) return;
      if (!o.visible && !o.userData.__lbOff) return;   // hidden by its own module (an interior that is not drawn): leave it alone
      var p = o.parent, live = true; while (p) { if (!p.visible) { live = false; break; } p = p.parent; } if (!live) return;   // under a hidden group: does not count
      (o.isSpotLight ? sps : pts).push(o);
    });
    S.managedPoint = pts.length; S.managedSpot = sps.length;
    S.off = pick(pts, cam, MAX_POINT) + pick(sps, cam, MAX_SPOT);
  }
  function enable(on) {   // off = give every light we switched off back to its module
    S.on = !!on; if (S.on) return;
    var sc = root.__w3dDebug && root.__w3dDebug.scene; if (!sc) return;
    sc.traverse(function (o) { if (o.isLight && o.userData && o.userData.__lbOff) { o.visible = true; o.userData.__lbOff = false; } });
  }
  root.WorldLightBudget = { tick: tick, enable: enable, stats: function () { return { on: S.on, maxPoint: MAX_POINT, maxSpot: MAX_SPOT, managedPoint: S.managedPoint, managedSpot: S.managedSpot, switchedOff: S.off }; } };
})(typeof window !== 'undefined' ? window : this);
