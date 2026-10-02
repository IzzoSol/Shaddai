/* world-grass.js — REAL GRASS (owner 2026-10-01: "real grass and movement"): ONE InstancedMesh of 3-blade tufts around the player, swaying in the wind and bending away from you as you walk through it.
 *   Placement is CELL-HASHED (a cell always grows the same tuft), so nothing pops or reshuffles as you move; tufts shrink to nothing at the edge of the ring. Rebuilt only when you move > 6 m.
 *   Grows only where allow(x, z) says so (host: meadow biomes), on land (not water), on gentle slopes. Lit by the scene lights (Lambert), so day/night/fires colour it for free.
 *   Cost: 1 draw call, ~3 triangles per tuft; quality tier sets the count (HIGH 7000 / MEDIUM 4200 / LOW 2200 / POTATO 0).
 *
 *   var grass = buildWorldGrass({ THREE, scene, heightAt, getPlayer, allow?, waterAt?, U?, quality? })
 *   grass.update(dt)  ·  grass.setQuality('HIGH'|'MEDIUM'|'LOW'|'POTATO')  ·  grass.stats() -> { tufts, quality }  ·  grass.dispose()
 * Pure helpers (tested): hash2 · tuftFor(cx, cz) · edgeScale(d, R) · QUALITY
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, QUALITY = { HIGH: 7000, MEDIUM: 4200, LOW: 2200, POTATO: 0 }, R_M = 34, CELL_M = 0.9, REBUILD_M = 6;
  function hash2(x, z) { var h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; h = h ^ (h >>> 16); return (h >>> 0) / 4294967296; }
  function tuftFor(cx, cz) {   // deterministic per cell: does it grow here, where in the cell, how tall, which way, what tint
    var a = hash2(cx, cz), b = hash2(cz + 91, cx - 17), c = hash2(cx * 7 + 3, cz * 13 - 5), d = hash2(cx - 40, cz + 77);
    return { keep: a < 0.62, dx: b, dz: c, rot: d * Math.PI * 2, scale: 0.7 + hash2(cx + 5, cz + 9) * 0.7, tint: hash2(cx + 31, cz - 3) };
  }
  function edgeScale(d, R) { var t = Math.max(0, Math.min(1, (R - d) / (R * 0.25))); return t * t * (3 - 2 * t); }

  function tuftGeometry(THREE, U) {   // 3 tapered blades at 60 degrees; colour darkens to the root
    var pos = [], col = [], uv = [], H = 0.9 * U, W = 0.07 * U;
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI / 3, cx = Math.cos(a), sz = Math.sin(a);
      var v = [[-W * cx, 0, -W * sz, 0, 0], [W * cx, 0, W * sz, 1, 0], [0, H, 0, 0.5, 1]];
      v.forEach(function (p) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); var k = 0.35 + 0.65 * p[4]; col.push(k * 0.8, k, k * 0.7); });
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    var n = g.attributes.normal; for (var k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);   // lit from above like the ground, not per-blade
    return g;
  }

  /* WHERE grass grows = where the terrain's own ground-colour map is green. pixels: RGBA Uint8 array of an n x n image (row 0 = north, col 0 = west, like color.jpg).
   * Returns allow(x, z): world units, half = terrain half-extent in units. Green means g clearly above r and b and bright enough (snow, sand, lava, asphalt and water are not). */
  function greenMask(pixels, n, half) {
    var m = new Uint8Array(n * n), i, r, g, b, nG = 0;
    for (i = 0; i < n * n; i++) { r = pixels[i * 4]; g = pixels[i * 4 + 1]; b = pixels[i * 4 + 2]; if (g > 55 && g > r * 1.08 && g > b * 1.15) { m[i] = 1; nG++; } }
    var fn = function (x, z) { var cx = Math.round((x + half) / (2 * half) * (n - 1)), cz = Math.round((z + half) / (2 * half) * (n - 1)); if (cx < 0 || cz < 0 || cx >= n || cz >= n) return false; return m[cz * n + cx] === 1; };
    fn.coverage = nG / (n * n); return fn;
  }
  function loadGreenMask(url, half, n) {   // browser: decode + downscale the colour map once (no huge pixel buffers), resolve allow(x,z)
    n = n || 256; return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined' || typeof Image === 'undefined') return reject(new Error('no DOM'));
      var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { try { var cv = document.createElement('canvas'); cv.width = cv.height = n; var g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, n, n); resolve(greenMask(g.getImageData(0, 0, n, n).data, n, half)); im.src = ''; } catch (e) { reject(e); } }; im.onerror = function () { reject(new Error('colour map failed to load')); }; im.src = url;
    });
  }

  function buildWorldGrass(o) {
    var THREE = o.THREE, U = o.U || U0, R = R_M * U, CELL = CELL_M * U, heightAt = o.heightAt, allow = o.allow || function () { return true; }, waterAt = o.waterAt || null;
    var qName = o.quality || 'MEDIUM', cap = QUALITY[qName] != null ? QUALITY[qName] : QUALITY.MEDIUM;
    var uniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(1e9, 0, 1e9) }, uWind: { value: 1 }, uPush: { value: 1.6 * U } };
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uPlayer = uniforms.uPlayer; sh.uniforms.uWind = uniforms.uWind; sh.uniforms.uPush = uniforms.uPush;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uPlayer; uniform float uWind; uniform float uPush;')
        .replace('#include <project_vertex>',
          'vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);\n' +
          '  vec3 gb = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float gh = clamp(position.y / ' + (0.9 * U).toFixed(3) + ', 0.0, 1.0); float gk = gh * gh;\n' +
          '  float gust = sin(uTime * 0.7 + gb.x * 0.045 + gb.z * 0.03) * 0.5 + 0.5;\n' +
          '  float sw = sin(uTime * 1.9 + gb.x * 0.31 + gb.z * 0.23) * 0.55 + sin(uTime * 3.1 + gb.z * 0.5) * 0.18;\n' +
          '  mvPosition.x += (sw * (0.35 + gust * 0.65)) * ' + (0.3 * U).toFixed(3) + ' * gk * uWind;\n' +
          '  mvPosition.z += (cos(uTime * 1.5 + gb.x * 0.2) * 0.3 * (0.3 + gust * 0.7)) * ' + (0.2 * U).toFixed(3) + ' * gk * uWind;\n' +
          '  vec2 away = gb.xz - uPlayer.xz; float pd = length(away); float push = smoothstep(uPush * 2.2, 0.0, pd) * gk; vec2 pdir = away / max(pd, 0.001);\n' +
          '  mvPosition.x += pdir.x * push * ' + (0.8 * U).toFixed(3) + '; mvPosition.z += pdir.y * push * ' + (0.8 * U).toFixed(3) + '; mvPosition.y -= push * ' + (0.35 * U).toFixed(3) + ' * gh;\n' +
          '  mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;');
    };
    var geo = tuftGeometry(THREE, U), mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, QUALITY.HIGH)); mesh.name = 'world-grass'; mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false; o.scene.add(mesh);
    var cA = new THREE.Color(0x4f7d2a), cB = new THREE.Color(0xb7c24a), tmp = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    var lastX = 1e9, lastZ = 1e9, count = 0, time = 0;
    function slopeOk(x, z, y) { var e = 2 * U; return Math.abs(heightAt(x + e, z) - y) < 1.1 * e && Math.abs(heightAt(x, z + e) - y) < 1.1 * e; }
    function rebuild(px, pz) {
      count = 0; var i0 = Math.floor((px - R) / CELL), i1 = Math.floor((px + R) / CELL), j0 = Math.floor((pz - R) / CELL), j1 = Math.floor((pz + R) / CELL), pick = [];
      for (var i = i0; i <= i1 && cap > 0; i++) for (var j = j0; j <= j1; j++) {
        var t = tuftFor(i, j); if (!t.keep) continue; var x = (i + t.dx) * CELL, z = (j + t.dz) * CELL, d = Math.hypot(x - px, z - pz); if (d >= R) continue;
        pick.push({ x: x, z: z, d: d, t: t });
      }
      if (pick.length > cap) { pick.sort(function (a, b) { return a.d - b.d; }); pick.length = cap; }   // nearest first when over budget
      for (var k = 0; k < pick.length; k++) {
        var p = pick[k], y = heightAt(p.x, p.z); if (!allow(p.x, p.z) || (waterAt && waterAt(p.x, p.z) != null && waterAt(p.x, p.z) > y - 0.2 * U) || !slopeOk(p.x, p.z, y)) continue;
        var s = p.t.scale * edgeScale(p.d, R); if (s < 0.05) continue; q.setFromAxisAngle(up, p.t.rot); sc.set(s, s, s); pv.set(p.x, y, p.z); m4.compose(pv, q, sc); mesh.setMatrixAt(count, m4);
        tmp.copy(cA).lerp(cB, p.t.tint * 0.8); mesh.setColorAt(count, tmp); count++;
      }
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; lastX = px; lastZ = pz;
    }
    function update(dt) {
      time += dt; uniforms.uTime.value = time; var pl = o.getPlayer && o.getPlayer(); if (!pl || !pl.pos) return; uniforms.uPlayer.value.set(pl.pos.x, pl.pos.y, pl.pos.z);
      if (cap > 0 && Math.hypot(pl.pos.x - lastX, pl.pos.z - lastZ) > REBUILD_M * U) rebuild(pl.pos.x, pl.pos.z);
    }
    function setQuality(n) { if (QUALITY[n] == null) return; qName = n; cap = QUALITY[n]; lastX = 1e9; if (cap === 0) { mesh.count = 0; count = 0; } }
    return { mesh: mesh, uniforms: uniforms, update: update, setQuality: setQuality, rebuild: rebuild, stats: function () { return { tufts: count, quality: qName, cap: cap }; }, setWind: function (k) { uniforms.uWind.value = k; }, dispose: function () { o.scene.remove(mesh); geo.dispose(); mat.dispose(); } };
  }
  root.buildWorldGrass = buildWorldGrass; root.WorldGrass = { greenMask: greenMask, loadGreenMask: loadGreenMask, hash2: hash2, tuftFor: tuftFor, edgeScale: edgeScale, QUALITY: QUALITY, R_M: R_M, CELL_M: CELL_M };
})(typeof window !== 'undefined' ? window : globalThis);
