/* world-hovercars.js — HOVER CAR KIT + AIR TRAFFIC (owner refs 2026-10-01: retro hover cars/vans/trucks sheet + Rimba Racer pod car).
 *
 *   WorldHoverCars.TYPES        [{id, name, len, w, h}]  11 designs: sedan, coupe, pickup (crates), limo, van, mini bubble, wedge, roadster, bus, wagon (luggage), pod (Rimba racer)
 *   WorldHoverCars.buildGroup(THREE, id, hex?)  -> THREE.Group in METRES (+z nose, y up), vertex-coloured body + glass + thruster pods + glow bits; userData.saddle (seat) — used by the rideable cars (world-mount-ride.js)
 *   WorldHoverCars.buildTraffic({THREE, scene, heightAt, getPlayer})  -> { update(dt), stats(), dispose() }   ambient AIR TRAFFIC: ~100 cars on altitude lanes + 18 flying riders (person on a hoverboard)
 *
 * Everything is code (no GLB, no fal): ~250-450 tris per car, one merged vertex-coloured mesh per type + 3 shared glow InstancedMeshes (headlights, tail lights, underglow) = ~15 draw calls for the whole fleet.
 * Lanes: concentric rings over the city (alt 14-50 m), two crossing avenues, and a LOCAL ring that follows the player so traffic is always in view. Zero lights, zero per-frame allocation.
 * Units: world units on XZ, U = 7/1.8 per metre.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;
  var TYPES = [
    { id: 'sedan', name: 'Streak Sedan', len: 4.4, w: 1.9, h: 1.25 }, { id: 'coupe', name: 'Blue Coupe', len: 4.6, w: 1.9, h: 1.15 }, { id: 'pickup', name: 'Cargo Pickup', len: 5.4, w: 2.2, h: 2.2 },
    { id: 'limo', name: 'Night Limo', len: 5.6, w: 2.0, h: 1.3 }, { id: 'van', name: 'Courier Van', len: 4.8, w: 2.0, h: 2.0 }, { id: 'mini', name: 'Bubble Mini', len: 3.2, w: 1.7, h: 1.6 },
    { id: 'wedge', name: 'Gold Wedge', len: 4.4, w: 2.0, h: 1.1 }, { id: 'roadster', name: 'Red Roadster', len: 4.3, w: 1.9, h: 1.2 }, { id: 'bus', name: 'City Shuttle', len: 7.4, w: 2.4, h: 2.7 },
    { id: 'wagon', name: 'Voyager Wagon', len: 5.0, w: 2.0, h: 1.9 }, { id: 'pod', name: 'Rimba Pod Racer', len: 3.6, w: 2.3, h: 1.3 }
  ];
  var BODY = { sedan: 0xf2f4f8, coupe: 0x3a9ad0, pickup: 0x4f7a3a, limo: 0x15171c, van: 0xefe7cf, mini: 0xe8a04a, wedge: 0xe8c43a, roadster: 0xc2332c, bus: 0xd8cf8a, wagon: 0xc47a3a, pod: 0x6b8f3a };
  var ACCENT = { sedan: 0xff3ea5, coupe: 0x27e0ff, pickup: 0xcaa24a, limo: 0x7a2bd6, van: 0x3a8f9a, mini: 0xfff0b0, wedge: 0x2a2a2a, roadster: 0xe9e9e9, bus: 0x2f7a6e, wagon: 0xe8d8a0, pod: 0xe9f23a };
  var GLASS = 0x1b3a52, DARK = 0x20242c, CHROME = 0xaab4c2;

  // RACE KART stats: top speed m/s, handling rad/s, accel 1-5, weight 1-5 (heavy karts shrug off stuns), tall = model height m
  var KARTS = { pod: { top: 44, handle: 2.6, accel: 5, weight: 2, tall: 1.4 }, sedan: { top: 38, handle: 2.2, accel: 4, weight: 3, tall: 1.4 }, coupe: { top: 40, handle: 2.3, accel: 4, weight: 3, tall: 1.3 }, wedge: { top: 42, handle: 2.1, accel: 4, weight: 2, tall: 1.2 },
    roadster: { top: 41, handle: 2.4, accel: 4, weight: 3, tall: 1.3 }, mini: { top: 32, handle: 2.8, accel: 3, weight: 1, tall: 1.8 }, wagon: { top: 34, handle: 2.0, accel: 3, weight: 3, tall: 2.1 }, van: { top: 30, handle: 1.7, accel: 3, weight: 4, tall: 2.0 },
    pickup: { top: 31, handle: 1.8, accel: 3, weight: 4, tall: 2.4 }, limo: { top: 36, handle: 1.6, accel: 3, weight: 4, tall: 1.4 }, bus: { top: 26, handle: 1.3, accel: 2, weight: 5, tall: 2.9 } };
  function meta(id) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i]; return TYPES[0]; }

  // merged vertex-coloured geometry builder (BoxGeometry parts only: cheap, readable, flat-shaded retro-futurist look)
  function make(THREE, id) {
    var T = meta(id), L = T.len, W = T.w, H = T.h, parts = [];
    function box(x, y, z, sx, sy, sz, color, rx, ry, rz) { var g = new THREE.BoxGeometry(sx, sy, sz); if (rx || ry || rz) g.rotateX(rx || 0), g.rotateY(ry || 0), g.rotateZ(rz || 0); g.translate(x, y, z); var n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); }
    var B = BODY[id], A = ACCENT[id], base = 0.5;   // chassis floor height
    var nose = L / 2, tail = -L / 2;
    if (id === 'pod') {   // Rimba racer: bubble canopy tub between four big thruster pods
      box(0, base + 0.35, 0, W * 0.62, 0.7, L * 0.9, B); box(0, base + 0.95, -0.1, W * 0.5, 0.7, L * 0.55, GLASS); box(0, base + 0.65, 0.2, 0.5, 0.5, 0.9, 0x7a2a2a);   // tub, canopy, seat
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { box(p[0] * (W / 2 - 0.2), base + 0.35, p[1] * (L / 2 - 0.45), 0.7, 0.7, 0.7, 0xdfe3e8); box(p[0] * (W / 2 - 0.2), base + 0.35, p[1] * (L / 2 - 0.45), 0.78, 0.18, 0.78, A); });
    } else if (id === 'pickup') {
      box(0, base + 0.4, 0, W, 0.8, L, B); box(0, base + 1.2, nose - 1.1, W * 0.92, 1.0, 1.9, B); box(0, base + 1.3, nose - 1.1, W * 0.8, 0.7, 1.82, GLASS);   // chassis + cab + glass
      box(0, base + 1.1, tail + 1.4, W * 0.94, 1.1, 2.5, 0x8a6a3a); box(0.3, base + 1.9, tail + 1.3, 0.9, 0.7, 0.9, 0xb89a62); box(-0.4, base + 1.8, tail + 1.9, 0.8, 0.6, 0.8, 0xa5834a);   // cargo bed + crates
    } else if (id === 'bus' || id === 'van') {
      box(0, base + 0.4, 0, W, 0.8, L, B); box(0, base + H * 0.6, -0.1, W * 0.96, H - 0.4, L * 0.94, B); box(0, base + H * 0.68, nose - 0.35, W * 0.84, H * 0.5, 0.2, GLASS); box(0, base + H * 0.75, 0, W * 0.98, H * 0.34, L * 0.62, GLASS); box(0, base + H + 0.05, 0, W * 0.9, 0.18, L * 0.86, A);
    } else if (id === 'mini') {
      box(0, base + 0.4, 0, W, 0.8, L, B); box(0, base + 1.1, 0, W * 0.9, 1.0, L * 0.7, GLASS); box(0, base + 1.7, 0, W * 0.66, 0.14, L * 0.5, B);
    } else if (id === 'wedge') {
      box(0, base + 0.3, 0, W, 0.6, L, B); box(0, base + 0.75, -0.3, W * 0.8, 0.5, L * 0.5, GLASS, -0.1); box(0, base + 0.52, nose - 0.6, W * 0.9, 0.12, 1.1, A);
    } else {   // sedan / coupe / limo / roadster / wagon: chassis + cabin + glass band + accent stripe
      var cab = id === 'limo' ? L * 0.42 : (id === 'wagon' ? L * 0.62 : L * 0.46), cabH = id === 'coupe' || id === 'roadster' ? 0.62 : 0.78;
      box(0, base + 0.32, 0, W, 0.64, L, B); box(0, base + 0.64 + cabH * 0.5, -L * 0.08, W * 0.86, cabH, cab, B); box(0, base + 0.64 + cabH * 0.55, -L * 0.08, W * 0.9, cabH * 0.62, cab * 0.94, GLASS);
      box(0, base + 0.34, 0, W * 1.01, 0.1, L * 0.96, A);
      if (id === 'wagon') { box(0, base + 0.64 + cabH + 0.1, -L * 0.1, W * 0.7, 0.12, cab * 0.9, DARK); box(0.2, base + 0.64 + cabH + 0.4, -L * 0.1, 0.9, 0.5, 0.7, 0x4a6a62); box(-0.4, base + 0.64 + cabH + 0.35, -L * 0.2, 0.8, 0.4, 0.6, 0x8a6a3a); }
      if (id === 'sedan') box(0, base + 0.95, tail + 0.1, W * 0.7, 0.1, 0.35, A);   // little rear wing
    }
    // thruster pods + chrome bumpers (all types except the pod, which has its own)
    if (id !== 'pod') { [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { box(p[0] * (W / 2 - 0.25), base - 0.1, p[1] * (L / 2 - 0.7), 0.55, 0.28, 0.9, DARK); }); box(0, base + 0.15, nose + 0.02, W * 0.98, 0.18, 0.12, CHROME); box(0, base + 0.15, tail - 0.02, W * 0.98, 0.18, 0.12, CHROME); }
    // merge
    var total = 0; parts.forEach(function (g) { total += g.attributes.position.count; });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), idx = [], off = 0;
    parts.forEach(function (g) { var p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array; pos.set(p, off * 3); nor.set(n, off * 3); col.set(c, off * 3); var ix = g.index.array; for (var i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += g.attributes.position.count; });
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    return { geo: geo, glow: { nose: nose, tail: tail, hw: W / 2 - 0.35, y: base + 0.5 }, tris: idx.length / 3 };
  }
  var cache = {};
  function kit(THREE, id) { var k = cache[id]; if (!k || k.THREE !== THREE) { k = make(THREE, id); k.THREE = THREE; cache[id] = k; } return k; }

  function buildGroup(THREE, id, hex) {
    var k = kit(THREE, id), g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: hex != null ? hex : 0xffffff }), body = new THREE.Mesh(k.geo, mat); g.add(body);
    var emis = function (c) { return new THREE.MeshBasicMaterial({ color: c }); };
    [-1, 1].forEach(function (s) { var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), emis(0xfff2c0)); hl.position.set(s * k.glow.hw, k.glow.y, k.glow.nose + 0.03); g.add(hl); var tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), emis(0xff3a3a)); tl.position.set(s * k.glow.hw, k.glow.y, k.glow.tail - 0.03); g.add(tl); });
    var ug = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: ACCENT[id], transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ug.rotation.x = -Math.PI / 2; ug.scale.set(meta(id).w * 0.8, meta(id).len * 0.7, 1); ug.position.y = 0.1; g.add(ug);
    var seat = new THREE.Object3D(); seat.name = 'saddle'; seat.position.set(0, 1.25, id === 'pod' ? 0.1 : -0.2); g.add(seat); g.userData.saddle = seat; g.userData.tris = k.tris; return g;
  }

  // ───────────────── AIR TRAFFIC ─────────────────
  function buildTraffic(o) {
    var THREE = o.THREE, scene = o.scene, hAt = o.heightAt || function () { return 0; };
    var group = new THREE.Group(); group.name = 'air-traffic'; scene.add(group);
    var PAL = [0xffffff, 0x6fd0ff, 0xff7aa8, 0xffd36a, 0x9affc2, 0xc7a6ff, 0xff9a5a, 0xa6b8d0, 0xe8e0c8, 0x5aa0ff, 0xff5a6e, 0x34e5b0];
    // fleet composition per type (counts) + riders
    var FLEET = { sedan: 12, coupe: 10, pickup: 8, limo: 6, van: 10, mini: 10, wedge: 8, roadster: 8, bus: 6, wagon: 8, pod: 6 }, RIDERS = 18;
    var cars = [], total = 0; Object.keys(FLEET).forEach(function (k) { total += FLEET[k]; });
    // lanes: rings (radius m, altitude m, direction) over the city + two avenues + a LOCAL ring that follows the player
    var RINGS = [[260, 16, 1], [420, 24, -1], [640, 32, 1], [900, 40, -1], [1250, 48, 1], [1600, 56, -1]];
    var meshes = {}; Object.keys(FLEET).forEach(function (id) { var k = kit(THREE, id), m = new THREE.InstancedMesh(k.geo, new THREE.MeshLambertMaterial({ vertexColors: true }), FLEET[id]); m.frustumCulled = false; m.name = 'air-' + id; group.add(m); meshes[id] = m; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLEET[id] * 3), 3); });
    var hl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), total * 2), tl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3a3a }), total * 2), ug = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), total + RIDERS);
    [hl, tl, ug].forEach(function (m) { m.frustumCulled = false; group.add(m); });
    // flying riders: a person standing on a hoverboard (2 instanced meshes)
    var boardM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.08, 1.5), new THREE.MeshBasicMaterial({ color: 0x27e0ff }), RIDERS), personM = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.9, 3, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), RIDERS); [boardM, personM].forEach(function (m) { m.frustumCulled = false; group.add(m); }); personM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RIDERS * 3), 3);
    var dummy = new THREE.Object3D(), col = new THREE.Color(), ci = {}, n = 0;
    Object.keys(FLEET).forEach(function (id) { ci[id] = 0; for (var i = 0; i < FLEET[id]; i++) { var ring = n % (RINGS.length + 3), lane; if (ring < RINGS.length) lane = { kind: 'ring', R: RINGS[ring][0] * U, alt: RINGS[ring][1], dir: RINGS[ring][2] }; else if (ring === RINGS.length) lane = { kind: 'ave', axis: 'x', alt: 20 + (n % 5) * 5 }; else if (ring === RINGS.length + 1) lane = { kind: 'ave', axis: 'z', alt: 26 + (n % 5) * 5 }; else lane = { kind: 'local', R: (110 + (n % 4) * 40) * U, alt: 10 + (n % 3) * 6, dir: n % 2 ? 1 : -1 };
      var T = meta(id); cars.push({ id: id, k: ci[id]++, lane: lane, a: Math.random() * 6.28, s: 8 + Math.random() * 12, ph: Math.random() * 6.28, color: PAL[n % PAL.length], len: T.len, w: T.w, glow: kit(THREE, id).glow, gi: n }); col.setHex(PAL[n % PAL.length]); meshes[id].setColorAt(cars[cars.length - 1].k, col); n++; } });
    Object.keys(meshes).forEach(function (id) { meshes[id].instanceColor.needsUpdate = true; });
    var riders = []; for (var r = 0; r < RIDERS; r++) { riders.push({ R: (150 + (r % 6) * 230) * U, alt: 8 + (r % 5) * 7, dir: r % 2 ? 1 : -1, a: Math.random() * 6.28, s: 6 + Math.random() * 7, ph: Math.random() * 6.28 }); col.setHex(PAL[(r * 5) % PAL.length]); personM.setColorAt(r, col); } personM.instanceColor.needsUpdate = true;
    var lcx = 0, lcz = 0, t = 0, st = { cars: n, riders: RIDERS, near: 0 };
    function update(dt) {
      var pl = o.getPlayer ? o.getPlayer() : null, P = pl && pl.pos; t += dt; if (P) { lcx += (P.x - lcx) * Math.min(1, dt * 0.4); lcz += (P.z - lcz) * Math.min(1, dt * 0.4); }
      var near = 0, gi = 0;
      for (var i = 0; i < cars.length; i++) { var c = cars[i], L = c.lane, x, z, yaw, alt = L.alt;
        if (L.kind === 'ave') { c.a += c.s * U * dt; var span = 1700 * U, p = ((c.a % (2 * span)) + 2 * span) % (2 * span), f = p < span ? p : 2 * span - p, dirS = p < span ? 1 : -1; if (L.axis === 'x') { x = -span / 2 + f * 1; x = f - span / 2; z = (c.gi % 2 ? 40 : -40) * U; yaw = dirS > 0 ? Math.PI / 2 : -Math.PI / 2; } else { z = f - span / 2; x = (c.gi % 2 ? 40 : -40) * U; yaw = dirS > 0 ? 0 : Math.PI; } }
        else { var cx = L.kind === 'local' ? lcx : 0, cz = L.kind === 'local' ? lcz : 0; c.a += (c.s * U / L.R) * L.dir * dt; x = cx + Math.cos(c.a) * L.R; z = cz + Math.sin(c.a) * L.R; yaw = Math.atan2(-Math.sin(c.a) * L.dir, Math.cos(c.a) * L.dir) + 0 ; yaw = Math.atan2(-Math.sin(c.a) * L.dir, Math.cos(c.a) * L.dir); }
        var gy = hAt(x, z), y = Math.max(gy + 6 * U, gy + alt * U * 0.35) + Math.sin(t * 1.3 + c.ph) * 0.35 * U, bank = Math.sin(t * 0.9 + c.ph) * 0.05;
        if (P) { var dd = Math.hypot(x - P.x, z - P.z) / U; if (dd < 120) near++; }
        dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, bank); dummy.scale.setScalar(U); dummy.updateMatrix(); meshes[c.id].setMatrixAt(c.k, dummy.matrix);
        var cs = Math.cos(yaw), sn = Math.sin(yaw), g = c.glow, put = function (m, idx, lx, ly, lz) { dummy.position.set(x + lx * cs * U + lz * sn * U, y + ly * U, z - lx * sn * U + lz * cs * U); dummy.rotation.set(0, yaw, bank); dummy.scale.setScalar(U); dummy.updateMatrix(); m.setMatrixAt(idx, dummy.matrix); };
        put(hl, gi * 2, -g.hw, g.y, g.nose); put(hl, gi * 2 + 1, g.hw, g.y, g.nose); put(tl, gi * 2, -g.hw, g.y, g.tail); put(tl, gi * 2 + 1, g.hw, g.y, g.tail);
        dummy.position.set(x, y + 0.05 * U, z); dummy.rotation.set(-Math.PI / 2, 0, yaw); dummy.scale.set(c.w * 0.8 * U, c.len * 0.7 * U, 1); dummy.updateMatrix(); ug.setMatrixAt(gi, dummy.matrix); gi++; }
      for (var r = 0; r < riders.length; r++) { var q = riders[r]; q.a += (q.s * U / q.R) * q.dir * dt; var rx = Math.cos(q.a) * q.R + Math.sin(t * 0.7 + q.ph) * 30 * U, rz = Math.sin(q.a) * q.R + Math.cos(t * 0.6 + q.ph) * 30 * U, ry = hAt(rx, rz) + (q.alt + Math.sin(t * 1.1 + q.ph) * 3) * U * 0.5 + 4 * U, yw = Math.atan2(-Math.sin(q.a) * q.dir, Math.cos(q.a) * q.dir);
        dummy.position.set(rx, ry, rz); dummy.rotation.set(0, yw, Math.sin(t * 1.4 + q.ph) * 0.18); dummy.scale.setScalar(U); dummy.updateMatrix(); boardM.setMatrixAt(r, dummy.matrix);
        dummy.position.set(rx, ry + 1.0 * U, rz); dummy.updateMatrix(); personM.setMatrixAt(r, dummy.matrix);
        dummy.position.set(rx, ry - 0.05 * U, rz); dummy.rotation.set(-Math.PI / 2, 0, yw); dummy.scale.set(0.8 * U, 1.1 * U, 1); dummy.updateMatrix(); ug.setMatrixAt(cars.length + r, dummy.matrix); }
      Object.keys(meshes).forEach(function (id) { meshes[id].instanceMatrix.needsUpdate = true; }); hl.instanceMatrix.needsUpdate = tl.instanceMatrix.needsUpdate = ug.instanceMatrix.needsUpdate = boardM.instanceMatrix.needsUpdate = personM.instanceMatrix.needsUpdate = true; st.near = near;
    }
    return { update: update, stats: function () { return { cars: st.cars, riders: st.riders, nearPlayer: st.near, drawCalls: Object.keys(meshes).length + 7 }; }, dispose: function () { scene.remove(group); }, group: group };
  }
  root.WorldHoverCars = { KARTS: KARTS, TYPES: TYPES, buildGroup: buildGroup, buildTraffic: buildTraffic, kit: kit };
})(typeof window !== 'undefined' ? window : globalThis);
