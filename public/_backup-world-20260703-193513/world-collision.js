/**
 * world-collision.js  —  SHADDAI World 3D
 * NEXUS | Solid-building colliders (circle model, XZ plane)
 *
 * Globals exposed:
 *   window.buildWorldCollision(layout) → collider  (also auto-runs on load)
 *   window.WORLD_COLLIDES(x, z)        → boolean
 *   window.WORLD_RESOLVE(fx, fz, tx, tz) → [x, z]
 *
 * No Three.js dependency.  Hot-path: zero list allocations per call.
 */

(function (global) {
  'use strict';

  /* ── Default radii ─────────────────────────────────────────────────────── */
  var DEFAULT_RADII = {
    SHADDAI  : 40,   // hug the building tighter so you can walk right up to the door (was 52 = felt like a barrier)
    ZEROX    : 30,
    ORACLE   : 30,
    NEXUS    : 30,
    TURTLE   : 30,
    QUILL    : 30,
    PIKADON  : 30,
    bazaar   : 26    // landmark key, not a sector code
  };

  /* ── Internal state (precomputed, reused every frame) ───────────────────── */
  var _colliders = [];   // [{cx, cz, r2}]  — cx/cz = center, r2 = radius²
  var _radii     = {};   // code/id → effective radius (for debug)
  var _built     = false;

  /* ── Builder ────────────────────────────────────────────────────────────── */
  function buildWorldCollision(layout) {
    _colliders = [];
    _radii     = {};
    _built     = false;

    if (!layout) {
      console.warn('[world-collision] No layout provided — collisions disabled.');
      return null;
    }

    /* Sectors (7 agent buildings incl. SHADDAI) */
    var sectors = (layout.sectors && Array.isArray(layout.sectors))
      ? layout.sectors : [];

    // door direction = from the building toward world-center (the door faces the plaza).
    // SHADDAI sits at [0,0] so its door faces +Z (south, where the player approaches).
    function doorDir(x, z) {
      var l = Math.hypot(x, z);
      if (l < 0.001) return [0, 1];
      return [-x / l, -z / l];
    }

    sectors.forEach(function (s) {
      if (!s || !s.pos) return;
      var code = s.code || '';
      var r = (s.collideRadius != null)
        ? s.collideRadius
        : (DEFAULT_RADII[code] != null ? DEFAULT_RADII[code] : 24);
      var dd = doorDir(s.pos[0], s.pos[1]);
      _colliders.push({ cx: s.pos[0], cz: s.pos[1], r: r, r2: r * r, dnx: dd[0], dnz: dd[1], label: code });
      _radii[code] = r;
    });

    /* Bazaar landmark */
    var bazaar = (typeof layout.landmark === 'function')
      ? layout.landmark('bazaar')
      : null;

    if (!bazaar) {
      /* Fallback: scan layout.landmarks array */
      var lms = layout.landmarks;
      if (lms && Array.isArray(lms)) {
        for (var i = 0; i < lms.length; i++) {
          if (lms[i] && lms[i].id === 'bazaar') { bazaar = lms[i]; break; }
        }
      }
    }

    if (bazaar && bazaar.pos) {
      var br = (bazaar.collideRadius != null)
        ? bazaar.collideRadius
        : DEFAULT_RADII.bazaar;
      var bdd = doorDir(bazaar.pos[0], bazaar.pos[1]);
      _colliders.push({ cx: bazaar.pos[0], cz: bazaar.pos[1], r: br, r2: br * br, dnx: bdd[0], dnz: bdd[1], label: 'bazaar' });
      _radii['bazaar'] = br;
    }

    _built = true;
    console.log('[world-collision] Built ' + _colliders.length + ' colliders:', _radii);
    return { colliders: _colliders };
  }

  /* ── Point-in-building test ─────────────────────────────────────────────── */
  function WORLD_COLLIDES(x, z) {
    if (!_built) return false;
    var n = _colliders.length;
    for (var i = 0; i < n; i++) {
      var c = _colliders[i];
      var dx = x - c.cx;
      var dz = z - c.cz;
      var d2 = dx * dx + dz * dz;
      if (d2 < c.r2) {
        // DOOR GAP: if the point is on the door side (aligned with the door direction, which faces
        // world-center), let the player pass — so you can walk up to / into the doorway freely
        // instead of hitting an invisible wall. Solid on all other sides.
        var d = Math.sqrt(d2) || 1;
        var dot = (dx * (c.dnx || 0) + dz * (c.dnz || 0)) / d;
        if (dot > 0.62) continue;   // within ~±52° of the door direction → open
        return true;
      }
    }
    return false;
  }

  /* ── Slide resolver ─────────────────────────────────────────────────────── */
  /*
   * Slide algorithm: if the straight move (from→to) enters a collider,
   * try X-only then Z-only; take the first free one. If both blocked, stay put.
   */
  var _resultArr = [0, 0];   // reused — avoids GC pressure

  function WORLD_RESOLVE(fromX, fromZ, toX, toZ) {
    if (!_built) {
      _resultArr[0] = toX;
      _resultArr[1] = toZ;
      return _resultArr;
    }

    /* Direct move — fast path */
    if (!WORLD_COLLIDES(toX, toZ)) {
      _resultArr[0] = toX;
      _resultArr[1] = toZ;
      return _resultArr;
    }

    /* Try X-only slide */
    if (!WORLD_COLLIDES(toX, fromZ)) {
      _resultArr[0] = toX;
      _resultArr[1] = fromZ;
      return _resultArr;
    }

    /* Try Z-only slide */
    if (!WORLD_COLLIDES(fromX, toZ)) {
      _resultArr[0] = fromX;
      _resultArr[1] = toZ;
      return _resultArr;
    }

    /* Fully blocked — stay */
    _resultArr[0] = fromX;
    _resultArr[1] = fromZ;
    return _resultArr;
  }

  /* ── Expose globals ─────────────────────────────────────────────────────── */
  global.buildWorldCollision = buildWorldCollision;
  global.WORLD_COLLIDES      = WORLD_COLLIDES;
  global.WORLD_RESOLVE       = WORLD_RESOLVE;

  /* ── Auto-run on load if WORLD_LAYOUT is already present ───────────────── */
  if (global.WORLD_LAYOUT) {
    buildWorldCollision(global.WORLD_LAYOUT);
  }

}(typeof window !== 'undefined' ? window : this));
