/* world-underground-bazaar.js — THE UNDERGROUND BAZAAR under SHADDAI City (2026-10-23, owner: "in the middle of shaddai city ... an
 * elevator into this underground bazaar and city ... the middle is a platform elevator that goes up and down into this realm";
 * "the underground bazaar city has a train station that connects to the colosseum train and the underwater train").
 *
 *   WorldUndergroundBazaar.build({ THREE, GLTFLoader, scene, heightAt, getPlayer, setPlayer(x,y,z,yaw), isInside?, anchor? }) -> Promise<api>
 *
 * Art: Blender kit K32 v02 (Shaddai/public/assets/kits/_src/k32_underground_bazaar.py -> shaddai_bazaar_city_v02.glb, headless
 * tools/k32_export_bg.py). The cavern sits DEPTH_M under the Grid centre.
 *
 * v02 SURFACE (owner 2026-11-05: "an underground elevator that connects to the middle of the map with the top of the pyramid there ...
 * still has ground there but perfect opening parts for the elevator and a cool cinematic view to the bottom layer, a good mix between the
 * opening and a solid floor in the middle of the city"). Owner picks: the capstone is the centrepiece, glow gap + 6 glass oculi, cinematic.
 *   - The street stays SOLID. Two kinds of openings are cut (terrain-v4 setHoles + a ground-material patch for the plaza floor):
 *     the GAP round the pyramid's flush gold top step (GAP_M), crossed by four gold BRIDGES on the diagonals, railed everywhere else;
 *     six walk-on GLASS OCULI (OC_R_M) on the plaza ring between the six roads - look straight down the funnel into the cavern.
 *   - The CAPSTONE SHRINE (4 gold pillars + pyramidion) stands on the top step; the marketplace fountain it replaces is hidden.
 *   - THE INCLINE: a glass car docked at the shrine's east edge rides the rail down the pyramid's east face (step corners) to the arrival
 *     platform at its foot. E in the car = a ~12 s CINEMATIC descent (camera sweeps out over the cavern); E / Esc / click skips. E on the
 *     arrival platform = ride back up. The Sky Nexus stop stays (fade ride).
 * CAVERN: STATION (west wall): E at the Colosseum Line = ride to the Colosseum door; E at the Undersea Line = the reef tube to the Ocean
 * realm station. Hidden door on the pyramid's south face = the fight pit (access code). The pyramid, canal (except the four bridges) and
 * cavern wall are solid. ?bazaar=0 = off (was off by default while the old 145 m shaft swallowed the city centre).
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, DEPTH_M = 288, USE_M = 9, FILE = '/assets/kits/shaddai_bazaar_city_v02.glb?v=20261105c';
  // v02 layout (metres, must match k32 BZ: gap_r, oc_r, oc_ring, oc_a0, rail_clear, pyr_base, pyr_h)
  var GAP_M = 14, OC_R_M = 5, OC_RING_M = 28, OC_A0 = 30, TOP_HALF_M = 130 / 18, BRIDGE_W_M = 4.2, RIDE_S = 12;
  function railX(zm) { return 130 * (1 + 1 / 18) - (130 / 18) * (zm / 16) + 1.2; }   // K32 rail_x: the east-face step corners + clearance
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]bazaar=0/.test(location.search || '')) return Promise.resolve(null);
    var THREE = o.THREE, A = (o.anchor && o.anchor()) || { x: 0, z: 0 };
    var gy = o.heightAt ? o.heightAt(A.x, A.z) : 0, BY = gy - DEPTH_M * U;
    function W(x, y, z) { return new THREE.Vector3(A.x + x * U, BY + z * U, A.z - y * U); }   // cavern metres (Blender x east, y north, z up) -> world
    var st = { inside: false, busy: false, hooks: {}, root: null, wallR: 420 }, group = new THREE.Group(); group.name = 'underground-bazaar'; group.visible = false; o.scene.add(group);
    var gold = new THREE.MeshStandardMaterial({ color: 0xd9a63e, metalness: 0.8, roughness: 0.3 }), glow = new THREE.MeshBasicMaterial({ color: 0xffc35a });

    // ── SURFACE: openings (gap + oculi), bridges, railing, glass, the capstone shrine and the docked car ──
    var surf = new THREE.Group(); surf.name = 'bazaar-surface'; o.scene.add(surf);
    var OC = []; for (var k = 0; k < 6; k++) { var a = (OC_A0 + 60 * k) * Math.PI / 180; OC.push({ x: A.x + OC_RING_M * Math.cos(a) * U, z: A.z - OC_RING_M * Math.sin(a) * U }); }
    var HOLES = [[A.x, A.z, GAP_M * U]].concat(OC.map(function (c) { return [c.x, c.z, OC_R_M * U]; }));
    var holeSet = false; function cutHole() { try { var TV = root.__w3dDebug && root.__w3dDebug.terrainV4; if (TV && TV.setHoles) { TV.setHoles(HOLES); holeSet = true; } else if (TV && TV.setHole) { TV.setHole(A.x, A.z, GAP_M * U); holeSet = true; } } catch (e) { } }
    cutHole();
    // gap collar (gold lip + glow band) and the railing: posts + rail arcs, open where the four diagonal bridges land
    var collar = new THREE.Mesh(new THREE.TorusGeometry(GAP_M + 0.35, 0.35, 8, 120), gold); collar.rotation.x = Math.PI / 2; collar.scale.setScalar(U); collar.position.set(A.x, gy + 0.2 * U, A.z); surf.add(collar);
    var band = new THREE.Mesh(new THREE.TorusGeometry(GAP_M + 0.05, 0.12, 6, 120), glow); band.rotation.x = Math.PI / 2; band.scale.setScalar(U); band.position.set(A.x, gy + 0.02 * U, A.z); surf.add(band);
    var openHalf = (BRIDGE_W_M / 2 + 0.4) / GAP_M;   // angular half-width of each bridge opening in the rail (radians)
    for (var q = 0; q < 4; q++) {
      var a0 = q * Math.PI / 2 + Math.PI / 4 + openHalf, arc = Math.PI / 2 - 2 * openHalf;
      var rail = new THREE.Mesh(new THREE.TorusGeometry(GAP_M + 0.6, 0.09, 6, 40, arc), gold); rail.rotation.x = -Math.PI / 2; rail.rotation.z = a0; rail.scale.setScalar(U); rail.position.set(A.x, gy + 1.1 * U, A.z); surf.add(rail);
      for (var pi = 0; pi <= 6; pi++) { var pa = a0 + arc * pi / 6, post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), gold); post.scale.setScalar(U); post.position.set(A.x + Math.cos(pa) * (GAP_M + 0.6) * U, gy + 0.55 * U, A.z - Math.sin(pa) * (GAP_M + 0.6) * U); surf.add(post); }
    }
    // four bridges on the diagonals: from the rail to the top step's corner
    var bridgeLen = GAP_M + 0.8 - (TOP_HALF_M * Math.SQRT2 - 1.2);
    for (var bq = 0; bq < 4; bq++) {
      var ba = bq * Math.PI / 2 + Math.PI / 4, mid = (GAP_M + 0.8 + TOP_HALF_M * Math.SQRT2 - 1.2) / 2;
      var br = new THREE.Group(); br.position.set(A.x + Math.cos(ba) * mid * U, gy, A.z - Math.sin(ba) * mid * U); br.rotation.y = ba; surf.add(br);
      var deck = new THREE.Mesh(new THREE.BoxGeometry(bridgeLen * U, 0.35 * U, BRIDGE_W_M * U), gold); deck.position.y = -0.12 * U; br.add(deck);
      var under = new THREE.Mesh(new THREE.BoxGeometry(bridgeLen * U, 0.08 * U, BRIDGE_W_M * 0.4 * U), glow); under.position.y = -0.32 * U; br.add(under);
      [-1, 1].forEach(function (s) { var hr = new THREE.Mesh(new THREE.BoxGeometry(bridgeLen * U, 0.1 * U, 0.1 * U), gold); hr.position.set(0, 1.0 * U, s * BRIDGE_W_M / 2 * U); br.add(hr); });
    }
    // six glass oculi: walk-on glass, gold rim, a soft glow ring; you look straight down the funnel into the cavern
    var glassMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false });
    OC.forEach(function (c) {
      var gl = new THREE.Mesh(new THREE.CircleGeometry(OC_R_M * U, 48), glassMat); gl.rotation.x = -Math.PI / 2; gl.position.set(c.x, gy + 0.06 * U, c.z); gl.renderOrder = 6; surf.add(gl);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(OC_R_M + 0.15, 0.22, 8, 64), gold); rim.rotation.x = Math.PI / 2; rim.scale.setScalar(U); rim.position.set(c.x, gy + 0.1 * U, c.z); surf.add(rim);
      var gr = new THREE.Mesh(new THREE.TorusGeometry(OC_R_M - 0.1, 0.06, 6, 64), glow); gr.rotation.x = Math.PI / 2; gr.scale.setScalar(U); gr.position.set(c.x, gy + 0.08 * U, c.z); surf.add(gr);
    });
    // the CAPSTONE SHRINE on the gold top step: four pillars, a lintel ring and a pyramidion; the beacon marks the middle of the map
    var shrine = new THREE.Group(); shrine.position.set(A.x, gy, A.z); shrine.scale.setScalar(U); surf.add(shrine);
    var ph = 9, pc = TOP_HALF_M - 1.0;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { var p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, ph, 12), gold); p.position.set(s[0] * pc, ph / 2, s[1] * pc); shrine.add(p); });
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(pc * 2 + 1.4, 0.7, pc * 2 + 1.4), gold); lintel.position.y = ph + 0.35; shrine.add(lintel);
    var pyramidion = new THREE.Mesh(new THREE.ConeGeometry((pc + 0.7) * Math.SQRT2, 5.5, 4), gold); pyramidion.rotation.y = Math.PI / 4; pyramidion.position.y = ph + 0.7 + 2.75; shrine.add(pyramidion);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = ph + 36; shrine.add(beam);
    var plinthGlow = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 48), glow); plinthGlow.rotation.x = Math.PI / 2; plinthGlow.position.y = 0.08; shrine.add(plinthGlow);
    // THE CAR: a glass capsule on a gold chassis, docked at the rail top (east edge of the top step)
    var car = new THREE.Group(); car.name = 'bazaar-incline-car'; car.scale.setScalar(U); o.scene.add(car);
    var chassis = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.5, 4.6), gold); chassis.position.y = 0.25; car.add(chassis);
    var cabin = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 3.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xbff4ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })); cabin.position.y = 2.1; car.add(cabin);
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.35, 24), gold); roof.position.y = 3.85; car.add(roof);
    var carGlow = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.08, 6, 48), glow); carGlow.rotation.x = Math.PI / 2; carGlow.position.y = 0.55; car.add(carGlow);
    // readable in the wide cinematic shots (verified 2026-11-05: the clear cabin vanished against the pyramid): a beacon + halo on the roof
    var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glow); beacon.position.y = 4.4; car.add(beacon);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); halo.position.y = 4.4; car.add(halo);
    cabin.material.opacity = 0.34;
    var RTOP = W(railX(DEPTH_M), 0, DEPTH_M + 0.5), RBOT = W(railX(0), 0, 0.5);
    function placeCar(u) { car.position.lerpVectors(RTOP, RBOT, u); }
    placeCar(0);
    var TOP_STEP = W(TOP_HALF_M - 2.2, 0, DEPTH_M);   // where you stand to board at the top (just west of the car)

    // hide the marketplace fountain the shrine replaces (world-buildings.js exposes it) + drop its collider
    var monumentDone = false;
    function hideMonument() { var M = root.__hubMonument; if (!M || monumentDone) return; monumentDone = true; if (M.group) M.group.visible = false;
      var hc = root.__hubColliders; if (hc && M.collider) { var i = hc.indexOf(M.collider); if (i >= 0) hc.splice(i, 1); } }
    // the plaza floor meshes (bazaar disc, rings, tiles) get the same openings: flat ground-level meshes near the centre are patched to
    // discard fragments inside a hole. Position-based, so a patched shared material is unaffected away from the centre.
    var holeU = { value: HOLES.map(function (h) { return new THREE.Vector4(h[0], h[1], h[2], 1); }) }, holeY = { value: new THREE.Vector2(gy - 8 * U, gy + 1.5 * U) };
    while (holeU.value.length < 8) holeU.value.push(new THREE.Vector4(0, 0, 0, 0));
    var _bx = new THREE.Box3(), patched = 0;
    function patchMat(m) {
      if (!m || m.isShaderMaterial || m.isRawShaderMaterial || m.userData.__bzHoles) return; m.userData.__bzHoles = true;
      var prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.uniforms.uBzHoles = holeU; sh.uniforms.uBzHoleY = holeY;
        sh.vertexShader = 'varying vec3 vBzW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\n vBzW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\n vBzW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
        sh.fragmentShader = 'varying vec3 vBzW; uniform vec4 uBzHoles[8]; uniform vec2 uBzHoleY;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n if (vBzW.y > uBzHoleY.x && vBzW.y < uBzHoleY.y) { for (int bzI = 0; bzI < 8; bzI++) { if (uBzHoles[bzI].w > 0.5 && distance(vBzW.xz, uBzHoles[bzI].xy) < uBzHoles[bzI].z) discard; } }');
      };
      m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|bzholes'; };
      m.needsUpdate = true; patched++;
    }
    function patchGround() {
      var R = (OC_RING_M + OC_R_M + 2) * U, TV = root.__w3dDebug && root.__w3dDebug.terrainV4, tmesh = TV && TV.mesh;
      o.scene.traverse(function (n) {
        if (!n.isMesh || n === tmesh || n.userData.__bzSeen) return; var p = n; while (p) { if (p === surf || p === group || p === car) return; p = p.parent; }
        var g = n.geometry; if (!g) return; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingBox) return;
        if (n.isInstancedMesh) { if (n.computeBoundingBox) { n.computeBoundingBox(); _bx.copy(n.boundingBox).applyMatrix4(n.matrixWorld); } else return; } else _bx.copy(g.boundingBox).applyMatrix4(n.matrixWorld);
        n.userData.__bzSeen = true;
        if (_bx.max.y > gy + 3 * U || _bx.min.y < gy - 8 * U) return;                                       // flat, at street level only
        var hits = false;                                                                                     // only meshes that actually overlap an opening
        for (var hi = 0; hi < HOLES.length && !hits; hi++) { var H = HOLES[hi], cx = Math.max(_bx.min.x, Math.min(H[0], _bx.max.x)), cz = Math.max(_bx.min.z, Math.min(H[1], _bx.max.z)); if (Math.hypot(cx - H[0], cz - H[1]) < H[2]) hits = true; }
        if (!hits) return;
        (Array.isArray(n.material) ? n.material : [n.material]).forEach(patchMat);
      });
    }

    function hookWorld(name) { var h = st.hooks[name]; if (!h) return null; var v = new THREE.Vector3(); h.getWorldPosition(v); return v; }
    var stars = null;
    var ready = new Promise(function (res) {
      new o.GLTFLoader().load(FILE, function (g) {
        var s = g.scene; s.scale.setScalar(U); s.position.set(A.x, BY, A.z); group.add(s);
        var hemi = new THREE.HemisphereLight(0xffe0a8, 0x2a1a10, 1.6); hemi.position.set(A.x, BY + 150 * U, A.z); group.add(hemi);   // warm cavern light
        var key = new THREE.PointLight(0xffd27a, 3, 900 * U, 1.2); key.position.set(A.x, BY + 160 * U, A.z); group.add(key);
        s.traverse(function (n) {
          if (/^hook_/.test(n.name)) st.hooks[n.name.replace(/\.\d+$/, '')] = n;
          if (n.userData && n.userData.wall_r) st.wallR = n.userData.wall_r;
          if (n.isMesh) { n.material.side = THREE.DoubleSide; if (n.material.name === 'bazaar_water') { n.material = new THREE.MeshStandardMaterial({ color: 0x1a6fd0, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.85 }); st.water = n.material; } }
        });
        // daylight from the street falling through the gap + oculi down the funnel
        stars = new THREE.Mesh(new THREE.CylinderGeometry(18 * U, 75 * U, 110 * U, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        stars.position.set(A.x, BY + 230 * U, A.z); group.add(stars);
        group.updateMatrixWorld(true); res(true);
      }, null, function (e) { console.warn('[bazaar]', e && e.message); res(false); });
    });

    var fade = null;
    function fadeTo(on, ms) { if (!fade) { fade = document.createElement('div'); fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9400;transition:opacity .6s'; document.body.appendChild(fade); }
      fade.style.transition = 'opacity ' + (ms || 600) + 'ms'; fade.style.opacity = on ? 1 : 0; }
    function arrive(to) { st.inside = !!to.inside; group.visible = st.inside || group.visible; if (o.setPlayer) o.setPlayer(to.x, to.y, to.z, to.yaw || 0); surface(!st.inside, to); }
    function ride(to, label) {   // fade ride (Sky Nexus, station lines, the pit door)
      if (st.busy) return; st.busy = true; if (root.__toast) root.__toast(label);
      fadeTo(true, 700);
      setTimeout(function () { arrive(to); setTimeout(function () { fadeTo(false, 900); st.busy = false; }, 500); }, 800);
    }
    // while underground the surface city is not drawn (288 m of rock away): top-level scene children are hidden and restored on the way up.
    var hidden = [];
    function surface(show, at) {
      if (show) { hidden.forEach(function (c) { c.visible = true; }); hidden = []; return; }
      o.scene.children.forEach(function (c) {
        if (c === group || c === car || c.isLight || c.isCamera || !c.visible) return;
        var w = c.position; if (Math.hypot(w.x - at.x, w.y - at.y, w.z - at.z) < 80 * U) return;
        c.visible = false; hidden.push(c);
      });
    }

    // ── THE CINEMATIC INCLINE RIDE (camera driven through a renderer.render wrap, like world-colosseum-intro.js) ──
    var cine = { on: false, t0: 0, down: true, ov: null, hooked: false, done: null, hidSurface: false };
    function ease(k) { return k * k * (3 - 2 * k); }   // smoothstep: the car leaves the capstone promptly (cubic sat at the top for seconds)
    var _c = new THREE.Vector3(), _l = new THREE.Vector3(), _ka = new THREE.Vector3(), _kb = new THREE.Vector3();
    // CAMERA KEYS in cavern metres (Blender x east, y north, z up), checked against the v02 geometry: street level for the dive into the
    // gap; then a CUT to just under the 75 m ceiling opening (the sight line to the car passes through it at r ~65 m, the pyramid face
    // at that height is 66 m out); a wide pull-out kept under the ceiling and inside the terraces (r < 285 m); settle on the arrival deck.
    var CAM_KEYS = [[0.00, -9, -11, 297], [0.15, -4, -15, 293], [0.15, 80, -30, 140], [0.40, 92, -44, 132], [0.80, 238, -150, 80], [1.00, 176, -36, 12]];
    function camAt(s) {
      for (var i = 0; i < CAM_KEYS.length - 1; i++) { var a = CAM_KEYS[i], b = CAM_KEYS[i + 1]; if (s <= b[0] || i === CAM_KEYS.length - 2) {
        var t = b[0] > a[0] ? Math.max(0, Math.min(1, (s - a[0]) / (b[0] - a[0]))) : 1; t = t * t * (3 - 2 * t);
        _ka.set(a[1], a[2], a[3]); _kb.set(b[1], b[2], b[3]); _ka.lerp(_kb, t); return W(_ka.x, _ka.y, _ka.z); } }
      return W(0, 0, DEPTH_M + 8);
    }
    function hookRender() {
      var D = root.__w3dDebug; if (cine.hooked || !D || !D.renderer) return; cine.hooked = true;
      var r0 = D.renderer.render.bind(D.renderer);
      D.renderer.render = function (sc, cam) {
        if (tr.on) trainFrame(cam);
        if (cine.on) {
          var k = cine.holdK != null ? cine.holdK : Math.min(1, (performance.now() - cine.t0) / 1000 / RIDE_S), u = ease(k), pos = cine.down ? u : 1 - u, s = cine.down ? k : 1 - k;
          placeCar(pos);
          if (cine.down && !cine.hidSurface && s > 0.15) { cine.hidSurface = true; group.visible = true; surface(false, car.position); }   // below the street: the city is not drawn
          if (!cine.down && !cine.hidSurface && s < 0.15) { cine.hidSurface = true; surface(true); }                                         // back above the street
          _c.copy(camAt(s)); _l.set(car.position.x, car.position.y + 2 * U, car.position.z);
          cam.position.copy(_c); cam.lookAt(_l); cam.updateMatrixWorld(true);
          if (k >= 1) endRide();
        }
        r0(sc, cam);
      };
    }
    function rideOverlay(title, sub) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:9500;pointer-events:auto;cursor:pointer;font-family:"Chakra Petch",system-ui,sans-serif';
      ov.innerHTML = '<div style="position:absolute;left:0;right:0;top:0;height:10vh;background:#000;transform:translateY(-100%);transition:transform .5s"></div>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;height:10vh;background:#000;transform:translateY(100%);transition:transform .5s"></div>' +
        '<div style="position:absolute;left:0;right:0;bottom:14vh;text-align:center;opacity:0;transition:opacity 1s 1s">' +
        '<div style="font:700 clamp(22px,4vw,52px)/1 \'Chakra Petch\',system-ui;letter-spacing:.3em;color:#f5d27a;text-shadow:0 0 24px rgba(232,196,92,.6)">' + title + '</div>' +
        '<div style="margin-top:10px;font:600 clamp(11px,1.3vw,16px) system-ui;letter-spacing:.38em;color:#e8f6ff;opacity:.85">' + sub + '</div></div>' +
        '<div style="position:absolute;right:20px;bottom:calc(10vh + 12px);font:600 12px system-ui;color:#cfe;opacity:.6">E / Esc / click · skip</div>';
      document.body.appendChild(ov);
      requestAnimationFrame(function () { ov.children[0].style.transform = 'none'; ov.children[1].style.transform = 'none'; ov.children[2].style.opacity = 1; });
      ov.addEventListener('click', endRide); return ov;
    }
    function skipKey(e) { if (cine.on && (e.code === 'KeyE' || e.code === 'Escape')) { e.stopImmediatePropagation(); e.preventDefault(); endRide(); } }
    function inclineRide(down) {
      if (st.busy) return; var D = root.__w3dDebug;
      if (!D || !D.renderer || /[?&]bazaarcine=0/.test(location.search || '')) {   // no render hook -> plain fade ride
        var L0 = hookWorld('hook_lift'); return ride(down ? (L0 && { x: L0.x, y: L0.y, z: L0.z, inside: true }) : { x: TOP_STEP.x, y: gy, z: TOP_STEP.z, inside: false }, down ? 'Descending to the Underground Bazaar' : 'Rising to the capstone');
      }
      st.busy = true; hookRender(); cine.down = down; cine.hidSurface = false; cine.holdK = null; cine.on = true; cine.t0 = performance.now();
      group.visible = true;   // the surface is hidden / restored inside the render hook as the camera crosses the street
      cine.ov = rideOverlay(down ? 'THE UNDERGROUND BAZAAR' : 'SHADDAI GRID', down ? 'DESCENDING THE PYRAMID' : 'RISING TO THE CAPSTONE');
      addEventListener('keydown', skipKey, true);
    }
    function endRide() {
      if (!cine.on) return; cine.on = false; removeEventListener('keydown', skipKey, true);
      placeCar(cine.down ? 1 : 0);
      var L = hookWorld('hook_lift');
      if (cine.down) arrive(L ? { x: L.x, y: L.y, z: L.z, inside: true, yaw: -Math.PI / 2 } : { x: RBOT.x + 10 * U, y: BY, z: RBOT.z, inside: true });
      else { arrive({ x: TOP_STEP.x, y: gy, z: TOP_STEP.z, inside: false, yaw: Math.PI / 2 }); placeCar(0); }
      if (cine.ov) { var ov = cine.ov; cine.ov = null; ov.style.transition = 'opacity .45s'; ov.style.opacity = 0; setTimeout(function () { ov.remove(); }, 480); }
      st.busy = false;
      if (!cine.down) setTimeout(function () { placeCar(0); }, 50);
    }
    function near(p, v, m) { return v && Math.hypot(p.x - v.x, p.z - v.z) < (m || USE_M) * U; }

    // ── THE STATION TRAINS (owner 2026-11-05: "the underground tunnel train that connects to the bazaar"). A three-car train per line rides
    // its sunken track (hook_track_*): E at the platform edge -> it pulls in from the tunnel, the doors glow, it leaves into the bore with the
    // camera following, then you arrive at the line's far station (Colosseum door / Harbor). ~9 s; E / Esc / click skips. ?bazaartrain=0 = fade.
    var TRAIN_S = 9, tr = { on: false, t0: 0, line: null, to: null, ov: null, holdK: null }, trains = {};
    function makeTrain(col) {
      var g = new THREE.Group(); g.visible = false; g.scale.setScalar(U); group.add(g);
      var body = new THREE.MeshStandardMaterial({ color: 0xe9eef5, metalness: 0.6, roughness: 0.3 }), stripe = new THREE.MeshBasicMaterial({ color: col }), win = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85 });
      for (var c = 0; c < 3; c++) {
        var car = new THREE.Group(); car.position.x = c * 17.0; g.add(car);
        var shell = new THREE.Mesh(new THREE.BoxGeometry(16.2, 3.6, 3.3), body); shell.position.y = 2.1; car.add(shell);
        var band = new THREE.Mesh(new THREE.BoxGeometry(16.25, 0.35, 3.35), stripe); band.position.y = 1.0; car.add(band);
        [-1, 1].forEach(function (s) { var w = new THREE.Mesh(new THREE.BoxGeometry(13.5, 1.1, 0.06), win); w.position.set(0, 2.7, s * 1.68); car.add(w); });
        if (c === 0 || c === 2) { var e = c === 0 ? -1 : 1;   // a cab at both ends: the bazaar is a terminus, the train leaves the way it came
          var nose = new THREE.Mesh(new THREE.SphereGeometry(1.65, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body); nose.rotation.z = -e * Math.PI / 2; nose.scale.set(1, 0.9, 1); nose.position.set(e * 8.1, 2.1, 0); car.add(nose);
          var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); lamp.position.set(e * 9.5, 1.7, 0); car.add(lamp); }
      }
      return g;
    }
    function trackHook(line) { return hookWorld(line === 'colosseum' ? 'hook_track_colosseum' : 'hook_track_undersea'); }
    function trainPos(g, line, xm) { var T = trackHook(line); if (!T) return; g.position.set(A.x + xm * U, T.y, T.z); }   // xm = cavern-metres x of the nose
    var SXm = function () { return -(st.wallR + 2); };
    function trainFrame(cam) {
      var k = tr.holdK != null ? tr.holdK : Math.min(1, (performance.now() - tr.t0) / 1000 / TRAIN_S), g = trains[tr.line]; if (!g) return;
      var S0 = SXm(), stopX = S0 - 70, inX = S0 - 175, outX = S0 - 230, xm, T = trackHook(tr.line), side = tr.line === 'colosseum' ? -1 : 1;
      if (k < 0.38) { var a = k / 0.38; a = 1 - Math.pow(1 - a, 3); xm = inX + (stopX - inX) * a; }                        // pulls in, braking
      else if (k < 0.5) xm = stopX;                                                                                     // doors
      else { var b = (k - 0.5) / 0.5; b = b * b; xm = stopX + (outX - stopX) * b; }                                     // leaves into the bore
      trainPos(g, tr.line, xm);
      if (T) {
        if (k < 0.5) { _c.set(A.x + (S0 - 30) * U, T.y + 5.2 * U, T.z + side * 10 * U); _l.set(A.x + xm * U, T.y + 2 * U, T.z); }   // on the platform (10 m in from the track), watching it arrive
        else { _c.set(A.x + (xm + 26) * U, T.y + 6 * U, T.z + side * 7 * U); _l.set(A.x + (xm - 6) * U, T.y + 2 * U, T.z); }         // chase it into the tunnel
        cam.position.copy(_c); cam.lookAt(_l); cam.updateMatrixWorld(true);
      }
      if (k > 0.9 && tr.ov && !tr.faded) { tr.faded = true; fadeTo(true, 500); }
      if (k >= 1) endTrain();
    }
    function trainSkip(e) { if (tr.on && (e.code === 'KeyE' || e.code === 'Escape')) { e.stopImmediatePropagation(); e.preventDefault(); endTrain(); } }
    function trainRide(line, to, label) {
      if (st.busy) return; var D = root.__w3dDebug;
      if (!D || !D.renderer || !trackHook(line) || /[?&]bazaartrain=0/.test(location.search || '')) return ride(to, label);
      if (!trains[line]) trains[line] = makeTrain(line === 'colosseum' ? 0xffc35a : 0x22e6ff);
      st.busy = true; hookRender(); tr.line = line; tr.to = to; tr.faded = false; tr.holdK = null; trains[line].visible = true; tr.on = true; tr.t0 = performance.now();
      tr.ov = rideOverlay(line === 'colosseum' ? 'COLOSSEUM LINE' : 'UNDERSEA LINE', line === 'colosseum' ? 'NEXT STOP · THE COLOSSEUM' : 'THROUGH THE REEF · HARBOR LINE STATION');
      tr.ov.removeEventListener('click', endRide); tr.ov.addEventListener('click', endTrain);
      addEventListener('keydown', trainSkip, true);
    }
    function endTrain() {
      if (!tr.on) return; tr.on = false; removeEventListener('keydown', trainSkip, true);
      if (trains[tr.line]) trains[tr.line].visible = false;
      if (tr.ov) { var ov = tr.ov; tr.ov = null; ov.style.transition = 'opacity .45s'; ov.style.opacity = 0; setTimeout(function () { ov.remove(); }, 480); }
      fadeTo(true, 300); var to = tr.to;
      setTimeout(function () { arrive(to); setTimeout(function () { fadeTo(false, 800); st.busy = false; }, 400); }, 350);
    }

    // THE LIFT STOPS: the capstone car (Grid), the arrival platform (Bazaar) and the Sky Nexus pad (the top platform over the circle).
    var DECK_Y = 200, DECK_PAD = { x: A.x + 60, z: A.z };                                              // world-elevators.js PLAZA_Y (units)
    var deckPad = new THREE.Group(); deckPad.name = 'bazaar-sky-pad';
    var dDisc = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 0.8, 48), gold); dDisc.position.y = 0.4; deckPad.add(dDisc);
    var dRing = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.25, 8, 64), glow); dRing.rotation.x = Math.PI / 2; dRing.position.y = 0.85; deckPad.add(dRing);
    deckPad.position.set(DECK_PAD.x, DECK_Y, DECK_PAD.z); deckPad.scale.setScalar(U * 0.7); o.scene.add(deckPad);
    function stops() {
      return [{ id: 'bazaar', label: 'Underground Bazaar (incline)', go: function () { inclineRide(true); } },
        { id: 'grid', label: 'SHADDAI Grid (the capstone)', go: function () { if (st.inside) inclineRide(false); else ride({ x: TOP_STEP.x, y: gy, z: TOP_STEP.z, inside: false }, 'The Grid — the capstone'); } },
        { id: 'sky', label: 'Sky Nexus (top platform)', go: function () { ride({ x: DECK_PAD.x + 10, y: DECK_Y + 0.6, z: DECK_PAD.z, inside: false }, 'Rising to the Sky Nexus'); } }];
    }
    var picker = null;
    function closePicker() { if (picker) picker.remove(); picker = null; }
    function openPicker(here) {
      closePicker(); picker = document.createElement('div');
      picker.style.cssText = 'position:fixed;right:24px;top:50%;transform:translateY(-50%);z-index:9600;background:rgba(10,8,4,.92);border:1px solid #6b5420;border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:6px;font:600 13px system-ui;color:#fff3d6';
      var t = document.createElement('div'); t.textContent = 'GRID LIFT'; t.style.cssText = 'text-align:center;opacity:.65;font-size:11px;letter-spacing:.22em'; picker.appendChild(t);
      stops().forEach(function (sx) {
        var b = document.createElement('button'); b.textContent = sx.label + (sx.id === here ? '  (here)' : '');
        b.style.cssText = 'min-width:230px;padding:9px 12px;border-radius:10px;border:1px solid ' + (sx.id === here ? '#ffc35a' : '#3a2e14') + ';background:#14100a;color:#fff;cursor:pointer;font:inherit;text-align:left';
        b.disabled = sx.id === here; b.onclick = function () { closePicker(); sx.go(); }; picker.appendChild(b);
      });
      document.body.appendChild(picker); setTimeout(function () { addEventListener('keydown', escPick, true); }, 0);
    }
    function escPick(e) { if (e.code === 'Escape') { closePicker(); removeEventListener('keydown', escPick, true); } }
    // HIDDEN FIGHT CLUB (owner 2026-10-23: "the boxing ring inside the pyramid, just a hidden door with access code"). The code is a
    // world secret for now (window.SHADDAI_PIT_CODE overrides); when fights carry prizes it must be checked server-side.
    var PIT_CODE = String(root.SHADDAI_PIT_CODE || '0777'), codeBox = null;
    function askCode() {
      if (codeBox) return; codeBox = document.createElement('div');
      codeBox.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9700;background:rgba(10,6,8,.95);border:1px solid #ff2fa0;border-radius:14px;padding:16px 18px;font:600 13px system-ui;color:#ffd6ec;text-align:center;min-width:240px';
      codeBox.innerHTML = '<div style="letter-spacing:.25em;font-size:11px;opacity:.7">ACCESS CODE</div><input id="pitCode" maxlength="8" inputmode="numeric" style="margin:10px 0;width:150px;text-align:center;font:700 22px monospace;letter-spacing:.3em;background:#000;color:#ff7ac8;border:1px solid #5a1a3a;border-radius:8px;padding:6px"><div style="opacity:.55;font-size:11px">Enter to try · Esc to leave</div>';
      document.body.appendChild(codeBox); var inp = codeBox.querySelector('#pitCode'); setTimeout(function () { inp.focus(); }, 30);
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { codeBox.remove(); codeBox = null; }
        if (e.key === 'Enter') { var ok = inp.value.trim() === PIT_CODE; codeBox.remove(); codeBox = null;
          if (ok) { var S2 = hookWorld('hook_pitspawn'); if (S2) { st.inPit = true; ride({ x: S2.x, y: S2.y, z: S2.z, inside: true }, 'The door slides open... welcome to the Pit'); } }
          else if (root.__toast) root.__toast('Wrong code. The door stays shut.'); }
      });
    }
    function atCarTop(p) { return Math.hypot(p.x - car.position.x, p.z - car.position.z) < 6.5 * U && Math.abs(p.y - gy) < 6 * U; }
    function use() {
      var p = o.getPlayer && o.getPlayer(); if (!p || st.busy) return false;
      if (st.inside) { var PD = hookWorld('hook_pitdoor'); if (!st.inPit && near(p, PD, 4)) { askCode(); return true; }
        if (st.inPit && PD && Math.hypot(p.x - PD.x, p.z - (PD.z - 8 * U)) < 6 * U) { st.inPit = false; ride({ x: PD.x, y: PD.y, z: PD.z - 2 * U, inside: true }, 'Back out into the Bazaar'); return true; } }
      if (o.isInside && o.isInside()) return false;
      if (picker) { closePicker(); return true; }
      if (!st.inside && atCarTop(p)) { openPicker('grid'); return true; }
      if (!st.inside && Math.hypot(p.x - DECK_PAD.x, p.z - DECK_PAD.z) < 8 * U && Math.abs(p.y - DECK_Y) < 6 * U) { openPicker('sky'); return true; }
      if (!st.inside) return false;
      var L2 = hookWorld('hook_lift'); if (near(p, L2, 14)) { openPicker('bazaar'); return true; }
      var C = hookWorld('hook_line_colosseum'), CW = root.COLOSSEUM_WORLD;
      if (near(p, C, 12) && CW) { var dx = CW.door[0] + CW.front[0] * 30 * U, dz = CW.door[1] + CW.front[1] * 30 * U; trainRide('colosseum', { x: dx, y: o.heightAt ? o.heightAt(dx, dz) : 0, z: dz, inside: false }, 'Colosseum Line — next stop: the Colosseum'); return true; }
      var Wl = hookWorld('hook_line_undersea');
      if (near(p, Wl, 12)) {
        var T = (root.__worldTransitApi && root.__worldTransitApi.stations || []).filter(function (s) { return s.realm === 'ocean' && s.group; })[0];
        if (T) { var tp = T.group.position; trainRide('undersea', { x: tp.x + 12 * U, y: o.heightAt ? o.heightAt(tp.x + 12 * U, tp.z) : tp.y, z: tp.z, inside: false }, 'Undersea Line — through the reef tube to the Harbor'); return true; }
      }
      return false;
    }
    addEventListener('keydown', function (e) { if (e.code !== 'KeyE' || e.repeat || cine.on) return; if (use()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    // floor + solids inside the cavern (metres in cavern space)
    (root.__groundHooks = root.__groundHooks || []).push(function (p) {
      if (!st.inside) return null;
      var lx = (p.x - A.x) / U, lz = (p.z - A.z) / U, r = Math.hypot(lx, lz), wr = st.wallR - 3;
      var stx = lx < -wr + 2 && Math.abs(lz) < 40 && lx > -wr - 122;                                  // station hall (west, beyond the wall)
      if (!stx && r > wr) { lx *= wr / r; lz *= wr / r; }
      // v02 station: the island platform (|y| < 24.6 between x ST_X0..ST_X1, 1.3 m) and its stairs (8 m, |y| < 12) down to the cavern;
      // the two track trenches either side are off limits (trains only)
      var SXm = -(st.wallR + 2), STX0 = SXm - 112, STX1 = SXm - 6, onStairs = false, stairH = 0;
      if (stx || (lx < STX1 + 8 && lx > STX0 - 2 && Math.abs(lz) < 42)) {
        if (lx >= STX1 && lx < STX1 + 8 && Math.abs(lz) < 12) { onStairs = true; stairH = 1.3 * (1 - (lx - STX1) / 8); }
        else if (lx < STX1) { lz = Math.max(-24, Math.min(24, lz)); lx = Math.max(STX0 + 1, lx); stx = true; }
      }
      if (st.inPit) {   // inside the pyramid: the fight hall (|x| < 47, z 18..102 game = Blender y -102..-18) + the corridor to the door
        var inHall = Math.abs(lx) < 47 && lz > 15 && lz < 105, inCor = Math.abs(lx) < 3.6 && lz >= 105 && lz < 130;
        if (!inHall && !inCor) { lx = Math.max(-46, Math.min(46, lx)); lz = Math.max(16, Math.min(129, lz)); if (lz >= 105) lx = Math.max(-3.5, Math.min(3.5, lx)); }
        p.x = A.x + lx * U; p.z = A.z + lz * U; return BY + 0.06 * U;
      }
      var PB = 132; if (Math.abs(lx) < PB && Math.abs(lz) < PB) { if (Math.abs(lx) > Math.abs(lz)) lx = lx < 0 ? -PB : PB; else lz = lz < 0 ? -PB : PB; }   // pyramid base is solid (K32: base 260 m)
      var rr = Math.hypot(lx, lz), ang = Math.atan2(lz, lx), onBridge = false;
      for (var k = 0; k < 4; k++) { var d = Math.abs(Math.atan2(Math.sin(ang - (k * Math.PI / 2 + Math.PI / 4)), Math.cos(ang - (k * Math.PI / 2 + Math.PI / 4)))); if (d * rr < 7) onBridge = true; }
      if (!onBridge && rr > 191 && rr < 221) { var to = rr < 206 ? 191 : 221; lx *= to / rr; lz *= to / rr; }   // canal (192-220 m): walk the bridges
      p.x = A.x + lx * U; p.z = A.z + lz * U;
      var onArrival = lx > railX(0) - 2 && lx < railX(0) + 22 && Math.abs(lz) < 14;                        // v02 arrival platform (1 m tall)
      return BY + (onBridge && rr > 190 && rr < 222 ? 2.0 * U * Math.sin(Math.PI * (rr - 190) / 32) : 0) + (onStairs ? stairH * U : (stx ? 1.3 * U : 0)) + (onArrival ? 1.0 * U : 0);
    });
    (root.__groundAtHooks = root.__groundAtHooks || []).push(function (x, z) { return st.inside ? BY : null; });   // controller floor in the cavern
    (root.__groundHooks = root.__groundHooks || []).push(function (p) {   // surface: the gap is railed; the four diagonal bridges lead onto the capstone
      if (st.inside || cine.on) return null; var dx = (p.x - A.x) / U, dz = (p.z - A.z) / U, r = Math.hypot(dx, dz);
      if (r > GAP_M + 1.2 || Math.abs(p.y - gy) > 30 * U) return null;
      var onTop = Math.abs(dx) < TOP_HALF_M - 0.4 && Math.abs(dz) < TOP_HALF_M - 0.4, ang = Math.atan2(-dz, dx), onBr = false;
      for (var k = 0; k < 4; k++) { var dA = Math.atan2(Math.sin(ang - (k * Math.PI / 2 + Math.PI / 4)), Math.cos(ang - (k * Math.PI / 2 + Math.PI / 4))); if (Math.abs(dA) * Math.max(r, 1) < BRIDGE_W_M / 2 - 0.3 && Math.abs(dA) < 0.6) onBr = true; }
      if (onTop || onBr) return null;
      var R = GAP_M + 1.2, s = r < 1e-3 ? 1 : r;
      if (r > TOP_HALF_M * 1.2) { p.x = A.x + dx / s * R * U; p.z = A.z + dz / s * R * U; }                // in the gap ring: back behind the rail
      else { p.x = A.x + Math.max(-TOP_HALF_M + 0.5, Math.min(TOP_HALF_M - 0.5, dx)) * U; p.z = A.z + Math.max(-TOP_HALF_M + 0.5, Math.min(TOP_HALF_M - 0.5, dz)) * U; }   // a corner sliver: onto the top
      return null;
    });
    var nearT = 0, scanT = -1e9, scansAfter = 0, t0Scan = null;
    function tick(t) {
      if (t - nearT > 0.5) {
        nearT = t; if (!holeSet) cutHole();
        // the plaza is built in slices AFTER spawn (can be minutes on slow machines): scan every 4 s until the marketplace exists, then
        // a few more passes for late pieces; give up after 15 min. Each pass only looks at meshes it has not seen (userData.__bzSeen).
        if (t0Scan == null) t0Scan = t;
        if (scansAfter < 4 && t - t0Scan < 900 && t - scanT > 4) { scanT = t; var had = monumentDone; hideMonument(); patchGround(); if (had || monumentDone) scansAfter++; }
        var pp = o.getPlayer && o.getPlayer(); var near_ = pp && Math.hypot(pp.x - A.x, pp.z - A.z) < 900 * U;
        if (!cine.on) group.visible = st.inside || !!near_;
      }
      if (st.inside && st.water) st.water.opacity = 0.8 + 0.05 * Math.sin(t * 1.3);
      var pulse = 0.6 + 0.08 * Math.sin(t * 2); glow.color.setHSL(0.11, 1, pulse); dRing.material.color.setHSL(0.11, 1, pulse);
    }
    return ready.then(function (ok) {
      var api = { group: group, surface: surf, car: car, tick: tick, use: use, ride: inclineRide, isInside: function () { return st.inside; },
        _train: function (line) { var p = o.getPlayer && o.getPlayer(); trainRide(line || 'colosseum', { x: p ? p.x : A.x, y: p ? p.y : gy, z: p ? p.z : A.z, inside: st.inside }, 'test'); },   // debug / probes
        _trainSeek: function (k) { if (tr.on) { tr.holdK = k >= 1 ? null : k; if (k >= 1) tr.t0 = performance.now() - TRAIN_S * 1000; } },
        _cineSeek: function (k) { if (cine.on) { cine.holdK = k; if (k >= 1) cine.holdK = null, cine.t0 = performance.now() - RIDE_S * 1000; } },   // debug / probes: freeze the ride at fraction k (>= 1 ends it)
        stats: function () { return { loaded: ok, hooks: Object.keys(st.hooks), inside: st.inside, depthM: DEPTH_M, holes: HOLES.length, groundPatched: patched, monumentHidden: monumentDone }; } };
      root.__bazaar = api; return api;
    });
  }
  root.WorldUndergroundBazaar = { build: build };
})(typeof window !== 'undefined' ? window : this);
