/* world-crowd.js — CITIZENS: ~90 pedestrians who walk the city so it feels lived-in (owner 2026-10-01: "more NPCs walking around").
 *
 *   var crowd = window.buildWorldCrowd({ THREE, scene, heightAt, getPlayer(): {pos}, waypoints?(): [{x,z}], footprints?(): {code:{shape,...}} })
 *   crowd.update(dt)   crowd.stats()   crowd.dispose()
 *
 * 2 InstancedMesh draw calls total (bodies + heads), per-instance colour; walk bob/sway/stride are composed into each instance matrix.
 * Citizens stroll between WAYPOINTS (building entrances, the forum, kiosks, park gate, maglev stations), pause to "chat", never enter measured building footprints,
 * and are re-seeded near the player when far away (out of sight) so the crowd is always around you. Beyond SHOW_M they are scaled to 0. Zero allocation per frame.
 * Units: world units, U = 7/1.8 per metre.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, N = 90, SHOW_M = 330, RESEED_M = 520, SPEED = [1.1, 1.6], PALETTE = [0x27e0ff, 0xe8c45c, 0x34e5b0, 0xc084fc, 0xff5a6e, 0x5fa8ff, 0xff9a3a, 0xe9f4ee, 0x8fa3b8, 0xf2b6d0];
  root.buildWorldCrowd = function (o) {
    var THREE = o.THREE, scene = o.scene, hAt = o.heightAt;
    var bodyG = new THREE.CapsuleGeometry(0.28, 0.9, 3, 8), headG = new THREE.SphereGeometry(0.2, 8, 6);
    var bodyM = new THREE.MeshLambertMaterial({ color: 0xffffff }), headM = new THREE.MeshLambertMaterial({ color: 0xe6c9a8 });
    var bodies = new THREE.InstancedMesh(bodyG, bodyM, N), heads = new THREE.InstancedMesh(headG, headM, N); bodies.frustumCulled = false; heads.frustumCulled = false; bodies.name = 'crowd-bodies'; heads.name = 'crowd-heads';
    var col = new THREE.Color(); scene.add(bodies); scene.add(heads);
    var dummy = new THREE.Object3D(), people = [], wps = [], rect = [], tAcc = 0;
    function refreshWaypoints() {
      wps.length = 0; var add = function (x, z) { if (isFinite(x) && isFinite(z)) wps.push({ x: x, z: z }); };
      try { (root.__entrances || []).forEach(function (e) { add(e.x + e.nx * 40, e.z + e.nz * 40); add(e.x + e.nx * 60 + e.nz * 30, e.z + e.nz * 60 - e.nx * 30); }); } catch (e) { }
      try { if (root.__hoverPark && root.__hoverPark.entrance) { add(root.__hoverPark.entrance.x, root.__hoverPark.entrance.z); } } catch (e) { }
      try { if (root.__worldTransitApi && root.__worldTransitApi.stations) root.__worldTransitApi.stations.forEach(function (s) { add(s.x + 20, s.z + 20); }); } catch (e) { }
      add(0, 0); add(0, 60); add(0, 200); add(60, 120); add(-60, 120); add(120, 0); add(-120, 0); add(0, -120);
      if (o.waypoints) { try { o.waypoints().forEach(function (w) { add(w.x, w.z); }); } catch (e) { } }
      rect.length = 0; var fp = o.footprints ? o.footprints() : null; if (fp) Object.keys(fp).forEach(function (k) { var f = fp[k]; if (f.shape === 'box') rect.push({ x0: f.minX - 6, x1: f.maxX + 6, z0: f.minZ - 6, z1: f.maxZ + 6 }); else if (f.shape === 'circle') rect.push({ x0: f.cx - f.r - 6, x1: f.cx + f.r + 6, z0: f.cz - f.r - 6, z1: f.cz + f.r + 6 }); });
      wps = wps.filter(function (w) { return !blocked(w.x, w.z); });
    }
    function blocked(x, z) { for (var i = 0; i < rect.length; i++) { var r = rect[i]; if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true; } return false; }
    function pick(near) { // a waypoint (preferably near a point) with a little scatter
      var best = null, bd = 1e12, c = 0; for (var i = 0; i < wps.length; i++) { var w = wps[i], d = near ? Math.hypot(w.x - near.x, w.z - near.z) : Math.random(); if (near) { if (d < bd * (0.6 + Math.random() * 0.8) || !best) { bd = d; best = w; } } else if (!best || Math.random() < 1 / (++c)) best = w; }
      return best ? { x: best.x + (Math.random() - 0.5) * 70, z: best.z + (Math.random() - 0.5) * 70 } : { x: (Math.random() - 0.5) * 200, z: (Math.random() - 0.5) * 200 };
    }
    for (var i = 0; i < N; i++) { col.setHex(PALETTE[i % PALETTE.length]); bodies.setColorAt(i, col); people.push({ x: 0, z: 0, tx: 0, tz: 0, yaw: 0, sp: SPEED[0] + Math.random() * (SPEED[1] - SPEED[0]), pause: Math.random() * 3, talkCd: Math.random() * 10, ph: Math.random() * 6.28, h: 1.55 + Math.random() * 0.4, init: false }); }
    bodies.instanceColor.needsUpdate = true;
    var shown = 0;
    function place(p, pl, far) { var t = pick(pl ? { x: pl.x, z: pl.z } : null), a = Math.random() * 6.28, r = 60 + Math.random() * 200 * U / 3; p.x = t.x; p.z = t.z; if (blocked(p.x, p.z)) { p.x += 40; } var t2 = pick(pl ? { x: pl.x, z: pl.z } : null); p.tx = t2.x; p.tz = t2.z; p.init = true; }
    function update(dt) {
      var pl = o.getPlayer ? o.getPlayer() : null, P = pl && pl.pos; if (!P) return; tAcc += dt; if (!wps.length || tAcc > 20) { tAcc = 0; refreshWaypoints(); }
      shown = 0; var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      for (var i = 0; i < N; i++) { var p = people[i];
        if (!p.init) place(p, P);
        var dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), dp = Math.hypot(p.x - P.x, p.z - P.z) / U;
        if (dp > RESEED_M) { place(p, P); dp = 0; }
        p.talkCd -= dt; if (o.onTalk && dp < 4.5 && p.talkCd <= 0) { p.talkCd = 28 + Math.random() * 20; p.pause = 4; p.yaw = Math.atan2(P.x - p.x, P.z - p.z); o.onTalk({ x: p.x, z: p.z, i: i }); }
        if (p.pause > 0) { p.pause -= dt; }
        else if (d < 2 * U) { p.pause = 2 + Math.random() * 6; var t = pick(null); p.tx = t.x; p.tz = t.z; if (Math.random() < 0.5) { var t3 = pick({ x: P.x, z: P.z }); p.tx = t3.x; p.tz = t3.z; } }
        else if (dp < SHOW_M + 80) { var nx = p.x + dx / d * p.sp * U * dt, nz = p.z + dz / d * p.sp * U * dt; if (blocked(nx, nz)) { var t4 = pick(null); p.tx = t4.x; p.tz = t4.z; } else { p.x = nx; p.z = nz; } p.yaw += (Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 6); }
        var vis = dp < SHOW_M, gy = vis ? hAt(p.x, p.z) : 0, moving = p.pause <= 0, bob = moving ? Math.abs(Math.sin(now * 7 * p.sp + p.ph)) * 0.07 : Math.sin(now * 1.5 + p.ph) * 0.01, sway = moving ? Math.sin(now * 3.5 * p.sp + p.ph) * 0.06 : 0;
        if (!vis) { dummy.position.set(p.x, -9999, p.z); dummy.scale.set(0, 0, 0); } else { shown++; dummy.position.set(p.x, gy + (0.58 + bob) * U * (p.h / 1.7), p.z); dummy.rotation.set(0, p.yaw, sway); dummy.scale.set(U * (p.h / 1.7), U * (p.h / 1.7), U * (p.h / 1.7)); }
        dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
        if (vis) { dummy.position.set(p.x, gy + (1.52 + bob) * U * (p.h / 1.7), p.z); dummy.rotation.set(0, p.yaw, 0); } dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix); }
      bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    }
    return { update: update, stats: function () { return { total: N, shown: shown, waypoints: wps.length, footprints: rect.length }; }, dispose: function () { scene.remove(bodies); scene.remove(heads); }, bodies: bodies, _people: people, _refresh: refreshWaypoints };
  };
})(typeof window !== 'undefined' ? window : globalThis);
