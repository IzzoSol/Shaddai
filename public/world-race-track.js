/* world-race-track.js — ANTI-GRAV RACE TRACK geometry for a WorldRace circuit (2026-10-08, owner race reference: WipEout/Redout
 * style city racer). Turns the circuit polyline into a real track: smoothed path, banked corners, solid deck with lane lines,
 * red/white kerbs, glowing cyan edge rails on low barriers, pylons wherever the deck rises over a dip, light gantries,
 * corner chevron boards and boost pads. Everything is merged per material / instanced: ~9 draw calls per circuit, no lights.
 *
 *   var t = buildRaceTrack({ THREE, scene, groundAt, WorldRace, circuit:'dragon-gate', U? })
 *   t = { group, surfaceAt(x,z) -> deck top (world units) or null, boostAt(x,z) -> true on a boost pad, samples, lengthM, dispose() }
 *   Register t.surfaceAt with terrain.addRideExtra so players/boards ride the deck (the terrain mesh is not raised).
 * Pure helpers (node tests): buildRaceTrack.pure = { resample, bankProfile, deckProfile }.
 */
(function (root) {
  'use strict';
  var M = 7 / 1.8;   // world units per metre (scale law)

  // ── pure helpers ───────────────────────────────────────────────────────────────────────────────────────────
  // closed centripetal Catmull-Rom resample of [{x,z}] at ~step spacing → [{x,z}]
  function resample(pts, step) {
    var n = pts.length, dense = [], i, k;
    function cr(p0, p1, p2, p3, t) {
      var t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    for (i = 0; i < n; i++) {
      var a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
      var seg = Math.hypot(c.x - b.x, c.z - b.z), sub = Math.max(2, Math.ceil(seg / step) * 2);
      for (k = 0; k < sub; k++) { var t = k / sub; dense.push({ x: cr(a.x, b.x, c.x, d.x, t), z: cr(a.z, b.z, c.z, d.z, t) }); }
    }
    // even spacing along the dense polyline
    var out = [dense[0]], acc = 0, L = 0;
    for (i = 1; i <= dense.length; i++) {
      var p = dense[i - 1], q = dense[i % dense.length], s = Math.hypot(q.x - p.x, q.z - p.z); L += s;
      acc += s;
      while (acc >= step) { acc -= step; var f = 1 - acc / s; out.push({ x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f }); }
    }
    if (out.length > 2 && Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].z - out[0].z) < step * 0.5) out.pop();
    out.lengthU = L;
    return out;
  }
  // signed turn per sample → bank angle (rad), smoothed; maxBank radians
  function bankProfile(s, maxBank, gain) {
    var n = s.length, raw = new Array(n), out = new Array(n), i, k;
    for (i = 0; i < n; i++) {
      var a = s[(i + n - 1) % n], b = s[i], c = s[(i + 1) % n];
      var h0 = Math.atan2(b.x - a.x, b.z - a.z), h1 = Math.atan2(c.x - b.x, c.z - b.z), d = h1 - h0;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      raw[i] = Math.max(-maxBank, Math.min(maxBank, d * gain));
    }
    var W = 6;
    for (i = 0; i < n; i++) { var sum = 0; for (k = -W; k <= W; k++) sum += raw[(i + k + n) % n]; out[i] = sum / (2 * W + 1); }
    return out;
  }
  // deck height: never below ground + clearance; dips are bridged (moving max then moving average), grade-limited
  function deckProfile(ground, clear, win, maxStep) {
    var n = ground.length, a = new Array(n), b = new Array(n), i, k;
    for (i = 0; i < n; i++) { var m = -Infinity; for (k = -win; k <= win; k++) m = Math.max(m, ground[(i + k + n) % n]); a[i] = m + clear; }
    for (i = 0; i < n; i++) { var s = 0; for (k = -win; k <= win; k++) s += a[(i + k + n) % n]; b[i] = Math.max(s / (2 * win + 1), ground[i] + clear); }
    for (var pass = 0; pass < 3; pass++) for (i = 0; i < 2 * n; i++) {   // grade limit, both directions, wrapping
      var j = i % n, p = (j + n - 1) % n;
      if (b[j] < b[p] - maxStep) b[j] = Math.max(b[j], b[p] - maxStep, ground[j] + clear);
      if (b[p] < b[j] - maxStep) b[p] = Math.max(b[p], b[j] - maxStep, ground[p] + clear);
    }
    return b;
  }

  // ── textures (canvas, generated once) ──────────────────────────────────────────────────────────────────────
  function canvasTex(THREE, w, h, draw, rep) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; if (rep) t.wrapS = THREE.RepeatWrapping; return t;
  }
  function deckTex(THREE) {   // across = x (0..1 over the deck), along = y (one tile = 8 m)
    return canvasTex(THREE, 256, 256, function (g, w, h) {
      g.fillStyle = '#1b1e25'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { var v = 20 + Math.random() * 22 | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 5) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = 'rgba(230,236,242,0.9)'; g.fillRect(w * 0.035, 0, w * 0.012, h); g.fillRect(w * 0.953, 0, w * 0.012, h);      // edge lines
      g.fillStyle = 'rgba(230,236,242,0.8)'; g.fillRect(w * 0.33, 0, w * 0.008, h * 0.45); g.fillRect(w * 0.662, 0, w * 0.008, h * 0.45);   // lane dashes
      g.fillStyle = 'rgba(0,229,255,0.22)'; g.fillRect(w * 0.497, 0, w * 0.006, h);                                               // faint centre glow line
    });
  }
  function kerbTex(THREE) {
    return canvasTex(THREE, 32, 128, function (g, w, h) { g.fillStyle = '#e8ecf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#d4202c'; g.fillRect(0, 0, w, h / 2); });
  }
  function chevronTex(THREE) {
    return canvasTex(THREE, 256, 96, function (g, w, h) {
      g.fillStyle = '#101216'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff9a1a';
      for (var i = 0; i < 3; i++) { var x = 30 + i * 70; g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 34, h / 2); g.lineTo(x, h - 12); g.lineTo(x + 20, h - 12); g.lineTo(x + 54, h / 2); g.lineTo(x + 20, 12); g.closePath(); g.fill(); }
    });
  }
  function boostTex(THREE) {
    return canvasTex(THREE, 128, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      // arrows point to the canvas BOTTOM: after flipY + rotateX(-90°) that is +z = the direction of travel
      for (var i = 0; i < 3; i++) { var y = 16 + i * 70; g.fillStyle = 'rgba(0,240,255,' + (0.55 + i * 0.15) + ')'; g.beginPath(); g.moveTo(10, y); g.lineTo(w / 2, y + 40); g.lineTo(w - 10, y); g.lineTo(w - 34, y); g.lineTo(w / 2, y + 22); g.lineTo(34, y); g.closePath(); g.fill(); }
      g.strokeStyle = 'rgba(0,240,255,0.9)'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    });
  }

  // ── builder ────────────────────────────────────────────────────────────────────────────────────────────────
  function buildRaceTrack(o) {
    var THREE = o.THREE, U = o.U || M, WR = o.WorldRace || root.WorldRace, cid = o.circuit || 'dragon-gate';
    var groundAt = o.groundAt || o.heightAt;
    var raw = WR && WR.trackWorld ? WR.trackWorld(cid, U) : null; if (!raw || raw.length < 4) return null;
    var HW = (o.halfWidthM || 7) * U, KERB = 1.1 * U, WALL = 0.9 * U, STEP = (o.stepM || 4) * U, CLEAR = (o.clearM || 0.7) * U;
    var s = resample(raw, STEP), n = s.length, i, k;

    // ground under the deck footprint (centre + both edges), deck profile, banking
    var gr = new Array(n);
    for (i = 0; i < n; i++) {
      var p = s[i], q = s[(i + 1) % n], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1, sx = tz / tl, sz = -tx / tl;
      gr[i] = Math.max(groundAt(p.x, p.z), groundAt(p.x + sx * HW, p.z + sz * HW), groundAt(p.x - sx * HW, p.z - sz * HW));
    }
    var deck = deckProfile(gr, CLEAR, Math.max(2, Math.round(40 * U / STEP)), 0.06 * STEP);   // bridges dips up to ~80 m, max 6% grade
    var bank = bankProfile(s, (o.maxBankDeg || 14) * Math.PI / 180, o.bankGain || 9);

    // frames: T (tangent), S (side, banked), N (deck normal)
    var F = [];
    for (i = 0; i < n; i++) {
      var a = s[(i + n - 1) % n], b = s[(i + 1) % n];
      var T = new THREE.Vector3(b.x - a.x, deck[(i + 1) % n] - deck[(i + n - 1) % n], b.z - a.z).normalize();
      var S0 = new THREE.Vector3(T.z, 0, -T.x).normalize();                // flat side (right of travel)
      var Nn = new THREE.Vector3().crossVectors(T, S0).normalize();         // up (T × S; basis S,N,T is right-handed)
      var S = S0.clone().applyAxisAngle(T, bank[i]), N2 = Nn.clone().applyAxisAngle(T, bank[i]);
      F.push({ P: new THREE.Vector3(s[i].x, deck[i], s[i].z), T: T, S: S, N: N2, g: gr[i], bank: bank[i] });
    }

    // strip builder: a closed tube-like strip from a cross-section profile [[side offset, up offset, u], ...]
    function strip(profile, vRepeatU) {
      var pos = [], uv = [], idx = [], m = profile.length, along = 0, v = new THREE.Vector3();
      for (i = 0; i <= n; i++) {
        var f = F[i % n]; if (i > 0) along += F[i % n].P.distanceTo(F[i - 1].P);
        for (k = 0; k < m; k++) { var pr = profile[k]; v.copy(f.P).addScaledVector(f.S, pr[0]).addScaledVector(f.N, pr[1]); pos.push(v.x, v.y, v.z); uv.push(pr[2], along / vRepeatU); }
      }
      for (i = 0; i < n; i++) for (k = 0; k < m - 1; k++) { var a0 = i * m + k, a1 = a0 + 1, b0 = a0 + m, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      return g;
    }
    var grp = new THREE.Group(); grp.name = 'race-track:' + cid;
    var T8 = 8 * U, DT = 1.4 * U;   // deck texture tile length, deck thickness
    // deck: top (left→right) + underside box section
    var deckMat = new THREE.MeshStandardMaterial({ map: deckTex(THREE), color: 0xffffff, roughness: 0.62, metalness: 0.15 });
    var deckGeo = strip([[-HW, 0, 0], [HW, 0, 1]], T8);
    var underGeo = strip([[HW, 0, 0], [HW, -DT, 0.1], [HW * 0.7, -DT * 1.6, 0.2], [-HW * 0.7, -DT * 1.6, 0.8], [-HW, -DT, 0.9], [-HW, 0, 1]], T8);
    var underMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.55, metalness: 0.55 });
    // kerbs: raised red/white strips just outside the lane, both sides
    var kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex(THREE), roughness: 0.5, metalness: 0.05 });
    var kL = strip([[-HW - KERB, 0.02 * U, 0], [-HW, 0.12 * U, 1]], 4 * U), kR = strip([[HW, 0.12 * U, 0], [HW + KERB, 0.02 * U, 1]], 4 * U);
    // barriers: low walls outside the kerbs (inner face, top, outer face)
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, roughness: 0.35, metalness: 0.6 });
    var X = HW + KERB, WT = 0.35 * U;
    var wL = strip([[-X - WT, -DT, 0], [-X - WT, WALL, 0.3], [-X, WALL, 0.6], [-X, 0, 1]], 6 * U), wR = strip([[X, 0, 0], [X, WALL, 0.4], [X + WT, WALL, 0.7], [X + WT, -DT, 1]], 6 * U);
    // glow rails on top of the barriers (bloom picks them up; toneMapped off keeps them bright)
    var railMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false });
    var rL = strip([[-X - WT * 0.75, WALL, 0], [-X - WT * 0.75, WALL + 0.14 * U, 0.5], [-X - WT * 0.25, WALL + 0.14 * U, 1]], 6 * U);
    var rR = strip([[X + WT * 0.25, WALL + 0.14 * U, 0], [X + WT * 0.75, WALL + 0.14 * U, 0.5], [X + WT * 0.75, WALL, 1]], 6 * U);
    var merge = o.mergeGeometries || (THREE.BufferGeometryUtils || root.BufferGeometryUtils || {}).mergeGeometries;   // host passes BGU.mergeGeometries
    function add(geos, mat, name) {
      var g = geos.length === 1 ? geos[0] : (merge ? merge(geos, false) : null);
      if (!g) { geos.forEach(function (x) { var mm = new THREE.Mesh(x, mat); mm.name = name; grp.add(mm); }); return; }
      var mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.receiveShadow = true; grp.add(mesh); return mesh;
    }
    add([deckGeo], deckMat, 'track-deck'); add([underGeo], underMat, 'track-under'); add([kL, kR], kerbMat, 'track-kerb'); add([wL, wR], wallMat, 'track-wall'); add([rL, rR], railMat, 'track-rail');

    // instanced dressing
    var dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
    function inst(geo, mat, list, name, fn) {
      if (!list.length) return null; var im = new THREE.InstancedMesh(geo, mat, list.length); im.name = name;
      list.forEach(function (it, j) { fn(it, dummy); dummy.updateMatrix(); im.setMatrixAt(j, dummy.matrix); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); grp.add(im); return im;
    }
    // pylons: every 24 m where the deck sits > 2.5 m above ground, centre pier
    var pyl = [];
    for (i = 0; i < n; i += Math.max(1, Math.round(24 * U / STEP))) { var hgt = F[i].P.y - DT * 1.6 - F[i].g; if (hgt > 2.5 * U) pyl.push({ f: F[i], h: hgt }); }
    inst(new THREE.CylinderGeometry(0.9 * U, 1.3 * U, 1, 10), underMat, pyl, 'track-pylons', function (it, d) { d.position.set(it.f.P.x, it.f.g + it.h / 2, it.f.P.z); d.rotation.set(0, 0, 0); d.scale.set(1, it.h + 0.5 * U, 1); });
    // gantries: arch over the track every ~220 m (two posts + beam = one merged geometry) + an emissive strip under the beam
    var gEvery = Math.max(8, Math.round(220 * U / STEP)), gan = [];
    for (i = Math.round(gEvery / 2); i < n; i += gEvery) gan.push(F[i]);
    var GH = 7.5 * U, GW = X + WT, post = new THREE.BoxGeometry(0.7 * U, GH, 0.7 * U), beam = new THREE.BoxGeometry(GW * 2 + 0.7 * U, 0.9 * U, 1.1 * U);
    var pL = post.clone().translate(-GW, GH / 2, 0), pR = post.clone().translate(GW, GH / 2, 0), bm = beam.clone().translate(0, GH, 0);
    var archGeo = merge ? merge([pL, pR, bm], false) : bm;
    function frameTo(f, d, yOff) { d.position.copy(f.P).addScaledVector(f.N, yOff || 0); var m4 = new THREE.Matrix4().makeBasis(f.S, f.N, f.T); d.quaternion.setFromRotationMatrix(m4); d.scale.set(1, 1, 1); }
    inst(archGeo, wallMat, gan, 'track-gantries', function (f, d) { frameTo(f, d, 0); });
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
    inst(new THREE.BoxGeometry(GW * 1.7, 0.18 * U, 0.5 * U).translate(0, GH - 0.55 * U, 0), lightMat, gan, 'track-gantry-lights', function (f, d) { frameTo(f, d, 0); });
    // chevron boards on the OUTSIDE wall of sharp corners, facing oncoming riders
    var chev = [], lastC = -99;
    for (i = 0; i < n; i++) { if (Math.abs(F[i].bank) > 0.6 * (o.maxBankDeg || 14) * Math.PI / 180 && i - lastC > Math.round(30 * U / STEP)) { chev.push({ f: F[i], side: F[i].bank > 0 ? -1 : 1 }); lastC = i; } }
    var chevTex = chevronTex(THREE);
    var chevMat = new THREE.MeshStandardMaterial({ map: chevTex, emissive: 0xffffff, emissiveMap: chevTex, emissiveIntensity: 0.6, roughness: 0.5, side: THREE.DoubleSide });
    inst(new THREE.PlaneGeometry(6 * U, 2.2 * U).translate(0, 2.0 * U, 0), chevMat, chev, 'track-chevrons', function (it, d) {
      frameTo(it.f, d, 0); d.position.addScaledVector(it.f.S, it.side * (GW + 0.4 * U));
      d.rotateY(Math.PI);                                   // face back down the track, toward the oncoming rider
      d.scale.x = it.side > 0 ? -1 : 1;                     // arrows point into the turn (outside wall = side)
    });
    // boost pads: 4 per lap on the straightest stretches
    var straight = []; for (i = 0; i < n; i++) straight.push({ i: i, b: Math.abs(F[i].bank) });
    straight.sort(function (a, b) { return a.b - b.b; });
    var pads = [], minGap = Math.round(n / 6), clearN = Math.round(30 * U / STEP), clr2 = Math.pow(3 * (HW + KERB), 2);
    function crossingNear(ci) {   // another strand of the track within ~3 deck widths (figure-8 crossing, hairpins): no pad there
      for (var j = 0; j < n; j++) { var dj = Math.abs(j - ci); if (Math.min(dj, n - dj) <= clearN) continue; var dx = F[j].P.x - F[ci].P.x, dz = F[j].P.z - F[ci].P.z; if (dx * dx + dz * dz < clr2) return true; }
      return false;
    }
    for (var si = 0; si < straight.length && pads.length < 4; si++) { var cand = straight[si].i; if (!crossingNear(cand) && pads.every(function (pi) { var d0 = Math.abs(pi - cand); return Math.min(d0, n - d0) > minGap; })) pads.push(cand); }
    var boostMat = new THREE.MeshBasicMaterial({ map: boostTex(THREE), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    var padF = pads.map(function (pi) { return F[pi]; });
    inst(new THREE.PlaneGeometry(HW * 0.9, 12 * U).rotateX(-Math.PI / 2).translate(0, 0.06 * U, 0), boostMat, padF, 'track-boost', function (f, d) { frameTo(f, d, 0); });

    // ── surfaceAt: grid hash of segments → deck top under (x,z), banking included ──
    var CELL = 48 * U, H = {}, R = HW + KERB;
    function key(cx, cz) { return cx + ',' + cz; }
    for (i = 0; i < n; i++) {
      var A = F[i].P, B = F[(i + 1) % n].P, x0 = Math.min(A.x, B.x) - R, x1 = Math.max(A.x, B.x) + R, z0 = Math.min(A.z, B.z) - R, z1 = Math.max(A.z, B.z) + R;
      for (var cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (var cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) (H[key(cx, cz)] = H[key(cx, cz)] || []).push(i);
    }
    function locate(x, z) {
      var L = H[key(Math.floor(x / CELL), Math.floor(z / CELL))]; if (!L) return null; var best = null;
      for (var j = 0; j < L.length; j++) {
        var ia = L[j], A = F[ia], B = F[(ia + 1) % n], dx = B.P.x - A.P.x, dz = B.P.z - A.P.z, ll = dx * dx + dz * dz || 1;
        var t = Math.max(0, Math.min(1, ((x - A.P.x) * dx + (z - A.P.z) * dz) / ll)), px = A.P.x + dx * t, pz = A.P.z + dz * t;
        var dd = Math.hypot(x - px, z - pz), lat = (x - px) * A.S.x + (z - pz) * A.S.z; if (Math.abs(lat) > R || dd > R * 1.05) continue;
        var y = A.P.y + (B.P.y - A.P.y) * t + A.S.y * lat;   // banked: side vector carries the roll
        if (!best || dd < best.d - 1e-6) best = { y: y, i: ia, lat: lat, d: dd };   // nearest segment (the highest one picked a neighbour further up a grade)
      }
      return best;
    }
    var padSet = {}; pads.forEach(function (pi) { for (var d = -2; d <= 2; d++) padSet[(pi + d + n) % n] = true; });
    if (o.scene) o.scene.add(grp);
    return {
      group: grp, samples: n, lengthM: s.lengthU / U, frames: F, pads: pads,
      surfaceAt: function (x, z) { var r = locate(x, z); return r ? r.y : null; },
      boostAt: function (x, z) { var r = locate(x, z); return !!(r && padSet[r.i] && Math.abs(r.lat) < HW * 0.5); },
      dispose: function () { if (grp.parent) grp.parent.remove(grp); grp.traverse(function (c) { if (c.geometry) c.geometry.dispose(); }); }
    };
  }
  buildRaceTrack.pure = { resample: resample, bankProfile: bankProfile, deckProfile: deckProfile };
  if (typeof module !== 'undefined' && module.exports) module.exports = buildRaceTrack;
  if (root) root.buildRaceTrack = buildRaceTrack;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
