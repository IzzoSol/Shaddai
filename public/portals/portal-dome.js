/* portals/portal-dome.js — NEXUS Portal-Dome (Phase 1: structure, levels, organized slot arches)
 *
 * Classic (non-module) script.
 * Load AFTER portals-registry.js and portal-plots.js, BEFORE the <script type="module"> block.
 *
 * Exposes one global:
 *   window.buildPortalDome(opts) → { update(dt, t), slots, group }
 *
 * opts = {
 *   THREE,     — Three.js namespace (r150+, tested on r180)
 *   scene,     — THREE.Scene
 *   layout,    — window.WORLD_LAYOUT  (boundary reference; .half ≈ 380)
 *   registry,  — window.PORTALS_REGISTRY (optional; falls back to window.PORTALS_REGISTRY)
 * }
 *
 * Returned API:
 *   update(dt, t)  — call inside animate() after portalPlots.update()
 *   slots          — flat array of live slot objects (for future interactivity)
 *   group          — THREE.Group root (for raycasting / removal)
 *
 * ── LEAD WIRING SNIPPET ──────────────────────────────────────────────────────
 *
 * 1. LOAD — add after portal-plots.js:
 *
 *      <script src="/portals/portals-registry.js"></script>
 *      <script src="/portals/portal-plots.js"></script>
 *      <script src="/portals/portal-dome.js"></script>
 *
 * 2. INSTANTIATE — inside the module, right after portalPlots is built (~line after portalPlots):
 *
 *      let portalDome = null;
 *      if (window.buildPortalDome && window.PORTALS_REGISTRY && window.PORTALS_REGISTRY.dome) {
 *        portalDome = window.buildPortalDome({
 *          THREE, scene,
 *          layout:   window.WORLD_LAYOUT,
 *          registry: window.PORTALS_REGISTRY,
 *        });
 *      }
 *
 * 3. ANIMATE LOOP — after portalPlots.update(dt, t):
 *
 *      if (portalDome) portalDome.update(dt, t);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERFORMANCE NOTES:
 *   • No new THREE objects are created inside update().
 *   • InstancedMesh used for balcony support pillars (SUPPORT_N × level count).
 *   • All geometries shared within a category (pillars, lintel, etc.) via one
 *     CylinderGeometry / BoxGeometry created once per arch size.
 *   • Glow opacities are modest (additive, ≤ 0.20) to avoid the white-blowout
 *     problem the world had previously.
 *   • Point lights kept to 3 (one entrance + one per level = 4 total).
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // ── pure helpers ──────────────────────────────────────────────────────────

  function groundAt(x, z) {
    if (typeof global.WORLD_HEIGHT_AT === 'function') {
      var y = global.WORLD_HEIGHT_AT(x, z);
      return (isFinite(y) ? y : 0);
    }
    return 0;
  }

  // ── Slot arch dimensions (walk-through scale, smaller than spawn portals) ──
  // spawn portals: ARCH_W=9, ARCH_H=12.5 — slots are 60% of that
  var SLOT_W  = 5.5;                           // clear opening width
  var SLOT_H  = 8.0;                           // clear opening height
  var SLOT_PR = 0.42;                          // pillar cylinder radius
  var SLOT_PH = SLOT_H + 1.2;                 // total pillar height (proud of opening)
  var SLOT_LW = SLOT_W + SLOT_PR * 2.0 + 0.3; // lintel outer span
  var SLOT_LH = 1.1;                          // lintel height

  // Entrance arch — 40% bigger than slot arches
  var ENT_W  = SLOT_W  * 1.4;   // 7.7
  var ENT_H  = SLOT_H  * 1.4;   // 11.2
  var ENT_PR = SLOT_PR * 1.2;   // 0.504
  var ENT_PH = ENT_H   + 1.5;   // 12.7
  var ENT_LW = ENT_W   + ENT_PR * 2.0 + 0.4;
  var ENT_LH = 1.3;

  // Sign canvas pixel dimensions
  var SIGN_PX_W  = 256;
  var SIGN_PX_H  = 64;
  var SIGN_WW    = 7.0;    // world-space width
  var SIGN_WH    = 1.75;   // world-space height

  // Approach-path beacon count (lit path from NEXUS → dome)
  var PATH_MARKER_COUNT = 5;

  // Balcony support pillar count per level (InstancedMesh)
  var SUPPORT_N = 12;

  // ── canvas sign → THREE.Sprite ────────────────────────────────────────────
  // Creates a single sprite with two lines of text. color is a hex int.
  function makeSignSprite(THREE, line1, line2, color) {
    var cv  = document.createElement('canvas');
    cv.width  = SIGN_PX_W;
    cv.height = SIGN_PX_H;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, SIGN_PX_W, SIGN_PX_H);

    var hex = '#' + ('000000' + (color >>> 0).toString(16)).slice(-6);

    // Background (semi-opaque dark)
    ctx.fillStyle = 'rgba(0,22,22,0.88)';
    ctx.fillRect(3, 3, SIGN_PX_W - 6, SIGN_PX_H - 6);

    // Border
    ctx.strokeStyle = hex;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(3, 3, SIGN_PX_W - 6, SIGN_PX_H - 6);

    // Line 1
    ctx.fillStyle    = hex;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 12px "Share Tech Mono",monospace';
    ctx.fillText(line1, SIGN_PX_W / 2, SIGN_PX_H * 0.34, SIGN_PX_W - 12);

    // Line 2 (dimmer)
    ctx.globalAlpha = 0.70;
    ctx.font        = '10px "Share Tech Mono",monospace';
    ctx.fillText(line2, SIGN_PX_W / 2, SIGN_PX_H * 0.70, SIGN_PX_W - 12);
    ctx.globalAlpha = 1.0;

    var tex = new THREE.CanvasTexture(cv);
    var mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.90,
      depthWrite: false, toneMapped: false,
    });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(SIGN_WW, SIGN_WH, 1.0);
    return sprite;
  }

  // ── Build one slot arch group ─────────────────────────────────────────────
  // Returns { grp, mats:{ pilMat, glowMat, fieldMat }, field, isLive, col }
  // facingAngle: the rotation.y that makes the arch face the dome center.
  // Shared geometries passed in to avoid per-slot allocation.
  function buildSlotArch(THREE, slotDef, facingAngle, sharedGeo) {
    var isLive  = slotDef.status === 'live';
    var col     = new THREE.Color(slotDef.color || 0x34e5b0);
    var grp     = new THREE.Group();
    grp.rotation.y = facingAngle;

    // Opacities: live slots bright, available slots ghost-dim
    var opPil   = isLive ? 0.72 : 0.22;
    var opGlow  = isLive ? 0.12 : 0.04;
    var opField = isLive ? 0.20 : 0.06;

    var pilMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: opPil, toneMapped: false,
    });
    var glowMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: opGlow,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    var fieldMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: opField,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    });

    var px = SLOT_W / 2 + SLOT_PR;  // pillar X offset from arch centerline

    // Left pillar + glow shell
    var pilL     = new THREE.Mesh(sharedGeo.pilGeo,     pilMat);
    var pilLGlow = new THREE.Mesh(sharedGeo.pilGlowGeo, glowMat);
    pilL.position.set(-px, SLOT_PH / 2, 0);
    pilLGlow.position.copy(pilL.position);
    grp.add(pilL);
    grp.add(pilLGlow);

    // Right pillar + glow shell
    var pilR     = new THREE.Mesh(sharedGeo.pilGeo,     pilMat);
    var pilRGlow = new THREE.Mesh(sharedGeo.pilGlowGeo, glowMat);
    pilR.position.set(px, SLOT_PH / 2, 0);
    pilRGlow.position.copy(pilR.position);
    grp.add(pilR);
    grp.add(pilRGlow);

    // Lintel (shared box geo)
    var lintel = new THREE.Mesh(sharedGeo.linGeo, pilMat);
    lintel.position.set(0, SLOT_PH + SLOT_LH / 2, 0);
    grp.add(lintel);

    // Energy field plane
    var field = new THREE.Mesh(sharedGeo.fieldGeo, fieldMat);
    field.position.set(0, SLOT_H / 2, 0);
    grp.add(field);

    // Sign sprite above lintel
    var signY  = SLOT_PH + SLOT_LH + SIGN_WH * 0.5 + 0.3;
    var sprite;
    if (isLive) {
      var kindLabel = slotDef.kind ? '[ ' + slotDef.kind.toUpperCase() + ' ]' : '';
      sprite = makeSignSprite(THREE, '◈ ' + slotDef.name, kindLabel, slotDef.color || 0x34e5b0);
    } else {
      var slotLabel = '◈ SLOT ' + slotDef.id.toUpperCase() + ' · AVAILABLE';
      sprite = makeSignSprite(THREE, slotLabel, 'APPLY AT DASHBOARD', 0x34e5b0);
    }
    sprite.position.set(0, signY, 0);
    grp.add(sprite);

    return {
      grp:    grp,
      mats:   { pilMat: pilMat, glowMat: glowMat, fieldMat: fieldMat },
      field:  field,
      isLive: isLive,
      col:    col,
    };
  }

  // ── Main factory ──────────────────────────────────────────────────────────

  global.buildPortalDome = function buildPortalDome(opts) {

    var THREE    = opts.THREE;
    var scene    = opts.scene;
    var registry = opts.registry || global.PORTALS_REGISTRY;

    if (!registry || !registry.dome) {
      console.warn('[portal-dome] registry.dome not found — dome not built. ' +
        'Make sure portals-registry.js is loaded first.');
      return { update: function () {}, slots: [], group: null };
    }

    var dome   = registry.dome;
    var cx     = dome.center[0];          // world-X of dome center
    var cz     = dome.center[1];          // world-Z of dome center
    var gy     = groundAt(cx, cz);        // terrain height at dome center
    var DOME_R = dome.domeRadius || 45;   // geodesic dome sphere radius
    var ENT_A  = dome.entranceAngleRad;   // XZ angle (atan2 convention) facing NEXUS

    // Root group — everything is a child, positioned at dome center
    var rootGroup = new THREE.Group();
    rootGroup.position.set(cx, gy, cz);
    scene.add(rootGroup);

    // ── A. Geodesic dome shell ─────────────────────────────────────────────
    // Sphere centered at y=0 (ground level of root group). The bottom half
    // sinks underground and is naturally clipped — gives a clean hemisphere look.
    var domeGeo = new THREE.IcosahedronGeometry(DOME_R, 3);

    // Wireframe skeleton (low opacity — avoids the "white glow" performance issue)
    var wireMat = new THREE.MeshBasicMaterial({
      color: 0x34e5b0, wireframe: true, transparent: true, opacity: 0.13,
      depthWrite: false, toneMapped: false,
    });
    var wireMesh = new THREE.Mesh(domeGeo, wireMat);
    rootGroup.add(wireMesh);

    // Inner shell (BackSide — visible from inside the dome)
    var innerShellMat = new THREE.MeshBasicMaterial({
      color: 0x062020, transparent: true, opacity: 0.07,
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
    });
    rootGroup.add(new THREE.Mesh(domeGeo, innerShellMat));

    // Outer shell (FrontSide — faint tint visible on approach)
    var outerShellMat = new THREE.MeshBasicMaterial({
      color: 0x0d3030, transparent: true, opacity: 0.04,
      side: THREE.FrontSide, depthWrite: false, toneMapped: false,
    });
    rootGroup.add(new THREE.Mesh(domeGeo, outerShellMat));

    // ── B. Monumental base ring torus (ground level) ───────────────────────
    var baseTorus = new THREE.Mesh(
      new THREE.TorusGeometry(DOME_R * 0.96, 0.85, 10, 72),
      new THREE.MeshBasicMaterial({
        color: 0x34e5b0, transparent: true, opacity: 0.50, toneMapped: false,
      })
    );
    baseTorus.rotation.x = Math.PI / 2;
    baseTorus.position.y = 0.12;
    rootGroup.add(baseTorus);

    // ── C. Approach path — lit beacons from NEXUS edge toward dome entrance ─
    // Direction vector (XZ) pointing from dome center outward toward NEXUS
    var pathDX = Math.sin(ENT_A);
    var pathDZ = Math.cos(ENT_A);

    var pathMarkers = [];   // { discMat, capMat, phase } — mutated in update()
    var pathDiscGeo = new THREE.CircleGeometry(1.7, 18);
    var pathDiscMat = new THREE.MeshBasicMaterial({
      color: 0x34e5b0, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    });
    var pathPostGeo = new THREE.CylinderGeometry(0.11, 0.16, 3.5, 6, 1);
    var pathPostMat = new THREE.MeshBasicMaterial({
      color: 0x34e5b0, transparent: true, opacity: 0.48, toneMapped: false,
    });
    var pathCapGeo = new THREE.SphereGeometry(0.33, 7, 5);

    for (var pi = 0; pi < PATH_MARKER_COUNT; pi++) {
      // First beacon starts just outside dome perimeter; space 22 units apart
      var pdist = DOME_R + 8 + pi * 22;
      var pmwx  = cx + pathDX * pdist;
      var pmwz  = cz + pathDZ * pdist;
      var pmy   = groundAt(pmwx, pmwz) - gy;  // height relative to root group

      // Ground glow disc
      var disc = new THREE.Mesh(pathDiscGeo, pathDiscMat.clone());
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(pathDX * pdist, pmy + 0.10, pathDZ * pdist);
      rootGroup.add(disc);

      // Post
      var post = new THREE.Mesh(pathPostGeo, pathPostMat);
      post.position.set(pathDX * pdist, pmy + 1.75, pathDZ * pdist);
      rootGroup.add(post);

      // Beacon cap (additive glow sphere on top of post)
      var capMat = new THREE.MeshBasicMaterial({
        color: 0x34e5b0, transparent: true, opacity: 0.60,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      var cap = new THREE.Mesh(pathCapGeo, capMat);
      cap.position.set(pathDX * pdist, pmy + 3.5 + 0.33, pathDZ * pdist);
      rootGroup.add(cap);

      pathMarkers.push({ discMat: disc.material, capMat: capMat, phase: pi * 0.95 });
    }

    // ── D. Entrance arch (dome perimeter, facing NEXUS, OPEN — no energy field) ─
    var entGroup  = new THREE.Group();
    // Place at dome perimeter along the entrance angle
    var entPX_loc = Math.sin(ENT_A) * (DOME_R * 0.88);
    var entPZ_loc = Math.cos(ENT_A) * (DOME_R * 0.88);
    entGroup.position.set(entPX_loc, 0, entPZ_loc);
    // rotation.y = ENT_A makes the arch face outward (+Z of group → toward NEXUS)
    entGroup.rotation.y = ENT_A;

    var entCol    = new THREE.Color(0x34e5b0);
    var entPilMat = new THREE.MeshBasicMaterial({
      color: entCol, transparent: true, opacity: 0.85, toneMapped: false,
    });
    var entGlowMat = new THREE.MeshBasicMaterial({
      color: entCol, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });

    var entPilGeo    = new THREE.CylinderGeometry(ENT_PR, ENT_PR * 1.15, ENT_PH, 10, 1);
    var entGlowGeo   = new THREE.CylinderGeometry(ENT_PR + 0.45, ENT_PR * 1.15 + 0.45, ENT_PH, 10, 1);
    var entPX_off    = ENT_W / 2 + ENT_PR;

    // Left pillar
    var entPilL = new THREE.Mesh(entPilGeo, entPilMat);
    entPilL.position.set(-entPX_off, ENT_PH / 2, 0);
    entGroup.add(entPilL);
    var entGlowL = new THREE.Mesh(entGlowGeo, entGlowMat);
    entGlowL.position.copy(entPilL.position);
    entGroup.add(entGlowL);

    // Right pillar
    var entPilR = new THREE.Mesh(entPilGeo, entPilMat);
    entPilR.position.set(entPX_off, ENT_PH / 2, 0);
    entGroup.add(entPilR);
    var entGlowR = new THREE.Mesh(entGlowGeo, entGlowMat);
    entGlowR.position.copy(entPilR.position);
    entGroup.add(entGlowR);

    // Lintel
    var entLintelGeo = new THREE.BoxGeometry(ENT_LW, ENT_LH, ENT_PR * 2 + 0.2);
    var entLintel    = new THREE.Mesh(entLintelGeo, entPilMat);
    entLintel.position.set(0, ENT_PH + ENT_LH / 2, 0);
    entGroup.add(entLintel);

    // Lintel glow shell
    var entLintelGlow = new THREE.Mesh(
      new THREE.BoxGeometry(ENT_LW + 0.8, ENT_LH + 0.6, ENT_PR * 2 + 0.7),
      entGlowMat
    );
    entLintelGlow.position.copy(entLintel.position);
    entGroup.add(entLintelGlow);

    // Name sign above entrance lintel
    var entSign = makeSignSprite(
      THREE,
      '⬡ NEXUS PORTAL DOME',        // ⬡ NEXUS PORTAL DOME
      'PHASE 1 — PORTALS & SUITES', // PHASE 1 — PORTALS & SUITES
      0x34e5b0
    );
    entSign.position.set(0, ENT_PH + ENT_LH + SIGN_WH * 0.5 + 0.5, 0);
    entGroup.add(entSign);

    rootGroup.add(entGroup);

    // Entrance point light (behind the arch inside the dome)
    var entLight = new THREE.PointLight(entCol, 2.2, 58);
    entLight.position.set(entPX_loc * 0.5, 7, entPZ_loc * 0.5);
    rootGroup.add(entLight);

    // ── E. Level ring platforms (3 levels) ────────────────────────────────
    // Shared geometry for balcony support pillars (InstancedMesh per level)
    var _supportBaseMat = new THREE.MeshBasicMaterial({
      color: 0x1a5e5e, transparent: true, opacity: 0.65, toneMapped: false,
    });
    var _mat4 = new THREE.Matrix4();  // reused for setMatrixAt — allocated ONCE

    var levelObjects = [];  // { edgeTorus, innerTorus, light, phase }

    dome.levels.forEach(function (lev, li) {
      var ly  = lev.y;
      var lr  = lev.ringRadius;
      var ir  = 6.5;    // inner opening radius (keeps lift shaft visible)

      // ── ring floor platform (RingGeometry = flat disc with hole) ──
      var platMat = new THREE.MeshBasicMaterial({
        color: 0x071e1e, transparent: true, opacity: 0.78,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false,
      });
      var plat = new THREE.Mesh(new THREE.RingGeometry(ir, lr + 1.8, 64, 1), platMat);
      plat.rotation.x = -Math.PI / 2;
      plat.position.y  = ly;
      rootGroup.add(plat);

      // ── outer edge torus (glowing handrail) ──
      var edgeMat = new THREE.MeshBasicMaterial({
        color: 0x34e5b0, transparent: true, opacity: 0.42, toneMapped: false,
      });
      var edgeTorus = new THREE.Mesh(
        new THREE.TorusGeometry(lr + 1.5, 0.30, 8, 56),
        edgeMat
      );
      edgeTorus.rotation.x = Math.PI / 2;
      edgeTorus.position.y = ly;
      rootGroup.add(edgeTorus);

      // ── inner edge torus (cyan highlight around the shaft opening) ──
      var innerMat = new THREE.MeshBasicMaterial({
        color: 0x27e0ff, transparent: true, opacity: 0.32, toneMapped: false,
      });
      var innerTorus = new THREE.Mesh(
        new THREE.TorusGeometry(ir, 0.20, 7, 36),
        innerMat
      );
      innerTorus.rotation.x = Math.PI / 2;
      innerTorus.position.y = ly;
      rootGroup.add(innerTorus);

      // ── balcony support pillars (InstancedMesh) ──
      // Pillars run from the PREVIOUS level up to this one.
      if (li > 0) {
        var prevY  = dome.levels[li - 1].y;
        var supH   = ly - prevY;
        var supGeo = new THREE.CylinderGeometry(0.27, 0.27, supH, 7, 1);
        // InstancedMesh: SUPPORT_N cylinders, one material instance
        var supInst = new THREE.InstancedMesh(supGeo, _supportBaseMat.clone(), SUPPORT_N);
        for (var si = 0; si < SUPPORT_N; si++) {
          var sa = (si / SUPPORT_N) * Math.PI * 2;
          supInst.setMatrixAt(si, _mat4.makeTranslation(
            Math.sin(sa) * (lr + 0.6),
            prevY + supH / 2,
            Math.cos(sa) * (lr + 0.6)
          ));
        }
        supInst.instanceMatrix.needsUpdate = true;
        rootGroup.add(supInst);
      }

      // ── level ambient light ──
      var levLight = new THREE.PointLight(0x1fd6c4, 0.75, 42);
      levLight.position.set(0, ly + 4, 0);
      rootGroup.add(levLight);

      levelObjects.push({
        edgeTorus:  edgeTorus,
        edgeMat:    edgeMat,
        innerTorus: innerTorus,
        innerMat:   innerMat,
        light:      levLight,
        phase:      li * 1.35,
      });
    });

    // ── F. Central lift shaft ──────────────────────────────────────────────
    var lastLevY = dome.levels[dome.levels.length - 1].y;
    var shaftH   = lastLevY + 9;
    var shaftMat = new THREE.MeshBasicMaterial({
      color: 0x27e0ff, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    });
    var shaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, shaftH, 14, 1, true),
      shaftMat
    );
    shaftMesh.position.y = shaftH / 2;
    rootGroup.add(shaftMesh);

    // Animated torus rings that travel up the shaft (visual lift suggestion)
    var shaftRings = [];
    dome.levels.forEach(function (lev, li) {
      var srMat = new THREE.MeshBasicMaterial({
        color: 0x27e0ff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      var sr = new THREE.Mesh(
        new THREE.TorusGeometry(2.4, 0.16, 7, 28),
        srMat
      );
      sr.rotation.x = Math.PI / 2;
      sr.position.y = lev.y;
      rootGroup.add(sr);
      shaftRings.push({
        mesh:   sr,
        mat:    srMat,
        baseY:  lev.y,
        span:   (li < dome.levels.length - 1)
                  ? dome.levels[li + 1].y - lev.y
                  : 9,   // top ring travels 9 units upward
        offset: li * 0.34,   // stagger so rings don't travel in lockstep
      });
    });

    // ── G. Portal slot arches ─────────────────────────────────────────────
    // Shared geometries (created ONCE, referenced by every slot's Mesh)
    var sharedGeo = {
      pilGeo:    new THREE.CylinderGeometry(SLOT_PR, SLOT_PR * 1.12, SLOT_PH, 8, 1),
      pilGlowGeo:new THREE.CylinderGeometry(SLOT_PR + 0.28, SLOT_PR * 1.12 + 0.28, SLOT_PH, 8, 1),
      linGeo:    new THREE.BoxGeometry(SLOT_LW, SLOT_LH, SLOT_PR * 2 + 0.14),
      fieldGeo:  new THREE.PlaneGeometry(SLOT_W, SLOT_H),
    };

    var slots = [];  // exposed on the returned API

    dome.levels.forEach(function (lev) {
      var n         = lev.slots.length;
      var ly        = lev.y;
      var lr        = lev.ringRadius;
      // Slots are evenly distributed. Offset by half-slot-width so the gap
      // falls centered on the entrance angle (no arch blocks the doorway).
      var baseAngle = ENT_A + Math.PI / n;

      lev.slots.forEach(function (slotDef, si) {
        var a     = baseAngle + (Math.PI * 2 / n) * si;
        // Place arches slightly inside the ring radius (so pillars clear the edge torus)
        var pr    = lr - SLOT_W * 0.45 - 0.8;
        var sx    = Math.sin(a) * pr;
        var sz    = Math.cos(a) * pr;
        // Face arch toward dome center: atan2(-sx, -sz)
        var faceA = Math.atan2(-sx, -sz);

        var archObj = buildSlotArch(THREE, slotDef, faceA, sharedGeo);
        archObj.grp.position.set(sx, ly, sz);
        rootGroup.add(archObj.grp);

        slots.push({
          id:     slotDef.id,
          level:  lev.level,
          slot:   slotDef.slot,
          status: slotDef.status,
          group:  archObj.grp,
          mats:   archObj.mats,
          field:  archObj.field,
          isLive: archObj.isLive,
          col:    archObj.col,
          phase:  si * 0.60 + lev.level * 1.15,
        });
      });
    });

    // ── H. Update loop (zero allocations per frame) ───────────────────────

    function update(dt, t) {
      // Wireframe dome — very slow gentle breathe
      wireMat.opacity = 0.10 + Math.sin(t * 0.35) * 0.03;

      // Approach path beacons — sequential "chase" pattern
      for (var pi = 0; pi < pathMarkers.length; pi++) {
        var pm   = pathMarkers[pi];
        var wave = Math.sin(t * 2.0 - pm.phase * 1.5) * 0.5 + 0.5; // 0..1
        pm.discMat.opacity = 0.12 + wave * 0.20;
        pm.capMat.opacity  = 0.38 + wave * 0.30;
      }

      // Entrance light — slow pulse
      entLight.intensity = 1.8 + Math.sin(t * 0.9) * 0.45;

      // Level edge torii + inner rings
      for (var li = 0; li < levelObjects.length; li++) {
        var lo = levelObjects[li];
        lo.edgeMat.opacity  = 0.33 + Math.sin(t * 0.55 + lo.phase) * 0.09;
        lo.innerMat.opacity = 0.22 + Math.sin(t * 0.70 + lo.phase * 1.2) * 0.08;
        lo.light.intensity  = 0.55 + Math.sin(t * 0.65 + lo.phase) * 0.22;
      }

      // Shaft rings — travel upward through their span, then snap back to base
      for (var ri = 0; ri < shaftRings.length; ri++) {
        var sr    = shaftRings[ri];
        var frac  = ((t * 0.45 + sr.offset) % 1.0);  // 0..1 cycle
        sr.mesh.position.y = sr.baseY + frac * sr.span;
        sr.mat.opacity     = 0.25 + Math.sin(frac * Math.PI) * 0.38;
      }

      // Slot energy fields — live fields breathe, available fields barely visible
      for (var si2 = 0; si2 < slots.length; si2++) {
        var sl   = slots[si2];
        var base = sl.isLive ? 0.18 : 0.045;
        var amp  = sl.isLive ? 0.07 : 0.015;
        sl.mats.fieldMat.opacity = base + Math.sin(t * 1.4 + sl.phase) * amp;
      }
    }

    // ── Return API ────────────────────────────────────────────────────────
    return {
      update: update,
      slots:  slots,
      group:  rootGroup,
    };
  };

}(window));
