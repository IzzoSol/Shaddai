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

  var KIND_COLOR = { pods: 0x00ff9c, press: 0xe8c45c, directory: 0x5fe0ff, teachers: 0xf0d27a, trophy: 0xe8c45c, trading: 0x2dd4a0, import: 0x4da3ff, admin: 0xff6a5a, navi: 0x00ff9c, dais: 0x00ff9c, portal: 0x2bff88, lectern: 0x00ff9c };
  var QUALITY = { POTATO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, ULTRA: 3 };

  // soft round points when WorldVFX is loaded; plain PointsMaterial otherwise (tests / other pages)
  function _pm(T, o, legacy) { return (typeof WorldVFX !== 'undefined' && WorldVFX.softPointsMaterial) ? WorldVFX.softPointsMaterial(T, o) : new T.PointsMaterial(legacy); }

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
    // (2026-10-15) with the Blender K15 rotunda coming (shaddai_athenaeum_rotunda_v01.glb) these pieces merge into their own '#rot' meshes so they can
    // hide when the kit lands; ?athkit=0 or no loader = the code rotunda as before.
    var ROTKIT = !!(root.__GLTFLoaderClass && !(typeof location !== 'undefined' && /[?&]athkit=0/.test(location.search || '')) && (typeof location !== 'undefined' && /[?&]athk33=0/.test(location.search || ''))), _addTo0 = addTo;   // K15 only when K33 is switched off
    if (ROTKIT) addTo = function (n, g) { _addTo0(n + '#rot', g); };
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

    addTo = _addTo0;
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
    var stars = new THREE.Points(starGeo, _pm(THREE, { color: 0xbfeaff, size: 0.22, opacity: 0.9, additive: false }, { color: 0xbfeaff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })); stars.name = 'stars'; rootG.add(stars);

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
    var motes = new THREE.Points(mGeo, _pm(THREE, { color: 0x9bffe0, size: 0.16, opacity: 0.55, additive: true }, { color: 0x9bffe0, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); motes.name = 'motes'; motes.frustumCulled = false; rootG.add(motes);

    // ── merge static parts: one mesh per material ───────────────────────────────
    var rotMeshes = [];
    Object.keys(parts).forEach(function (name) {
      var base = name.split('#')[0];
      var mat = mats[base] || (base.indexOf('em-') === 0 ? em(parseInt(base.slice(3), 16)) : null);
      if (!mat) throw new Error('no material for part ' + name);
      var mesh = new THREE.Mesh(merge(parts[name]), mat); mesh.name = 'static:' + name; rootG.add(mesh);
      if (name !== base) rotMeshes.push(mesh);
    });

    // ── POSTERS (2026-10-11): six ORIGINAL code-drawn posters in one atlas (1 draw call): robot-themed art in emerald/gold, hung between the rotunda doorways and at the end of each wing.
    //    Inspired by the owner's reference robot art, not copies of it.
    (function posters() {
      if (typeof document === 'undefined') return;
      var CW = 512, CH = 640, COLS = 3, ROWS = 2, cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS; var g = cv.getContext('2d');
      function cell(i, fn) { g.save(); g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH); g.beginPath(); g.rect(0, 0, CW, CH); g.clip(); fn(); g.restore(); }
      function title(t, sub) { g.fillStyle = 'rgba(8,16,16,.72)'; g.fillRect(0, CH - 96, CW, 96); g.fillStyle = '#e8c45c'; g.font = '800 34px Orbitron, Arial, sans-serif'; g.textAlign = 'center'; g.fillText(t, CW / 2, CH - 54); g.fillStyle = '#2bff88'; g.font = '600 18px Arial, sans-serif'; g.fillText(sub, CW / 2, CH - 24); g.strokeStyle = '#e8c45c'; g.lineWidth = 6; g.strokeRect(8, 8, CW - 16, CH - 16); }
      function sky(top, bot) { var gr = g.createLinearGradient(0, 0, 0, CH); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, CW, CH); }
      function stars(n, seed) { var r = seed; for (var i = 0; i < n; i++) { r = (r * 9301 + 49297) % 233280; var x = r / 233280 * CW; r = (r * 9301 + 49297) % 233280; var y = r / 233280 * CH * 0.8; g.fillStyle = 'rgba(255,255,255,' + (0.4 + (i % 5) * 0.12) + ')'; g.fillRect(x, y, 1 + (i % 3 === 0 ? 1 : 0), 1 + (i % 3 === 0 ? 1 : 0)); } }
      cell(0, function () { sky('#0a1030', '#1c2a5a'); stars(160, 7);
        g.fillStyle = '#5a2c12'; g.fillRect(CW - 120, 0, 70, CH); g.beginPath(); g.moveTo(CW - 120, 40); g.quadraticCurveTo(CW - 230, 100, CW - 260, 30); g.lineTo(CW - 120, 90); g.fill();
        g.fillStyle = '#12301a'; g.fillRect(0, CH - 220, CW, 130); g.fillStyle = '#f0b830'; g.beginPath(); g.arc(250, 320, 38, 0, 7); g.fill(); g.fillRect(212, 350, 82, 120);
        g.beginPath(); g.moveTo(212, 470); g.lineTo(150, 520); g.lineTo(330, 520); g.lineTo(294, 470); g.fill(); g.fillRect(150, 500, 220, 24);
        g.fillStyle = '#d8402a'; g.beginPath(); g.arc(262, 316, 9, 0, 7); g.fill(); title('LOOK UP', 'THE FIRST LESSON IS CURIOSITY'); });
      cell(1, function () { sky('#2b2f36', '#14161a');
        g.fillStyle = '#4a4036'; g.fillRect(190, 120, 132, 360); g.fillStyle = '#c8321e'; g.fillRect(150, 150, 60, 120); g.fillRect(302, 150, 60, 120); g.fillRect(205, 170, 102, 130);
        g.fillStyle = '#3a342c'; g.fillRect(205, 60, 102, 70); g.fillStyle = '#c8321e'; g.fillRect(215, 70, 82, 30); g.fillStyle = '#e8c45c'; g.fillRect(246, 80, 20, 8);
        g.fillStyle = '#c8321e'; g.fillRect(200, 300, 52, 160); g.fillRect(260, 300, 52, 160); g.fillStyle = '#2bff88'; g.fillRect(225, 210, 62, 10); title('FRAME-7', 'BUILT TO CARRY THE WORK'); });
      cell(2, function () { sky('#c8d0d8', '#8a96a2');
        g.fillStyle = '#16181c'; g.fillRect(150, 230, 212, 150); g.fillRect(246, 380, 20, 90); g.fillRect(190, 450, 132, 60);
        [190, 322].forEach(function (x) { g.fillStyle = '#9aa4ad'; g.beginPath(); g.arc(x, 280, 52, 0, 7); g.fill(); g.fillStyle = '#0a0c10'; g.beginPath(); g.arc(x, 280, 36, 0, 7); g.fill(); g.fillStyle = '#2bff88'; g.beginPath(); g.arc(x - 10, 270, 8, 0, 7); g.fill(); });
        g.fillStyle = '#e8c45c'; g.fillRect(120, 210, 270, 8); g.fillRect(246, 150, 20, 60); title('FIRST LIGHT', 'EVERY AGENT STARTS CURIOUS'); });
      cell(3, function () { sky('#f1e9d6', '#d9ccb0');
        g.strokeStyle = '#2a2a2a'; g.lineWidth = 4; g.fillStyle = '#e2dccb'; g.beginPath(); g.arc(250, 220, 52, 0, 7); g.fill(); g.stroke(); g.fillRect(205, 270, 100, 130); g.strokeRect(205, 270, 100, 130);
        g.beginPath(); g.moveTo(205, 400); g.lineTo(130, 470); g.lineTo(380, 470); g.lineTo(305, 400); g.stroke(); g.beginPath(); g.arc(150, 520, 38, 0, 7); g.fill(); g.stroke(); g.strokeRect(330, 480, 60, 60); g.strokeRect(300, 520, 40, 40);
        g.fillStyle = '#2a2a2a'; g.fillRect(228, 205, 18, 10); g.fillRect(268, 205, 18, 10); title('LEARNING TO PLAY', 'PRACTICE IS HOW SKILLS STICK'); });
      cell(4, function () { sky('#05140e', '#0a2a1c'); g.strokeStyle = 'rgba(43,255,136,.35)'; g.lineWidth = 2; for (var y = 40; y < CH - 120; y += 40) { g.beginPath(); g.moveTo(40, y); g.lineTo(CW - 40, y); g.stroke(); }
        g.fillStyle = '#2bff88'; g.font = '800 56px Orbitron, Arial, sans-serif'; g.textAlign = 'center'; ['BASELINE', 'LESSON', 'EXAM'].forEach(function (t, i) { g.fillText(t, CW / 2, 170 + i * 120); });
        g.fillStyle = '#e8c45c'; g.font = '600 24px Arial, sans-serif'; g.fillText('SKILLS INSTALL ONLY ON A REAL SCORE LIFT', CW / 2, 500); title('THE METHOD', 'ATHENAEUM ACADEMY'); });
      cell(5, function () { sky('#1a1408', '#3a2a0a'); g.fillStyle = '#e8c45c'; g.beginPath(); g.arc(CW / 2, 250, 120, 0, 7); g.fill(); g.fillStyle = '#1a1408'; g.beginPath(); g.arc(CW / 2, 250, 96, 0, 7); g.fill();
        g.fillStyle = '#2bff88'; g.beginPath(); g.moveTo(CW / 2, 170); g.lineTo(CW / 2 + 60, 290); g.lineTo(CW / 2 - 60, 290); g.closePath(); g.fill(); title('ENROL TODAY', 'BRING YOUR AGENT'); });
      var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var pos = [], uv = [], idx = [], vi = 0;
      function quad(cx, cy, cz, nx, nz, w, h, design) {
        var tx = nz, tz = -nx, hw = w / 2, hh = h / 2, u0 = (design % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(design / COLS) / ROWS, v0 = v1 - 1 / ROWS;
        pos.push(cx - tx * hw, cy - hh, cz - tz * hw, cx + tx * hw, cy - hh, cz + tz * hw, cx + tx * hw, cy + hh, cz + tz * hw, cx - tx * hw, cy + hh, cz - tz * hw);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1); idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
      }
      for (var k = 0; k < 6; k++) { var a = (k * 60) * Math.PI / 180, rr = R - 0.7, nx = -Math.sin(a), nz = Math.cos(a);
        quad(Math.sin(a) * rr, 11, -Math.cos(a) * rr, nx, nz, 7, 8.75, k % 6); }
      L.wings.forEach(function (w, i) { var al = w.along1 - 0.5, nx = -w.dx, nz = -w.dz;
        quad(w.dx * al, 6.5, w.dz * al, nx, nz, 7, 8.75, (i + 2) % 6); });
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })); mesh.name = 'athenaeum-posters'; rootG.add(mesh);
    })();

    // ── INTERIOR PROPS (2026-10-11, owner refs: atrium with balconies + holo world table; glass classroom with holo lecturer, curved desks, vertical gardens) ──
    //    ~10 draw calls, all instanced / merged; visual only (no new colliders, walkability unchanged).
    (function interiorProps() {
      var white = new THREE.MeshStandardMaterial({ color: 0xeceee6, roughness: 0.35, metalness: 0.1 }), goldM = new THREE.MeshStandardMaterial({ color: 0xe8c45c, roughness: 0.3, metalness: 0.8, emissive: 0x3a2c08 });
      var holoM = new THREE.MeshBasicMaterial({ color: 0x2bff88, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      var scrM = new THREE.MeshBasicMaterial({ color: 0x5fe8ff, toneMapped: false }), greenM = new THREE.MeshStandardMaterial({ color: 0x2f7a3c, roughness: 0.95 });
      // balconies: two annular levels inside the drum + gold rails
      [[9, 'balcony-1'], [17, 'balcony-2']].forEach(function (b) {
        var ring = new THREE.Mesh(new THREE.RingGeometry(R - 7.5, R - 1.2, 64, 1), white); ring.rotation.x = -Math.PI / 2; ring.position.y = b[0]; ring.material.side = THREE.DoubleSide; ring.name = 'athenaeum-' + b[1]; rootG.add(ring);
        var rail = new THREE.Mesh(new THREE.TorusGeometry(R - 7.5, 0.16, 6, 64), goldM); rail.rotation.x = Math.PI / 2; rail.position.y = b[0] + 1.1; rail.name = 'athenaeum-' + b[1] + '-rail'; rootG.add(rail);
      });
      // holo world table at the skill-tree dais: plinth, ring, hovering globe
      var dz = 10.5;
      var plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.0, 36), white); plinth.position.set(0, 0.5, dz); plinth.name = 'athenaeum-holo-plinth'; rootG.add(plinth);
      var globe = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), holoM); globe.position.set(0, 4.6, dz); globe.name = 'athenaeum-holo-globe'; rootG.add(globe);
      var halo = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.1, 6, 48), goldM); halo.position.set(0, 4.6, dz); halo.rotation.x = Math.PI / 2.6; halo.name = 'athenaeum-holo-halo'; rootG.add(halo);
      // curved console desks in the rotunda (two arcs, skipping the six doorways) + their screens
      var dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), ds = new THREE.Vector3(1, 1, 1), dp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      var desks = [], screens = [];
      [21.5, 25.0].forEach(function (rr) { for (var k = 0; k < 36; k++) { var deg = k * 10 + 5, near = false; for (var w = 0; w < L.wings.length; w++) { var dd = Math.abs(((deg - L.wings[w].angleDeg + 540) % 360) - 180); if (dd < 15) near = true; } if (near) continue;
        var a = deg * Math.PI / 180; desks.push([Math.sin(a) * rr, -Math.cos(a) * rr, a, 0.55]); screens.push([Math.sin(a) * (rr - 0.35), -Math.cos(a) * (rr - 0.35), a, 1.25]); } });
      // classroom rows in each wing: three rows x two flanking columns, a holo lecturer plinth, green wall panels
      var greens = [];
      L.wings.forEach(function (w) { for (var row = 0; row < 3; row++) for (var sd = -1; sd <= 1; sd += 2) { var al = w.along0 + 12 + row * 8, x = w.dx * al + w.nx * sd * 6.5, z = w.dz * al + w.nz * sd * 6.5, ang = Math.atan2(w.dx, w.dz); desks.push([x, z, ang, 0.55]); screens.push([x, z, ang, 1.25]); }
        for (var g = 0; g < 4; g++) { var ga = w.along0 + 8 + g * 8, gx = w.dx * ga + w.nx * (w.halfW - 0.5), gz = w.dz * ga + w.nz * (w.halfW - 0.5); greens.push([gx, gz, Math.atan2(w.dx, w.dz), 4.5]); } });
      function inst(list, geo, mat, name, y) { var im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(function (d, i) { dp.set(d[0], y != null ? y : d[3], d[1]); dq.setFromAxisAngle(up, d[2]); dm.compose(dp, dq, ds); im.setMatrixAt(i, dm); }); im.instanceMatrix.needsUpdate = true; im.name = name; im.frustumCulled = false; rootG.add(im); return im; }
      inst(desks, new THREE.BoxGeometry(3.6, 1.1, 1.3), white, 'athenaeum-desks');
      inst(screens, new THREE.BoxGeometry(2.6, 1.0, 0.08), scrM, 'athenaeum-desk-screens');
      inst(greens, new THREE.BoxGeometry(0.5, 7.0, 5.2), greenM, 'athenaeum-green-wall');
    })();

    // ── lights (≤ 8) ────────────────────────────────────────────────────────────
    var hemi = new THREE.HemisphereLight(0xa8fff0, 0x0c1a1a, 1.5); rootG.add(hemi);
    var fill = new THREE.AmbientLight(0x3f6a60, 1.7); rootG.add(fill);
    // BLENDER K15 ROTUNDA (owner refs: balconies at 9 + 17 m, holo table, twin grand stairs 0.18 x 0.30): origin = rotunda centre floor, apse north (-z)
    // like polar(). On load the '#rot' shell + the code balconies hide; wings, desks, holo globe and stations stay.
    if (ROTKIT) new root.__GLTFLoaderClass().load('/assets/kits/shaddai_athenaeum_rotunda_v01.glb', function (gl) {
      var shell = gl.scene.getObjectByName('shaddai_athenaeum_rotunda'), props = gl.scene.getObjectByName('athenaeum_props'); if (!shell) return;
      var kit = new THREE.Group(); kit.name = 'athenaeum-k15'; kit.add(shell.clone(true)); if (props) kit.add(props.clone(true)); rootG.add(kit);
      rotMeshes.forEach(function (m) { m.visible = false; });
      rootG.children.forEach(function (o) { if (/^athenaeum-balcony/.test(o.name)) o.visible = false; });
    }, undefined, function () { console.warn('[athenaeum] K15 rotunda missing, code rotunda kept'); });
    // BLENDER K33 INTERIOR (2026-10-23, owner refs: white + gold rotunda, geodesic glass dome, hanging ring core over a holo-globe pool,
    // window-wall classrooms with holo desks + green walls, Dean's Atrium with tiered balconies). Same plan as athenaeum-layout.js, so
    // stations, colliders, pods, boards, posters, faculty and wing furniture all stay; the code shell / columns / balconies / centre
    // hologram (and the K15 shell) hide. ?athk33=0 = keep the old look.
    if (root.__GLTFLoaderClass && !(typeof location !== 'undefined' && /[?&]athk33=0/.test(location.search || ''))) new root.__GLTFLoaderClass().load('/assets/kits/shaddai_athenaeum_interior_v01.glb?v=20261023b', function (gl) {
      var shell = gl.scene; shell.name = 'athenaeum-k33';
      shell.traverse(function (n) {
        if (!n.isMesh || !n.material) return; var nm = n.material.name || '';
        if (/^ath_glass/.test(nm)) n.material = new THREE.MeshStandardMaterial({ color: 0xd6f0ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.15, depthWrite: false, side: THREE.DoubleSide });
        else if (/^ath_holo/.test(nm)) { n.material = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }); }
        else n.material.side = THREE.DoubleSide;
      });
      rootG.add(shell);
      root.__athK33 = { shell: shell, rootG: rootG, U: U, X0: X0, Z0: Z0, group: group };   // world-athenaeum-lifts.js: 2nd floor + capsule elevators
      rootG.children.forEach(function (o) {
        if (o === shell) return;
        if (/^static:|^columns$|^column-bands$|^athenaeum-balcony|^athenaeum-k15$|^dais:tree$|^orbit-ring$|^tree-nodes$|^orbit-glyphs$|^athenaeum-holo|^athenaeum-plinth/.test(o.name)) o.visible = false;
      });
      rotMeshes.forEach(function (m) { m.visible = false; });
      hemi.color.set(0xfff8ec); hemi.groundColor.set(0x3a3428); fill.color.set(0xfff0dc); fill.intensity = 1.1;
    }, undefined, function () { console.warn('[athenaeum] K33 interior missing, previous look kept'); });
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


