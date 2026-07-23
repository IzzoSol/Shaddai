/* ============================================================================
 * SHADDAI · DESCENT THROUGH SCALE
 * Scene VI — THE TREE OF LIFE
 * The Kabbalistic Tree rendered as a sacred machine: 10 Sephiroth as glowing
 * chakra-spectrum spheres on 3 pillars, 22 paths as pulsing circuit-wires with
 * animated energy flow, gold Hebrew-evocative glyphs, and a Flower-of-Life
 * geometry breathing behind it all. Tech + History + Sacred Geometry, fused.
 *
 * Contract: SHELL clears canvas + sets ctx.globalAlpha=p.alpha before draw().
 * We NEVER clearRect. We save/restore around composite='lighter' glow.
 * Coords are CSS pixels. NO per-frame allocation (gradients pre-rendered to
 * offscreen sprites; static paths cached to an offscreen canvas on resize).
 * Honors env.reduced + env.lowfx.
 *
 * CINEMATIC CAMERA: a procedural CRANE-UP keyed to p.local rises from Malkuth
 * toward Kether, FOLLOWING a wave-of-light pulse that climbs the tree igniting
 * each sephira in turn, paths flaring as the pulse passes, the Crown blooming
 * into a starburst near p.local -> 1.
 * ========================================================================== */
