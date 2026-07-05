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
 * Design: 154×154px circular HUD, fixed north-up, neon SHADDAI styling
 *         (cyan #27e0ff / gold #ffcf4a on near-black).  A crisp player arrow
 *         rides over a static layer that is baked ONCE into an off-screen
 *         canvas — update() only clears, blits, and stamps the arrow.  No
 *         per-frame allocation of arrays / objects / gradients.
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */
  var SIZE   = 154;             // canvas px (square bounding box)
  var PAD    = 12;              // inner padding px on each side
  var DRAW   = SIZE - PAD * 2;  // 130px drawable area (map bbox)
  var CTR    = SIZE / 2;        // 77 — center of the disc
  var RAD    = DRAW / 2;        // 65 — inner map radius

  var CYAN   = '#27e0ff';
  var GOLD   = '#ffcf4a';

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
    function w2c(wx, wz) {
      return [
        PAD + (wx + HALF) / (HALF * 2) * DRAW,
        PAD + (wz + HALF) / (HALF * 2) * DRAW
      ];
    }

    /* ── DOM container (circular neon bezel) ────────────────────────────── */
    var container = document.createElement('div');
    container.id = 'world-minimap';
    var cs = container.style;
    cs.position        = 'fixed';
    cs.bottom          = '18px';
    cs.right           = '18px';
    cs.width           = SIZE + 'px';
    cs.height          = SIZE + 'px';
    cs.zIndex          = '9999';
    cs.borderRadius    = '50%';
    cs.boxShadow       = '0 0 18px rgba(39,224,255,0.35), 0 0 6px rgba(255,207,74,0.25), inset 0 0 14px rgba(0,0,0,0.6)';
    cs.background      = 'transparent';
    cs.pointerEvents   = 'none';
    cs.userSelect      = 'none';
    cs.overflow        = 'hidden';

    /* ── Main (dynamic) canvas ──────────────────────────────────────────── */
    var canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    var cvs = canvas.style;
    cvs.display      = 'block';
    cvs.borderRadius = '50%';
    container.appendChild(canvas);
    document.body.appendChild(container);

    var ctx = canvas.getContext('2d');

    /* ── Off-screen static canvas (baked once) ──────────────────────────── */
    var staticCanvas   = document.createElement('canvas');
    staticCanvas.width  = SIZE;
    staticCanvas.height = SIZE;
    var sCtx = staticCanvas.getContext('2d');
    _bakeStatic(sCtx, layout, HALF, DRAW, PAD, w2c);

    /* ── Public API ─────────────────────────────────────────────────────── */

    /* update() — call inside animate(); no allocation */
    function update() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(staticCanvas, 0, 0);   // blit baked disc

      var p = getPlayer();
      if (!p) return;
      var pc = w2c(p.x, p.z);

      /* clamp the marker to the disc so it never spills over the bezel */
      var dx = pc[0] - CTR, dy = pc[1] - CTR;
      var d  = Math.sqrt(dx * dx + dy * dy);
      var lim = RAD - 5;
      if (d > lim) { var k = lim / d; pc[0] = CTR + dx * k; pc[1] = CTR + dy * k; }

      _drawPlayerArrow(ctx, pc[0], pc[1], p.angle || 0);
    }

    /* setVisible(bool) — bind to M key externally */
    function setVisible(v) {
      container.style.display = v ? 'block' : 'none';
    }

    return { update: update, setVisible: setVisible, el: container };
  };

  /* ════════════════════════════════════════════════════════════════════════
   * STATIC LAYER — drawn once onto the off-screen canvas
   * ════════════════════════════════════════════════════════════════════════ */
  function _bakeStatic(ctx, layout, HALF, DRAW, PAD, w2c) {
    var ctr = w2c(0, 0);     // center of world (SHADDAI)

    /* ── Disc background: deep radial gradient, clipped to the circle ───── */
    ctx.save();
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD, 0, Math.PI * 2);
    ctx.clip();

    var bg = ctx.createRadialGradient(CTR, CTR - 6, 6, CTR, CTR, RAD);
    bg.addColorStop(0,    '#0a1c30');
    bg.addColorStop(0.55, '#061323');
    bg.addColorStop(1,    '#02080f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    /* faint north-up cross-hair grid */
    ctx.strokeStyle = 'rgba(39,224,255,0.07)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(CTR, CTR - RAD); ctx.lineTo(CTR, CTR + RAD);
    ctx.moveTo(CTR - RAD, CTR); ctx.lineTo(CTR + RAD, CTR);
    ctx.stroke();

    /* ── Sacred rings ─────────────────────────────────────────────────── */
    var rings = layout.sacred && layout.sacred.rings ? layout.sacred.rings : [];
    ctx.strokeStyle = 'rgba(39,224,255,0.10)';
    ctx.lineWidth   = 0.5;
    for (var ri = 0; ri < rings.length; ri++) {
      var pr = rings[ri] / (HALF * 2) * DRAW;
      ctx.beginPath();
      ctx.arc(ctr[0], ctr[1], pr, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* ── Roads ────────────────────────────────────────────────────────── */
    var roads = layout.roads || [];
    ctx.lineWidth   = 0.9;
    ctx.lineCap     = 'round';
    ctx.strokeStyle = 'rgba(39,224,255,0.22)';
    for (var rdi = 0; rdi < roads.length; rdi++) {
      var pair = roads[rdi];
      var sa   = layout.sector(pair[0]);
      var sb   = layout.sector(pair[1]);
      if (!sa || !sb) continue;
      var pa = w2c(sa.pos[0], sa.pos[1]);
      var pb = w2c(sb.pos[0], sb.pos[1]);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }

    /* ── Spawn portals (small rotated diamonds) ───────────────────────── */
    var portals = layout.spawnPortals || [];
    for (var pi = 0; pi < portals.length; pi++) {
      var portal = portals[pi];
      var pp     = w2c(portal.pos[0], portal.pos[1]);
      ctx.save();
      ctx.translate(pp[0], pp[1]);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = hex2rgba(portal.color, 0.5);
      ctx.lineWidth   = 0.8;
      ctx.strokeRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }

    /* ── Agent sectors (glowing filled dots + code initial) ───────────── */
    var sectors = layout.sectors || [];
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    for (var si = 0; si < sectors.length; si++) {
      var sec      = sectors[si];
      var sp       = w2c(sec.pos[0], sec.pos[1]);
      var isSource = sec.code === 'SHADDAI';
      var r        = isSource ? 5 : 3.2;

      /* soft glow halo */
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], r + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = hex2rgba(sec.color, 0.18);
      ctx.fill();

      /* filled core */
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], r, 0, Math.PI * 2);
      ctx.fillStyle = hex2rgba(sec.color, isSource ? 1 : 0.9);
      ctx.fill();

      /* crisp rim */
      ctx.strokeStyle = isSource ? GOLD : 'rgba(255,255,255,0.6)';
      ctx.lineWidth   = isSource ? 1.1 : 0.7;
      ctx.stroke();

      /* initial letter above the dot */
      ctx.font      = (isSource ? 'bold 7px' : '5px') + ' "Courier New", monospace';
      ctx.fillStyle = isSource ? GOLD : hex2rgba(sec.color, 1);
      ctx.fillText(sec.code[0], sp[0], sp[1] - r - 2);
    }

    /* ── Bazaar landmark (teal filled square with 'B' label) ──────────── */
    var bazaar = layout.landmark('bazaar');
    if (bazaar) {
      var bp = w2c(bazaar.pos[0], bazaar.pos[1]);
      ctx.fillStyle   = hex2rgba(bazaar.color, 0.9);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth   = 0.7;
      ctx.fillRect  (bp[0] - 3, bp[1] - 3, 6, 6);
      ctx.strokeRect(bp[0] - 3, bp[1] - 3, 6, 6);
      ctx.font      = '5px "Courier New", monospace';
      ctx.fillStyle = hex2rgba(bazaar.color, 1);
      ctx.fillText('B', bp[0], bp[1] - 5);
    }

    ctx.restore();   // drop the circular clip

    /* ══ Bezel & chrome (drawn OUTSIDE the clip, on top of the disc) ═══════ */

    /* inner gold hairline ring */
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,207,74,0.28)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    /* bright cyan outer ring */
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD, 0, Math.PI * 2);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth   = 1.6;
    ctx.stroke();

    /* compass tick marks at N / E / S / W */
    ctx.strokeStyle = 'rgba(39,224,255,0.55)';
    ctx.lineWidth   = 1.4;
    var ticks = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];  // N E S W (canvas angles)
    for (var ti = 0; ti < ticks.length; ti++) {
      var a  = ticks[ti];
      var cA = Math.cos(a), sA = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(CTR + cA * (RAD - 4), CTR + sA * (RAD - 4));
      ctx.lineTo(CTR + cA * (RAD + 1), CTR + sA * (RAD + 1));
      ctx.stroke();
    }

    /* "N" compass letter (top) + "MAP" caption (bottom) */
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 8px "Courier New", monospace';
    ctx.fillStyle    = GOLD;
    ctx.fillText('N', CTR, CTR - RAD + 8);
    ctx.font         = 'bold 7px "Courier New", monospace';
    ctx.fillStyle    = 'rgba(39,224,255,0.7)';
    ctx.fillText('MAP', CTR, CTR + RAD - 8);
  }

  /* ════════════════════════════════════════════════════════════════════════
   * DYNAMIC LAYER — player arrow (white chevron, cyan outline)
   *   angle = 0  → points up (north)
   *   angle = π/2 → points right (east)
   *   Caller should pass: Math.atan2(fwd.x, -fwd.z)
   *   where fwd = camera.getWorldDirection(v).setY(0).normalize()
   * ════════════════════════════════════════════════════════════════════════ */
  function _drawPlayerArrow(ctx, cx, cy, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    /* soft location halo */
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(39,224,255,0.16)';
    ctx.fill();

    /* arrow chevron pointing up (local −y = north at angle 0) */
    ctx.beginPath();
    ctx.moveTo( 0,   -7);    // tip
    ctx.lineTo( 4,    5);    // right base
    ctx.lineTo( 0,    2.5);  // center notch
    ctx.lineTo(-4,    5);    // left base
    ctx.closePath();
    ctx.fillStyle   = '#ffffff';
    ctx.fill();
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = '#27e0ff';
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    ctx.restore();
  }

})();