/* ── ATHENAEUM EXTERIOR (2026-10-11, TURTLE brief): the open-world face of the academy, built from the same plan as the campus interior.
 *   var ext = window.buildAthenaeumExterior(THREE, { scene, x, y, z, yaw, scale })   // world units; scale 1 = real metres x 7/1.8
 * Rotunda drum + emerald glass fins every 4 m + glass dome with a gold lattice rim, six wings with gold-capped columns and agent-coloured roof strips,
 * the Dean's apse with a gold dome and a pulsing emerald beacon, a south gate arch. ~12 draw calls, no lights, collider = one circle (r 36 m). */
(function (root) {
  'use strict';
  root.buildAthenaeumExterior = function (THREE, o) {
    o = o || {}; var A = root.AthenaeumLayout || (typeof require === 'function' ? require('./athenaeum-layout.js') : null); if (!A) return null;
    var L = A.build(), U = 7 / 1.8, S = (o.scale || 1) * U, g = new THREE.Group(); g.name = 'athenaeum-exterior';
    var stone = new THREE.MeshStandardMaterial({ color: 0xdcd3bc, roughness: 0.6 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, roughness: 0.3, metalness: 0.8, emissive: 0x4a3608 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x66e0c0, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, emissive: 0x0a3a2c }), fin = new THREE.MeshBasicMaterial({ color: 0x2bff88, transparent: true, opacity: 0.55, toneMapped: false });
    var R = L.R, H = L.ROTUNDA_H, rot = new THREE.Group(); g.add(rot);
    function add(geo, mat, x, y, z, name) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (name) m.name = name; rot.add(m); return m; }
    add(new THREE.CylinderGeometry(R, R + 1.5, H, 64, 1, true), stone, 0, H / 2, 0, 'ext-drum');
    add(new THREE.CylinderGeometry(R + 1.2, R + 1.2, 1.4, 64), gold, 0, H - 0.7, 0, 'ext-cornice');
    var dome = add(new THREE.SphereGeometry(R * 0.98, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, H, 0, 'ext-dome');
    add(new THREE.TorusGeometry(R * 0.98, 0.3, 6, 64), gold, 0, H + 0.3, 0, 'ext-dome-rim').rotation.x = Math.PI / 2;
    // fins: one InstancedMesh, a 1 x 24 x 0.4 m glass blade every 4 m round the drum
    var n = Math.floor(2 * Math.PI * (R + 0.8) / 4), fi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 24, 1.0), fin, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; p.set(Math.sin(a) * (R + 0.8), 13, Math.cos(a) * (R + 0.8)); q.setFromAxisAngle(up, a); m4.compose(p, q, sc); fi.setMatrixAt(i, m4); }
    fi.instanceMatrix.needsUpdate = true; fi.name = 'ext-fins'; rot.add(fi);
    // wings: boxes + a coloured roof strip + two gold columns at the entrance
    L.wings.forEach(function (w) {
      var len = w.along1 - w.along0, mx = w.dx * (w.along0 + w.along1) / 2, mz = w.dz * (w.along0 + w.along1) / 2, ang = Math.atan2(w.dx, w.dz);
      var box = add(new THREE.BoxGeometry(w.halfW * 2, w.h, len), stone, mx, w.h / 2, mz, 'ext-wing-' + w.id); box.rotation.y = ang;
      var strip = add(new THREE.BoxGeometry(w.halfW * 2 + 0.6, 0.5, len + 0.6), new THREE.MeshBasicMaterial({ color: w.accent, toneMapped: false }), mx, w.h + 0.25, mz); strip.rotation.y = ang;
      [-1, 1].forEach(function (sd) { add(new THREE.CylinderGeometry(1.0, 0.9, w.h + 4, 14), gold, w.dx * (w.along0 + 1.5) + w.nx * sd * (w.halfW + 0.5), (w.h + 4) / 2, w.dz * (w.along0 + 1.5) + w.nz * sd * (w.halfW + 0.5)); });
    });
    // FACADE PASS (2026-10-23, owner: "the agent academy is very important" - plain wing boxes read crude): glowing glass ribbon
    // windows on every wing (2 storeys, both long sides), gold pilasters every 6 m, two glass bands round the drum, a paved
    // forecourt ring with an emerald edge and entrance steps. Repeated pieces are InstancedMeshes (5 extra draws in total).
    var ribbonM = new THREE.MeshStandardMaterial({ color: 0x0c2a24, emissive: 0x1fbf8a, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3 });
    var ribs = [], pils = [];
    L.wings.forEach(function (w) {
      var len = w.along1 - w.along0, ang = Math.atan2(w.dx, w.dz);
      [-1, 1].forEach(function (sd) {
        [0.3, 0.68].forEach(function (fy) {   // two storeys of ribbon glazing per side
          ribs.push({ x: w.dx * (w.along0 + w.along1) / 2 + w.nx * sd * (w.halfW + 0.05), y: w.h * fy, z: w.dz * (w.along0 + w.along1) / 2 + w.nz * sd * (w.halfW + 0.05), ang: ang, sx: 0.12, sy: 2.2, sz: len - 3 });
        });
        for (var a2 = w.along0 + 3; a2 < w.along1 - 1; a2 += 6) pils.push({ x: w.dx * a2 + w.nx * sd * (w.halfW + 0.35), y: w.h / 2, z: w.dz * a2 + w.nz * sd * (w.halfW + 0.35), ang: ang, sx: 0.7, sy: w.h, sz: 0.7 });
      });
    });
    function inst(list, mat, name) {
      var im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), yy = new THREE.Vector3(0, 1, 0);
      list.forEach(function (b, i) { qq.setFromAxisAngle(yy, b.ang); mm.compose(new THREE.Vector3(b.x, b.y, b.z), qq, new THREE.Vector3(b.sx, b.sy, b.sz)); im.setMatrixAt(i, mm); });
      im.instanceMatrix.needsUpdate = true; im.name = name; rot.add(im); return im;
    }
    inst(ribs, ribbonM, 'ext-wing-glazing'); inst(pils, gold, 'ext-wing-pilasters');
    [H * 0.32, H * 0.62].forEach(function (yb) { add(new THREE.CylinderGeometry(R + 0.25, R + 0.25, 2.4, 64, 1, true), ribbonM, 0, yb, 0, 'ext-drum-band'); });
    var plaza = add(new THREE.RingGeometry(R + 3, R + 26, 64), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.85 }), 0, 0.06, 0, 'ext-forecourt'); plaza.rotation.x = -Math.PI / 2;
    var edge = add(new THREE.RingGeometry(R + 25.4, R + 26, 64), new THREE.MeshBasicMaterial({ color: 0x2bff88, toneMapped: false }), 0, 0.09, 0, 'ext-forecourt-edge'); edge.rotation.x = -Math.PI / 2;
    for (var st = 0; st < 5; st++) add(new THREE.BoxGeometry(L.gate.halfW * 2 + 6 - st * 0.8, 0.35, 1.6), stone, 0, 0.18 + st * 0.35, L.gate.endZ + 7 - st * 1.5, 'ext-steps');
    // Dean's apse (north): gold dome and the pulse beacon
    var ap = L.apse; add(new THREE.CylinderGeometry(ap.r, ap.r, ap.h, 40), stone, ap.cx, ap.h / 2, ap.cz, 'ext-apse');
    add(new THREE.SphereGeometry(ap.r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold, ap.cx, ap.h, ap.cz, 'ext-apse-dome');
    var beacon = add(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2bff88, toneMapped: false }), ap.cx, ap.h + ap.r + 3.5, ap.cz, 'ext-beacon');
    // south gate corridor + gold arch
    var gt = L.gate; add(new THREE.BoxGeometry(gt.halfW * 2, gt.h, gt.endZ - gt.startZ), stone, 0, gt.h / 2, (gt.startZ + gt.endZ) / 2, 'ext-gate');
    add(new THREE.TorusGeometry(gt.halfW + 1.5, 0.7, 8, 36, Math.PI), gold, 0, gt.h, gt.endZ + 0.5, 'ext-gate-arch');
    g.scale.setScalar(S); g.position.set(o.x || 0, o.y || 0, o.z || 0); g.rotation.y = o.yaw || 0;
    var t = 0;
    function tick(dt) { t += dt; var k = 0.6 + 0.4 * Math.sin(t * Math.PI / 2); beacon.scale.setScalar(0.85 + 0.3 * k); beacon.material.opacity = 1; }   // 4 s emerald pulse
    function dispose() { if (g.parent) g.parent.remove(g); g.traverse(function (m) { if (m.geometry) m.geometry.dispose(); }); }
    if (o.scene) o.scene.add(g);
    return { group: g, tick: tick, dispose: dispose, radiusM: R + 3, footprintM: 2 * (L.WING_ALONG0 + L.WING_LEN) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