(function () {
  'use strict';
  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- PHOTO-REAL BASE image (lazy, non-blocking) ---------------------------
  // A luminous golden Tree of Life (PORTRAIT: taller than wide) rendered UNDER
  // the procedural neon geometry/pulse. CRISP-BASE recipe: request once,
  // onload/onerror (never throw), cover-fit, gentle ken-burns push-in, crane-up
  // vertical pan (base -> Crown), and — as the ONLY grade — a subtle radial EDGE
  // VIGNETTE. NO full-frame colour wash (that muddied the painting). The neon
  // pulse/crown/glyph-rain are layered additively ON TOP of this crisp base.
  // Procedural fallback if the image isn't (yet) loaded.
  var baseImg = { img: null, ok: false };
  var baseRequested = false;
  var BASE_SRC = '/assets/journey/tree-hd.jpg';
  function requestBaseImage() {
    if (baseRequested) return;
    baseRequested = true;
    try {
      var im = new Image();
      im.onload = function () { if (im.naturalWidth > 0) baseImg.ok = true; };
      im.onerror = function () { baseImg.ok = false; };
      im.src = BASE_SRC;
      baseImg.img = im;
    } catch (e) { baseImg.ok = false; }   // never throw from a lazy request
  }

  // Cached EDGE-VIGNETTE sprite (transparent center -> obsidian corners). Built
  // once, rebuilt only when the canvas size changes. Keeps the draw() hot path
  // free of per-frame createRadialGradient allocations. This is the ONLY grade
  // applied over the painting — no full-frame tint.
  var vignetteC = null, vignetteW = 0, vignetteH = 0;
  function vignetteSprite(w, h) {
    if (vignetteC && vignetteW === w && vignetteH === h) return vignetteC;
    var c = vignetteC || document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    var vg = g.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.34,
                                    w * 0.5, h * 0.5, Math.max(w, h) * 0.74);
    vg.addColorStop(0,    'rgba(6,8,11,0)');
    vg.addColorStop(0.72, 'rgba(6,8,11,0.16)');
    vg.addColorStop(1,    'rgba(6,8,11,0.5)');    // corners -> obsidian
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    vignetteC = c; vignetteW = w; vignetteH = h;
    return c;
  }

  // Draw the painted Tree beneath everything, CRISP. PORTRAIT art on a (usually
  // landscape) canvas -> COVER-FIT + center horizontally, then crane UP the
  // image with the camera as p.local advances (base -> Crown). Gentle ken-burns
  // push-in. ONLY grade = the cached radial edge vignette (NO full-frame wash).
  // Also publishes the on-screen mapping (crisp.* on the scene) so the additive
  // neon accents can align roughly with the painted sephiroth orbs. Falls back
  // to nothing (procedural tree remains) if the image isn't ready.
  function drawTreeBase(ctx, env, p, tt, scene) {
    var w = env.w, h = env.h, reduced = !!env.reduced;
    if (!(baseImg.ok && baseImg.img)) return false;   // -> caller keeps procedural-only
    var img = baseImg.img;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return false;

    var lz = p.local < 0 ? 0 : p.local > 1 ? 1 : p.local;
    // Ken-burns: gentle push-in as we ascend (+ a barely-there breath).
    var kb = (1.04 + lz * 0.10) + (reduced ? 0 : Math.sin(tt * 0.05) * 0.006);
    // COVER-FIT: fill the landscape canvas even though the source is taller.
    var sc = Math.max(w / iw, h / ih) * kb;
    var dw = iw * sc, dh = ih * sc;

    // CRANE-UP vertical pan: at lz=0 show the BASE (bottom of the painting),
    // at lz=1 show the CROWN (top). dy = -(dh-h)*(1-lz).
    var dx = (w - dw) * 0.5;            // centered horizontally
    var dy = -(dh - h) * (1 - lz);      // lz=0 -> bottom(base), lz=1 -> top(crown)

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, dx, dy, dw, dh);

    // ONLY grade: cached radial EDGE vignette (transparent center -> corners).
    // NO full-frame colour wash. Painting stays crisp and luminous.
    ctx.drawImage(vignetteSprite(w, h), 0, 0);
    ctx.restore();

    // Publish the painting->screen mapping so additive accents can sit on the
    // painted orbs. Sephiroth are laid out with x in [-1..1], y in [0..1] over
    // the painting's own frame; convert into current screen space.
    if (scene) {
      var cr = scene.crisp || (scene.crisp = {});
      cr.ok = true;
      cr.dx = dx; cr.dy = dy; cr.dw = dw; cr.dh = dh;
      // The painted tree spine occupies roughly the central 46% width and the
      // vertical band ~[0.06 .. 0.94] of the art. Map SEPH normalized coords.
      cr.spanX = dw * 0.23;                 // half-width of the pillar spread
      cr.topY  = dy + dh * 0.06;
      cr.botY  = dy + dh * 0.94;
      cr.midX  = dx + dw * 0.5;
    }
    return true;
  }

  // ---- Static structural data (allocated ONCE at module load) ---------------

  // The 10 Sephiroth in classic Kabbalah layout.
  // Normalized coords: x in [-1..1] across the 3 pillars, y in [0..1] top->bottom.
  // seq = ignition order for the bottom->top assembly (Malkuth=0 ... Kether=9).
  // hue = chakra spectrum: Malkuth deep red -> Kether violet/white.
  var SEPH = [
    // name         nx     ny     seq  hue   glyph-seed
    ['Kether',      0.00, 0.045,  9,  278, 0], // Crown  — violet/white
    ['Chokmah',    -0.62, 0.160,  8,  255, 1], // Wisdom — indigo
    ['Binah',       0.62, 0.160,  7,  228, 2], // Underst— blue-indigo
    ['Chesed',     -0.62, 0.380,  6,  200, 3], // Mercy  — cyan/blue
    ['Geburah',     0.62, 0.380,  5,  150, 4], // Sev.   — green/teal
    ['Tiphareth',   0.00, 0.500,  4,   95, 5], // Beauty — gold-green center
    ['Netzach',    -0.62, 0.620,  3,   48, 6], // Victory— gold/amber
    ['Hod',         0.62, 0.620,  2,   30, 7], // Splendor—orange
    ['Yesod',       0.00, 0.740,  1,   12, 8], // Found. — red-orange
    ['Malkuth',     0.00, 0.940,  0,  356, 9]  // Kingdom— deep red
  ];
  var KETHER = 0, MALKUTH = 9;

  // The 22 Paths (edges) as index pairs into SEPH — the traditional connections.
  var PATHS = [
    [0,1],[0,2],[0,5],        // Kether -> Chokmah, Binah, Tiphareth
    [1,2],[1,3],[1,5],        // Chokmah -> Binah, Chesed, Tiphareth
    [2,4],[2,5],              // Binah -> Geburah, Tiphareth
    [3,4],[3,5],[3,6],        // Chesed -> Geburah, Tiphareth, Netzach
    [4,5],[4,7],              // Geburah -> Tiphareth, Hod
    [5,6],[5,7],[5,8],        // Tiphareth -> Netzach, Hod, Yesod
    [6,7],[6,8],[6,9],        // Netzach -> Hod, Yesod, Malkuth
    [7,8],[7,9],              // Hod -> Yesod, Malkuth
    [8,9]                     // Yesod -> Malkuth
  ];

  // ---- PERF: pre-rendered sprites (drawImage instead of per-frame gradients) -
  // Sephira bloom halo, cached per hue bucket. (Replaces per-frame bloom
  // createRadialGradient — was ~10/frame.)
  var bloomCache = {};
  function bloomSprite(hue) {
    var key = Math.round(hue / 6) * 6;
    var c = bloomCache[key];
    if (c) return c;
    var S = 128; c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0,    hsl(key, 90, 62, 1));
    grd.addColorStop(0.35, hsl(key, 85, 55, 0.5));
    grd.addColorStop(1,    hsl(key, 80, 50, 0));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    bloomCache[key] = c; return c;
  }

  // Sephira core orb body (shaded sphere), cached per hue bucket. (Replaces
  // per-frame core createRadialGradient — was ~10/frame.) Alpha applied at
  // drawImage via globalAlpha, so bake at full opacity.
  var orbCache = {};
  function orbSprite(hue) {
    var key = Math.round(hue / 6) * 6;
    var c = orbCache[key];
    if (c) return c;
    var S = 128; c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var R = S / 2;
    var grd = g.createRadialGradient(
      R - R * 0.32, R - R * 0.34, R * 0.1, R, R, R);
    grd.addColorStop(0,   hsl(key, 95, 88, 1));
    grd.addColorStop(0.4, hsl(key, 90, 62, 1));
    grd.addColorStop(1,   hsl(key, 75, 26, 1));
    g.fillStyle = grd;
    g.beginPath(); g.arc(R, R, R, 0, TAU); g.fill();
    orbCache[key] = c; return c;
  }

  // Specular white highlight glint (single sprite, tinted white). (Replaces
  // per-frame highlight createRadialGradient — was ~10/frame.)
  var glintSprite_ = null;
  function glintSprite() {
    if (glintSprite_) return glintSprite_;
    var S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), R = S / 2;
    var grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    glintSprite_ = c; return c;
  }

  // Gold spark riding a wire (single sprite). (Replaces per-frame spark
  // createRadialGradient in drawWire — was up to ~22/frame.)
  var sparkSprite_ = null;
  function sparkSprite() {
    if (sparkSprite_) return sparkSprite_;
    var S = 48, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), R = S / 2;
    var grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0, 'rgba(232,196,92,1)');   // PAL.gold-ish, tinted at draw
    grd.addColorStop(1, 'rgba(232,196,92,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    sparkSprite_ = c; return c;
  }

  // Soft white-gold glow sprite for the wave-of-light pass that brightens the
  // PAINTED sephira positions as the pulse climbs. Cached once, tinted at draw
  // via globalAlpha (baked white so 'lighter' reads as luminous bloom).
  var waveGlow_ = null;
  function waveGlowSprite() {
    if (waveGlow_) return waveGlow_;
    var S = 160, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), R = S / 2;
    var grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0,    'rgba(255,248,224,0.85)');
    grd.addColorStop(0.32, hsl(46, 90, 66, 0.42));   // warm gold mid
    grd.addColorStop(0.62, hsl(150, 85, 58, 0.14));  // emerald falloff
    grd.addColorStop(1,    'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    waveGlow_ = c; return c;
  }

  // A thin horizontal "wave line" sprite (bright center, fading edges) that
  // sweeps up the painting marking the climbing wave-of-light front. Cached.
  var waveLine_ = null;
  function waveLineSprite() {
    if (waveLine_) return waveLine_;
    var W = 8, H = 96, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0,   'rgba(0,0,0,0)');
    grd.addColorStop(0.5, 'rgba(210,255,236,0.9)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    waveLine_ = c; return c;
  }

  // ---- Glyph-rain: faint gold hairline glyphs drifting down the painting.
  // Positions are deterministic (seeded once); we advance a shared time offset
  // so nothing is allocated per frame.
  var GRAIN = null;
  function glyphRain() {
    if (GRAIN) return GRAIN;
    var rnd = mulberry32(0x7A11 >>> 0);
    var n = 26, arr = new Array(n);
    for (var i = 0; i < n; i++) {
      arr[i] = { fx: rnd(), fy: rnd(), sp: 0.02 + rnd() * 0.05,
                 ph: rnd(), len: 0.02 + rnd() * 0.04, gs: (rnd() * 100) | 0 };
    }
    GRAIN = arr; return arr;
  }

  // Draw the additive neon accents DIRECTLY ON the crisp painting (screen space,
  // BEFORE the crane-up transform) so the pulse/glyph-rain/crown sit on the
  // painted orbs. All 'lighter'. Respects lowfx (skip glyph-rain, fewer glows).
  function drawBaseAccents(ctx, env, cr, p, tt, mouse) {
    var w = env.w, h = env.h, lowfx = !!env.lowfx, reduced = !!env.reduced;
    var lz = p.local < 0 ? 0 : p.local > 1 ? 1 : p.local;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var pa = ctx.globalAlpha;

    // Wave-of-light front climbs base(1)->crown(0) in painting-normalized y.
    var pulseYS = lz * lz * (3 - 2 * lz);       // smoothed 0..1 up the tree
    var frontUp = pulseYS;                       // 0=base .. 1=crown
    var frontY = cr.botY + (cr.topY - cr.botY) * frontUp;

    // (a) the sweeping wave line across the spine.
    var lineW = cr.spanX * 3.2, lineH = h * 0.10;
    ctx.globalAlpha = pa * (0.22 + 0.20 * Math.sin(tt * 2.2));
    ctx.drawImage(waveLineSprite(), cr.midX - lineW * 0.5, frontY - lineH * 0.5,
                  lineW, lineH);

    // (b) brighten each PAINTED sephira as the front passes its height.
    var glow = waveGlowSprite();
    var maxD2 = (Math.min(w, h) * 0.14); maxD2 = maxD2 * maxD2;
    for (var i = 0; i < SEPH.length; i++) {
      var sp = SEPH[i];
      var ox = cr.midX + sp[1] * cr.spanX;                 // painted orb x
      var oy = cr.botY + (cr.topY - cr.botY) * (1 - sp[2]);// painted orb y
      var orbUp = 1 - sp[2];
      var d = Math.abs(frontUp - orbUp);
      var k = 1 - Math.min(1, d / 0.15);
      k = k * k;                                            // sharp band
      // hover: brighten the nearest painted sephira.
      if (mouse && !reduced) {
        var mdx = ox - mouse.x, mdy = oy - mouse.y;
        if (mdx * mdx + mdy * mdy < maxD2) k = Math.max(k, 0.55);
      }
      if (k <= 0.01) continue;
      var gr = Math.max(cr.spanX * 0.5, 26) * (1.4 + k * 1.1);
      ctx.globalAlpha = pa * Math.min(0.9, 0.25 + k * 0.7);
      ctx.drawImage(glow, ox - gr, oy - gr, gr * 2, gr * 2);
    }

    // (c) faint gold glyph-rain drifting down (skip on lowfx).
    if (!lowfx && !reduced) {
      var grain = glyphRain();
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0016);
      ctx.strokeStyle = withAlpha(env.PAL.gold, 0.10);
      ctx.globalAlpha = pa * 0.5;
      var bandX0 = cr.midX - cr.spanX * 2.4, bandW = cr.spanX * 4.8;
      ctx.beginPath();
      for (var j = 0; j < grain.length; j++) {
        var gpt = grain[j];
        var yy = ((gpt.fy + tt * gpt.sp + gpt.ph) % 1);
        var gx = bandX0 + gpt.fx * bandW;
        var gy = cr.topY + yy * (cr.botY - cr.topY);
        var gl = gpt.len * (cr.botY - cr.topY);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx, gy + gl);
      }
      ctx.stroke();
    }

    // (d) Crown starburst near the top of the painting as local -> 1.
    var crownBlaze = smooth01((lz - 0.72) / 0.28);
    if (crownBlaze > 0.01) {
      var kx = cr.midX + SEPH[KETHER][1] * cr.spanX;
      var ky = cr.botY + (cr.topY - cr.botY) * (1 - SEPH[KETHER][2]);
      var R = Math.max(cr.spanX, 30) * (2.2 + crownBlaze * 3.4);
      ctx.globalAlpha = pa * clamp01(crownBlaze);
      ctx.drawImage(crownSprite(), kx - R, ky - R, R * 2, R * 2);
      if (!lowfx) {
        var rays = 16;
        ctx.strokeStyle = withAlpha('#ffffff', 0.28 * crownBlaze);
        ctx.lineWidth = 1.2;
        var rr = R * 0.5;
        ctx.beginPath();
        for (var kk = 0; kk < rays; kk++) {
          var ang = (kk / rays) * TAU + tt * 0.15;
          var len = rr * ((kk % 2 === 0 ? 1.0 : 0.55) * (0.7 + 0.3 * Math.sin(tt * 2 + kk)));
          ctx.moveTo(kx + Math.cos(ang) * rr, ky + Math.sin(ang) * rr);
          ctx.lineTo(kx + Math.cos(ang) * (rr + len), ky + Math.sin(ang) * (rr + len));
        }
        ctx.stroke();
      }
    }

    ctx.globalAlpha = pa;
    ctx.restore();
  }

  // ---- Scene ----------------------------------------------------------------

  window.__DESCENT.scenes.push({
    id: 'tree',
    label: 'VI · THE TREE OF LIFE',

    // --------------------------------------------------------------- init ----
    init: function (env) {
      var s = this;
      s.env = env;
      requestBaseImage();   // lazy-load the painted Tree base (non-blocking)

      // Pre-allocated screen-space buffers (filled each layout/draw).
      s.sx = new Float32Array(10);   // sphere screen x
      s.sy = new Float32Array(10);   // sphere screen y
      s.sr = new Float32Array(10);   // sphere screen radius
      s.sig = new Float32Array(10);  // ignition 0..1 per sphere
      s.pulse = new Float32Array(10);// per-sphere idle pulse phase

      // Per-path scratch (brightness/flow), avoids alloc in draw.
      s.pBright = new Float32Array(PATHS.length);
      s.pDraw = new Float32Array(PATHS.length);   // 0..1 draw progress (assembly)
      s.pFlare = new Float32Array(PATHS.length);  // 0..1 pulse flare per path

      // Cached glyph stroke tables — each sphere gets a small deterministic set
      // of short strokes forming an evocative "Hebrew-like" sigil. Built once.
      s.glyphs = new Array(10);
      for (var i = 0; i < 10; i++) s.glyphs[i] = buildGlyph(SEPH[i][4]);

      // Flower-of-Life circle center offsets (unit grid), built once.
      s.folOffsets = buildFlowerOffsets();

      // Smoothed parallax targets.
      s.pxx = 0; s.pxy = 0;

      // Offscreen cache for the STATIC dim path conduits (rebuilt on layout).
      s.pathCanvas = null;
      s.pathW = 0; s.pathH = 0;

      s.layout(env);
    },

    // ------------------------------------------------------------- resize ----
    resize: function (env) {
      this.env = env;
      this.layout(env);
    },

    // Compute base geometry (independent of parallax) in CSS pixels.
    layout: function (env) {
      var w = env.w, h = env.h;
      // Fit the tree into a tall central column.
      var margin = Math.min(w, h) * 0.10;
      var colW = Math.min(w * 0.62, (h - margin * 2) * 0.72);
      var colH = h - margin * 2;
      this.cx = w * 0.5;
      this.top = margin;
      this.colW = colW;
      this.colH = colH;
      // Base sphere radius scales with layout.
      this.baseR = Math.max(9, Math.min(w, h) * 0.028);
      this.pillarSpread = colW * 0.5; // how far pillars sit from center

      // ---- Pre-compute the STATIC "home" screen positions (no parallax) ----
      // Used to bake the dim conduit lines once. Parallax lean is applied only
      // to the DYNAMIC bright layer at draw time (a small offset the eye
      // forgives on the faint base conduits).
      if (!this.hx) { this.hx = new Float32Array(10); this.hy = new Float32Array(10); }
      var i, sp;
      for (i = 0; i < 10; i++) {
        sp = SEPH[i];
        this.hx[i] = this.cx + sp[1] * this.pillarSpread;
        this.hy[i] = this.top + sp[2] * this.colH;
      }
      this.buildPathCache(env);
    },

    // Bake the 22 dim conduit lines to an offscreen canvas ONCE per layout.
    // Only the dynamic energy-flow / assembly / flare is drawn live on top.
    buildPathCache: function (env) {
      var w = env.w, h = env.h;
      if (w <= 0 || h <= 0) return;
      var c = this.pathCanvas;
      if (!c) { c = document.createElement('canvas'); this.pathCanvas = c; }
      c.width = w; c.height = h;
      this.pathW = w; this.pathH = h;
      var g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.lineCap = 'round';
      g.lineWidth = 1.4;
      g.strokeStyle = withAlpha(env.PAL.emerald, 0.12);
      g.beginPath();
      for (var pi = 0; pi < PATHS.length; pi++) {
        var a = PATHS[pi][0], b = PATHS[pi][1];
        g.moveTo(this.hx[a], this.hy[a]);
        g.lineTo(this.hx[b], this.hy[b]);
      }
      g.stroke();
    },

    // --------------------------------------------------------------- draw ----
    draw: function (ctx, env, p, mouse, t) {
      var s = this;
      var w = env.w, h = env.h, PAL = env.PAL, reduced = env.reduced;
      var lowfx = !!env.lowfx;
      var tt = t * 0.001;
      var local = p.local;

      // ============ LAYER 0: PHOTO-REAL PAINTED TREE (base) ================
      // Drawn UNDER all procedural content. Crane-up vertical pan (base->Crown)
      // + ken-burns live inside drawTreeBase. Non-blocking: if the image hasn't
      // loaded yet this is a no-op and the procedural tree stands alone.
      requestBaseImage();
      var baseCrisp = drawTreeBase(ctx, env, p, tt, s);

      // When the CRISP painting is showing, the neon accents (pulse climbing
      // base->Crown, sephira glows, glyph-rain, Crown starburst) are layered
      // ADDITIVELY on the painting here, and the heavy procedural tree geometry
      // is SUPPRESSED so it never muddies the crisp art. The procedural tree
      // renders only as a FALLBACK (baseCrisp === false).
      if (baseCrisp) drawBaseAccents(ctx, env, s.crisp, p, tt, mouse);

      // --- Parallax: rotate/lean the whole tree toward the cursor ----------
      var tgx = 0, tgy = 0;
      if (mouse && !reduced) {
        tgx = (mouse.nx || 0) * (s.colW * 0.055);
        tgy = (mouse.ny || 0) * (s.colH * 0.030);
      }
      s.pxx += (tgx - s.pxx) * 0.08;
      s.pxy += (tgy - s.pxy) * 0.08;
      var leanX = s.pxx, leanY = s.pxy;
      var skew = (leanX / (s.colW || 1)) * 0.5;

      // ============ CINEMATIC CRANE-UP CAMERA ==============================
      // Camera rises from Malkuth (base) toward Kether (Crown) as local 0->1.
      // Eased in/out, reverent. Implemented as a vertical pan + gentle push-in
      // applied to the whole composition via translate/scale.
      var ce = easeInOut(clamp01(local));
      // Follow a WAVE-OF-LIGHT pulse that climbs the tree. The pulse's height
      // (0=base .. 1=crown) leads the crane slightly so the camera chases it.
      var pulseY = clamp01(local * 1.06);              // 0..1 up the tree
      var pulseYS = pulseY * pulseY * (3 - 2 * pulseY);// smoothed climb
      // World-space y of the pulse (screen px, home coords).
      var pulsePx = s.top + (1 - pulseYS) * s.colH;    // base(bottom)->crown(top)

      // Crane: shift the view so the focus travels from base up to crown, with
      // a subtle push-in that peaks mid-ascent then settles at the Crown.
      var focusStartY = s.top + s.colH * 0.86;         // near Malkuth
      var focusEndY   = s.top + s.colH * 0.10;         // near Kether
      var focusY = focusStartY + (focusEndY - focusStartY) * ce;
      var camY = (s.top + s.colH * 0.5) - focusY;      // translate to keep focus centred-ish
      camY *= 0.62;                                     // gentle, not a full lock
      var push = 1 + 0.14 * Math.sin(ce * Math.PI) + 0.10 * ce; // in then hold

      ctx.save();
      ctx.translate(s.cx, s.top + s.colH * 0.5);
      ctx.scale(push, push);
      ctx.translate(-s.cx, -(s.top + s.colH * 0.5) + camY);

      // --- Resolve screen positions + ignition -----------------------------
      var i, sp;
      for (i = 0; i < 10; i++) {
        sp = SEPH[i];
        var bx = sp[1] * s.pillarSpread;
        var by = sp[2] * s.colH;
        var depth = 1 - sp[2];
        s.sx[i] = s.cx + bx + leanX * (0.6 + depth * 0.7) - by * skew;
        s.sy[i] = s.top + by + leanY * (0.6 + depth * 0.5);

        // Assembly ignition: bottom->top by seq (0=Malkuth .. 9=Kether).
        var order = sp[3] / 9;                 // 0..1 up the tree
        var startAt = order * 0.62;
        var ig = (local - startAt) / 0.30;
        if (ig < 0) ig = 0; else if (ig > 1) ig = 1;
        ig = ig * ig * (3 - 2 * ig); // smoothstep
        s.sig[i] = ig;

        s.sr[i] = s.baseR;
        if (s.pulse[i] === 0) s.pulse[i] = i * 1.37; // seed once
      }

      // Per-sephira wave-of-light IGNITION KICK: bright flash as the climbing
      // pulse passes each orb's height. Peaks when pulse aligns with the orb.
      var wave = new_scratch(s);  // fills s._waveKick (no alloc after first)
      for (i = 0; i < 10; i++) {
        var orbY = SEPH[i][2];                       // 0..1 down the tree
        var orbUp = 1 - orbY;                        // 0..1 up
        var d = Math.abs(pulseYS - orbUp);
        // Narrow band -> sharp ignition flash as pulse crosses the orb.
        var k = 1 - Math.min(1, d / 0.14);
        s._waveKick[i] = k * k * s.sig[i];
      }

      // Kether blazes to full by local=1 (extra crown flare).
      var crownBlaze = smooth01((local - 0.72) / 0.28);

      // --- Mouse proximity: find nearest sphere ----------------------------
      var nearIdx = -1, nearD2 = 1e18;
      if (mouse && !reduced) {
        for (i = 0; i < 10; i++) {
          var dx0 = s.sx[i] - mouse.x, dy0 = s.sy[i] - mouse.y;
          var d2 = dx0 * dx0 + dy0 * dy0;
          if (d2 < nearD2) { nearD2 = d2; nearIdx = i; }
        }
      }

      // ================= PROCEDURAL TREE (FALLBACK ONLY) ===================
      // Only rendered when the crisp painting isn't available — otherwise the
      // painting IS the tree and only the additive accents (drawn above) show.
      if (!baseCrisp) {

      // ================= BACKGROUND: Flower of Life ========================
      // Faint sacred-geometry backdrop — skipped under lowfx.
      if (!lowfx) s.drawFlower(ctx, env, tt, local);

      // ================= PATHS: STATIC conduits (cached) ===================
      // Bake safety: rebuild if size drifted.
      if (!s.pathCanvas || s.pathW !== w || s.pathH !== h) s.buildPathCache(env);
      // The cached conduit lines follow the parallax lean via a cheap translate.
      if (s.pathCanvas) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(leanX * 0.8, leanY * 0.7);
        ctx.drawImage(s.pathCanvas, 0, 0);
        ctx.restore();
      }

      // ================= PATHS: DYNAMIC energy flow + flare ================
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var pi;
      for (pi = 0; pi < PATHS.length; pi++) {
        var a = PATHS[pi][0], b = PATHS[pi][1];
        var prog = Math.min(s.sig[a], s.sig[b]);
        s.pDraw[pi] = prog;
        if (prog <= 0.001) continue;

        var ax = s.sx[a], ay = s.sy[a], bx2 = s.sx[b], by2 = s.sy[b];

        // Path FLARE as the climbing pulse passes its midpoint.
        var midUp = 1 - (SEPH[a][2] + SEPH[b][2]) * 0.5;
        var fd = Math.abs(pulseYS - midUp);
        var flare = 1 - Math.min(1, fd / 0.16);
        flare = flare * flare;
        s.pFlare[pi] = flare;

        var bright = 0.35;
        var flowSpeed = 1.0;
        if (mouse && !reduced) {
          var mx0 = (ax + bx2) * 0.5 - mouse.x;
          var my0 = (ay + by2) * 0.5 - mouse.y;
          var md = Math.sqrt(mx0 * mx0 + my0 * my0);
          var prox = 1 - Math.min(1, md / (s.colW * 0.55));
          bright = 0.30 + prox * 0.85;
          flowSpeed = 1.0 + prox * 2.6;
        }
        bright += flare * 0.6;          // pulse igniting the path as it climbs
        flowSpeed += flare * 2.0;
        s.pBright[pi] = bright;

        drawWire(ctx, ax, ay, bx2, by2, prog, bright, flowSpeed, tt,
                 PAL, reduced, lowfx, pi);
      }
      ctx.restore();

      // ================= SEPHIROTH: chakra-spectrum spheres ================
      for (i = 0; i < 10; i++) {
        var ign = s.sig[i];
        if (ign <= 0.001) continue;
        sp = SEPH[i];
        var hue = sp[5];
        var x = s.sx[i], y = s.sy[i];

        var idle = 0.5 + 0.5 * Math.sin(tt * 1.6 + s.pulse[i]);
        var swell = (i === nearIdx) ? 1 : 0;
        var extra = (i === KETHER) ? crownBlaze : 0;
        var kick = s._waveKick[i];   // wave-of-light ignition flash

        var r = s.sr[i] * (0.55 + 0.45 * ign) *
                (1 + idle * 0.06 + swell * 0.28 + extra * 0.35 + kick * 0.30);

        drawSphere(ctx, x, y, r, hue, ign, idle, swell, extra, kick,
                   PAL, reduced, lowfx, tt);

        // Gold Hebrew-evocative glyph beside each sphere (hairline — skip on lowfx).
        if (!lowfx && ign > 0.35) {
          drawGlyph(ctx, s.glyphs[i], x, y, r, ign, PAL,
                    (i === nearIdx) ? 1 : 0.5);
        }
      }

      // ================= KETHER CROWN HALO / STARBURST (climax) ============
      if (crownBlaze > 0.01) {
        drawCrown(ctx, s.sx[KETHER], s.sy[KETHER], s.sr[KETHER],
                  crownBlaze, PAL, tt, reduced, lowfx);
      }

      } // end procedural-tree FALLBACK block (!baseCrisp)

      ctx.restore(); // crane-up camera transform
    }
  });

  // Lazily allocate the per-sephira wave-kick scratch buffer once.
  function new_scratch(s) {
    if (!s._waveKick) s._waveKick = new Float32Array(10);
    return s._waveKick;
  }

  // ---- Drawing helpers (module-scope, no per-frame closures) ---------------

  function drawWire(ctx, ax, ay, bx, by, prog, bright, flowSpeed, tt,
                    PAL, reduced, lowfx, seed) {
    var ex = ax + (bx - ax) * prog;
    var ey = ay + (by - ay) * prog;

    // Assembling bright conduit (drawn live; the dim base is in the cache).
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(PAL.emerald, 0.06 + bright * 0.12);
    ctx.lineWidth = 1.4;
    ctx.setLineDash(EMPTY_DASH);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Animated energy flow (moving dashes) — the "circuit" pulse.
    if (!reduced) {
      var flow = (tt * 42 * flowSpeed + seed * 11) % 22;
      ctx.setLineDash(FLOW_DASH);
      ctx.lineDashOffset = -flow;
      ctx.lineWidth = 1.8 + bright * 1.6;
      ctx.strokeStyle = withAlpha(PAL.cyan, 0.20 + bright * 0.55);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash(EMPTY_DASH);
      ctx.lineDashOffset = 0;

      // Gold spark riding the wire — cached sprite (was per-frame radial grad).
      var spf = (tt * 0.5 * flowSpeed + seed * 0.19) % 1;
      var spx = ax + (ex - ax) * spf;
      var spy = ay + (ey - ay) * spf;
      var sr = (1.6 + bright * 2.4) * 3;
      var spr = sparkSprite();
      var pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * Math.min(1, 0.9 * bright + 0.1);
      ctx.drawImage(spr, spx - sr, spy - sr, sr * 2, sr * 2);
      ctx.globalAlpha = pa;
    }
  }

  function drawSphere(ctx, x, y, r, hue, ign, idle, swell, extra, kick,
                      PAL, reduced, lowfx, tt) {
    var pa = ctx.globalAlpha;

    // Outer bloom (lighter) — cached sprite, alpha via globalAlpha.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var bloomR = r * (2.4 + swell * 1.1 + extra * 1.6 + kick * 1.4);
    var a0 = (0.30 + idle * 0.10 + swell * 0.25 + extra * 0.30 + kick * 0.45) * ign;
    ctx.globalAlpha = pa * clamp01(a0);
    var bl = bloomSprite(hue);
    ctx.drawImage(bl, x - bloomR, y - bloomR, bloomR * 2, bloomR * 2);
    ctx.restore();

    // Core sphere body (normal composite) — cached shaded orb sprite.
    ctx.globalAlpha = pa * clamp01(ign);
    var orb = orbSprite(hue);
    ctx.drawImage(orb, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa;

    // Rim (gold ring — the "machine" bezel).
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = withAlpha(PAL.gold, (0.35 + swell * 0.4 + kick * 0.4) * ign);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, 0, TAU);
    ctx.stroke();

    // Inner concentric circuit ring (sacred-machine detail) — skip on lowfx.
    if (!reduced && !lowfx) {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = withAlpha(PAL.ink, 0.18 * ign);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.stroke();
      var ticks = 6;
      ctx.strokeStyle = withAlpha(PAL.gold, 0.22 * ign);
      for (var k = 0; k < ticks; k++) {
        var ang = (k / ticks) * TAU + tt * 0.2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * r * 0.6, y + Math.sin(ang) * r * 0.6);
        ctx.lineTo(x + Math.cos(ang) * r * 0.92, y + Math.sin(ang) * r * 0.92);
        ctx.stroke();
      }
    }

    // Specular highlight glint — cached white sprite.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var hx = x - r * 0.34, hy = y - r * 0.36, hr = r * 0.5;
    ctx.globalAlpha = pa * clamp01(ign);
    ctx.drawImage(glintSprite(), hx - hr, hy - hr, hr * 2, hr * 2);
    ctx.restore();
    ctx.globalAlpha = pa;
  }

  function drawGlyph(ctx, strokes, x, y, r, ign, PAL, emphasis) {
    var gx = x + r * 1.35;
    var gy = y;
    var scale = r * 0.9;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(gx, gy);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (0.09 + emphasis * 0.05);
    ctx.strokeStyle = withAlpha(PAL.gold, (0.45 + emphasis * 0.45) * ign);
    ctx.beginPath();
    for (var i = 0; i < strokes.length; i++) {
      var st = strokes[i];
      ctx.moveTo(st[0], st[1]);
      for (var j = 2; j < st.length; j += 2) {
        ctx.lineTo(st[j], st[j + 1]);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCrown(ctx, x, y, r, blaze, PAL, tt, reduced, lowfx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var pa = ctx.globalAlpha;

    // Vast violet-white halo — cached crown sprite (was per-frame radial grad).
    var R = r * (4 + blaze * 6);
    ctx.globalAlpha = pa * clamp01(blaze);
    ctx.drawImage(crownSprite(), x - R, y - R, R * 2, R * 2);
    ctx.globalAlpha = pa;

    // Radiant crown rays / STARBURST bloom at the climax.
    if (!reduced) {
      var rays = lowfx ? 8 : 16;
      ctx.strokeStyle = withAlpha('#ffffff', 0.30 * blaze);
      ctx.lineWidth = 1.2;
      for (var k = 0; k < rays; k++) {
        var ang = (k / rays) * TAU + tt * 0.15;
        // Alternating long/short rays -> starburst silhouette.
        var lenBase = (k % 2 === 0) ? 2.6 : 1.4;
        var len = r * (0.9 + blaze * lenBase) * (0.7 + 0.3 * Math.sin(tt * 2 + k));
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * r * 1.05, y + Math.sin(ang) * r * 1.05);
        ctx.lineTo(x + Math.cos(ang) * (r * 1.05 + len),
                   y + Math.sin(ang) * (r * 1.05 + len));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Crown halo sprite (violet-white), cached once.
  var crownSprite_ = null;
  function crownSprite() {
    if (crownSprite_) return crownSprite_;
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), R = S / 2;
    var grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0,    'rgba(242,233,255,0.55)');
    grd.addColorStop(0.25, hsl(278, 90, 70, 0.35));
    grd.addColorStop(0.6,  hsl(258, 85, 60, 0.14));
    grd.addColorStop(1,    hsl(258, 80, 55, 0));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    crownSprite_ = c; return c;
  }

  // Flower-of-Life backdrop (breathing, faint) drawn on the prototype so it can
  // reach scene geometry (cx, colW). Attach to scene object.
  window.__DESCENT.scenes[window.__DESCENT.scenes.length - 1].drawFlower =
    function (ctx, env, tt, local) {
      var s = this, PAL = env.PAL;
      if (env.reduced && local < 0.02) return;
      var cx = s.cx, cy = s.top + s.colH * 0.5;
      var unit = s.baseR * 1.55;
      var breathe = 1 + Math.sin(tt * 0.4) * 0.02;
      unit *= breathe;
      var a = (0.05 + local * 0.06);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(PAL.emerald, a);
      ctx.lineWidth = 0.8;
      var off = s.folOffsets;
      for (var i = 0; i < off.length; i++) {
        var ox = cx + off[i][0] * unit;
        var oy = cy + off[i][1] * unit * 1.15;
        ctx.beginPath();
        ctx.arc(ox, oy, unit, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = withAlpha(PAL.gold, a * 0.9);
      ctx.beginPath();
      ctx.arc(cx, cy, unit * 3, 0, TAU);
      ctx.stroke();
      ctx.restore();
    };

  // ---- Pure builders (called once) -----------------------------------------

  function buildGlyph(seed) {
    var rnd = mulberry32(0x9e37 + seed * 2654435761 >>> 0);
    var n = 2 + (seed % 3); // 2-4 strokes
    var strokes = [];
    for (var i = 0; i < n; i++) {
      var pts = 2 + Math.floor(rnd() * 2); // 2-3 vertices
      var arr = [];
      var x = (rnd() - 0.5) * 1.1;
      var y = (rnd() - 0.5) * 1.4;
      arr.push(x, y);
      for (var k = 1; k < pts; k++) {
        if (rnd() < 0.55) x += (rnd() - 0.5) * 0.2, y += (rnd() - 0.3) * 0.9;
        else x += (rnd() - 0.5) * 1.0, y += (rnd() - 0.5) * 0.25;
        arr.push(x, y);
      }
      strokes.push(arr);
    }
    return strokes;
  }

  function buildFlowerOffsets() {
    var out = [[0, 0]];
    var i, ang;
    for (i = 0; i < 6; i++) {
      ang = (i / 6) * TAU;
      out.push([Math.cos(ang), Math.sin(ang)]);
    }
    for (i = 0; i < 12; i++) {
      ang = (i / 12) * TAU;
      var rad = (i % 2 === 0) ? 2 : 1.732;
      out.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    return out;
  }

  // ---- Small math/color utils ----------------------------------------------

  var TAU = Math.PI * 2;
  var EMPTY_DASH = [];
  var FLOW_DASH = [3, 8];

  function smooth01(x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    return x * x * (3 - 2 * x);
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeInOut(x) {
    // Reverent ease-in-out cubic.
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function hsl(h, s, l, a) {
    return 'hsla(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%,' +
           (a < 0 ? 0 : a > 1 ? 1 : a) + ')';
  }

  function withAlpha(hex, a) {
    if (a < 0) a = 0; else if (a > 1) a = 1;
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
