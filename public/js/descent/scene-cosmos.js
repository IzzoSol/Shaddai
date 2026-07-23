/* SHADDAI · Descent Through Scale — Scene V: INTO THE COSMOS
 * Vanilla canvas 2D. No libraries, no external assets.
 * SHELL clears canvas + sets ctx.globalAlpha=p.alpha before draw(). We never clearRect.
 *
 * PERF (look-preserving): every planet body/ring/glow, every nebula cloud, the
 * galaxy core and the static starfield are pre-rendered ONCE to offscreen
 * canvases and drawImage'd each frame (scaled/rotated via transforms). No
 * createRadialGradient in the hot per-frame loops. Sprites are keyed by a
 * quantized param (planet kind, nebula tint) so they build a handful of times
 * total, then are reused. env.lowfx trims star counts / faint extras.
 *
 * CAMERA: procedural cinematic fly-through keyed to p.local + time — parallax
 * star layers streak forward, gentle banking/spin threads past the planets,
 * decelerating toward a bright Crown point of light near p.local→1; planets
 * slowly rotate on their axes.
 */
(function () {
  'use strict';

  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- module-local pools (pre-allocated in init, reused every frame) ----
  var STARS = [];          // parallax starfield
  var SHOOTERS = [];       // shooting-star pool
  var NEBULAE = [];        // drifting nebula clouds
  var MAX_STARS = 400;
  var MAX_SHOOTERS = 6;
  var MAX_NEBULAE = 4;
  var seeded = false;
  var lastShooterSpawn = 0;

  // deterministic PRNG so the field is stable across resizes
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedPools(env) {
    if (seeded) return;
    var rnd = mulberry32(0x5EED1);
    var i;
    for (i = 0; i < MAX_STARS; i++) {
      STARS.push({
        // normalized 0..1 field position (mapped to screen at draw time)
        fx: rnd(),
        fy: rnd(),
        depth: 0.15 + rnd() * 0.85,   // 0=far (slow), 1=near (fast parallax)
        r: 0.4 + rnd() * 1.4,
        tw: rnd() * Math.PI * 2,      // twinkle phase
        tws: 0.6 + rnd() * 1.8,       // twinkle speed
        hue: rnd()                    // 0..1 → cool..warm tint pick
      });
    }
    for (i = 0; i < MAX_SHOOTERS; i++) {
      SHOOTERS.push({ active: false, x: 0, y: 0, dx: 0, dy: 0, len: 0, life: 0, ttl: 1, r: 1 });
    }
    for (i = 0; i < MAX_NEBULAE; i++) {
      NEBULAE.push({
        fx: rnd(),
        fy: rnd(),
        rad: 0.35 + rnd() * 0.45,     // fraction of min(w,h)
        drift: 0.02 + rnd() * 0.05,
        phase: rnd() * Math.PI * 2,
        tint: i                       // pick palette color per cloud
      });
    }
    seeded = true;
  }

  // fire one shooting star from the pool
  function spawnShooter(env, t) {
    for (var i = 0; i < SHOOTERS.length; i++) {
      var s = SHOOTERS[i];
      if (!s.active) {
        var edge = Math.random();
        s.x = edge * env.w;
        s.y = -20 + Math.random() * env.h * 0.35;
        var ang = (Math.PI * 0.18) + Math.random() * (Math.PI * 0.28); // downward-right-ish
        var spd = 9 + Math.random() * 8;
        s.dx = Math.cos(ang) * spd;
        s.dy = Math.sin(ang) * spd;
        s.len = 90 + Math.random() * 160;
        s.life = 0;
        s.ttl = 60 + Math.random() * 40;   // frames
        s.r = 1 + Math.random() * 1.2;
        s.active = true;
        return;
      }
    }
  }

  function hexA(hex, a) {
    // #rrggbb + alpha → rgba()
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ===================================================================
  //  PHOTO-REAL GENERATED ART (lazy-loaded, never blocks; graceful fallback)
  //  - COSMOS_HD = far cosmic-web background base (16:9 landscape)
  //  - PLANET_* = 3 hero planet PNGs, isolated on black → composited with
  //    'lighter' over the starfield so their black backing drops out to a glow.
  //  Each planet PNG overrides the matching procedural slot; if a PNG hasn't
  //  loaded yet, drawPlanet() falls back to the procedural sprite for that slot.
  // ===================================================================
  var COSMOS_HD = { img: null, ok: false };
  var PLANET_IMG = {};          // kind -> {img, ok}
  var artRequested = false;
  // ONLY planets that GLOW — dark planet PNGs (planet-2/mars/ice-world) vanish
  // under 'lighter' composite on black, so we deliberately do NOT use them.
  //  - cavern  : obsidian planet w/ bright emerald core + gold cracks (glows)
  //  - fractal : emerald spiral galaxy, distant faint background element (glows)
  var PLANET_SRC = {
    cavern:   '/assets/journey/cavern-world.png',
    fractal:  '/assets/journey/fractal-universe.jpg'
  };
  // looping Seedance video textures per slot (spinning emerald Saturn — glows)
  var VIDEO_SRC = {
    saturn:   '/assets/journey/planet-saturn-spin.mp4'
  };
  function loadArtImage(rec, src) {
    var im = new Image();
    im.onload = function () { if (im.naturalWidth > 0) { rec.img = im; rec.ok = true; } };
    im.onerror = function () { rec.ok = false; };
    im.src = src;
  }
  function requestArt() {
    if (artRequested) return;
    artRequested = true;
    loadArtImage(COSMOS_HD, '/assets/journey/cosmos-hd.jpg');
    for (var kind in PLANET_SRC) {
      if (!PLANET_SRC.hasOwnProperty(kind)) continue;
      var rec = { img: null, ok: false };
      PLANET_IMG[kind] = rec;
      loadArtImage(rec, PLANET_SRC[kind]);
    }
    // pre-warm looping Seedance video textures so they're playing by the time
    // their planet drifts into view (video needs lead time to buffer + autoplay)
    if (window.getVideoTex) {
      for (var vk in VIDEO_SRC) { if (VIDEO_SRC.hasOwnProperty(vk)) window.getVideoTex(VIDEO_SRC[vk]); }
    }
  }

  // Draw the hi-def cosmic-web base, cover-fit, CRISP. Slow parallax drift keyed
  // to the fly-through camera (p.local) so the star-field streams past. The ONLY
  // grade applied on top is a subtle radial EDGE vignette to seat it in frame —
  // there is deliberately NO full-frame color wash (it muddied the photo).
  // Returns true if the base was drawn (caller then skips the procedural
  // deep-space wash / keeps it as fallback otherwise).
  function drawCosmosBase(ctx, env, p, sx, sy, t) {
    if (!COSMOS_HD.ok || !COSMOS_HD.img) return false;
    var w = env.w, h = env.h, PAL = env.PAL, lowfx = !!env.lowfx, reduced = !!env.reduced;
    var img = COSMOS_HD.img;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return false;

    var lz = smooth(p.local);
    // slow parallax: gentle zoom-in as we fly + drift opposite the cursor steer.
    // Under lowfx we drop the extra zoom/drift detail (flat cover, cheap).
    var kb = lowfx ? 1.02 : (1.05 + lz * 0.14 + (reduced ? 0 : Math.sin(t * 0.00005) * 0.008));
    var sc = Math.max(w / iw, h / ih) * kb;
    var dw = iw * sc, dh = ih * sc;
    var driftX = lowfx ? 0 : (-sx * 20 * 0.2 - lz * w * 0.04);
    var driftY = lowfx ? 0 : (-sy * 20 * 0.2 - lz * h * 0.03);
    var dx = (w - dw) / 2 + driftX;
    var dy = (h - dh) / 2 + driftY;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;                 // crisp, full-strength photo — no tint wash
    ctx.drawImage(img, dx, dy, dw, dh);
    // ONLY grade: subtle radial EDGE vignette — corners settle to void, center
    // stays fully crisp. NO full-frame color wash (FORBIDDEN — it muddied it).
    var vg = ctx.createRadialGradient(w * 0.5, h * 0.5, minSideOf(env) * 0.42,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(6,8,11,0)');
    vg.addColorStop(1, 'rgba(6,8,11,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return true;
  }
  function minSideOf(env) { return Math.min(env.w, env.h); }

  // ===================================================================
  //  PERF: PRE-RENDERED SPRITE CACHES (built once, drawImage each frame)
  // ===================================================================

  // --- nebula glow sprite, keyed by color hex (drawn at full opacity here;
  //     per-frame alpha applied via ctx.globalAlpha) ---
  var nebCache = {};        // colorHex -> offscreen canvas
  function nebSprite(colHex) {
    var c = nebCache[colHex];
    if (c) return c;
    var S = 256;
    c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, hexA(colHex, 0.14));
    grd.addColorStop(0.4, hexA(colHex, 0.06));
    grd.addColorStop(1, hexA(colHex, 0));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    nebCache[colHex] = c;
    return c;
  }

  // --- galaxy core sprite (single, gold/white) ---
  var galaxyCore = null;
  function galaxyCoreSprite(gold) {
    if (galaxyCore) return galaxyCore;
    var S = 256;
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, hexA('#fff6d8', 0.22));
    grd.addColorStop(0.5, hexA(gold, 0.08));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    galaxyCore = c;
    return c;
  }

  // --- Crown "point of light" sprite (arrival beacon near p.local→1) ---
  var crownSprite = null;
  function getCrownSprite(gold) {
    if (crownSprite) return crownSprite;
    var S = 256;
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.14, hexA('#fff6d8', 0.85));
    grd.addColorStop(0.4, hexA(gold, 0.35));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    crownSprite = c;
    return c;
  }

  // --- static starfield/nebula base layer, rebuilt on resize (never per-frame).
  //     Holds the faint galaxy spiral dots so we don't loop 180 arcs each frame. ---
  var fieldCache = null, fieldW = 0, fieldH = 0;
  function buildFieldCache(env) {
    var w = env.w, h = env.h, PAL = env.PAL;
    var minSide = Math.min(w, h);
    fieldW = w; fieldH = h;
    fieldCache = document.createElement('canvas');
    fieldCache.width = Math.max(1, w); fieldCache.height = Math.max(1, h);
    var g = fieldCache.getContext('2d');
    g.globalCompositeOperation = 'lighter';

    // faint galaxy spiral (upper-left) baked in — rotation is faked at draw
    // time by nudging the whole cache; the spiral shape itself is static.
    var gcx = w * 0.30, gcy = h * 0.32;
    var garms = 2, gsteps = 90, gmaxR = minSide * 0.30;
    for (var arm = 0; arm < garms; arm++) {
      for (var gi = 0; gi < gsteps; gi++) {
        var gt = gi / gsteps;
        var ga = gt * Math.PI * 3.2 + arm * Math.PI;
        var gr = gt * gmaxR;
        var gx = gcx + Math.cos(ga) * gr;
        var gy = gcy + Math.sin(ga) * gr * 0.5;
        var ga2 = (1 - gt) * 0.10 + 0.02;
        g.beginPath();
        g.arc(gx, gy, 0.6 + (1 - gt) * 2.2, 0, Math.PI * 2);
        g.fillStyle = hexA(gi % 5 === 0 ? PAL.gold : PAL.cyan, ga2);
        g.fill();
      }
    }
  }

  // --- planet body sprites, keyed by kind. Rendered at a fixed sprite radius
  //     into a padded canvas (padding for rings/rim glow), then drawImage'd
  //     scaled per frame. Body alpha applied via ctx.globalAlpha; surface
  //     rotation faked by drawing at a rotated transform. ---
  var planetCache = {};    // kind -> {canvas, R, pad}
  function planetSprite(env, PAL, kind) {
    var cached = planetCache[kind];
    if (cached) return cached;

    var R = 160;                       // sprite planet radius
    var pad = (kind === 'saturn') ? R * 2.4 : R * 1.4; // room for rings / rim
    var half = R + pad;
    var S = Math.ceil(half * 2);
    var c = document.createElement('canvas'); c.width = c.height = S;
    var ctx = c.getContext('2d');
    var cx = S / 2, cy = S / 2;
    var lightX = cx - R * 0.42, lightY = cy - R * 0.42;

    var bodyCol, shadeCol;
    if (kind === 'saturn') { bodyCol = PAL.gold; shadeCol = '#6b5220'; }
    else if (kind === 'gasgiant') { bodyCol = PAL.cyan; shadeCol = '#123047'; }
    else { bodyCol = '#c7cdc9'; shadeCol = '#3a403c'; }

    // --- rings (behind body) ---
    if (kind === 'saturn') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.42);
      ctx.scale(1, 0.34);
      var rg = ctx.createRadialGradient(0, 0, R * 1.25, 0, 0, R * 2.15);
      rg.addColorStop(0, hexA(PAL.gold, 0));
      rg.addColorStop(0.35, hexA(PAL.gold, 0.55));
      rg.addColorStop(0.55, hexA(PAL.ink, 0.18));
      rg.addColorStop(0.72, hexA(PAL.gold, 0.38));
      rg.addColorStop(1, hexA(PAL.gold, 0));
      ctx.beginPath();
      ctx.arc(0, 0, R * 2.15, 0, Math.PI * 2);
      ctx.arc(0, 0, R * 1.25, 0, Math.PI * 2, true);
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.restore();
    }

    // --- planet body ---
    var bg = ctx.createRadialGradient(lightX, lightY, R * 0.1, cx, cy, R);
    bg.addColorStop(0, hexA(bodyCol, 1));
    bg.addColorStop(0.65, hexA(bodyCol, 0.7));
    bg.addColorStop(1, hexA(shadeCol, 1));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    // clip to body for surface detail
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    if (kind === 'gasgiant') {
      for (var b = 0; b < 7; b++) {
        var by = cy - R + (R * 2 / 7) * (b + 0.5);
        var band = (b % 2 === 0) ? PAL.cyan : PAL.emerald;
        ctx.beginPath();
        ctx.ellipse(cx, by, R * 1.02, R * 0.09, 0, 0, Math.PI * 2);
        ctx.fillStyle = hexA(band, 0.12);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(cx + R * 0.28, cy + R * 0.1, R * 0.22, R * 0.13, 0, 0, Math.PI * 2);
      ctx.fillStyle = hexA(PAL.gold, 0.22);
      ctx.fill();
    } else if (kind === 'moon') {
      var cr = mulberry32(0xC7A7E5);
      for (var k = 0; k < 14; k++) {
        var a = cr() * Math.PI * 2, d = Math.sqrt(cr()) * R * 0.88;
        var kx = cx + Math.cos(a) * d, ky = cy + Math.sin(a) * d;
        var kr = R * (0.04 + cr() * 0.11);
        ctx.beginPath();
        ctx.arc(kx, ky, kr, 0, Math.PI * 2);
        ctx.fillStyle = hexA(shadeCol, 0.5);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(kx - kr * 0.25, ky - kr * 0.25, kr * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = hexA('#e6ebe8', 0.12);
        ctx.fill();
      }
    } else {
      for (var sb = 0; sb < 5; sb++) {
        var sy = cy - R + (R * 2 / 5) * (sb + 0.5);
        ctx.beginPath();
        ctx.ellipse(cx, sy, R * 1.02, R * 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = hexA('#f2dc92', 0.1);
        ctx.fill();
      }
    }

    // terminator shadow
    var sh = ctx.createRadialGradient(lightX, lightY, R * 0.2, cx, cy, R * 1.05);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, hexA(PAL.void, 0.75));
    ctx.fillStyle = sh;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore(); // unclip

    // atmospheric rim glow (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var rim = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.18);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.8, hexA(bodyCol, 0.16));
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.restore();

    cached = { canvas: c, R: R, half: half };
    planetCache[kind] = cached;
    return cached;
  }

  // Draw a GLOWING planet approaching → swelling → exiting for a p.local window.
  // We ONLY use assets that glow (Saturn video, cavern-world, fractal galaxy) so
  // that the 'lighter' composite reads on black — dark planet PNGs would vanish.
  // Uses live video / loaded image (NO per-frame gradients). Body alpha via
  // globalAlpha; slow axial spin by rotating.
  //   kind: 'saturn' (video, ringed/prominent), 'cavern' (glowing-core obsidian),
  //         'fractal' (distant faint emerald galaxy)
  //   opts.prom  — size/presence multiplier (Saturn largest, fractal small)
  //   opts.faint — extra alpha multiplier (fractal is faint/distant)
  //   opts.cyKind— vertical placement bias
  function drawPlanet(ctx, env, PAL, kind, local, lo, hi, steerX, steerY, t, spin, opts) {
    if (local < lo || local > hi) return;
    opts = opts || {};
    var u = (local - lo) / (hi - lo);        // 0..1 progress through this window
    var scale = Math.pow(u, 2.6);            // 0 far → 1 huge
    var minSide = Math.min(env.w, env.h);
    // Saturn is the showstopper (it seeds the Tree morph) — most presence.
    var prom = opts.prom || 1.0;
    var baseR = minSide * 0.10 * prom;
    var radius = baseR + scale * minSide * 1.4 * prom;
    var faint = (opts.faint != null) ? opts.faint : 1;
    var alpha = faint * Math.min(1, u * 4) * Math.max(0, 1 - Math.pow(Math.max(0, u - 0.72) / 0.28, 1.4));
    if (alpha <= 0.01) return;

    var driftX = (u - 0.5) * env.w * 0.55;
    var cx = env.w * 0.5 + driftX + steerX * (0.4 + scale * 0.8) * 90;
    var cyBias = (opts.cy != null) ? opts.cy : 0.55;
    var cy = env.h * cyBias + Math.sin(u * 3.14) * env.h * 0.05 + steerY * (0.4 + scale) * 70;

    // Prefer a looping Seedance VIDEO texture for this slot when it's ready
    // (spinning emerald Saturn — glows, so 'lighter' reads it on black).
    var vsrc = VIDEO_SRC[kind];
    if (vsrc && window.getVideoTex) {
      var vt = window.getVideoTex(vsrc);
      if (vt && vt.ready && vt.video && vt.video.videoWidth) {
        var vfR = radius * (kind === 'saturn' ? 1.55 : 1.18), vside = vfR * 2;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.globalCompositeOperation = 'lighter';       // black backing → glow blend
        ctx.translate(cx, cy);                            // spin is baked into the clip
        ctx.drawImage(vt.video, -vfR, -vfR, vside, vside);
        ctx.restore();
        return;
      }
    }

    // GLOWING image for this slot (cavern-world / fractal-universe). These read
    // on 'lighter' because their bright emerald parts survive the black-drop-out.
    var pRec = PLANET_IMG[kind];
    if (pRec && pRec.ok && pRec.img) {
      var pim = pRec.img;
      var piw = pim.naturalWidth || pim.width, pih = pim.naturalHeight || pim.height;
      if (piw && pih) {
        var frameR = radius * (kind === 'saturn' ? 1.55 : 1.18);
        var side = frameR * 2;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.globalCompositeOperation = 'lighter';   // black/dark backing → glow blend
        ctx.translate(cx, cy);
        if (spin) ctx.rotate(spin);
        ctx.drawImage(pim, -frameR, -frameR, side, side);
        ctx.restore();
        return;
      }
    }

    // FALLBACK: procedural glowing sprite (asset not loaded yet / failed).
    // Map unknown glow kinds onto the closest procedural body so something
    // luminous still drifts past instead of nothing.
    var procKind = (kind === 'saturn') ? 'saturn'
                 : (kind === 'cavern') ? 'gasgiant' : 'moon';
    var spr = planetSprite(env, PAL, procKind);
    var drawScale = radius / spr.R;          // map sprite radius → screen radius

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    if (spin) ctx.rotate(spin);
    ctx.scale(drawScale, drawScale);
    ctx.drawImage(spr.canvas, -spr.half, -spr.half);
    ctx.restore();
  }

  // ---- easing ----
  function smooth(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }

  window.__DESCENT.scenes.push({
    id: 'cosmos',
    label: 'V · INTO THE COSMOS',

    init: function (env) {
      seeded = false;
      STARS.length = 0;
      SHOOTERS.length = 0;
      NEBULAE.length = 0;
      lastShooterSpawn = 0;
      fieldCache = null; fieldW = 0; fieldH = 0;
      requestArt();          // lazy-load cosmic-web base + 3 hero planet PNGs
      seedPools(env);
    },

    resize: function (env) {
      // field is normalized; only the static field cache depends on size.
      seedPools(env);
      buildFieldCache(env);
    },

    draw: function (ctx, env, p, mouse, t) {
      var PAL = env.PAL;
      var w = env.w, h = env.h;
      var minSide = Math.min(w, h);
      var lowfx = !!env.lowfx;

      // ensure static field cache exists (first frame / after init)
      if (!fieldCache || fieldW !== w || fieldH !== h) buildFieldCache(env);
      requestArt(); // idempotent — guarantees art load if draw runs before init

      // steering: field drifts OPPOSITE the cursor
      var sx = ((mouse && mouse.nx != null) ? mouse.nx : 0.5) - 0.5;
      var sy = ((mouse && mouse.ny != null) ? mouse.ny : 0.5) - 0.5;
      var reduced = !!env.reduced;

      // ================= LAYER 0: PHOTO-REAL COSMIC-WEB BASE =============
      // Full-screen cover-fit hi-def starfield behind EVERYTHING, with slow
      // parallax drift keyed to the fly-through camera. If not yet loaded we
      // fall through to the procedural deep-space wash below (never blocks).
      var baseDrawn = drawCosmosBase(ctx, env, p, sx, sy, t);

      // ================= CINEMATIC FLY-THROUGH CAMERA ====================
      // p.local drives forward push; ease-in accelerate, ease-out decelerate
      // toward the Crown. A gentle banking spin threads past the planets.
      var lz = smooth(p.local);
      // forward velocity: fast through the middle, decelerating near arrival
      var accel = smooth(Math.min(1, p.local / 0.15));            // ease-in launch
      var decel = 1 - smooth(Math.max(0, (p.local - 0.72) / 0.28)); // ease-out to Crown
      var flightSpeed = accel * decel;                            // 0..1 push profile
      var flow = p.local * 1.4;                                   // field scroll driver
      // banking / gentle spin — sinusoidal roll that settles as we arrive
      var bank = reduced ? 0
        : (Math.sin(p.local * Math.PI * 2.2) * 0.05 + Math.sin(t * 0.00013) * 0.02) * decel;
      // subtle forward zoom-push on the whole frame
      var camZoom = 1 + flightSpeed * 0.10 + lz * 0.04;

      // --- deep-space base wash (FALLBACK only — the cosmos-hd art already
      //     supplies the base + tint + vignette when loaded) ---
      if (!baseDrawn) {
        var bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, minSide * 0.95);
        bg.addColorStop(0, '#0a0f18');
        bg.addColorStop(1, PAL.void);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }

      // Apply the fly-through camera transform to everything cosmic on top.
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(bank);
      ctx.scale(camZoom, camZoom);
      // parallax: whole starscape pushes opposite steer, drifts up on arrival
      ctx.translate(-w * 0.5 - sx * 12, -h * 0.5 - sy * 12 - lz * h * 0.02);

      // --- static field cache (galaxy spiral) — faint rotation faked by nudge ---
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var grot = reduced ? 0 : Math.sin(t * 0.00003) * 6;
      ctx.drawImage(fieldCache, grot - sx * 0.05 * w, -grot * 0.5 - sy * 0.05 * h);
      ctx.restore();

      // --- nebula clouds (pre-rendered sprites, alpha via globalAlpha) ---
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var nebCols = [PAL.emerald, PAL.cyan, PAL.gold, '#7a4bff'];
      var nebCount = lowfx ? 2 : NEBULAE.length;
      for (var nn = 0; nn < nebCount; nn++) {
        var neb = NEBULAE[nn];
        var drift = reduced ? 0 : (t * 0.00002 * neb.drift * 60);
        var nx = ((neb.fx + drift) % 1) * w - sx * (0.06 + neb.rad * 0.12) * w;
        var ny = neb.fy * h + Math.sin(t * 0.0002 + neb.phase) * h * 0.04 - sy * 0.08 * h;
        var nr = neb.rad * minSide;
        var col = nebCols[neb.tint % nebCols.length];
        var spr = nebSprite(col);
        ctx.drawImage(spr, nx - nr, ny - nr, nr * 2, nr * 2);
      }

      // galaxy core sprite
      var gcx = w * 0.30 - sx * 0.05 * w;
      var gcy = h * 0.32 - sy * 0.05 * h;
      var gcoreR = minSide * 0.30 * 0.28;
      var gcSpr = galaxyCoreSprite(PAL.gold);
      ctx.drawImage(gcSpr, gcx - gcoreR, gcy - gcoreR, gcoreR * 2, gcoreR * 2);
      ctx.restore();

      // --- starfield with depth parallax (streaking forward with the flight) ---
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var starCount = lowfx ? (STARS.length * 0.5) | 0 : STARS.length;
      for (var i = 0; i < starCount; i++) {
        var stz = STARS[i];
        var par = stz.depth;                       // near stars move more
        var offx = -sx * par * 0.18;
        var offy = -sy * par * 0.18;
        var fx = stz.fx + offx - (reduced ? 0 : flow * par * 0.15);
        var fy = stz.fy + offy;
        fx = ((fx % 1) + 1) % 1;
        fy = ((fy % 1) + 1) % 1;
        var x = fx * w, y = fy * h;
        var tw = reduced ? 0.85 : (0.55 + 0.45 * Math.sin(t * 0.001 * stz.tws + stz.tw));
        var rad = stz.r * (0.5 + par);
        var col2 = stz.hue > 0.7 ? PAL.gold : (stz.hue > 0.4 ? PAL.ink : PAL.cyan);
        // forward streak: near stars smear along the push direction
        var streak = flightSpeed * par * 6 * (reduced ? 0 : 1);
        if (streak > 1.2 && !lowfx) {
          ctx.strokeStyle = hexA(col2, (0.28 + 0.45 * par) * tw);
          ctx.lineWidth = rad;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + streak);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = hexA(col2, (0.35 + 0.55 * par) * tw);
          ctx.fill();
        }
      }
      ctx.restore();

      // --- GLOWING planets fly through at staggered p.local windows ---------
      // ONLY luminous assets (they read on 'lighter'): a distant faint emerald
      // spiral galaxy early, a glowing-core obsidian world mid, then the
      // spinning emerald Saturn as the prominent showstopper toward arrival.
      var spinBase = reduced ? 0 : t * 0.00006;
      // fractal-universe: distant, small, faint background element (skip on lowfx)
      if (!lowfx) {
        drawPlanet(ctx, env, PAL, 'fractal', p.local, 0.04, 0.38, sx, sy, t, spinBase * 0.4,
          { prom: 0.5, faint: 0.45, cy: 0.34 });
      }
      // cavern-world: obsidian planet w/ bright emerald core + gold cracks
      drawPlanet(ctx, env, PAL, 'cavern',  p.local, 0.30, 0.62, sx, sy, t, -spinBase * 1.1,
        { prom: 0.95, cy: 0.46 });
      // saturn (spinning video) — largest, most central, the showstopper
      drawPlanet(ctx, env, PAL, 'saturn',  p.local, 0.52, 0.96, sx, sy, t, spinBase * 0.6,
        { prom: 1.32, cy: 0.52 });

      ctx.restore(); // end fly-through camera transform

      // ================= THE CROWN (bright point of light near arrival) ====
      // Decoupled from camera so it holds steady center-screen as we decelerate.
      var crownK = smooth(Math.max(0, (p.local - 0.68) / 0.32));
      if (crownK > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var crSpr = getCrownSprite(PAL.gold);
        var pulse = reduced ? 1 : (0.92 + 0.08 * Math.sin(t * 0.004));
        var crR = minSide * (0.10 + crownK * 0.55) * pulse;
        var ccx = w * 0.5, ccy = h * 0.5;
        ctx.globalAlpha *= crownK;
        ctx.drawImage(crSpr, ccx - crR, ccy - crR, crR * 2, crR * 2);
        // thin radiant crown rays as we arrive
        if (crownK > 0.3 && !lowfx && !reduced) {
          ctx.strokeStyle = hexA(PAL.gold, 0.10 * crownK);
          ctx.lineWidth = 1;
          var rays = 12;
          for (var ry = 0; ry < rays; ry++) {
            var ra = (ry / rays) * Math.PI * 2 + t * 0.0002;
            ctx.beginPath();
            ctx.moveTo(ccx, ccy);
            ctx.lineTo(ccx + Math.cos(ra) * crR * 1.8, ccy + Math.sin(ra) * crR * 1.8);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // --- shooting stars (periodic, from pool). lowfx skips them. ---
      if (!reduced && !lowfx && t - lastShooterSpawn > 1400 + Math.random() * 1600) {
        spawnShooter(env, t);
        lastShooterSpawn = t;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (var sIdx = 0; sIdx < SHOOTERS.length; sIdx++) {
        var sh2 = SHOOTERS[sIdx];
        if (!sh2.active) continue;
        sh2.x += sh2.dx;
        sh2.y += sh2.dy;
        sh2.life++;
        var lifeK = sh2.life / sh2.ttl;
        if (lifeK >= 1 || sh2.x > w + 100 || sh2.y > h + 100) { sh2.active = false; continue; }
        var fade = Math.sin(lifeK * Math.PI); // ease in/out
        var mag = Math.sqrt(sh2.dx * sh2.dx + sh2.dy * sh2.dy) || 1;
        var tx = sh2.x - (sh2.dx / mag) * sh2.len;
        var ty = sh2.y - (sh2.dy / mag) * sh2.len;
        var grad = ctx.createLinearGradient(sh2.x, sh2.y, tx, ty);
        grad.addColorStop(0, hexA(PAL.ink, 0.9 * fade));
        grad.addColorStop(0.3, hexA(PAL.cyan, 0.5 * fade));
        grad.addColorStop(1, hexA(PAL.cyan, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = sh2.r;
        ctx.beginPath();
        ctx.moveTo(sh2.x, sh2.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // bright head
        ctx.beginPath();
        ctx.arc(sh2.x, sh2.y, sh2.r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = hexA('#ffffff', 0.85 * fade);
        ctx.fill();
      }
      ctx.restore();
    }
  });
})();
