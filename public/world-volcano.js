/* world-volcano.js — EMBERFALL: the volcano realm (2D world-regions/volcano parity).
 *
 * FULL MAP (2026-09-21): outer-realm build in the NE. Everything here is EXISTING
 * shipped models — zero fal spend (realer assets come Thursday with the fal session):
 *   volcano-fortress (crater shelf centerpiece) · volcano-forge-tower · volcano-bridge
 *   volcano-gate (realm entrance, on the mountain pass) · volcano-ritual-circle
 *   volcano-dragon (perched above the fortress, slow menace-bob)
 * plus the lavaMat shader + ember particles ported from world3d.html.
 *
 * Integration (classic script, same pattern as world-ocean.js):
 *   <script src="/world-volcano.js"></script>
 *   worldVolcano = window.buildWorldVolcano({ THREE, scene, layout, loader });
 *   worldVolcano.update(t);   // each frame (lava scroll + embers + dragon sway)
 */
window.buildWorldVolcano = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, layout = opts.layout || window.WORLD_LAYOUT;
  if (!THREE || !scene || !layout) return null;
  var b = (layout.biomes || []).find(function (x) { return x.id === 'volcano'; });
  if (!b) return null;

  var CX = b.center[0], CZ = b.center[1], RAD = b.radius || 170;
  var V4 = layout.mapVersion === 'v4';   // Map v4: the baked terrain volcano + canon lava channel (build_canon step 5) + flying dragons replace the v3 shelf/strips/lights/statue
  var group = new THREE.Group();
  group.name = 'world-volcano';
  scene.add(group);
  var disposables = [];
  var track = function (o) { disposables.push(o); return o; };

  // ── LAVA SHADER (ported from world3d.html lavaMat — uv-scroll fbm crust) ──
  var lavaMats = [];
  function makeLavaMat() {
    var m = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 } }]),
      vertexShader: ['varying vec2 vUv;', '#include <fog_pars_vertex>',
        'void main(){ vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;',
        '#include <fog_vertex>', '}'].join('\n'),
      fragmentShader: [
        'varying vec2 vUv; uniform float t;',
        '#include <fog_pars_fragment>',
        'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
        'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
        'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}',
        'void main(){ vec2 p=vUv*vec2(4.,22.); p.y-=t*.35; float f=fbm(p+fbm(p*1.7+t*.12)*1.4); float crust=smoothstep(.44,.64,f);',
        ' vec3 lava=mix(vec3(1.,.22,.02),vec3(1.,.82,.22),smoothstep(.2,.5,1.-f)); vec3 col=mix(lava*2.3,vec3(.06,.02,.02),crust); gl_FragColor=vec4(col,1.);',
        '#include <fog_fragment>', '}'].join('\n'),
    });
    lavaMats.push(m);
    return m;
  }

  // ── CRATER SHELF: obsidian plaza under the fortress (terrain case raises a plateau ~6.5) ──
  var shelf = new THREE.Mesh(
    track(new THREE.CircleGeometry(RAD * 0.52, 72)),
    track(new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 0.55, metalness: 0.3, emissive: 0x2a0a00, emissiveIntensity: 0.55 })));
  shelf.rotation.x = -Math.PI / 2;
  shelf.position.set(CX, 6.56, CZ);
  shelf.receiveShadow = true;
  if (!V4) group.add(shelf);

  // ── LAVA CHANNELS: 4 uv-scroll strips radiating off the shelf (like world3d buildVolcano) ──
  var lavaLights = [];
  [[0.3, RAD * 0.62, RAD * 0.22], [2.5, RAD * 0.72, RAD * 0.20], [4.4, RAD * 0.68, RAD * 0.24], [5.6, RAD * 0.62, RAD * 0.17]]
    .forEach(function (cfg) {
      if (V4) return;   // v4: no flat strips / 400-intensity point lights (perf + they float over the real relief)
      var a = cfg[0], len = cfg[1], w = cfg[2];
      var m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, len)), makeLavaMat());
      m.rotation.x = -Math.PI / 2; m.rotation.z = a;
      var rr = RAD * 0.52 + len / 2;
      m.position.set(CX + Math.sin(a) * rr, 6.6, CZ + Math.cos(a) * rr);
      group.add(m);
      var l = new THREE.PointLight(0xff5a1a, 400, 90, 1.7);
      l.position.set(m.position.x, 10, m.position.z);
      group.add(l);
      lavaLights.push(l);
    });

  // ── EMBERS — 500 additive points drifting over the crater (ported from world3d) ──
  var embers = (function () {
    var n = 500, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      a[i * 3] = (Math.random() - 0.5) * RAD * 0.9;
      a[i * 3 + 1] = Math.random() * 42;
      a[i * 3 + 2] = (Math.random() - 0.5) * RAD * 0.9;
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    var p = new THREE.Points(g, track(new THREE.PointsMaterial({
      color: 0xff8a3a, size: 0.4, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    p.position.set(CX, 6.5, CZ);
    group.add(p);
    return p;
  })();

  // ── MODELS — every shipped volcano asset, seated on the crater shelf/rim ──
  // MAP v2: the master realm-model list in world-layout.js (real sizes) wins; the literal below is the v1 fallback
  var MODELS = (layout.realmModelsFor && layout.realmModelsFor('volcano').length) ? layout.realmModelsFor('volcano').map(function (m) {
    return { id: m.id, w: m.w, x: m.x, z: m.z, y: m.y || 0, ry: m.ry || 0, anim: m.anim, url: m.url };
  }).filter(function (m) { return !(V4 && m.id === 'volcano-dragon'); }) : [
    { id: 'volcano-fortress',     w: RAD * 0.62, x: CX,                 z: CZ,                 y: 6.6,  ry: 0.26 },
    { id: 'volcano-forge-tower',  w: RAD * 0.40, x: CX - RAD * 0.52,    z: CZ + RAD * 0.30,    y: 6.6,  ry: -0.4 },
    { id: 'volcano-ritual-circle',w: RAD * 0.30, x: CX + RAD * 0.56,    z: CZ - RAD * 0.34,    y: 6.6,  ry: 0.9 },
    { id: 'volcano-dragon',       w: RAD * 0.55, x: CX + RAD * 0.18,    z: CZ + RAD * 0.10,    y: 26,   ry: -2.2, anim: 'dragon' },
    { id: 'volcano-bridge',       w: RAD * 0.34, x: CX + RAD * 0.86,    z: CZ + RAD * 0.62,    y: 0,    ry: 0.7 },
    { id: 'volcano-gate',         w: RAD * 0.30, x: CX * 0.86,          z: CZ * 0.86,          y: 0,    ry: 2.4 }, // on the SW approach
  ];
  var placed = [];
  var dragonMesh = null;

  function fit(m, w) {
    var box = new THREE.Box3().setFromObject(m);
    var sz = box.getSize(new THREE.Vector3());
    var len = Math.max(sz.x, sz.z, 0.001);
    m.scale.multiplyScalar(w / len);
    var box2 = new THREE.Box3().setFromObject(m);
    return -box2.min.y;
  }

  function mountModel(cfg, m, fromGLB) {
    if (fromGLB) m.traverse(function (o) {
      if (o.isMesh && o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    var yOff = fit(m, cfg.w);
    m.name = 'volcano-' + cfg.id;
    var gH = opts.heightAt ? opts.heightAt(cfg.x, cfg.z) : (cfg.y || 0);   // MAP v3: terrain height (crater shelf etc.)
    m.position.set(cfg.x, (opts.heightAt ? gH + (cfg.anim === 'dragon' ? (cfg.y || 0) : 0) : gH) + yOff, cfg.z);
    m.rotation.y = cfg.ry || 0;
    group.add(m);
    placed.push({ m: m, cfg: cfg });
    if (window.__registerPlaceable) window.__registerPlaceable('realm:volcano:' + cfg.id, m, { source: 'world-layout.js realmModels', realm: 'volcano', id: cfg.id });
    if (cfg.anim === 'dragon') { dragonMesh = m; m.userData.baseY = m.position.y; }
  }

  function fallback(cfg) {
    var g = new THREE.Group();
    var core = new THREE.Mesh(track(new THREE.BoxGeometry(cfg.w * 0.4, cfg.w * 0.5, cfg.w * 0.4)),
      track(new THREE.MeshStandardMaterial({ color: 0x1a0d0a, roughness: 0.6, metalness: 0.4, emissive: 0xff3a10, emissiveIntensity: 0.18 })));
    core.position.y = cfg.w * 0.25; g.add(core);
    return g;
  }

  if (opts.loader) {
    MODELS.forEach(function (cfg) {
      opts.loader.load(cfg.url || ('/assets/models/' + cfg.id + '.glb'), function (g) { mountModel(cfg, g.scene, true); },
        undefined, function () { mountModel(cfg, fallback(cfg), false); });
    });
  } else {
    MODELS.forEach(function (cfg) { mountModel(cfg, fallback(cfg), false); });
  }

  var api = {
    group: group,
    center: [CX, CZ],
    update: function (t) {
      for (var i = 0; i < lavaMats.length; i++) lavaMats[i].uniforms.t.value = t;
      embers.rotation.y = t * 0.05;
      embers.position.y = 6.5 + Math.sin(t * 0.4) * 1.2;
      if (dragonMesh) {                       // slow menace-sway over the fortress
        dragonMesh.rotation.y = -2.2 + Math.sin(t * 0.18) * 0.35;
        dragonMesh.position.y = (dragonMesh.userData.baseY || 26) + Math.sin(t * 0.5) * 1.4;
      }
      for (var j = 0; j < lavaLights.length; j++) lavaLights[j].intensity = 400 + Math.sin(t * 2.1 + j) * 90;
    },
    dispose: function () {
      scene.remove(group);
      disposables.forEach(function (d) { if (d.geometry) d.geometry.dispose(); if (d.material) d.material.dispose(); });
      lavaMats.forEach(function (m) { m.dispose(); });
      try { if (window.__worldVolcano === api) delete window.__worldVolcano; } catch (e) {}
    },
  };
  try { window.__worldVolcano = api; } catch (e) {}
  return api;
};
