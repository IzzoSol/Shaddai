/**
 * world-collision.js  —  SHADDAI World 3D
 * NEXUS | SOLID building colliders (footprint-accurate, XZ plane)
 *
 * SINGLE SOURCE OF TRUTH for outdoor building collision.
 * Positions are read LIVE from window.WORLD_LAYOUT.sectors, so if another agent
 * repositions a building the colliders follow it automatically. Sizes come from a
 * per-building-type FOOTPRINT table that matches the REAL mesh walls (not a loose
 * perimeter) — you get blocked exactly at the visible wall, never before it and
 * never through it.
 *
 * Buildings are FULLY SOLID. There is NO door gap / walk-in arc: going inside is a
 * cutscene teleport (handled by the interiors system), NOT walking through geometry.
 *
 * Globals exposed:
 *   window.buildWorldCollision(layout)     → rebuild colliders (auto-runs on load)
 *   window.WORLD_COLLIDES(x, z)            → boolean (is this point inside a wall?)
 *   window.WORLD_RESOLVE(fx, fz, tx, tz)   → [x, z]  (slide resolver, returns coords)
 *   window.WORLD_RESOLVE_POS(pos)          → pos     (mutates pos.x / pos.z IN PLACE)
 *
 * OWNER HOOK (recommended — makes this the single collision source):
 *   In SHADDAI-WORLD-3D.html the main loop currently calls the inline
 *   `_resolveBuildingCollision();` (~line 1855). Replace that one line with:
 *        window.WORLD_RESOLVE_POS(playerPos);
 *   WORLD_RESOLVE_POS reproduces the shape-aware box/circle push AND still applies
 *   window.__hubColliders (the central bazaar stalls), so nothing is lost. If you
 *   leave the HTML as-is, the inline resolver keeps working — no regression — but
 *   building sizes then live in two places (`_BLDG_R` in the HTML and here).
 *
 * No Three.js dependency. Hot-path: zero list allocations per call.
 */

