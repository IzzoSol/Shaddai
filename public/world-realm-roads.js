/* world-realm-roads.js — roads out to every realm + the Skyline Spur rail (owner 2026-10-23: "there is no roads that lead to the outer realm
 * or train"). Map v4 never loaded the old light-trail roads (world-trails.js is Map v3 only).
 *
 *   window.WorldRealmRoads.build({ THREE, scene, heightAt, waterAt?, transit?, U? }) -> Promise<{ group, stats, update(dt) }>
 *
 * Data: /assets/world/realm-roads-v1.json from tools/gen-realm-roads.cjs (Blender metres: x east, y north -> game x = x*U, z = -y*U).
 * ROADS (TURTLE 2026-10-23: hover lane + glowing guide rails): 11 m dark deck, three samples across so it hugs side slopes, +0.45 m over
 *   the ground; over a river or the sea it lifts to a BRIDGE (water + 3.5 m, ramps 1:12) on twin pylons with glass rails. Edge strips glow
 *   in the realm's accent colour. Whole network = 3 draw calls (deck, strips, pylons) + rails.
 * SKYLINE SPUR: white maglev viaduct on pylons from the Suburb station east to the Star City stop and the Cloud Harbor gate; a 2-car shuttle
 *   runs it; the Star City stop is registered on the ring train (transit.addStation) so you can ride there. The harbor gate stays sealed.
 * ?realmroads=0 = off.
 */
