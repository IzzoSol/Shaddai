/* ============================================================================
 * SHADDAI · DESCENT THROUGH SCALE
 * Scene VII — ARRIVAL (the finale)
 *
 * The ascension arrival at SHADDAI / Kether (the Crown):
 *   0.0 -> 0.4  a gold CROWN descends onto the shield
 *   0.4 -> 0.7  the green-neon SH SHIELD SIGIL ignites; particle streams
 *               converge inward into the sigil (cyber-sacred circuit traces)
 *   0.7 -> 1.0  the Cinzel word "SHADDAI" glitch-resolves via an RGB
 *               channel-split reveal, then holds steady with the tagline.
 *
 * CINEMATIC CAMERA (keyed to p.local + time):
 *   - slow PUSH-IN toward the SH sigil / Crown as p.local rises
 *   - on "impact" near p.local -> 1: a RACK-FOCUS snap to tack-sharp with a
 *     light-ray burst — shield powers on (neon flicker-on, circuit traces
 *     igniting sequentially), gold Crown flares, glitch-fracture particles
 *     settle.
 *
 * Vanilla canvas 2D. No libraries, no external assets. No per-frame allocation:
 * every radial/linear gradient is pre-rendered ONCE to an offscreen canvas and
 * blitted via drawImage (see spriteCache below — mirrors scene-molecules.js
 * glowSprite/elSprite/gridCache). SHELL clears the canvas and sets
 * ctx.globalAlpha = p.alpha before draw(). We never clearRect; we reset any
 * composite/filter we touch.
 * ==========================================================================*/
