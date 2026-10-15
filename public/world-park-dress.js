/* world-park-dress.js — HOVERSKATE PARK v2 dressing from the Blender kit K25 (2026-10-15, owner skate-park ref: gold-lantern torii gate,
 * stands round the bowl, lane lights, glowing rim). Pure set dressing on top of the code-built park (world-hoverpark-v2.js): nothing here
 * is ridden; the stands and gate pillars are solid only through the park's own colliders (none added).
 *
 *   WorldParkDress.dress({ THREE, GLTFLoader, park, base?, layout? }) -> Promise<{ group, stats }>
 *     park = the object WorldHoverPark.build() returned (its .group is the park root at deck height, yawed toward the city).
 * Placements: /assets/world/park-dress-v2.json — park-local METRES, three frame, yaw = rotation.y, y null = deck (Blender preview used
 * deck = 1.2 m, so explicit y values are given relative to that and shifted here). One InstancedMesh per piece primitive: 132 pieces,
 * ~27 draws. Missing GLB / JSON = nothing happens. ?parkdress=0 = off.
 * v2 (same day): + K25b MATRIX WALLS (curved rim walls, protruding fins, abstract facet walls) - code-rain shader on their panels, their
 * ride faces returned as `walls` (world units) for the hoverboard wall rides, circle colliders along their cores.
 */
