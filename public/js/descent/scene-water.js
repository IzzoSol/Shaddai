/* SHADDAI · Descent Through Scale — Scene III: THE SURFACE (OCEAN — SHOWSTOPPER)
 * Crisp-base recipe: the hi-def photoreal cymatics ocean is the HERO. It is
 * drawn full-screen cover-fit, CRISP (source-over, alpha 1), with only a slow
 * ken-burns + dive crane + subtle mouse parallax. The ONLY grade is a soft
 * radial EDGE vignette. Everything else is ADDITIVE ('lighter') sparkle on top
 * of the photo — a mouse-driven ripple (radial glow + expanding Flower-of-Life
 * rings), gold bioluminescent motes, and faint cyan caustic shimmer lines.
 * NO full-frame color wash/tint over the image — FORBIDDEN.
 * Vanilla canvas 2D. Never throws; falls back to obsidian→teal if photo unloaded. */
(function () {
  'use strict';
  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- photoreal hero image (lazy-loaded once, never blocks / never throws) --
  var baseImg = null;          // { img, ok }
  var baseRequested = false;
  var BASE_SRC = '/assets/journey/water-hd.jpg';
  function requestBase() {
    if (baseRequested) return;
    baseRequested = true;
    var rec = { img: new Image(), ok: false };
    rec.img.onload = function () { if (rec.img.naturalWidth > 0) rec.ok = true; };
    rec.img.onerror = function () { rec.ok = false; };
    try { rec.img.src = BASE_SRC; } catch (e) { rec.ok = false; }
    baseImg = rec;
  }

  function smooth01(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }

  // ---- fixed pools (allocated once in init) ---------------------------------
  var RIPPLE_MAX = 20;
  var ripples = null;   // {x,y,r,max,life,age,alive,w}
  var rp = 0;           // round-robin ripple cursor
  var lastDrop = 0;
  var lastSpawn = 0;

  var MOTE_MAX = 34;
  var motes = null;     // gold bioluminescent motes: {bx,by,ph,sp,sz,drift}

  // ---- PERF: cached fallback gradient (only used when photo is not loaded) ---
  // The photo path allocates ZERO gradients per frame. Only the edge vignette
  // needs a radial gradient; we cache it by a coarse size bucket so the hot
  // loop never re-creates gradients while dimensions stay stable.
  var vigCache = null, vigKey = '';
  function vignetteSprite(ctx, w, h) {
    var key = w + 'x' + h;
    if (vigCache && vigKey === key) return vigCache;
    // radial: transparent center → rgba(6,8,11,0.5) corners
    var g = ctx.createRadialGradient(
      w * 0.5, h * 0.5, Math.min(w, h) * 0.30,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(6,8,11,0)');
    g.addColorStop(0.7, 'rgba(6,8,11,0.12)');
    g.addColorStop(1, 'rgba(6,8,11,0.5)');
    vigCache = g; vigKey = key;
    return g;
  }

  // ---- Phase-2 shader bridge ------------------------------------------------
  // When the WebGL2 ocean shader is live (env.glOk && !lowfx && renderer built),
  // the #gl layer paints the LIVING WATER underneath. In that case the 2D layer
  // must NOT paint the opaque photo over the water region — it only rides light
  // ADDITIVE accents on top. When the shader is NOT active, the 2D layer keeps
  // its full Phase-1 crisp-photo behaviour (the certified fallback).
  var oceanGL = null;        // renderer instance (null until gl.init succeeds)
  var glReady = false;       // renderer compiled & alive this session
  var loggedNoOcean = false; // one-shot "shader unavailable" log
  var SUN_DIR = [-0.55, 0.42]; // low gold sun — matched to the deep-water art dir
  function shaderActive(env) {
    var lowfx = (!!env.q && env.q < 0.75) || !!env.lowfx;
    return !!(env.glOk && glReady && oceanGL && !lowfx);
  }

  function spawnRipple(x, y, strength) {
    var r = ripples[rp];
    rp = (rp + 1) % RIPPLE_MAX;
    r.x = x; r.y = y; r.r = 2; r.max = 70 + strength * 240;
    r.life = 950 + strength * 750; r.age = 0; r.alive = 1;
    r.w = 1.2 + strength * 3.2;
  }

  window.__DESCENT.scenes.push({
    id: 'water',
    label: 'III · THE SURFACE',

    init: function (env) {
      ripples = new Array(RIPPLE_MAX);
      for (var i = 0; i < RIPPLE_MAX; i++) {
        ripples[i] = { x: 0, y: 0, r: 0, max: 0, life: 1, age: 0, alive: 0, w: 1 };
      }
      motes = new Array(MOTE_MAX);
      for (var j = 0; j < MOTE_MAX; j++) {
        // deterministic pseudo-random layout, no per-frame alloc
        var s = (j * 9301 + 49297) % 233280 / 233280;
        var s2 = (j * 4021 + 12345) % 65536 / 65536;
        motes[j] = {
          bx: s, by: 0.15 + s2 * 0.8, ph: s2 * 6.28,
          sp: 0.25 + s * 0.7, sz: 1.1 + s2 * 2.6, drift: 0.02 + s * 0.05
        };
      }
      rp = 0; lastDrop = 0; lastSpawn = 0;
      vigCache = null; vigKey = '';
      requestBase();
    },

    resize: function (env) {
      vigCache = null; vigKey = '';   // rebuild vignette against new dims
    },

    draw: function (ctx, env, p, mouse, t) {
      var w = env.w, h = env.h, PAL = env.PAL || {};
      var reduced = !!env.reduced;
      var lowfx = (!!env.q && env.q < 0.75) || !!env.lowfx;
      var loc = p.local != null ? p.local : 0;      // 0..1 camera descent
      var alpha = (p.alpha != null ? p.alpha : 1);
      var lz = smooth01(loc);

      var mx = (mouse && mouse.x != null) ? mouse.x : w * 0.5;
      var my = (mouse && mouse.y != null) ? mouse.y : h * 0.5;
      var snx = (mouse && mouse.snx != null) ? mouse.snx : 0;
      var sny = (mouse && mouse.sny != null) ? mouse.sny : 0;
      var speed = (mouse && mouse.speed != null) ? mouse.speed
                : Math.abs((mouse && mouse.vx) || 0) + Math.abs((mouse && mouse.vy) || 0);

      requestBase();
      var hasPhoto = !!(baseImg && baseImg.ok);
      var glOn = shaderActive(env);   // shader paints the water on #gl underneath

      // ══════════ 1+2. CRISP PHOTO HERO — cover-fit, ken-burns, dive crane ══════════
      // COVER-FIT so the photo always fills the frame; gentle ken-burns zoom keyed
      // to descent + subtle mouse parallax. CRISP: source-over, alpha 1, NO tint.
      // Camera "dive": as p.local rises we ease a slow zoom-in + downward drift so
      // it feels like craning down INTO the water.
      // ── SHADER-ACTIVE PATH: do NOT paint the opaque photo over the living water.
      // Only lay a crisp SKY/horizon sliver at the very top so the surface has a
      // clean edge; the shader owns the water region; additive accents ride below.
      if (glOn) {
        var skyH = h * (0.14 * (1 - lz));   // sliver shrinks to nothing as we dive
        if (skyH > 1) {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          var sg = ctx.createLinearGradient(0, 0, 0, skyH);
          sg.addColorStop(0, PAL.void || '#06080b');
          sg.addColorStop(0.6, 'rgba(12,18,20,0.9)');
          sg.addColorStop(1, 'rgba(12,18,20,0)');   // fade into the shader water
          ctx.fillStyle = sg;
          ctx.fillRect(0, 0, w, skyH);
          ctx.restore();
        }
      } else if (hasPhoto) {
        var img = baseImg.img;
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (iw && ih) {
          // ken-burns + dive zoom: base cover scale * (1.03 + local*0.10)
          var kb = 1.03 + lz * 0.10 + (reduced ? 0 : Math.sin(t * 0.00005) * 0.008);
          var sc = Math.max(w / iw, h / ih) * kb;
          var dw = iw * sc, dh = ih * sc;
          // subtle parallax from pointer + downward crane drift on descent
          var parX = reduced ? 0 : snx * 18 * 0.2;
          var parY = reduced ? 0 : sny * 12 * 0.2;
          var diveY = lz * h * 0.06;                   // downward drift — dive feel
          var dx = (w - dw) / 2 + parX;
          var dy = (h - dh) / 2 + parY - diveY;
          ctx.save();
          ctx.globalAlpha = 1;                          // full opacity — crisp
          ctx.globalCompositeOperation = 'source-over';
          ctx.imageSmoothingEnabled = true;
          if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();
        } else {
          hasPhoto = false;
        }
      }

      // Fallback backdrop only if photo is NOT loaded AND the shader is not
      // painting the water (obsidian → teal). Shader-on = the shader owns the base.
      if (!hasPhoto && !glOn) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        var fg = ctx.createLinearGradient(0, 0, 0, h);
        fg.addColorStop(0, PAL.void || '#06080b');
        fg.addColorStop(0.6, '#062b30');
        fg.addColorStop(1, PAL.cyan ? '#0a3d44' : '#0a3d44');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // ══════════ 3. THE ONLY GRADE — soft radial EDGE VIGNETTE ══════════
      // transparent center → rgba(6,8,11,0.5) corners. NO full-frame wash.
      // Skipped when the shader is on — the shader bakes its own obsidian vignette
      // and a source-over slab here would dim the living water.
      if (!glOn) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = vignetteSprite(ctx, w, h);
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // ══════════ 4. ADDITIVE ACCENTS — all globalCompositeOperation='lighter' ══
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // -- (c) faint cyan caustic shimmer lines (subtle sparkle, not a slab) ----
      // A few bright wavy strokes that flow with a slow current; brighter lower.
      // When the shader is on it already renders rich cymatic caustics — damp the
      // 2D shimmer hard so we don't double the imagery (jewelry, not paint).
      var causticRows = lowfx ? 3 : 6;
      var causticGain = glOn ? 0.35 : 1;
      var flow = 0.0009 + loc * 0.0018;
      for (var ri = 0; ri < causticRows; ri++) {
        var f = ri / (causticRows - 1 || 1);          // 0 top .. 1 bottom
        var ry = h * (0.28 + f * 0.66);
        var amp = 8 + f * 30;
        var bright = (0.020 + f * 0.045) * (1 - loc * 0.35) * alpha * causticGain;
        if (bright <= 0.003) continue;
        ctx.globalAlpha = bright;
        ctx.strokeStyle = 'rgba(150,232,255,1)';       // cyan caustic
        ctx.lineWidth = 1 + f * 1.6;
        ctx.beginPath();
        var seg = lowfx ? 46 : 30;
        for (var xx = -40; xx <= w + 40; xx += seg) {
          var ph = xx * (0.011 - f * 0.003) + t * flow * (1 + f) - loc * 1.5;
          var yy = ry + Math.sin(ph) * amp * 0.20 +
                   Math.sin(ph * 0.5 + ri) * amp * 0.12;
          if (xx <= -40) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }

      // -- (b) gold bioluminescent motes drifting -------------------------------
      var moteMax = lowfx ? (MOTE_MAX >> 1) : MOTE_MAX;
      var breathe = reduced ? 0.5 : (Math.sin(t * 0.00035) * 0.5 + 0.5);
      ctx.fillStyle = 'rgba(232,196,92,1)';            // gold
      for (var gi = 0; gi < moteMax; gi++) {
        var gm = motes[gi];
        var gx = (((gm.bx + t * 0.00002 * gm.sp) % 1) + 1) % 1 * (w + 80) - 40;
        var gy = gm.by * h + Math.sin(t * 0.0006 * gm.sp + gm.ph) * (h * gm.drift);
        var twk = 0.5 + 0.5 * Math.sin(t * 0.0018 + gm.ph * 3.1);
        var ga = (0.12 + gm.sz * 0.05) * twk * (0.7 + 0.3 * breathe) * alpha;
        if (ga <= 0.004) continue;
        ctx.globalAlpha = ga;
        var gr = gm.sz * (1 + twk * 0.6);
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, 6.2832);
        ctx.fill();
      }

      // -- (a) MOUSE-DRIVEN RIPPLE — the headline "ripple the water" beat -------
      // A glow follows the pointer; fast movement emits expanding concentric ring
      // outlines (Flower-of-Life feel). All additive, tasteful.
      // spawn rings where the mouse moves fast:
      if (!reduced && speed > 4 && (t - lastSpawn) > 45) {
        var str = Math.min(1, speed / 55);
        spawnRipple(mx, my, str);
        lastSpawn = t;
      }
      // gentle self-ripple droplet so the water always feels alive (blooms
      // faster mid-descent), placed near the photo's sunlit center.
      // Auto self-drops only when the shader is OFF (shader keeps the water alive
      // on its own; extra 2D rings would compete with the shader ripple sim).
      var dropEvery = reduced ? 3400 : (2100 - smooth01(loc) * 700);
      if (!glOn && t - lastDrop > dropEvery) {
        var ddx = w * (0.32 + 0.4 * ((Math.sin(t * 0.0007) + 1) * 0.5));
        var ddy = h * (0.35 + 0.4 * ((Math.cos(t * 0.0011) + 1) * 0.5));
        spawnRipple(ddx, ddy, 0.5 + lz * 0.25);
        lastDrop = t;
      }

      // pointer glow — additive cyan/white radial that follows the pointer
      if (!reduced) {
        var glowBoost = Math.min(1, speed / 40);
        var gR = 60 + glowBoost * 90;
        var gA = (0.10 + glowBoost * 0.22) * alpha;
        var pg = ctx.createRadialGradient(mx, my, 0, mx, my, gR);
        pg.addColorStop(0, 'rgba(210,250,255,' + gA + ')');
        pg.addColorStop(0.4, 'rgba(120,230,255,' + (gA * 0.5) + ')');
        pg.addColorStop(1, 'rgba(120,230,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(mx, my, gR, 0, 6.2832);
        ctx.fill();
      }

      // expanding concentric ripple rings (Flower-of-Life bloom), perspective-squashed
      ctx.strokeStyle = 'rgba(190,240,255,1)';
      for (var k = 0; k < RIPPLE_MAX; k++) {
        var rr = ripples[k];
        if (!rr.alive) continue;
        rr.age += 16;
        if (rr.age >= rr.life) { rr.alive = 0; continue; }
        var kk = rr.age / rr.life;                     // 0..1
        rr.r = rr.max * (kk * (2 - kk));               // ease-out expansion
        var ra = (1 - kk) * 0.55 * alpha;
        if (ra <= 0.004) continue;
        var squash = 0.42 + (rr.y / (h || 1)) * 0.4;   // flatter higher up
        ctx.lineWidth = rr.w * (1 - kk) + 0.4;
        ctx.globalAlpha = ra;
        ctx.beginPath();
        ctx.ellipse(rr.x, rr.y, rr.r, rr.r * squash, 0, 0, 6.2832);
        ctx.stroke();
        // inner brighter ring — concentric bloom
        if (rr.r > 8) {
          ctx.globalAlpha = ra * 0.6;
          ctx.beginPath();
          ctx.ellipse(rr.x, rr.y, rr.r * 0.66, rr.r * 0.66 * squash, 0, 0, 6.2832);
          ctx.stroke();
        }
        // third ring at full quality for a richer Flower-of-Life feel
        if (!lowfx && rr.r > 20) {
          ctx.globalAlpha = ra * 0.35;
          ctx.beginPath();
          ctx.ellipse(rr.x, rr.y, rr.r * 0.4, rr.r * 0.4 * squash, 0, 0, 6.2832);
          ctx.stroke();
        }
      }

      ctx.restore(); // end additive accents

      // ══════════ 5. RESET composite / alpha ══════════
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    },

    // ══════════════════ PHASE-2 WebGL2 OCEAN SHADER ══════════════════
    // Optional GL layer on #gl (UNDER #art). Renders the LIVING WATER:
    // ripple sim ping-pong (256²) + sun-glint bloom + Fresnel + dive-to-deep
    // with fish + god-rays. If the renderer can't be built (no WebGL2, missing
    // float FBO, compile/link fail) it stays null → shaderActive()=false → the
    // 2D crisp-photo fallback renders. Never throws.
    gl: {
      init: function (glenv) {
        glReady = false; oceanGL = null;
        try {
          if (!glenv || !glenv.gl || !window.DescentOcean) return;
          oceanGL = window.DescentOcean.create(window.DGL, glenv);
          glReady = !!oceanGL;
          if (!glReady && !loggedNoOcean) {
            loggedNoOcean = true;
            console.info('[water] ocean shader unavailable — using 2D crisp-photo fallback.');
          }
        } catch (e) {
          oceanGL = null; glReady = false;
        }
      },
      resize: function (glenv) {
        if (!oceanGL) return;
        try { oceanGL.resize(glenv); } catch (e) {}
      },
      draw: function (glenv, p, mouse, t) {
        // hard-gate: bail cleanly if the renderer isn't built or lowfx kicked in.
        // (DGL only calls gl.draw when a live WebGL2 context exists; on context
        //  loss DGL clears the live-map and re-inits, so oceanGL is rebuilt.)
        if (!oceanGL || !glenv || !glenv.gl) return;
        var lowfx = (!!glenv.q && glenv.q < 0.75);
        if (lowfx) return;   // lowfx → shader off; 2D fallback owns the frame
        try { oceanGL.draw(glenv, p, mouse, t, SUN_DIR); }
        catch (e) { /* keep page alive; 2D still renders above */ }
      },
      dispose: function (glenv) {
        try { if (oceanGL) oceanGL.dispose(glenv); } catch (e) {}
        oceanGL = null; glReady = false;
      }
    }
  });
})();
