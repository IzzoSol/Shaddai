/* world-train-v2.js — SHADDAI's own maglev trainset, built in code (no download, no licence strings).
 * Double-ended bullet maglev: 2 nose cars + 2 mid cars + gangways, ≈95 m, in METRES with length along +Z and the
 * base at y = 0 — the same convention world-transit.js setTrainModel() expects for a GLB (it rotates + scales by U).
 *   const train = window.buildMaglevTrainV2({ THREE });            // → THREE.Group
 *   transit.setTrainModel(train, train.userData.lengthM, 1);        // one trainset per track
 *   train.userData.emissiveMats → hand to _v4Sky.addEmissive for the day/night ramp
 *   train.userData.seats        → [{x,y,z}] seat points (metres, model space) where riders/agents attach
 *   train.userData.doors        → [{z, side}] door centres (for boarding animations later)
 * Body: one smooth lofted skin per car (superellipse cross-section), material bands picked per quad — pearl body,
 * dark glass window band with pillars, smoked-gold doors, emerald light line, headlights, gold nose tip, obsidian skirt.
 */
(function () {
  'use strict';
  var N = 40;            // cross-section points
  var EXP = 3.2;         // superellipse exponent (2 = ellipse, higher = boxier)
  var A = 1.75, B = 1.85;            // half width / half height (m) → 3.5 m wide, 3.7 m tall body
  var BOTTOM = 0.55;                 // body underside above the guideway (the skirt fills below)
  var YC = BOTTOM + B;               // body centre height
  var NOSE_CAR = 26, NOSE_LEN = 11, MID_CAR = 20, GANG = 1.0;
  var PITCH = 2.4, GLASS = 1.9;      // window pitch / glass width along Z (pillar = PITCH - GLASS)
  var DOOR_W = 1.6;

  var PROFILE = [];
  for (var k = 0; k < N; k++) {
    var th = k / N * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    PROFILE.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / EXP), Math.sign(s) * Math.pow(Math.abs(s), 2 / EXP)]);
  }

  // material slots
  var BODY = 0, GLASSM = 1, DOOR = 2, LINE = 3, LAMP = 4, GOLD = 5, SKIRT = 6;

  function bandOf(xn, yn) {
    if (yn < -0.72) return SKIRT;
    if (yn > -0.32 && yn < -0.12) return LINE;
    if (yn > 0.06 && yn < 0.6 && Math.abs(xn) > 0.3) return GLASSM;
    return BODY;
  }

  // loft: sections [{z, sx, sy, yc, t}] (t = nose param 0..1, or -1 for straight body); pick(band, xn, yn, sec) → slot
  function loft(THREE, sections, pick, capStart, capEnd) {
    var pos = [], groups = [[], [], [], [], [], [], []];
    sections.forEach(function (S) {
      PROFILE.forEach(function (p) { pos.push(p[0] * A * S.sx, S.yc + p[1] * B * S.sy, S.z); });
    });
    for (var i = 0; i < sections.length - 1; i++) {
      var s0 = sections[i], s1 = sections[i + 1], mid = { z: (s0.z + s1.z) / 2, t: (s0.t + s1.t) / 2, car: s0.car };
      for (var k = 0; k < N; k++) {
        var k1 = (k + 1) % N, xn = (PROFILE[k][0] + PROFILE[k1][0]) / 2, yn = (PROFILE[k][1] + PROFILE[k1][1]) / 2;
        var slot = pick(bandOf(xn, yn), xn, yn, mid);
        var a = i * N + k, b = i * N + k1, c = (i + 1) * N + k, d = (i + 1) * N + k1;
        groups[slot].push(a, b, c, b, d, c);   // outward-facing (profile is CCW seen from +Z)
      }
    }
    function cap(sec, idx, flip, slot) {   // fan to the section centre
      var ci = pos.length / 3; pos.push(0, sec.yc, sec.z);
      for (var k = 0; k < N; k++) { var a = idx * N + k, b = idx * N + (k + 1) % N; if (flip) groups[slot].push(ci, b, a); else groups[slot].push(ci, a, b); }
    }
    if (capStart) cap(sections[0], 0, true, capStart.slot);
    if (capEnd) cap(sections[sections.length - 1], sections.length - 1, false, capEnd.slot);
    var g = new THREE.BufferGeometry(), index = [];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    groups.forEach(function (list, slot) { if (list.length) { g.addGroup(index.length, list.length, slot); Array.prototype.push.apply(index, list); } });
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  function straight(z0, z1, car, step) {
    var out = [], n = Math.max(1, Math.ceil((z1 - z0) / step));
    for (var i = 0; i <= n; i++) out.push({ z: z0 + (z1 - z0) * i / n, sx: 1, sy: 1, yc: YC, t: -1, car: car });
    return out;
  }
  // nose from zBase (full section) to the tip at zBase + dir*NOSE_LEN; bottom stays flat, the roof sweeps down
  function nose(zBase, dir, car) {
    var out = [], n = 28;
    for (var i = 0; i <= n; i++) {
      var t = Math.min(0.997, Math.pow(i / n, 0.85));
      var sx = Math.pow(1 - Math.pow(t, 2.4), 0.5), sy = Math.pow(1 - Math.pow(t, 1.5), 0.95);
      out.push({ z: zBase + dir * NOSE_LEN * t, sx: sx, sy: sy, yc: BOTTOM + B * sy, t: t, car: car });
    }
    return dir > 0 ? out : out.reverse();
  }

  window.buildMaglevTrainV2 = function (opts) {
    var THREE = opts.THREE, P = opts.palette || {};
    var M = [
      new THREE.MeshStandardMaterial({ color: P.body || 0xeef1f4, metalness: 0.55, roughness: 0.22, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: P.glass || 0x0b1a1f, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.42, depthWrite: false }),
      new THREE.MeshStandardMaterial({ color: P.door || 0x2a2416, metalness: 0.85, roughness: 0.12, emissive: P.doorGlow || 0xe8c45c, emissiveIntensity: 0.18 }),
      new THREE.MeshStandardMaterial({ color: 0x03150d, emissive: P.line || 0x00ff9c, emissiveIntensity: 2.2, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4fbff, emissiveIntensity: 3.0, roughness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: P.gold || 0xe8c45c, metalness: 0.95, roughness: 0.18 }),
      new THREE.MeshStandardMaterial({ color: P.skirt || 0x06080b, metalness: 0.6, roughness: 0.35 })
    ];
    var under = new THREE.MeshStandardMaterial({ color: 0x02100a, emissive: P.line || 0x00ff9c, emissiveIntensity: 1.6 });
    var cabinLight = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff3dc, emissiveIntensity: 1.4 });
    var seatM = new THREE.MeshStandardMaterial({ color: P.seat || 0x14181f, roughness: 0.7 });
    var floorM = new THREE.MeshStandardMaterial({ color: 0x1b2027, roughness: 0.8 });

    var root = new THREE.Group(); root.name = 'SHADDAI_Maglev_v2';
    var seats = [], doors = [];

    // car layout along Z, centred on 0
    var cars = [{ len: NOSE_CAR, nose: -1 }, { len: MID_CAR }, { len: MID_CAR }, { len: NOSE_CAR, nose: 1 }];
    var total = cars.reduce(function (s, c) { return s + c.len; }, 0) + GANG * (cars.length - 1), z = -total / 2;
    cars.forEach(function (c, ci) { c.z0 = z; c.z1 = z + c.len; z = c.z1 + GANG; c.i = ci; });

    function doorSpans(c) {
      var body0 = c.nose < 0 ? c.z0 + NOSE_LEN : c.z0, body1 = c.nose > 0 ? c.z1 - NOSE_LEN : c.z1, L = body1 - body0;
      return c.nose ? [c.nose < 0 ? body0 + 2 : body1 - 2] : [body0 + L * 0.18, body1 - L * 0.18];
    }

    cars.forEach(function (c) {
      var spans = doorSpans(c);
      spans.forEach(function (dz) { doors.push({ z: dz, side: 1 }, { z: dz, side: -1 }); });
      var secs;
      if (c.nose < 0) secs = nose(c.z0 + NOSE_LEN, -1, c.i).concat(straight(c.z0 + NOSE_LEN, c.z1, c.i, 0.3).slice(1));
      else if (c.nose > 0) secs = straight(c.z0, c.z1 - NOSE_LEN, c.i, 0.3).concat(nose(c.z1 - NOSE_LEN, 1, c.i).slice(1));
      else secs = straight(c.z0, c.z1, c.i, 0.3);
      var geo = loft(THREE, secs, function (band, xn, yn, q) {
        if (q.t >= 0) {                                  // nose zone
          if (q.t > 0.94) return GOLD;
          if (q.t > 0.78 && q.t < 0.92 && yn > -0.35 && yn < 0.05 && Math.abs(xn) > 0.3) return LAMP;
          if (q.t > 0.12 && q.t < 0.6 && yn > 0.18) return GLASSM;      // wraparound cockpit canopy
          return band === GLASSM ? BODY : band;
        }
        var inDoor = spans.some(function (dz) { return Math.abs(q.z - dz) < DOOR_W / 2; });
        if (inDoor && Math.abs(xn) > 0.55 && yn > -0.72 && yn < 0.62) return DOOR;
        if (band === GLASSM) { var u = ((q.z - c.z0) % PITCH + PITCH) % PITCH; return u < GLASS ? GLASSM : BODY; }
        return band;
      }, { slot: c.nose < 0 ? GOLD : BODY }, { slot: c.nose > 0 ? GOLD : BODY });
      var skin = new THREE.Mesh(geo, M); skin.castShadow = true; skin.receiveShadow = true; root.add(skin);

      // levitation skirt + emerald underglow (full car minus the nose sweep)
      var s0 = c.nose < 0 ? c.z0 + NOSE_LEN * 0.55 : c.z0, s1 = c.nose > 0 ? c.z1 - NOSE_LEN * 0.55 : c.z1, sl = s1 - s0;
      var skirt = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.5, sl), M[SKIRT]); skirt.position.set(0, 0.3, (s0 + s1) / 2); root.add(skirt);
      var glow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, sl * 0.96), under); glow.position.set(0, 0.04, (s0 + s1) / 2); root.add(glow);

      // cabin: floor, ceiling light strip, seats (2 + aisle + 2) between the doors
      var b0 = c.nose < 0 ? c.z0 + NOSE_LEN + 0.6 : c.z0 + 0.6, b1 = c.nose > 0 ? c.z1 - NOSE_LEN - 0.6 : c.z1 - 0.6;
      var floor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, b1 - b0), floorM); floor.position.set(0, BOTTOM + 0.35, (b0 + b1) / 2); root.add(floor);
      var strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, b1 - b0), cabinLight); strip.position.set(0, YC + B * 0.78, (b0 + b1) / 2); root.add(strip);
      for (var sz = b0 + 0.6; sz < b1 - 0.4; sz += 1.1) {
        if (spans.some(function (dz) { return Math.abs(sz - dz) < DOOR_W / 2 + 0.5; })) continue;
        [-1.15, -0.62, 0.62, 1.15].forEach(function (sx) { seats.push({ x: sx, y: BOTTOM + 0.39 + 0.45, z: sz }); });
      }
      // pilot seat in each cockpit
      if (c.nose) seats.push({ x: 0, y: BOTTOM + 0.84, z: c.nose > 0 ? c.z1 - NOSE_LEN + 1.6 : c.z0 + NOSE_LEN - 1.6, pilot: true });
    });

    // seats as two instanced meshes (base + back), facing the train's +Z
    var base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), seatM, seats.length);
    var back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.75, 0.1), seatM, seats.length);
    var m4 = new THREE.Matrix4();
    seats.forEach(function (s, i) {
      base.setMatrixAt(i, m4.makeTranslation(s.x, s.y - 0.06, s.z));
      back.setMatrixAt(i, m4.makeTranslation(s.x, s.y + 0.32, s.z - 0.24));
    });
    root.add(base, back);

    // gangways between cars (dark bellows)
    cars.slice(0, -1).forEach(function (c) {
      var g = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.0, GANG + 0.4), M[SKIRT]); g.position.set(0, YC - 0.1, c.z1 + GANG / 2); root.add(g);
    });

    root.userData = { lengthM: total, seats: seats, doors: doors, emissiveMats: [M[LINE], M[LAMP], M[DOOR], under, cabinLight], materials: M };
    return root;
  };
  window.__trainV2Internals = { bandOf: bandOf, PROFILE: PROFILE, dims: { A: A, B: B, BOTTOM: BOTTOM, NOSE_LEN: NOSE_LEN } };
})();
