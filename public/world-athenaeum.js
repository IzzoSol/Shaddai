/* world-athenaeum.js — the Athenaeum Campus, built in Three.js from athenaeum-layout.js.
 *
 *   var campus = window.buildAthenaeumCampus(THREE, { scene, originX?, originZ? })   // a colosseum-style room record
 *   campus.group (Object3D, starts hidden) · campus.code 'ATHENAEUM' · campus.origin {x,z}
 *   campus.contains(x,z) · campus.heightAt(x,z) · campus.resolve(pos, px, pz)        // world units, exactly like the colosseum arena
 *   campus.stations[] (world units) · campus.nearestStation(x,z) · campus.tick(dt) · campus.setQuality(name) · campus.dispose()
 *
 * Futuristic obsidian / emerald / gold. All static structure is merged into one mesh per material; repeated pieces are instanced;
 * at most 8 lights; tick() allocates nothing. The record has NO glowEntries/animObjs/motes: the campus animates itself in tick(),
 * so world-interiors' update loop must not (and will not) double-animate it.
 */
(function (root) {
  'use strict';
  var Layout = (typeof module === 'object' && module.exports && typeof require === 'function') ? require('./athenaeum-layout.js') : root.AthenaeumLayout;

  var KIND_COLOR = { pods: 0x00ff9c, press: 0xe8c45c, directory: 0x5fe0ff, teachers: 0xf0d27a, trophy: 0xe8c45c, trading: 0x2dd4a0, import: 0x4da3ff, admin: 0xff6a5a, navi: 0x00ff9c, dais: 0x00ff9c, lectern: 0x00ff9c };
  var QUALITY = { POTATO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, ULTRA: 3 };

  function build(THREE, opts) {
    opts = opts || {};
    var L = Layout.build();
    var U = L.U, R = L.R;
    var islandX = (typeof root.ROOM_ISLAND_X === 'number' ? root.ROOM_ISLAND_X : 6000) + 9000;
    var X0 = typeof opts.originX === 'number' ? opts.originX : islandX, Z0 = typeof opts.originZ === 'number' ? opts.originZ : 0;
    var DRUM = 14, DOME = 16, TAU = Math.PI * 2;

    var group = new THREE.Group(); group.name = 'interior_ATHENAEUM'; group.visible = false;
    var rootG = new THREE.Group(); rootG.name = 'athenaeum-root'; rootG.scale.setScalar(U); rootG.position.set(X0, 0, Z0); group.add(rootG);

    // ── helpers ─────────────────────────────────────────────────────────────────
    var mats = {};
    function std(name, color, o) { o = o || {}; var m = new THREE.MeshStandardMaterial({ color: color, roughness: o.rough == null ? 0.5 : o.rough, metalness: o.metal == null ? 0.2 : o.metal, emissive: o.emissive == null ? 0x000000 : o.emissive, emissiveIntensity: o.ei == null ? 1 : o.ei, side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity == null ? 1 : o.opacity }); m.name = name; if (o.depthWrite === false) m.depthWrite = false; mats[name] = m; return m; }
    std('obsidian', 0x222d37, { rough: 0.5, metal: 0.18 });
    std('floor', 0x16222a, { rough: 0.3, metal: 0.12 });
    std('inlay', 0x003b2a, { emissive: 0x00ff9c, ei: 1.0, rough: 0.4 });
    std('glass', 0x7fffd8, { rough: 0.08, metal: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    var wireMat = new THREE.MeshBasicMaterial({ color: 0x00ff9c, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false }); wireMat.name = 'wire'; mats.wire = wireMat;
    var beamMat = new THREE.MeshBasicMaterial({ color: 0x66ffd0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }); beamMat.name = 'beam'; mats.beam = beamMat;
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }); ringMat.name = 'station-ring'; mats.ring = ringMat;
    function em(color) {
      var key = 'em-' + color.toString(16);
      return mats[key] || std(key, 0x070a0d, { emissive: color, ei: 1.15, rough: 0.35, metal: 0.3 });
    }

    var parts = {};
    function addTo(name, geo) { (parts[name] = parts[name] || []).push(geo); }
    function xf(geo, o) {
      var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
      geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0), q, new THREE.Vector3(o.sx || 1, o.sy || 1, o.sz || 1)));
      return geo;
    }
    function merge(geos) {
      var total = 0, list = geos.map(function (g) { var n = g.index ? g.toNonIndexed() : g; total += n.attributes.position.count; return n; });
      var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), o = 0;
      list.forEach(function (g) {
        pos.set(g.attributes.position.array, o * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count;
      });
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geos.forEach(function (g) { g.dispose(); }); list.forEach(function (g) { g.dispose(); });
      return out;
    }
    function polar(deg, r, cx, cz) { var a = deg * Math.PI / 180; return { x: (cx || 0) + Math.sin(a) * r, z: (cz || 0) - Math.cos(a) * r }; }
    // a wall segment between two floor points, from y0 to y1
    function wall(mat, x1, z1, x2, z2, y0, y1, t) {
      var len = Math.hypot(x2 - x1, z2 - z1); if (len < 1e-4) return;
      addTo(mat, xf(new THREE.BoxGeometry(len, y1 - y0, t || 0.8), { x: (x1 + x2) / 2, y: (y0 + y1) / 2, z: (z1 + z2) / 2, ry: -Math.atan2(z2 - z1, x2 - x1) }));
    }
    function arc(mat, cx, cz, r, a0, a1, y0, y1, t, step) {
      step = step || 2; var n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
      for (var i = 0; i < n; i++) { var p = polar(a0 + (a1 - a0) * i / n, r, cx, cz), q = polar(a0 + (a1 - a0) * (i + 1) / n, r, cx, cz); wall(mat, p.x, p.z, q.x, q.z, y0, y1, t); }
    }
    function floorPlane(w, d, x, z, ry) { addTo('floor', xf(new THREE.PlaneGeometry(w, d), { x: x, y: 0, z: z, rx: -Math.PI / 2, ry: ry })); }
    function wingFrame(w, along, across) { return L.at(w, along, across); }
    var wingRy = function (w) { return Math.PI - w.rot; };    // maps a plane's local +z onto the wing's along axis

    // ── floors and inlays ───────────────────────────────────────────────────────
    addTo('floor', xf(new THREE.CircleGeometry(R, 96), { rx: -Math.PI / 2 }));
    L.wings.forEach(function (w) {
      var c = wingFrame(w, L.WING_ALONG0 + L.WING_LEN / 2, 0); floorPlane(w.halfW * 2, L.WING_LEN, c.x, c.z, wingRy(w));
      var d = wingFrame(w, R + (L.WING_ALONG0 - R) / 2 - 0.5, 0); floorPlane(L.DOOR_HALF * 2, L.WING_ALONG0 - R + 1, d.x, d.z, wingRy(w));
    });
    floorPlane(L.gate.halfW * 2, L.gate.endZ - (R - 3), 0, (L.gate.endZ + (R - 3)) / 2, 0);
    floorPlane(L.apse.doorHalf * 2, L.apse.doorEndZ - L.apse.doorStartZ - 0, 0, (L.apse.doorEndZ + L.apse.doorStartZ) / 2, 0);
    addTo('floor', xf(new THREE.CircleGeometry(L.apse.r, 48), { x: L.apse.cx, z: L.apse.cz, rx: -Math.PI / 2 }));
    [8.5, 14, 24, 33].forEach(function (r) { addTo('inlay', xf(new THREE.RingGeometry(r - 0.09, r + 0.09, 128), { y: 0.03, rx: -Math.PI / 2 })); });
    var doorAngles = L.wings.map(function (w) { return w.angleDeg; }).concat([0, 180]);
    doorAngles.forEach(function (a) { var p = polar(a, (8.5 + R) / 2); addTo('inlay', xf(new THREE.BoxGeometry(0.2, 0.02, R - 8.5), { x: p.x, y: 0.03, z: p.z, ry: -(a * Math.PI / 180) + Math.PI })); });
    L.wings.forEach(function (w) {
      var c = wingFrame(w, L.WING_ALONG0 + L.WING_LEN / 2, 0);
      addTo('em-' + w.accent.toString(16), xf(new THREE.BoxGeometry(0.3, 0.02, L.WING_LEN - 4), { x: c.x, y: 0.03, z: c.z, ry: wingRy(w) }));
      var med = wingFrame(w, L.WING_ALONG0 + 22, 0);
      addTo('em-' + w.accent.toString(16), xf(new THREE.RingGeometry(4.6, 4.8, 64), { x: med.x, y: 0.035, z: med.z, rx: -Math.PI / 2 }));
    });
    addTo('inlay', xf(new THREE.RingGeometry(L.apse.r - 3, L.apse.r - 2.8, 64), { x: L.apse.cx, y: 0.03, z: L.apse.cz, rx: -Math.PI / 2 }));

    // ── rotunda drum, doors, dome ───────────────────────────────────────────────
    var doors = L.wings.map(function (w) { return { a: w.angleDeg, half: Math.asin(L.DOOR_HALF / R) * 180 / Math.PI, color: w.accent }; });
    doors.push({ a: 0, half: Math.asin(L.apse.doorHalf / R) * 180 / Math.PI, color: L.AGENT_COLOR.SHADDAI });
    doors.push({ a: 180, half: Math.asin(L.DOOR_HALF / R) * 180 / Math.PI, color: 0x00ff9c });
    doors.sort(function (x, y) { return x.a - y.a; });
    doors.forEach(function (d, i) {
      var next = doors[(i + 1) % doors.length], from = d.a + d.half, to = (i === doors.length - 1 ? next.a + 360 : next.a) - next.half;
      arc('obsidian', 0, 0, R + 0.4, from, to, 0, DRUM, 0.9);
      arc('obsidian', 0, 0, R + 0.4, d.a - d.half, d.a + d.half, 10, DRUM, 0.9, 2);               // lintel over the doorway
      [-1, 1].forEach(function (s) { var p = polar(d.a + s * d.half, R); addTo('em-' + d.color.toString(16), xf(new THREE.BoxGeometry(0.5, 10, 1.1), { x: p.x, y: 5, z: p.z, ry: -((d.a + s * d.half) * Math.PI / 180) })); });
    });
    var domeGeo = new THREE.SphereGeometry(R + 0.4, 64, 24, 0, TAU, 0.3, Math.PI / 2 - 0.3);
    addTo('glass', xf(domeGeo.clone(), { y: DRUM, sy: DOME / (R + 0.4) }));
    domeGeo.dispose();
    var wireDome = new THREE.SphereGeometry(R + 0.4, 36, 11, 0, TAU, 0.3, Math.PI / 2 - 0.3);
    addTo('wire', xf(wireDome.clone(), { y: DRUM + 0.05, sy: DOME / (R + 0.4) }));
    wireDome.dispose();
    addTo('em-00ff9c', xf(new THREE.TorusGeometry(R + 0.4, 0.14, 8, 128), { y: DRUM, rx: Math.PI / 2 }));                // drum rim: reads from outside
    addTo('em-e8c45c', xf(new THREE.TorusGeometry(Math.sin(0.3) * (R + 0.4), 0.3, 8, 64), { y: DRUM + Math.cos(0.3) * DOME, rx: Math.PI / 2 }));   // oculus rim
    addTo('beam', xf(new THREE.CylinderGeometry(0.5, 0.9, DRUM + DOME - 2, 16, 1, true), { y: (DRUM + DOME) / 2 }));

    // ── wings: walls, roofs, skylights ──────────────────────────────────────────
    L.wings.forEach(function (w) {
      var a0 = L.WING_ALONG0, a1 = a0 + L.WING_LEN, h = w.h, hw = w.halfW, ac = 'em-' + w.accent.toString(16);
      [-1, 1].forEach(function (s) {
        var p = wingFrame(w, a0, s * (hw + 0.4)), q = wingFrame(w, a1, s * (hw + 0.4)); wall('obsidian', p.x, p.z, q.x, q.z, 0, h, 0.8);
        var n1 = wingFrame(w, a0, s * (hw + 0.4)), n2 = wingFrame(w, a0, s * (L.DOOR_HALF)); wall('obsidian', n1.x, n1.z, n2.x, n2.z, 0, h, 0.8);
        var c1 = wingFrame(w, R + 0.5, s * (L.DOOR_HALF + 0.4)), c2 = wingFrame(w, a0, s * (L.DOOR_HALF + 0.4)); wall('obsidian', c1.x, c1.z, c2.x, c2.z, 0, DRUM, 0.8);
      });
      var e1 = wingFrame(w, a1 + 0.4, -(hw + 0.4)), e2 = wingFrame(w, a1 + 0.4, hw + 0.4); wall('obsidian', e1.x, e1.z, e2.x, e2.z, 0, h, 0.8);
      var rc = wingFrame(w, (a0 + a1) / 2, 0); addTo('obsidian', xf(new THREE.BoxGeometry(hw * 2 + 1.6, 0.6, L.WING_LEN + 1), { x: rc.x, y: h + 0.3, z: rc.z, ry: wingRy(w) }));
      for (var k = 0; k < 4; k++) {                                                                   // skylight strips under the roof
        var sp = wingFrame(w, a0 + 7 + k * 10, 0); addTo(ac, xf(new THREE.BoxGeometry(hw * 1.5, 0.12, 1.2), { x: sp.x, y: h - 0.05, z: sp.z, ry: wingRy(w) }));
      }
      [-1, 1].forEach(function (s) { var rp = wingFrame(w, (a0 + a1) / 2, s * (hw + 0.8)); addTo(ac, xf(new THREE.BoxGeometry(0.25, 0.25, L.WING_LEN + 1.4), { x: rp.x, y: h + 0.62, z: rp.z, ry: wingRy(w) })); });
      var re = wingFrame(w, a1 + 0.9, 0); addTo(ac, xf(new THREE.BoxGeometry(hw * 2 + 1.8, 0.25, 0.25), { x: re.x, y: h + 0.62, z: re.z, ry: wingRy(w) }));
      [-1, 1].forEach(function (s) { var tp = wingFrame(w, (a0 + a1) / 2, s * (hw - 0.1)); addTo(ac, xf(new THREE.BoxGeometry(0.2, 0.2, L.WING_LEN - 2), { x: tp.x, y: 3.2, z: tp.z, ry: wingRy(w) })); });   // wall light line
    });

    // ── north apse (Dean's Atrium) and south gate ───────────────────────────────
    var ap = L.apse, apGap = Math.asin(ap.doorHalf / ap.r) * 180 / Math.PI;
    arc('obsidian', ap.cx, ap.cz, ap.r + 0.4, 180 + apGap, 540 - apGap, 0, ap.h, 0.9);
    [-1, 1].forEach(function (s) { wall('obsidian', s * (ap.doorHalf + 0.4), ap.doorStartZ, s * (ap.doorHalf + 0.4), ap.doorEndZ, 0, DRUM, 0.8); });
    var apseDome = new THREE.SphereGeometry(ap.r + 0.4, 48, 16, 0, TAU, 0, Math.PI / 2);
    addTo('glass', xf(apseDome.clone(), { x: ap.cx, y: ap.h, z: ap.cz, sy: 0.55 })); addTo('wire', xf(apseDome.clone(), { x: ap.cx, y: ap.h, z: ap.cz, sy: 0.55 })); apseDome.dispose();
    addTo('em-e8c45c', xf(new THREE.TorusGeometry(ap.r * 0.55, 0.25, 8, 64), { x: ap.cx, y: ap.h + 3.6, z: ap.cz, rx: Math.PI / 2 }));
    addTo('em-e8c45c', xf(new THREE.TorusGeometry(ap.r + 0.4, 0.14, 8, 96), { x: ap.cx, y: ap.h, z: ap.cz, rx: Math.PI / 2 }));
    var g = L.gate;
    [-1, 1].forEach(function (s) { wall('obsidian', s * (g.halfW + 0.4), R - 3, s * (g.halfW + 0.4), g.endZ, 0, g.h, 0.8); });
    addTo('obsidian', xf(new THREE.BoxGeometry(g.halfW * 2 + 1.6, 0.6, g.endZ - (R - 3)), { y: g.h + 0.3, z: (g.endZ + R - 3) / 2 }));
    [-1, 1].forEach(function (s) { addTo('em-00ff9c', xf(new THREE.BoxGeometry(0.7, g.h, 0.9), { x: s * (g.halfW + 0.3), y: g.h / 2, z: g.endZ })); });
    addTo('em-00ff9c', xf(new THREE.BoxGeometry(g.halfW * 2 + 1.6, 0.8, 0.9), { y: g.h, z: g.endZ }));       // the exit arch
    for (var gk = 0; gk < 4; gk++) addTo('em-00ff9c', xf(new THREE.BoxGeometry(g.halfW * 1.4, 0.1, 1), { y: g.h - 0.2, z: R + 5 + gk * 7 }));

    // ── columns (instanced) ─────────────────────────────────────────────────────
    var colAngles = []; for (var ci = 0; ci < 24; ci++) { var ca = ci * 15 + 7.5; var near = doors.some(function (d) { return Math.abs(((ca - d.a + 540) % 360) - 180) < d.half + 5; }); if (!near) colAngles.push(ca); }
    var dummy = new THREE.Object3D();
    var colGeo = new THREE.CylinderGeometry(0.6, 0.72, DRUM, 12), bandGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.3, 12);
    var cols = new THREE.InstancedMesh(colGeo, mats.obsidian, colAngles.length), bands = new THREE.InstancedMesh(bandGeo, em(0x00ff9c), colAngles.length * 2);
    cols.name = 'columns'; bands.name = 'column-bands';
    colAngles.forEach(function (a, i) {
      var p = polar(a, R - 1.6); dummy.position.set(p.x, DRUM / 2, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); cols.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 10.5, p.z); dummy.updateMatrix(); bands.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(p.x, 1.2, p.z); dummy.updateMatrix(); bands.setMatrixAt(i * 2 + 1, dummy.matrix);
    });
    rootG.add(cols); rootG.add(bands);

    // ── central dais with the skill-tree hologram ───────────────────────────────
    addTo('obsidian', xf(new THREE.CylinderGeometry(7, 7.4, 0.9, 48), { y: 0.45 }));
    addTo('em-00ff9c', xf(new THREE.TorusGeometry(7.05, 0.12, 8, 96), { y: 0.92, rx: Math.PI / 2 }));
    addTo('obsidian', xf(new THREE.CylinderGeometry(3, 3.4, 1.4, 32), { y: 1.1 }));
    var tree = new THREE.Group(); tree.name = 'dais:tree'; tree.position.y = 7; rootG.add(tree);
    var treeRings = [2.6, 3.6, 4.7].map(function (r, i) {
      var m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 96), em(i === 1 ? 0xe8c45c : 0x00ff9c)); m.rotation.set(i * 0.9, i * 0.5, 0); tree.add(m); return m;
    });
    var core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), em(0x5fe0ff)); tree.add(core);
    var nodeGeo = new THREE.OctahedronGeometry(0.3), nodes = new THREE.InstancedMesh(nodeGeo, em(0xf0d27a), 14); nodes.name = 'tree-nodes';
    for (var ni = 0; ni < 14; ni++) { var na = ni / 14 * TAU, nr = 2.6 + (ni % 3) * 1.05; dummy.position.set(Math.cos(na) * nr, Math.sin(ni * 1.7) * 1.4, Math.sin(na) * nr); dummy.rotation.set(na, na, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); nodes.setMatrixAt(ni, dummy.matrix); }
    tree.add(nodes);
    var orbit = new THREE.Group(); orbit.name = 'orbit-ring'; orbit.position.y = DRUM + 6; rootG.add(orbit);
    orbit.add(new THREE.Mesh(new THREE.TorusGeometry(25, 0.32, 8, 128), em(0xe8c45c)).rotateX(Math.PI / 2));
    var glyphs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.9, 0.2), em(0x00ff9c), 24); glyphs.name = 'orbit-glyphs';
    for (var gi = 0; gi < 24; gi++) { var ga = gi / 24 * TAU; dummy.position.set(Math.cos(ga) * 25, 0, Math.sin(ga) * 25); dummy.rotation.set(0, -ga + Math.PI / 2, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); glyphs.setMatrixAt(gi, dummy.matrix); }
    orbit.add(glyphs);

    // ── exam pods (instanced) ───────────────────────────────────────────────────
    var podBodies = L.colliders.filter(function (c) { return c.tag === 'pod'; });
    var podGeo = new THREE.CylinderGeometry(1.5, 1.7, 2.2, 24), canopyGeo = new THREE.SphereGeometry(1.5, 24, 12, 0, TAU, 0, Math.PI / 2), podRingGeo = new THREE.TorusGeometry(1.55, 0.06, 8, 48);
    var podMat = std('pod-glow', 0x070a0d, { emissive: 0x00ff9c, ei: 1, rough: 0.3 });
    var pods = new THREE.InstancedMesh(podGeo, mats.obsidian, podBodies.length), canopies = new THREE.InstancedMesh(canopyGeo, mats.glass, podBodies.length), podRings = new THREE.InstancedMesh(podRingGeo, podMat, podBodies.length * 2);
    pods.name = 'exam-pods'; canopies.name = 'pod-canopies';
    podBodies.forEach(function (b, i) {
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set(b.x, 1.1, b.z); dummy.updateMatrix(); pods.setMatrixAt(i, dummy.matrix);
      dummy.position.set(b.x, 2.2, b.z); dummy.updateMatrix(); canopies.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.position.set(b.x, 2.2, b.z); dummy.updateMatrix(); podRings.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(b.x, 0.25, b.z); dummy.updateMatrix(); podRings.setMatrixAt(i * 2 + 1, dummy.matrix);
    });
    rootG.add(pods); rootG.add(canopies); rootG.add(podRings);

    // ── wall boards in the rotunda ──────────────────────────────────────────────
    function labelTex(text, color) {
      if (typeof document === 'undefined') return null;
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; var cx = cv.getContext('2d');
      cx.fillStyle = 'rgba(6,8,11,0.78)'; cx.fillRect(0, 0, 512, 128); cx.strokeStyle = '#' + ('000000' + color.toString(16)).slice(-6); cx.lineWidth = 4; cx.strokeRect(4, 4, 504, 120);
      cx.fillStyle = cx.strokeStyle; cx.font = 'bold 44px system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, 256, 66);
      var t = new THREE.CanvasTexture(cv); return t;
    }
    var labelMats = [];
    function board(kind, text, color, deg, r, y, w, h) {
      var p = polar(deg, r), tex = labelTex(text, color);
      var m = tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }) : new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35, depthWrite: false });
      labelMats.push(m); var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.name = 'board:' + kind;
      mesh.position.set(p.x, y, p.z); mesh.rotation.y = Math.atan2(-p.x, p.z) + Math.PI; rootG.add(mesh); return mesh;
    }
    board('directory', 'SKILL DIRECTORY', 0x5fe0ff, 240, R - 0.2, 6, 9, 4.5);
    board('teachers', 'HALL OF TEACHERS', 0xf0d27a, 60, R - 0.2, 6, 9, 4.5);
    board('trophy', 'TROPHY GALLERY', 0xe8c45c, 120, R - 0.2, 6, 9, 4.5);
    board('navi', 'NAVI', 0x00ff9c, 346, R - 0.2, 5, 4, 2);

    // ── teaching posters (owner refs 2026-10-03: thinking standards, logic types, thinking maps, knowledge map, organisers) ──
    // Drawn on canvas in SHADDAI colours with our own wording (crisp text; no AI lettering). One opaque draw each.
    var POSTERS = [
      { t: 'THE NINE STANDARDS', s: 'of clear thinking', cards: [['CLARITY', '#FF1E1E', 'Can you show an example?'], ['ACCURACY', '#FF6A00', 'How do we check it?'], ['PRECISION', '#FFC107', 'Can you be more exact?'], ['RELEVANCE', '#39FF14', 'Does it answer the question?'], ['DEPTH', '#10B981', 'What makes this hard?'], ['BREADTH', '#00D4FF', 'Who sees it differently?'], ['LOGIC', '#1E3A8A', 'Does it follow the evidence?'], ['FAIRNESS', '#FF69B4', 'Facts, or only opinion?'], ['SIGNIFICANCE', '#7C3AED', 'What matters most here?']] },
      { t: 'SEVEN WAYS TO REASON', s: 'think deeper · decide smarter', cards: [['DEDUCTIVE', '#00D4FF', 'Rule → case'], ['INDUCTIVE', '#10B981', 'Cases → rule'], ['ABDUCTIVE', '#FFC107', 'Clues → best guess'], ['MODAL', '#7C3AED', 'Possible vs necessary'], ['FUZZY', '#FF69B4', 'Truth on a spectrum'], ['DIALECTICAL', '#FF6A00', 'Thesis ⇄ antithesis → synthesis'], ['INFORMAL', '#E8C45C', 'Claim → argument → conclusion']] },
      { t: 'THINKING MAPS', s: 'pick the map for the question', cards: [['CIRCLE', '#00FF9C', 'Define in context'], ['BUBBLE', '#00D4FF', 'Describe qualities'], ['DOUBLE BUBBLE', '#7C3AED', 'Compare + contrast'], ['TREE', '#10B981', 'Classify'], ['BRACE', '#FFC107', 'Part → whole'], ['FLOW', '#FF6A00', 'Sequence'], ['MULTI-FLOW', '#FF1E1E', 'Cause + effect'], ['BRIDGE', '#E8C45C', 'Analogies']] },
      { t: 'MAP OF KNOWLEDGE', s: 'after the Encyclopédie tree, 1751', cards: [['MEMORY', '#00D4FF', 'History: sacred, civil, natural'], ['REASON', '#00FF9C', 'Philosophy: logic, ethics, nature'], ['IMAGINATION', '#E8C45C', 'Poetry, music, painting, architecture'], ['SCIENCE OF MAN', '#10B981', 'Thinking, remembering, communicating'], ['SCIENCE OF NATURE', '#7C3AED', 'Mathematics, physics, astronomy'], ['ARTS + CRAFTS', '#FF6A00', 'Forge, glass, stone, silk, gold']] },
      { t: 'GRAPHIC ORGANISERS', s: 'make thinking visible', cards: [['GROUP', '#00D4FF', 'Spider · cluster · concept map'], ['SEQUENCE', '#10B981', 'Cycle · flow chart · spiral'], ['CAUSE', '#FF6A00', 'Futures wheel · bridge · fishbone'], ['ANALYSE', '#7C3AED', 'Y chart · T chart · Venn'], ['DECIDE', '#E8C45C', 'Scales · storyboard · pulse graph']] }
    ];
    function posterTex(P) {
      if (typeof document === 'undefined') return null;
      var W = 768, H = 1056, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
      c.fillStyle = '#06080b'; c.fillRect(0, 0, W, H); c.strokeStyle = '#e8c45c'; c.lineWidth = 6; c.strokeRect(10, 10, W - 20, H - 20);
      c.textAlign = 'center'; c.fillStyle = '#e8c45c'; c.font = 'bold 54px Georgia, serif'; c.fillText(P.t, W / 2, 92);
      c.fillStyle = '#00ff9c'; c.font = 'italic 26px Georgia, serif'; c.fillText(P.s, W / 2, 132);
      var cols = P.cards.length > 6 ? 3 : 2, rows = Math.ceil(P.cards.length / cols), gx = 34, top = 168, cw = (W - gx * (cols + 1)) / cols, ch = (H - top - 40 - gx * (rows - 1)) / rows;
      P.cards.forEach(function (k, i) {
        var x = gx + (i % cols) * (cw + gx), y = top + Math.floor(i / cols) * (ch + gx);
        c.fillStyle = '#0d1218'; c.fillRect(x, y, cw, ch); c.fillStyle = k[1]; c.fillRect(x, y, cw, 8);
        c.font = 'bold ' + (cols === 3 ? 26 : 34) + 'px system-ui, sans-serif'; c.fillText(k[0], x + cw / 2, y + ch * 0.42);
        c.fillStyle = '#dfe7ee'; c.font = (cols === 3 ? 19 : 24) + 'px system-ui, sans-serif';
        var words = k[2].split(' '), line = '', ly = y + ch * 0.42 + 40, maxW = cw - 24;
        words.forEach(function (wd) { var tst = line ? line + ' ' + wd : wd; if (c.measureText(tst).width > maxW && line) { c.fillText(line, x + cw / 2, ly); ly += 28; line = wd; } else line = tst; });
        if (line) c.fillText(line, x + cw / 2, ly);
      });
      var t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
    }
    var used = [240, 60, 120, 346], posterAngles = [20, 90, 150, 200, 280, 310, 170, 30, 0, 45, 75, 105, 135, 165, 185, 215, 255, 295, 325].filter(function (a) {
      var nearDoor = doors.some(function (d) { return Math.abs(((a - d.a + 540) % 360) - 180) < d.half + 6; });
      var nearBoard = used.some(function (u) { return Math.abs(((a - u + 540) % 360) - 180) < 14; });
      if (nearDoor || nearBoard) return false; used.push(a); return true;
    });
    POSTERS.forEach(function (P, i) {
      var a = posterAngles[i]; if (a == null) return;
      var p = polar(a, R - 0.25), tex = posterTex(P), m = tex ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshBasicMaterial({ color: 0x0d1218 });
      labelMats.push(m); var mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 7.7), m); mesh.name = 'board:poster-' + i;
      mesh.position.set(p.x, 4.6, p.z); mesh.rotation.y = Math.atan2(-p.x, p.z) + Math.PI; rootG.add(mesh);
    });
    var tdesk = polar(300, 31.5); addTo('obsidian', xf(new THREE.BoxGeometry(4.2, 1.1, 1.4), { x: tdesk.x, y: 0.55, z: tdesk.z, ry: -(300 * Math.PI / 180) }));
    addTo('em-2dd4a0', xf(new THREE.BoxGeometry(3.6, 0.06, 0.8), { x: tdesk.x, y: 1.13, z: tdesk.z, ry: -(300 * Math.PI / 180) }));
    board('trading', 'TRADING DESK · PAPER ONLY', 0x2dd4a0, 300, R - 0.2, 6, 9, 4.5);

    // ── wing furniture ──────────────────────────────────────────────────────────
    var W = {}; L.wings.forEach(function (w) { W[w.id] = w; });
    var animMeshes = [];                                                                            // { mesh, ax, sp } rotated each tick
    // lecterns and press counters
    L.colliders.forEach(function (c) {
      if (c.tag === 'lectern') { addTo('obsidian', xf(new THREE.CylinderGeometry(1.1, 1.3, 1.1, 24), { x: c.x, y: 0.55, z: c.z })); addTo('em-' + KIND_COLOR.lectern.toString(16), xf(new THREE.TorusGeometry(1.15, 0.05, 8, 32), { x: c.x, y: 1.12, z: c.z, rx: Math.PI / 2 })); }
    });
    var bookGeo = new THREE.BoxGeometry(0.28, 0.9, 0.7), books = []; // spines for the library and press shelves, positioned below
    L.colliders.forEach(function (c) {
      if (c.tag === 'press') {
        var wref = L.wings.find(function (w) { return Math.abs(Math.atan2(c.x, -c.z) - w.rot) < 1.2 && Math.hypot(c.x, c.z) > 38; });
        addTo('obsidian', xf(new THREE.BoxGeometry(c.hx * 2, 1.1, c.hz * 2), { x: c.x, y: 0.55, z: c.z, ry: -c.rot + 0 }));
        addTo('em-e8c45c', xf(new THREE.BoxGeometry(c.hx * 1.8, 0.05, c.hz * 1.6), { x: c.x, y: 1.12, z: c.z, ry: -c.rot }));
        for (var b = 0; b < 5; b++) books.push({ x: c.x + Math.cos(c.rot) * 0 + (b - 2) * 0.55 * Math.sin(c.rot), z: c.z + (b - 2) * 0.55 * -Math.cos(c.rot), y: 1.55, ry: -c.rot, h: 0.55 + (b % 3) * 0.12 });
        void wref;
      }
    });
    // library shelves and books
    L.colliders.filter(function (c) { return c.tag === 'shelves'; }).forEach(function (c) {
      addTo('obsidian', xf(new THREE.BoxGeometry(c.hx * 2, 4.4, c.hz * 2), { x: c.x, y: 2.2, z: c.z, ry: -c.rot }));
      var ca = Math.cos(c.rot), sa = Math.sin(c.rot);
      for (var row = 0; row < 4; row++) for (var bi = 0; bi < 38; bi++) {
        var along = -c.hx + 0.6 + bi * 0.72, across = (c.z * ca - c.x * sa) > 0 ? -c.hz - 0.0 : c.hz;
        void across; books.push({ x: c.x + sa * along + ca * (c.hz + 0.05) * (L.local(W.library, c.x, c.z).across > 0 ? -1 : 1), z: c.z - ca * along + sa * (c.hz + 0.05) * (L.local(W.library, c.x, c.z).across > 0 ? -1 : 1), y: 0.7 + row * 1.0, ry: -c.rot, h: 0.75 + ((bi * 7 + row * 3) % 5) * 0.04 });
      }
    });
    var bookMesh = new THREE.InstancedMesh(bookGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 }), books.length); bookMesh.name = 'books'; mats.books = bookMesh.material; bookMesh.material.name = 'books';
    var bookCols = [0x7a3b2e, 0x2e5d7a, 0x5a7a2e, 0x7a6a2e, 0x4a2e7a, 0x2e7a5f, 0x8a4a3a, 0x3a5a8a], tmpC = new THREE.Color();
    books.forEach(function (b, i) { dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, b.ry, 0); dummy.scale.set(1, b.h / 0.9, 1); dummy.updateMatrix(); bookMesh.setMatrixAt(i, dummy.matrix); bookMesh.setColorAt(i, tmpC.setHex(bookCols[(i * 5 + (i >> 3)) % bookCols.length])); });
    rootG.add(bookMesh);
    // observatory orrery
    L.colliders.filter(function (c) { return c.tag === 'orrery'; }).forEach(function (c) {
      var og = new THREE.Group(); og.name = 'orrery'; og.position.set(c.x, 2.4, c.z); rootG.add(og);
      og.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), em(0xffd27a)));
      [1.8, 2.6, 3.3].forEach(function (r, i) {
        var ring = new THREE.Group(); ring.rotation.set(i * 0.35, 0, i * 0.2); og.add(ring); ring.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 64), em(0x5fe0ff)).rotateX(Math.PI / 2));
        var planet = new THREE.Mesh(new THREE.SphereGeometry(0.2 + i * 0.05, 12, 10), em(i === 1 ? 0xff9f5f : 0x9be8ff)); planet.position.set(r, 0, 0); ring.add(planet); animMeshes.push({ mesh: ring, ax: 'y', sp: 0.5 - i * 0.14 });
      });
      addTo('obsidian', xf(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 32), { x: c.x, y: 0.3, z: c.z }));
    });
    // museum plinths with floating works
    L.colliders.filter(function (c) { return c.tag === 'plinth'; }).forEach(function (c, i) {
      addTo('obsidian', xf(new THREE.CylinderGeometry(0.9, 1.1, 1.0, 20), { x: c.x, y: 0.5, z: c.z }));
      var work = new THREE.Mesh(i ? new THREE.TorusKnotGeometry(0.5, 0.16, 64, 8) : new THREE.IcosahedronGeometry(0.62, 0), em(i ? 0x00ff9c : 0xe8c45c)); work.position.set(c.x, 2.3, c.z); rootG.add(work); animMeshes.push({ mesh: work, ax: 'y', sp: 0.6 + i * 0.2 });
    });
    // forge workbenches and terminals
    L.colliders.filter(function (c) { return c.tag === 'workbench'; }).forEach(function (c) {
      addTo('obsidian', xf(new THREE.BoxGeometry(c.hx * 2, 1.0, c.hz * 2), { x: c.x, y: 0.5, z: c.z, ry: -c.rot }));
      addTo('em-4da3ff', xf(new THREE.BoxGeometry(c.hx * 1.9, 0.05, c.hz * 0.6), { x: c.x, y: 1.03, z: c.z, ry: -c.rot }));
    });
    var imp = L.stations.find(function (s) { return s.kind === 'import'; });
    if (imp) { addTo('obsidian', xf(new THREE.BoxGeometry(1.4, 1.5, 1.4), { x: imp.x + L.wings[3].nx * -2.4, y: 0.75, z: imp.z + L.wings[3].nz * -2.4 })); addTo('em-4da3ff', xf(new THREE.BoxGeometry(1.0, 0.7, 0.05), { x: imp.x + L.wings[3].nx * -2.4, y: 1.5, z: imp.z + L.wings[3].nz * -2.4, ry: wingRy(L.wings[3]) })); }
    // sound studio stage with an equalizer
    var stage = L.colliders.find(function (c) { return c.tag === 'stage'; });
    var eq = null, EQN = 24, eqBase = [];
    if (stage) {
      addTo('obsidian', xf(new THREE.BoxGeometry(stage.hx * 2, 0.9, stage.hz * 2), { x: stage.x, y: 0.45, z: stage.z, ry: -stage.rot }));
      addTo('em-b06bff', xf(new THREE.BoxGeometry(stage.hx * 2.1, 0.06, stage.hz * 2.1), { x: stage.x, y: 0.92, z: stage.z, ry: -stage.rot }));
      var barGeo = new THREE.BoxGeometry(0.5, 1, 0.5); barGeo.translate(0, 0.5, 0);
      eq = new THREE.InstancedMesh(barGeo, em(0xb06bff), EQN); eq.name = 'equalizer';
      for (var ei = 0; ei < EQN; ei++) { var wp = L.at(W.music, 40 + 41, (ei - (EQN - 1) / 2) * 0.85); eqBase.push(wp); dummy.position.set(wp.x, 1.0, wp.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); eq.setMatrixAt(ei, dummy.matrix); }
      rootG.add(eq);
    }
    // council desks and the locked admin door
    [-5, 5].forEach(function (c) { var dp = L.at(W.council, 40 + 30, c); addTo('obsidian', xf(new THREE.BoxGeometry(5, 0.9, 1.6), { x: dp.x, y: 0.45, z: dp.z, ry: wingRy(W.council) + Math.PI / 2 })); addTo('em-ff6a5a', xf(new THREE.BoxGeometry(4.6, 0.05, 0.4), { x: dp.x, y: 0.93, z: dp.z, ry: wingRy(W.council) + Math.PI / 2 })); });
    var ad = L.at(W.council, 40 + 43.6, 0); addTo('em-ff6a5a', xf(new THREE.BoxGeometry(7, 0.18, 0.2), { x: ad.x, y: 6, z: ad.z, ry: wingRy(W.council) + Math.PI / 2 }));
    // student benches (instanced) in every faculty wing
    var benchSpots = [];
    L.wings.forEach(function (w) { if (!w.agent || w.id === 'forge') return; [-1, 1].forEach(function (s) { for (var r = 0; r < 3; r++) benchSpots.push({ p: L.at(w, 40 + 9 + r * 4.5, s * 4.2), w: w }); }); });
    var benches = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 0.5, 0.9), mats.obsidian, benchSpots.length); benches.name = 'benches';
    benchSpots.forEach(function (b, i) { dummy.position.set(b.p.x, 0.25, b.p.z); dummy.rotation.set(0, wingRy(b.w) + Math.PI / 2, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); benches.setMatrixAt(i, dummy.matrix); });
    rootG.add(benches);
    // ceiling stars in the observatory
    var starN = 160, starPos = new Float32Array(starN * 3), seed = 12345;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var si = 0; si < starN; si++) { var spp = L.at(W.observatory, 40 + rnd() * L.WING_LEN, (rnd() - 0.5) * W.observatory.halfW * 2); starPos[si * 3] = spp.x; starPos[si * 3 + 1] = W.observatory.h - 0.4 - rnd() * 0.3; starPos[si * 3 + 2] = spp.z; }
    var starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfeaff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })); stars.name = 'stars'; rootG.add(stars);

    // ── faculty figures (hologram avatars) ──────────────────────────────────────
    var figures = [];
    function figure(agent, x, z, ry) {
      var c = L.AGENT_COLOR[agent], parts2 = [];
      parts2.push(xf(new THREE.CylinderGeometry(0.3, 0.42, 1.2, 14), { y: 0.62 }));
      parts2.push(xf(new THREE.SphereGeometry(0.27, 14, 10), { y: 1.5 }));
      parts2.push(xf(new THREE.TorusGeometry(0.42, 0.03, 6, 24), { y: 2.0, rx: Math.PI / 2 }));
      parts2.push(xf(new THREE.TorusGeometry(0.85, 0.04, 6, 32), { y: 0.05, rx: Math.PI / 2 }));
      var m = new THREE.Mesh(merge(parts2), em(c)); m.name = 'npc:' + agent; m.position.set(x, 0, z); m.rotation.y = ry; rootG.add(m); figures.push({ mesh: m, phase: figures.length * 1.3 });
      var tex = labelTex(agent, c);
      if (tex) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(3.6, 0.9, 1); sp.position.set(0, 2.9, 0); sp.name = 'label:' + agent; m.add(sp); labelMats.push(sp.material); }
    }
    L.stations.filter(function (s) { return s.agent && (s.kind === 'lectern' || s.kind === 'trading'); }).forEach(function (s) {
      if (s.kind === 'trading') { var tp = polar(300, 32.8); figure(s.agent, tp.x, tp.z, -(300 * Math.PI / 180) + Math.PI + 0); return; }
      if (s.id === 'lectern-deans') { figure(s.agent, s.x, s.z - 3.8, 0); return; }
      var w = W[s.wing]; figure(s.agent, s.x + w.dx * 4.8, s.z + w.dz * 4.8, Math.atan2(-w.dx, -w.dz));
    });

    // the Dean's crown hologram over the Dean's lectern
    var crown = new THREE.Group(); crown.name = 'dean:crown'; crown.position.set(L.apse.cx, 9.5, L.apse.cz); rootG.add(crown);
    var crownRings = [3.4, 2.5, 1.7].map(function (r, i) { var m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 8, 64), em(i === 1 ? 0xfff0b0 : 0xe8c45c)); m.rotation.set(Math.PI / 2 - i * 0.5, i * 0.7, 0); crown.add(m); return m; });
    crown.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9), em(0xfff0b0)));
    addTo('beam', xf(new THREE.CylinderGeometry(0.35, 0.7, 20, 14, 1, true), { x: L.apse.cx, y: 10, z: L.apse.cz }));
    [-1, 1].forEach(function (sd) { addTo('em-e8c45c', xf(new THREE.BoxGeometry(0.5, 14, 0.5), { x: L.apse.cx + sd * 9, y: 7, z: L.apse.cz - 3 })); });

    // ── station rings (one instanced mesh) ──────────────────────────────────────
    var ringGeo = new THREE.RingGeometry(0.78, 1, 40); ringGeo.rotateX(-Math.PI / 2);
    var sRings = new THREE.InstancedMesh(ringGeo, ringMat, L.stations.length); sRings.name = 'station-rings';
    L.stations.forEach(function (s, i) {
      var col = s.agent && s.kind === 'lectern' ? L.AGENT_COLOR[s.agent] : (KIND_COLOR[s.kind] || 0x00ff9c);
      dummy.position.set(s.x, 0.05, s.z); dummy.rotation.set(0, 0, 0); var sc = Math.min(2.6, s.r * 0.62); dummy.scale.set(sc, 1, sc); dummy.updateMatrix(); sRings.setMatrixAt(i, dummy.matrix); sRings.setColorAt(i, tmpC.setHex(col));
    });
    sRings.frustumCulled = false; rootG.add(sRings);
    // wing name signs above each doorway (browser only: they need a canvas)
    L.wings.forEach(function (w) { var p = L.at(w, R + 1.5, 0), tex = labelTex(w.label.toUpperCase(), w.accent); if (!tex) return; var mm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }); labelMats.push(mm); var sg = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), mm); sg.position.set(p.x, 11.6, p.z); sg.rotation.y = Math.atan2(-w.dx, w.dz) + Math.PI; sg.name = 'sign:' + w.id; rootG.add(sg); });

    // ── motes ───────────────────────────────────────────────────────────────────
    var MN = 90, mPos = new Float32Array(MN * 3), mVel = new Float32Array(MN * 3);
    for (var mi = 0; mi < MN; mi++) { var ma = rnd() * TAU, mr = Math.sqrt(rnd()) * (R - 2); mPos[mi * 3] = Math.cos(ma) * mr; mPos[mi * 3 + 1] = 1 + rnd() * 24; mPos[mi * 3 + 2] = Math.sin(ma) * mr; mVel[mi * 3] = (rnd() - 0.5) * 0.004; mVel[mi * 3 + 1] = 0.004 + rnd() * 0.006; mVel[mi * 3 + 2] = (rnd() - 0.5) * 0.004; }
    var mGeo = new THREE.BufferGeometry(); mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    var motes = new THREE.Points(mGeo, new THREE.PointsMaterial({ color: 0x9bffe0, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); motes.name = 'motes'; motes.frustumCulled = false; rootG.add(motes);

    // ── merge static parts: one mesh per material ───────────────────────────────
    Object.keys(parts).forEach(function (name) {
      var mat = mats[name] || (name.indexOf('em-') === 0 ? em(parseInt(name.slice(3), 16)) : null);
      if (!mat) throw new Error('no material for part ' + name);
      var mesh = new THREE.Mesh(merge(parts[name]), mat); mesh.name = 'static:' + name; rootG.add(mesh);
    });

    // ── lights (≤ 8) ────────────────────────────────────────────────────────────
    var hemi = new THREE.HemisphereLight(0xa8fff0, 0x0c1a1a, 1.5); rootG.add(hemi);
    var fill = new THREE.AmbientLight(0x3f6a60, 1.7); rootG.add(fill);
    var key = new THREE.PointLight(0xbfffec, 260, 95 * U, 1.0); key.position.set(0, DRUM + 4, 0); group.add(key); key.position.set(X0, DRUM * U + 4 * U, Z0);
    var accentLights = [];
    function addLight(color, i, m, wx, wy, wz) { var l = new THREE.PointLight(color, i, m * U, 1.0); l.position.set(X0 + wx * U, wy * U, Z0 + wz * U); group.add(l); accentLights.push(l); return l; }
    addLight(L.AGENT_COLOR.SHADDAI, 170, 45, L.apse.cx, 9, L.apse.cz);
    [60, 180, 300].forEach(function (deg, i) { var p = polar(deg, 66); addLight([0x8fe9ff, 0xaad0ff, 0xffa090][i], 210, 70, p.x, 9, p.z); });
    var qName = 'HIGH', baseIntensity = accentLights.map(function (l) { return l.intensity; });
    function setQuality(name) {
      name = String(name || '').toUpperCase(); if (!Object.prototype.hasOwnProperty.call(QUALITY, name)) return qName;
      qName = name; var q = QUALITY[name];
      accentLights.forEach(function (l, i) { var on = q >= 3 || (q === 2 && i % 2 === 0); l.visible = on; l.intensity = on ? baseIntensity[i] : 0; });
      motes.visible = q >= 2; return qName;
    }

    // ── world-space API ─────────────────────────────────────────────────────────
    function toLocalX(x) { return (x - X0) / U; } function toLocalZ(z) { return (z - Z0) / U; }
    var spawnWorld = { x: X0 + L.spawn.x * U, z: Z0 + L.spawn.z * U };
    var stations = L.stations.map(function (s) { return { id: s.id, kind: s.kind, room: s.room, label: s.label, agent: s.agent || null, wing: s.wing || null, locked: s.locked || null, x: X0 + s.x * U, z: Z0 + s.z * U, r: s.r * U, local: { x: s.x, z: s.z } }; });
    function nearestStation(x, z) {
      var best = null, bd = Infinity;
      for (var i = 0; i < stations.length; i++) { var s = stations[i], d = Math.hypot(x - s.x, z - s.z); if (d <= s.r && d < bd) { best = s; bd = d; } }
      return best;
    }
    function contains(x, z) { return L.contains(toLocalX(x), toLocalZ(z)); }
    function heightAt(x, z) { return L.heightAt(toLocalX(x), toLocalZ(z)); }
    function resolve(pos, px, pz) {
      var r = L.resolve({ x: toLocalX(pos.x), z: toLocalZ(pos.z) }, toLocalX(px), toLocalZ(pz));
      var nx = X0 + r.x * U, nz = Z0 + r.z * U;
      if (Math.abs(nx - pos.x) < 1e-6 && Math.abs(nz - pos.z) < 1e-6) return false;
      pos.x = nx; pos.z = nz; return true;
    }

    // ── per-frame animation (allocation-free) ───────────────────────────────────
    var clock = 0, podGlow = podMat, eqDummy = new THREE.Object3D();
    function tick(dt) {
      if (!(dt >= 0)) dt = 0; if (dt > 0.25) dt = 0.25; clock += dt;
      orbit.rotation.y += dt * 0.12;
      crown.rotation.y += dt * 0.25; crownRings[0].rotation.z += dt * 0.6; crownRings[1].rotation.x += dt * 0.45; crownRings[2].rotation.y += dt * 0.7;
      tree.rotation.y += dt * 0.3; tree.position.y = 7 + Math.sin(clock * 0.8) * 0.25;
      treeRings[0].rotation.x += dt * 0.5; treeRings[1].rotation.y += dt * 0.35; treeRings[2].rotation.z += dt * 0.28; core.rotation.y += dt * 0.9;
      var i;
      for (i = 0; i < animMeshes.length; i++) animMeshes[i].mesh.rotation[animMeshes[i].ax] += animMeshes[i].sp * dt;
      for (i = 0; i < figures.length; i++) figures[i].mesh.position.y = 0.06 * Math.sin(clock * 1.2 + figures[i].phase);
      podGlow.emissiveIntensity = 0.75 + 0.35 * Math.sin(clock * 1.6);
      ringMat.opacity = 0.62 + 0.23 * Math.sin(clock * 2.0);
      if (eq) {
        for (i = 0; i < EQN; i++) { var h = 0.5 + 2.4 * Math.abs(Math.sin(clock * 2.1 + i * 0.7)) * (0.6 + 0.4 * Math.sin(clock * 0.9 + i)); eqDummy.position.set(eqBase[i].x, 1.0, eqBase[i].z); eqDummy.scale.set(1, h, 1); eqDummy.updateMatrix(); eq.setMatrixAt(i, eqDummy.matrix); }
        eq.instanceMatrix.needsUpdate = true;
      }
      if (motes.visible) {
        var pa = mGeo.attributes.position.array;
        for (i = 0; i < MN; i++) { pa[i * 3] += mVel[i * 3]; pa[i * 3 + 1] += mVel[i * 3 + 1]; pa[i * 3 + 2] += mVel[i * 3 + 2]; if (pa[i * 3 + 1] > 26) pa[i * 3 + 1] = 1; }
        mGeo.attributes.position.needsUpdate = true;
      }
    }

    var disposed = false;
    function dispose() {
      if (disposed) return; disposed = true;
      if (group.parent) group.parent.remove(group);
      var geos = new Set(), ms = new Set();
      group.traverse(function (o) { if (o.geometry) geos.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { ms.add(m); }); });
      geos.forEach(function (gg) { gg.dispose(); });
      ms.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
    }

    if (opts.scene) opts.scene.add(group);
    setQuality(opts.quality || 'HIGH');
    var api = {
      group: group, code: 'ATHENAEUM', root: rootG, layout: L, stations: stations, dims: { U: U, R: R },
      origin: { x: spawnWorld.x, z: spawnWorld.z - 28 },        // world-interiors spawns the player at origin.z + 28
      contains: contains, heightAt: heightAt, resolve: resolve, nearestStation: nearestStation,
      tick: tick, setQuality: setQuality, quality: function () { return qName; }, dispose: dispose
    };
    return api;
  }

  var out = { build: build, KIND_COLOR: KIND_COLOR };
  if (typeof module === 'object' && module.exports) module.exports = out;
  if (root) root.buildAthenaeumCampus = build;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
