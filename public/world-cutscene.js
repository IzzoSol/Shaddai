/* world-cutscene.js — cinematic building-entry / exit transition overlay.
 *
 * PUBLIC API (unchanged):
 *   window.buildWorldCutscene() → { play(opts, done), isPlaying() }
 *
 *   play(opts, done)
 *     opts.name   {string}  — destination label, e.g. "THE MUSEUM"
 *     opts.color  {number}  — accent color as 0xRRGGBB integer (default 0x34e5b0)
 *     opts.kind   {string}  — 'enter' | 'exit'   (default 'enter')
 *     opts.ready  {function} — OPTIONAL ()->bool "are the destination assets ready?".
 *                              When supplied, the opaque LOADING screen is HELD until
 *                              this returns true (capped at MAX_WAIT), so the interior
 *                              is fully built before the black lifts — zero lag / no pop.
 *                              Omit it and the fixed timeline runs exactly as before.
 *                              (world-interiors exposes roomReady() for this purpose.)
 *     done        {function} — invoked ONCE at the visual midpoint, exactly when the
 *                              screen is 100% opaque (the teleport window). The world
 *                              swaps scene here; the overlay then wipes away to reveal it.
 *
 *   isPlaying() → boolean   — true while a transition is on screen (gates input).
 *
 * CONTRACT GUARANTEES:
 *   • done() fires ONCE, on a frame that has ALREADY been painted fully opaque, so the
 *     scene swap is never visible. A short opaque HOLD brackets the callback on both
 *     sides to absorb any frame-timing jitter.
 *   • Fully time-based easing via requestAnimationFrame — frame-rate independent, no
 *     setTimeout stepping, no jank.
 *   • Reentrancy-safe: a call while already playing is ignored (guarded).
 *   • Full cleanup on finish: cancels rAF, removes the canvas + resize listener,
 *     resets the playing flag.
 *
 * VISUALS (themed by opts.color):
 *   COVER  — a neon "portal iris" blooms from centre while the world dims to black;
 *            rotating warp-streaks, a colored energy core, scanlines + vignette, and a
 *            crisp glowing title card ("ENTERING · NAME") resolve in.
 *   HOLD   — screen held 100% opaque as a themed LOADING screen (rotating SHADDAI
 *            hexagram glyph + progress spinner + "LOADING…" dots); done() fires here
 *            (teleport is hidden). If opts.ready is given, this hold extends until the
 *            interior reports ready — so slow builds show a loader, never a freeze.
 *   REVEAL — the iris bursts outward and the black lifts to expose the new interior;
 *            'enter' and 'exit' mirror each other (streak spin + iris direction) so
 *            leaving a building feels like the inverse of entering it.
 *   Total duration ~1.2s, snappy.
 *
 * Pure DOM/canvas 2D — no WebGL, no external dependencies, no CSS injection needed.
 */
