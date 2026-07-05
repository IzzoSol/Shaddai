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

  /* Buildings are NO LONGER solid. Design change (owner): remove the collider
   * "force field" entirely — the player walks freely up to, under, and through the
   * building footprints. Buildings sit elevated (on pillars) and you go INSIDE via
   * the elevator, not by bumping a wall. Set this true to restore solid walls. */
  var BUILDINGS_SOLID = false;

  /* ── Builder ────────────────────────────────────────────────────────────── */
  function buildWorldCollision(layout) {
    _colliders = [];
    _built     = false;

    if (!layout) {
      console.warn('[world-collision] No layout provided — collisions disabled.');
      return null;
    }

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
      if (c.box) {
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
      if (c.box) {
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

  /* ── Expose globals ─────────────────────────────────────────────────────── */
  global.buildWorldCollision   = buildWorldCollision;
  global.setBuildingFootprints = setBuildingFootprints;
  global.WORLD_COLLIDES        = WORLD_COLLIDES;
  global.WORLD_RESOLVE         = WORLD_RESOLVE;
  global.WORLD_RESOLVE_POS     = WORLD_RESOLVE_POS;

  /* ── Auto-run on load if WORLD_LAYOUT is already present ───────────────── */
  if (global.WORLD_LAYOUT) {
    buildWorldCollision(global.WORLD_LAYOUT);
  }

}(typeof window !== 'undefined' ? window : this));
