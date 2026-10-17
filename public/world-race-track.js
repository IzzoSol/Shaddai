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
      g.fillStyle = '#0d1117'; g.fillRect(0, 0, w, h);                                                                                 // graphite
      for (var i = 0; i < 2600; i++) { var v = 14 + Math.random() * 16 | 0; g.fillStyle = 'rgb(' + v + ',' + (v + 3) + ',' + (v + 4) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = 'rgba(232,196,92,0.34)'; [0.25, 0.5, 0.75].forEach(function (q) { g.fillRect(0, h * q, w, 1.5); }); g.fillRect(w * 0.25, 0, 1.5, h); g.fillRect(w * 0.75, 0, 1.5, h);   // gold panel seams
      g.fillStyle = 'rgba(43,255,136,0.16)'; for (var k = 0; k < 6; k++) { var vx = w * (0.08 + 0.16 * k) + (k % 2 ? 6 : 0); g.fillRect(vx, h * (k % 3) / 3, 1.5, h / 3); g.fillRect(vx, h * (k % 3) / 3 + h / 3, 14, 1.5); }   // emerald veins
      g.fillStyle = 'rgba(232,196,92,0.95)'; g.fillRect(w * 0.035, 0, w * 0.014, h); g.fillRect(w * 0.951, 0, w * 0.014, h);            // gold edge lines
      g.fillStyle = 'rgba(43,255,136,0.9)'; g.fillRect(w * 0.327, 0, w * 0.012, h * 0.45); g.fillRect(w * 0.661, 0, w * 0.012, h * 0.45);   // emerald lane dashes
      g.fillStyle = 'rgba(43,255,136,0.30)'; g.fillRect(w * 0.494, 0, w * 0.012, h);                                                    // centre glow line
    });
  }
  // ── NEON STYLE (owner 2026-10-16: "#1" = the Wipeout race ref): dark glass-asphalt deck with glowing cyan lanes + magenta edges + speed chevrons,
  //    cyan/magenta kerb blocks, obsidian barriers with SHADDAI sponsor panels, cyan (left) / magenta (right) edge rails. ?racestyle=gold = the gold deck.
  var NEON = !(typeof location !== 'undefined' && /[?&]racestyle=gold/.test(location.search || ''));
  function neonDeck(g, w, h, glowOnly) {
    g.fillStyle = glowOnly ? '#000' : '#06080e'; g.fillRect(0, 0, w, h);
    if (!glowOnly) for (var i = 0; i < 2200; i++) { var v = 8 + Math.random() * 12 | 0; g.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 6) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    if (!glowOnly) { g.fillStyle = 'rgba(120,160,220,0.07)'; [0.5].forEach(function (q) { g.fillRect(0, h * q, w, 1); }); }                    // glass panel seam
    g.fillStyle = 'rgba(255,63,164,0.95)'; g.fillRect(w * 0.03, 0, w * 0.018, h); g.fillRect(w * 0.952, 0, w * 0.018, h);                     // magenta edge lines
    g.fillStyle = 'rgba(39,224,255,0.95)'; g.fillRect(w * 0.327, 0, w * 0.012, h * 0.4); g.fillRect(w * 0.661, 0, w * 0.012, h * 0.4);        // cyan lane dashes
    g.fillStyle = 'rgba(39,224,255,0.22)'; g.fillRect(w * 0.494, 0, w * 0.012, h);                                                            // centre glow line
    g.strokeStyle = 'rgba(39,224,255,0.16)'; g.lineWidth = 3;                                                                                  // speed chevrons (point along travel = +v)
    [0.2, 0.8].forEach(function (cx) { var y = h * 0.62; g.beginPath(); g.moveTo(w * (cx - 0.09), y + h * 0.07); g.lineTo(w * cx, y); g.lineTo(w * (cx + 0.09), y + h * 0.07); g.stroke(); });
  }
  function deckTexNeon(THREE) { return canvasTex(THREE, 256, 256, function (g, w, h) { neonDeck(g, w, h, false); }); }
  function deckGlowNeon(THREE) { return canvasTex(THREE, 256, 256, function (g, w, h) { neonDeck(g, w, h, true); }); }
  function kerbTexNeon(THREE) {
    return canvasTex(THREE, 32, 128, function (g, w, h) { g.fillStyle = '#27e0ff'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#ff3fa4'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = '#05070b'; g.fillRect(0, h / 2 - 3, w, 6); g.fillRect(0, h - 3, w, 3); });
  }
  function wallTexNeon(THREE) {   // u across the wall profile, v along the track (one tile = 6 m): obsidian panels + a sponsor name per tile
    var names = ['FORGE', 'ARCADE', 'SIGNALS', 'ACADEMY', 'SHADDAI', 'COLOSSEUM'], k = 0;
    return canvasTex(THREE, 128, 1024, function (g, w, h) {
      g.fillStyle = '#10141c'; g.fillRect(0, 0, w, h);
      for (var t = 0; t < 4; t++) { var y0 = t * h / 4;
        var nm = names[k++ % names.length], col = t % 2 ? '#ff3fa4' : '#27e0ff';
        [[0.62, 0.8, -1], [0.02, 0.2, 1]].forEach(function (c) {   // inner face: left wall u 0.6..1, right wall u 0..0.4 (strip profiles run opposite ways)
          g.fillStyle = '#1a2130'; g.fillRect(w * c[0], y0 + 8, w * 0.36, h / 4 - 16);
          g.save(); g.translate(w * c[1], y0 + h / 8); g.rotate(c[2] * Math.PI / 2); g.font = '900 30px Orbitron, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = col; g.fillText(nm, 0, 0); g.restore();
          g.fillStyle = 'rgba(232,196,92,0.8)'; g.fillRect(w * c[0], y0 + 6, w * 0.36, 2); }); }
    });
  }
  function kerbTex(THREE) {
    return canvasTex(THREE, 32, 128, function (g, w, h) { g.fillStyle = '#e8ecf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#d4202c'; g.fillRect(0, 0, w, h / 2); });
  }
  function chevronTex(THREE) {
    return canvasTex(THREE, 256, 96, function (g, w, h) {
      g.fillStyle = '#101216'; g.fillRect(0, 0, w, h); g.fillStyle = NEON ? '#ff3fa4' : '#ff9a1a';
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
    // FLYOVERS: where the circuit crosses itself (figure-8) the later strand climbs over the earlier one on a ramped bridge,
    // otherwise each strand's barriers would cut across the other road. Lift = clearance under the bridge + deck depth.
    var lift = new Array(n).fill(0), LIFT = (o.flyoverM || 9.5) * U, RAMP = Math.round(150 * U / STEP), near2 = Math.pow(2.2 * (HW + KERB + 0.4 * U), 2), seen = {};
    for (i = 0; i < n; i++) for (k = i + Math.round(60 * U / STEP); k < n; k++) {
      var di = Math.min(k - i, n - (k - i)); if (di < Math.round(60 * U / STEP)) continue;
      var ddx = s[i].x - s[k].x, ddz = s[i].z - s[k].z; if (ddx * ddx + ddz * ddz > near2 || seen[k]) continue;
      for (var r2 = -RAMP; r2 <= RAMP; r2++) { var jj = (k + r2 + n) % n, w = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.abs(r2) / RAMP)); lift[jj] = Math.max(lift[jj], LIFT * Math.min(1, w * 1.6)); seen[jj] = true; }
    }
    // OBSTACLES (optional o.obstacleAt(x,z) -> top height or -Infinity, e.g. WorldCityHeights.build(..).topAt): the deck must clear
    // every footprint under its width (centre, edges, mid-lanes, and half a step either side along the track) by o.obstacleClearM.
    var obstacleAt = o.obstacleAt, deckBase = gr, groundWin = Math.max(2, Math.round(40 * U / STEP)), grade = 0.06;
    if (typeof obstacleAt === 'function') {
      var OCL = (o.obstacleClearM == null ? 12 : o.obstacleClearM) * U, RW = HW + KERB, lats = [-RW, -HW, -HW / 2, 0, HW / 2, HW, RW], alongs = [-0.5, 0, 0.5];
      deckBase = new Array(n);
      for (i = 0; i < n; i++) {
        var pp = s[i], qq = s[(i + 1) % n], aa = s[(i + n - 1) % n], ox = qq.x - aa.x, oz = qq.z - aa.z, ol = Math.hypot(ox, oz) || 1, osx = oz / ol, osz = -ox / ol, top = -Infinity;
        for (var ai = 0; ai < alongs.length; ai++) {
          var ap = alongs[ai] * STEP, ax = pp.x + ox / ol * ap, az = pp.z + oz / ol * ap;
          for (k = 0; k < lats.length; k++) { var ot = obstacleAt(ax + osx * lats[k], az + osz * lats[k]); if (ot > top) top = ot; }
        }
        deckBase[i] = top > -Infinity ? Math.max(gr[i], top + OCL - CLEAR) : gr[i];
      }
      groundWin = Math.max(groundWin, Math.round(80 * U / STEP));   // obstacle ramps are at least 80 m either side
      grade = o.obstacleGrade || 0.12;
    }
    // MIN DECK HEIGHT (Skyline Circuit, 2026-10-16): raw points may carry h = minimum deck height above ground in metres (0 at the HQ pit, 70 m on the
    // sky ring). Mapped onto the resampled deck by arc-length fraction; deckProfile below then smooths the climb within the grade limit.
    if (raw[0].h != null) {
      var cum = [0], ri; for (ri = 1; ri <= raw.length; ri++) { var ra = raw[ri - 1], rb = raw[ri % raw.length]; cum.push(cum[ri - 1] + Math.hypot(rb.x - ra.x, rb.z - ra.z)); }
      var TOT = cum[raw.length], rj = 0; if (deckBase === gr) deckBase = gr.slice();
      for (i = 0; i < n; i++) { var fd = i / n * TOT; while (rj < raw.length - 1 && cum[rj + 1] < fd) rj++;
        var seg = cum[rj + 1] - cum[rj] || 1, ft = (fd - cum[rj]) / seg, h0 = raw[rj].h || 0, h1 = raw[(rj + 1) % raw.length].h || 0;
        deckBase[i] = Math.max(deckBase[i], gr[i] + (h0 + (h1 - h0) * ft) * U); }
    }
    var deck = deckProfile(deckBase, CLEAR, groundWin, grade * STEP);   // bridges dips up to ~80 m, max 6% grade (12% over obstacles)
    if (deckBase !== gr) { var DCAP = (o.maxDeckM || 250) * U; for (i = 0; i < n; i++) deck[i] = Math.max(gr[i] + CLEAR, Math.min(deck[i], gr[i] + DCAP)); }
    var BASE_LIFT = (o.baseLiftM || 0) * U;   // optional whole-circuit lift
    // OVERPASS (twin figure-8): o.overpassOf(x,z) -> another built deck's top or null. Wherever that deck is under ours, keep >= overpassGapM above it, ramped over ~150 m
    if (typeof o.overpassOf === 'function') {
      var OVG = (o.overpassGapM || 16) * U, ORAMP = Math.round(150 * U / STEP), ol = new Array(n).fill(0);
      for (i = 0; i < n; i++) { var oy = o.overpassOf(s[i].x, s[i].z); if (oy == null) continue; var need = oy + OVG - (deck[i] + lift[i]); if (need <= 0) continue;
        for (var rr = -ORAMP; rr <= ORAMP; rr++) { var oj = (i + rr + n) % n, ow = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.abs(rr) / ORAMP)); ol[oj] = Math.max(ol[oj], need * Math.min(1, ow * 1.6)); } }
      for (i = 0; i < n; i++) lift[i] += ol[i];
    }
    for (i = 0; i < n; i++) deck[i] += lift[i] + BASE_LIFT;
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
    var deckMat = NEON ? new THREE.MeshStandardMaterial({ map: deckTexNeon(THREE), color: 0xffffff, roughness: 0.22, metalness: 0.55, emissive: 0xffffff, emissiveMap: deckGlowNeon(THREE), emissiveIntensity: 1.1 })
      : new THREE.MeshStandardMaterial({ map: deckTex(THREE), color: 0xffffff, roughness: 0.62, metalness: 0.15 });
    var deckGeo = strip([[-HW, 0, 0], [HW, 0, 1]], T8);
    var underGeo = strip([[HW, 0, 0], [HW, -DT, 0.1], [HW * 0.7, -DT * 1.6, 0.2], [-HW * 0.7, -DT * 1.6, 0.8], [-HW, -DT, 0.9], [-HW, 0, 1]], T8);
    var underMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.55, metalness: 0.55 });
    // kerbs: raised red/white strips just outside the lane, both sides
    var kerbMat = NEON ? new THREE.MeshStandardMaterial({ map: kerbTexNeon(THREE), roughness: 0.4, metalness: 0.1, emissive: 0xffffff, emissiveMap: kerbTexNeon(THREE), emissiveIntensity: 0.85 })
      : new THREE.MeshStandardMaterial({ map: kerbTex(THREE), roughness: 0.5, metalness: 0.05 });
    var kL = strip([[-HW - KERB, 0.02 * U, 0], [-HW, 0.12 * U, 1]], 4 * U), kR = strip([[HW, 0.12 * U, 0], [HW + KERB, 0.02 * U, 1]], 4 * U);
    // barriers: low walls outside the kerbs (inner face, top, outer face)
    var wallTex = NEON ? wallTexNeon(THREE) : null;
    var wallMat = NEON ? new THREE.MeshStandardMaterial({ map: wallTex, color: 0xffffff, roughness: 0.3, metalness: 0.65, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.55 })
      : new THREE.MeshStandardMaterial({ color: 0xc9d2dc, roughness: 0.35, metalness: 0.6 });
    var X = HW + KERB, WT = 0.35 * U;
    var wL = strip([[-X - WT, -DT, 0], [-X - WT, WALL, 0.3], [-X, WALL, 0.6], [-X, 0, 1]], 6 * U), wR = strip([[X, 0, 0], [X, WALL, 0.4], [X + WT, WALL, 0.7], [X + WT, -DT, 1]], 6 * U);
    // glow rails on top of the barriers (bloom picks them up; toneMapped off keeps them bright)
    var railMat = new THREE.MeshBasicMaterial({ color: 0x2bff88, toneMapped: false });
    var rL = strip([[-X - WT * 0.75, WALL, 0], [-X - WT * 0.75, WALL + 0.14 * U, 0.5], [-X - WT * 0.25, WALL + 0.14 * U, 1]], 6 * U);
    var rR = strip([[X + WT * 0.25, WALL + 0.14 * U, 0], [X + WT * 0.75, WALL + 0.14 * U, 0.5], [X + WT * 0.75, WALL, 1]], 6 * U);
    var merge = o.mergeGeometries || (THREE.BufferGeometryUtils || root.BufferGeometryUtils || {}).mergeGeometries;   // host passes BGU.mergeGeometries
    function add(geos, mat, name) {
      var g = geos.length === 1 ? geos[0] : (merge ? merge(geos, false) : null);
      if (!g) { geos.forEach(function (x) { var mm = new THREE.Mesh(x, mat); mm.name = name; grp.add(mm); }); return; }
      var mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.receiveShadow = true; grp.add(mesh); return mesh;
    }
    add([deckGeo], deckMat, 'track-deck'); add([underGeo], underMat, 'track-under'); add([kL, kR], kerbMat, 'track-kerb'); add([wL, wR], wallMat, 'track-wall');
    if (NEON) { add([rL], new THREE.MeshBasicMaterial({ color: 0x27e0ff, toneMapped: false }), 'track-rail'); add([rR], new THREE.MeshBasicMaterial({ color: 0xff3fa4, toneMapped: false }), 'track-rail-r'); }
    else add([rL, rR], railMat, 'track-rail');
    // FORCE FIELD (owner 2026-10-11): translucent energy wall above each barrier, one draw call. It marks the line the kart is held to (world-mount-ride edge provider). ?forcefield=0 / o.forceField === false = off.
    if (o.forceField !== false) {
      var ffMat = new THREE.MeshBasicMaterial({ color: 0x2bff88, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      var FH = (o.forceFieldM || 8) * U;
      var ffL = strip([[-X - WT * 0.5, WALL + 0.14 * U, 0], [-X - WT * 0.5, WALL + FH, 1]], 10 * U), ffR = strip([[X + WT * 0.5, WALL + 0.14 * U, 0], [X + WT * 0.5, WALL + FH, 1]], 10 * U);
      add([ffL, ffR], ffMat, 'track-forcefield');
    }

    // instanced dressing
    var dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
    function inst(geo, mat, list, name, fn) {
      if (!list.length) return null; var im = new THREE.InstancedMesh(geo, mat, list.length); im.name = name;
      list.forEach(function (it, j) { fn(it, dummy); dummy.updateMatrix(); im.setMatrixAt(j, dummy.matrix); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); grp.add(im); return im;
    }
    // pylons: every 24 m where the deck sits > 2.5 m above ground, centre pier
    var pyl = [];
    var onRoad2 = Math.pow(HW + KERB + 1.5 * U, 2), sepN = Math.round(60 * U / STEP);
    function footOnOtherStrand(ci) { for (var j = 0; j < n; j++) { var dj = Math.abs(j - ci); if (Math.min(dj, n - dj) <= sepN) continue; var dx = F[j].P.x - F[ci].P.x, dz = F[j].P.z - F[ci].P.z; if (dx * dx + dz * dz < onRoad2) return true; } return false; }
    for (i = 0; i < n; i += Math.max(1, Math.round(24 * U / STEP))) { var hgt = F[i].P.y - DT * 1.6 - F[i].g; if (hgt > 2.5 * U && !footOnOtherStrand(i) && !(o.obstacleAt && o.obstacleAt(F[i].P.x, F[i].P.z) > F[i].g + 1 * U)) pyl.push({ f: F[i], h: hgt }); }   // never a pier on the road below a flyover
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
    // MARKINGS (TURTLE spec 2026-10-11, scaled up so they read at 600 km/h): gold double stripe + emerald grid slots at the line, gold sector bars at 1/3 and 2/3, gold distance ticks every 500 m
    if (o.markings !== false) {
      var goldMat = new THREE.MeshBasicMaterial({ color: 0xe8c45c, toneMapped: false }), emMat = new THREE.MeshBasicMaterial({ color: 0x2bff88, toneMapped: false });
      var lineW = HW * 2, stripe = new THREE.BoxGeometry(lineW, 0.05 * U, 0.7 * U);
      var lineF = [F[0]], barF = [F[Math.round(n / 3)], F[Math.round(2 * n / 3)]];
      inst(stripe.clone().translate(0, 0.06 * U, 0.55 * U), goldMat, lineF, 'track-startline-a', function (f, d) { frameTo(f, d, 0); });
      inst(stripe.clone().translate(0, 0.06 * U, -0.55 * U), goldMat, lineF, 'track-startline-b', function (f, d) { frameTo(f, d, 0); });
      inst(new THREE.BoxGeometry(lineW, 0.05 * U, 1.1 * U).translate(0, 0.06 * U, 0), goldMat, barF, 'track-sector-bars', function (f, d) { frameTo(f, d, 0); });
      var slots = []; for (var gr = 0; gr < 4; gr++) { var gf = F[(0 - Math.round((10 + gr * 9) * U / STEP) + n) % n]; slots.push({ f: gf, side: -1 }, { f: gf, side: 1 }); }
      inst(new THREE.BoxGeometry(3.4 * U, 0.04 * U, 6 * U).translate(0, 0.05 * U, 0), emMat, slots, 'track-grid-slots', function (it, d) { frameTo(it.f, d, 0); d.position.addScaledVector(it.f.S, it.side * 4.6 * U); });
      var ticks = [], tickEvery = Math.max(1, Math.round(500 * U / STEP));
      for (var ti = tickEvery; ti < n; ti += tickEvery) { ticks.push({ f: F[ti], side: -1 }, { f: F[ti], side: 1 }); }
      inst(new THREE.BoxGeometry(0.5 * U, 3.2 * U, 0.5 * U).translate(0, 1.6 * U, 0), goldMat, ticks, 'track-distance-ticks', function (it, d) { frameTo(it.f, d, 0); d.position.addScaledVector(it.f.S, it.side * (X + WT + 0.4 * U)); });
    }
    // sector gate arches (2026-10-11): 4 half-torus arches at the quarter points of the lap (the sector boundaries), spanning deck + kerbs
    if (o.gates !== false) {
      var gateF = [0, 1, 2, 3].map(function (q) { return F[Math.round(q * n / 4) % n]; });
      var gateMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      inst(new THREE.TorusGeometry(HW + KERB, 0.6 * U, 8, 36, Math.PI), gateMat, gateF, 'track-sector-gates', function (f, d) { frameTo(f, d, 0); });
    }
    // chevron boards on the OUTSIDE wall of sharp corners, facing oncoming riders
    var chev = [], lastC = -99;
    for (i = 0; i < n; i++) { if (Math.abs(F[i].bank) > 0.6 * (o.maxBankDeg || 14) * Math.PI / 180 && i - lastC > Math.round(30 * U / STEP)) { chev.push({ f: F[i], side: F[i].bank > 0 ? -1 : 1 }); lastC = i; } }
    var chevTex = chevronTex(THREE);
    var chevMat = new THREE.MeshStandardMaterial({ map: chevTex, emissive: 0xffffff, emissiveMap: chevTex, emissiveIntensity: 0.6, roughness: 0.5, side: THREE.DoubleSide });
    inst(new THREE.PlaneGeometry(6 * U, 2.2 * U).translate(0, 2.0 * U, 0), chevMat, chev, 'track-chevrons', function (it, d) {
      frameTo(it.f, d, 0); d.position.addScaledVector(it.f.S, it.side * (GW + 0.4 * U));
      d.rotateY(Math.PI);                                   // face back down the track, toward the oncoming rider
      d.scale.x = it.side > 0 ? 1 : -1;                     // arrows point into the turn (outside wall = side); flipped after the v1 review shot
    });
    // boost pads: 4 per lap on the straightest stretches
    var straight = []; for (i = 0; i < n; i++) straight.push({ i: i, b: Math.abs(F[i].bank) });
    straight.sort(function (a, b) { return a.b - b.b; });
    var pads = [], PADN = o.padCount || 4, minGap = Math.round(n / (PADN + 2)), clearN = Math.round(30 * U / STEP), clr2 = Math.pow(3 * (HW + KERB), 2);
    function crossingNear(ci) {   // another strand of the track within ~3 deck widths (figure-8 crossing, hairpins): no pad there
      for (var j = 0; j < n; j++) { var dj = Math.abs(j - ci); if (Math.min(dj, n - dj) <= clearN) continue; var dx = F[j].P.x - F[ci].P.x, dz = F[j].P.z - F[ci].P.z; if (dx * dx + dz * dz < clr2) return true; }
      return false;
    }
    for (var si = 0; si < straight.length && pads.length < PADN; si++) { var cand = straight[si].i; if (!crossingNear(cand) && pads.every(function (pi) { var d0 = Math.abs(pi - cand); return Math.min(d0, n - d0) > minGap; })) pads.push(cand); }
    var boostMat = new THREE.MeshBasicMaterial({ map: boostTex(THREE), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    var padF = pads.map(function (pi) { return F[pi]; });
    inst(new THREE.PlaneGeometry(HW * 0.9, 12 * U).rotateX(-Math.PI / 2).translate(0, 0.06 * U, 0), boostMat, padF, 'track-boost', function (f, d) { frameTo(f, d, 0); });

    if (typeof o.overpassOf === 'function') {
      var tun = []; for (i = 0; i < n; i += Math.max(1, Math.round(6 * U / STEP))) { if (o.overpassOf(F[i].P.x, F[i].P.z) != null && F[i].P.y - o.overpassOf(F[i].P.x, F[i].P.z) < 40 * U) tun.push(F[i]); }
      if (tun.length) {
        var panelMat = new THREE.MeshBasicMaterial({ color: 0xbfffd8, toneMapped: false });
        [-1, 1].forEach(function (sd) { inst(new THREE.BoxGeometry(1.4 * U, 0.12 * U, 3.2 * U), panelMat, tun, 'track-tunnel-lights', function (f, d) { frameTo(f, d, -DT * 1.7); d.position.addScaledVector(f.S, sd * HW * 0.45); }); });
      }
    }

    // TUNNEL THROUGH A BUILDING (o.tunnels, metres e/n + rot CCW deg): portal frames at the facade entry/exit + a lit ceiling inside
    if (o.tunnels && o.tunnels.length) {
      var portalMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, toneMapped: false }), ceilMat = new THREE.MeshBasicMaterial({ color: 0xbfffd8, toneMapped: false });
      var PW = X + WT + 0.6 * U, PH = 10 * U, PT = 0.7 * U;
      var pParts = [new THREE.BoxGeometry(PT, PH, PT).translate(-PW, PH / 2, 0), new THREE.BoxGeometry(PT, PH, PT).translate(PW, PH / 2, 0), new THREE.BoxGeometry(PW * 2 + PT, PT, PT).translate(0, PH, 0)];
      var portalGeo = merge ? merge(pParts, false) : pParts[2];
      o.tunnels.forEach(function (tn) {
        var th = tn.rot * Math.PI / 180, ct = Math.cos(th), st2 = Math.sin(th), pf = [], ins = [], prev = false;
        function inRect(p) { var e = p.x / U, nn = -p.z / U, dx = e - tn.e, dy = nn - tn.n, u = dx * ct + dy * st2, v = -dx * st2 + dy * ct; return Math.abs(u) <= tn.w / 2 + 5 && Math.abs(v) <= tn.d / 2 + 5; }
        for (i = 0; i <= n; i++) { var fr = F[i % n], cur = inRect(fr.P); if (cur !== prev && i > 0) pf.push(F[i % n]); if (cur && i < n && i % 2 === 0) ins.push(fr); prev = cur; }
        if (pf.length) inst(portalGeo, portalMat, pf, 'track-portals', function (f, d) { frameTo(f, d, 0); });
        if (ins.length) inst(new THREE.BoxGeometry((X + WT) * 1.6, 0.14 * U, 2.6 * U), ceilMat, ins, 'track-tunnel-ceiling', function (f, d) { frameTo(f, d, PH - 0.4 * U); });
      });
    }

    // GATE TOWERS (o.gateTowers = count, evenly spaced round the lap so a symmetric circuit stays symmetric): two slabs + a lintel straddling the deck, violet-lit. Each is slid
    // up to +-40 frames to a spot where no city tower stands within 40 m of the footprint.
    if (o.gateTowers) {
      var gtF = [], gtN = o.gateTowers, GTH = 62 * U, GTX = X + 13 * U;
      for (var gq = 0; gq < gtN; gq++) {
        var base = Math.round((gq + 0.5) * n / gtN), pick = -1;
        for (var gs = 0; gs <= 40 && pick < 0; gs++) for (var gsg = -1; gsg <= 1 && pick < 0; gsg += 2) {
          var gi = (base + gs * gsg + n) % n, gf = F[gi], clear = true;
          if (o.obstacleAt) for (var gl = -3; gl <= 3 && clear; gl++) for (var ga = -2; ga <= 2 && clear; ga++) { var gx = gf.P.x + gf.S.x * gl * 12 * U + gf.T.x * ga * 12 * U, gz = gf.P.z + gf.S.z * gl * 12 * U + gf.T.z * ga * 12 * U; if (o.obstacleAt(gx, gz) > gf.P.y - 6 * U) clear = false; }
          if (clear) pick = gi;
        }
        if (pick >= 0) gtF.push(F[pick]);
      }
      if (gtF.length) {
        var gtBody = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.4, metalness: 0.75 }), gtGlow = new THREE.MeshBasicMaterial({ color: 0xffd25a, toneMapped: false });
        var slabW = 9 * U, slabD = 16 * U, lint = [new THREE.BoxGeometry(slabW, GTH + 4 * U, slabD).translate(-GTX, GTH / 2 - 2 * U, 0), new THREE.BoxGeometry(slabW, GTH + 4 * U, slabD).translate(GTX, GTH / 2 - 2 * U, 0), new THREE.BoxGeometry(GTX * 2 + slabW, 8 * U, slabD).translate(0, GTH - 4 * U, 0)];
        inst(merge ? merge(lint, false) : lint[2], gtBody, gtF, 'track-gate-towers', function (f, d) { frameTo(f, d, 0); });
        var glow = [new THREE.BoxGeometry(0.8 * U, GTH * 0.9, 0.8 * U).translate(-GTX + slabW / 2 + 0.2 * U, GTH * 0.45, slabD / 2 + 0.1 * U), new THREE.BoxGeometry(0.8 * U, GTH * 0.9, 0.8 * U).translate(GTX - slabW / 2 - 0.2 * U, GTH * 0.45, slabD / 2 + 0.1 * U), new THREE.BoxGeometry(GTX * 2 - slabW, 0.8 * U, 0.8 * U).translate(0, GTH - 8.3 * U, slabD / 2 + 0.1 * U)];
        inst(merge ? merge(glow, false) : glow[2], gtGlow, gtF, 'track-gate-tower-glow', function (f, d) { frameTo(f, d, 0); });
      }
    }

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
      // EDGE QUERY (2026-10-11): nearest deck frame (brute force over the ~1800 frames: ~20 us). over = beyond the wall line; (cx, cz) = the point pulled back onto it; y = deck top there.
      edgeAt: function (x, z) {
        var bi = -1, bd = Infinity, k, dx, dz, d2;
        for (k = 0; k < n; k++) { dx = F[k].P.x - x; dz = F[k].P.z - z; d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bi = k; } }
        if (bi < 0) return null; var f = F[bi], sl = Math.hypot(f.S.x, f.S.z) || 1, sx = f.S.x / sl, sz = f.S.z / sl, lat = (x - f.P.x) * sx + (z - f.P.z) * sz, W = HW + KERB + 0.3 * U;
        if (Math.abs(lat) > W + 14 * U) return null;   // not near this deck
        var sg = lat < 0 ? -1 : 1, over = Math.abs(lat) > W;
        return { over: over, lat: lat, y: f.P.y + f.S.y * lat, cx: over ? x - sx * (lat - sg * W) : x, cz: over ? z - sz * (lat - sg * W) : z, nx: sx * sg, nz: sz * sg, yaw: Math.atan2(f.T.x, f.T.z), px: f.P.x, pz: f.P.z, py: f.P.y, i: bi };
      },
      boostAt: function (x, z) { var r = locate(x, z); return !!(r && padSet[r.i] && Math.abs(r.lat) < HW * 0.5); },
      dispose: function () { if (grp.parent) grp.parent.remove(grp); grp.traverse(function (c) { if (c.geometry) c.geometry.dispose(); }); }
    };
  }
  buildRaceTrack.pure = { resample: resample, bankProfile: bankProfile, deckProfile: deckProfile };
  if (typeof module !== 'undefined' && module.exports) module.exports = buildRaceTrack;
  if (root) root.buildRaceTrack = buildRaceTrack;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