window.buildWorldCutscene = (function () {
  'use strict';

  var PI2 = Math.PI * 2;

  // ── timeline (ms) ──────────────────────────────────────────────────────────
  var COVER   = 520;   // world dims + portal blooms → fully opaque
  var HOLD    = 210;   // held 100% opaque (LOADING screen); done() fires at its start
  var REVEAL  = 560;   // black lifts + iris bursts → interior revealed
  var TOTAL   = COVER + HOLD + REVEAL;   // ~1290ms
  // If the caller passes opts.ready (a ()->bool "assets ready?" gate), the opaque
  // HOLD is extended — showing the loader — until ready() is true, capped at
  // MAX_WAIT so a stuck build can never freeze the screen forever.
  var MAX_WAIT = 4000;

  // ── easing (all map [0,1]→[0,1]) ───────────────────────────────────────────
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smoother(x) { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); }
  function easeOutCubic(x) { x = clamp01(x); var u = 1 - x; return 1 - u * u * u; }
  function easeInCubic(x) { x = clamp01(x); return x * x * x; }

  // ── shared scanline pattern (built lazily, once) ───────────────────────────
  var _scanPattern = null;
  function _getScanPattern(ctx) {
    if (_scanPattern) return _scanPattern;
    var p = document.createElement('canvas');
    p.width = 1; p.height = 3;
    var pc = p.getContext('2d');
    pc.fillStyle = 'rgba(0,0,0,0.55)';
    pc.fillRect(0, 0, 1, 1);            // one dark row, two clear rows
    _scanPattern = ctx.createPattern(p, 'repeat');
    return _scanPattern;
  }

  // ── factory ─────────────────────────────────────────────────────────────
  return function buildWorldCutscene() {

    var _playing    = false;
    var _raf        = 0;
    var _canvas     = null;
    var _ctx        = null;
    var _onResize   = null;
    var _W = 0, _H = 0, _dpr = 1;

    function _sizeCanvas() {
      _dpr = Math.min(window.devicePixelRatio || 1, 2);
      _W = window.innerWidth;
      _H = window.innerHeight;
      if (!_canvas) return;
      _canvas.width  = Math.round(_W * _dpr);
      _canvas.height = Math.round(_H * _dpr);
      _canvas.style.width  = _W + 'px';
      _canvas.style.height = _H + 'px';
      _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);   // draw in CSS pixels
    }

    function _finish() {
      if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
      if (_onResize) { window.removeEventListener('resize', _onResize); _onResize = null; }
      if (_canvas && _canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
      _canvas = null; _ctx = null;
      _playing = false;
    }

    return {

      isPlaying: function () { return _playing; },

      play: function (opts, done) {
        if (_playing) return;          // reentrancy guard — ignore overlapping plays
        _playing = true;

        opts = opts || {};
        var name  = ((opts.name != null ? opts.name : 'DESTINATION') + '').toUpperCase();
        var color = (opts.color != null) ? (opts.color | 0) : 0x34e5b0;
        var isExit = opts.kind === 'exit';
        var dir    = isExit ? -1 : 1;
        // optional "assets ready?" gate — reveal is held (loader shown) until it's true
        var readyFn = (typeof opts.ready === 'function') ? opts.ready : null;
        var _gateExtra = 0;     // ms of extra opaque HOLD accumulated while waiting on readyFn

        // decompose color once
        var cr = (color >> 16) & 0xff;
        var cg = (color >>  8) & 0xff;
        var cb =  color        & 0xff;
        var hex = '#' + ('000000' + (color >>> 0).toString(16)).slice(-6);
        function rgba(a) { return 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')'; }

        var label = (isExit ? 'LEAVING' : 'ENTERING') + '  ·  ' + name;
        var sub   = isExit ? '↩  RETURNING TO WORLD  ↩' : '▣  INITIALIZING SECTOR  ▣';

        // ── build canvas overlay ────────────────────────────────────────────
        _canvas = document.createElement('canvas');
        _canvas.className = 'sc-canvas';
        _canvas.style.cssText =
          'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'z-index:99999;pointer-events:all;display:block;';
        _ctx = _canvas.getContext('2d');
        document.body.appendChild(_canvas);

        _onResize = _sizeCanvas;
        window.addEventListener('resize', _onResize);
        _sizeCanvas();

        var _start = 0;
        var _doneCalled = false;
        var _ready = false;     // readyFn satisfied (or capped) — REVEAL may proceed
        var _gateT0 = 0;        // wall-clock ms when we first began waiting on readyFn

        // ── per-frame draw (t = ms since start) ──────────────────────────────
        function draw(t) {
          var ctx = _ctx, W = _W, H = _H;
          var cx = W / 2, cy = H / 2;
          var maxR = Math.sqrt(cx * cx + cy * cy) + 4;

          // phase resolution --------------------------------------------------
          var baseA;      // opacity of the black cover (1 = world fully hidden)
          var irisP;      // 0..1 progress of the portal iris bloom
          var titleA;     // title/sub opacity
          var burst = 0;  // reveal-only outward iris burst 0..1

          if (t < COVER) {                       // COVER
            var p = t / COVER;
            baseA  = smoother(clamp01(p * 1.16)); // reach solid black slightly early
            irisP  = easeOutCubic(p);
            titleA = clamp01((p - 0.26) / 0.42);
          } else if (t < COVER + HOLD) {         // HOLD (fully opaque)
            baseA  = 1;
            irisP  = 1;
            titleA = 1;
          } else {                                // REVEAL
            var q = (t - COVER - HOLD) / REVEAL;
            baseA  = 1 - smoother(clamp01(q));
            irisP  = 1;
            burst  = easeInCubic(q);
            titleA = 1 - clamp01(q / 0.34);
          }

          // clear -------------------------------------------------------------
          ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
          ctx.clearRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'source-over';

          // 1) black cover (dark accent-tinted radial) ------------------------
          ctx.save();
          ctx.globalAlpha = baseA;
          var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
          bg.addColorStop(0, '#0a0a1a');
          bg.addColorStop(1, '#010109');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();

          // 2) colored energy core (additive) ---------------------------------
          var coreR = (0.16 + 0.55 * irisP) * maxR * (1 + 0.35 * burst);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = baseA * (0.30 * (1 - burst));
          var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
          core.addColorStop(0, rgba(0.55));
          core.addColorStop(0.5, rgba(0.14));
          core.addColorStop(1, rgba(0));
          ctx.fillStyle = core;
          ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, PI2); ctx.fill();
          ctx.restore();

          // 3) rotating warp-streaks (additive) -------------------------------
          var streakA = baseA * 0.42 * Math.sin(clamp01(irisP) * Math.PI) * (1 - burst);
          if (streakA > 0.003) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(cx, cy);
            ctx.rotate(dir * t * 0.00042);
            var N = 16;
            for (var i = 0; i < N; i++) {
              var ang = (i / N) * PI2;
              var strength = (i % 2 === 0) ? 1 : 0.4;
              ctx.save();
              ctx.rotate(ang);
              var grad = ctx.createLinearGradient(coreR * 0.35, 0, maxR, 0);
              grad.addColorStop(0, rgba(0));
              grad.addColorStop(1, rgba(streakA * strength));
              ctx.strokeStyle = grad;
              ctx.lineWidth = 1.3;
              ctx.beginPath();
              ctx.moveTo(coreR * 0.35, 0);
              ctx.lineTo(maxR, 0);
              ctx.stroke();
              ctx.restore();
            }
            ctx.restore();
          }

          // 4) neon iris ring(s) ----------------------------------------------
          var ringR = burst > 0
            ? maxR * (1 + 0.75 * burst)              // reveal: burst outward
            : (0.14 + 0.9 * irisP) * maxR;           // cover:  bloom outward
          var ringA = burst > 0 ? baseA * (1 - burst) + (1 - burst) * 0.9 : baseA;
          ringA = clamp01(ringA);
          var ringW = (2 + 7 * (1 - irisP)) + (isExit ? 1 : 0);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = ringA;
          ctx.strokeStyle = hex;
          ctx.lineWidth = ringW;
          ctx.shadowColor = hex;
          ctx.shadowBlur = 34;
          ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, PI2); ctx.stroke();
          // faint inner echo ring
          ctx.globalAlpha = ringA * 0.4;
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.arc(cx, cy, ringR * 0.68, 0, PI2); ctx.stroke();
          ctx.restore();

          // 5) scanlines (multiply-ish overlay) -------------------------------
          if (baseA > 0.02) {
            ctx.save();
            ctx.globalAlpha = baseA * 0.35;
            ctx.fillStyle = _getScanPattern(ctx);
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
          }

          // 6) vignette -------------------------------------------------------
          ctx.save();
          ctx.globalAlpha = baseA;
          var vig = ctx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR);
          vig.addColorStop(0, 'rgba(0,0,0,0)');
          vig.addColorStop(1, 'rgba(0,0,0,0.7)');
          ctx.fillStyle = vig;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();

          // 7) title + sub-line -----------------------------------------------
          if (titleA > 0.01) {
            var tSize = Math.max(15, Math.min(26, W * 0.02));
            var slide = (1 - clamp01(titleA)) * 10;   // subtle rise-in
            _drawTracked(ctx, cx, cy - tSize * 0.55 + slide, label,
                         tSize, titleA, '#ffffff', tSize * 0.30, hex, rgba(0.35));
            var sSize = Math.max(9, Math.min(13, W * 0.011));
            _drawTracked(ctx, cx, cy + tSize * 1.15, sub,
                         sSize, titleA * 0.85, rgba(0.75), sSize * 0.34, hex, rgba(0.25));
          }

          // 8) LOADING screen — themed SHADDAI hexagram glyph + progress spinner +
          //    animated "LOADING…" dots. Only while the screen is (near) opaque, so it
          //    reads as a deliberate loading card, never a freeze. -----------------
          if (baseA > 0.9) {
            var la  = baseA * clamp01((t - COVER * 0.55) / 220);   // fade the loader in
            if (la > 0.01) {
              var short = Math.min(W, H);
              var gr    = short * 0.052;                            // glyph / ring radius
              var ly    = cy + short * 0.17;                        // loader Y (below title)

              // rotating SHADDAI hexagram (two overlaid triangles)
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = la * 0.85;
              ctx.translate(cx, ly);
              ctx.rotate(t * 0.0007);
              ctx.strokeStyle = hex;
              ctx.lineWidth = 2;
              ctx.shadowColor = hex;
              ctx.shadowBlur = 14;
              var gg = gr * 0.62;
              for (var tri = 0; tri < 2; tri++) {
                ctx.beginPath();
                for (var v = 0; v < 3; v++) {
                  var ga = tri * Math.PI + (v / 3) * PI2 - Math.PI / 2;
                  var gx = Math.cos(ga) * gg, gy2 = Math.sin(ga) * gg;
                  if (v === 0) ctx.moveTo(gx, gy2); else ctx.lineTo(gx, gy2);
                }
                ctx.closePath(); ctx.stroke();
              }
              ctx.restore();

              // sweeping progress arc around the glyph
              var spin = (t * 0.006) % PI2;
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.translate(cx, ly);
              ctx.strokeStyle = hex;
              ctx.shadowColor = hex; ctx.shadowBlur = 16;
              ctx.globalAlpha = la * 0.30; ctx.lineWidth = 2;      // faint full ring
              ctx.beginPath(); ctx.arc(0, 0, gr, 0, PI2); ctx.stroke();
              ctx.globalAlpha = la;        ctx.lineWidth = 3;      // bright sweep
              ctx.beginPath(); ctx.arc(0, 0, gr, spin, spin + Math.PI * 1.25); ctx.stroke();
              ctx.restore();

              // LOADING label with animated dots
              var dots = new Array(1 + (Math.floor(t / 300) % 4)).join('.') + '';
              var lSize = Math.max(9, Math.min(13, W * 0.0105));
              _drawTracked(ctx, cx, ly + gr + lSize * 2.0,
                           (isExit ? 'RETURNING' : 'LOADING') + ' ' + dots,
                           lSize, la * 0.92, rgba(0.9), lSize * 0.34, hex, rgba(0.3));
            }
          }
        }

        // tracked (letter-spaced) glowing text, centered on cx --------------
        function _drawTracked(ctx, cx, y, txt, size, alpha, fill, tracking, glowHex, glow2) {
          ctx.save();
          ctx.globalAlpha = clamp01(alpha);
          ctx.font = '700 ' + size + 'px "Orbitron","Share Tech Mono","Courier New",monospace';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          var i, total = 0;
          for (i = 0; i < txt.length; i++) total += ctx.measureText(txt[i]).width + tracking;
          total -= tracking;
          var x = cx - total / 2;
          ctx.shadowColor = glowHex;
          ctx.shadowBlur = size * 1.0;
          ctx.fillStyle = fill;
          for (i = 0; i < txt.length; i++) {
            var ch = txt[i];
            ctx.fillText(ch, x, y);
            x += ctx.measureText(ch).width + tracking;
          }
          ctx.restore();
        }

        // ── rAF loop ─────────────────────────────────────────────────────────
        function frame(now) {
          if (!_playing || !_ctx) return;   // finished / cancelled
          if (_start === 0) _start = now;
          var t = now - _start;

          // …once we're in the fully-opaque HOLD, fire done() (scene swap is hidden).
          // done() must run BEFORE the ready gate so readyFn() can observe its effect.
          if (t >= COVER && !_doneCalled) {
            _doneCalled = true;
            if (typeof done === 'function') { try { done(); } catch (e) {} }
          }

          // READY GATE — hold the opaque LOADING screen at the end of HOLD until the
          // caller's assets are ready (readyFn), capped at MAX_WAIT. No readyFn ⇒ the
          // fixed timeline runs unchanged. Guarantees the interior is fully built
          // before the black lifts — no lag / no pop on reveal.
          if (readyFn && _doneCalled && !_ready && t >= COVER + HOLD) {
            if (_gateT0 === 0) _gateT0 = now;
            if (readyFn() || (now - _gateT0) >= MAX_WAIT) _ready = true;
            _start = now - (COVER + HOLD);   // freeze time at hold-end this frame
            t = COVER + HOLD;
          }

          if (t > TOTAL) t = TOTAL;

          draw(t);   // paint THIS frame

          if (t >= TOTAL) { _finish(); return; }
          _raf = requestAnimationFrame(frame);
        }

        _raf = requestAnimationFrame(frame);
      }

    }; // return API object
  }; // return factory

}());
