/* world-biome-scatter.js — forests, desert and mountain dress for the realms (owner 2026-10-23: "there should be a forest in the green and
 * desert in the sand mountains and terrain in the mountains"). Data: /assets/world/biome-scatter-v1.json (tools/gen-biome-scatter.cjs).
 *
 *   window.WorldBiomeScatter.build({ THREE, scene, heightAt, getPlayer }) -> Promise<{ group, stats }>
 *
 * Code-built low-poly species (no downloads), vertex-coloured, each ~20-60 triangles; realm tech fusion = a faint glow band / glowing tips.
 * Perf: one InstancedMesh per species per 1200 m chunk; chunks beyond VIEW_M of the player are hidden (checked twice a second).
 * ?biomescatter=0 = off. Same species shapes are mirrored in tools/blender/realm_finish_to_blender.py (scene REALM_VIEW).
 */
(function (root) {
  'use strict';
  var DATA = '/assets/world/biome-scatter-v1.json?v=20261023b', CH = 1200, VIEW_M = 1700;
  function protos(THREE) {
    var C = THREE.Color;
    function part(geo, hex, emis) { var g = geo.toNonIndexed(), n = g.attributes.position.count, c = new C(hex), arr = new Float32Array(n * 3), e = new Float32Array(n);
      for (var i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; e[i] = emis || 0; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(e, 1)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
    function at(g, x, y, z) { g.translate(x, y, z); return g; }
    function merge(parts) { var n = 0; parts.forEach(function (p) { n += p.attributes.position.count; }); var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), gl = new Float32Array(n), o = 0;
      parts.forEach(function (p) { p.computeVertexNormals(); pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); gl.set(p.attributes.aGlow.array, o); o += p.attributes.position.count; });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1)); g.computeBoundingSphere(); return g; }
    var trunk = 0x4a3426, P = {};
    // metres; origin at the ground
    P.pine = merge([part(at(new THREE.CylinderGeometry(0.35, 0.5, 4, 6), 0, 2, 0), trunk), part(at(new THREE.ConeGeometry(3.6, 6, 7), 0, 6, 0), 0x1f4a2c), part(at(new THREE.ConeGeometry(2.8, 5, 7), 0, 9.5, 0), 0x245633), part(at(new THREE.ConeGeometry(1.8, 4, 7), 0, 12.5, 0), 0x2b6a3c), part(at(new THREE.TorusGeometry(2.2, 0.08, 4, 14).rotateX(Math.PI / 2), 0, 7.6, 0), 0x7dffb0, 1)]);
    P.snowpine = merge([part(at(new THREE.CylinderGeometry(0.35, 0.5, 4, 6), 0, 2, 0), trunk), part(at(new THREE.ConeGeometry(3.4, 6, 7), 0, 6, 0), 0x2a4a3e), part(at(new THREE.ConeGeometry(2.6, 5, 7), 0, 9.5, 0), 0xdfeaf2), part(at(new THREE.ConeGeometry(1.7, 4, 7), 0, 12.5, 0), 0xf4f8fc)]);
    P.broad = merge([part(at(new THREE.CylinderGeometry(0.4, 0.6, 5, 6), 0, 2.5, 0), trunk), part(at(new THREE.IcosahedronGeometry(3.8, 0), 0, 7.5, 0), 0x3d7a34), part(at(new THREE.IcosahedronGeometry(2.6, 0), 1.8, 9, 0.8), 0x4c8f3e), part(at(new THREE.IcosahedronGeometry(2.4, 0), -1.6, 8.6, -1), 0x356d2e)]);
    P.shrub = merge([part(at(new THREE.IcosahedronGeometry(1.1, 0), 0, 0.7, 0), 0x6b7a3a), part(at(new THREE.IcosahedronGeometry(0.8, 0), 0.7, 0.6, 0.3), 0x7f8c44)]);
    P.hoodoo = merge([part(at(new THREE.CylinderGeometry(2.2, 3.2, 6, 7), 0, 3, 0), 0xb5793f), part(at(new THREE.CylinderGeometry(1.6, 2.2, 5, 7), 0, 8.5, 0), 0xc98a4c), part(at(new THREE.CylinderGeometry(2.6, 1.5, 1.6, 7), 0, 11.8, 0), 0x9a5f30), part(at(new THREE.TorusGeometry(2.0, 0.07, 4, 14).rotateX(Math.PI / 2), 0, 6.2, 0), 0xffc94a, 1)]);
    P.crystal = merge([part(at(new THREE.ConeGeometry(0.9, 6, 6), 0, 3, 0), 0x8fe6ff, 0.8), part(at(new THREE.ConeGeometry(0.6, 4, 6).rotateZ(0.35), 0.9, 1.8, 0.2), 0xb38cff, 0.8), part(at(new THREE.ConeGeometry(0.5, 3, 6).rotateZ(-0.4), -0.8, 1.4, -0.3), 0x8fe6ff, 0.8)]);
    P.boulder = merge([part(at(new THREE.DodecahedronGeometry(2.2, 0).scale(1.3, 0.75, 1), 0, 1.0, 0), 0x6e6a66), part(at(new THREE.DodecahedronGeometry(1.2, 0), 1.9, 0.6, 0.8), 0x7d7872)]);
    P.lavarock = merge([part(at(new THREE.DodecahedronGeometry(2.0, 0).scale(1.2, 0.8, 1.1), 0, 1.0, 0), 0x2a1a14), part(at(new THREE.TorusGeometry(1.6, 0.09, 3, 10).rotateX(Math.PI / 2), 0, 1.15, 0), 0xff5a10, 1)]);
    var arch = new THREE.TorusGeometry(46, 9, 6, 18, Math.PI); arch.scale(1, 1, 0.8);
    P.arch = merge([part(arch, 0xb8763c), part(at(new THREE.CylinderGeometry(11, 14, 6, 8), 46, 0, 0), 0x9a5f30), part(at(new THREE.CylinderGeometry(11, 14, 6, 8), -46, 0, 0), 0x9a5f30)]);
    return P;
  }
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]biomescatter=0\b/.test(location.search)) return Promise.resolve(null);
    var THREE = o.THREE, PM = 7 / 1.8, H = o.heightAt || function () { return 0; };
    var group = new THREE.Group(); group.name = 'biome-scatter'; o.scene.add(group);
    var stats = { items: 0, meshes: 0 };
    return fetch(DATA).then(function (r) { return r.json(); }).then(function (D) {
      var P = protos(THREE), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, flatShading: true });
      mat.onBeforeCompile = function (sh) {   // aGlow: per-vertex emissive (glow bands, crystal flora, lava cracks) without a second material
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.6;');
      };
      var buckets = {};   // species|chunk -> list
      D.items.forEach(function (e) { var k = e[0] + '|' + Math.floor(e[1] / CH) + ',' + Math.floor(e[2] / CH); (buckets[k] = buckets[k] || []).push(e); });
      var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3(), chunks = [];
      Object.keys(buckets).forEach(function (k) {
        var sp = k.split('|')[0], list = buckets[k], geo = P[sp]; if (!geo) return;
        var im = new THREE.InstancedMesh(geo, mat, list.length); im.name = 'scatter-' + sp; im.castShadow = sp !== 'shrub'; im.receiveShadow = true;
        var cx = 0, cz = 0;
        list.forEach(function (e, i) { var x = e[1] * PM, z = e[2] * PM; cx += x; cz += z; m4.compose(v.set(x, H(x, z) - 0.3 * PM, z), q.setFromAxisAngle(up, e[4] * Math.PI / 180), s.setScalar(e[3] * PM)); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im); stats.meshes++; stats.items += list.length;
        chunks.push({ m: im, x: cx / list.length, z: cz / list.length });
      });
      var R2 = Math.pow((VIEW_M + CH * 0.7) * PM, 2);
      function cull() { var p = o.getPlayer && o.getPlayer(); if (!p) return; for (var i = 0; i < chunks.length; i++) { var c = chunks[i], dx = c.x - p.x, dz = c.z - p.z; c.m.visible = dx * dx + dz * dz < R2; } }
      cull(); setInterval(cull, 500);
      root.__biomeScatter = { group: group, stats: stats };
      console.info('[biome-scatter]', stats);
      return { group: group, stats: stats };
    }).catch(function (e) { console.warn('[biome-scatter]', e && e.message); return null; });
  }
  root.WorldBiomeScatter = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
