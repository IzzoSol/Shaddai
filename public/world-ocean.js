/* world-ocean.js — CRYSTAL SEA: shader ocean + gold harbor + moored boats (handoff step 2).
 *
 * Mirrors the 2D world's beach realm (deep water at far SW) as an animated open-ocean
 * cove in the SW corner of the 3D world. Ported from world3d.html:
 *   • the multi-wave sine sum (WAVES / waveH / WH_GLSL) — the SAME function runs on the
 *     GPU (vertex displacement) and the CPU (boat bobbing), so vessels ride the real
 *     surface, exactly like the source realm;
 *   • the reflective/foam fragment shading, retuned to the host's night palette
 *     (emerald→obsidian water, gold sun sparkle, warm-lamp harbor).
 *
 * The biome region + terrain basin (seafloor / sandy shelf / dock jetty pad) live in
 * world-layout.js (id:'ocean', center, radius, dock) and world-terrain.js (case 'ocean').
 *
 * Integration (classic script, called from the main world module):
 *   <script src="/world-ocean.js"></script>
 *   worldOcean = window.buildWorldOcean({ THREE, scene, layout, loader });   // loader = GLTFLoader with Draco+Meshopt
 *   worldOcean.update(t);   // each frame
 *   worldOcean.dispose();   // cleanup
 */
