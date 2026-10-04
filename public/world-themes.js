/* world-themes.js — SHADDAI World hybrid theme engine  (Workstream D)
 * Classic script — no import / export. Exposes window.buildWorldThemes.
 *
 * ─── FACTORY ────────────────────────────────────────────────────────────────
 *   const themes = window.buildWorldThemes({ THREE, scene, refs });
 *
 * ─── refs SHAPE (lead assembles from the HTML's existing vars) ───────────────
 *   {
 *     fog:         scene.fog,                         // THREE.FogExp2
 *     lights: {
 *       key:       key,                               // THREE.PointLight  (neon)
 *       gold:      gold,                              // THREE.PointLight  (warm)
 *       sun:       sun,                               // THREE.DirectionalLight
 *       hemi:      hemi,                              // THREE.HemisphereLight
 *       ambient:   ambient,                           // THREE.AmbientLight
 *     },
 *     skyUniforms: {                                  // .value Color objects from skyMat.uniforms
 *       top:       skyMat.uniforms.top.value,
 *       mid:       skyMat.uniforms.mid.value,
 *       horizon:   skyMat.uniforms.horizon.value,
 *       glow:      skyMat.uniforms.glow.value,
 *     },
 *     grids:       [g1, g2],                          // THREE.GridHelper[]
 *     terrain:     worldTerrain,                      // result of buildWorldTerrain()
 *     biomes:      worldBiomes,                       // result of buildWorldBiomes() — optional
 *   }
 *
 * ─── terrain.applyGround(ground) CONTRACT ───────────────────────────────────
 *   The textures workstream (world-terrain.js) must implement this method.
 *   ground = {
 *     type:  'pbr' | 'tron' | 'grid',
 *     dir:   '/assets/textures/<name>',  // PBR: folder containing albedo/normal/rough maps
 *     color: 0xRRGGBB,                   // base tint (0xffffff = neutral / no tint)
 *     tint:  0xRRGGBB,                   // additive emissive neon accent (optional)
 *   }
 *   The method is called synchronously on every applyTheme(); texture loading is the
 *   terrain module's responsibility (lazy, no first-paint stall, no double swap).
 *
 * ─── RETURNED API ────────────────────────────────────────────────────────────
 *   {
 *     THEMES,                // pure data — add a theme here, zero engine edits required
 *     applyTheme(name),      // snap the whole world: sky / fog / lights / grids / ground / particles
 *     current(),             // → key string of the active theme
 *     list(),                // → [{ key, label }, …]  — for UI construction
 *     onAfterTheme(cb),      // register cb(name, themeObj) fired after every applyTheme
 *     update(delta, elapsed) // animate particles — call from animate()
 *   }
 */

