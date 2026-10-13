/* world-interiors.js — SHADDAI World 3D  (TURTLE cinematic v2, 2026-07-02)
 *
 * Classic script — no import/export.  Requires THREE + scene loaded first.
 *
 * Exposes ONE global factory:
 *   window.buildWorldInteriors({ THREE, scene, camera, controls, playerPos, layout })
 *     → { enter(code), exit(), isInside(), update(dt, t), nearestDoor(x, z) }
 *
 * v2 UPGRADES:
 *   • 3-light cinematic rig per room  (key + soft fill + accent rim)
 *   • Reflective floor sheen          (roughness 0.55, metalness 0.18)
 *   • emissiveIntensity hard-capped   at 0.50 — kills white-glow blowout
 *   • Light shafts                    (additive CylinderGeometry cones, ~0.04 opacity)
 *   • Floating motes / data rain      (THREE.Points ~60 particles, active-room-only update)
 *   • InstancedMesh                   (racks, terminals, stalls, ingots, frames, orbs)
 *   • Per-room animObjs               (orrery, hologlobe, pages) — active-room-only
 *   • Themed ceiling details          (grid, vault ribs, skylight panels)
 *   • Richer hero pieces              (dais+throne, orrery, ticker wall, vault door, etc.)
 *   • Clear exit portal               (glowing arch + filled portal plane)
 */
