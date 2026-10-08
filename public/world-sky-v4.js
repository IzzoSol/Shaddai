/*
 * world-sky-v4.js — SHADDAI Map v4 sky + day/night cycle (three.js r160+, no build step, classic <script>).
 *
 * ONE sky mesh (1 draw call): analytic Rayleigh/Mie-lite gradient, sun disc + glow, warm dusk band with the
 * SHADDAI obsidian / emerald / gold accents, hashed twinkling starfield (0 extra draws), moon disc with phase,
 * fbm cloud band (0 extra draws). The sky is drawn AFTER the opaque world at depth = far plane, so early-Z
 * rejects every covered pixel (the full-screen shader only runs where sky is actually visible).
 *
 * ONE DirectionalLight carries the sun by day and the moon by night (blue, ~15 %), with a single 2048² shadow
 * map whose ortho frustum follows the player (±60 m, texel-snapped → no shimmer). Hemisphere light, fog colour
 * + density, scene background and tone-mapping exposure all follow the sky, so the 10 km world fades into the
 * horizon colour exactly.
 *
 * BUILD:  window.buildWorldSkyV4({ THREE, scene, renderer, camera, sunLight?, hemiLight?, ambientLight?, fog?,
 *                                 water?, dayLengthMin: 24, startTime: 0.35, ...tunables })
 *   → api { update(dt, playerPos), setTime(0..1), getTime(), isNight(), setPaused(b), sunDir, lightDir, moonDir,
 *           nightFactor, phase, onPhase(cb) → unsubscribe, setWater(w), setQuality(name), setShadowMapSize(n),
 *           enableShadowsOn(obj, {cast, receive}), addNightRamp(obj, key, day, night), addEmissive(mat, {dayMul, nightMul}),
 *           mesh, uniforms, stats(), dispose() }
 * Time convention (same as world-water.js sunDirectionForTime): 0 midnight · 0.25 sunrise · 0.5 noon · 0.75 sunset.
 * URL: ?time=0.8 (start time) · ?daylen=6 (real minutes per game day).
 * Node: require('./world-sky-v4.js') → the pure helpers (tests: tools/tests/sky.test.cjs). Docs: docs/SKY-DAYNIGHT.md
 */
