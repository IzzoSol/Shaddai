/* world-elevators.js — SHADDAI World elevator + transit platform network
 * NEXUS + TURTLE build — v1.0 (2026-07-02)
 *
 * API:
 *   window.buildWorldElevators({ THREE, scene, layout, playerPos, getGroundY })
 *     → { update(dt, t), platforms, nearestPlatform(x,z), groundY(), isRiding() }
 *
 * Systems:
 *   • VERTICAL ELEVATORS — glowing 3-rail energy column + disc pad at every sector
 *     building + bazaar. Pad rises/lowers between ground and a high observation deck.
 *     Player stands on it; the platform carries their Y upward, camera follows.
 *
 *   • HORIZONTAL TRANSIT PODS — large glowing disc pads that slide along each of
 *     the 7 sacred-geometry road spokes between the SHADDAI temple and agent
 *     buildings. Step on, get carried across. Step off at either terminus.
 *
 *   • RIDING LOGIC — zero-alloc per-frame delta carry:
 *       prevPos cached each frame; Δ(curPos-prevPos) added to playerPos.
 *       Vertical: playerPos.y is set, exposing groundY() override for the camera.
 *       Horizontal: playerPos.x/z only; pod hovers at constant height.
 *
 *   • VISUALS — per-sector colour rim (MeshStandard emissive) + additive halo ring
 *     + pulsing emissive energy columns. All geometry pre-shared; no per-frame alloc.
 *
 * Perf:
 *   • Geometries declared once at module scope, shared by all pads of the same type.
 *   • Materials pooled by colour hex (rimMatCache / glowMatCache).
 *   • All per-frame vectors pre-allocated (_v3a, _v3b, prevPos/curPos per platform).
 *   • Dynamic PointLights: ZERO — visual glow is purely emissive material + AdditiveBlending.
 *   • node --check clean: ES6, no imports/exports, no per-frame `new`.
 */

