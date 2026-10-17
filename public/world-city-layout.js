/* world-city-layout.js — ROADS + PLOTS of the designed district layout (owner 2026-10-16, ref image 66 / 34).
 *   WorldCityLayout.build({ THREE, scene, heightAt, U, layout })   layout = grid-fabric-districts-v1.json (tools/city-layout-gen.cjs)
 * Roads: dark paved ribbons with district-coloured edge lines, following the ground (one merged mesh each = 2 draws).
 * Plots: open claimable parcels (sandy pad + fence corner posts, image 34 right half) = 2 draws. window.__cityPlots = [{id, district, x, z, size}].
 * ?citylayout=0 = off (and the old fabric comes back).
 */
(function (root) {
  'use strict';
  var EDGE = { academy: 0x4b8bf5, trade: 0xe67e22, forge: 0xc0392b, residential: 0x27ae60, ring: 0xe8c45c };   // TURTLE district palette
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]citylayout=0\b/.test(location.search)) return null;
    var THREE = o.THREE, U = o.U || 7 / 1.8, L = o.layout || {}, H = o.heightAt || function () { return 0; }, g = new THREE.Group(); g.name = 'city-layout'; o.scene.add(g);
    var pave = [], glow = [], gcol = [], pads = [], posts = [];
    function quad(out, ax, az, bx, bz, half, lift, col, colOut) {
      var dx = bx - ax, dz = bz - az, L2 = Math.hypot(dx, dz) || 1, nx = -dz / L2 * half, nz = dx / L2 * half, n = Math.max(1, Math.ceil(L2 / (8 * U)));
      for (var i = 0; i < n; i++) { var t0 = i / n, t1 = (i + 1) / n, P = [[t0, -1], [t0, 1], [t1, 1], [t1, -1]].map(function (q) { var x = ax + dx * q[0] + nx * q[1], z = az + dz * q[0] + nz * q[1]; return [x, H(x, z) + lift * U, z]; });
        [0, 1, 2, 0, 2, 3].forEach(function (k) { out.push(P[k]); if (colOut) colOut.push(col); }); }
    }
    (L.roads || []).forEach(function (r) {
      var ax = r.x0 * U, az = -r.y0 * U, bx = r.x1 * U, bz = -r.y1 * U, hw = r.w / 2 * U, c = new THREE.Color(EDGE[r.district] || 0x27e0ff);
      quad(pave, ax, az, bx, bz, hw, 0.18, null, null);
      var dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ex = -dz / l * (hw - 0.6 * U), ez = dx / l * (hw - 0.6 * U);
      [-1, 1].forEach(function (s) { quad(glow, ax + ex * s, az + ez * s, bx + ex * s, bz + ez * s, 0.25 * U, 0.22, c, gcol); });
    });
    var plots = [];
    (L.plots || []).forEach(function (p) {
      var x = p.x_m * U, z = -p.y_m * U, h = p.size_m / 2 * U, a = -p.yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), C = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (q) { return [x + (q[0] * ca - q[1] * sa) * h, z + (q[0] * sa + q[1] * ca) * h]; });
      quad(pads, (C[0][0] + C[3][0]) / 2, (C[0][1] + C[3][1]) / 2, (C[1][0] + C[2][0]) / 2, (C[1][1] + C[2][1]) / 2, h, 0.12, null, null);
      C.forEach(function (c) { posts.push([c[0], H(c[0], c[1]), c[1]]); });
      plots.push({ id: p.id, district: p.district, x: x, z: z, size: p.size_m });
    });
    function mesh(list, mat, cols) { if (!list.length) return; var a = new Float32Array(list.length * 3); list.forEach(function (v, i) { a[i * 3] = v[0]; a[i * 3 + 1] = v[1]; a[i * 3 + 2] = v[2]; });
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
      if (cols) { var c = new Float32Array(cols.length * 3); cols.forEach(function (cc, i) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
      geo.computeVertexNormals(); var m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); }
    mesh(pave, new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }));
    mesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }), gcol);
    mesh(pads, new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.95, side: THREE.DoubleSide }));
    if (posts.length) { var pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35 * U, 0.4 * U, 2.6 * U, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.9 }), posts.length), m4 = new THREE.Matrix4();
      posts.forEach(function (p, i) { m4.makeTranslation(p[0], p[1] + 1.3 * U, p[2]); pm.setMatrixAt(i, m4); }); pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere(); g.add(pm); }
    root.__cityPlots = plots;
    return { group: g, plots: plots, roads: (L.roads || []).length };
  }
  root.WorldCityLayout = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
