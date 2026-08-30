/* world-minimap.js — SHADDAI World corner minimap (pure DOM + 2D canvas, no WebGL).
 * TURTLE — exposes window.buildWorldMinimap({ THREE?, layout, getPlayer }) → { update, setVisible, el }
 *
 * getPlayer() must return { x, z, angle } where:
 *   x, z  = world XZ position
 *   angle = canvas-space yaw:  Math.atan2(fwd.x, -fwd.z)
 *           (north-up: 0 = facing -Z/north, π/2 = east, π = south, -π/2 = west)
 *
 * Layout used: layout.sectors, layout.spawnPortals, layout.landmark('bazaar'),
 *              layout.roads, layout.sacred.rings, layout.half
 *
 * Design: premium holo-radar HUD (172×172px). Cyan #27e0ff + gold #ffcf4a on
 *         near-black, neon bezel, soft outer glow, compass ticks (N/E/S/W),
 *         baked range rings + radial spokes + hex/circuit grid + scanlines +
 *         vignette. A time-driven radar sweep wedge rotates over the disc.
 *
 * PERF: EVERYTHING static (bezel, rings, grid, spokes, roads, dots, ticks,
 *       labels, scanlines, vignette) is baked ONCE into an off-screen canvas.
 *       The rotating sweep wedge is ALSO baked once (into its own off-screen
 *       canvas) and merely rotated+blitted each frame. update() only:
 *         clear → blit static → rotate+blit sweep → stamp player chevron.
 *       No per-frame allocation of arrays / objects / gradients.
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */
  var SIZE   = 210;             // canvas px (square bounding box) — bigger, clearer HUD
  var PAD    = 18;              // inner padding px on each side
  var DRAW   = SIZE - PAD * 2;  // 140px drawable area (map bbox)
  var CTR    = SIZE / 2;        // 86 — center of the disc
  var RAD    = DRAW / 2;        // 70 — inner map radius

  var CYAN   = '#27e0ff';
  var GOLD   = '#ffcf4a';

  var TWO_PI = Math.PI * 2;
  var SWEEP_SPEED = 1.15;       // radians / second (radar rotation rate)

  /* Crisp-text scaling: render the backing store at devicePixelRatio (capped at
   * 2 for perf) while keeping the CSS box at SIZE px. All draw math stays in
   * "logical" SIZE units — we just pre-scale each 2D context by DPR once. */
  var DPR = Math.min(2, (window.devicePixelRatio || 1));

  /* ── Utility: hex number (e.g. 0xffcf4a) → CSS rgba() string ─────────── */
  function hex2rgba(hex, a) {
    return 'rgba(' +
      ((hex >> 16) & 0xff) + ',' +
      ((hex >>  8) & 0xff) + ',' +
      ( hex        & 0xff) + ',' + a + ')';
  }

  /* ── Factory ────────────────────────────────────────────────────────────── */
  window.buildWorldMinimap = function buildWorldMinimap(opts) {
    var layout    = opts.layout;
    var getPlayer = opts.getPlayer;
    var HALF      = layout.half;          // world half-size (±380)

    /* World XZ → canvas XY  (north-up: −Z = north = canvas top) */
