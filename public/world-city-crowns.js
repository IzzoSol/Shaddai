/* world-city-crowns.js — per-district rooftop architecture for the Grid (owner 2026-10-23: "you just added the tower on the top of the square
 * building ... add cool design architecture and different per city section, building tops some round"). TURTLE district language:
 *   FORGE (burnt copper #C43E00): energy halo rings, stepped steel setbacks, cantilevered pod-labs with glowing vents
 *   TRADE (sapphire #0066B2): glass-capped domes, sky-garden terraces, standing "coin" tori
 *   RESIDENTIAL (sage #4A7C59): living domes, wave pods, mini-dome pavilions      ATHENAEUM (gold): domes + coins
 * Built from primitives in unit space (footprint 1 x 1, origin on the roof centre) and instanced: ONE InstancedMesh per crown type for the whole
 * city (~9 draw calls). Each building picks a crown by a stable hash of its position, so the skyline varies but never reshuffles.
 *   WorldCityCrowns.build({ THREE, parent, reqs: [{ d: district, x, y (roof top), z, w, dz, yaw }] }) -> { group, stats }
 * ?crowns=0 = off. Mirrored for Blender by tools/blender/city_crowns_to_blender.py (same types + hash).
 */
(function (root) {
  'use strict';
  var ACCENT = { forge: 0xc43e00, trade: 0x0066b2, residential: 0x4a7c59, athenaeum: 0xe8c45c };
  var TYPES = { forge: ['halo', 'setback', 'pods'], trade: ['dome', 'garden', 'coin'], residential: ['livingdome', 'wave', 'pavilion'], athenaeum: ['dome', 'coin', 'garden'] };
  function hash(x, z) { var h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); }
  function pick(d, x, z) { var T = TYPES[d] || TYPES.trade; return T[Math.floor(hash(x, z) * T.length) % T.length]; }
  function geos(THREE) {
    var C = THREE.Color;
    function part(g, hex, glow) { g = g.index ? g.toNonIndexed() : g; var n = g.attributes.position.count, c = new C(hex), col = new Float32Array(n * 3), gl = new Float32Array(n);
      for (var i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow ? 1 : 0; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1)); if (g.attributes.uv) g.deleteAttribute('uv'); g.computeVertexNormals(); return g; }
    function merge(list) { var n = 0; list.forEach(function (p) { n += p.attributes.position.count; }); var P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3), G = new Float32Array(n), o = 0;
      list.forEach(function (p) { P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); Cc.set(p.attributes.color.array, o * 3); G.set(p.attributes.aGlow.array, o); o += p.attributes.position.count; });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(G, 1)); g.computeBoundingSphere(); return g; }
    function box(sx, sy, sz, x, y, z, hex, glow) { var g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y + sy / 2, z); return part(g, hex, glow); }
    function cyl(r1, r2, h, x, y, z, hex, glow, seg) { var g = new THREE.CylinderGeometry(r2, r1, h, seg || 20); g.translate(x, y + h / 2, z); return part(g, hex, glow); }
    function tor(R, r, y, hex, glow, standing) { var g = new THREE.TorusGeometry(R, r, 6, 32); if (!standing) g.rotateX(Math.PI / 2); g.translate(0, y, 0); return part(g, hex, glow); }
    function dome(r, y, hex, glow) { var g = new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(0, y, 0); return part(g, hex, glow); }
    var W = 0xe9edf1, S = 0x3a414b, GL = 0x9fd4f0, GR = 0x3f8a4f, WOOD = 0xa8754a, out = {};
    Object.keys(ACCENT).forEach(function (d) {
      var A = ACCENT[d], k = d + ':';
      out[k + 'halo'] = merge([box(0.04, 0.32, 0.04, -0.3, 0, -0.3, S), box(0.04, 0.32, 0.04, 0.3, 0, -0.3, S), box(0.04, 0.32, 0.04, -0.3, 0, 0.3, S), box(0.04, 0.32, 0.04, 0.3, 0, 0.3, S),
        box(0.5, 0.06, 0.5, 0, 0, 0, W), tor(0.42, 0.025, 0.34, A, true), tor(0.3, 0.018, 0.42, A, true)]);
      out[k + 'setback'] = merge([box(0.72, 0.16, 0.72, 0, 0, 0, S), box(0.74, 0.02, 0.74, 0, 0.16, 0, A, true), box(0.48, 0.14, 0.48, 0, 0.18, 0, W), box(0.5, 0.02, 0.5, 0, 0.32, 0, A, true), box(0.26, 0.12, 0.26, 0, 0.34, 0, S), cyl(0.02, 0.005, 0.22, 0, 0.46, 0, S, false, 6)]);
      out[k + 'pods'] = merge([box(0.46, 0.16, 0.46, 0, 0, 0, W), box(0.34, 0.11, 0.18, 0.36, 0.05, 0.08, W), box(0.02, 0.05, 0.16, 0.54, 0.08, 0.08, A, true), box(0.18, 0.11, 0.34, -0.08, 0.05, -0.36, W), box(0.16, 0.05, 0.02, -0.08, 0.08, -0.54, A, true), box(0.48, 0.02, 0.48, 0, 0.16, 0, A, true)]);
      out[k + 'dome'] = merge([cyl(0.4, 0.4, 0.06, 0, 0, 0, W, false, 28), dome(0.36, 0.06, GL), tor(0.4, 0.02, 0.07, A, true), cyl(0.012, 0.004, 0.2, 0, 0.42, 0, W, false, 6)]);
      out[k + 'garden'] = merge([box(0.9, 0.04, 0.9, 0, 0, 0, W), box(0.82, 0.02, 0.82, 0, 0.04, 0, GR), cyl(0.05, 0.0, 0.16, -0.25, 0.06, -0.2, GR, false, 6), cyl(0.05, 0.0, 0.18, 0.22, 0.06, 0.2, GR, false, 6), cyl(0.05, 0.0, 0.14, 0.25, 0.06, -0.25, GR, false, 6),
        box(0.9, 0.05, 0.015, 0, 0.04, 0.45, A, true), box(0.9, 0.05, 0.015, 0, 0.04, -0.45, A, true), box(0.015, 0.05, 0.9, 0.45, 0.04, 0, A, true), box(0.015, 0.05, 0.9, -0.45, 0.04, 0, A, true), box(0.3, 0.12, 0.2, -0.15, 0.06, 0.22, GL)]);
      out[k + 'coin'] = merge([box(0.5, 0.08, 0.3, 0, 0, 0, W), tor(0.26, 0.04, 0.36, A, true, true), box(0.04, 0.12, 0.04, 0, 0.08, 0, S)]);
      out[k + 'livingdome'] = merge([cyl(0.38, 0.38, 0.05, 0, 0, 0, W, false, 28), dome(0.34, 0.05, GR), tor(0.38, 0.02, 0.06, A, true)]);
      out[k + 'wave'] = merge([box(0.8, 0.04, 0.8, 0, 0, 0, WOOD), (function () { var l = []; for (var i = 0; i < 3; i++) { var g = new THREE.CylinderGeometry(0.11, 0.11, 0.7, 12, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.translate(0, 0.04, -0.25 + i * 0.25); l.push(part(g, GL)); } return merge(l); })(), box(0.82, 0.015, 0.02, 0, 0.04, 0.41, A, true)]);
      out[k + 'pavilion'] = merge([box(0.7, 0.03, 0.7, 0, 0, 0, W), box(0.03, 0.18, 0.03, -0.25, 0.03, -0.25, W), box(0.03, 0.18, 0.03, 0.25, 0.03, -0.25, W), box(0.03, 0.18, 0.03, -0.25, 0.03, 0.25, W), box(0.03, 0.18, 0.03, 0.25, 0.03, 0.25, W),
        cyl(0.4, 0.4, 0.03, 0, 0.21, 0, WOOD, false, 24), dome(0.16, 0.24, GR), tor(0.4, 0.012, 0.24, A, true)]);
    });
    return out;
  }
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]crowns=0\b/.test(location.search)) return null;
    var THREE = o.THREE, G = geos(THREE), by = {}, group = new THREE.Group(); group.name = 'city-crowns';
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 2.2;');
    };
    (o.reqs || []).forEach(function (r) { var d = ACCENT[r.d] ? r.d : 'trade', k = d + ':' + pick(d, r.x, r.z); (by[k] = by[k] || []).push(r); });
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), stats = { buildings: 0, types: 0 };
    Object.keys(by).forEach(function (k) {
      var L = by[k], im = new THREE.InstancedMesh(G[k], mat, L.length); im.name = 'crown-' + k; im.castShadow = true; im.receiveShadow = true;
      L.forEach(function (r, i) { var sz = Math.min(r.w, r.dz); m4.compose(p.set(r.x, r.y, r.z), q.setFromAxisAngle(up, r.yaw || 0), s.set(r.w * 0.92, sz, r.dz * 0.92)); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im); stats.types++; stats.buildings += L.length;
    });
    (o.parent || o.scene).add(group); root.__cityCrowns = stats; return { group: group, stats: stats };
  }
  root.WorldCityCrowns = { build: build, pick: pick, TYPES: TYPES };
})(typeof window !== 'undefined' ? window : globalThis);
