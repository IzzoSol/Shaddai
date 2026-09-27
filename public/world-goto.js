/* world-goto.js — `?goto=<dashboard_id|marker name>` deep link into the world (city v3, 2026-09-27).
 *
 * The dashboard (public/city-dashboard.html) links each tile to
 *   SHADDAI-WORLD-3D.html?map=v4&goto=<dashboard_id>
 * (some links may use a marker `name` instead of a dashboard_id). This module resolves that id to a
 * city-v3 marker (public/world-city-v3.js `marker()`/`markers`, from markers-v4.json, schema markers@2)
 * and, once the player has actually entered the world (past the intro gate AND the sky-dive/spawn is
 * done — see the host's `_spawnBusy` flag), moves the player 3 m in front of the marker and turns them
 * to face it — the SAME move-only-x/z convention world-transit.js fast travel uses on arrival (host
 * keeps ownership of Y/height; it is re-derived from the terrain every frame regardless of how x/z moved).
 *
 * Collision: the 3 m approach point must not land inside a solid canon building. Rather than re-fetch
 * canon-colliders-v4.json (731 KB) a second time at runtime, this tries EIGHT compass bearings around the
 * marker (street level) and keeps the first one that is not inside a collider, using the exact rotated-box
 * test `public/world-collision.js` uses in `_pushOut`/`WORLD_COLLIDES` (obb: local x = dx*cos-dz*sin,
 * local z = dx*sin+dz*cos, inside if |local x| < hx && |local z| < hz). At runtime the check is
 * `window.WORLD_COLLIDES` (already the single source of truth — world-canon-v4.js pushes every canon box
 * into it well before this module runs in the __mapV4Ready chain). For pure/offline testing, pass
 * `opts.colliders` (an array of `{x, z, hx, hz, rot}` boxes, e.g. read straight from
 * canon-colliders-v4.json's `.obb` array) and that is used instead — no `window` required.
 *
 * Unknown target: toast (`window.__toast`, if present) "Couldn't find that place" and spawn normally
 * (the caller simply never calls apply(); every other URL param — overhead/room/terrain/peek/time/perf —
 * is untouched, this module only ever reads `goto` and only ever writes the player's x/z).
 *
 *   window.buildWorldGoto({ city, getPlayerHandle, isReady, onDone, colliders?, window? })
 *     city            — the world-city-v3 API (city.marker(id), city.markers[])
 *     getPlayerHandle — () => the mutable player position handle ({x,y,z}), e.g. window.__w3dDebug.playerPos
 *     isReady         — () => true once it is safe to move the player (intro gate passed, sky-dive over)
 *     onDone(found)   — called once resolution is settled: found===false when there was a `goto` id that
 *                       didn't match any marker; found===true right after apply() moves the player
 *     colliders       — optional; array of {x,z,hx,hz,rot} boxes (test/offline use — see above)
 *     window          — optional; defaults to the real `window` (for reading location.search / __toast)
 *   → { target, approach, resolve(), apply() }
 *     target   — the matched marker (or null once resolve() has run and found nothing / there was no id)
 *     approach — set by apply(): { x, z, bearing } (bearing: the direction, in world-collision's rotation
 *                convention — 0 = +Z, radians CW — from the marker to the spawn point; the avatar looks
 *                back at the marker when its look-yaw is set to this same `bearing` value)
 *     resolve()— parses `?goto=`, looks up the marker, sets `.target` (or toasts + finishes if unmatched)
 *     apply()  — once `.target` is set and isReady() is true, moves the player and returns true (a no-op,
 *                returning false, before that or if there is no target / already applied)
 */