window.buildWorldOcean = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, layout = opts.layout || window.WORLD_LAYOUT;
  if (!THREE || !scene || !layout) return null;
  var b = (layout.biomes || []).find(function (x) { return x.id === 'ocean'; });
  if (!b) return null;

  var CX = b.center[0], CZ = b.center[1];
  var RAD = b.radius || 95;                    // FULL MAP: every zone scales with the biome radius
  var DOCK = b.dock || [CX + 70, CZ - 66];
  var F = function (x) { return Number(x).toFixed(5); };
  var sstep = function (a, bb, x) { x = Math.min(1, Math.max(0, (x - a) / (bb - a))); return x * x * (3 - 2 * x); };

  var group = new THREE.Group();
  group.name = 'world-ocean';
  scene.add(group);
  var disposables = [];
  var track = function (o) { disposables.push(o); return o; };

  var WAVE_IN  = +(RAD * 0.74).toFixed(2);     // full wave height inside
  var WAVE_OUT = +(RAD * 0.93).toFixed(2);     // calm past (flat shore)
  var DEEP_IN  = +(RAD * 0.26).toFixed(2);     // deep-gradient start
  var DEEP_OUT = +(RAD * 0.63).toFixed(2);     // deep-gradient end
  var FOAM_A   = +(RAD * 0.84).toFixed(2);     // shoreline foam band (≈ the waterline)
  var FOAM_B   = +(RAD * 1.01).toFixed(2);

  // ── WAVES — same 4-wave sum as world3d.html; radial fade so the cove is lively
  //    in the middle and flat calm at the shore + over the dock jetty. ──
  var WAVES = [[1, 0.2, 0.55, 38, 1.0], [0.4, 1, 0.35, 23, 1.3], [-0.6, 0.8, 0.2, 13, 1.7], [0.9, -0.5, 0.12, 7, 2.1]];
  function waveH(x, z, t) {
    var h = 0;
    for (var i = 0; i < WAVES.length; i++) {
      var w = WAVES[i], l = Math.hypot(w[0], w[1]);
      h += w[2] * Math.sin(((w[0] * x + w[1] * z) / l) * (6.28318 / w[3]) + t * w[4]);
    }
    return h * (1 - sstep(WAVE_IN, WAVE_OUT, Math.hypot(x - CX, z - CZ)));
  }
  var WH_GLSL = 'float wh(vec2 p,float t,out vec2 g){float h=0.;g=vec2(0.);'
    + WAVES.map(function (w) {
      var l = Math.hypot(w[0], w[1]), k = 6.28318 / w[3];
      return '{float ph=dot(p,vec2(' + F(w[0] / l) + ',' + F(w[1] / l) + '))*' + F(k) + '+t*' + F(w[4])
        + ';h+=' + F(w[2]) + '*sin(ph);g+=' + F(w[2] * k) + '*cos(ph)*vec2(' + F(w[0] / l) + ',' + F(w[1] / l) + ');}';
    }).join('')
    + 'float c=1.-smoothstep(' + F(WAVE_IN) + ',' + F(WAVE_OUT) + ',length(p-uC));g*=c;return h*c;}';

  var oceanMat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      t:      { value: 0 },
      uC:     { value: new THREE.Vector2(CX, CZ) },
      skyTop: { value: new THREE.Color(0x101c3a) },
      skyBot: { value: new THREE.Color(0x060a18) },
      sunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3) },
      sunCol: { value: new THREE.Color(0xffe0b8) },
    }]),
    vertexShader: [
      'uniform float t; uniform vec2 uC; varying vec3 vW; varying vec3 vN; varying float vH; varying float vD;',
      WH_GLSL,
      '#include <fog_pars_vertex>',
      'void main(){ vec4 w=modelMatrix*vec4(position,1.); vec2 g; float h=wh(w.xz,t,g); w.y+=h;',
      ' vW=w.xyz; vH=h; vD=distance(w.xz,uC); vN=normalize(vec3(-g.x,1.,-g.y));',
      ' vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;',
      '#include <fog_vertex>',
      '}'].join('\n'),
    fragmentShader: [
      'uniform float t; uniform vec3 skyTop; uniform vec3 skyBot; uniform vec3 sunDir; uniform vec3 sunCol;',
      'varying vec3 vW; varying vec3 vN; varying float vH; varying float vD;',
      '#include <fog_pars_fragment>',
      'void main(){',
      ' vec3 N=normalize(vN); N.xz+=0.06*vec2(sin(vW.x*1.7+t*1.3+sin(vW.z*.9)),cos(vW.z*1.9+t*1.1)); N=normalize(N);',
      ' vec3 V=normalize(cameraPosition-vW); float fr=pow(1.-max(dot(N,V),0.),4.);',
      ' float deep=1.-smoothstep(' + F(DEEP_IN) + ',' + F(DEEP_OUT) + ',vD); vec3 body=mix(vec3(.05,.62,.58),vec3(.012,.09,.26),deep);',
      ' vec3 R=reflect(-V,N); vec3 refl=mix(skyBot,skyTop,clamp(R.y*1.6,0.,1.));',
      ' vec3 col=mix(body,refl,clamp(fr*.85+.1,0.,1.));',
      ' float sp=pow(max(dot(reflect(-sunDir,N),V),0.),110.); col+=sunCol*sp*1.6;',
      ' float foam=smoothstep(.5,.95,vH/.9)*.5+(1.-smoothstep(' + F(FOAM_A) + ',' + F(FOAM_B) + ',vD))*.45*(.5+.5*sin(vW.x*.5+t*2.));',
      ' col=mix(col,vec3(1.),clamp(foam,0.,1.)*.75); gl_FragColor=vec4(col,1.);',
      '#include <fog_fragment>',
      '}'].join('\n'),
  });

  // ── WATER PLANE — 2·RAD covers the whole cove incl. the buried corners, GPU waves ──
  var PLANE = RAD * 2, PSEG = Math.max(64, Math.round(RAD * 0.73));
  var waterGeo = new THREE.PlaneGeometry(PLANE, PLANE, PSEG, PSEG);
  waterGeo.rotateX(-Math.PI / 2);
  var waterMesh = new THREE.Mesh(waterGeo, oceanMat);
  waterMesh.position.set(CX, 0.05, CZ);
  waterMesh.name = 'ocean-water';
  waterMesh.frustumCulled = false;   // waves displace ±1.2u; skip edge-on culling pops
  group.add(waterMesh);

  // ── GOLD HARBOR (biome.dock) — flush disc + rim curb + mooring posts + beacon ──
  var dockMat  = track(new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.45, metalness: 0.5 }));
  var goldMat  = track(new THREE.MeshStandardMaterial({ color: 0xe8c45c, roughness: 0.3, metalness: 0.9, emissive: 0xe8c45c, emissiveIntensity: 0.25 }));
  var darkMat  = track(new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.4, metalness: 0.7 }));
  var glowMat  = track(new THREE.MeshStandardMaterial({ color: 0xffe0a8, roughness: 0.2, emissive: 0xffe0a8, emissiveIntensity: 1.4 }));

  var dock = new THREE.Group();
  dock.name = 'ocean-dock';
  dock.position.set(DOCK[0], 0, DOCK[1]);
  group.add(dock);

  // paved disc set flush into the jetty plateau (terrain pad top ≈ 1.78)
  var disc = new THREE.Mesh(track(new THREE.CylinderGeometry(7, 7.2, 0.22, 48)), dockMat);
  disc.position.y = 1.80; disc.receiveShadow = true; dock.add(disc);
  var rim = new THREE.Mesh(track(new THREE.TorusGeometry(7, 0.14, 8, 64)), goldMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.84; dock.add(rim);

  // mooring posts around the disc
  for (var p = 0; p < 8; p++) {
    var a = (p / 8) * Math.PI * 2;
    var post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.18, 1.15, 10)), goldMat);
    post.position.set(Math.sin(a) * 6.4, 2.35, Math.cos(a) * 6.4);
    dock.add(post);
  }
  // two lamp posts
  [-4.6, 4.6].forEach(function (lx) {
    var pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 8)), darkMat);
    pole.position.set(lx, 3.9, 3.4); dock.add(pole);
    var bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 12, 12)), glowMat);
    bulb.position.set(lx, 6.15, 3.4); dock.add(bulb);
  });
  var lamp = new THREE.PointLight(0xffe0a8, 14, 48, 1.8);
  lamp.position.set(DOCK[0], 6, DOCK[1]);
  group.add(lamp);

  // harbor beacon tower (slim obsidian spire with gold rings + pulsing crown)
  var tower = new THREE.Group();
  tower.position.set(0, 0, -5.8);
  dock.add(tower);
  var spire = new THREE.Mesh(track(new THREE.CylinderGeometry(0.55, 1.05, 11, 12)), darkMat);
  spire.position.y = 7.3; tower.add(spire);
  [2.8, 5.6, 8.4].forEach(function (yy, i) {
    var ring = new THREE.Mesh(track(new THREE.TorusGeometry(1.02 - i * 0.14, 0.07, 8, 32)), goldMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = yy + 1.9; tower.add(ring);
  });
  var beaconMat = track(new THREE.MeshStandardMaterial({ color: 0xffe0a8, roughness: 0.2, emissive: 0xffe0a8, emissiveIntensity: 1.2 }));
  var beacon = new THREE.Mesh(track(new THREE.SphereGeometry(0.55, 14, 14)), beaconMat);
  beacon.position.y = 13.2; tower.add(beacon);

  // ── BOATS/SHIPS — moored in the wave zone near the harbor, riding the real surface.
  //    FULL MAP: positions are dir/perp fractions of RAD (dir = toward the plaza),
  //    sizes scale with RAD so the sea grows, the fleet grows with it. ──
  var DIR = [0.714, -0.702], PERP = [0.702, 0.714], SC = RAD / 95;
  function atB(dfr, pfr) {
    return [CX + (DIR[0] * dfr + PERP[0] * pfr) * RAD, CZ + (DIR[1] * dfr + PERP[1] * pfr) * RAD];
  }
  var BOATS = [
    { id: 'ocean-skiff',      name: 'HOVER SKIFF',  w: 12 * SC, d: 0.57, p:  0.19, ry: -0.80, bob: 0.55, ph: 0.0 },
    { id: 'ocean-catamaran',  name: 'CATAMARAN',    w: 19 * SC, d: 0.76, p: -0.06, ry: -0.45, bob: 0.50, ph: 1.7 },
    { id: 'ocean-superyacht', name: 'SUPER-YACHT', w: 30 * SC, d: 0.53, p: -0.21, ry: -1.05, bob: 0.35, ph: 3.1 },
    { id: 'ocean-submarine',  name: 'RESEARCH SUB', w: 14 * SC, d: 0.42, p:  0.25, ry:  0.35, bob: 0.45, ph: 4.4 },
  ];
  BOATS.forEach(function (c) { var P = atB(c.d, c.p); c.x = P[0]; c.z = P[1]; });
  var boats = [];

  function fitBoat(m, w) {
    var box = new THREE.Box3().setFromObject(m);
    var sz = box.getSize(new THREE.Vector3());
    var len = Math.max(sz.x, sz.z, 0.001);
    m.scale.multiplyScalar(w / len);
    var box2 = new THREE.Box3().setFromObject(m);
    return { yOff: -box2.min.y };
  }

  function mountBoat(cfg, m, fromGLB) {
    if (fromGLB) {
      m.traverse(function (o) {
        if (o.isMesh && o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      });
    }
    var fit = fitBoat(m, cfg.w);
    m.name = 'ocean-boat-' + cfg.id;
    m.position.set(cfg.x, 0.05 + fit.yOff, cfg.z);
    m.rotation.y = cfg.ry;
    group.add(m);
    boats.push({ m: m, cfg: cfg, yOff: fit.yOff });
  }

  function fallbackBoat(cfg) {
    var g = new THREE.Group();
    var hull = new THREE.Mesh(track(new THREE.BoxGeometry(cfg.w * 0.34, cfg.w * 0.12, cfg.w * 0.9)), darkMat);
    hull.position.y = cfg.w * 0.07; g.add(hull);
    var trim = new THREE.Mesh(track(new THREE.BoxGeometry(cfg.w * 0.30, cfg.w * 0.05, cfg.w * 0.72)), goldMat);
    trim.position.y = cfg.w * 0.15; g.add(trim);
    var cabin = new THREE.Mesh(track(new THREE.BoxGeometry(cfg.w * 0.22, cfg.w * 0.10, cfg.w * 0.30)), dockMat);
    cabin.position.set(0, cfg.w * 0.22, -cfg.w * 0.10); g.add(cabin);
    return g;
  }

  if (opts.loader) {
    BOATS.forEach(function (cfg) {
      opts.loader.load('/assets/models/' + cfg.id + '.glb', function (g) {
        mountBoat(cfg, g.scene, true);
      }, undefined, function () {
        console.warn('[world-ocean] GLB failed, procedural fallback:', cfg.id);
        mountBoat(cfg, fallbackBoat(cfg), false);
      });
    });
  } else {
    BOATS.forEach(function (cfg) { mountBoat(cfg, fallbackBoat(cfg), false); });
  }

  // ── frame update — zero allocations; boats ride waveH, beacon breathes ──
  var api = {
    group: group,
    waveH: waveH,
    dockPos: [DOCK[0], DOCK[1]],
    center: [CX, CZ],
    radius: RAD,
    boats: function () { return boats.map(function (bb) { return { m: bb.m, name: bb.cfg.name }; }); },
    boatCount: function () { return boats.length; },
    boatList: function () { return boats.map(function (b) { return b.cfg.id; }); },
    update: function (t) {
      oceanMat.uniforms.t.value = t;
      for (var i = 0; i < boats.length; i++) {
        var bb = boats[i], cf = bb.cfg;
        bb.m.position.y = 0.05 + bb.yOff + waveH(cf.x, cf.z, t) * cf.bob;
        bb.m.rotation.z = Math.sin(t * 0.7 + cf.ph) * 0.035;
        bb.m.rotation.x = Math.cos(t * 0.5 + cf.ph) * 0.028;
      }
      beaconMat.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.6;
      lamp.intensity = 14 + Math.sin(t * 3.1) * 1.2;
    },
    dispose: function () {
      scene.remove(group);
      for (var i = 0; i < disposables.length; i++) {
        var d = disposables[i];
        if (d.geometry) d.geometry.dispose();
        if (d.material) d.material.dispose();
      }
      waterGeo.dispose(); oceanMat.dispose();
      boats.length = 0;
      try { if (window.__worldOcean === api) delete window.__worldOcean; } catch (e) {}
    },
  };
  try { window.__worldOcean = api; } catch (e) {}   // probe/console hook
  return api;
};
