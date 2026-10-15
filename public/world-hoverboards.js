/* world-hoverboards.js — 9 CODE-BUILT HOVERBOARDS + thruster FX + FLY/TRICK core (2026-09-28).
 *
 * Owner: "the agents RIDE things, and hoverboards FLY and do TRICKS", everything in code, $0 fal.
 * Styles are INSPIRED by the owner's WildStar hoverboard sheet (thruster pods, ring fans, fins,
 * graffiti colour schemes) — not copies. Every board: < 2.5k tris, emissive thrusters + trim, a
 * recolourable palette, an additive underglow disc and per-nozzle flame cones.
 *
 * Three pieces, all classic-script globals (no imports, no build step):
 *
 *   window.HoverboardKit
 *     .STYLES                          → [{id, name, palette}] ×10 (ids below)
 *     .build(THREE, id, palette?)      → THREE.Group in METRES (+Z = nose, deck top at userData.deckTopM)
 *         userData: { style, deckTopM, lengthM, tris, nozzles:[Object3D], flames:[Mesh], glowMats:[Mat],
 *                     underglow: Mesh, stand: Object3D (rider socket on the deck), setPalette(p), setThrust(k), dispose() }
 *     .countTris(obj)                  → triangle count (used by the tests / budget)
 *
 *   window.buildHoverboardFX({THREE, scene, max})   pooled particle trail (ONE THREE.Points, ring buffer)
 *     → { emit(x,y,z, vx,vy,vz, color, life), emitFromBoard(board, dt, thrust, U), update(dt), points, dispose() }
 *
 *   window.HoverboardTricks.create(tune?)            pure trick state machine (no THREE)
 *     → { reset(), step(dt, inp, airborne), land(tiltRad) → clean, onTrick(fn) → off(), angles, state }
 *     inp: { spinL, spinR, flipF, flipB, grab, varialL, varialR }   (booleans; host maps keys)
 *     Events: onTrick({name, kind, deg, score, clean, combo, total}) once per trick on landing, then a
 *     final {name:'combo'|'bail', ...}. Feed these to the SKATE hidden-RPS pack (Shaddai-Arcade
 *     hall/packs/skate.js): kind ∈ spin|flip|varial|grab.
 *
 * Units: kit meshes are metres; world-hoverboard.js scales them by U = 7/1.8.
 * Per-frame paths (setThrust, FX.update/emit, tricks.step) allocate nothing.
 */