/* ══════════════════════════════════════════════════════════════════════════════
 * WIRING SNIPPET — paste into SHADDAI-WORLD-3D.html (after world-layout.js loads)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1.  Load the script (in <head> or just before </body>, AFTER world-layout.js):
 *       <script src="world-minimap.js"></script>
 *
 * 2.  Instantiate (after scene/camera/playerPos are declared, e.g. near line 830):
 *
 *       const _minimap = window.buildWorldMinimap({
 *         layout:    window.WORLD_LAYOUT,
 *         getPlayer: function () {
 *           // fwd is already computed each frame (line 1287); re-use it.
 *           return {
 *             x:     playerPos.x,
 *             z:     playerPos.z,
 *             angle: Math.atan2(fwd.x, -fwd.z)   // north-up canvas yaw
 *             //   ^^ negate -fwd.z so that facing -Z(north) gives angle=0 (arrow up)
 *           };
 *         }
 *       });
 *
 * 3.  Call update() each frame inside animate() (after the movement block):
 *
 *       _minimap.update();
 *
 * 4.  Bind M key to toggle (add to the existing keydown listener or near it):
 *
 *       let _minimapVisible = true;
 *       document.addEventListener('keydown', function (e) {
 *         if (e.code === 'KeyM' && !e.repeat) {
 *           _minimapVisible = !_minimapVisible;
 *           _minimap.setVisible(_minimapVisible);
 *         }
 *       });
 *
 * NOTE: `fwd` must be in scope when getPlayer() is called.  In the current world
 *       code it is declared at line 1203 and updated at line 1287 each frame, so
 *       it is always fresh when animate() calls _minimap.update().
 * ══════════════════════════════════════════════════════════════════════════════ */