(function (global) {
  'use strict';

  /* ─── layout constants ──────────────────────────────────────────────────── */
  var ROOM_ISLAND_X  = 6000;
  var ROOM_SPACING   = 500;
  var ROOM_W         = 80;
  var ROOM_H         = 22;
  var ROOM_D         = 80;
  var PLAYER_EYE_Y   = 3.6;
  var SPAWN_Z_OFFSET = 28;

  // MUST match the actual building wall radius (footprint*0.46) so the "[E] ENTER" prompt fires when you
  // stand at the door — before this these were 24-34 while the walls sit at 62-119, so you hit the wall
  // and could NEVER reach the trigger ("no door / can't get in"). Now the prompt reaches just outside each wall.
  // RADII RE-DERIVED from the actual footprints in world-buildings.js × 0.46 (the dressed-wall faceR):
  //   NEXUS/TURTLE fp140→64 · ZEROX/PIKADON fp145→67 · ORACLE fp138→64 · QUILL/Library fp258→119.
  //   QUILL was the big miss: the library was grown 172→258 but this table still read 78, putting the
  //   ENTER trigger (78+16=94) a full ~24u INSIDE the fp*0.46=119 wall — you hit the wall before the
  //   prompt could ever fire ("can't get into the library"). Now 119 matches the wall. SHADDAI is unused
  //   here (skipped below — the ground centre is the open bazaar), left as-is.
  var COLLIDER_R = {
    SHADDAI: 76, ZEROX: 67, ORACLE: 64, NEXUS: 64,
    TURTLE: 64,  QUILL: 119, PIKADON: 67, bazaar: 37,
    // REALM STRUCTURES (interior law, 2026-09-23): doors at each realm's real position on
    // the big map — colosseum floor r46 south [-14,460]; garage pad [26,96] by the plaza;
    // fortress on the volcano crater shelf [420,-380]; castle keep in darkforest [-420,-380].
    COLOSSEUM: 46, GARAGE: 12, FORTRESS: 34, CASTLE: 34
  };
  // FRONT-DOOR GATE: the "[E] ENTER" prompt only fires when the player stands on the
  // building's ENTRANCE side — the side facing world-centre. We bake a normalized front
  // vector per door (frontDir = normalize(centre - buildingPos)) and require the player
  // to be inside a cone around it (dot-product test). SHADDAI sits AT centre so its door
  // faces -Z. COS_FRONT = cos(60deg) -> a 120deg-wide front arc; this stops the prompt
  // from firing at the back/sides of a building.
  var COS_FRONT  = 0.5;
  var COS_FRONT2 = COS_FRONT * COS_FRONT;
  var WORLD_CX   = 0;   // world centre X (SHADDAI sits here)
  var WORLD_CZ   = 0;   // world centre Z

  var DOOR_EXTRA = 16;   // how far OUTSIDE the wall the prompt still triggers — walk up to the door and it fires

  /* ─── themes ─────────────────────────────────────────────────────────────── */
  var THEMES = {
    SHADDAI : { label: 'SHADDAI — The Source',    accent: 0xffcf4a, floor: 0x100d00, propFn: 'throneRoom'    },
    NEXUS   : { label: 'NEXUS — Navigator Core',  accent: 0x34e5b0, floor: 0x001a10, propFn: 'serverRoom'    },
    QUILL   : { label: 'QUILL — The Library',     accent: 0xb98cff, floor: 0x0d0820, propFn: 'scriptorium'   },
    ORACLE  : { label: 'ORACLE — Esoteric Wing',  accent: 0xc084fc, floor: 0x0c0820, propFn: 'arcaneLibrary' },
    TURTLE  : { label: 'TURTLE — The Museum',     accent: 0x1fd6c4, floor: 0x001414, propFn: 'artStudio'     },
    PIKADON : { label: 'PIKADON — The Aegis',     accent: 0xff5a6e, floor: 0x1a0206, propFn: 'vaultRoom'     },
    ZEROX   : { label: 'ZEROX — The Markets',     accent: 0x27e0ff, floor: 0x001220, propFn: 'tradingFloor'  },
    bazaar  : { label: 'THE BAZAAR — Agora Hall', accent: 0x00e5a0, floor: 0x000d08, propFn: 'bazaarHall'    },
    // REALM VENUES (interior law): themed rooms behind the realm-structure doors. V1 reuses
    // the strongest existing room-builders with new accents; Thursday's fal pass dresses
    // each with its own furniture kit + dressed walls in the same code slots.
    COLOSSEUM: { label: 'COLOSSEUM — Tourney Hall', accent: 0xe8c45c, floor: 0x141005, propFn: 'tradingFloor' },
    GARAGE   : { label: 'GARAGE — Hover Works',     accent: 0x00ff9c, floor: 0x00140d, propFn: 'serverRoom'   },
    FORTRESS : { label: 'EMBERFALL — War Room',     accent: 0xff5a10, floor: 0x140802, propFn: 'throneRoom'  },
    CASTLE   : { label: 'DARKREALM — Siege Keep',    accent: 0x9b59f5, floor: 0x0c0514, propFn: 'arcaneLibrary' },
  };

  /* ─── factory ────────────────────────────────────────────────────────────── */
  global.buildWorldInteriors = function (opts) {
    var THREE     = opts.THREE;
    var scene     = opts.scene;
    var camera    = opts.camera;
    var controls  = opts.controls;
    var playerPos = opts.playerPos;
    var layout    = opts.layout || global.WORLD_LAYOUT || {};

    // shared instancing scratch object — used by every room builder (fixes "dum is not defined")
    var dum = new THREE.Object3D();

    var allSectors = [];
    if (layout.sectors) {
      for (var i = 0; i < layout.sectors.length; i++) allSectors.push(layout.sectors[i]);
    }
    var baz = layout.landmark && layout.landmark('bazaar');
    if (baz) allSectors.push({ code: 'bazaar', name: 'The Bazaar',
                               pos: baz.pos, color: baz.color || 0x00e5a0 });

    // ── REALM STRUCTURES as enterable doors (interior law, 2026-09-23) ─────────────
    // Each sits at its real position on the big map — realms are separated by terrain
    // and distance; these doors are the E-portals into sized-correct interior instances.
    var REALM_SECTORS = [
      { code: 'COLOSSEUM', name: 'The Colosseum', pos: [-14, 460], color: 0xe8c45c },  // south trail end
      { code: 'GARAGE',    name: 'The Garage',     pos: [26, 96],   color: 0x00ff9c },  // plaza east
      { code: 'FORTRESS',  name: 'Emberfall Keep', pos: [420, -380], color: 0xff5a10 }, // volcano crater shelf
      { code: 'CASTLE',    name: 'Darkrealm Keep', pos: [-420, -380], color: 0x9b59f5 },// darkforest castle
    ];
    for (var _ri = 0; _ri < REALM_SECTORS.length; _ri++) allSectors.push(REALM_SECTORS[_ri]);

    /* ── state ── */
    var currentCode   = null;
    var outdoorReturn = { x: 0, z: 0, y: 0 };
    var rooms         = {};
    var glowPool      = [];   /* { mat, base, phase, amp } */
    var overlayEl     = null;
    var hintEl        = null;
    var outdoorDoors  = [];   /* animated door leaves standing at each building entrance */
    var doorsBuilt    = false;
    var _disposeTimer = null;  /* pending grace-period disposal of the room just left (see scheduleDispose) */

    /* ── basic helpers ── */
    function upperCode(c) { return (c || '').toUpperCase(); }

    function sectorIndexOf(code) {
      var uc = upperCode(code);
      for (var i = 0; i < allSectors.length; i++) {
        if (upperCode(allSectors[i].code) === uc) return i;
      }
      return 0;
    }

    function themeOf(code) {
      return THEMES[upperCode(code)] || THEMES[code] || {
        label: upperCode(code), accent: 0xffffff, floor: 0x111111, propFn: 'genericRoom'
      };
    }

    function roomOrigin(code) {
      return { x: ROOM_ISLAND_X + sectorIndexOf(code) * ROOM_SPACING, y: 0, z: 0 };
    }

    function colliderR(code) { return COLLIDER_R[upperCode(code)] || COLLIDER_R[code] || 24; }

    /* ── PERF: precomputed door table for nearestDoor() ──────────────────────
       nearestDoor(x,z) runs EVERY frame. Sector list + collider radii are
       static, so bake { code, sx, sz, thrSq } once here. This removes the
       per-frame, per-sector upperCode() string allocation (was via colliderR)
       and the per-sector Math.sqrt — the hot loop is now pure squared-distance
       compares with zero allocations. */
    var doors = [];
    for (var _di = 0; _di < allSectors.length; _di++) {
      var _ds  = allSectors[_di];
      if (String(_ds.code).toUpperCase() === 'SHADDAI') continue;   // SHADDAI temple moved to the sky observatory — no "[E] ENTER SHADDAI" at the ground center (that's the open bazaar/forum now)
      var _thr = colliderR(_ds.code) + DOOR_EXTRA;
      var _sx  = _ds.pos ? _ds.pos[0] : 0;
      var _sz  = _ds.pos ? _ds.pos[1] : 0;
      /* front vector = normalize(centre - buildingPos). SHADDAI sits at centre so its
         door faces -Z (fallback). Baked once here — nearestDoor() stays allocation-free. */
      var _fdx = WORLD_CX - _sx, _fdz = WORLD_CZ - _sz;
      var _flen = Math.sqrt(_fdx * _fdx + _fdz * _fdz);
      var _fx, _fz;
      if (_flen < 1e-3) { _fx = 0; _fz = -1; }
      else              { _fx = _fdx / _flen; _fz = _fdz / _flen; }
      doors.push({
        code:  _ds.code,
        sx:    _sx,
        sz:    _sz,
        fx:    _fx,
        fz:    _fz,
        thrSq: _thr * _thr,
      });
    }

    /* ── material helpers ── */

    /* Hard-cap emissiveIntensity at 0.50 — prevents white-glow blowout */
    function mat(color, emissive, ei, roughness, metalness, transparent, opacity) {
      return new THREE.MeshStandardMaterial({
        color:             color    || 0x111111,
        emissive:          emissive || 0x000000,
        emissiveIntensity: Math.min(ei != null ? ei : 0, 0.50),
        roughness:         roughness  != null ? roughness  : 0.88,
        metalness:         metalness  != null ? metalness  : 0.08,
        transparent:       !!transparent,
        opacity:           opacity    != null ? opacity    : 1,
      });
    }

    /* Reflective floor material */
    function floorMat(color, accent) {
      return new THREE.MeshStandardMaterial({
        color: color || 0x111111, emissive: accent || 0x000000,
        emissiveIntensity: 0.025, roughness: 0.55, metalness: 0.18,
      });
    }

    /* Register material for glow pulse — auto-caps so base+amp ≤ 0.50 */
    function glow(m, base, phase, amp) {
      var b = base || 0.12;
      var a = amp  || 0.08;
      if (b + a > 0.50) a = 0.50 - b;
      if (a < 0) a = 0;
      glowPool.push({ mat: m, base: b, phase: phase || 0, amp: a });
    }

    /* ── atmosphere builders ── */

    /* Floating dust/ember/data motes — THREE.Points stored on room.motes */
    function buildMotes(group, accent, count, falling) {
      var hs  = ROOM_W * 0.70 * 0.5;
      var pos = new Float32Array(count * 3);
      var vel = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        pos[i*3]   = (Math.random() - 0.5) * hs * 2;
        pos[i*3+1] = Math.random() * (ROOM_H - 2) + 1;
        pos[i*3+2] = (Math.random() - 0.5) * hs * 2;
        vel[i*3]   = (Math.random() - 0.5) * 0.015;
        vel[i*3+1] = falling
          ? -(Math.random() * 0.022 + 0.008)
          :   Math.random() * 0.013 + 0.004;
        vel[i*3+2] = (Math.random() - 0.5) * 0.015;
      }
      var geo  = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pMat = new THREE.PointsMaterial({
        color: accent, size: 0.15, transparent: true, opacity: 0.50,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      var pts = new THREE.Points(geo, pMat);
      group.add(pts);
      return { pts: pts, vel: vel, count: count, hs: hs, falling: !!falling };
    }

    /* Additive light-shaft cone */
    function buildShaft(group, x, z, topR, botR, h, accent, op) {
      h = h || ROOM_H * 0.76;
      var geo = new THREE.CylinderGeometry(topR || 0.7, botR || 4, h, 8, 1, true);
      var shM = new THREE.MeshBasicMaterial({
        color: accent, transparent: true, opacity: op || 0.038,
        side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      var mesh = new THREE.Mesh(geo, shM);
      mesh.position.set(x, h * 0.5 + 1, z);
      group.add(mesh);
    }

    /* Instanced ceiling grid */
    function buildCeilGrid(group, accent, rows, cols) {
      var tw  = (ROOM_W - 2) / cols;
      var td  = (ROOM_D - 2) / rows;
      var geo = new THREE.PlaneGeometry(tw - 0.5, td - 0.5);
      var tm  = mat(0x040404, accent, 0.08, 0.92, 0, true, 0.80);
      glow(tm, 0.07, 0, 0.05);
      var im  = new THREE.InstancedMesh(geo, tm, rows * cols);
      var dum = new THREE.Object3D();
      var idx = 0;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          dum.position.set(
            -ROOM_W/2 + 1 + (c + 0.5) * tw,
            ROOM_H - 0.06,
            -ROOM_D/2 + 1 + (r + 0.5) * td
          );
          dum.rotation.set(Math.PI / 2, 0, 0);
          dum.updateMatrix();
          im.setMatrixAt(idx++, dum.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }

    /* ── ROOM SHELL ── */
    function buildShell(group, accent, floorCol) {
      /* reflective floor */
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat(floorCol, accent));
      fl.rotation.x = -Math.PI / 2;
      group.add(fl);

      /* ceiling */
      var cM  = mat(0x060606, accent, 0.04, 1, 0);
      var cel = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), cM);
      cel.rotation.x = Math.PI / 2;
      cel.position.y = ROOM_H;
      group.add(cel);

      /* walls */
      var wallM = mat(floorCol, accent, 0.04, 0.92, 0.04);
      var wdefs = [
        { w: ROOM_W, h: ROOM_H, x: 0,          y: ROOM_H/2, z: -ROOM_D/2, ry: 0           },
        { w: ROOM_W, h: ROOM_H, x: 0,          y: ROOM_H/2, z:  ROOM_D/2, ry: Math.PI     },
        { w: ROOM_D, h: ROOM_H, x: -ROOM_W/2,  y: ROOM_H/2, z: 0,         ry:  Math.PI/2  },
        { w: ROOM_D, h: ROOM_H, x:  ROOM_W/2,  y: ROOM_H/2, z: 0,         ry: -Math.PI/2  },
      ];
      for (var i = 0; i < wdefs.length; i++) {
        var d  = wdefs[i];
        var wm = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), wallM.clone());
        wm.position.set(d.x, d.y, d.z);
        wm.rotation.y = d.ry;
        group.add(wm);
      }

      /* crown trim rail (shared geo for H and V runs) */
      var tGH = new THREE.BoxGeometry(ROOM_W - 0.4, 0.55, 0.36);
      var tGV = new THREE.BoxGeometry(0.36, 0.55, ROOM_D - 0.4);
      var trM = mat(accent, accent, 0.20, 0.45, 0.55);
      glow(trM, 0.18, 0, 0.10);
      var tdefs = [
        { g: tGH, x: 0,             y: ROOM_H - 0.28, z: -ROOM_D/2 + 0.22 },
        { g: tGH, x: 0,             y: ROOM_H - 0.28, z:  ROOM_D/2 - 0.22 },
        { g: tGV, x: -ROOM_W/2+0.22, y: ROOM_H - 0.28, z: 0               },
        { g: tGV, x:  ROOM_W/2-0.22, y: ROOM_H - 0.28, z: 0               },
      ];
      for (var j = 0; j < tdefs.length; j++) {
        var t = new THREE.Mesh(tdefs[j].g, trM);
        t.position.set(tdefs[j].x, tdefs[j].y, tdefs[j].z);
        group.add(t);
      }

      /* base skirting */
      var skM = mat(accent, accent, 0.12, 0.6, 0.4);
      var sdefs = [
        { g: tGH, x: 0,              z: -ROOM_D/2 + 0.22 },
        { g: tGH, x: 0,              z:  ROOM_D/2 - 0.22 },
        { g: tGV, x: -ROOM_W/2+0.22, z: 0                },
        { g: tGV, x:  ROOM_W/2-0.22, z: 0                },
      ];
      for (var k = 0; k < sdefs.length; k++) {
        var sk = new THREE.Mesh(sdefs[k].g, skM.clone());
        sk.position.set(sdefs[k].x, 0.30, sdefs[k].z);
        group.add(sk);
      }
    }

    /* ── EXIT PORTAL (front wall, +Z side) ── */
    function buildExitFrame(group, accent) {
      var doorH = 8.5, doorW = 5.5;
      var zPos  = ROOM_D / 2 - 0.4;

      /* arch jambs and header */
      var fM  = mat(0x1c1c1c, accent, 0.22, 0.40, 0.55);
      glow(fM, 0.20, 2.1, 0.12);
      var jamb   = new THREE.BoxGeometry(0.55, doorH, 0.65);
      var header = new THREE.BoxGeometry(doorW + 1.2, 0.55, 0.65);
      var lj = new THREE.Mesh(jamb,   fM); lj.position.set(-doorW/2, doorH/2, zPos); group.add(lj);
      var rj = new THREE.Mesh(jamb,   fM); rj.position.set( doorW/2, doorH/2, zPos); group.add(rj);
      var hd = new THREE.Mesh(header, fM); hd.position.set(0, doorH + 0.28, zPos);   group.add(hd);

      /* glowing portal fill plane */
      var pfM = new THREE.MeshBasicMaterial({
        color: accent, transparent: true, opacity: 0.12,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      var pf = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.1, doorH - 0.1), pfM);
      pf.position.set(0, doorH/2, zPos + 0.05);
      group.add(pf);

      /* EXIT label */
      try {
        var cv  = document.createElement('canvas'); cv.width = 256; cv.height = 64;
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = 'bold 34px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#' + accent.toString(16).padStart(6, '0');
        ctx.fillText('[ EXIT ]', 128, 32);
        var tex = new THREE.CanvasTexture(cv);
        var lbM = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        var lb  = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.55), lbM);
        lb.position.set(0, doorH + 1.9, zPos + 0.12);
        group.add(lb);
      } catch (e) { /* headless */ }
    }

    /* ── ROOM NAME LABEL ── */
    function buildNameLabel(group, text, accent) {
      try {
        var cv  = document.createElement('canvas'); cv.width = 1024; cv.height = 192;
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, 1024, 192);
        ctx.font = 'bold 78px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#' + accent.toString(16).padStart(6, '0');
        ctx.fillText(text, 512, 96);
        var tex = new THREE.CanvasTexture(cv);
        var m   = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        var msh = new THREE.Mesh(new THREE.PlaneGeometry(28, 5.25), m);
        msh.position.set(0, ROOM_H - 6.5, -ROOM_D/2 + 0.55);
        group.add(msh);
      } catch (e) { /* headless */ }
    }

    /* ── SHARED PROP HELPERS ── */

    function pedestal(group, accent, yBase) {
      yBase = yBase || 0;
      var pM  = mat(0x1a1a1a, accent, 0.10, 0.45, 0.5);
      var b   = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 1.2, 10), pM);
      b.position.set(0, yBase + 0.6, 0); group.add(b);
      var sh  = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 3, 10), pM.clone());
      sh.position.set(0, yBase + 2.7, 0); group.add(sh);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.2, 0.5, 10), pM.clone());
      cap.position.set(0, yBase + 4.65, 0); group.add(cap);
      var oM  = mat(accent, accent, 0.36, 0.25, 0.05);
      glow(oM, 0.32, 0.7, 0.12);
      var orb = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 14), oM);
      orb.position.set(0, yBase + 6.2, 0); group.add(orb);
    }

    function column(group, accent, x, z) {
      var cM  = mat(0x141414, accent, 0.07, 0.6, 0.25);
      var sh  = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, ROOM_H * 0.85, 9), cM);
      sh.position.set(x, ROOM_H * 0.425, z); group.add(sh);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.1, 1.0, 9), cM.clone());
      cap.position.set(x, ROOM_H * 0.85, z); group.add(cap);
    }

    function wallPanels(group, accent, count, zOff) {
      zOff = zOff || 0;
      var pM  = mat(0x0d0d0d, accent, 0.13, 0.55, 0.40);
      glow(pM, 0.12, 1.0, 0.07);
      var spc = (ROOM_W - 12) / (count - 1);
      for (var i = 0; i < count; i++) {
        var px = -ROOM_W/2 + 6 + i * spc;
        var p  = new THREE.Mesh(new THREE.BoxGeometry(9, 10, 0.4), pM.clone());
        p.position.set(px, 9, -ROOM_D/2 + 1.6 + zOff);
        group.add(p);
        var sM = mat(accent, accent, 0.28, 0.5, 0.1);
        glow(sM, 0.24, i * 0.55, 0.12);
        var s  = new THREE.Mesh(new THREE.BoxGeometry(7, 0.25, 0.46), sM);
        s.position.set(px, 12, -ROOM_D/2 + 1.6 + zOff);
        group.add(s);
      }
    }

    /* Generic canvas text label plane — DoubleSide so it's readable from any angle.
       Optional sub-caption on a second line (e.g. "press E"). */
    function textLabel(text, planeW, planeH, hexColor, fontPx, sub) {
      try {
        var cv  = document.createElement('canvas'); cv.width = 512; cv.height = 128;
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, 512, 128);
        ctx.font = 'bold ' + (fontPx || 44) + 'px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#' + hexColor.toString(16).padStart(6, '0');
        ctx.fillText(text, 256, sub ? 50 : 64);
        if (sub) {
          ctx.font = '22px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillText(sub, 256, 98);
        }
        var tex = new THREE.CanvasTexture(cv);
        var m   = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        });
        return new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), m);
      } catch (e) {
        return new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001),
          new THREE.MeshBasicMaterial({ visible: false }));
      }
    }

    /* A themed, LABELED tool station: plinth + glowing cap + angled console screen +
       floating icon orb + a "TOOL — press E" plate. These read as "here is where you
       use this agent's tools/skills". Physically built + tagged; wiring is left to the
       world lead (see TODO below). Marked userData.toolStation + userData.toolName. */
    function toolStation(group, accent, x, z, label, ry) {
      ry = ry || 0;
      var s = new THREE.Group();
      s.position.set(x, 0, z);
      s.rotation.y = ry;

      var plM = mat(0x141418, accent, 0.10, 0.50, 0.45);
      var pl  = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 1.1, 8), plM);
      pl.position.y = 0.55; s.add(pl);
      var capM = mat(accent, accent, 0.22, 0.40, 0.50);
      glow(capM, 0.18, x * 0.3 + z * 0.2, 0.10);
      var cap  = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.6, 0.24, 8), capM);
      cap.position.y = 1.18; s.add(cap);

      var slabM = mat(0x0a0a12, accent, 0.14, 0.40, 0.60);
      var slab  = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.9, 0.28), slabM);
      slab.position.set(0, 2.55, 0.16); slab.rotation.x = -0.42; s.add(slab);
      var scrM  = new THREE.MeshBasicMaterial({
        color: accent, transparent: true, opacity: 0.18,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      var scr   = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.55), scrM);
      scr.position.set(0, 2.57, 0.33); scr.rotation.x = -0.42; s.add(scr);

      var orbM = mat(accent, accent, 0.42, 0.25, 0.05);
      glow(orbM, 0.34, x + z, 0.12);
      var orb  = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), orbM);
      orb.position.set(0, 4.6, 0); s.add(orb);

      var lbl = textLabel(label, 5.4, 1.35, accent, 40, 'press E');
      lbl.position.set(0, 6.1, 0); s.add(lbl);

      s.name = 'tool-station:' + label;
      s.userData.toolStation = true;
      s.userData.toolName    = label;
      /* TODO(world-lead): wire real tool invocation here. When the player is near this
         station and presses E (or clicks the orb/screen), call the agent's real skill,
         e.g. fetch('/api/agent/' + code + '/tool', { name: s.userData.toolName }).
         The physical station + userData.toolName are ready — only the handler is missing. */

      group.add(s);
      if (group.userData.animObjs) {
        group.userData.animObjs.push({ mesh: orb, axis: 'y', speed: 0.6 });
      }
      return s;
    }

    /* Lay out a row of tool stations centred on X at depth cz, under a "TOOLS" banner. */
    function buildToolRow(group, accent, names, cz, ry) {
      var n = names.length, spacing = 8.6;
      var startX = -((n - 1) * spacing) / 2;
      for (var i = 0; i < n; i++) {
        toolStation(group, accent, startX + i * spacing, cz, names[i], ry || 0);
      }
      var hdr = textLabel('◈  TOOLS  ◈', 11, 1.7, accent, 48);
      hdr.position.set(0, 8.5, cz);
      hdr.rotation.y = ry || 0;
      group.add(hdr);
    }

    /* ── FRAMED WALL ART (TURTLE, 2026-07-09) ─────────────────────────────────
       Hangs ONE themed FLUX painting per room. A dark bevel frame with an
       accent inner reveal + a soft accent sconce (point light) so each piece
       reads as native to the room. The art texture is loaded ONCE via
       TextureLoader (colorSpace = SRGBColorSpace so the JPG isn't washed out);
       no per-frame work is added — update() never touches these meshes. Frame
       geometry/materials + the loaded texture are freed automatically by the
       room's disposeObject3D() teardown (it disposes every material's maps).

       ART table: file + wall placement per room. Default wall = LEFT (x=-40),
       facing +X into the room, at comfortable eye height. Placements are chosen
       to sit on a clear stretch of wall — never over the +Z EXIT PORTAL, never
       over a back-wall hero piece — so the room stays fully walkable and the
       exit reachable. `z` is the along-wall offset; art hangs flat on the wall. */
    var ART = {
      SHADDAI: { file: 'shaddai.jpg', z:  0,  w: 13 },   /* left wall, clear of dais(-Z)+runner */
      /* NEXUS left wall is dense with 11.5-tall portals (z=-24,-8,8,24). Fit the
         piece in the clear z=0 gap AND above the portal tops (y≈16.5) so it never
         overlaps a portal — smaller + raised for this one room only. */
      NEXUS:   { file: 'nexus.jpg',   z:  0,  w: 7,  y: 16.6 },
      QUILL:   { file: 'quill.jpg',   z:  0,  w: 12 },
      ORACLE:  { file: 'oracle.jpg',  z:  0,  w: 12 },
      TURTLE:  { file: 'turtle.jpg',  z:  0,  w: 13 },
      PIKADON: { file: 'pikadon.jpg', z:  0,  w: 12 },
      ZEROX:   { file: 'zerox.jpg',   z:  0,  w: 12 },
      bazaar:  { file: 'bazaar.jpg',  z:  0,  w: 13 },
    };

    /* Hang the matching room's framed piece on the LEFT wall (x=-40), facing +X.
       Safe if the room has no art entry (no-op) or if the texture fails to load
       (the frame + reveal still render). Called once at build time per room. */
    function hangArt(group, code, accent) {
      var cfg = ART[upperCode(code)] || ART[code];
      if (!cfg) return;
      var artW = cfg.w || 12;
      var artH = artW;                       /* source art is square (768×768) */
      var wallX = -ROOM_W / 2 + 0.35;        /* just off the left wall face */
      var cz    = cfg.z || 0;                /* along-wall (Z) offset */
      var cy    = cfg.y || 8.4;              /* centre height (default eye level) */
      var ry    = Math.PI / 2;               /* face +X (into the room) */

      var art = new THREE.Group();
      art.position.set(wallX, cy, cz);
      art.rotation.y = ry;

      /* dark outer frame slab (art plane sits proud of it) */
      var frameM = mat(0x0a0a0c, accent, 0.10, 0.55, 0.45);
      var frame  = new THREE.Mesh(
        new THREE.BoxGeometry(artW + 1.6, artH + 1.6, 0.4), frameM);
      frame.position.set(0, 0, 0);           /* local: plane is on +Z of the group */
      art.add(frame);

      /* accent inner reveal (thin glowing liner around the canvas) */
      var revM = mat(accent, accent, 0.24, 0.45, 0.30);
      glow(revM, 0.20, cz * 0.2 + 0.5, 0.10);
      var reveal = new THREE.Mesh(
        new THREE.BoxGeometry(artW + 0.5, artH + 0.5, 0.34), revM);
      reveal.position.set(0, 0, 0.06); art.add(reveal);

      /* the art plane itself — unlit basic material so the painting shows true */
      var artMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      var artMesh = new THREE.Mesh(new THREE.PlaneGeometry(artW, artH), artMat);
      artMesh.position.set(0, 0, 0.24); art.add(artMesh);
      try {
        new THREE.TextureLoader().load('/assets/interiors/' + cfg.file, function (tex) {
          if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;   /* correct gamma */
          artMat.map = tex; artMat.needsUpdate = true;
        });
      } catch (e) { /* headless / no loader → frame still renders */ }

      /* soft accent sconce that grazes the canvas (in front, angled down) */
      var sconce = new THREE.PointLight(accent, 0.55, 26);
      sconce.position.set(wallX + 7, cy + 5, cz);   /* out in the room, above */
      group.add(sconce);

      group.add(art);
    }

    /* ────────────────────────────────────────────────────────────────────────
       THEMED PROP BUILDERS
       Each receives (group, accent) and pushes animatable objects onto
       group.userData.animObjs = [{ mesh, axis, speed }]
       and stores group.userData.motes for particle updates.
    ──────────────────────────────────────────────────────────────────────── */
    var propBuilders = {

      /* ── SHADDAI — golden throne room ── */
      throneRoom: function (group, accent) {
        group.userData.animObjs = [];

        /* --- raised dais (3 steps) --- */
        var daisM = mat(0x1a1200, accent, 0.08, 0.50, 0.35);
        var stepSizes = [[32, 2.0, 28], [24, 1.5, 20], [16, 1.0, 13]];
        var stepY = 0;
        for (var si = 0; si < stepSizes.length; si++) {
          var ss  = stepSizes[si];
          var stp = new THREE.Mesh(new THREE.BoxGeometry(ss[0], ss[1], ss[2]), daisM.clone());
          stepY += ss[1];
          stp.position.set(0, stepY - ss[1]/2, -18);
          group.add(stp);
        }
        var daisTop = stepY; /* y of dais surface = 4.5 */

        /* --- grand throne --- */
        var thM = mat(0x1a0e00, accent, 0.16, 0.30, 0.70);
        glow(thM, 0.14, 1.5, 0.10);
        /* seat */
        var seat = new THREE.Mesh(new THREE.BoxGeometry(8, 2.8, 5.5), thM.clone());
        seat.position.set(0, daisTop + 1.4, -18); group.add(seat);
        /* high back */
        var back = new THREE.Mesh(new THREE.BoxGeometry(8, 16, 1.2), thM.clone());
        back.position.set(0, daisTop + 10.8, -21); group.add(back);
        /* armrests */
        var arM = mat(0x241400, accent, 0.12, 0.35, 0.65);
        [[-4.2, daisTop+2.6], [4.2, daisTop+2.6]].forEach(function (p) {
          var ar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 5.5), arM.clone());
          ar.position.set(p[0], p[1], -18); group.add(ar);
        });
        /* crown finials on throne top */
        var finM = mat(accent, accent, 0.35, 0.20, 0.80);
        glow(finM, 0.30, 0.4, 0.12);
        var finPos = [[-3, daisTop + 19.5, -21], [0, daisTop + 20.5, -21], [3, daisTop + 19.5, -21]];
        for (var fi = 0; fi < finPos.length; fi++) {
          var fin = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 6), finM.clone());
          fin.position.set(finPos[fi][0], finPos[fi][1], finPos[fi][2]);
          group.add(fin);
        }

        /* --- banner drapes flanking throne --- */
        var bannerM = mat(0x5a0010, accent, 0.07, 0.95, 0);
        [[-12, -19], [12, -19]].forEach(function (p) {
          var ban = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 14), bannerM.clone());
          ban.position.set(p[0], daisTop + 9, p[1]);
          group.add(ban);
          /* gold border strip */
          var bord = new THREE.Mesh(new THREE.BoxGeometry(0.3, 14, 0.2),
            mat(accent, accent, 0.20, 0.40, 0.65));
          bord.position.set(p[0] + 2.35, daisTop + 9, p[1]);
          group.add(bord);
        });

        /* --- floor sigil (Star of David) --- */
        var sigM = mat(accent, accent, 0.22, 0.9, 0, true, 0.30);
        glow(sigM, 0.20, 0.3, 0.08);
        for (var ri = 1; ri <= 4; ri++) {
          var ring = new THREE.Mesh(new THREE.RingGeometry(ri*7.5-1, ri*7.5, 48), sigM.clone());
          ring.rotation.x = -Math.PI/2; ring.position.set(0, 0.06, -18);
          ring.renderOrder = 1; group.add(ring);
        }
        /* star arms */
        for (var arm = 0; arm < 6; arm++) {
          var aRad = arm * Math.PI / 3;
          var armM = mat(accent, accent, 0.18, 0.9, 0, true, 0.22);
          var armP = new THREE.Mesh(new THREE.PlaneGeometry(2, 28), armM);
          armP.rotation.x = -Math.PI/2; armP.rotation.z = aRad;
          armP.position.set(0, 0.07, -18); armP.renderOrder = 1;
          group.add(armP);
        }

        /* --- animated CROWN RINGS floating above throne --- */
        var crownM  = mat(accent, accent, 0.38, 0.18, 0.85);
        glow(crownM, 0.32, 0.5, 0.12);
        var crownR1 = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.28, 8, 40), crownM);
        crownR1.position.set(0, daisTop + 22, -21); crownR1.rotation.x = Math.PI/2;
        group.add(crownR1);
        group.userData.animObjs.push({ mesh: crownR1, axis: 'y', speed: 0.38 });
        var crownM2 = mat(accent, accent, 0.28, 0.22, 0.80);
        glow(crownM2, 0.24, 1.8, 0.10);
        var crownR2 = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.20, 8, 32), crownM2);
        crownR2.position.set(0, daisTop + 22, -21); crownR2.rotation.x = Math.PI/3;
        group.add(crownR2);
        group.userData.animObjs.push({ mesh: crownR2, axis: 'y', speed: -0.26 });
        /* glowing SHADDAI orb at crown center */
        var cOrbM = mat(accent, accent, 0.42, 0.20, 0.05);
        glow(cOrbM, 0.36, 2.2, 0.12);
        var cOrb  = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10), cOrbM);
        cOrb.position.set(0, daisTop + 22, -21); group.add(cOrb);
        group.userData.animObjs.push({ mesh: cOrb, axis: 'y', speed: 0.55 });

        /* --- columns --- */
        column(group, accent, -20, -10);
        column(group, accent,  20, -10);
        column(group, accent, -20,  12);
        column(group, accent,  20,  12);
        column(group, accent, -28, -24);
        column(group, accent,  28, -24);

        /* --- light shafts from ceiling --- */
        buildShaft(group, -12, -18, 0.5, 3, ROOM_H, 0xffd060, 0.045);
        buildShaft(group,   0, -14, 0.5, 3.5, ROOM_H, 0xffcf4a, 0.055);
        buildShaft(group,  12, -18, 0.5, 3, ROOM_H, 0xffd060, 0.045);

        wallPanels(group, accent, 5);

        /* --- PROCESSIONAL FLOOR RUNNER (entrance → dais) ---------------------
           The front/centre floor read empty between the spawn (z≈+28) and the
           throne dais (z=-18). A thin crimson runner + flanking gold inlay strips
           give the walk to the throne purpose. All planes sit flat at y≈0.05 so
           they are purely visual and fully WALKABLE — the spawn→exit path (the
           +Z centreline) is a flat carpet, never blocked. */
        var runnerM = new THREE.MeshBasicMaterial({
          color: 0x3a0008, transparent: true, opacity: 0.55, depthWrite: false,
        });
        var runner  = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 44), runnerM);
        runner.rotation.x = -Math.PI / 2;
        runner.position.set(0, 0.045, 4);     /* from ~z+26 back to the dais front */
        runner.renderOrder = 1; group.add(runner);
        /* gold trim strips down both edges of the runner (thin, glowing) */
        var runTrimM = mat(accent, accent, 0.16, 0.7, 0.1, true, 0.42);
        glow(runTrimM, 0.14, 0.4, 0.06);
        [-3.9, 3.9].forEach(function (rx) {
          var rt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 44), runTrimM.clone());
          rt.rotation.x = -Math.PI / 2;
          rt.position.set(rx, 0.05, 4); rt.renderOrder = 2; group.add(rt);
        });

        /* --- FLANKING BRAZIERS (two, seated on the floor, off the walk path) ---
           Well-proportioned: 1.5-tall bowl on a stem, ember orb on top → ~3.2 tall,
           placed at x=±16 (clear of the 7.5-wide runner and the tool row). */
        var brzStemM = mat(0x141008, accent, 0.08, 0.5, 0.4);
        var brzBowlM = mat(0x1a1200, accent, 0.16, 0.4, 0.55);
        glow(brzBowlM, 0.14, 1.0, 0.08);
        var brzEmberM = mat(0xffb040, 0xffb040, 0.42, 0.3, 0.05);
        glow(brzEmberM, 0.36, 0.6, 0.12);
        [[-16, 6], [16, 6], [-16, -8], [16, -8]].forEach(function (bp, bi) {
          var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 2.2, 8), brzStemM.clone());
          stem.position.set(bp[0], 1.1, bp[1]); group.add(stem);
          var bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.8, 0.9, 10), brzBowlM.clone());
          bowl.position.set(bp[0], 2.5, bp[1]); group.add(bowl);
          var ember = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), brzEmberM.clone());
          ember.position.set(bp[0], 3.0, bp[1]); group.add(ember);
        });

        /* TOOLS — SHADDAI's council of decisions (front-of-room, faces the entrant) */
        buildToolRow(group, accent, ['STRATEGY', 'DECREE', 'COUNCIL', 'VISION', 'LAUNCH'], 12, 0);

        buildNameLabel(group, 'SHADDAI', accent);

        /* --- golden ember motes --- */
        group.userData.motes = buildMotes(group, 0xffd060, 60, false);
      },

      /* ── NEXUS — PORTAL LOUNGE ── */
      serverRoom: function (group, accent) {
        group.userData.animObjs = [];

        /* ── PALETTE / CONSTANTS ─────────────────────────────────────────── */
        var TEAL = accent;   /* 0x34e5b0 */
        var PW   = 7.0;      /* portal clear width  */
        var PH   = 11.5;     /* portal clear height */
        var JT   = 0.70;     /* jamb / header thickness */
        var OFF  = 0.20;     /* stand-off from wall surface */

        /* 12 unique portal fill colours */
        var PCOLS = [
          0x34e5b0, 0x7c3aed, 0xff6b35, 0x00d4ff,
          0xff3366, 0xf59e0b, 0x10b981, 0x3b82f6,
          0xa855f7, 0xef4444, 0x14b8a6, 0xfbbf24
        ];

        /* ── 12 PORTAL DEFINITIONS ───────────────────────────────────────── */
        /*  ry = 0      → normal +Z  (back wall,  z ≈ -40)                   */
        /*  ry = +π/2   → normal +X  (left wall,  x ≈ -40)                   */
        /*  ry = -π/2   → normal -X  (right wall, x ≈ +40)                   */
        var BW = -ROOM_D / 2 + 0.72;   /* back wall portal z  */
        var LW = -ROOM_W / 2 + 0.72;   /* left wall portal x  */
        var RW =  ROOM_W / 2 - 0.72;   /* right wall portal x */
        var pDefs = [
          /* Back wall — PORTAL 01-04 */
          { x: -27, z: BW, ry: 0 },
          { x:  -9, z: BW, ry: 0 },
          { x:   9, z: BW, ry: 0 },
          { x:  27, z: BW, ry: 0 },
          /* Left wall — PORTAL 05-08 */
          { x: LW, z: -24, ry:  Math.PI / 2 },
          { x: LW, z:  -8, ry:  Math.PI / 2 },
          { x: LW, z:   8, ry:  Math.PI / 2 },
          { x: LW, z:  24, ry:  Math.PI / 2 },
          /* Right wall — PORTAL 09-12 */
          { x: RW, z: -24, ry: -Math.PI / 2 },
          { x: RW, z:  -8, ry: -Math.PI / 2 },
          { x: RW, z:   8, ry: -Math.PI / 2 },
          { x: RW, z:  24, ry: -Math.PI / 2 },
        ];
        var NP = 12;

        /* ── PORTAL FRAME INSTANCED MESHES ──────────────────────────────── */
        var jambGeo  = new THREE.BoxGeometry(JT, PH + JT, JT);
        var hdGeo    = new THREE.BoxGeometry(PW + JT * 2, JT, JT);
        var rimVGeo  = new THREE.BoxGeometry(0.10, PH, 0.10);        /* inner vert rim */
        var rimHGeo  = new THREE.BoxGeometry(PW, 0.10, 0.10);        /* inner top rim  */
        var frmM     = mat(0x0a0f10, 0x1a3030, 0.06, 0.35, 0.82);
        var rimM     = mat(TEAL, TEAL, 0.38, 0.40, 0.10);
        glow(rimM, 0.32, 0, 0.12);

        var jambIM  = new THREE.InstancedMesh(jambGeo, frmM, NP * 2);
        var hdIM    = new THREE.InstancedMesh(hdGeo,   frmM, NP);
        var rimVIM  = new THREE.InstancedMesh(rimVGeo, rimM, NP * 2);
        var rimHIM  = new THREE.InstancedMesh(rimHGeo, rimM, NP);

        var jY  = PH / 2 + JT / 2;   /* jamb centre Y   */
        var hdY = PH + JT / 2;        /* header centre Y */

        for (var pi = 0; pi < NP; pi++) {
          var pd   = pDefs[pi];
          var cosR = Math.cos(pd.ry);
          var sinR = Math.sin(pd.ry);
          /* local-x offsets for jambs / rims:
             world Δx = localX * cosR,  world Δz = -localX * sinR  */
          var lx  = -(PW / 2 + JT / 2);    /* left jamb  local-x */
          var rx  =  (PW / 2 + JT / 2);    /* right jamb local-x */
          var lrx = -(PW / 2) + 0.05;      /* inner-left  rim    */
          var rrx =  (PW / 2) - 0.05;      /* inner-right rim    */

          dum.position.set(pd.x + cosR * lx, jY, pd.z - sinR * lx);
          dum.rotation.set(0, pd.ry, 0); dum.updateMatrix();
          jambIM.setMatrixAt(pi * 2, dum.matrix);

          dum.position.set(pd.x + cosR * rx, jY, pd.z - sinR * rx);
          dum.rotation.set(0, pd.ry, 0); dum.updateMatrix();
          jambIM.setMatrixAt(pi * 2 + 1, dum.matrix);

          dum.position.set(pd.x, hdY, pd.z);
          dum.rotation.set(0, pd.ry, 0); dum.updateMatrix();
          hdIM.setMatrixAt(pi, dum.matrix);

          dum.position.set(pd.x + cosR * lrx, jY, pd.z - sinR * lrx);
          dum.rotation.set(0, pd.ry, 0); dum.updateMatrix();
          rimVIM.setMatrixAt(pi * 2, dum.matrix);

          dum.position.set(pd.x + cosR * rrx, jY, pd.z - sinR * rrx);
          dum.rotation.set(0, pd.ry, 0); dum.updateMatrix();
          rimVIM.setMatrixAt(pi * 2 + 1, dum.matrix);

          dum.position.set(pd.x, PH + 0.05, pd.z);
          dum.rotation.set(0, pd.ry, 0); dum.updateMatrix();
          rimHIM.setMatrixAt(pi, dum.matrix);

          /* per-portal fill plane — unique colour, must be individual mesh   */
          var pCol   = PCOLS[pi];
          var fillM  = new THREE.MeshBasicMaterial({
            color: pCol, transparent: true, opacity: 0.15,
            depthWrite: false, blending: THREE.AdditiveBlending,
          });
          /* local +Z in world = (sinR, 0, cosR) → offset away from wall     */
          var fillPl = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.1, PH), fillM);
          fillPl.position.set(pd.x + sinR * OFF, PH / 2 + JT / 2, pd.z + cosR * OFF);
          fillPl.rotation.y = pd.ry;
          group.add(fillPl);

          /* "PORTAL 01" … "PORTAL 12" label above each frame */
          try {
            var numStr = (pi + 1 < 10 ? '0' : '') + (pi + 1);
            var lCv  = document.createElement('canvas'); lCv.width = 256; lCv.height = 48;
            var lCtx = lCv.getContext('2d');
            lCtx.clearRect(0, 0, 256, 48);
            lCtx.font = 'bold 20px monospace';
            lCtx.textAlign = 'center'; lCtx.textBaseline = 'middle';
            lCtx.fillStyle = '#' + pCol.toString(16).padStart(6, '0');
            lCtx.fillText('PORTAL ' + numStr, 128, 24);
            var lbMsh = new THREE.Mesh(
              new THREE.PlaneGeometry(5, 0.94),
              new THREE.MeshBasicMaterial({
                map: new THREE.CanvasTexture(lCv),
                transparent: true, depthWrite: false
              })
            );
            lbMsh.position.set(
              pd.x + sinR * (OFF + 0.18),
              hdY + 1.3,
              pd.z + cosR * (OFF + 0.18)
            );
            lbMsh.rotation.y = pd.ry;
            group.add(lbMsh);
          } catch (e) { /* headless */ }
        }

        jambIM.instanceMatrix.needsUpdate  = true;
        hdIM.instanceMatrix.needsUpdate    = true;
        rimVIM.instanceMatrix.needsUpdate  = true;
        rimHIM.instanceMatrix.needsUpdate  = true;
        group.add(jambIM); group.add(hdIM);
        group.add(rimVIM); group.add(rimHIM);

        /* ── LOUNGE SEATING (centre-front zone) ─────────────────────────── */
        var LCX = 0, LCZ = 8;   /* lounge centre */

        var sofaBaseGeo = new THREE.BoxGeometry(8, 1.2, 2.8);
        var sofaBackGeo = new THREE.BoxGeometry(8, 2.0, 0.55);
        var seatM       = mat(0x0d1a16, TEAL, 0.04, 0.90, 0.04);
        var cshM        = mat(0x0f201a, TEAL, 0.03, 0.92, 0);
        var sofaIM      = new THREE.InstancedMesh(sofaBaseGeo, seatM, 4);
        var backIM      = new THREE.InstancedMesh(sofaBackGeo, cshM,  4);

        /* teal LED accent strip along top of each sofa back */
        var sAccGeo = new THREE.BoxGeometry(8, 0.14, 0.08);
        var sAccM   = mat(TEAL, TEAL, 0.38, 0.40, 0.10);
        glow(sAccM, 0.32, 1.5, 0.10);
        var sAccIM  = new THREE.InstancedMesh(sAccGeo, sAccM, 4);

        /*  sDefs: ry=0 → sofa faces +Z; local -Z = back-rest direction
         *  back-rest world offset = (-sinRy*1.4, 0, -cosRy*1.4)            */
        var sDefs = [
          { x: LCX,     z: LCZ - 8, ry: 0            },   /* S face +Z */
          { x: LCX,     z: LCZ + 8, ry: Math.PI      },   /* N face -Z */
          { x: LCX - 8, z: LCZ,     ry:  Math.PI / 2 },   /* W face +X */
          { x: LCX + 8, z: LCZ,     ry: -Math.PI / 2 },   /* E face -X */
        ];
        for (var si = 0; si < 4; si++) {
          var sd  = sDefs[si];
          var cS  = Math.cos(sd.ry), sS = Math.sin(sd.ry);
          var bx  = sd.x - sS * 1.4;
          var bz  = sd.z - cS * 1.4;

          dum.position.set(sd.x, 0.6, sd.z);
          dum.rotation.set(0, sd.ry, 0); dum.updateMatrix();
          sofaIM.setMatrixAt(si, dum.matrix);

          dum.position.set(bx, 1.75, bz);
          dum.rotation.set(0, sd.ry, 0); dum.updateMatrix();
          backIM.setMatrixAt(si, dum.matrix);

          dum.position.set(bx, 2.82, bz);
          dum.rotation.set(0, sd.ry, 0); dum.updateMatrix();
          sAccIM.setMatrixAt(si, dum.matrix);
        }
        sofaIM.instanceMatrix.needsUpdate = true;
        backIM.instanceMatrix.needsUpdate = true;
        sAccIM.instanceMatrix.needsUpdate = true;
        group.add(sofaIM); group.add(backIM); group.add(sAccIM);

        /* ── COFFEE TABLE ────────────────────────────────────────────────── */
        var ctM   = mat(0x081410, TEAL, 0.07, 0.45, 0.45);
        var ctTop = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.18, 4.5), ctM);
        ctTop.position.set(LCX, 0.92, LCZ); group.add(ctTop);
        var ctLegGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6);
        var legPos   = [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]];
        for (var li = 0; li < 4; li++) {
          var cl = new THREE.Mesh(ctLegGeo, ctM.clone());
          cl.position.set(LCX + legPos[li][0], 0.45, LCZ + legPos[li][1]);
          group.add(cl);
        }
        var ctGlM = new THREE.MeshBasicMaterial({
          color: TEAL, transparent: true, opacity: 0.055,
          depthWrite: false, blending: THREE.AdditiveBlending,
        });
        var ctGl = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 4.3), ctGlM);
        ctGl.rotation.x = -Math.PI / 2;
        ctGl.position.set(LCX, 1.0, LCZ); ctGl.renderOrder = 1;
        group.add(ctGl);

        /* ── FLOOR RUG + HEX EMBLEM ──────────────────────────────────────── */
        var rugM = new THREE.MeshBasicMaterial({
          color: 0x091510, transparent: true, opacity: 0.58, depthWrite: false,
        });
        var rug = new THREE.Mesh(new THREE.PlaneGeometry(22, 24), rugM);
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(LCX, 0.02, LCZ); rug.renderOrder = 1;
        group.add(rug);

        /* concentric ring emblem at room centre */
        var embM = mat(TEAL, TEAL, 0.16, 0.9, 0, true, 0.20);
        glow(embM, 0.14, 0.3, 0.08);
        for (var er = 1; er <= 3; er++) {
          var ering = new THREE.Mesh(
            new THREE.RingGeometry(er * 7.5 - 0.5, er * 7.5, 48), embM.clone()
          );
          ering.rotation.x = -Math.PI / 2;
          ering.position.set(0, 0.05, 0); ering.renderOrder = 2;
          group.add(ering);
        }
        var spokeM = mat(TEAL, TEAL, 0.10, 0.9, 0, true, 0.12);
        for (var es = 0; es < 6; es++) {
          var spk = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 22.5), spokeM.clone());
          spk.rotation.x = -Math.PI / 2;
          spk.rotation.z = es * Math.PI / 3;
          spk.position.set(0, 0.06, 0); spk.renderOrder = 2;
          group.add(spk);
        }

        /* ── BAR COUNTER (back-left, z ≈ -16) ───────────────────────────── */
        var BCX = -18, BCZ = -16;
        var barM2    = mat(0x0a1810, TEAL, 0.08, 0.45, 0.40);
        var barBody  = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 2.5), barM2);
        barBody.position.set(BCX, 1.6, BCZ); group.add(barBody);
        var barTopM  = mat(TEAL, TEAL, 0.32, 0.40, 0.15);
        glow(barTopM, 0.28, 2.0, 0.10);
        var barTop   = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.14, 2.7), barTopM);
        barTop.position.set(BCX, 3.27, BCZ); group.add(barTop);
        var bkShelf  = new THREE.Mesh(
          new THREE.BoxGeometry(14, 8, 0.4),
          mat(0x060e0c, TEAL, 0.05, 0.80, 0.15)
        );
        bkShelf.position.set(BCX, 6, BCZ - 1.5); group.add(bkShelf);

        /* glowing bottles on shelf (varied colours — individual meshes) */
        var btlCols = [0x00ddff, 0x00ff88, 0xffaa00, 0xff3366,
                       0x44aaff, 0x88ff44, 0xff7700, 0x9933ff];
        var btlGeo  = new THREE.CylinderGeometry(0.28, 0.32, 1.8, 6);
        for (var btl = 0; btl < 8; btl++) {
          var bM2 = mat(btlCols[btl], btlCols[btl], 0.28, 0.60, 0.10, true, 0.85);
          glow(bM2, 0.22, btl * 0.35, 0.08);
          var btlMsh = new THREE.Mesh(btlGeo, bM2);
          btlMsh.position.set(BCX - 5.5 + btl * 1.58, 5.5, BCZ - 1.2);
          group.add(btlMsh);
        }

        /* bar stools (InstancedMesh, 5) */
        var stoolIM = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.7, 0.55, 2.5, 8),
          mat(0x0d1a14, TEAL, 0.04, 0.72, 0.22),
          5
        );
        for (var stl = 0; stl < 5; stl++) {
          dum.position.set(BCX - 6 + stl * 3, 1.25, BCZ + 2.2);
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          stoolIM.setMatrixAt(stl, dum.matrix);
        }
        stoolIM.instanceMatrix.needsUpdate = true;
        group.add(stoolIM);

        /* ── PLANTERS — four corners ─────────────────────────────────────── */
        var potGeo  = new THREE.CylinderGeometry(2.4, 1.9, 3.0, 10);
        var potM    = mat(0x0a1810, TEAL, 0.05, 0.78, 0.18);
        var potIM   = new THREE.InstancedMesh(potGeo, potM, 4);
        var pltPos  = [[-31, 28], [31, 28], [-31, -28], [31, -28]];
        for (var pk = 0; pk < 4; pk++) {
          dum.position.set(pltPos[pk][0], 1.5, pltPos[pk][1]);
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          potIM.setMatrixAt(pk, dum.matrix);
        }
        potIM.instanceMatrix.needsUpdate = true;
        group.add(potIM);
        var gCols = [0x22cc66, 0x33bb55, 0x11aa44, 0x44cc44];
        for (var gk = 0; gk < 4; gk++) {
          var gfM = mat(gCols[gk], gCols[gk], 0.10, 0.95, 0, true, 0.80);
          glow(gfM, 0.08, gk * 0.6, 0.06);
          var gf  = new THREE.Mesh(new THREE.SphereGeometry(2.7, 10, 7), gfM);
          gf.position.set(pltPos[gk][0], 4.7, pltPos[gk][1]); group.add(gf);
        }

        /* ── CHAT KIOSK ──────────────────────────────────────────────────── */
        var KX = 5.5, KZ = LCZ - 2.5;
        var kbM   = mat(0x081210, TEAL, 0.08, 0.40, 0.65);
        var kBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 1.4), kbM.clone());
        kBase.position.set(KX, 0.14, KZ); group.add(kBase);
        var kPole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.8, 8), kbM.clone());
        kPole.position.set(KX, 2.04, KZ); group.add(kPole);

        /* the hookable screen — chatKiosk = true lets the lead wire click/E */
        var kScrM = mat(0x00ffcc, 0x00ffcc, 0.42, 0.75, 0.05);
        glow(kScrM, 0.36, 3.5, 0.10);
        var kScr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.12), kScrM);
        kScr.position.set(KX, 4.88, KZ - 0.12);
        kScr.name = 'nexus-chat-kiosk';
        kScr.userData.chatKiosk = true;
        group.add(kScr);

        var kFrmM = mat(0x0d2020, TEAL, 0.16, 0.35, 0.75);
        glow(kFrmM, 0.13, 3.2, 0.08);
        var kFrm  = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.08), kFrmM);
        kFrm.position.set(KX, 4.88, KZ - 0.07); group.add(kFrm);

        try {
          var kCv  = document.createElement('canvas'); kCv.width = 256; kCv.height = 128;
          var kCtx = kCv.getContext('2d');
          kCtx.clearRect(0, 0, 256, 128);
          kCtx.fillStyle = 'rgba(0,255,200,0.07)';
          kCtx.fillRect(0, 0, 256, 128);
          kCtx.font = 'bold 42px monospace';
          kCtx.textAlign = 'center'; kCtx.textBaseline = 'middle';
          kCtx.fillStyle = '#00ffcc';
          kCtx.fillText('[ CHAT ]', 128, 52);
          kCtx.font = '15px monospace';
          kCtx.fillStyle = 'rgba(0,255,200,0.62)';
          kCtx.fillText('press E to open', 128, 98);
          var kLbl = new THREE.Mesh(
            new THREE.PlaneGeometry(1.7, 0.85),
            new THREE.MeshBasicMaterial({
              map: new THREE.CanvasTexture(kCv), transparent: true, depthWrite: false,
            })
          );
          kLbl.position.set(KX, 4.88, KZ - 0.22); group.add(kLbl);
        } catch (e) { /* headless */ }

        /* ── ATMOSPHERE ──────────────────────────────────────────────────── */
        buildShaft(group, LCX, LCZ,  0.5, 5.0, ROOM_H, TEAL,    0.042);
        buildShaft(group, BCX, BCZ,  0.4, 3.0, ROOM_H, 0x00ffaa, 0.030);
        buildShaft(group, 0,   -24,  0.3, 4.5, ROOM_H, TEAL,    0.032);

        buildCeilGrid(group, TEAL, 4, 8);

        /* teal motes rise softly — lounge vibe, not data-rain */
        group.userData.motes = buildMotes(group, TEAL, 60, false);

        /* TOOLS — NEXUS's backend/infra stations (front-right open lane) */
        buildToolRow(group, TEAL, ['DEPLOY', 'API FORGE', 'DATABASE', 'SCALE', 'LOGS'], 24, 0);

        buildNameLabel(group, 'NEXUS — PORTAL LOUNGE', TEAL);
      },

      /* ── QUILL — scriptorium / library ── */
      scriptorium: function (group, accent) {
        group.userData.animObjs = [];

        /* --- FLOOR-TO-CEILING bookshelves (InstancedMesh, 7 per side wall) --- */
        var shelfGeo = new THREE.BoxGeometry(2.5, ROOM_H - 1.5, 6.5);
        var shelfM   = mat(0x0e0820, accent, 0.06, 0.95, 0);
        var shelfIM  = new THREE.InstancedMesh(shelfGeo, shelfM, 14);
        var xSides   = [-ROOM_W/2 + 2.0, ROOM_W/2 - 2.0];
        var shIdx    = 0;
        for (var ws = 0; ws < 2; ws++) {
          for (var sr = 0; sr < 7; sr++) {
            dum.position.set(xSides[ws], (ROOM_H - 1.5) * 0.5, -27 + sr * 9);
            dum.rotation.set(0, 0, 0); dum.updateMatrix();
            shelfIM.setMatrixAt(shIdx++, dum.matrix);
          }
        }
        shelfIM.instanceMatrix.needsUpdate = true;
        group.add(shelfIM);

        /* shelf level strips glowing accent (InstancedMesh) */
        var sdGeo = new THREE.BoxGeometry(6.4, 0.22, 0.35);
        var sdM   = mat(accent, accent, 0.14, 0.65, 0.20);
        glow(sdM, 0.12, 0.8, 0.07);
        var SHELF_LEVELS = 6;
        var sdIM  = new THREE.InstancedMesh(sdGeo, sdM, 14 * SHELF_LEVELS);
        var sdIdx = 0;
        for (var ws2 = 0; ws2 < 2; ws2++) {
          for (var sr2 = 0; sr2 < 7; sr2++) {
            for (var sl = 0; sl < SHELF_LEVELS; sl++) {
              dum.position.set(xSides[ws2], 2.2 + sl * 3.0, -27 + sr2 * 9);
              dum.rotation.set(0, 0, 0); dum.updateMatrix();
              sdIM.setMatrixAt(sdIdx++, dum.matrix);
            }
          }
        }
        sdIM.instanceMatrix.needsUpdate = true;
        group.add(sdIM);

        /* --- BOOK SPINES filling the side-wall shelves (one InstancedMesh + per-instance
               colour). This is what makes the shelves read as a real, stocked library
               rather than empty boxes. ~504 books, single draw call. --- */
        var bookGeo = new THREE.BoxGeometry(1.5, 2.4, 0.55);   /* depthX · heightY · spineZ */
        var bookM   = mat(0xffffff, accent, 0.03, 0.94, 0.03); /* white base × instanceColor */
        var BK_SPN = 6, BK_LV = 6;
        var stripYs = [2.2, 5.2, 8.2, 11.2, 14.2, 17.2];       /* matches shelf-level strips */
        var bookPal = [0x7a1e1e, 0x1e3a5a, 0x264d2a, 0x5a3a12, 0x4a1e4a,
                       0x8a6a1e, 0x2a2a4a, 0x6a2a2a, 0x1e4a4a, 0x9a7a2a];
        var sideBookIM = new THREE.InstancedMesh(bookGeo, bookM, 2 * 7 * BK_LV * BK_SPN);
        var bkI = 0, bkC = new THREE.Color();
        for (var bkSide = 0; bkSide < 2; bkSide++) {
          var bkX = (bkSide === 0) ? (-ROOM_W / 2 + 2 + 2.9) : (ROOM_W / 2 - 2 - 2.9);
          for (var bkR = 0; bkR < 7; bkR++) {
            var bkZc = -27 + bkR * 9;
            for (var bkL = 0; bkL < BK_LV; bkL++) {
              for (var bkS = 0; bkS < BK_SPN; bkS++) {
                var bkSeed = Math.sin(bkI * 12.9898) * 43758.5453; bkSeed -= Math.floor(bkSeed);
                var bkH = 0.72 + bkSeed * 0.5;   /* vary book height 0.72..1.22 */
                var bkZ = bkZc - 2.7 + bkS * (5.4 / (BK_SPN - 1)) + (bkSeed - 0.5) * 0.22;
                dum.position.set(bkX, stripYs[bkL] + 0.12 + 2.4 * bkH * 0.5, bkZ);
                dum.rotation.set(0, 0, (bkSeed - 0.5) * 0.12);
                dum.scale.set(1, bkH, 1);
                dum.updateMatrix();
                sideBookIM.setMatrixAt(bkI, dum.matrix);
                sideBookIM.setColorAt(bkI, bkC.setHex(bookPal[(bkI * 7) % bookPal.length]));
                bkI++;
              }
            }
          }
        }
        dum.scale.set(1, 1, 1);   /* IMPORTANT: reset shared scratch scale for later builders */
        sideBookIM.instanceMatrix.needsUpdate = true;
        if (sideBookIM.instanceColor) sideBookIM.instanceColor.needsUpdate = true;
        group.add(sideBookIM);

        /* --- grand bookcase back wall (full height) --- */
        var bcM = mat(0x0c0818, accent, 0.07, 0.92, 0);
        var bc  = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 8, ROOM_H - 1, 2.2), bcM);
        bc.position.set(0, (ROOM_H - 1) * 0.5, -ROOM_D/2 + 1.6); group.add(bc);

        /* bookcase shelf dividers (horizontal, instanced) */
        var bcShGeo = new THREE.BoxGeometry(ROOM_W - 10, 0.28, 2.4);
        var bcShM   = mat(0x1a1030, accent, 0.10, 0.80, 0.05);
        glow(bcShM, 0.08, 1.2, 0.06);
        var bcShIM  = new THREE.InstancedMesh(bcShGeo, bcShM, 7);
        for (var bcs = 0; bcs < 7; bcs++) {
          dum.position.set(0, 2.5 + bcs * 2.8, -ROOM_D/2 + 1.6);
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          bcShIM.setMatrixAt(bcs, dum.matrix);
        }
        bcShIM.instanceMatrix.needsUpdate = true;
        group.add(bcShIM);

        /* books lining the grand back bookcase (face +Z, one InstancedMesh) */
        var bbGeo = new THREE.BoxGeometry(0.55, 2.2, 1.3);   /* spineX · heightY · depthZ */
        var bbM   = mat(0xffffff, accent, 0.03, 0.94, 0.03);
        var BB_PER = 26, BB_SH = 7;
        var bbShelfY = [2.5, 5.3, 8.1, 10.9, 13.7, 16.5, 19.3];
        var backBookIM = new THREE.InstancedMesh(bbGeo, bbM, BB_SH * BB_PER);
        var bbI = 0, bbC = new THREE.Color();
        for (var bbS = 0; bbS < BB_SH; bbS++) {
          for (var bbK = 0; bbK < BB_PER; bbK++) {
            var bbSeed = Math.sin(bbI * 78.233) * 43758.5453; bbSeed -= Math.floor(bbSeed);
            var bbH = 0.74 + bbSeed * 0.46;
            var bbX = -32.5 + bbK * (65 / (BB_PER - 1)) + (bbSeed - 0.5) * 0.25;
            dum.position.set(bbX, bbShelfY[bbS] + 1.55 + 2.2 * bbH * 0.5, -ROOM_D / 2 + 1.6 + 1.35);
            dum.rotation.set(0, 0, (bbSeed - 0.5) * 0.10);
            dum.scale.set(1, bbH, 1);
            dum.updateMatrix();
            backBookIM.setMatrixAt(bbI, dum.matrix);
            backBookIM.setColorAt(bbI, bbC.setHex(bookPal[(bbI * 3 + 4) % bookPal.length]));
            bbI++;
          }
        }
        dum.scale.set(1, 1, 1);
        backBookIM.instanceMatrix.needsUpdate = true;
        if (backBookIM.instanceColor) backBookIM.instanceColor.needsUpdate = true;
        group.add(backBookIM);

        /* stained-glass light on LEFT and RIGHT walls (visible over bookshelves) */
        var winCols = [0xff3366, 0xffaa00, 0xb98cff, 0x33ccff, 0x66ff66];
        for (var wc = 0; wc < 5; wc++) {
          var wML = new THREE.MeshBasicMaterial({
            color: winCols[wc], transparent: true, opacity: 0.22,
            depthWrite: false, blending: THREE.AdditiveBlending,
          });
          var wpL = new THREE.Mesh(new THREE.PlaneGeometry(7, 14), wML);
          wpL.rotation.y = Math.PI / 2;
          wpL.position.set(-ROOM_W/2 + 0.5, 13, -24 + wc * 12);
          group.add(wpL);
          var wpR = new THREE.Mesh(new THREE.PlaneGeometry(7, 14), wML.clone());
          wpR.rotation.y = -Math.PI / 2;
          wpR.position.set(ROOM_W/2 - 0.5, 13, -24 + wc * 12);
          group.add(wpR);
          /* coloured light shaft from each window */
          buildShaft(group, -ROOM_W/2 + 8, -24 + wc * 12, 0.15, 2.0, ROOM_H * 0.8, winCols[wc], 0.028);
        }

        /* --- reading desks (5, instanced) + parchments + desk lamps --- */
        var deskGeo = new THREE.BoxGeometry(8, 1, 4.5);
        var deskM   = mat(0x12100a, accent, 0.05, 0.82, 0.04);
        var deskIM  = new THREE.InstancedMesh(deskGeo, deskM, 5);
        for (var dk = 0; dk < 5; dk++) {
          dum.position.set(-16 + dk * 8, 1, 8); dum.rotation.set(0,0,0); dum.updateMatrix();
          deskIM.setMatrixAt(dk, dum.matrix);
        }
        deskIM.instanceMatrix.needsUpdate = true;
        group.add(deskIM);

        /* parchment scrolls on desks */
        var parchM = mat(0xf0e6c8, accent, 0.03, 1, 0);
        for (var pk = 0; pk < 5; pk++) {
          var pa = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.8), parchM.clone());
          pa.rotation.x = -Math.PI/2; pa.position.set(-16 + pk*8, 1.52, 8); group.add(pa);
        }

        /* desk lamps (pole + shade, 5) */
        var lampPoleM  = mat(0x1a1200, accent, 0.06, 0.60, 0.30);
        var lampShadeM = mat(0xffee88, 0xffee88, 0.40, 0.80, 0);
        glow(lampShadeM, 0.34, 0, 0.10);
        var lampPoleGeo  = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
        var lampShadeGeo = new THREE.ConeGeometry(0.7, 0.85, 8, 1, true);
        var lpIM = new THREE.InstancedMesh(lampPoleGeo,  lampPoleM,  5);
        var lsIM = new THREE.InstancedMesh(lampShadeGeo, lampShadeM, 5);
        for (var lk = 0; lk < 5; lk++) {
          dum.position.set(-16 + lk*8, 2.25, 7.0); dum.rotation.set(0,0,0); dum.updateMatrix();
          lpIM.setMatrixAt(lk, dum.matrix);
          dum.position.set(-16 + lk*8, 3.15, 7.0); dum.rotation.set(Math.PI, 0, 0); dum.updateMatrix();
          lsIM.setMatrixAt(lk, dum.matrix);
        }
        lpIM.instanceMatrix.needsUpdate = true; lsIM.instanceMatrix.needsUpdate = true;
        group.add(lpIM); group.add(lsIM);

        /* --- HERO: giant quill on pedestal at room center --- */
        var qPedM  = mat(0x1a1200, accent, 0.10, 0.50, 0.40);
        var qPed   = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 1.2, 12), qPedM);
        qPed.position.set(0, 0.6, -4); group.add(qPed);
        var qPedCap = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.3, 12), qPedM.clone());
        qPedCap.position.set(0, 1.35, -4); group.add(qPedCap);

        /* ink well at quill base */
        var inkM = mat(0x0a0618, accent, 0.16, 0.40, 0.50);
        glow(inkM, 0.14, 1.5, 0.08);
        var ink  = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 1.5, 12), inkM);
        ink.position.set(0, 2.05, -4); group.add(ink);
        var inkSurfM = new THREE.MeshBasicMaterial({
          color: accent, transparent: true, opacity: 0.40, depthWrite: false
        });
        var inkSurf = new THREE.Mesh(new THREE.CircleGeometry(0.95, 14), inkSurfM);
        inkSurf.rotation.x = -Math.PI/2; inkSurf.position.set(0, 2.82, -4);
        inkSurf.renderOrder = 1; group.add(inkSurf);

        /* the quill shaft (16 units tall, leaning gracefully) */
        var qM  = mat(0xf0e8d0, accent, 0.06, 0.90, 0);
        var qsh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.34, 16, 7), qM);
        qsh.position.set(0, 11, -4); qsh.rotation.z = 0.18; group.add(qsh);
        /* quill vanes */
        var vaneM = mat(0xe8dfc0, accent, 0.05, 1, 0, true, 0.84);
        var vaneL = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 14), vaneM);
        vaneL.position.set(-2.0, 11, -4); vaneL.rotation.z = 0.18; group.add(vaneL);
        var vaneR = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 14), vaneM.clone());
        vaneR.position.set( 2.0, 11, -4); vaneR.rotation.z = 0.18; group.add(vaneR);
        /* quill glow halo at tip */
        var tipM = mat(accent, accent, 0.42, 0.30, 0.05);
        glow(tipM, 0.36, 2.5, 0.12);
        var tip  = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), tipM);
        tip.position.set(-1.48, 18.8, -4); group.add(tip);

        /* --- CHANDELIER at room ceiling center --- */
        var chanM  = mat(0x1a1200, accent, 0.16, 0.35, 0.70);
        glow(chanM, 0.14, 0.8, 0.10);
        var chanRing = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.28, 8, 28), chanM);
        chanRing.position.set(0, ROOM_H - 1.6, 0); chanRing.rotation.x = Math.PI/2;
        group.add(chanRing);
        var candGeo = new THREE.CylinderGeometry(0.13, 0.16, 1.2, 6);
        var candM   = mat(0xfff8e0, 0xffee66, 0.42, 0.90, 0);
        glow(candM, 0.36, 0, 0.10);
        var candIM  = new THREE.InstancedMesh(candGeo, candM, 12);
        for (var ci = 0; ci < 12; ci++) {
          var ca = ci * Math.PI * 2 / 12;
          dum.position.set(Math.sin(ca)*4.5, ROOM_H - 2.2, Math.cos(ca)*4.5);
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          candIM.setMatrixAt(ci, dum.matrix);
        }
        candIM.instanceMatrix.needsUpdate = true;
        group.add(candIM);

        /* --- floating pages (8, animated) --- */
        var pageCols = [0xf8f0e0, 0xf4ecd8, 0xf0e4d0, 0xeadcc8,
                        0xe8d8c0, 0xf0eae0, 0xece4d4, 0xe4dcc8];
        var pageOffX = [-22, -15, -8,  0,  8, 14, 20, 26];
        var pageOffY = [  6,  9, 13,  7, 11,  5, 14,  8];
        var pageOffZ = [-16, -8,  2,-14, 18, -4, 10, -20];
        for (var fp = 0; fp < 8; fp++) {
          var pgM  = mat(pageCols[fp], accent, 0.04, 1, 0, true, 0.84);
          var pg   = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4.5), pgM);
          pg.position.set(pageOffX[fp], pageOffY[fp], pageOffZ[fp]);
          pg.rotation.set((fp%3-1)*0.28, (fp%5-2)*0.40, (fp%3-1)*0.22);
          group.add(pg);
          group.userData.animObjs.push({
            mesh: pg, axis: 'y', speed: (fp % 2 === 0 ? 1 : -1) * 0.14
          });
        }

        /* --- KNOWLEDGE ORRERY / living index (rotating armillary above the reading floor).
               This is the library's second hero: a glowing catalogue-core wrapped in three
               tilted rings, ringed by six orbiting tomes — "the index that reads itself". --- */
        var koPivot = new THREE.Group();
        koPivot.position.set(0, 13.5, -22);
        var koM   = mat(accent, accent, 0.30, 0.35, 0.55, true, 0.82);
        glow(koM, 0.24, 0.6, 0.12);
        var koCore = new THREE.Mesh(new THREE.SphereGeometry(1.7, 18, 14), koM.clone());
        koPivot.add(koCore);
        var koRingDefs = [
          [4.4, Math.PI / 2, 0],
          [4.4, Math.PI / 3, Math.PI / 4],
          [5.4, Math.PI / 5, -Math.PI / 6],
        ];
        for (var koR = 0; koR < 3; koR++) {
          var koRing = new THREE.Mesh(
            new THREE.TorusGeometry(koRingDefs[koR][0], 0.12, 8, 48), koM.clone());
          koRing.rotation.set(koRingDefs[koR][1], koRingDefs[koR][2], 0);
          koPivot.add(koRing);
        }
        group.add(koPivot);
        group.userData.animObjs.push({ mesh: koPivot, axis: 'y', speed: 0.18 });
        group.userData.animObjs.push({ mesh: koCore, axis: 'y', speed: 0.50 });
        /* six mini-tomes orbiting the index (own counter-rotating pivot) */
        var tomePiv = new THREE.Group();
        tomePiv.position.set(0, 13.5, -22);
        var tomeM = mat(0x2a1840, accent, 0.10, 0.85, 0.05);
        for (var tmk = 0; tmk < 6; tmk++) {
          var tmA  = tmk * Math.PI / 3;
          var tome = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.7, 0.42), tomeM.clone());
          tome.position.set(Math.sin(tmA) * 6.6, (tmk % 3 - 1) * 1.4, Math.cos(tmA) * 6.6);
          tome.rotation.y = tmA;
          tomePiv.add(tome);
        }
        group.add(tomePiv);
        group.userData.animObjs.push({ mesh: tomePiv, axis: 'y', speed: -0.22 });

        /* --- CARD CATALOG / index cabinet (reading-floor left, small drawers) --- */
        var ccM  = mat(0x140e26, accent, 0.06, 0.85, 0.05);
        var ccBody = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 3), ccM);
        ccBody.position.set(-20, 2.25, 20); group.add(ccBody);
        var ccDrwGeo = new THREE.BoxGeometry(1.5, 0.9, 0.2);
        var ccDrwM   = mat(0x241640, accent, 0.14, 0.7, 0.1);
        glow(ccDrwM, 0.10, 1.4, 0.06);
        var ccDrwIM  = new THREE.InstancedMesh(ccDrwGeo, ccDrwM, 16);
        var ccI = 0;
        for (var ccr = 0; ccr < 4; ccr++) {
          for (var ccc = 0; ccc < 4; ccc++) {
            dum.position.set(-20 - 2.4 + ccc * 1.6, 3.6 - ccr * 1.0, 21.55);
            dum.rotation.set(0, 0, 0); dum.updateMatrix();
            ccDrwIM.setMatrixAt(ccI++, dum.matrix);
          }
        }
        ccDrwIM.instanceMatrix.needsUpdate = true;
        group.add(ccDrwIM);

        /* TOOLS — QUILL's writing/communication skills (reading-floor front) */
        buildToolRow(group, accent, ['DRAFT', 'EDIT', 'SUMMARIZE', 'TRANSLATE', 'OUTLINE'], 28, 0);

        /* warm candlelight motes */
        group.userData.motes = buildMotes(group, 0xffc060, 55, false);

        buildNameLabel(group, 'QUILL', accent);
      },

      /* ── ORACLE — arcane library / orrery room ── */
      arcaneLibrary: function (group, accent) {
        group.userData.animObjs = [];

        /* --- six arcane pillars in hex ring --- */
        var hexAngles = [0, 60, 120, 180, 240, 300];
        for (var ha = 0; ha < 6; ha++) {
          var hr = hexAngles[ha] * Math.PI / 180;
          var hx = Math.sin(hr) * 22, hz = Math.cos(hr) * 22;
          column(group, accent, hx, hz);
          /* rune panel facing center */
          var runeM = mat(0x080610, accent, 0.16, 0.65, 0.30, true, 0.88);
          glow(runeM, 0.14, ha * 0.75, 0.10);
          var rune  = new THREE.Mesh(new THREE.PlaneGeometry(6, 11), runeM);
          rune.position.set(hx * 1.28, 8, hz * 1.28);
          rune.lookAt(0, 8, 0); group.add(rune);
        }

        /* --- orrery: central armillary sphere --- */
        var orrM    = mat(accent, accent, 0.32, 0.30, 0.60, true, 0.72);
        glow(orrM, 0.28, 0.5, 0.10);
        var orrCore = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), orrM.clone());
        orrCore.position.set(0, 12, 0); group.add(orrCore);
        group.userData.animObjs.push({ mesh: orrCore, axis: 'y', speed: 0.25 });

        /* three tilted orbital rings at different angles */
        var orrRingDefs = [
          { r: 10, t: 0.32, rx: Math.PI/2, ry: 0,          speed: 0.30 },
          { r: 10, t: 0.25, rx: Math.PI/3, ry: Math.PI/4,  speed: -0.22 },
          { r: 12, t: 0.20, rx: Math.PI/5, ry: -Math.PI/6, speed: 0.18 },
        ];
        for (var or = 0; or < orrRingDefs.length; or++) {
          var ord  = orrRingDefs[or];
          var orrR = new THREE.Mesh(
            new THREE.TorusGeometry(ord.r, ord.t, 8, 56),
            orrM.clone()
          );
          orrR.position.set(0, 12, 0);
          orrR.rotation.set(ord.rx, ord.ry, 0);
          group.add(orrR);
          group.userData.animObjs.push({ mesh: orrR, axis: 'y', speed: ord.speed });
        }

        /* --- PLANET ORBS orbiting the orrery (pivot groups) --- */
        var planetDefs = [
          { r: 8,  speed:  0.52, size: 0.55, col: 0x4488ff },
          { r: 11, speed: -0.30, size: 0.42, col: 0xff8844 },
          { r: 14, speed:  0.20, size: 0.70, col: 0x44ff88 },
          { r: 9,  speed: -0.45, size: 0.34, col: 0xee44ff },
        ];
        for (var pdx = 0; pdx < 4; pdx++) {
          var plD    = planetDefs[pdx];
          var plPiv  = new THREE.Group();
          plPiv.position.set(0, 12, 0);
          var plM = mat(plD.col, plD.col, 0.38, 0.55, 0.05, true, 0.88);
          glow(plM, 0.32, pdx * 1.5, 0.10);
          var plMsh = new THREE.Mesh(new THREE.SphereGeometry(plD.size, 10, 8), plM);
          plMsh.position.set(plD.r, 0, 0);
          plPiv.add(plMsh);
          group.add(plPiv);
          group.userData.animObjs.push({ mesh: plPiv, axis: 'y', speed: plD.speed });
        }

        /* --- floating rune orbs (InstancedMesh, 12 orbs) --- */
        var orbGeo = new THREE.SphereGeometry(0.65, 10, 7);
        var orbM   = mat(accent, accent, 0.40, 0.30, 0.05, true, 0.78);
        glow(orbM, 0.34, 1.0, 0.10);
        var orbIM  = new THREE.InstancedMesh(orbGeo, orbM, 12);
        for (var oi = 0; oi < 12; oi++) {
          var oAng = oi * Math.PI / 6;
          var oRad = 18 + (oi % 3) * 4;
          dum.position.set(
            Math.sin(oAng) * oRad,
            4 + (oi % 4) * 4,
            Math.cos(oAng) * oRad
          );
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          orbIM.setMatrixAt(oi, dum.matrix);
        }
        orbIM.instanceMatrix.needsUpdate = true;
        group.add(orbIM);

        /* --- floor runic circle --- */
        var runicM = mat(accent, accent, 0.18, 0.9, 0, true, 0.25);
        glow(runicM, 0.16, 0.2, 0.08);
        for (var rr = 1; rr <= 3; rr++) {
          var rring = new THREE.Mesh(new THREE.RingGeometry(rr*8-0.5, rr*8, 56), runicM.clone());
          rring.rotation.x = -Math.PI/2; rring.position.y = 0.05; rring.renderOrder = 1;
          group.add(rring);
        }

        /* --- star map motes on ceiling (silver) --- */
        group.userData.motes = buildMotes(group, 0xc0c8ff, 70, false);

        /* light shaft from ceiling onto orrery */
        buildShaft(group, 0, 0, 0.3, 2.5, ROOM_H, accent, 0.048);

        /* grand tome on lectern */
        var lM  = mat(0x1a0830, accent, 0.08, 0.60, 0.25);
        var lec = new THREE.Mesh(new THREE.BoxGeometry(3, 3.5, 2), lM);
        lec.position.set(0, 1.75, 22); group.add(lec);
        var bkM = mat(0x080418, accent, 0.06, 0.90, 0);
        var bk  = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 2.2), bkM);
        bk.position.set(0, 3.7, 22); bk.rotation.x = -0.25; group.add(bk);

        /* --- ZODIAC FLOOR INLAY (12 marks on an outer ring) -------------------
           The wide floor annulus between the hex pillars (R=22) and the walls
           (R=40) read empty. A ring of 12 faint glyph-plates at R=30 gives the
           esoteric floor structure. Flat at y≈0.06 → purely visual, walkable. */
        var zMarkGeo = new THREE.PlaneGeometry(2.4, 3.4);
        var zMarkM   = mat(accent, accent, 0.12, 0.9, 0, true, 0.30);
        glow(zMarkM, 0.10, 0.5, 0.06);
        var zMarkIM  = new THREE.InstancedMesh(zMarkGeo, zMarkM, 12);
        for (var zk = 0; zk < 12; zk++) {
          var zA = zk * Math.PI / 6;
          dum.position.set(Math.sin(zA) * 30, 0.06, Math.cos(zA) * 30);
          dum.rotation.set(-Math.PI / 2, 0, -zA);   /* lie flat, face inward */
          dum.updateMatrix();
          zMarkIM.setMatrixAt(zk, dum.matrix);
        }
        zMarkIM.instanceMatrix.needsUpdate = true;
        group.add(zMarkIM);

        /* --- LOW STUDY BENCHES flanking the orrery (seated on the floor) ------
           Two stone benches at x=±26 give the observatory a place to "sit and
           read the sky". Off the +Z spawn→exit centreline, clear of pillars. */
        var benchM = mat(0x120a24, accent, 0.06, 0.85, 0.08);
        [[-26, 4], [26, 4]].forEach(function (bp) {
          var seat = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 9), benchM.clone());
          seat.position.set(bp[0], 0.85, bp[1]); group.add(seat);
          var legG = new THREE.BoxGeometry(2.6, 0.9, 1.0);
          [-3.4, 3.4].forEach(function (lz) {
            var leg = new THREE.Mesh(legG, benchM.clone());
            leg.position.set(bp[0], 0.45, bp[1] + lz); group.add(leg);
          });
        });

        /* TOOLS — ORACLE's research & intelligence stations (front, before exit) */
        buildToolRow(group, accent, ['RESEARCH', 'SCRY', 'FORECAST', 'ANALYZE', 'DECODE'], 30, 0);

        buildNameLabel(group, 'ORACLE', accent);
      },

      /* ── TURTLE — art studio / museum ── */
      artStudio: function (group, accent) {
        group.userData.animObjs = [];

        /* --- GALLERY COLUMNS (owner ask #1: pillars OFF the paintings) ---------
           Real museum columns, placed ONLY in the four corners so they frame the
           hall without ever standing in front of wall art. The wall paintings sit
           on the back wall (z=-39), the two side walls, and the left-wall FLUX
           piece (x=-40, z=0); corner columns at (±32, ±32) are well inboard of
           every artwork and never break a viewer's sightline to a canvas. */
        column(group, accent, -32, -32);
        column(group, accent,  32, -32);
        column(group, accent, -32,  32);
        column(group, accent,  32,  32);

        /* --- skylight shafts (moved to sit ABOVE the corner columns / centre,
           pulled off the wall lines so they never wash over a painting) --------- */
        buildShaft(group, -32, -32, 0.5, 3,   ROOM_H, 0xfffae8, 0.048);
        buildShaft(group,  32, -32, 0.5, 3,   ROOM_H, 0xfff8e0, 0.048);
        buildShaft(group,   0,   0, 0.6, 3.5, ROOM_H, 0xfffae8, 0.055);  /* over the central exhibit */

        /* --- InstancedMesh gallery frames (10, two walls) --- */
        var frmGeo = new THREE.BoxGeometry(9.5, 7.5, 0.5);
        var frmM   = mat(0x1a1010, accent, 0.06, 0.80, 0.10);
        var frmIM  = new THREE.InstancedMesh(frmGeo, frmM, 10);
        var artColors = [0xff3366, 0x33ccff, 0xffcc00, 0x66ff66, 0xff6600,
                         0xcc33ff, 0x00ffcc, 0xff9900, 0x3399ff, 0xff6699];
        var artGeo = new THREE.PlaneGeometry(8.5, 6.5);
        for (var frm = 0; frm < 5; frm++) {
          /* back wall frames */
          dum.position.set(-26 + frm * 13, 10, -ROOM_D/2 + 1.0);
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          frmIM.setMatrixAt(frm, dum.matrix);
          var aM = mat(artColors[frm], artColors[frm], 0.16, 0.95, 0);
          glow(aM, 0.14, frm * 0.7, 0.08);
          var art = new THREE.Mesh(artGeo, aM);
          art.position.set(-26 + frm*13, 10, -ROOM_D/2 + 1.28); group.add(art);
          /* side wall frames */
          dum.position.set(-26 + frm*13, 10, ROOM_D/2 - 1.0);
          dum.rotation.set(0, Math.PI, 0); dum.updateMatrix();
          frmIM.setMatrixAt(frm + 5, dum.matrix);
          var aM2 = mat(artColors[frm+5], artColors[frm+5], 0.15, 0.95, 0);
          glow(aM2, 0.12, frm * 0.6 + 1.2, 0.08);
          var art2 = new THREE.Mesh(artGeo, aM2);
          art2.position.set(-26 + frm*13, 10, ROOM_D/2 - 1.28); art2.rotation.y = Math.PI;
          group.add(art2);
        }
        frmIM.instanceMatrix.needsUpdate = true;
        group.add(frmIM);

        /* --- hero easel --- */
        var eM   = mat(0x1a0e00, accent, 0.07, 0.75, 0.05);
        var legs = [[-2, 2, 0], [2, 2, 0], [0, -2, 0]];
        for (var ll = 0; ll < 3; ll++) {
          var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 11, 6), eM.clone());
          leg.position.set(legs[ll][0], 5.5, legs[ll][1] - 8);
          leg.rotation.z = legs[ll][0] * 0.12; group.add(leg);
        }
        var cvsM = mat(0xfaf4ee, accent, 0.04, 1, 0);
        var cvs  = new THREE.Mesh(new THREE.PlaneGeometry(9, 11), cvsM);
        cvs.position.set(0, 8.5, -8.5); group.add(cvs);
        /* paint smears on canvas */
        var smearCols = [0xff3366, 0x33ffcc, 0xffcc00, 0x6633ff, 0xff6600, 0x00ccff, 0xff00aa, 0xaaff00];
        for (var sm = 0; sm < smearCols.length; sm++) {
          var smM = mat(smearCols[sm], smearCols[sm], 0.22, 0.9, 0, true, 0.72);
          glow(smM, 0.20, sm * 0.55, 0.08);
          var smR = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + Math.random()*1.8, 1+Math.random()*1.4), smM);
          smR.position.set(-4 + sm * 1.1, 7 + Math.random()*4, -8.38); group.add(smR);
        }

        /* ══ HERO FLOATING CENTRAL EXHIBIT (owner ask #3) ════════════════════════
           THE centerpiece of the museum, dead-centre at (0,0) — forward of the
           +Z spawn (z=+28) and 40u clear of the exit portal (z=+40), so it never
           blocks the spawn→exit path. Sized to the 80×80×22 room: a low pedestal
           + a floating, slowly-rotating holographic artifact caged in a glass
           vitrine, lit from a ceiling skylight coffer above. Player walks a full
           360° around it. Rotation + bob run active-room-only (see animObjs). */

        /* pedestal / plinth (stepped, museum-style) */
        var pedM = mat(0x14100a, accent, 0.06, 0.55, 0.35);
        var pedBase = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.2, 24), pedM.clone());
        pedBase.position.set(0, 0.6, 0); group.add(pedBase);
        var pedMid  = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.4, 2.6, 24), pedM.clone());
        pedMid.position.set(0, 2.5, 0); group.add(pedMid);
        var pedCapM = mat(accent, accent, 0.20, 0.35, 0.55);
        glow(pedCapM, 0.16, 0.4, 0.10);
        var pedCap  = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 3.6, 0.5, 24), pedCapM);
        pedCap.position.set(0, 4.05, 0); group.add(pedCap);

        /* emerald hologram base disc glowing up into the artifact */
        var holoDiscM = new THREE.MeshBasicMaterial({
          color: accent, transparent: true, opacity: 0.22,
          depthWrite: false, blending: THREE.AdditiveBlending,
        });
        var holoDisc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), holoDiscM);
        holoDisc.rotation.x = -Math.PI/2; holoDisc.position.set(0, 4.35, 0);
        holoDisc.renderOrder = 1; group.add(holoDisc);

        /* the FLOATING holographic sculpture (crossed torii + faceted emerald core) */
        var sculM   = mat(accent, accent, 0.20, 0.30, 0.60);
        var sculGrp = new THREE.Group();
        sculGrp.position.set(0, 11.0, 0);        /* hovers mid-air above the plinth */
        var s1 = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.42, 10, 32), sculM.clone());
        glow(s1.material, 0.18, 0.3, 0.12);
        s1.rotation.x = Math.PI/2; sculGrp.add(s1);
        var s2 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.34, 10, 28), sculM.clone());
        glow(s2.material, 0.18, 1.1, 0.12);
        s2.rotation.x = Math.PI/4; sculGrp.add(s2);
        var coreM = mat(accent, accent, 0.42, 0.20, 0.05);
        glow(coreM, 0.34, 1.6, 0.14);
        var s3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), coreM);
        sculGrp.add(s3);
        group.add(sculGrp);
        /* slow spin + gentle vertical bob — active-room-only */
        group.userData.animObjs.push({ mesh: sculGrp, axis: 'y', speed: 0.34, bobAmp: 0.9, bobSpeed: 0.7, baseY: 11.0 });

        /* upward hologram beam (soft emerald cone hugging the artifact) */
        buildShaft(group, 0, 0, 0.7, 3.2, 15, accent, 0.045);

        /* GLASS VITRINE / display case — thin emerald-edged cylinder enclosing it.
           Additive + no depth-write so it never occludes the exhibit or the view. */
        var vitM = new THREE.MeshBasicMaterial({
          color: accent, transparent: true, opacity: 0.055,
          depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        });
        var vitrine = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 12.5, 20, 1, true), vitM);
        vitrine.position.set(0, 10.6, 0); group.add(vitrine);
        /* vitrine cap + base rings (glowing emerald edges) */
        var vRingM = mat(accent, accent, 0.24, 0.35, 0.5);
        glow(vRingM, 0.20, 0.9, 0.12);
        var vTop = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.14, 8, 32), vRingM.clone());
        vTop.rotation.x = Math.PI/2; vTop.position.set(0, 16.85, 0); group.add(vTop);
        var vBot = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.14, 8, 32), vRingM.clone());
        vBot.rotation.x = Math.PI/2; vBot.position.set(0, 4.35, 0); group.add(vBot);

        /* small pedestal LABEL plate (facing +Z toward the spawn/approach) */
        var exLbl = textLabel('◈  PRIMA OPERA  ◈', 6.2, 1.55, accent, 40, 'TURTLE · Central Exhibit');
        exLbl.position.set(0, 5.6, 4.5); group.add(exLbl);

        /* CEILING FEATURE — coffered emerald skylight panel directly above the
           exhibit, so the piece reads as lit from a gallery skylight. */
        var skyPanM = mat(0x05100e, accent, 0.14, 0.85, 0.05, true, 0.9);
        glow(skyPanM, 0.12, 0.2, 0.08);
        var skyPan = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 16), skyPanM);
        skyPan.position.set(0, ROOM_H - 0.25, 0); group.add(skyPan);
        var skyGlowM = new THREE.MeshBasicMaterial({
          color: accent, transparent: true, opacity: 0.16,
          depthWrite: false, blending: THREE.AdditiveBlending,
        });
        var skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), skyGlowM);
        skyGlow.rotation.x = Math.PI/2; skyGlow.position.set(0, ROOM_H - 0.5, 0);
        skyGlow.renderOrder = 1; group.add(skyGlow);
        /* coffered grid lines on the skylight */
        var cofM = mat(accent, accent, 0.22, 0.4, 0.5);
        glow(cofM, 0.18, 1.3, 0.10);
        for (var cf = -1; cf <= 1; cf++) {
          var cfBarH = new THREE.Mesh(new THREE.BoxGeometry(16, 0.22, 0.3), cofM.clone());
          cfBarH.position.set(0, ROOM_H - 0.45, cf * 5); group.add(cfBarH);
          var cfBarV = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 16), cofM.clone());
          cfBarV.position.set(cf * 5, ROOM_H - 0.45, 0); group.add(cfBarV);
        }

        /* floor paint spots (instanced) */
        var spotGeo = new THREE.CircleGeometry(1.2, 8);
        var spotCols2 = [0xff0044, 0x00ccff, 0xffee00, 0x00ff88, 0xff6600, 0x8800ff, 0xff4488, 0x44aaff];
        for (var sp = 0; sp < 8; sp++) {
          var spM = new THREE.MeshBasicMaterial({
            color: spotCols2[sp], transparent: true, opacity: 0.28 + Math.random()*0.15,
            depthWrite: false, blending: THREE.AdditiveBlending,
          });
          var spm = new THREE.Mesh(spotGeo, spM);
          spm.rotation.x = -Math.PI/2;
          spm.position.set(-28 + sp * 8 + Math.random()*4, 0.04, 10 + Math.random()*8);
          spm.renderOrder = 1; group.add(spm);
        }

        /* pigment cans */
        var canCols = [0xff0044, 0x00ccff, 0xffee00, 0xff6600, 0x8800ff];
        for (var can = 0; can < 5; can++) {
          var cM2 = mat(canCols[can], canCols[can], 0.28, 0.85, 0);
          glow(cM2, 0.24, can * 0.5, 0.10);
          var cn  = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.2, 8), cM2);
          cn.position.set(-18 + can * 6, 0.6, 14); group.add(cn);
        }

        /* --- PALETTE TABLE (mixing station, center-left) --- */
        var palTblM = mat(0x1a0e00, accent, 0.05, 0.80, 0.04);
        var palTbl  = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 5), palTblM);
        palTbl.position.set(-16, 0.5, 18); group.add(palTbl);
        /* palette board */
        var palBrdM = mat(0xf4ede0, 0xf4ede0, 0.03, 1, 0);
        var palBrd  = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.12, 10), palBrdM);
        palBrd.position.set(-16, 1.06, 18); group.add(palBrd);
        /* paint daubs (InstancedMesh, 8 colour blobs on palette) */
        var daubCols = [0xff0044, 0x00ccff, 0xffee00, 0x00ff88, 0xff6600, 0x8800ff, 0xffffff, 0xff66aa];
        var daubGeo  = new THREE.CircleGeometry(0.55, 8);
        for (var db = 0; db < 8; db++) {
          var dbM = new THREE.MeshBasicMaterial({ color: daubCols[db], transparent: true, opacity: 0.85, depthWrite: false });
          var dbA = db * Math.PI * 2 / 8;
          var dbl = new THREE.Mesh(daubGeo, dbM);
          dbl.rotation.x = -Math.PI/2;
          dbl.position.set(-16 + Math.sin(dbA)*2.2, 1.13, 18 + Math.cos(dbA)*2.2);
          dbl.renderOrder = 2; group.add(dbl);
        }

        /* --- REFERENCE WALL (right wall, mood board) --- */
        var refCols = [0xff3366, 0xffcc00, 0x33ffcc, 0x9966ff, 0xff9900, 0x3399ff];
        for (var rf = 0; rf < 6; rf++) {
          var rfM = mat(refCols[rf], refCols[rf], 0.14, 0.92, 0, true, 0.70);
          glow(rfM, 0.12, rf * 0.5, 0.07);
          var rfP = new THREE.Mesh(new THREE.PlaneGeometry(5.5 + (rf%2)*2, 7), rfM);
          rfP.rotation.y = -Math.PI/2;
          rfP.position.set(ROOM_W/2 - 0.6, 8 + (rf%3-1)*3, -22 + rf * 9);
          group.add(rfP);
        }

        /* --- DROP-CLOTH under the easel (grounds the hero, fills empty floor) --
           A paint-spattered canvas sheet beneath the easel/sculpture zone. Flat
           at y≈0.03 → walkable, purely visual. */
        var clothM = new THREE.MeshBasicMaterial({
          color: 0xe8e0d2, transparent: true, opacity: 0.32, depthWrite: false,
        });
        var cloth  = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), clothM);
        cloth.rotation.x = -Math.PI / 2;
        cloth.position.set(-2, 0.03, -6); cloth.renderOrder = 1; group.add(cloth);
        /* a few colour splatters on the cloth (instanced circles) */
        var splGeo  = new THREE.CircleGeometry(0.9, 8);
        var splCols = [0xff3366, 0x33ccff, 0xffcc00, 0x66ff66, 0xff6600, 0x9966ff];
        /* white base material — per-instance colour comes from setColorAt() below
           (InstancedMesh.instanceColor multiplies the base, no vertexColors needed) */
        var splIM   = new THREE.InstancedMesh(
          splGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), 6
        );
        var splC = new THREE.Color();
        for (var sc2 = 0; sc2 < 6; sc2++) {
          dum.position.set(-9 + sc2 * 3, 0.04, -10 + (sc2 % 3) * 5);
          dum.rotation.set(-Math.PI / 2, 0, sc2); dum.scale.set(1 + (sc2 % 2) * 0.5, 1, 1);
          dum.updateMatrix();
          splIM.setMatrixAt(sc2, dum.matrix);
          splIM.setColorAt(sc2, splC.setHex(splCols[sc2]));
        }
        dum.scale.set(1, 1, 1);   /* reset shared scratch scale */
        splIM.instanceMatrix.needsUpdate = true;
        if (splIM.instanceColor) splIM.instanceColor.needsUpdate = true;
        group.add(splIM);

        /* --- GALLERY VIEWING BENCHES (two, seated on floor, flank the walk) ----
           Museum-style upholstered benches at x=±22 to view the wall art. Clear
           of the +Z spawn→exit centreline and all hero props. */
        var gBenchM = mat(0x161008, accent, 0.05, 0.85, 0.06);
        var gBTopM  = mat(0x241a10, accent, 0.05, 0.9, 0.02);
        [[-22, 20], [22, 20]].forEach(function (bp) {
          var bBase = new THREE.Mesh(new THREE.BoxGeometry(9, 1.0, 3), gBenchM.clone());
          bBase.position.set(bp[0], 0.5, bp[1]); group.add(bBase);
          var bTop  = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.5, 3.2), gBTopM.clone());
          bTop.position.set(bp[0], 1.25, bp[1]); group.add(bTop);
        });

        /* ══ GALLERY LIGHTING (owner ask #2) ═════════════════════════════════════
           Static gallery-style spotlights that GRAZE each wall of art plus a warm
           downlight on the central exhibit, and a soft ambient lift so the hall
           reads bright-but-cinematic (not dim, not blown out). All lights are
           children of the room group → they dispose with the room. No per-frame
           light churn: positions/targets are set once here. */

        /* soft ambient lift — brings the whole hall up off "dim" */
        group.add(new THREE.AmbientLight(0xdfeee9, 0.30));
        /* warm hemisphere: gallery ceiling wash from above, cool floor bounce */
        group.add(new THREE.HemisphereLight(0xfff4e0, 0x0a1614, 0.35));

        /* helper: a downward gallery spot aimed at a wall point */
        function galSpot(px, py, pz, tx, ty, tz, colr, inten, ang) {
          var sp = new THREE.SpotLight(colr, inten, 60, ang || 0.6, 0.45, 1.2);
          sp.position.set(px, py, pz);
          sp.target.position.set(tx, ty, tz);
          group.add(sp);
          group.add(sp.target);   /* target must be in the graph; disposes with room */
          return sp;
        }

        /* BACK-WALL gallery run (5 frames at z≈-39, x=-26..26, y=10) */
        for (var bl = 0; bl < 5; bl++) {
          var bx = -26 + bl * 13;
          galSpot(bx, ROOM_H - 1.5, -30, bx, 10, -ROOM_D/2 + 1.0, 0xfff2dc, 0.85, 0.55);
        }
        /* SIDE-WALL gallery run (5 frames at z≈+39) */
        for (var sl = 0; sl < 5; sl++) {
          var sx = -26 + sl * 13;
          galSpot(sx, ROOM_H - 1.5, 30, sx, 10, ROOM_D/2 - 1.0, 0xfff2dc, 0.80, 0.55);
        }
        /* LEFT-WALL FLUX hero painting (hangArt hangs it at x=-40, z=0, y≈8.4) */
        galSpot(-30, ROOM_H - 1.0, 0, -ROOM_W/2 + 0.6, 8.4, 0, 0xfff6e6, 1.10, 0.5);
        /* RIGHT-WALL reference/mood board */
        galSpot(30, ROOM_H - 1.5, 0, ROOM_W/2 - 0.6, 9, 0, 0xeef6ff, 0.70, 0.6);
        /* CENTRAL EXHIBIT downlight — emerald-warm key from the skylight coffer */
        galSpot(0, ROOM_H - 1.0, 0, 0, 8, 0, accent, 1.20, 0.7);
        galSpot(0, ROOM_H - 1.2, 0, 0, 11, 0, 0xfff4e0, 0.90, 0.85);

        /* warm daylight motes */
        group.userData.motes = buildMotes(group, 0xfff8c0, 55, false);

        /* TOOLS — TURTLE's creative/design stations (front of studio) */
        buildToolRow(group, accent, ['PAINT', 'COMPOSE', 'ANIMATE', 'PALETTE', 'RENDER'], 28, 0);

        buildNameLabel(group, 'TURTLE', accent);
      },

      /* ── PIKADON — vault / security room ── */
      vaultRoom: function (group, accent) {
        group.userData.animObjs = [];

        /* --- MASSIVE VAULT DOOR (left wall) --- */
        var vdM  = mat(0x0c0404, accent, 0.16, 0.22, 0.88);
        glow(vdM, 0.14, 0, 0.10);
        var vd   = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 2.2, 32), vdM);
        vd.rotation.z = Math.PI/2; vd.position.set(-ROOM_W/2 + 2, 11, 0); group.add(vd);
        /* vault spokes (8, instanced) */
        var spokGeo = new THREE.BoxGeometry(1.0, 0.55, 20);
        var spokM   = mat(0x1e1e1e, accent, 0.10, 0.40, 0.82);
        var spokIM  = new THREE.InstancedMesh(spokGeo, spokM, 8);
        for (var spk = 0; spk < 8; spk++) {
          dum.position.set(-ROOM_W/2 + 2, 11, 0);
          dum.rotation.set(spk * Math.PI/4, 0, 0); dum.updateMatrix();
          spokIM.setMatrixAt(spk, dum.matrix);
        }
        spokIM.instanceMatrix.needsUpdate = true;
        group.add(spokIM);
        /* vault door rim ring */
        var vRimM = mat(accent, accent, 0.30, 0.30, 0.80);
        glow(vRimM, 0.26, 0.5, 0.10);
        var rimR  = new THREE.Mesh(new THREE.TorusGeometry(11.3, 0.5, 8, 40), vRimM);
        rimR.rotation.z = Math.PI/2; rimR.position.set(-ROOM_W/2 + 1, 11, 0); group.add(rimR);
        /* vault door inner ring (spinning) */
        var vInnerM = mat(0x2a0a08, accent, 0.20, 0.35, 0.75);
        glow(vInnerM, 0.17, 0.8, 0.08);
        var vInner = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.32, 8, 32), vInnerM);
        vInner.rotation.z = Math.PI/2; vInner.position.set(-ROOM_W/2 + 2.5, 11, 0);
        group.add(vInner);
        group.userData.animObjs.push({ mesh: vInner, axis: 'x', speed: 0.30 });

        /* --- THREAT BOARD — full back-wall surveillance monitor array --- */
        var tbBgM = mat(0x080000, 0x140000, 0.05, 0.85, 0.10);
        var tbBg  = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 4, 19, 0.7), tbBgM);
        tbBg.position.set(0, 11.5, -ROOM_D/2 + 0.8); group.add(tbBg);
        /* monitor screens (InstancedMesh, 4×5 = 20) */
        var monGeo  = new THREE.PlaneGeometry(9.5, 6.5);
        var monM    = mat(0x0a0000, 0xff1400, 0.38, 0.80, 0);
        glow(monM, 0.30, 0.4, 0.12);
        var monIM   = new THREE.InstancedMesh(monGeo, monM, 20);
        /* monitor frames (InstancedMesh, 4×5 = 20) */
        var mFrmGeo = new THREE.BoxGeometry(10.2, 7.2, 0.4);
        var mFrmM   = mat(0x1a1a1a, 0x220808, 0.06, 0.30, 0.80);
        var mFrmIM  = new THREE.InstancedMesh(mFrmGeo, mFrmM, 20);
        var mIdx = 0;
        for (var mr = 0; mr < 4; mr++) {
          for (var mc = 0; mc < 5; mc++) {
            dum.position.set(-24 + mc*12, 18.5 - mr*6, -ROOM_D/2 + 1.22);
            dum.rotation.set(0, 0, 0); dum.updateMatrix();
            monIM.setMatrixAt(mIdx, dum.matrix);
            dum.position.set(-24 + mc*12, 18.5 - mr*6, -ROOM_D/2 + 0.98);
            dum.updateMatrix();
            mFrmIM.setMatrixAt(mIdx, dum.matrix);
            mIdx++;
          }
        }
        monIM.instanceMatrix.needsUpdate  = true;
        mFrmIM.instanceMatrix.needsUpdate = true;
        group.add(monIM); group.add(mFrmIM);

        /* --- GOLD INGOT VAULT (right-back, 5×6 stack behind bars) --- */
        var ingotGeo = new THREE.BoxGeometry(3.5, 1.0, 1.8);
        var ingotM   = mat(0xd4a000, 0xffcf00, 0.18, 0.28, 0.75);
        glow(ingotM, 0.15, 1.2, 0.08);
        var ingotIM  = new THREE.InstancedMesh(ingotGeo, ingotM, 30);
        var ingIdx   = 0;
        for (var ig = 0; ig < 5; ig++) {
          for (var il = 0; il < 6; il++) {
            dum.position.set(14 + ig * 4.2, 0.5 + il * 1.1, -22);
            dum.rotation.set(0, 0, 0); dum.updateMatrix();
            ingotIM.setMatrixAt(ingIdx++, dum.matrix);
          }
        }
        ingotIM.instanceMatrix.needsUpdate = true;
        group.add(ingotIM);
        /* ingot spotlight */
        buildShaft(group, 28, -22, 0.2, 4.0, ROOM_H, 0xffd060, 0.045);

        /* --- SECURITY BARS (cage wall between vault and command zone) --- */
        var barGeo = new THREE.CylinderGeometry(0.25, 0.25, ROOM_H, 6);
        var barM   = mat(0x1a1a1a, accent, 0.04, 0.30, 0.85);
        var barIM  = new THREE.InstancedMesh(barGeo, barM, 9);
        for (var br = 0; br < 9; br++) {
          dum.position.set(-8 + br * 5, ROOM_H/2, -10);
          dum.rotation.set(0, 0, 0); dum.updateMatrix();
          barIM.setMatrixAt(br, dum.matrix);
        }
        barIM.instanceMatrix.needsUpdate = true;
        group.add(barIM);
        /* horizontal crossbars (InstancedMesh) */
        var hBarGeo = new THREE.BoxGeometry(44, 0.40, 0.40);
        var hBarM   = mat(0x1a1a1a, accent, 0.04, 0.30, 0.82);
        var hBarIM  = new THREE.InstancedMesh(hBarGeo, hBarM, 4);
        for (var hb = 0; hb < 4; hb++) {
          dum.position.set(12, 3 + hb * 4.5, -10); dum.rotation.set(0,0,0); dum.updateMatrix();
          hBarIM.setMatrixAt(hb, dum.matrix);
        }
        hBarIM.instanceMatrix.needsUpdate = true;
        group.add(hBarIM);

        /* --- COMMAND CONSOLE (center desk with screens) --- */
        var consM  = mat(0x0a0810, accent, 0.12, 0.30, 0.75);
        glow(consM, 0.10, 1.0, 0.08);
        var consFront = new THREE.Mesh(new THREE.BoxGeometry(22, 2, 5), consM);
        consFront.position.set(0, 1, 12); group.add(consFront);
        /* console screens (3, InstancedMesh) */
        var cScrGeo = new THREE.PlaneGeometry(6, 4);
        var cScrM   = mat(accent, accent, 0.40, 0.80, 0);
        glow(cScrM, 0.34, 2.0, 0.10);
        var cScrIM  = new THREE.InstancedMesh(cScrGeo, cScrM, 3);
        for (var cs = 0; cs < 3; cs++) {
          dum.position.set(-8 + cs*8, 5.0, 9.6);
          dum.rotation.set(-0.28, 0, 0); dum.updateMatrix();
          cScrIM.setMatrixAt(cs, dum.matrix);
        }
        cScrIM.instanceMatrix.needsUpdate = true;
        group.add(cScrIM);
        /* operator chairs (InstancedMesh, 3) */
        var chairGeo = new THREE.CylinderGeometry(0.9, 0.7, 2.2, 8);
        var chairM   = mat(0x1a0808, accent, 0.03, 0.85, 0.05);
        var chairIM  = new THREE.InstancedMesh(chairGeo, chairM, 3);
        for (var ch = 0; ch < 3; ch++) {
          dum.position.set(-8 + ch*8, 1.1, 16.5); dum.rotation.set(0,0,0); dum.updateMatrix();
          chairIM.setMatrixAt(ch, dum.matrix);
        }
        chairIM.instanceMatrix.needsUpdate = true;
        group.add(chairIM);

        /* --- BIOMETRIC ARCH at entrance (z ≈ +20) --- */
        var archM = mat(0x1a0a10, accent, 0.20, 0.30, 0.80);
        glow(archM, 0.18, 0.3, 0.10);
        var archLeg = new THREE.BoxGeometry(1.2, 10.5, 1.2);
        var archHdr = new THREE.BoxGeometry(12.6, 1.2, 1.2);
        var aL = new THREE.Mesh(archLeg, archM.clone()); aL.position.set(-5.7, 5.25, 21); group.add(aL);
        var aR = new THREE.Mesh(archLeg, archM.clone()); aR.position.set( 5.7, 5.25, 21); group.add(aR);
        var aH = new THREE.Mesh(archHdr, archM.clone()); aH.position.set(0, 10.8,  21); group.add(aH);
        /* arch glow fill */
        var archFill = new THREE.MeshBasicMaterial({
          color: 0xff0022, transparent: true, opacity: 0.055,
          depthWrite: false, blending: THREE.AdditiveBlending,
        });
        var archPl = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 10.2), archFill);
        archPl.position.set(0, 5.1, 21.1); group.add(archPl);
        /* biometric scanner screens */
        var bioScrM = mat(0x00ff88, 0x00ff88, 0.40, 0.90, 0);
        glow(bioScrM, 0.34, 2.5, 0.10);
        [[-5.7, 4, 20.4], [5.7, 4, 20.4]].forEach(function(p) {
          var bs = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4), bioScrM.clone());
          bs.position.set(p[0], p[1], p[2]); group.add(bs);
        });

        /* --- FLOOR WARNING STRIPES (approach to vault) --- */
        var warnGeo = new THREE.BoxGeometry(ROOM_W - 4, 0.08, 1.2);
        var warnY   = mat(0x888800, 0xffff00, 0.18, 0.90, 0);
        var warnB   = mat(0x080808, 0x000000, 0, 0.95, 0);
        for (var ws2 = 0; ws2 < 10; ws2++) {
          var wm  = (ws2 % 2 === 0) ? warnY : warnB;
          var wp2 = new THREE.Mesh(warnGeo, wm.clone());
          wp2.position.set(0, 0.05, -6 + ws2 * 2.0); group.add(wp2);
        }

        /* --- LASER GRID over vault area --- */
        var laserM   = new THREE.MeshBasicMaterial({
          color: 0xff2244, transparent: true, opacity: 0.07,
          depthWrite: false, blending: THREE.AdditiveBlending,
        });
        var laserGeo = new THREE.PlaneGeometry(ROOM_W - 10, 30);
        for (var lg = 0; lg < 4; lg++) {
          var lp = new THREE.Mesh(laserGeo, laserM.clone());
          lp.rotation.x = -Math.PI/2; lp.position.set(12, 2.5 + lg * 3.5, -15);
          lp.renderOrder = 1; group.add(lp);
        }

        /* --- SURVEILLANCE CAMERAS --- */
        var camM  = mat(0x0a0a0a, accent, 0.09, 0.30, 0.80);
        var cams  = [[16,18,-28], [-16,18,-28], [0,20,20], [28,16,-10], [-28,16,-10]];
        for (var cp = 0; cp < cams.length; cp++) {
          var cc  = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 3), camM.clone());
          cc.position.set(cams[cp][0], cams[cp][1], cams[cp][2]);
          cc.lookAt(0, 4, 0); group.add(cc);
          var indM = mat(0xff0000, 0xff0000, 0.45, 0.9, 0);
          glow(indM, 0.40, cp * 1.1, 0.08);
          var ind  = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), indM);
          ind.position.set(cams[cp][0], cams[cp][1], cams[cp][2] - 2.2);
          group.add(ind);
        }

        /* light shafts */
        buildShaft(group, 0, 12, 0.2, 2.0, ROOM_H, 0xffffff, 0.038);
        buildShaft(group, 0, -6, 0.15, 1.8, ROOM_H, accent, 0.040);

        /* red paranoia motes */
        group.userData.motes = buildMotes(group, 0xff2040, 45, false);

        /* TOOLS — PIKADON's security stations (front, past the biometric arch) */
        buildToolRow(group, accent, ['AUDIT', 'SCAN', 'ENCRYPT', 'THREAT', 'LOCKDOWN'], 30, 0);

        buildNameLabel(group, 'PIKADON', accent);
      },

      /* ── ZEROX — trading floor ── */
      tradingFloor: function (group, accent) {
        group.userData.animObjs = [];

        /* --- InstancedMesh for 15 terminal consoles (3 rows × 5 cols) --- */
        var termGeo = new THREE.BoxGeometry(4.5, 3, 2.2);
        var termM   = mat(0x001420, accent, 0.09, 0.50, 0.50);
        var termIM  = new THREE.InstancedMesh(termGeo, termM, 15);
        var scrGeo2 = new THREE.PlaneGeometry(3.6, 2.2);
        var scrM2   = mat(accent, accent, 0.42, 0.80, 0);
        glow(scrM2, 0.36, 3.0, 0.10);
        var scrIM2  = new THREE.InstancedMesh(scrGeo2, scrM2, 15);
        var tIdx    = 0;
        for (var tr2 = -1; tr2 <= 1; tr2++) {
          for (var tc2 = -2; tc2 <= 2; tc2++) {
            dum.position.set(tc2*12, 1.5, tr2*12 - 4); dum.rotation.set(0,0,0); dum.updateMatrix();
            termIM.setMatrixAt(tIdx, dum.matrix);
            dum.position.set(tc2*12, 2.6, tr2*12 - 5.12); dum.updateMatrix();
            scrIM2.setMatrixAt(tIdx, dum.matrix);
            tIdx++;
          }
        }
        termIM.instanceMatrix.needsUpdate = true;
        scrIM2.instanceMatrix.needsUpdate = true;
        group.add(termIM); group.add(scrIM2);

        /* --- giant ticker wall (full back wall height) --- */
        var tickBgM = mat(0x000a14, accent, 0.06, 0.75, 0.15);
        var tickBg  = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 4, 16, 0.9), tickBgM);
        tickBg.position.set(0, 11, -ROOM_D/2 + 0.9); group.add(tickBg);
        /* data rows (green=up, red=down, alternating) */
        var rowCols = [0x00ff88, 0xff3344, 0x00cc66, 0xff5566, 0x00ff99,
                       0xff2233, 0x33ff88, 0xff4455];
        for (var tl2 = 0; tl2 < 8; tl2++) {
          var rlM = mat(rowCols[tl2], rowCols[tl2], 0.38, 0.90, 0);
          glow(rlM, 0.32, tl2 * 0.8, 0.10);
          var rl  = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 12, 0.38, 0.55), rlM);
          rl.position.set(0, 5.5 + tl2 * 2.0, -ROOM_D/2 + 1.38); group.add(rl);
        }

        /* --- holographic globe / orb in trading pit center --- */
        var hgM   = mat(accent, accent, 0.36, 0.55, 0.10, true, 0.58);
        glow(hgM, 0.30, 0.4, 0.10);
        var hgR1  = new THREE.Mesh(new THREE.TorusGeometry(5, 0.20, 8, 48), hgM.clone());
        hgR1.position.set(0, 8, 16); hgR1.rotation.x = Math.PI/2;
        group.add(hgR1);
        group.userData.animObjs.push({ mesh: hgR1, axis: 'y', speed: 0.55 });

        var hgR2  = new THREE.Mesh(new THREE.TorusGeometry(5, 0.15, 8, 40), hgM.clone());
        hgR2.position.set(0, 8, 16); hgR2.rotation.x = Math.PI/3;
        group.add(hgR2);
        group.userData.animObjs.push({ mesh: hgR2, axis: 'y', speed: -0.38 });

        var hgCore = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 10), hgM.clone());
        hgCore.position.set(0, 8, 16); group.add(hgCore);
        group.userData.animObjs.push({ mesh: hgCore, axis: 'y', speed: 0.20 });

        /* floor zone markers */
        var zoneM = mat(accent, accent, 0.12, 0.90, 0, true, 0.18);
        for (var zn = 1; zn <= 3; zn++) {
          var zr = new THREE.Mesh(new THREE.RingGeometry(zn*6, zn*6+0.5, 40), zoneM.clone());
          zr.rotation.x = -Math.PI/2; zr.position.set(0, 0.04, 16); zr.renderOrder = 1;
          group.add(zr);
        }

        /* --- VERTICAL PRICE CHART COLUMNS flanking ticker wall --- */
        var chartCols2 = [0x00ff88, 0x27e0ff, 0xff3344, 0xffcc00];
        var chartGeo   = new THREE.PlaneGeometry(0.55, 16);
        for (var vc2 = 0; vc2 < 4; vc2++) {
          var vcM2 = mat(chartCols2[vc2], chartCols2[vc2], 0.36, 0.80, 0);
          glow(vcM2, 0.28, vc2 * 1.0, 0.10);
          var vcP2 = new THREE.Mesh(chartGeo, vcM2);
          vcP2.position.set(-30 + vc2 * 20, 11, -ROOM_D/2 + 1.5); group.add(vcP2);
        }

        /* --- VIP TRADING DESK (raised platform, back-right) --- */
        var vipDeskM = mat(0x001a2a, accent, 0.10, 0.35, 0.60);
        glow(vipDeskM, 0.08, 1.5, 0.07);
        var vipBase = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 6), vipDeskM);
        vipBase.position.set(22, 3.2, -22); group.add(vipBase);
        var vipRiser = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 6), vipDeskM.clone());
        vipRiser.position.set(22, 1.6, -22); group.add(vipRiser);
        /* vip screens (2, individual — unique content) */
        var vScrM1 = mat(0x00ff88, 0x00ff88, 0.42, 0.80, 0);
        glow(vScrM1, 0.36, 3.0, 0.10);
        var vScrM2 = mat(0xff3344, 0xff3344, 0.38, 0.80, 0);
        glow(vScrM2, 0.32, 3.8, 0.10);
        var vs1 = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4), vScrM1);
        vs1.position.set(18, 6.5, -21.5); vs1.rotation.x = -0.22; group.add(vs1);
        var vs2 = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4), vScrM2);
        vs2.position.set(26, 6.5, -21.5); vs2.rotation.x = -0.22; group.add(vs2);

        /* ceiling grid */
        buildCeilGrid(group, accent, 4, 8);

        /* data rain motes (falling) */
        group.userData.motes = buildMotes(group, accent, 65, true);

        /* TOOLS — ZEROX's markets/revenue stations (front of the trading pit) */
        buildToolRow(group, accent, ['QUOTE', 'CHART', 'BACKTEST', 'LEDGER', 'YIELD'], 28, 0);

        buildNameLabel(group, 'ZEROX', accent);
      },

      /* ── BAZAAR — agora market hall ── */
      bazaarHall: function (group, accent) {
        group.userData.animObjs = [];

        /* --- InstancedMesh for 15 stall bases (3 rows × 5 cols) --- */
        var stallGeo = new THREE.BoxGeometry(9, 5, 7);
        var stallM   = mat(0x0a0010, accent, 0.07, 0.85, 0.05);
        var stallIM  = new THREE.InstancedMesh(stallGeo, stallM, 15);
        var awningCols = [0xff6600, 0x0066cc, 0x00cc44, 0xff0066, 0xffcc00,
                          0x6600cc, 0xff3300, 0x0099ff, 0x33cc00, 0xff0099,
                          0xffaa00, 0x9900ff, 0xff5500, 0x0077ee, 0x22cc55];
        var awGeo  = new THREE.BoxGeometry(10, 0.5, 8);
        var awIM   = new THREE.InstancedMesh(awGeo, new THREE.MeshStandardMaterial({ vertexColors: false }), 15);
        var stIdx  = 0;
        for (var str = -1; str <= 1; str++) {
          for (var stc = -2; stc <= 2; stc++) {
            var sx = stc * 16, sz = str * 18 - 4;
            dum.position.set(sx, 2.5, sz); dum.rotation.set(0,0,0); dum.updateMatrix();
            stallIM.setMatrixAt(stIdx, dum.matrix);
            dum.position.set(sx, 5.3, sz); dum.updateMatrix();
            awIM.setMatrixAt(stIdx, dum.matrix);
            stIdx++;
          }
        }
        stallIM.instanceMatrix.needsUpdate = true;
        awIM.instanceMatrix.needsUpdate    = true;
        group.add(stallIM);

        /* awnings as individual meshes with distinct colors (15 meshes — acceptable, festive) */
        var awi = 0;
        for (var awr = -1; awr <= 1; awr++) {
          for (var awc = -2; awc <= 2; awc++) {
            var awM = mat(awningCols[awi], awningCols[awi], 0.18, 0.90, 0);
            glow(awM, 0.15, awi * 0.25, 0.08);
            var aw  = new THREE.Mesh(awGeo, awM);
            aw.position.set(awc*16, 5.3, awr*18 - 4); group.add(aw);
            awi++;
          }
        }

        /* --- hanging lanterns (InstancedMesh, 20 at ceiling) --- */
        var lanGeo = new THREE.SphereGeometry(0.7, 8, 6);
        var lanM   = mat(0xffcc44, 0xffa000, 0.40, 0.80, 0);
        glow(lanM, 0.34, 0, 0.10);
        var lanIM  = new THREE.InstancedMesh(lanGeo, lanM, 20);
        for (var ln = 0; ln < 20; ln++) {
          var lna = ln * Math.PI * 2 / 20;
          dum.position.set(
            Math.sin(lna) * 26 + (Math.random() - 0.5) * 8,
            ROOM_H - 2 - Math.random() * 4,
            Math.cos(lna) * 22 + (Math.random() - 0.5) * 8
          );
          dum.rotation.set(0,0,0); dum.updateMatrix();
          lanIM.setMatrixAt(ln, dum.matrix);
        }
        lanIM.instanceMatrix.needsUpdate = true;
        group.add(lanIM);

        /* --- grand fountain (center-back, spiraling motes handled below) --- */
        var fontM  = mat(0x001a10, accent, 0.13, 0.50, 0.30);
        glow(fontM, 0.11, 0.5, 0.08);
        var font   = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.5, 1.8, 20), fontM);
        font.position.set(0, 0.9, 20); group.add(font);
        var fRing  = new THREE.Mesh(new THREE.TorusGeometry(5.8, 0.35, 8, 36), fontM.clone());
        fRing.position.set(0, 1.8, 20); fRing.rotation.x = Math.PI/2; group.add(fRing);
        var fPil   = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5.5, 8), fontM.clone());
        fPil.position.set(0, 4.55, 20); group.add(fPil);
        var fTop   = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mat(accent, accent, 0.40, 0.30, 0.05));
        glow(fTop.material, 0.34, 0.6, 0.10);
        fTop.position.set(0, 7.8, 20); group.add(fTop);

        /* water spout rings (animated) */
        var wRM = mat(0x44ccff, 0x88eeff, 0.30, 0.60, 0.10, true, 0.45);
        glow(wRM, 0.25, 1.0, 0.10);
        for (var wr = 0; wr < 3; wr++) {
          var wRing = new THREE.Mesh(new THREE.TorusGeometry(2 + wr*1.2, 0.12, 6, 24), wRM.clone());
          wRing.position.set(0, 5.5 + wr * 0.8, 20);
          wRing.rotation.x = Math.PI/2;
          group.add(wRing);
          group.userData.animObjs.push({ mesh: wRing, axis: 'y', speed: 0.35 - wr*0.08 });
        }

        /* --- merchant banners hanging from ceiling --- */
        var banCols = [0xff4400, 0x0055ff, 0x00aa44, 0xcc0088, 0xffbb00];
        for (var bn = 0; bn < 5; bn++) {
          var bnM = mat(banCols[bn], banCols[bn], 0.14, 0.95, 0, true, 0.80);
          var bnP = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), bnM);
          bnP.position.set(-20 + bn * 10, ROOM_H - 5, -20); group.add(bnP);
        }

        /* goods boxes on stalls (instanced) */
        var goodGeo = new THREE.BoxGeometry(2, 1.5, 2);
        var goodM   = mat(accent, accent, 0.06, 0.90, 0);
        var goodIM  = new THREE.InstancedMesh(goodGeo, goodM, 15);
        var gi      = 0;
        for (var gr = -1; gr <= 1; gr++) {
          for (var gc = -2; gc <= 2; gc++) {
            dum.position.set(gc*16, 5.8, gr*18 - 3.5); dum.rotation.set(0,0,0); dum.updateMatrix();
            goodIM.setMatrixAt(gi++, dum.matrix);
          }
        }
        goodIM.instanceMatrix.needsUpdate = true;
        group.add(goodIM);

        /* --- OVERHEAD BANNER ARCH (main entrance) --- */
        var archBanM = mat(0xffd060, 0xffd060, 0.22, 0.40, 0.55);
        glow(archBanM, 0.18, 1.0, 0.08);
        var archBan = new THREE.Mesh(new THREE.TorusGeometry(9, 0.4, 8, 32, Math.PI), archBanM);
        archBan.position.set(0, 10, ROOM_D/2 - 6); archBan.rotation.x = Math.PI/2;
        group.add(archBan);

        /* --- CROWD MARKER INDICATORS (simple glowing orbs at stall positions) --- */
        var cMkGeo = new THREE.SphereGeometry(0.5, 6, 5);
        var cMkM   = mat(accent, accent, 0.28, 0.70, 0);
        glow(cMkM, 0.22, 0, 0.08);
        var cMkIM  = new THREE.InstancedMesh(cMkGeo, cMkM, 12);
        for (var mk = 0; mk < 12; mk++) {
          var mka = mk * Math.PI * 2 / 12;
          dum.position.set(Math.sin(mka)*16, 0.5, Math.cos(mka)*12 - 2);
          dum.rotation.set(0,0,0); dum.updateMatrix();
          cMkIM.setMatrixAt(mk, dum.matrix);
        }
        cMkIM.instanceMatrix.needsUpdate = true;
        group.add(cMkIM);

        /* warm festive motes */
        group.userData.motes = buildMotes(group, 0xffdd80, 65, false);

        /* TOOLS — the Agora's marketplace actions (front of hall) */
        buildToolRow(group, accent, ['BROWSE', 'BID', 'LIST', 'TRADE'], 30, 0);

        buildNameLabel(group, 'THE BAZAAR', accent);
      },

      genericRoom: function (group, accent) {
        group.userData.animObjs = [];
        pedestal(group, accent);
        wallPanels(group, accent, 4);

        /* four corner columns frame the empty box so it doesn't read as a bare
           cube (the pedestal alone left a huge blank floor + walls) */
        column(group, accent, -26, -26);
        column(group, accent,  26, -26);
        column(group, accent, -26,  26);
        column(group, accent,  26,  26);

        /* centred floor inlay rings under the pedestal — gives the hero a base
           and structures the empty floor. Flat at y≈0.05 → walkable. */
        var gInlayM = mat(accent, accent, 0.14, 0.9, 0, true, 0.22);
        glow(gInlayM, 0.12, 0.3, 0.06);
        for (var gir = 1; gir <= 3; gir++) {
          var gRing = new THREE.Mesh(new THREE.RingGeometry(gir * 6 - 0.4, gir * 6, 48), gInlayM.clone());
          gRing.rotation.x = -Math.PI / 2; gRing.position.y = 0.05;
          gRing.renderOrder = 1; group.add(gRing);
        }

        /* a soft light shaft onto the pedestal for cinematic depth */
        buildShaft(group, 0, 0, 0.3, 2.5, ROOM_H, accent, 0.04);

        group.userData.motes = buildMotes(group, accent, 40, false);
      }
    };

    /* ── 2ND-LEVEL SKY-NEXUS ELEVATOR — REMOVED (2026-07-04) ───────────────────
       The in-room elevator (car + pad + shaft + mezzanine) and its step-on
       ascendToSky() hand-off used to live here. Elevators have moved BACK OUTSIDE
       next to each building (owned by world-elevators.js). Interiors now do ONE
       thing: you enter, explore the themed room, and EXIT (exit() drops you at the
       door outside) — then take the OUTSIDE elevator up. No skyPad / ascendToSky
       remains, so there are no dead references and no memory leak. */

    /* ── ROOM BUILDER (lazy — built on first enter) ── */
    /* ── PERF: interior DISPOSAL ─────────────────────────────────────────────
       Interiors are heavy (full rooms of geometry/materials/textures). Left in
       the scene forever they leak memory and grow every traverse. These helpers
       thoroughly free a room's GPU resources and drop it from scene + registry
       so it rebuilds lazily on the next enter(). Everything is null-safe and
       wrapped so disposal can NEVER throw and break enter/exit/update. */
    function disposeMaterial(m) {
      if (!m) return;
      try {
        for (var k in m) {                       /* dispose any texture maps */
          var v = m[k];
          if (v && v.isTexture && typeof v.dispose === 'function') v.dispose();
        }
        if (typeof m.dispose === 'function') m.dispose();
      } catch (e) { /* never throw */ }
    }
    function disposeObject3D(root) {
      if (!root || typeof root.traverse !== 'function') return;
      root.traverse(function (o) {
        try {
          if (o.geometry && typeof o.geometry.dispose === 'function') o.geometry.dispose();
          var mm = o.material;
          if (Array.isArray(mm)) { for (var j = 0; j < mm.length; j++) disposeMaterial(mm[j]); }
          else                    disposeMaterial(mm);
        } catch (e) { /* never throw */ }
      });
    }
    /* Free ONE built room. Refuses to free the room the player is standing in. */
    function disposeRoom(uc) {
      uc = upperCode(uc);
      if (uc === currentCode) return;            /* never nuke the active room */
      var r = rooms[uc];
      if (!r) return;
      try {
        if (r.group) {
          if (r.group.parent)      r.group.parent.remove(r.group);
          else if (scene && scene.remove) scene.remove(r.group);
          disposeObject3D(r.group);
        }
      } catch (e) { /* never throw */ }
      /* drop references so nothing lingers + so update() can't touch stale data */
      r.group = null; r.glowEntries = null; r.animObjs = null;
      r.motes = null;
      delete rooms[uc];
    }
    /* Ensure only ONE interior lives in memory: free every built room but keepUc. */
    function disposeAllExcept(keepUc) {
      keepUc = upperCode(keepUc);
      var keys = Object.keys(rooms);
      for (var k = 0; k < keys.length; k++) {
        if (upperCode(keys[k]) !== keepUc) disposeRoom(keys[k]);
      }
    }
    /* Grace-period free: after leaving a room, dispose it a few seconds later
       UNLESS the player has re-entered it (cheap re-enter guard). */
    function scheduleDispose(uc) {
      uc = upperCode(uc);
      if (_disposeTimer) { clearTimeout(_disposeTimer); _disposeTimer = null; }
      var pending = uc;
      _disposeTimer = setTimeout(function () {
        _disposeTimer = null;
        if (currentCode !== pending) disposeRoom(pending);   /* still outside → free */
      }, 4000);
    }

    function buildRoom(code) {
      var uc     = upperCode(code);
      /* COLOSSEUM = the real-size arena instance (world-colosseum.js), not a generic hall. */
      if (uc === 'COLOSSEUM' && global.buildColosseumArena) {
        disposeAllExcept(uc);
        rooms[uc] = global.buildColosseumArena(THREE, { scene: scene });
        return;
      }
      /* PERF: only ONE interior in memory at a time — free every other built
         room before this one is created (guards against warming several rooms
         while walking past their doors outdoors). */
      disposeAllExcept(uc);
      var theme  = themeOf(uc);
      var origin = roomOrigin(code);
      var group  = new THREE.Group();
      group.position.set(origin.x, 0, origin.z);
      group.visible = false;
      group.name    = 'interior_' + code;
      group.userData.animObjs = [];

      /* PERF: capture exactly this room's glow materials. glow() appends to the
         shared glowPool during the build below; we splice them back out into the
         room right after, so glowPool stays a transient scratch (never grows /
         leaks) and each room owns its own glow list for disposal + pulsing. */
      var glowStart = glowPool.length;

      buildShell(group, theme.accent, theme.floor);
      buildExitFrame(group, theme.accent);

      /* ── 3-light cinematic rig: key + soft fill + accent rim ── */

      /* Key light — warm directional from above-back */
      var keyLight = new THREE.PointLight(0xfff5e0, 1.0, ROOM_W * 1.4);
      keyLight.position.set(0, ROOM_H * 0.85, -ROOM_D * 0.25);
      group.add(keyLight);

      /* Fill light — cool, soft, from low-front */
      var fillLight = new THREE.PointLight(0x4060a0, 0.35, ROOM_W * 1.1);
      fillLight.position.set(0, ROOM_H * 0.25, ROOM_D * 0.30);
      group.add(fillLight);

      /* Rim / accent light — colored to room accent, from one side */
      var rimLight = new THREE.PointLight(theme.accent, 0.60, ROOM_W * 0.90);
      rimLight.position.set(-ROOM_W * 0.35, ROOM_H * 0.55, -ROOM_D * 0.10);
      group.add(rimLight);

      /* themed props */
      var fn = propBuilders[theme.propFn] || propBuilders.genericRoom;
      fn(group, theme.accent);

      /* framed FLUX wall-art (left wall, eye height) — one themed piece per room.
         Added AFTER props so its glow material joins this room's glowEntries splice. */
      hangArt(group, uc, theme.accent);

      /* NOTE: the 2nd-level in-room elevator/skyPad was removed — elevators now
         live OUTSIDE next to each building (world-elevators.js). Interiors are
         explore-and-exit only. */

      scene.add(group);
      /* pull this room's glow materials out of the shared scratch pool */
      var glowEntries = glowPool.splice(glowStart);
      rooms[uc] = {
        group:      group,
        origin:     origin,
        code:       uc,
        animObjs:   group.userData.animObjs || [],
        motes:      group.userData.motes    || null,
        glowEntries: glowEntries,
      };
    }

    function getOrBuild(code) {
      var uc = upperCode(code);
      /* re-entering the room pending grace-disposal? cancel the timer, keep it. */
      if (_disposeTimer && rooms[uc]) { clearTimeout(_disposeTimer); _disposeTimer = null; }
      if (!rooms[uc]) buildRoom(uc);
      return rooms[uc];
    }

    /* ── OUTDOOR DOORS ────────────────────────────────────────────────────────
       Owner ask #1: "if we can walk into the building, show a DOOR that OPENS."
       Every enterable building now gets a real twin-leaf door standing at its
       entrance (world-centre-facing side). The leaves SLIDE APART when the player
       walks up (proximity) and close behind them — entry is via this door + the
       cutscene, not by clipping through a wall. Built lazily once (first update)
       so it never blocks initial world load. Fully null-safe / dependency-free. */
    function buildDoorLabel(text, sub, accent) {
      /* uses textLabel() (canvas plane, DoubleSide, headless-safe) */
      return textLabel(text, 8.4, 2.0, accent, 42, sub);
    }

    function buildOutdoorDoors() {
      if (doorsBuilt) return;
      doorsBuilt = true;
      if (!scene || !THREE || !THREE.Group) return;
      /* ── ORPHANED-DOOR REMOVAL (2026-07-05) ────────────────────────────────
         The buildings are now LIFTED ~46u onto pillars (world-buildings.js
         AGENT_LIFT), with an open walk-through lounge underneath and an
         elevator up. These twin-leaf outdoor doors were built at GROUND height
         (baseY = terrain), so once the building rose onto its pillars each door
         was left standing alone in the open lounge — a frame + two leaves that
         "open in the middle" of nowhere as you walk up (no wall behind them).
         Entry is now via the lounge ELEVATOR (press R), not a ground door, so
         we no longer build these floating doors. nearestDoor()/enter() still
         work off the `doors` proximity table (unchanged) for the [E] interior
         entry; only the orphaned VISUAL door geometry is gone. */
      return;
      /* eslint-disable no-unreachable */
      for (var i = 0; i < doors.length; i++) {
        try {
          var d      = doors[i];
          var uc     = upperCode(d.code);
          var theme  = themeOf(uc);
          var accent = theme.accent;
          var R      = colliderR(uc);           /* building wall radius */
          var fx     = d.fx, fz = d.fz;         /* unit front dir (building → centre) */

          /* ground height under the door (null-safe) */
          var baseY = 0;
          if (typeof global.WORLD_HEIGHT_AT === 'function') {
            var gy = global.WORLD_HEIGHT_AT(d.sx, d.sz);
            if (typeof gy === 'number' && isFinite(gy)) baseY = gy;
          }

          /* door sits on the wall face, on the centre-facing side */
          var doorX = d.sx + fx * (R + 0.5);
          var doorZ = d.sz + fz * (R + 0.5);
          var ry    = Math.atan2(fx, fz);       /* local +Z aligns with front dir */

          var DH   = 15;                          /* door clear height */
          var DW   = 11;                          /* door clear width  */
          var LEAF = DW / 2;                       /* each leaf width   */
          var JT   = 0.85;                         /* jamb / header thickness */

          var grp = new THREE.Group();
          grp.position.set(doorX, baseY, doorZ);
          grp.rotation.y = ry;
          grp.name = 'outdoor-door:' + uc;

          /* frame — jambs + header (static, softly lit) */
          var frameM = mat(0x0c0c12, accent, 0.16, 0.45, 0.55);
          var jambG  = new THREE.BoxGeometry(JT, DH + JT, JT);
          var lj = new THREE.Mesh(jambG, frameM);        lj.position.set(-(LEAF + JT / 2), DH / 2, 0); grp.add(lj);
          var rj = new THREE.Mesh(jambG, frameM);        rj.position.set( (LEAF + JT / 2), DH / 2, 0); grp.add(rj);
          var hd = new THREE.Mesh(new THREE.BoxGeometry(DW + JT * 2, JT, JT), frameM);
          hd.position.set(0, DH + JT / 2, 0); grp.add(hd);

          /* threshold plate + glowing landing strip on the ground */
          var thrM = mat(accent, accent, 0.20, 0.45, 0.50);
          var thr  = new THREE.Mesh(new THREE.BoxGeometry(DW + JT * 2, 0.35, 2.2), thrM);
          thr.position.set(0, 0.18, 0.4); grp.add(thr);

          /* two sliding leaves */
          var leafGeo = new THREE.BoxGeometry(LEAF - 0.2, DH - 0.4, 0.5);
          var leafM   = mat(theme.floor, accent, 0.10, 0.42, 0.35, true, 0.97);
          var leafL   = new THREE.Mesh(leafGeo, leafM.clone());
          var leafR   = new THREE.Mesh(leafGeo, leafM.clone());
          var closedL = -LEAF / 2, closedR = LEAF / 2;
          leafL.position.set(closedL, DH / 2, 0);
          leafR.position.set(closedR, DH / 2, 0);
          grp.add(leafL); grp.add(leafR);

          /* neon seam strip down the centre join of each leaf */
          var seamM = mat(accent, accent, 0.34, 0.40, 0.10);
          var seamGeo = new THREE.BoxGeometry(0.18, DH - 1.0, 0.12);
          /* seams are children of the leaves (slide with them) → LEAF-LOCAL coords.
             leaf origin is its centre; inner edge (the centre join) is at ±(LEAF-0.2)/2. */
          var seamInner = (LEAF - 0.2) / 2 - 0.2;
          var seamL = new THREE.Mesh(seamGeo, seamM); seamL.position.set( seamInner, 0, 0.32); leafL.add(seamL);
          var seamR = new THREE.Mesh(seamGeo, seamM); seamR.position.set(-seamInner, 0, 0.32); leafR.add(seamR);

          /* "[ E ] ENTER — CODE" plate hovering above the door */
          var lbl = buildDoorLabel('[ E ]  ENTER', uc, accent);
          lbl.position.set(0, DH + 2.6, 0); grp.add(lbl);

          scene.add(grp);
          outdoorDoors.push({
            code:      uc,
            grp:       grp,
            leafL:     leafL,
            leafR:     leafR,
            sx:        d.sx,
            sz:        d.sz,
            closedL:   closedL,
            closedR:   closedR,
            openShift: LEAF - 0.3,                 /* how far each leaf slides */
            open:      0,                          /* 0 = shut, 1 = fully open */
            openR:     R + DOOR_EXTRA + 14,        /* proximity radius that triggers opening */
            openR2:    (R + DOOR_EXTRA + 14) * (R + DOOR_EXTRA + 14),
            prebuilt:  false,
          });
        } catch (e) { /* skip a bad door, never throw */ }
      }
    }

    /* ease-in-out for the leaf slide */
    function _easeIO(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

    /* Animate every outdoor door toward open/closed based on player proximity.
       Also warms (pre-builds) a room the moment the player enters its door radius,
       OFF the critical path (requestIdleCallback), so the enter cutscene never has
       to build heavy geometry mid-transition — kills the "lag" during the wipe. */
    function updateOutdoorDoors(px, pz, dt) {
      if (!doorsBuilt || !outdoorDoors.length) return;
      var step = Math.min(0.06, (dt || 0.016) * 3.6);   /* clamp so slow frames don't slam it open */
      for (var i = 0; i < outdoorDoors.length; i++) {
        var od = outdoorDoors[i];
        var dx = px - od.sx, dz = pz - od.sz;
        var d2 = dx * dx + dz * dz;
        var near = (currentCode === null) && (d2 < od.openR2);
        var target = near ? 1 : 0;

        if (od.open < target)      od.open = Math.min(target, od.open + step);
        else if (od.open > target) od.open = Math.max(target, od.open - step);

        var e = _easeIO(od.open);
        od.leafL.position.x = od.closedL - e * od.openShift;
        od.leafR.position.x = od.closedR + e * od.openShift;

        /* warm the interior while walking up (non-blocking) */
        if (near && !od.prebuilt) {
          od.prebuilt = true;
          _warmRoom(od.code);
        }
      }
    }

    /* Pre-build a room off the critical path so the enter cutscene stays smooth.
       Separate function => the captured code can't be clobbered by the next loop
       iteration (avoids a classic shared-var closure bug). */
    function _warmRoom(code) {
      var idle = global.requestIdleCallback || function (f) { return setTimeout(f, 0); };
      idle(function () { try { getOrBuild(code); } catch (e) {} });
    }

    /* Public helper: force a specific building's door fully open (e.g. the instant
       before an enter cutscene fires). Null-safe no-op if the door isn't built. */
    function openDoor(code) {
      if (!code) return;
      var uc = upperCode(code);
      for (var i = 0; i < outdoorDoors.length; i++) {
        if (outdoorDoors[i].code === uc) { outdoorDoors[i].open = 1; return; }
      }
    }

    /* ── DOM overlay & hint ── */
    function ensureOverlay() {
      if (overlayEl) return;
      overlayEl = document.createElement('div');
      overlayEl.id = 'wi-overlay';
      var s = overlayEl.style;
      s.position = 'fixed'; s.inset = '0'; s.background = '#000';
      s.opacity = '0'; s.pointerEvents = 'none';
      s.transition = 'opacity 0.16s ease'; s.zIndex = '9900';
      document.body.appendChild(overlayEl);
    }

    function ensureHint() {
      if (hintEl) return;
      hintEl = document.createElement('div');
      hintEl.id = 'wi-hint';
      var s = hintEl.style;
      s.position = 'fixed'; s.bottom = '64px'; s.left = '50%';
      s.transform = 'translateX(-50%)'; s.display = 'none';
      s.background = 'rgba(0,0,0,0.82)'; s.color = '#fff';
      s.padding = '7px 22px'; s.borderRadius = '6px';
      s.fontFamily = 'monospace'; s.fontSize = '13px';
      s.letterSpacing = '0.07em'; s.zIndex = '9901';
      s.border = '1px solid rgba(255,255,255,0.14)';
      s.backdropFilter = 'blur(5px)'; s.pointerEvents = 'none';
      document.body.appendChild(hintEl);
    }

    function fadeIn(cb)  { ensureOverlay(); overlayEl.style.opacity = '1'; if (cb) setTimeout(cb, 170); }
    function fadeOut()   { ensureOverlay(); overlayEl.style.opacity = '0'; }
    function showHint(t) { ensureHint(); hintEl.textContent = t; hintEl.style.display = 'block'; }
    function hideHint()  { if (hintEl) hintEl.style.display = 'none'; }

    /* ════════════════════════════════════════════════════════════════════════
       IN-INTERIOR TOOL PANEL — a 2D HUD showing THIS agent's REAL tools, usable
       from inside the building.

         • data  : GET /api/agent/tools → [{name,description,schema,agents:[CODE]}]
                   (fetched once, cached). Filtered to tools whose `agents` array
                   includes the room's agent code.
         • run   : POST /api/tools/run {tool,args} → {ok,tool,result} | {ok:false,
                   error,needsAuth?}. The REAL result is shown; needsAuth is stated
                   honestly and never faked.
         • NEXUS : also gets a GAMES launcher (existing arcade pages).

       The panel is created fresh on enter() and fully removed from the DOM on
       exit() (removing its child listeners with it) — no overlay / listener leaks.
    ════════════════════════════════════════════════════════════════════════ */
    var toolPanelEl   = null;   /* current panel root — recreated per enter, removed on exit */
    var _toolsCache   = null;   /* GET /api/agent/tools payload, cached across enters       */
    var _toolsFetch   = null;   /* in-flight fetch promise (dedupe)                         */

    /* games available inside each room. NEXUS (the Navigator Core / server room) = arcade. */
    var ROOM_GAMES = {
      NEXUS: [
        { label: '▶ AGENT ARCADE', url: '/arcade.html'    },
        { label: '▶ GRID SERPENT', url: '/tron-snake.html' },
      ],
    };

    function _accentHex(uc) {
      var n = (themeOf(uc).accent || 0x27e0ff) & 0xffffff;
      return '#' + n.toString(16).padStart(6, '0');
    }

    function fetchAgentTools() {
      if (_toolsCache) return Promise.resolve(_toolsCache);
      if (_toolsFetch) return _toolsFetch;
      _toolsFetch = fetch('/api/agent/tools')
        .then(function (r) { return r.json(); })
        .then(function (d) { _toolsCache = (d && d.tools) || []; return _toolsCache; })
        .catch(function () { _toolsFetch = null; return []; });
      return _toolsFetch;
    }

    /* Launch a game — prefer the world's embedded iframe overlay (handles pointer-
       lock release + ESC close); fall back to a new tab if it isn't present. */
    function launchGame(url) {
      try {
        if (typeof global.SHADDAI_openPanel === 'function') { global.SHADDAI_openPanel(url); return; }
      } catch (e) {}
      try { global.open(url, '_blank'); } catch (e) {}
    }

    /* Build one tool card: name + description + schema-driven inputs + Run button. */
    function buildToolCard(tool, accent) {
      var card = document.createElement('div');
      card.style.cssText =
        'border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:9px 10px;' +
        'margin-bottom:8px;background:rgba(255,255,255,0.03)';

      var nm = document.createElement('div');
      nm.textContent = tool.name;
      nm.style.cssText = 'color:' + accent + ';font-weight:700;font-size:12px;letter-spacing:0.04em';
      card.appendChild(nm);

      if (tool.description) {
        var ds = document.createElement('div');
        ds.textContent = tool.description;
        ds.style.cssText = 'color:rgba(255,255,255,0.55);font-size:10.5px;margin:3px 0 6px;line-height:1.4';
        card.appendChild(ds);
      }

      var schema = tool.schema || {};
      var keys   = Object.keys(schema);
      var inputs = {};   /* key -> { el, isNum } */
      for (var i = 0; i < keys.length; i++) {
        var key  = keys[i];
        var desc = String(schema[key] || '');
        var isNum = /\bnumber\b/i.test(desc);
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0';
        var lab = document.createElement('label');
        lab.textContent = key;
        lab.style.cssText = 'color:rgba(255,255,255,0.75);font-size:10px;min-width:78px;font-family:monospace';
        var inp = document.createElement('input');
        inp.type = isNum ? 'number' : 'text';
        inp.placeholder = desc.slice(0, 46);
        inp.title = desc;
        inp.style.cssText =
          'flex:1;min-width:0;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);' +
          'color:#fff;font-size:11px;padding:4px 6px;border-radius:5px;font-family:monospace';
        row.appendChild(lab); row.appendChild(inp);
        card.appendChild(row);
        inputs[key] = { el: inp, isNum: isNum };
      }

      var runBtn = document.createElement('button');
      runBtn.textContent = keys.length ? 'RUN ▸' : 'RUN (no input) ▸';
      runBtn.style.cssText =
        'margin-top:6px;background:' + accent + '22;border:1px solid ' + accent + ';color:' + accent + ';' +
        'font-family:monospace;font-size:11px;font-weight:700;padding:5px 14px;border-radius:6px;cursor:pointer';

      var out = document.createElement('pre');
      out.style.cssText =
        'display:none;margin:7px 0 0;max-height:150px;overflow:auto;white-space:pre-wrap;word-break:break-word;' +
        'background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.10);border-radius:6px;' +
        'padding:7px 8px;font-size:10px;line-height:1.45;color:#cfe';

      runBtn.onclick = function () {
        var args = {};
        for (var k in inputs) {
          if (!Object.prototype.hasOwnProperty.call(inputs, k)) continue;
          var v = inputs[k].el.value;
          if (v === '') continue;
          args[k] = inputs[k].isNum ? Number(v) : v;
        }
        out.style.display = 'block';
        out.style.color = '#cfe';
        out.textContent = '⟳ running ' + tool.name + '…';
        runBtn.disabled = true;
        fetch('/api/tools/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: tool.name, args: args }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            runBtn.disabled = false;
            if (d && d.ok) {
              out.style.color = '#bff5d8';
              var res = d.result;
              out.textContent = (typeof res === 'string') ? res : JSON.stringify(res, null, 2);
            } else if (d && d.needsAuth) {
              out.style.color = '#ffd479';
              out.textContent = '🔐 needs auth / API key: ' + (d.error || 'credential required') +
                                '\n(configure this key in the dashboard to use this tool)';
            } else {
              out.style.color = '#ff9aa6';
              out.textContent = '✗ ' + ((d && d.error) || 'tool failed');
            }
          })
          .catch(function (e) {
            runBtn.disabled = false;
            out.style.color = '#ff9aa6';
            out.textContent = '✗ network error: ' + (e && e.message ? e.message : e);
          });
      };

      card.appendChild(runBtn);
      card.appendChild(out);
      return card;
    }

    /* ── ZEROX MARKETS chart card — canvas line chart of live OHLC closes ──────────
       Draws BTC/ETH/SOL from /api/markets/ohlc (the world's existing markets feed). Falls
       back to a clean sample sine-wave chart if the endpoint is unavailable (no black boxes).
       `root` is the panel root so the canvas can resize when the panel is EXPANDED (#2). */
    function buildMarketChartCard(body, accent, root) {
      var card = document.createElement('div');
      card.style.cssText =
        'border:1px solid ' + accent + '44;border-radius:9px;padding:9px 10px;margin-bottom:12px;' +
        'background:rgba(0,0,0,0.30)';

      var hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:7px';
      var title = document.createElement('div');
      title.style.cssText = 'flex:1;color:' + accent + ';font-weight:700;font-size:12px;letter-spacing:0.04em';
      title.textContent = '📈 LIVE CHART';
      hdr.appendChild(title);
      ['BTC', 'ETH', 'SOL'].forEach(function (sym) {
        var b = document.createElement('button');
        b.textContent = sym;
        b.style.cssText =
          'background:' + accent + '18;border:1px solid ' + accent + '66;color:#cfe;' +
          'font-family:monospace;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;cursor:pointer';
        b.onclick = function () { load(sym.toLowerCase()); };
        hdr.appendChild(b);
      });
      card.appendChild(hdr);

      var cv = document.createElement('canvas');
      cv.width = 300; cv.height = 150;
      cv.style.cssText = 'display:block;width:100%;height:auto;border-radius:7px;background:rgba(0,0,0,0.45)';
      card.appendChild(cv);

      var meta = document.createElement('div');
      meta.style.cssText = 'font-size:10.5px;color:rgba(255,255,255,0.7);margin-top:6px;font-family:monospace';
      meta.textContent = 'loading…';
      card.appendChild(meta);

      body.appendChild(card);

      function draw(pts, label, up) {
        var ctx = cv.getContext('2d');
        var W = cv.width, H = cv.height, pad = 10;
        ctx.clearRect(0, 0, W, H);
        // grid
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        for (var g = 0; g <= 4; g++) { var gy = pad + (H - 2 * pad) * g / 4; ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke(); }
        if (!pts.length) return;
        var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), span = (max - min) || 1;
        var col = up ? '#00e5a0' : '#ff4d6a';
        // area fill
        var grad = ctx.createLinearGradient(0, pad, 0, H - pad);
        grad.addColorStop(0, up ? 'rgba(0,229,160,0.35)' : 'rgba(255,77,106,0.35)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        pts.forEach(function (p, i) {
          var x = pad + (W - 2 * pad) * i / (pts.length - 1 || 1);
          var y = (H - pad) - (H - 2 * pad) * (p - min) / span;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        var lx = W - pad, ly = H - pad;
        ctx.lineTo(lx, ly); ctx.lineTo(pad, ly); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
        // line
        ctx.beginPath();
        pts.forEach(function (p, i) {
          var x = pad + (W - 2 * pad) * i / (pts.length - 1 || 1);
          var y = (H - pad) - (H - 2 * pad) * (p - min) / span;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
      }

      function sample(sym) {
        // graceful fallback: a clean sample series so the chart is never blank/broken
        var base = sym === 'btc' ? 68000 : sym === 'eth' ? 3600 : 165, arr = [];
        for (var i = 0; i < 40; i++) arr.push(base * (1 + 0.04 * Math.sin(i / 5) + (Math.random() - 0.5) * 0.01));
        return arr;
      }

      function load(sym) {
        // Enlarge the render buffer when the panel is expanded so the chart stays crisp.
        var big = root && /width:min\(860px/.test(root.style.cssText || '');
        cv.width = big ? 760 : 300; cv.height = big ? 300 : 150;
        meta.textContent = sym.toUpperCase() + ' · loading…';
        fetch('/api/markets/ohlc?symbol=' + sym)
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d || !d.ok || !d.candles || !d.candles.length) throw new Error('no data');
            var closes = d.candles.map(function (c) { return c.c; });
            var up = (d.change24h || 0) >= 0;
            draw(closes, sym, up);
            meta.textContent = (d.symbol || sym.toUpperCase()) + '  $' + Number(d.price).toLocaleString() +
              '   ' + (up ? '▲' : '▼') + ' ' + Math.abs(d.change24h || 0) + '%  ·  ⤢ expand for a big chart';
            meta.style.color = up ? '#8ff0cf' : '#ffb0bb';
          })
          .catch(function () {
            draw(sample(sym), sym, true);
            meta.textContent = sym.toUpperCase() + ' · sample data (live feed offline) · ⤢ expand for a big chart';
            meta.style.color = 'rgba(255,255,255,0.6)';
          });
      }
      // let the panel's ⤢ EXPAND redraw the chart crisp at the new size (see expBtn handler)
      if (root) root._onResize = function () { load(_lastSym); };
      var _lastSym = 'btc';
      var _origLoad = load;
      load = function (s) { _lastSym = s; return _origLoad(s); };
      load('btc');
      return card;
    }

    /* Show the tool panel for room `uc`. Rebuilt fresh each time. */
    function showToolPanel(uc) {
      if (typeof document === 'undefined') return;
      hideToolPanel();   /* never stack two panels */
      var accent = _accentHex(uc);
      var theme  = themeOf(uc);

      var root = document.createElement('div');
      root.id = 'wi-tools';
      /* Compact style — a slim panel docked top-right. The ⤢ EXPAND button (added to the header
         below) swaps these inline styles for the large centered-modal styles so cramped tool/info
         panels become big + readable (mirrors the museum kiosk's expand). */
      var COMPACT_CSS =
        'position:fixed;top:64px;right:16px;left:auto;bottom:auto;transform:none;width:330px;max-height:calc(100vh - 140px);' +
        'display:flex;flex-direction:column;z-index:9902;' +
        'background:rgba(6,9,14,0.90);backdrop-filter:blur(7px);' +
        'border:1px solid ' + accent + '55;border-radius:11px;' +
        'box-shadow:0 8px 34px rgba(0,0,0,0.55);font-family:system-ui,sans-serif;' +
        'color:#fff;overflow:hidden';
      var EXPANDED_CSS =
        'position:fixed;top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);' +
        'width:min(860px,94vw);max-height:88vh;' +
        'display:flex;flex-direction:column;z-index:9903;' +
        'background:rgba(6,9,14,0.97);backdrop-filter:blur(10px);' +
        'border:1px solid ' + accent + ';border-radius:16px;' +
        'box-shadow:0 0 60px rgba(0,0,0,0.75),0 0 40px ' + accent + '33;font-family:system-ui,sans-serif;' +
        'color:#fff;overflow:hidden';
      var _expanded = false;
      root.style.cssText = COMPACT_CSS;

      /* keep keystrokes inside the panel from driving the world (WASD) or exiting (E/Esc) */
      ['keydown', 'keyup', 'keypress'].forEach(function (ev) {
        root.addEventListener(ev, function (e) { e.stopPropagation(); }, true);
      });

      /* header + collapse toggle */
      var head = document.createElement('div');
      head.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;' +
        'border-bottom:1px solid rgba(255,255,255,0.10);flex:0 0 auto';
      var tog = document.createElement('span');
      tog.textContent = '▾';
      tog.style.cssText = 'color:' + accent + ';font-size:12px';
      var ttl = document.createElement('div');
      ttl.textContent = (theme.label || uc) + ' — TOOLS';
      ttl.style.cssText = 'flex:1;color:' + accent + ';font-weight:700;font-size:12px;letter-spacing:0.05em';
      /* ⤢ EXPAND — opens a large, readable centered-modal version of this same panel (live tool
         cards move with it — no clone, so Run buttons keep working). Toggles back to ⤡ SHRINK. */
      var expBtn = document.createElement('button');
      expBtn.textContent = '⤢';
      expBtn.title = 'Expand to a large, readable panel';
      expBtn.style.cssText =
        'flex:0 0 auto;background:' + accent + '22;border:1px solid ' + accent + ';color:' + accent + ';' +
        'font-size:13px;line-height:1;padding:3px 8px;border-radius:6px;cursor:pointer';
      head.appendChild(tog); head.appendChild(ttl); head.appendChild(expBtn);
      root.appendChild(head);

      var body = document.createElement('div');
      body.style.cssText = 'padding:10px 12px 12px;overflow:auto;flex:1 1 auto';
      root.appendChild(body);

      /* clicking the header (title/collapse ▾) still collapses; the ⤢ button is its own control */
      head.onclick = function () {
        var hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        tog.textContent = hidden ? '▾' : '▸';
      };
      expBtn.onclick = function (ev) {
        ev.stopPropagation();                 /* don't trigger the header collapse */
        _expanded = !_expanded;
        root.style.cssText = _expanded ? EXPANDED_CSS : COMPACT_CSS;
        body.style.display = 'block';         /* expanding always reveals the body */
        tog.textContent = '▾';
        expBtn.textContent = _expanded ? '⤡' : '⤢';
        expBtn.title = _expanded ? 'Shrink back to the docked panel' : 'Expand to a large, readable panel';
        ttl.textContent = (theme.label || uc) + (_expanded ? ' — TOOLS  ·  press ⤡ or M to shrink/free cursor' : ' — TOOLS');
        try { if (typeof root._onResize === 'function') root._onResize(); } catch (e) {}   /* redraw chart crisp at the new size */
      };

      /* ── ZEROX MARKETS — in-panel price chart ─────────────────────────────────
         The player can VIEW CHARTS right inside the ZEROX Markets tool panel: a canvas
         line chart of BTC/ETH/SOL drawn from the SAME data the world already fetches
         (/api/markets/ohlc — reused from the outdoor holo-candlestick board). BTC/ETH/SOL
         switch buttons refresh it. It scales up with the ⤢ EXPAND button (#2) → big + readable.
         LIVE-DATA HOOK: swap the fetch URL below for a websocket/poll if a live feed is added. */
      if (uc === 'ZEROX') { buildMarketChartCard(body, accent, root); }

      /* NEXUS games launcher (uses existing arcade pages) */
      var games = ROOM_GAMES[uc];
      if (games && games.length) {
        var gh = document.createElement('div');
        gh.textContent = '◈ GAMES';
        gh.style.cssText = 'color:' + accent + ';font-size:11px;font-weight:700;letter-spacing:0.06em;margin:0 0 6px';
        body.appendChild(gh);
        var grow = document.createElement('div');
        grow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px';
        games.forEach(function (g) {
          var b = document.createElement('button');
          b.textContent = g.label;
          b.style.cssText =
            'background:' + accent + '22;border:1px solid ' + accent + ';color:' + accent + ';' +
            'font-family:monospace;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer';
          b.onclick = function () { launchGame(g.url); };
          grow.appendChild(b);
        });
        body.appendChild(grow);
      }

      /* tools list — filtered to this agent, populated async */
      var status = document.createElement('div');
      status.textContent = '⟳ loading tools…';
      status.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;padding:4px 0';
      body.appendChild(status);

      var listWrap = document.createElement('div');
      body.appendChild(listWrap);

      toolPanelEl = root;
      document.body.appendChild(root);

      fetchAgentTools().then(function (tools) {
        if (toolPanelEl !== root) return;   /* exited before fetch resolved */
        var mine = tools.filter(function (t) {
          var ags = t && t.agents;
          if (!ags || !ags.length) return false;
          for (var i = 0; i < ags.length; i++) {
            if (String(ags[i]).toUpperCase() === uc) return true;
          }
          return false;
        });
        if (!mine.length) {
          status.textContent = 'No dedicated tools registered for ' + uc + '.';
          return;
        }
        status.textContent = mine.length + ' tool' + (mine.length === 1 ? '' : 's') +
                             '  ·  press M to free the cursor';
        status.style.color = accent;
        for (var i = 0; i < mine.length; i++) {
          listWrap.appendChild(buildToolCard(mine[i], accent));
        }
      });
    }

    /* Remove the tool panel entirely (DOM + its child listeners) — called on exit. */
    function hideToolPanel() {
      if (toolPanelEl && toolPanelEl.parentNode) {
        toolPanelEl.parentNode.removeChild(toolPanelEl);
      }
      toolPanelEl = null;
    }

    /* ── PUBLIC API ── */

    /* NOTE: ascendToSky() (the old 2nd-level in-room elevator → Sky Nexus hand-off)
       was removed on 2026-07-04. Elevators moved OUTSIDE (world-elevators.js), so
       the player now EXITS the building (exit() → back at the door) and rides the
       outside lift up. Nothing calls ascendToSky anymore. */

    function enter(code) {
      if (currentCode) return;
      var uc   = upperCode(code);
      global.__wiRoomReady = false;             /* cutscene can gate its reveal on this */
      var room = getOrBuild(uc);                /* if warmed on approach this is instant */
      if (!room) { global.__wiRoomReady = true; return; }
      openDoor(uc);                             /* the door we walked through is fully open */

      outdoorReturn.x = playerPos.x;
      outdoorReturn.z = playerPos.z;
      outdoorReturn.y = (camera && camera.position) ? camera.position.y : 0;   // remember height so exiting an elevated temple (observatory) returns you UP THERE, not on the ground

      fadeIn(function () {
        var keys = Object.keys(rooms);
        for (var k = 0; k < keys.length; k++) {
          if (rooms[keys[k]] && rooms[keys[k]].group) rooms[keys[k]].group.visible = false;
        }
        if (room.group) room.group.visible = true;
        global.__wiRoomReady = true;   /* interior is now on-screen → safe to reveal */

        var o = room.origin;
        playerPos.x = o.x;
        playerPos.z = o.z + SPAWN_Z_OFFSET;
        if (playerPos.y !== undefined) playerPos.y = 0;

        camera.position.set(o.x, PLAYER_EYE_Y, o.z + SPAWN_Z_OFFSET + 2);
        camera.lookAt(o.x, PLAYER_EYE_Y, o.z);

        if (controls && controls.target && controls.target.set) {
          controls.target.set(o.x, PLAYER_EYE_Y, o.z);
          if (controls.update) controls.update();
        }

        currentCode = uc;
        fadeOut();

        var theme = themeOf(uc);
        showHint(theme.label + '   ·   [E] or [ESC] to exit');
        showToolPanel(uc);   /* in-interior HUD: this agent's REAL tools (+ games in NEXUS) */
      });
    }

    function exit() {
      if (!currentCode) return;
      var _leftUc = currentCode;                 /* remember which room to free */
      fadeIn(function () {
        if (rooms[currentCode] && rooms[currentCode].group) rooms[currentCode].group.visible = false;

        var rx = outdoorReturn.x, rz = outdoorReturn.z;
        playerPos.x = rx;
        playerPos.z = rz;
        // Return to the height we entered from. If you entered at ground, this ≈ ground; if you entered
        // from an elevated deck (the observatory), this keeps you up there (the deck's groundY takes over).
        var eyeY = outdoorReturn.y || ((global.WORLD_HEIGHT_AT ? global.WORLD_HEIGHT_AT(rx, rz) : 0) + PLAYER_EYE_Y);
        if (playerPos.y !== undefined) playerPos.y = eyeY - PLAYER_EYE_Y;
        camera.position.set(rx, eyeY, rz + 12);
        camera.lookAt(rx, eyeY - PLAYER_EYE_Y + 2, rz);

        if (controls && controls.target && controls.target.set) {
          controls.target.set(rx, eyeY - PLAYER_EYE_Y + 2, rz);
          if (controls.update) controls.update();
        }

        currentCode = null;
        fadeOut();
        hideHint();
        hideToolPanel();   /* tear down the in-interior tool HUD — no DOM/listener leak */
        /* PERF: free the interior we just left (grace period lets an immediate
           re-enter reuse it; otherwise its geometry/materials/textures are freed). */
        scheduleDispose(_leftUc);
      });
    }

    function isInside() {
      /* SAFETY NET (2026-09-25): every room lives on an off-map island (x ≥ ROOM_ISLAND_X). If we think we're
         inside but the player is standing on the normal map (e.g. a spawn sky-dive moved them after enter()),
         clear the stuck state — otherwise collisions, terrain height and door prompts all switch off outdoors. */
      if (currentCode !== null && playerPos && playerPos.x < ROOM_ISLAND_X - 1000) {
        if (rooms[currentCode] && rooms[currentCode].group) rooms[currentCode].group.visible = false;
        currentCode = null; hideHint(); hideToolPanel();
      }
      return currentCode !== null;
    }

    function nearestDoor(x, z) {
      /* PERF: O(doors), zero allocations, squared-distance compares.
         Only one Math.sqrt at the very end (when a door is actually in range),
         and the returned {code,dist} object is only allocated on a hit —
         identical to the previous public contract. */
      var bestCode = null, bestDistSq = Infinity;
      for (var i = 0; i < doors.length; i++) {
        var d      = doors[i];
        var dx     = x - d.sx;
        var dz     = z - d.sz;
        var distSq = dx * dx + dz * dz;
        if (distSq > d.thrSq || distSq >= bestDistSq) continue;
        /* FRONT-ONLY gate: player must be on the door side (facing world-centre).
           dot = (player-building)·frontDir. dot>0 → front half-space; then
           dot*dot >= COS_FRONT2*distSq → inside the cone. All squared, zero allocs. */
        var dot = dx * d.fx + dz * d.fz;
        if (dot <= 0) continue;
        if (dot * dot < COS_FRONT2 * distSq) continue;
        bestDistSq = distSq; bestCode = d.code;
      }
      return bestCode ? { code: bestCode, dist: Math.sqrt(bestDistSq) } : null;
    }

    /**
     * update(dt, t) — allocation-free.
     * - glowPool: all registered materials pulsed (just Math.sin, negligible cost).
     * - animObjs: only the ACTIVE room's rotating meshes are stepped.
     * - motes:    only the ACTIVE room's particle buffer is updated.
     */
    function update(dt, t) {
      var i, g, wave;

      /* OUTDOOR DOORS — built lazily on first update (after the world/scene is
         fully live), then animated open/closed by player proximity. Runs whether
         or not the player is inside a room (doors close themselves while inside). */
      if (!doorsBuilt) buildOutdoorDoors();
      updateOutdoorDoors(playerPos ? playerPos.x : 0, playerPos ? playerPos.z : 0, dt);

      /* PERF: interior prop animation only matters while the player is actually
         inside a room — every interior is off-map and invisible otherwise.
         Bail immediately when not inside so NO prop work (glow pulse, rotations,
         motes) runs off-screen. Zero per-frame allocations below this point. */
      if (!currentCode || !rooms[currentCode]) return;
      var r = rooms[currentCode];

      /* glow pulse — ONLY the active room's own material list (see buildRoom).
         Emissive intensity is a pure function of (t, phase), so a re-entered
         room snaps to the correct value instantly — no visible behavior change. */
      var ge = r.glowEntries;
      if (ge) {
        for (i = 0; i < ge.length; i++) {
          g = ge[i];
          if (!g || !g.mat) continue;
          wave = 0.5 + 0.5 * Math.sin(t * 1.15 + g.phase);
          g.mat.emissiveIntensity = g.base + g.amp * wave;
        }
      }

      /* rotations (+ optional vertical bob) — active room only, alloc-free */
      var ao = r.animObjs;
      if (ao) {
        for (i = 0; i < ao.length; i++) {
          var aoi = ao[i];
          aoi.mesh.rotation[aoi.axis] += aoi.speed * dt;
          /* optional float: {bobAmp, bobSpeed, baseY} → gentle Y hover */
          if (aoi.bobAmp) {
            aoi.mesh.position.y = aoi.baseY + aoi.bobAmp * Math.sin(t * aoi.bobSpeed);
          }
        }
      }

      /* particle motes */
      var m = r.motes;
      if (m) {
        var pa = m.pts.geometry.attributes.position.array;
        var hs = m.hs;
        for (i = 0; i < m.count; i++) {
          pa[i*3]   += m.vel[i*3];
          pa[i*3+1] += m.vel[i*3+1];
          pa[i*3+2] += m.vel[i*3+2];
          /* wrap Y */
          if (m.falling) {
            if (pa[i*3+1] < 0.5) pa[i*3+1] = ROOM_H - 1;
          } else {
            if (pa[i*3+1] > ROOM_H - 1) pa[i*3+1] = 1;
          }
          /* wrap XZ */
          if (pa[i*3]   >  hs) pa[i*3]   -= hs * 2;
          if (pa[i*3]   < -hs) pa[i*3]   += hs * 2;
          if (pa[i*3+2] >  hs) pa[i*3+2] -= hs * 2;
          if (pa[i*3+2] < -hs) pa[i*3+2] += hs * 2;
        }
        m.pts.geometry.attributes.position.needsUpdate = true;
      }
    }

    return { enter: enter, exit: exit, isInside: isInside, update: update,
             code: function () { return currentCode; },
             nearestDoor: nearestDoor, openDoor: openDoor, roomReady: function () { return global.__wiRoomReady !== false; } };
  };

}(window));
