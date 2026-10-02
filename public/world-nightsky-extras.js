/* world-nightsky-extras.js — SHOOTING STARS, a SECOND MOON and STRANGE PLANETS on top of world-sky-v4's starfield + moon (owner 2026-10-01: "stars in the sky and shooting stars moons etc strange planets").
 *   shooting stars: 4 pooled streaks; one every ~6-20 s at night (rarer at dusk), 0.7-1.1 s across 18-32 degrees, glowing head + fading trail, always above the horizon
 *   moon 2: a small cool-grey moon on its own slower orbit (crater texture, waxing crescent shading), only when above the horizon, dimmed by day
 *   planets: a banded RINGED gas giant, a violet-teal ice world with halo, a small ember world — fixed in the sky, drifting very slowly, fading in as the night deepens
 * Everything lives in one Group that follows the camera at a fixed distance (inside the far plane), renders AFTER the sky (renderOrder 9999), depthTest on so the world still hides it, no fog, additive/transparent.
 * API: buildNightSkyExtras({ THREE, scene, camera, getNight()->0..1, getTime?()->0..1 (day phase), radius?, rng? }) -> { group, update(dt), spawnShootingStar(), stats(), dispose() }
 * Pure helpers (tested): dirFromAzEl · planetVisibility · nextMeteorIn · meteorPoint · moon2Dir
 */