(function (global) {
  'use strict';

  /* ── REAL BUILDING FOOTPRINTS ────────────────────────────────────────────
   * Half-extents that hug the ACTUAL facade of each building mesh (world units).
   * These mirror the tuned mesh walls in SHADDAI-WORLD-3D.html (`_BLDG_R`) so the
   * collider sits exactly on the wall you can see — tight, no invisible forcefield.
   *   shape:'box'    → axis-aligned box, half-extent hx / hz (square unless noted)
   *   shape:'circle' → radius r (round buildings: NEXUS dome, ORACLE spires)
   * SHADDAI is intentionally ABSENT: the center is now the open community forum
   * (temple moved to the sky observatory), so there is no collider there.
   */
  var FOOTPRINTS = {
    NEXUS   : { shape: 'circle', r: 88 },        // The Navigator — round dome (was 63, too small → walk-in)
    ORACLE  : { shape: 'circle', r: 88 },        // The Esoteric Wing — round spires (was 62)
    QUILL   : { shape: 'box', hx: 118, hz: 118 },// The Library — enlarged 1.5×, big walls (correct)
    PIKADON : { shape: 'box', hx: 92,  hz: 92 }, // The Aegis fortress (was 65)
    TURTLE  : { shape: 'box', hx: 90,  hz: 90 }, // The Museum gallery (was 63)
    ZEROX   : { shape: 'box', hx: 92,  hz: 92 }  // The Markets exchange (was 65)
  };
  var DEFAULT_BOX = 50;   // fallback half-extent for an unknown building type
  var PLAYER_BUF  = 1.2;  // stop the player just outside the wall (tighter — lets you get right up to the building; was 2.5 which felt like a force field)

  /* ── MEASURED FOOTPRINTS (real geometry) ─────────────────────────────────
   * When SHADDAI-WORLD-3D.html finishes building the world it measures each
   * building's ACTUAL solid massing from the scene meshes (THREE is only
   * available in that module) and hands the result here via
   *   window.setBuildingFootprints({ CODE: {...}, ... })
   * then re-runs window.buildWorldCollision(WORLD_LAYOUT). Each entry is either
   *   { shape:'box',    minX, maxX, minZ, maxZ }   ← tight world-space AABB of the walls
   *   { shape:'circle', cx, cz, r }                ← round buildings (NEXUS dome, ORACLE spires)
   * These REPLACE the FOOTPRINTS guesses below (which stay only as a fallback
   * for the brief window before the measure pass runs). This is what removes the
   * "barrier": the collider becomes the building's real silhouette — solid at the
   * walls, open in the approach/plaza — instead of an oversized box/circle.
   */
  var _measured = null;
  function setBuildingFootprints(map) {
    _measured = (map && typeof map === 'object') ? map : null;
    return _measured;
  }

  /* ── Internal state (precomputed once, reused every frame) ─────────────── */
  var _colliders = [];    // box:   { box:true,  cx, cz, hx, hz }
                          // circle:{ box:false, cx, cz, r, r2 }
  var _built     = false;

  /* Buildings stay WALK-THROUGH at ground level. Owner directive (2026-07-09):
   * "the buildings stay walkable 1000%." The agent buildings are lifted 46u onto
   * pillars with an OPEN, freely-walkable themed LOUNGE underneath at ground level —
   * making the footprint solid (measured from the ground band) walls those lounges
   * off, which the owner explicitly does NOT want. So building colliders are OFF;
   * the player walks freely through/under every pavilion. Interiors are still entered
   * via the [E] cutscene / [R] elevator. Falling off elevated decks is handled
   * separately by the anti-fall edge clamp in SHADDAI-WORLD-3D.html (still active).
   * If specific buildings need solid walls later, add them per-building, not blanket. */
  var BUILDINGS_SOLID = false;

  /* ── Builder ────────────────────────────────────────────────────────────── */
  function buildWorldCollision(layout) {
    _colliders = [];
    _built     = false;

    if (!layout) {
      console.warn('[world-collision] No layout provided — collisions disabled.');
      return null;
    }

    // ── REALM COLLIDERS (collider law, 2026-09-23): solid circles for the placed realm
    // models, from layout.realmColliders (single source of truth in world-layout.js).
    // Registered BEFORE the BUILDINGS_SOLID early-return so they apply in BOTH modes —
    // the stations keep their pillar/elevator design, but realm structures are solid.
    var _rc = (layout.realmColliders && Array.isArray(layout.realmColliders)) ? layout.realmColliders : [];
    for (var _rk = 0; _rk < _rc.length; _rk++) {
      var _r = _rc[_rk];
      if (_r && isFinite(_r.x) && isFinite(_r.z) && _r.hx > 0 && _r.hz > 0) {   // ROTATED BOX (canon city blocks, 2026-09-26)
        var _rot = _r.rot || 0;
        _colliders.push({ box: true, obb: true, cx: _r.x, cz: _r.z, hx: _r.hx + PLAYER_BUF, hz: _r.hz + PLAYER_BUF, c: Math.cos(_rot), s: Math.sin(_rot), label: _r.label || 'obb' });
        continue;
      }
      if (!_r || !isFinite(_r.x) || !isFinite(_r.z) || !(_r.r > 0)) continue;
      var rr = _r.r + PLAYER_BUF;
      _colliders.push({ box: false, cx: _r.x, cz: _r.z, r: rr, r2: rr * rr, label: _r.label || 'realm' });
    }
    console.log('[world-collision] Built ' + _rc.length + ' REALM colliders (solid realm structures).');

    if (!BUILDINGS_SOLID) {
      // No building colliders. __hubColliders (bazaar stalls) still apply via _pushOut.
      _built = true;
      console.log('[world-collision] Building colliders DISABLED — free movement (buildings on pillars, enter via elevator).');
      return { colliders: _colliders };
    }

    var sectors = (layout.sectors && Array.isArray(layout.sectors)) ? layout.sectors : [];

    var usedMeasured = 0;

    sectors.forEach(function (s) {
      if (!s || !s.pos) return;
      var code = s.code || '';
      if (code === 'SHADDAI') return;             // center = open forum, no collider

      var cx = s.pos[0], cz = s.pos[1];

      /* 1) PREFER the real measured footprint (tight AABB / circle from actual geometry). */
      var m = _measured && _measured[code];
      if (m) {
        if (m.shape === 'circle' && isFinite(m.r) && m.r > 0) {
          var mr = m.r + PLAYER_BUF;
          var mcx = isFinite(m.cx) ? m.cx : cx, mcz = isFinite(m.cz) ? m.cz : cz;
          _colliders.push({ box: false, cx: mcx, cz: mcz, r: mr, r2: mr * mr, label: code });
          usedMeasured++;
          return;
        }
        if (m.shape === 'box' && isFinite(m.minX) && isFinite(m.maxX) && isFinite(m.minZ) && isFinite(m.maxZ)) {
          var bcx = (m.minX + m.maxX) * 0.5, bcz = (m.minZ + m.maxZ) * 0.5;
          var bhx = (m.maxX - m.minX) * 0.5 + PLAYER_BUF;
          var bhz = (m.maxZ - m.minZ) * 0.5 + PLAYER_BUF;
          _colliders.push({ box: true, cx: bcx, cz: bcz, hx: bhx, hz: bhz, label: code });
          usedMeasured++;
          return;
        }
      }

      /* 2) Fallback (only until the measure pass runs): guessed FOOTPRINT table. */
      var fp = FOOTPRINTS[code];
      if (fp && fp.shape === 'circle') {
        var r = (s.collideRadius != null) ? s.collideRadius : fp.r;
        r += PLAYER_BUF;
        _colliders.push({ box: false, cx: cx, cz: cz, r: r, r2: r * r, label: code });
      } else {
        var hx = (fp && fp.hx != null) ? fp.hx : DEFAULT_BOX;
        var hz = (fp && fp.hz != null) ? fp.hz : hx;
        if (s.collideRadius != null) { hx = hz = s.collideRadius; }
        hx += PLAYER_BUF; hz += PLAYER_BUF;
        _colliders.push({ box: true, cx: cx, cz: cz, hx: hx, hz: hz, label: code });
      }
    });

    _built = true;
    console.log('[world-collision] Built ' + _colliders.length + ' SOLID colliders from WORLD_LAYOUT ('
      + usedMeasured + ' from measured real geometry, ' + (_colliders.length - usedMeasured) + ' from fallback table).');
    return { colliders: _colliders };
  }

  /* ── Point-in-building test (fully solid — no door gap) ─────────────────── */
  function WORLD_COLLIDES(x, z) {
    if (!_built) return false;
    for (var i = 0; i < _colliders.length; i++) {
      var c = _colliders[i];
      var dx = x - c.cx, dz = z - c.cz;
      if (c.obb) {
        if (Math.abs(dx * c.c - dz * c.s) < c.hx && Math.abs(dx * c.s + dz * c.c) < c.hz) return true;
      } else if (c.box) {
        if (Math.abs(dx) < c.hx && Math.abs(dz) < c.hz) return true;
      } else {
        if (dx * dx + dz * dz < c.r2) return true;
      }
    }
    return false;
  }

  /* ── In-place resolver (mutates pos.x / pos.z) ──────────────────────────────
   * For each collider the player is inside of, push straight OUT to the nearest
   * wall — boxes along the axis of LEAST penetration (a clean slide along the wall,
   * corner-correct, no jitter), circles radially. Also applies window.__hubColliders
   * (central bazaar stalls / fountain) so those stay solid too. This is the exact
   * behaviour the HTML inline resolver had, kept here as the single source.
   */
  function _pushOut(pos) {
    for (var i = 0; i < _colliders.length; i++) {
      var c = _colliders[i];
      var dx = pos.x - c.cx, dz = pos.z - c.cz;
      if (c.obb) {   // rotated box: into local frame (rot about +Y: local x = (c, -s), local z = (s, c) in x/z), push out, back
        var lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) {
          if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) lx = lx < 0 ? -c.hx - 0.01 : c.hx + 0.01; else lz = lz < 0 ? -c.hz - 0.01 : c.hz + 0.01;   // +0.01: float round-trip must land OUTSIDE
          pos.x = c.cx + lx * c.c + lz * c.s; pos.z = c.cz - lx * c.s + lz * c.c;
        }
      } else if (c.box) {
        if (Math.abs(dx) < c.hx && Math.abs(dz) < c.hz) {
          var penX = c.hx - Math.abs(dx);
          var penZ = c.hz - Math.abs(dz);
          if (penX < penZ) pos.x = c.cx + (dx < 0 ? -c.hx : c.hx);
          else             pos.z = c.cz + (dz < 0 ? -c.hz : c.hz);
        }
      } else {
        var d2 = dx * dx + dz * dz;
        if (d2 < c.r2) {
          var d = Math.sqrt(d2) || 0.0001;
          pos.x = c.cx + (dx / d) * c.r;
          pos.z = c.cz + (dz / d) * c.r;
        }
      }
    }

    // Central bazaar stalls + fountain — solid circles set at runtime by the bazaar builder.
    var hc = global.__hubColliders;
    if (hc) {
      for (var j = 0; j < hc.length; j++) {
        var h = hc[j];
        var hdx = pos.x - h.cx, hdz = pos.z - h.cz;
        var hd2 = hdx * hdx + hdz * hdz;
        if (hd2 < h.r * h.r) {
          var hd = Math.sqrt(hd2) || 0.0001;
          pos.x = h.cx + (hdx / hd) * h.r;
          pos.z = h.cz + (hdz / hd) * h.r;
        }
      }
    }
    return pos;
  }

  function WORLD_RESOLVE_POS(pos) {
    if (!_built || !pos) return pos;
    return _pushOut(pos);
  }

  /* ── Coord-returning slide resolver (backward-compatible) ──────────────────
   * from→to move: if `to` lands in a wall, push it out; returns a reused [x,z].
   */
  var _tmp = { x: 0, z: 0 };
  var _resultArr = [0, 0];

  function WORLD_RESOLVE(fromX, fromZ, toX, toZ) {
    if (!_built) { _resultArr[0] = toX; _resultArr[1] = toZ; return _resultArr; }
    _tmp.x = toX; _tmp.z = toZ;
    _pushOut(_tmp);
    _resultArr[0] = _tmp.x;
    _resultArr[1] = _tmp.z;
    return _resultArr;
  }

  /* ── WALKABLE BRIDGE CORRIDORS (fixes the "invisible line on the mini-bridges") ──
   * Owner bug (2026-07-19): "the top ceiling level is closed off — you can't walk on the
   * mini bridges to each agent station, there's a line there that stops you", "stuck getting
   * on the bridge the other way as well."
   *
   * ROOT CAUSE (diagnosed, lives in OTHER files): the ANTI-FALL EDGE CLAMP in
   * SHADDAI-WORLD-3D.html (~L3937) only treats a spot as walkable-elevated-floor when
   * _elevators.groundY() returns a height. groundY() recognizes ONLY the circular arrival
   * DECKS (deckList, radius 8.5) in world-elevators.js — the skybridges connecting the Sky
   * Nexus deck to each agent station are visual meshes that are NEVER registered as floor.
   * So the instant the player steps off a deck onto a bridge, groundY() → null while
   * _lastDeckY !== null, and the clamp REVERTS the move. The bridge rim behaves like a wall
   * in BOTH directions. There is no collider in this file causing it — building colliders are
   * OFF (BUILDINGS_SOLID=false) — the block is purely the missing floor + the fall guard.
   *
   * THE WALKABLE-CARVEOUT (this file provides the mechanism; wiring is one line in each of the
   * other two files — see the summary): register each bridge as an oriented rectangular
   * corridor (segment from the deck to the station, with a half-width). WORLD_BRIDGE_GROUNDY(x,z)
   * then returns the bridge's floor height when the player is over a span (interpolated end→end),
   * or null otherwise. The anti-fall clamp / elevators groundY() can consult this so the bridge
   * spans read as solid walkable floor — passable both ways — WITHOUT widening any deck, without
   * disabling collision, and without letting the player off the bridge sides (outside the
   * half-width it still returns null, so the fall guard keeps them from walking off into air).
   */
  var _bridges = [];   // { ax, az, ay, bx, bz, by, hw, hw2, len2 }

  function clearWorldBridges() { _bridges = []; return _bridges; }

  // Register one bridge span from A(ax,az,ay) to B(bx,bz,by), walkable within `halfWidth`.
  function addWorldBridge(ax, az, ay, bx, bz, by, halfWidth) {
    var hw = (isFinite(halfWidth) && halfWidth > 0) ? halfWidth : 3.5;
    var dx = bx - ax, dz = bz - az;
    var len2 = dx * dx + dz * dz;
    _bridges.push({
      ax: ax, az: az, ay: (isFinite(ay) ? ay : 0),
      bx: bx, bz: bz, by: (isFinite(by) ? by : (isFinite(ay) ? ay : 0)),
      hw: hw, hw2: hw * hw, len2: (len2 > 0 ? len2 : 1e-6)
    });
    return _bridges[_bridges.length - 1];
  }

  // Is (x,z) over a bridge corridor? Returns the (interpolated) walkable floor height there,
  // or null if not over any bridge span. Zero allocation. `tolY` (optional): if the caller
  // passes the player's current Y, only match bridges whose deck height is within tolY (so a
  // bridge far below/above doesn't grab a grounded player); omit to ignore height.
  function WORLD_BRIDGE_GROUNDY(x, z, py, tolY) {
    for (var i = 0; i < _bridges.length; i++) {
      var b = _bridges[i];
      // Project point onto the segment A→B, clamped to [0,1].
      var t = ((x - b.ax) * (b.bx - b.ax) + (z - b.az) * (b.bz - b.az)) / b.len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var px = b.ax + (b.bx - b.ax) * t;
      var pz = b.az + (b.bz - b.az) * t;
      var ddx = x - px, ddz = z - pz;
      if (ddx * ddx + ddz * ddz <= b.hw2) {
        var y = b.ay + (b.by - b.ay) * t;      // walkable floor height at this point along the span
        if (py != null && isFinite(tolY) && Math.abs(py - y) > tolY) continue;
        return y;
      }
    }
    return null;
  }

  /* ── Expose globals ─────────────────────────────────────────────────────── */
  global.buildWorldCollision   = buildWorldCollision;
  global.setBuildingFootprints = setBuildingFootprints;
  global.WORLD_COLLIDES        = WORLD_COLLIDES;
  global.WORLD_RESOLVE         = WORLD_RESOLVE;
  global.WORLD_RESOLVE_POS     = WORLD_RESOLVE_POS;
  global.addWorldBridge        = addWorldBridge;
  global.clearWorldBridges     = clearWorldBridges;
  global.WORLD_BRIDGE_GROUNDY  = WORLD_BRIDGE_GROUNDY;

  /* ── Auto-run on load if WORLD_LAYOUT is already present ───────────────── */
  if (global.WORLD_LAYOUT) {
    buildWorldCollision(global.WORLD_LAYOUT);
  }

}(typeof window !== 'undefined' ? window : this));
