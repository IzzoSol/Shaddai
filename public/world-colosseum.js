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
  var U = 7 / 1.8, X0 = 12000, Z0 = 0;
  // ── dimensions (metres) ──
  var A = 62, B = 44;                      // arena floor ellipse semi-axes (124 × 88 m): 100 × 64 field + runoff
  var POD_T = 2, POD_H = 4;                // podium wall thickness / height
  var ROWS = 18, TREAD = 0.8, RISE_L = 0.45, RISE_U = 0.55;
  var LOW0 = POD_T, LOW1 = LOW0 + ROWS * TREAD;            // lower tier (horizontal offset from floor edge)
  var PROM1 = LOW1 + 6;                                     // promenade ring
  var UP1 = PROM1 + ROWS * TREAD;                           // upper tier
  var SHELL = UP1 + 2, CROWN_H = 46;                        // outer wall
  var H_LOW = POD_H + ROWS * RISE_L, H_UP = H_LOW + ROWS * RISE_U;
  var LOBBY_W = 60, LOBBY_D = 32, LOBBY_H = 26, LOBBY_Z0 = B + SHELL;   // lobby sits against the south shell
  var TUNNEL_HALF = 4;                                      // 8 m wide players' tunnels on the 4 axes
  var STAIR_HALF = 3;                                       // 6 m stair gaps in the podium at the diagonals

  // distance d (metres) from the floor-ellipse edge along its offset family: (x/(A+d))² + (z/(B+d))² = 1
  function offsetOf(x, z) {
    if ((x * x) / (A * A) + (z * z) / (B * B) <= 1) return -1;
    var lo = 0, hi = 400;
    for (var i = 0; i < 28; i++) { var m = (lo + hi) / 2, q = (x * x) / ((A + m) * (A + m)) + (z * z) / ((B + m) * (B + m)); if (q > 1) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function inTunnel(x, z) { return Math.abs(x) < TUNNEL_HALF || Math.abs(z) < TUNNEL_HALF; }
  function inStairGap(x, z, d) {       // diagonal gaps: distance from the 45° lines, measured tangentially-ish
    var r = Math.hypot(x, z) || 1, ang = Math.atan2(z, x);
    for (var k = 0; k < 4; k++) { var da = Math.abs(((ang - (Math.PI / 4 + k * Math.PI / 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da * r < STAIR_HALF) return true; }
    return false;
  }
  function inLobby(x, z) { return Math.abs(x) <= LOBBY_W / 2 && z >= LOBBY_Z0 - 1 && z <= LOBBY_Z0 + LOBBY_D; }
  // height in METRES at local (x, z); 999 = solid wall
  function hLocal(x, z) {
    if (inLobby(x, z)) return 0;
    var d = offsetOf(x, z);
    if (d < 0) return 0;                                            // arena floor
    if (Math.abs(x) < TUNNEL_HALF && z > 0 && d < SHELL + 2) return 0;   // south grand tunnel → lobby
    if (inTunnel(x, z) && d < LOW1) return 0;                      // other 3 players' tunnels (end at the promenade wall)
    var tier = function (dd) { return POD_H + ((dd - LOW0) / (LOW1 - LOW0)) * (H_LOW - POD_H); };
    var RAMP = LOW0 + 6;                                            // stair gaps: one continuous ramp from the floor up into the lower tier
    if (d < RAMP && inStairGap(x, z, d)) return tier(RAMP) * (d / RAMP);
    if (d < LOW0) return POD_H;                                     // podium wall
    if (d < LOW1) return tier(d);                                   // lower tier (smooth ramp under the steps)
    if (d < PROM1) return H_LOW;                                    // promenade
    if (d < UP1) return H_LOW + ((d - PROM1) / (UP1 - PROM1)) * (H_UP - H_LOW);
    return 999;                                                     // outer shell
  }

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
    var mats = { stone: M(0xd8c9a8), stoneDark: M(0xa8977a), trim: M(0xc9a24a, { metalness: 0.6, roughness: 0.35 }), banner: M(0x9e1b1b, { side: THREE.DoubleSide }), seat: M(0xbfae8c), floor: M(0xffffff, { roughness: 0.95 }), screen: new THREE.MeshBasicMaterial({ color: 0xffffff }) };

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
          if (!opts2.solid && (inTunnel(mx, mz) || (opts2.gaps && inStairGap(mx, mz, da)))) continue;
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
    ringBand(LOW0, LOW1, POD_H, H_LOW, ROWS, mats.seat);                     // lower tier
    ringBand(LOW1, PROM1, H_LOW, H_LOW, 1, mats.stone);                      // promenade
    ringBand(PROM1, UP1, H_LOW, H_UP, ROWS, mats.seat);                      // upper tier
    // gold trim line on the podium top + promenade parapet
    function ellipseLine(d, y, mat, h) { var g = new THREE.CylinderGeometry(1, 1, h, 192, 1, true); var m = new THREE.Mesh(g, mat); m.scale.set(A + d, 1, B + d); m.position.y = y + h / 2; m.material.side = THREE.DoubleSide; root.add(m); return m; }
    ellipseLine(0, POD_H - 0.3, mats.trim, 0.3);
    ellipseLine(PROM1 - 0.2, H_LOW, mats.stoneDark, 1.1);
    // ── outer shell: 4 arcaded storeys (instanced pillars) + cornices to 46 m ──
    ellipseLine(SHELL, 0, mats.stone, CROWN_H);
    var storeys = 4, per = 80, sh = CROWN_H / storeys;
    var pillarGeo = new THREE.BoxGeometry(2.2, sh - 1.2, 2.2), pillars = new THREE.InstancedMesh(pillarGeo, mats.stone, storeys * per), mm = new THREE.Matrix4(), k = 0;
    for (var s2 = 0; s2 < storeys; s2++) for (var i2 = 0; i2 < per; i2++) {
      var t = i2 / per * Math.PI * 2; mm.makeTranslation((A + SHELL - 1.2) * Math.cos(t), s2 * sh + sh / 2, (B + SHELL - 1.2) * Math.sin(t)); pillars.setMatrixAt(k++, mm);
    }
    root.add(pillars);
    for (var c2 = 1; c2 <= storeys; c2++) ellipseLine(SHELL - 2.4, c2 * sh - 1.2, mats.trim, 1.0);
    // ── banners (hang from the crown, facing in) ──
    var bannerGeo = new THREE.PlaneGeometry(6, 16);
    for (var b2 = 0; b2 < 24; b2++) { var tb = b2 / 24 * Math.PI * 2, bn = new THREE.Mesh(bannerGeo, mats.banner); bn.position.set((A + SHELL - 3) * Math.cos(tb), CROWN_H - 10, (B + SHELL - 3) * Math.sin(tb)); bn.lookAt(0, CROWN_H - 10, 0); root.add(bn); }
    // ── two big screens (the one modern element) over the north + south ends ──
    var sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512; var sx = sc.getContext('2d');
    var stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace; mats.screen.map = stex;
    [[0, -1], [0, 1]].forEach(function (d) { var s3 = new THREE.Mesh(new THREE.PlaneGeometry(32, 16), mats.screen); s3.position.set(0, H_UP + 12, d[1] * (B + UP1 - 4)); s3.lookAt(0, H_UP + 12, 0); root.add(s3); });
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
      classic:  { stone: 0xd8c9a8, dark: 0xa8977a, seat: 0xbfae8c, trim: 0xc9a24a, banner: 0x9e1b1b, top: 0x6fa8dc, bot: 0xf2dcb0, sun: 1.5, hemi: 0.95, torch: 0 },
      royal:    { stone: 0xf1ede6, dark: 0xcfc6b8, seat: 0xe6ddcc, trim: 0xe8c45c, banner: 0x1c2f6b, top: 0x8fb8ea, bot: 0xfff3dc, sun: 2.4, hemi: 1.2, torch: 0 },
      night:    { stone: 0x5e5647, dark: 0x3b352c, seat: 0x544b3d, trim: 0xe8c45c, banner: 0x6b0f0f, top: 0x05070f, bot: 0x2a1c10, sun: 0.25, hemi: 0.35, torch: 3.5 },
      festival: { stone: 0xd8c9a8, dark: 0xa8977a, seat: 0xbfae8c, trim: 0x00ff9c, banner: 0xff3fa4, top: 0x2b1055, bot: 0xff8a3c, sun: 1.2, hemi: 0.9, torch: 2.5 },
    };
    var current = { theme: 'classic', field: 'sand' };
    function setTheme(name) {
      var T = THEMES[name] || THEMES.classic; current.theme = THEMES[name] ? name : 'classic';
      mats.stone.color.setHex(T.stone); mats.stoneDark.color.setHex(T.dark); mats.seat.color.setHex(T.seat); mats.trim.color.setHex(T.trim); mats.banner.color.setHex(T.banner);
      skyMat.uniforms.top.value.setHex(T.top); skyMat.uniforms.bot.value.setHex(T.bot); sun.intensity = T.sun; hemi.intensity = T.hemi;
      torches.forEach(function (p) { p.intensity = T.torch; });
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

    var api = {
      group: group, code: 'COLOSSEUM', animObjs: [], motes: null, glowEntries: [],
      // interiors spawn = origin.z + SPAWN_Z_OFFSET(28) → put the player in the lobby, facing the grand tunnel
      origin: { x: X0, z: Z0 + (LOBBY_Z0 + LOBBY_D * 0.65) * U - 28 },
      contains: function (x, z) { return Math.abs(x - X0) < 1200 && Math.abs(z - Z0) < 1200; },
      heightAt: function (x, z) { var h = hLocal((x - X0) / U, (z - Z0) / U); return h >= 999 ? 999 : h * U; },
      resolve: function (pos, px, pz) {   // step-up limit 1 m: walls, podium and tunnel sides are solid, tiers/ramps walkable
        var h0 = api.heightAt(px, pz), h1 = api.heightAt(pos.x, pos.z);
        if (h1 >= 999 || h1 - h0 > 1.0 * U) { pos.x = px; pos.z = pz; return true; }
        return false;
      },
      setTheme: setTheme, setField: setField, spectate: spectate, cams: cams, dims: { A: A, B: B, SHELL: SHELL, H_LOW: H_LOW, H_UP: H_UP, CROWN_H: CROWN_H, U: U },
      state: current, themes: Object.keys(THEMES),
    };
    window.__colosseumArena = api;
    return api;
  };
})();
