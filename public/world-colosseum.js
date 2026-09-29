/* world-colosseum.js — the Colosseum interior at REAL size (docs/COLOSSEUM-AND-DRAGONS-SPEC.md, 2026-09-25).
 *
 *   var arena = window.buildColosseumArena(THREE, { scene })  → room record for world-interiors.js
 *   arena.heightAt(x, z) · arena.contains(x, z) · arena.resolve(pos, prevX, prevZ)
 *   arena.setTheme('classic'|'royal'|'night'|'festival') · arena.setField('sand'|'soccer'|'tactics'|'team-attack'|'party')
 *   arena.spectate(i) (C cycles broadcast cams while inside, X returns to the player)
 *
 * Built on its own island (x = 12000) because the true-size bowl (~205 × 170 m ≈ 800 × 660 units) is wider
 * than the whole city. 1 m = 7/1.8 units. Classical monumental look (owner: "less futuristic").
 * Walkability is one height function + one rule: you can't step UP more than 1 m at a time — that makes the
 * podium wall, tunnel walls and outer shell solid while stairs, ramps and tiers stay walkable.
 */
(function () {
  // ── dimensions (metres) — SINGLE SOURCE OF TRUTH: public/colosseum-dims.json (tests/colosseum/arena.test.js keeps this literal
  //    identical to the JSON; the viewer + server read the JSON). Edit both together. ──
  var D = { U: 7 / 1.8, A: 62, B: 44, POD_T: 2, POD_H: 4, ROWS: 18, TREAD_L: 0.8, TREAD_U: 0.9, RISE_L: 0.45, RISE_U: 0.55, PROM_W: 6, SHELL_GAP: 2, CROWN_H: 46,
    LOBBY_W: 60, LOBBY_D: 32, LOBBY_H: 26, TUNNEL_HALF: 4, STAIR_HALF: 3, VOMITORIA: 8, RAMP_ROWS: 12, SECTIONS: 24 };
  var U = D.U, X0 = (typeof window.ROOM_ISLAND_X === 'number' ? window.ROOM_ISLAND_X + 6000 : 12000), Z0 = 0;   // v4: room island moves beyond the 10 km world (world-interiors sets ROOM_ISLAND_X)
  var A = D.A, B = D.B;                    // arena floor ellipse semi-axes (124 x 88 m): 100 x 64 field + runoff
  var POD_T = D.POD_T, POD_H = D.POD_H;    // podium wall thickness / height
  var ROWS = D.ROWS, TREAD = D.TREAD_L, TREAD_U = D.TREAD_U, RISE_L = D.RISE_L, RISE_U = D.RISE_U;   // upper tier tread 0.9 m -> 31.4 deg (was 34.5), more seats
  var LOW0 = POD_T, LOW1 = LOW0 + ROWS * TREAD;            // lower tier (horizontal offset from floor edge)
  var PROM1 = LOW1 + D.PROM_W;                              // promenade ring
  var UP1 = PROM1 + ROWS * TREAD_U;                         // upper tier
  var SHELL = UP1 + D.SHELL_GAP, CROWN_H = D.CROWN_H;      // outer wall
  var H_LOW = POD_H + ROWS * RISE_L, H_UP = H_LOW + ROWS * RISE_U;
  var LOBBY_W = D.LOBBY_W, LOBBY_D = D.LOBBY_D, LOBBY_H = D.LOBBY_H, LOBBY_Z0 = B + SHELL;   // lobby sits against the south shell
  var TUNNEL_HALF = D.TUNNEL_HALF;                          // 8 m wide players' tunnels on the 4 axes
  var STAIR_HALF = D.STAIR_HALF;                            // 6 m vomitoria (stair gaps) in the podium
  var NVOM = D.VOMITORIA, VOM0 = Math.PI / NVOM;           // 8 gaps evenly spaced, offset half a step so none sits on a tunnel axis
  var RAMP = LOW0 + D.RAMP_ROWS * TREAD;                    // the vomitorium ramp runs from the floor up to the tier surface over this offset

  // distance d (metres) from the floor-ellipse edge along its offset family: (x/(A+d))^2 + (z/(B+d))^2 = 1
  function offsetOf(x, z) {
    if ((x * x) / (A * A) + (z * z) / (B * B) <= 1) return -1;
    var lo = 0, hi = 400;
    for (var i = 0; i < 28; i++) { var m = (lo + hi) / 2, q = (x * x) / ((A + m) * (A + m)) + (z * z) / ((B + m) * (B + m)); if (q > 1) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function inTunnel(x, z) { return Math.abs(x) < TUNNEL_HALF || Math.abs(z) < TUNNEL_HALF; }
  function inStairGap(x, z) {          // radial gaps: arc distance to the nearest of NVOM rays (measured tangentially)
    var r = Math.hypot(x, z) || 1, step = Math.PI * 2 / NVOM, ang = Math.atan2(z, x) - VOM0;
    var k = Math.round(ang / step), da = Math.abs(ang - k * step);
    return da * r < STAIR_HALF;
  }
  function inLobby(x, z) { return Math.abs(x) <= LOBBY_W / 2 && z >= LOBBY_Z0 - 1 && z <= LOBBY_Z0 + LOBBY_D; }
  function tierH(dd) { return POD_H + ((dd - LOW0) / (LOW1 - LOW0)) * (H_LOW - POD_H); }
  function rampH(d) { return tierH(RAMP) * (d / RAMP); }
  // height in METRES at local (x, z); 999 = solid wall.  hLocal is the SOLE collision + seating source.
  function hLocal(x, z) {
    if (inLobby(x, z)) return 0;
    var d = offsetOf(x, z);
    if (d < 0) return 0;                                            // arena floor
    if (Math.abs(x) < TUNNEL_HALF && z > 0 && d < SHELL + 2) return 0;   // south grand tunnel -> lobby
    if (inTunnel(x, z) && d < LOW1) return 0;                      // other 3 players' tunnels (end at the promenade wall)
    if (d < RAMP && inStairGap(x, z)) return rampH(d);             // vomitoria: one continuous ramp from the floor up into the lower tier
    if (d < LOW0) return POD_H;                                     // podium wall
    if (d < LOW1) return tierH(d);                                  // lower tier (smooth ramp under the steps)
    if (d < PROM1) return H_LOW;                                    // promenade
    if (d < UP1) return H_LOW + ((d - PROM1) / (UP1 - PROM1)) * (H_UP - H_LOW);
    return 999;                                                     // outer shell
  }
  // contains(): true for the whole walkable footprint (bowl + shell + lobby) with a small margin; hLocal returns 999 beyond the shell
  var HALF_X = A + SHELL + 6, HALF_Z_N = B + SHELL + 6, HALF_Z_S = LOBBY_Z0 + LOBBY_D + 6;

  // district-visit writer: the Ring Train unlock (index.html) reads shd_dist_visited but nothing ever wrote it.
  if (!window.__shdVisitDistrict) window.__shdVisitDistrict = function (id) {
    try {
      var seen = JSON.parse(localStorage.getItem('shd_dist_seen') || '[]'); if (!Array.isArray(seen)) seen = [];
      if (seen.indexOf(id) < 0) { seen.push(id); localStorage.setItem('shd_dist_seen', JSON.stringify(seen)); }
      localStorage.setItem('shd_dist_visited', String(seen.length));
      return seen.length;
    } catch (e) { return 0; }
  };

  // ── WORLD EXTERIOR (atlas "Southern Colosseum") — the SAME building at the SAME real size, standing on the map
  //    just outside the transit ring, lobby facing the city. Walk up the front steps → E at the lobby doors →
  //    you're inside the arena instance above. Parse time: publishes the door + pushes shell/lobby colliders. ──
  var _L = window.WORLD_LAYOUT, _lm = _L && _L.landmark && _L.landmark('colosseum');
  if (_lm) {
    var CX = _lm.pos[0], CZ = _lm.pos[1], FACE = Math.atan2(-CZ, -CX);   // unit dir from the colosseum toward the city
    var fX = Math.cos(FACE), fZ = Math.sin(FACE), sX = fZ, sZ = -fX;       // front (lobby side) + side axes = three.js local +z / +x at rotation.y = atan2(fX, fZ)
    // local metres (lx along the long axis, lz toward the lobby/front) → world units
    var W = function (lx, lz) { return [CX + (sX * lx + fX * lz) * U, CZ + (sZ * lx + fZ * lz) * U]; };
    var ext = { x: CX, z: CZ, face: FACE, W: W, door: W(0, LOBBY_Z0 + LOBBY_D + 1), front: [fX, fZ] };
    window.COLOSSEUM_WORLD = ext;
    if (_L.realmColliders) {
      var ring = Math.round((Math.PI * (A + B + 2 * SHELL)) / 7);   // ~7 m spacing, r 5 m → a continuous wall
      for (var ci = 0; ci < ring; ci++) { var ct = ci / ring * Math.PI * 2, p = W((A + SHELL - 4) * Math.cos(ct), (B + SHELL - 4) * Math.sin(ct)); _L.realmColliders.push({ x: Math.round(p[0]), z: Math.round(p[1]), r: Math.round(5 * U), label: 'colosseum-shell' }); }
      for (var lx2 = -LOBBY_W / 2 + 6; lx2 <= LOBBY_W / 2 - 6; lx2 += 8) for (var lz2 = LOBBY_Z0 + 2; lz2 <= LOBBY_Z0 + LOBBY_D - 5; lz2 += 8) { var q2 = W(lx2, lz2); _L.realmColliders.push({ x: Math.round(q2[0]), z: Math.round(q2[1]), r: Math.round(6 * U), label: 'colosseum-lobby' }); }
    }
    window.buildColosseumExterior = function (THREE, opts) {
      var scene = opts.scene, heightAt = opts.heightAt || function () { return 0; };
      var g0 = heightAt(CX, CZ);
      var group = new THREE.Group(); group.name = 'colosseum-exterior'; group.position.set(CX, g0, CZ);
      group.rotation.y = Math.atan2(fX, fZ);   // local +z → front (toward the city), local +x → (sX, sZ)
      var root = new THREE.Group(); root.scale.setScalar(U); group.add(root);
      var M = function (c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0.05 }, o || {})); };
      var mats = { stone: M(0xd8c9a8), dark: M(0x6f624d), recess: M(0x2a241c), trim: M(0xc9a24a, { metalness: 0.6, roughness: 0.35 }), seat: M(0xbfae8c), sand: M(0xd9c08a, { roughness: 1 }), banner: M(0x9e1b1b, { side: THREE.DoubleSide }),
        star: new THREE.MeshStandardMaterial({ color: 0x5fe0ff, emissive: 0x5fe0ff, emissiveIntensity: 2.2, roughness: 0.2 }) };
      function ell(d, y, h, mat, open) { var m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 160, 1, !!open), mat); m.scale.set(A + d, 1, B + d); m.position.y = y + h / 2; if (open) m.material.side = THREE.DoubleSide; root.add(m); return m; }
      // outer wall: dark arch recesses behind a colonnade of pillars, 4 storeys, gold cornices; attic storey on top
      var storeys = 4, per = 80, sh = (CROWN_H - 8) / storeys;
      ell(SHELL - 1.6, 0, CROWN_H, mats.recess, true);
      var pil = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, sh - 1.4, 2.4), mats.stone, storeys * per), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), k = 0;
      for (var s = 0; s < storeys; s++) for (var i = 0; i < per; i++) {
        var t = i / per * Math.PI * 2, nx = (A + SHELL) * Math.cos(t), nz = (B + SHELL) * Math.sin(t);
        pil.setMatrixAt(k++, mm.compose(vv.set(nx, s * sh + (sh - 1.4) / 2, nz), qq.setFromAxisAngle(up, -Math.atan2(nz / ((B + SHELL) * (B + SHELL)), nx / ((A + SHELL) * (A + SHELL)))), ss));
      }
      pil.castShadow = true; root.add(pil);
      for (var c = 1; c <= storeys; c++) ell(SHELL + 0.4, c * sh - 1.4, 1.4, mats.trim, true);
      ell(SHELL, CROWN_H - 8, 8, mats.stone, true);                     // attic storey
      ell(SHELL + 0.5, CROWN_H - 0.8, 0.8, mats.trim, true);            // crown line
      // roof ring + seating bowl (seen from the air / the maglev) + sand floor
      var rim = new THREE.Mesh(new THREE.RingGeometry(1 - 0.02, 1, 160), mats.stone); rim.rotation.x = -Math.PI / 2; rim.scale.set(A + SHELL, B + SHELL, 1); rim.position.y = CROWN_H; root.add(rim);
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.58, H_UP, 160, 1, true), mats.seat); bowl.material.side = THREE.DoubleSide; bowl.scale.set(A + UP1, 1, B + UP1); bowl.position.y = H_UP / 2; root.add(bowl);
      var cap = new THREE.Mesh(new THREE.RingGeometry(1, (A + SHELL) / (A + UP1), 160), mats.stone); cap.rotation.x = -Math.PI / 2; cap.scale.set(A + UP1, B + UP1, 1); cap.position.y = H_UP; root.add(cap);
      var sand = new THREE.Mesh(new THREE.CircleGeometry(1, 96), mats.sand); sand.rotation.x = -Math.PI / 2; sand.scale.set(A, B, 1); sand.position.y = 0.2; root.add(sand);
      // banners on the outside of the attic
      var bg = new THREE.PlaneGeometry(5, 14);
      for (var b = 0; b < 20; b++) { var tb = b / 20 * Math.PI * 2, bn = new THREE.Mesh(bg, mats.banner); bn.position.set((A + SHELL + 0.9) * Math.cos(tb), CROWN_H - 12, (B + SHELL + 0.9) * Math.sin(tb)); bn.lookAt(bn.position.x * 2, CROWN_H - 12, bn.position.z * 2); root.add(bn); }
      // lobby: temple front — podium steps, 8 columns, pediment, bronze doors, the atlas star emblem
      var lob = new THREE.Group(); lob.position.set(0, 0, LOBBY_Z0 + LOBBY_D / 2); root.add(lob);
      var hall = new THREE.Mesh(new THREE.BoxGeometry(LOBBY_W, LOBBY_H, LOBBY_D), mats.stone); hall.position.y = LOBBY_H / 2; hall.castShadow = true; lob.add(hall);
      for (var st = 0; st < 4; st++) { var step = new THREE.Mesh(new THREE.BoxGeometry(LOBBY_W + 8 - st * 2, 0.5, 6 - st * 1.2), mats.dark); step.position.set(0, 0.25 + st * 0.5, LOBBY_D / 2 + 3 - st * 0.6); lob.add(step); }
      var colG = new THREE.CylinderGeometry(1.2, 1.4, LOBBY_H - 4, 20);
      for (var cx2 = -3.5; cx2 <= 3.5; cx2++) { var col = new THREE.Mesh(colG, mats.stone); col.position.set(cx2 * 7.8, 2 + (LOBBY_H - 4) / 2, LOBBY_D / 2 + 3); col.castShadow = true; lob.add(col); }
      var ent = new THREE.Mesh(new THREE.BoxGeometry(LOBBY_W + 4, 2.4, 8), mats.trim); ent.position.set(0, LOBBY_H - 0.8, LOBBY_D / 2 + 2); lob.add(ent);
      var tri = new THREE.Shape(); tri.moveTo(-(LOBBY_W + 4) / 2, 0); tri.lineTo((LOBBY_W + 4) / 2, 0); tri.lineTo(0, 8); tri.closePath();
      var ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 8, bevelEnabled: false }), mats.stone); ped.position.set(0, LOBBY_H + 0.4, LOBBY_D / 2 - 2); ped.castShadow = true; lob.add(ped);   // pediment
      var door = new THREE.Mesh(new THREE.BoxGeometry(12, 16, 0.6), M(0x6b4a22, { metalness: 0.7, roughness: 0.4 })); door.position.set(0, 8 + 2, LOBBY_D / 2 + 0.35); lob.add(door);
      var star = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), mats.star); star.scale.set(1, 1.5, 0.35); star.position.set(0, LOBBY_H + 5, LOBBY_D / 2 + 6.5); lob.add(star);
      var glow = new THREE.PointLight(0x5fe0ff, 60, 60 * U, 1.8); glow.position.set(0, LOBBY_H + 5, LOBBY_D / 2 + 10); lob.add(glow);
      var sign = (function () { var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; var x = cv.getContext('2d'); x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, 1024, 128); x.fillStyle = '#5a4520'; x.font = '700 72px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SOUTHERN COLOSSEUM', 512, 68); var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(44, 5.5), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 })); })();
      sign.position.set(0, LOBBY_H - 0.8, LOBBY_D / 2 + 6.05); lob.add(sign);
      scene.add(group);
      if (window.__registerPlaceable) window.__registerPlaceable('landmark:colosseum', group, { source: 'world-colosseum.js' });
      return { group: group, door: ext.door, update: function (t) { star.rotation.y = t * 0.6; } };
    };
  }

  window.buildColosseumArena = function (THREE, opts) {
    var scene = opts.scene;
    var group = new THREE.Group(); group.name = 'interior_COLOSSEUM'; group.position.set(X0, 0, Z0); group.visible = false;
    var root = new THREE.Group(); root.scale.setScalar(U); group.add(root);          // author everything in metres
    var M = function (c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0.05 }, o || {})); };
    var L = function (c, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})); };   // Lambert = far cheaper fragments than Standard on Intel HD (matte stone doesn't need PBR)
    var mats = { stone: L(0xd8c9a8), stoneDark: L(0xa8977a), trim: M(0xc9a24a, { metalness: 0.6, roughness: 0.35 }), banner: L(0x9e1b1b, { side: THREE.DoubleSide }), seat: L(0xbfae8c), floor: M(0xffffff, { roughness: 0.95 }), screen: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      neon: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xc9a24a, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.2 }) };
    var glowEntries = [{ mat: mats.neon, base: 0.4, amp: 0.2, phase: 0 }];   // world-interiors pulses these (emissiveIntensity = base + amp*wave) — themes retune base/amp

    // ── floor (canvas texture = field mode) ──
    var fc = document.createElement('canvas'); fc.width = 2048; fc.height = 1454; var fx = fc.getContext('2d');
    var ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace; ftex.anisotropy = 8; mats.floor.map = ftex;
    var floorGeo = new THREE.CircleGeometry(1, 96); floorGeo.rotateX(-Math.PI / 2);
    var floor = new THREE.Mesh(floorGeo, mats.floor); floor.scale.set(A, 1, B); floor.receiveShadow = true; root.add(floor);
    // floor UVs from x/z so the pitch drawing maps 1:1 onto the ellipse's bounding box
    (function () { var p = floorGeo.attributes.position, uv = floorGeo.attributes.uv; for (var i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 1) / 2, 1 - (p.getZ(i) + 1) / 2); uv.needsUpdate = true; })();

    // ── stepped ring geometry: rows between offsets d0..d1, heights h0..h1, skipping tunnels ──
    function ringBand(d0, d1, h0, h1, rows, mat, opts2) {
      opts2 = opts2 || {}; var pos = [], N = 192;
      for (var r = 0; r < rows; r++) {
        var da = d0 + (d1 - d0) * r / rows, db = d0 + (d1 - d0) * (r + 1) / rows, y0 = h0 + (h1 - h0) * r / rows, y1 = h0 + (h1 - h0) * (r + 1) / rows;
        for (var i = 0; i < N; i++) {
          var t0 = i / N * Math.PI * 2, t1 = (i + 1) / N * Math.PI * 2, tm = (t0 + t1) / 2;
          var mx = (A + da) * Math.cos(tm), mz = (B + da) * Math.sin(tm);
          if (!opts2.solid && (inTunnel(mx, mz) || (opts2.gaps && inStairGap(mx, mz)) || (opts2.rampUntil && da < opts2.rampUntil - 1e-6 && inStairGap(mx, mz)))) continue;
          var P = function (t, d) { return [(A + d) * Math.cos(t), (B + d) * Math.sin(t)]; };
          var a0 = P(t0, da), a1 = P(t1, da), b0 = P(t0, db), b1 = P(t1, db);
          // riser (vertical face at da, from y0 to y1) + tread (horizontal at y1 from da to db)
          pos.push(a0[0], y0, a0[1], a1[0], y0, a1[1], a1[0], y1, a1[1], a0[0], y0, a0[1], a1[0], y1, a1[1], a0[0], y1, a0[1]);
          pos.push(a0[0], y1, a0[1], a1[0], y1, a1[1], b1[0], y1, b1[1], a0[0], y1, a0[1], b1[0], y1, b1[1], b0[0], y1, b0[1]);
        }
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      var m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide; m.receiveShadow = true; m.castShadow = false; root.add(m); return m;
    }
    ringBand(0, LOW0, 0, POD_H, 1, mats.stoneDark, { gaps: true });          // podium wall (stair gaps at the diagonals)
    ringBand(LOW0, LOW1, POD_H, H_LOW, ROWS, mats.seat, { rampUntil: RAMP });  // lower tier (rows under the vomitorium ramps are left out — the ramp mesh replaces them)
    ringBand(LOW1, PROM1, H_LOW, H_LOW, 1, mats.stone);                      // promenade
    ringBand(PROM1, UP1, H_LOW, H_UP, ROWS, mats.seat);                      // upper tier
    // ── vomitoria: NVOM sloped ramps + side walls, generated from the SAME rampH/tierH/inStairGap that hLocal uses ──
    (function () {
      var pos = [], SEG = 14;
      function quad(a, b, c, d) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]); }
      for (var k = 0; k < NVOM; k++) {
        var th = VOM0 + k * Math.PI * 2 / NVOM, cs = Math.cos(th), sn = Math.sin(th);
        var rF = 1 / Math.sqrt((cs / A) * (cs / A) + (sn / B) * (sn / B)), r0 = rF, r1 = rF + RAMP * 1.6;
        for (var it = 0; it < 30; it++) { var rm = (r0 + r1) / 2; if (offsetOf(rm * cs, rm * sn) < RAMP) r0 = rm; else r1 = rm; }
        var rEnd = r0, prevL = null, prevR = null;
        for (var i = 0; i <= SEG; i++) {
          var rr = rF + (rEnd - rF) * i / SEG, cx = rr * cs, cz = rr * sn, lx = -sn * STAIR_HALF, lz = cs * STAIR_HALF;
          var dl = Math.max(0, offsetOf(cx + lx, cz + lz)), dr = Math.max(0, offsetOf(cx - lx, cz - lz));
          var L = [cx + lx, rampH(dl), cz + lz], R = [cx - lx, rampH(dr), cz - lz];
          var LT = [L[0], dl >= LOW0 ? tierH(dl) : POD_H, L[2]], RT = [R[0], dr >= LOW0 ? tierH(dr) : POD_H, R[2]];
          if (prevL) {
            quad(prevL.p, prevR.p, R, L);                                  // ramp surface
            quad(prevL.p, L, LT, prevL.t); quad(prevR.p, prevR.t, RT, R);   // side walls up to the tier / podium top
          }
          prevL = { p: L, t: LT }; prevR = { p: R, t: RT };
        }
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      var m = new THREE.Mesh(g, mats.stoneDark); m.name = 'vomitoria'; m.receiveShadow = true; root.add(m);
    })();
    // gold trim line on the podium top + promenade parapet
    function ellipseLine(d, y, mat, h) { var g = new THREE.CylinderGeometry(1, 1, h, 192, 1, true); var m = new THREE.Mesh(g, mat); m.scale.set(A + d, 1, B + d); m.position.y = y + h / 2; m.material.side = THREE.DoubleSide; root.add(m); return m; }
    ellipseLine(0, POD_H - 0.3, mats.neon, 0.3);
    ellipseLine(PROM1 - 0.2, H_LOW, mats.stoneDark, 1.1);
    // ── build helpers (build-time only; nothing here runs per frame) ──
    var frameHooks = [];                                   // called from the interiors animation clock (see TIME below): fn(dt)
    var _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
    function compose(m, x, y, z, yaw, sx, sy, sz) { _q.setFromAxisAngle(_up, yaw || 0); return m.compose(_v.set(x, y, z), _q, _s.set(sx || 1, sy || 1, sz || 1)); }
    function perim(d, n, phase) {           // n points at equal ARC LENGTH on the offset ellipse; yaw aims a model's local +z along the outward normal
      var M2 = 720, a = A + d, b = B + d, cum = [0], px = a, pz = 0, i, len = 0;
      for (i = 1; i <= M2; i++) { var t = i / M2 * Math.PI * 2, x = a * Math.cos(t), z = b * Math.sin(t); len += Math.hypot(x - px, z - pz); cum.push(len); px = x; pz = z; }
      var out = [];
      for (i = 0; i < n; i++) {
        var target = (((i + (phase || 0)) / n) % 1) * len, lo = 0, hi = M2; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid; }
        var tt2 = (lo + (target - cum[lo]) / (cum[lo + 1] - cum[lo])) / M2 * Math.PI * 2, X = a * Math.cos(tt2), Z = b * Math.sin(tt2), nx = X / (a * a), nz = Z / (b * b), nl = Math.hypot(nx, nz);
        out.push({ x: X, z: Z, nx: nx / nl, nz: nz / nl, yaw: Math.atan2(nx / nl, nz / nl) });
      }
      out.len = len; return out;
    }
    function mergeGeos(parts) {
      var pos = [], nor = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
      parts.forEach(function (p) { var g = p.geo.index ? p.geo.toNonIndexed() : p.geo, pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(p.m);
        for (var i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(p.m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); } });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
    }
    function T4(x, y, z, sx, sy, sz) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx || 1, sy || 1, sz || 1)); }
    function instanced(geo, mat, n, fill, name) {
      var im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(); im.name = name || 'inst';
      for (var i = 0; i < n; i++) { fill(i, m); im.setMatrixAt(i, m); }
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; root.add(im); return im;
    }
    function annulus(dIn, dOut, y, mat) {          // flat elliptic ring between two offsets (double-sided)
      var N = 192, pos = [], a, b, c, d;
      for (var i = 0; i < N; i++) { var t0 = i / N * Math.PI * 2, t1 = (i + 1) / N * Math.PI * 2;
        a = [(A + dIn) * Math.cos(t0), (B + dIn) * Math.sin(t0)]; b = [(A + dIn) * Math.cos(t1), (B + dIn) * Math.sin(t1)]; c = [(A + dOut) * Math.cos(t1), (B + dOut) * Math.sin(t1)]; d = [(A + dOut) * Math.cos(t0), (B + dOut) * Math.sin(t0)];
        pos.push(a[0], y, a[1], c[0], y, c[1], b[0], y, b[1], a[0], y, a[1], d[0], y, d[1], c[0], y, c[1]); }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      var m = new THREE.Mesh(g, mat); mat.side = THREE.DoubleSide; root.add(m); return m;
    }
    function bayGeo(w, h, openW, openH, base, depth) {   // wall panel with an arched opening (extruded); local x = along the wall, y up, z = thickness
      var sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.closePath();
      var r = openW / 2, hole = new THREE.Path(); hole.moveTo(-r, base); hole.lineTo(r, base); hole.lineTo(r, base + openH - r); hole.absarc(0, base + openH - r, r, 0, Math.PI, false); hole.lineTo(-r, base); sh.holes.push(hole);
      var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -depth / 2); return g;
    }
    mats.recess = L(0x2a241c);

    // ── outer wall interior: dark backing wall, base cap, then the 22-46 m DEAD BAND, now filled ──
    //   y 22-34  arcaded storey (80 arched bays) + 40 VIP loggias (160 seats) + sky gallery / agent trading floor ledge at y = 32
    //   y 34-46  attic storey (80 windows with statues + backlit niches), 4 big screens, banners, velarium rigging at the crown
    var BAYS = 80, PA = SHELL - 1.6, wallH = CROWN_H - H_UP;
    ellipseLine(SHELL, H_UP - 0.5, mats.recess, wallH + 0.5);
    annulus(UP1, SHELL, H_UP, mats.stoneDark);
    var bayPts = perim(PA, BAYS, 0), bayW = bayPts.len / BAYS * 1.03, ROWH = 12;
    instanced(bayGeo(bayW, ROWH, 4.6, 8.6, 1.0, 1.4), mats.stone, BAYS, function (i, m) { var p = bayPts[i]; compose(m, p.x, H_UP, p.z, p.yaw); }, 'bays-lower');
    instanced(bayGeo(bayW, ROWH, 3.0, 5.6, 2.6, 1.4), mats.stone, BAYS, function (i, m) { var p = bayPts[i]; compose(m, p.x, H_UP + ROWH, p.z, p.yaw); }, 'bays-attic');
    [H_UP, H_UP + ROWH - 0.4, CROWN_H - 0.8].forEach(function (y) { ellipseLine(SHELL - 2.4, y, mats.trim, 0.8); });
    // attic statues + backlit niches (emissive, themed)
    var statueGeo = mergeGeos([{ geo: new THREE.BoxGeometry(1.3, 1.2, 1.3), m: T4(0, 0.6, 0) }, { geo: new THREE.CylinderGeometry(0.32, 0.45, 2.3, 8), m: T4(0, 2.35, 0) },
      { geo: new THREE.SphereGeometry(0.3, 8, 6), m: T4(0, 3.75, 0) }, { geo: new THREE.BoxGeometry(1.5, 0.22, 0.28), m: T4(0, 3.1, 0) }]);
    instanced(statueGeo, mats.stone, BAYS, function (i, m) { var p = bayPts[i]; compose(m, p.x - p.nx * 0.5, H_UP + ROWH + 2.6, p.z - p.nz * 0.5, p.yaw + Math.PI); }, 'statues');
    instanced(new THREE.PlaneGeometry(2.7, 5.4), mats.neon, BAYS, function (i, m) { var p = bayPts[i]; compose(m, p.x + p.nx * 0.55, H_UP + ROWH + 2.6 + 2.7, p.z + p.nz * 0.55, p.yaw + Math.PI); }, 'niche-glow');
    // VIP loggias: 40 balconies x 4 seats = 160
    var NLOG = 40, logPts = perim(SHELL - 3.8, NLOG, 0.25), LOGY = H_UP + 3;
    instanced(new THREE.BoxGeometry(5.4, 0.5, 3.4), mats.stoneDark, NLOG, function (i, m) { var p = logPts[i]; compose(m, p.x, LOGY, p.z, p.yaw); }, 'loggia-floor');
    instanced(new THREE.BoxGeometry(5.4, 0.9, 0.14), mats.neon, NLOG, function (i, m) { var p = logPts[i]; compose(m, p.x - p.nx * 1.6, LOGY + 0.7, p.z - p.nz * 1.6, p.yaw); }, 'loggia-rail');
    var vipSeatGeo = mergeGeos([{ geo: new THREE.BoxGeometry(0.62, 0.36, 0.56), m: T4(0, 0.45, 0) }, { geo: new THREE.BoxGeometry(0.62, 0.7, 0.1), m: T4(0, 0.85, 0.28) }]);
    var vipSeats = [];
    instanced(vipSeatGeo, mats.banner, NLOG * 4, function (i, m) {
      var p = logPts[(i / 4) | 0], k2 = i % 4, lx = (k2 & 1 ? 1 : -1) * 0.95, lz = k2 < 2 ? 0.7 : -0.5, c = Math.cos(p.yaw), s = Math.sin(p.yaw);   // local (lx, lz) -> plan: x' = lx*c + lz*s, z' = -lx*s + lz*c
      var wx = p.x + lx * c + lz * s, wz = p.z - lx * s + lz * c; compose(m, wx, LOGY + 0.25, wz, p.yaw); vipSeats.push({ x: wx, y: LOGY + 0.25, z: wz, yaw: p.yaw + Math.PI, loggia: (i / 4) | 0 });
    }, 'vip-seats');
    // sky gallery = the agent trading floor at y = 32 (ledge in front of the arcade, overlooking the arena)
    var AGY = 32, GIN = SHELL - 7.2, GOUT = SHELL - 2.4;
    annulus(GIN, GOUT, AGY, mats.stoneDark); ellipseLine(GIN, AGY - 0.6, mats.stoneDark, 0.6); ellipseLine(GIN, AGY, mats.neon, 0.14); ellipseLine(GIN, AGY + 0.95, mats.neon, 0.1);
    var NAG = 24, agPts = perim((GIN + GOUT) / 2 + 0.6, NAG, 0.5), agentSlots = [];
    instanced(new THREE.BoxGeometry(1.7, 1.05, 0.8), mats.stoneDark, NAG, function (i, m) { var p = agPts[i]; compose(m, p.x - p.nx * 0.9, AGY + 0.55, p.z - p.nz * 0.9, p.yaw); }, 'agent-desks');
    instanced(new THREE.BoxGeometry(1.5, 0.08, 0.6), mats.neon, NAG, function (i, m) { var p = agPts[i]; compose(m, p.x - p.nx * 0.9, AGY + 1.1, p.z - p.nz * 0.9, p.yaw); }, 'agent-screens');
    agPts.forEach(function (p, i) { agentSlots.push({ id: i, x: p.x + p.nx * 0.25, y: AGY, z: p.z + p.nz * 0.25, yaw: p.yaw + Math.PI }); });
    // banners (40, instanced, hang from the crown facing in)
    var bnPts = perim(SHELL - 3, 40, 0.5);
    instanced(new THREE.PlaneGeometry(4.6, 13), mats.banner, 40, function (i, m) { var p = bnPts[i]; compose(m, p.x, CROWN_H - 8, p.z, p.yaw + Math.PI); }, 'banners');
    // four big screens (N S E W) sharing one canvas texture
    var sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512; var sx = sc.getContext('2d');
    var stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace; mats.screen.map = stex;
    var scrPos = [[0, -(B + UP1 - 4)], [0, (B + UP1 - 4)], [-(A + UP1 - 4), 0], [(A + UP1 - 4), 0]];
    instanced(new THREE.PlaneGeometry(32, 16), mats.screen, 4, function (i, m) { var s3 = scrPos[i]; compose(m, s3[0], H_UP + 12, s3[1], Math.atan2(-s3[0], -s3[1])); }, 'screens');
    // velarium: retractable Roman awning. Geometry is a unit fan; the vertex shader places it on the shell (uOpen 0 = furled, 1 = fully drawn), so retracting costs one uniform
    var velU = { uOpen: { value: 0 }, uAB: { value: new THREE.Vector2(A, B) }, uShell: { value: SHELL }, uExt: { value: 21 }, uCrown: { value: CROWN_H }, uYin: { value: CROWN_H - 10 }, uC1: { value: new THREE.Color(0x9e1b1b) }, uC2: { value: new THREE.Color(0xd8c9a8) } };
    var velMat = new THREE.ShaderMaterial({ uniforms: velU, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      vertexShader: 'uniform float uOpen; uniform vec2 uAB; uniform float uShell; uniform float uExt; uniform float uCrown; uniform float uYin; varying vec2 vUv;' +
        'void main(){ float v = position.y; float d = uShell - v * uExt * uOpen; vec2 u = vec2(position.x, position.z);' +
        ' vec3 p = vec3((uAB.x + d) * u.x, uCrown - v * uOpen * (uCrown - uYin) - sin(3.14159 * v) * 0.9 * uOpen, (uAB.y + d) * u.y); vUv = vec2(v, atan(u.y, u.x));' +
        ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform vec3 uC1; uniform vec3 uC2; varying vec2 vUv; void main(){ float s = step(0.5, fract(vUv.y * 4.7746)); vec3 c = mix(uC1, uC2, s) * (0.72 + 0.28 * vUv.x); gl_FragColor = vec4(c, 0.86); }' });
    (function () {
      var NS = 192, NV = 6, pos = [], idx = [];
      for (var vi = 0; vi <= NV; vi++) for (var si = 0; si <= NS; si++) { var t = si / NS * Math.PI * 2; pos.push(Math.cos(t), vi / NV, Math.sin(t)); }
      for (var vj = 0; vj < NV; vj++) for (var sj = 0; sj < NS; sj++) { var a0 = vj * (NS + 1) + sj, b0 = a0 + 1, c0 = a0 + NS + 1, d0 = c0 + 1; idx.push(a0, c0, b0, b0, c0, d0); }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      var vm = new THREE.Mesh(g, velMat); vm.name = 'velarium'; vm.frustumCulled = false; vm.renderOrder = 5; root.add(vm); velU.mesh = vm;
    })();
    var vel = { target: 0.7, open: 0 };
    frameHooks.push(function (dt) { var k = Math.min(1, dt * 1.4); if (Math.abs(vel.target - vel.open) > 0.002) { vel.open += (vel.target - vel.open) * k; velU.uOpen.value = vel.open; velU.mesh.visible = vel.open > 0.02; } });
    function drawScreen(line2) {
      sx.fillStyle = '#05070a'; sx.fillRect(0, 0, 1024, 512); sx.strokeStyle = '#e8c45c'; sx.lineWidth = 10; sx.strokeRect(8, 8, 1008, 496);
      sx.fillStyle = '#e8c45c'; sx.font = '900 92px Georgia, serif'; sx.textAlign = 'center'; sx.fillText('THE COLOSSEUM', 512, 220);
      sx.fillStyle = '#dfe7ee'; sx.font = '600 44px system-ui, sans-serif'; sx.fillText(line2, 512, 330); stex.needsUpdate = true;
    }
    // ── lobby (grand hall) south of the shell ──
    var lobby = new THREE.Group(); lobby.position.set(0, 0, LOBBY_Z0 + LOBBY_D / 2); root.add(lobby);
    var lf = new THREE.Mesh(new THREE.PlaneGeometry(LOBBY_W, LOBBY_D), M(0xe9dcc0, { roughness: 0.4, metalness: 0.1 })); lf.rotation.x = -Math.PI / 2; lobby.add(lf);
    var wallGeo = new THREE.BoxGeometry(LOBBY_W, LOBBY_H, 1.5);
    var back = new THREE.Mesh(wallGeo, mats.stone); back.position.set(0, LOBBY_H / 2, LOBBY_D / 2); lobby.add(back);
    [-1, 1].forEach(function (sd) { var sw = new THREE.Mesh(new THREE.BoxGeometry(1.5, LOBBY_H, LOBBY_D), mats.stone); sw.position.set(sd * LOBBY_W / 2, LOBBY_H / 2, 0); lobby.add(sw); });
    var roof = new THREE.Mesh(new THREE.PlaneGeometry(LOBBY_W, LOBBY_D), mats.stoneDark); roof.rotation.x = Math.PI / 2; roof.position.y = LOBBY_H; lobby.add(roof);
    var colGeo = new THREE.CylinderGeometry(1.1, 1.3, LOBBY_H - 2, 20);
    for (var cz = -1; cz <= 1; cz += 2) for (var cx = -3; cx <= 3; cx++) { if (cx === 0) continue; var col = new THREE.Mesh(colGeo, mats.stone); col.position.set(cx * 7.5, (LOBBY_H - 2) / 2, cz * 9); lobby.add(col); }
    var emblem = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 64), mats.trim); emblem.rotation.x = -Math.PI / 2; emblem.position.y = 0.05; lobby.add(emblem);
    var board = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), mats.screen); board.position.set(0, 14, LOBBY_D / 2 - 1); board.rotation.y = Math.PI; lobby.add(board);
    // ── sky + light (open-air bowl) ──
    var skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.4+0.25,0.0,1.0)), 1.0); }' });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat); sky.frustumCulled = false; root.add(sky);
    var hemi = new THREE.HemisphereLight(0xfff1d6, 0x6b5a42, 1.1); root.add(hemi);
    var sun = new THREE.DirectionalLight(0xffe2b0, 2.2); sun.position.set(-120, 200, -80); root.add(sun); root.add(sun.target);   // aim at the arena, not the far-away world origin
    var torches = []; for (var tI = 0; tI < 8; tI++) { var tt = tI / 8 * Math.PI * 2, pl = new THREE.PointLight(0xff9a3c, 0, 90); pl.position.set((A + LOW1) * Math.cos(tt), H_LOW + 4, (B + LOW1) * Math.sin(tt)); root.add(pl); torches.push(pl); }

    // ── themes (admin presets) ──
    var THEMES = {
      classic:  { stone: 0xd8c9a8, dark: 0xa8977a, seat: 0xbfae8c, trim: 0xc9a24a, banner: 0x9e1b1b, top: 0x6fa8dc, bot: 0xf2dcb0, sun: 1.5, hemi: 0.95, torch: 0, neon: 0.35, namp: 0.15, vel: 0.7 },
      royal:    { stone: 0xf1ede6, dark: 0xcfc6b8, seat: 0xe6ddcc, trim: 0xe8c45c, banner: 0x1c2f6b, top: 0x8fb8ea, bot: 0xfff3dc, sun: 2.4, hemi: 1.2, torch: 0, neon: 0.3, namp: 0.1, vel: 0.9 },
      night:    { stone: 0x5e5647, dark: 0x3b352c, seat: 0x544b3d, trim: 0xe8c45c, banner: 0x6b0f0f, top: 0x05070f, bot: 0x2a1c10, sun: 0.25, hemi: 0.35, torch: 3.5, neon: 1.1, namp: 0.4, vel: 0 },
      festival: { stone: 0xd8c9a8, dark: 0xa8977a, seat: 0xbfae8c, trim: 0x00ff9c, banner: 0xff3fa4, top: 0x2b1055, bot: 0xff8a3c, sun: 1.2, hemi: 0.9, torch: 2.5, neon: 2.2, namp: 0.9, vel: 1 },
    };
    var current = { theme: 'classic', field: 'sand' }, themeSet = false;
    function setTheme(name) {
      var T = THEMES[name] || THEMES.classic; current.theme = THEMES[name] ? name : 'classic';
      mats.stone.color.setHex(T.stone); mats.stoneDark.color.setHex(T.dark); mats.seat.color.setHex(T.seat); mats.trim.color.setHex(T.trim); mats.banner.color.setHex(T.banner);
      skyMat.uniforms.top.value.setHex(T.top); skyMat.uniforms.bot.value.setHex(T.bot); sun.intensity = T.sun; hemi.intensity = T.hemi;
      torches.forEach(function (p) { p.intensity = T.torch; });
      mats.recess.color.setHex(T.dark).multiplyScalar(0.3); velU.uC1.value.setHex(T.banner); velU.uC2.value.setHex(T.stone); vel.target = T.vel; if (!themeSet) { vel.open = T.vel; velU.uOpen.value = T.vel; velU.mesh.visible = T.vel > 0.02; themeSet = true; }
      mats.neon.emissive.setHex(T.trim); glowEntries[0].base = T.neon; glowEntries[0].amp = T.namp; mats.neon.emissiveIntensity = T.neon;
      env.fog.color.setHex(T.bot);
      drawScreen((current.field.toUpperCase()) + '  ·  ' + current.theme.toUpperCase());
    }
    // ── field modes (drawn onto the floor canvas; the canvas covers the ellipse's 124 × 88 m box) ──
    function setField(mode) {
      current.field = ['sand', 'soccer', 'tactics', 'team-attack', 'party'].indexOf(mode) >= 0 ? mode : 'sand';
      var W = fc.width, H = fc.height, px = W / (2 * A);            // pixels per metre
      var X = function (m) { return W / 2 + m * px; }, Y = function (m) { return H / 2 + m * px; };
      fx.fillStyle = { sand: '#d9c08a', soccer: '#2f7d32', tactics: '#1b1f24', 'team-attack': '#6b6252', party: '#120a1e' }[current.field]; fx.fillRect(0, 0, W, H);
      if (current.field === 'sand') { for (var i = 0; i < 9000; i++) { fx.fillStyle = 'rgba(120,90,40,' + (Math.random() * 0.12) + ')'; fx.fillRect(Math.random() * W, Math.random() * H, 3, 3); } }
      if (current.field === 'soccer') {
        for (var st = -50; st < 50; st += 10) { fx.fillStyle = (st / 10) % 2 ? '#2a722d' : '#328436'; fx.fillRect(X(st), Y(-32), 10 * px, 64 * px); }
        fx.strokeStyle = '#f4f4f4'; fx.lineWidth = 0.12 * px; fx.strokeRect(X(-50), Y(-32), 100 * px, 64 * px);
        fx.beginPath(); fx.moveTo(X(0), Y(-32)); fx.lineTo(X(0), Y(32)); fx.stroke(); fx.beginPath(); fx.arc(X(0), Y(0), 9.15 * px, 0, Math.PI * 2); fx.stroke();
        [-1, 1].forEach(function (s) { fx.strokeRect(s < 0 ? X(-50) : X(50 - 16.5), Y(-20.16), 16.5 * px, 40.32 * px); fx.strokeRect(s < 0 ? X(-50) : X(50 - 5.5), Y(-9.16), 5.5 * px, 18.32 * px); });
      }
      if (current.field === 'tactics') {
        var tw = 100 / 16, th = 64 / 12; fx.strokeStyle = 'rgba(0,255,156,0.75)'; fx.lineWidth = 0.1 * px;
        for (var gx = 0; gx <= 16; gx++) { fx.beginPath(); fx.moveTo(X(-50 + gx * tw), Y(-32)); fx.lineTo(X(-50 + gx * tw), Y(32)); fx.stroke(); }
        for (var gz = 0; gz <= 12; gz++) { fx.beginPath(); fx.moveTo(X(-50), Y(-32 + gz * th)); fx.lineTo(X(50), Y(-32 + gz * th)); fx.stroke(); }
        fx.strokeStyle = '#e8c45c'; fx.lineWidth = 0.3 * px; fx.strokeRect(X(-50), Y(-32), 100 * px, 64 * px);
      }
      if (current.field === 'team-attack') {
        fx.strokeStyle = '#e8c45c'; fx.lineWidth = 0.25 * px; fx.strokeRect(X(-50), Y(-32), 100 * px, 64 * px);
        [[-38, 0, '#27e0ff'], [0, 0, '#e8c45c'], [38, 0, '#ff5a6e']].forEach(function (z) { fx.fillStyle = z[2] + '55'; fx.beginPath(); fx.arc(X(z[0]), Y(z[1]), 8 * px, 0, Math.PI * 2); fx.fill(); fx.strokeStyle = z[2]; fx.stroke(); });
      }
      if (current.field === 'party') {
        var cols = ['#ff3fa4', '#00ff9c', '#5fe0ff', '#e8c45c', '#9b59f5'];
        for (var dx = -30; dx < 30; dx += 4) for (var dz = -20; dz < 20; dz += 4) { fx.fillStyle = cols[Math.abs((dx + dz) / 4) % cols.length]; fx.globalAlpha = 0.65; fx.fillRect(X(dx) + 2, Y(dz) + 2, 4 * px - 4, 4 * px - 4); }
        fx.globalAlpha = 1;
      }
      ftex.needsUpdate = true; drawScreen(current.field.toUpperCase() + '  ·  ' + current.theme.toUpperCase());
    }

    // ── spectate cams (world coordinates) ──
    var W2 = function (x, y, z) { return [X0 + x * U, y * U, Z0 + z * U]; };
    var cams = [
      { name: 'Broadcast — sideline', pos: W2(0, H_LOW + 6, B + LOW1 - 2), look: W2(0, 0, 0) },
      { name: 'North end', pos: W2(0, H_UP + 6, -(B + UP1 - 6)), look: W2(0, 0, 10) },
      { name: 'Aerial', pos: W2(-20, CROWN_H + 60, 60), look: W2(0, 0, 0) },
      { name: 'Field level', pos: W2(-A + 8, 3, 0), look: W2(20, 2, 0) },
      { name: 'Lobby', pos: W2(0, 8, LOBBY_Z0 + LOBBY_D - 4), look: W2(0, 6, LOBBY_Z0 - 10) },
    ];
    var camIdx = -1;
    function spectate(i) { if (i == null || i < 0) { camIdx = -1; window.__probeCam = null; return null; } camIdx = i % cams.length; window.__probeCam = { pos: cams[camIdx].pos, look: cams[camIdx].look }; return cams[camIdx].name; }
    addEventListener('keydown', function (e) {
      if (!group.visible || /input|textarea/i.test((document.activeElement || {}).tagName || '')) return;
      if (e.code === 'KeyC') { var n = spectate(camIdx + 1); if (window.__toast) window.__toast('📺 ' + n + '  ·  C next · X back'); }
      if (e.code === 'KeyX' && camIdx >= 0) spectate(-1);
    });

    // ── environment swap: the outdoor world's fog + view distance are tuned for the open map; inside this
    //    800-unit bowl they turn everything navy. While the arena is visible use a light warm haze + long view. ──
    var env = { saved: null, fog: new THREE.Fog(0xf2dcb0, 900, 4200) };
    setInterval(function () {
      var cam = window.__w3dDebug && window.__w3dDebug.camera;
      if (group.visible && !env.saved) {
        if (window.__shdVisitDistrict) window.__shdVisitDistrict('colosseum');
        env.saved = { fog: scene.fog, far: cam ? cam.far : null }; scene.fog = env.fog;
        if (cam && cam.far < 5000) { cam.far = 5000; cam.updateProjectionMatrix(); }
      } else if (!group.visible && env.saved) {
        scene.fog = env.saved.fog; if (cam && env.saved.far) { cam.far = env.saved.far; cam.updateProjectionMatrix(); }
        env.saved = null; if (camIdx >= 0) spectate(-1);
      }
    }, 250);
    var params = new URLSearchParams(location.search);
    setField(params.get('field') || 'sand'); setTheme(params.get('colo') || 'classic');
    scene.add(group);

    // ── ambient life for world-interiors' active-room loop: a time source (plain object whose rotation.y setter IS the clock — zero allocation),
    //    pulsing neon, and sand-dust motes (Points kept in group units; interiors wraps them at ROOM_H) ──
    var TIME = { value: 0 }, _clk = 0, clockObj = { rotation: {} };
    Object.defineProperty(clockObj.rotation, 'y', { get: function () { return _clk; }, set: function (v) { var dt = v - _clk; _clk = v; TIME.value = v; for (var hi = 0; hi < frameHooks.length; hi++) frameHooks[hi](dt); } });
    var animObjs = [{ mesh: clockObj, axis: 'y', speed: 1 }];
    var motes = (function () {
      var n = 36, hs = 30 * U, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * hs * 2; pos[i * 3 + 1] = Math.random() * 20 + 1; pos[i * 3 + 2] = (Math.random() - 0.5) * hs * 2; vel[i * 3] = (Math.random() - 0.5) * 0.02; vel[i * 3 + 1] = Math.random() * 0.012 + 0.003; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.02; }
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe0a0, size: 0.6, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false; group.add(pts);
      return { pts: pts, vel: vel, count: n, hs: hs, falling: false };
    })();

    var api = {
      group: group, code: 'COLOSSEUM', animObjs: animObjs, motes: motes, glowEntries: glowEntries, time: TIME,
      // interiors spawn = origin.z + SPAWN_Z_OFFSET(28) → put the player in the lobby, facing the grand tunnel
      origin: { x: X0, z: Z0 + (LOBBY_Z0 + LOBBY_D * 0.65) * U - 28 },
      contains: function (x, z) { var lx = (x - X0) / U, lz = (z - Z0) / U; return lx > -HALF_X && lx < HALF_X && lz > -HALF_Z_N && lz < HALF_Z_S; },
      heightAt: function (x, z) { var h = hLocal((x - X0) / U, (z - Z0) / U); return h >= 999 ? 999 : h * U; },
      resolve: function (pos, px, pz) {   // step-up limit 1 m: walls, podium and tunnel sides are solid, tiers/ramps walkable
        var h0 = api.heightAt(px, pz), h1 = api.heightAt(pos.x, pos.z);
        if (h1 >= 999 || h1 - h0 > 1.0 * U) { pos.x = px; pos.z = pz; return true; }
        return false;
      },
      // standalone tick for pages that don't run world-interiors (colosseum-viewer.html): same work the interiors loop does
      tick: function (dt) { var i; _clk += dt; TIME.value = _clk; for (i = 0; i < frameHooks.length; i++) frameHooks[i](dt); for (i = 0; i < glowEntries.length; i++) { var g = glowEntries[i]; g.mat.emissiveIntensity = g.base + g.amp * (0.5 + 0.5 * Math.sin(_clk * 1.15 + g.phase)); }
        var pa = motes.pts.geometry.attributes.position.array, hs = motes.hs; for (i = 0; i < motes.count; i++) { pa[i * 3] += motes.vel[i * 3]; pa[i * 3 + 1] += motes.vel[i * 3 + 1]; pa[i * 3 + 2] += motes.vel[i * 3 + 2]; if (pa[i * 3 + 1] > 21) pa[i * 3 + 1] = 1; if (pa[i * 3] > hs) pa[i * 3] -= hs * 2; if (pa[i * 3] < -hs) pa[i * 3] += hs * 2; if (pa[i * 3 + 2] > hs) pa[i * 3 + 2] -= hs * 2; if (pa[i * 3 + 2] < -hs) pa[i * 3 + 2] += hs * 2; }
        motes.pts.geometry.attributes.position.needsUpdate = true; },
      setTheme: setTheme, setField: setField, spectate: spectate, cams: cams, vipSeats: vipSeats, agentSlots: agentSlots, setVelarium: function (o) { vel.target = Math.max(0, Math.min(1, o)); }, velarium: vel,
      dims: Object.assign({}, D, { LOW1: LOW1, PROM1: PROM1, UP1: UP1, SHELL: SHELL, H_LOW: H_LOW, H_UP: H_UP, RAMP: RAMP, LOBBY_Z0: LOBBY_Z0 }), hLocal: hLocal,
      state: current, themes: Object.keys(THEMES),
    };
    window.__colosseumArena = api;
    return api;
  };
})();