(function (root) {
  'use strict';
  var TWO_PI = Math.PI * 2;

  // ───────────────────────────── pure helpers (no THREE; unit-tested) ──
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function frac(x) { return x - Math.floor(x); }
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexToLinear(hex) { return [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)]; }

  // Identical to world-water.js sunDirectionForTime so the water's sky/sun colours agree with this sky.
  function sunDirection(t, out) {
    var el = Math.sin((t - 0.25) * TWO_PI), az = t * TWO_PI + 0.6, ea = el * 1.2;   // noon ≈ 69° high
    var c = Math.cos(ea);
    out = out || [0, 0, 0]; out[0] = Math.cos(az) * c; out[1] = Math.sin(ea); out[2] = Math.sin(az) * c;
    return out;
  }
  function sunElevation(t) { return Math.sin(Math.sin((((t % 1) + 1) % 1 - 0.25) * TWO_PI) * 1.2); }   // sine of the sun's altitude
  function nightFactor(e) { return 1 - smoothstep(-0.16, 0.04, e); }    // 1 = full night · 0 = day (e = sunElevation)
  function dayFactor(e) { return smoothstep(-0.04, 0.25, e); }
  function nightRamp(nf, dayValue, nightValue) { return dayValue + (nightValue - dayValue) * clamp(nf, 0, 1); }
  function phaseFor(t) {
    t = ((t % 1) + 1) % 1;
    var e = sunElevation(t);
    if (e > 0.12) return 'day';
    if (e < -0.12) return 'night';
    return t < 0.5 ? 'dawn' : 'dusk';
  }

  // Sky palette keyed by sun elevation (sRGB hex authored, converted to linear once). Obsidian night,
  // an emerald sliver at deep twilight, gold/ember at the horizon, clean blue day.
  //   zen/hor: zenith / horizon (hor IS the fog colour) · glow: Mie colour around the sun · cLit/cDark: clouds
  //   hSky/hGnd: hemisphere light · warm: dusk band strength · em: emerald band · stars · fog: density multiplier
  var PALETTE_SRC = [
    { e: -1.00, zen: 0x010207, hor: 0x060b16, glow: 0x000000, cLit: 0x131b2a, cDark: 0x05070c, hSky: 0x0c1834, hGnd: 0x040509, warm: 0.00, em: 0.00, stars: 1.00, fog: 1.00 },
    { e: -0.30, zen: 0x02040b, hor: 0x08111e, glow: 0x000000, cLit: 0x151e2e, cDark: 0x05070d, hSky: 0x0e1b38, hGnd: 0x04060a, warm: 0.00, em: 0.05, stars: 1.00, fog: 1.00 },
    { e: -0.14, zen: 0x040a18, hor: 0x0c2230, glow: 0x0b2c2a, cLit: 0x1e2c3c, cDark: 0x070a12, hSky: 0x12233f, hGnd: 0x06070c, warm: 0.15, em: 0.60, stars: 0.85, fog: 1.05 },
    { e: -0.04, zen: 0x121840, hor: 0xa85a3a, glow: 0xe8c45c, cLit: 0xcc7858, cDark: 0x2a1c30, hSky: 0x3a3560, hGnd: 0x1a1210, warm: 0.90, em: 0.35, stars: 0.30, fog: 1.15 },
    { e: 0.04, zen: 0x22306a, hor: 0xe29a52, glow: 0xe8c45c, cLit: 0xf0b070, cDark: 0x5a4050, hSky: 0x6a7090, hGnd: 0x3a2a1c, warm: 1.00, em: 0.08, stars: 0.00, fog: 1.15 },
    { e: 0.14, zen: 0x2f5596, hor: 0xe6c8a0, glow: 0xe8c45c, cLit: 0xfff0d6, cDark: 0x8a8090, hSky: 0x9ab4d8, hGnd: 0x4a3e2e, warm: 0.45, em: 0.00, stars: 0.00, fog: 1.05 },
    { e: 0.35, zen: 0x2a68c4, hor: 0xa8c6e4, glow: 0xfff4e0, cLit: 0xffffff, cDark: 0xb0bccc, hSky: 0xbcd4f0, hGnd: 0x4a4638, warm: 0.05, em: 0.00, stars: 0.00, fog: 1.00 },
    { e: 1.00, zen: 0x1f5cbc, hor: 0xb4d0ec, glow: 0xfff8ec, cLit: 0xffffff, cDark: 0xb8c4d4, hSky: 0xc4dcf4, hGnd: 0x4e4a3c, warm: 0.00, em: 0.00, stars: 0.00, fog: 1.00 }
  ];
  var COLOR_KEYS = ['zen', 'hor', 'glow', 'cLit', 'cDark', 'hSky', 'hGnd'], SCALAR_KEYS = ['warm', 'em', 'stars', 'fog'];
  var PALETTE = PALETTE_SRC.map(function (k) {
    var o = { e: k.e };
    COLOR_KEYS.forEach(function (c) { o[c] = hexToLinear(k[c]); });
    SCALAR_KEYS.forEach(function (s) { o[s] = k[s]; });
    return o;
  });
  // Continuous in e (smoothstep blend between neighbouring keys) → fog/sky never jump.
  function samplePalette(e, out) {
    out = out || {};
    var P = PALETTE, i = 0;
    if (e <= P[0].e) i = 0; else if (e >= P[P.length - 1].e) i = P.length - 2;
    else while (i < P.length - 2 && e > P[i + 1].e) i++;
    var a = P[i], b = P[i + 1], w = smoothstep(a.e, b.e, e);
    for (var ci = 0; ci < COLOR_KEYS.length; ci++) {
      var k = COLOR_KEYS[ci], v = out[k] || (out[k] = [0, 0, 0]);
      v[0] = lerp(a[k][0], b[k][0], w); v[1] = lerp(a[k][1], b[k][1], w); v[2] = lerp(a[k][2], b[k][2], w);
    }
    for (var si = 0; si < SCALAR_KEYS.length; si++) out[SCALAR_KEYS[si]] = lerp(a[SCALAR_KEYS[si]], b[SCALAR_KEYS[si]], w);
    return out;
  }

  // Blackbody approximation (Tanner Helland), returned in LINEAR rgb 0..1.
  function kelvinToLinear(K, out) {
    var t = clamp(K, 1000, 40000) / 100, r, g, b;
    if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    out = out || [0, 0, 0];
    out[0] = s2l(clamp(r, 0, 255) / 255); out[1] = s2l(clamp(g, 0, 255) / 255); out[2] = s2l(clamp(b, 0, 255) / 255);
    return out;
  }

  var GOLD_LIN = hexToLinear(0xe8c45c), MOON_LIN = hexToLinear(0x9db8ff);
  // The single directional light: sun while it is up (and just below — intensity → 0 at the switch), moon after.
  //   T = { sunMax, moonFrac, hemiDay, hemiNight, ambDay, ambNight, nightExposure, moonIllum(0..1) }
  function lightState(t, T, out) {
    out = out || { dir: [0, 0, 0], color: [1, 1, 1] };
    var d = sunDirection(t, out.sunDir || (out.sunDir = [0, 0, 0])), e = d[1];
    var nf = nightFactor(e), df = dayFactor(e);
    out.e = e; out.night = nf; out.day = df;
    if (e >= -0.02) {
      out.moon = false;
      out.dir[0] = d[0]; out.dir[1] = d[1]; out.dir[2] = d[2];
      out.intensity = T.sunMax * smoothstep(-0.02, 0.2, e);
      kelvinToLinear(lerp(1900, 5900, smoothstep(-0.02, 0.45, e)), out.color);
      var g = 0.35 * (1 - smoothstep(0.02, 0.25, e));   // gold accent at golden hour
      for (var i = 0; i < 3; i++) out.color[i] = lerp(out.color[i], GOLD_LIN[i], g);
    } else {
      out.moon = true;
      out.dir[0] = -d[0]; out.dir[1] = -d[1]; out.dir[2] = -d[2];
      var illum = T.moonIllum == null ? 1 : T.moonIllum;
      out.intensity = T.sunMax * T.moonFrac * (0.6 + 0.4 * illum) * smoothstep(0.02, 0.2, -e);
      out.color[0] = MOON_LIN[0]; out.color[1] = MOON_LIN[1]; out.color[2] = MOON_LIN[2];
    }
    out.hemi = lerp(T.hemiNight, T.hemiDay, df);
    out.ambient = lerp(T.ambNight, T.ambDay, df);
    out.exposureMul = lerp(1, T.nightExposure, nf);
    return out;
  }

  // Snap a world point onto the shadow map's texel grid (light-space X/Y, keep depth). The basis matches
  // Object3D.lookAt with up = +Y, i.e. the shadow camera's own axes. dir = unit vector towards the light.
  function snapShadowCenter(c, dir, texel, out) {
    out = out || [0, 0, 0];
    var zx = dir[0], zy = dir[1], zz = dir[2];
    var xx = zz, xy = 0, xz = -zx, xl = Math.hypot(xx, xz);             // x = normalize(cross(+Y, z))
    if (xl < 1e-6) { xx = 1; xz = 0; xl = 1; }
    xx /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;   // y = cross(z, x)
    var a = c[0] * xx + c[1] * xy + c[2] * xz, b = c[0] * yx + c[1] * yy + c[2] * yz, w = c[0] * zx + c[1] * zy + c[2] * zz;
    a = Math.round(a / texel) * texel; b = Math.round(b / texel) * texel;
    out[0] = xx * a + yx * b + zx * w; out[1] = xy * a + yy * b + zy * w; out[2] = xz * a + yz * b + zz * w;
    return out;
  }

  function parseUrlOverrides(search) {
    var r = { time: null, daylen: null };
    if (!search) return r;
    var mt = /[?&]time=([0-9.]+)/.exec(search), md = /[?&]daylen=([0-9.]+)/.exec(search);
    if (mt) { var tv = parseFloat(mt[1]); if (isFinite(tv)) r.time = ((tv % 1) + 1) % 1; }
    if (md) { var dv = parseFloat(md[1]); if (isFinite(dv) && dv > 0) r.daylen = dv; }
    return r;
  }

  var QUALITY = {   // per host quality tier (SHADDAI-WORLD-3D.html _Q.tiers names)
    POTATO: { map: 1024, every: 3, oct: 2, stars2: 0 },
    LOW: { map: 1024, every: 2, oct: 3, stars2: 0 },
    MEDIUM: { map: 2048, every: 1, oct: 4, stars2: 1 },
    HIGH: { map: 2048, every: 1, oct: 4, stars2: 1 },
    ULTRA: { map: 2048, every: 1, oct: 5, stars2: 1 }
  };

  var PURE = {
    clamp: clamp, smoothstep: smoothstep, hexToLinear: hexToLinear, sunDirection: sunDirection, sunElevation: sunElevation,
    nightFactor: nightFactor, dayFactor: dayFactor, nightRamp: nightRamp, phaseFor: phaseFor, samplePalette: samplePalette, PALETTE: PALETTE,
    kelvinToLinear: kelvinToLinear, lightState: lightState, snapShadowCenter: snapShadowCenter,
    parseUrlOverrides: parseUrlOverrides, QUALITY: QUALITY
  };

  // ───────────────────────────── shader ──
  var VERT = [
    'varying vec3 vDir;',
    'void main(){',
    '  vDir = position;',
    '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = p.xyww;',   // depth = far plane → drawn after the opaque world, early-Z culls covered pixels
    '}'
  ].join('\n');

  var FRAG = [
    'uniform vec3 uZenith, uHorizon, uGround, uGlow, uCloudLit, uCloudDark, uEmeraldCol, uSunDir, uMoonDir, uSunColor;',
    'uniform float uTime, uWarm, uEmerald, uStars, uSunVis, uMoonVis, uMoonPhase, uCloudCover, uCloudOct, uStars2, uSunSize, uMoonSize;',
    'uniform vec2 uWind;',
    'uniform mat3 uStarRot;',
    'varying vec3 vDir;',
    'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float fbm(vec2 p){ float a = 0.5, s = 0.0, n = 0.0;',
    '  for (int i = 0; i < 5; i++){ if (float(i) >= uCloudOct) break; s += a * vnoise(p); n += a; p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }',
    '  return s / max(n, 1e-3); }',
    'vec3 starLayer(vec3 d, float scale, float density, float seed){',   // one hashed cell per pixel — no texture, no extra draw
    '  vec3 p = d * scale, c = floor(p), f = fract(p);',
    '  float h = h31(c + seed);',
    '  if (h > density) return vec3(0.0);',
    '  vec3 sp = 0.3 + 0.4 * vec3(h31(c + seed + 1.7), h31(c + seed + 3.1), h31(c + seed + 5.3));',
    '  float r = length(f - sp), k = h / density;',
    '  float tw = 0.6 + 0.4 * sin(uTime * (1.3 + k * 5.0) + k * 62.8);',
    '  float b = smoothstep(0.2, 0.0, r) * (0.25 + 1.6 * k * k) * tw;',
    '  return b * mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.62), step(0.8, fract(k * 7.13)));',
    '}',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float h = d.y, hp = max(h, 0.0);',
    // gradient: horizon (== fog colour at h = 0) → zenith; below the horizon a darker cloud-sea floor
    '  vec3 col = mix(uHorizon, uZenith, pow(hp, 0.45));',
    '  col = mix(col, uGround, smoothstep(0.0, -0.3, h));',
    '  float mu = dot(d, uSunDir), mup = max(mu, 0.0);',
    // Mie-ish forward lobes around the sun + Rayleigh-ish broad brightening on the sun side
    '  col += uGlow * (0.55 * pow(mup, 8.0) + 1.4 * pow(mup, 90.0)) * (0.35 + 0.65 * uSunVis);',
    '  col += uGlow * 0.12 * (0.75 * (1.0 + mu * mu) - 0.75) * uSunVis * (1.0 - hp);',
    // dusk/dawn warm band hugging the horizon, strongest towards the sun
    '  float sunSide = pow(mu * 0.5 + 0.5, 3.0);',
    '  col += uGlow * uWarm * exp(-abs(h) * 7.0) * sunSide * 0.9;',
    // SHADDAI accent: a thin emerald sliver above the band at deep twilight
    '  col += uEmeraldCol * uEmerald * 0.22 * exp(-abs(h - 0.07) * 26.0) * (0.35 + 0.65 * sunSide);',
    // night sky: rotating hashed stars + a faint violet/emerald galactic band
    '  if (uStars > 0.001 && h > -0.02){',
    '    vec3 sd = uStarRot * d;',
    '    vec3 st = starLayer(sd, 150.0, 0.10, 0.0);',
    '    if (uStars2 > 0.5) st += 0.55 * starLayer(sd, 330.0, 0.06, 11.0);',
    '    float band = exp(-abs(dot(sd, vec3(0.28, 0.2, 0.939))) * 7.0) * (0.35 + 0.65 * vnoise(sd.xz * 9.0 + sd.y * 5.0));',
    '    vec3 mw = mix(vec3(0.020, 0.012, 0.045), vec3(0.004, 0.030, 0.022), vnoise(sd.zx * 3.0));',
    '    col += (st + mw * band) * uStars * smoothstep(-0.02, 0.2, h);',
    '  }',
    // moon: lit sphere with phase (0 new · PI full), earthshine, soft halo
    '  if (uMoonVis > 0.001){',
    '    float mc = dot(d, uMoonDir);',
    '    float illum = 0.5 - 0.5 * cos(uMoonPhase);',
    '    col += vec3(0.35, 0.45, 0.7) * 0.06 * pow(max(mc, 0.0), 300.0) * uMoonVis * illum;',
    '    if (mc > cos(uMoonSize * 1.2)){',
    '      vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir)), my = cross(uMoonDir, mx);',
    '      vec2 uv = vec2(dot(d, mx), dot(d, my)) / sin(uMoonSize);',
    '      float r2 = dot(uv, uv);',
    '      if (r2 < 1.0){',
    '        vec3 n = vec3(uv, sqrt(1.0 - r2));',
    '        vec3 L = vec3(sin(uMoonPhase), 0.0, -cos(uMoonPhase));',
    '        float lit = smoothstep(-0.05, 0.12, dot(n, L));',
    '        float mare = 0.78 + 0.22 * vnoise(uv * 3.3 + 7.0);',
    '        vec3 mcol = vec3(0.86, 0.9, 1.0) * (lit * mare * 2.2 + 0.025);',
    '        col = mix(col, mcol, smoothstep(1.0, 0.88, r2) * uMoonVis * smoothstep(-0.01, 0.02, h));',
    '      }',
    '    }',
    '  }',
    // sun disc (HDR so the bloom pass picks it up), clipped at the horizon
    '  float sa = acos(clamp(mu, -1.0, 1.0));',
    '  col += uSunColor * 16.0 * (1.0 - smoothstep(uSunSize, uSunSize * 1.35, sa)) * uSunVis * smoothstep(-0.015, 0.01, h);',
    // cloud band: plane-projected fbm, scrolling; thins at the horizon and towards the zenith
    '  if (h > 0.0 && uCloudCover > 0.001){',
    '    vec2 cuv = d.xz / (h + 0.09) * 0.8 + uWind * uTime;',
    '    float n = fbm(cuv);',
    '    float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.3, n);',
    '    float a = cov * smoothstep(0.0, 0.1, h) * (1.0 - 0.65 * smoothstep(0.45, 0.95, h)) * 0.85;',
    '    vec3 cc = mix(uCloudDark, uCloudLit, 0.45 + 0.55 * n) + uGlow * pow(mup, 6.0) * 0.8 * (0.3 + 0.7 * uSunVis);',
    '    col = mix(col, cc, a);',
    '  }',
    '  col += (h21(gl_FragCoord.xy) - 0.5) / 255.0;',   // dither: no banding in the dark gradients
    '  gl_FragColor = vec4(max(col, 0.0), 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  // ───────────────────────────── builder ──
  function build(opts) {
    var THREE = opts.THREE, scene = opts.scene, renderer = opts.renderer, camera = opts.camera;
    var U = opts.unitsPerM || 7 / 1.8;
    var url = parseUrlOverrides(root && root.location ? root.location.search : '');
    var T = {
      sunMax: opts.sunIntensity != null ? opts.sunIntensity : 2.4,
      moonFrac: opts.moonFrac != null ? opts.moonFrac : 0.15,
      hemiDay: opts.hemiDay != null ? opts.hemiDay : 1.05, hemiNight: opts.hemiNight != null ? opts.hemiNight : 0.35,
      ambDay: opts.ambientDay != null ? opts.ambientDay : 0.25, ambNight: opts.ambientNight != null ? opts.ambientNight : 0.12,
      nightExposure: opts.nightExposure != null ? opts.nightExposure : 0.8, moonIllum: 1
    };
    var dayLenMin = url.daylen || opts.dayLengthMin || 24;
    var time = url.time != null ? url.time : (opts.startTime != null ? opts.startTime : 0.35);
    var dayIndex = 0, paused = false;
    var moonDays = opts.moonCycleDays || 8, moonStart = opts.moonPhaseStart != null ? opts.moonPhaseStart : 0.5;
    var fog = opts.fog !== undefined ? opts.fog : scene.fog;
    var baseFogDensity = fog && fog.density != null ? fog.density : 0.000055;
    var baseExposure = renderer ? renderer.toneMappingExposure : 1;
    var water = opts.water || null;
    var respectTheme = opts.respectThemeLock !== false;

    // lights
    var ownSun = !opts.sunLight, sunLight = opts.sunLight || new THREE.DirectionalLight(0xffffff, 1);
    if (ownSun) scene.add(sunLight);
    var ownTarget = !sunLight.target.parent; if (ownTarget) scene.add(sunLight.target);
    var ownHemi = !opts.hemiLight, hemi = opts.hemiLight || new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    if (ownHemi) scene.add(hemi);
    var ambient = opts.ambientLight || null;

    // shadows: one map, frustum follows the player
    var shadowRangeM = opts.shadowRangeM || 60, shadowDistM = opts.shadowDistM || 150, shadowDepthM = opts.shadowDepthM || 120;
    var mapSize = opts.shadowMapSize || 2048, shadowEvery = 1, frameNo = 0, lastShadowC = null;
    var shadowsOn = opts.shadows !== false && !!renderer;
    if (shadowsOn) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = opts.shadowType != null ? opts.shadowType : THREE.PCFShadowMap;
      sunLight.castShadow = true;
      var sc = sunLight.shadow.camera;
      sc.left = -shadowRangeM * U; sc.right = shadowRangeM * U; sc.top = shadowRangeM * U; sc.bottom = -shadowRangeM * U;
      sc.near = 1; sc.far = (shadowDistM + shadowDepthM) * U; sc.updateProjectionMatrix();
      sunLight.shadow.mapSize.set(mapSize, mapSize);
      sunLight.shadow.bias = opts.shadowBias != null ? opts.shadowBias : -0.0004;
      sunLight.shadow.normalBias = opts.shadowNormalBias != null ? opts.shadowNormalBias : 0.12 * U;
    }

    // sky mesh
    var uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uEmeraldCol: { value: new THREE.Color(0x00ff9c) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uTime: { value: 0 }, uWarm: { value: 0 }, uEmerald: { value: 0 }, uStars: { value: 0 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 },
      uMoonPhase: { value: Math.PI }, uCloudCover: { value: opts.cloudCover != null ? opts.cloudCover : 0.42 }, uCloudOct: { value: 4 },
      uStars2: { value: 1 }, uSunSize: { value: opts.sunSize || 0.022 }, uMoonSize: { value: opts.moonSize || 0.03 },
      uWind: { value: new THREE.Vector2(opts.windX != null ? opts.windX : 0.004, opts.windZ != null ? opts.windZ : 0.0015) },
      uStarRot: { value: new THREE.Matrix3() }
    };
    var mat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    mat.name = 'world-sky-v4';
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
    mesh.name = 'world-sky-v4'; mesh.frustumCulled = false; mesh.renderOrder = 1e6;   // last opaque → early-Z skips covered pixels
    mesh.onBeforeRender = function (r, s, cam) { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
    scene.add(mesh);

    // state
    var pal = {}, ls = { dir: [0, 0, 0], color: [1, 1, 1] };
    var sunDir = new THREE.Vector3(), lightDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
    var starAxis = new THREE.Vector3(0.28, 0.9, 0.33).normalize(), _m4 = new THREE.Matrix4();
    var _c = [0, 0, 0], _snap = [0, 0, 0], _pp = new THREE.Vector3(), waterAcc = 1e9, clock = 0;
    var phase = null, listeners = [], havePP = false, ramps = [], rampNF = -1;

    function emitPhase(p, prev) { for (var i = 0; i < listeners.length; i++) { try { listeners[i](p, prev); } catch (e) { console.warn('[sky-v4] onPhase listener', e); } } }

    function apply(playerPos) {
      T.moonIllum = 0.5 - 0.5 * Math.cos(uniforms.uMoonPhase.value);
      lightState(time, T, ls);
      var e = ls.e;
      samplePalette(e, pal);
      sunDir.set(ls.sunDir[0], ls.sunDir[1], ls.sunDir[2]);
      moonDir.copy(sunDir).negate();
      lightDir.set(ls.dir[0], ls.dir[1], ls.dir[2]);

      // sky uniforms
      uniforms.uZenith.value.setRGB(pal.zen[0], pal.zen[1], pal.zen[2]);
      uniforms.uHorizon.value.setRGB(pal.hor[0], pal.hor[1], pal.hor[2]);
      uniforms.uGround.value.setRGB(lerp(pal.hor[0], pal.cDark[0], 0.5) * 0.7, lerp(pal.hor[1], pal.cDark[1], 0.5) * 0.7, lerp(pal.hor[2], pal.cDark[2], 0.5) * 0.7);
      uniforms.uGlow.value.setRGB(pal.glow[0], pal.glow[1], pal.glow[2]);
      uniforms.uCloudLit.value.setRGB(pal.cLit[0], pal.cLit[1], pal.cLit[2]);
      uniforms.uCloudDark.value.setRGB(pal.cDark[0], pal.cDark[1], pal.cDark[2]);
      uniforms.uWarm.value = pal.warm; uniforms.uEmerald.value = pal.em; uniforms.uStars.value = pal.stars;
      uniforms.uSunDir.value.copy(sunDir); uniforms.uMoonDir.value.copy(moonDir);
      var sv = smoothstep(-0.03, 0.02, e), sc2 = kelvinToLinear(lerp(2200, 6000, smoothstep(-0.02, 0.4, e)), _c);
      uniforms.uSunColor.value.set(sc2[0], sc2[1], sc2[2]);
      uniforms.uSunVis.value = sv;
      uniforms.uMoonVis.value = smoothstep(-0.01, 0.08, -e);
      _m4.makeRotationAxis(starAxis, time * TWO_PI); uniforms.uStarRot.value.setFromMatrix4(_m4);

      // light
      sunLight.color.setRGB(ls.color[0], ls.color[1], ls.color[2]);
      sunLight.intensity = ls.intensity;
      var themed = respectTheme && root && root._themeLocked;
      if (!themed) {
        hemi.color.setRGB(pal.hSky[0], pal.hSky[1], pal.hSky[2]);
        hemi.groundColor.setRGB(pal.hGnd[0], pal.hGnd[1], pal.hGnd[2]);
        if (fog) { fog.color.setRGB(pal.hor[0], pal.hor[1], pal.hor[2]); if (fog.density != null) fog.density = window.__SHD_FOG_ON ? baseFogDensity * Math.min(pal.fog, 1.5) : 0; }
        if (scene.background && scene.background.isColor) scene.background.setRGB(pal.hor[0], pal.hor[1], pal.hor[2]);
      }
      hemi.intensity = ls.hemi;
      if (ambient) ambient.intensity = ls.ambient;
      if (renderer) renderer.toneMappingExposure = baseExposure * ls.exposureMul;
      if (shadowsOn && sunLight.shadow && 'intensity' in sunLight.shadow) sunLight.shadow.intensity = ls.moon ? 0.55 : 1;

      // follow-the-player shadow frustum, texel-snapped
      if (playerPos) { _pp.copy(playerPos); havePP = true; } else if (!havePP && camera) _pp.copy(camera.position);   // setTime() keeps the last player position
      var texel = (2 * shadowRangeM * U) / mapSize;
      _c[0] = _pp.x; _c[1] = _pp.y; _c[2] = _pp.z;
      snapShadowCenter(_c, ls.dir, texel, _snap);
      sunLight.target.position.set(_snap[0], _snap[1], _snap[2]);
      sunLight.position.set(_snap[0] + ls.dir[0] * shadowDistM * U, _snap[1] + ls.dir[1] * shadowDistM * U, _snap[2] + ls.dir[2] * shadowDistM * U);
      sunLight.target.updateMatrixWorld(); sunLight.updateMatrixWorld();
      if (shadowsOn && renderer) {
        if (shadowEvery <= 1) renderer.shadowMap.autoUpdate = true;
        else {
          renderer.shadowMap.autoUpdate = false;
          var moved = !lastShadowC || Math.abs(_snap[0] - lastShadowC[0]) + Math.abs(_snap[2] - lastShadowC[2]) > shadowRangeM * U * 0.25;
          if (moved || frameNo % shadowEvery === 0) { renderer.shadowMap.needsUpdate = true; lastShadowC = [_snap[0], _snap[1], _snap[2]]; }
        }
      }

      var p = phaseFor(time);
      if (p !== phase) { var prev = phase; phase = p; if (prev !== null) emitPhase(p, prev); }

      // night ramps (city roof-edge strips, lamps, windows): only a property write — no material recompile
      if (ramps.length && Math.abs(ls.night - rampNF) > 0.002) {
        rampNF = ls.night;
        for (var ri = 0; ri < ramps.length; ri++) { var R = ramps[ri]; R.obj[R.key] = nightRamp(rampNF, R.day, R.night); }
      }
    }

    function syncWater(force) {
      if (!water || !water.setTimeOfDay) return;
      if (force || waterAcc >= 0.2) { waterAcc = 0; try { water.setTimeOfDay(time); } catch (e) {} }
    }

    var api = {
      mesh: mesh, uniforms: uniforms, sunLight: sunLight, hemiLight: hemi,
      sunDir: sunDir, lightDir: lightDir, moonDir: moonDir,
      update: function (dt, playerPos) {
        dt = Math.min(Math.max(dt || 0, 0), 1);
        clock += dt; frameNo++;
        uniforms.uTime.value = clock;
        if (!paused) {
          time += dt / (dayLenMin * 60);
          if (time >= 1) { time -= 1; dayIndex++; }
        }
        uniforms.uMoonPhase.value = TWO_PI * frac(moonStart + (dayIndex + time) / moonDays);
        apply(playerPos);
        waterAcc += dt; syncWater(false);
      },
      setTime: function (t) { time = ((+t % 1) + 1) % 1; apply(null); syncWater(true); },
      getTime: function () { return time; },
      isNight: function () { return ls.night >= 0.5; },
      setPaused: function (b) { paused = !!b; },
      setDayLength: function (min) { if (min > 0) dayLenMin = min; },
      onPhase: function (cb) {
        listeners.push(cb);
        try { cb(phase, null); } catch (e) { console.warn('[sky-v4] onPhase listener', e); }
        return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
      },
      setWater: function (w) { water = w || null; syncWater(true); },
      // drive obj[key] from dayValue → nightValue by nightFactor (e.g. mat.emissiveIntensity, lamp.intensity)
      addNightRamp: function (obj, key, dayValue, nightValue) {
        var R = { obj: obj, key: key, day: dayValue, night: nightValue }; ramps.push(R); obj[key] = nightRamp(ls.night, dayValue, nightValue);
        return function () { var i = ramps.indexOf(R); if (i >= 0) ramps.splice(i, 1); };
      },
      // convenience for emissive materials (canon Grid-city roof-edge strips / lamp heads): base × dayMul..nightMul
      addEmissive: function (mat, o) {
        o = o || {}; var base = o.base != null ? o.base : (mat.emissiveIntensity != null ? mat.emissiveIntensity : 1);
        return api.addNightRamp(mat, 'emissiveIntensity', base * (o.dayMul != null ? o.dayMul : 0.25), base * (o.nightMul != null ? o.nightMul : 1.6));
      },
      setQuality: function (name) {
        var q = QUALITY[name] || QUALITY.MEDIUM;
        uniforms.uCloudOct.value = q.oct; uniforms.uStars2.value = q.stars2; shadowEvery = q.every;
        api.setShadowMapSize(Math.min(q.map, opts.shadowMapSize || 2048));
      },
      setShadowMapSize: function (n) {
        if (!shadowsOn || n === mapSize) return;
        mapSize = n; sunLight.shadow.mapSize.set(n, n);
        if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
      },
      get shadowMapSize() { return mapSize; },
      get nightFactor() { return ls.night; },
      get dayFactor() { return ls.day; },
      get phase() { return phase; },
      get dayLengthMin() { return dayLenMin; },
      // mark a subtree as shadow caster/receiver (instanced meshes with world-sized bounds are never culled
      // from the shadow pass — prefer receive-only for those)
      enableShadowsOn: function (obj, o) {
        o = o || {}; var cast = o.cast !== false, recv = o.receive !== false;
        obj.traverse(function (m) { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } });
      },
      stats: function () {
        return { time: +time.toFixed(4), phase: phase, night: +ls.night.toFixed(3), sunElev: +ls.e.toFixed(3), light: ls.moon ? 'moon' : 'sun',
          intensity: +ls.intensity.toFixed(3), shadowMap: shadowsOn ? mapSize : 0, shadowEvery: shadowEvery, dayLengthMin: dayLenMin, drawCalls: 1 };
      },
      dispose: function () {
        scene.remove(mesh); mesh.geometry.dispose(); mat.dispose();
        if (ownSun) scene.remove(sunLight);
        if (ownTarget) scene.remove(sunLight.target);
        if (ownHemi) scene.remove(hemi);
        if (renderer && baseExposure != null) renderer.toneMappingExposure = baseExposure;
        listeners = []; ramps = [];
      }
    };
    uniforms.uMoonPhase.value = TWO_PI * frac(moonStart + time / moonDays);
    api.setQuality(opts.quality || (root && root.__quality) || 'MEDIUM');
    apply(null);
    syncWater(true);
    console.info('[sky-v4] ready · t', time.toFixed(3), '· day', dayLenMin, 'min · phase', phase, '· shadow', shadowsOn ? mapSize : 'off');
    return api;
  }

  build.pure = PURE;
  if (root) root.buildWorldSkyV4 = build;
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; module.exports.build = build; }
})(typeof window !== 'undefined' ? window : null);
