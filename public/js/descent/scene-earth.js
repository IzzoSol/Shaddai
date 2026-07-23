/* SHADDAI · DESCENT THROUGH SCALE — Scene IV: SUN & MOON / DAY↔NIGHT
 * A hi-def photoreal Earth horizon (dusk) that stays CRISP the whole beat.
 * Day↔night is driven by p.local WITHOUT tinting the base photo:
 *   - additive GOLD sun-bloom glow (day) that fades as night advances
 *   - additive CYAN city-light sparkle field on the night side
 *   - a soft dark gradient creeping in from the frame EDGE on the night side
 *   - one subtle radial EDGE VIGNETTE (the only grade over the whole image)
 * NO full-frame color wash over the photo — that muddied it before (FORBIDDEN).
 * Vanilla canvas 2D, no libs, per-frame allocation avoided via sprite caches.
 */
(function () {
  'use strict';
  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- small allocation-free helpers ----
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  // ---- persistent scene state ----
  var S = {
    sparks: null,   // {x,y (0..1), r, tw, ph} cyan city-light sparkle field
    w: 0, h: 0
  };

  // ---- PERF: offscreen glow sprites (built once, drawImage each frame) ----
  function makeGlowSprite(size, rgb, stops) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) {
      grd.addColorStop(stops[i][0], 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + stops[i][1] + ')');
    }
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return c;
  }

  // gold sun-bloom + cyan sparkle glow, built once (color-static, alpha via globalAlpha)
  var sunBloom = null;   // warm gold soft bloom
  var moonBloom = null;  // cool silver soft bloom
  var sparkDot = null;   // tiny cyan sparkle
  function buildSprites() {
    if (sunBloom) return;
    sunBloom  = makeGlowSprite(256, [232, 196, 92],  [[0, 0.9], [0.28, 0.42], [0.6, 0.12], [1, 0]]);
    moonBloom = makeGlowSprite(200, [200, 224, 240], [[0, 0.7], [0.3, 0.28], [1, 0]]);
    sparkDot  = makeGlowSprite(32,  [120, 240, 255], [[0, 1], [0.5, 0.35], [1, 0]]);
  }

  // ---- edge-vignette + night-edge-darkness plates, cached by size + step ----
  // These are drawn WITH source-over but are transparent in the CENTER, so the
  // crisp photo shows through untouched — only frame edges/corners darken.
  var VSTEPS = 8;
  var vigCache = { w: 0, h: 0, vignette: null, nightEdge: null };
  function buildVignettes(w, h) {
    if (vigCache.w === w && vigCache.h === h && vigCache.vignette) return;
    vigCache.w = w; vigCache.h = h;

    // (a) constant subtle EDGE VIGNETTE — transparent center -> corners rgba(6,8,11,0.5)
    var vc = document.createElement('canvas'); vc.width = w; vc.height = h;
    var vg = vc.getContext('2d');
    var inner = Math.min(w, h) * 0.42;
    var outer = Math.max(w, h) * 0.75;
    var rg = vg.createRadialGradient(w * 0.5, h * 0.5, inner, w * 0.5, h * 0.5, outer);
    rg.addColorStop(0, 'rgba(6,8,11,0)');
    rg.addColorStop(1, 'rgba(6,8,11,0.5)');
    vg.fillStyle = rg; vg.fillRect(0, 0, w, h);
    vigCache.vignette = vc;

    // (b) NIGHT-EDGE dark gradients, quantized. Dark creeps in ONLY from the
    // frame edges (top band + side rails) on the night side — never a wash over
    // the photo center. Each step ramps the edge darkness up toward full night.
    vigCache.nightEdge = new Array(VSTEPS + 1);
    for (var q = 0; q <= VSTEPS; q++) {
      var night = q / VSTEPS;
      var nc = document.createElement('canvas'); nc.width = w; nc.height = h;
      var ng = nc.getContext('2d');
      var edgeA = 0.72 * night;                 // peak darkness at frame edge
      // top edge -> transparent by ~40% down
      var tg = ng.createLinearGradient(0, 0, 0, h * 0.42);
      tg.addColorStop(0, 'rgba(4,7,11,' + edgeA.toFixed(3) + ')');
      tg.addColorStop(1, 'rgba(4,7,11,0)');
      ng.fillStyle = tg; ng.fillRect(0, 0, w, h * 0.42);
      // bottom edge -> transparent by ~65% up (deeper foreground shadow at night)
      var bg = ng.createLinearGradient(0, h, 0, h * 0.55);
      bg.addColorStop(0, 'rgba(3,6,9,' + (edgeA * 0.9).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(3,6,9,0)');
      ng.fillStyle = bg; ng.fillRect(0, h * 0.55, w, h * 0.45);
      // left rail
      var lg = ng.createLinearGradient(0, 0, w * 0.22, 0);
      lg.addColorStop(0, 'rgba(4,7,11,' + (edgeA * 0.8).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(4,7,11,0)');
      ng.fillStyle = lg; ng.fillRect(0, 0, w * 0.22, h);
      // right rail
      var rgr = ng.createLinearGradient(w, 0, w * 0.78, 0);
      rgr.addColorStop(0, 'rgba(4,7,11,' + (edgeA * 0.8).toFixed(3) + ')');
      rgr.addColorStop(1, 'rgba(4,7,11,0)');
      ng.fillStyle = rgr; ng.fillRect(w * 0.78, 0, w * 0.22, h);
      vigCache.nightEdge[q] = nc;
    }
  }

  // ---- fallback obsidian -> deep-blue gradient plate (built once per size) ----
  var fbCache = { w: 0, h: 0, plate: null };
  function fallbackPlate(w, h) {
    if (fbCache.w === w && fbCache.h === h && fbCache.plate) return fbCache.plate;
    fbCache.w = w; fbCache.h = h;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, '#06080b');    // obsidian
    lg.addColorStop(1, '#0c1830');    // deep blue
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    fbCache.plate = c;
    return c;
  }

  // ---- PHOTO-REAL BASE (hi-def Earth horizon at dusk) ----------------------
  var photo = { img: null, ok: false, requested: false };
  var PHOTO_SRC = '/assets/journey/earth-hd.jpg';
  function requestPhoto() {
    if (photo.requested) return;
    photo.requested = true;
    var im = new Image();
    im.onload = function () { if (im.naturalWidth > 0) photo.ok = true; };
    im.onerror = function () { photo.ok = false; };
    im.src = PHOTO_SRC;
    photo.img = im;
  }

  window.__DESCENT.scenes.push({
    id: 'earth',
    label: 'IV · SUN & MOON',

    init: function (env) {
      buildSprites();
      requestPhoto();
      vigCache.vignette = null; // rebuilt lazily for current size

      // Cyan city-light sparkle field — clustered low (below horizon band).
      var NS = env.reduced ? 60 : 160;
      var sparks = new Array(NS);
      for (var i = 0; i < NS; i++) {
        // bias toward lower half of frame (city lights on the dark side of Earth)
        var yy = 0.5 + Math.random() * 0.45;
        sparks[i] = {
          x: Math.random(),
          y: yy,
          r: 0.5 + Math.random() * 1.6,
          tw: Math.random() * Math.PI * 2,
          ph: Math.random()          // 0..1 phase: which sparkles ignite first
        };
      }
      S.sparks = sparks;
      S.w = env.w; S.h = env.h;
    },

    resize: function (env) {
      S.w = env.w; S.h = env.h;
      vigCache.vignette = null;      // size-dependent plates -> rebuild
      fbCache.plate = null;
    },

    draw: function (ctx, env, p, mouse, t) {
      var w = env.w, h = env.h;
      var pl = clamp(p.local, 0, 1);
      var night = smooth(pl);              // 0 day -> 1 night
      var reduced = env.reduced;
      var lowfx = !!env.lowfx;
      var pA = (p.alpha != null ? p.alpha : 1);
      var mnx = mouse ? (mouse.nx != null ? mouse.nx : 0.5) : 0.5;
      var snx = mouse ? (mouse.snx != null ? mouse.snx : 0) : 0;

      requestPhoto();
      buildVignettes(w, h);

      // ============================================================
      // 1+2. CRISP PHOTO BASE — full-screen cover-fit, ken-burns + parallax
      // ============================================================
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = pA;

      var img = (photo.ok && photo.img) ? photo.img : null;
      var iw = img ? (img.naturalWidth || img.width) : 0;
      var ih = img ? (img.naturalHeight || img.height) : 0;

      if (img && iw && ih) {
        // cover-fit + gentle ken-burns zoom + subtle horizontal parallax
        var kb = 1.03 + pl * 0.08;
        var sc = Math.max(w / iw, h / ih) * kb;
        var dw = iw * sc, dh = ih * sc;
        var parX = snx * 16 * 0.2;          // subtle parallax nudge
        var dx = (w - dw) / 2 + parX;
        var dy = (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      } else {
        // fallback: obsidian -> deep-blue gradient (never blank / never throws)
        ctx.drawImage(fallbackPlate(w, h), 0, 0);
      }
      ctx.restore();

      // ============================================================
      // 3. EDGE VIGNETTE — the ONLY grade over the whole image (subtle).
      //    Transparent center keeps the photo crisp; only corners darken.
      // ============================================================
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = pA;
      ctx.drawImage(vigCache.vignette, 0, 0);
      ctx.restore();

      // ============================================================
      // 4a. ADDITIVE GOLD SUN-BLOOM (day) — fades as night advances.
      //     Orbital horizontal drift via p.local; mouse nudges position.
      // ============================================================
      var dayAmt = 1 - night;                    // 1 day -> 0 night
      if (dayAmt > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // slow orbital drift: sun swings from right toward the horizon edge as
        // the beat progresses; mouse can nudge it slightly.
        var orbit = pl;                          // 0..1 camera/orbital drive
        var sunX = w * (0.72 - orbit * 0.20) + (mnx - 0.5) * w * 0.05;
        var sunY = h * (0.30 + orbit * 0.22);    // dips toward horizon
        var bloomR = w * (0.34 + dayAmt * 0.06);
        ctx.globalAlpha = pA * dayAmt * 0.9;
        ctx.drawImage(sunBloom, sunX - bloomR, sunY - bloomR, bloomR * 2, bloomR * 2);
        // hot core
        if (!lowfx) {
          var coreR = w * 0.10;
          ctx.globalAlpha = pA * dayAmt;
          ctx.drawImage(sunBloom, sunX - coreR, sunY - coreR, coreR * 2, coreR * 2);
        }
        ctx.restore();
      }

      // ============================================================
      // 4a'. ADDITIVE MOON BLOOM (night) — rises opposite the sun.
      // ============================================================
      var moonAmt = smooth(clamp((pl - 0.45) / 0.5, 0, 1));
      if (moonAmt > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var orbitM = pl;
        var moonX = w * (0.24 + orbitM * 0.14) - (mnx - 0.5) * w * 0.03;
        var moonY = h * (0.40 - moonAmt * 0.18);
        var mR = w * 0.16;
        ctx.globalAlpha = pA * moonAmt * 0.85;
        ctx.drawImage(moonBloom, moonX - mR, moonY - mR, mR * 2, mR * 2);
        ctx.restore();
      }

      // ============================================================
      // 4b. ADDITIVE CYAN CITY-LIGHT SPARKLE (night side, ignites with night).
      // ============================================================
      var sparkAmt = smooth(clamp((pl - 0.35) / 0.6, 0, 1));
      if (sparkAmt > 0.01 && S.sparks) {
        var sparks = S.sparks;
        var step = lowfx ? 2 : 1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < sparks.length; i += step) {
          var sp = sparks[i];
          // stagger ignition by phase so lights come on gradually
          var ign = clamp((sparkAmt - sp.ph * 0.5) / 0.5, 0, 1);
          if (ign < 0.02) continue;
          var tw = reduced ? 0.9 : (0.55 + 0.45 * Math.sin(t * 0.003 + sp.tw));
          var a = ign * tw;
          if (a < 0.03) continue;
          var r = sp.r * (2.2 + tw * 1.2);
          ctx.globalAlpha = pA * a * 0.85;
          ctx.drawImage(sparkDot, sp.x * w - r, sp.y * h - r, r * 2, r * 2);
        }
        ctx.restore();
      }

      // ============================================================
      // 4c. NIGHT EDGE-DARKNESS — soft dark creeping ONLY from frame edges on
      //     the night side. Never a wash over the photo center.
      // ============================================================
      if (night > 0.01 && !lowfx) {
        var qi = Math.round(night * VSTEPS);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = pA;
        ctx.drawImage(vigCache.nightEdge[qi], 0, 0);
        ctx.restore();
      } else if (night > 0.01 && lowfx) {
        // lowfx: still darken edges but skip the sparkle/bloom cost above
        var qiL = Math.round(night * VSTEPS);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = pA;
        ctx.drawImage(vigCache.nightEdge[qiL], 0, 0);
        ctx.restore();
      }

      // ============================================================
      // 5. Reset composite/alpha.
      // ============================================================
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  });
})();