window.buildWorldThemes = function buildWorldThemes(_ref) {
  'use strict';

  var THREE   = _ref.THREE;
  var scene   = _ref.scene;
  var refs    = _ref.refs;

  // ── 1. PURE DATA THEMES ─────────────────────────────────────────────────────
  // Adding a new theme = adding one object here. No engine edits.
  //
  // Each theme:
  //   sky     — four Color values for the ShaderMaterial (top / mid / horizon / glow)
  //   fog     — FogExp2 color + density
  //   lights  — per-light color hex + intensity (intensity also patches DAYNIGHT.base if present)
  //   ground  — forwarded verbatim to terrain.applyGround()
  //   grids   — boolean: show / hide the Tron GridHelpers [g1, g2]
  //   particles — preset key ('grid' | 'snow' | 'sand' | 'spray' | null)

  var THEMES = {};

  // ⧆ TRON — inky indigo night pierced by electric cyan. Deep, clean, high-contrast.
  THEMES.tron = {
    key: 'tron', label: '⧆ Tron Grid',
    sky: {
      top:     0x02030b,
      mid:     0x05122b,
      horizon: 0x0e3a63,
      glow:    0x2ad0ff,
    },
    fog:    { color: 0x03080f, density: 0.0072 },
    lights: {
      key:     { color: 0x2ee6ff, intensity: 1.35 },
      gold:    { color: 0xffd66a, intensity: 0.95 },
      sun:     { color: 0x9cc6e6, intensity: 0.65 },
      hemi:    { color: 0x2a4a7a, groundColor: 0x05101f, intensity: 1.2 },
      ambient: { color: 0x1e3a5a, intensity: 0.65 },
    },
    ground:    { type: 'tron',  color: 0x0a1a2a, tint: 0x27e0ff },
    grids:     true,
    particles: 'grid',
  };

  // ❄ SNOW — pale dawn over powder. Soft periwinkle sky, luminous cold light.
  THEMES.snow = {
    key: 'snow', label: '❄ Arctic Snow',
    sky: {
      top:     0x2a4a72,
      mid:     0x6a92ba,
      horizon: 0xbcd6ec,
      glow:    0xeef6ff,
    },
    fog:    { color: 0xaecce4, density: 0.019 },
    lights: {
      key:     { color: 0xbfe3ff, intensity: 0.75 },
      gold:    { color: 0xfff4e6, intensity: 0.55 },
      sun:     { color: 0xf2f9ff, intensity: 1.35 },
      hemi:    { color: 0xdcecff, groundColor: 0x4a6488, intensity: 1.15 },
      ambient: { color: 0x9cbdda, intensity: 0.95 },
    },
    ground:    { type: 'pbr', dir: '/assets/textures/snow',  color: 0xe0edf8 },
    grids:     false,
    particles: 'snow',
  };

  // 🏜 DESERT — molten dusk. Deep ember zenith melting into a blazing amber horizon.
  THEMES.desert = {
    key: 'desert', label: '🏜 Sand Sea',
    sky: {
      top:     0x1a0d20,
      mid:     0x5a2410,
      horizon: 0xc25a14,
      glow:    0xffab3a,
    },
    fog:    { color: 0xc27838, density: 0.016 },
    lights: {
      key:     { color: 0xff8a24, intensity: 1.05 },
      gold:    { color: 0xffd15a, intensity: 1.35 },
      sun:     { color: 0xfff0c8, intensity: 1.9 },
      hemi:    { color: 0xffab5c, groundColor: 0x4a2408, intensity: 0.95 },
      ambient: { color: 0x7a3c14, intensity: 0.8 },
    },
    ground:    { type: 'pbr', dir: '/assets/textures/sand',  color: 0xd4a060 },
    grids:     false,
    particles: 'sand',
  };

  // 🌊 OCEAN — submerged twilight. Abyssal navy with a glowing turquoise seam.
  THEMES.ocean = {
    key: 'ocean', label: '🌊 Deep Ocean',
    sky: {
      top:     0x01060f,
      mid:     0x052032,
      horizon: 0x0a5578,
      glow:    0x1ec6da,
    },
    fog:    { color: 0x062434, density: 0.011 },
    lights: {
      key:     { color: 0x22dced, intensity: 0.95 },
      gold:    { color: 0x4ab4cc, intensity: 0.7 },
      sun:     { color: 0xcaf4ff, intensity: 0.9 },
      hemi:    { color: 0x0a72aa, groundColor: 0x02101c, intensity: 1.05 },
      ambient: { color: 0x06283a, intensity: 0.85 },
    },
    ground:    { type: 'pbr', dir: '/assets/textures/water', tint: 0x006080 },
    grids:     false,
    particles: 'spray',
  };

  // Extra themes that map to the existing TERRAIN presets — included so the
  // old ⚙-panel buttons keep working after the lead replaces applyTerrain().

  // 🌌 VOID — cosmic black with a bruised violet nebula glow. Mysterious, weightless.
  THEMES.void = {
    key: 'void', label: '🌌 Deep Void',
    sky: {
      top:     0x000000,
      mid:     0x08000f,
      horizon: 0x220a44,
      glow:    0x7a2ec8,
    },
    fog:    { color: 0x020008, density: 0.0038 },
    lights: {
      key:     { color: 0x6e7cff, intensity: 1.5 },
      gold:    { color: 0xe0d4ff, intensity: 0.85 },
      sun:     { color: 0x4a48b0, intensity: 0.35 },
      hemi:    { color: 0x241048, groundColor: 0x020004, intensity: 0.85 },
      ambient: { color: 0x0a0418, intensity: 0.5 },
    },
    ground:    { type: 'tron', color: 0x080010, tint: 0x5a1aff },
    grids:     true,
    particles: 'grid',
  };

  // 🏙 NEON — cyberpunk rain-glow. Magenta haze cut with electric cyan rims.
  THEMES.neon = {
    key: 'neon', label: '🏙 Neon City',
    sky: {
      top:     0x0d0018,
      mid:     0x2a0640,
      horizon: 0x5a1466,
      glow:    0xff2ee0,
    },
    fog:    { color: 0x2e0842, density: 0.015 },
    lights: {
      key:     { color: 0xff2ee0, intensity: 1.5 },
      gold:    { color: 0x1ef0ff, intensity: 1.3 },
      sun:     { color: 0xff72cc, intensity: 0.55 },
      hemi:    { color: 0x520a72, groundColor: 0x120018, intensity: 1.05 },
      ambient: { color: 0x1e0640, intensity: 0.7 },
    },
    ground:    { type: 'tron', color: 0x180028, tint: 0xff00ff },
    grids:     true,
    particles: 'grid',
  };

  // 🌿 MEADOW — bright spring day. Fresh sky-blue zenith into a sunlit green horizon.
  THEMES.meadow = {
    key: 'meadow', label: '🌿 Meadow',
    sky: {
      top:     0x2a6aa8,
      mid:     0x74b0c0,
      horizon: 0xa8dca0,
      glow:    0xd8f4b0,
    },
    fog:    { color: 0x8cc088, density: 0.0085 },
    lights: {
      key:     { color: 0xbfffd6, intensity: 0.85 },
      gold:    { color: 0xffeeae, intensity: 1.05 },
      sun:     { color: 0xfffbe8, intensity: 1.7 },
      hemi:    { color: 0x9ad6a2, groundColor: 0x244a1c, intensity: 1.1 },
      ambient: { color: 0x244028, intensity: 0.8 },
    },
    ground:    { type: 'pbr', dir: '/assets/textures/grass', color: 0x4a8a50 },
    grids:     false,
    particles: null,
  };


  // ── 2. PARTICLE SYSTEMS ─────────────────────────────────────────────────────
  // All buffers precomputed at init — zero allocation in update().
  // One THREE.Points mesh per preset; all hidden at start.

  var _particles = {};

  function _makePoints(count, spread, yMin, yMax, color, size) {
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      pos[i*3    ] = (Math.random() - 0.5) * spread;
      pos[i*3 + 1] = yMin + Math.random() * (yMax - yMin);
      pos[i*3 + 2] = (Math.random() - 0.5) * spread;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: color, size: size, sizeAttenuation: true,
      transparent: true, opacity: 0.75, depthWrite: false,
    });
    var pts = new THREE.Points(geo, mat);
    pts.visible = false;
    scene.add(pts);
    return pts;
  }

  // grid — slow data-stream upward drift (tall cyan column)
  _particles.grid  = _makePoints(600,  700,  0,  120, 0x27e0ff, 0.6);
  // snow — falling flakes (wide band, mid-altitude)
  _particles.snow  = _makePoints(1200, 600,  0,  80,  0xeaf4ff, 0.8);
  // sand — low blowing haze (wide & near ground)
  _particles.sand  = _makePoints(800,  500,  0,  30,  0xd4a060, 0.5);
  // spray — ocean mist (tight, barely above ground)
  _particles.spray = _makePoints(500,  400,  0,  20,  0x80d0e0, 0.4);

  // Per-preset animation config — read-only, no per-frame object creation.
  //   axis:   which component of position[i*3 + stride] to shift
  //   stride: 0=x, 1=y, 2=z
  //   speed:  units per second (sign = direction)
  //   wrapAt / wrapTo: when a particle crosses wrapAt, teleport to wrapTo
  var _pCfg = {
    grid:  { stride: 1, speed:  4, wrapAt:  120, wrapTo:   0 },
    snow:  { stride: 1, speed: -8, wrapAt:   -2, wrapTo:  82 },
    sand:  { stride: 2, speed: 12, wrapAt:  250, wrapTo: -250 },
    spray: { stride: 1, speed:  3, wrapAt:   20, wrapTo:   0 },
  };


  // ── 3. STATE ─────────────────────────────────────────────────────────────────

  var _currentKey  = null;
  var _afterHooks  = [];

  // ── SMOOTH-TRANSITION TARGET POOL ───────────────────────────────────────────
  // applyTheme() writes desired end-state into _T (allocated ONCE here). update()
  // eases the live refs toward _T every frame — zero per-frame allocation.
  var _T = {
    sky: {
      top:     new THREE.Color(),
      mid:     new THREE.Color(),
      horizon: new THREE.Color(),
      glow:    new THREE.Color(),
    },
    fog:        new THREE.Color(),
    fogDensity: 0.008,
    bg:         new THREE.Color(),
    lights: {
      key:     { color: new THREE.Color(), intensity: 1 },
      gold:    { color: new THREE.Color(), intensity: 1 },
      sun:     { color: new THREE.Color(), intensity: 1 },
      hemi:    { color: new THREE.Color(), ground: new THREE.Color(), intensity: 1 },
      ambient: { color: new THREE.Color(), intensity: 1 },
    },
  };

  // Exponential-smoothing time constant (seconds). Smaller = snappier.
  // TAU ≈ 0.20 settles ~95% in ~0.6s and ~99% in ~0.9s → the requested feel.
  var _TAU        = 0.20;
  var _TRANS_DUR  = 1.2;      // stop easing after this long → drop out of the lerp path
  var _transT     = _TRANS_DUR; // >= _TRANS_DUR means "idle, not transitioning"
  var _lightNames = ['key', 'gold', 'sun', 'hemi', 'ambient'];


  // ── 4. INTERNAL HELPERS ──────────────────────────────────────────────────────

  // Safe color set — works on any THREE.Color instance.
  function _c(target, hex) {
    if (target && typeof target.set === 'function') target.set(hex);
  }

  // Each _apply* fills the target pool _T (the desired end-state). The actual
  // live-ref mutation happens by easing in update(); _snapNow() forces an instant
  // set (used for the very first theme so there's no fade-in from black).

  function _applySky(def) {
    var U = refs.skyUniforms;
    var ks = ['top', 'mid', 'horizon', 'glow'];
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (def[k] !== undefined) _T.sky[k].set(def[k]);
      else if (U && U[k]) _T.sky[k].copy(U[k]);   // hold current if unspecified
    }
  }

  function _applyFog(def) {
    var f = refs.fog;
    if (def.color !== undefined) {
      _T.fog.set(def.color);
      _T.bg.set(def.color);
    } else if (f) {
      _T.fog.copy(f.color);
      if (scene && scene.background && scene.background.copy) _T.bg.copy(scene.background);
    }
    if (def.density !== undefined) _T.fogDensity = def.density;
    else if (f) _T.fogDensity = f.density;
  }

  // Map from our refs.lights key names → DAYNIGHT.base key names (HTML uses 'amb' not 'ambient').
  var _DAYNIGHT_KEY = { key:'key', gold:'gold', sun:'sun', hemi:'hemi', ambient:'amb' };

  function _applyLights(def) {
    var L = refs.lights;
    for (var i = 0; i < _lightNames.length; i++) {
      var n   = _lightNames[i];
      var d   = def[n];
      var lit = L ? L[n] : null;
      var tgt = _T.lights[n];
      if (!d) { if (lit) { tgt.color.copy(lit.color); tgt.intensity = lit.intensity; } continue; }

      if (d.color !== undefined) tgt.color.set(d.color);
      else if (lit) tgt.color.copy(lit.color);

      if (d.intensity !== undefined) {
        tgt.intensity = d.intensity;
        // patch DAYNIGHT.base immediately so the day/night cycle multiplies from
        // the new base. HTML uses 'amb' for ambient — map via _DAYNIGHT_KEY.
        var dnk = _DAYNIGHT_KEY[n];
        if (window.DAYNIGHT && window.DAYNIGHT.base && dnk && (dnk in window.DAYNIGHT.base)) {
          window.DAYNIGHT.base[dnk] = d.intensity;
        }
      } else if (lit) {
        tgt.intensity = lit.intensity;
      }

      // HemisphereLight has a separate groundColor
      if (n === 'hemi') {
        if (d.groundColor !== undefined) tgt.ground.set(d.groundColor);
        else if (lit && lit.groundColor) tgt.ground.copy(lit.groundColor);
      }
    }
  }

  // Instantly copy the whole target pool onto the live refs (no easing).
  function _snapNow() {
    var U = refs.skyUniforms;
    if (U) {
      if (U.top)     U.top.copy(_T.sky.top);
      if (U.mid)     U.mid.copy(_T.sky.mid);
      if (U.horizon) U.horizon.copy(_T.sky.horizon);
      if (U.glow)    U.glow.copy(_T.sky.glow);
    }
    var f = _themeFog() ? refs.fog : null;   // 2026-10-04: theme fog was tuned for the old small map and buried every realm (black / white wall); the sky module owns fog now (?themefx=1 = old)
    if (f) { f.color.copy(_T.fog); f.density = _T.fogDensity; }
    if (scene && scene.background && scene.background.copy) scene.background.copy(_T.bg);
    var L = refs.lights;
    if (L) {
      for (var i = 0; i < _lightNames.length; i++) {
        var n = _lightNames[i], lit = L[n], tgt = _T.lights[n];
        if (!lit) continue;
        lit.color.copy(tgt.color);
        lit.intensity = tgt.intensity;
        if (n === 'hemi' && lit.groundColor) lit.groundColor.copy(tgt.ground);
      }
    }
  }

  function _applyGrids(show) {
    var gs = refs.grids;
    if (!gs) return;
    for (var i = 0; i < gs.length; i++) {
      if (gs[i]) gs[i].visible = !!show;
    }
  }

  function _applyGround(def) {
    var t = refs.terrain;
    if (t && typeof t.applyGround === 'function') t.applyGround(def);
  }

  function _themeFog() { return typeof location !== 'undefined' && /[?&]themefx=1/.test(location.search); }
  function _setParticles(preset) {
    var ks = Object.keys(_particles);
    for (var i = 0; i < ks.length; i++) {
      _particles[ks[i]].visible = false;
    }
    // owner 2026-10-04: the theme flakes rendered as grey floating squares (clutter + per-frame cost) - off unless ?themefx=1
    if (preset && _particles[preset] && typeof location !== 'undefined' && /[?&]themefx=1/.test(location.search)) _particles[preset].visible = true;
  }


  // ── 5. applyTheme ────────────────────────────────────────────────────────────
  // ONE call snaps the whole world. Agent zone accents are NOT touched here —
  // the lead re-applies them via the onAfterTheme hook.

  function applyTheme(name) {
    var t = THEMES[name];
    if (!t) { console.warn('[world-themes] unknown theme:', name); return; }
    var first = (_currentKey === null);
    _currentKey = name;

    // Fill the target pool with this theme's end-state…
    _applySky(t.sky);
    _applyFog(t.fog);
    _applyLights(t.lights);
    // …then either snap (first theme, avoid a fade-in from default black) or
    // kick off a smooth ease handled in update().
    if (first) { _snapNow(); _transT = _TRANS_DUR; }
    else       { _transT = 0; }

    _applyGrids(t.grids);
    _applyGround(t.ground);
    _setParticles(t.particles);

    try { localStorage.setItem('shaddai_world_theme', name); } catch (_e) {}

    // fire after-hooks — lead re-applies per-sector accents here
    for (var i = 0; i < _afterHooks.length; i++) {
      try { _afterHooks[i](name, t); } catch (e) {
        console.warn('[world-themes] onAfterTheme hook error:', e);
      }
    }
  }


  // ── 6. update — particle animation ──────────────────────────────────────────
  // No allocation per frame. Reads/writes directly into the pre-built Float32Array.

  function update(delta /*, elapsed — unused, available for future SDF effects */) {
    if (!_currentKey) return;

    // ── SMOOTH THEME EASING ────────────────────────────────────────────────
    // Frame-rate-independent exponential smoothing toward the target pool _T.
    // Allocation-free: only in-place THREE.Color.lerp + scalar math.
    if (_transT < _TRANS_DUR) {
      _transT += delta;
      var a = 1 - Math.exp(-delta / _TAU);
      if (a > 1) a = 1;

      var U = refs.skyUniforms;
      if (U) {
        if (U.top)     U.top.lerp(_T.sky.top, a);
        if (U.mid)     U.mid.lerp(_T.sky.mid, a);
        if (U.horizon) U.horizon.lerp(_T.sky.horizon, a);
        if (U.glow)    U.glow.lerp(_T.sky.glow, a);
      }
      var f = _themeFog() ? refs.fog : null;
      if (f) {
        f.color.lerp(_T.fog, a);
        f.density += (_T.fogDensity - f.density) * a;
      }
      if (scene && scene.background && scene.background.lerp) scene.background.lerp(_T.bg, a);
      var L = refs.lights;
      if (L) {
        for (var li = 0; li < _lightNames.length; li++) {
          var n = _lightNames[li], lit = L[n], tgt = _T.lights[n];
          if (!lit) continue;
          lit.color.lerp(tgt.color, a);
          lit.intensity += (tgt.intensity - lit.intensity) * a;
          if (n === 'hemi' && lit.groundColor) lit.groundColor.lerp(tgt.ground, a);
        }
      }

      // Final settle — snap exactly to targets so nothing drifts a hair short.
      if (_transT >= _TRANS_DUR) _snapNow();
    }

    var preset = THEMES[_currentKey].particles;
    if (!preset || !_particles[preset] || !_particles[preset].visible) return;

    var cfg  = _pCfg[preset];
    if (!cfg) return;

    var attr  = _particles[preset].geometry.attributes.position;
    var arr   = attr.array;
    var n     = (arr.length / 3) | 0;
    var st    = cfg.stride;
    var step  = cfg.speed * delta;
    var wAt   = cfg.wrapAt;
    var wTo   = cfg.wrapTo;
    var going = cfg.speed > 0;

    for (var i = 0; i < n; i++) {
      var idx = i * 3 + st;
      arr[idx] += step;
      if (going ? arr[idx] > wAt : arr[idx] < wAt) arr[idx] = wTo;
    }
    attr.needsUpdate = true;
  }


  // ── 7. INIT — restore persisted / query-param choice ────────────────────────

  (function _init() {
    var saved = null;
    try {
      var qs = (typeof URLSearchParams !== 'undefined')
        ? new URLSearchParams(location.search).get('theme')
        : null;
      saved = qs || localStorage.getItem('shaddai_world_theme');
    } catch (_e) {}
    // defer so the HTML has finished adding lights/terrain before we set state
    setTimeout(function () { applyTheme(THEMES[saved] ? saved : 'tron'); }, 80);
  })();


  // ── 8. PUBLIC API ─────────────────────────────────────────────────────────────

  return {
    THEMES:       THEMES,
    applyTheme:   applyTheme,
    current:      function ()  { return _currentKey; },
    list:         function ()  {
      return Object.keys(THEMES).map(function (k) {
        return { key: k, label: THEMES[k].label };
      });
    },
    onAfterTheme: function (cb) { if (typeof cb === 'function') _afterHooks.push(cb); },
    update:       update,
  };
};
