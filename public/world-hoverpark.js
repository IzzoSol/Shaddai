/* world-hoverpark.js — the HOVERSKATE PARK: one realm park with 7 tagged rooms (Pad, Banks, Spine, Plaza, Mirror Pool, Rift Gallery, Forum), a SHADDAI torii entrance,
 * a raised navy deck with cyan/gold trim, magnet rails, banks, bowl, a glowing race ribbon, gates and item crates. Code-built, instanced/merged, anchored anywhere.
 *   var park = WorldHoverPark.build({ THREE, scene, anchor:{x,z}, heightAt, yaw?, U? })     (metres inside; scaled by U at the group)
 *   park.rooms          [{ id, name, x, z, r, tag }]  world positions (Navi map pins), park.entrance, park.deckY
 *   park.heightAt(x,z)  extra surface height (banks/kicker/bowl) in WORLD units at a world position, or null outside the park: the board ground query uses max(terrain, this)
 *   park.gates(circuitId)  [{ x, y, z, kind, verb }] world positions for WorldRace circuits, sampled along the loop
 *   park.ribbon, park.crates (spin in update), park.update(dt)      park.dispose()
 * Theme: navy #0B1020 · cyan #00D4FF · gold #D4AF37 · ember #FF4A1A ONLY in the Rift Gallery. Rails are magnet-light, not glued; lava is a heat hazard (contact = DNF in Rift circuits).
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8;
  var LOOP = [[0, 105], [-70, 82], [-112, 32], [-104, -30], [-62, -90], [12, -112], [84, -92], [132, -42], [122, 10], [72, 42], [22, 62]];   // closed race line (metres, +z = south / park entrance)
  var ROOMS = [
    { id: 'pad', name: 'The Pad', x: 0, z: 108, r: 30, tag: 'Spawn + shop. Flatground, manuals, flips.' }, { id: 'banks', name: 'Banks', x: -78, z: 66, r: 30, tag: 'Carve, drop-ins, pump.' },
    { id: 'spine', name: 'The Spine', x: -96, z: -8, r: 34, tag: 'Magnet rails: 50-50, boardslide, crooked.' }, { id: 'plaza', name: 'Plaza', x: 44, z: 26, r: 32, tag: 'Stairs, ledges, gaps: street lines.' },
    { id: 'pool', name: 'Mirror Pool', x: 112, z: -8, r: 36, tag: 'Water skips, wet manuals. Land flat and it slaps you.' }, { id: 'rift', name: 'Rift Gallery', x: 150, z: -78, r: 30, tag: 'Heat lines by the lava. Prime only. Cones mark safe builds.' },
    { id: 'forum', name: 'The Forum', x: -8, z: -100, r: 46, tag: 'Bowl + big air. Contests, film, ghosts.' }
  ];
  function build(o) {
    var THREE = o.THREE, scene = o.scene, U = o.U || U0, anchor = o.anchor, hAt = o.heightAt || function () { return 0; }, yaw = o.yaw || 0;
    var G = new THREE.Group(); G.name = 'hoverpark'; scene.add(G);
    // raised deck: sample the terrain over the footprint and stand the park on its max so nothing clips
    var maxH = -1e9, minH = 1e9; for (var sx = -180; sx <= 190; sx += 45) for (var sz = -140; sz <= 150; sz += 45) { var hh = hAt(anchor.x + sx * U, anchor.z + sz * U); maxH = Math.max(maxH, hh); minH = Math.min(minH, hh); }
    var deckY = maxH + 1.2 * U; G.position.set(anchor.x, deckY, anchor.z); G.rotation.y = yaw;
    var R = new THREE.Group(); R.scale.setScalar(U); G.add(R);   // author in metres
    var M = function (c, e, ei, m, r) { return new THREE.MeshStandardMaterial({ color: c, emissive: e || 0x000000, emissiveIntensity: ei || 0, metalness: m == null ? 0.4 : m, roughness: r == null ? 0.6 : r }); };
    var navy = M(0x0d1630, 0x0e2a58, 0.45), navy2 = M(0x1a2b52, 0x123366, 0.55), cyan = M(0x06222c, 0x00D4FF, 2.6), gold = M(0xD4AF37, 0xD4AF37, 0.35, 0.9, 0.35), rail = M(0x1a2a3a, 0x00D4FF, 0.9, 0.9, 0.3), ember = M(0x2a0800, 0xFF4A1A, 1.6), stone = M(0x33436e, 0x142a52, 0.8), water = new THREE.MeshStandardMaterial({ color: 0x03202e, emissive: 0x00D4FF, emissiveIntensity: 0.25, transparent: true, opacity: 0.86, metalness: 0.7, roughness: 0.15 });
    function add(geo, mat, x, y, z, rx, ry, rz) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); R.add(m); return m; }
    // deck (rounded slab) + skirt to the ground + cyan edge + gold trim
    var sh = new THREE.Shape(), W = 200, D = 175, rr = 34; sh.moveTo(-W + rr, -D); sh.lineTo(W - rr, -D); sh.quadraticCurveTo(W, -D, W, -D + rr); sh.lineTo(W, D - rr); sh.quadraticCurveTo(W, D, W - rr, D); sh.lineTo(-W + rr, D); sh.quadraticCurveTo(-W, D, -W, D - rr); sh.lineTo(-W, -D + rr); sh.quadraticCurveTo(-W, -D, -W + rr, -D);
    var deckGeo = new THREE.ExtrudeGeometry(sh, { depth: 1.2 + 6, bevelEnabled: false }); deckGeo.rotateX(Math.PI / 2); var deck = add(deckGeo, navy, 0, 0, 0); deck.position.y = 0;   // top at y=0, skirt goes down 7.2 m
    var edge = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }), cyan); edge.rotation.x = Math.PI / 2; edge.position.y = 0.05; edge.scale.set(1.004, 1.004, 1); R.add(edge);
    // grid lines on the deck (cheap): thin cyan strips
    for (var gx = -180; gx <= 180; gx += 30) add(new THREE.BoxGeometry(0.25, 0.04, 2 * D - 40), M(0x0B1020, 0x00a5cc, 0.35), gx, 0.03, 0);
    // ── ROOM COLOUR CODING (TURTLE audit 2026-10-01: the park read as black from the air): per-room ground-glow disc + bright rim ring + tall thin beacon, all unlit (no lights) ──
    var ROOM_COL = { pad: 0x1E90FF, banks: 0x32CD32, spine: 0xFFD700, plaza: 0xFF8C00, pool: 0x00CED1, rift: 0xFF1493, forum: 0xFF4500 };
    var discG = new THREE.CircleGeometry(1, 40), ringG2 = new THREE.RingGeometry(0.965, 1, 56), beamG2 = new THREE.CylinderGeometry(0.5, 0.9, 1, 8, 1, true);
    ROOMS.forEach(function (rm) { var c = ROOM_COL[rm.id] || 0x00D4FF;
      var disc = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })); disc.rotation.x = -Math.PI / 2; disc.scale.set(rm.r, rm.r, 1); disc.position.set(rm.x, 0.07, rm.z); R.add(disc);
      var ring = new THREE.Mesh(ringG2, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.scale.set(rm.r, rm.r, 1); ring.position.set(rm.x, 0.1, rm.z); R.add(ring);
      var beam = new THREE.Mesh(beamG2, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); beam.scale.set(1, 70, 1); beam.position.set(rm.x, 35, rm.z); R.add(beam); });
    // ── torii entrance (SHADDAI) ──
    var torii = new THREE.Group(); torii.position.set(0, 0, D - 14); R.add(torii);
    [-9, 9].forEach(function (x) { var p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 14, 14), M(0x3a0f12, 0x501014, 0.3, 0.3, 0.6)); p.position.set(x, 7, 0); torii.add(p); var l = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), M(0xffb060, 0xffa040, 1.8)); l.position.set(x, 12, 1.4); torii.add(l); });
    var kasa = new THREE.Mesh(new THREE.BoxGeometry(26, 1.3, 3.4), M(0x1b0d10, 0x2a0c10, 0.3)); kasa.position.set(0, 14.5, 0); torii.add(kasa); var kasa2 = kasa.clone(); kasa2.scale.set(0.8, 1.3, 0.8); kasa2.position.y = 16; torii.add(kasa2);
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; var cx = cv.getContext('2d'); cx.fillStyle = '#0B1020'; cx.fillRect(0, 0, 512, 128); cx.strokeStyle = '#D4AF37'; cx.lineWidth = 6; cx.strokeRect(6, 6, 500, 116); cx.fillStyle = '#D4AF37'; cx.font = '700 72px Georgia,serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('S H A D D A I', 256, 68);
    var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; var sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.3), new THREE.MeshBasicMaterial({ map: tx })); sign.position.set(0, 12, 0.25); torii.add(sign);
    // ── PAD: plaza ring + shop kiosk ──
    var P = ROOMS[0]; add(new THREE.CylinderGeometry(P.r, P.r, 0.12, 48), navy2, P.x, 0.06, P.z); add(new THREE.TorusGeometry(P.r - 0.4, 0.25, 6, 48), cyan, P.x, 0.2, P.z, Math.PI / 2); add(new THREE.CylinderGeometry(3, 3.4, 3, 8), gold, P.x + 18, 1.5, P.z - 8);
    // ── BANKS: two facing quarter-pipe banks ──
    function bankGeo(width, radius) { var s = new THREE.Shape(); s.moveTo(0, 0); for (var i = 0; i <= 20; i++) { var a = i / 20 * Math.PI / 2; s.lineTo(radius - Math.cos(a) * radius, Math.sin(a) * radius); } s.lineTo(radius, 0); s.lineTo(0, 0); var g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2); return g; }
    var bg = bankGeo(26, 6.5), B = ROOMS[1]; add(bg, stone, B.x - 12, 0, B.z, 0, 0, 0); var b2 = add(bg, stone, B.x + 12, 0, B.z, 0, Math.PI, 0); add(new THREE.BoxGeometry(0.2, 0.2, 26), cyan, B.x - 12 + 0.1, 6.5, B.z); add(new THREE.BoxGeometry(0.2, 0.2, 26), cyan, B.x + 12 - 0.1, 6.5, B.z);
    // ── SPINE: two ramps back to back + a long magnet rail on posts ──
    var S = ROOMS[2]; add(bankGeo(14, 5), stone, S.x - 4, 0, S.z + 12, 0, Math.PI / 2, 0); add(bankGeo(14, 5), stone, S.x + 4, 0, S.z + 12, 0, -Math.PI / 2, 0);
    for (var ri = 0; ri < 3; ri++) { var rz = S.z - 6 - ri * 9; add(new THREE.BoxGeometry(46, 0.32, 0.5), rail, S.x, 1.0, rz); for (var pi = -2; pi <= 2; pi++) add(new THREE.BoxGeometry(0.35, 1, 0.35), navy2, S.x + pi * 10, 0.5, rz); }
    // ── PLAZA: stairs, ledge, gap ──
    var L = ROOMS[3]; for (var st = 0; st < 6; st++) add(new THREE.BoxGeometry(12, 0.5 * (st + 1), 3), stone, L.x - 16, 0.25 * (st + 1), L.z - 8 + st * 3); add(new THREE.BoxGeometry(24, 0.9, 1.6), navy2, L.x + 6, 0.45, L.z + 8); add(new THREE.BoxGeometry(24, 0.06, 0.3), cyan, L.x + 6, 0.93, L.z + 8); add(new THREE.BoxGeometry(9, 2.2, 9), stone, L.x + 10, 1.1, L.z - 6); add(new THREE.BoxGeometry(9, 2.2, 9), stone, L.x + 26, 1.1, L.z - 6);
    // ── MIRROR POOL: sunken water panel with a glowing skip line ──
    var Po = ROOMS[4]; add(new THREE.BoxGeometry(80, 0.14, 44), water, Po.x, -0.02, Po.z); add(new THREE.BoxGeometry(84, 0.5, 1), stone, Po.x, 0.1, Po.z + 23); add(new THREE.BoxGeometry(84, 0.5, 1), stone, Po.x, 0.1, Po.z - 23);
    for (var sk = -3; sk <= 3; sk++) add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), cyan, Po.x + sk * 11, 0.1, Po.z);
    // ── RIFT GALLERY: lava trench (ember only here) + safety cones + heat glow ──
    var Rf = ROOMS[5]; add(new THREE.BoxGeometry(44, 0.14, 12), ember, Rf.x, -0.04, Rf.z); add(new THREE.BoxGeometry(46, 1.2, 1.4), stone, Rf.x, 0.6, Rf.z + 8); add(new THREE.BoxGeometry(46, 1.2, 1.4), stone, Rf.x, 0.6, Rf.z - 8);
    for (var c = -4; c <= 4; c++) add(new THREE.ConeGeometry(0.4, 1, 8), M(0xff7a1a, 0xff5a00, 0.8), Rf.x + c * 5, 0.5, Rf.z + 11);
    for (var v = 0; v < 8; v++) add(new THREE.ConeGeometry(0.6, 3 + (v % 3), 5), stone, Rf.x + 26 + (v % 2) * 3, 1.5, Rf.z - 16 + v * 4.5);
    // ── FORUM: sunken bowl + bleachers ring + big-air kicker ──
    var F = ROOMS[6]; var prof = []; for (var i2 = 0; i2 <= 24; i2++) { var u = i2 / 24; prof.push(new THREE.Vector2(u * F.r, -7 * (1 - u * u))); }
    var bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), M(0x101a33, 0x0a1a33, 0.5, 0.5, 0.5)); bowl.material.side = THREE.DoubleSide; bowl.position.set(F.x, 0.05, F.z); R.add(bowl); add(new THREE.TorusGeometry(F.r, 0.35, 8, 60), gold, F.x, 0.3, F.z, Math.PI / 2);
    for (var bl = 0; bl < 36; bl++) { var ba = bl / 36 * Math.PI * 2, bx = F.x + Math.cos(ba) * (F.r + 5), bz = F.z + Math.sin(ba) * (F.r + 5); var bk = add(new THREE.BoxGeometry(6, 1.2, 3), navy2, bx, 0.6, bz); bk.rotation.y = -ba + Math.PI / 2; }
    add(bankGeo(10, 4), stone, F.x + F.r + 3, 0, F.z, 0, -Math.PI / 2, 0);
    // ── race ribbon + gates + crates ──
    var pts = LOOP.map(function (p) { return { x: p[0], y: 0.18, z: p[1] }; }); var ribbon = ribbonMesh(THREE, pts, 9); R.add(ribbon);
    function loopAt(t) { var n = LOOP.length, f = ((t % 1) + 1) % 1 * n, i = Math.floor(f), k = f - i, a = LOOP[i % n], b = LOOP[(i + 1) % n]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; }
    var gateMeshes = [], gateCol = { pad: 0x00D4FF, foil: 0xD4AF37, either: 0xffffff, trick: 0xff4aa8, kiss: 0x9d6bff };
    function gates(cid) {
      var C = root.WorldRace && root.WorldRace.CIRCUITS[cid]; if (!C) return []; gateMeshes.forEach(function (g) { R.remove(g); }); gateMeshes = []; var out = [];
      C.gates.forEach(function (g, i) { var q = loopAt(i / C.gates.length), h = g.kind === 'foil' ? 8 : 3.2, w = 9;
        var gt = new THREE.Group(); gt.position.set(q[0], 0, q[1]); gt.rotation.y = q[2]; var m = M(0x0B1020, gateCol[g.kind] || 0x00D4FF, 2.6);
        var l = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), m); l.position.set(-w / 2, h / 2, 0); gt.add(l); var r2 = l.clone(); r2.position.x = w / 2; gt.add(r2); var top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, 0.7), m); top.position.set(0, h, 0); gt.add(top);
        R.add(gt); gateMeshes.push(gt); var wp = new THREE.Vector3(q[0], h / 2, q[1]); wp.applyMatrix4(R.matrixWorld); out.push({ x: q[0], z: q[1], kind: g.kind, verb: g.verb || null, idx: i }); });
      G.updateMatrixWorld(true); return out.map(function (g) { var v = new THREE.Vector3(g.x, 0, g.z).applyMatrix4(R.matrixWorld); return { x: v.x, y: v.y, z: v.z, kind: g.kind, verb: g.verb, idx: g.idx }; });
    }
    var crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4), crates = new THREE.InstancedMesh(crateGeo, M(0x2a2410, 0xD4AF37, 1.3, 0.8, 0.3), 12); var crPos = [];
    for (var ci = 0; ci < 12; ci++) { var q2 = loopAt(ci / 12 + 0.02); crPos.push([q2[0] + Math.cos(ci) * 2.5, 1.5, q2[1] + Math.sin(ci) * 2.5]); } R.add(crates);
    var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), tt = 0;
    var crVis = crPos.map(function () { return true; });
    function update(dt) { tt += dt; for (var k = 0; k < crPos.length; k++) { _e.set(tt * 0.9 + k, tt * 1.3, tt * 0.5); _q.setFromEuler(_e); _p.set(crPos[k][0], crPos[k][1] + Math.sin(tt * 2 + k) * 0.25, crPos[k][2]); _s.setScalar(crVis[k] ? 1 : 0.0001); _m.compose(_p, _q, _s); crates.setMatrixAt(k, _m); } crates.instanceMatrix.needsUpdate = true; }
    update(0);
    // boost pads (turbo chevrons) along the race line: glowing, flat, driven over = 1 s turbo
    var padLoc = []; [0.06, 0.2, 0.34, 0.5, 0.66, 0.82].forEach(function (u) { var q3 = loopAt(u); padLoc.push([q3[0], q3[1], q3[2]]); var pad = new THREE.Group(); pad.position.set(q3[0], 0.3, q3[1]); pad.rotation.y = q3[2];
      for (var ch = 0; ch < 3; ch++) { var ar = new THREE.Shape(); ar.moveTo(-2.4, -1.1); ar.lineTo(0, 0.9); ar.lineTo(2.4, -1.1); ar.lineTo(2.4, -0.4); ar.lineTo(0, 1.6); ar.lineTo(-2.4, -0.4); ar.closePath(); var am = new THREE.Mesh(new THREE.ShapeGeometry(ar), new THREE.MeshBasicMaterial({ color: ch === 1 ? 0xD4AF37 : 0x00D4FF, side: THREE.DoubleSide })); am.rotation.x = -Math.PI / 2; am.position.set(0, 0, -1.6 + ch * 1.6); pad.add(am); } R.add(pad); });
    // ── extra surface height (world units) for banks / kicker / bowl so the board can ride them ──
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    function local(wx, wz) { var dx = (wx - anchor.x) / U, dz = (wz - anchor.z) / U; return [dx * cy - dz * sy, dx * sy + dz * cy]; }   // inverse of the group rotation
    function quarter(x0, z0, w, r, dir, lx, lz) { var dz = Math.abs(lz - z0); if (dz > w / 2) return 0; var t = dir > 0 ? lx - x0 : x0 - lx; if (t < 0 || t > r) return 0; return r - Math.sqrt(Math.max(0, r * r - (r - t) * (r - t))) < 0 ? 0 : Math.sqrt(Math.max(0, r * r - (r - t) * (r - t))); }
    function heightAtWorld(wx, wz) {
      var ddx = wx - anchor.x, ddz = wz - anchor.z, far = (W + D + 60) * U; if (ddx * ddx + ddz * ddz > far * far) return null;   // cheap early-out (this is called for every terrain height query)
      var l = local(wx, wz), lx = l[0], lz = l[1], ox = Math.max(Math.abs(lx) - W, 0), oz = Math.max(Math.abs(lz) - D, 0);
      if (ox > 0 || oz > 0) { var dd = Math.sqrt(ox * ox + oz * oz); if (dd > 28) return null; return deckY - (dd / 28) * (deckY - minH); }   // 28 m apron ramp from the deck down to the lowest ground: roll on and off
      var h = 0;
      var B0 = ROOMS[1], F0 = ROOMS[6];
      h = Math.max(h, quarter(B0.x - 12, B0.z, 26, 6.5, 1, lx, lz), quarter(B0.x + 12, B0.z, 26, 6.5, -1, lx, lz), quarter(F0.x + F0.r + 3, F0.z, 10, 4, -1, lx, lz));
      var fr = Math.hypot(lx - F0.x, lz - F0.z); if (fr < F0.r) h = Math.min(h, -7 * (1 - (fr / F0.r) * (fr / F0.r))); return h * U + deckY;
    }
    function toWorld(lx, ly, lz) { G.updateMatrixWorld(true); var v = new THREE.Vector3(lx, ly, lz).applyMatrix4(R.matrixWorld); return { x: v.x, y: v.y, z: v.z }; }
    function dispose() { scene.remove(G); G.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    // PERF 2026-10-03: the park was ~169 draw calls for ~8k tris (one material per piece). Bake the provably STATIC
    // pieces into one mesh per identical-looking material. Live parts stay separate: gates + ribbon (race feedback), crates (spin).
    (function mergeParkStatic() {
      var skip = new Set(); function mark(x) { if (!x) return; if (Array.isArray(x)) { x.forEach(mark); return; } if (x.isObject3D) x.traverse(function (o) { skip.add(o); }); else if (typeof x === 'object') Object.keys(x).forEach(function (k) { if (x[k] && x[k].isObject3D) mark(x[k]); }); }
      mark(gates); mark(ribbon); mark(crates);
      G.updateMatrixWorld(true); var inv = new THREE.Matrix4().copy(G.matrixWorld).invert(), m4 = new THREE.Matrix4(), byKey = new Map(), kill = [];
      G.traverse(function (o) {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || Array.isArray(o.material) || !o.geometry.attributes.position) return;
        var m = o.material, k = m.type + '|' + (m.color ? m.color.getHex() : '') + '|' + (m.emissive ? m.emissive.getHex() + ':' + m.emissiveIntensity : '') + '|' + m.transparent + ':' + m.opacity + ':' + m.blending + ':' + m.side + ':' + m.depthWrite + '|' + (m.map ? m.map.uuid : '') + '|' + (m.roughness != null ? m.roughness + ':' + m.metalness : '');
        var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
        if (!byKey.has(k)) byKey.set(k, { mat: m, geos: [] }); byKey.get(k).geos.push(g); kill.push(o);
      });
      var merged = 0; byKey.forEach(function (e) {
        if (e.geos.length < 2) { e.geos.forEach(function (g) { g.dispose(); }); e.solo = true; return; }
        var uv = e.geos.every(function (g) { return g.attributes.uv && g.attributes.uv.itemSize === 2; }), n = 0, off = 0; e.geos.forEach(function (g) { n += g.attributes.position.count; });
        var P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = uv ? new Float32Array(n * 2) : null;
        e.geos.forEach(function (g) { P.set(g.attributes.position.array, off * 3); N.set(g.attributes.normal.array, off * 3); if (UV) UV.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose(); });
        var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (UV) mg.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); mg.computeBoundingSphere();
        var mesh = new THREE.Mesh(mg, e.mat); mesh.name = 'park-merged'; G.add(mesh); merged++; e.done = true;
      });
      var keep = new Set(); byKey.forEach(function (e) { if (e.solo) keep.add(e.mat); });
      kill.forEach(function (o) { if (keep.has(o.material)) return; if (o.parent) o.parent.remove(o); });
      G.userData.mergedGroups = merged;
    })();
    return { group: G, rooms: ROOMS.map(function (r) { var v = new THREE.Vector3(r.x, 0, r.z); G.updateMatrixWorld(true); v.applyMatrix4(R.matrixWorld); return { id: r.id, name: r.name, x: v.x, z: v.z, r: r.r * U, tag: r.tag }; }), entrance: (function () { G.updateMatrixWorld(true); var v = new THREE.Vector3(0, 0, D - 14).applyMatrix4(R.matrixWorld); return { x: v.x, z: v.z }; })(), deckY: deckY, heightAt: heightAtWorld, gates: gates, ribbon: ribbon, crates: crates, update: update, dispose: dispose, loop: LOOP,
      railsWorld: function () { var out = [], S2 = ROOMS[2], L2 = ROOMS[3], seg = function (x0, x1, z, y) { var a = toWorld(x0, y, z), b = toWorld(x1, y, z); return { x0: a.x, z0: a.z, x1: b.x, z1: b.z, y: (a.y + b.y) / 2 }; };
        for (var ri = 0; ri < 3; ri++) out.push(seg(S2.x - 23, S2.x + 23, S2.z - 6 - ri * 9, 1.16));   // the three Spine magnet rails
        out.push(seg(L2.x - 6, L2.x + 18, L2.z + 8, 0.93)); return out; },   // the Plaza ledge
      setCrateVisible: function (i, v) { crVis[i] = !!v; }, cratesWorld: function () { return crPos.map(function (c) { return toWorld(c[0], c[1], c[2]); }); }, padsWorld: function () { return padLoc.map(function (q) { var w = toWorld(q[0], 0.3, q[1]); w.yaw = q[2] + yaw; return w; }); }, loopWorld: function () { return LOOP.map(function (q) { return toWorld(q[0], 0.4, q[1]); }); } };
  }
  function ribbonMesh(THREE, pts, width) {
    var n = pts.length, pos = [], idx = [], col = [], w = width / 2, up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), side = new THREE.Vector3(), i;
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n], o = pts[(i + n - 1) % n]; a.set(q.x - o.x, 0, q.z - o.z).normalize(); side.crossVectors(up, a).normalize(); pos.push(p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w); col.push(0, 0.83, 1, 0, 0.83, 1); }
    for (i = 0; i < n; i++) { var i0 = i * 2, i1 = ((i + 1) % n) * 2; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  }
  root.WorldHoverPark = { build: build, ROOMS: ROOMS, LOOP: LOOP };
})(typeof window !== 'undefined' ? window : globalThis);