(function (root) {
  'use strict';
  var TWO_PI = Math.PI * 2, DEG = Math.PI / 180;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function dirFromAzEl(az, el) { var c = Math.cos(el); return [Math.sin(az) * c, Math.sin(el), Math.cos(az) * c]; }   // y up
  function planetVisibility(night) { return smooth(0.25, 0.7, night); }
  function nextMeteorIn(rng, night) { var base = 6 + rng() * 14; return base / Math.max(0.35, night); }   // dusk = rarer, deep night = frequent
  /* a meteor is a great-circle-ish arc: start az/el, heading, length (deg). f in [0,1] -> unit direction; elevation is clamped above the horizon */
  function meteorPoint(m, f) { var az = m.az + Math.sin(m.head) * m.len * f, el = clamp(m.el + Math.cos(m.head) * m.len * f * 0.6, 4 * DEG, 85 * DEG); return dirFromAzEl(az, el); }
  function moon2Dir(time) { var a = time * TWO_PI * 0.93 + 1.9, el = Math.sin(a - 0.6) * 52 * DEG; return { dir: dirFromAzEl(a, el), el: el }; }

  function canvasTex(THREE, w, h, draw) { if (typeof document === 'undefined') return null; var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var g = cv.getContext('2d'); draw(g, w, h); var t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t; }
  function bandTex(THREE, cols) { return canvasTex(THREE, 256, 128, function (g, w, h) { for (var y = 0; y < h; y++) { var k = y / h, n = Math.sin(k * 23) * 0.5 + Math.sin(k * 61 + 1) * 0.3, c = cols[Math.floor(clamp(k + n * 0.06, 0, 0.999) * cols.length)]; g.fillStyle = c; g.fillRect(0, y, w, 1); } }); }
  function moonTex(THREE) { return canvasTex(THREE, 128, 128, function (g, w) { g.fillStyle = '#c9d2dc'; g.beginPath(); g.arc(64, 64, 62, 0, TWO_PI); g.fill(); for (var i = 0; i < 16; i++) { g.fillStyle = 'rgba(80,90,105,' + (0.18 + (i % 4) * 0.06) + ')'; g.beginPath(); g.arc(20 + (i * 37) % 90, 18 + (i * 53) % 90, 4 + (i % 5) * 3, 0, TWO_PI); g.fill(); } g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(88, 56, 54, 0, TWO_PI); g.fill(); }); }   // waxing crescent
  function ringTex(THREE) { return canvasTex(THREE, 256, 8, function (g, w, h) { var gr = g.createLinearGradient(0, 0, w, 0); [[0, 'rgba(0,0,0,0)'], [0.18, 'rgba(230,210,170,.0)'], [0.22, 'rgba(230,210,170,.75)'], [0.45, 'rgba(180,150,110,.55)'], [0.5, 'rgba(0,0,0,0)'], [0.56, 'rgba(235,215,175,.7)'], [0.8, 'rgba(200,175,130,.45)'], [1, 'rgba(0,0,0,0)']].forEach(function (s) { gr.addColorStop(s[0], s[1]); }); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
  function haloTex(THREE, rgb) { return canvasTex(THREE, 128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, 'rgba(' + rgb + ',.55)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }); }

  var PLANET_VERT = 'varying vec3 vN; varying vec2 vUv; void main(){ vN = normalize(normalMatrix * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  var PLANET_FRAG = 'uniform sampler2D uMap; uniform vec3 uLight; uniform float uOpacity; uniform vec3 uRim; varying vec3 vN; varying vec2 vUv; void main(){ vec3 c = texture2D(uMap, vUv).rgb; float l = clamp(dot(normalize(vN), normalize(uLight)) * 0.9 + 0.15, 0.08, 1.0); float rim = pow(1.0 - clamp(vN.z, 0.0, 1.0), 2.5); gl_FragColor = vec4(c * l + uRim * rim * 0.5, uOpacity); }';

  function buildNightSkyExtras(o) {
    var THREE = o.THREE, cam = o.camera, rng = o.rng || Math.random, R = o.radius || Math.min((cam && cam.far ? cam.far : 20000) * 0.8, 9000), night = 0, time = 0, t = 0;
    var grp = new THREE.Group(); grp.name = 'night-sky-extras'; grp.renderOrder = 9999; o.scene.add(grp);
    function setup(m) { m.frustumCulled = false; m.renderOrder = 9999; if (m.material) { m.material.depthWrite = false; m.material.fog = false; } return m; }
    // ---- shooting stars ----
    var meteors = [], TRAIL = 12;
    for (var i = 0; i < 4; i++) {
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3));
      var line = setup(new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, linewidth: 2 }))); line.visible = false; grp.add(line); meteors.push({ line: line, alive: false, t: 0, dur: 1, az: 0, el: 0, head: 0, len: 0 });
    }
    var nextMeteor = 4 + rng() * 8;
    function spawnShootingStar() {
      var m = null; for (var k = 0; k < meteors.length; k++) if (!meteors[k].alive) { m = meteors[k]; break; } if (!m) return false;
      m.alive = true; m.t = 0; m.dur = 0.7 + rng() * 0.4; m.az = rng() * TWO_PI; m.el = (25 + rng() * 50) * DEG; m.head = rng() * TWO_PI; m.len = (18 + rng() * 14) * DEG; m.line.visible = true; return true;
    }
    function stepMeteor(m, dt) {
      m.t += dt; var f = m.t / m.dur; if (f >= 1) { m.alive = false; m.line.visible = false; return; }
      var pos = m.line.geometry.attributes.position, col = m.line.geometry.attributes.color, fade = Math.sin(f * Math.PI), tail = 0.22;
      for (var j = 0; j < TRAIL; j++) { var g = clamp(f - tail * (j / (TRAIL - 1)), 0, 1), p = meteorPoint(m, g), b = (1 - j / (TRAIL - 1)) * fade; pos.setXYZ(j, p[0] * R, p[1] * R, p[2] * R); col.setXYZ(j, b, b * 0.95, b * 0.85); }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    // ---- moon 2 ----
    var m2 = null, mt = moonTex(THREE); if (mt) { m2 = setup(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: mt, transparent: true, color: 0xdfe8ff }))); var s = R * 0.030; m2.scale.set(s, s, 1); grp.add(m2); }
    // ---- planets ----
    var planets = [], defs = [
      { name: 'gas', az: 40, el: 28, size: 0.095, bands: ['#e8c88a', '#c9955a', '#f0dcae', '#b57a45', '#e6c58c', '#9a6a3c', '#f2e2bd'], ring: true, rim: [1.0, 0.8, 0.5], halo: null },
      { name: 'ice', az: 210, el: 18, size: 0.055, bands: ['#6a4aa8', '#3fa0b0', '#8d6fd0', '#2f7f95', '#7a5bbf'], ring: false, rim: [0.5, 0.8, 1.0], halo: '120,190,255' },
      { name: 'ember', az: 300, el: 40, size: 0.032, bands: ['#a63a22', '#e0702a', '#7a2a1e', '#d9582a'], ring: false, rim: [1.0, 0.5, 0.3], halo: '255,120,70' }
    ];
    defs.forEach(function (d) {
      var tex = bandTex(THREE, d.bands); if (!tex) return; var u = { uMap: { value: tex }, uLight: { value: new THREE.Vector3(0.6, 0.4, 0.7) }, uOpacity: { value: 0 }, uRim: { value: new THREE.Vector3(d.rim[0], d.rim[1], d.rim[2]) } };
      var sph = setup(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.ShaderMaterial({ uniforms: u, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, transparent: true }))), pg = new THREE.Group(), rad = R * d.size * 0.5; sph.scale.setScalar(rad); pg.add(sph); var ring = null, halo = null;
      if (d.ring) { var rt = ringTex(THREE); ring = setup(new THREE.Mesh(new THREE.RingGeometry(1.5, 2.6, 64, 1), new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, opacity: 0 }))); ring.scale.setScalar(rad); ring.rotation.x = Math.PI / 2 - 0.4; ring.rotation.y = 0.35; pg.add(ring); }
      if (d.halo) { var ht = haloTex(THREE, d.halo); halo = setup(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ht, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }))); halo.scale.setScalar(rad * 3.4); pg.add(halo); }
      grp.add(pg); planets.push({ def: d, group: pg, sph: sph, ring: ring, halo: halo, u: u, az: d.az * DEG, el: d.el * DEG });
    });
    function update(dt) {
      t += dt; night = clamp(o.getNight ? o.getNight() : 0, 0, 1); time = o.getTime ? o.getTime() : (time + dt / 1440);
      if (cam) grp.position.copy(cam.position);
      if (night > 0.45) { nextMeteor -= dt; if (nextMeteor <= 0) { spawnShootingStar(); nextMeteor = nextMeteorIn(rng, night); } }
      meteors.forEach(function (m) { if (m.alive) stepMeteor(m, dt); });
      var vis = planetVisibility(night);
      planets.forEach(function (p) { p.az += dt * 0.0015; var d = dirFromAzEl(p.az, p.el); p.group.position.set(d[0] * R, d[1] * R, d[2] * R); p.group.lookAt(0, 0, 0); p.u.uOpacity.value = vis * 0.95; p.sph.visible = vis > 0.01; if (p.ring) { p.ring.material.opacity = vis * 0.9; p.ring.visible = vis > 0.01; } if (p.halo) { p.halo.material.opacity = vis * 0.8; p.halo.visible = vis > 0.01; } });
      if (m2) { var md = moon2Dir(time); m2.position.set(md.dir[0] * R, md.dir[1] * R, md.dir[2] * R); m2.lookAt(0, 0, 0); m2.material.opacity = md.el > -0.05 ? smooth(0.0, 0.25, night + 0.2) * clamp((md.el + 0.05) / 0.2, 0, 1) : 0; m2.visible = m2.material.opacity > 0.01; }
    }
    return { group: grp, update: update, spawnShootingStar: spawnShootingStar, stats: function () { return { meteorsAlive: meteors.filter(function (m) { return m.alive; }).length, planets: planets.length, moon2: !!m2, night: night, radius: R }; }, _planets: planets, _moon2: function () { return m2; }, _meteors: meteors, dispose: function () { o.scene.remove(grp); } };
  }
  root.buildNightSkyExtras = buildNightSkyExtras; root.WorldNightSkyExtras = { dirFromAzEl: dirFromAzEl, planetVisibility: planetVisibility, nextMeteorIn: nextMeteorIn, meteorPoint: meteorPoint, moon2Dir: moon2Dir };
})(typeof window !== 'undefined' ? window : globalThis);