(function () {
  'use strict';
  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- persistent state (allocated once in init) ----------------------------
  var S = {
    w: 0, h: 0, dpr: 1,
    cx: 0, cy: 0,
    N: 220,                 // converging particle count
    px: null, py: null,     // current position
    ax: null, ay: null,     // anchor / target on the sigil ring
    sp: null,               // per-particle inward speed
    ph: null,               // per-particle phase (twinkle)
    hue: null,              // 0 emerald / 1 cyan / 2 gold selector
    NR: 10,                 // radiating circuit traces
    trAng: null, trLen: null,
    ready: false
  };

  function alloc(n) {
    S.px = new Float32Array(n);
    S.py = new Float32Array(n);
    S.ax = new Float32Array(n);
    S.ay = new Float32Array(n);
    S.sp = new Float32Array(n);
    S.ph = new Float32Array(n);
    S.hue = new Uint8Array(n);
  }

  // ===========================================================================
  // PERF: pre-rendered gradient sprites (drawImage instead of per-frame
  // createRadialGradient). Each distinct gradient is built ONCE and cached in
  // this module-scoped object, keyed by name. Colours come from PAL so we key
  // on the resolved colour string too and rebuild only if the palette changes.
  // ===========================================================================
  var spriteCache = {};      // key -> offscreen canvas
  var spritePAL = null;      // palette signature the sprites were built for

  function mkCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  // radial glow sprite: solid colour core -> transparent edge.
  // `stops` = array of [offset, cssColor]. Drawn centered, radius = size/2.
  function radialSprite(key, size, stops) {
    var c = spriteCache[key];
    if (c) return c;
    c = mkCanvas(size);
    var g = c.getContext('2d');
    var r = size / 2;
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    spriteCache[key] = c;
    return c;
  }

  // palette signature — rebuild sprites if PAL colours change between scenes
  function palSig(PAL) {
    return PAL.gold + '|' + PAL.emerald + '|' + PAL.cyan + '|' + PAL.ink;
  }

  // Build every gradient sprite once for the current palette.
  function buildSprites(PAL) {
    var sig = palSig(PAL);
    if (spritePAL === sig) return;      // already built for this palette
    spriteCache = {};
    spritePAL = sig;

    // crown impact shimmer (gold core -> transparent)
    radialSprite('impact', 128, [
      [0, PAL.gold],
      [1, 'rgba(0,0,0,0)']
    ]);

    // core sigil bloom (emerald core -> faint -> transparent)
    radialSprite('coreBloom', 160, [
      [0, PAL.emerald],
      [0.5, 'rgba(0,255,156,0.12)'],
      [1, 'rgba(0,0,0,0)']
    ]);

    // per-particle spark sprites (soft round glow, one per hue)
    radialSprite('sparkEmerald', 32, [
      [0, sparkCore(PAL.emerald)],
      [0.4, sparkMid(PAL.emerald)],
      [1, 'rgba(0,0,0,0)']
    ]);
    radialSprite('sparkCyan', 32, [
      [0, sparkCore(PAL.cyan)],
      [0.4, sparkMid(PAL.cyan)],
      [1, 'rgba(0,0,0,0)']
    ]);
    radialSprite('sparkGold', 32, [
      [0, sparkCore(PAL.gold)],
      [0.4, sparkMid(PAL.gold)],
      [1, 'rgba(0,0,0,0)']
    ]);

    // light-ray burst core (white-hot gold -> transparent) for the power-on
    radialSprite('rayCore', 256, [
      [0, 'rgba(255,255,255,0.95)'],
      [0.12, PAL.gold],
      [0.4, 'rgba(232,196,92,0.28)'],
      [1, 'rgba(0,0,0,0)']
    ]);

    // rack-focus / power-on flash (emerald+white bloom) for the sigil ignite
    radialSprite('powerFlash', 256, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.18, PAL.emerald],
      [0.5, 'rgba(0,255,156,0.16)'],
      [1, 'rgba(0,0,0,0)']
    ]);
  }

  // helpers to derive translucent versions of a solid PAL colour for spark cores
  function sparkCore(col) { return withAlpha(col, 0.95); }
  function sparkMid(col) { return withAlpha(col, 0.35); }
  // Accept #rrggbb or hsl()/rgb(); wrap solid colours to rgba with alpha where
  // possible, else fall back to the colour itself (still valid).
  function withAlpha(col, a) {
    if (col.charAt(0) === '#' && (col.length === 7 || col.length === 4)) {
      var r, g, b;
      if (col.length === 7) {
        r = parseInt(col.slice(1, 3), 16);
        g = parseInt(col.slice(3, 5), 16);
        b = parseInt(col.slice(5, 7), 16);
      } else {
        r = parseInt(col.charAt(1) + col.charAt(1), 16);
        g = parseInt(col.charAt(2) + col.charAt(2), 16);
        b = parseInt(col.charAt(3) + col.charAt(3), 16);
      }
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    return col; // hsl()/named — used as-is (core stop is opaque anyway)
  }

  // draw a cached radial sprite centered at (x,y) scaled to diameter d
  function blit(ctx, key, x, y, d) {
    var c = spriteCache[key];
    if (!c) return;
    var r = d * 0.5;
    ctx.drawImage(c, x - r, y - r, d, d);
  }

  // ---- STATIC background overlay cached to offscreen (built on resize) ------
  // A faint vignette + sacred-geometry ring frame behind the sigil. This never
  // animates, so we render it once per size and blit it each frame.
  var bgCache = null, bgW = 0, bgH = 0, bgSig = null;
  function buildBackground(env) {
    var w = env.w, h = env.h, PAL = env.PAL;
    var sig = w + 'x' + h + '|' + palSig(PAL);
    if (bgCache && bgSig === sig) return;
    bgSig = sig; bgW = w; bgH = h;
    bgCache = mkCanvas(1);   // placeholder; resized below
    bgCache.width = w; bgCache.height = h;
    var g = bgCache.getContext('2d');

    // deep radial vignette centered on the sigil
    var cx = w * 0.5, cy = h * 0.46;
    var vg = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.10,
      cx, cy, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // faint concentric sacred-geometry rings behind the sigil
    var base = Math.min(w, h) * 0.12;
    g.strokeStyle = 'rgba(0,255,156,0.05)';
    g.lineWidth = 1;
    for (var k = 1; k <= 4; k++) {
      g.beginPath();
      g.arc(cx, cy, base * (1.0 + k * 0.9), 0, Math.PI * 2);
      g.stroke();
    }
  }

  function layout(env) {
    S.w = env.w; S.h = env.h; S.dpr = env.dpr;
    S.cx = env.w * 0.5;
    // sigil sits a little below vertical center; crown lands just above it
    S.cy = env.h * 0.46;
    var ring = Math.min(env.w, env.h) * 0.12; // sigil convergence radius

    for (var i = 0; i < S.N; i++) {
      var a = (i / S.N) * Math.PI * 2 + (i % 7) * 0.37;
      // anchor point on the sigil ring (where particles converge to)
      S.ax[i] = S.cx + Math.cos(a) * ring;
      S.ay[i] = S.cy + Math.sin(a) * ring;
      // spawn far out along the same bearing
      var far = ring + (Math.min(env.w, env.h) * 0.55) * (0.35 + ((i * 131 % 100) / 100));
      S.px[i] = S.cx + Math.cos(a) * far;
      S.py[i] = S.cy + Math.sin(a) * far;
      S.sp[i] = 0.010 + ((i * 53 % 100) / 100) * 0.020;
      S.ph[i] = (i * 0.618) % (Math.PI * 2);
      S.hue[i] = i % 3;
    }

    // radiating circuit traces (fixed bearings, drawn from the shield outward)
    if (!S.trAng) { S.trAng = new Float32Array(S.NR); S.trLen = new Float32Array(S.NR); }
    for (var k = 0; k < S.NR; k++) {
      S.trAng[k] = (k / S.NR) * Math.PI * 2 + 0.2;
      S.trLen[k] = ring * (2.1 + ((k * 37 % 100) / 100) * 1.4);
    }

    buildBackground(env);
    S.ready = true;
  }

  // ---- helpers --------------------------------------------------------------
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(x, a, b) { return clamp01((x - a) / (b - a)); }
  // expo ease-out — good for climactic snaps (rack-focus)
  function easeOutExpo(t) { t = clamp01(t); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  // draw the gold crown centered at (x,y) with given half-width scale s
  function drawCrown(ctx, x, y, s, gold, glow) {
    var bw = s;                 // base half width
    var bh = s * 0.30;          // band height
    var ph = s * 0.62;          // peak height
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.fillStyle = gold;
    ctx.lineWidth = Math.max(1.4, s * 0.05);
    ctx.lineJoin = 'round';
    ctx.shadowColor = gold;
    ctx.shadowBlur = glow;

    // crown silhouette: three peaks over a band
    ctx.beginPath();
    ctx.moveTo(x - bw, y + bh * 0.5);
    ctx.lineTo(x - bw, y - bh * 0.5);
    ctx.lineTo(x - bw * 0.55, y - ph);       // left peak
    ctx.lineTo(x - bw * 0.28, y - bh * 0.5);
    ctx.lineTo(x, y - ph * 1.12);            // center peak
    ctx.lineTo(x + bw * 0.28, y - bh * 0.5);
    ctx.lineTo(x + bw * 0.55, y - ph);       // right peak
    ctx.lineTo(x + bw, y - bh * 0.5);
    ctx.lineTo(x + bw, y + bh * 0.5);
    ctx.closePath();
    ctx.stroke();

    // band highlight
    ctx.globalAlpha *= 0.35;
    ctx.fillRect(x - bw, y + bh * 0.05, bw * 2, bh * 0.35);
    ctx.globalAlpha /= 0.35;

    // peak jewels
    var jr = s * 0.09;
    var jy = [y - ph, y - ph * 1.12, y - ph];
    var jx = [x - bw * 0.55, x, x + bw * 0.55];
    for (var j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.arc(jx[j], jy[j], jr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // draw the neon-green SH shield sigil, rotated by `rot`, ignition 0..1.
  // `traceLit` (0..1) drives SEQUENTIAL circuit-trace ignition (power-on).
  function drawShield(ctx, x, y, s, rot, ignite, traceLit, emerald, cyan, ink) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    var w = s, h = s * 1.28;
    var glow = 6 + 26 * ignite;

    // circuit traces radiating outward (cyber-sacred), grow with ignition.
    // They light SEQUENTIALLY: trace k turns on as traceLit passes k/NR.
    ctx.save();
    ctx.strokeStyle = cyan;
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.shadowColor = cyan;
    ctx.shadowBlur = glow * 0.6;
    var baseAlpha = ctx.globalAlpha;
    for (var k = 0; k < S.NR; k++) {
      // per-trace ignition window (staggered)
      var lit = clamp01((traceLit * (S.NR + 2) - k));   // 0..1 ramp per trace
      if (lit <= 0) continue;
      var a = S.trAng[k];
      var L = S.trLen[k] * ignite * lit;
      ctx.globalAlpha = baseAlpha * 0.55 * ignite * lit;
      var sx = Math.cos(a) * (w * 0.5), sy = Math.sin(a) * (h * 0.5);
      var mx = Math.cos(a) * (w * 0.5 + L * 0.6), my = Math.sin(a) * (h * 0.5 + L * 0.6);
      var ex = Math.cos(a) * (w * 0.5 + L), ey = Math.sin(a) * (h * 0.5 + L);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(mx, my);
      // right-angle jog = circuit-board feel
      ctx.lineTo(mx - Math.sin(a) * L * 0.18, my + Math.cos(a) * L * 0.18);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // node cap
      ctx.beginPath();
      ctx.arc(ex, ey, s * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = cyan;
      ctx.fill();
    }
    ctx.restore();

    // shield outline (neon green)
    ctx.strokeStyle = emerald;
    ctx.lineWidth = Math.max(1.6, s * 0.055);
    ctx.lineJoin = 'round';
    ctx.shadowColor = emerald;
    ctx.shadowBlur = glow;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(w * 0.5, -h * 0.34);
    ctx.lineTo(w * 0.5, h * 0.08);
    ctx.quadraticCurveTo(w * 0.5, h * 0.42, 0, h * 0.5);
    ctx.quadraticCurveTo(-w * 0.5, h * 0.42, -w * 0.5, h * 0.08);
    ctx.lineTo(-w * 0.5, -h * 0.34);
    ctx.closePath();
    ctx.stroke();

    // inner rim
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    var im = 0.82;
    ctx.moveTo(0, -h * 0.5 * im);
    ctx.lineTo(w * 0.5 * im, -h * 0.34 * im);
    ctx.lineTo(w * 0.5 * im, h * 0.08 * im);
    ctx.quadraticCurveTo(w * 0.5 * im, h * 0.42 * im, 0, h * 0.5 * im);
    ctx.quadraticCurveTo(-w * 0.5 * im, h * 0.42 * im, -w * 0.5 * im, h * 0.08 * im);
    ctx.lineTo(-w * 0.5 * im, -h * 0.34 * im);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha /= 0.5;

    // "SH" monogram
    ctx.shadowBlur = glow * 0.8;
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + (s * 0.42) + 'px Cinzel, serif';
    ctx.globalAlpha *= (0.5 + 0.5 * ignite);
    ctx.fillText('SH', 0, -h * 0.02);
    ctx.restore();
  }

  // draw "SHADDAI" with an RGB channel-split glitch that settles to 0 offset
  function drawWordmark(ctx, x, y, size, glitch, ink, void_) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + size + 'px Cinzel, serif';

    var word = 'SHADDAI';
    // base offset scales with glitch (chromatic aberration)
    var o = 2 + glitch * (size * 0.16);
    // jitter (deterministic-ish wobble that dies out with glitch)
    var jx = Math.sin(y + o * 3.1) * glitch * size * 0.05;
    var jy = Math.cos(o * 2.3) * glitch * size * 0.03;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    ctx.fillStyle = '#ff2b3a'; // red channel
    ctx.fillText(word, x - o + jx, y + jy * 0.5);
    ctx.fillStyle = '#00ff9c'; // green channel (emerald)
    ctx.fillText(word, x, y);
    ctx.fillStyle = '#3aa0ff'; // blue channel
    ctx.fillText(word, x + o - jx, y - jy * 0.5);
    ctx.restore();

    // crisp settled glyph on top (fades in as glitch dies)
    ctx.globalAlpha *= clamp01(1 - glitch * 1.4);
    ctx.fillStyle = ink;
    ctx.shadowColor = '#00ff9c';
    ctx.shadowBlur = 14;
    ctx.fillText(word, x, y);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  window.__DESCENT.scenes.push({
    id: 'arrival',
    label: 'VII · ARRIVAL',

    init: function (env) {
      alloc(S.N);
      layout(env);
      buildSprites(env.PAL);
    },

    resize: function (env) {
      layout(env);
      buildSprites(env.PAL);
    },

    draw: function (ctx, env, p, mouse, t) {
      if (!S.ready) layout(env);
      var PAL = env.PAL;
      buildSprites(PAL);            // no-op unless palette changed (cached)
      buildBackground(env);         // no-op unless size/palette changed (cached)

      var lp = p.local;
      var reduced = !!env.reduced;
      var lowfx = !!env.lowfx;
      var q = env.q || 1;

      var s = Math.min(env.w, env.h) * 0.12;   // sigil scale (pre-camera)
      var sx = S.cx, sy = S.cy;

      // ---- phase envelopes --------------------------------------------------
      var pCrown = seg(lp, 0.0, 0.40);   // crown descent
      var pIgnite = seg(lp, 0.40, 0.70); // sigil ignite + convergence
      var pGlitch = seg(lp, 0.70, 1.0);  // wordmark resolve

      // ======================================================================
      // CINEMATIC CAMERA — procedural push-in + rack-focus power-on.
      //   push : slow zoom toward the sigil/Crown as p.local rises (0 -> ~0.88)
      //   impact: near p.local -> 1 a snap "settle" (rack focus) with a bloom
      //           of defocus that resolves to tack-sharp.
      // ======================================================================
      // slow, eased push-in that accelerates into the finale
      var push = 1 + easeOutExpo(seg(lp, 0.0, 0.92)) * 0.30;  // up to 1.30x
      // a subtle breathing float on the camera (skipped when reduced/lowfx)
      if (!reduced && !lowfx) push += Math.sin(t * 0.0016) * 0.006;

      // impact window: the climactic "power-on" snap around the ignite->glitch seam
      var impactRaw = seg(lp, 0.60, 0.80);          // 0..1 across the snap
      var impact = ease(impactRaw);
      // a short punch-in kick right at the seam that eases back out
      var kick = Math.sin(clamp01(impactRaw) * Math.PI) * 0.05; // 0 -> up -> 0
      var zoom = push + kick;

      // rack-focus defocus: blurry just before impact, snaps sharp at impact.
      // (blur only when supported + not reduced/lowfx to stay cheap on mobile)
      var defocus = (1 - easeOutExpo(seg(lp, 0.52, 0.72))) * (impactRaw > 0 ? 1 : 0);
      var canFilter = !reduced && !lowfx && ('filter' in ctx);

      // Apply the camera transform around the sigil so the push-in tracks it.
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(zoom, zoom);
      ctx.translate(-sx, -sy);

      // static cached background (vignette + geometry rings) under everything
      if (bgCache) {
        ctx.save();
        ctx.globalAlpha = p.alpha * (0.55 + 0.45 * ease(seg(lp, 0, 0.5)));
        ctx.drawImage(bgCache, 0, 0);
        ctx.restore();
      }

      // rack-focus blur wraps the whole sigil composition
      if (canFilter && defocus > 0.01) {
        ctx.filter = 'blur(' + (defocus * 6).toFixed(2) + 'px)';
      }

      // ---- mouse influence --------------------------------------------------
      var mx = mouse ? mouse.x : sx, my = mouse ? mouse.y : sy;
      // shield rotates slightly toward cursor
      var toAng = Math.atan2(my - sy, mx - sx);
      var rot = reduced ? 0 : Math.sin(toAng) * 0.12;

      // ================= CROWN (Kether) descends =============================
      var landY = sy - s * 1.35;                 // resting spot above the shield
      var startY = -s * 1.2;                     // off the top edge
      var cy = startY + (landY - startY) * ease(pCrown);
      // crown flares brighter through impact (powering on above the shield)
      var crownGlow = 8 + 30 * pCrown + 40 * impact
        + ((reduced || lowfx) ? 0 : Math.sin(t * 0.004) * 4);
      drawCrown(ctx, sx, cy, s * 0.9, PAL.gold, crownGlow);

      // impact shimmer when it lands — cached gold sprite (was per-frame gradient)
      if (pCrown > 0.85) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = p.alpha * ((pCrown - 0.85) / 0.15 * 0.6);
        blit(ctx, 'impact', sx, landY, s * 4);
        ctx.restore();
      }

      // ================= SH SHIELD SIGIL ====================================
      // sequential trace ignition + a neon flicker-on right at power-up.
      var traceLit = ease(pIgnite);
      var flickerOn = 1;
      if (!reduced && impactRaw > 0 && impactRaw < 1) {
        // brief stutter as the neon strikes (deterministic square-ish flicker)
        var fl = Math.sin(t * 0.06) * Math.sin(t * 0.017);
        flickerOn = 0.6 + 0.4 * (fl > -0.2 ? 1 : 0.3);
      }
      var igniteVis = clamp01(pIgnite * flickerOn + impact * 0.3);
      drawShield(ctx, sx, sy, s, rot, igniteVis, traceLit, PAL.emerald, PAL.cyan, PAL.ink);

      // ================= CONVERGING PARTICLE STREAMS ========================
      // Sparks now blit a cached soft-glow sprite (per hue) instead of arc-fill;
      // count is reduced under lowfx / low q to keep the loop cheap.
      if (pIgnite > 0 && !reduced) {
        var pCount = S.N;
        if (lowfx) pCount = (S.N * 0.4) | 0;
        else if (q < 1) pCount = (S.N * (0.55 + 0.45 * q)) | 0;

        var sparkKeys = ['sparkEmerald', 'sparkCyan', 'sparkGold'];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < pCount; i++) {
          // move inward toward the anchor point on the sigil ring
          var dx = S.ax[i] - S.px[i];
          var dy = S.ay[i] - S.py[i];
          var d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
          var step = S.sp[i] * (1 + pIgnite * 2);
          S.px[i] += dx * step;
          S.py[i] += dy * step;
          // when it arrives, respawn far out to keep the stream alive
          if (d < s * 0.14) {
            var a2 = Math.atan2(S.ay[i] - sy, S.ax[i] - sx);
            var far = s + Math.min(env.w, env.h) * 0.5 * (0.35 + ((i * 131 % 100) / 100));
            S.px[i] = sx + Math.cos(a2) * far;
            S.py[i] = sy + Math.sin(a2) * far;
          }
          var tw = 0.5 + 0.5 * Math.sin(t * 0.006 + S.ph[i]);
          ctx.globalAlpha = p.alpha * pIgnite * (0.35 + 0.55 * tw);
          var dia = (1.1 + tw * 1.6) * 5.5;         // sprite covers glow radius
          blit(ctx, sparkKeys[S.hue[i]], S.px[i], S.py[i], dia);
        }
        ctx.restore();
        ctx.globalAlpha = p.alpha; // restore shell alpha
      }

      // core bloom at the sigil — cached emerald sprite (was per-frame gradient)
      if (pIgnite > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = p.alpha * pIgnite * (reduced ? 0.5 : 0.7);
        blit(ctx, 'coreBloom', sx, sy, s * 3.6);
        ctx.restore();
      }

      // ================= POWER-ON LIGHT-RAY BURST ===========================
      // At impact the shield "powers on": a white-hot ray burst + power flash
      // blooms from the sigil, then settles. Cached sprites — no allocation.
      if (impact > 0.01 && !reduced) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // radial power flash (emerald/white) pulsing out then fading
        var flashA = Math.sin(clamp01(impactRaw) * Math.PI); // 0 -> 1 -> 0
        ctx.globalAlpha = p.alpha * flashA * (lowfx ? 0.45 : 0.7);
        blit(ctx, 'powerFlash', sx, sy, s * (3 + 3 * impact));

        // sweeping light rays (drawn as thin gold triangles via the cached ray
        // sprite masked by rotation) — skipped under lowfx to save fill.
        if (!lowfx) {
          var rays = 12;
          var burst = flashA;
          ctx.globalAlpha = p.alpha * burst * 0.5;
          for (var rI = 0; rI < rays; rI++) {
            var ra = (rI / rays) * Math.PI * 2 + t * 0.0004;
            var rd = s * (1.4 + 1.8 * impact);
            var rxp = sx + Math.cos(ra) * rd;
            var ryp = sy + Math.sin(ra) * rd;
            blit(ctx, 'rayCore', rxp, ryp, s * 1.6);
          }
        }
        ctx.restore();
        ctx.globalAlpha = p.alpha;
      }

      // reset rack-focus filter before drawing the tack-sharp UI layer
      if (canFilter) ctx.filter = 'none';

      // ================= "SHADDAI" GLITCH REVEAL ============================
      if (pGlitch > 0) {
        var wy = sy + s * 1.9;
        var wsize = Math.min(env.w * 0.13, s * 1.15);

        // base glitch dies from 1 -> ~0 across the phase (settles steady)
        var baseGlitch = clamp01(1 - ease(pGlitch));

        // mouse: glitch intensity rises when cursor is near the wordmark
        var extra = 0;
        if (mouse && !reduced) {
          var ddx = mx - sx, ddy = my - wy;
          var dist = Math.sqrt(ddx * ddx + ddy * ddy);
          var near = clamp01(1 - dist / (Math.min(env.w, env.h) * 0.4));
          extra = near * 0.35;
        }
        // faint idle flicker once settled (skipped when reduced/lowfx)
        var flick = (reduced || lowfx) ? 0 : Math.max(0, Math.sin(t * 0.02)) * 0.05 * (1 - baseGlitch);
        var glitch = clamp01(baseGlitch + extra + flick);

        ctx.save();
        ctx.globalAlpha = p.alpha * ease(seg(pGlitch, 0, 0.25));
        drawWordmark(ctx, sx, wy, wsize, glitch, PAL.ink, PAL.void);
        ctx.restore();

        // tagline (fades in after the word has mostly settled)
        var tagA = ease(seg(pGlitch, 0.45, 0.9));
        if (tagA > 0) {
          ctx.save();
          ctx.globalAlpha = p.alpha * tagA * 0.85;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = PAL.cyan;
          ctx.shadowColor = PAL.cyan;
          ctx.shadowBlur = 8;
          ctx.font = '400 ' + (wsize * 0.26) + 'px Cinzel, serif';
          ctx.fillText('One world, three views.', sx, wy + wsize * 0.62);
          ctx.restore();
        }
      }

      ctx.restore();          // camera transform
      // safety: ensure no filter leaks to the next scene
      if ('filter' in ctx) ctx.filter = 'none';
    }
  });
})();
