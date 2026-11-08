/* world-water.js — ocean / lake / river water for the three.js WebGL world (2026-09-25).
 *
 * CREDITS — techniques and parameters are ported from TIDEWATER (MIT License,
 *   Copyright (c) 2026 DRG Software Solutions LLC, https://github.com/dgreenheck/tidewater).
 *   Full licence text: public/licenses/tidewater-MIT.txt. Ported from (WebGPU + WGSL originals):
 *     src/ocean/OceanFFT.js     JONSWAP + TMA spectrum, Horvath directional spreading, the two wave
 *                               systems (local wind sea + swell) and their params, choppiness 0.9,
 *                               cascade tile sizes 33.3 m / 7.1 m, whitecap foam bias 0.58
 *     src/ocean/WaterSurface.js per-wavelength shallow-water attenuation (d0 / floor per cascade),
 *                               band-limiting waves to the mesh spacing, whitecaps from the Jacobian,
 *                               foam pattern thresholding (foamScale 0.09/m, 2 rotated layers)
 *     src/ocean/WaterMaterial.js exact dielectric Fresnel (IOR 1.333), GGX sun glint with Cox-Munk
 *                               unresolved-slope roughness, horizon-occluded sky reflection, refracted
 *                               view path through the water column, Beer-Lambert absorption + single-
 *                               scattering (Henyey-Greenstein g=0.86) + multiple-scatter backscatter,
 *                               crest translucency (SSS), foam lighting, below-surface (Snell window) shading
 *     src/ocean/FoamTexture.js  the procedural tileable foam mat (fbm rafts, worley holes, bubbles)
 *     src/engine/render/Frame.js water absorption (0.42, 0.075, 0.035)/m, scattering (0.012, 0.018, 0.024)/m
 *
 * WHAT IS DIFFERENT FROM TIDEWATER (WebGL2, no compute, no extra render targets):
 *   - The 4-cascade 256² GPU FFT becomes: (a) ~20 Gerstner waves whose wavelengths, amplitudes and
 *     directions are SAMPLED FROM THE SAME JONSWAP/TMA/directional spectrum (CPU, once), displacing the
 *     mesh in the vertex shader and mirrored exactly on the CPU (waterHeightAt), and (b) two tileable
 *     "detail" textures baked once on the CPU from the same spectrum's short-wave band, stored as COMPLEX
 *     slope fields so they animate by phase rotation (real travelling waves, not a sliding normal map),
 *     sampled at Tidewater's 33.3 m and 7.1 m cascade tile sizes.
 *   - Refraction: there is no opaque-scene colour/depth copy, so the water is drawn in TWO blended passes:
 *     pass 1 MULTIPLIES what is already in the framebuffer by the per-channel transmittance exp(-σt·L)
 *     (sand → turquoise → deep blue, exactly Tidewater's Beer-Lambert term), pass 2 ADDS the in-scattered
 *     light, reflection, glint and foam. The path length L comes from a baked sea-floor depth texture
 *     (heightAt sampled under each body at build time) instead of the depth buffer, so objects standing
 *     in the water don't shorten it (Tidewater's "pylons shorten the path" term is dropped).
 *   - Sky: an analytic zenith/horizon gradient driven by setTimeOfDay() replaces the atmosphere LUTs.
 *     No SSR / planar reflection (terrain & buildings are not mirrored), no ShoreWaves breakers / swash
 *     simulation (replaced by depth-driven surf bands + a swash bead), no foam persistence (stateless),
 *     no caustics, no cloud / terrain shadows on the water.
 *
 * UNITS: game units (1 m = 7/1.8 = 3.889 u). All physics (spectrum, absorption, foam) runs in metres;
 * conversion happens at the boundaries (uPM uniform, *_u fields).
 *
 * BUILD:  window.buildWorldWater({ THREE, scene, camera, renderer, sun, heightAt, bodies, [options] })
 *   bodies: { type:'ocean', polygon:[[x,z],...] | center:[x,z], radius, level }
 *           { type:'lake',  center:[x,z], radius, level }
 *           { type:'river', path:[[x,z],...], width, level (number | array per path point | omitted = auto) }
 *   optional per body: depthRes (bake resolution), waveScale, flowSpeed (river, m/s)
 *   options: waveScale (1), seed (1337), depthRes (1024 max for oceans), farRadius (camera.far),
 *            windSpeed / windDirection (overrides the local system)
 *   → api { update(t, dt), setTimeOfDay(0..1), waterHeightAt(x,z,t) → y | null, isWater(x,z),
 *           dispose(), uniforms, group, waves }
 *   window.buildWorldWater.sunDirectionForTime(f, out?) → THREE-free [x,y,z] the lab uses to move its light.
 */
