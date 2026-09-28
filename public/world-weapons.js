/* world-weapons.js — the 7 agent weapons, built in code (no textures, no downloads, $0). Metres.
 *   const w = window.buildAgentWeapon({ THREE, agent: 'zerox', palette? });
 *     w.group        THREE.Group, the whole weapon (weapon space: +Y = blade/tip, -Z = edge/strike side, +Z = back of hand)
 *     w.grip         Object3D at the fist point inside the handle (identity rotation = weapon space)
 *     w.sheathe      back-socket offset {mode:'back'|'hand'|'hide', pos:[right,up,fwd] m from the chest bone, dir, face}
 *     w.emissiveMats MeshStandardMaterials with emissive → hand to _v4Sky.addEmissive (the ramp owns emissiveIntensity;
 *                    update() only scales the emissive COLOUR, so the two never fight)
 *     w.update(dt, state)  state = 'idle' | 'drawn' | 'attack' | 'charge' — glow, arcs, beam, chain, trail. Allocation-free.
 *     w.handleBox    Box3 of the handle in weapon space;  w.frame 'blade' (tip along thumb side) | 'arm' (along the forearm)
 *     extras: w.beam (NEXUS), w.chain (TURTLE verlet), w.trail (QUILL ink ribbon), w.arcs (ZEROX/TURTLE line pool)
 *   window.attachWeapon(w, skeletonRoot, { hand:'right', forward?, unitsPerMetre?, socket?, sheathed? })
 *     Finds the hand bone (Meshy/Mixamo 'RightHand', 'mixamorig:RightHand', UAL2 'hand_r', Blender 'hand.R', Biped
 *     'Bip01 R Hand', else a named socket). Call at REST pose, right after load (like ual-retarget.js attachUAL).
 *   window.drawWeapon(w) / window.sheatheWeapon(w)  move the weapon between the hand mount and the back socket.
 *   window.findHandBone(root, side, socket?) / window.WEAPON_AGENTS
 */
