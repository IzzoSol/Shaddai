// world-vfx.js — GPU-analytic VFX core: soft round points (fixes "little squares"), 2 ring-buffered particle
// systems (additive + normal), ribbon trails, instanced decals, shared atlas. THREE is injected, never imported.
// Draw budget: points x2 + decals x1 + up to 5 trails = <= 8. No lights are ever created: flashes go to an
// injected callback (the host's light pool). update() allocates nothing.
(function (root) {
  'use strict';

  var TIER_BUDGET = { POTATO: 4000, LOW: 8000, MEDIUM: 20000, HIGH: 40000, ULTRA: 60000 };
  var TIER_ORDER = ['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
  var TIER_COUNT_MUL = { POTATO: 0.35, LOW: 0.6, MEDIUM: 1, HIGH: 1, ULTRA: 1 };
  var ADD_SHARE = 0.7;
  var MAX_TRAILS = 5, DECAL_CAP = 64, MAX_RANGES = 24;

  // Atlas layout in canvas fractions (x,y from top-left). smoke = 4x4 flipbook inside its 0.5x0.5 block.
  var LAYOUT = {
    smoke: [0, 0, 0.5, 0.5], dot: [0.5, 0, 0.75, 0.25], spark: [0.75, 0, 1, 0.25], ring: [0.5, 0.25, 0.75, 0.5],
    chevron: [0.75, 0.25, 1, 0.5], scorch: [0, 0.5, 0.25, 0.75], footprint: [0.25, 0.5, 0.5, 0.75], drop: [0.5, 0.5, 0.75, 0.75]
  };
  var CELLS = {};
  Object.keys(LAYOUT).forEach(function (k) {
    var l = LAYOUT[k];
    CELLS[k] = { x: l[0], y: l[1], w: l[2] - l[0], h: l[3] - l[1], u0: l[0], v0: 1 - l[3], u1: l[2], v1: 1 - l[1], frames: k === 'smoke' ? 4 : 1 };
  });

  // ---- pure helpers (JS mirror of the shader formulas) ----
  // size over life: 0 when unspawned/dead (age<0 or age>=life), fast pop-in, shrinks to 0 at end of life.
  function lifeSize(age, life, size) {
    if (!(life > 0) || age < 0 || age >= life) return 0;
    var u = age / life;
    return size * Math.min(1, u * 12) * (1 - u * u);
  }
  function lifeAlpha(age, life, a) {
    if (!(life > 0) || age < 0 || age >= life) return 0;
    var u = age / life;
    return a * (1 - u) * Math.min(1, u * 20);
  }
  function budget(tier) {
    var total = TIER_BUDGET[tier] || TIER_BUDGET.MEDIUM, add = Math.floor(total * ADD_SHARE);
    return { total: total, add: add, normal: total - add };
  }
  function tierName(t) {
    if (typeof t === 'number') return TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, t | 0))];
    if (t && TIER_BUDGET[String(t).toUpperCase()]) return String(t).toUpperCase();
    return 'MEDIUM';
  }

  // Shared viewport-height uniform (px) used by every WorldVFX point material for size attenuation.
  var uViewH = { value: 720 };

  // ---- atlas ----
  function makeAtlas(THREE, size) {
    size = size || 512;
    if (typeof document === 'undefined' || !document.createElement) return null;
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var g = cv.getContext('2d'); if (!g) return null;
    g.clearRect(0, 0, size, size);
    function cell(k) { var c = CELLS[k]; return { x: c.x * size, y: c.y * size, w: c.w * size, h: c.h * size }; }
    function radial(cx, cy, r, stops) {
      var gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
      g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    var c = cell('dot');
    radial(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [0.7, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
    // smoke flipbook: 16 frames of soft noisy puffs, deterministic LCG
    c = cell('smoke'); var seed = 1337; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var fw = c.w / 4, fh = c.h / 4;
    for (var f = 0; f < 16; f++) {
      var fx = c.x + (f % 4) * fw, fy = c.y + Math.floor(f / 4) * fh, grow = 0.45 + 0.4 * (f / 15);
      for (var b = 0; b < 7; b++) {
        var bx = fx + fw * (0.5 + (rnd() - 0.5) * 0.35), by = fy + fh * (0.5 + (rnd() - 0.5) * 0.35), br = fw * grow * (0.25 + rnd() * 0.25);
        radial(bx, by, br, [[0, 'rgba(255,255,255,' + (0.32 - 0.1 * f / 15).toFixed(3) + ')'], [1, 'rgba(255,255,255,0)']]);
      }
    }
    c = cell('spark'); g.save(); g.translate(c.x + c.w / 2, c.y + c.h / 2); g.scale(1, 0.14);
    radial(0, 0, c.w / 2, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]); g.restore();
    c = cell('ring'); radial(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, [[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0.9)'], [0.92, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    c = cell('chevron'); g.save(); g.shadowColor = 'rgba(255,255,255,0.8)'; g.shadowBlur = c.w * 0.06; g.fillStyle = '#fff'; g.beginPath();
    g.moveTo(c.x + c.w * 0.18, c.y + c.h * 0.72); g.lineTo(c.x + c.w * 0.5, c.y + c.h * 0.22); g.lineTo(c.x + c.w * 0.82, c.y + c.h * 0.72);
    g.lineTo(c.x + c.w * 0.82, c.y + c.h * 0.88); g.lineTo(c.x + c.w * 0.5, c.y + c.h * 0.45); g.lineTo(c.x + c.w * 0.18, c.y + c.h * 0.88); g.closePath(); g.fill(); g.restore();
    c = cell('scorch'); for (var s = 0; s < 14; s++) radial(c.x + c.w * (0.5 + (rnd() - 0.5) * 0.45), c.y + c.h * (0.5 + (rnd() - 0.5) * 0.45), c.w * (0.1 + rnd() * 0.22), [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    radial(c.x + c.w / 2, c.y + c.h / 2, c.w * 0.3, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
    c = cell('footprint'); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(c.x + c.w * 0.5, c.y + c.h * 0.36, c.w * 0.17, c.h * 0.24, 0, 0, 6.2832); g.fill();
    g.beginPath(); g.ellipse(c.x + c.w * 0.5, c.y + c.h * 0.78, c.w * 0.12, c.h * 0.11, 0, 0, 6.2832); g.fill();
    c = cell('drop'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(c.x + c.w * 0.5, c.y + c.h * 0.1);
    g.bezierCurveTo(c.x + c.w * 0.9, c.y + c.h * 0.55, c.x + c.w * 0.75, c.y + c.h * 0.9, c.x + c.w * 0.5, c.y + c.h * 0.9);
    g.bezierCurveTo(c.x + c.w * 0.25, c.y + c.h * 0.9, c.x + c.w * 0.1, c.y + c.h * 0.55, c.x + c.w * 0.5, c.y + c.h * 0.1); g.fill();
    var tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true; return tex;
  }

  // ---- soft points material (drop-in for PointsMaterial; round falloff from gl_PointCoord, no texture needed) ----
  var SOFT_VS = [
    'uniform float uSize; uniform float uViewH; varying vec3 vC;',
    'void main(){ vC = vec3(1.0);',
    '#ifdef USE_COLOR', ' vC = color.rgb;', '#endif',
    ' vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;',
    ' gl_PointSize = min(uSize * projectionMatrix[1][1] * uViewH * 0.5 / max(gl_Position.w, 0.01), 128.0); }'
  ].join('\n');
  var SOFT_FS = [
    'uniform vec3 uColor; uniform float uOpacity; uniform sampler2D uMap; uniform float uHasMap; varying vec3 vC;',
    'void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;',
    ' float a = exp(-d*d*3.0) * (1.0 - smoothstep(0.8, 1.0, d));',
    ' if (uHasMap > 0.5) a = texture2D(uMap, gl_PointCoord).a;',
    ' a *= uOpacity; if (a < 0.003) discard; gl_FragColor = vec4(uColor * vC, a); }'
  ].join('\n');

  function toRGB(c, out) {
    if (c && typeof c === 'object' && c.r !== undefined) { out[0] = c.r; out[1] = c.g; out[2] = c.b; return; }
    var h = (c == null ? 0xffffff : +c) | 0;
    out[0] = ((h >> 16) & 255) / 255; out[1] = ((h >> 8) & 255) / 255; out[2] = (h & 255) / 255;
  }
  var _rgb = [1, 1, 1];

  function softPointsMaterial(THREE, o) {
    o = o || {};
    toRGB(o.color, _rgb);
    var col = new THREE.Color(_rgb[0], _rgb[1], _rgb[2]);
    var u = { uColor: { value: col }, uSize: { value: o.size != null ? o.size : 0.2 }, uOpacity: { value: o.opacity != null ? o.opacity : 1 },
      uViewH: uViewH, uMap: { value: o.map || null }, uHasMap: { value: o.map ? 1 : 0 } };
    var m = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: SOFT_VS, fragmentShader: SOFT_FS, transparent: true, depthWrite: false,
      blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, vertexColors: !!o.vertexColors
    });
    // PointsMaterial-compatible accessors so call sites can migrate by swapping the constructor.
    Object.defineProperty(m, 'size', { get: function () { return u.uSize.value; }, set: function (v) { u.uSize.value = v; } });
    Object.defineProperty(m, 'opacity', { get: function () { return u.uOpacity.value; }, set: function (v) { u.uOpacity.value = v; } });
    m.color = col;
    return m;
  }

  // ---- particle shader (analytic motion) ----
  var PART_VS = [
    'attribute vec3 p0; attribute vec3 v0; attribute vec4 life; attribute vec4 col;',
    'uniform float uTime; uniform float uDrag; uniform float uViewH; uniform vec3 uGrav; varying vec4 vCol;',
    'void main(){',
    ' float age = uTime - life.x; float lt = life.y;',
    ' float alive = (lt > 0.0 && age >= 0.0 && age < lt) ? 1.0 : 0.0;',
    ' float u = clamp(age / max(lt, 0.0001), 0.0, 1.0);',
    ' float k = max(uDrag, 0.001); float tv = (1.0 - exp(-k * age)) / k;',
    ' vec3 p = p0 + v0 * tv + 0.5 * uGrav * life.w * age * age;',
    ' float sz = life.z * min(1.0, u * 12.0) * (1.0 - u * u) * alive;',
    ' vCol = vec4(col.rgb, col.a * (1.0 - u) * min(1.0, u * 20.0) * alive);',
    ' vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
    ' gl_PointSize = clamp(sz * projectionMatrix[1][1] * uViewH * 0.5 / max(gl_Position.w, 0.01), 2.0 * alive, 128.0);',   // >= 2 px while alive: never a sub-pixel vanish
    ' if (alive < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }'
  ].join('\n');
  var PART_FS = [
    'varying vec4 vCol;',
    'void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;',
    ' float a = exp(-d*d*3.0) * (1.0 - smoothstep(0.8, 1.0, d)) * vCol.a; if (a < 0.003) discard;',
    ' gl_FragColor = vec4(vCol.rgb, a); }'
  ].join('\n');

  // ---- presets. life.w (gravity multiplier) = g ----
  // sys 0 = additive, 1 = normal. shape: sphere | up | ring | suck
  var PRESETS = {
    // sizes raised ~2.2x after the vfx-lab review (2026-10-09): at gameplay distance the first sizes read as faint specks
    hit:     { sys: 0, n: 15,  shape: 'sphere', speed: [4, 9],   life: [0.25, 0.5], size: [0.22, 0.4],  color: 0xffd070, g: 0.6 },
    dust:    { sys: 1, n: 20,  shape: 'up',     speed: [0.6, 2],  life: [0.7, 1.4],  size: [1.0, 1.8],   color: 0xb8aa94, g: -0.15, a: 0.45, spread: 1.4 },
    boost:   { sys: 0, n: 30,  shape: 'sphere', speed: [2, 7],    life: [0.3, 0.7],  size: [0.26, 0.55], color: 0x59d8ff, g: 0.1 },
    loot:    { sys: 0, n: 30,  shape: 'up',     speed: [2, 5],    life: [0.6, 1.1],  size: [0.22, 0.44], color: 0xffd24a, g: -0.25, spread: 0.5 },
    splash:  { sys: 1, n: 80,  shape: 'up',     speed: [3, 8],    life: [0.5, 1.0],  size: [0.26, 0.6],  color: 0xcfeaff, g: 1.0, a: 0.8, spread: 0.7 },
    muzzle:  { sys: 0, n: 12,  shape: 'up',     speed: [5, 12],   life: [0.08, 0.2], size: [0.22, 0.5],  color: 0xffe9a0, g: 0, spread: 0.45, flash: [2.5, 90] },
    levelup: { sys: 0, n: 150, shape: 'ring',   speed: [1, 3],    life: [0.8, 1.6],  size: [0.26, 0.56], color: 0xffe27a, g: -0.2, radius: 1.2, up: [2, 6], flash: [1.6, 450] },
    portal:  { sys: 0, n: 200, shape: 'suck',   speed: [0.8, 2.2], life: [0.9, 1.8], size: [0.22, 0.48], color: 0xb084ff, g: 0, radius: 2.4 }
  };
  var CAPS = { hit: 40, dust: 60, boost: 80, loot: 80, splash: 160, muzzle: 30, levelup: 300, portal: 400 };
  var EMPTY = {};

  function mkSystem(THREE, maxCap, additive, grav, drag, timeU) {
    var S = { max: maxCap, cap: maxCap, head: 0 };
    S.p0 = new Float32Array(maxCap * 3); S.v0 = new Float32Array(maxCap * 3); S.life = new Float32Array(maxCap * 4); S.col = new Float32Array(maxCap * 4);
    var geo = new THREE.BufferGeometry();
    S.aP0 = new THREE.BufferAttribute(S.p0, 3); S.aV0 = new THREE.BufferAttribute(S.v0, 3);
    S.aLife = new THREE.BufferAttribute(S.life, 4); S.aCol = new THREE.BufferAttribute(S.col, 4);
    var attrs = [S.aP0, S.aV0, S.aLife, S.aCol];
    for (var i = 0; i < attrs.length; i++) if (attrs[i].setUsage) attrs[i].setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', S.aP0); geo.setAttribute('p0', S.aP0); geo.setAttribute('v0', S.aV0);
    geo.setAttribute('life', S.aLife); geo.setAttribute('col', S.aCol);
    geo.setDrawRange(0, maxCap);
    S.attrs = attrs; S.geo = geo;
    for (var j = 0; j < maxCap; j++) S.life[j * 4] = 1e9; // unspawned: age < 0
    S.uGrav = { value: new THREE.Vector3(grav[0], grav[1], grav[2]) }; S.uDrag = { value: drag };
    S.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uDrag: S.uDrag, uViewH: uViewH, uGrav: S.uGrav }, vertexShader: PART_VS, fragmentShader: PART_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    S.pts = new THREE.Points(geo, S.mat); S.pts.frustumCulled = false; S.pts.renderOrder = additive ? 11 : 10;
    return S;
  }
  function touch(S, start, count) {
    for (var i = 0; i < S.attrs.length; i++) {
      var a = S.attrs[i];
      if (a.updateRanges && a.updateRanges.length >= MAX_RANGES) { a.clearUpdateRanges(); a.addUpdateRange(0, S.cap * a.itemSize); }
      else if (a.addUpdateRange) a.addUpdateRange(start * a.itemSize, count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  // ---- ribbon trail ----
  function trail(o) {
    o = o || {}; var THREE = o.THREE; if (!THREE) throw new Error('WorldVFX.trail needs {THREE}');
    var n = Math.max(2, o.n || 32), width = o.width != null ? o.width : 0.4, taper = o.taper !== false, cam = o.camera || null;
    var hist = new Float32Array(n * 3), pos = new Float32Array(n * 2 * 3), colA = new Float32Array(n * 2 * 4);
    var idx = new (n * 2 > 65535 ? Uint32Array : Uint16Array)((n - 1) * 6);
    for (var i = 0; i < n - 1; i++) {
      var a = i * 2, k = i * 6;
      idx[k] = a; idx[k + 1] = a + 1; idx[k + 2] = a + 2; idx[k + 3] = a + 1; idx[k + 4] = a + 3; idx[k + 5] = a + 2;
    }
    toRGB(o.color != null ? o.color : 0xffffff, _rgb);
    for (var j = 0; j < n; j++) {
      var al = Math.pow(1 - j / (n - 1), 1.3);
      for (var s = 0; s < 2; s++) { var c = (j * 2 + s) * 4; colA[c] = _rgb[0]; colA[c + 1] = _rgb[1]; colA[c + 2] = _rgb[2]; colA[c + 3] = al; }
    }
    var geo = new THREE.BufferGeometry(), aPos = new THREE.BufferAttribute(pos, 3);
    if (aPos.setUsage) aPos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', aPos); geo.setAttribute('color', new THREE.BufferAttribute(colA, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    var mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending });
    var mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 12;
    var head = -1, cnt = 0;
    var tx = 0, ty = 0, tz = 0, ex = 0, ey = 0, ez = 0, sx = 0, sy = 0, sz = 0;
    function rebuild() {
      for (var i = 0; i < cnt; i++) {
        var ic = ((head - i) % n + n) % n, io = ((head - i - 1) % n + n) % n, inn = ((head - i + 1) % n + n) % n;
        var px = hist[ic * 3], py = hist[ic * 3 + 1], pz = hist[ic * 3 + 2];
        var o0 = i + 1 < cnt ? io : ic, n0 = i > 0 ? inn : ic;
        tx = hist[n0 * 3] - hist[o0 * 3]; ty = hist[n0 * 3 + 1] - hist[o0 * 3 + 1]; tz = hist[n0 * 3 + 2] - hist[o0 * 3 + 2];
        if (cam) { ex = cam.position.x - px; ey = cam.position.y - py; ez = cam.position.z - pz; } else { ex = 0; ey = 1; ez = 0; }
        sx = ty * ez - tz * ey; sy = tz * ex - tx * ez; sz = tx * ey - ty * ex;
        var l = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (l < 1e-6) { sx = 1; sy = 0; sz = 0; l = 1; }
        var hw = 0.5 * width * (taper ? 1 - i / (n - 1) : 1) / l;
        var v = i * 6;
        pos[v] = px + sx * hw; pos[v + 1] = py + sy * hw; pos[v + 2] = pz + sz * hw;
        pos[v + 3] = px - sx * hw; pos[v + 4] = py - sy * hw; pos[v + 5] = pz - sz * hw;
      }
      aPos.needsUpdate = true;
      geo.setDrawRange(0, cnt > 1 ? (cnt - 1) * 6 : 0);
    }
    return {
      mesh: mesh, n: n, hist: hist, positions: pos,
      push: function (p) { head = (head + 1) % n; hist[head * 3] = p.x; hist[head * 3 + 1] = p.y; hist[head * 3 + 2] = p.z; if (cnt < n) cnt++; rebuild(); },
      clear: function () { cnt = 0; head = -1; geo.setDrawRange(0, 0); },
      refresh: function () { if (cnt) rebuild(); },
      setCamera: function (c) { cam = c; },
      count: function () { return cnt; },
      dispose: function () { geo.dispose(); mat.dispose(); }
    };
  }

  // ---- engine ----
  function create(o) {
    o = o || {}; var THREE = o.THREE, scene = o.scene, camera = o.camera;
    if (!THREE) throw new Error('WorldVFX.create needs {THREE}');
    var unit = o.unit || 1, flash = typeof o.flash === 'function' ? o.flash : null;
    var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };
    var timeU = { value: 0 }, time = 0, cpuMs = 0;
    var atlas = o.atlas !== undefined ? o.atlas : makeAtlas(THREE, 512);
    var maxB = budget('ULTRA');
    var sysA = mkSystem(THREE, maxB.add, true, [0, -9.8 * unit, 0], 1.2, timeU);
    var sysN = mkSystem(THREE, maxB.normal, false, [0, -9.8 * unit, 0], 0.8, timeU);
    var sys = [sysA, sysN];
    if (scene) { scene.add(sysA.pts); scene.add(sysN.pts); }
    var tier = 'MEDIUM', tierMul = 1;

    // decals
    var dGeo = new THREE.PlaneGeometry(1, 1);
    var aCell = new THREE.InstancedBufferAttribute(new Float32Array(DECAL_CAP * 4), 4), aLife = new THREE.InstancedBufferAttribute(new Float32Array(DECAL_CAP * 2), 2),
      aTint = new THREE.InstancedBufferAttribute(new Float32Array(DECAL_CAP * 4), 4);
    dGeo.setAttribute('aCell', aCell); dGeo.setAttribute('aLife', aLife); dGeo.setAttribute('aTint', aTint);
    var dMat = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uMap: { value: atlas }, uHasMap: { value: atlas ? 1 : 0 } },
      vertexShader: 'attribute vec4 aCell; attribute vec2 aLife; attribute vec4 aTint; uniform float uTime; varying vec2 vUv; varying vec4 vT;\n' +
        'void main(){ float age = uTime - aLife.x; float f = 1.0 - smoothstep(0.7, 1.0, age / max(aLife.y, 0.0001));\n' +
        ' bool dead = !(aLife.y > 0.0 && age >= 0.0 && age < aLife.y); vUv = mix(aCell.xy, aCell.zw, uv); vT = vec4(aTint.rgb, aTint.a * f);\n' +
        // guard: three only declares instanceMatrix under USE_INSTANCING (live 2026-11-05: "'instanceMatrix' : undeclared identifier")
        '#ifdef USE_INSTANCING\n gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);\n#else\n gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n#endif\n if (dead) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
      fragmentShader: 'uniform sampler2D uMap; uniform float uHasMap; varying vec2 vUv; varying vec4 vT;\n' +
        'void main(){ float a; if (uHasMap > 0.5) a = texture2D(uMap, vUv).a; else { float d = length(vUv - 0.5) * 2.0; a = exp(-d*d*3.0) * (1.0 - smoothstep(0.8, 1.0, d)); }\n' +
        ' a *= vT.a; if (a < 0.003) discard; gl_FragColor = vec4(vT.rgb, a); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide
    });
    var decals = new THREE.InstancedMesh(dGeo, dMat, DECAL_CAP);
    decals.frustumCulled = false; decals.count = 0; decals.renderOrder = 5;
    if (scene) scene.add(decals);
    var dHead = 0, dUsed = 0;
    var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(),
      _z = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3();
    function addRange(a, start, count) { if (a.addUpdateRange) a.addUpdateRange(start, count); a.needsUpdate = true; }
    function addDecal(pos, normal, cell, size, life, color) {
      var c = CELLS[cell] || CELLS.dot, i = dHead; dHead = (dHead + 1) % DECAL_CAP; if (dUsed < DECAL_CAP) dUsed++;
      decals.count = dUsed;
      _n.set(normal ? normal.x : 0, normal ? normal.y : 1, normal ? normal.z : 0); if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0); _n.normalize();
      _q.setFromUnitVectors(_z, _n); _q2.setFromAxisAngle(_z, Math.random() * 6.2832); _q.multiply(_q2);
      _p.set(pos.x + _n.x * 0.03, pos.y + _n.y * 0.03, pos.z + _n.z * 0.03); _s.set(size, size, 1);
      _m.compose(_p, _q, _s); decals.setMatrixAt(i, _m); addRange(decals.instanceMatrix, i * 16, 16);
      var cl = aCell.array, k = i * 4; cl[k] = c.u0; cl[k + 1] = c.v0; cl[k + 2] = c.u1; cl[k + 3] = c.v1; addRange(aCell, k, 4);
      aLife.array[i * 2] = time - 0.002; aLife.array[i * 2 + 1] = life > 0 ? life : 10; addRange(aLife, i * 2, 2);
      toRGB(color != null ? color : (cell === 'scorch' ? 0x050505 : 0xffffff), _rgb);
      var t = aTint.array; t[k] = _rgb[0]; t[k + 1] = _rgb[1]; t[k + 2] = _rgb[2]; t[k + 3] = cell === 'scorch' ? 0.85 : 0.9; addRange(aTint, k, 4);
      return i;
    }

    var trails = [];
    function makeTrail(opts) {
      if (trails.length >= MAX_TRAILS) return null;
      opts = opts || {}; var t = trail({ THREE: THREE, n: opts.n, width: opts.width, color: opts.color, taper: opts.taper, additive: opts.additive, camera: camera });
      trails.push(t); if (scene) scene.add(t.mesh); return t;
    }

    function setTier(name) {
      tier = tierName(name); var b = budget(tier); tierMul = TIER_COUNT_MUL[tier];
      sysA.cap = Math.min(b.add, sysA.max); sysN.cap = Math.min(b.normal, sysN.max);
      for (var i = 0; i < 2; i++) { if (sys[i].head >= sys[i].cap) sys[i].head = 0; sys[i].geo.setDrawRange(0, sys[i].cap); }
    }
    setTier(o.getTier ? o.getTier() : 'MEDIUM');

    function rr(a, b) { return a + Math.random() * (b - a); }

    function burst(kind, pos, opts) {
      var P = PRESETS[kind]; if (!P || !pos) return 0;
      var t0 = now(); opts = opts || EMPTY;
      var S = sys[P.sys], cap = S.cap;
      var n = Math.round((opts.count != null ? opts.count : P.n) * tierMul);
      if (n > CAPS[kind]) n = CAPS[kind];
      if (n > cap) n = cap;
      if (n <= 0) return 0;
      toRGB(opts.color != null ? opts.color : P.color, _rgb);
      var cr = _rgb[0], cg = _rgb[1], cb = _rgb[2];
      var spMul = (opts.speed != null ? opts.speed : 1) * unit, szMul = (opts.size != null ? opts.size : 1) * unit;
      var l0 = opts.lifetime != null ? opts.lifetime * 0.75 : P.life[0], l1 = opts.lifetime != null ? opts.lifetime * 1.25 : P.life[1];
      var alpha = P.a != null ? P.a : 1, spread = P.spread != null ? P.spread : 1, R = (P.radius || 0) * unit, shape = P.shape, g = P.g;
      var start = S.head, p0 = S.p0, v0 = S.v0, lf = S.life, cl = S.col, px = pos.x, py = pos.y, pz = pos.z;
      for (var k = 0; k < n; k++) {
        var i = S.head, a3 = i * 3, a4 = i * 4, sp = rr(P.speed[0], P.speed[1]) * spMul, vx, vy, vz, ox = 0, oz = 0, ang = Math.random() * 6.2832;
        if (shape === 'sphere') { var zz = 2 * Math.random() - 1, ss = Math.sqrt(1 - zz * zz); vx = ss * Math.cos(ang) * sp; vy = zz * sp; vz = ss * Math.sin(ang) * sp; }
        else if (shape === 'up') { var r = Math.random() * spread; vx = Math.cos(ang) * r * sp; vy = sp; vz = Math.sin(ang) * r * sp; }
        else if (shape === 'ring') { ox = Math.cos(ang) * R; oz = Math.sin(ang) * R; vx = Math.cos(ang) * sp * 0.4; vy = rr(P.up[0], P.up[1]) * unit; vz = Math.sin(ang) * sp * 0.4; }
        else { ox = Math.cos(ang) * R; oz = Math.sin(ang) * R; vx = -Math.cos(ang) * sp - Math.sin(ang) * sp * 0.5; vy = rr(-0.3, 0.6) * unit; vz = -Math.sin(ang) * sp + Math.cos(ang) * sp * 0.5; }
        p0[a3] = px + ox; p0[a3 + 1] = py; p0[a3 + 2] = pz + oz; v0[a3] = vx; v0[a3 + 1] = vy; v0[a3 + 2] = vz;
        lf[a4] = time - 0.002; /* float32 rounding must never put spawn in the future */ lf[a4 + 1] = rr(l0, l1); lf[a4 + 2] = rr(P.size[0], P.size[1]) * szMul; lf[a4 + 3] = g;
        var jit = 0.85 + Math.random() * 0.3; cl[a4] = cr * jit; cl[a4 + 1] = cg * jit; cl[a4 + 2] = cb * jit; cl[a4 + 3] = alpha;
        S.head = i + 1 >= cap ? 0 : i + 1;
      }
      if (start + n <= cap) touch(S, start, n); else { touch(S, start, cap - start); touch(S, 0, n - (cap - start)); }
      if (flash && P.flash && opts.flash !== false) flash(pos, opts.color != null ? opts.color : P.color, P.flash[0], P.flash[1]);
      cpuMs += now() - t0;
      return n;
    }

    function update(dt) {
      var t0 = now();
      time += dt > 0 ? dt : 0; timeU.value = time;
      if (o.getViewHeight) uViewH.value = o.getViewHeight(); else if (typeof window !== 'undefined' && window.innerHeight) uViewH.value = window.innerHeight * (window.devicePixelRatio || 1);
      for (var i = 0; i < trails.length; i++) trails[i].refresh();
      cpuMs = now() - t0 + cpuMs; // per-frame figure (includes bursts since the last update)
      lastCpu = cpuMs; cpuMs = 0;
    }
    var lastCpu = 0;

    function stats() {
      var live = 0, i, j;
      for (j = 0; j < 2; j++) {
        var S = sys[j], L = S.life;
        for (i = 0; i < S.cap; i++) { var age = time - L[i * 4], lt = L[i * 4 + 1]; if (lt > 0 && age >= 0 && age < lt) live++; }
      }
      return { live: live, cap: sysA.cap + sysN.cap, draws: 2 + 1 + trails.length, cpuMs: lastCpu, tier: tier, decals: dUsed, trails: trails.length };
    }

    function dispose() {
      for (var i = 0; i < 2; i++) { if (scene) scene.remove(sys[i].pts); sys[i].geo.dispose(); sys[i].mat.dispose(); }
      if (scene) scene.remove(decals); dGeo.dispose(); dMat.dispose(); decals.dispose && decals.dispose();
      for (var t = 0; t < trails.length; t++) { if (scene) scene.remove(trails[t].mesh); trails[t].dispose(); }
      trails.length = 0;
    }

    return {
      burst: burst, update: update, setTier: setTier, stats: stats, dispose: dispose, atlas: atlas,
      trail: makeTrail, decals: { add: addDecal, mesh: decals }, systems: sys, getTier: function () { return tier; },
      time: function () { return time; }
    };
  }

  var api = {
    create: create, makeAtlas: makeAtlas, softPointsMaterial: softPointsMaterial, trail: trail, CELLS: CELLS,
    PRESETS: PRESETS, CAPS: CAPS, TIER_BUDGET: TIER_BUDGET, uViewH: uViewH,
    pure: { lifeSize: lifeSize, lifeAlpha: lifeAlpha, budget: budget, tierName: tierName }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldVFX = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