(function () {
  'use strict';
  var PM = 7 / 1.8, G = 9.81, IOR = 1.333, TWO_PI = Math.PI * 2;

  // ───────────────────────────── spectrum (port of OceanFFT.js SPECTRUM WGSL + updateSpectrumUniforms) ──
  // Tidewater's two wave systems, verbatim defaults (OceanFFT constructor).
  var LOCAL_SYS = { scale: 1, windSpeed: 7, windDirection: 25, fetch: 120, spreadBlend: 0.85, swell: 0.05, peakEnhancement: 3.3, shortWavesFade: 0.01 };
  var SWELL_SYS = { scale: 0.48, windSpeed: 6, windDirection: 5, fetch: 1200, spreadBlend: 1.0, swell: 0.9, peakEnhancement: 3.3, shortWavesFade: 0.1 };
  var SEA_DEPTH = 500;   // OceanFFT default depth (m) for the TMA correction / dispersion

  function sysParams(s) {   // WHY: same empirical JONSWAP fits Tidewater uses (alpha from fetch, peak ω from wind)
    var fetchM = Math.max(1, s.fetch) * 1000, U = Math.max(0.1, s.windSpeed);
    return {
      scale: s.scale, angle: s.windDirection * Math.PI / 180, spreadBlend: s.spreadBlend, swell: s.swell,
      alpha: 0.076 * Math.pow(G * fetchM / (U * U), -0.22),
      peakOmega: 22 * Math.pow(U * fetchM / (G * G), -0.33),
      gamma: s.peakEnhancement, shortWavesFade: s.shortWavesFade
    };
  }
  function tmaCorrection(omega) {   // finite-depth (TMA) damping of the long waves
    var oh = omega * Math.sqrt(SEA_DEPTH / G);
    if (oh <= 1) return 0.5 * oh * oh;
    if (oh < 2) return 1 - 0.5 * (2 - oh) * (2 - oh);
    return 1;
  }
  function jonswap(omega, p) {
    var sigma = omega <= p.peakOmega ? 0.07 : 0.09, d = omega - p.peakOmega;
    var r = Math.exp(-d * d / (sigma * sigma * p.peakOmega * p.peakOmega * 2)), inv = 1 / omega;
    return p.scale * tmaCorrection(omega) * p.alpha * G * G * Math.pow(inv, 5) *
      Math.exp(Math.pow(p.peakOmega * inv, 4) * -1.25) * Math.pow(Math.abs(p.gamma), r);
  }
  function normalisationFactor(s) {
    var s2 = s * s, s3 = s2 * s, s4 = s3 * s;
    if (s < 5) return s4 * -0.000564 + s3 * 0.00776 - s2 * 0.044 + s * 0.192 + 0.163;
    return s4 * -4.80e-08 + s3 * 1.07e-05 - s2 * 9.53e-04 + s * 5.90e-02 + 3.93e-01;
  }
  function directionSpectrum(theta, omega, p) {   // Horvath: cos² base blended with Donelan-Banner cos-2s
    var ratio = omega / p.peakOmega;
    var spreadPower = omega > p.peakOmega ? Math.pow(ratio, -2.5) * 9.77 : Math.pow(ratio, 5) * 6.97;
    var s = spreadPower + Math.tanh(Math.min(ratio, 20)) * 16 * p.swell * p.swell;
    var dT = theta - p.angle;
    var cos2s = normalisationFactor(s) * Math.pow(Math.abs(Math.cos(dT * 0.5)), s * 2);
    var c = Math.cos(dT), base = c > 0 ? c * c * (2 / Math.PI) : 0;
    return base + (cos2s - base) * p.spreadBlend;
  }
  function shortWavesFade(k, p) { return Math.exp(-p.shortWavesFade * p.shortWavesFade * k * k); }
  function mulberry(seed) {   // deterministic: every client builds the SAME sea (multiplayer boats agree)
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Gerstner set: each system's frequency range is split into log-spaced bins; each bin becomes ONE wave
  // with amplitude sqrt(2·S(ω)·Δω) (the variance in that bin) and a direction drawn from D(θ,ω) by
  // rejection sampling. This keeps Tidewater's sea state (Hs, peak period, spreading, swell angle) while
  // being cheap enough for the vertex shader AND an exact CPU mirror.
  function buildWaveSet(o) {
    var rand = mulberry(o.seed), waves = [];
    var loc = {}, k; for (k in LOCAL_SYS) loc[k] = LOCAL_SYS[k];
    if (o.windSpeed != null) loc.windSpeed = o.windSpeed;
    if (o.windDirection != null) loc.windDirection = o.windDirection;
    var LMIN = 9, LMAX = 260;   // metres; < 9 m is carried by the detail textures (overlap 4–11 m)
    function omegaOfLambda(l) { var kk = TWO_PI / l; return Math.sqrt(G * kk * Math.tanh(Math.min(kk * SEA_DEPTH, 20))); }
    var systems = [
      { p: sysParams(loc), n: 14, lo: 0.6, hi: 99 },
      { p: sysParams(SWELL_SYS), n: 6, lo: 0.75, hi: 2.2 }
    ];
    systems.forEach(function (sy) {
      var p = sy.p;
      var w0 = Math.max(sy.lo * p.peakOmega, omegaOfLambda(LMAX)), w1 = Math.min(sy.hi * p.peakOmega, omegaOfLambda(LMIN));
      if (w1 <= w0) return;
      for (var i = 0; i < sy.n; i++) {
        var e0 = w0 * Math.pow(w1 / w0, i / sy.n), e1 = w0 * Math.pow(w1 / w0, (i + 1) / sy.n);
        var w = e0 * Math.pow(e1 / e0, 0.3 + 0.4 * rand());      // jittered inside the bin (no beat patterns)
        var kk = w * w / G;                                         // deep water (tanh(k·500 m) ≈ 1 here)
        var S = jonswap(w, p) * shortWavesFade(kk, p);
        var amp = Math.sqrt(2 * Math.max(S, 0) * (e1 - e0)) * o.waveScale;
        var dMax = directionSpectrum(p.angle, w, p), th = p.angle;
        for (var t = 0; t < 400; t++) { var c = p.angle + (rand() * 2 - 1) * Math.PI; if (rand() * dMax <= directionSpectrum(c, w, p)) { th = c; break; } }
        var lam = TWO_PI / kk;
        waves.push({
          dx: Math.cos(th), dz: Math.sin(th), k: kk, omega: w, amp: amp, phase: rand() * TWO_PI, chop: 0.9 * amp, lambda: lam,
          // WaterSurface.js cascadeAttenuation: long waves feel the bottom first (d0), a floor fraction survives
          d0: Math.min(40, 0.8 * lam), floor: lam > 26 ? 0 : (lam > 5.5 ? 0.05 : 0.25)
        });
      }
    });
    // Choppiness 0.9 is Tidewater's horizontal/vertical ratio; cap the summed steepness so the Gerstner
    // surface can't loop over itself (the FFT has the same guard implicitly via the Jacobian clamp).
    var steep = waves.reduce(function (s, wv) { return s + wv.k * wv.chop; }, 0);
    if (steep > 0.85) waves.forEach(function (wv) { wv.chop *= 0.85 / steep; });
    return waves;
  }

  // ───────────────────────────── detail textures (short-wave band of the same spectrum) ──
  // Tileable 128² COMPLEX slope fields (Re∂h/∂x, Im∂h/∂x, Re∂h/∂z, Im∂h/∂z) over a 33.3 m tile (Tidewater
  // cascade 3). All components of one band share ω, so slope(t) = Re·cos ωt + Im·sin ωt reproduces true
  // travelling waves. Separable e^{ik·x} tables keep the bake at ~10M multiply-adds (~30 ms).
  // PERF 2026-11-07: split in two. detailComps (cheap, consumes the seeded rand stream) stays on the main thread; accumulateDetail
  // (the ~2 s pixel loop) is self-contained (Math only) so it can run in the bake Worker below. Same math = same bytes.
  function bakeDetailBand(p, L, nLo, nHi, size, rand) {
    var dc = detailComps(p, L, nLo, nHi, rand), r = accumulateDetail(dc.comps, size);
    return { data: r.data, scale: r.scale, omega: dc.omega };
  }
  function detailComps(p, L, nLo, nHi, rand) {
    var dk = TWO_PI / L, comps = [], nx, nz;
    for (nx = -nHi; nx <= nHi; nx++) for (nz = -nHi; nz <= nHi; nz++) {
      var n = Math.sqrt(nx * nx + nz * nz); if (n < nLo || n >= nHi) continue;
      var kx = nx * dk, kz = nz * dk, k = n * dk, w = Math.sqrt(G * k), th = Math.atan2(kz, kx);
      // 2-D wavenumber spectrum: S(kx,kz) = S(ω)·D(θ)·(dω/dk)/k ; amplitude = sqrt(2·S·Δkx·Δkz)
      var S = jonswap(w, p) * directionSpectrum(th, w, p) * (G / (2 * w)) / k * shortWavesFade(k, p);
      var a = Math.sqrt(2 * Math.max(S, 0)) * dk;
      if (a > 0) comps.push([nx, nz, kx * a, kz * a, rand() * TWO_PI, a]);
    }
    var aMax = comps.reduce(function (m, c) { return Math.max(m, c[5]); }, 0);
    comps = comps.filter(function (c) { return c[5] > aMax * 0.01; });   // upwind leftovers add nothing visible
    return { comps: comps, omega: Math.sqrt(G * dk * (nLo + nHi) * 0.5) };
  }
  function accumulateDetail(comps, size) {
    var TWO_PI = Math.PI * 2, i;
    var cosT = new Float32Array(size), sinT = new Float32Array(size);
    for (i = 0; i < size; i++) { cosT[i] = Math.cos(TWO_PI * i / size); sinT[i] = Math.sin(TWO_PI * i / size); }
    var f = new Float32Array(size * size * 4);
    comps.forEach(function (c) {
      var cp = Math.cos(c[4]), sp = Math.sin(c[4]), ax = c[2], az = c[3];
      for (var pz = 0; pz < size; pz++) {
        var iz = ((c[1] * pz) % size + size) % size;
        var zr = cp * cosT[iz] - sp * sinT[iz], zi = cp * sinT[iz] + sp * cosT[iz];   // e^{i(φ + kz·z)}
        var row = pz * size * 4;
        for (var px = 0; px < size; px++) {
          var ix = ((c[0] * px) % size + size) % size;
          var er = zr * cosT[ix] - zi * sinT[ix], ei = zr * sinT[ix] + zi * cosT[ix];
          var o = row + px * 4;
          // i·kx·a·e^{iθ} = kx·a·(−sinθ + i·cosθ)
          f[o] -= ax * ei; f[o + 1] += ax * er; f[o + 2] -= az * ei; f[o + 3] += az * er;
        }
      }
    });
    var m = 1e-6; for (i = 0; i < f.length; i++) m = Math.max(m, Math.abs(f[i]));
    var u8 = new Uint8Array(f.length);
    for (i = 0; i < f.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round((f[i] / m * 0.5 + 0.5) * 255)));
    return { data: u8, scale: m };
  }

  // Bake Worker: runs accumulateDetail + bakeFoam off the main thread (~6.5 s of the boot freeze measured 2026-11-07).
  // Built from the functions' own source, so there is one copy of the math. ?waterworker=0 or no Worker = old synchronous bake.
  var _bakeWorker = null, _bakeSeq = 0, _bakeCb = {};
  function bakeAsync(job, args, done) {
    var sync = function () { done(job === 'foam' ? bakeFoam(args.size) : accumulateDetail(args.comps, args.size)); };
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || (typeof location !== 'undefined' && /[?&]waterworker=0\b/.test(location.search))) return sync();
    try {
      if (!_bakeWorker) {
        var src = accumulateDetail.toString() + '\n' + bakeFoam.toString() +
          '\nonmessage=function(e){var d=e.data,r=d.job==="foam"?{data:bakeFoam(d.size)}:accumulateDetail(d.comps,d.size);postMessage({id:d.id,data:r.data,scale:r.scale},[r.data.buffer]);};';
        var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        _bakeWorker = new Worker(url); URL.revokeObjectURL(url);
        _bakeWorker.onmessage = function (e) { var cb = _bakeCb[e.data.id]; delete _bakeCb[e.data.id]; if (cb) cb.done(e.data); };
        _bakeWorker.onerror = function (ev) {   // worker failed: finish every pending job synchronously (never leave the water flat)
          console.warn('[water] bake worker failed, baking on the main thread:', ev && ev.message); var pend = _bakeCb; _bakeCb = {}; _bakeWorker = null;
          Object.keys(pend).forEach(function (k) { pend[k].sync(); });
        };
      }
      var id = ++_bakeSeq; _bakeCb[id] = { done: done, sync: sync };
      _bakeWorker.postMessage({ id: id, job: job, comps: args.comps, size: args.size });
    } catch (e) { sync(); }
  }

  // ───────────────────────────── foam mat (CPU port of FoamTexture.js compute kernel) ──
  // R: density rafts with worley holes · G: fine bubbles · B: large mottling (used for gusts) · A: streaks
  function bakeFoam(size) {
    var lat = {};
    function lattice(c) {   // hash2 of every periodic cell corner, cached (same hash as the WGSL)
      if (lat[c]) return lat[c];
      var a = new Float32Array(c * c * 2);
      for (var j = 0; j < c; j++) for (var i = 0; i < c; i++) {
        var h1 = Math.sin(i * 127.1 + j * 311.7) * 43758.5453, h2 = Math.sin(i * 269.5 + j * 183.3) * 43758.5453;
        a[(j * c + i) * 2] = h1 - Math.floor(h1); a[(j * c + i) * 2 + 1] = h2 - Math.floor(h2);
      }
      return (lat[c] = a);
    }
    function md(i, c) { return ((i % c) + c) % c; }
    function vnoise(u, v, c) {
      var L = lattice(c), px = u * c, py = v * c, ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
      var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      var x0 = md(ix, c), x1 = md(ix + 1, c), y0 = md(iy, c), y1 = md(iy + 1, c);
      var a = L[(y0 * c + x0) * 2], b = L[(y0 * c + x1) * 2], cc = L[(y1 * c + x0) * 2], d = L[(y1 * c + x1) * 2];
      return (a + (b - a) * ux) * (1 - uy) + (cc + (d - cc) * ux) * uy;
    }
    function fbm(u, v, base, oct) { var s = 0, a = 0.5, n = 0; for (var o = 0; o < oct; o++) { s += vnoise(u, v, base * Math.pow(2, o)) * a; n += a; a *= 0.5; } return s / n; }
    function worley(u, v, c) {
      var L = lattice(c), px = u * c, py = v * c, ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, f1 = 8;
      for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
        var q = (md(iy + j, c) * c + md(ix + i, c)) * 2, dx = i + L[q] - fx, dy = j + L[q + 1] - fy;
        f1 = Math.min(f1, Math.sqrt(dx * dx + dy * dy));
      }
      return f1;
    }
    function ss(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
    var out = new Uint8Array(size * size * 4);
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var u = (x + 0.5) / size, v = (y + 0.5) / size;
      var w1x = (fbm(u, v, 3, 4) - 0.5) * 0.14, w1y = (fbm(u + 0.43, v + 0.43, 3, 4) - 0.5) * 0.14;
      var wu = u + w1x, wv = v + w1y;
      var dens = fbm(wu, wv, 4, 6);
      var holeA = ss(0.28, 0.12, worley(wu, wv, 7) + (fbm(u, v, 16, 3) - 0.5) * 0.25);
      var holeB = ss(0.30, 0.16, worley(wu + 0.17, wv + 0.17, 19) + (fbm(u, v, 32, 2) - 0.5) * 0.3);
      var holeC = ss(0.32, 0.18, worley(wu + 0.61, wv + 0.61, 47));
      var holes = Math.min(1, holeA * 0.9 + holeB * 0.7 + holeC * 0.45);
      var bub = ss(0.24, 0.08, worley(u + 0.33, v + 0.33, 140)) * 0.8 + ss(0.2, 0.05, worley(u + 0.71, v + 0.71, 260)) * 0.5;
      var streak = fbm(u + w1x * 2, v + w1y * 2, 12, 4);
      var foam = Math.max(0, Math.min(1, dens * 1.35 - holes * 0.55 + bub * 0.08));
      var mottle = fbm(u, v, 2, 3);
      var o = (y * size + x) * 4;
      out[o] = foam * 255; out[o + 1] = Math.min(1, bub) * 255; out[o + 2] = mottle * 255; out[o + 3] = streak * 255;
    }
    return out;
  }

  // ───────────────────────────── geometry ──
  // Radial LOD grid: rings every max(minDr, r·2π/segs) → near-square cells whose size grows linearly with
  // distance (the same density falloff as Tidewater's CDLOD quadtree, in one static draw). It follows the
  // camera; each vertex carries its cell size (aSpacing) so waves shorter than ~3 cells are faded out in
  // the vertex shader (Tidewater band-limits cascades to the mesh spacing for the same reason: no
  // aliasing, no swimming while the grid slides under the waves).
  function radialGrid(THREE, radius, segs, minDr) {
    var radii = [0], r = 0;
    while (r < radius) { r += Math.max(minDr, r * TWO_PI / segs); radii.push(Math.min(r, radius)); }
    var nR = radii.length, pos = new Float32Array((1 + (nR - 1) * segs) * 3), sp = new Float32Array(1 + (nR - 1) * segs), idx = [];
    sp[0] = minDr;
    for (var i = 1; i < nR; i++) for (var j = 0; j < segs; j++) {
      var a = j / segs * TWO_PI, v = 1 + (i - 1) * segs + j;
      pos[v * 3] = Math.cos(a) * radii[i]; pos[v * 3 + 2] = Math.sin(a) * radii[i];
      sp[v] = Math.max(radii[i] - radii[i - 1], radii[i] * TWO_PI / segs);
    }
    // winding: (centre, +z, +x) is counter-clockwise seen from above → front face = air side
    function tri(a, b, c) {
      var cy = (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]) - (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]);
      if (cy >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    }
    for (j = 0; j < segs; j++) tri(0, 1 + j, 1 + (j + 1) % segs);
    for (i = 1; i < nR - 1; i++) for (j = 0; j < segs; j++) {
      var a0 = 1 + (i - 1) * segs + j, a1 = 1 + (i - 1) * segs + (j + 1) % segs, b0 = a0 + segs, b1 = a1 + segs;
      tri(a0, b0, b1); tri(a0, b1, a1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSpacing', new THREE.BufferAttribute(sp, 1));
    g.setIndex(idx);
    return g;
  }

  // River ribbon: the path is smoothed (Chaikin), resampled every ~half-width, and swept into a strip with
  // 7 vertices across. Each vertex carries flow (tangent·speed, m/s), across-coordinate (−1..1, for bank
  // foam) and water depth (m) below it — rivers don't need a depth texture.
  function buildRiver(THREE, b, heightAt) {
    var pts = b.path.map(function (p) { return [p[0], p[1]]; }), lv = Array.isArray(b.level) ? b.level.slice() : null;
    for (var it = 0; it < 2 && pts.length > 2; it++) {   // Chaikin: rounded bends, no kinks in the strip
      var np = [pts[0]], nl = lv ? [lv[0]] : null;
      for (var i = 0; i < pts.length - 1; i++) {
        var p = pts[i], q = pts[i + 1];
        np.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
        if (nl) nl.push(lv[i] * 0.75 + lv[i + 1] * 0.25, lv[i] * 0.25 + lv[i + 1] * 0.75);
      }
      np.push(pts[pts.length - 1]); if (nl) nl.push(lv[lv.length - 1]);
      pts = np; lv = nl;
    }
    var cum = [0]; for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var total = cum[cum.length - 1], W = b.width || 10 * PM, step = Math.min(W * 0.5, 8 * PM), n = Math.max(2, Math.ceil(total / step) + 1);
    var sec = [], seg = 0;
    for (i = 0; i < n; i++) {
      var s = total * i / (n - 1); while (seg < pts.length - 2 && cum[seg + 1] < s) seg++;
      var t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      var x = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, z = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t;
      var level;
      if (typeof b.level === 'number') level = b.level;
      else if (lv) level = lv[seg] + (lv[seg + 1] - lv[seg]) * t;
      else {
        // auto: fill the channel to just below its LOWER bank (never less than 0.3 m over the bed), so a
        // carved riverbed looks full and the ribbon edges tuck under the banks instead of floating
        var sdx = pts[seg + 1][0] - pts[seg][0], sdz = pts[seg + 1][1] - pts[seg][1], sl = Math.hypot(sdx, sdz) || 1;
        var bx = -sdz / sl * W * 0.5, bz = sdx / sl * W * 0.5;
        var bank = Math.min(heightAt(x + bx, z + bz), heightAt(x - bx, z - bz));
        level = Math.max(heightAt(x, z) + 0.3 * PM, bank - 0.25 * PM);
      }
      sec.push({ x: x, z: z, level: level });
    }
    // water never flows uphill: levels are clamped non-increasing downstream (path[0] = source)
    for (i = 1; i < n; i++) sec[i].level = Math.min(sec[i].level, sec[i - 1].level);
    var A = 6, nv = n * (A + 1), pos = new Float32Array(nv * 3), flow = new Float32Array(nv * 2), across = new Float32Array(nv), depth = new Float32Array(nv), spc = new Float32Array(nv), idx = [];
    var base = b.flowSpeed || 1.2;
    for (i = 0; i < n; i++) {
      var pa = sec[Math.max(0, i - 1)], pb = sec[Math.min(n - 1, i + 1)], tx = pb.x - pa.x, tz = pb.z - pa.z, tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl; sec[i].tx = tx; sec[i].tz = tz;
      var slope = (pa.level - pb.level) / tl;               // drop per unit length → faster, whiter water
      var speed = base * (1 + Math.min(2.5, slope * 8));
      for (var j = 0; j <= A; j++) {
        var u = j / A * 2 - 1, v = i * (A + 1) + j, vx = sec[i].x - tz * u * W * 0.5, vz = sec[i].z + tx * u * W * 0.5;
        pos[v * 3] = vx; pos[v * 3 + 1] = sec[i].level; pos[v * 3 + 2] = vz;
        // flow slows toward the banks (friction), like the real velocity profile across a channel
        var prof = speed * (1 - 0.6 * u * u);
        flow[v * 2] = tx * prof; flow[v * 2 + 1] = tz * prof;
        across[v] = u; depth[v] = (sec[i].level - heightAt(vx, vz)) / PM; spc[v] = step;
      }
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < A; j++) {
      var a0 = i * (A + 1) + j, a1 = a0 + 1, b0 = a0 + A + 1, b1 = b0 + 1;
      // keep the air side as the front face whatever the path direction
      var cy = (pos[b0 * 3 + 2] - pos[a0 * 3 + 2]) * (pos[a1 * 3] - pos[a0 * 3]) - (pos[b0 * 3] - pos[a0 * 3]) * (pos[a1 * 3 + 2] - pos[a0 * 3 + 2]);
      if (cy >= 0) idx.push(a0, b0, a1, a1, b0, b1); else idx.push(a0, a1, b0, a1, b1, b0);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    g.setAttribute('aSpacing', new THREE.BufferAttribute(spc, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    return { geometry: g, sections: sec, width: W };
  }

  // ───────────────────────────── depth bake ──
  // RG half-float texture over the body's bounds: R = water depth in metres (level − ground, negative on
  // land), G = inside-the-body mask. Sampled in the vertex shader (shallow attenuation of the waves) and
  // per pixel (absorption path, shore foam, discard outside the body). A CPU copy feeds waterHeightAt.
  function bakeDepth(THREE, heightAt, bounds, res, level, inside) {
    var minX = bounds[0], minZ = bounds[1], sx = (bounds[2] - minX) / res, sz = (bounds[3] - minZ) / res;
    var dep = new Float32Array(res * res), msk = new Float32Array(res * res), hf = new Uint16Array(res * res * 2);
    var H0 = THREE.DataUtils.toHalfFloat(0), H1 = THREE.DataUtils.toHalfFloat(1);
    // PERF 2026-11-07: polygons give a per-row crossing list (inside.row), so the mask is O(res·edges) instead of O(res²·edges).
    // Same predicate as pointInPoly: inside when an odd number of crossings lie strictly to the right of x.
    for (var j = 0; j < res; j++) {
      var z = minZ + (j + 0.5) * sz, cr = inside.row ? inside.row(z) : null, p = 0;
      for (var i = 0; i < res; i++) {
        var x = minX + (i + 0.5) * sx, k = j * res + i, m;
        if (cr) { while (p < cr.length && cr[p] <= x) p++; m = (cr.length - p) & 1; } else m = inside(x, z) ? 1 : 0;
        var d = Math.max(-60, Math.min(400, (level - heightAt(x, z)) / PM));
        dep[k] = d; msk[k] = m;
        hf[k * 2] = THREE.DataUtils.toHalfFloat(d); hf[k * 2 + 1] = m ? H1 : H0;
      }
    }
    var tex = new THREE.DataTexture(hf, res, res, THREE.RGFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false; tex.needsUpdate = true;
    return { tex: tex, dep: dep, msk: msk, res: res, minX: minX, minZ: minZ, sx: sx, sz: sz,
      boundsU: new THREE.Vector4(minX, minZ, 1 / (bounds[2] - minX), 1 / (bounds[3] - minZ)) };
  }
  // bilinear exactly like the GPU's LinearFilter + ClampToEdge (texel centres at +0.5)
  function sampleBake(bk, x, z, out) {
    var fx = (x - bk.minX) / bk.sx - 0.5, fz = (z - bk.minZ) / bk.sz - 0.5, r = bk.res;
    fx = Math.max(0, Math.min(r - 1, fx)); fz = Math.max(0, Math.min(r - 1, fz));
    var i0 = Math.floor(fx), j0 = Math.floor(fz), i1 = Math.min(r - 1, i0 + 1), j1 = Math.min(r - 1, j0 + 1), tx = fx - i0, tz = fz - j0;
    function bl(a) { return (a[j0 * r + i0] * (1 - tx) + a[j0 * r + i1] * tx) * (1 - tz) + (a[j1 * r + i0] * (1 - tx) + a[j1 * r + i1] * tx) * tz; }
    out.depth = bl(bk.dep); out.mask = bl(bk.msk); return out;
  }
  function pointInPoly(poly, x, z) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
    }
    return c;
  }
  // sorted x of every edge crossing at height z (the exact edges + intercept formula pointInPoly toggles on)
  function polyRowCrossings(poly, z) {
    var out = [];
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z)) out.push((xj - xi) * (z - zi) / (zj - zi) + xi);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  // ───────────────────────────── shaders ──
  var VERT = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    '#include <logdepthbuf_pars_vertex>',
    'uniform float uTime, uAmp, uMaxLambda, uPM;',
    'uniform vec4 uWaveA[NUM_WAVES];   // dir.x, dir.z, k (1/u), omega (rad/s)',
    'uniform vec4 uWaveB[NUM_WAVES];   // amplitude (u), phase, chop amplitude (u), wavelength (u)',
    'uniform vec4 uWaveC[NUM_WAVES];   // shallow d0 (m), floor, -, -',
    'uniform sampler2D uDepthTex; uniform vec4 uDepthBounds;',
    'attribute float aSpacing;',
    '#if WATER_KIND == 2',
    'attribute vec2 aFlow; attribute float aAcross; attribute float aDepth;',
    'varying vec2 vFlow; varying float vAcross;',
    '#endif',
    'varying vec3 vWorldPos; varying vec3 vNormalW; varying vec2 vLagXZ; varying float vDepthM; varying float vJac; varying float vHeightM;',
    // WaterSurface.js waterSurfaceCascadeAttenuation, per wave instead of per cascade
    'float w_shallow(vec4 c, float depth) { return mix(c.y * smoothstep(0.0, 0.6, depth), 1.0, smoothstep(0.0, c.x, depth)); }',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vec2 xz = wp.xz;',
    '  vec3 disp = vec3(0.0);',
    '  float dXdx = 1.0, dXdz = 0.0, dZdz = 1.0, dYdx = 0.0, dYdz = 0.0;',
    '#if WATER_KIND == 2',
    '  float depthM = aDepth; vFlow = aFlow; vAcross = aAcross;',
    '#else',
    '  vec2 dm = texture(uDepthTex, (xz - uDepthBounds.xy) * uDepthBounds.zw).rg;',
    '  float depthM = dm.x; float mask = step(0.5, dm.y);',
    '  for (int i = 0; i < NUM_WAVES; i++) {',
    '    vec4 A = uWaveA[i]; vec4 B = uWaveB[i];',
    // band-limit: fade waves shorter than ~3 mesh cells (Tidewater: level = log2(spacing/texel)+0.7)
    '    float bl = 1.0 - smoothstep(0.18, 0.4, aSpacing / B.w);',
    // lakes: no fetch for long swell (uMaxLambda), ocean passes a huge value
    '    float lk = 1.0 - smoothstep(0.6, 1.0, B.w / uMaxLambda);',
    '    float att = w_shallow(uWaveC[i], depthM) * bl * lk * mask * uAmp;',
    '    if (att <= 0.0) continue;',
    '    float th = A.z * dot(A.xy, xz) - A.w * uTime + B.y;',
    '    float s = sin(th), c = cos(th);',
    '    float a = B.x * att, q = B.z * att;',
    // Gerstner: y = a·cos θ, horizontal pull toward the crest = chop·a·sin θ (sharp crests, flat troughs)
    '    disp.y += a * c;',
    '    disp.xz -= A.xy * (q * s);',
    '    float wa = A.z * a * s, wq = A.z * q * c;',
    '    dYdx -= A.x * wa; dYdz -= A.y * wa;',
    '    dXdx -= A.x * A.x * wq; dZdz -= A.y * A.y * wq; dXdz -= A.x * A.y * wq;',
    '  }',
    '#endif',
    '  vLagXZ = xz;',
    '  wp.xyz += disp;',
    '  vWorldPos = wp.xyz;',
    // analytic normal = cross(∂P/∂z, ∂P/∂x); the Jacobian det drives whitecaps like the FFT version
    '  vNormalW = normalize(cross(vec3(dXdz, dYdz, dZdz), vec3(dXdx, dYdx, dXdz)));',
    '  vJac = dXdx * dZdz - dXdz * dXdz;',
    '  vDepthM = depthM; vHeightM = disp.y / uPM;',
    '  vec4 mvPosition = viewMatrix * wp;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <logdepthbuf_vertex>',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');

  var FRAG = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    '#include <logdepthbuf_pars_fragment>',
    'uniform float uTime, uPM, uFoamBias, uFoamIntensity, uRoughness, uWindSpeed, uBackscatter, uSSS, uScatterGain, uReflection, uDetail, uShoreFoam;',
    'uniform vec3 uSunDir, uSunColor, uSkyZenith, uSkyHorizon, uSkyIrr, uAbsorption, uScattering;',
    'uniform sampler2D uDepthTex, uDetailA, uDetailB, uFoamTex; uniform vec4 uDepthBounds;',
    'uniform vec4 uDetailScale;   // tile size A (m), tile size B (m), slope scale band A, band B',
    'uniform vec4 uDetailOmega;   // band A @ tile 1, band B @ tile 1, band A @ tile 2, band B @ tile 2',
    '#if WATER_KIND == 2',
    'varying vec2 vFlow; varying float vAcross;',
    '#endif',
    'varying vec3 vWorldPos; varying vec3 vNormalW; varying vec2 vLagXZ; varying float vDepthM; varying float vJac; varying float vHeightM;',
    // ---- WaterMaterial.js helpers
    'float w_fresnel(float cosI, float eta) {',
    '  float c = clamp(cosI, 0.0, 1.0); float g2 = eta * eta - 1.0 + c * c;',
    '  if (g2 < 0.0) return 1.0;',
    '  float g = sqrt(g2); float a = (g - c) / (g + c); float b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);',
    '  return 0.5 * a * a * (b * b + 1.0);',
    '}',
    'float w_phaseHG(float cosT, float g) { float g2 = g * g; return ((1.0 - g2) / (4.0 * PI)) / pow(max(1.0 + g2 - cosT * 2.0 * g, 1e-4), 1.5); }',
    'float w_dGGX(float NdH, float a2) { float d = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (d * d * PI); }',
    'float w_vSmith(float NdL, float NdV, float a2) { float gv = NdL * sqrt(NdV * NdV * (1.0 - a2) + a2); float gl = NdV * sqrt(NdL * NdL * (1.0 - a2) + a2); return 0.5 / max(gv + gl, 1e-5); }',
    // analytic stand-in for Tidewater's atmosphere sky (gradient + forward-scatter halo around the sun)
    'vec3 w_sky(vec3 d) {',
    '  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(clamp(d.y, 0.0, 1.0), 0.5));',
    '  return c + uSunColor * 0.08 * pow(max(dot(d, uSunDir), 0.0), 8.0);',
    '}',
    'vec2 w_rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }',
    // complex slope field → slope at time t (phase rotation = the waves travel)
    'vec2 w_detail(sampler2D tex, vec2 uv, float w, float scale) {',
    '  vec4 s = (texture(tex, uv) * 2.0 - 1.0) * scale; float c = cos(w * uTime), sn = sin(w * uTime);',
    '  return vec2(s.x * c + s.y * sn, s.z * c + s.w * sn);',
    '}',
    'vec2 w_detailAll(vec2 p) {   // p in metres; 2 tile sizes x 2 bands, 2nd tile rotated (no visible repeats)',
    '  vec2 d = w_detail(uDetailA, p / uDetailScale.x, uDetailOmega.x, uDetailScale.z) + w_detail(uDetailB, p / uDetailScale.x, uDetailOmega.y, uDetailScale.w);',
    '  vec2 p2 = w_rot(p, 0.63) / uDetailScale.y;',
    '  d += w_rot(w_detail(uDetailA, p2, uDetailOmega.z, uDetailScale.z) + w_detail(uDetailB, p2 + vec2(0.37, 0.11), uDetailOmega.w, uDetailScale.w), -0.63) * 0.55;',
    '  return d;',
    '}',
    'void main() {',
    '  #include <logdepthbuf_fragment>',
    '  vec3 pos = vWorldPos;',
    '  vec2 lag = vLagXZ / uPM;   // undisplaced position in metres (Tidewater lagXZ): textures ride the water',
    '  float footprint = max(length(fwidth(lag)), 1e-4);   // metres per pixel',
    '#if WATER_KIND == 2',
    '  float depthM = vDepthM;',
    '#else',
    '  vec2 dm = texture(uDepthTex, (vLagXZ - uDepthBounds.xy) * uDepthBounds.zw).rg;',
    '  if (dm.y < 0.5) discard;',
    '  float depthM = dm.x;',
    '#endif',
    '  if (depthM < -0.4) discard;   // under the terrain anyway; saves the blend',
    '  vec3 toCam = cameraPosition - pos; float dist = length(toCam); vec3 V = toCam / dist;',
    '  vec3 L = normalize(uSunDir);',
    '  vec3 nv = normalize(vNormalW);',
    '  vec2 slopes = vec2(-nv.x, -nv.z) / max(nv.y, 0.2);',
    // SeaDetail-style gusts: the foam mottle channel at ~900 m modulates short-wave roughness
    '  float gust = smoothstep(0.3, 0.7, texture(uFoamTex, lag / 900.0 + uTime * 0.0015).b);',
    '  float rough = mix(0.55, 1.45, gust);',
    '  float foamSum = 0.0;',
    '#if WATER_KIND == 2',
    // flow map (two phases half a cycle apart, cross-faded) so the detail streams downstream without stretching
    '  float P = 2.0; float p0 = fract(uTime / P), p1 = fract(uTime / P + 0.5); float w0 = 1.0 - abs(1.0 - 2.0 * p0);',
    '  vec2 flow = vFlow;',
    '  vec2 dA = w_detailAll(lag - flow * p0 * P), dB = w_detailAll(lag - flow * p1 * P + vec2(4.1, 2.3));',
    '  slopes += (dA * w0 + dB * (1.0 - w0)) * uDetail * rough;',
    '  vec2 fuv = lag * 0.09;',
    '  vec4 fA = texture(uFoamTex, (lag - flow * p0 * P) * 0.09), fB = texture(uFoamTex, (lag - flow * p1 * P) * 0.09 + 0.5);',
    '  vec4 p1f = fA * w0 + fB * (1.0 - w0); vec4 p2f = p1f;',
    '  float spd = length(flow);',
    '  foamSum += smoothstep(0.7, 1.0, abs(vAcross)) * 0.6 + smoothstep(3.0, 4.2, spd) * 0.4 + smoothstep(0.4, 0.05, depthM) * 0.6;   // banks + rapids + riffles over the bed',
    '#else',
    '  slopes += w_detailAll(lag) * uDetail * rough * mix(0.5, 1.0, smoothstep(0.0, 0.6, depthM));',
    '  vec2 fuv = lag * 0.09;   // WaterSurface foamScale',
    '  vec4 p1f = texture(uFoamTex, fuv);',
    '  vec2 r2 = vec2(fuv.x * 0.8 - fuv.y * 0.6, fuv.x * 0.6 + fuv.y * 0.8);',
    '  vec4 p2f = texture(uFoamTex, r2 * 2.37 + vec2(0.31, 0.77));',
    // whitecaps: fresh foam where the surface is compressed (Tidewater: sat((foamBias - 0.15 - J) * 2))
    '  foamSum += clamp((uFoamBias - 0.15 - vJac) * 2.0, 0.0, 1.0) * mix(0.5, 1.5, gust);',
    // shore: surf bands marching up the depth gradient + the swash bead (stand-in for ShoreWaves/ShoreSim)
    '  float surf = 0.5 + 0.5 * sin(depthM * 2.6 + uTime * 1.3 + p1f.b * 6.0);',
    '  foamSum += uShoreFoam * (smoothstep(2.4, 0.0, depthM) * (0.25 + 0.75 * surf * surf) + smoothstep(0.35, 0.02, depthM));',
    '#endif',
    '  vec3 N = normalize(vec3(-slopes.x, 1.0, -slopes.y));',
    '  float coverage = clamp(foamSum, 0.0, 1.0);',
    // foam pattern thresholded by coverage: grows, tears into lace, dissolves (WaterSurface.fragment)
    '  float pattern = p1f.r * 0.62 + p2f.r * 0.38;',
    '  float thresh = 1.05 - coverage * 1.1; float soft = 0.06 + footprint * 0.1;',
    '  float foamD = smoothstep(thresh - soft, thresh + soft, pattern) * (p1f.g * 0.25 + 0.8);',
    '  float foam = clamp(mix(foamD, coverage * 0.85, smoothstep(0.15, 1.2, footprint)) * uFoamIntensity, 0.0, 1.0);',
    '  foam *= smoothstep(-0.05, 0.05, depthM);   // the bead ends at the waterline',
    // viewer side of the interface; facets tilted away are bent to grazing, never flipped
    '  bool below = !gl_FrontFacing;',
    '  vec3 Ns = below ? -N : N;',
    '  vec3 Nv = normalize(Ns + V * max(-dot(Ns, V) + 0.03, 0.0));',
    // Cox-Munk mean square slope of what the mesh + textures can't resolve at this footprint
    '  float mss = 0.003 + uWindSpeed * 0.00512;',
    '  float unresolved = clamp(log2(110.0 * footprint / PI) / 9.0, 0.0, 1.0);',
    '  float alpha2 = uRoughness * uRoughness + mss * 2.0 * unresolved * rough * rough + foam * 0.2;',
    '  float sigmaUnres = sqrt(mss * unresolved * rough * rough);',
    '  vec3 sigA = uAbsorption, sigS = uScattering, sigT = sigA + sigS;',
    '  vec3 bb = sigS * uBackscatter; vec3 albedoMS = bb * (0.33 * 4.0) / (sigA + bb);',
    '  vec3 transmit = vec3(0.0); vec3 col = vec3(0.0);',
    '  if (!below) {',
    '    float NdV = max(dot(Nv, V), 1e-4); float F = w_fresnel(NdV, 1.333);',
    '    vec3 Rraw = reflect(-V, Nv);',
    // rough patches tilt the mean reflection up toward the darker, higher sky
    '    float Rup = max(Rraw.y, 0.004) + sigmaUnres * 1.3 * (1.0 - max(Rraw.y, 0.0));',
    '    vec3 R = normalize(vec3(Rraw.x, Rup, Rraw.z));',
    '    vec3 refl = mix(uSkyHorizon * 0.35, w_sky(R), smoothstep(-0.12, 0.08, Rraw.y)) * uReflection;',
    '    vec3 H = normalize(L + V); float NdL = max(dot(Nv, L), 0.0), NdH = max(dot(Nv, H), 0.0), VdH = max(dot(V, H), 0.0);',
    '    float spec = w_dGGX(NdH, alpha2) * w_vSmith(NdL, NdV, alpha2) * w_fresnel(VdH, 1.333) * NdL;',
    '    vec3 sunSpec = uSunColor * min(spec, 400.0) * smoothstep(-0.02, 0.04, L.y);',
    // refracted view ray (Snell) down to the baked sea floor
    '    vec3 Tr = refract(-V, Nv, 1.0 / 1.333);',
    '    vec3 Tv = normalize(vec3(Tr.x, min(Tr.y, -0.08), Tr.z)); float tDown = max(-Tv.y, 0.04);',
    '    float pathLen = clamp(max(depthM, 0.0) / tDown, 0.0, 400.0);',
    '    vec3 Tview = exp(-sigT * pathLen);',
    '    vec3 Ls = -refract(-L, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);',
    '    float muS = max(Ls.y, 0.1), muV = max(-Tv.y, 0.15);',
    '    vec3 sunIn = uSunColor * (1.0 - w_fresnel(max(L.y, 0.02), 1.333));',
    '    vec3 kSun = sigT * (1.0 + muV / muS), kAmb = sigT * (1.0 + muV / 0.75);',
    '    float phase = w_phaseHG(dot(Tv, Ls), 0.86) * 0.7 + 0.3 / (4.0 * PI);',
    '    vec3 inSun = sunIn * (sigS * phase + albedoMS * sigT * RECIPROCAL_PI) * (1.0 - exp(-kSun * pathLen)) / kSun;',
    '    vec3 inAmb = uSkyIrr * (sigS * 0.25 + albedoMS * sigT) * (1.0 - exp(-kAmb * pathLen)) / kAmb;',
    // crest translucency: sun through thin wave tips glows green-turquoise
    '    vec2 vH = normalize(V.xz + 1e-5), lH = normalize(L.xz + 1e-5);',
    '    float back = pow(clamp(dot(vH, -lH) * 0.6 + 0.4, 0.0, 1.0), 2.5);',
    '    float crest = clamp(vHeightM * 0.9 + 0.1, 0.0, 1.0) * (clamp((1.0 - Nv.y) * 4.0, 0.0, 1.0) + 0.25);',
    '    vec3 sss = uSunColor * vec3(0.12, 0.55, 0.45) * 0.06 * back * crest * uSSS * smoothstep(0.0, 0.25, L.y);',
    '    vec3 scatter = (inSun + inAmb) * uScatterGain + sss;',
    '    vec3 foamLit = (uSunColor * (max(dot(Nv, L), 0.0) * 0.75 + 0.25) * RECIPROCAL_PI + uSkyIrr * 0.95) * 0.85;',
    // Tidewater: water = mix(scene·T + scatter, refl, F) + spec ; shaded = mix(water, foam, foam)
    // → framebuffer·[T(1-F)(1-foam)]  (pass 1)   +   [scatter(1-F) + refl·F + spec](1-foam) + foam·foamLit (pass 2)
    '    transmit = Tview * (1.0 - F) * (1.0 - foam);',
    '    col = (scatter * (1.0 - F) + refl * F + sunSpec) * (1.0 - foam) + (foamLit + sunSpec * 0.05) * foam;',
    '  } else {',
    // looking up from under the water: Snell window of sky, total internal reflection of the lit water body
    '    float NdV = max(dot(Nv, V), 1e-4); float F = w_fresnel(NdV, 1.0 / 1.333);',
    '    vec3 Tt = refract(-V, Nv, 1.333); vec3 Td = dot(Tt, Tt) > 0.5 ? normalize(Tt) : vec3(0.0, 1.0, 0.0);',
    '    vec3 skyT = min(w_sky(Td), vec3(60.0));',
    '    vec3 Rr = reflect(-V, Nv); vec3 LsU = -refract(-L, vec3(0.0, 1.0, 0.0), 1.0 / 1.333); float muU = max(LsU.y, 0.15);',
    '    float phR = w_phaseHG(dot(Rr, LsU), 0.86) * 0.7 + 0.3 / (4.0 * PI);',
    '    vec3 kS = sigT * (1.0 - min(Rr.y, 0.0) / muU), kA = sigT * (1.0 - min(Rr.y, 0.0) / 0.8);',
    '    vec3 eSunU = uSunColor * (1.0 - w_fresnel(max(L.y, 0.02), 1.333));',
    '    vec3 deepCol = (eSunU * (sigS * phR + albedoMS * sigT * RECIPROCAL_PI) / kS + uSkyIrr * PI * (sigS * (1.0 / (4.0 * PI)) + albedoMS * sigT * RECIPROCAL_PI) / kA) * uScatterGain;',
    '    vec3 foamUnder = (uSkyIrr + uSunColor * 0.5) * 0.25;',
    '    col = mix(skyT * (1.0 - F) + deepCol * F, foamUnder, foam * 0.7);',
    '    transmit = vec3(0.0);',
    '  }',
    '  float fogF = 0.0;',
    '#ifdef USE_FOG',
    '  #ifdef FOG_EXP2',
    '  fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);',
    '  #else',
    '  fogF = smoothstep(fogNear, fogFar, vFogDepth);',
    '  #endif',
    '#endif',
    '#if WATER_PASS == 0',
    // pass 1: multiply the framebuffer (blend ZERO, SRC_COLOR). colorspace_fragment re-encodes the factor
    // for an sRGB screen target; into EffectComposer's linear target it is a no-op (exact).
    '  gl_FragColor = vec4(clamp(transmit, 0.0, 1.0), 1.0);',
    '  #include <colorspace_fragment>',
    '  gl_FragColor.rgb *= (1.0 - fogF);',
    '  gl_FragColor.a = 1.0;',
    '#else',
    // pass 2: additive (ONE, ONE). Fog is mixed after tone mapping, as three does for its own materials.
    '  gl_FragColor = vec4(min(col, vec3(16000.0)), 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '#ifdef USE_FOG',
    '  gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - fogF) + fogColor * fogF;',
    '#endif',
    '  gl_FragColor.a = 0.0;',
    '#endif',
    '}'
  ].join('\n');

  // ───────────────────────────── time of day ──
  function sunDirectionForTime(f, out) {   // f: 0 midnight · 0.25 sunrise · 0.5 noon · 0.75 sunset
    var el = Math.sin((f - 0.25) * TWO_PI), az = f * TWO_PI + 0.6, ea = el * 1.2;   // noon ≈ 69° high
    var c = Math.cos(ea);
    out = out || [0, 0, 0]; out[0] = Math.cos(az) * c; out[1] = Math.sin(ea); out[2] = Math.sin(az) * c;
    return out;
  }
  // colour keys by sun elevation (sin): night (moonlit) · twilight · day. Linear-light values in the same
  // ranges as Tidewater's Frame defaults (sun 1, sky irradiance 0.3/0.4/0.6, horizon 0.6/0.7/0.8).
  var TOD_KEYS = [
    { e: -0.25, zen: [0.004, 0.008, 0.022], hor: [0.018, 0.028, 0.06], sun: [0.10, 0.13, 0.20], irr: [0.012, 0.018, 0.035] },
    { e: 0.0, zen: [0.05, 0.08, 0.2], hor: [0.85, 0.42, 0.24], sun: [1.1, 0.45, 0.18], irr: [0.12, 0.1, 0.14] },
    { e: 0.3, zen: [0.12, 0.3, 0.7], hor: [0.6, 0.7, 0.8], sun: [1.25, 1.2, 1.1], irr: [0.3, 0.4, 0.6] }
  ];

  window.buildWorldWater = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, camera = opts.camera, renderer = opts.renderer;
    var heightAt = opts.heightAt || function () { return -1e4; };
    var t0 = performance.now();
    var waves = buildWaveSet({ seed: opts.seed || 1337, waveScale: opts.waveScale != null ? opts.waveScale : 1, windSpeed: opts.windSpeed, windDirection: opts.windDirection });
    var NW = waves.length;
    var group = new THREE.Group(); group.name = 'world-water'; scene.add(group);

    // ---- shared resources
    var rand = mulberry((opts.seed || 1337) + 7), lp = sysParams(LOCAL_SYS);   // (detail bake timed below with the upload)
    var TILE1 = 33.3, TILE2 = 7.1, DS = 128;   // Tidewater cascade tile sizes (m)
    var timings = { waves: Math.round(performance.now() - t0) }, tq = performance.now();
    // comps on the main thread (same rand order as before), pixel loops in the bake Worker. Until a bake lands the texture is neutral:
    // detail = 128 grey with scale ~0 (flat, no ripples), foam = 0 (no foam). Results fill the same textures in place.
    var dcA = detailComps(lp, TILE1, 3, 8, rand), dcB = detailComps(lp, TILE1, 8, 20, rand);
    var bandA = { scale: 1e-6, omega: dcA.omega }, bandB = { scale: 1e-6, omega: dcB.omega };
    var aniso = renderer && renderer.capabilities ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    function repTex(data, size) {
      var t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter; t.anisotropy = aniso; t.needsUpdate = true; return t;
    }
    var texA = repTex(new Uint8Array(DS * DS * 4).fill(128), DS), texB = repTex(new Uint8Array(DS * DS * 4).fill(128), DS);
    var foamTex = repTex(new Uint8Array(256 * 256 * 4), 256);
    timings.detail = Math.round(performance.now() - tq); timings.foam = 0; timings.bodies = [];
    var tBake = performance.now(), bakesLeft = 3;
    function landed(tex, r, k) {
      tex.image.data.set(r.data); tex.needsUpdate = true;
      if (k >= 0 && U && U.uDetailScale) { if (k === 0) U.uDetailScale.value.z = r.scale; else U.uDetailScale.value.w = r.scale; }
      if (--bakesLeft === 0) timings.bakeAsyncMs = Math.round(performance.now() - tBake);
    }
    // deferred one tick so U (declared below) exists when a synchronous fallback returns immediately
    setTimeout(function () {
      bakeAsync('detail', { comps: dcA.comps, size: DS }, function (r) { landed(texA, r, 0); });
      bakeAsync('detail', { comps: dcB.comps, size: DS }, function (r) { landed(texB, r, 1); });
      bakeAsync('foam', { size: 256 }, function (r) { landed(foamTex, r, -1); });
    }, 0);
    var r12 = Math.sqrt(TILE1 / TILE2);   // same pattern shrunk → k × L1/L2 → ω × sqrt(L1/L2)

    var U = {   // shared {value} objects: one time/sun update drives every body
      uTime: { value: 0 }, uPM: { value: PM },
      uWaveA: { value: waves.map(function (w) { return new THREE.Vector4(w.dx, w.dz, w.k / PM, w.omega); }) },
      uWaveB: { value: waves.map(function (w) { return new THREE.Vector4(w.amp * PM, w.phase, w.chop * PM, w.lambda * PM); }) },
      uWaveC: { value: waves.map(function (w) { return new THREE.Vector4(w.d0, w.floor, 0, 0); }) },
      uDetailA: { value: texA }, uDetailB: { value: texB }, uFoamTex: { value: foamTex },
      uDetailScale: { value: new THREE.Vector4(TILE1, TILE2, bandA.scale, bandB.scale) },
      uDetailOmega: { value: new THREE.Vector4(bandA.omega, bandB.omega, bandA.omega * r12, bandB.omega * r12) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Vector3(1.4, 1.32, 1.18) },   // brighter star glints on the swell
      uSkyZenith: { value: new THREE.Vector3(0.12, 0.3, 0.7) }, uSkyHorizon: { value: new THREE.Vector3(0.6, 0.7, 0.8) },
      uSkyIrr: { value: new THREE.Vector3(0.3, 0.4, 0.6) },
      uAbsorption: { value: new THREE.Vector3(0.46, 0.05, 0.085) },    // 2026-10-23 owner ref (emerald sparkle water): green carries, blue is absorbed (was 0.42, 0.075, 0.035)
      uScattering: { value: new THREE.Vector3(0.010, 0.030, 0.022) },  // emerald in-scatter, lit-from-within (was 0.012, 0.018, 0.024)
      uBackscatter: { value: 0.035 }, uSSS: { value: 1.0 }, uRoughness: { value: 0.022 }, uWindSpeed: { value: opts.windSpeed || 7 },
      uFoamBias: { value: 0.58 }, uFoamIntensity: { value: 1.0 }, uReflection: { value: 1.0 },
      uScatterGain: { value: opts.scatterGain != null ? opts.scatterGain : 1.4 }   // >1 lifts the physically dark deep sea a touch for a game camera
    };
    var dummyDepth = new THREE.DataTexture(new Uint16Array([0, 0]), 1, 1, THREE.RGFormat, THREE.HalfFloatType); dummyDepth.needsUpdate = true;

    function makeMaterials(kind, per) {
      return [0, 1].map(function (pass) {
        var uni = THREE.UniformsUtils.clone(THREE.UniformsLib.fog), k;   // clone only fog (cloning textures would duplicate uploads)
        for (k in U) uni[k] = U[k];
        for (k in per) uni[k] = per[k];
        var m = new THREE.ShaderMaterial({
          uniforms: uni, vertexShader: VERT, fragmentShader: FRAG, fog: true, lights: false, transparent: true,
          side: THREE.DoubleSide, depthWrite: pass === 1, depthTest: true, toneMapped: pass === 1,
          defines: { NUM_WAVES: NW, WATER_KIND: kind, WATER_PASS: pass },
          blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
          blendSrc: pass === 0 ? THREE.ZeroFactor : THREE.OneFactor,
          blendDst: pass === 0 ? THREE.SrcColorFactor : THREE.OneFactor
        });
        m.name = 'world-water-' + (pass ? 'shade' : 'transmit');
        return m;
      });
    }

    var bodies = [], order = 50;
    function addPair(geo, mats, cfg) {
      var ms = mats.map(function (m, i) {
        var mesh = new THREE.Mesh(geo, m); mesh.renderOrder = order + i; mesh.name = 'water-' + cfg.type + (i ? '-shade' : '-transmit');
        if (cfg.follow) mesh.frustumCulled = false;
        if (cfg.pos) mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        group.add(mesh); return mesh;
      });
      order += 2; return ms;
    }
    var farR = opts.farRadius || (camera && camera.far) || 20000;

    (opts.bodies || []).forEach(function (b) {
      var level = typeof b.level === 'number' ? b.level : 0;
      if (b.type === 'river') {
        var rv = buildRiver(THREE, b, heightAt);
        var mats = makeMaterials(2, {
          uAmp: { value: 0 }, uMaxLambda: { value: 1 }, uDepthTex: { value: dummyDepth }, uDepthBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
          uDetail: { value: 0.7 }, uShoreFoam: { value: 0.0 }
        });
        bodies.push({ type: 'river', b: b, rv: rv, meshes: addPair(rv.geometry, mats, { type: 'river' }), mats: mats });
        return;
      }
      // ocean / lake: bounds + inside test + depth bake
      var inside, bounds, pad;
      if (b.polygon) {
        var xs = b.polygon.map(function (p) { return p[0]; }), zs = b.polygon.map(function (p) { return p[1]; });
        bounds = [Math.min.apply(null, xs), Math.min.apply(null, zs), Math.max.apply(null, xs), Math.max.apply(null, zs)];
        inside = function (x, z) { return pointInPoly(b.polygon, x, z); };
        inside.row = function (z) { return polyRowCrossings(b.polygon, z); };
      } else {
        var c = b.center || [0, 0], R = b.radius || 1000;
        bounds = [c[0] - R, c[1] - R, c[0] + R, c[1] + R];
        inside = function (x, z) { return (x - c[0]) * (x - c[0]) + (z - c[1]) * (z - c[1]) <= R * R; };
      }
      var ext = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
      var isLake = b.type === 'lake';
      var res = b.depthRes || Math.max(32, Math.min(isLake ? 256 : (opts.depthRes || 1024), Math.ceil(ext / (1.5 * PM))));
      pad = 2 * ext / res;   // 2 texels outside the shape so ClampToEdge reads mask = 0 beyond the bounds
      bounds = [bounds[0] - pad, bounds[1] - pad, bounds[2] + pad, bounds[3] + pad];
      var tb = performance.now();
      var bk = bakeDepth(THREE, heightAt, bounds, res, level, inside);
      timings.bodies.push(b.type + ' ' + res + '² ' + Math.round(performance.now() - tb) + 'ms');
      var R0 = isLake ? (b.radius || 200) : 0;
      var per = {
        uAmp: { value: (b.waveScale != null ? b.waveScale : 1) * (isLake ? 0.3 : 1) },
        // lakes: only waves shorter than a quarter of the lake (≤ 12 m) — no ocean swell in a pond
        uMaxLambda: { value: isLake ? Math.min(R0 * 0.25, 12 * PM) : 1e9 },
        uDepthTex: { value: bk.tex }, uDepthBounds: { value: bk.boundsU },
        uDetail: { value: isLake ? 0.6 : 1.0 }, uShoreFoam: { value: isLake ? 0.45 : 1.0 }
      };
      var mats2 = makeMaterials(0, per), geo, meshes;
      if (isLake) {
        var cc = b.center || [0, 0];
        geo = radialGrid(THREE, R0 * 1.02, 96, Math.max(1.2 * PM, R0 / 60));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R0 * 1.05 + 10);
        meshes = addPair(geo, mats2, { type: 'lake', pos: [cc[0], level, cc[1]] });
      } else {
        geo = radialGrid(THREE, farR, 192, 0.5 * PM);
        meshes = addPair(geo, mats2, { type: 'ocean', follow: true, pos: [0, level, 0] });
      }
      bodies.push({ type: b.type, b: b, level: level, bk: bk, inside: inside, per: per, meshes: meshes, mats: mats2, geo: geo, follow: !isLake });
    });

    // ---- CPU mirror of the vertex shader (boats, swimmers, splash spawn)
    var _s = { depth: 0, mask: 0 }, _d = [0, 0, 0];
    function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
    function dispAt(body, x, z, t, out) {
      sampleBake(body.bk, x, z, _s);
      var mask = _s.mask >= 0.5 ? 1 : 0, depth = _s.depth, amp = body.per.uAmp.value, maxL = body.per.uMaxLambda.value;
      out[0] = out[1] = out[2] = 0;
      if (!mask) return out;
      for (var i = 0; i < NW; i++) {
        var w = waves[i], lamU = w.lambda * PM;
        var lk = 1 - smooth(0.6, 1.0, lamU / maxL);
        var sh = (w.floor * smooth(0, 0.6, depth)) + (1 - w.floor * smooth(0, 0.6, depth)) * smooth(0, w.d0, depth);
        var att = sh * lk * amp; if (att <= 0) continue;
        var th = (w.k / PM) * (w.dx * x + w.dz * z) - w.omega * t + w.phase, s = Math.sin(th), c = Math.cos(th);
        out[1] += w.amp * PM * att * c;
        out[0] -= w.dx * w.chop * PM * att * s; out[2] -= w.dz * w.chop * PM * att * s;
      }
      return out;
    }
    function riverHit(body, x, z) {   // nearest section segment → { d, level }
      var S = body.rv.sections, best = { d: 1e30, level: 0 };
      for (var i = 0; i < S.length - 1; i++) {
        var a = S[i], b2 = S[i + 1], ex = b2.x - a.x, ez = b2.z - a.z, l2 = ex * ex + ez * ez || 1;
        var t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), px = a.x + ex * t - x, pz = a.z + ez * t - z, d = px * px + pz * pz;
        if (d < best.d) { best.d = d; best.level = a.level + (b2.level - a.level) * t; }
      }
      best.d = Math.sqrt(best.d); return best;
    }
    function bodyAt(x, z) {
      for (var i = 0; i < bodies.length; i++) {
        var B = bodies[i];
        if (B.type === 'river') { var h = riverHit(B, x, z); if (h.d <= B.rv.width * 0.5 && heightAt(x, z) < h.level) return { B: B, level: h.level }; continue; }
        sampleBake(B.bk, x, z, _s);
        if (_s.mask >= 0.5 && _s.depth > 0) return { B: B, level: B.level };
      }
      return null;
    }

    var curT = 0, todSet = false;
    var api = {
      group: group, uniforms: U, waves: waves,
      update: function (t, dt) {
        curT = t; U.uTime.value = t;
        if (opts.sun && opts.sun.isDirectionalLight) {   // the world owns the light: follow it
          var p = new THREE.Vector3(), q = new THREE.Vector3();
          opts.sun.getWorldPosition(p); opts.sun.target.getWorldPosition(q);
          U.uSunDir.value.copy(p.sub(q).normalize());
        } else if (opts.sun && opts.sun.isVector3 && !todSet) U.uSunDir.value.copy(opts.sun).normalize();
        if (camera) {
          var cp = new THREE.Vector3(); camera.getWorldPosition(cp);
          bodies.forEach(function (B) { if (B.follow) B.meshes.forEach(function (m) { m.position.x = cp.x; m.position.z = cp.z; }); });
        }
      },
      setTimeOfDay: function (f) {
        f = ((f % 1) + 1) % 1;
        var d = sunDirectionForTime(f), e = d[1], night = e < 0;
        // below the horizon the moon (opposite side) lights the water
        if (!(opts.sun && opts.sun.isDirectionalLight)) { todSet = true; U.uSunDir.value.set(night ? -d[0] : d[0], Math.abs(e) < 0.05 && night ? 0.05 : Math.abs(e), night ? -d[2] : d[2]).normalize(); }
        var a = TOD_KEYS[0], b = TOD_KEYS[1], w;
        if (e >= TOD_KEYS[1].e) { a = TOD_KEYS[1]; b = TOD_KEYS[2]; }
        w = Math.max(0, Math.min(1, (e - a.e) / (b.e - a.e))); w = w * w * (3 - 2 * w);
        function mix(key, v) { v.set(a[key][0] + (b[key][0] - a[key][0]) * w, a[key][1] + (b[key][1] - a[key][1]) * w, a[key][2] + (b[key][2] - a[key][2]) * w); }
        mix('zen', U.uSkyZenith.value); mix('hor', U.uSkyHorizon.value); mix('sun', U.uSunColor.value); mix('irr', U.uSkyIrr.value);
      },
      // Surface height (game units) at world x,z — the SAME Gerstner sum as the vertex shader, inverted
      // for the horizontal (choppy) displacement by fixed-point iteration. null when not over water.
      waterHeightAt: function (x, z, t) {
        if (t == null) t = curT;
        var hit = bodyAt(x, z); if (!hit) return null;
        var B = hit.B; if (B.type === 'river') return hit.level;
        var px = x, pz = z;
        for (var i = 0; i < 4; i++) { dispAt(B, px, pz, t, _d); px = x - _d[0]; pz = z - _d[2]; }
        dispAt(B, px, pz, t, _d);
        return B.level + _d[1];
      },
      isWater: function (x, z) { return !!bodyAt(x, z); },
      dispose: function () {
        bodies.forEach(function (B) { B.meshes.forEach(function (m) { group.remove(m); }); (B.geo || B.rv.geometry).dispose(); B.mats.forEach(function (m) { m.dispose(); }); if (B.bk) B.bk.tex.dispose(); });
        [texA, texB, foamTex, dummyDepth].forEach(function (t) { t.dispose(); });
        scene.remove(group); bodies = [];
      },
      buildMs: 0, timings: timings
    };
    api.setTimeOfDay(0.42);
    todSet = false;   // a Vector3 sun passed in wins until setTimeOfDay is called explicitly
    api.update(0, 0);
    api.buildMs = Math.round(performance.now() - t0);
    return api;
  };
  window.buildWorldWater.sunDirectionForTime = sunDirectionForTime;
  window.buildWorldWater.PM = PM;
})();
