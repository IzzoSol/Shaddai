/* world-athenaeum-lifts.js — the Athenaeum's SECOND FLOOR + GLASS CAPSULE ELEVATORS (2026-10-23, owner: "I want the atheneum two floors
 * with an elevator"; ref: chrome-capped glass cars on polished rails). Art = Blender K33 (shaddai_athenaeum_interior_v01.glb): a 9 m
 * gallery ring (r 16..34 m) round the rotunda + two cars (athena_lift_car_0/1) at hook_lift_0/1.
 *   E within 3.2 m of a car = ride it (3 s, eased; the player rides inside, the other floor's view fades in) between G and floor 2.
 *   Upstairs the floor is the gallery (window.__groundHooks) and the player stays on the ring (the centre is open to the core).
 * Waits for world-athenaeum.js to publish window.__athK33 (the K33 shell inside the campus root). Nothing to do outside the Athenaeum.
 *   WorldAthenaeumLifts.attach({ getPlayer, setPlayer(x,y,z), isInsideAthenaeum() }) · .state()
 */
(function (root) {
  'use strict';
  var F2 = 9.0, R0 = 16.4, R1 = 33.2, LIFT_R = 13.8, RIDE_S = 3.0, USE_M = 3.2;
  var S = { k: null, cars: [], level: 0, ride: null, o: null, msgAt: 0 };
  function bind() {
    var K = root.__athK33; if (!K || S.k === K) return !!S.k; S.k = K; S.cars = [];
    K.shell.traverse(function (n) { var m = /^athena_lift_car_(\d)/.exec(n.name || ''); if (m) S.cars[+m[1]] = { o: n, y0: n.position.y, at: 0 }; });
    return true;
  }
  function local(p) { var K = S.k; return { x: (p.x - K.X0) / K.U, z: (p.z - K.Z0) / K.U, y: p.y / K.U }; }
  function world(x, y, z) { var K = S.k; return { x: K.X0 + x * K.U, y: y * K.U, z: K.Z0 + z * K.U }; }
  function inside() { return S.k && S.k.group.visible && (!S.o.isInsideAthenaeum || S.o.isInsideAthenaeum()); }
  function carLocal(i) { var c = S.cars[i]; if (!c) return null; var p = c.o.position; return { x: p.x, z: p.z }; }   // shell local == campus metres (glTF y-up: x, -y->z)
  function nearCar(p) {
    var L = local(p);
    for (var i = 0; i < S.cars.length; i++) { var c = carLocal(i); if (c && Math.hypot(L.x - c.x, L.z - c.z) < USE_M) return i; }
    return -1;
  }
  function use() {
    if (!S.o || !inside() || S.ride) return false; bind();
    var p = S.o.getPlayer && S.o.getPlayer(); if (!p) return false;
    var i = nearCar(p); if (i < 0) return false;
    S.ride = { i: i, from: S.level, to: S.level ? 0 : 1, t: 0 };
    if (root.__toast) root.__toast(S.ride.to ? 'Rising to the Gallery — Floor 2' : 'Descending to the Concourse');
    return true;
  }
  function tick(dt) {
    if (!S.o || !bind()) return;
    if (!inside()) { if (S.level) S.level = 0; return; }
    var R = S.ride; if (!R) return;
    R.t += dt / RIDE_S; var k = Math.min(1, R.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    var y = (R.from + (R.to - R.from) * e) * F2, c = S.cars[R.i];
    if (c) c.o.position.y = c.y0 + y;
    var cl = carLocal(R.i), w = world(cl.x, y + 0.35, cl.z); if (S.o.setPlayer) S.o.setPlayer(w.x, w.y, w.z);
    if (k >= 1) {
      S.level = R.to; S.ride = null;
      if (S.level === 1) { var a = Math.atan2(cl.z, cl.x), out = world(Math.cos(a) * (LIFT_R + 3.6), F2, Math.sin(a) * (LIFT_R + 3.6)); if (S.o.setPlayer) S.o.setPlayer(out.x, out.y, out.z); }   // step out onto the gallery
    }
  }
  function attach(o) {
    S.o = o;
    addEventListener('keydown', function (e) { if (e.code !== 'KeyE' || e.repeat) return; if (use()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    (root.__groundHooks = root.__groundHooks || []).push(function (p) {
      if (!S.k || !inside()) return null;
      if (S.ride) { var c = S.cars[S.ride.i]; return c ? (c.o.position.y - c.y0 + 0.35) * S.k.U : null; }
      if (!S.level) return null;
      var L = local(p), r = Math.hypot(L.x, L.z);
      var nearLift = false; for (var i = 0; i < S.cars.length; i++) { var cl = carLocal(i); if (cl && Math.hypot(L.x - cl.x, L.z - cl.z) < 3.0) nearLift = true; }
      if (!nearLift && (r < R0 || r > R1) && r > 1e-3) { var rr = r < R0 ? R0 : R1, w = world(L.x / r * rr, 0, L.z / r * rr); p.x = w.x; p.z = w.z; }   // stay on the gallery ring
      return F2 * S.k.U;
    });
    root.__athLifts = api; return api;
  }
  var api = { attach: attach, tick: tick, use: use, state: function () { return { bound: !!S.k, cars: S.cars.length, level: S.level, riding: !!S.ride }; } };
  root.WorldAthenaeumLifts = api;
})(typeof window !== 'undefined' ? window : this);
