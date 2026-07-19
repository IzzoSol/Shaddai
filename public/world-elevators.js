/* world-elevators.js — SHADDAI World elevator + transit platform network
 * NEXUS + TURTLE build — v1.0 (2026-07-02)
 *
 * API:
 *   window.buildWorldElevators({ THREE, scene, layout, playerPos, getGroundY })
 *     → { update(dt, t), platforms, nearestPlatform(x,z), groundY(), isRiding() }
 *
 * Systems (v3.0 redesign, 2026-07-04 — THE SKY NEXUS + temple island + skybridges):
 *   • THE SKY NEXUS (formerly "Sky Observatory") — one grand circular deck floating
 *     ABOVE every building. Solid walkable floor (deckList), glass parapet + rings
 *     + rail. Clean and UNCLUTTERED: the old central ORACLE observatory + QUILL
 *     library that sat on the deck have been REMOVED so the temple is the focus.
 *
 *   • SHADDAI TEMPLE ISLAND — the temple is now MASSIVE (scaled up) and sits OUT
 *     on its own floating island off the -Z side of the Nexus, reached by a
 *     well-lit, walkable GOLDEN SKYBRIDGE (neon rails + inlaid light seam). It no
 *     longer sits in the middle of the deck.
 *
 *   • TWO GRAND STATIONS + GRAND CENTRAL LIFTS — a prominent boarding hub on each
 *     side of the plaza; each lift rides ground → Nexus (opposite timing).
 *
 *   • PER-BUILDING SKY-LIFTS + TOP SKYBRIDGES — every agent building has its own
 *     ground ELEVATOR that lifts the player UP to a small landing at Nexus level,
 *     connected back to the Nexus by a well-lit neon walkable bridge (huge
 *     buildings like QUILL top straight onto the main deck). Agentic-city feel.
 *
 *   • (Legacy per-building VERTICAL ELEVATORS + HORIZONTAL TRANSIT PODS builders
 *     remain in-file for reuse but are NO LONGER placed.)
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
    var ELEV_PAUSE       = 1.6;   // dwell seconds at each end (was 2.6 — owner: elevators too slow)
    var ELEV_SPEED       = 17;    // units/s vertical (was 9 — owner: elevators too slow)
    var TRANSIT_HEIGHT   = 1.9;   // transit pod hover above ground
    var TRANSIT_SPEED    = 24;    // units/s horizontal (was 16)
    var TRANSIT_PAUSE    = 3.0;   // dwell at each terminus
    var ELEV_PAD_R       = 5.4;   // elevator pad ride-detection radius (forgiving; pad disc R≈4.0)
    var TRANSIT_PAD_R    = 6.8;   // transit pod ride-detection radius (forgiving; pad disc R≈5.4)
    var RIDE_Y_TOL       = 3.6;   // Y tolerance for step-on detection (forgiving vertical reach)
    var EXIT_R_MULT      = 1.35;  // hysteresis: once riding, stay on until this×radius — no edge fall-off
    var BOARD_R_MULT     = 1.5;   // [E]-key boarding: forgiving range = padR × this (wider than step-on)

    // ── ARRIVAL-DECK / CLEARANCE TUNING ──────────────────────────────────────
    var DECK_R           = 9.0;   // arrival-deck outer floor radius (visual footprint)
    var DECK_STAND_R     = 8.5;   // walkable radius on the deck (just inside the rail)
    var DECK_STAND_R2    = DECK_STAND_R * DECK_STAND_R;
    var DECK_STAND_TOL   = 4.5;   // player counts as "on deck" within this many Y of the deck surface
                                   // (widened 2.6→4.5, 2026-07-04: the grand lifts DWELL then descend, so a
                                   //  rider who steps off a beat late lands on a pad that has dropped a few
                                   //  units below PLAZA_Y — the old 2.6 tol then failed _checkDeck() and the
                                   //  player was teleported to terrain. 4.5 covers that late-step-off gap; the
                                   //  smootherstep ease is near-zero velocity at the top so real drops stay tiny.)
    var BLDG_CLEAR       = 22;    // min gap to keep pad/deck/pod clear of ANY building footprint
    var WORLD_HALF       = 380;   // world half-size — keep everything inside this bound

    // Collision half-widths per building (units from each building's center).
    // An elevator/deck/pod must sit OUTSIDE (half + BLDG_CLEAR + footprint) of every one.
    var BLDG_HALF = {
      SHADDAI: 76, NEXUS: 63, QUILL: 78, PIKADON: 65,
      TURTLE: 63, ZEROX: 65, ORACLE: 62, BAZAAR: 42,
    };
    function bldgHalf(code) {
      return (BLDG_HALF[code] != null) ? BLDG_HALF[code] : 60;
    }

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
      // SOLID disc slab (not a ring): a real walkable floor to stand on at the top.
      deckFloor:  new THREE.CylinderGeometry(9.0, 9.0, 0.5, 44, 1), // solid floor, axis=Y → horizontal disc
      deckRail:   new THREE.TorusGeometry(8.7, 0.14, 8, 44),        // outer safety rail
      deckRailIn: new THREE.TorusGeometry(4.7, 0.10, 8, 36),        // decorative inner ring
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

    // ── EASE CURVE ─────────────────────────────────────────────────────────
    // smootherstep (Ken Perlin's 6u⁵−15u⁴+10u³): ZERO velocity AND zero
    // acceleration at both endpoints — gentler than plain smoothstep, so the
    // lift eases off the ground and settles onto the deck with no abrupt
    // start/stop. Pure scalar math; no allocation. Shared by lifts + pods.
    function smoother(u) {
      return u * u * u * (u * (u * 6 - 15) + 10);
    }

    // ── FRAME-DELTA CLAMP (JANK FIX 2026-07-09) ──────────────────────────────
    // If a frame HITCHES (GC pause, tab refocus, heavy load), dt spikes and the
    // raw progress step (ELEV_SPEED*dt/span) balloons — the pad (and the carried
    // camera) then teleports a big chunk in a single frame = a visible SNAP. We
    // clamp the effective dt used for lift/pod motion so one bad frame can only
    // advance the ride by a small, smooth amount; the ride simply continues next
    // frame. Pure scalar; zero alloc. 1/24s ≈ the slowest we still treat as
    // "one smooth step" — anything longer is capped so it can't lurch.
    var MOVE_DT_CAP = 1 / 24;   // ≈0.0417s — max motion step per frame (anti-hitch)
    function moveDt(dt) {
      return (dt > MOVE_DT_CAP) ? MOVE_DT_CAP : dt;
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

    // ── PER-BUILDING SKY-SHAFT REGISTRY ───────────────────────────────────
    // Maps a building CODE ("ZEROX", "NEXUS", …) → its interior-only sky-lift.
    // These lifts are boarded ONLY from inside the building's 2nd level (via the
    // interiors hand-off forceBoardBuilding()); they are NOT walk-up boardable in
    // the plaza. Populated in the sectors.forEach() build loop below.
    var _buildingLifts = {};

    // ── ARRIVAL-DECK REGISTRY ─────────────────────────────────────────────
    // Each entry { x, z, y, r2 } is a solid elevated floor. When the player is
    // over one at (near) its height, they stand on it. Populated at build time.
    var deckList = [];

    // _checkDeck() — is the player currently standing on an arrival deck?
    // Writes the deck height into _deckHitY and returns true if so. ZERO alloc:
    // pre-owned scalars only; called from update() and groundY() each frame.
    var _deckHitY = null;
    function _checkDeck() {
      var px = playerPos.x, pz = playerPos.z, py = playerPos.y;
      for (var i = 0; i < deckList.length; i++) {
        var d  = deckList[i];
        var dx = px - d.x, dz = pz - d.z;
        if (dx * dx + dz * dz < d.r2 && Math.abs(py - d.y) < DECK_STAND_TOL) {
          _deckHitY = d.y;
          return true;
        }
      }
      _deckHitY = null;
      return false;
    }

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
    // NOTE (2026-07-05): the host page (SHADDAI-WORLD-3D.html) draws its OWN lift
    // prompt (_liftPrompt) — a single "▸ Press R to ride" / "RIDING" banner. This
    // internal _hud duplicated it and stacked a second box on screen, so it is now
    // suppressed (kept as a no-op to preserve the call sites / API shape).
    var _HUD_ENABLED = false;
    function _setHud(text) {
      if (!_HUD_ENABLED) return;
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

      // SOLID disc floor — a real, walkable surface. The lift pad docks flush at
      // the deck level so you step straight off the lift onto solid ground.
      // Cylinder axis is Y, so it is already a horizontal slab (no rotation).
      // Top surface sits at local y=0 (= deck level); slab hangs 0.5 below.
      var floor = new THREE.Mesh(GEO.deckFloor, MAT.padBody);
      floor.position.y = -0.25;
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
      // Find an open pad location that clears EVERY building footprint (temple,
      // all agent buildings, bazaar) by BLDG_CLEAR + the deck's radius. This puts
      // the shaft + pad + arrival deck out in the plaza, never inside a building.
      var safe  = findSafePad(wx, wz);
      var padX  = safe.x;
      var padZ  = safe.z;

      var gy    = (getGroundY(padX, padZ) || 0);
      var lowY  = gy + 0.08;
      var highY = gy + ELEV_HIGH;

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

      // Register the deck as a SOLID WALKABLE FLOOR: when the player is over this
      // footprint at (near) the deck's height, groundY() returns the deck height
      // so they stand on it instead of falling through to terrain.
      deckList.push({ x: padX, z: padZ, y: highY, r2: DECK_STAND_R2 });

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

      // Inset each end by that building's actual half-width + clearance so the
      // pod's travel corridor stays OUTSIDE both footprints (never clips a building).
      var dx  = bxW - axW, dz = bzW - azW;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx  = dx / len, nz = dz / len;
      var insA = bldgHalf(codeA) + BLDG_CLEAR + TRANSIT_PAD_R;
      var insB = bldgHalf(codeB) + BLDG_CLEAR + TRANSIT_PAD_R;
      // Guarantee a usable travel corridor: if the two insets would swallow the
      // spoke, scale them down proportionally to leave at least 20u of travel.
      if (insA + insB > len - 20) {
        var scale = (len - 20) / (insA + insB);
        insA *= scale;
        insB *= scale;
      }

      var startPos = new THREE.Vector3(axW + nx * insA, hY, azW + nz * insA);
      var endPos   = new THREE.Vector3(bxW - nx * insB, hY, bzW - nz * insB);
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

    // ── BUILDING FOOTPRINT TABLE ──────────────────────────────────────────
    // Every collidable building center + half-width. Used by findSafePad() so
    // elevators land in open plaza, never inside a building. Built once.
    var buildingList = [];
    buildingList.push({ x: 0, z: 0, half: bldgHalf('SHADDAI') }); // central temple
    sectors.forEach(function (s) {
      buildingList.push({ x: s.pos[0], z: s.pos[1], half: bldgHalf(s.code) });
    });
    if (bazaarLmk) {
      buildingList.push({ x: bazaarLmk.pos[0], z: bazaarLmk.pos[1], half: bldgHalf('BAZAAR') });
    }

    // clearsAll(x,z) — true if a pad/deck of radius DECK_R centered here keeps
    // BLDG_CLEAR of every building footprint AND stays inside the world bound.
    function clearsAll(x, z) {
      var edge = WORLD_HALF - DECK_R;
      if (x * x + z * z > edge * edge) return false;
      for (var i = 0; i < buildingList.length; i++) {
        var b = buildingList[i];
        var dx = x - b.x, dz = z - b.z;
        var need = b.half + BLDG_CLEAR + DECK_R;
        if (dx * dx + dz * dz < need * need) return false;
      }
      return true;
    }

    // findSafePad(bx,bz) — pick an open spot on the building's spoke that clears
    // every footprint. Prefers the plaza between the temple and the building
    // (inward), then a ring just outside the building (outward), widening the
    // angular sweep until a clear spot is found. Build-time only (allocs OK).
    function findSafePad(bx, bz) {
      var r0   = Math.sqrt(bx * bx + bz * bz);
      var ang0 = (r0 > 0.001) ? Math.atan2(bz, bx) : 0;
      var angOff = [0, 0.14, -0.14, 0.28, -0.28, 0.44, -0.44, 0.62, -0.62, 0.9, -0.9, 1.2, -1.2];
      var radii  = [];
      for (var r = 150; r >= 100; r -= 4) radii.push(r);                               // inward plaza
      for (var r2 = r0 + 96; r2 <= WORLD_HALF - DECK_R - 6; r2 += 8) radii.push(r2);    // outward ring
      for (var ri = 0; ri < radii.length; ri++) {
        for (var ai = 0; ai < angOff.length; ai++) {
          var a = ang0 + angOff[ai];
          var x = Math.cos(a) * radii[ri];
          var z = Math.sin(a) * radii[ri];
          if (clearsAll(x, z)) return { x: x, z: z };
        }
      }
      return { x: Math.cos(ang0) * 120, z: Math.sin(ang0) * 120 }; // safe-ish fallback
    }

    // ── REDESIGN (2026-07-04): ONE CENTRAL STATION → ONE GRAND OBSERVATORY ──
    // The scattered per-building lifts and the 7 horizontal transit pods have
    // been REMOVED from what gets built. The vertical system is now simple and
    // legible: you walk to the SINGLE Grand Station in the plaza and take ONE
    // lift up to the Sky Observatory that floats above the entire city.
    // (buildVerticalElevator() / buildTransitPod() remain defined above for
    //  reuse but are intentionally no longer invoked — nothing is placed here.)
    void roads; // roads network no longer spawns transit pods

    // ═══════════════════════════════════════════════════════════════════════
    // GRAND STATION  →  SKY OBSERVATORY   (the ONE grand top floor)
    // ─────────────────────────────────────────────────────────────────────────
    // The ONE-and-only vertical experience of the world:
    //   • GRAND STATION — a single prominent transit hub in the open plaza just
    //     outside the SHADDAI temple. A lit platform pad, a tall ring arch/gate
    //     and signage. THIS is where you board to go up. (Built below.)
    //   • SKY OBSERVATORY / AGENTS' SUMMIT — a huge circular deck floating high
    //     ABOVE the entire ring of buildings. The grand destination. Walkable
    //     (deckList). A clean sacred summit of temples + glowing roads (SHADDAI /
    //     ORACLE / QUILL). This is the ONLY elevated floor — no secondary lookouts.
    //   • GRAND CENTRAL LIFT — the single lift at the station that rides ALL the
    //     way from the ground up to the observatory. "RIDE TO THE SKY OBSERVATORY".
    // All static geometry is built ONCE here at construction time (allocs OK);
    // the per-frame update() hot path stays allocation-free.
    // ═══════════════════════════════════════════════════════════════════════
    var SKY_CY     = 0x27e0ff;   // SHADDAI cyan
    var SKY_GOLD   = 0xffcf4a;   // SHADDAI gold
    var SKY_DARK   = 0x0a1226;   // deep hull
    var SKY_VIOLET = 0x9a5cff;   // ORACLE / QUILL violet

    var PLAZA_Y          = 200;                       // observatory floor height (well above the tallest building)
    var PLAZA_FLOOR_R    = 150;                        // visual floor radius (spans above the whole building ring)
    var PLAZA_STAND_R    = 144;                        // walkable radius (just inside the rail)
    var PLAZA_STAND_R2   = PLAZA_STAND_R * PLAZA_STAND_R;

    // Dedicated build-time materials for the sky structures (created once).
    var _skyFloorMat = new THREE.MeshStandardMaterial({
      color: SKY_DARK, metalness: 0.72, roughness: 0.40,
      emissive: new THREE.Color(0x06131f), emissiveIntensity: 0.55,
    });
    var _skyGlowCy = new THREE.MeshBasicMaterial({
      color: new THREE.Color(SKY_CY), transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    var _skyGlowGold = new THREE.MeshBasicMaterial({
      color: new THREE.Color(SKY_GOLD), transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    var _skyBridgeMat = new THREE.MeshStandardMaterial({
      color: 0x0c1a2e, metalness: 0.70, roughness: 0.35,
      emissive: new THREE.Color(SKY_CY), emissiveIntensity: 0.35,
    });
    // Violet additive glow (ORACLE observatory + QUILL archives + purple roads).
    var _skyGlowViolet = new THREE.MeshBasicMaterial({
      color: new THREE.Color(SKY_VIOLET), transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    // Inlaid ROAD base materials — flush paved walkways (visual only, no collision).
    var _goldRoadMat = new THREE.MeshStandardMaterial({
      color: 0x2a2205, metalness: 0.82, roughness: 0.30,
      emissive: new THREE.Color(SKY_GOLD), emissiveIntensity: 0.50,
    });
    var _violetRoadMat = new THREE.MeshStandardMaterial({
      color: 0x160b2e, metalness: 0.80, roughness: 0.32,
      emissive: new THREE.Color(SKY_VIOLET), emissiveIntensity: 0.48,
    });
    var _oracleDomeMat = new THREE.MeshStandardMaterial({
      color: 0x141026, metalness: 0.78, roughness: 0.28,
      emissive: new THREE.Color(SKY_VIOLET), emissiveIntensity: 0.20,
    });
    var _screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a0820, metalness: 0.30, roughness: 0.12,
      emissive: new THREE.Color(SKY_VIOLET), emissiveIntensity: 0.55,
    });

    // ── buildRoad() — a flush, glowing inlaid walkway from (near) deck centre
    // outward along `ang`, spanning radius r0→r1. Static geometry, no collision;
    // sits flat on the deck floor (local y≈0). Reused for the gold + purple roads.
    function buildRoad(parent, ang, r0, r1, width, baseMat, glowMat) {
      var len  = r1 - r0;
      var midR = (r0 + r1) * 0.5;
      var cx   = Math.cos(ang) * midR, cz = Math.sin(ang) * midR;
      var road = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, width), baseMat);
      road.position.set(cx, 0.07, cz);
      road.rotation.y = -ang;
      parent.add(road);
      // Glowing inlaid centre seam.
      var seam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, width * 0.30), glowMat);
      seam.position.set(cx, 0.15, cz);
      seam.rotation.y = -ang;
      parent.add(seam);
      return road;
    }

    // ── makeSign() — a small illuminated marquee panel with readable text drawn
    // to a canvas texture (build-time only). Used for the ORACLE + QUILL signs.
    function makeSign(text, w, h, colorHex) {
      var cvs = document.createElement('canvas');
      cvs.width = 512; cvs.height = 128;
      var ctx = cvs.getContext('2d');
      var hex = '#' + ('000000' + (colorHex >>> 0).toString(16)).slice(-6);
      ctx.fillStyle = 'rgba(6,9,24,0.94)';
      ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = hex; ctx.lineWidth = 6; ctx.strokeRect(5, 5, 502, 118);
      ctx.fillStyle = hex;
      ctx.font = 'bold 40px Orbitron, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 66);
      var tex = new THREE.CanvasTexture(cvs);
      var mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    }

    // ── buildCustomLift(cfg) — a vertical lift with an arbitrary lowY/highY.
    // Same platform shape/fields as buildVerticalElevator() so update() and the
    // API treat it identically. Optionally `locked` (parked + un-boardable).
    function buildCustomLift(cfg) {
      var padX = cfg.padX, padZ = cfg.padZ;
      var gy   = cfg.baseY;
      // MULTI-STOP support: cfg.stops = ascending [y0, y1, y2 …] floors the lift
      // visits in sequence (dwelling at each). lowY/highY derive from the extremes
      // so the shared platform fields + ride-detection stay identical to a 2-point lift.
      var stops = (cfg.stops && cfg.stops.length >= 2) ? cfg.stops.slice() : null;
      var lowY  = stops ? stops[0]            : cfg.lowY;
      var highY = stops ? stops[stops.length - 1] : cfg.highY;
      // Visible rail-column height can be capped (cfg.colHeight) so a tall multi-stop
      // shaft doesn't spear the whole building — the pad rides on beyond the columns
      // as a glowing disc. Defaults to spanning the full run.
      var colHeight = (cfg.colHeight != null) ? cfg.colHeight : ((highY - gy) + 2.2);

      var columnData = [];
      for (var i = 0; i < 3; i++) {
        var ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
        var cx  = padX + Math.cos(ang) * 3.6;
        var cz  = padZ + Math.sin(ang) * 3.6;
        columnData.push(_makeRailColumn(cx, cz, gy, colHeight, cfg.colorHex));
      }

      var padObj  = _makePad('elev', cfg.colorHex, padX, lowY, padZ);

      // ── PHASE / TIMING START STATE ──────────────────────────────────────
      // Optional cfg.startYNorm / cfg.startDir / cfg.startPause let two lifts
      // run on OPPOSITE timing (one at the top while the other is at the
      // bottom). The initial pad Y is derived from the eased start-norm so the
      // pad spawns at its true phase position (no first-frame jump).
      var startYNorm = (cfg.startYNorm != null) ? cfg.startYNorm : 0;
      var startDir   = (cfg.startDir   != null) ? cfg.startDir   : 1;
      var eY0        = smoother(startYNorm);
      // Multi-stop lifts always spawn docked at the lowest floor (stop 0).
      var startY     = stops ? stops[0] : (lowY + (highY - lowY) * eY0);

      var curPos  = new THREE.Vector3(padX, startY, padZ);
      var prevPos = new THREE.Vector3(padX, startY, padZ);
      var pR      = ELEV_PAD_R;

      var p = {
        type:      'elev',
        code:      cfg.code,
        colorHex:  cfg.colorHex,
        group:     padObj.group,
        rim:       padObj.rim,
        halo:      padObj.halo,
        columns:   columnData,
        curPos:    curPos,
        prevPos:   prevPos,
        lowY:      lowY,
        highY:     highY,
        yNorm:     startYNorm,
        dir:       startDir,
        // ── MULTI-STOP fields (null for a plain 2-point lift) ──────────────
        stops:     stops,     // ascending floor Ys, e.g. [ground, interior, observatory]
        curStop:   0,         // index of the floor currently rested at / departing from
        segNorm:   0,         // 0..1 progress within the active stop→stop segment
        stopPause: (cfg.stopPause != null) ? cfg.stopPause : ELEV_PAUSE, // dwell at each floor
        // Locked lift stays parked at lowY forever (huge dwell never elapses).
        pauseT:    cfg.locked ? 1e9 : ((cfg.startPause != null) ? cfg.startPause : ELEV_PAUSE),
        isRiding:  false,
        locked:    !!cfg.locked,
        // interiorOnly: this lift is a building's private sky-shaft — it only
        // carries a rider after the interior 2nd-level hand-off ARMS it (armed=true).
        // It never latches by walking over it in the plaza and shows no plaza prompt.
        interiorOnly: !!cfg.interiorOnly,
        armed:     false,
        label:     cfg.label,
        destLabel: cfg.destLabel,
        rideLabel: cfg.rideLabel,
        lockLabel: cfg.lockLabel || null,
        px:        padX,
        pz:        padZ,
        padR:      pR,
        padR2:     pR * pR,
        padR2Exit: (pR * EXIT_R_MULT) * (pR * EXIT_R_MULT),
      };
      platforms.push(p);
      return p;
    }

    // ── BUILD THE AGENTS' SUMMIT / SKY OBSERVATORY (static geometry, once) ──
    // A grand circular deck floating above the whole city: solid walkable floor,
    // concentric light rings, a tall glass parapet + rail. A clean, sacred summit
    // hosting the SHADDAI temple, the ORACLE observatory and the QUILL archives —
    // connected by glowing inlaid roads. No party furniture. Marquee destination.
    var _plaza = new THREE.Group();

    // Solid walkable floor disc (Cylinder axis=Y → horizontal slab). Top at y=0.
    var _pFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(PLAZA_FLOOR_R, PLAZA_FLOOR_R, 0.6, 72, 1),
      _skyFloorMat
    );
    _pFloor.position.y = -0.3;
    _plaza.add(_pFloor);

    // Glowing concentric floor rings — the "party" light pattern.
    var _plazaRingR = [38, 70, 102, 130];
    for (var pr = 0; pr < _plazaRingR.length; pr++) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(_plazaRingR[pr], 0.30, 6, 96),
        (pr % 2 === 0) ? _skyGlowCy : _skyGlowGold
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.10;
      _plaza.add(ring);
    }

    // Perimeter safety rail.
    var _pRail = new THREE.Mesh(
      new THREE.TorusGeometry(PLAZA_FLOOR_R - 2, 0.40, 8, 120),
      rimMat(SKY_CY)
    );
    _pRail.rotation.x = Math.PI / 2;
    _pRail.position.y = 1.6;
    _plaza.add(_pRail);

    // Panoramic GLASS parapet — an open cylinder wall of tinted glass so the
    // observatory reads as a glassed-in overlook floating above everything.
    var _glassMat = new THREE.MeshStandardMaterial({
      color: 0x0e2740, metalness: 0.20, roughness: 0.06,
      emissive: new THREE.Color(SKY_CY), emissiveIntensity: 0.18,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    });
    var _glass = new THREE.Mesh(
      new THREE.CylinderGeometry(PLAZA_FLOOR_R - 1.4, PLAZA_FLOOR_R - 1.4, 3.2, 96, 1, true),
      _glassMat
    );
    _glass.position.y = 1.6;
    _plaza.add(_glass);

    // (REMOVED 2026-07-04) The "party/bazaar" décor — perimeter LANTERN pillars,
    // scattered SEATING clusters, and the central HOLO-FOUNTAIN beacon — has been
    // stripped out. The deck is now a clean, sacred AGENTS' SUMMIT: the temples
    // and their glowing roads carry the space, not market/party furniture.

    // ── (RETIRED 2026-07-05) PER-BUILDING GROUND SKY-LIFTS ─────────────────
    // This loop used to build a SECOND elevator per building — a ground SKY-LIFT
    // out beside the building that rode straight to the Sky Nexus, plus its own
    // Nexus landing + bridge + ground station. That made TWO lifts per building
    // (this one + the lounge lift). Per the owner's single-shaft flow, the two are
    // now UNIFIED into ONE multi-stop lift (lounge → interior → observatory), built
    // in the PILLAR-PAVILION loop below — which now also builds each building's
    // Sky-Nexus landing + bridge (at the lounge-lift XZ, so its top stop lands on
    // solid floor). Nothing is placed here anymore. `_buildLoungeObsLanding()` and
    // the unified lift replace everything this block used to do.

    // helper — a building's Sky-Nexus arrival landing + a walkable neon bridge back
    // to the main deck, both parented to _plaza (local XZ == world XZ; local y 0 ==
    // world PLAZA_Y). Registers walkable deckList patches at y=PLAZA_Y so the rider
    // steps off the unified lift's TOP stop onto solid floor and walks in to the Nexus.
    var OBS_LAND_R = 14;                       // per-building observatory landing radius
    function _buildLoungeObsLanding(lx, lz, col) {
      var az   = Math.atan2(lz, lx);           // azimuth of this building's shaft
      var cA   = Math.cos(az), sA = Math.sin(az);
      var outR = Math.hypot(lx, lz);           // landing sits directly above the lounge lift
      var inR  = PLAZA_STAND_R - 6;            // bridge meets the main deck just inside its rail
      // LANDING DISC (solid, walkable) floating above the building at Nexus height.
      var _land = new THREE.Mesh(
        new THREE.CylinderGeometry(OBS_LAND_R, OBS_LAND_R + 2, 1.0, 40, 1), _skyFloorMat);
      _land.position.set(lx, -0.5, lz); _plaza.add(_land);
      var _lRim = new THREE.Mesh(new THREE.TorusGeometry(OBS_LAND_R, 0.34, 8, 56), rimMat(col));
      _lRim.rotation.x = Math.PI / 2; _lRim.position.set(lx, 0.4, lz); _plaza.add(_lRim);
      var _lArch = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.3, 8, 40), rimMat(col));
      _lArch.position.set(lx, 5.4, lz); _lArch.rotation.y = -az; _plaza.add(_lArch);
      deckList.push({ x: lx, z: lz, y: PLAZA_Y, r2: (OBS_LAND_R - 1) * (OBS_LAND_R - 1) });
      // WELL-LIT WALKABLE BRIDGE from the main deck edge out to this landing.
      var brOut = outR - (OBS_LAND_R - 5);
      var midR  = (inR + brOut) * 0.5;
      var len   = Math.max(6, brOut - inR);
      var floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 7.0), _skyFloorMat);
      floor.position.set(cA * midR, -0.35, sA * midR); floor.rotation.y = -az; _plaza.add(floor);
      var seam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 2.0), haloMat(col));
      seam.position.set(cA * midR, 0.1, sA * midR); seam.rotation.y = -az; _plaza.add(seam);
      for (var rr = 0; rr < 2; rr++) {
        var off  = (rr === 0 ? -1 : 1) * 3.2;
        var rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.3), rimMat(col));
        rail.position.set(cA * midR - sA * off, 0.6, sA * midR + cA * off);
        rail.rotation.y = -az; _plaza.add(rail);
      }
      var steps = Math.max(2, Math.round(len / 10));
      for (var st = 0; st <= steps; st++) {
        var rAt = inR + (len * st / steps);
        deckList.push({ x: cA * rAt, z: sA * rAt, y: PLAZA_Y, r2: 4.0 * 4.0 });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PILLAR-PAVILION LOUNGE LIFTS (2026-07-05) — ONE clean lift per building.
    // Each agent building now stands lifted on huge pillars (world-buildings.js
    // AGENT_LIFT=46) with an open walk-through lounge under it at ground level.
    // This lift stands to the SIDE inside that lounge (never in the doorway axis)
    // and rides the player straight UP from the lounge onto the building's elevated
    // floor — a walkable deck spanning the footprint — landing them at the entrance.
    // Separate from the SKY-LIFTS above (those go all the way to the Sky Nexus).
    // Interiors (tool/game rooms on the elevated floor) are a later pass.
    // ═══════════════════════════════════════════════════════════════════════
    var BUILD_LIFT = 46;                                  // MUST match world-buildings.js AGENT_LIFT
    var LOUNGE_FP  = { NEXUS: 140, QUILL: 258, PIKADON: 145, TURTLE: 140, ZEROX: 145, ORACLE: 138 };
    sectors.forEach(function (s) {
      var code = String(s.code).toUpperCase();
      if (code === 'SHADDAI') return;                     // sky temple — no ground building
      var bx = s.pos[0], bz = s.pos[1];
      var fp = LOUNGE_FP[code] || 140;
      var col = (s.color != null) ? s.color : SKY_CY;
      // Direction toward world-centre (the entrance faces this) + its tangent (the side).
      var toC = Math.atan2(-bz, -bx);
      var tx  = -Math.sin(toC), tz = Math.cos(toC);       // unit tangent
      // Pad offset to ONE SIDE inside the lounge, pushed further out (0.28→0.38 fp,
      // min 34u) so the lift NEVER sits on the agent's talk spot. The agent stands
      // at the building centre (world-dialogue TALK_RADIUS=14u); this keeps the lift
      // pad + its [R]-to-ride zone well clear of that talk zone (no prompt collision).
      var SIDE = Math.max(34, fp * 0.38);
      var lx  = bx + tx * SIDE;
      var lz  = bz + tz * SIDE;
      var gY  = (getGroundY(lx, lz) || 0);
      var interiorY = gY + BUILD_LIFT;                     // elevated building floor level (stop 2)
      var obsY      = PLAZA_Y;                             // Sky Nexus / observatory level (stop 3)

      // STOP-2 landing: the whole elevated footprint is a SOLID walkable floor (the
      // building's upper deck) so a rider steps off the lift onto real ground there.
      // Upper-floor deck: radius = full building footprint (fp) so the player can walk
      // anywhere on the elevated level without falling through near the walls.
      // Old value fp*0.42 was too small — players at the wall face (~fp*0.46) or near
      // corners (~fp*0.65) exited the zone and dropped to terrain. fp*1.0 covers every
      // building shape (circle r≤88, box corners ≤fp*0.65).
      deckList.push({ x: bx, z: bz, y: interiorY, r2: fp * fp });
      // STOP-3 landing + bridge: a walkable disc floating above the building at Nexus
      // height, joined to the main deck by a neon bridge (so the top stop lands solid).
      _buildLoungeObsLanding(lx, lz, col);

      // ── THE ONE UNIFIED LIFT — three stops on ONE shaft ──────────────────
      //   stop 0  ground / lounge      (board here, talk to the agents)
      //   stop 1  building interior    (elevated floor deck — step off to explore)
      //   stop 2  observatory / Nexus  (continue up the SAME lift to the Sky Nexus)
      // It dwells at every floor, so you ride lounge→interior, step off, then re-board
      // to continue interior→observatory. Rail columns are capped near the interior
      // level (colHeight) so the shaft doesn't spear the building; the pad rides on up
      // to the observatory as a glowing disc. Registered as the building's lift so the
      // interiors hand-off (forceBoardBuilding) drives this same shaft.
      var _ul = buildCustomLift({
        code:      code + '-LIFT',
        padX:      lx, padZ: lz, baseY: gY,
        stops:     [gY + 0.08, interiorY, obsY],
        stopPause: 3.6,                                    // generous dwell → easy step-off at each floor
        colHeight: BUILD_LIFT + 8,                         // visible shaft ≈ lounge→interior only
        colorHex:  col,
        label:     code + ' LIFT',
        destLabel: code + ' — INTERIOR / OBSERVATORY',
        rideLabel: 'RIDE UP INTO ' + code,
        locked:    false, interiorOnly: false,
      });
      _buildingLifts[code] = _ul;

      // Small visible landing rims (interior + ground) + a ground beacon so the shaft
      // reads as a real, premium lift within the lounge.
      try {
        var _lrim = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.22, 8, 48), rimMat(col));
        _lrim.rotation.x = Math.PI / 2; _lrim.position.set(lx, interiorY + 0.2, lz); scene.add(_lrim);
        var _grim = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.24, 8, 56), rimMat(col));
        _grim.rotation.x = Math.PI / 2; _grim.position.set(lx, gY + 0.2, lz); scene.add(_grim);
        var _lbea = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), capOrbMat(col));
        _lbea.position.set(lx, gY + 3.0, lz); scene.add(_lbea);
      } catch (_e) { /* decor is optional — never block world load */ }
    });

    _plaza.position.set(0, PLAZA_Y, 0);
    scene.add(_plaza);

    // Register the Nexus deck as a big SOLID WALKABLE FLOOR (deckList).
    deckList.push({ x: 0, z: 0, y: PLAZA_Y, r2: PLAZA_STAND_R2 });

    // ── TWO GRAND STATIONS — one on each side, so a lift is almost always
    // near the ground to board (they run on OPPOSITE timing). Each is a
    // prominent transit hub in the open plaza, clear of the temple and every
    // building. Radius ≤130 sits INSIDE the deck-edge skybridges (BR_IN≈138)
    // and well inside the walkable deck (144), so each lift tops out cleanly ON
    // the deck floor — not under/inside a skybridge, landing or temple bridge.
    //
    // CLIP FIX (2026-07-04): the agent buildings sit on a hexagon every 60°, and
    // each has a per-building SKY-LIFT + LANDING + SKYBRIDGE radiating along its
    // own heading (ORACLE=+X/0°, ZEROX=−X/180°, QUILL=60°, NEXUS=120°, TURTLE=
    // −60°, PIKADON=−120°); the SHADDAI temple bridge runs out along −Z (−90°).
    // Boarding the grand lifts on 0°/180° (the old spots) put their shafts right
    // on top of the ORACLE/ZEROX skylifts and under those skybridges. We now
    // reject any candidate whose heading falls inside a guard band around ANY of
    // those radial corridors, so the grand shafts sit in the OPEN gaps between
    // buildings and never pass through a structure on the way up.
    var _corridorAng = [-Math.PI / 2];          // −Z golden temple bridge
    for (var _si = 0; _si < sectors.length; _si++) {
      var _sp = sectors[_si].pos;
      if (_sp[0] === 0 && _sp[1] === 0) continue; // skip the central Source
      _corridorAng.push(Math.atan2(_sp[1], _sp[0]));
    }
    var _CORRIDOR_GUARD = 0.32;                  // ~18° clearance from every corridor
    function _angDiff(a, b) {
      var d = Math.abs(a - b) % (Math.PI * 2);
      return d > Math.PI ? (Math.PI * 2 - d) : d;
    }
    function _clearsCorridors(a) {
      for (var ci = 0; ci < _corridorAng.length; ci++) {
        if (_angDiff(a, _corridorAng[ci]) < _CORRIDOR_GUARD) return false;
      }
      return true;
    }
    // pickStationSpot(preferAng) sweeps outward around a preferred heading for a
    // spot whose whole shaft clears every building footprint AND every deck
    // corridor. preferAng should already be aimed at an open gap (e.g. 30°).
    function pickStationSpot(preferAng) {
      // Angular offsets fanned symmetrically out from the preferred heading so
      // the chosen spot stays as close as possible to the requested side.
      var offs = [0, 0.16, -0.16, 0.32, -0.32, 0.48, -0.48, 0.64, -0.64,
                  0.82, -0.82, 1.02, -1.02, 1.25, -1.25];
      for (var radius = 108; radius <= 130; radius += 4) {
        for (var oi = 0; oi < offs.length; oi++) {
          var a = preferAng + offs[oi];
          if (!_clearsCorridors(a)) continue;
          var x = Math.cos(a) * radius, z = Math.sin(a) * radius;
          if (clearsAll(x, z)) return { x: x, z: z };
        }
      }
      return { x: Math.cos(preferAng) * 120, z: Math.sin(preferAng) * 120 };
    }

    // ── STATION STRUCTURE BUILDER (static geometry, built once per station) ─
    // A lit platform pad + a tall ring gate/arch + illuminated signage so the
    // hub reads unmistakably as "board here to ascend". Reused for both sides.
    function buildStation(spotX, spotZ, baseY) {
      var _station = new THREE.Group();

      // Raised, lit boarding pad the lift docks into at ground level.
      var _stPad = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 12, 0.7, 48, 1),
        _skyFloorMat
      );
      _stPad.position.y = 0.35;
      _station.add(_stPad);

      // Glowing pad rim + inner ring — the landing lights.
      var _stRim = new THREE.Mesh(new THREE.TorusGeometry(11.2, 0.22, 8, 72), rimMat(SKY_CY));
      _stRim.rotation.x = Math.PI / 2; _stRim.position.y = 0.74;
      _station.add(_stRim);
      var _stRimIn = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.14, 6, 56), _skyGlowGold);
      _stRimIn.rotation.x = Math.PI / 2; _stRimIn.position.y = 0.76;
      _station.add(_stRimIn);

      // Tall RING ARCH straddling the pad — the iconic gateway of the station.
      var _arch = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.5, 10, 80), rimMat(SKY_CY));
      _arch.position.y = 9.6;          // stands vertically as a portal ring
      _station.add(_arch);
      var _archGlow = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.9, 6, 80), _skyGlowCy);
      _archGlow.position.y = 9.6;
      _station.add(_archGlow);

      // Two support pylons for the arch, flanking the pad.
      var _pylonGeo = new THREE.CylinderGeometry(0.55, 0.75, 10.0, 10, 1);
      for (var sp = 0; sp < 2; sp++) {
        var pylon = new THREE.Mesh(_pylonGeo, MAT.column);
        pylon.position.set((sp === 0 ? -9.4 : 9.4), 5.0, 0);
        _station.add(pylon);
      }

      // SIGNAGE — a glowing marquee bar above the arch that announces the station.
      var _signBar = new THREE.Mesh(new THREE.BoxGeometry(15, 2.1, 0.5), _skyBridgeMat);
      _signBar.position.set(0, 15.4, 0);
      _station.add(_signBar);
      var _signGlow = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.18, 0.6), _skyGlowCy);
      _signGlow.position.set(0, 14.2, 0);
      _station.add(_signGlow);
      // Beacon orb crowning the station so it's visible from across the world.
      var _stBeacon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), capOrbMat(SKY_CY));
      _stBeacon.position.set(0, 17.4, 0);
      _station.add(_stBeacon);

      // Orient the arch so its ring plane faces the world center (nice entry read),
      // then plant the whole station at the boarding spot.
      _station.rotation.y = Math.atan2(spotZ, spotX);
      _station.position.set(spotX, baseY, spotZ);
      scene.add(_station);
      return _station;
    }

    // Side A aimed at the OPEN 30° gap (between ORACLE at 0° and QUILL at 60°);
    // side B on the OPPOSITE heading (angA + π ≈ 210°, the gap between ZEROX at
    // 180° and PIKADON at −120°). Both gaps are clear of every agent skybridge
    // AND the −Z temple bridge, so neither grand shaft clips a structure.
    var _glSpotA  = pickStationSpot(Math.PI / 6);
    var _angA     = Math.atan2(_glSpotA.z, _glSpotA.x);
    var _glSpotB  = pickStationSpot(_angA + Math.PI);
    var _glBaseYA = (getGroundY(_glSpotA.x, _glSpotA.z) || 0);
    var _glBaseYB = (getGroundY(_glSpotB.x, _glSpotB.z) || 0);

    buildStation(_glSpotA.x, _glSpotA.z, _glBaseYA);
    buildStation(_glSpotB.x, _glSpotB.z, _glBaseYB);

    // ── TWO GRAND CENTRAL LIFTS — both ride ground → observatory deck, run on
    // OPPOSITE timing so one is at/near the ground whenever the other is up top.
    //   • Lift A starts at the BOTTOM  (yNorm 0, dir +1) — begins by rising.
    //   • Lift B starts at the TOP     (yNorm 1, dir -1) — begins by descending.
    // Identical dwell + smoothstep on both keeps them ~180° out of phase for the
    // whole cycle, so the ride to the top is faster (grab whichever is low).
    buildCustomLift({
      code:      'GRAND-A',
      padX:      _glSpotA.x,
      padZ:      _glSpotA.z,
      baseY:     _glBaseYA,
      lowY:      _glBaseYA + 0.08,
      highY:     PLAZA_Y,               // rides ALL the way up to the observatory
      colorHex:  SKY_CY,
      label:     'GRAND CENTRAL LIFT',
      destLabel: 'THE SKY NEXUS',
      rideLabel: 'RIDE TO THE SKY NEXUS',
      locked:    false,
      startYNorm: 0, startDir: 1,       // starts docked at the ground
    });
    buildCustomLift({
      code:      'GRAND-B',
      padX:      _glSpotB.x,
      padZ:      _glSpotB.z,
      baseY:     _glBaseYB,
      lowY:      _glBaseYB + 0.08,
      highY:     PLAZA_Y,               // rides ALL the way up to the observatory
      colorHex:  SKY_CY,
      label:     'GRAND CENTRAL LIFT',
      destLabel: 'THE SKY NEXUS',
      rideLabel: 'RIDE TO THE SKY NEXUS',
      locked:    false,
      startYNorm: 1, startDir: -1,      // starts at the top, opposite phase
    });

    // ═══════════════════════════════════════════════════════════════════════
    // (a) STEP-OFF FIX  +  (b) GLASS SKY-BRIDGES  +  (c) GLASS CHUTE
    //     (2026-07-04, TURTLE build — beautiful + walkable)
    // ─────────────────────────────────────────────────────────────────────────
    // (a) STEP-OFF FIX — the two grand lifts board at radius ~108–130 and top out
    //     at y=PLAZA_Y, then DWELL and immediately descend. A rider who steps off a
    //     beat late did so onto a pad already a few units below PLAZA_Y; the old
    //     DECK_STAND_TOL (2.6) then failed _checkDeck() → teleport to terrain. FIX:
    //     (1) DECK_STAND_TOL widened to 4.5 above, and (2) a solid, generously-sized
    //     LANDING patch registered in deckList at each grand-lift top XZ (y=PLAZA_Y)
    //     that OVERLAPS the r=144 main deck, so the pad→deck-centre transition zone
    //     is walkable in EVERY direction. A glass landing disc makes it read as real.
    // (b) GLASS SKY-BRIDGES — lit translucent glass walkways from each grand landing
    //     inward to the deck's sacred centre hub (where the golden temple bridge
    //     continues out to the SHADDAI temple) — glowing balustrades, floor light
    //     seam, walk-through neon ring arches and lantern point-lights.
    // (c) GLASS CHUTE — a tall luminous glass column of light at the deck centre:
    //     translucent tube, internal glowing core, stacked cyan/gold light rings, a
    //     glowing plinth + crowning beacon and a static internal point-light.
    // All static geometry + lights built ONCE here (build-time alloc OK); nothing
    // below is touched per frame → update()'s hot path stays allocation-free.
    // ═══════════════════════════════════════════════════════════════════════
    var GL_LANDING_R = 20;   // walkable landing radius around each grand-lift top pad
    // Register walkable LANDING patches (they overlap the r=144 main deck so the
    // whole transition zone is continuous — the player can never step into a gap).
    deckList.push({ x: _glSpotA.x, z: _glSpotA.z, y: PLAZA_Y, r2: GL_LANDING_R * GL_LANDING_R });
    deckList.push({ x: _glSpotB.x, z: _glSpotB.z, y: PLAZA_Y, r2: GL_LANDING_R * GL_LANDING_R });

    // ── Glass materials (built once) ─────────────────────────────────────────
    var _glassDeckMat = new THREE.MeshStandardMaterial({
      color: 0x0c2436, metalness: 0.30, roughness: 0.05,
      emissive: new THREE.Color(SKY_CY), emissiveIntensity: 0.16,
      transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false,
    });
    var _glassChuteMat = new THREE.MeshStandardMaterial({
      color: 0x123049, metalness: 0.20, roughness: 0.04,
      emissive: new THREE.Color(SKY_CY), emissiveIntensity: 0.30,
      transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false,
    });
    var _chuteCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(SKY_CY), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // ── buildGlassLanding — a translucent glass disc + glowing rings at a grand
    // lift top, so the (already walkable) landing reads as a designed glass deck.
    function buildGlassLanding(cx, cz, colorHex) {
      var disc = new THREE.Mesh(
        new THREE.CylinderGeometry(GL_LANDING_R, GL_LANDING_R, 0.3, 48, 1), _glassDeckMat);
      disc.position.set(cx, -0.05, cz); disc.renderOrder = 1;
      _plaza.add(disc);
      var lrim = new THREE.Mesh(new THREE.TorusGeometry(GL_LANDING_R - 0.5, 0.30, 8, 72), rimMat(colorHex));
      lrim.rotation.x = Math.PI / 2; lrim.position.set(cx, 0.4, cz);
      _plaza.add(lrim);
      var lring = new THREE.Mesh(new THREE.TorusGeometry(GL_LANDING_R * 0.55, 0.18, 6, 56), haloMat(colorHex));
      lring.rotation.x = Math.PI / 2; lring.position.set(cx, 0.2, cz);
      _plaza.add(lring);
    }

    // ── buildGlassBridge — a lit translucent glass walkway from (fx,fz)→(tx,tz)
    // at deck level (local y≈0). Flat glass floor (reliably walkable) + glowing
    // neon balustrades, a floor light seam, evenly spaced walk-through glowing
    // ring arches and lantern point-lights. Parented to _plaza (local XZ == world
    // XZ). Spans lie within the r=144 main deck, which is already walkable, so no
    // extra deckList entries are needed. Built once.
    function buildGlassBridge(fx, fz, tx, tz, colorHex, width) {
      var dx = tx - fx, dz = tz - fz;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var ang = Math.atan2(dz, dx);
      var mx = (fx + tx) * 0.5, mz = (fz + tz) * 0.5;
      var w  = width || 9;
      var perpX = -Math.sin(ang), perpZ = Math.cos(ang);

      // Translucent glass floor slab.
      var floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.24, w), _glassDeckMat);
      floor.position.set(mx, 0.12, mz); floor.rotation.y = -ang; floor.renderOrder = 2;
      _plaza.add(floor);
      // Glowing centre light seam.
      var seam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.10, w * 0.22), haloMat(colorHex));
      seam.position.set(mx, 0.26, mz); seam.rotation.y = -ang;
      _plaza.add(seam);
      // Neon balustrades (glowing rail + low glass panel) on both sides.
      for (var s = 0; s < 2; s++) {
        var o = (s === 0 ? -1 : 1) * (w / 2);
        var rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.28, 0.28), rimMat(colorHex));
        rail.position.set(mx + perpX * o, 1.15, mz + perpZ * o); rail.rotation.y = -ang;
        _plaza.add(rail);
        var panel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.10), _glassDeckMat);
        panel.position.set(mx + perpX * o, 0.55, mz + perpZ * o); panel.rotation.y = -ang;
        panel.renderOrder = 2;
        _plaza.add(panel);
      }
      // Walk-through glowing ring arches + lantern point-lights at intervals.
      var rings = Math.max(2, Math.round(len / 16));
      for (var ri = 1; ri < rings; ri++) {
        var f  = ri / rings;
        var px = fx + dx * f, pz = fz + dz * f;
        var R  = w * 0.72;
        var arch = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 8, 28), rimMat(colorHex));
        arch.rotation.y = -ang + Math.PI / 2;      // ring you walk through, spanning the walkway
        arch.position.set(px, R * 0.92, pz);
        _plaza.add(arch);
        var archGlow = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 28), haloMat(colorHex));
        archGlow.rotation.y = -ang + Math.PI / 2;
        archGlow.position.set(px, R * 0.92, pz);
        _plaza.add(archGlow);
        if (ri % 2 === 1) {
          var lp = new THREE.PointLight(colorHex, 0.5, 44, 2);
          lp.position.set(px, 4.5, pz);
          _plaza.add(lp);
        }
      }
    }

    // ── bridgeLandingToHub — route a glass bridge from a grand landing radially
    // inward to the deck's central hub ring (meets the glass-chute plinth).
    // ALIGN FIX (2026-07-09): the old hubR=34 left the bridge hanging ~24u short of
    // the CHUTE_R+4≈10.5 plinth — the two glass spans pointed at the chute but never
    // touched it (a floater). Bring the inner end flush to the plinth so each bridge
    // visibly lands on the central chute base.
    function bridgeLandingToHub(sx, sz, colorHex) {
      var ang    = Math.atan2(sz, sx);
      var hubR   = 10;                                   // = CHUTE_R(6.5)+3.5 → meet the chute plinth edge (no gap)
      var startR = Math.max(hubR + 8, Math.hypot(sx, sz) - (GL_LANDING_R - 3));
      buildGlassBridge(Math.cos(ang) * startR, Math.sin(ang) * startR,
                       Math.cos(ang) * hubR,   Math.sin(ang) * hubR, colorHex, 9);
    }

    // Build the two glass landings + their inward glass bridges (cyan A, gold B).
    buildGlassLanding(_glSpotA.x, _glSpotA.z, SKY_CY);
    buildGlassLanding(_glSpotB.x, _glSpotB.z, SKY_GOLD);
    bridgeLandingToHub(_glSpotA.x, _glSpotA.z, SKY_CY);
    bridgeLandingToHub(_glSpotB.x, _glSpotB.z, SKY_GOLD);

    // ── (c) GLASS CHUTE — luminous glass column of light at the deck centre ──
    var CHUTE_R = 6.5, CHUTE_H = 64;
    var _chute  = new THREE.Group();
    // Outer translucent glass tube.
    var _chuteGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(CHUTE_R, CHUTE_R, CHUTE_H, 40, 1, true), _glassChuteMat);
    _chuteGlass.position.y = CHUTE_H / 2; _chuteGlass.renderOrder = 2;
    _chute.add(_chuteGlass);
    // Inner glowing core of light.
    var _chuteCore = new THREE.Mesh(
      new THREE.CylinderGeometry(CHUTE_R * 0.42, CHUTE_R * 0.42, CHUTE_H * 0.98, 20, 1), _chuteCoreMat);
    _chuteCore.position.y = CHUTE_H / 2;
    _chute.add(_chuteCore);
    // Stacked internal light rings (alternating cyan/gold) climbing the column.
    var _chuteRingN = 10;
    for (var cr = 0; cr < _chuteRingN; cr++) {
      var cry = (cr + 0.5) * (CHUTE_H / _chuteRingN);
      var chuteRing = new THREE.Mesh(
        new THREE.TorusGeometry(CHUTE_R * 0.92, 0.12, 6, 40),
        (cr % 2 === 0) ? rimMat(SKY_CY) : rimMat(SKY_GOLD));
      chuteRing.rotation.x = Math.PI / 2; chuteRing.position.y = cry;
      _chute.add(chuteRing);
    }
    // Glowing plinth + base rim.
    var _chutePlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(CHUTE_R + 3, CHUTE_R + 4, 1.0, 40, 1), _skyFloorMat);
    _chutePlinth.position.y = 0.5; _chute.add(_chutePlinth);
    var _chuteBaseRim = new THREE.Mesh(new THREE.TorusGeometry(CHUTE_R + 3, 0.4, 8, 64), rimMat(SKY_CY));
    _chuteBaseRim.rotation.x = Math.PI / 2; _chuteBaseRim.position.y = 1.05; _chute.add(_chuteBaseRim);
    // Crowning beacon orb.
    var _chuteCap = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), capOrbMat(SKY_CY));
    _chuteCap.position.y = CHUTE_H + 1.5; _chute.add(_chuteCap);
    // Static internal point-light (built once, never touched per frame).
    var _chuteLight = new THREE.PointLight(SKY_CY, 1.4, 130, 2);
    _chuteLight.position.y = CHUTE_H * 0.5; _chute.add(_chuteLight);
    _chute.position.set(0, 0, 0);
    _plaza.add(_chute);

    // (REMOVED 2026-07-04) The central HOLO-FOUNTAIN beacon `_feature` (tiered
    // plinth + stacked halo plumes + beacon orb) is gone — the deck centre is now
    // an open sacred plaza where the golden + purple roads converge.

    // ── THE SHADDAI TEMPLE — MASSIVE, moved OFF the deck onto its own island ──
    // The golden throne-temple no longer sits in the middle of the Sky Nexus.
    // It has been scaled up LARGE and pushed OUT to the far (-Z) side onto its own
    // floating temple island, reached from the deck by a well-lit GOLDEN BRIDGE.
    // A -Z gap between buildings (no agent tower there) keeps its bridge clear of
    // every building skybridge. Built once (static geo); added as a child of the
    // Nexus group so island + bridge + temple all ride at deck height (y=200).
    var TEMPLE_DIST  = 250;              // distance from deck centre out along -Z to the temple island
    var TEMPLE_SCALE = 1.9;             // "massive" — scales the whole temple group up (bigger, floating focus)
    var TEMPLE_LIFT  = 16;              // how far the temple island FLOATS ABOVE the Sky Nexus deck (bridge ramps up)
    var TEMPLE_X   = 0;                  // (kept for back-compat refs; temple now placed via TEMPLE_DIST/-Z)
    var _tmplMat = new THREE.MeshStandardMaterial({
      color: 0x2a2410, metalness: 0.86, roughness: 0.30,
      emissive: new THREE.Color(SKY_GOLD), emissiveIntensity: 0.42,
    });
    var _temple = new THREE.Group();

    // Stepped golden base the whole temple stands on (deck top = local y 0).
    var _tB1 = new THREE.Mesh(new THREE.CylinderGeometry(30, 32, 1.6, 44, 1), _tmplMat);
    _tB1.position.y = 0.8; _temple.add(_tB1);
    var _tB2 = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 1.4, 44, 1), _tmplMat);
    _tB2.position.y = 2.3; _temple.add(_tB2);
    var _tBaseRim = new THREE.Mesh(new THREE.TorusGeometry(30, 0.35, 8, 72), rimMat(SKY_GOLD));
    _tBaseRim.rotation.x = Math.PI / 2; _tBaseRim.position.y = 1.6; _temple.add(_tBaseRim);

    // Golden colonnade — a full ring of columns.
    var _colR = 23, _colGeo = new THREE.CylinderGeometry(1.1, 1.35, 18, 12, 1);
    for (var tc = 0; tc < 12; tc++) {
      var ta = (tc / 12) * Math.PI * 2;
      var col = new THREE.Mesh(_colGeo, _tmplMat);
      col.position.set(Math.cos(ta) * _colR, 3.0 + 9.0, Math.sin(ta) * _colR);
      col.castShadow = true;
      _temple.add(col);
    }

    // Entablature ring atop the columns + a luminous seam.
    var _tArch = new THREE.Mesh(new THREE.TorusGeometry(_colR, 1.6, 8, 56), _tmplMat);
    _tArch.rotation.x = Math.PI / 2; _tArch.position.y = 21.0; _temple.add(_tArch);
    var _tArchGlow = new THREE.Mesh(new THREE.TorusGeometry(_colR, 0.45, 6, 56), rimMat(SKY_GOLD));
    _tArchGlow.rotation.x = Math.PI / 2; _tArchGlow.position.y = 21.0; _temple.add(_tArchGlow);

    // Golden dome roof crowning the colonnade.
    var _tDomeR = 25;
    var _tDome = new THREE.Mesh(
      new THREE.SphereGeometry(_tDomeR, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), _tmplMat);
    _tDome.position.y = 21.0; _tDome.castShadow = true; _temple.add(_tDome);
    var _tDomeSeam = new THREE.Mesh(new THREE.TorusGeometry(_tDomeR, 0.4, 8, 64), rimMat(SKY_GOLD));
    _tDomeSeam.rotation.x = Math.PI / 2; _tDomeSeam.position.y = 21.4; _temple.add(_tDomeSeam);
    var _tDomeTop = 21.0 + _tDomeR;   // ≈ 46

    // Central altar / throne at the heart of the temple.
    var _altar = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 3.2, 22, 1), _tmplMat);
    _altar.position.y = 3.6; _altar.castShadow = true; _temple.add(_altar);
    var _altarTop = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 0.4, 22, 1), rimMat(SKY_GOLD));
    _altarTop.position.y = 5.4; _temple.add(_altarTop);
    var _throneSeat = new THREE.Mesh(new THREE.BoxGeometry(6, 1.0, 4), _tmplMat);
    _throneSeat.position.set(0, 5.6, -1.4); _temple.add(_throneSeat);
    var _throneBack = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 1.2), _tmplMat);
    _throneBack.position.set(0, 9.4, -3.2); _throneBack.castShadow = true; _temple.add(_throneBack);

    // Glowing SH emblem floating above the altar (vertical ring + disc + orb).
    var _emblemRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.4, 10, 44), rimMat(SKY_GOLD));
    _emblemRing.position.set(0, 12.5, 0); _temple.add(_emblemRing);
    var _emblemDisc = new THREE.Mesh(new THREE.CircleGeometry(2.7, 32), _skyGlowGold);
    _emblemDisc.position.set(0, 12.5, 0.05); _emblemDisc.renderOrder = 3; _temple.add(_emblemDisc);
    var _emblemOrb = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), capOrbMat(SKY_GOLD));
    _emblemOrb.position.set(0, 12.5, 0); _temple.add(_emblemOrb);

    // Halo rings + crowning beacon above the dome — the Source at the pinnacle.
    var _tHaloR = [10, 7, 4.5];
    for (var th = 0; th < _tHaloR.length; th++) {
      var thal = new THREE.Mesh(
        new THREE.TorusGeometry(_tHaloR[th], 0.35, 6, 56),
        (th % 2 === 0) ? _skyGlowGold : _skyGlowCy);
      thal.rotation.x = Math.PI / 2;
      thal.position.y = _tDomeTop + 3.0 + th * 3.4;
      _temple.add(thal);
    }
    var _tApex = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 16), capOrbMat(SKY_GOLD));
    _tApex.position.y = _tDomeTop + 16.0; _temple.add(_tApex);

    // Warm gold light bathing the temple.
    var _tLight = new THREE.PointLight(SKY_GOLD, 1.3, 200, 2);
    _tLight.position.set(0, 26, 0); _temple.add(_tLight);

    // MASSIVE + FLOATING HIGHER: scale the whole temple up and plant it out on its
    // own floating island along -Z, lifted TEMPLE_LIFT units ABOVE the deck so it
    // clearly reads as the huge temple floating in the sky (reached up the bridge).
    _temple.scale.set(TEMPLE_SCALE, TEMPLE_SCALE, TEMPLE_SCALE);
    _temple.position.set(TEMPLE_X, TEMPLE_LIFT, -TEMPLE_DIST);   // massive temple, floating on the -Z sky island
    _plaza.add(_temple);

    // ── TEMPLE ISLAND + GOLDEN SKYBRIDGE (floats ABOVE the deck) ────────────
    // The temple sits out at (0, -TEMPLE_DIST) and floats TEMPLE_LIFT units ABOVE
    // the Sky Nexus deck on its own elevated island — so it reads as "the huge
    // temple floating higher in the sky." A single well-lit golden bridge RAMPS up
    // from the deck edge to the island. Island + every bridge span are registered
    // as walkable decks (climbing patches) so groundY() carries the player up the
    // ramp and holds them on the island.
    var TEMPLE_BASE_R = 32 * TEMPLE_SCALE;             // scaled temple base radius
    var TEMPLE_ISLAND_R = TEMPLE_BASE_R + 12;          // island a bit wider than the base
    var _isleTopLocal = TEMPLE_LIFT;                   // island TOP surface (local y; deck top = 0)
    // Solid island disc under the massive temple (top surface at local y=TEMPLE_LIFT).
    var _tIsle = new THREE.Mesh(
      new THREE.CylinderGeometry(TEMPLE_ISLAND_R, TEMPLE_ISLAND_R + 6, 2.4, 64, 1),
      _skyFloorMat);
    _tIsle.position.set(0, _isleTopLocal - 1.2, -TEMPLE_DIST);
    _plaza.add(_tIsle);
    // Glowing gold rim ring around the island edge.
    var _tIsleRim = new THREE.Mesh(new THREE.TorusGeometry(TEMPLE_ISLAND_R, 0.5, 8, 96), rimMat(SKY_GOLD));
    _tIsleRim.rotation.x = Math.PI / 2; _tIsleRim.position.set(0, _isleTopLocal + 0.4, -TEMPLE_DIST);
    _plaza.add(_tIsleRim);
    // Tapered underside so the island reads as suspended in mid-air (glow cone).
    var _tIsleUnder = new THREE.Mesh(
      new THREE.ConeGeometry(TEMPLE_ISLAND_R + 4, 26, 44, 1, true), _skyGlowGold);
    _tIsleUnder.rotation.x = Math.PI;
    _tIsleUnder.position.set(0, _isleTopLocal - 14, -TEMPLE_DIST);
    _plaza.add(_tIsleUnder);
    deckList.push({ x: 0, z: -TEMPLE_DIST, y: PLAZA_Y + TEMPLE_LIFT, r2: (TEMPLE_ISLAND_R - 3) * (TEMPLE_ISLAND_R - 3) });

    // GOLDEN BRIDGE — a single solid span that RAMPS up from the deck edge to the
    // floating island. Floor/seam/rails are tilted by the ramp incline; walkable
    // deck patches climb from PLAZA_Y up to PLAZA_Y+TEMPLE_LIFT (Δy per patch kept
    // well under DECK_STAND_TOL so groundY() carries the player smoothly upward).
    var _brStart = PLAZA_STAND_R - 6;                  // just inside the deck rail (deck level)
    var _brEnd   = TEMPLE_DIST - (TEMPLE_ISLAND_R - 6); // just onto the island
    var _brLen   = _brEnd - _brStart;
    var _brMid   = (_brStart + _brEnd) * 0.5;
    var _brWidth = 16;
    var _brRise  = TEMPLE_LIFT;                         // total climb deck → island
    var _brTilt  = Math.atan2(_brRise, _brLen);        // ramp incline (raises the -Z island end)
    var _brYc    = (_brRise - 0.8) * 0.5;              // ramp centre height (deck end ≈ -0.4, island end ≈ rise-0.4)
    var _brFloor = new THREE.Mesh(new THREE.BoxGeometry(_brWidth, 0.8, _brLen), _skyFloorMat);
    _brFloor.position.set(0, _brYc, -_brMid); _brFloor.rotation.x = _brTilt;
    _plaza.add(_brFloor);
    // Inlaid glowing gold centre road on the ramp.
    var _brSeam = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.2, _brLen), _skyGlowGold);
    _brSeam.position.set(0, _brYc + 0.52, -_brMid); _brSeam.rotation.x = _brTilt;
    _plaza.add(_brSeam);
    // Neon side rails climbing the ramp (well-lit gold).
    for (var brs = 0; brs < 2; brs++) {
      var railX = (brs === 0 ? -1 : 1) * (_brWidth / 2 - 0.4);
      var _brRail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, _brLen), rimMat(SKY_GOLD));
      _brRail.position.set(railX, _brYc + 0.9, -_brMid); _brRail.rotation.x = _brTilt;
      _plaza.add(_brRail);
    }
    // Balustrade posts + climbing walkable patches + lantern point-lights.
    var _brPostGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.9, 8, 1);
    var _brPostN = Math.max(6, Math.round(_brLen / 8));
    for (var bp = 0; bp <= _brPostN; bp++) {
      var _bf = bp / _brPostN;                          // 0 = deck end, 1 = island end
      var _bz = -(_brStart + _brLen * _bf);
      var _byWorld = PLAZA_Y + _brRise * _bf;           // world height climbing the ramp
      var _byLocal = _brRise * _bf - 0.4;               // local ramp-surface height
      for (var bpx = 0; bpx < 2; bpx++) {
        var post = new THREE.Mesh(_brPostGeo, capOrbMat(SKY_GOLD));
        post.position.set((bpx === 0 ? -1 : 1) * (_brWidth / 2 - 0.4), _byLocal + 1.4, _bz);
        _plaza.add(post);
      }
      // Walkable deck patch climbing the ramp.
      deckList.push({ x: 0, z: _bz, y: _byWorld, r2: (_brWidth / 2) * (_brWidth / 2) });
      // Lantern point-lights so the golden bridge stays well-lit.
      if (bp % 2 === 0) {
        var _brLamp = new THREE.PointLight(SKY_GOLD, 0.55, 60, 2);
        _brLamp.position.set(0, _byLocal + 4.2, _bz);
        _plaza.add(_brLamp);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // (REMOVED 2026-07-04) The central ORACLE OBSERVATORY dome + telescope and
    // the QUILL RARE-ARCHIVES library that used to sit UP ON the deck have been
    // stripped out per the owner's vision: the top is now UNCLUTTERED so the
    // massive SHADDAI temple (out on its bridge) is the sole focus of the Nexus.
    // Their build blocks and purple roads are gone; the deck centre stays an
    // open sacred plaza. (`_oracleDomeMat`, `_screenMat`, `_violetRoadMat`,
    // `_skyGlowViolet`, `makeSign` remain defined above — harmless if unused.)
    // ═══════════════════════════════════════════════════════════════════════
    void _oracleDomeMat; void _screenMat; void _violetRoadMat; void _skyGlowViolet;

    // Back-compat no-op: there is no longer any gated overlook to unlock.
    window.SHADDAI_unlockOverlook = function () { /* removed: single grand deck */ };

    window.SHADDAI_SKY = {
      // The Sky Nexus (the ONE marquee destination above all buildings)
      nexusY: PLAZA_Y, nexusR: PLAZA_STAND_R,
      // Back-compat aliases (older callers used observatory*)
      observatoryY: PLAZA_Y, observatoryR: PLAZA_STAND_R,
      // The TWO Grand Stations you board at ground level (opposite sides).
      // stationX/Z/BaseY keep back-compat pointing at side A.
      stationX: _glSpotA.x, stationZ: _glSpotA.z, stationBaseY: _glBaseYA,
      stationAX: _glSpotA.x, stationAZ: _glSpotA.z, stationABaseY: _glBaseYA,
      stationBX: _glSpotB.x, stationBZ: _glSpotB.z, stationBBaseY: _glBaseYB,
      // Back-compat aliases (older callers used plaza*)
      plazaY: PLAZA_Y, plazaR: PLAZA_STAND_R,
      // THE SHADDAI TEMPLE — massive, floating on its own island off the -Z side of
      // the Sky Nexus deck. SHADDAI (THE SOURCE) stands here, in his temple, not on
      // the ground forum. Standing surface = island top (PLAZA_Y + TEMPLE_LIFT).
      templeX: TEMPLE_X, templeZ: -TEMPLE_DIST, templeY: PLAZA_Y + TEMPLE_LIFT,
    };

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
          if (p.stops) {
            // ── MULTI-STOP LIFT: ride stop→stop, DWELL at each floor ─────────
            // One shaft visits every floor in sequence (…ground→interior→
            // observatory→interior→ground…). It pauses at EVERY stop — including
            // the middle interior floor — so a rider can step off there, then
            // re-board to continue up on the SAME lift. smootherstep eases each
            // segment (zero start/stop velocity) so the carried camera is smooth.
            var _st = p.stops, _n = _st.length;
            if (p.pauseT > 0) {
              p.pauseT -= dt;
            } else {
              var _toI = p.curStop + p.dir;
              var _seg = Math.abs(_st[_toI] - _st[p.curStop]);
              // JANK FIX (2026-07-09): use the clamped moveDt() so a frame hitch
              // can't fling segNorm (and the carried camera) a big chunk at once.
              var _mrate = (_seg > 0.001) ? (ELEV_SPEED * moveDt(dt) / _seg) : 1;
              p.segNorm += _mrate;
              if (p.segNorm >= 1) {
                // Arrived at the next floor. Snap segNorm to exactly 0 and DWELL:
                // the pad must rest EXACTLY on the floor Y during the pause so a
                // rider can step off level with the deck (carrying the sub-frame
                // overshoot into position would leave the pad a hair off the floor
                // during dwell → an unlevel step-off). smootherstep already made the
                // approach velocity ~0 here, so snapping the tiny remainder is
                // invisible; the intentional dwell dominates. No mid-floor jerk.
                p.segNorm = 0;
                p.curStop = _toI;
                if (p.curStop >= _n - 1)      p.dir = -1;   // reached top → head down
                else if (p.curStop <= 0)      p.dir = 1;    // reached bottom → head up
                p.pauseT  = p.stopPause;                    // dwell at this floor
              }
            }
            // Eased position within the current segment (dir already reversed at
            // the ends, so curStop+dir is always a valid neighbouring floor).
            var _fY = _st[p.curStop];
            var _nY = _st[p.curStop + p.dir];
            p.curPos.y = _fY + (_nY - _fY) * smoother(p.segNorm);
          } else {
          // Vertical elevator: rise/lower between lowY ↔ highY.
          // Progress advances linearly in yNorm; a smoothstep ease maps it to
          // the actual Y so the pad accelerates off each end and decelerates
          // into it (no jerky snap at the extremes of travel).
          var span = p.highY - p.lowY;
          if (p.pauseT > 0) {
            p.pauseT -= dt;
          } else {
            // JANK FIX (2026-07-09): clamp dt via moveDt() so a frame hitch can't
            // spike `rate` and fling yNorm (→ eased pad Y → carried camera) a big
            // jump in one frame. The ride just resumes smoothly next frame.
            var rate = (span > 0.001) ? (ELEV_SPEED * moveDt(dt) / span) : 1;
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
          // smootherstep(yNorm): buttery ease-in-out — gentle acceleration off
          // the ground and gentle deceleration onto the deck (zero velocity AND
          // zero acceleration at both ends → no abrupt start/stop jolt).
          var eY = smoother(p.yNorm);
          p.curPos.y = p.lowY + span * eY;
          }

          // Subtle idle float — SUPPRESSED while a rider is aboard so the ride
          // (and the carried camera) is perfectly smooth with zero micro-jitter.
          var elevBob = p.isRiding ? 0 : Math.sin(t * 1.3 + i * 0.5) * 0.10;
          p.group.position.set(p.curPos.x, p.curPos.y + elevBob, p.curPos.z);

        } else {
          // Horizontal transit pod: slide between startPos ↔ endPos
          if (p.pauseT > 0) {
            p.pauseT -= dt;
          } else {
            // JANK FIX (2026-07-09): clamped moveDt() — a hitch can't lurch the pod.
            var tStep = (p.totalDist > 0.001) ? (TRANSIT_SPEED * moveDt(dt) / p.totalDist) : 1;
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
            // smootherstep ease so the pod accelerates out of / decelerates into
            // each terminus instead of lurching. lerpVectors is zero-alloc.
            var eT = smoother(p.tNorm);
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

        // Locked platforms (gated teasers) never latch a rider — you can walk
        // over the parked pad but it will not carry you until it is unlocked.
        // Interior-only sky-shafts only latch once ARMED by an interior hand-off,
        // so they are never boardable by walking over them out in the plaza.
        var boardable = !p.locked && (!p.interiorOnly || p.armed);
        var wasRiding = p.isRiding;
        // BOARD ONLY VIA [R] (2026-07-05): the player no longer AUTO-rides by
        // walking over a pad — that whisked people up unexpectedly and made the
        // lift collide with the agent talk spot. tryBoard()/forceBoardBuilding()
        // (driven by the R key / interior hand-off) set isRiding=true and snap
        // the rider onto the pad; update() then only KEEPS that ride alive while
        // they stay on the pad (wasRiding gate). No wasRiding ⇒ never latches here.
        p.isRiding    = boardable && inXZ && inY && wasRiding;

        // Stepped off the top of a building sky-shaft → relock it so it can't be
        // re-boarded from the deck (it stays a private, interior-entered shaft).
        if (p.interiorOnly && wasRiding && !p.isRiding) p.armed = false;

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
        // Interior-only sky-shafts get NO plaza "step on to ride" hint — they are
        // boarded from inside the building only.
        if (!p.interiorOnly && d2 < nearDist2) {
          nearDist2 = d2;
          nearPlat  = p;
        }
      } // end platform loop

      // ── Y return-to-ground when not riding a vertical elevator ───────────
      if (!ridingElev) {
        _ridingElevY = null;
        // If standing on an arrival deck, the deck IS the floor — hold that height
        // instead of sinking to terrain. Otherwise fall/settle to terrain height.
        var groundTarget = _checkDeck() ? _deckHitY : (getGroundY(playerPos.x, playerPos.z) || 0);
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

    // groundY() — the player's floor height override:
    //   • while riding a vertical lift → the live pad height (exact carry up/down)
    //   • while standing on an arrival deck → the deck height (SOLID walkable floor)
    //   • otherwise → null, so the lead falls back to terrain heightAt().
    // ZERO alloc: _checkDeck() uses only pre-owned scalars.
    function groundY() {
      if (_ridingElevY !== null) return _ridingElevY;
      if (_checkDeck()) return _deckHitY;
      return null;
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
        if (p.interiorOnly) continue;   // never plaza-boardable — interior hand-off only
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
      // Sealed lift: refuse to board (locked feel — stays put until unlocked).
      if (p.locked) return false;

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
      // Sealed lifts advertise their locked banner instead of a ride prompt.
      _info.label = (p.locked && p.lockLabel) ? p.lockLabel : p.rideLabel;
      return _info;
    }

    // ── INTERIOR HAND-OFF — board a building's private sky-shaft ────────────
    // Called by world-interiors.js the instant the player steps onto that
    // building's 2nd-level elevator pad (after the interior fades out). It snaps
    // the player onto the shaft's ground pad, ARMS the shaft, and forces the
    // riding state so the existing smoothstep ascent carries them (and, via
    // groundY(), the camera) straight up to the Sky Nexus deck. Returns true if
    // the building has a shaft, else false (caller falls back to a deck drop).
    function forceBoardBuilding(code) {
      var p = _buildingLifts[String(code || '').toUpperCase()];
      if (!p) return false;
      // Start the shaft docked at the bottom and rising immediately.
      p.armed   = true;
      p.locked  = false;
      p.yNorm   = 0;
      p.dir     = 1;
      p.pauseT  = 0;
      if (p.stops) { p.curStop = 0; p.segNorm = 0; }   // reset multi-stop traveller to ground
      p.curPos.x = p.px; p.curPos.z = p.pz; p.curPos.y = p.lowY;
      p.prevPos.copy(p.curPos);
      // Snap the player onto the pad so ride detection latches this frame + next.
      playerPos.x = p.px;
      playerPos.z = p.pz;
      if (playerPos.y !== undefined) playerPos.y = p.lowY;
      p.isRiding   = true;
      _ridingElevY = p.lowY;
      window._elevatorRiding = true;
      return true;
    }

    var _api = {
      update:          update,
      platforms:       platforms,
      nearestPlatform: nearestPlatform,
      groundY:         groundY,
      isRiding:        isRiding,
      tryBoard:        tryBoard,
      nearestInfo:     nearestInfo,
      forceBoardBuilding: forceBoardBuilding,
      hasBuildingLift: function (code) { return !!_buildingLifts[String(code || '').toUpperCase()]; },
    };

    // Expose a stable global so world-interiors.js (built BEFORE this module) can
    // reach the hand-off lazily at ride time without an explicit wiring in the host.
    window.__shaddaiElevators = _api;

    return _api;
  };

})();
