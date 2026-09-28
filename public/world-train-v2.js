/* world-train-v2.js — SHADDAI's own maglev trainset, built in code (no download, no licence strings).
 * Double-ended bullet maglev: 2 nose cars + 2 mid cars + gangways, ≈95 m, in METRES with length along +Z and the
 * base at y = 0 — the same convention world-transit.js setTrainModel() expects for a GLB (it rotates + scales by U).
 *   const train = window.buildMaglevTrainV2({ THREE });            // → THREE.Group
 *   transit.setTrainModel(train, train.userData.lengthM, 1);        // one trainset per track
 *   train.userData.emissiveMats → hand to _v4Sky.addEmissive for the day/night ramp
 *   train.userData.seats        → [{x,y,z,kind,yaw,car,ax,az,pilot?}] seat points (metres, model space); kind =
 *                                  'standard' (2+2 rows) | 'lounge' (sofas facing across the car) | 'bar' (window-counter
 *                                  stools) | 'pilot' (cockpit, view only); yaw = facing (0 = +Z); ax/az = aisle spot to stand up to
 *   train.userData.doors        → [{z, side, car}] door centres; door panels are meshes with userData.doorIdx (slide open)
 *   train.userData.floors       → [{min,max}] walkable floor boxes (floor height = min.y): cabins, cockpits, gangways
 *   train.userData.colliders    → [{min,max}] solid interior boxes: side walls (door gaps), end walls, seats, tables, counters
 *   train.userData.cabin        → { floorY, halfW, A, doorW, cars } (world-transit.js walks the player inside, train-local)
 * Car 3 (second mid car) is the LOUNGE + WINDOW-BAR car; the others are 2+2 standard rows; each nose has a pilot seat.
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
  var FLOOR = BOTTOM + 0.39, IW = 1.45, COCK = 2.6, PASS = 0.55;   // floor top, cabin inner half-width, cockpit depth, gangway half-width

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
        var slot = pick(bandOf(xn, yn), xn, yn, mid); if (slot < 0) continue;   // -1 = open (door opening)
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
    var seats = [], doors = [], floors = [], colliders = [], tables = [];
    function bx(x0, y0, z0, x1, y1, z1) { return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }; }

    // car layout along Z, centred on 0
    var cars = [{ len: NOSE_CAR, nose: -1 }, { len: MID_CAR }, { len: MID_CAR }, { len: NOSE_CAR, nose: 1 }];
    var total = cars.reduce(function (s, c) { return s + c.len; }, 0) + GANG * (cars.length - 1), z = -total / 2;
    cars.forEach(function (c, ci) { c.z0 = z; c.z1 = z + c.len; z = c.z1 + GANG; c.i = ci; });
    cars[2].lounge = true;   // lounge sofas + window bar

    function doorSpans(c) {
      var body0 = c.nose < 0 ? c.z0 + NOSE_LEN : c.z0, body1 = c.nose > 0 ? c.z1 - NOSE_LEN : c.z1, L = body1 - body0;
      return c.nose ? [c.nose < 0 ? body0 + 2 : body1 - 2] : [body0 + L * 0.18, body1 - L * 0.18];
    }

    cars.forEach(function (c) {
      var spans = doorSpans(c);
      spans.forEach(function (dz) { doors.push({ z: dz, side: 1, car: c.i }, { z: dz, side: -1, car: c.i }); });
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
        if (inDoor && Math.abs(xn) > 0.55 && yn > -0.72 && yn < 0.62) return -1;           // door opening (panel mesh fills it)
        if (inDoor && Math.abs(xn) > 0.55 && yn > -0.9 && yn <= -0.72) return DOOR;         // smoked-gold kick plate
        if (band === GLASSM) { var u = ((q.z - c.z0) % PITCH + PITCH) % PITCH; return u < GLASS ? GLASSM : BODY; }
        return band;
      }, c.nose < 0 ? { slot: GOLD } : null, c.nose > 0 ? { slot: GOLD } : null);   // gangway ends stay open (partitions below)
      var skin = new THREE.Mesh(geo, M); skin.castShadow = true; skin.receiveShadow = true; root.add(skin);

      // levitation skirt + emerald underglow (full car minus the nose sweep)
      var s0 = c.nose < 0 ? c.z0 + NOSE_LEN * 0.55 : c.z0, s1 = c.nose > 0 ? c.z1 - NOSE_LEN * 0.55 : c.z1, sl = s1 - s0;
      var skirt = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.5, sl), M[SKIRT]); skirt.position.set(0, 0.3, (s0 + s1) / 2); root.add(skirt);
      var glow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, sl * 0.96), under); glow.position.set(0, 0.04, (s0 + s1) / 2); root.add(glow);

      // cabin: floor (incl. cockpit), ceiling light strip, walkable floor box + wall colliders with door gaps
      var cz0 = c.nose < 0 ? c.z0 + NOSE_LEN : c.z0, cz1 = c.nose > 0 ? c.z1 - NOSE_LEN : c.z1;
      var fz0 = c.nose < 0 ? cz0 - COCK : cz0, fz1 = c.nose > 0 ? cz1 + COCK : cz1, b0 = cz0 + 0.6, b1 = cz1 - 0.6;
      var floor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, fz1 - fz0), floorM); floor.position.set(0, FLOOR - 0.04, (fz0 + fz1) / 2); root.add(floor);
      var strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, b1 - b0), cabinLight); strip.position.set(0, YC + B * 0.78, (b0 + b1) / 2); root.add(strip);
      floors.push(bx(-IW, FLOOR, fz0, IW, FLOOR + 2.3, fz1));
      [-1, 1].forEach(function (sd) {
        var zs = fz0, x0 = sd > 0 ? IW : -IW - 0.4, x1 = sd > 0 ? IW + 0.4 : -IW;
        spans.forEach(function (dz) { colliders.push(bx(x0, FLOOR, zs, x1, FLOOR + 2.4, dz - DOOR_W / 2)); zs = dz + DOOR_W / 2; });
        colliders.push(bx(x0, FLOOR, zs, x1, FLOOR + 2.4, fz1));
        if (c.nose <= 0) colliders.push(bx(sd > 0 ? PASS : -IW - 0.4, FLOOR, c.z1 - 0.12, sd > 0 ? IW + 0.4 : -PASS, FLOOR + 2.4, c.z1 + 0.02));   // end walls beside the gangway
        if (c.nose >= 0) colliders.push(bx(sd > 0 ? PASS : -IW - 0.4, FLOOR, c.z0 - 0.02, sd > 0 ? IW + 0.4 : -PASS, FLOOR + 2.4, c.z0 + 0.12));
      });
      if (c.lounge) {
        // LOUNGE (front half): 3-seat sofas against each wall facing across the car, a low table in front of each
        var mid = (cz0 + cz1) / 2, zl = spans[0] + DOOR_W / 2 + 0.5;
        for (var k = 0; k < 2; k++) {
          var zc = zl + 1.05 + k * 2.5;
          [-1, 1].forEach(function (sd) {
            for (var j = -1; j <= 1; j++) seats.push({ x: sd * 1.1, y: FLOOR + 0.42, z: zc + j * 0.7, kind: 'lounge', yaw: -sd * Math.PI / 2, car: c.i, ax: sd * 0.2, az: zc + j * 0.7 });
            colliders.push(bx(sd > 0 ? 0.8 : -IW, FLOOR, zc - 1.05, sd > 0 ? IW : -0.8, FLOOR + 1.0, zc + 1.05));
            colliders.push(bx(sd > 0 ? 0.5 : -0.8, FLOOR, zc - 0.7, sd > 0 ? 0.8 : -0.5, FLOOR + 0.45, zc + 0.7));
            tables.push({ x: sd * 0.65, z: zc, w: 0.3, d: 1.4, h: 0.45 });
          });
        }
        // WINDOW BAR (back half): a counter along each window, stools facing out at the view
        var zb0 = mid + 0.3, zb1 = spans[1] - DOOR_W / 2 - 0.5;
        [-1, 1].forEach(function (sd) {
          colliders.push(bx(sd > 0 ? 1.15 : -IW, FLOOR, zb0, sd > 0 ? IW : -1.15, FLOOR + 1.05, zb1));
          tables.push({ x: sd * 1.3, z: (zb0 + zb1) / 2, w: 0.3, d: zb1 - zb0, h: 1.05 });
          for (var sz = zb0 + 0.4; sz < zb1 - 0.2; sz += 0.8) {
            seats.push({ x: sd * 0.8, y: FLOOR + 0.75, z: sz, kind: 'bar', yaw: sd * Math.PI / 2, car: c.i, ax: sd * 0.3, az: sz });
            colliders.push(bx(sd * 0.8 - 0.18, FLOOR, sz - 0.18, sd * 0.8 + 0.18, FLOOR + 0.8, sz + 0.18));
          }
        });
      } else {
        // STANDARD: 2 + aisle + 2 rows between the doors, facing +Z
        for (var sz = b0 + 0.6; sz < b1 - 0.4; sz += 1.1) {
          if (spans.some(function (dz) { return Math.abs(sz - dz) < DOOR_W / 2 + 0.5; })) continue;
          [-1.15, -0.62, 0.62, 1.15].forEach(function (sx) { seats.push({ x: sx, y: FLOOR + 0.45, z: sz, kind: 'standard', yaw: 0, car: c.i, ax: 0, az: sz }); });
          colliders.push(bx(0.37, FLOOR, sz - 0.3, IW, FLOOR + 1.2, sz + 0.26), bx(-IW, FLOOR, sz - 0.3, -0.37, FLOOR + 1.2, sz + 0.26));
        }
      }
      // pilot seat + console in each cockpit (view only), facing its nose
      if (c.nose) {
        var pz = c.nose > 0 ? cz1 + 1.6 : cz0 - 1.6, fz = c.nose > 0 ? fz1 : fz0;
        seats.push({ x: 0, y: FLOOR + 0.45, z: pz, kind: 'pilot', pilot: true, yaw: c.nose > 0 ? 0 : Math.PI, car: c.i, ax: 0, az: pz - c.nose * 1.0 });
        colliders.push(bx(-0.32, FLOOR, pz - 0.32, 0.32, FLOOR + 1.2, pz + 0.32));
        colliders.push(bx(-IW, FLOOR, Math.min(fz, fz - c.nose * 0.45), IW, FLOOR + 1.0, Math.max(fz, fz - c.nose * 0.45)));
        tables.push({ x: 0, z: fz - c.nose * 0.225, w: 2.4, d: 0.45, h: 0.9, lit: true });
      }
    });

    // gangways: walkable floor through an open tube, partitions with a doorway at every car end that meets one
    var gangM = M[SKIRT].clone(); gangM.side = THREE.DoubleSide;
    var endShape = new THREE.Shape();
    PROFILE.forEach(function (p, k) { var x = p[0] * A * 0.99, y = YC + p[1] * B * 0.99; if (k) endShape.lineTo(x, y); else endShape.moveTo(x, y); });
    var hole = new THREE.Path(); hole.moveTo(-PASS, FLOOR); hole.lineTo(-PASS, FLOOR + 2.2); hole.lineTo(PASS, FLOOR + 2.2); hole.lineTo(PASS, FLOOR); hole.lineTo(-PASS, FLOOR);
    endShape.holes.push(hole);
    var endGeo = new THREE.ShapeGeometry(endShape, 1);
    cars.slice(0, -1).forEach(function (c) {
      var gz = c.z1 + GANG / 2;
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, GANG + 0.1, 16, 1, true), gangM); tube.rotation.x = Math.PI / 2; tube.scale.z = 1.2; tube.position.set(0, YC - 0.2, gz); root.add(tube);
      var gf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, GANG + 0.2), floorM); gf.position.set(0, FLOOR - 0.04, gz); root.add(gf);
      [c.z1, c.z1 + GANG].forEach(function (pz) { var w = new THREE.Mesh(endGeo, M[BODY]); w.position.z = pz; root.add(w); });
      floors.push(bx(-PASS, FLOOR, c.z1 - 0.3, PASS, FLOOR + 2.2, c.z1 + GANG + 0.3));
    });

    // tables / counters / cockpit consoles (dark pedestal + gold top; consoles get the emerald line)
    tables.forEach(function (t) {
      var b = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h - 0.04, t.d), M[SKIRT]); b.position.set(t.x, FLOOR + (t.h - 0.04) / 2, t.z); root.add(b);
      var top = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.06, 0.04, t.d + 0.06), t.lit ? M[LINE] : M[GOLD]); top.position.set(t.x, FLOOR + t.h - 0.02, t.z); root.add(top);
    });

    // door panels (slide along +Z into the wall pocket when world-transit opens them)
    doors.forEach(function (d, i) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, DOOR_W), M[DOOR]); p.name = 'door-' + i;
      p.position.set(d.side * (A - 0.06), YC - 0.09, d.z); p.userData = { doorIdx: i, doorZ: d.z, side: d.side }; root.add(p);
    });

    // seats as two instanced meshes (base + back); every class reuses them with its own per-instance matrix:
    // standard/pilot = seat + back, lounge = wide sofa cushion + wall-side back, bar = stool top + post
    var base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), seatM, seats.length);
    var back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.75, 0.1), seatM, seats.length);
    var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    seats.forEach(function (s, i) {
      var fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); q4.setFromAxisAngle(up, s.yaw);
      if (s.kind === 'lounge') {
        base.setMatrixAt(i, m4.compose(p4.set(s.x, s.y - 0.09, s.z), q4, s4.set(1.4, 1.5, 1.2)));
        back.setMatrixAt(i, m4.compose(p4.set(s.x - fx * 0.33, s.y + 0.25, s.z - fz * 0.33), q4, s4.set(1.4, 0.8, 1.5)));
      } else if (s.kind === 'bar') {
        var h = s.y - FLOOR - 0.08;
        base.setMatrixAt(i, m4.compose(p4.set(s.x, s.y - 0.04, s.z), q4, s4.set(0.7, 0.66, 0.7)));
        back.setMatrixAt(i, m4.compose(p4.set(s.x, FLOOR + h / 2, s.z), q4, s4.set(0.16, h / 0.75, 0.8)));
      } else {
        base.setMatrixAt(i, m4.compose(p4.set(s.x, s.y - 0.06, s.z), q4, s4.set(1, 1, 1)));
        back.setMatrixAt(i, m4.compose(p4.set(s.x - fx * 0.24, s.y + 0.32, s.z - fz * 0.24), q4, s4.set(1, 1, 1)));
      }
    });
    root.add(base, back);

    root.userData = { lengthM: total, seats: seats, doors: doors, floors: floors, colliders: colliders,
      cabin: { floorY: FLOOR, halfW: IW, A: A, doorW: DOOR_W, cars: cars.map(function (c) { return { z0: c.z0, z1: c.z1, nose: c.nose || 0, lounge: !!c.lounge }; }) },
      emissiveMats: [M[LINE], M[LAMP], M[DOOR], under, cabinLight], materials: M };
    return root;
  };
  window.__trainV2Internals = { bandOf: bandOf, PROFILE: PROFILE, dims: { A: A, B: B, BOTTOM: BOTTOM, NOSE_LEN: NOSE_LEN, FLOOR: FLOOR, IW: IW } };
})();
