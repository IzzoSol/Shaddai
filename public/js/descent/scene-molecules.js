/* SHADDAI · Descent Through Scale
 * Scene I — QUANTUM LATTICE (molecular / atomic micro-world)
 * Vanilla canvas, no libs. Registers into window.__DESCENT.
 *
 * 3-LAYER CINEMATIC RECIPE:
 *   1. Photo-real base image (/assets/journey/molecules(.jpg | -1 | -2 | -3))
 *      — dimmed + theme-tinted, DoF vignette, ken-burns drift by p.local.
 *      Extra variants become faint glitchy "collage" overlays. Falls back
 *      to the procedural void gradient if nothing loaded yet.
 *   2. Neon procedural molecules ON TOP — atoms/electrons/bonds/rings/helix/
 *      DNA/clusters that CONVERGE toward the cursor (spring + soft cluster),
 *      electrons speed up near the mouse, drift apart when it's still.
 *   3. Cyber cross-section overlay — faint wireframe grid + a scrolling mono
 *      data-readout column + a thin layer-border frame. Subtle + cheap.
 */
(function () {
  'use strict';

  window.__DESCENT = window.__DESCENT || { scenes: [] };

  // ---- module-scoped pools (allocated once) -----------------------------
  var atoms = [];          // every atom across all molecules
  var molecules = [];      // groups of atoms + their bonds
  var sparks = [];         // cyan drifting spark particles
  var built = false;
  var centralIdx = 0;      // index of the molecule we zoom into
  var nearIdx = -1;        // molecule nearest cursor (recomputed each draw)

  // ---- photo-real base image collage -----------------------------------
  var imgs = [];           // {img, ok} loaded base/collage layers
  var imgsRequested = false;
  var IMG_SRCS = [
    '/assets/journey/molecules.jpg',
    '/assets/journey/molecules-1.jpg',
    '/assets/journey/molecules-2.jpg',
    '/assets/journey/molecules-3.jpg'
  ];
  function requestImages() {
    if (imgsRequested) return;
    imgsRequested = true;
    for (var i = 0; i < IMG_SRCS.length; i++) {
      (function (idx) {
        var rec = { img: new Image(), ok: false };
        rec.img.onload = function () {
          if (rec.img.naturalWidth > 0) rec.ok = true;
        };
        rec.img.onerror = function () { rec.ok = false; };
        rec.img.src = IMG_SRCS[idx];
        imgs.push(rec);
      })(i);
    }
  }
  function loadedImages() {
    var out = [];
    for (var i = 0; i < imgs.length; i++) if (imgs[i].ok) out.push(imgs[i].img);
    return out;
  }

  var LAYERS = [
    { z: 0.42, scale: 0.55, glow: 4.5, count: 5 },  // far  — small, crisp
    { z: 0.70, scale: 0.95, glow: 8.0, count: 4 },  // mid
    { z: 1.00, scale: 1.55, glow: 15.0, count: 3 }  // near — large, soft glow
  ];

  // ---- PERF: pre-rendered glow sprites (drawImage instead of per-frame gradients) ----
  var glowCache = {};            // hueBucket -> offscreen canvas (atom nucleus glow)
  function glowSprite(hue) {
    var key = Math.round(hue / 12) * 12;
    var c = glowCache[key];
    if (c) return c;
    var S = 64; c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, hsla(key, 1, 0.65, 0.55));
    grd.addColorStop(0.35, hsla(key, 1, 0.55, 0.22));
    grd.addColorStop(1, hsla(key, 1, 0.5, 0));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    glowCache[key] = c; return c;
  }
  var electronSprite = null;     // single cyan spark sprite (hue 190)
  function elSprite() {
    if (electronSprite) return electronSprite;
    var S = 48, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, hsla(190, 1, 0.85, 0.9));
    grd.addColorStop(1, hsla(190, 1, 0.7, 0));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    electronSprite = c; return c;
  }
  // static cyber grid+frame cached per size (only text/scan stays dynamic)
  var gridCache = null, gridW = 0, gridH = 0;

  // reusable mono readout strings (no per-frame alloc)
  var HUD_LABELS = ['C', 'H', 'O', 'N', 'P', 'S', 'Fe', 'Mg', 'Zn', 'Ca'];
  var hudRows = [];        // {label, val, hex} rebuilt only on resize

  // deterministic-ish PRNG so layout is stable per session
  var seed = 0x1a2b3c;
  function rnd() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  }
  function rr(a, b) { return a + (b - a) * rnd(); }

  // ---- geometry builders ------------------------------------------------
  function makeAtom(mol, ax, ay, radius, nEl, hue) {
    var electrons = [];
    for (var e = 0; e < nEl; e++) {
      electrons.push({
        a: rr(0, Math.PI * 2),          // orbit phase
        spd: rr(0.6, 1.4) * (e % 2 ? -1 : 1),
        rx: radius * rr(2.1, 3.0),      // ellipse radii
        ry: radius * rr(1.1, 1.9),
        tilt: rr(0, Math.PI)            // orbit plane rotation
      });
    }
    var atom = {
      mol: mol, ox: ax, oy: ay,         // base offset from molecule center
      cx0: ax, cy0: ay,                 // cluster-home (springs back to this)
      x: 0, y: 0, r: radius, hue: hue, el: electrons
    };
    atoms.push(atom);
    return atom;
  }

  function buildMolecule(cx, cy, layer, kind) {
    var mol = {
      cx: cx, cy: cy, hx: cx, hy: cy,   // hx/hy = home pos (springs back)
      layer: layer,
      rot: rr(0, Math.PI * 2), rotSpd: rr(-0.15, 0.15),
      elBoost: 0,                       // electron speed boost near cursor
      pull: 0,                          // 0..1 converge toward cursor
      atoms: [], bonds: [], kind: kind
    };

    var s = 18 * layer.scale;           // base atom spacing
    var hueBase = rr(150, 205);         // emerald(150)→cyan(205) range

    if (kind === 'ring') {
      // organic hexagonal ring (benzene-like), with alternating double bonds
      var n = 6, prev = null, first = null, list = [];
      for (var i = 0; i < n; i++) {
        var ang = (i / n) * Math.PI * 2;
        var a = makeAtom(mol, Math.cos(ang) * s * 1.6, Math.sin(ang) * s * 1.6,
          rr(3, 5) * layer.scale, 2 + (rnd() > 0.6 ? 1 : 0), hueBase + rr(-15, 15));
        mol.atoms.push(a); list.push(a);
        if (prev) mol.bonds.push([prev, a, i % 2]);   // 3rd elem = double flag
        if (!first) first = a;
        prev = a;
      }
      mol.bonds.push([prev, first, 1]);
    } else if (kind === 'helix') {
      // double-helix strand (DNA-like) — longer + rungs
      var turns = rr(2.2, 3.4), steps = 8;
      var prevA = null, prevB = null;
      for (var k = 0; k < steps; k++) {
        var ph = (k / steps) * Math.PI * 2 * turns;
        var yy = (k - steps / 2) * s * 1.05;
        var aA = makeAtom(mol, Math.cos(ph) * s, yy, rr(2.5, 4) * layer.scale, 2, hueBase - 10);
        var aB = makeAtom(mol, Math.cos(ph + Math.PI) * s, yy, rr(2.5, 4) * layer.scale, 2, hueBase + 25);
        mol.atoms.push(aA); mol.atoms.push(aB);
        mol.bonds.push([aA, aB, 0]);                 // rung
        if (prevA) { mol.bonds.push([prevA, aA, 0]); mol.bonds.push([prevB, aB, 0]); }
        prevA = aA; prevB = aB;
      }
    } else if (kind === 'protein') {
      // protein-like blob: dense core + shell of satellites, cross-linked
      var core = makeAtom(mol, 0, 0, rr(5, 7) * layer.scale, 3, hueBase);
      mol.atoms.push(core);
      var shell = [], sn = 5 + (rnd() * 3 | 0);
      for (var q = 0; q < sn; q++) {
        var qa = (q / sn) * Math.PI * 2 + rr(-0.2, 0.2);
        var qd = s * rr(1.4, 2.4);
        var sat = makeAtom(mol, Math.cos(qa) * qd, Math.sin(qa) * qd,
          rr(2.5, 4) * layer.scale, 2, hueBase + rr(-25, 30));
        mol.atoms.push(sat); shell.push(sat);
        mol.bonds.push([core, sat, 0]);
      }
      for (var c = 0; c < shell.length; c++) {          // cross-links
        if (rnd() > 0.5) mol.bonds.push([shell[c], shell[(c + 1) % shell.length], 0]);
      }
    } else {
      // small cluster (2-4 atoms) with central + satellites
      var nn = 2 + (rnd() * 3 | 0);
      var cc = makeAtom(mol, 0, 0, rr(4, 6.5) * layer.scale, 3, hueBase);
      mol.atoms.push(cc);
      for (var j = 0; j < nn; j++) {
        var aa = (j / nn) * Math.PI * 2 + rr(-0.3, 0.3);
        var dist = s * rr(1.3, 2.1);
        var st2 = makeAtom(mol, Math.cos(aa) * dist, Math.sin(aa) * dist,
          rr(2.5, 4) * layer.scale, 2, hueBase + rr(-20, 25));
        mol.atoms.push(st2);
        mol.bonds.push([cc, st2, 0]);
      }
    }

    molecules.push(mol);
    return mol;
  }

  function build(env) {
    requestImages();
    atoms.length = 0; molecules.length = 0; sparks.length = 0;
    seed = 0x1a2b3c;
    var w = env.w, h = env.h;

    for (var L = 0; L < LAYERS.length; L++) {
      var layer = LAYERS[L];
      for (var m = 0; m < layer.count; m++) {
        var roll = rnd();
        var kind = roll < 0.24 ? 'ring'
          : roll < 0.44 ? 'helix'
          : roll < 0.62 ? 'protein' : 'cluster';
        var cx = rr(0.08, 0.92) * w;
        var cy = rr(0.10, 0.90) * h;
        buildMolecule(cx, cy, layer, kind);
      }
    }

    // pick a near-layer molecule closest to screen center as zoom target
    var best = 1e9;
    for (var i = 0; i < molecules.length; i++) {
      var mo = molecules[i];
      if (mo.layer !== LAYERS[2]) continue;
      var d = Math.hypot(mo.cx - w / 2, mo.cy - h / 2);
      if (d < best) { best = d; centralIdx = i; }
    }
    // relocate the central molecule to true center for a clean zoom
    molecules[centralIdx].cx = molecules[centralIdx].hx = w / 2;
    molecules[centralIdx].cy = molecules[centralIdx].hy = h / 2;

    // cyan sparks (front dust)
    var NS = 56;
    for (var s2 = 0; s2 < NS; s2++) {
      sparks.push({
        x: rnd() * w, y: rnd() * h,
        z: rr(0.3, 1),
        vx: rr(-0.15, 0.15), vy: rr(-0.15, 0.15),
        r: rr(0.6, 1.8), tw: rr(0, Math.PI * 2)
      });
    }

    // HUD readout rows (built once — values animate via time)
    hudRows.length = 0;
    for (var hr = 0; hr < HUD_LABELS.length; hr++) {
      hudRows.push({ label: HUD_LABELS[hr], base: rr(0.1, 0.95), spd: rr(0.4, 1.6) });
    }

    built = true;
  }

  // ---- easing -----------------------------------------------------------
  function smooth(x) { return x * x * (3 - 2 * x); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // ---- 1. PHOTO-REAL BASE (image collage + tint + vignette + ken-burns) --
  function drawBase(ctx, env, p, imgList, time) {
    var w = env.w, h = env.h, PAL = env.PAL, reduced = !!env.reduced;

    if (imgList.length) {
      var lz = clamp01(p.local);
      // ken-burns: slow zoom + drift driven by p.local (and a touch of time)
      var kb = 1.06 + lz * 0.16 + (reduced ? 0 : Math.sin(time * 0.05) * 0.01);
      for (var i = 0; i < imgList.length; i++) {
        var img = imgList[i];
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) continue;
        // cover-fit scale
        var sc = Math.max(w / iw, h / ih) * kb;
        var dw = iw * sc, dh = ih * sc;
        // extra collage layers drift in slightly different directions (glitch feel)
        var driftX = (i === 0 ? -lz * 22 : (i % 2 ? 1 : -1) * (14 + i * 10) * lz);
        var driftY = (i === 0 ? -lz * 14 : (i % 2 ? -1 : 1) * (10 + i * 8) * lz);
        var dx = (w - dw) / 2 + driftX;
        var dy = (h - dh) / 2 + driftY;

        ctx.save();
        if (i === 0) {
          ctx.globalAlpha = 1;                 // base plate
        } else {
          // faint overlapping collage — additive glitch layer
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.14 + 0.05 * Math.sin(time * 0.3 + i);
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
      }

      // theme tint overlay — dim + cyan/emerald cast
      ctx.save();
      var tint = ctx.createLinearGradient(0, 0, 0, h);
      tint.addColorStop(0, 'rgba(6,18,20,0.62)');
      tint.addColorStop(0.5, 'rgba(4,12,14,0.55)');
      tint.addColorStop(1, 'rgba(4,10,12,0.66)');
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      // emerald/cyan colour wash (multiply-like via low-alpha screen)
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(0,60,52,0.30)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      // FALLBACK: procedural void gradient (never break if no image loaded)
      ctx.save();
      var g0 = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
      g0.addColorStop(0, '#0a1416');
      g0.addColorStop(1, PAL.void);
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // depth-of-field vignette (shared by both paths)
    ctx.save();
    var vg = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.28,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ---- 3. CYBER CROSS-SECTION OVERLAY (grid + HUD readout + frame) -------
  function drawCyberOverlay(ctx, env, time, detail) {
    var w = env.w, h = env.h, reduced = !!env.reduced;
    ctx.save();

    // faint wireframe grid + border frames — cached to offscreen (static per size)
    if (!gridCache || gridW !== w || gridH !== h) {
      gridW = w; gridH = h;
      gridCache = document.createElement('canvas'); gridCache.width = w; gridCache.height = h;
      var gc = gridCache.getContext('2d');
      gc.strokeStyle = 'rgba(95,224,255,0.055)'; gc.lineWidth = 1;
      var step = 64; gc.beginPath();
      for (var gx = step; gx < w; gx += step) { gc.moveTo(gx + 0.5, 0); gc.lineTo(gx + 0.5, h); }
      for (var gy = step; gy < h; gy += step) { gc.moveTo(0, gy + 0.5); gc.lineTo(w, gy + 0.5); }
      gc.stroke();
      gc.strokeStyle = 'rgba(0,255,156,0.22)'; gc.strokeRect(8.5, 8.5, w - 17, h - 17);
      gc.strokeStyle = 'rgba(95,224,255,0.10)'; gc.strokeRect(3.5, 3.5, w - 7, h - 7);
    }
    ctx.drawImage(gridCache, 0, 0);

    // scrolling mono data-readout column down the left edge
    ctx.font = '11px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    var colX = 14, rowH = 20;
    var scroll = reduced ? 0 : (time * 12) % rowH;
    var n = hudRows.length;
    for (var r = 0; r < n + Math.ceil(h / rowH); r++) {
      var y = (r * rowH) - scroll;
      if (y < -rowH || y > h) continue;
      var row = hudRows[r % n];
      var val = (row.base + (reduced ? 0 : Math.sin(time * row.spd + r) * 0.08));
      val = clamp01(val);
      var hex = (val * 4095 | 0).toString(16).toUpperCase();
      while (hex.length < 3) hex = '0' + hex;
      ctx.fillStyle = 'rgba(0,255,156,0.28)';
      ctx.fillText(row.label + ' 0x' + hex, colX, y);
      // tiny bar
      ctx.fillStyle = 'rgba(95,224,255,0.16)';
      ctx.fillRect(colX + 78, y - 3, 40 * val, 6);
    }

    // subtle scan-line pulse riding p.local zoom depth
    var scanY = ((time * 40) % (h + 80)) - 40;
    var sg = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
    sg.addColorStop(0, 'rgba(95,224,255,0)');
    sg.addColorStop(0.5, 'rgba(95,224,255,' + (0.05 + 0.05 * detail).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(95,224,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, scanY - 30, w, 60);

    ctx.restore();
  }

  window.__DESCENT.scenes.push({
    id: 'molecules',
    label: 'I · QUANTUM LATTICE',

    init: function (env) { requestImages(); build(env); },
    resize: function (env) { build(env); },

    draw: function (ctx, env, p, mouse, t) {
      if (!built) build(env);
      var w = env.w, h = env.h, PAL = env.PAL;
      var reduced = !!env.reduced;
      var time = (reduced ? 0 : t) * 0.001;

      // ================= LAYER 1: photo-real base ========================
      drawBase(ctx, env, p, loadedImages(), time);

      // ---- p.local camera: zoom into central (0→.55) then out (.55→1) ----
      var lz = clamp01(p.local);
      var zoom, camx, camy;
      if (lz <= 0.55) {
        var a = smooth(lz / 0.55);
        zoom = 1 + a * 2.2;                   // up to 3.2x
        var cm = molecules[centralIdx];
        camx = (w / 2 - cm.cx) * a;
        camy = (h / 2 - cm.cy) * a;
      } else {
        var b = smooth((lz - 0.55) / 0.45);
        zoom = 3.2 - b * 2.7;                 // 3.2 → 0.5 (full lattice)
        camx = (w / 2 - molecules[centralIdx].cx) * (1 - b);
        camy = (h / 2 - molecules[centralIdx].cy) * (1 - b);
      }
      // sub-detail reveal (electron shells / nucleus rings / cell hint)
      var detail = clamp01((zoom - 1.4) / 1.6);

      // ---- mouse parallax + convergence targets --------------------------
      var px = (mouse.nx - 0.5), py = (mouse.ny - 0.5);
      var mxr = mouse.x, myr = mouse.y;
      // cursor "stillness": low velocity → molecules drift back apart
      var speed = Math.min(1, Math.hypot(mouse.vx || 0, mouse.vy || 0) / 6);
      var active = clamp01(speed * 3 + (mouse.down ? 1 : 0));  // 0 when still

      // find molecule nearest cursor + apply spring convergence
      nearIdx = -1;
      var bestD = 1e9;
      for (var mi = 0; mi < molecules.length; mi++) {
        var mm = molecules[mi];
        var dd = Math.hypot(mm.cx - mxr, mm.cy - myr);
        if (dd < bestD) { bestD = dd; nearIdx = mi; }
      }

      if (!reduced) {
        var CLUSTER_R = Math.min(w, h) * 0.18;   // radius of convergence ring
        for (var ci = 0; ci < molecules.length; ci++) {
          var mc = molecules[ci];
          var toX = mxr - mc.hx, toY = myr - mc.hy;
          var distH = Math.hypot(toX, toY) || 1;
          // attraction strength: strong when active + within reach, near molecule most
          var reach = clamp01(1 - distH / (Math.max(w, h) * 0.55));
          var strength = active * reach * (ci === nearIdx ? 1 : 0.72);
          mc.pull += (strength - mc.pull) * 0.06;
          // converge to a point CLUSTER_R away from cursor along its direction
          var tx = mxr - (toX / distH) * CLUSTER_R * (1 - 0.55 * mc.pull);
          var ty = myr - (toY / distH) * CLUSTER_R * (1 - 0.55 * mc.pull);
          // spring cx/cy between home (hx) and converge target by pull
          var gx = mc.hx + (tx - mc.hx) * mc.pull;
          var gy = mc.hy + (ty - mc.hy) * mc.pull;
          mc.cx += (gx - mc.cx) * 0.09;
          mc.cy += (gy - mc.cy) * 0.09;
          // electron boost tracks pull
          mc.elBoost += (mc.pull - mc.elBoost) * 0.08;
          mc.rot += mc.rotSpd * 0.016;
          // nearest rotates to face cursor
          if (ci === nearIdx) {
            var dirA = Math.atan2(myr - mc.cy, mxr - mc.cx);
            var da = dirA - mc.rot;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            mc.rot += da * 0.05;
          }
        }
      }

      // ================= LAYER 2: neon molecules =========================
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2 + camx, -h / 2 + camy);

      for (var Li = 0; Li < LAYERS.length; Li++) {
        var layer = LAYERS[Li];
        var parX = px * 60 * layer.z;
        var parY = py * 60 * layer.z;

        for (var k = 0; k < molecules.length; k++) {
          var mol = molecules[k];
          if (mol.layer !== layer) continue;
          var isNear = (k === nearIdx);

          var mcx = mol.cx + parX;
          var mcy = mol.cy + parY;
          var ca = Math.cos(mol.rot), sa = Math.sin(mol.rot);

          // position atoms (rotated offsets)
          for (var ai = 0; ai < mol.atoms.length; ai++) {
            var at = mol.atoms[ai];
            at.x = mcx + at.ox * ca - at.oy * sa;
            at.y = mcy + at.ox * sa + at.oy * ca;
          }

          // ---- bonds (single / double) ----
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (var bi = 0; bi < mol.bonds.length; bi++) {
            var bnd = mol.bonds[bi];
            var b0 = bnd[0], b1 = bnd[1], dbl = bnd[2];
            var grad = ctx.createLinearGradient(b0.x, b0.y, b1.x, b1.y);
            var alpha = (0.30 + 0.25 * mol.pull) * layer.z;
            grad.addColorStop(0, hsla(b0.hue, 0.9, 0.55, alpha));
            grad.addColorStop(1, hsla(b1.hue, 0.9, 0.55, alpha));
            ctx.strokeStyle = grad;
            if (dbl) {
              // offset double line
              var ndx = -(b1.y - b0.y), ndy = (b1.x - b0.x);
              var nl = Math.hypot(ndx, ndy) || 1;
              var off = 1.6 * layer.scale; ndx = ndx / nl * off; ndy = ndy / nl * off;
              ctx.lineWidth = Math.max(0.5, 0.9 * layer.scale);
              ctx.beginPath();
              ctx.moveTo(b0.x + ndx, b0.y + ndy); ctx.lineTo(b1.x + ndx, b1.y + ndy);
              ctx.moveTo(b0.x - ndx, b0.y - ndy); ctx.lineTo(b1.x - ndx, b1.y - ndy);
              ctx.stroke();
            } else {
              ctx.lineWidth = Math.max(0.5, 1.1 * layer.scale);
              ctx.beginPath();
              ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y);
              ctx.stroke();
            }
          }
          ctx.restore();

          // ---- atoms: nucleus + electrons ----
          for (var an = 0; an < mol.atoms.length; an++) {
            drawAtom(ctx, mol.atoms[an], layer, time, mol.elBoost, detail, isNear);
          }
        }
      }

      // ---- deep-zoom "cell / DNA hint" (reveals MORE detail on zoom-in) ----
      if (detail > 0.35 && !reduced) {
        var cm2 = molecules[centralIdx];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var da2 = (detail - 0.35) / 0.65;
        // faint membrane ring
        ctx.strokeStyle = hsla(165, 1, 0.6, 0.10 * da2);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cm2.cx, cm2.cy, 120 + 20 * Math.sin(time * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        // organelle specks
        for (var oc = 0; oc < 10; oc++) {
          var oa = oc / 10 * Math.PI * 2 + time * 0.2;
          var orr = 55 + (oc % 3) * 22;
          var oxp = cm2.cx + Math.cos(oa) * orr;
          var oyp = cm2.cy + Math.sin(oa) * orr;
          ctx.fillStyle = hsla(oc % 2 ? 190 : 150, 1, 0.75, 0.16 * da2);
          ctx.beginPath();
          ctx.arc(oxp, oyp, 3 + (oc % 3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ---- cyan sparks (front dust) ----
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var si = 0; si < sparks.length; si++) {
        var sp = sparks[si];
        if (!reduced) {
          sp.x += sp.vx * sp.z; sp.y += sp.vy * sp.z;
          if (sp.x < 0) sp.x += w; else if (sp.x > w) sp.x -= w;
          if (sp.y < 0) sp.y += h; else if (sp.y > h) sp.y -= h;
        }
        var tw = 0.5 + 0.5 * Math.sin(time * 2 + sp.tw);
        var sx = sp.x + px * 90 * sp.z, sy = sp.y + py * 90 * sp.z;
        ctx.fillStyle = hsla(190, 1, 0.7, 0.28 * tw * sp.z);
        ctx.beginPath();
        ctx.arc(sx, sy, sp.r * (1 + tw * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.restore(); // camera

      // ================= LAYER 3: cyber cross-section ====================
      drawCyberOverlay(ctx, env, time, detail);
    }
  });

  // ---- atom renderer ----------------------------------------------------
  function drawAtom(ctx, atom, layer, time, boost, detail, isNear) {
    var r = atom.r;
    var hue = atom.hue;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // nucleus glow halo — cached sprite (was per-frame radial gradient)
    var glowR = r * (2.4 + layer.glow * 0.12) * (isNear ? 1.15 : 1);
    var spr = glowSprite(hue);
    ctx.drawImage(spr, atom.x - glowR, atom.y - glowR, glowR * 2, glowR * 2);

    // nucleus core
    ctx.fillStyle = hsla(hue, 0.6, 0.92, 0.95);
    ctx.beginPath();
    ctx.arc(atom.x, atom.y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // nucleus sub-detail rings (revealed on deep zoom)
    if (detail > 0.02) {
      ctx.strokeStyle = hsla(hue, 1, 0.8, 0.4 * detail);
      ctx.lineWidth = 0.6;
      for (var d = 1; d <= 2; d++) {
        ctx.beginPath();
        ctx.arc(atom.x, atom.y, r * (0.9 + d * 0.35 * detail), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // electrons on elliptical orbits
    var spd = (1 + boost * 2.2);
    for (var e = 0; e < atom.el.length; e++) {
      var el = atom.el[e];
      var ang = el.a + time * el.spd * spd;
      var ex = Math.cos(ang) * el.rx;
      var ey = Math.sin(ang) * el.ry;
      var ct = Math.cos(el.tilt), st = Math.sin(el.tilt);
      var rx = atom.x + ex * ct - ey * st;
      var ry = atom.y + ex * st + ey * ct;

      // faint orbit path (only at reasonable size / on zoom)
      if (layer.scale > 0.8 || detail > 0.1) {
        ctx.save();
        ctx.translate(atom.x, atom.y);
        ctx.rotate(el.tilt);
        ctx.strokeStyle = hsla(hue, 0.9, 0.6, 0.10 + 0.12 * detail);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, el.rx, el.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // electron spark (cyan-tinted) — cached sprite (was per-frame radial gradient)
      var er = r * 1.6, es = elSprite();
      ctx.drawImage(es, rx - er, ry - er, er * 2, er * 2);
    }

    ctx.restore();
  }

  function hsla(h, s, l, a) {
    return 'hsla(' + h + ',' + (s * 100).toFixed(0) + '%,' + (l * 100).toFixed(0) + '%,' + a + ')';
  }
})();
