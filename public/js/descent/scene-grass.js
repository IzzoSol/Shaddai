/* SHADDAI · Descent Through Scale — Scene II: LIVING FIELD
 * Cinematic 3-layer recipe:
 *   1. Photo-real base — real macro grass photo(s), theme-graded, DOF vignette,
 *      slow ken-burns drift. Multi-image collage. Procedural fallback if none load.
 *   2. Procedural interaction (the star) — silhouette blades with gold rim-light
 *      OVER the photo; blades GROW IN (p.local 0->~0.35, staggered), SWAY with wind
 *      and PART/BEND away from the cursor; glowing pollen + dew catch-lights.
 *   3. Cyber cross-section overlay — faint wireframe grid, scrolling mono data
 *      readout column, thin layer-border frame. Subtle + cheap.
 * Vanilla canvas, no libs. Geometry pre-allocated. Never clears the canvas.
 */
(function () {
  'use strict';

  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- module-scoped pools (rebuilt per resize) ----------------------------
  var blades = [];   // grass blades
  var dews = [];     // dew drops on blades
  var pollen = [];   // drifting motes
  var flowers = [];  // wildflowers
  var seeded = false;

  // ---- photo-real base images (collage) ------------------------------------
  var imgs = [];     // { img, ok } — first is primary, rest are collage frames
  var imgTried = false;
  var BASE_SRCS = [
    '/assets/journey/grass.jpg',
    '/assets/journey/grass-1.jpg',
    '/assets/journey/grass-2.jpg',
    '/assets/journey/grass-3.jpg'
  ];

  function loadImages() {
    if (imgTried) return;
    imgTried = true;
    for (var i = 0; i < BASE_SRCS.length; i++) {
      (function (idx) {
        var rec = { img: new Image(), ok: false };
        rec.img.onload = function () {
          if (rec.img.naturalWidth > 0) rec.ok = true;
        };
        rec.img.onerror = function () { rec.ok = false; };
        // grass.jpg is required-ish; -1/-2/-3 are optional extras (silent fail)
        rec.img.src = BASE_SRCS[idx];
        imgs.push(rec);
      })(i);
    }
  }
  function anyImageReady() {
    for (var i = 0; i < imgs.length; i++) if (imgs[i].ok) return true;
    return false;
  }

  // ---- PERF: pre-rendered sprites / cached overlays -----------------------
  // (drawImage instead of allocating gradients every frame — same pattern as
  //  scene-molecules.js glowSprite()/elSprite()/gridCache)
  var pollenSprite = null;       // single warm glow mote sprite (reused for all motes)
  function pollenGlow() {
    if (pollenSprite) return pollenSprite;
    var S = 32, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(232,214,150,1)');
    grd.addColorStop(1, 'rgba(232,214,150,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    pollenSprite = c; return c;
  }

  // CRISP-BASE recipe: the photo is shown UNTOUCHED. The ONLY grade over it is a
  // subtle radial EDGE VIGNETTE (transparent center -> rgba(6,8,11,0.5) corners).
  // NO full-frame color wash / tint / multiply / overlay — that muddying is gone.
  // Everything else (motes, seed-of-life) is drawn additively ('lighter').
  var photoVigCache = {};        // key "w_h" -> edge-vignette plate (loc-independent)
  var PHOTO_BUCKETS = 14;        // still used by the procedural fallback plate

  function _capCache(obj, max) {
    var keys = Object.keys(obj);
    if (keys.length > max) delete obj[keys[0]];
  }

  // subtle radial EDGE vignette: transparent through the center, only darkening
  // toward the far corners for cinematic falloff. Drawn 'source-over' at alpha 1.
  function vigPlate(w, h) {
    var key = w + '_' + h;
    var c = photoVigCache[key];
    if (c) return c;
    _capCache(photoVigCache, 6);
    c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var cx = w * 0.5, cy = h * 0.5;
    var vig = g.createRadialGradient(
      cx, cy, Math.min(w, h) * 0.42,
      cx, cy, Math.sqrt(cx * cx + cy * cy));   // reach the far corners exactly
    vig.addColorStop(0, 'rgba(6,8,11,0)');
    vig.addColorStop(0.72, 'rgba(6,8,11,0.14)');
    vig.addColorStop(1, 'rgba(6,8,11,0.5)');
    g.fillStyle = vig; g.fillRect(0, 0, w, h);
    photoVigCache[key] = c; return c;
  }

  // faint gold Seed-of-Life sprite (7 overlapping circles) — etched additively
  // into the upper haze. Cached once per size bucket; alpha kept very low.
  var seedCache = {};            // key "S" -> canvas
  function seedOfLife(S) {
    var c = seedCache[S];
    if (c) return c;
    _capCache(seedCache, 4);
    c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var cx = S / 2, cy = S / 2, r = S / 4;
    g.strokeStyle = 'rgba(232,196,92,0.9)';
    g.lineWidth = Math.max(1, S * 0.006);
    // center + 6 around it (classic Seed of Life)
    var pts = [[0, 0]];
    for (var a = 0; a < 6; a++) {
      pts.push([Math.cos(a * Math.PI / 3) * r, Math.sin(a * Math.PI / 3) * r]);
    }
    for (var i = 0; i < pts.length; i++) {
      g.beginPath();
      g.arc(cx + pts[i][0], cy + pts[i][1], r, 0, Math.PI * 2);
      g.stroke();
    }
    seedCache[S] = c; return c;
  }

  // procedural-fallback base (dawn gradient + sun disc) — cached per (size,bucket)
  var fallbackCache = {};        // key "w_h_bucket" -> canvas
  function fallbackPlate(w, h, locBucket, PAL) {
    var key = w + '_' + h + '_' + locBucket;
    var c = fallbackCache[key];
    if (c) return c;
    _capCache(fallbackCache, PHOTO_BUCKETS * 3);
    var loc = locBucket / (PHOTO_BUCKETS - 1);
    var camLift0 = loc * h * 0.06;
    var horizon0 = h * 0.30 - camLift0;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');

    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, PAL.void);
    var glow0 = 0.35 + 0.35 * Math.sin(loc * Math.PI);
    grd.addColorStop(Math.max(0.05, horizon0 / h * 0.8),
      'rgba(' + (20 + glow0 * 60) + ',' + (28 + glow0 * 40) + ',' + (34 + glow0 * 30) + ',1)');
    grd.addColorStop(Math.min(0.6, horizon0 / h + 0.15), '#0a1310');
    grd.addColorStop(1, '#040806');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);

    var sunX0 = w * (0.12 + loc * 0.76);
    var sunY0 = horizon0 - h * 0.04;
    var sun = g.createRadialGradient(sunX0, sunY0, 0, sunX0, sunY0, h * 0.4);
    sun.addColorStop(0, 'rgba(232,196,92,' + (0.28 + glow0 * 0.22) + ')');
    sun.addColorStop(0.4, 'rgba(232,196,92,0.06)');
    sun.addColorStop(1, 'rgba(232,196,92,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = sun; g.fillRect(0, 0, w, h);

    fallbackCache[key] = c; return c;
  }

  // static cyber grid + border frame cached to one offscreen (text/scan stay dynamic)
  var gridCache = null, gridW = 0, gridH = 0;
  function buildGrid(w, h, PAL) {
    if (gridCache && gridW === w && gridH === h) return gridCache;
    gridW = w; gridH = h;
    gridCache = document.createElement('canvas');
    gridCache.width = w; gridCache.height = h;
    var g = gridCache.getContext('2d');

    // (a) faint wireframe grid
    g.globalAlpha = 0.10;
    g.strokeStyle = PAL.cyan;
    g.lineWidth = 1;
    g.beginPath();
    var cols = 10;
    for (var c = 0; c <= cols; c++) {
      var gx = (c / cols) * w;
      g.moveTo(gx, 0); g.lineTo(gx, h);
    }
    var rows = 7;
    for (var r = 0; r <= rows; r++) {
      var t = r / rows;
      var gy = h * (0.30 + 0.70 * (t * t));
      g.moveTo(0, gy); g.lineTo(w, gy);
    }
    g.stroke();
    g.globalAlpha = 1;

    // (c) thin layer-border frame
    g.globalAlpha = 0.7;
    g.strokeStyle = 'rgba(95,224,255,0.5)';
    g.lineWidth = 1;
    g.strokeRect(6.5, 6.5, w - 13, h - 13);
    g.globalAlpha = 0.35;
    g.strokeStyle = 'rgba(232,196,92,0.5)';
    g.strokeRect(11.5, 11.5, w - 23, h - 23);
    // corner ticks
    g.globalAlpha = 0.7;
    var tk = 14;
    g.strokeStyle = PAL.cyan;
    g.beginPath();
    g.moveTo(6.5, 6.5 + tk); g.lineTo(6.5, 6.5); g.lineTo(6.5 + tk, 6.5);
    g.moveTo(w - 6.5 - tk, 6.5); g.lineTo(w - 6.5, 6.5); g.lineTo(w - 6.5, 6.5 + tk);
    g.moveTo(6.5, h - 6.5 - tk); g.lineTo(6.5, h - 6.5); g.lineTo(6.5 + tk, h - 6.5);
    g.moveTo(w - 6.5 - tk, h - 6.5); g.lineTo(w - 6.5, h - 6.5); g.lineTo(w - 6.5, h - 6.5 - tk);
    g.stroke();
    g.globalAlpha = 1;

    return gridCache;
  }

  // deterministic pseudo-random so the field is stable across resizes
  var _s = 0x9e3779b9;
  function rnd() {
    _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5;
    return ((_s >>> 0) % 100000) / 100000;
  }
  function rrange(a, b) { return a + (b - a) * rnd(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // shade a hex green toward lighter/darker, returns rgb string
  function greenTint(depth, k) {
    // depth 0 = far (crisp deep green), 1 = near (soft bright)
    var r = Math.round(18 + depth * 46 + k * 40);
    var g = Math.round(90 + depth * 90 + k * 60);
    var b = Math.round(38 + depth * 40 + k * 22);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function build(env) {
    var w = env.w, h = env.h;
    var reduced = env.reduced;
    _s = 0x9e3779b9; // reset for stable layout

    var count = reduced ? 130 : Math.min(460, Math.round(w * 0.55) + 200);
    blades.length = 0;
    dews.length = 0;
    pollen.length = 0;
    flowers.length = 0;

    var horizon = h * 0.30; // grass grows below this line
    for (var i = 0; i < count; i++) {
      // distribute in depth bands: 0 far/top ... 1 near/bottom
      var depth = Math.pow(rnd(), 0.7);
      var baseY = horizon + (h - horizon) * (0.25 + depth * 0.78);
      if (baseY > h + 20) baseY = h + 20;
      var x = rnd() * w;
      // near blades taller & wider
      var hgt = (reduced ? 40 : 60) + depth * (h * (reduced ? 0.14 : 0.24)) + rrange(-10, 22);
      var wid = 1.2 + depth * (reduced ? 5 : 9) + rrange(0, 2);
      var lean = rrange(-0.28, 0.28);          // natural curve direction
      var phase = rnd() * Math.PI * 2;          // sway offset
      var swayAmp = 4 + depth * 14;             // px sway of tip
      var tint = greenTint(depth, rrange(-0.15, 0.35));
      blades.push({
        x: x, y: baseY, h: hgt, w: wid, depth: depth,
        lean: lean, phase: phase, sway: swayAmp, tint: tint,
        stagger: rnd(),                          // grow-in stagger 0..1
        blur: depth > 0.72 ? (depth - 0.72) * 8 : 0 // DOF for foreground
      });
      // occasional dew on mid/near blades
      if (depth > 0.4 && rnd() < 0.16) {
        dews.push({ b: i, at: rrange(0.35, 0.85), r: 1.1 + depth * 2.2 });
      }
      // occasional wildflower on a blade base
      if (depth > 0.35 && rnd() < 0.045) {
        var pal = rnd();
        var col = pal < 0.4 ? [232, 196, 92] :        // gold
                  pal < 0.72 ? [95, 224, 255] :        // cyan
                  [233, 239, 233];                     // ink/white
        flowers.push({
          x: x + rrange(-6, 6), y: baseY - hgt * rrange(0.55, 0.9),
          r: 2.6 + depth * 4.5, col: col, petals: 5 + ((rnd() * 3) | 0),
          phase: rnd() * Math.PI * 2, depth: depth
        });
      }
    }

    var pc = reduced ? 18 : 46;
    for (var j = 0; j < pc; j++) {
      pollen.push({
        x: rnd() * w, y: horizon + rnd() * (h - horizon),
        r: 0.6 + rnd() * 1.8, spd: 4 + rnd() * 14,
        phase: rnd() * Math.PI * 2, drift: rrange(-0.4, 0.4),
        a: 0.2 + rnd() * 0.5
      });
    }
    seeded = true;
  }

  // -------- LAYER 1: CRISP photo-real base (cover-fit + ken-burns + parallax) --
  // The photo is drawn UNTOUCHED at full alpha, source-over. The only grade is a
  // subtle radial EDGE vignette. Accents (motes + Seed of Life) are additive.
  function drawPhotoBase(ctx, env, loc, ts, mouse) {
    var w = env.w, h = env.h;

    // pick the primary loaded image (grass.jpg first)
    var img = null;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].ok) { img = imgs[i].img; break; }
    }
    if (!img) return;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;

    // COVER-FIT scale + gentle ken-burns zoom
    var scale = Math.max(w / iw, h / ih);
    scale *= 1.03 + loc * 0.10;
    var dw = iw * scale, dh = ih * scale;

    // subtle background parallax from the cursor + gentle crane-up via loc
    var offX = (mouse.snx || 0) * 18 * 0.2;
    var offY = (mouse.sny || 0) * 18 * 0.2 - loc * h * 0.03;  // crane-up: rise with loc

    var dx = (w - dw) * 0.5 + offX;
    var dy = (h - dh) * 0.5 + offY;

    ctx.save();
    // clip so the over-scanned cover never bleeds outside the canvas
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // ---- the photo, CRISP: no wash, no tint ----
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, dx, dy, dw, dh);

    // ---- ONLY grade allowed: subtle radial EDGE vignette ----
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(vigPlate(w, h), 0, 0);

    // ---- additive accents (sparkle ON the photo, never a slab) ----
    ctx.globalCompositeOperation = 'lighter';

    // one very faint gold Seed-of-Life circle etched in the upper haze
    var S = Math.round(Math.min(w, h) * 0.42);
    if (S > 8) {
      ctx.globalAlpha = 0.06 + 0.03 * Math.sin(loc * Math.PI);
      var sx = w * (0.5 + (mouse.snx || 0) * 0.02) - S / 2;
      var sy = h * 0.22 - loc * h * 0.03 - S / 2;
      ctx.drawImage(seedOfLife(S), sx, sy);
      ctx.globalAlpha = 1;
    }

    // a few gold firefly-bokeh motes drifting (sparse; fewer under lowfx)
    var moteSpr = pollenGlow();
    var moteN = env.lowfx ? 5 : 12;
    for (var mi = 0; mi < moteN; mi++) {
      // deterministic-ish per-mote drift
      var seed = mi * 0.618 + 0.11;
      var fx = ((seed * 1.7 + ts * (0.006 + seed * 0.01)) % 1);
      var fy = ((seed * 2.3 - ts * (0.004 + seed * 0.006)) % 1 + 1) % 1;
      var mxp = fx * w + Math.sin(ts * 0.5 + mi) * 22;
      var myp = fy * h * 0.9 + Math.cos(ts * 0.4 + mi * 1.3) * 18;
      var mr = (4 + (mi % 3) * 3);
      ctx.globalAlpha = 0.10 + 0.08 * (0.5 + 0.5 * Math.sin(ts * 0.7 + mi));
      ctx.drawImage(moteSpr, mxp - mr, myp - mr, mr * 2, mr * 2);
    }

    // ---- reset composite/alpha per contract ----
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // -------- LAYER 2 helpers: one tapered curved blade -----------------------
  function drawBlade(ctx, b, tipX, tipY, rimDir, gold) {
    var bx = b.x, by = b.y, hw = b.w * 0.5;
    // control point midway, pushed in curve direction
    var midX = bx + (tipX - bx) * 0.5 + b.lean * b.h * 0.28;
    var midY = by - b.h * 0.5;

    ctx.beginPath();
    ctx.moveTo(bx - hw, by);
    // up the left edge to the tip
    ctx.quadraticCurveTo(midX - hw * 0.5, midY, tipX, tipY);
    // back down the right edge, tapering to base
    ctx.quadraticCurveTo(midX + hw * 0.5, midY, bx + hw, by);
    ctx.closePath();
    ctx.fillStyle = b.tint;
    ctx.fill();

    // warm gold rim-light on the edge facing the dawn light
    var edgeX = bx + rimDir * hw;
    ctx.beginPath();
    ctx.moveTo(edgeX, by);
    ctx.quadraticCurveTo(midX + rimDir * hw * 0.5, midY, tipX, tipY);
    ctx.lineWidth = Math.max(0.5, hw * 0.35);
    ctx.strokeStyle = gold;
    ctx.globalAlpha *= 0.6;
    ctx.stroke();
    ctx.globalAlpha /= 0.6;
  }

  // -------- LAYER 3: cyber cross-section overlay (subtle + cheap) ------------
  function drawCyberOverlay(ctx, env, loc, ts) {
    var w = env.w, h = env.h, PAL = env.PAL;
    ctx.save();

    // (a+c) STATIC wireframe grid + border frame + corner ticks — one cached
    // offscreen (was re-stroked every frame). Baked at the same relative alphas
    // the original used; drawn under the shell's current globalAlpha so the
    // shell fade still multiplies through.
    ctx.drawImage(buildGrid(w, h, PAL), 0, 0);

    // (b) scrolling mono data-readout column down the right edge
    // (skip entirely on reduced-motion OR struggling devices — non-essential text)
    if (!env.reduced && !env.lowfx) {
      ctx.globalAlpha *= 0.5;
      ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = PAL.emerald;
      var colX = w - 116;
      // faint backing strip
      ctx.globalAlpha *= 0.25;
      ctx.fillStyle = 'rgba(0,20,14,1)';
      ctx.fillRect(colX - 8, 0, 124, h);
      ctx.globalAlpha /= 0.25;
      ctx.fillStyle = PAL.emerald;
      var lineH = 15;
      var scroll = (ts * 22) % lineH;
      var n = Math.ceil(h / lineH) + 1;
      for (var li = 0; li < n; li++) {
        var y = li * lineH - scroll;
        // deterministic-ish hex-ish readout per line + slow time index
        var seedv = (li * 2654435761 + ((ts * 4) | 0)) >>> 0;
        var hex = (seedv % 0xfffff).toString(16).toUpperCase();
        while (hex.length < 5) hex = '0' + hex;
        var label = li % 4 === 0 ? 'FLR' : li % 4 === 1 ? 'BIO'
                  : li % 4 === 2 ? 'H2O' : 'CHL';
        var val = ((seedv >> 8) % 1000) / 10;
        ctx.globalAlpha *= (y < 12 || y > h - 14) ? 0.35 : 1;
        ctx.fillText(label + ' 0x' + hex + ' ' + val.toFixed(1), colX, y);
        ctx.globalAlpha /= (y < 12 || y > h - 14) ? 0.35 : 1;
      }
      // scan line label header
      ctx.globalAlpha /= 0.5;
    }

    // (c) border frame + corner ticks are now baked into the cached grid plate
    //     above (buildGrid) — no per-frame stroking needed.

    ctx.restore();
  }

  window.__DESCENT.scenes.push({
    id: 'grass',
    label: 'II · LIVING FIELD',

    init: function (env) { loadImages(); build(env); },
    resize: function (env) { build(env); },

    draw: function (ctx, env, p, mouse, t) {
      if (!seeded) build(env);
      if (!imgTried) loadImages();
      var w = env.w, h = env.h, PAL = env.PAL;
      var loc = p.local;
      var ts = t * 0.001;
      var hasPhoto = anyImageReady();

      // ===================================================================
      // LAYER 1 — BASE
      // ===================================================================
      if (hasPhoto) {
        drawPhotoBase(ctx, env, loc, ts, mouse);
      } else {
        // ---- procedural fallback: dawn gradient + sun disc (cached plate) ----
        var fb = clamp(Math.round(loc * (PHOTO_BUCKETS - 1)), 0, PHOTO_BUCKETS - 1);
        ctx.drawImage(fallbackPlate(w, h, fb, PAL), 0, 0);
      }

      // ===================================================================
      // LAYER 2 — PROCEDURAL INTERACTION (the star): grow + sway + part
      // ===================================================================
      // ---- CINEMATIC CAMERA (subtle, eased, keyed to p.local + time) --------
      // ease-in-out over the scroll so the move accelerates then settles.
      var camE = loc * loc * (3 - 2 * loc);          // smoothstep(loc)
      // slow TRUCK-LEFT drift through the blades (deliberate lateral travel).
      // parallax: near blades (depth~1) travel more than far ones.
      var camTruckBase = -camE * w * 0.10             // scroll-driven leftward truck
                       + Math.sin(ts * 0.06) * w * 0.012; // gentle time breathe
      // micro CRANE-UP: gentle vertical rise layered ON TOP of the existing lift.
      var camLift = loc * h * 0.06 + camE * h * 0.05
                  + Math.sin(ts * 0.05 + 0.7) * h * 0.004;
      // slow wind WAVES rolling L->R across the field (spatial phase by x).
      var windT = ts * 0.5;
      var horizon = h * 0.30 - camLift;

      // GROW-IN envelope: field sprouts as loc 0 -> ~0.35, staggered per blade
      var GROW_END = 0.35;

      // light direction: +1 = right edge lit, -1 = left. Rakes with loc.
      var rimDir = Math.cos(loc * Math.PI) >= 0 ? 1 : -1;
      var goldRim = 'rgba(232,196,92,0.9)';

      var mx = mouse.ex, my = mouse.ey;
      var down = mouse.down;
      var globalSway = Math.sin(ts * 0.8) * 6 + Math.sin(ts * 1.7 + 1.3) * 3;

      // over-photo silhouettes read best with a hair of shadow: draw darker fill
      // LOWFX: thin the field (skip ~every 3rd blade) so slow devices recover.
      var lowfx = !!env.lowfx;
      // Procedural blades/flowers are the FALLBACK for when no photo is loaded.
      // With the hi-res photo present it already contains real blades/flowers/dew —
      // drawing procedural silhouettes on top is redundant, clashes, and the
      // per-blade ctx.filter='blur()' was the main lag/freeze source. Skip entirely.
      if (!hasPhoto) {
      for (var i = 0; i < blades.length; i++) {
        if (lowfx && (i % 3 === 2)) continue;    // drop ~1/3 of blades
        var b = blades[i];

        // ---- GROW factor: eased, per-blade staggered
        var gp = loc / GROW_END;                 // 0..1+ progress
        gp = (gp - b.stagger * 0.55) / (1 - b.stagger * 0.55 + 0.0001);
        var grow = clamp(gp, 0, 1);
        // ease-out-back-ish sprout
        grow = grow < 1 ? 1 - Math.pow(1 - grow, 2.2) : 1;
        if (grow <= 0.001) continue;             // not sprouted yet
        var bh = b.h * grow;

        // CAMERA TRUCK: parallax lateral drift (near blades move more).
        var bx = b.x + camTruckBase * (0.35 + b.depth * 0.85);
        // camera tilt: near blades shift down slightly as camera rises
        var by = b.y + camLift * (b.depth * 0.8);

        // traveling wind WAVE rolling L->R across the field (phase from x).
        var windWave = Math.sin(windT - bx * 0.006 + b.phase * 0.3)
                     * (5 + b.depth * 10);
        // natural per-blade sway + global wind + wind-wave (scaled by grow)
        var sway = (Math.sin(ts * 1.4 + b.phase) * b.sway
                   + globalSway * (0.4 + b.depth)
                   + windWave) * grow;
        var tipX = bx + b.lean * bh + sway;
        var tipY = by - bh;

        // MOUSE: bend & part away from cursor with distance falloff
        var dx = bx - mx, dy = (by - bh * 0.6) - my;
        var d2 = dx * dx + dy * dy;
        var reach = 150 + b.depth * 90;
        if (d2 < reach * reach) {
          var d = Math.sqrt(d2) || 0.001;
          var fall = 1 - d / reach;              // 0..1
          fall = fall * fall * (down ? 1.5 : 1.0);
          var push = (dx / d) * fall * (70 + b.depth * 90);
          tipX += push;
          tipY += Math.abs(fall) * 10 * b.depth; // flatten slightly when parted
        }

        var doBlur = b.blur > 0 && !env.reduced;
        if (doBlur) { ctx.save(); ctx.filter = 'blur(' + b.blur + 'px)'; }
        // slightly darken the silhouette tint so blades read against warm photo
        var bb = { x: bx, y: by, w: b.w * (0.5 + 0.5 * grow), h: bh, lean: b.lean, tint: b.tint };
        drawBlade(ctx, bb, tipX, tipY, rimDir, goldRim);
        if (doBlur) ctx.restore();

        // dew drops carried on this blade (only once mostly grown)
        if (grow > 0.7) {
          for (var k = 0; k < dews.length; k++) {
            var dw = dews[k];
            if (dw.b !== i) continue;
            var dxp = bx + (tipX - bx) * dw.at;
            var dyp = by + (tipY - by) * dw.at;
            ctx.beginPath();
            ctx.arc(dxp, dyp, dw.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(95,224,255,0.30)';
            ctx.fill();
            // catch-light highlight, side depends on dawn direction
            ctx.beginPath();
            ctx.arc(dxp - rimDir * dw.r * 0.35, dyp - dw.r * 0.35, dw.r * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(233,239,233,0.9)';
            ctx.fill();
          }
        }
      }

      // ---- wildflowers (fade in with the field)
      var flAlpha = clamp((loc - 0.15) / 0.2, 0, 1);
      if (flAlpha > 0.01) {
        for (var f = 0; f < flowers.length; f++) {
          var fl = flowers[f];
          var fx = fl.x + camTruckBase * (0.35 + fl.depth * 0.85)
                 + Math.sin(ts * 1.2 + fl.phase) * (2 + fl.depth * 4);
          var fy = fl.y + camLift * (fl.depth * 0.8);
          ctx.save();
          ctx.globalAlpha *= flAlpha;
          ctx.translate(fx, fy);
          var c = fl.col;
          for (var pt = 0; pt < fl.petals; pt++) {
            var ang = (pt / fl.petals) * Math.PI * 2 + ts * 0.2;
            var px = Math.cos(ang) * fl.r, py = Math.sin(ang) * fl.r;
            ctx.beginPath();
            ctx.ellipse(px, py, fl.r * 0.55, fl.r * 0.35, ang, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.9)';
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(0, 0, fl.r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(232,196,92,0.95)';
          ctx.fill();
          ctx.restore();
        }
      }
      } // end if(!hasPhoto): procedural blades + flowers are photo fallback only

      // ---- drifting pollen motes (glow, upward + drift) over the photo
      // cached glow sprite (was a per-mote per-frame radial gradient). Per-mote
      // brightness comes from globalAlpha (po.a) instead of a bespoke gradient.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var moteSpr = pollenGlow();
      var baseA = ctx.globalAlpha;
      // LOWFX: halve the mote count for struggling devices.
      var pStep = lowfx ? 2 : 1;
      for (var m = 0; m < pollen.length; m += pStep) {
        var po = pollen[m];
        var py2 = po.y - ((ts * po.spd) % (h + 40));
        if (py2 < horizon - 20) py2 += (h - horizon) + 60;
        var px2 = po.x + Math.sin(ts * 0.6 + po.phase) * 18 + po.drift * (ts * 6 % 60);
        px2 = ((px2 % w) + w) % w;
        var mr = po.r * 3;
        ctx.globalAlpha = baseA * po.a;
        ctx.drawImage(moteSpr, px2 - mr, py2 - mr, mr * 2, mr * 2);
      }
      ctx.globalAlpha = baseA;
      ctx.restore();

      // ===================================================================
      // LAYER 3 — CYBER CROSS-SECTION OVERLAY (subtle)
      // ===================================================================
      drawCyberOverlay(ctx, env, loc, ts);
    }
  });
})();