(function (root) {
  'use strict';
  var DECK_M = 1.2;
  function load(loader, url) { return new Promise(function (res) { loader.load(url, res, undefined, function () { console.warn('[park-dress] missing', url); res(null); }); }); }
  function getJSON(url) { return (root.fetch ? root.fetch(url).then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null)).catch(function () { return null; }); }

  /* pure: JSON pieces -> { name: [{x, y, z, yaw}] } in park-local metres with the deck at y = 0 */
  /* wall cores for colliders (piece-local metres): the curved wall's middle (0.8 m behind its ride face), fin + facet centre lines */
  var CORE = {
    wall_curve: { line: (function () { var o = [], R = 150.8, A = 40 / 150; for (var k = 0; k <= 20; k++) { var f = -A / 2 + A * k / 20; o.push([R * Math.sin(f), 150 - R * Math.cos(f)]); } return o; })(), r: 1.05, step: 2.1 },
    wall_fin: { line: [[0, 0], [0, 10]], r: 1.2, step: 2 },
    wall_facet: { line: [[-14, 0], [14, 0]], r: 0.75, step: 1.5 }
  };

  /* MATRIX code rain on the wall panels (owner ref 2026-10-15): world-space UVs (the kit has none), glyph sheet scrolling down,
     brand-green emissive over near-black. One material shared by every wall; time advances in onBeforeRender (no host hook). */
  var _mx = null;
  function matrixMat(THREE, U) {
    if (_mx) return _mx;
    var tex = new THREE.TextureLoader().load('/assets/textures/matrix_glyphs.webp'); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    var uni = { tGlyph: { value: tex }, uTime: { value: 0 }, uTile: { value: new THREE.Vector2(8 * U, 16 * U) } };
    var m = new THREE.MeshStandardMaterial({ color: 0x030806, roughness: 0.25, metalness: 0.7, emissive: 0xffffff });
    m.name = 'wall_matrix';
    m.onBeforeCompile = function (sh) {
      for (var k in uni) sh.uniforms[k] = uni[k];
      sh.vertexShader = 'varying vec3 vMxP; varying vec3 vMxN;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>', '  vec4 mxp = vec4(transformed, 1.0); vec3 mxn = objectNormal;',
        '#ifdef USE_INSTANCING', '  mxp = instanceMatrix * mxp; mxn = mat3(instanceMatrix) * mxn;', '#endif',
        '  vMxP = (modelMatrix * mxp).xyz; vMxN = normalize(mat3(modelMatrix) * mxn);'].join('\n'));
      sh.fragmentShader = 'varying vec3 vMxP; varying vec3 vMxN; uniform sampler2D tGlyph; uniform float uTime; uniform vec2 uTile;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '  { float mu = abs(vMxN.x) > abs(vMxN.z) ? vMxP.z : vMxP.x;',
        '    vec3 g1 = texture2D(tGlyph, vec2(mu / uTile.x, vMxP.y / uTile.y + uTime * 0.22)).rgb;',
        '    vec3 g2 = texture2D(tGlyph, vec2(mu / uTile.x * 1.7 + 0.31, vMxP.y / uTile.y * 1.7 + uTime * 0.37)).rgb;',
        '    totalEmissiveRadiance = (g1 * 1.9 + g2 * 0.7) * vec3(0.55, 1.0, 0.7); }'].join('\n'));
    };
    m.customProgramCacheKey = function () { return 'wall-matrix-v1'; };
    m.userData.tick = function () { uni.uTime.value = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; };
    m.userData.uniforms = uni;
    return (_mx = m);
  }

  function plan(J) {
    var out = {};
    (J && J.pieces || []).forEach(function (p) {
      var y = p[4] == null ? 0 : (+p[4] - DECK_M);
      (out[p[0]] = out[p[0]] || []).push({ x: +p[1], y: y, z: +p[2], yaw: +p[3] });
    });
    return out;
  }

  function dress(o) {
    var THREE = o.THREE, base = o.base || '/assets/kits/', park = o.park;
    if (!park || !park.group || (root.location && /[?&]parkdress=0/.test(root.location.search || ''))) return Promise.resolve(null);
    var U = park.U || o.U || 7 / 1.8;
    return Promise.all([load(new o.GLTFLoader(), base + 'shaddai_park_dress_v01.glb'), o.layout ? Promise.resolve(o.layout) : getJSON('/assets/world/park-dress-v2.json')]).then(function (r) {
      var gl = r[0], J = r[1]; if (!gl || !J) return null;
      var g = new THREE.Group(); g.name = 'park-dress'; g.scale.setScalar(U); park.group.add(g);
      var nodes = {}; gl.scene.updateMatrixWorld(true);
      gl.scene.traverse(function (n) { if (/^(park|wall)_[a-z]+$/.test(n.name) && !nodes[n.name]) nodes[n.name] = n; });
      var P = plan(J), stats = { pieces: 0, instancedMeshes: 0 }, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
      Object.keys(P).forEach(function (name) {
        var nd = nodes[name], list = P[name]; if (!nd) return;
        var inv = new THREE.Matrix4().copy(nd.matrixWorld).invert();
        nd.traverse(function (mesh) {
          if (!mesh.isMesh) return;
          var local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
          var mat = mesh.material && mesh.material.name === 'wall_panel' ? matrixMat(THREE, U) : mesh.material;
          var im = new THREE.InstancedMesh(mesh.geometry, mat, list.length); im.name = 'parkdress-' + name;
          if (mat.userData.tick) im.onBeforeRender = mat.userData.tick;
          list.forEach(function (p, i) { m4.compose(pv.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), one); im.setMatrixAt(i, m4.multiply(local)); });
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); g.add(im); stats.instancedMeshes++;
        });
        stats.pieces += list.length;
      });
      // RIDEABLE WALL FACES (world units) for the hoverboard wall rides + circle colliders along each wall's core line
      park.group.updateMatrixWorld(true); var W = [], C = [], M = g.matrixWorld, v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), sY = new THREE.Vector3().setFromMatrixScale(M).y;
      var faces = J.faces || {};
      Object.keys(P).forEach(function (name) {
        var F = faces[name], core = CORE[name]; if (!nodes[name] || (!F && !core)) return;
        P[name].forEach(function (p) {
          var cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
          var at = function (lx, lz, ly, out) { return out.set(p.x + lx * cy + lz * sy, p.y + ly, p.z - lx * sy + lz * cy).applyMatrix4(M); };
          for (var f = 0; F && f < F.length; f += 2) {
            var line = F[f], yr = F[f + 1];
            for (var k = 0; k + 1 < line.length; k++) {
              at(line[k][0], line[k][1], yr[0], v3); at(line[k + 1][0], line[k + 1][1], yr[0], v4);
              W.push({ x0: v3.x, z0: v3.z, x1: v4.x, z1: v4.z, y0: v3.y, y1: v3.y + (yr[1] - yr[0]) * sY });
            }
          }
          if (core) for (var c = 0; c + 1 < core.line.length; c++) {
            var a = core.line[c], b = core.line[c + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / core.step));
            for (var j = c ? 1 : 0; j <= n; j++) { var u = j / n; at(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0, v3); C.push({ x: Math.round(v3.x), z: Math.round(v3.z), r: Math.max(1, Math.round(core.r * U)), label: 'parkwall:' + name }); }
          }
        });
      });
      var L = root.WORLD_LAYOUT; if (C.length && L && L.realmColliders) { C.forEach(function (c) { L.realmColliders.push(c); }); if (root.buildWorldCollision) { try { root.buildWorldCollision(L); } catch (e) { console.warn('[park-dress] collision', e && e.message); } } }
      stats.walls = W.length; stats.colliders = C.length;
      console.info('[park-dress]', stats);
      return { group: g, stats: stats, walls: W };
    });
  }

  root.WorldParkDress = { dress: dress, _plan: plan, DECK_M: DECK_M };
})(typeof window !== 'undefined' ? window : globalThis);