(function (root) {
  var U = 7 / 1.8, APPROACH_M = 3;

  // 8 compass bearings (world-collision convention: bearing 0 = +Z, PI/2 = +X, etc. — see toXZ below),
  // tried in order until one lands clear of every solid box.
  var BEARINGS = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];

  function toXZ(markerPos, bearing, distU) {
    return { x: markerPos.x + Math.sin(bearing) * distU, z: markerPos.z + Math.cos(bearing) * distU };
  }

  // Same rotated-box ("obb") test as public/world-collision.js WORLD_COLLIDES/_pushOut.
  function pointInBox(x, z, b) {
    if (!b || !(b.hx > 0) || !(b.hz > 0)) return false;
    var dx = x - b.x, dz = z - b.z, rot = b.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
    var lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < b.hx && Math.abs(lz) < b.hz;
  }
  function pointClear(x, z, boxes, collides) {
    if (typeof collides === 'function') { try { return !collides(x, z); } catch (e) { return true; } }
    if (!boxes || !boxes.length) return true;
    for (var i = 0; i < boxes.length; i++) if (pointInBox(x, z, boxes[i])) return false;
    return true;
  }

  // 3 m in front of the marker (street level — y is left untouched; the host re-derives ground height
  // every frame regardless), clear of every solid box if any bearing manages it, else the first bearing.
  // Some markers sit inside a wide collider (e.g. a dragon-perch shaft) that no bearing clears at 3 m —
  // for those, back away further (6 m, then 12 m) before giving up, so "in front of" still means
  // "somewhere walkable near it" rather than inside the wall.
  var DIST_FALLBACKS_M = [1, 2, 4];   // multipliers tried in order against the requested distance
  function computeApproach(markerPos, boxes, collides, distM) {
    var base = (distM == null ? APPROACH_M : distM), i, j, d, p;
    for (j = 0; j < DIST_FALLBACKS_M.length; j++) {
      d = base * DIST_FALLBACKS_M[j] * U;
      for (i = 0; i < BEARINGS.length; i++) {
        p = toXZ(markerPos, BEARINGS[i], d);
        if (pointClear(p.x, p.z, boxes, collides)) return { x: p.x, z: p.z, bearing: BEARINGS[i] };
      }
    }
    p = toXZ(markerPos, BEARINGS[0], base * U);
    return { x: p.x, z: p.z, bearing: BEARINGS[0] };
  }

  // dashboard_id (exact, then case-insensitive) else marker name (case-insensitive).
  function findMarker(city, id) {
    if (!city || !id) return null;
    var list = (city.markers && city.markers.length) ? city.markers : null;
    if (!list) {
      if (city.marker) { var m0 = city.marker(id); if (m0) return m0; }
      return null;
    }
    var low = String(id).toLowerCase(), i, m;
    for (i = 0; i < list.length; i++) { m = list[i]; if (m && m.dashboard_id != null && String(m.dashboard_id) === id) return m; }
    for (i = 0; i < list.length; i++) { m = list[i]; if (m && m.dashboard_id != null && String(m.dashboard_id).toLowerCase() === low) return m; }
    for (i = 0; i < list.length; i++) { m = list[i]; if (m && m.name && String(m.name).toLowerCase() === low) return m; }
    return null;
  }

  function getGotoParam(win) {
    try {
      var loc = win && win.location;
      if (!loc || !loc.search) return null;
      var m = /[?&]goto=([^&]+)/.exec(loc.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
    } catch (e) { return null; }
  }

  function build(opts) {
    opts = opts || {};
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var city = opts.city, getPlayerHandle = opts.getPlayerHandle, isReady = opts.isReady;
    var boxes = opts.colliders || null;
    var collides = (!boxes && win && typeof win.WORLD_COLLIDES === 'function') ? win.WORLD_COLLIDES : null;
    var _done = false, _applied = false;

    function finish(found) {
      if (_done) return;
      _done = true;
      if (typeof opts.onDone === 'function') { try { opts.onDone(!!found); } catch (e) {} }
    }

    var api = { target: null, approach: null };

    api.resolve = function () {
      var id = getGotoParam(win);
      if (!id) return api;                 // no ?goto= at all — nothing to do, spawn normally, no toast
      var mk = findMarker(city, id);
      if (!mk) {
        if (win && typeof win.__toast === 'function') { try { win.__toast("Couldn't find that place"); } catch (e) {} }
        finish(false);
        return api;
      }
      api.target = mk;
      return api;
    };

    api.apply = function () {
      if (_applied || !api.target) return false;
      if (typeof isReady === 'function' && !isReady()) return false;
      var P = getPlayerHandle && getPlayerHandle();
      if (!P) return false;
      var spot = computeApproach(api.target.pos, boxes, collides, APPROACH_M);
      P.x = spot.x; P.z = spot.z;           // fast-travel convention: x/z only — host re-derives y from terrain
      api.approach = spot;
      _applied = true;
      finish(true);
      return true;
    };

    return api;
  }

  var PURE = { APPROACH_M: APPROACH_M, BEARINGS: BEARINGS, pointInBox: pointInBox, pointClear: pointClear,
    computeApproach: computeApproach, findMarker: findMarker, getGotoParam: getGotoParam };
  build.pure = PURE;
  if (root) root.buildWorldGoto = build;
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; module.exports.build = build; }
})(typeof window !== 'undefined' ? window : null);
