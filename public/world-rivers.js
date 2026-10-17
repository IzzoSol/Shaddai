/* world-rivers.js — the owner's small RIVER loop (drawn in Blender 2026-10-16, assets/world/city-zones-v1.json `rivers`): boats travel round the city.
 *   var R = WorldRivers.build({ THREE, scene, heightAt, U, zones })  -> { at(x, z) -> water surface y | null, group }
 * A 22 m water ribbon following the ground (+0.5 m), animated cyan sheen. The host wraps _v4Water.isWater / waterHeightAt with R.at so water craft
 * (world-mount-ride: Aqua Cabin-Glider, Rimba Pod) float and drive on the river exactly like on the sea. No terrain carving (owner: "not too big a change").
 * ?rivers=0 = off.
 */
(function (root) {
  'use strict';
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]rivers=0\b/.test(location.search)) return null;
    var THREE = o.THREE, U = o.U || 7 / 1.8, H = o.heightAt, Z = o.zones || {}, W = (Z.riverWidth_m || 22) * U;
    var segs = [], CELL = 120 * U, grid = {}, pos = [], uv = [];
    (Z.rivers || []).forEach(function (line) {
      var P = line.map(function (p) { return [p[0] * U, -p[1] * U]; }), acc = 0;
      for (var i = 0; i + 1 < P.length; i++) {
        var a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) continue;
        var s = { ax: a[0], az: a[1], dx: dx, dz: dz, L: L, ya: H(a[0], a[1]) + 1.4 * U, yb: H(b[0], b[1]) + 1.4 * U }; segs.push(s);
        var x0 = Math.min(a[0], b[0]) - W, x1 = Math.max(a[0], b[0]) + W, z0 = Math.min(a[1], b[1]) - W, z1 = Math.max(a[1], b[1]) + W;
        for (var gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (var gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) (grid[gx + ',' + gz] = grid[gx + ',' + gz] || []).push(s);
        var n = Math.max(1, Math.ceil(L / (6 * U))), nx = -dz / L * W / 2, nz = dx / L * W / 2;   // ribbon, 6 m steps, follows the ground
        for (var k = 0; k < n; k++) { var t0 = k / n, t1 = (k + 1) / n, q = [[t0, -1], [t0, 1], [t1, 1], [t1, -1]].map(function (c) { var x = a[0] + dx * c[0] + nx * c[1], z = a[1] + dz * c[0] + nz * c[1]; return [x, H(x, z) + 1.4 * U, z, (acc + L * c[0]) / (40 * U), c[1] * 0.5 + 0.5]; });
          [0, 1, 2, 0, 2, 3].forEach(function (j) { pos.push(q[j][0], q[j][1], q[j][2]); uv.push(q[j][3], q[j][4]); }); }
        acc += L;
      }
    });
    var group = new THREE.Group(); group.name = 'world-rivers';
    if (pos.length) {
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
      var mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uT; varying vec2 vUv; void main(){ float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y); float flow = 0.5 + 0.5 * sin(vUv.x * 18.0 - uT * 2.2 + sin(vUv.y * 9.0) * 1.3);' +
          ' vec3 c = mix(vec3(0.03, 0.22, 0.32), vec3(0.18, 0.62, 0.78), flow * 0.45); c += vec3(0.6, 0.9, 1.0) * pow(flow, 12.0) * 0.25; gl_FragColor = vec4(c, 0.78 * edge + 0.1); }' });
      var mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; group.add(mesh);
      var t0 = performance.now(); (function tick() { mat.uniforms.uT.value = (performance.now() - t0) / 1000; requestAnimationFrame(tick); })();
    }
    o.scene.add(group);
    function at(x, z) {
      var list = grid[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)]; if (!list) return null;
      for (var i = 0; i < list.length; i++) { var s = list[i], t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.L * s.L); if (t < 0 || t > 1) continue;
        var px = s.ax + s.dx * t, pz = s.az + s.dz * t; if (Math.hypot(x - px, z - pz) <= W / 2) return s.ya + (s.yb - s.ya) * t; }
      return null;
    }
    root.__rivers = { at: at, segments: segs.length };
    return { at: at, group: group, segments: segs.length };
  }
  root.WorldRivers = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
