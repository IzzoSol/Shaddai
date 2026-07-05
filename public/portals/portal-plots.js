/* portals/portal-plots.js — Rentable Portal-World Plots (frontend renderer)
 *
 * Classic (non-module) script. Load AFTER portals-registry.js, BEFORE the module block.
 * Exposes one global:
 *
 *   window.buildPortalPlots(opts) → api
 *
 * opts = {
 *   THREE,    — Three.js namespace
 *   scene,    — THREE.Scene
 *   layout,   — window.WORLD_LAYOUT (used for .half boundary reference)
 *   registry, — window.PORTALS_REGISTRY (optional; falls back to window.PORTALS_REGISTRY)
 * }
 *
 * Returned API:
 *   update(dt, t)  — call inside animate() after worldSpawn.update()
 *   refresh()      — re-fetch plot status from /api/portal-plots and update signs
 *   plots          — array of live plot objects { id, group, signSprite, statusData }
 *
 * ── LEAD WIRING SNIPPET ──────────────────────────────────────────────────────
 *
 * 1. LOAD — after the other world-*.js scripts and after portals-registry.js:
 *      <script src="/portals/portals-registry.js"></script>
 *      <script src="/portals/portal-plots.js"></script>
 *
 * 2. INSTANTIATE — inside the module, right after worldSpawn is built:
 *      let portalPlots = null;
 *      if (window.buildPortalPlots && window.WORLD_LAYOUT) {
 *        portalPlots = window.buildPortalPlots({
 *          THREE, scene,
 *          layout:   window.WORLD_LAYOUT,
 *          registry: window.PORTALS_REGISTRY,
 *        });
 *      }
 *
 * 3. ANIMATE LOOP — after worldSpawn.update(dt, t):
 *      if (portalPlots) portalPlots.update(dt, t);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN:
 *   Each plot renders:
 *     • A portal GATEWAY (twin pillars + lintel + energy field) — same geometry
 *       language as the spawn portals in world-spawn.js, but slightly bigger and
 *       with a plot-specific idle tint.
 *     • A floating PLATFORM / PAD below the arch (the "real estate" to rent/buy).
 *     • A canvas SIGN sprite above the lintel showing live status:
 *         available  → "◈ FOR RENT · $29/mo  FOR SALE · $299"  (green/cyan tint)
 *         rented     → "◈ RENTED by <owner>"                    (amber tint)
 *         sold       → "◈ SOLD · <owner>"                       (dim/grey tint)
 *     • A POINT LIGHT for atmosphere.
 *
 *   Status is fetched once on init and on every refresh() call.
 *   All Three.js objects are created once; per-frame code mutates only opacity/intensity.
 *   No new objects are allocated inside update().
 */