(function () {
  'use strict';
  var AGENTS = ['zerox', 'nexus', 'pikadon', 'oracle', 'turtle', 'quill', 'shaddai'];
  var PALETTES = {
    zerox:   { glow: 0x19f0ff, glow2: 0xbffcff, steel: 0x8b9197, dark: 0x0e0f11, wrap: 0x2b2e33 },
    nexus:   { glow: 0x19e6d0, glow2: 0xff7a1a, steel: 0x77808a, dark: 0x1a1f25, wrap: 0x2c333b },
    pikadon: { glow: 0xff3b1f, glow2: 0xffa040, steel: 0x9aa1a9, dark: 0x5c0e12, wrap: 0x2c0d10 },
    oracle:  { glow: 0xb05cff, glow2: 0xeed8ff, steel: 0xb9a7d8, dark: 0x251438, wrap: 0x3c2560 },
    turtle:  { glow: 0x3dff6e, glow2: 0xc8ffd6, steel: 0x7f888e, dark: 0x16241b, wrap: 0x22382a },
    quill:   { glow: 0x3f7bff, glow2: 0xe8c45c, steel: 0xe8c45c, dark: 0x12162e, wrap: 0x1e2750 },
    shaddai: { glow: 0x00ff9c, glow2: 0xe8c45c, steel: 0xe8c45c, dark: 0x06080b, wrap: 0x0d1a14 }
  };
  var SHEATHE = {   // pos: [right, up, forward] metres from the chest bone; dir = where +Y (tip) points; face = where +Z points
    zerox:   { mode: 'back', pos: [0.13, 0.14, -0.16], dir: [-0.45, -1, 0], face: [0, 0, -1] },
    nexus:   { mode: 'hand' },            // wrist cannon stays on the arm, powered down
    pikadon: { mode: 'back', pos: [0.04, -0.12, -0.18], dir: [-0.35, 1, 0], face: [0, 0, -1] },
    oracle:  { mode: 'back', pos: [0, -0.05, -0.17], dir: [0.3, 1, 0], face: [0, 0, -1] },
    turtle:  { mode: 'back', pos: [0.19, -0.42, -0.02], dir: [0.15, -1, 0.1], face: [1, 0, 0] },
    quill:   { mode: 'back', pos: [-0.12, 0.12, -0.16], dir: [0.45, -1, 0], face: [0, 0, -1] },
    shaddai: { mode: 'hide' }             // hand effect, nothing to carry
  };

  // ── shared kit ──────────────────────────────────────────────────────────────────────────────────
  function kit(THREE, P) {
    var emissive = [], glows = [];
    var K = {
      THREE: THREE, P: P, emissive: emissive, glows: glows,
      std: function (color, o) {
        o = o || {};
        var m = new THREE.MeshStandardMaterial({ color: color, metalness: o.metal != null ? o.metal : 0.3, roughness: o.rough != null ? o.rough : 0.55, flatShading: !!o.flat });
        if (o.emissive != null) { m.emissive.setHex(o.emissive); m.emissiveIntensity = o.ei || 1; m.userData.emissiveBase = m.emissive.clone(); emissive.push(m); }
        return m;
      },
      glow: function (color, opacity) {
        var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false });
        m.userData.opacityBase = opacity; glows.push(m); return m;
      },
      // parts merged per material → few draw calls. add(mat, geo, x,y,z, rx,ry,rz, sx,sy,sz, isHandle)
      parts: function () {
        var list = [], hb = new THREE.Box3(), tmp = new THREE.Box3(), e = new THREE.Euler(), q = new THREE.Quaternion(), mtx = new THREE.Matrix4();
        return {
          handleBox: hb,
          add: function (mat, geo, x, y, z, rx, ry, rz, sx, sy, sz, isHandle) {
            e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e);
            mtx.compose(new THREE.Vector3(x || 0, y || 0, z || 0), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
            var g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(mtx);
            if (isHandle) { g.computeBoundingBox(); tmp.copy(g.boundingBox); hb.union(tmp); }
            list.push({ mat: mat, geo: g }); return g;
          },
          build: function (parent) {
            var mats = [];
            list.forEach(function (it) { if (mats.indexOf(it.mat) < 0) mats.push(it.mat); });
            return mats.map(function (mat) {
              var geos = list.filter(function (it) { return it.mat === mat; }).map(function (it) { return it.geo; });
              var n = 0; geos.forEach(function (g) { n += g.attributes.position.count; });
              var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
              geos.forEach(function (g) {
                if (!g.attributes.normal) g.computeVertexNormals();
                pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.count * 3;
              });
              var bg = new THREE.BufferGeometry();
              bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
              bg.computeBoundingSphere();
              var mesh = new THREE.Mesh(bg, mat); parent.add(mesh); return mesh;
            });
          }
        };
      },
      // loft closed rings (arrays of [x,y,z]) into an indexed skin (+ end caps as fans)
      loft: function (rings, caps) {
        var n = rings[0].length, pos = [], idx = [];
        rings.forEach(function (r) { r.forEach(function (p) { pos.push(p[0], p[1], p[2]); }); });
        for (var i = 0; i < rings.length - 1; i++) for (var j = 0; j < n; j++) {
          var a = i * n + j, b = i * n + (j + 1) % n, c = a + n, d = b + n;
          idx.push(a, c, b, b, c, d);
        }
        if (caps) {
          var last = (rings.length - 1) * n;
          for (var k = 1; k < n - 1; k++) { idx.push(0, k, k + 1); idx.push(last, last + k + 1, last + k); }
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        g = g.toNonIndexed(); g.computeVertexNormals(); return g;
      },
      // pooled jittered lightning line strips
      arcs: function (parent, count, pts, color) {
        var mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        var pool = [];
        for (var i = 0; i < count; i++) {
          var arr = new Float32Array(pts * 3), g = new THREE.BufferGeometry(), at = new THREE.BufferAttribute(arr, 3);
          at.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', at);
          var line = new THREE.Line(g, mat); line.visible = false; line.frustumCulled = false; parent.add(line);
          pool.push({ line: line, arr: arr, attr: at, life: 0, rejit: 0, a: 0, b: 0, c: 0 });
        }
        return { mat: mat, pool: pool, pts: pts, acc: 0 };
      }
    };
    return K;
  }

  // drive a pool: rate = spawns/s, fill(arc) writes arc.arr from arc.a/b/c seeds (called on spawn + re-jitter)
  function runArcs(A, dt, rate, fill, seed) {
    A.acc += dt * rate;
    var pool = A.pool;
    for (var i = 0; i < pool.length; i++) {
      var a = pool[i];
      if (a.life <= 0 && A.acc >= 1) { A.acc -= 1; a.life = 0.06 + Math.random() * 0.12; seed(a); a.rejit = 0; }
      if (a.life > 0) {
        a.life -= dt; a.rejit -= dt;
        if (a.rejit <= 0) { fill(a); a.attr.needsUpdate = true; a.rejit = 0.035; }
        a.line.visible = a.life > 0;
      } else if (a.line.visible) a.line.visible = false;
    }
    if (A.acc > 2) A.acc = 2;
  }

  // ── ZEROX: teal lightning katana ─────────────────────────────────────────────────────────────────
  var BL0 = 0.115, BL = 0.70;                           // blade start (above habaki) / blade length
  function bladeZ(t) { return 0.03 * t * t; }           // sori: tip curves toward the spine (+Z)
  function bladeW(t) { return 0.037 * (1 - 0.22 * t); }
  function buildZerox(K, w) {
    var T = K.THREE, P = K.P, g = w.group, parts = K.parts();
    var steel = K.std(P.steel, { metal: 0.85, rough: 0.35, flat: true }), core = K.std(P.dark, { metal: 0.1, rough: 0.95 }),
      wrap = K.std(P.wrap, { metal: 0.05, rough: 0.85, flat: true }),
      bladeM = K.std(0x9ffcff, { metal: 0.2, rough: 0.25, emissive: P.glow, ei: 1.6, flat: true });
    // handle: oval core + diamond wrap scales (rows offset half a cell, gaps show the dark core)
    var HL = 0.25, H0 = -0.195, R = 0.0155;
    parts.add(core, new T.CylinderGeometry(R, R * 1.05, HL, 10, 1), 0, H0 + HL / 2, 0, 0, 0, 0, 0.82, 1, 1, true);
    var rows = 9, cols = 8, dy = HL / rows, da = Math.PI * 2 / cols, dpos = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var a0 = (c + (r % 2) * 0.5) * da, y = H0 + (r + 0.5) * dy, hw = da * 0.43, hh = dy * 0.47;
      var pt = function (ang, yy, rr) { return [Math.cos(ang) * rr * 0.82, yy, Math.sin(ang) * rr]; };
      var L = pt(a0 - hw, y, R + 0.001), Rr = pt(a0 + hw, y, R + 0.001), U = pt(a0, y + hh, R + 0.001), D = pt(a0, y - hh, R + 0.001), C = pt(a0, y, R + 0.0038);
      [[L, C, U], [U, C, Rr], [Rr, C, D], [D, C, L]].forEach(function (tri) { tri.forEach(function (p) { dpos.push(p[0], p[1], p[2]); }); });
    }
    var dg = new T.BufferGeometry(); dg.setAttribute('position', new T.Float32BufferAttribute(dpos, 3)); dg.computeVertexNormals();
    parts.add(wrap, dg, 0, 0, 0, 0, 0, 0, 1, 1, 1, true);
    parts.add(steel, new T.CylinderGeometry(0.0165, 0.0165, 0.022, 10, 1), 0, H0 - 0.009, 0, 0, 0, 0, 0.84, 1, 1);   // kashira
    parts.add(steel, new T.CylinderGeometry(0.017, 0.016, 0.018, 10, 1), 0, H0 + HL + 0.008, 0, 0, 0, 0, 0.84, 1, 1); // fuchi
    parts.add(steel, new T.BoxGeometry(0.066, 0.012, 0.078), 0, 0.073, 0.003);                                          // square tsuba
    parts.add(steel, new T.BoxGeometry(0.05, 0.006, 0.062), 0, 0.082, 0.003);                                           // tsuba step
    parts.add(steel, new T.BoxGeometry(0.014, 0.03, 0.038), 0, 0.1, 0.001);                                             // habaki
    // blade: 5-point section (spine L, ridge L, edge, ridge R, spine R), kissaki sweeps the edge up to the spine
    var N = 18, rings = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, yb = BL0 + t * BL, wv = bladeW(t), th = 0.0078 * (1 - 0.45 * t), zc = bladeZ(t);
      var tk = Math.max(0, (t - 0.86) / 0.14), zs = zc + wv / 2, ze = zc - wv / 2 + tk * tk * wv * 0.97, zr = zs - (zs - ze) * 0.3;
      if (i === N) th = 0.0006;
      rings.push([[-th / 2, yb, zs], [-th * 0.55, yb, zr], [0, yb, ze], [th * 0.55, yb, zr], [th / 2, yb, zs]]);
    }
    var bg = K.loft(rings, true);
    parts.add(bladeM, bg);
    parts.build(g);
    var shell = new T.Mesh(bg.clone(), K.glow(P.glow, 0.28)); shell.scale.set(3.2, 1.012, 1.18); shell.position.z = -0.0005; g.add(shell);
    w.handleBox = parts.handleBox; w.grip.position.set(0, -0.03, 0);
    var A = K.arcs(g, 7, 9, P.glow2); w.arcs = A;
    var fill = function (a) {   // a.a = start t, a.b = span t, a.c = side
      var arr = a.arr, n = A.pts;
      for (var k = 0; k < n; k++) {
        var tt = a.a + a.b * k / (n - 1), wv = bladeW(tt), zc = bladeZ(tt), end = (k === 0 || k === n - 1);
        arr[k * 3] = (Math.random() - 0.5) * (end ? 0.006 : 0.026);
        arr[k * 3 + 1] = BL0 + tt * BL;
        arr[k * 3 + 2] = zc + a.c * wv * 0.5 + (end ? 0 : (Math.random() - 0.5) * 0.05);
      }
    };
    var seed = function (a) { a.b = 0.12 + Math.random() * 0.3; a.a = Math.random() * (0.97 - a.b); a.c = Math.random() * 2 - 1; };
    w._fx = function (dt, st) {
      var rate = st === 'attack' ? 30 : st === 'charge' ? 22 + w.chargeT * 20 : st === 'drawn' ? 2.5 : 0;
      runArcs(A, dt, rate, fill, seed);
      w.flicker = 0.92 + Math.random() * (st === 'idle' ? 0.02 : 0.16);
    };
  }

  // ── NEXUS: wrist laser emitter / beam cannon (frame 'arm': +Y along the forearm toward the fist) ──────
  function buildNexus(K, w) {
    var T = K.THREE, P = K.P, g = w.group, parts = K.parts();
    var shellM = K.std(P.dark, { metal: 0.6, rough: 0.4, flat: true }), steel = K.std(P.steel, { metal: 0.85, rough: 0.3, flat: true }),
      teal = K.std(0x0d4a44, { emissive: P.glow, ei: 1.5 }), orange = K.std(0x4a2008, { emissive: P.glow2, ei: 1.6 });
    parts.add(shellM, new T.CylinderGeometry(0.05, 0.056, 0.27, 12, 1), 0, -0.085, 0, 0, 0, 0, 1, 1, 0.82, true);  // gauntlet housing
    parts.add(steel, new T.CylinderGeometry(0.012, 0.012, 0.07, 6, 1), 0, 0, 0, 0, 0, Math.PI / 2);               // trigger grip bar
    parts.add(steel, new T.BoxGeometry(0.07, 0.22, 0.016), 0, -0.09, 0.047);                                       // top plate
    parts.add(teal, new T.BoxGeometry(0.02, 0.16, 0.01), 0, -0.09, 0.058);                                         // power cell
    for (var i = 0; i < 3; i++) {
      parts.add(orange, new T.BoxGeometry(0.008, 0.018, 0.03), 0.054, -0.16 + i * 0.035, 0);
      parts.add(orange, new T.BoxGeometry(0.008, 0.018, 0.03), -0.054, -0.16 + i * 0.035, 0);
    }
    parts.add(steel, new T.CylinderGeometry(0.03, 0.04, 0.05, 10, 1), 0, 0.07, 0.004);                            // barrel shroud
    parts.add(steel, new T.CylinderGeometry(0.058, 0.058, 0.016, 12, 1), 0, -0.215, 0, 0, 0, 0, 1, 1, 0.84);          // wrist cuff
    [-1, 1].forEach(function (sx) {                                                                                  // angled armour fins
      parts.add(shellM, new T.BoxGeometry(0.012, 0.17, 0.05), sx * 0.062, -0.1, -0.01, 0, 0, sx * 0.08);
      parts.add(teal, new T.BoxGeometry(0.004, 0.12, 0.006), sx * 0.069, -0.1, -0.03, 0, 0, sx * 0.08);
    });
    parts.add(steel, new T.CylinderGeometry(0.024, 0.027, 0.09, 10, 1), 0, 0.13, 0.004);                          // barrel
    parts.add(orange, new T.TorusGeometry(0.028, 0.006, 4, 14), 0, 0.175, 0.004, Math.PI / 2, 0, 0);             // muzzle ring
    parts.add(teal, new T.CylinderGeometry(0.018, 0.018, 0.006, 10, 1), 0, 0.176, 0.004);                         // lens
    parts.add(teal, new T.BoxGeometry(0.006, 0.08, 0.006), 0.026, 0.12, 0.004);
    parts.add(teal, new T.BoxGeometry(0.006, 0.08, 0.006), -0.026, 0.12, 0.004);
    parts.build(g);
    var muzzle = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), K.glow(P.glow, 0.5)); muzzle.position.set(0, 0.185, 0.004); g.add(muzzle);
    var beam = new T.Group(); beam.position.set(0, 0.18, 0.004); beam.visible = false; g.add(beam);
    var cg = new T.CylinderGeometry(0.016, 0.016, 1, 8, 1, true); cg.translate(0, 0.5, 0);
    var sg = new T.CylinderGeometry(0.045, 0.045, 1, 8, 1, true); sg.translate(0, 0.5, 0);
    var beamCore = new T.Mesh(cg, K.glow(0xe8fffb, 0.95)), beamShell = new T.Mesh(sg, K.glow(P.glow, 0.35));
    beamCore.frustumCulled = beamShell.frustumCulled = false; beam.add(beamCore); beam.add(beamShell);
    w.beam = beam; w.beamLength = 12;
    w.handleBox = parts.handleBox; w.grip.position.set(0, 0, 0);
    w._fx = function (dt, st) {
      var firing = st === 'attack';
      beam.visible = firing;
      if (firing) { var j = 0.85 + Math.random() * 0.3; beam.scale.set(j, w.beamLength, j); }
      var ms = st === 'charge' ? 1 + Math.min(w.chargeT, 1.5) * 0.9 + Math.random() * 0.15 : firing ? 1.4 : 0.7;
      muzzle.scale.setScalar(ms);
    };
  }

  // ── PIKADON: rune warhammer ──────────────────────────────────────────────────────────────────────
  var RUNES = [   // strokes [y1,z1,y2,z2] in a unit box, 3 glyphs per side
    [[-1, 0, 1, 0], [1, 0, 0.3, 0.7], [0, 0, -0.6, 0.6]],
    [[-1, -0.5, 1, -0.5], [-1, 0.5, 1, 0.5], [0.6, -0.5, -0.2, 0.5]],
    [[-1, 0, 0, -0.6], [0, -0.6, 1, 0], [-0.3, 0.3, 0.6, 0.3]]
  ];
  function buildPikadon(K, w) {
    var T = K.THREE, P = K.P, g = w.group, parts = K.parts();
    var steel = K.std(P.steel, { metal: 0.9, rough: 0.35, flat: true }), dsteel = K.std(0x3a3e44, { metal: 0.8, rough: 0.45, flat: true }),
      red = K.std(P.dark, { metal: 0.55, rough: 0.45, flat: true }), leather = K.std(P.wrap, { metal: 0.05, rough: 0.9 }),
      rune = K.std(0x3a0806, { emissive: P.glow, ei: 1.8 });
    parts.add(dsteel, new T.CylinderGeometry(0.018, 0.021, 0.96, 8, 1), 0, 0.1, 0);                                 // shaft
    parts.add(leather, new T.CylinderGeometry(0.0235, 0.0235, 0.3, 8, 1), 0, -0.13, 0, 0, 0, 0, 1, 1, 1, true);    // grip wrap
    [0.025, -0.13, -0.285].forEach(function (y) { parts.add(steel, new T.CylinderGeometry(0.027, 0.027, 0.014, 8, 1), 0, y, 0); });
    parts.add(steel, new T.OctahedronGeometry(0.03, 0), 0, -0.4, 0, 0, 0, 0, 1, 1.4, 1);                          // pommel
    parts.add(rune, new T.TorusGeometry(0.028, 0.005, 4, 12), 0, 0.5, 0, Math.PI / 2, 0, 0);                        // rune collar
    var HY = 0.63;
    parts.add(red, new T.BoxGeometry(0.13, 0.13, 0.22), 0, HY, 0);                                                   // head block
    parts.add(steel, new T.BoxGeometry(0.142, 0.142, 0.022), 0, HY, 0.075);                                          // bands
    parts.add(steel, new T.BoxGeometry(0.142, 0.142, 0.022), 0, HY, -0.075);
    parts.add(steel, new T.CylinderGeometry(0.078, 0.07, 0.05, 8, 1), 0, HY, -0.135, Math.PI / 2, 0, Math.PI / 8);   // striking face (edge side)
    parts.add(steel, new T.CylinderGeometry(0.07, 0.078, 0.05, 8, 1), 0, HY, 0.135, Math.PI / 2, 0, Math.PI / 8);
    parts.add(dsteel, new T.CylinderGeometry(0.05, 0.05, 0.012, 8, 1), 0, HY, -0.165, Math.PI / 2, 0, Math.PI / 8);
    parts.add(dsteel, new T.CylinderGeometry(0.05, 0.05, 0.012, 8, 1), 0, HY, 0.165, Math.PI / 2, 0, Math.PI / 8);
    parts.add(steel, new T.ConeGeometry(0.022, 0.08, 6, 1), 0, HY + 0.105, 0);                                       // top spike
    // runes on both ±X faces
    [-1, 1].forEach(function (sx) {
      for (var gi = 0; gi < 3; gi++) RUNES[gi].forEach(function (s) {
        var S = 0.028, zc = (gi - 1) * 0.052, y1 = HY + s[0] * S, z1 = zc + s[1] * S * 0.7, y2 = HY + s[2] * S, z2 = zc + s[3] * S * 0.7;
        var len = Math.hypot(y2 - y1, z2 - z1);
        parts.add(rune, new T.BoxGeometry(0.004, len + 0.005, 0.0055), sx * 0.066, (y1 + y2) / 2, (z1 + z2) / 2, -Math.atan2(z2 - z1, y2 - y1), 0, 0);
      });
    });
    parts.build(g);
    w.handleBox = parts.handleBox; w.grip.position.set(0, -0.16, 0);
    w._fx = function (dt, st) { w.flicker = 0.85 + 0.15 * Math.sin(w.time * (st === 'charge' ? 14 : 3)); };
  }

  // ── ORACLE: purple wand-staff with a floating orb ─────────────────────────────────────────────────
  function buildOracle(K, w) {
    var T = K.THREE, P = K.P, g = w.group, parts = K.parts();
    var shaft = K.std(P.dark, { metal: 0.5, rough: 0.45 }), silver = K.std(P.steel, { metal: 0.9, rough: 0.3, flat: true }),
      wrap = K.std(P.wrap, { metal: 0.1, rough: 0.85 }), inlay = K.std(0x2a0c46, { emissive: P.glow, ei: 1.6 }),
      orbM = K.std(0xd9b8ff, { metal: 0, rough: 0.2, emissive: P.glow, ei: 2.2 });
    parts.add(shaft, new T.CylinderGeometry(0.014, 0.017, 1.3, 8, 1), 0, 0.1, 0);
    parts.add(wrap, new T.CylinderGeometry(0.019, 0.019, 0.2, 8, 1), 0, 0, 0, 0, 0, 0, 1, 1, 1, true);
    parts.add(silver, new T.CylinderGeometry(0.021, 0.021, 0.012, 8, 1), 0, 0.105, 0);
    parts.add(silver, new T.CylinderGeometry(0.021, 0.021, 0.012, 8, 1), 0, -0.105, 0);
    parts.add(silver, new T.ConeGeometry(0.017, 0.07, 8, 1), 0, -0.585, 0, Math.PI, 0, 0);                       // ferrule
    var hel = []; for (var i = 0; i <= 24; i++) { var a = i * 0.9, y = 0.13 + i * 0.024; hel.push(new T.Vector3(Math.cos(a) * 0.0165, y, Math.sin(a) * 0.0165)); }
    parts.add(inlay, new T.TubeGeometry(new T.CatmullRomCurve3(hel), 60, 0.0025, 3, false));                     // spiral inlay
    parts.add(silver, new T.TorusGeometry(0.024, 0.007, 5, 12), 0, 0.755, 0, Math.PI / 2, 0, 0);                  // head collar
    for (var p = 0; p < 3; p++) {                                                                                  // cradle prongs
      var ang = p * Math.PI * 2 / 3, cs = Math.cos(ang), sn = Math.sin(ang);
      var pts = [[0.02, 0.76], [0.07, 0.84], [0.075, 0.93], [0.035, 1.0]].map(function (q) { return new T.Vector3(cs * q[0], q[1], sn * q[0]); });
      parts.add(silver, new T.TubeGeometry(new T.CatmullRomCurve3(pts), 10, 0.0055, 4, false));
      parts.add(inlay, new T.OctahedronGeometry(0.009, 0), cs * 0.035, 1.005, sn * 0.035);
    }
    parts.build(g);
    var orbG = new T.Group(); orbG.position.set(0, 0.905, 0); g.add(orbG);
    orbG.add(new T.Mesh(new T.SphereGeometry(0.052, 16, 12), orbM));
    orbG.add(new T.Mesh(new T.SphereGeometry(0.08, 12, 8), K.glow(P.glow, 0.25)));
    var ring = new T.Mesh(new T.TorusGeometry(0.082, 0.0035, 4, 28), inlay); ring.rotation.x = 1.2; orbG.add(ring);
    w.handleBox = parts.handleBox; w.grip.position.set(0, 0, 0); w.orb = orbG;
    w._fx = function (dt, st) {
      orbG.position.y = 0.905 + Math.sin(w.time * 2.1) * 0.012;
      ring.rotation.z += dt * (st === 'charge' ? 6 : st === 'attack' ? 4 : 1);
      ring.rotation.x = 1.2 + Math.sin(w.time * 0.7) * 0.3;
      orbG.scale.setScalar(st === 'charge' ? 1 + Math.min(w.chargeT, 1.5) * 0.25 : 1);
    };
  }

  // ── TURTLE: electric spiked flail, instanced chain + verlet ─────────────────────────────────────────
  function buildTurtle(K, w) {
    var T = K.THREE, P = K.P, g = w.group, parts = K.parts();
    var steel = K.std(P.steel, { metal: 0.9, rough: 0.35, flat: true }), wrap = K.std(P.wrap, { metal: 0.1, rough: 0.85 }),
      green = K.std(0x0f3d1c, { emissive: P.glow, ei: 1.4 }), ballM = K.std(0x1f5a30, { metal: 0.4, rough: 0.35, emissive: P.glow, ei: 1.2, flat: true });
    parts.add(wrap, new T.CylinderGeometry(0.02, 0.023, 0.3, 8, 1), 0, 0, 0, 0, 0, 0, 1, 1, 1, true);
    parts.add(green, new T.BoxGeometry(0.004, 0.22, 0.004), 0.021, 0, 0);
    parts.add(green, new T.BoxGeometry(0.004, 0.22, 0.004), -0.021, 0, 0);
    parts.add(steel, new T.CylinderGeometry(0.027, 0.02, 0.03, 8, 1), 0, 0.16, 0);
    parts.add(steel, new T.TorusGeometry(0.012, 0.004, 4, 8), 0, 0.185, 0);
    parts.add(steel, new T.OctahedronGeometry(0.028, 0), 0, -0.168, 0, 0, 0, 0, 1, 0.9, 1);
    parts.build(g);
    var NL = 10, LINK = 0.045, ANCHOR_Y = 0.19;
    var lg = new T.TorusGeometry(0.019, 0.005, 4, 8); lg.scale(0.75, 1.35, 1);
    var links = new T.InstancedMesh(lg, steel, NL); links.frustumCulled = false; g.add(links);
    var ball = new T.Group(); g.add(ball);
    ball.add(new T.Mesh(new T.IcosahedronGeometry(0.068, 1), ballM));
    var sp = K.parts(), ico = new T.IcosahedronGeometry(1, 0), ip = ico.attributes.position, seen = [];
    for (var i = 0; i < ip.count; i++) {
      var v = new T.Vector3().fromBufferAttribute(ip, i), key = v.toArray().map(function (x) { return x.toFixed(3); }).join();
      if (seen.indexOf(key) >= 0) continue; seen.push(key);
      var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v), e = new T.Euler().setFromQuaternion(q);
      sp.add(steel, new T.ConeGeometry(0.017, 0.055, 4, 1), v.x * 0.085, v.y * 0.085, v.z * 0.085, e.x, e.y, e.z);
    }
    sp.build(ball);
    ball.add(new T.Mesh(new T.IcosahedronGeometry(0.1, 1), K.glow(P.glow, 0.22)));
    var A = K.arcs(ball, 5, 6, P.glow2); w.arcs = A;
    var afill = function (a) {
      var arr = a.arr, n = A.pts;
      for (var k = 0; k < n; k++) {
        var f = k / (n - 1), r = 0.075 + f * 0.07, th = a.a + (Math.random() - 0.5) * 0.35 + f * a.c, ph = a.b + (Math.random() - 0.5) * 0.35;
        arr[k * 3] = Math.cos(th) * Math.sin(ph) * r; arr[k * 3 + 1] = Math.cos(ph) * r; arr[k * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
      }
    };
    var aseed = function (a) { a.a = Math.random() * 6.283; a.b = Math.random() * 3.1416; a.c = (Math.random() - 0.5) * 1.2; };
    // verlet state (world space)
    var n = NL + 1, cur = new Float32Array(n * 3), prev = new Float32Array(n * 3), inited = false;
    var anchorL = new T.Vector3(0, ANCHOR_Y, 0), anchorW = new T.Vector3(), ax = new T.Vector3(), va = new T.Vector3(), vb = new T.Vector3(),
      vm = new T.Vector3(), vd = new T.Vector3(), up = new T.Vector3(0, 1, 0), q1 = new T.Quaternion(), twist = new T.Quaternion().setFromAxisAngle(up, Math.PI / 2),
      one = new T.Vector3(1, 1, 1), m4 = new T.Matrix4(), inv = new T.Matrix4();
    var chain = { points: cur, count: n, linkLength: LINK, length: LINK * NL, anchor: anchorW, scale: 1 };
    w.chain = chain; w.handleBox = parts.handleBox; w.grip.position.set(0, 0, 0);
    function reset(s) { for (var i = 0; i < n; i++) { cur[i * 3] = prev[i * 3] = anchorW.x; cur[i * 3 + 1] = prev[i * 3 + 1] = anchorW.y - i * LINK * s; cur[i * 3 + 2] = prev[i * 3 + 2] = anchorW.z; } }
    w._fx = function (dt, st) {
      g.updateWorldMatrix(true, false);
      var mw = g.matrixWorld, s = ax.setFromMatrixColumn(mw, 0).length() || 1;
      anchorW.copy(anchorL).applyMatrix4(mw); chain.scale = s;
      if (!inited) { reset(s); inited = true; }
      ax.setFromMatrixColumn(mw, 1).normalize();                         // handle axis (world)
      var L = LINK * s, h = dt / 2, grav = -9.8 * s, swirl = st === 'attack' ? 55 : st === 'charge' ? 80 : 0;
      for (var sub = 0; sub < 2; sub++) {
        for (var i = 1; i < n; i++) {
          var o = i * 3, x = cur[o], y = cur[o + 1], z = cur[o + 2];
          var fx = 0, fy = grav, fz = 0;
          if (swirl && i === n - 1) {                                        // tangential drive around the handle axis
            va.set(x - anchorW.x, y - anchorW.y, z - anchorW.z); vb.crossVectors(ax, va);
            var bl = vb.length(); if (bl > 1e-6) { fx += vb.x / bl * swirl * s; fy += vb.y / bl * swirl * s; fz += vb.z / bl * swirl * s; }
            if (st === 'charge') { vm.copy(va).addScaledVector(ax, -va.dot(ax)); var ml = vm.length(); if (ml > 1e-6) { fx += vm.x / ml * 30 * s; fy += vm.y / ml * 30 * s; fz += vm.z / ml * 30 * s; } }
          }
          var dmp = 0.985;
          cur[o] = x + (x - prev[o]) * dmp + fx * h * h; cur[o + 1] = y + (y - prev[o + 1]) * dmp + fy * h * h; cur[o + 2] = z + (z - prev[o + 2]) * dmp + fz * h * h;
          prev[o] = x; prev[o + 1] = y; prev[o + 2] = z;
        }
        cur[0] = prev[0] = anchorW.x; cur[1] = prev[1] = anchorW.y; cur[2] = prev[2] = anchorW.z;
        for (var it = 0; it < 6; it++) for (var j = 0; j < n - 1; j++) {
          var a3 = j * 3, b3 = a3 + 3, dx = cur[b3] - cur[a3], dy = cur[b3 + 1] - cur[a3 + 1], dz = cur[b3 + 2] - cur[a3 + 2];
          var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, diff = (d - L) / d;
          var wa = j === 0 ? 0 : (j + 1 === n - 1 ? 0.7 : 0.5), wb = j === 0 ? 1 : 1 - wa;
          cur[a3] += dx * diff * wa; cur[a3 + 1] += dy * diff * wa; cur[a3 + 2] += dz * diff * wa;
          cur[b3] -= dx * diff * wb; cur[b3 + 1] -= dy * diff * wb; cur[b3 + 2] -= dz * diff * wb;
        }
      }
      // hard bound: each point within i links of the anchor, finite; otherwise re-hang
      for (var k = 1; k < n; k++) {
        var ok = k * 3, ex = cur[ok] - anchorW.x, ey = cur[ok + 1] - anchorW.y, ez = cur[ok + 2] - anchorW.z, dd = Math.sqrt(ex * ex + ey * ey + ez * ez), mx = k * L;
        if (!(dd === dd) || !isFinite(dd)) { reset(s); break; }
        if (dd > mx) { var f = mx / dd; cur[ok] = anchorW.x + ex * f; cur[ok + 1] = anchorW.y + ey * f; cur[ok + 2] = anchorW.z + ez * f; }
      }
      // write instances (weapon space)
      inv.copy(mw).invert();
      for (var li = 0; li < NL; li++) {
        va.fromArray(cur, li * 3).applyMatrix4(inv); vb.fromArray(cur, li * 3 + 3).applyMatrix4(inv);
        vm.addVectors(va, vb).multiplyScalar(0.5); vd.subVectors(vb, va);
        if (vd.lengthSq() < 1e-12) vd.set(0, -1, 0); vd.normalize();
        q1.setFromUnitVectors(up, vd); if (li & 1) q1.multiply(twist);
        m4.compose(vm, q1, one); links.setMatrixAt(li, m4);
      }
      links.instanceMatrix.needsUpdate = true;
      ball.position.copy(vb).addScaledVector(vd, 0.06);
      ball.quaternion.copy(q1);
      runArcs(A, dt, st === 'attack' ? 26 : st === 'charge' ? 36 : st === 'drawn' ? 3 : 0.5, afill, aseed);
    };
  }

  // ── QUILL: quill-blade + ink trail ribbon ─────────────────────────────────────────────────────────
  function buildQuill(K, w) {
    var T = K.THREE, P = K.P, g = w.group, parts = K.parts();
    var ink = K.std(P.wrap, { metal: 0.5, rough: 0.35 }), gold = K.std(P.glow2, { metal: 0.95, rough: 0.25, flat: true }),
      vane = K.std(0x1a2350, { metal: 0.6, rough: 0.3, emissive: P.glow, ei: 0.8, flat: true }),
      rach = K.std(0xf6e2a8, { metal: 0.4, rough: 0.3, emissive: P.glow2, ei: 1.3 });
    parts.add(ink, new T.CylinderGeometry(0.016, 0.013, 0.22, 10, 1), 0, -0.06, 0, 0, 0, 0, 1, 1, 1, true);          // pen barrel
    [-0.16, -0.03, 0.045].forEach(function (y) { parts.add(gold, new T.CylinderGeometry(0.0175, 0.0175, 0.01, 10, 1), 0, y, 0); });
    parts.add(gold, new T.ConeGeometry(0.014, 0.04, 10, 1), 0, -0.19, 0, Math.PI, 0, 0);                              // pommel nib
    parts.add(gold, new T.BoxGeometry(0.018, 0.016, 0.1), 0, 0.06, 0);                                               // guard
    parts.add(gold, new T.ConeGeometry(0.01, 0.04, 6, 1), 0, 0.058, 0.066, Math.PI / 2 + 0.5, 0, 0);
    parts.add(gold, new T.ConeGeometry(0.01, 0.04, 6, 1), 0, 0.058, -0.066, -Math.PI / 2 - 0.5, 0, 0);
    // feather vane: leading edge (-Z) nearly straight, trailing edge (+Z) broad with barb notches
    var S = [[0, 0], [-0.017, 0.02], [-0.025, 0.15], [-0.027, 0.3], [-0.023, 0.45], [-0.013, 0.56], [0, 0.625],
      [0.02, 0.555], [0.029, 0.49], [0.02, 0.475], [0.037, 0.4], [0.041, 0.31], [0.029, 0.295], [0.042, 0.2], [0.038, 0.105], [0.027, 0.095], [0.029, 0.04], [0.012, 0.0]];
    var shape = new T.Shape(S.map(function (p) { return new T.Vector2(p[0], p[1]); }));
    var vg = new T.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }); vg.translate(0, 0, -0.003); vg.rotateY(-Math.PI / 2);
    parts.add(vane, vg, 0, 0.07, 0);
    parts.add(rach, new T.CylinderGeometry(0.0045, 0.002, 0.6, 5, 1), 0, 0.37, 0.002);
    parts.build(g);
    var shell = new T.Mesh(vg, K.glow(P.glow, 0.22)); shell.position.y = 0.07 - 0.62 * 0.02; shell.scale.set(2.2, 1.04, 1.18); g.add(shell);
    // ink trail: N samples of (tip, mid) in world space, shifted each frame; ribbon verts rewritten in weapon space
    var N = 20, tw = new Float32Array(N * 6), tpos = new Float32Array(N * 6), tcol = new Float32Array(N * 6), idx = [];
    var c1 = new T.Color(P.glow), c2 = new T.Color(0x6a2cff);
    for (var i = 0; i < N; i++) {
      var f = 1 - i / (N - 1);
      for (var s2 = 0; s2 < 2; s2++) { var cc = s2 ? c2 : c1, o = i * 6 + s2 * 3; tcol[o] = cc.r * f; tcol[o + 1] = cc.g * f; tcol[o + 2] = cc.b * f; }
      if (i < N - 1) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    var tg = new T.BufferGeometry(), tattr = new T.BufferAttribute(tpos, 3); tattr.setUsage(T.DynamicDrawUsage);
    tg.setAttribute('position', tattr); tg.setAttribute('color', new T.BufferAttribute(tcol, 3)); tg.setIndex(idx);
    var tmat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    var trail = new T.Mesh(tg, tmat); trail.frustumCulled = false; trail.visible = false; g.add(trail);
    var tipL = new T.Vector3(0, 0.69, 0), midL = new T.Vector3(0, 0.32, 0), v = new T.Vector3(), inv = new T.Matrix4(), inited = false, tGain = 0;
    w.trail = trail; w.handleBox = parts.handleBox; w.grip.position.set(0, -0.07, 0);
    w._fx = function (dt, st) {
      g.updateWorldMatrix(true, false);
      var mw = g.matrixWorld, emit = st === 'attack' || st === 'charge';
      tGain += ((emit ? 1 : 0) - tGain) * (1 - Math.exp(-dt * (emit ? 14 : 4)));
      tw.copyWithin(6, 0, (N - 1) * 6);
      v.copy(tipL).applyMatrix4(mw); tw[0] = v.x; tw[1] = v.y; tw[2] = v.z;
      v.copy(midL).applyMatrix4(mw); tw[3] = v.x; tw[4] = v.y; tw[5] = v.z;
      if (!inited || !emit) { for (var k = 6; k < N * 6; k++) tw[k] = tw[k % 6] * (emit ? 0 : 0.35) + tw[k] * (emit ? 1 : 0.65); inited = true; }
      trail.visible = tGain > 0.01; tmat.opacity = 0.85 * tGain;
      if (!trail.visible) return;
      inv.copy(mw).invert();
      for (var p = 0; p < N * 2; p++) { v.fromArray(tw, p * 3).applyMatrix4(inv); tpos[p * 3] = v.x; tpos[p * 3 + 1] = v.y; tpos[p * 3 + 2] = v.z; }
      tattr.needsUpdate = true;
    };
  }

  // ── SHADDAI: emerald S-sigil ring + palm glow (no weapon mesh) ─────────────────────────────────────
  function buildShaddai(K, w) {
    var T = K.THREE, P = K.P, g = w.group;
    var em = K.std(0x023b24, { emissive: P.glow, ei: 2.0 }), gold = K.std(P.glow2, { metal: 0.9, rough: 0.25, emissive: 0x6b5010, ei: 1.0, flat: true });
    var core = new T.Mesh(new T.SphereGeometry(0.028, 10, 8), em); g.add(core);
    var halo = new T.Mesh(new T.CircleGeometry(0.075, 20), K.glow(P.glow, 0.45)); halo.position.z = -0.03; g.add(halo);
    var ring = new T.Group(); ring.position.z = -0.13; g.add(ring);
    var parts = K.parts();
    parts.add(em, new T.TorusGeometry(0.11, 0.005, 4, 40));
    parts.add(gold, new T.TorusGeometry(0.088, 0.003, 3, 32));
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; parts.add(gold, new T.BoxGeometry(0.008, 0.024, 0.006), Math.cos(a) * 0.123, Math.sin(a) * 0.123, 0, 0, 0, a - Math.PI / 2); }
    var sp = [];                                                   // the S: two opposed half-circles
    for (var k = 0; k <= 16; k++) { var t = k / 16, an = Math.PI * 0.15 + t * Math.PI * 1.25; sp.push(new T.Vector3(Math.cos(an) * 0.034, 0.034 + Math.sin(an) * 0.034, 0)); }
    for (var m = 1; m <= 16; m++) { var t2 = m / 16, an2 = Math.PI * 0.4 - t2 * Math.PI * 1.25; sp.push(new T.Vector3(Math.cos(an2) * 0.034, -0.034 + Math.sin(an2) * 0.034, 0)); }
    parts.add(em, new T.TubeGeometry(new T.CatmullRomCurve3(sp), 40, 0.006, 4, false));
    parts.build(ring);
    var ringGlow = new T.Mesh(new T.RingGeometry(0.09, 0.13, 32), K.glow(P.glow, 0.2)); ring.add(ringGlow);
    w.handleBox = new T.Box3().setFromCenterAndSize(new T.Vector3(), new T.Vector3(0.056, 0.056, 0.056));
    w.grip.position.set(0, 0, 0); w.sigil = ring;
    w._fx = function (dt, st) {
      ring.rotation.z += dt * (st === 'attack' ? 9 : st === 'charge' ? 5 + w.chargeT * 3 : st === 'drawn' ? 1.2 : 0.4);
      var sc = st === 'charge' ? 1 + Math.min(w.chargeT, 1.5) * 0.35 + Math.sin(w.time * 18) * 0.03 : st === 'attack' ? 1.15 : 1;
      ring.scale.setScalar(sc); halo.scale.setScalar(0.8 + w.gain * 0.35);
      ring.visible = st !== 'idle' || w.gain > 0.4;
    };
  }

  var BUILDERS = { zerox: buildZerox, nexus: buildNexus, pikadon: buildPikadon, oracle: buildOracle, turtle: buildTurtle, quill: buildQuill, shaddai: buildShaddai };

  window.WEAPON_AGENTS = AGENTS.slice();
  window.buildAgentWeapon = function (opts) {
    var THREE = opts.THREE, agent = String(opts.agent || '').toLowerCase();
    if (!BUILDERS[agent]) throw new Error('buildAgentWeapon: unknown agent ' + opts.agent);
    var P = {}, base = PALETTES[agent], k; for (k in base) P[k] = base[k];
    if (opts.palette) for (k in opts.palette) P[k] = opts.palette[k];
    var K = kit(THREE, P);
    var group = new THREE.Group(); group.name = 'weapon_' + agent;
    var grip = new THREE.Object3D(); grip.name = 'grip'; group.add(grip);
    var sh = SHEATHE[agent];
    var w = {
      agent: agent, group: group, grip: grip, sheathe: { mode: sh.mode, pos: sh.pos, dir: sh.dir, face: sh.face },
      emissiveMats: K.emissive, glowMats: K.glows, frame: agent === 'nexus' ? 'arm' : 'blade',
      state: 'idle', gain: 0.35, time: 0, chargeT: 0, flicker: 1, drawn: true, handleBox: null
    };
    BUILDERS[agent](K, w);
    var em = K.emissive, gl = K.glows;
    w.update = function (dt, state) {
      if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
      if (state !== 'drawn' && state !== 'attack' && state !== 'charge') state = 'idle';
      w.state = state; w.time += dt; w.chargeT = state === 'charge' ? w.chargeT + dt : 0;
      var tgt = state === 'attack' ? 1.7 : state === 'charge' ? 1.1 + Math.min(w.chargeT, 1.5) * 0.8 : state === 'drawn' ? 1 : 0.35;
      w.gain += (tgt - w.gain) * (1 - Math.exp(-dt * 10));
      if (w._fx) w._fx(dt, state);
      var gn = w.gain * w.flicker;
      for (var i = 0; i < em.length; i++) em[i].emissive.copy(em[i].userData.emissiveBase).multiplyScalar(gn);
      for (var j = 0; j < gl.length; j++) gl[j].opacity = Math.min(1, gl[j].userData.opacityBase * gn);
    };
    w.update(0, 'idle');
    return w;
  };

  // ── rig attachment ──────────────────────────────────────────────────────────────────────────────
  function norm(n) { return String(n || '').toLowerCase().replace(/^mixamorig\d*[:_]?/, '').replace(/[^a-z0-9]/g, ''); }
  var HAND = {
    right: ['righthand', 'handr', 'rhand', 'handright', 'bip01rhand', 'bipedrhand', 'rwrist', 'wristr'],
    left: ['lefthand', 'handl', 'lhand', 'handleft', 'bip01lhand', 'bipedlhand', 'lwrist', 'wristl']
  };
  var SOCKET = { right: ['sockethandr', 'handrsocket', 'weaponr', 'socketr', 'righthandsocket', 'weaponsocketr', 'handslotr'], left: ['sockethandl', 'handlsocket', 'weaponl', 'socketl', 'lefthandsocket', 'weaponsocketl', 'handslotl'] };
  function allNodes(root) { var a = []; root.traverse(function (o) { a.push(o); }); return a; }
  function findHandBone(root, side, socket) {
    side = side === 'left' ? 'left' : 'right';
    var nodes = allNodes(root), i, nn;
    if (socket) for (i = 0; i < nodes.length; i++) if (nodes[i].name === socket || norm(nodes[i].name) === norm(socket)) return nodes[i];
    var bones = nodes.filter(function (o) { return o.isBone; }), pools = [bones, nodes];
    for (var p = 0; p < 2; p++) for (i = 0; i < pools[p].length; i++) { nn = norm(pools[p][i].name); if (HAND[side].indexOf(nn) >= 0) return pools[p][i]; }
    for (i = 0; i < nodes.length; i++) if (SOCKET[side].indexOf(norm(nodes[i].name)) >= 0) return nodes[i];
    var s1 = side === 'right' ? 'r' : 'l', long = side;
    for (i = 0; i < nodes.length; i++) {   // loose: contains 'hand' + a side marker, no fingers
      nn = norm(nodes[i].name);
      if (nn.indexOf('hand') < 0 || /thumb|index|middle|ring|pinky|finger|end|ik|pole/.test(nn)) continue;
      if (nn.indexOf(long) >= 0 || nn.charAt(nn.length - 1) === s1 || nn.charAt(0) === s1) return nodes[i];
    }
    return null;
  }
  function depth(o) { var d = 0; while (o.parent) { d++; o = o.parent; } return d; }
  function findChest(root) {
    var best = null, bd = -1;
    root.traverse(function (o) { var n = norm(o.name); if (/^(spine\d*|chest|upperchest|spine0\d)$/.test(n)) { var d = depth(o); if (d > bd) { bd = d; best = o; } } });
    return best;
  }
  window.findHandBone = findHandBone;

  window.attachWeapon = function (w, root, opts) {
    opts = opts || {};
    var V = w.grip.position.constructor,  // THREE classes reached through the weapon's own objects
      Q = w.group.quaternion.constructor, M4 = w.group.matrix.constructor, O3 = w.grip.constructor;
    var side = opts.hand === 'left' ? 'left' : 'right';
    var hand = findHandBone(root, side, opts.socket); if (!hand) return null;
    root.updateMatrixWorld(true);
    var all = allNodes(root), byName = function (list) { for (var i = 0; i < all.length; i++) if (list.indexOf(norm(all[i].name)) >= 0) return all[i]; return null; };
    var p = function (o) { return new V().setFromMatrixPosition(o.matrixWorld); };
    var fore = (hand.parent && hand.parent.isBone) ? hand.parent : byName(side === 'right' ? ['rightforearm', 'lowerarmr', 'forearmr'] : ['leftforearm', 'lowerarml', 'forearml']);
    var hp = p(hand), A = fore ? hp.clone().sub(p(fore)) : new V(side === 'right' ? -1 : 1, 0, 0);
    if (A.lengthSq() < 1e-10) A.set(side === 'right' ? -1 : 1, 0, 0); A.normalize();
    var U = new V(0, 1, 0), F = opts.forward ? opts.forward.clone() : null;
    if (!F) {
      var lf = byName(['leftfoot', 'footl']), lt = byName(['lefttoebase', 'balll', 'toel', 'lefttoe']), rf = byName(['rightfoot', 'footr']), rt = byName(['righttoebase', 'ballr', 'toer', 'righttoe']);
      F = new V(); if (lf && lt) F.add(p(lt).sub(p(lf))); if (rf && rt) F.add(p(rt).sub(p(rf)));
      if (F.lengthSq() < 1e-10) F.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new Q()));
    }
    F.y = 0; if (F.lengthSq() < 1e-10) F.set(0, 0, 1); F.normalize();
    var R = new V().crossVectors(F, U).normalize();                       // character's right
    var s = opts.unitsPerMetre != null ? opts.unitsPerMetre : root.getWorldScale(new V()).x;
    function basis(Y, Zhint) {
      Y = Y.clone().normalize(); var Z = Zhint.clone().addScaledVector(Y, -Zhint.dot(Y));
      if (Z.lengthSq() < 1e-8) Z = new V().crossVectors(Y, R); Z.normalize();
      var X = new V().crossVectors(Y, Z).normalize(); Z.crossVectors(X, Y).normalize();
      return new Q().setFromRotationMatrix(new M4().makeBasis(X, Y, Z));
    }
    function mountOn(parent, posW, quatW) {
      var m = new O3(); m.name = 'weaponMount_' + w.agent;
      var wm = new M4().compose(posW, quatW, new V(s, s, s)), lm = new M4().copy(parent.matrixWorld).invert().multiply(wm);
      lm.decompose(m.position, m.quaternion, m.scale); parent.add(m); m.updateMatrixWorld(true); return m;
    }
    // hand mount: fist centre ≈ 8.5 cm past the wrist, 2 cm under the back of the hand
    var Yh = w.frame === 'arm' ? A : F.clone().addScaledVector(A, -F.dot(A));
    if (Yh.lengthSq() < 1e-8) Yh = F.clone();
    var qh = basis(Yh, U), zAx = new V(0, 0, 1).applyQuaternion(qh);
    var gripW = hp.clone().addScaledVector(A, 0.085 * s).addScaledVector(zAx, -0.02 * s);
    var handMount = mountOn(hand, gripW, qh);
    var backMount = null, chest = null;
    if (w.sheathe.mode === 'back') {
      chest = findChest(root) || root;
      var toW = function (a) { return new V().addScaledVector(R, a[0]).addScaledVector(U, a[1]).addScaledVector(F, a[2]); };
      backMount = mountOn(chest, p(chest).add(toW(w.sheathe.pos).multiplyScalar(s)), basis(toW(w.sheathe.dir), toW(w.sheathe.face)));
    }
    w.group.position.copy(w.grip.position).negate(); w.group.quaternion.identity(); w.group.scale.set(1, 1, 1);
    w._att = { hand: hand, forearm: fore, chest: chest, handMount: handMount, backMount: backMount, forward: F, unitsPerMetre: s };
    if (opts.sheathed) window.sheatheWeapon(w); else window.drawWeapon(w);
    return w._att;
  };
  window.drawWeapon = function (w) {
    if (!w._att) return false;
    w._att.handMount.add(w.group); w.group.visible = true; w.drawn = true; return true;
  };
  window.sheatheWeapon = function (w) {
    if (!w._att) return false;
    var m = w.sheathe.mode;
    if (m === 'back' && w._att.backMount) { w._att.backMount.add(w.group); w.group.visible = true; }
    else if (m === 'hide') w.group.visible = false;
    w.drawn = false; return true;
  };
})();