(function (root) {
  'use strict';
  var DATA = '/assets/world/realm-roads-v1.json?v=20261023b';
  var ACCENT = { void: 0x9a40ff, desert: 0xffc94a, volcano: 0xff6b35, suburb: 0xc9a227, meadow: 0x9be15d, ocean: 0x00c2ff, darkforest: 0x5fe0b0, arctic: 0x9fe8ff, forest: 0x7dff9a };
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]realmroads=0\b/.test(location.search)) return Promise.resolve(null);
    var THREE = o.THREE, U = o.U || 7 / 1.8, H = o.heightAt || function () { return 0; }, WAT = o.waterAt || function () { return null; };
    var group = new THREE.Group(); group.name = 'realm-roads'; o.scene.add(group);
    var stats = { roads: 0, bridgesM: 0, spur: false, stops: 0 }, anim = [];
    return fetch(DATA).then(function (r) { return r.json(); }).then(function (D) {
      var W = (D.width_m || 11) * U, E = (D.edge_m || 0.6) * U;
      var deck = [], dcol = [], strip = [], scol = [], rail = [], pyl = [], lamps = [], gates = [], col = new THREE.Color();
      function g(p) { return [p[0] * U, -p[1] * U]; }
      // per-point deck heights: ground (3 across) or bridge level, then a 1:12 ramp limit both ways so bridges ease in
      function profile(P) {
        var n = P.length, y = new Array(n), wet = new Array(n), i;
        for (i = 0; i < n; i++) { var w = WAT(P[i][0], P[i][1]); wet[i] = w != null; y[i] = wet[i] ? Math.max(H(P[i][0], P[i][1]) + 0.45 * U, w + 3.5 * U) : -Infinity; }
        for (i = 0; i < n; i++) if (wet[i]) { for (var k = 1; k < 12; k++) { var lim = y[i] - k * 10 * U / 12; if (i - k >= 0 && !wet[i - k]) y[i - k] = Math.max(y[i - k], lim); if (i + k < n && !wet[i + k]) y[i + k] = Math.max(y[i + k], lim); } }
        return { y: y, wet: wet };
      }
      function ribbon(P, accent) {
        var pr = profile(P), n = P.length, side = [];
        for (var i = 0; i < n; i++) { var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; side.push([-dz / l, dx / l]); }
        function vtx(i, t) {   // t in [-1, 1] across the deck
          var x = P[i][0] + side[i][0] * t * W / 2, z = P[i][1] + side[i][1] * t * W / 2;
          var yy = isFinite(pr.y[i]) ? pr.y[i] : H(x, z) + 0.45 * U; if (!pr.wet[i] && isFinite(pr.y[i])) yy = Math.max(yy, H(x, z) + 0.45 * U);
          return [x, yy, z];
        }
        col.setHex(accent);
        for (var j = 0; j + 1 < n; j++) {
          var A = [vtx(j, -1), vtx(j, 0), vtx(j, 1)], B = [vtx(j + 1, -1), vtx(j + 1, 0), vtx(j + 1, 1)];
          for (var s = 0; s < 2; s++) { [A[s], B[s], B[s + 1], A[s], B[s + 1], A[s + 1]].forEach(function (v) { deck.push(v[0], v[1], v[2]); dcol.push(0.07, 0.09, 0.12); }); }
          [-1, 1].forEach(function (sd) {   // glowing guide strips just inside each edge, 5 cm proud of the deck
            var t0 = sd * (1 - E / W * 2), t1 = sd, p0 = vtx(j, t0), p1 = vtx(j, t1), q0 = vtx(j + 1, t0), q1 = vtx(j + 1, t1);
            [p0, q0, q1, p0, q1, p1].forEach(function (v) { strip.push(v[0], v[1] + 0.05 * U, v[2]); scol.push(col.r, col.g, col.b); });
            if (pr.wet[j] || pr.wet[j + 1]) {   // glass rail on bridges
              var hR = 1.1 * U; [p1, q1, [q1[0], q1[1] + hR, q1[2]], p1, [q1[0], q1[1] + hR, q1[2]], [p1[0], p1[1] + hR, p1[2]]].forEach(function (v) { rail.push(v[0], v[1], v[2]); });
            }
          });
          if (pr.wet[j] && j % 3 === 0) { stats.bridgesM += 30; [-0.38, 0.38].forEach(function (t) { var v = vtx(j, t); pyl.push([v[0], v[2], v[1], H(v[0], v[2])]); }); }
          if (j % 2 === 0) {   // dashed centre line: 10 m dash / 10 m gap, accent at 60 %
            var c0 = vtx(j, -0.02), c1 = vtx(j, 0.02), d0 = vtx(j + 1, -0.02), d1 = vtx(j + 1, 0.02);
            [c0, d0, d1, c0, d1, c1].forEach(function (v) { strip.push(v[0], v[1] + 0.06 * U, v[2]); scol.push(col.r * 0.6, col.g * 0.6, col.b * 0.6); });
          }
          if (j % 6 === 3) { var sd2 = (j / 6 | 0) % 2 ? 1 : -1, lp = vtx(j, sd2 * 1.12); lamps.push([lp[0], lp[1], lp[2], accent]); }   // light posts every 60 m, alternating sides
        }
        gates.push({ p: vtx(n - 1, 0), a: Math.atan2(P[n - 1][0] - P[n - 2][0], P[n - 1][1] - P[n - 2][1]), accent: accent });   // town gateway at the road's end
      }
      (D.roads || []).forEach(function (R) { ribbon(R.pts.map(g), ACCENT[R.realm] || 0x8ffff0); stats.roads++; });
      function mesh(pos, colArr, mat, name) {
        if (!pos.length) return null; var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        if (colArr) gg.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3)); gg.computeVertexNormals();
        var m = new THREE.Mesh(gg, mat); m.name = name; m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m); return m;
      }
      mesh(deck, dcol, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), 'realm-road-deck');
      var sm = mesh(strip, scol, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }), 'realm-road-strips');
      mesh(rail, null, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }), 'realm-road-rails');
      // ROAD AESTHETICS (owner 2026-10-23): slim white light posts with a glowing realm-colour cap, and a gateway arch where each road meets its town.
      var postMat = new THREE.MeshStandardMaterial({ color: 0xe9eef3, roughness: 0.35, metalness: 0.4 }), capMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      if (lamps.length) {
        var pgeo = new THREE.CylinderGeometry(0.12 * U, 0.2 * U, 7 * U, 6); pgeo.translate(0, 3.5 * U, 0);
        var cgeo = new THREE.CylinderGeometry(0.55 * U, 0.55 * U, 0.35 * U, 10); cgeo.translate(0, 7.1 * U, 0);
        var posts = new THREE.InstancedMesh(pgeo, postMat, lamps.length), caps = new THREE.InstancedMesh(cgeo, capMat, lamps.length), lm4 = new THREE.Matrix4(), lc = new THREE.Color();
        lamps.forEach(function (L, k) { lm4.makeTranslation(L[0], L[1], L[2]); posts.setMatrixAt(k, lm4); caps.setMatrixAt(k, lm4); caps.setColorAt(k, lc.setHex(L[3])); });
        [posts, caps].forEach(function (m) { m.name = 'realm-road-lamps'; m.computeBoundingSphere(); group.add(m); }); stats.lamps = lamps.length;
      }
      if (gates.length) {
        var gp2 = [], gmat = new THREE.MeshStandardMaterial({ color: 0xe9eef3, roughness: 0.3, metalness: 0.5 }), gGlow = [], gcol = [];
        gates.forEach(function (G) {
          var ca = Math.cos(G.a), sa = Math.sin(G.a), hw = 9 * U, ht = 12 * U, tk = 1.1 * U;
          function box(cx, cy, cz, sx, sy, sz, out) {   // axis-aligned in gate space (x across the road), rotated by the road heading
            var b = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); b.rotateY(G.a); b.translate(cx, cy, cz); out.push(b);
          }
          var ax = ca, az = -sa;   // across-road unit (perpendicular to the heading)
          box(G.p[0] + ax * hw, G.p[1] + ht / 2, G.p[2] + az * hw, tk, ht, tk, gp2); box(G.p[0] - ax * hw, G.p[1] + ht / 2, G.p[2] - az * hw, tk, ht, tk, gp2);
          box(G.p[0], G.p[1] + ht, G.p[2], 2 * hw + tk, tk, tk, gp2);
          var gl = new THREE.BoxGeometry(2 * hw - tk, 0.25 * U, 0.3 * U).toNonIndexed(); gl.rotateY(G.a); gl.translate(G.p[0], G.p[1] + ht - 0.75 * U, G.p[2]); gGlow.push(gl);
          lc.setHex(G.accent); for (var q = 0; q < gl.attributes.position.count; q++) gcol.push(lc.r, lc.g, lc.b);
        });
        function mergeG(list) { var pos = []; list.forEach(function (b) { pos.push.apply(pos, b.attributes.position.array); }); var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.computeVertexNormals(); return gg; }
        var gm = new THREE.Mesh(mergeG(gp2), gmat); gm.name = 'realm-road-gates'; group.add(gm);
        var gg2 = mergeG(gGlow); gg2.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3)); var gm2 = new THREE.Mesh(gg2, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); gm2.name = 'realm-road-gate-glow'; group.add(gm2);
        stats.gates = gates.length;
      }
      // ── SKYLINE SPUR ──
      var white = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.35, metalness: 0.25 }), gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.8 });
      (D.spurs || []).forEach(function (S) {
        var P = S.pts.map(g), n = P.length, ys = [], i, DH = (S.deckH_m || 9) * U;
        for (i = 0; i < n; i++) { var w = WAT(P[i][0], P[i][1]); ys.push(Math.max(H(P[i][0], P[i][1]), w != null ? w : -Infinity) + DH); }
        for (var pass = 0; pass < 3; pass++) for (i = 1; i + 1 < n; i++) ys[i] = Math.max(ys[i], (ys[i - 1] + ys[i + 1]) / 2 - 0.5 * U);   // smooth grade, never below clearance
        var dp = [], gp = [], spurPyl = [], DW = 8 * U, len = [0];
        for (i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        function sideAt(k) { var a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; }
        for (i = 0; i + 1 < n; i++) {
          var s0 = sideAt(i), s1 = sideAt(i + 1), T = 1.4 * U;
          var L0 = [P[i][0] - s0[0] * DW / 2, ys[i], P[i][1] - s0[1] * DW / 2], R0 = [P[i][0] + s0[0] * DW / 2, ys[i], P[i][1] + s0[1] * DW / 2];
          var L1 = [P[i + 1][0] - s1[0] * DW / 2, ys[i + 1], P[i + 1][1] - s1[1] * DW / 2], R1 = [P[i + 1][0] + s1[0] * DW / 2, ys[i + 1], P[i + 1][1] + s1[1] * DW / 2];
          var dn = function (v) { return [v[0], v[1] - T, v[2]]; };
          [L0, L1, R1, L0, R1, R0, dn(L0), dn(R1), dn(L1), dn(L0), dn(R0), dn(R1), L0, dn(L0), dn(L1), L0, dn(L1), L1, R0, R1, dn(R1), R0, dn(R1), dn(R0)].forEach(function (v) { dp.push(v[0], v[1], v[2]); });
          [-0.3, 0.3].forEach(function (t) { var a0 = [P[i][0] + s0[0] * t * DW, ys[i] + 0.3 * U, P[i][1] + s0[1] * t * DW], a1 = [P[i + 1][0] + s1[0] * t * DW, ys[i + 1] + 0.3 * U, P[i + 1][1] + s1[1] * t * DW], w2 = 0.25 * U;
            [[a0[0] - s0[0] * w2, a0[1], a0[2] - s0[1] * w2], [a1[0] - s1[0] * w2, a1[1], a1[2] - s1[1] * w2], [a1[0] + s1[0] * w2, a1[1], a1[2] + s1[1] * w2], [a0[0] - s0[0] * w2, a0[1], a0[2] - s0[1] * w2], [a1[0] + s1[0] * w2, a1[1], a1[2] + s1[1] * w2], [a0[0] + s0[0] * w2, a0[1], a0[2] + s0[1] * w2]].forEach(function (v) { gp.push(v[0], v[1], v[2]); }); });
          if (i % 2 === 0) spurPyl.push([P[i][0], P[i][1], ys[i] - T, H(P[i][0], P[i][1])]);
        }
        mesh(dp, null, white, 'skyline-spur-deck'); mesh(gp, null, gold, 'skyline-spur-rails');
        pyl = pyl.concat(spurPyl.map(function (p) { return [p[0], p[1], p[2], p[3], 1.5]; }));
        // shuttle: two white capsule cars gliding the spur end to end
        var car = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(1.6 * U, 14 * U, 6, 16), white), glass = new THREE.Mesh(new THREE.CapsuleGeometry(1.62 * U, 11 * U, 4, 16), new THREE.MeshStandardMaterial({ color: 0x1a3a5a, roughness: 0.1, metalness: 0.6, emissive: 0x0a3a6a, emissiveIntensity: 0.6 }));
        body.rotation.z = glass.rotation.z = Math.PI / 2; glass.scale.set(0.55, 1, 1.02); glass.position.y = 0.5 * U; car.add(body, glass);
        var cars = [car, car.clone()]; cars.forEach(function (c) { group.add(c); });
        var tot = len[n - 1];
        function at(d, out) { d = Math.max(0, Math.min(tot, d)); var k = 1; while (k < n - 1 && len[k] < d) k++; var t = (d - len[k - 1]) / ((len[k] - len[k - 1]) || 1); out.x = P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t; out.z = P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t; out.y = ys[k - 1] + (ys[k] - ys[k - 1]) * t; out.yaw = Math.atan2(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return out; }
        var st = { s: 0, dir: 1, wait: 0 }, tmp = {};
        anim.push(function (dt) {
          if (st.wait > 0) { st.wait -= dt; } else { st.s += st.dir * 24 * U * dt; if (st.s > tot - 10 * U || st.s < 10 * U) { st.dir *= -1; st.wait = 8; st.s = Math.max(10 * U, Math.min(tot - 10 * U, st.s)); } }
          cars.forEach(function (c, k) { at(st.s - k * 17 * U * st.dir, tmp); c.position.set(tmp.x, tmp.y + 2.2 * U, tmp.z); c.rotation.y = tmp.yaw + Math.PI / 2; });
        });
        (S.stops || []).forEach(function (sp) {   // platforms + ring-train stop (sealed stops get a platform only)
          var p = g(sp.at), gy = H(p[0], p[1]), pad = new THREE.Mesh(new THREE.CylinderGeometry(14 * U, 14 * U, 0.8 * U, 32), white), ring = new THREE.Mesh(new THREE.TorusGeometry(14 * U, 0.35 * U, 6, 48), gold);
          pad.position.set(p[0], gy + 0.4 * U, p[1]); ring.rotation.x = Math.PI / 2; ring.position.set(p[0], gy + 0.85 * U, p[1]); group.add(pad, ring);
          if (!sp.sealed && o.transit && o.transit.addStation) { o.transit.addStation({ id: sp.id, name: sp.name, x: p[0], z: p[1], y: gy + 0.8 * U }); stats.stops++; }
        });
        stats.spur = true;
      });
      if (pyl.length) {   // pylons (bridge + spur): one InstancedMesh, unit-height cylinder stretched to each span
        var pg = new THREE.CylinderGeometry(1, 1, 1, 10); pg.translate(0, 0.5, 0);
        var pm = new THREE.InstancedMesh(pg, white, pyl.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
        pyl.forEach(function (p, k) { var r = (p[4] || 0.9) * U, h = Math.max(0.5 * U, p[2] - p[3] + 2 * U); m4.compose(v.set(p[0], p[3] - 2 * U, p[1]), q, sc.set(r, h, r)); pm.setMatrixAt(k, m4); });
        pm.name = 'realm-road-pylons'; pm.computeBoundingSphere(); group.add(pm);
      }
      if (sm) anim.push((function () { var t = 0; return function (dt) { t += dt; sm.material.color.setScalar(0.85 + 0.15 * Math.sin(t * 1.6)); }; })());
      group.updateMatrixWorld(true);
      function update(dt) { for (var i = 0; i < anim.length; i++) anim[i](dt); }
      var last = performance.now(); (function tick(now) { update(Math.min(0.1, ((now || performance.now()) - last) / 1000)); last = now || performance.now(); requestAnimationFrame(tick); })();   /* self-ticking, like world-rivers.js */
      root.__realmRoads = { group: group, stats: stats };
      return { group: group, stats: stats, update: update };
    }).catch(function (e) { console.warn('[realm-roads]', e && e.message); return null; });
  }
  root.WorldRealmRoads = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