(function (global) {
  'use strict';

  // ── shared geometry constants (same scale language as world-spawn.js) ──────
  var ARCH_W = 11.0;                           // plot arch is slightly wider than spawn arches
  var ARCH_H = 14.0;
  var PIL_R  = 0.65;
  var PIL_H  = ARCH_H + 1.8;
  var LIN_W  = ARCH_W + PIL_R * 2.0 + 0.5;
  var LIN_H  = 1.6;
  var DISC_R = ARCH_W * 0.80;                  // floor disc a bit larger

  // Floating platform dimensions
  var PAD_W  = 22;
  var PAD_D  = 18;
  var PAD_H  = 0.6;
  var PAD_Y  = -1.2;   // sits just below ground level so it blends as a raised pad

  // Sign canvas (world-space sprite)
  var SIGN_PX_W = 512;
  var SIGN_PX_H = 128;
  var SIGN_WORLD_W = 11;
  var SIGN_WORLD_H = 2.75;

  // ── colour helpers ────────────────────────────────────────────────────────
  function intToHex(n) {
    return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  }

  function statusColor(status) {
    // returns a hex-int tint colour based on plot status
    if (!status || status === 'available') return 0x34e5b0;   // green/cyan
    if (status === 'rented')              return 0xffcf4a;   // amber
    if (status === 'sold')                return 0x6c7a8a;   // grey-blue (dim)
    return 0x34e5b0;
  }

  function groundAt(x, z) {
    if (typeof global.WORLD_HEIGHT_AT === 'function') {
      var y = global.WORLD_HEIGHT_AT(x, z);
      return (isFinite(y) ? y : 0);
    }
    return 0;
  }

  // ── canvas sign builder ───────────────────────────────────────────────────
  function buildSignCanvas(plot, statusData) {
    var cvs = document.createElement('canvas');
    cvs.width  = SIGN_PX_W;
    cvs.height = SIGN_PX_H;
    var ctx = cvs.getContext('2d');

    var status = (statusData && statusData.status) || 'available';
    var tintHex = intToHex(statusColor(status));

    // background
    ctx.clearRect(0, 0, SIGN_PX_W, SIGN_PX_H);
    ctx.fillStyle = 'rgba(4, 10, 22, 0.88)';
    ctx.roundRect ? ctx.roundRect(2, 2, SIGN_PX_W - 4, SIGN_PX_H - 4, 10) : ctx.rect(2, 2, SIGN_PX_W - 4, SIGN_PX_H - 4);
    ctx.fill();

    // border
    ctx.strokeStyle = tintHex;
    ctx.lineWidth = 2;
    ctx.stroke();

    // icon + name
    ctx.font = 'bold 22px "Orbitron", monospace';
    ctx.fillStyle = tintHex;
    ctx.textAlign = 'center';
    ctx.fillText('◈  ' + (plot.name || plot.id).toUpperCase(), SIGN_PX_W / 2, 36);

    // status line
    ctx.font = '16px "Share Tech Mono", monospace';
    ctx.fillStyle = '#c8d8f0';

    var line2 = '';
    if (status === 'available') {
      line2 = 'FOR RENT $' + (plot.rentPrice || '?') + '/mo    FOR SALE $' + (plot.buyPrice || '?');
    } else if (status === 'rented') {
      var expiry = statusData.expiresAt ? '  · expires ' + statusData.expiresAt.slice(0, 10) : '';
      line2 = 'RENTED by ' + (statusData.owner || '?') + expiry;
    } else if (status === 'sold') {
      line2 = 'SOLD · ' + (statusData.owner || '?');
    } else {
      line2 = status.toUpperCase();
    }
    ctx.fillText(line2, SIGN_PX_W / 2, 68);

    // agent credit
    if (plot.agentCode) {
      ctx.font = '11px "Share Tech Mono", monospace';
      ctx.fillStyle = 'rgba(120,160,220,0.65)';
      ctx.fillText('⬡ ' + plot.agentCode + ' SECTOR  ·  /api/portal-plots/' + plot.id, SIGN_PX_W / 2, 100);
    }

    return cvs;
  }

  // ── build one plot in the scene ──────────────────────────────────────────
  function buildOnePlot(THREE, scene, plotDef, statusData) {
    var px  = plotDef.pos[0];
    var pz  = plotDef.pos[1];
    var gy  = groundAt(px, pz);

    var status   = (statusData && statusData.status) || 'available';
    var baseCol  = new THREE.Color(statusColor(status));
    var plotCol  = new THREE.Color(plotDef.color || 0x34e5b0);  // registry tint (changes on refresh)

    var grp = new THREE.Group();
    grp.position.set(px, gy, pz);

    // face inward toward world center — same formula as world-spawn.js
    grp.rotation.y = Math.atan2(-px, -pz);
    scene.add(grp);

    // ── Materials ──────────────────────────────────────────────────────────
    var pilMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.80, toneMapped: false,
    });
    var pilGlowMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    var linMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.80, toneMapped: false,
    });
    var fieldMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    });
    var fieldGlowMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    });
    var discMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    });
    var padMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });

    // ── Pillars ───────────────────────────────────────────────────────────
    var pilGeo     = new THREE.CylinderGeometry(PIL_R, PIL_R * 1.18, PIL_H, 10, 1);
    var pilGlowGeo = new THREE.CylinderGeometry(PIL_R + 0.40, PIL_R * 1.18 + 0.40, PIL_H, 10, 1);
    var pilX       = ARCH_W / 2 + PIL_R;

    var pilL = new THREE.Mesh(pilGeo, pilMat);
    pilL.position.set(-pilX, PIL_H / 2, 0);
    grp.add(pilL);
    var pilLGlow = new THREE.Mesh(pilGlowGeo, pilGlowMat);
    pilLGlow.position.copy(pilL.position);
    grp.add(pilLGlow);

    var pilR = new THREE.Mesh(pilGeo, pilMat);
    pilR.position.set(pilX, PIL_H / 2, 0);
    grp.add(pilR);
    var pilRGlow = new THREE.Mesh(pilGlowGeo, pilGlowMat);
    pilRGlow.position.copy(pilR.position);
    grp.add(pilRGlow);

    // ── Lintel ────────────────────────────────────────────────────────────
    var lintel = new THREE.Mesh(
      new THREE.BoxGeometry(LIN_W, LIN_H, PIL_R * 2 + 0.25),
      linMat
    );
    lintel.position.set(0, PIL_H + LIN_H / 2, 0);
    grp.add(lintel);
    var lintelGlow = new THREE.Mesh(
      new THREE.BoxGeometry(LIN_W + 0.8, LIN_H + 0.7, PIL_R * 2 + 0.8),
      pilGlowMat
    );
    lintelGlow.position.copy(lintel.position);
    grp.add(lintelGlow);

    // ── Energy field ──────────────────────────────────────────────────────
    var field = new THREE.Mesh(
      new THREE.PlaneGeometry(ARCH_W, ARCH_H),
      fieldMat
    );
    field.position.set(0, ARCH_H / 2, 0);
    grp.add(field);
    var fieldGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(ARCH_W + 1.2, ARCH_H + 0.8),
      fieldGlowMat
    );
    fieldGlow.position.copy(field.position);
    grp.add(fieldGlow);

    // ── Floor disc ────────────────────────────────────────────────────────
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(DISC_R, 52),
      discMat
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    grp.add(disc);

    // ── Floating platform pad ─────────────────────────────────────────────
    // A slightly translucent rectangular pad — the "real estate plot" itself.
    // Sits just at or slightly above ground so it's visible as distinct from the terrain.
    var pad = new THREE.Mesh(
      new THREE.BoxGeometry(PAD_W, PAD_H, PAD_D),
      padMat
    );
    pad.position.set(0, PAD_Y, PAD_D / 2 - 3);    // centred behind arch, slight Z offset
    grp.add(pad);

    // Pad edge glow (additive, same colour)
    var padEdgeMat = new THREE.MeshBasicMaterial({
      color: baseCol.clone(), transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      wireframe: true,
    });
    var padEdge = new THREE.Mesh(
      new THREE.BoxGeometry(PAD_W + 0.4, PAD_H + 0.2, PAD_D + 0.4),
      padEdgeMat
    );
    padEdge.position.copy(pad.position);
    grp.add(padEdge);

    // ── Point light ───────────────────────────────────────────────────────
    var light = new THREE.PointLight(baseCol, 1.8, 55);
    light.position.y = 6;
    grp.add(light);

    // ── Canvas sign sprite ────────────────────────────────────────────────
    var signCanvas  = buildSignCanvas(plotDef, statusData);
    var signTex     = new THREE.CanvasTexture(signCanvas);
    var signMat     = new THREE.SpriteMaterial({
      map:        signTex,
      transparent: true,
      depthWrite:  false,
      toneMapped:  false,
    });
    var signSprite  = new THREE.Sprite(signMat);
    signSprite.scale.set(SIGN_WORLD_W, SIGN_WORLD_H, 1);
    // Float above the lintel
    signSprite.position.set(0, PIL_H + LIN_H + SIGN_WORLD_H / 2 + 1.2, 0);
    grp.add(signSprite);

    // ── Return live object ─────────────────────────────────────────────────
    return {
      id:          plotDef.id,
      group:       grp,
      signSprite:  signSprite,
      signMat:     signMat,
      signTex:     signTex,
      statusData:  statusData || { status: 'available' },
      plotDef:     plotDef,
      // material refs for update()
      pilMat:      pilMat,
      pilGlowMat:  pilGlowMat,
      linMat:      linMat,
      fieldMat:    fieldMat,
      fieldGlowMat:fieldGlowMat,
      discMat:     discMat,
      padMat:      padMat,
      light:       light,
      // per-plot animation phase (stagger so multiple plots don't pulse in lockstep)
      phase:       0,       // set by factory after all plots are created
    };
  }

  // ── refresh sign after status changes ────────────────────────────────────
  function refreshSign(plotObj) {
    var cvs = buildSignCanvas(plotObj.plotDef, plotObj.statusData);
    plotObj.signTex.image   = cvs;
    plotObj.signTex.needsUpdate = true;

    // Re-tint all materials to match new status
    var newCol = new THREE.Color(statusColor(plotObj.statusData.status || 'available'));
    plotObj.pilMat.color.copy(newCol);
    plotObj.pilGlowMat.color.copy(newCol);
    plotObj.linMat.color.copy(newCol);
    plotObj.fieldMat.color.copy(newCol);
    plotObj.fieldGlowMat.color.copy(newCol);
    plotObj.discMat.color.copy(newCol);
    plotObj.padMat.color.copy(newCol);
    plotObj.light.color.copy(newCol);
  }

  // ── factory ───────────────────────────────────────────────────────────────
  global.buildPortalPlots = function buildPortalPlots(opts) {
    var THREE    = opts.THREE;
    var scene    = opts.scene;
    var registry = opts.registry || global.PORTALS_REGISTRY;

    if (!THREE || !scene) {
      console.warn('portal-plots: THREE and scene are required.');
      return null;
    }

    var plotDefs = (registry && registry.plots) ? registry.plots : [];
    if (!plotDefs.length) {
      console.log('portal-plots: no plots in registry.');
    }

    // We'll populate this after the initial status fetch
    var livePlots = [];
    var _fetching = false;

    // ── fetch status from backend then build / refresh ─────────────────────
    function fetchAndBuild() {
      if (_fetching) return;
      _fetching = true;

      var url = '/api/portal-plots';
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          _fetching = false;
          var statusMap = {};     // id → plot status object
          if (data && data.plots) {
            Object.keys(data.plots).forEach(function (id) {
              statusMap[id] = data.plots[id];
            });
          }

          // First call: build 3D objects; subsequent calls: refresh signs
          if (livePlots.length === 0) {
            plotDefs.forEach(function (def, i) {
              var sd = statusMap[def.id] || null;
              var obj = buildOnePlot(THREE, scene, def, sd);
              obj.phase = (i / Math.max(plotDefs.length, 1)) * Math.PI * 2;
              livePlots.push(obj);
            });
          } else {
            livePlots.forEach(function (obj) {
              var sd = statusMap[obj.id] || null;
              if (sd) {
                obj.statusData = sd;
                refreshSign(obj);
              }
            });
          }
        })
        .catch(function (err) {
          _fetching = false;
          console.warn('portal-plots: could not reach /api/portal-plots —', err && err.message);
          // Build with default 'available' state so geometry still appears
          if (livePlots.length === 0) {
            plotDefs.forEach(function (def, i) {
              var obj = buildOnePlot(THREE, scene, def, { status: 'available' });
              obj.phase = (i / Math.max(plotDefs.length, 1)) * Math.PI * 2;
              livePlots.push(obj);
            });
          }
        });
    }

    // kick off the initial fetch + build
    fetchAndBuild();

    // ── update(dt, t) — per-frame animations, zero allocations ───────────
    function update(dt, t) {
      for (var i = 0; i < livePlots.length; i++) {
        var m   = livePlots[i];
        var phi = t * 1.1 + m.phase;

        // Breath pulse
        var pulse   = 0.68 + 0.32 * Math.sin(phi);
        // Shimmer for energy field
        var shimmer = 0.24 + 0.10 * Math.sin(phi * 2.0 + 0.5) + 0.06 * Math.sin(phi * 3.5);

        m.fieldMat.opacity      = shimmer;
        m.fieldGlowMat.opacity  = 0.08 + 0.05 * Math.sin(phi * 0.75 + 1.1);
        m.pilMat.opacity        = 0.68 + 0.12 * pulse;
        m.pilGlowMat.opacity    = 0.13 + 0.07 * Math.sin(phi * 1.05);
        m.linMat.opacity        = 0.68 + 0.12 * pulse;
        m.discMat.opacity       = pulse * 0.17;
        m.padMat.opacity        = 0.15 + 0.07 * Math.sin(phi * 0.6);
        m.light.intensity       = 1.4 + 0.80 * Math.sin(phi * 1.1);

        // Gentle floating motion for the sign sprite (no allocation — just mutates .y)
        m.signSprite.position.y += Math.sin(t * 0.8 + m.phase) * 0.002;   // tiny drift
        // clamp sign Y so it doesn't drift too far
        var baseSignY = PIL_H + LIN_H + SIGN_WORLD_H / 2 + 1.2;
        if (m.signSprite.position.y < baseSignY - 0.3) m.signSprite.position.y = baseSignY - 0.3;
        if (m.signSprite.position.y > baseSignY + 0.3) m.signSprite.position.y = baseSignY + 0.3;
      }
    }

    // ── public API ─────────────────────────────────────────────────────────
    return {
      /** Per-frame call. Add after worldSpawn.update(dt, t) in animate(). */
      update:  update,

      /** Re-fetch backend status and update all signs + tints. */
      refresh: function () { fetchAndBuild(); },

      /** Live array of rendered plot objects. */
      plots:   livePlots,
    };
  };

}(window));
