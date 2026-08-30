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
