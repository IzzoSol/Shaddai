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

  // ── SCULPTED BODIES (2026-10-02, owner: "ships/cars are basic boxes"): lofted superellipse cross-sections (smooth normals, tapered nose/tail), separate glass canopy, belt stripe, nacelles, fins.
  //    One merged indexed vertex-coloured geometry per type, 350-700 triangles, no textures.
  function hexRGB(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
  function sgnPow(v, p) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), p); }
  /* st: [{z, w (half width), y0, y1, n (squareness, 2 = ellipse, 4+ = boxy), cx?}], RING points per station. colorFn(sy -1..1 around the ring, sx -1..1, station index) -> [r,g,b] */
  function loft(THREE, st, ring, colorFn) {
    var pos = [], col = [], idx = [], i, j;
    for (i = 0; i < st.length; i++) {
      var s = st[i], yc = (s.y0 + s.y1) / 2, hh = Math.max(0.02, (s.y1 - s.y0) / 2), ex = 2 / (s.n || 2.6);
      for (j = 0; j < ring; j++) { var a = j / ring * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.push((s.cx || 0) + Math.max(0.02, s.w) * sgnPow(c, ex), yc + hh * sgnPow(sn, ex), s.z); var k = colorFn(sn, c, i);   /* raw ring angle (not the stretched height) so colour bands sit where you expect */ col.push(k[0], k[1], k[2]); }
    }
    for (i = 0; i < st.length - 1; i++) for (j = 0; j < ring; j++) { var a0 = i * ring + j, b0 = i * ring + (j + 1) % ring, a1 = (i + 1) * ring + j, b1 = (i + 1) * ring + (j + 1) % ring; idx.push(a0, b0, a1, b0, b1, a1); }   /* outward-facing winding (the first version was inside-out) */
    // end caps (fan to a centre vertex)
    [0, st.length - 1].forEach(function (e) { var s2 = st[e], cI = pos.length / 3; pos.push(s2.cx || 0, (s2.y0 + s2.y1) / 2, s2.z); var k2 = colorFn(0, 0, e); col.push(k2[0], k2[1], k2[2]); for (var q = 0; q < ring; q++) { var p0 = e * ring + q, p1 = e * ring + (q + 1) % ring; if (e === 0) idx.push(cI, p1, p0); else idx.push(cI, p0, p1); } });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function make(THREE, id) {
    var T = meta(id), L = T.len, W = T.w, parts = [], gparts = [], base = 0.5, nose = L / 2, tail = -L / 2, hw = W / 2;
    var Bc = hexRGB(BODY[id]), Ac = hexRGB(ACCENT[id]), Gc = hexRGB(GLASS), Dc = hexRGB(DARK), Cc = hexRGB(CHROME);
    function bodyCol(sy, sx) { if (sy < -0.4) return Dc; if (Math.abs(sy) < 0.2 && Math.abs(sx) > 0.9) return Ac; return Bc; }                 // dark underside, accent belt stripe, painted top
    function glassCol(sy) { return sy > 0.8 ? Bc : Gc; }                                                                                     // roof painted, sides glass
    function box(x, y, z, sx, sy, sz, color, rx, ry, rz) { var g = new THREE.BoxGeometry(sx, sy, sz); if (rx || ry || rz) { g.rotateX(rx || 0); g.rotateY(ry || 0); g.rotateZ(rz || 0); } g.translate(x, y, z); var n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); }
    function part(g, dx, dy, dz) { if (dx || dy || dz) g.translate(dx || 0, dy || 0, dz || 0); parts.push(g); }
    function solid(g, rgb) { var n = g.attributes.position.count, a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = rgb[0]; a[i * 3 + 1] = rgb[1]; a[i * 3 + 2] = rgb[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
    function S(f, k, y0, y1, n, cx) { return { z: f * L, w: hw * k, y0: base + y0, y1: base + y1, n: n || 3.2, cx: cx || 0 }; }
    var ring = 12, b = base;
    if (id === 'pod') {   // Rimba racer: smooth tub, bubble canopy, four big nacelles with glowing rings, nose bumper
      parts.push(loft(THREE, [S(-0.5, 0.18, 0.18, 0.36, 2.4), S(-0.4, 0.5, 0.05, 0.62, 2.6), S(-0.1, 0.62, 0, 0.7, 2.6), S(0.2, 0.55, 0.02, 0.62, 2.6), S(0.5, 0.16, 0.16, 0.34, 2.4)], ring, bodyCol));
      gparts.push(solid(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Gc).scale(hw * 0.52, 0.9, L * 0.28).translate(0, b + 0.55, -0.1));
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { var x = p[0] * (hw - 0.2), z = p[1] * (L / 2 - 0.5); part(solid(new THREE.CylinderGeometry(0.36, 0.42, 0.8, 9), hexRGB(0xdfe3e8)), x, b + 0.38, z); part(solid(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 10), Ac), x, b - 0.04, z); part(solid(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 8), Dc), x, b + 0.8, z); });
      box(0, b + 0.5, nose - 0.1, 0.9, 0.18, 0.3, 0xcfd6de);
    } else if (id === 'pickup') {
      parts.push(loft(THREE, [S(-0.5, 0.5, 0.15, 0.55, 3), S(-0.44, 0.96, 0.05, 0.78, 3.4), S(-0.1, 1, 0, 0.8, 3.4), S(0.2, 1, 0, 0.82, 3.6), S(0.44, 0.9, 0.05, 0.62, 3.2), S(0.5, 0.4, 0.15, 0.44, 3)], ring, bodyCol));
      gparts.push(loft(THREE, [S(0.04, 0.8, 0.78, 0.86, 2.8), S(0.1, 0.78, 0.78, 1.75, 2.8), S(0.24, 0.76, 0.78, 1.85, 2.8), S(0.34, 0.7, 0.78, 1.35, 2.8), S(0.38, 0.62, 0.78, 0.9, 2.8)], 12, glassCol));
      box(0, b + 1.87, 0.17 * L, W * 0.52, 0.07, 0.34 * L * 0.7, 0x4a5a2a);   // roof slab
      [-1, 1].forEach(function (s) { box(s * (hw * 0.94), b + 1.0, -L * 0.26, 0.1, 0.5, L * 0.38, 0x5a4326); }); box(0, b + 0.88, -L * 0.44, W * 0.9, 0.5, 0.12, 0x5a4326); box(0, b + 0.9, -L * 0.1, W * 0.9, 0.5, 0.12, 0x5a4326);   // open cargo bed rails
      box(0.35, b + 1.2, -L * 0.28, 0.8, 0.6, 0.8, 0xb89a62); box(-0.4, b + 1.1, -L * 0.34, 0.7, 0.5, 0.7, 0xa5834a);
    } else if (id === 'bus' || id === 'van') {
      var hv = T.h; parts.push(loft(THREE, [S(-0.5, 0.82, 0.08, hv * 0.55, 4.5), S(-0.46, 1, 0, hv * 0.9, 4.8), S(0.2, 1, 0, hv * 0.9, 4.8), S(0.46, 0.96, 0.02, hv * 0.78, 4.4), S(0.5, 0.62, 0.1, hv * 0.5, 4)], ring, function (sy, sx) { if (sy < -0.4) return Dc; if (sy > 0.3 && sy < 0.7) return Gc;   /* window band on the upper sides */ if (Math.abs(sy) < 0.2 && Math.abs(sx) > 0.9) return Ac; return Bc; }));
    } else {   // sedan / coupe / roadster / limo / wagon / mini / wedge: sleek lofted body + canopy
      var cabF0 = -0.27, cabF1 = 0.12, cabH = 1.62, noseK = 0.3, roof = true;
      if (id === 'coupe') { cabF0 = -0.22; cabF1 = 0.08; cabH = 1.5; } else if (id === 'roadster') { cabF0 = -0.12; cabF1 = 0.1; cabH = 1.5; roof = false; } else if (id === 'limo') { cabF0 = -0.36; cabF1 = 0.1; cabH = 1.66; }
      else if (id === 'wagon') { cabF0 = -0.4; cabF1 = 0.12; cabH = 1.74; } else if (id === 'mini') { cabF0 = -0.3; cabF1 = 0.2; cabH = 1.74; noseK = 0.45; } else if (id === 'wedge') { cabF0 = -0.18; cabF1 = 0.06; cabH = 1.45; noseK = 0.1; }
      var topN = id === 'wedge' ? 0.5 : 0.66;
      parts.push(loft(THREE, [S(-0.5, 0.25, 0.12, 0.36, 3), S(-0.42, 0.84, 0.04, 0.68, 3.2), S(-0.22, 1, 0, 0.74, 3.4), S(0.02, 1, 0, 0.74, 3.4), S(0.24, 0.96, 0, id === 'wedge' ? 0.4 : 0.62, 3.2), S(0.42, 0.8, 0.05, id === 'wedge' ? 0.3 : 0.48, 3), S(0.5, noseK, 0.12, id === 'wedge' ? 0.22 : 0.3, 2.8)], ring, bodyCol));
      var cx0 = cabF0, cx1 = cabF1, m = (cx0 + cx1) / 2;
      gparts.push(loft(THREE, [S(cx0, 0.78, 0.66, 0.7, 2.8), S(cx0 + 0.06, 0.76, 0.66, cabH * 0.9, 2.6), S(m, 0.72, 0.66, cabH, 2.4), S(cx1 - 0.04, 0.7, 0.66, cabH * 0.86, 2.6), S(cx1 + 0.02, 0.62, 0.64, 0.8, 2.8)], 10, roof ? glassCol : function (sy) { return sy > 0.1 ? Gc : Bc; }));
      if (roof) box(0, b + cabH * 0.99, m * L, W * 0.5, 0.07, (cx1 - cx0) * L * 0.55, BODY[id]);   // opaque roof over the glass greenhouse
      if (id === 'roadster') { box(0, b + 0.95, -L * 0.2, W * 0.5, 0.1, 0.5, 0xe9e9e9); box(0, b + 0.82, -L * 0.34, W * 0.7, 0.34, 0.5, 0x7a2a2a); }                                  // roll hoop + seat back
      if (id === 'wagon') { box(0, b + 0.64 + cabH * 0.76, -L * 0.2, W * 0.64, 0.1, L * 0.5, 0x2a2e36); box(0.2, b + 0.64 + cabH * 0.9, -L * 0.2, 0.9, 0.5, 0.7, 0x4a6a62); box(-0.4, b + 0.64 + cabH * 0.86, -L * 0.28, 0.8, 0.4, 0.6, 0x8a6a3a); }   // roof rack + cargo
      if (id === 'sedan' || id === 'wedge' || id === 'coupe') { box(0, b + (id === 'wedge' ? 0.72 : 0.9), tail + 0.12, W * 0.8, 0.07, 0.4, id === 'wedge' ? 0x2a2a2a : ACCENT[id]); [-1, 1].forEach(function (s) { box(s * W * 0.34, b + 0.78, tail + 0.14, 0.07, 0.3, 0.34, 0x2a2e36); }); }   // rear wing on two posts
      if (id === 'limo' || id === 'sedan') box(0, b + 0.74, nose - 0.9, W * 0.5, 0.05, 0.9, 0xd9dde2, -0.08);   // hood highlight
    }
    // thruster nacelles + bumpers (all types except the pod, which has its own)
    if (id !== 'pod') {
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { var x = p[0] * (hw - 0.28), z = p[1] * (L / 2 - 0.75); part(solid(new THREE.CylinderGeometry(0.22, 0.26, 0.34, 8), Dc), x, b - 0.04, z); part(solid(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 9), Ac), x, b - 0.24, z); });
      box(0, b + 0.18, nose + 0.02, W * 0.9, 0.14, 0.1, CHROME); box(0, b + 0.2, tail - 0.02, W * 0.86, 0.12, 0.1, CHROME);
    }
    // merge: body (opaque), glass (transparent in rideable cars), and body+glass together (instanced traffic)
    function merge(list) { var total = 0; list.forEach(function (g) { total += g.attributes.position.count; });
      var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), idx = [], off = 0;
      list.forEach(function (g) { var p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array; pos.set(p, off * 3); nor.set(n, off * 3); col.set(c, off * 3); var ix = g.index.array; for (var i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += g.attributes.position.count; });
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeBoundingSphere(); return geo; }
    gparts.forEach(function (g) { if (!g.attributes.normal) g.computeVertexNormals(); });
    var geo = merge(parts.concat(gparts)), geoBody = merge(parts), geoGlass = gparts.length ? merge(gparts) : null, idx = geo.index.array;
    return { geo: geo, body: geoBody, glassGeo: geoGlass, glow: { nose: nose, tail: tail, hw: W / 2 - 0.35, y: base + 0.5 }, tris: idx.length / 3 };
  }
  var cache = {};
  function kit(THREE, id) { var k = cache[id]; if (!k || k.THREE !== THREE) { k = make(THREE, id); k.THREE = THREE; cache[id] = k; } return k; }

  function buildGroup(THREE, id, hex) {
    var k = kit(THREE, id), g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: hex != null ? hex : 0xffffff }), body = new THREE.Mesh(k.glassGeo ? k.body : k.geo, mat); g.add(body);
    if (k.glassGeo) { var gm = new THREE.Mesh(k.glassGeo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })); gm.renderOrder = 1; g.add(gm); }
    var emis = function (c) { return new THREE.MeshBasicMaterial({ color: c }); };
    [-1, 1].forEach(function (s) { var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), emis(0xfff2c0)); hl.position.set(s * k.glow.hw, k.glow.y, k.glow.nose + 0.03); g.add(hl); var tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), emis(0xff3a3a)); tl.position.set(s * k.glow.hw, k.glow.y, k.glow.tail - 0.03); g.add(tl); });
    var ug = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: ACCENT[id], transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ug.rotation.x = -Math.PI / 2; ug.scale.set(meta(id).w * 0.8, meta(id).len * 0.7, 1); ug.position.y = 0.1; g.add(ug);
    var seat = new THREE.Object3D(); seat.name = 'saddle'; seat.position.set(0, id === 'pod' ? 1.05 : 1.22, id === 'pod' ? 0.1 : -0.2); g.add(seat); g.userData.saddle = seat; g.userData.tris = k.tris; return g;
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
