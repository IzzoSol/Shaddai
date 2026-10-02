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
    /* ARTICULATED PEOPLE (2026-10-02, owner: NPCs were crude capsules): 7 instanced parts per citizen - torso, two swinging legs (with shoes), two swinging arms, head, hair.
     * Every part is one InstancedMesh (7 draw calls for the whole crowd). Limbs pivot at hip/shoulder and swing in anti-phase while walking; idle = slow arm sway + breathing. */
    var M = function (c) { return new THREE.MeshLambertMaterial({ color: c, vertexColors: true }); };
    function tint(g, fn) { var p = g.attributes.position, a = new Float32Array(p.count * 3); for (var i = 0; i < p.count; i++) { var k = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = k[0]; a[i * 3 + 1] = k[1]; a[i * 3 + 2] = k[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
    var W1 = [1, 1, 1];
    var torsoG = tint(new THREE.CapsuleGeometry(0.2, 0.36, 3, 8).scale(1.12, 1, 0.68), function (x, y) { return y < -0.22 ? [0.55, 0.55, 0.6] : W1; });   // belt-line shading near the bottom
    var legG = tint(new THREE.CylinderGeometry(0.085, 0.07, 0.8, 6).translate(0, -0.4, 0), function (x, y) { return y < -0.72 ? [0.12, 0.12, 0.14] : W1; });         // trousers with dark shoe tip
    var armG = tint(new THREE.CylinderGeometry(0.058, 0.05, 0.62, 6).translate(0, -0.31, 0), function (x, y) { return y < -0.5 ? [0.93, 0.8, 0.68] : W1; });      // sleeve with a hand
    var headG = tint(new THREE.SphereGeometry(0.125, 9, 7), function () { return W1; });
    var hairG = tint(new THREE.SphereGeometry(0.138, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.58).translate(0, 0.012, -0.012), function () { return W1; });
    var parts = { torso: new THREE.InstancedMesh(torsoG, M(0xffffff), N), legL: new THREE.InstancedMesh(legG, M(0xffffff), N), legR: new THREE.InstancedMesh(legG, M(0xffffff), N), armL: new THREE.InstancedMesh(armG, M(0xffffff), N), armR: new THREE.InstancedMesh(armG, M(0xffffff), N), head: new THREE.InstancedMesh(headG, M(0xffffff), N), hair: new THREE.InstancedMesh(hairG, M(0xffffff), N) };
    var bodies = parts.torso, heads = parts.head; Object.keys(parts).forEach(function (k) { parts[k].frustumCulled = false; parts[k].name = 'crowd-' + k; });
    var SKIN = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5a3a, 0x6b4129, 0xf6d9bd], HAIR = [0x1a1a1f, 0x3b2a1e, 0x6a4a2a, 0xb8872e, 0xd9d2c0, 0x7a2a2a, 0x2a4a7a], PANTS = [0x23262e, 0x34384a, 0x4a4036, 0x2e3a34, 0x5a5a62, 0x1d2a3a], hex = new THREE.Color();

    var col = new THREE.Color(); Object.keys(parts).forEach(function (k) { scene.add(parts[k]); });
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
    function paint(i) {   // deterministic variety: outfit colour, trousers, skin, hair
      var r = (i * 2654435761) >>> 0, pick = function (arr, sh) { return arr[((r >>> sh) % arr.length + arr.length) % arr.length]; };
      hex.setHex(PALETTE[i % PALETTE.length]); parts.torso.setColorAt(i, hex); parts.armL.setColorAt(i, hex); parts.armR.setColorAt(i, hex);
      hex.setHex(pick(PANTS, 3)); parts.legL.setColorAt(i, hex); parts.legR.setColorAt(i, hex); hex.setHex(pick(SKIN, 7)); parts.head.setColorAt(i, hex); hex.setHex(pick(HAIR, 11)); parts.hair.setColorAt(i, hex);
    }
    for (var i = 0; i < N; i++) { paint(i); people.push({ x: 0, z: 0, tx: 0, tz: 0, yaw: 0, sp: SPEED[0] + Math.random() * (SPEED[1] - SPEED[0]), pause: Math.random() * 3, talkCd: Math.random() * 10, ph: Math.random() * 6.28, h: 1.55 + Math.random() * 0.4, init: false }); }
    Object.keys(parts).forEach(function (k) { parts[k].instanceColor.needsUpdate = true; });
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
        var vis = dp < SHOW_M, gy = vis ? hAt(p.x, p.z) : 0, moving = p.pause <= 0, sc = U * (p.h / 1.7), ph = now * 7 * p.sp + p.ph;
        if (!vis) { dummy.position.set(p.x, -9999, p.z); dummy.scale.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); for (var kk in parts) parts[kk].setMatrixAt(i, dummy.matrix); }
        else {
          shown++; var sw = moving ? Math.sin(ph) * 0.78 : 0, idle = moving ? 0 : Math.sin(now * 1.4 + p.ph) * 0.05, bob = moving ? Math.abs(Math.sin(ph)) * 0.035 : Math.sin(now * 1.7 + p.ph) * 0.006, cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
          var put = function (mesh, lx, ly, lz, rx, rz, twist) { dummy.position.set(p.x + (lx * cy + lz * sy) * sc, gy + (ly + bob) * sc, p.z + (-lx * sy + lz * cy) * sc); dummy.rotation.order = 'YXZ'; dummy.rotation.set(rx || 0, p.yaw + (twist || 0), rz || 0); dummy.scale.set(sc, sc, sc); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
          put(parts.torso, 0, 1.12, 0, 0.04 * (moving ? 1 : 0), 0, moving ? Math.sin(ph) * 0.07 : 0);
          put(parts.legL, -0.105, 0.82, 0, sw); put(parts.legR, 0.105, 0.82, 0, -sw);
          put(parts.armL, -0.27, 1.41, 0, -sw * 0.8 + idle, 0.04); put(parts.armR, 0.27, 1.41, 0, sw * 0.8 - idle, -0.04);
          put(parts.head, 0, 1.63, 0.01, moving ? 0.03 : 0); put(parts.hair, 0, 1.63, 0.01, moving ? 0.03 : 0);
        } }
      Object.keys(parts).forEach(function (k) { parts[k].instanceMatrix.needsUpdate = true; });
    }
    return { update: update, stats: function () { return { total: N, shown: shown, waypoints: wps.length, footprints: rect.length }; }, dispose: function () { Object.keys(parts).forEach(function (k) { scene.remove(parts[k]); }); }, parts: parts, bodies: bodies, _people: people, _refresh: refreshWaypoints };
  };
})(typeof window !== 'undefined' ? window : globalThis);