(function () {
  // ── SHARED GEOMETRY POOL — created once, reused everywhere ──────────────
  // Declared lazily inside buildWorldElevators so THREE is available.

  window.buildWorldElevators = function (opts) {
    var THREE      = opts.THREE;
    var scene      = opts.scene;
    var layout     = opts.layout || window.WORLD_LAYOUT;
    var playerPos  = opts.playerPos;
    var getGroundY = opts.getGroundY || window.WORLD_HEIGHT_AT || function () { return 0; };

    // ── TUNING ─────────────────────────────────────────────────────────────
    var ELEV_HIGH        = 26;     // elevator upper floor height (world-Y)
    var ELEV_PAUSE       = 2.6;   // dwell seconds at each end
    var ELEV_SPEED       = 9;     // units/s vertical
    var TRANSIT_HEIGHT   = 1.9;   // transit pod hover above ground
    var TRANSIT_SPEED    = 16;    // units/s horizontal
    var TRANSIT_PAUSE    = 3.0;   // dwell at each terminus
    var ELEV_PAD_R       = 5.4;   // elevator pad ride-detection radius (forgiving; pad disc R≈4.0)
    var TRANSIT_PAD_R    = 6.8;   // transit pod ride-detection radius (forgiving; pad disc R≈5.4)
    var RIDE_Y_TOL       = 3.6;   // Y tolerance for step-on detection (forgiving vertical reach)
    var EXIT_R_MULT      = 1.35;  // hysteresis: once riding, stay on until this×radius — no edge fall-off
    var BLDG_INSET       = 28;    // push pad this far toward center so it clears the building mesh
    var SPOKE_INSET      = 0.11;  // fraction of spoke length to inset each end from building
    var BOARD_R_MULT     = 1.5;   // [E]-key boarding: forgiving range = padR × this (wider than step-on)

    // ── SHARED GEOMETRIES ──────────────────────────────────────────────────
    var GEO = {
      padElev:    new THREE.CylinderGeometry(3.8, 4.0, 0.30, 32, 1),
      padTransit: new THREE.CylinderGeometry(5.0, 5.4, 0.34, 32, 1),
      rimElev:    new THREE.TorusGeometry(3.90, 0.14, 8, 48),
      rimTransit: new THREE.TorusGeometry(5.15, 0.16, 8, 48),
      haloElev:   new THREE.TorusGeometry(3.90, 0.32, 4, 48),
      halosTransit: new THREE.TorusGeometry(5.15, 0.42, 4, 48),
      capElev:    new THREE.CylinderGeometry(3.0, 3.0, 0.07, 24, 1),
      capTransit: new THREE.CylinderGeometry(4.0, 4.0, 0.07, 24, 1),
      // Energy column parts — heights differ per elevator so those CylinderGeoms
      // are created once per elevator in buildVerticalElevator(), but the cap
      // orbs are shared:
      capOrb:     new THREE.CylinderGeometry(0.52, 0.52, 0.20, 14, 1),
      // ── ARRIVAL DECK (top-of-run observation platform) — all shared, built once ──
      deckFloor:  new THREE.RingGeometry(4.6, 9.0, 44, 1),   // flat annulus; lift rises through the hole
      deckRail:   new THREE.TorusGeometry(8.7, 0.14, 8, 44), // outer safety rail
      deckRailIn: new THREE.TorusGeometry(4.7, 0.10, 8, 36), // inner rail around the shaft opening
      deckPost:   new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6, 1),
    };

    // ── SHARED MATERIALS ───────────────────────────────────────────────────
    var MAT = {
      padBody: new THREE.MeshStandardMaterial({
        color: 0x090f1e, metalness: 0.75, roughness: 0.32,
        emissive: new THREE.Color(0x08213e), emissiveIntensity: 0.38,
      }),
      column: new THREE.MeshStandardMaterial({
        color: 0x040c1a, metalness: 0.88, roughness: 0.22,
        emissive: new THREE.Color(0x001e40), emissiveIntensity: 0.45,
        transparent: true, opacity: 0.72,
      }),
    };

    // Per-colour rim + halo materials — cached by hex to avoid duplicates
    var _rimCache  = {};
    var _haloCache = {};

    function rimMat(colorHex) {
      if (!_rimCache[colorHex]) {
        _rimCache[colorHex] = new THREE.MeshStandardMaterial({
          color:             new THREE.Color(colorHex),
          emissive:          new THREE.Color(colorHex),
          emissiveIntensity: 0.90,
          metalness:  0.60,
          roughness:  0.22,
        });
      }
      return _rimCache[colorHex];
    }

    function haloMat(colorHex) {
      if (!_haloCache[colorHex]) {
        _haloCache[colorHex] = new THREE.MeshBasicMaterial({
          color:       new THREE.Color(colorHex),
          transparent: true,
          opacity:     0.20,
          blending:    THREE.AdditiveBlending,
          depthWrite:  false,
          side:        THREE.DoubleSide,
        });
      }
      return _haloCache[colorHex];
    }

    // Per-elevator capOrb material created fresh (emissiveIntensity animated)
    function capOrbMat(colorHex) {
      return new THREE.MeshStandardMaterial({
        color:             new THREE.Color(colorHex),
        emissive:          new THREE.Color(colorHex),
        emissiveIntensity: 0.90,
        metalness:  0.80,
        roughness:  0.20,
      });
    }

    // Per-elevator core material created fresh (opacity animated)
    function coreMat(colorHex) {
      return new THREE.MeshBasicMaterial({
        color:       new THREE.Color(colorHex),
        transparent: true,
        opacity:     0.50,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
      });
    }

    // ── PRE-ALLOCATED WORKING VECTORS (ZERO per-frame alloc) ───────────────
    // _v3a and _v3b are available for any scratch use inside update().
    // Each platform has its own prevPos + curPos.
    var _v3a = new THREE.Vector3();

    // Scratch object reused by nearestInfo() so the per-frame hot path never
    // allocates. Its fields are overwritten on each successful call.
    var _info = { dist: 0, label: '' };

    // ── PLATFORM REGISTRY ─────────────────────────────────────────────────
    var platforms = [];

    // ── HUD ───────────────────────────────────────────────────────────────
    var _hud = document.createElement('div');
    _hud.style.cssText = [
      'position:fixed', 'bottom:120px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:22', "font-family:'Orbitron',sans-serif", 'font-size:12px',
      'letter-spacing:3px', 'color:#27e0ff',
      'text-shadow:0 0 14px #27e0ff,0 0 36px rgba(39,224,255,0.4)',
      'background:rgba(0,8,24,0.78)', 'border:1px solid rgba(39,224,255,0.26)',
      'border-radius:7px', 'padding:7px 22px', 'display:none', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(_hud);
    var _hudLast = '';
    function _setHud(text) {
      if (_hudLast === text) return;
      _hudLast = text;
      if (text) { _hud.textContent = text; _hud.style.display = 'block'; }
      else       { _hud.style.display = 'none'; }
    }

    // ── PAD MESH BUILDER ──────────────────────────────────────────────────
    // Returns { group, rim, halo } — all meshes parented to group.
    function _makePad(type, colorHex, wx, gy, wz) {
      var isElev = (type === 'elev');
      var group  = new THREE.Group();

      // Base disc
      var disc = new THREE.Mesh(isElev ? GEO.padElev : GEO.padTransit, MAT.padBody);
      group.add(disc);

      // Glowing rim torus
      var rim = new THREE.Mesh(isElev ? GEO.rimElev : GEO.rimTransit, rimMat(colorHex));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.18;
      group.add(rim);

      // Additive halo ring
      var halo = new THREE.Mesh(isElev ? GEO.haloElev : GEO.halosTransit, haloMat(colorHex));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.18;
      group.add(halo);

      // Thin accent top cap
      var cap = new THREE.Mesh(isElev ? GEO.capElev : GEO.capTransit, rimMat(colorHex));
      cap.position.y = 0.28;
      group.add(cap);

      group.position.set(wx, gy, wz);
      scene.add(group);
      return { group: group, rim: rim, halo: halo };
    }

    // ── ENERGY COLUMN BUILDER (vertical elevators only) ───────────────────
    // Returns { group, cores[], capOrbs[] } for per-frame animation.
    function _makeRailColumn(wx, wz, gy, height, colorHex) {
      var g = new THREE.Group();

      // Outer rail tube (opaque dark metal)
      var rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.12, height, 10, 1),
        MAT.column
      );
      rail.position.y = height / 2;
      g.add(rail);

      // Inner energy core (bright, additive)
      var core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, height * 0.94, 6, 1),
        coreMat(colorHex)
      );
      core.position.y = height / 2;
      g.add(core);

      // Top cap orb
      var orbTop = new THREE.Mesh(GEO.capOrb, capOrbMat(colorHex));
      orbTop.position.y = height + 0.12;
      g.add(orbTop);

      // Bottom cap (dark)
      var orbBot = new THREE.Mesh(GEO.capOrb, MAT.column);
      orbBot.position.y = 0.12;
      g.add(orbBot);

      g.position.set(wx, gy, wz);
      scene.add(g);
      return { group: g, core: core, orbTop: orbTop };
    }

    // ── ARRIVAL DECK BUILDER (vertical elevators only) ────────────────────
    // A real second-level landing at the TOP of the lift's run: a circular
    // observation deck (annular floor the lift docks flush into), safety
    // railing on posts, and a glowing beacon orb overhead. 100% static
    // geometry — built once at construction time, never touched per frame.
    function _makeArrivalDeck(wx, wz, topY, colorHex) {
      var g = new THREE.Group();

      // Annular floor — the lift pad rises through the central opening and
      // docks flush with the deck surface, so you step off onto solid ground.
      var floor = new THREE.Mesh(GEO.deckFloor, MAT.padBody);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0;
      g.add(floor);

      // Outer + inner glowing safety rails
      var rail = new THREE.Mesh(GEO.deckRail, rimMat(colorHex));
      rail.rotation.x = Math.PI / 2;
      rail.position.y = 1.1;
      g.add(rail);

      var railIn = new THREE.Mesh(GEO.deckRailIn, rimMat(colorHex));
      railIn.rotation.x = Math.PI / 2;
      railIn.position.y = 0.7;
      g.add(railIn);

      // Railing posts around the outer edge
      for (var pi = 0; pi < 8; pi++) {
        var pa = (pi / 8) * Math.PI * 2;
        var post = new THREE.Mesh(GEO.deckPost, MAT.column);
        post.position.set(Math.cos(pa) * 8.7, 0.55, Math.sin(pa) * 8.7);
        g.add(post);
      }

      // Beacon orb hovering over the shaft — a visible "you have arrived" light
      var beacon = new THREE.Mesh(GEO.capOrb, capOrbMat(colorHex));
      beacon.scale.set(1.6, 1.6, 1.6);
      beacon.position.y = 3.6;
      g.add(beacon);

      g.position.set(wx, topY, wz);
      scene.add(g);
      return g;
    }

    // ── BUILD: VERTICAL ELEVATOR ──────────────────────────────────────────
    // Placed just outside each building, offset toward the world center so
    // it doesn't clip the building mesh. Three rail columns form a triangle
    // around the pad; the pad itself travels between lowY and highY.
    function buildVerticalElevator(code, wx, wz, colorHex) {
      var gy  = (getGroundY(wx, wz) || 0);
      var lowY = gy + 0.08;
      var highY = gy + ELEV_HIGH;

      // Offset pad toward world center so it sits beside the building, not inside it
      var lenXZ = Math.sqrt(wx * wx + wz * wz) || 1;
      var padX  = wx - (wx / lenXZ) * BLDG_INSET;
      var padZ  = wz - (wz / lenXZ) * BLDG_INSET;

      // 3 rail columns arranged in equilateral triangle around the pad
      var columnData = [];
      for (var i = 0; i < 3; i++) {
        var ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
        var cx  = padX + Math.cos(ang) * 3.6;
        var cz  = padZ + Math.sin(ang) * 3.6;
        var col = _makeRailColumn(cx, cz, gy, ELEV_HIGH + 2.2, colorHex);
        columnData.push(col);
      }

      // Real second-level destination: an observation deck at the top of the run.
      _makeArrivalDeck(padX, padZ, highY, colorHex);
      var destLabel = code + ' OBSERVATION DECK';

      var padObj = _makePad('elev', colorHex, padX, lowY, padZ);

      // Pre-allocated vectors per platform
      var curPos  = new THREE.Vector3(padX, lowY, padZ);
      var prevPos = new THREE.Vector3(padX, lowY, padZ);

      var p = {
        type:      'elev',
        code:      code,
        colorHex:  colorHex,
        group:     padObj.group,
        rim:       padObj.rim,
        halo:      padObj.halo,
        columns:   columnData,      // for animation
        curPos:    curPos,
        prevPos:   prevPos,
        lowY:      lowY,
        highY:     highY,
        yNorm:     0,               // 0 = at lowY, 1 = at highY (eased into curPos.y)
        dir:       1,               // +1 rising, -1 descending
        pauseT:    ELEV_PAUSE,      // start paused at ground
        isRiding:  false,
        label:     code + ' LIFT',
        destLabel: destLabel,             // human name of the top destination
        rideLabel: 'RIDE TO ' + destLabel, // used by nearestInfo() for the [E] prompt
        px:        padX,
        pz:        padZ,
        padR:      ELEV_PAD_R,
        padR2:     ELEV_PAD_R * ELEV_PAD_R,
        padR2Exit: (ELEV_PAD_R * EXIT_R_MULT) * (ELEV_PAD_R * EXIT_R_MULT),
      };
      platforms.push(p);
      return p;
    }

    // ── BUILD: HORIZONTAL TRANSIT POD ─────────────────────────────────────
    // Travels along a road spoke from the SHADDAI center to an agent building.
    // Pod starts at the center-side terminus and shuttles back and forth.
    function buildTransitPod(codeA, axW, azW, codeB, bxW, bzW, colorHex) {
      var gy = (getGroundY((axW + bxW) * 0.5, (azW + bzW) * 0.5) || 0);
      var hY = gy + TRANSIT_HEIGHT;

      // Inset both ends away from the buildings/temple
      var dx  = bxW - axW, dz = bzW - azW;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx  = dx / len, nz = dz / len;
      var ins = len * SPOKE_INSET;

      var startPos = new THREE.Vector3(axW + nx * ins, hY, azW + nz * ins);
      var endPos   = new THREE.Vector3(bxW - nx * ins, hY, bzW - nz * ins);
      var totalDist = startPos.distanceTo(endPos);

      var padObj = _makePad('transit', colorHex, startPos.x, startPos.y, startPos.z);

      var curPos  = new THREE.Vector3().copy(startPos);
      var prevPos = new THREE.Vector3().copy(startPos);

      var p = {
        type:      'transit',
        codeFrom:  codeA,
        codeTo:    codeB,
        colorHex:  colorHex,
        group:     padObj.group,
        rim:       padObj.rim,
        halo:      padObj.halo,
        columns:   null,
        curPos:    curPos,
        prevPos:   prevPos,
        startPos:  startPos,
        endPos:    endPos,
        totalDist: totalDist,
        tNorm:     0,               // 0 = at startPos, 1 = at endPos
        dir:       1,
        pauseT:    TRANSIT_PAUSE,   // start paused
        isRiding:  false,
        label:     codeA + ' → ' + codeB,
        destLabel: codeB + ' TERMINAL',
        rideLabel: 'RIDE TO ' + codeB, // used by nearestInfo() for the [E] prompt
        px:        startPos.x,
        pz:        startPos.z,
        padR:      TRANSIT_PAD_R,
        padR2:     TRANSIT_PAD_R * TRANSIT_PAD_R,
        padR2Exit: (TRANSIT_PAD_R * EXIT_R_MULT) * (TRANSIT_PAD_R * EXIT_R_MULT),
      };
      platforms.push(p);
      return p;
    }

    // ── POPULATE FROM LAYOUT ──────────────────────────────────────────────

    var sectors = (layout && layout.sectors) || [];
    var roads   = (layout && layout.roads)   || [];
    var bazaarLmk = (layout && layout.landmark) ? layout.landmark('bazaar') : null;

    // Build a vertical elevator at each sector building
    sectors.forEach(function (s) {
      buildVerticalElevator(s.code, s.pos[0], s.pos[1], s.color || 0x27e0ff);
    });

    // Vertical elevator at the bazaar
    if (bazaarLmk) {
      buildVerticalElevator('BAZAAR', bazaarLmk.pos[0], bazaarLmk.pos[1], bazaarLmk.color || 0x00e5a0);
    }

    // Transit pods along every road spoke
    var _blendColor = new THREE.Color(); // pre-alloc for colour blending at build time
    roads.forEach(function (road) {
      var sA = sectors.find(function (s) { return s.code === road[0]; });
      var sB = sectors.find(function (s) { return s.code === road[1]; });
      if (!sA || !sB) return;
      _blendColor.set(sA.color || 0x27e0ff);
      _blendColor.lerp(new THREE.Color(sB.color || 0x27e0ff), 0.5);
      buildTransitPod(
        sA.code, sA.pos[0], sA.pos[1],
        sB.code, sB.pos[0], sB.pos[1],
        _blendColor.getHex()
      );
    });

    // ── STATE for Y return-to-ground when stepping off a vertical elevator
    var _ridingElevY = null;   // null when not on an elevator; number when on one
    var _yReturnLerp = 0;      // 0→1 lerp fraction for smooth landing

    // ── UPDATE — called every frame from animate(dt, t) ───────────────────
    // ZERO per-frame allocation. All vectors pre-owned by their platform object.
    function update(dt, t) {
      var nearPlat    = null;
      var nearDist2   = 16 * 16;   // HUD hint range
      var ridingAny   = false;
      var ridingElev  = false;

      for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];

        // ── Cache previous position before this frame's movement ──────────
        p.prevPos.copy(p.curPos);

        // ── Move the platform ─────────────────────────────────────────────

        if (p.type === 'elev') {
          // Vertical elevator: rise/lower between lowY ↔ highY.
          // Progress advances linearly in yNorm; a smoothstep ease maps it to
          // the actual Y so the pad accelerates off each end and decelerates
          // into it (no jerky snap at the extremes of travel).
          var span = p.highY - p.lowY;
          if (p.pauseT > 0) {
            p.pauseT -= dt;
          } else {
            var rate = (span > 0.001) ? (ELEV_SPEED * dt / span) : 1;
            p.yNorm += p.dir * rate;
            if (p.yNorm >= 1) {
              p.yNorm  = 1;
              p.dir    = -1;
              p.pauseT = ELEV_PAUSE;
            } else if (p.yNorm <= 0) {
              p.yNorm  = 0;
              p.dir    = 1;
              p.pauseT = ELEV_PAUSE;
            }
          }
          // smoothstep(yNorm): ease-in-out at both ends of the run
          var eY = p.yNorm * p.yNorm * (3 - 2 * p.yNorm);
          p.curPos.y = p.lowY + span * eY;

          // Subtle idle float — SUPPRESSED while a rider is aboard so the ride
          // (and the carried camera) is perfectly smooth with zero micro-jitter.
          var elevBob = p.isRiding ? 0 : Math.sin(t * 1.3 + i * 0.5) * 0.10;
          p.group.position.set(p.curPos.x, p.curPos.y + elevBob, p.curPos.z);

        } else {
          // Horizontal transit pod: slide between startPos ↔ endPos
          if (p.pauseT > 0) {
            p.pauseT -= dt;
          } else {
            var tStep = (p.totalDist > 0.001) ? (TRANSIT_SPEED * dt / p.totalDist) : 1;
            p.tNorm  += p.dir * tStep;
            if (p.tNorm >= 1) {
              p.tNorm  = 1;
              p.dir    = -1;
              p.pauseT = TRANSIT_PAUSE;
            } else if (p.tNorm <= 0) {
              p.tNorm  = 0;
              p.dir    = 1;
              p.pauseT = TRANSIT_PAUSE;
            }
            // smoothstep ease so the pod accelerates out of / decelerates into
            // each terminus instead of lurching. lerpVectors is zero-alloc.
            var eT = p.tNorm * p.tNorm * (3 - 2 * p.tNorm);
            p.curPos.lerpVectors(p.startPos, p.endPos, eT);
          }
          // Hover bob for visual polish
          var podBob = Math.sin(t * 1.5 + i * 0.8) * 0.20;
          p.group.position.set(p.curPos.x, p.curPos.y + podBob, p.curPos.z);
        }

        // ── Ride detection ────────────────────────────────────────────────
        // Player is "on" this platform when their XZ is within the pad footprint
        // AND their Y is close enough to the pad surface (step-on condition).
        // Once riding, they stay riding until they leave the XZ footprint.
        var dxP  = playerPos.x - p.curPos.x;
        var dzP  = playerPos.z - p.curPos.z;
        var d2   = dxP * dxP + dzP * dzP;
        // Hysteresis: forgiving board radius, and a wider "keep riding" radius
        // so you don't drop off the moment you drift toward the pad edge.
        var inXZ = p.isRiding ? (d2 < p.padR2Exit) : (d2 < p.padR2);
        // For initial step-on: check Y proximity. Once already riding,
        // skip the Y check so the elevator can carry them upward.
        var inY  = p.isRiding || (Math.abs(playerPos.y - p.curPos.y) < RIDE_Y_TOL);

        var wasRiding = p.isRiding;
        p.isRiding    = inXZ && inY;

        if (p.isRiding) {
          ridingAny = true;

          // Delta carry — zero-alloc arithmetic on scalars
          var ddx = p.curPos.x - p.prevPos.x;
          var ddy = p.curPos.y - p.prevPos.y;
          var ddz = p.curPos.z - p.prevPos.z;

          playerPos.x += ddx;
          playerPos.z += ddz;

          if (p.type === 'elev') {
            // Vertical carry: track player Y to the pad
            playerPos.y += ddy;
            ridingElev = true;
            _ridingElevY = p.curPos.y;
          }
          // Transit pods: only XZ — they hover at constant height, Y unchanged

        } else if (wasRiding && p.type === 'elev') {
          // Just stepped off an elevator — begin Y lerp back to ground
          _yReturnLerp = 0;
        }

        // ── Visual animation ──────────────────────────────────────────────
        // Rim emissive pulse
        if (p.rim && p.rim.material) {
          p.rim.material.emissiveIntensity = (p.isRiding ? 1.55 : 0.90)
            + Math.sin(t * 2.4 + i * 1.1) * 0.28;
        }
        // Halo opacity pulse + slow rotation
        if (p.halo) {
          if (p.halo.material) {
            p.halo.material.opacity = 0.12
              + Math.sin(t * 1.9 + i * 0.75) * 0.07
              + (p.isRiding ? 0.13 : 0);
          }
          p.halo.rotation.z = t * 0.28 + i * 0.4;
        }

        // Energy column animation (elevator only)
        if (p.columns) {
          for (var ci = 0; ci < p.columns.length; ci++) {
            var col = p.columns[ci];
            if (col.core && col.core.material) {
              col.core.material.opacity = 0.30
                + Math.sin(t * 3.5 + ci * 2.2 + i * 0.6) * 0.22;
            }
            if (col.orbTop && col.orbTop.material) {
              col.orbTop.material.emissiveIntensity = 0.75
                + Math.sin(t * 2.6 + ci * 1.8) * 0.30;
            }
          }
        }

        // ── Nearest-platform tracking for HUD ─────────────────────────────
        if (d2 < nearDist2) {
          nearDist2 = d2;
          nearPlat  = p;
        }
      } // end platform loop

      // ── Y return-to-ground when not riding a vertical elevator ───────────
      if (!ridingElev) {
        _ridingElevY = null;
        var groundTarget = (getGroundY(playerPos.x, playerPos.z) || 0);
        if (Math.abs(playerPos.y - groundTarget) > 0.02) {
          // Smooth descent: lerp ~85% of the gap closed per second
          playerPos.y += (groundTarget - playerPos.y) * Math.min(1, dt * 7);
        } else {
          playerPos.y = groundTarget;
        }
      }

      // Expose riding state globally so the lead can gate world-edge clamp
      window._elevatorRiding = ridingAny;

      // ── HUD message ───────────────────────────────────────────────────────
      if (ridingAny) {
        var rp = null;
        for (var j = 0; j < platforms.length; j++) {
          if (platforms[j].isRiding) { rp = platforms[j]; break; }
        }
        _setHud(rp ? ('▲▼  RIDING  ' + rp.label + (rp.type === 'elev' ? '  ▲▼' : '  ◄►')) : null);
      } else if (nearPlat) {
        _setHud(nearPlat.type === 'elev'
          ? ('▲▼  ' + nearPlat.label + '  — STEP ON TO RIDE')
          : ('◄►  TRANSIT  ' + nearPlat.label + '  — STEP ON TO RIDE'));
      } else {
        _setHud(null);
      }
    }

    // ── PUBLIC API ────────────────────────────────────────────────────────

    // nearestPlatform(x, z) — returns the closest platform object by XZ distance
    function nearestPlatform(x, z) {
      var best = null, bd2 = Infinity;
      for (var i = 0; i < platforms.length; i++) {
        var p  = platforms[i];
        var dx = x - p.curPos.x, dz = z - p.curPos.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < bd2) { bd2 = d2; best = p; }
      }
      return best;
    }

    // groundY() — returns the current elevator Y for camera use when riding a
    // vertical elevator, or null when not on one (lead falls back to terrain heightAt).
    function groundY() {
      return _ridingElevY;
    }

    // isRiding() — true if the player is on any platform this frame
    function isRiding() {
      return !!window._elevatorRiding;
    }

    // ── Nearest boardable platform to (x,z), ignoring any beyond [E] range ──
    // Shared helper for tryBoard() + nearestInfo(). Returns the platform and
    // writes the squared distance into _boardScan.d2. Zero allocation.
    var _boardScan = { p: null, d2: Infinity };
    function _scanBoardable(x, z) {
      var best = null, bd2 = Infinity;
      for (var i = 0; i < platforms.length; i++) {
        var p  = platforms[i];
        var dx = x - p.curPos.x, dz = z - p.curPos.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < bd2) { bd2 = d2; best = p; }
      }
      _boardScan.p  = best;
      _boardScan.d2 = bd2;
      return best;
    }

    // tryBoard(x, z) — board the nearest platform IF within [E] range.
    // Snaps the player onto the pad, forces riding state, and (for vertical
    // lifts) locks groundY() to the pad's live height so the smoothstep-eased
    // ascent carries the camera smoothly. Returns true if boarded, else false.
    function tryBoard(x, z) {
      var p = _scanBoardable(x, z);
      if (!p) return false;
      var br = p.padR * BOARD_R_MULT;
      if (_boardScan.d2 > br * br) return false;

      // Snap onto the pad centre so ride detection latches this frame + next.
      playerPos.x = p.curPos.x;
      playerPos.z = p.curPos.z;
      p.isRiding  = true;

      if (p.type === 'elev') {
        playerPos.y  = p.curPos.y;   // dock onto the pad; ascent carries from here
        _ridingElevY = p.curPos.y;
      }
      window._elevatorRiding = true;
      return true;
    }

    // nearestInfo(x, z) — { dist, label } for the nearest boardable platform,
    // or null if none is within [E] range. Reuses a scratch object (_info);
    // allocates nothing on the hot path (called every frame for the prompt).
    function nearestInfo(x, z) {
      var p = _scanBoardable(x, z);
      if (!p) return null;
      var br = p.padR * BOARD_R_MULT;
      if (_boardScan.d2 > br * br) return null;
      _info.dist  = Math.sqrt(_boardScan.d2);
      _info.label = p.rideLabel;
      return _info;
    }

    return {
      update:          update,
      platforms:       platforms,
      nearestPlatform: nearestPlatform,
      groundY:         groundY,
      isRiding:        isRiding,
      tryBoard:        tryBoard,
      nearestInfo:     nearestInfo,
    };
  };

})();
