/* world-hoverpark-v2.js — HOVERSKATE PARK v2, laid out to the owner's plan (2026-10-04 "Circular City Hub · Hover-Skate Park"):
 *   centre: the GOLD-RING BOWL (4 lane gaps) · north: HALF-PIPES (two U-pipes either side of the lane) · west: stepped grind RAILS
 *   east: wedge KICKER RAMPS · south: the DROP TOWER with a drop-in ramp into the bowl · emerald LIGHT LANES join every zone to the bowl.
 * Same API as world-hoverpark.js (v1 stays as the ?park=v1 fallback): WorldHoverPark.build(o) → { group, rooms, entrance, deckY, heightAt, gates(cid),
 *   ribbon, crates, update, dispose, loop, railsWorld, setCrateVisible, cratesWorld, padsWorld, loopWorld }. Room ids are kept for the race cups.
 * Perf: static pieces are built per material into ONE merged mesh each (≈8 draws for the whole park); crates = 1 instanced mesh; no lights.
 * Theme: obsidian #06080B · emerald #00FF9C · gold #E8C45C.  Units: metres inside, scaled by U at the group. */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, PR = 170;                                   // park radius (m)
  var LOOP = []; (function () { for (var i = 0; i < 20; i++) { var a = i / 20 * Math.PI * 2, r = 104 + 10 * Math.cos(a * 4); LOOP.push([Math.round(Math.sin(a) * r), Math.round(Math.cos(a) * r)]); } })();   // race line round the hub, +z = south (entrance)
  var ROOMS = [
    { id: 'pad', name: 'The Gate', x: 0, z: 150, r: 20, tag: 'Spawn + shop. Flatground, manuals, flips.' },
    { id: 'forum', name: 'The Ring Bowl', x: 0, z: 0, r: 34, tag: 'Bowl + big air. Carve the gold ring.' },
    { id: 'banks', name: 'Half-Pipes', x: 0, z: -112, r: 40, tag: 'Two U-pipes: pump, airs, drop-ins.' },
    { id: 'spine', name: 'Rail Yard', x: -112, z: 0, r: 42, tag: 'Stepped magnet rails: 50-50, boardslide, crooked.' },
    { id: 'plaza', name: 'Kicker Field', x: 112, z: 0, r: 42, tag: 'Wedge kickers: gaps, flips, launches.' },
    { id: 'rift', name: 'Drop Tower', x: 0, z: 104, r: 22, tag: 'Climb, drop in, fly into the bowl.' },
    { id: 'pool', name: 'Light Lanes', x: 60, z: -60, r: 20, tag: 'Speed lanes between zones.' }
  ];
  var BOWL = { r: 34, depth: 6.5 };
  var HP = [{ x: -34, z: -112 }, { x: 34, z: -112 }], HP_W = 40, HP_L = 56, HP_R = 9;   // 2026-10-11: pipes scaled up to the owner's plan proportions (they read as big as the bowl in the reference)                 // half-pipes: span x ±HP_W/2, length along z
  var RAILS = [-36, -18, 0, 18, 36].map(function (z, i) { return { z: z, x0: -152, x1: -76, kink: -114 + (i % 2) * 10, yHi: 1.2, yLo: 0.75 }; });
  var KICK = [[96, -40, -0.5], [128, -22, -0.25], [104, 4, 0], [132, 30, 0.3], [96, 42, 0.6]].map(function (k) { return { x: k[0], z: k[1], yaw: k[2] + Math.PI / 2, L: 18, W: 11, H: 4.4 }; });   // yaw: ramp rises toward the bowl
  var TOWER = { x: 0, z: 118, r: 5, h: 26, deck: 14 }, DROP = { z0: 110, z1: 38, w: 9, h0: 14 };
  var LIFT = { base: [0, 134], top: [0, 111.5], r: 3 };   // tower lift stops (local metres): south base door → deck edge at the drop-in
  var SPIRAL = { r0: 8.6, r1: 12.6, rm: 10.6, a0: 40, a1: 360, h: 14 };   // rideable climb round the tower (degrees clockwise from north)

  function build(o) {
    var THREE = o.THREE, scene = o.scene, U = o.U || U0, anchor = o.anchor, hAt = o.heightAt || function () { return 0; }, yaw = o.yaw || 0;
    var G = new THREE.Group(); G.name = 'hoverpark'; scene.add(G);
    var maxH = -1e9, minH = 1e9; for (var sx = -PR; sx <= PR; sx += 42) for (var sz = -PR; sz <= PR; sz += 42) { var hh = hAt(anchor.x + sx * U, anchor.z + sz * U); if (!isFinite(hh)) continue; maxH = Math.max(maxH, hh); minH = Math.min(minH, hh); }
    if (!isFinite(maxH)) { maxH = 0; minH = 0; }   // NaN guard: a non-finite terrain sample used to make deckY NaN → NaN ground → NaN player
    var deckY = maxH + 1.2 * U; G.position.set(anchor.x, deckY, anchor.z); G.rotation.y = yaw;
    var R = new THREE.Group(); R.scale.setScalar(U); G.add(R);
    var MAT = {
      obsidian: new THREE.MeshStandardMaterial({ color: 0x10151c, emissive: 0x06120e, emissiveIntensity: 0.6, metalness: 0.55, roughness: 0.35 }),
      obsidian2: new THREE.MeshStandardMaterial({ color: 0x1c2530, emissive: 0x0b3a2a, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.4 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xE8C45C, emissive: 0xE8C45C, emissiveIntensity: 0.45, metalness: 0.95, roughness: 0.25 }),
      lane: new THREE.MeshBasicMaterial({ color: 0x00FF9C }),
      rail: new THREE.MeshStandardMaterial({ color: 0x1b222b, emissive: 0x00FF9C, emissiveIntensity: 1.1, metalness: 0.9, roughness: 0.25 })
    };
    var parts = {}; function put(geo, mat, x, y, z, rx, ry, rz, sx2, sy2, sz2) {   // queue a static piece (merged per material below)
      var m4 = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx2 || 1, sy2 || 1, sz2 || 1));
      var g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m4); if (!g.attributes.normal) g.computeVertexNormals(); (parts[mat] = parts[mat] || []).push(g);
    }
    // ── deck: round obsidian slab + skirt, gold rim, emerald inner line ──
    var deckGeo = new THREE.CylinderGeometry(PR, PR, 7.2, 96, 1); put(deckGeo, 'obsidian', 0, -3.6, 0);
    put(new THREE.TorusGeometry(PR + 0.3, 0.55, 8, 160), 'gold', 0, 0.1, 0, Math.PI / 2);
    put(new THREE.TorusGeometry(PR - 9, 0.12, 6, 160), 'lane', 0, 0.06, 0, Math.PI / 2);
    // ── centre bowl: concave dish + gold coping ring in 4 arcs (lane gaps N/E/S/W) ──
    var bowlPts = []; for (var bi = 0; bi <= 16; bi++) { var t = bi / 16, rr = BOWL.r * t; bowlPts.push(new THREE.Vector2(Math.max(0.01, rr), -BOWL.depth * (1 - t * t) + 0.02)); }
    put(new THREE.LatheGeometry(bowlPts, 64), 'obsidian2', 0, 0, 0);
    for (var q = 0; q < 4; q++) put(new THREE.TorusGeometry(BOWL.r + 0.6, 0.8, 10, 40, Math.PI / 2 - 0.36), 'gold', 0, 0.4, 0, Math.PI / 2, 0, q * Math.PI / 2 + 0.18);
    put(new THREE.TorusGeometry(BOWL.r * 0.55, 0.1, 6, 96), 'lane', 0, -BOWL.depth * (1 - 0.3) + 0.08, 0, Math.PI / 2);
    // ── light lanes: emerald strips from the bowl gaps to every zone (with the forks of the plan) ──
    function lane(x0, z0, x1, z1) { var dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); put(new THREE.BoxGeometry(1.2, 0.06, L), 'lane', (x0 + x1) / 2, 0.05, (z0 + z1) / 2, 0, Math.atan2(dx, dz)); }
    lane(0, -BOWL.r - 1, 0, -92); lane(0, BOWL.r + 1, 0, DROP.z1 - 2);
    lane(-BOWL.r - 1, 0, -60, 0); lane(-60, 0, -74, -18); lane(-60, 0, -74, 18); lane(-60, 0, -76, 0);
    lane(BOWL.r + 1, 0, 64, 0); lane(64, 0, 86, -34); lane(64, 0, 92, 4); lane(64, 0, 86, 38);
    // ── half-pipes (north): a U-profile extruded along z, gold coping on both lips ──
    var hpShape = new THREE.Shape(); var hw = HP_W / 2; hpShape.moveTo(-hw, HP_R + 0.6); hpShape.lineTo(-hw, 0);
    for (var hi = 0; hi <= 10; hi++) { var a1 = Math.PI - hi / 10 * Math.PI / 2; hpShape.lineTo(-hw + HP_R + Math.cos(a1) * HP_R, HP_R - Math.sin(a1) * HP_R); }
    hpShape.lineTo(hw - HP_R, 0); for (hi = 0; hi <= 10; hi++) { var a2 = Math.PI * 1.5 + hi / 10 * Math.PI / 2; hpShape.lineTo(hw - HP_R + Math.cos(a2) * HP_R, HP_R + Math.sin(a2) * HP_R); }
    hpShape.lineTo(hw, HP_R + 0.6); hpShape.lineTo(hw + 1.2, HP_R + 0.6); hpShape.lineTo(hw + 1.2, 0); hpShape.lineTo(-hw - 1.2, 0); hpShape.lineTo(-hw - 1.2, HP_R + 0.6); hpShape.closePath();
    var hpGeo = new THREE.ExtrudeGeometry(hpShape, { depth: HP_L, bevelEnabled: false, curveSegments: 4 });
    HP.forEach(function (h) { put(hpGeo, 'obsidian2', h.x, 0, h.z - HP_L / 2); [-1, 1].forEach(function (s) { put(new THREE.CylinderGeometry(0.35, 0.35, HP_L, 10), 'gold', h.x + s * hw, HP_R + 0.6, h.z, Math.PI / 2); put(new THREE.BoxGeometry(0.2, 0.1, HP_L - 2), 'lane', h.x + s * (hw - HP_R * 0.3), 0.6, h.z); }); });
    // ── rail yard (west): stepped magnet rails on posts ──
    var railSegs = [];
    RAILS.forEach(function (r) {
      [[r.x0, r.kink, r.yHi], [r.kink + 4, r.x1, r.yLo]].forEach(function (s) { var L = s[1] - s[0]; put(new THREE.CylinderGeometry(0.16, 0.16, L, 8), 'rail', (s[0] + s[1]) / 2, s[2], r.z, 0, 0, Math.PI / 2); railSegs.push({ x0: s[0], x1: s[1], z: r.z, y: s[2] }); for (var px = s[0] + 2; px < s[1]; px += 9) put(new THREE.BoxGeometry(0.3, s[2], 0.3), 'obsidian2', px, s[2] / 2, r.z); });
      var dropL = Math.hypot(4, r.yHi - r.yLo); put(new THREE.CylinderGeometry(0.16, 0.16, dropL, 8), 'rail', r.kink + 2, (r.yHi + r.yLo) / 2, r.z, 0, 0, Math.PI / 2 + Math.atan2(r.yHi - r.yLo, 4));
      put(new THREE.BoxGeometry(r.x1 - r.x0 + 6, 0.05, 0.5), 'lane', (r.x0 + r.x1) / 2, 0.05, r.z + 2.2);
    });
    // ── kicker field (east): obsidian wedges with gold lips ──
    var wedge = new THREE.Shape(); wedge.moveTo(0, 0); wedge.lineTo(1, 0); wedge.lineTo(1, 1); wedge.closePath();
    var wedgeGeo = new THREE.ExtrudeGeometry(wedge, { depth: 1, bevelEnabled: false }); wedgeGeo.translate(-0.5, 0, -0.5); wedgeGeo.rotateY(Math.PI / 2);   // rises toward local -z… after rotate: rises along +x→ see heightAt (consistent below)
    KICK.forEach(function (k) { put(wedgeGeo, 'obsidian2', k.x, 0, k.z, 0, k.yaw, 0, k.W, k.H, k.L); var lx = k.x - Math.sin(k.yaw) * k.L / 2, lz = k.z - Math.cos(k.yaw) * k.L / 2; put(new THREE.BoxGeometry(k.W, 0.25, 0.4), 'gold', lx, k.H, lz, 0, k.yaw, 0); });
    // ── drop tower (south): column + crown, base ring, top deck, drop-in ramp north into the bowl ──
    put(new THREE.CylinderGeometry(TOWER.r * 0.7, TOWER.r, TOWER.h, 24), 'obsidian', TOWER.x, TOWER.h / 2, TOWER.z);
    put(new THREE.TorusGeometry(TOWER.r * 0.75, 0.35, 8, 32), 'gold', TOWER.x, TOWER.h, TOWER.z, Math.PI / 2); put(new THREE.CylinderGeometry(0.5, 0.5, 6, 8), 'gold', TOWER.x, TOWER.h + 3, TOWER.z);
    put(new THREE.TorusGeometry(16, 0.5, 8, 64), 'gold', TOWER.x, 0.2, TOWER.z, Math.PI / 2); put(new THREE.TorusGeometry(12, 0.1, 6, 64), 'lane', TOWER.x, 0.07, TOWER.z, Math.PI / 2);
    put(new THREE.CylinderGeometry(8, 8, 0.8, 32), 'obsidian2', TOWER.x, TOWER.deck, TOWER.z);
    var dL = Math.hypot(DROP.z0 - DROP.z1, DROP.h0), dA = Math.atan2(DROP.h0, DROP.z0 - DROP.z1);
    put(new THREE.BoxGeometry(DROP.w, 0.6, dL), 'obsidian2', 0, DROP.h0 / 2, (DROP.z0 + DROP.z1) / 2, -dA);
    [-1, 1].forEach(function (s) { put(new THREE.BoxGeometry(0.3, 0.4, dL), 'gold', s * DROP.w / 2, DROP.h0 / 2 + 0.5, (DROP.z0 + DROP.z1) / 2, -dA); });
    // ── tower LIFT (owner 2026-10-04: "elevator inside the drop"): gold door + emerald pad at the south base, top stop at the head of the drop-in ──
    put(new THREE.BoxGeometry(0.5, 4.6, 0.6), 'gold', LIFT.base[0] - 2.4, 2.3, LIFT.base[1] + 2.2); put(new THREE.BoxGeometry(0.5, 4.6, 0.6), 'gold', LIFT.base[0] + 2.4, 2.3, LIFT.base[1] + 2.2);
    put(new THREE.BoxGeometry(5.3, 0.5, 0.6), 'gold', LIFT.base[0], 4.8, LIFT.base[1] + 2.2); put(new THREE.BoxGeometry(4.3, 0.12, 0.12), 'lane', LIFT.base[0], 4.4, LIFT.base[1] + 2.2);
    put(new THREE.CylinderGeometry(2.2, 2.2, 0.08, 32), 'lane', LIFT.base[0], 0.05, LIFT.base[1]); put(new THREE.CylinderGeometry(1.8, 1.8, 0.08, 32), 'lane', LIFT.top[0], TOWER.deck + 0.45, LIFT.top[1]);
    // ── spiral climb round the drop tower: 40°→360° clockwise from north, 0 → 14 m, ends at the top deck where the drop-in starts ──
    var slope = SPIRAL.h / (SPIRAL.rm * (SPIRAL.a1 - SPIRAL.a0) * Math.PI / 180);
    for (var sa = SPIRAL.a0; sa < SPIRAL.a1; sa += 10) {
      var am = (sa + 5) * Math.PI / 180, hm = SPIRAL.h * (sa + 5 - SPIRAL.a0) / (SPIRAL.a1 - SPIRAL.a0), sx3 = TOWER.x + SPIRAL.rm * Math.sin(am), sz3 = TOWER.z - SPIRAL.rm * Math.cos(am), ry3 = Math.atan2(Math.cos(am), Math.sin(am));
      var seg = new THREE.BoxGeometry(SPIRAL.r1 - SPIRAL.r0, 0.5, SPIRAL.rm * 0.1745 + 0.25); seg.rotateX(-Math.atan(slope)); put(seg, 'obsidian2', sx3, hm - 0.25, sz3, 0, ry3, 0);
      var lip = new THREE.BoxGeometry(0.25, 0.5, SPIRAL.rm * 0.1745 + 0.25); lip.rotateX(-Math.atan(slope)); var ox = TOWER.x + (SPIRAL.r1 + 0.1) * Math.sin(am), oz = TOWER.z - (SPIRAL.r1 + 0.1) * Math.cos(am); put(lip, 'gold', ox, hm + 0.2, oz, 0, ry3, 0);
    }
    // ── entrance gate (south edge): SHADDAI arch ──
    [-1, 1].forEach(function (s) { put(new THREE.BoxGeometry(1.6, 16, 1.6), 'obsidian', s * 11, 8, 162); put(new THREE.BoxGeometry(0.4, 15, 0.5), 'lane', s * 11, 8, 161); });
    put(new THREE.BoxGeometry(26, 1.6, 2.2), 'gold', 0, 16.4, 162);
    // ── bake: ONE mesh per material ──
    Object.keys(parts).forEach(function (mk) {
      var gs = parts[mk], n = 0, off = 0; gs.forEach(function (g) { n += g.attributes.position.count; });
      var uv = gs.every(function (g) { return g.attributes.uv && g.attributes.uv.itemSize === 2; }), P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = uv ? new Float32Array(n * 2) : null;
      gs.forEach(function (g) { P.set(g.attributes.position.array, off * 3); N.set(g.attributes.normal.array, off * 3); if (UV) UV.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose(); });
      var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (UV) mg.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); mg.computeBoundingSphere();
      var mesh = new THREE.Mesh(mg, MAT[mk]); mesh.name = 'park-' + mk; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); R.add(mesh);
    });
    // ── race ribbon, gates, crates, boost pads (same behaviour as v1) ──
    var pts = LOOP.map(function (p) { return { x: p[0], y: 0.16, z: p[1] }; }), ribbon = ribbonMesh(THREE, pts, 8); R.add(ribbon);
    function loopAt(t) { var n = LOOP.length, f = ((t % 1) + 1) % 1 * n, i = Math.floor(f), k = f - i, a = LOOP[i % n], b = LOOP[(i + 1) % n]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; }
    var gateMeshes = [], gateCol = { pad: 0x00FF9C, foil: 0xE8C45C, either: 0x00D4FF, trick: 0xff4fd8, kiss: 0xffffff };
    function gates(cid) {
      var C = root.WorldRace && root.WorldRace.CIRCUITS[cid]; if (!C) return []; gateMeshes.forEach(function (g) { R.remove(g); }); gateMeshes = []; var out = [];
      C.gates.forEach(function (g, i) { var q2 = loopAt(i / C.gates.length), h = g.kind === 'foil' ? 8 : 3.4, w = 9, m = new THREE.MeshStandardMaterial({ color: 0x0a0d12, emissive: gateCol[g.kind] || 0x00D4FF, emissiveIntensity: 2.2 });
        var gt = new THREE.Group(); gt.position.set(q2[0], 0, q2[1]); gt.rotation.y = q2[2];
        var l = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), m); l.position.set(-w / 2, h / 2, 0); gt.add(l); var r2 = l.clone(); r2.position.x = w / 2; gt.add(r2); var top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 0.6), m); top.position.set(0, h, 0); gt.add(top);
        R.add(gt); gateMeshes.push(gt); out.push({ x: q2[0], z: q2[1], kind: g.kind, verb: g.verb || null, idx: i }); });
      G.updateMatrixWorld(true); return out.map(function (g) { var v = new THREE.Vector3(g.x, 0, g.z).applyMatrix4(R.matrixWorld); return { x: v.x, y: v.y, z: v.z, kind: g.kind, verb: g.verb, idx: g.idx }; });
    }
    var crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2410, emissive: 0xE8C45C, emissiveIntensity: 1.3, metalness: 0.8, roughness: 0.3 }), 12), crPos = [];
    for (var ci = 0; ci < 12; ci++) { var q3 = loopAt(ci / 12 + 0.02); crPos.push([q3[0] + Math.cos(ci) * 2.5, 1.5, q3[1] + Math.sin(ci) * 2.5]); } R.add(crates);
    var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), tt = 0, crVis = crPos.map(function () { return true; });
    function update(dt) { tt += dt; for (var k = 0; k < crPos.length; k++) { _e.set(tt * 0.9 + k, tt * 1.3, tt * 0.5); _q.setFromEuler(_e); _p.set(crPos[k][0], crPos[k][1] + Math.sin(tt * 2 + k) * 0.25, crPos[k][2]); _s.setScalar(crVis[k] ? 1 : 0.0001); _m.compose(_p, _q, _s); crates.setMatrixAt(k, _m); } crates.instanceMatrix.needsUpdate = true; }
    update(0);
    var padLoc = [], padMat = new THREE.MeshBasicMaterial({ color: 0x00FF9C, side: THREE.DoubleSide }), chev = new THREE.Shape(); chev.moveTo(-2.4, -1.1); chev.lineTo(0, 0.9); chev.lineTo(2.4, -1.1); chev.lineTo(2.4, -0.4); chev.lineTo(0, 1.6); chev.lineTo(-2.4, -0.4); chev.closePath();
    var chevGeo = new THREE.ShapeGeometry(chev), padIM = new THREE.InstancedMesh(chevGeo, padMat, 18), pk = 0, _d = new THREE.Object3D();
    [0.06, 0.2, 0.34, 0.5, 0.66, 0.82].forEach(function (u) { var q4 = loopAt(u); padLoc.push([q4[0], q4[1], q4[2]]); for (var ch = 0; ch < 3; ch++) { _d.position.set(q4[0] + Math.sin(q4[2]) * (-1.6 + ch * 1.6), 0.3, q4[1] + Math.cos(q4[2]) * (-1.6 + ch * 1.6)); _d.rotation.set(-Math.PI / 2, 0, -q4[2] + Math.PI); _d.updateMatrix(); padIM.setMatrixAt(pk++, _d.matrix); } });
    R.add(padIM);
    // ── ground query: bowl / half-pipes / kickers / drop ramp + tower deck, in WORLD units (max with terrain via the host) ──
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    function local(wx, wz) { var dx = (wx - anchor.x) / U, dz = (wz - anchor.z) / U; return [dx * cy - dz * sy, dx * sy + dz * cy]; }
    function heightAtWorld(wx, wz) {
      var ddx = wx - anchor.x, ddz = wz - anchor.z, far = (PR + 40) * U; if (ddx * ddx + ddz * ddz > far * far) return null;
      var l = local(wx, wz), lx = l[0], lz = l[1], rr2 = Math.hypot(lx, lz);
      if (rr2 > PR) { var dd = rr2 - PR; if (dd > 28) return null; return deckY - (dd / 28) * (deckY - minH); }   // apron: roll on/off
      var h = 0;
      if (rr2 < BOWL.r) h = -BOWL.depth * (1 - (rr2 / BOWL.r) * (rr2 / BOWL.r));
      for (var i = 0; i < HP.length; i++) { var p = HP[i], ax = lx - p.x; if (Math.abs(lz - p.z) <= HP_L / 2 && Math.abs(ax) <= HP_W / 2) { var e = HP_W / 2 - Math.abs(ax); if (e < HP_R) h = Math.max(h, HP_R - Math.sqrt(Math.max(0, HP_R * HP_R - (HP_R - e) * (HP_R - e)))); } }
      for (i = 0; i < KICK.length; i++) { var k2 = KICK[i], kx = lx - k2.x, kz = lz - k2.z, c = Math.cos(-k2.yaw), s = Math.sin(-k2.yaw), u = kx * c + kz * s, v = -kx * s + kz * c; if (Math.abs(u) <= k2.W / 2 && Math.abs(v) <= k2.L / 2) h = Math.max(h, k2.H * (0.5 - v / k2.L)); }
      if (Math.abs(lx) <= DROP.w / 2 && lz <= DROP.z0 && lz >= DROP.z1) h = Math.max(h, DROP.h0 * (lz - DROP.z1) / (DROP.z0 - DROP.z1));
      var tdx = lx - TOWER.x, tdz = lz - TOWER.z, tr = Math.hypot(tdx, tdz);
      if (tr < 8) h = Math.max(h, TOWER.deck + 0.4);
      else if (tr >= SPIRAL.r0 && tr <= SPIRAL.r1) { var th = (Math.atan2(tdx, -tdz) * 180 / Math.PI + 360) % 360; if (th >= SPIRAL.a0) h = Math.max(h, SPIRAL.h * (th - SPIRAL.a0) / (SPIRAL.a1 - SPIRAL.a0)); }
      var out = h * U + deckY; return isFinite(out) ? out : null;   // never feed NaN into the world's ground height
    }
    function toWorld(lx, ly, lz) { G.updateMatrixWorld(true); var v = new THREE.Vector3(lx, ly, lz).applyMatrix4(R.matrixWorld); return { x: v.x, y: v.y, z: v.z }; }
    function dispose() { scene.remove(G); G.traverse(function (o2) { if (o2.geometry) o2.geometry.dispose(); }); }
    return { group: G, deckY: deckY, heightAt: heightAtWorld, gates: gates, ribbon: ribbon, crates: crates, update: update, dispose: dispose, loop: LOOP, version: 2,
      rooms: ROOMS.map(function (r) { var v = toWorld(r.x, 0, r.z); return { id: r.id, name: r.name, x: v.x, z: v.z, r: r.r * U, tag: r.tag }; }),
      entrance: (function () { var v = toWorld(0, 0, PR - 6); return { x: v.x, z: v.z }; })(),
      railsWorld: function () { return railSegs.map(function (s) { var a = toWorld(s.x0, s.y, s.z), b = toWorld(s.x1, s.y, s.z); return { x0: a.x, z0: a.z, x1: b.x, z1: b.z, y: (a.y + b.y) / 2 }; }); },
      // tower lift: host calls towerLift(x, z) on E; returns the other stop (world x/z) when you stand on a lift pad, else null
      towerLift: function (wx, wz) { var l = local(wx, wz), b = LIFT.base, t2 = LIFT.top, to = null;
        if (Math.hypot(l[0] - b[0], l[1] - b[1]) < LIFT.r) to = t2; else if (Math.hypot(l[0] - t2[0], l[1] - t2[1]) < LIFT.r) to = b;
        if (!to) return null; var v = toWorld(to[0], 0, to[1]); return { x: v.x, z: v.z, up: to === t2 }; },
      setCrateVisible: function (i, v) { crVis[i] = !!v; }, cratesWorld: function () { return crPos.map(function (c2) { return toWorld(c2[0], c2[1], c2[2]); }); },
      padsWorld: function () { return padLoc.map(function (q5) { var w = toWorld(q5[0], 0.3, q5[1]); w.yaw = q5[2] + yaw; return w; }); },
      loopWorld: function () { return LOOP.map(function (q6) { return toWorld(q6[0], 0.4, q6[1]); }); } };
  }
  function ribbonMesh(THREE, pts, width) {
    var n = pts.length, pos = [], idx = [], col = [], w = width / 2, up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), side = new THREE.Vector3(), i;
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n], o = pts[(i + n - 1) % n]; a.set(q.x - o.x, 0, q.z - o.z).normalize(); side.crossVectors(up, a).normalize(); pos.push(p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w); col.push(0, 1, 0.61, 0, 1, 0.61); }
    for (i = 0; i < n; i++) { var i0 = i * 2, i1 = ((i + 1) % n) * 2; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  }
  var V2 = { build: build, ROOMS: ROOMS, LOOP: LOOP, version: 2 };
  if (!(root.location && /[?&]park=v1\b/.test(root.location.search))) root.WorldHoverPark = V2;   // v2 by default; ?park=v1 keeps the old park
  root.WorldHoverParkV2 = V2;
})(typeof window !== 'undefined' ? window : globalThis);