(function (root) {
  'use strict';

  // ── STYLES (palettes: deck, trim, accent, glow, metal) ─────────────────────────────────
  var STYLES = [
    { id: 'obsidian', name: 'Obsidian Gold', palette: { deck: 0x0d0f12, trim: 0xf2c21a, accent: 0xf2c21a, glow: 0x19e8c0, metal: 0x1a1d22 } },
    { id: 'sunburst', name: 'Sunburst Graffiti', palette: { deck: 0x19c8c8, trim: 0xffe23a, accent: 0xff2fa0, glow: 0xfff05a, metal: 0x2a3440 } },
    { id: 'hauler',   name: 'Brass Hauler',      palette: { deck: 0x7a5a32, trim: 0xb9c2cc, accent: 0x3a2a1a, glow: 0x3fffe0, metal: 0x4a5058 } },
    { id: 'redline',  name: 'Redline H-Frame',   palette: { deck: 0xf2f2f2, trim: 0xe0202a, accent: 0x1a1a1e, glow: 0x3aa0ff, metal: 0x9aa2ac } },
    { id: 'batwing',  name: 'Night Batwing',     palette: { deck: 0x121016, trim: 0x7a2bd6, accent: 0xff3ea5, glow: 0xff4fd0, metal: 0x2a2436 } },
    { id: 'checker',  name: 'Checker Rail',      palette: { deck: 0x8fe03a, trim: 0x16181a, accent: 0xe8ff5a, glow: 0xd8ff3a, metal: 0x5a6068 } },
    { id: 'ringfan',  name: 'Quad Ring-Fan',     palette: { deck: 0xff9a1a, trim: 0x2fb8e0, accent: 0xf4f4f4, glow: 0x5ff0ff, metal: 0x5a6470 } },
    { id: 'bluejet',  name: 'Blue Twin-Jet',     palette: { deck: 0x2a5fe0, trim: 0xff7a1a, accent: 0xf2f2f2, glow: 0x39d6ff, metal: 0x3a4250 } },
    { id: 'racer',    name: 'Circuit Racer',     palette: { deck: 0xf4f4f4, trim: 0xe8261e, accent: 0xffc21a, glow: 0x5fd0ff, metal: 0x16161a } },
    { id: 'skullpunk',name: 'Skull Punk',        palette: { deck: 0x5b2fb0, trim: 0xff3ec0, accent: 0x1c1030, glow: 0xff5040, metal: 0x3a3450 } },
  ];
  var BY_ID = {}; STYLES.forEach(function (s) { BY_ID[s.id] = s; });

  function countTris(obj) {
    var n = 0;
    obj.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var g = o.geometry, c = g.index ? g.index.count : g.attributes.position.count;
      n += (c / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    return Math.round(n);
  }

  // ── builder: tiny primitive helpers in METRES; every mesh is registered for dispose ──
  function makeBuilder(THREE, group, mats) {
    var geos = [];
    function add(geo, mat, x, y, z, rx, ry, rz) {
      geos.push(geo);
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = mat !== mats.glow && mat !== mats.flame && mat !== mats.under;
      group.add(m);
      return m;
    }
    var B = {
      geos: geos,
      box: function (w, h, d, x, y, z, mat, rx, ry, rz) { return add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); },
      // horizontal slab from an outline [x0,z0, x1,z1 …] (nose = +z), top at `top`, thickness t
      slab: function (pts, t, top, mat, mirror) {
        var sh = new THREE.Shape(), i, P = pts.slice();
        if (mirror) {                                  // pts describe the RIGHT half (x ≥ 0) nose→tail; mirror to a closed outline
          for (i = pts.length - 2; i >= 0; i -= 2) if (pts[i] > 1e-6) P.push(-pts[i], pts[i + 1]);
        }
        sh.moveTo(P[0], P[1]);
        for (i = 2; i < P.length; i += 2) sh.lineTo(P[i], P[i + 1]);
        var g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 2 });
        g.rotateX(Math.PI / 2);                        // shape y → +z (nose), extrude depth → −y
        g.translate(0, top, 0);
        g.computeVertexNormals();
        return add(g, mat);
      },
      // vertical fin from an outline [z0,y0, z1,y1 …] at lateral offset x, thickness t
      fin: function (pts, t, x, mat, splay) {
        var sh = new THREE.Shape(); sh.moveTo(pts[0], pts[1]);
        for (var i = 2; i < pts.length; i += 2) sh.lineTo(pts[i], pts[i + 1]);
        var g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 2 });
        g.translate(0, 0, -t / 2);
        g.rotateY(-Math.PI / 2);                       // shape x → +z, y stays up, depth → x
        g.computeVertexNormals();
        return add(g, mat, x, 0, 0, 0, 0, splay || 0);
      },
      cyl: function (rt, rb, h, seg, x, y, z, mat, axis) {
        var g = new THREE.CylinderGeometry(rt, rb, h, seg || 10, 1);
        if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
        return add(g, mat, x, y, z);
      },
      torus: function (R, r, x, y, z, mat, axis, rs, ts) {
        var g = new THREE.TorusGeometry(R, r, rs || 6, ts || 18);
        if (axis === 'y') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateY(Math.PI / 2);
        return add(g, mat, x, y, z);
      },
      cone: function (r, h, seg, x, y, z, mat, dir) {        // tip points along dir (+z default)
        var g = new THREE.ConeGeometry(r, h, seg || 8, 1);
        if (dir === '-z') g.rotateX(-Math.PI / 2); else if (dir === '-y') g.rotateX(Math.PI); else if (dir === 'y') { /* default +y */ } else g.rotateX(Math.PI / 2);
        return add(g, mat, x, y, z);
      },
      sphere: function (r, x, y, z, mat, sx, sy, sz) {
        var m = add(new THREE.SphereGeometry(r, 10, 6), mat, x, y, z);
        m.scale.set(sx || 1, sy || 1, sz || 1); return m;
      },
    };
    return B;
  }

  // ── the 9 designs (metres; nose +Z; deck top ≈ 0.12 m) ──────────────────────────────────
  // Each registers nozzles with N(x, y, z, r, dir): dir 'back' = exhaust −Z, 'down' = hover pad −Y.
  var DESIGNS = {
    // owner ref (veh-hoverboard-v2): long matte-black deck, teal glowing edge, gold corner wedges, two gold hex emblems, centre dot grid
    obsidian: function (B, M, N) {
      var OUT = [0, 0.97, 0.12, 0.95, 0.2, 0.84, 0.225, 0.62, 0.225, -0.62, 0.2, -0.84, 0.12, -0.95, 0, -0.97];
      B.slab(OUT.map(function (v, i) { return i % 2 ? v * 1.0 : v * 1.05; }), 0.04, 0.1, M.glow, true);       // teal rim glow (a hair wider, just under the deck)
      B.slab(OUT, 0.07, 0.12, M.deck, true);
      [1, -1].forEach(function (zs) { B.slab([0.14, zs * 0.9, 0.205, zs * 0.8, 0.205, zs * 0.7, 0.14, zs * 0.76], 0.012, 0.132, M.trim, true); });   // gold corner wedges
      [-1, 1].forEach(function (zs) { B.cyl(0.085, 0.085, 0.012, 6, 0, 0.126, zs * 0.5, M.trim); B.cyl(0.06, 0.06, 0.014, 6, 0, 0.127, zs * 0.5, M.deck); B.cyl(0.028, 0.028, 0.016, 3, 0, 0.128, zs * 0.5, M.trim); });   // hex emblems
      [-1, 1].forEach(function (zs) { B.box(0.012, 0.012, 0.22, 0, 0.128, zs * 0.27, M.trim); });             // centre rules
      for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++) B.box(0.014, 0.012, 0.014, (j - 0.5) * 0.06, 0.128, (i - 1) * 0.05, M.trim);   // dot grid
      B.box(0.2, 0.02, 0.05, 0, 0.1, 0.97, M.glow);                                                      // nose light
      [-1, 1].forEach(function (s) { N(s * 0.1, 0.03, -0.9, 0.06, 'back'); });
      [[-1, 0.55], [1, 0.55], [-1, -0.55], [1, -0.55]].forEach(function (p) { N(p[0] * 0.12, 0.03, p[1], 0.07, 'down'); });
    },
    // teal/yellow/magenta graffiti arrow, twin side pods with spike nose cones, rear ring intakes
    sunburst: function (B, M, N) {
      B.slab([0, 0.92, 0.14, 0.78, 0.26, 0.35, 0.28, -0.35, 0.2, -0.72, 0.08, -0.82, 0, -0.78], 0.07, 0.12, M.deck, true);
      B.slab([0, 0.75, 0.05, 0.6, 0.05, -0.55, 0, -0.62], 0.012, 0.132, M.trim, true);           // sunburst stripe
      B.slab([0.1, 0.45, 0.2, 0.3, 0.2, 0.2, 0.1, 0.3], 0.012, 0.132, M.accent, false);            // graffiti splashes
      B.slab([-0.1, 0.1, -0.21, -0.05, -0.2, -0.2, -0.1, -0.05], 0.012, 0.132, M.accent, false);
      [-1, 1].forEach(function (s) {
        B.cyl(0.075, 0.09, 0.62, 10, s * 0.33, 0.06, -0.05, M.metal, 'z');
        B.cone(0.075, 0.2, 8, s * 0.33, 0.06, 0.36, M.trim);
        B.torus(0.1, 0.022, s * 0.33, 0.06, -0.38, M.accent, 'z');
        B.fin([0.1, 0, -0.05, 0, -0.22, 0.22, -0.12, 0.22], 0.02, s * 0.2, M.trim, s * 0.35);
        N(s * 0.33, 0.06, -0.4, 0.07, 'back');
        N(s * 0.14, 0.04, 0.35, 0.06, 'down');
      });
      B.box(0.18, 0.03, 0.08, 0, 0.11, 0.9, M.glow);                                             // nose light
      N(0, 0.03, -0.5, 0.08, 'down');
    },
    // brown/steel industrial: long deck, four armour pods on struts, cyan status lights
    hauler: function (B, M, N) {
      B.slab([0, 0.9, 0.16, 0.86, 0.2, 0.6, 0.2, -0.7, 0.14, -0.86, 0, -0.88], 0.08, 0.12, M.metal, true);
      B.slab([0, 0.8, 0.13, 0.76, 0.14, -0.74, 0, -0.78], 0.015, 0.135, M.deck, true);
      [-1, 1].forEach(function (s) {
        [0.48, -0.42].forEach(function (z) {
          B.box(0.14, 0.2, 0.42, s * 0.36, 0.08, z, M.deck, 0, 0, s * 0.12);
          B.box(0.12, 0.04, 0.05, s * 0.25, 0.08, z, M.metal);                                     // strut
          B.box(0.02, 0.06, 0.3, s * 0.435, 0.1, z, M.glow);                                      // status strip
          N(s * 0.36, -0.03, z, 0.06, 'down');
        });
        N(s * 0.1, 0.06, -0.9, 0.05, 'back');
      });
      B.box(0.2, 0.05, 0.14, 0, 0.14, 0.72, M.accent);
      B.box(0.12, 0.02, 0.05, 0, 0.17, 0.72, M.glow);
    },
    // red/white H-frame: slim spine board, four chunky pods on outriggers, blue core
    redline: function (B, M, N) {
      B.slab([0, 0.85, 0.12, 0.8, 0.16, 0.2, 0.16, -0.6, 0.1, -0.8, 0, -0.82], 0.06, 0.12, M.deck, true);
      B.slab([0, 0.55, 0.035, 0.5, 0.035, -0.5, 0, -0.55], 0.01, 0.13, M.accent, true);
      B.box(0.9, 0.05, 0.1, 0, 0.07, 0.42, M.metal);
      B.box(0.9, 0.05, 0.1, 0, 0.07, -0.42, M.metal);
      [-1, 1].forEach(function (s) {
        [0.42, -0.42].forEach(function (z) {
          B.box(0.16, 0.18, 0.3, s * 0.48, 0.08, z, M.trim);
          B.box(0.17, 0.04, 0.2, s * 0.48, 0.19, z, M.deck);
          N(s * 0.48, 0.08, z - 0.16, 0.06, 'back');
          N(s * 0.48, -0.02, z, 0.06, 'down');
        });
      });
      B.box(0.14, 0.04, 0.18, 0, 0.14, 0.05, M.glow);
    },
    // black/purple batwing: scalloped wing with spiked fins, pink glow panels
    batwing: function (B, M, N) {
      B.slab([0, 0.85, 0.1, 0.62, 0.34, 0.52, 0.5, 0.72, 0.42, 0.38, 0.62, 0.12, 0.4, 0.02, 0.36, -0.3, 0.52, -0.62,
              0.26, -0.5, 0.12, -0.82, 0, -0.7], 0.05, 0.12, M.deck, true);
      B.slab([0.06, 0.3, 0.22, 0.2, 0.2, 0.05, 0.08, 0.12], 0.01, 0.128, M.accent, false);
      B.slab([-0.06, 0.3, -0.08, 0.12, -0.2, 0.05, -0.22, 0.2], 0.01, 0.128, M.accent, false);
      B.slab([0.05, -0.2, 0.2, -0.28, 0.16, -0.45, 0.06, -0.38], 0.01, 0.128, M.accent, false);
      B.slab([-0.05, -0.2, -0.06, -0.38, -0.16, -0.45, -0.2, -0.28], 0.01, 0.128, M.accent, false);
      [-1, 1].forEach(function (s) {
        B.fin([0.1, 0, -0.1, 0, -0.26, 0.26, -0.02, 0.1], 0.02, s * 0.3, M.trim, s * 0.5);
        B.fin([0.72, 0, 0.56, 0, 0.62, 0.18], 0.018, s * 0.48, M.trim, s * 0.6);
        N(s * 0.22, 0.05, -0.6, 0.05, 'back');
        N(s * 0.3, 0.02, 0.1, 0.07, 'down');
      });
      N(0, 0.02, -0.4, 0.06, 'down');
    },
    // lime/black twin-rail frame with a checker deck and an open front fork
    checker: function (B, M, N) {
      [-1, 1].forEach(function (s) {
        B.box(0.08, 0.1, 1.7, s * 0.25, 0.07, 0, M.trim);
        B.box(0.1, 0.02, 1.5, s * 0.25, 0.13, -0.05, M.deck);
        B.box(0.2, 0.2, 0.3, s * 0.3, 0.1, 0.55, M.deck);                                           // front fork pods
        B.box(0.03, 0.14, 0.24, s * 0.41, 0.1, 0.55, M.glow);
        N(s * 0.3, 0.1, 0.39, 0.06, 'back');
        N(s * 0.25, 0.0, -0.55, 0.06, 'down');
      });
      for (var r = 0; r < 7; r++) for (var c = 0; c < 2; c++) {
        B.box(0.2, 0.03, 0.16, (c - 0.5) * 0.2, 0.1, -0.55 + r * 0.16, ((r + c) & 1) ? M.metal : M.accent);
      }
      B.box(0.4, 0.06, 0.18, 0, 0.08, -0.82, M.trim);
      B.box(0.3, 0.03, 0.05, 0, 0.1, -0.92, M.glow);
      N(0, 0.06, -0.9, 0.06, 'back');
    },
    // orange deck + four cyan ring fans on arms, winglet blades
    ringfan: function (B, M, N) {
      B.slab([0, 0.8, 0.12, 0.72, 0.16, 0.3, 0.16, -0.5, 0.1, -0.72, 0, -0.78], 0.06, 0.12, M.deck, true);
      B.slab([0, 0.62, 0.05, 0.3, 0.02, -0.5, 0, -0.55], 0.01, 0.13, M.accent, true);
      [-1, 1].forEach(function (s) {
        [0.42, -0.4].forEach(function (z) {
          B.box(0.26, 0.04, 0.06, s * 0.27, 0.07, z, M.metal);
          B.torus(0.17, 0.035, s * 0.48, 0.07, z, M.trim, 'y', 6, 20);
          B.torus(0.13, 0.012, s * 0.48, 0.07, z, M.glow, 'y', 4, 16);
          B.box(0.3, 0.012, 0.04, s * 0.48, 0.07, z, M.metal, 0, 0.6);                                // fan blade
          B.fin([0.08, 0, -0.08, 0, 0, 0.14], 0.015, s * 0.68, M.accent, s * 1.2);
          N(s * 0.48, 0.05, z, 0.1, 'down');
        });
      });
      N(0, 0.06, -0.78, 0.05, 'back');
    },
    // blue/orange twin-jet: wide deck, two big rear intake nacelles, blade nose
    bluejet: function (B, M, N) {
      B.slab([0, 0.8, 0.2, 0.7, 0.26, 0.3, 0.24, -0.4, 0.14, -0.62, 0, -0.64], 0.07, 0.12, M.deck, true);
      B.slab([0, 0.5, 0.1, 0.45, 0.1, -0.4, 0, -0.45], 0.012, 0.132, M.accent, true);
      [-1, 1].forEach(function (s) {
        B.box(0.22, 0.18, 0.62, s * 0.34, 0.08, -0.45, M.deck);
        B.box(0.24, 0.05, 0.64, s * 0.34, 0.18, -0.45, M.trim);
        B.box(0.16, 0.12, 0.02, s * 0.34, 0.08, -0.77, M.glow);                                     // intake glow
        B.cone(0.04, 0.22, 6, s * 0.22, 0.1, 0.84, M.metal);                                        // blade prongs
        B.cone(0.035, 0.18, 6, s * 0.34, 0.08, 0.6, M.metal);
        N(s * 0.34, 0.08, -0.78, 0.08, 'back');
        N(s * 0.2, 0.02, 0.3, 0.06, 'down');
      });
      B.box(0.12, 0.02, 0.2, 0, 0.14, 0.2, M.glow);
    },
    // white/red/yellow F1 racer: pointed nose, rear wing, yellow ring hubs
    racer: function (B, M, N) {
      B.slab([0, 0.95, 0.07, 0.8, 0.18, 0.3, 0.22, -0.35, 0.18, -0.72, 0, -0.76], 0.06, 0.12, M.deck, true);
      B.slab([0, 0.9, 0.05, 0.75, 0.13, 0.28, 0.02, 0.1], 0.012, 0.132, M.trim, false);            // red livery flash
      B.slab([0, 0.9, -0.05, 0.75, -0.02, 0.1, -0.12, 0.25], 0.012, 0.132, M.metal, false);
      B.cyl(0.07, 0.07, 0.01, 12, 0, 0.133, -0.15, M.accent);                                      // roundel
      B.box(0.62, 0.025, 0.12, 0, 0.3, -0.7, M.trim);                                              // rear wing
      [-1, 1].forEach(function (s) {
        B.box(0.02, 0.2, 0.1, s * 0.3, 0.2, -0.7, M.metal);
        B.torus(0.1, 0.035, s * 0.28, 0.06, 0.45, M.accent, 'x', 6, 16);
        B.torus(0.1, 0.035, s * 0.28, 0.06, -0.45, M.accent, 'x', 6, 16);
        N(s * 0.28, 0.02, 0.45, 0.07, 'down');
        N(s * 0.28, 0.02, -0.45, 0.07, 'down');
        N(s * 0.12, 0.06, -0.77, 0.045, 'back');
      });
    },
    // purple/pink punk: bulky deck, side cannon pods, skull emblem, red exhausts
    skullpunk: function (B, M, N) {
      B.slab([0, 0.82, 0.2, 0.76, 0.26, 0.4, 0.26, -0.5, 0.2, -0.72, 0, -0.76], 0.08, 0.12, M.deck, true);
      B.slab([0, 0.7, 0.16, 0.64, 0.18, -0.58, 0, -0.62], 0.012, 0.132, M.accent, true);
      B.sphere(0.09, 0, 0.15, 0.0, M.trim, 1, 0.45, 1.1);                                           // skull emblem
      B.box(0.03, 0.02, 0.03, -0.035, 0.19, 0.02, M.glow); B.box(0.03, 0.02, 0.03, 0.035, 0.19, 0.02, M.glow);
      [-1, 1].forEach(function (s) {
        B.cyl(0.07, 0.07, 0.7, 8, s * 0.36, 0.1, 0.0, M.trim, 'z');
        B.cyl(0.03, 0.03, 0.3, 6, s * 0.36, 0.1, 0.48, M.metal, 'z');                               // cannon barrel
        B.box(0.16, 0.14, 0.34, s * 0.22, 0.06, -0.6, M.metal);
        B.box(0.12, 0.08, 0.02, s * 0.22, 0.06, -0.78, M.glow);
        B.fin([0.3, 0, 0.0, 0, 0.14, 0.16], 0.02, s * 0.42, M.accent, s * 0.4);
        N(s * 0.22, 0.06, -0.79, 0.06, 'back');
        N(s * 0.36, 0.02, 0.1, 0.06, 'down');
      });
    },
  };

  var BOARDGLB = {}, boardsP = null;
  function loadGlb(THREE, GLTFLoader, url) {
    if (boardsP) return boardsP;
    boardsP = new Promise(function (res) { new GLTFLoader().load(url || '/assets/kits/shaddai_hoverboards_v01.glb', function (gl) {
      var n = 0, list = []; gl.scene.traverse(function (c) { if (/^board_[a-z]+$/.test(c.name)) list.push(c); });
      list.forEach(function (c) { if (c.parent) c.parent.remove(c); c.position.set(0, 0, 0); BOARDGLB[c.name.slice(6)] = c; n++; }); res(n);
    }, undefined, function () { console.warn('[hoverboards] Blender board kit missing'); res(0); }); });
    return boardsP;
  }
  function build(THREE, id, palette) {
    var st = BY_ID[id] || STYLES[0];
    var pal = {}, k;
    for (k in st.palette) pal[k] = st.palette[k];
    if (palette) for (k in palette) pal[k] = palette[k];
    var mats = {
      deck: new THREE.MeshStandardMaterial({ color: pal.deck, roughness: 0.45, metalness: 0.35 }),
      trim: new THREE.MeshStandardMaterial({ color: pal.trim, roughness: 0.4, metalness: 0.4, emissive: pal.trim, emissiveIntensity: 0.12 }),
      accent: new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.5, metalness: 0.2 }),
      metal: new THREE.MeshStandardMaterial({ color: pal.metal, roughness: 0.3, metalness: 0.85 }),
      glow: new THREE.MeshStandardMaterial({ color: pal.glow, emissive: pal.glow, emissiveIntensity: 2.2, roughness: 0.3, toneMapped: false }),
      flame: new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      under: new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    };
    var g = new THREE.Group(); g.name = 'hoverboard-' + st.id;
    var B = makeBuilder(THREE, g, mats);
    var nozzles = [], flames = [];
    function N(x, y, z, r, dir) {
      var n = new THREE.Object3D(); n.name = 'nozzle'; n.position.set(x, y, z);
      n.userData.dir = dir; n.userData.r = r;
      g.add(n); nozzles.push(n);
      // glowing ring at the nozzle mouth + an additive flame cone (scaled by setThrust)
      var ring = dir === 'down' ? B.cyl(r, r, 0.012, 10, x, y - 0.006, z, mats.glow) : B.cyl(r, r, 0.012, 10, x, y, z - 0.006, mats.glow, 'z');
      ring.castShadow = false;
      var f = dir === 'down' ? B.cone(r * 0.9, 1, 8, x, y - 0.012, z, mats.flame, '-y') : B.cone(r * 0.9, 1, 8, x, y, z - 0.012, mats.flame, '-z');
      // put the cone's base at the nozzle: shift so the flame grows AWAY from the board
      if (dir === 'down') f.geometry.translate(0, -0.5, 0); else f.geometry.translate(0, 0, -0.5);
      f.userData.len = dir === 'down' ? 0.12 : 0.3;
      f.userData.dir = dir;
      f.renderOrder = 3; f.frustumCulled = false;
      if (dir === 'down') f.scale.set(1, 0.01, 1); else f.scale.set(1, 1, 0.01);   // collapsed until setThrust (keeps the bounds honest)
      flames.push(f);
    }
    DESIGNS[st.id](B, mats, N);
    // BLENDER K22 (2026-10-15): if HoverboardKit.loadGlb() has landed, the bevelled Blender board replaces the design meshes (same
    // layout + nozzles); its parts are re-skinned by slot (hb_<id>_<slot>) so palettes / dyes keep working. ?boardglb=0 = code boards.
    var kitBoard = BOARDGLB[st.id] && !/[?&]boardglb=0/.test(root.location ? root.location.search : '') ? BOARDGLB[st.id] : null;
    if (kitBoard) {
      var keep = {}; nozzles.forEach(function (n) { keep[n.uuid] = 1; }); flames.forEach(function (f) { keep[f.uuid] = 1; });
      var ringsN = g.children.filter(function (c) { return c.isMesh && c.material === mats.glow && c.geometry && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters.height <= 0.0125; });
      ringsN.forEach(function (c) { keep[c.uuid] = 1; });
      g.children.forEach(function (c) { if (c.isMesh && !keep[c.uuid]) c.visible = false; });
      var kb = kitBoard.clone(true); kb.name = 'blenderBoard';
      kb.traverse(function (o) { if (!o.isMesh) return; var sl = /_([a-z]+)$/.exec(o.material && o.material.name || ''); if (sl && mats[sl[1]]) o.material = mats[sl[1]]; o.castShadow = sl ? sl[1] !== 'glow' : true; });
      g.add(kb);
    }
    // underglow: an additive oval under the whole board ("reads" as glow at zero lighting cost)
    var box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    var ug = B.cyl(0.5, 0.5, 0.001, 20, c.x, box.min.y - 0.03, c.z, mats.under);
    ug.scale.set(sz.x * 0.95, 1, sz.z * 0.95); ug.renderOrder = 2; ug.castShadow = false;
    var deckTopM = 0.12;
    var stand = new THREE.Object3D(); stand.name = 'stand'; stand.position.set(0, deckTopM, 0); g.add(stand);
    var glowMats = [mats.glow, mats.flame, mats.under, mats.trim];
    var ud = g.userData;
    ud.style = st.id; ud.name = st.name; ud.deckTopM = deckTopM; ud.lengthM = sz.z; ud.widthM = sz.x;
    ud.nozzles = nozzles; ud.flames = flames; ud.glowMats = glowMats; ud.underglow = ug; ud.stand = stand; ud.mats = mats;
    ud.palette = pal;
    ud.setPalette = function (p) {
      if (!p) return;
      for (var q in p) pal[q] = p[q];
      mats.deck.color.setHex(pal.deck); mats.accent.color.setHex(pal.accent); mats.metal.color.setHex(pal.metal);
      mats.trim.color.setHex(pal.trim); mats.trim.emissive.setHex(pal.trim);
      mats.glow.color.setHex(pal.glow); mats.glow.emissive.setHex(pal.glow);
      mats.flame.color.setHex(pal.glow); mats.under.color.setHex(pal.glow);
    };
    // thrust k ∈ [0, 1.5]: flame length + underglow brightness (allocation-free)
    ud.setThrust = function (k, flicker) {
      var f = flicker || 0;
      for (var i = 0; i < flames.length; i++) {
        var fl = flames[i], L = fl.userData.len * (fl.userData.dir === 'down' ? 0.6 + 0.4 * k : 0.15 + k) * (1 + f * ((i & 1) ? 0.12 : -0.1));
        if (fl.userData.dir === 'down') fl.scale.set(1, Math.max(0.01, L), 1); else fl.scale.set(1, 1, Math.max(0.01, L));
      }
      mats.flame.opacity = 0.35 + 0.4 * Math.min(1, k);
      mats.under.opacity = 0.25 + 0.3 * Math.min(1, k);
    };
    ud.setThrust(0.3, 0);
    ud.dispose = function () {
      B.geos.forEach(function (q) { q.dispose(); });
      for (var m in mats) mats[m].dispose();
    };
    ud.tris = countTris(g);
    return g;
  }

  root.HoverboardKit = { STYLES: STYLES, build: build, loadGlb: loadGlb, _glb: BOARDGLB, countTris: countTris, ids: STYLES.map(function (s) { return s.id; }) };

  // ── pooled particle trail: ONE THREE.Points ring buffer, additive, colour fades to black ──
  root.buildHoverboardFX = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, MAX = opts.max || 160;
    var pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3);
    var life = new Float32Array(MAX), age = new Float32Array(MAX), base = new Float32Array(MAX * 3);
    for (var i = 0; i < MAX; i++) { pos[i * 3 + 1] = -1e5; life[i] = 1; age[i] = 1; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    var mat = (typeof WorldVFX !== 'undefined' && WorldVFX.softPointsMaterial)
      ? WorldVFX.softPointsMaterial(THREE, { size: opts.size || 0.9, vertexColors: true, additive: true })
      : new THREE.PointsMaterial({ size: opts.size || 0.9, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = 'hoverboard-fx';
    if (scene) scene.add(pts);
    var head = 0, live = 0, _c = new THREE.Color(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
    var emitAcc = 0;
    function emit(x, y, z, vx, vy, vz, color, lifeS) {
      var j = head; head = (head + 1) % MAX;
      pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
      vel[j * 3] = vx; vel[j * 3 + 1] = vy; vel[j * 3 + 2] = vz;
      _c.setHex(color);
      base[j * 3] = _c.r; base[j * 3 + 1] = _c.g; base[j * 3 + 2] = _c.b;
      life[j] = lifeS || 0.5; age[j] = 0;
    }
    // board = a HoverboardKit group (world matrix up to date); U = units per metre
    function emitFromBoard(board, dt, thrust, U) {
      var ud = board.userData; if (!ud.nozzles || thrust <= 0.05) return;
      emitAcc += dt * (30 + 90 * Math.min(1.5, thrust));
      board.getWorldQuaternion(_q);
      while (emitAcc >= 1) {
        emitAcc -= 1;
        for (var i = 0; i < ud.nozzles.length; i++) {
          var n = ud.nozzles[i]; if (n.userData.dir !== 'back' && thrust < 0.6) continue;
          _v.setFromMatrixPosition(n.matrixWorld);
          if (n.userData.dir === 'back') _d.set(0, 0, -1); else _d.set(0, -1, 0);
          _d.applyQuaternion(_q).multiplyScalar((2 + 3 * thrust) * U);
          var jx = (Math.random() - 0.5) * 0.6 * U, jy = (Math.random() - 0.5) * 0.6 * U;
          emit(_v.x, _v.y, _v.z, _d.x + jx, _d.y + jy * 0.5, _d.z + jy, ud.palette.glow, 0.35 + 0.25 * Math.random());
        }
      }
    }
    function update(dt) {
      live = 0;
      for (var i = 0; i < MAX; i++) {
        if (age[i] >= life[i]) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        live++;
        age[i] += dt;
        var k = Math.max(0, 1 - age[i] / life[i]), drag = Math.exp(-3 * dt), o = i * 3;
        vel[o] *= drag; vel[o + 1] *= drag; vel[o + 2] *= drag;
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        k *= k;
        col[o] = base[o] * k; col[o + 1] = base[o + 1] * k; col[o + 2] = base[o + 2] * k;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    }
    return {
      points: pts, emit: emit, emitFromBoard: emitFromBoard, update: update,
      live: function () { return live; },
      dispose: function () { if (scene) scene.remove(pts); geo.dispose(); mat.dispose(); },
    };
  };

  // ── TRICKS: pure state machine (radians). Allocation happens only on LANDING (events). ──
  var TRICK_TUNE = {
    spinRate: 7.0,        // rad/s (≈ 400°/s: a 360 takes ~0.9 s of air)
    flipRate: 6.0,        // rad/s
    varialRate: 9.0,      // rad/s (board-only shove-it)
    rollRate: 6.2,        // rad/s (barrel roll about the board's nose-tail axis)
    grabRate: 8,          // grab blend in/out per second
    spinTol: 30,          // landing tolerance (deg) vs the nearest 180
    flipTol: 35,          // vs the nearest full rotation
    varialTol: 30,        // vs the nearest 180
    rollTol: 35,          // vs the nearest full rotation
    tiltTol: 45,          // board pitch/roll at touchdown
    minAir: 0.18,         // s — shorter hops never score
    score: { spin: 100, flip: 300, roll: 260, varial: 120, grab: 150, grabPerS: 200, airPerS: 40, named: 250 },
  };
  // BATTLE mode: tricks score nothing; each clean one becomes a combat move the host applies (dodge windows, strikes, bashes).
  var BATTLE_MOVES = {
    flip:   { move: 'flip-dodge',  iframesS: 0.5,  note: 'vertical dodge, invulnerable while inverted' },
    roll:   { move: 'barrel-roll', iframesS: 0.6,  sidestepM: 6, note: 'lateral dodge' },
    spin:   { move: 'spin-strike', strikeR: 5, dmgMul: 1.4, note: 'weapon sweep, radius 5 m' },
    varial: { move: 'board-bash',  knockM: 4, dmgMul: 1.1, note: 'board shoves nearby targets' },
    grab:   { move: 'brace',       staminaRefund: 0.15, note: 'regain flight stamina' },
  };
  // Named multi-axis combos (rotation on 2+ axes in ONE air): extra event + bonus in Hoverskate.
  var NAMED = [['flip', 'spin', 'Corkscrew'], ['flip', 'roll', 'Hurricane'], ['roll', 'spin', 'Cyclone'], ['flip', 'varial', 'Tornado Flip'], ['roll', 'varial', 'Screw Shove']];
  var PI = Math.PI, TAU = 2 * PI, D2R = PI / 180;
  function resid(a, step) { var r = a - Math.round(a / step) * step; return Math.abs(r); }
  // advance angle toward the next multiple of `step` in the direction of `dir` (auto-complete after release)
  function settle(a, dir, rate, step, dt) {
    if (!dir) return a;
    var target = dir > 0 ? Math.ceil(a / step - 1e-6) * step : Math.floor(a / step + 1e-6) * step;
    var n = a + dir * rate * dt;
    return dir > 0 ? Math.min(n, target) : Math.max(n, target);
  }

  root.HoverboardTricks = {
    TUNE: TRICK_TUNE,
    create: function (tune) {
      var T = {}, k;
      for (k in TRICK_TUNE) T[k] = TRICK_TUNE[k];
      if (tune) for (k in tune) T[k] = tune[k];
      var A = { spin: 0, flip: 0, varial: 0, grab: 0, roll: 0 }, mode = 'hoverskate';             // current visual angles (rad) + grab weight
      var S = { air: false, airT: 0, spinDir: 0, flipDir: 0, varDir: 0, rollDir: 0, spinMax: 0, flipMax: 0, varMax: 0, rollMax: 0,
                grabT: 0, grabbed: false, grabKind: null, lastClean: true, combo: 0, total: 0, streak: 0 };
      var listeners = [];
      function reset() {
        A.spin = A.flip = A.varial = A.grab = A.roll = 0;
        S.air = false; S.airT = 0; S.spinDir = S.flipDir = S.varDir = S.rollDir = 0; S.spinMax = S.flipMax = S.varMax = S.rollMax = 0; S.grabT = 0; S.grabbed = false; S.grabKind = null;
      }
      function step(dt, inp, airborne) {
        if (airborne && !S.air) { reset(); S.air = true; }
        if (!airborne) {
          // on the ground: angles ease home (revert out of a switch landing), grab releases
          A.spin += (0 - A.spin) * Math.min(1, dt * 10); A.varial += (0 - A.varial) * Math.min(1, dt * 10);
          A.flip = 0; A.roll = 0; A.grab = Math.max(0, A.grab - T.grabRate * dt);
          return;
        }
        S.airT += dt;
        inp = inp || NOIN;
        // SPIN (body + board): hold A/D; on release it auto-completes to the next 180
        var sw = (inp.spinR ? 1 : 0) - (inp.spinL ? 1 : 0);
        if (sw) { S.spinDir = sw; A.spin += sw * T.spinRate * dt; }
        else A.spin = settle(A.spin, S.spinDir, T.spinRate, PI, dt);
        // FLIP (front/back): auto-completes to the next full rotation
        var fw = (inp.flipF ? 1 : 0) - (inp.flipB ? 1 : 0);
        if (fw) { S.flipDir = fw; A.flip += fw * T.flipRate * dt; }
        else A.flip = settle(A.flip, S.flipDir, T.flipRate, TAU, dt);
        // ROLL (barrel roll about the nose-tail axis): auto-completes to the next full rotation
        var rw = (inp.rollR ? 1 : 0) - (inp.rollL ? 1 : 0);
        if (rw) { S.rollDir = rw; A.roll += rw * T.rollRate * dt; }
        else A.roll = settle(A.roll, S.rollDir, T.rollRate, TAU, dt);
        // VARIAL (board only): auto-completes to the next 180
        var vw = (inp.varialR ? 1 : 0) - (inp.varialL ? 1 : 0);
        if (vw) { S.varDir = vw; A.varial += vw * T.varialRate * dt; }
        else A.varial = settle(A.varial, S.varDir, T.varialRate, PI, dt);
        // GRAB: blend in while held; time counts once it's really held
        A.grab = Math.max(0, Math.min(1, A.grab + (inp.grab ? 1 : -1) * T.grabRate * dt));
        if (inp.grab && !S.grabKind && A.grab > 0.3) S.grabKind = inp.grabKind || 'indy';   /* the style is chosen when the hand reaches the board */
        if (A.grab > 0.8) { S.grabT += dt; S.grabbed = true; }
        S.spinMax = Math.max(S.spinMax, Math.abs(A.spin));
        S.flipMax = Math.max(S.flipMax, Math.abs(A.flip));
        S.varMax = Math.max(S.varMax, Math.abs(A.varial));
        S.rollMax = Math.max(S.rollMax, Math.abs(A.roll));
      }
      function emit(ev) { for (var i = 0; i < listeners.length; i++) { try { listeners[i](ev); } catch (e) {} } }
      // touchdown: returns true = clean. Snaps angles (spin/varial keep their 180 → "switch", then revert on the ground)
      function land(tiltRad) {
        if (!S.air) return true;
        S.air = false;
        var spinDeg = Math.round(S.spinMax / PI) * 180, flips = Math.round(S.flipMax / TAU), varDeg = Math.round(S.varMax / PI) * 180, rolls = Math.round(S.rollMax / TAU);
        var tricks = [];
        if (rolls >= 1) tricks.push({ kind: 'roll', deg: rolls * 360, name: (rolls > 1 ? (rolls === 2 ? 'Double ' : rolls + 'x ') : '') + 'Barrel Roll', base: T.score.roll * rolls * (rolls > 1 ? 1.25 : 1) });
        if (spinDeg >= 180) tricks.push({ kind: 'spin', deg: spinDeg, name: 'Spin ' + spinDeg, base: T.score.spin * (spinDeg / 180) * (spinDeg >= 720 ? 1.5 : 1) });
        if (flips >= 1) tricks.push({ kind: 'flip', deg: flips * 360, name: (flips > 1 ? (flips === 2 ? 'Double ' : flips + 'x ') : '') + (S.flipDir > 0 ? 'Front Flip' : 'Back Flip'), base: T.score.flip * flips * (flips > 1 ? 1.25 : 1) });
        if (varDeg >= 180) tricks.push({ kind: 'varial', deg: varDeg, name: 'Varial ' + varDeg, base: T.score.varial * (varDeg / 180) });
        if (S.grabbed && S.grabT > 0.15) { var gv = root.HoverboardMoves && S.grabKind && root.HoverboardMoves.GRABS[S.grabKind]; tricks.push({ kind: 'grab', deg: 0, name: gv && S.grabKind !== 'indy' ? gv.name + (S.grabT > 1 ? ' (long)' : '') : (S.grabT > 1 ? 'Long Grab' : (gv ? gv.name : 'Grab')), base: T.score.grab + (gv ? gv.bonus : 0) + T.score.grabPerS * S.grabT }); }
        var clean = resid(A.spin, PI) <= T.spinTol * D2R && resid(A.flip, TAU) <= T.flipTol * D2R &&
                    resid(A.varial, PI) <= T.varialTol * D2R && resid(A.roll, TAU) <= T.rollTol * D2R && Math.abs(tiltRad || 0) <= T.tiltTol * D2R && A.grab < 0.95;
        if (S.airT < T.minAir && !tricks.length) { A.flip = 0; A.roll = 0; A.spin = Math.round(A.spin / PI) * PI; A.varial = Math.round(A.varial / PI) * PI; return true; }
        var mult = tricks.length, total = 0, air = T.score.airPerS * S.airT, battle = mode === 'battle', have = {};
        for (var hi = 0; hi < tricks.length; hi++) have[tricks[hi].kind] = 1;
        for (var i = 0; i < tricks.length; i++) {
          var t = tricks[i], sc = clean && !battle ? Math.round(t.base * mult) : 0;
          total += sc;
          var evt = { name: t.name, kind: t.kind, deg: t.deg, score: sc, clean: clean, combo: mult, total: 0, air: S.airT, points: !battle };
          if (battle && clean) evt.move = BATTLE_MOVES[t.kind];
          emit(evt);
        }
        for (var ni = 0; ni < NAMED.length; ni++) if (have[NAMED[ni][0]] && have[NAMED[ni][1]]) {
          var nb = clean && !battle ? T.score.named : 0; total += nb;
          emit({ name: NAMED[ni][2], kind: 'named', deg: 0, score: nb, clean: clean, combo: mult, total: 0, air: S.airT, points: !battle, parts: [NAMED[ni][0], NAMED[ni][1]] });
        }
        if (tricks.length) {
          if (clean) { if (!battle) total += Math.round(air); S.streak++; S.total += total; }
          else S.streak = 0;
          S.combo = mult; S.lastClean = clean;
          emit({ name: clean ? 'combo' : 'bail', kind: 'summary', deg: 0, score: clean ? total : 0, clean: clean, combo: mult, total: S.total, air: S.airT });
        } else if (!clean) {
          S.lastClean = false; S.streak = 0;
          emit({ name: 'bail', kind: 'summary', deg: 0, score: 0, clean: false, combo: 0, total: S.total, air: S.airT });
        }
        // snap: flips are always cleared; spin/varial round to their nearest 180 (switch), then ease home on the ground
        A.flip = 0; A.roll = 0; A.spin = Math.round(A.spin / PI) * PI; A.varial = Math.round(A.varial / PI) * PI;
        if (Math.abs(A.spin) > 1e-6) A.spin = (Math.round(A.spin / PI) & 1) ? (A.spin > 0 ? PI : -PI) : 0;
        if (Math.abs(A.varial) > 1e-6) A.varial = (Math.round(A.varial / PI) & 1) ? (A.varial > 0 ? PI : -PI) : 0;
        return clean;
      }
      var NOIN = {};
      return {
        tune: T, angles: A, state: S, reset: reset, step: step, land: land,
        setMode: function (m) { mode = m === 'battle' ? 'battle' : 'hoverskate'; }, getMode: function () { return mode; }, BATTLE_MOVES: BATTLE_MOVES,
        inject: function (evt) { S.total += evt.score || 0; if (evt.clean) S.streak++; evt.total = S.total; emit(evt); },
        onTrick: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
