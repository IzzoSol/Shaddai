/* world-hoverpark-k40.js — the K40 HOVERSKATE PARK (owner 2026-10-23, refs image 58-64) replaces the v2 park's look and ride surfaces at the
 * PLAZA_SKATE spot: high wall-ride walls + stands, a drop-in tower with a glass ELEVATOR (E at its base / top), the drop ramp into a big bowl,
 * four ELECTRIC launch ramps (ride up one and the coils throw you high), speed pads, floating rings, grind rails.
 *   WorldHoverParkK40.attach({ THREE, GLTFLoader, scene, park (v2, kept for the race logic), T (terrain api), hover, U, anchor:{x,z} }) -> api
 * The v2 park group is hidden (its race gates/loop stay). Height profile = the Blender kit (tools/k37_landmarks_arctic.py park()).
 * ?park=v2 = the old park.
 */
(function (root) {
  'use strict';
  function attach(o) {
    if (typeof location !== 'undefined' && /[?&]park=v2\b/.test(location.search)) return null;
    var THREE = o.THREE, U = o.U || 7 / 1.8, T = o.T, A = o.anchor, th = Math.atan2(-A.x, -A.z), c = Math.cos(th), sn = Math.sin(th);
    var g0 = T.heightAt(A.x, A.z), S = { built: false };
    function local(x, z) { var dx = (x - A.x) / U, dz = (z - A.z) / U; var lx = dx * c - dz * sn, lz = dx * sn + dz * c; return [lx, -lz]; }   // -> Blender-local (bx, by)
    function world(bx, by) { var lx = bx, lz = -by; return { x: A.x + (lx * c + lz * sn) * U, z: A.z + (-lx * sn + lz * c) * U }; }
    function prof(bx, by) {   // metres above the park floor, or null outside
      var r = Math.hypot(bx, by); if (r > 150) return null; var h = 0.4;
      if (r >= 34 && r < 48) h = Math.max(h, 8 * Math.pow((r - 34) / 14, 2)); else if (r >= 48 && r < 60) h = Math.max(h, 8 * (1 - (r - 48) / 12));
      if (Math.abs(bx) < 5 && by > 50 && by < 97) { var d = (97 - by) / 47; h = Math.max(h, 46 * (1 - d) * (1 - d)); }
      if (Math.abs(bx) < 9 && by >= 97 && by < 114) h = Math.max(h, 46.6);
      for (var k = 0; k < 4; k++) { var a = Math.PI / 4 + k * Math.PI / 2, u = bx * Math.cos(a) + by * Math.sin(a) - 88, v = -bx * Math.sin(a) + by * Math.cos(a);
        if (u > 0 && u < 24 && Math.abs(v) < 6) h = Math.max(h, 10 * Math.pow(u / 24, 2)); }
      return h;
    }
    function heightAt(x, z) { var L = local(x, z), h = prof(L[0], L[1]); return h == null ? null : g0 + h * U; }
    // hide the v2 park look (race logic keeps using its gates/loop)
    if (o.park && o.park.group) o.park.group.visible = false;
    if (root.__parkDress && root.__parkDress.group) root.__parkDress.group.visible = false;
    if (T.setHeightExtra) T.setHeightExtra(heightAt);
    var loader = new o.GLTFLoader();
    loader.load('/assets/kits/shaddai_hover_park_v01.glb?v=20261023a', function (gl) {
      var s = gl.scene; s.scale.setScalar(U); s.position.set(A.x, g0, A.z); s.rotation.y = th; s.name = 'hover-park-k40';
      s.traverse(function (m) { if (m.isMesh) { m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); } }); o.scene.add(s); S.built = true;
    }, undefined, function (e) { console.warn('[park-k40]', e && e.message); });
    // wall-ride: the inner face of the 150 m wall as 48 segments, 0-20 m
    if (o.hover && o.hover.wallride) { var W = []; for (var i = 0; i < 48; i++) { var a0 = 2 * Math.PI * i / 48, a1 = 2 * Math.PI * (i + 1) / 48, p0 = world(Math.cos(a0) * 149.6, Math.sin(a0) * 149.6), p1 = world(Math.cos(a1) * 149.6, Math.sin(a1) * 149.6);
      W.push({ x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z, y0: g0, y1: g0 + 20 * U }); } o.hover.wallride.setWalls(W); }
    // ELEVATOR: E at the glass shaft base (13, 105) -> the drop deck (0, 105); E on the deck -> back down
    var base = world(13, 99), top = world(0, 108);
    addEventListener('keydown', function (e) {
      if (e.code !== 'KeyE' || e.repeat) return; var P = root.__w3dDebug && root.__w3dDebug.playerPos; if (!P) return;
      var dB = Math.hypot(P.x - base.x, P.z - base.z) / U, dT = Math.hypot(P.x - top.x, P.z - top.z) / U, up = dB < 6, down = dT < 7 && P.y > g0 + 30 * U; if (!up && !down) return;
      e.stopImmediatePropagation(); e.preventDefault(); var to = up ? top : base; P.x = to.x; P.z = to.z; P.y = g0 + (up ? 46.6 : 0.4) * U;
      var say = (root.Navi && root.Navi.toast) || root.__toast; if (say) say(up ? 'Elevator ▲ Drop deck - ride the ramp into the bowl' : 'Elevator ▼ Park floor');
    }, true);
    // ELECTRIC RAMPS + SPEED PADS: launch off a ramp lip (u > 20 m, moving outward) and get thrown high; speed pads add a burst
    var cool = 0;
    setInterval(function () {
      var hv = o.hover, st = hv && hv.isRiding && hv.isRiding() && hv.state && hv.state(); if (!st) return; cool = Math.max(0, cool - 0.05);
      var L = local(st.x, st.z), bx = L[0], by = L[1];
      for (var k = 0; k < 4; k++) { var a = Math.PI / 4 + k * Math.PI / 2, u = bx * Math.cos(a) + by * Math.sin(a) - 88, v = -bx * Math.sin(a) + by * Math.cos(a);
        if (u > 20 && u < 25 && Math.abs(v) < 6 && !st.air && cool <= 0 && st.v > 6) { st.vy = 22 * U; st.air = true; st.airT = 0; cool = 1.5; var say = root.__toast; if (say) say('⚡ Electric launch!'); } }
      for (var j = 0; j < 8; j++) { var b = 2 * Math.PI * j / 8 + Math.PI / 8; if (Math.hypot(bx - Math.cos(b) * 75, by - Math.sin(b) * 75) < 4 && cool <= 0) { st.v = Math.min((st.v || 0) * 1.5 + 4, 40); cool = 1; } }
    }, 50);
    root.__parkK40 = { heightAt: heightAt, local: local, world: world, state: S };
    return root.__parkK40;
  }
  root.WorldHoverParkK40 = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);
