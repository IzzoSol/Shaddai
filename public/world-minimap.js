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
  var SIZE   = 172;             // canvas px (square bounding box)
  var PAD    = 16;              // inner padding px on each side
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
    function w2c(wx, wz) {
      return [
        PAD + (wx + HALF) / (HALF * 2) * DRAW,
        PAD + (wz + HALF) / (HALF * 2) * DRAW
      ];
    }

    /* ── DOM container (circular neon bezel + soft outer glow) ──────────── */
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
    cs.boxShadow       = '0 0 26px rgba(39,224,255,0.40), 0 0 10px rgba(255,207,74,0.28), inset 0 0 18px rgba(0,0,0,0.65)';
    cs.background      = 'radial-gradient(circle at 50% 42%, rgba(10,28,48,0.35), rgba(2,8,15,0.15))';
    cs.pointerEvents   = 'none';
    cs.userSelect      = 'none';
    cs.overflow        = 'hidden';

    /* ── Main (dynamic) canvas ──────────────────────────────────────────── */
    var canvas = document.createElement('canvas');
    canvas.width  = SIZE * DPR;         // backing store: hi-dpi for crisp text
    canvas.height = SIZE * DPR;
    var cvs = canvas.style;
    cvs.display      = 'block';
    cvs.width        = SIZE + 'px';     // CSS box stays the same size/position
    cvs.height       = SIZE + 'px';
    cvs.borderRadius = '50%';
    container.appendChild(canvas);
    document.body.appendChild(container);

    var ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);                // draw in logical units; auto-upscaled

    /* Off-screen canvases are baked at DPR too, then blitted at logical size
     * via drawImage(img, 0, 0, SIZE, SIZE) so the baked detail stays sharp. */

    /* ── Off-screen static canvas (baked once) ──────────────────────────── */
    var staticCanvas    = document.createElement('canvas');
    staticCanvas.width  = SIZE * DPR;
    staticCanvas.height = SIZE * DPR;
    var sCtx = staticCanvas.getContext('2d');
    sCtx.scale(DPR, DPR);
    _bakeStatic(sCtx, layout, HALF, DRAW, PAD, w2c);

    /* ── Off-screen sweep canvas (baked once, rotated each frame) ───────── */
    var sweepCanvas    = document.createElement('canvas');
    sweepCanvas.width  = SIZE * DPR;
    sweepCanvas.height = SIZE * DPR;
    var swCtx = sweepCanvas.getContext('2d');
    swCtx.scale(DPR, DPR);
    _bakeSweep(swCtx);

    /* ── Public API ─────────────────────────────────────────────────────── */

    /* update() — call inside animate(); allocation-free */
    function update() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      /* Dest size is logical SIZE (ctx is DPR-scaled); source is DPR-sized. */
      ctx.drawImage(staticCanvas, 0, 0, SIZE, SIZE); // blit baked disc

      /* rotating radar sweep (time-driven; cached wedge, just rotated) */
      var ang = (performance.now() * 0.001 * SWEEP_SPEED) % TWO_PI;
      ctx.save();
      ctx.translate(CTR, CTR);
      ctx.rotate(ang);
      ctx.translate(-CTR, -CTR);
      ctx.drawImage(sweepCanvas, 0, 0, SIZE, SIZE);
      ctx.restore();

      var p = getPlayer();
      if (!p) return;

      /* inline world→canvas (no array allocation) */
      var px = PAD + (p.x + HALF) / (HALF * 2) * DRAW;
      var py = PAD + (p.z + HALF) / (HALF * 2) * DRAW;

      /* clamp the marker to the disc so it never spills over the bezel */
      var dx = px - CTR, dy = py - CTR;
      var d  = Math.sqrt(dx * dx + dy * dy);
      var lim = RAD - 6;
      if (d > lim) { var k = lim / d; px = CTR + dx * k; py = CTR + dy * k; }

      _drawPlayerArrow(ctx, px, py, p.angle || 0);
    }

    /* setVisible(bool) — bind to M key externally */
    function setVisible(v) {
      container.style.display = v ? 'block' : 'none';
    }

    return { update: update, setVisible: setVisible, el: container };
  };

  /* ════════════════════════════════════════════════════════════════════════
   * SWEEP LAYER — baked once; a trailing wedge with a bright leading edge.
   *   Bright edge points UP (canvas −Y). update() rotates it around center.
   * ════════════════════════════════════════════════════════════════════════ */
  function _bakeSweep(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD - 1, 0, TWO_PI);
    ctx.clip();

    var lead   = -Math.PI / 2;      // leading edge = straight up
    var span   = Math.PI * 0.62;    // trailing wedge arc length
    var slices = 48;

    /* fading trailing wedge (bright at the leading edge, fades behind) */
    for (var i = 0; i < slices; i++) {
      var a0 = lead - (span * i) / slices;
      var a1 = lead - (span * (i + 1)) / slices;
      var t  = 1 - i / slices;               // 1 → 0 from lead to tail
      var alpha = 0.16 * t * t;
      ctx.beginPath();
      ctx.moveTo(CTR, CTR);
      ctx.lineTo(CTR + Math.cos(a0) * RAD, CTR + Math.sin(a0) * RAD);
      ctx.lineTo(CTR + Math.cos(a1) * RAD, CTR + Math.sin(a1) * RAD);
      ctx.closePath();
      ctx.fillStyle = 'rgba(39,224,255,' + alpha + ')';
      ctx.fill();
    }

    /* bright leading beam */
    ctx.beginPath();
    ctx.moveTo(CTR, CTR);
    ctx.lineTo(CTR + Math.cos(lead) * (RAD - 1), CTR + Math.sin(lead) * (RAD - 1));
    ctx.strokeStyle = 'rgba(120,240,255,0.75)';
    ctx.lineWidth   = 1.4;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur  = 6;
    ctx.stroke();

    ctx.restore();
  }

  /* ════════════════════════════════════════════════════════════════════════
   * STATIC LAYER — drawn once onto the off-screen canvas
   * ════════════════════════════════════════════════════════════════════════ */
  function _bakeStatic(ctx, layout, HALF, DRAW, PAD, w2c) {
    var ctr = w2c(0, 0);     // center of world (SHADDAI)

    /* ── Disc background: deep radial gradient, clipped to the circle ───── */
    ctx.save();
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD, 0, TWO_PI);
    ctx.clip();

    var bg = ctx.createRadialGradient(CTR, CTR - 8, 6, CTR, CTR, RAD);
    bg.addColorStop(0,    '#0b2136');
    bg.addColorStop(0.55, '#061323');
    bg.addColorStop(1,    '#02080f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    /* ── Hex / circuit grid (faint, baked) ──────────────────────────────── */
    _bakeHexGrid(ctx);

    /* ── Concentric range rings (radar) ─────────────────────────────────── */
    ctx.strokeStyle = 'rgba(39,224,255,0.11)';
    ctx.lineWidth   = 0.6;
    var rr = [0.28, 0.55, 0.82];
    for (var rgi = 0; rgi < rr.length; rgi++) {
      ctx.beginPath();
      ctx.arc(CTR, CTR, RAD * rr[rgi], 0, TWO_PI);
      ctx.stroke();
    }

    /* ── Radial spokes (8, radar reticle) ───────────────────────────────── */
    ctx.strokeStyle = 'rgba(39,224,255,0.07)';
    ctx.lineWidth   = 0.5;
    for (var sk = 0; sk < 8; sk++) {
      var sa = (sk / 8) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(CTR, CTR);
      ctx.lineTo(CTR + Math.cos(sa) * RAD, CTR + Math.sin(sa) * RAD);
      ctx.stroke();
    }

    /* ── Sacred rings (from layout) ─────────────────────────────────────── */
    var rings = layout.sacred && layout.sacred.rings ? layout.sacred.rings : [];
    ctx.strokeStyle = 'rgba(255,207,74,0.09)';
    ctx.lineWidth   = 0.5;
    for (var ri = 0; ri < rings.length; ri++) {
      var pr = rings[ri] / (HALF * 2) * DRAW;
      ctx.beginPath();
      ctx.arc(ctr[0], ctr[1], pr, 0, TWO_PI);
      ctx.stroke();
    }

    /* ── Roads (soft glowing lines) ─────────────────────────────────────── */
    var roads = layout.roads || [];
    ctx.lineWidth   = 1.1;
    ctx.lineCap     = 'round';
    ctx.strokeStyle = 'rgba(39,224,255,0.20)';
    ctx.shadowColor = 'rgba(39,224,255,0.35)';
    ctx.shadowBlur  = 3;
    for (var rdi = 0; rdi < roads.length; rdi++) {
      var pair = roads[rdi];
      var sa2  = layout.sector(pair[0]);
      var sb   = layout.sector(pair[1]);
      if (!sa2 || !sb) continue;
      var pa = w2c(sa2.pos[0], sa2.pos[1]);
      var pb = w2c(sb.pos[0], sb.pos[1]);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    /* ── Spawn portals (glowing rotated diamonds) ───────────────────────── */
    var portals = layout.spawnPortals || [];
    for (var pi = 0; pi < portals.length; pi++) {
      var portal = portals[pi];
      var pp     = w2c(portal.pos[0], portal.pos[1]);
      ctx.save();
      ctx.translate(pp[0], pp[1]);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = hex2rgba(portal.color, 0.8);
      ctx.shadowBlur  = 4;
      ctx.fillStyle   = hex2rgba(portal.color, 0.35);
      ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
      ctx.strokeStyle = hex2rgba(portal.color, 0.85);
      ctx.lineWidth   = 0.9;
      ctx.strokeRect(-2.6, -2.6, 5.2, 5.2);
      ctx.restore();
    }
    ctx.shadowBlur = 0;

    /* ── Agent sectors (glowing filled dots + code initial) ───────────── */
    var sectors = layout.sectors || [];
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    for (var si = 0; si < sectors.length; si++) {
      var sec      = sectors[si];
      var sp       = w2c(sec.pos[0], sec.pos[1]);
      var isSource = sec.code === 'SHADDAI';
      var r        = isSource ? 5.5 : 3.4;

      /* soft glow halo */
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], r + 3, 0, TWO_PI);
      ctx.fillStyle = hex2rgba(sec.color, 0.16);
      ctx.fill();

      /* filled core (with light bloom) */
      ctx.shadowColor = hex2rgba(sec.color, 0.9);
      ctx.shadowBlur  = isSource ? 8 : 4;
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], r, 0, TWO_PI);
      ctx.fillStyle = hex2rgba(sec.color, isSource ? 1 : 0.92);
      ctx.fill();
      ctx.shadowBlur = 0;

      /* crisp rim */
      ctx.strokeStyle = isSource ? GOLD : 'rgba(255,255,255,0.65)';
      ctx.lineWidth   = isSource ? 1.3 : 0.8;
      ctx.stroke();

      /* SHADDAI center: gold crosshair reticle */
      if (isSource) {
        ctx.strokeStyle = 'rgba(255,207,74,0.75)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(sp[0] - r - 3, sp[1]); ctx.lineTo(sp[0] - r + 1, sp[1]);
        ctx.moveTo(sp[0] + r - 1, sp[1]); ctx.lineTo(sp[0] + r + 3, sp[1]);
        ctx.moveTo(sp[0], sp[1] - r - 3); ctx.lineTo(sp[0], sp[1] - r + 1);
        ctx.moveTo(sp[0], sp[1] + r - 1); ctx.lineTo(sp[0], sp[1] + r + 3);
        ctx.stroke();
      }

      /* initial letter above the dot — bumped up + dark halo for legibility
       * against the busy glowing backdrop (contrast, not just color). */
      var ly0 = sp[1] - r - 3.5;
      ctx.font         = (isSource ? 'bold 9px' : 'bold 7px') + ' "Courier New", monospace';
      ctx.lineJoin     = 'round';
      ctx.strokeStyle  = 'rgba(2,8,15,0.85)';   // dark outline = readable on any hue
      ctx.lineWidth    = 2;
      ctx.strokeText(sec.code[0], sp[0], ly0);
      ctx.fillStyle    = isSource ? GOLD : '#eafcff';  // near-white pops vs. dark
      ctx.fillText(sec.code[0], sp[0], ly0);
    }

    /* ── Bazaar landmark (teal filled square with 'B' label) ──────────── */
    var bazaar = layout.landmark('bazaar');
    if (bazaar) {
      var bp = w2c(bazaar.pos[0], bazaar.pos[1]);
      ctx.shadowColor = hex2rgba(bazaar.color, 0.8);
      ctx.shadowBlur  = 4;
      ctx.fillStyle   = hex2rgba(bazaar.color, 0.9);
      ctx.fillRect  (bp[0] - 3.2, bp[1] - 3.2, 6.4, 6.4);
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth   = 0.8;
      ctx.strokeRect(bp[0] - 3.2, bp[1] - 3.2, 6.4, 6.4);
      /* 'B' label — matched to agent-label legibility (bump + dark halo) */
      ctx.font        = 'bold 7px "Courier New", monospace';
      ctx.lineJoin    = 'round';
      ctx.strokeStyle = 'rgba(2,8,15,0.85)';
      ctx.lineWidth   = 2;
      ctx.strokeText('B', bp[0], bp[1] - 6);
      ctx.fillStyle   = '#eafcff';
      ctx.fillText('B', bp[0], bp[1] - 6);
    }

    /* ── Holo scanlines + vignette (inside the clip) ────────────────────── */
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (var y = 0; y < SIZE; y += 3) ctx.fillRect(0, y, SIZE, 1);

    var vig = ctx.createRadialGradient(CTR, CTR, RAD * 0.62, CTR, CTR, RAD);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.restore();   // drop the circular clip

    /* ══ Bezel & chrome (drawn OUTSIDE the clip, on top of the disc) ═══════ */

    /* inner gold hairline ring */
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD - 2, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(255,207,74,0.30)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    /* dark bezel gap ring */
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD + 2, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(2,8,15,0.9)';
    ctx.lineWidth   = 3;
    ctx.stroke();

    /* bright cyan outer ring (with glow) */
    ctx.beginPath();
    ctx.arc(CTR, CTR, RAD, 0, TWO_PI);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth   = 1.8;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur  = 6;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    /* gold accent arcs at the 4 diagonals (bezel detailing) ─────────────── */
    ctx.strokeStyle = GOLD;
    ctx.lineWidth   = 2.2;
    for (var di = 0; di < 4; di++) {
      var c0 = Math.PI / 4 + di * (Math.PI / 2) - 0.16;
      ctx.beginPath();
      ctx.arc(CTR, CTR, RAD, c0, c0 + 0.32);
      ctx.stroke();
    }

    /* compass tick marks — long at N/E/S/W, short between ────────────────── */
    for (var ti = 0; ti < 16; ti++) {
      var a  = (ti / 16) * TWO_PI - Math.PI / 2;   // start at north
      var major = (ti % 4) === 0;
      var cA = Math.cos(a), sA = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(CTR + cA * (RAD - (major ? 6 : 3)), CTR + sA * (RAD - (major ? 6 : 3)));
      ctx.lineTo(CTR + cA * (RAD + 1),               CTR + sA * (RAD + 1));
      ctx.strokeStyle = major ? 'rgba(39,224,255,0.75)' : 'rgba(39,224,255,0.35)';
      ctx.lineWidth   = major ? 1.5 : 0.9;
      ctx.stroke();
    }

    /* compass letters N / E / S / W */
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 8px "Courier New", monospace';
    ctx.lineJoin     = 'round';
    var letters = ['N', 'E', 'S', 'W'];
    var langs   = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    for (var li = 0; li < 4; li++) {
      var la = langs[li];
      var lx = CTR + Math.cos(la) * (RAD - 9);
      var ly = CTR + Math.sin(la) * (RAD - 9);
      /* dark halo keeps the compass letters crisp over the bright bezel glow */
      ctx.strokeStyle = 'rgba(2,8,15,0.9)';
      ctx.lineWidth   = 2.5;
      ctx.strokeText(letters[li], lx, ly);
      ctx.fillStyle = (li === 0) ? GOLD : 'rgba(180,240,255,0.95)';
      ctx.fillText(letters[li], lx, ly);
    }

    /* "RADAR" caption (bottom, just inside) */
    ctx.font      = 'bold 6px "Courier New", monospace';
    ctx.fillStyle = 'rgba(39,224,255,0.6)';
    ctx.fillText('R A D A R', CTR, CTR + RAD - 6);
  }

  /* Baked hex-grid backdrop (very faint, inside the disc clip) */
  function _bakeHexGrid(ctx) {
    ctx.strokeStyle = 'rgba(39,224,255,0.045)';
    ctx.lineWidth   = 0.5;
    var s   = 11;                 // hex "radius"
    var w   = Math.sqrt(3) * s;   // column spacing
    var h   = 1.5 * s;            // row spacing
    for (var row = 0, y = -h; y < SIZE + h; row++, y += h) {
      var xoff = (row % 2) * (w / 2);
      for (var x = -w; x < SIZE + w; x += w) {
        _hexPath(ctx, x + xoff, y, s);
        ctx.stroke();
      }
    }
  }

  function _hexPath(ctx, cx, cy, s) {
    ctx.beginPath();
    for (var k = 0; k < 6; k++) {
      var a  = Math.PI / 180 * (60 * k - 30);
      var vx = cx + s * Math.cos(a);
      var vy = cy + s * Math.sin(a);
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  }

  /* ════════════════════════════════════════════════════════════════════════
   * DYNAMIC LAYER — player chevron (glowing white, cyan outline)
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
    ctx.arc(0, 0, 8, 0, TWO_PI);
    ctx.fillStyle = 'rgba(39,224,255,0.16)';
    ctx.fill();

    /* dark backing disc — separates the "you are here" blip from the
     * cyan-heavy map so it's unmistakable at a glance (contrast). */
    ctx.beginPath();
    ctx.arc(0, 0, 6.4, 0, TWO_PI);
    ctx.fillStyle = 'rgba(2,8,15,0.55)';
    ctx.fill();

    /* faint heading beam so the facing direction reads instantly */
    ctx.strokeStyle = 'rgba(120,240,255,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -13);
    ctx.stroke();

    /* glowing chevron pointing up (local −y = north at angle 0) */
    ctx.shadowColor = CYAN;
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.moveTo( 0,   -8);    // tip
    ctx.lineTo( 4.5,  5.5);  // right base
    ctx.lineTo( 0,    2.8);  // center notch
    ctx.lineTo(-4.5,  5.5);  // left base
    ctx.closePath();
    ctx.fillStyle   = '#ffffff';
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = CYAN;
    ctx.lineWidth   = 1.3;
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
