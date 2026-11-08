/* world-colosseum.js — the Colosseum interior at REAL size (docs/COLOSSEUM-AND-DRAGONS-SPEC.md, 2026-09-25).
 *
 *   var arena = window.buildColosseumArena(THREE, { scene })  → room record for world-interiors.js
 *   arena.heightAt(x, z) · arena.contains(x, z) · arena.resolve(pos, prevX, prevZ)
 *   arena.setTheme('classic'|'royal'|'night'|'festival') · arena.setField('sand'|'soccer'|'tactics'|'team-attack'|'party'|'water'|'lava'|'void'|'grass'|'ice')  (last five: world-colosseum-floors.js)
 *   arena.spectate(i) (] cycles broadcast cams while inside, X returns to the player)
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
  // 24 promenade kiosks (module scope so hLocal can make them solid — still the ONE collision source)
  var KIOSK_D = LOW1 + 3.6, KIOSKS = (function () {
    var out = [], a = A + KIOSK_D, b = B + KIOSK_D;
    for (var i = 0; i < 24; i++) { var t = (i + 0.5) / 24 * Math.PI * 2; if (Math.abs(t - Math.PI / 2) < 0.75) continue; /* owner 2026-10-11: shops sat in front of the door - the lobby arc stays clear */ var x = a * Math.cos(t), z = b * Math.sin(t), nx = x / (a * a), nz = z / (b * b), nl = Math.hypot(nx, nz); nx /= nl; nz /= nl; out.push({ id: i, x: x, z: z, nx: nx, nz: nz, yaw: Math.atan2(-nx, -nz) }); }
    return out;
  })();
  window.COLOSSEUM_KIOSKS = KIOSKS;
  function inKiosk(x, z) { for (var i = 0; i < KIOSKS.length; i++) { var dx = x - KIOSKS[i].x, dz = z - KIOSKS[i].z; if (dx * dx + dz * dz < 1.44) return true; } return false; }
  function inLobby(x, z) { return Math.abs(x) <= LOBBY_W / 2 && z >= LOBBY_Z0 - 1 && z <= LOBBY_Z0 + LOBBY_D; }
  function tierH(dd) { return POD_H + ((dd - LOW0) / (LOW1 - LOW0)) * (H_LOW - POD_H); }
  function rampH(d) { return tierH(RAMP) * (d / RAMP); }
  // METRO (world-colosseum-metro.js): underground station hall EAST of the lobby, own walkable platform strip; the track trench is solid (999)
  var METRO = { x0: 150, x1: 250, z0: LOBBY_Z0 + 2, z1: LOBBY_Z0 + 26, platform: 9, lobbyPad: [24, LOBBY_Z0 + 14], metroPad: [156, LOBBY_Z0 + 8] };
  window.COLOSSEUM_METRO = METRO; window.COLOSSEUM_ISLAND = { x: X0, z: Z0, U: U, lobbyZ0: LOBBY_Z0, lobbyD: LOBBY_D, A: A, B: B };   // read by world-colosseum-metro.js at load (station registers before the arena is ever built)
  function inMetro(x, z) { return x >= METRO.x0 && x <= METRO.x1 && z >= METRO.z0 && z <= METRO.z1; }
  // height in METRES at local (x, z); 999 = solid wall.  hLocal is the SOLE collision + seating source.
  function hLocal(x, z) {
    if (inMetro(x, z)) return z <= METRO.z0 + METRO.platform ? 0 : 999;
    if (inLobby(x, z)) return 0;
    var d = offsetOf(x, z);
    if (d < 0) return 0;                                            // arena floor
    if (Math.abs(x) < TUNNEL_HALF && z > 0 && d < SHELL + 2) return 0;   // south grand tunnel -> lobby
    if (inTunnel(x, z) && d < LOW1) return 0;                      // other 3 players' tunnels (end at the promenade wall)
    if (d < RAMP && inStairGap(x, z)) return rampH(d);             // vomitoria: one continuous ramp from the floor up into the lower tier
    if (d < LOW0) return POD_H;                                     // podium wall
    if (d < LOW1) return tierH(d);                                  // lower tier (smooth ramp under the steps)
    if (d < PROM1) return inKiosk(x, z) ? 999 : H_LOW;             // promenade (kiosk footprints are solid)
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
    var CX = _lm.pos[0], CZ = _lm.pos[1], FACE = Math.atan2(-CZ, -CX) + (/[?&]colface=city/.test(location.search) ? 0 : Math.PI);   // 2026-10-15 owner: not enough room city-side -> the lobby/entrance faces OUTWARD (away from the city); ?colface=city = old
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
      var mats = { stone: M(0xd8c9a8), dark: M(0x6f624d), recess: M(0x2a241c, { emissive: 0xff7a1c, emissiveIntensity: 0.55 }), trim: M(0xc9a24a, { metalness: 0.6, roughness: 0.35 }), seat: M(0xbfae8c), sand: M(0xd9c08a, { roughness: 1 }), banner: M(0x9e1b1b, { side: THREE.DoubleSide }),
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
      var vh = new THREE.Shape(), vw = LOBBY_W / 2, wallH = LOBBY_H - 12;   // 2026-10-11 owner: "the big square is odd": walls + a 12 m vault, not a box
      vh.moveTo(-vw, 0); vh.lineTo(vw, 0); vh.lineTo(vw, wallH); for (var vi = 1; vi < 24; vi++) { var va = Math.PI * vi / 24; vh.lineTo(vw * Math.cos(va), wallH + 12 * Math.sin(va)); } vh.lineTo(-vw, wallH); vh.closePath();
      var hall = new THREE.Mesh(new THREE.ExtrudeGeometry(vh, { depth: LOBBY_D, bevelEnabled: false, curveSegments: 24 }), mats.stone); hall.position.z = -LOBBY_D / 2; hall.castShadow = true; lob.add(hall);
      for (var st = 0; st < 10; st++) { var step = new THREE.Mesh(new THREE.BoxGeometry(LOBBY_W + 14 - st * 1.2, 0.35, 1.6 + (10 - st) * 0.9), mats.dark); step.position.set(0, 0.175 + st * 0.35, LOBBY_D / 2 + 3 - st * 0.1 + (10 - st) * 0.45); lob.add(step); }
      var colG = new THREE.CylinderGeometry(1.2, 1.4, LOBBY_H - 4, 20);
      for (var cx2 = -3.5; cx2 <= 3.5; cx2++) { var col = new THREE.Mesh(colG, mats.stone); col.position.set(cx2 * 7.8, 2 + (LOBBY_H - 4) / 2, LOBBY_D / 2 + 3); col.castShadow = true; lob.add(col); }
      var ent = new THREE.Mesh(new THREE.BoxGeometry(LOBBY_W + 4, 2.4, 8), mats.trim); ent.position.set(0, LOBBY_H - 0.8, LOBBY_D / 2 + 2); lob.add(ent);
      var tri = new THREE.Shape(); tri.moveTo(-(LOBBY_W + 4) / 2, 0); tri.lineTo((LOBBY_W + 4) / 2, 0); tri.lineTo(0, 8); tri.closePath();
      var ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 8, bevelEnabled: false }), mats.stone); ped.position.set(0, LOBBY_H + 0.4, LOBBY_D / 2 - 2); ped.castShadow = true; lob.add(ped);   // pediment
      var doorM = M(0x6b4a22, { metalness: 0.7, roughness: 0.4 }), doorG = new THREE.BoxGeometry(7, 11, 0.6);
      [-12, 0, 12].forEach(function (dx) { var d1 = new THREE.Mesh(doorG, doorM); d1.position.set(dx, 5.5 + 3.5, LOBBY_D / 2 + 0.35); lob.add(d1);
        var tr = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.5), mats.star); tr.position.set(dx, 11 + 3.5 + 1.4, LOBBY_D / 2 + 0.4); lob.add(tr); });
      var star = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), mats.star); star.scale.set(1, 1.5, 0.35); star.position.set(0, LOBBY_H + 5, LOBBY_D / 2 + 6.5); lob.add(star);
      var FORE = typeof location !== 'undefined' && /[?&]forecourt=1/.test(location.search || '');   // owner: stuff in front of the door is in the way - off by default
      // FORECOURT (2026-10-11): paved plaza in front of the stair, lamp posts, statue plinths, a fountain
      var plz = new THREE.Mesh(new THREE.BoxGeometry(140, 0.3, 70), M(0x9d9484, { roughness: 0.9 })); plz.position.set(0, 0.1, LOBBY_D / 2 + 3 + 40); if (FORE) lob.add(plz);
      var lampG = new THREE.CylinderGeometry(0.5, 0.6, 9, 8), lampIM = new THREE.InstancedMesh(lampG, mats.trim, 16), lm = new THREE.Matrix4();
      for (var li = 0; li < 16; li++) { var lxx = (li < 8 ? -1 : 1) * (46 + (li % 8) * 6); lm.setPosition(lxx, 4.5, LOBBY_D / 2 + 3 + 22); lampIM.setMatrixAt(li, lm); } if (FORE) lob.add(lampIM);
      [-1, 1].forEach(function (sd) { var pl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 3.5, 12), mats.dark); pl.position.set(sd * 34, 1.75, LOBBY_D / 2 + 3 + 14); if (FORE) lob.add(pl);
        var sdn = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 6, 4, 10), mats.stone); sdn.position.set(sd * 34, 3.5 + 4, LOBBY_D / 2 + 3 + 14); if (FORE) lob.add(sdn); });
      var fn = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 1.2, 28), mats.star); fn.position.set(0, 0.7, LOBBY_D / 2 + 3 + 40); if (FORE) lob.add(fn);
      // HOLOGRAPHIC STATUE CROWN on the cornice: 56 additive figures (one instanced draw)
      var holoM = new THREE.MeshBasicMaterial({ color: 0x4ad8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      var crown = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.9, 8, 4, 8), holoM, 56), cm4 = new THREE.Matrix4(), cp = new THREE.Vector3(), cq = new THREE.Quaternion(), cs = new THREE.Vector3(1, 1, 1);
      for (var ci2 = 0; ci2 < 56; ci2++) { var ca = ci2 / 56 * Math.PI * 2; cp.set((A + SHELL + 0.2) * Math.cos(ca), CROWN_H + 5, (B + SHELL + 0.2) * Math.sin(ca)); cm4.compose(cp, cq, cs); crown.setMatrixAt(ci2, cm4); }
      crown.name = 'colosseum-holo-crown'; crown.frustumCulled = false; root.add(crown);
      mats.star.emissiveIntensity = 3.2;   // PERF 2026-10-04: was a PointLight (every extra light costs every lit material world-wide); the emissive star carries the glow
      var sign = (function () { var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; var x = cv.getContext('2d'); x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, 1024, 128); x.fillStyle = '#5a4520'; x.font = '700 72px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SOUTHERN COLOSSEUM', 512, 68); var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(44, 5.5), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 })); })();
      sign.position.set(0, LOBBY_H - 0.8, LOBBY_D / 2 + 6.05); lob.add(sign);
      // BLENDER K13 GRAND LOBBY (shaddai_colosseum_lobby_v01.glb: 60x32x26, 3 crimson portals, gold-ribbed vault; origin = back-wall centre on the
      // ground at LOBBY_Z0, front = +z). The code lobby stays out of the merge until the kit lands, then hides (the podium steps stay). ?lobbykit=0 = code.
      var LCK = window.__GLTFLoaderClass && !(typeof location !== 'undefined' && /[?&]lobbykit=0/.test(location.search || ''));
      lob.children.forEach(function (o) { if (o.geometry && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.height === 0.35) o.userData.keepWithKit = true; });   // podium steps
      if (window.WorldMerge) try { group.userData.bake = window.WorldMerge.bake(group, THREE, { skip: new Set(LCK ? [star, lob] : [star]), name: 'colosseum-exterior' }); } catch (e) { }
      if (LCK) new window.__GLTFLoaderClass().load('/assets/kits/shaddai_colosseum_lobby_v01.glb', function (gl) {
        var k = gl.scene.getObjectByName('shaddai_colosseum_lobby'); if (!k) return;
        k = k.clone(true); k.position.set(0, 0, LOBBY_Z0); k.name = 'colosseum-lobby-k13';
        lob.children.forEach(function (o) { if (o !== star && !o.userData.keepWithKit) o.visible = false; });
        k.traverse(function (o) { if (o.isMesh) o.castShadow = true; }); root.add(k); group.userData.lobbyKit = k;
      }, undefined, function () { console.warn('[colosseum] K13 lobby missing, code lobby kept'); });   // PERF: static exterior (~49 draws); the star keeps spinning
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

    // ── QUALITY TIERS. window.__quality = 'POTATO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA' (string, or {tier}) is read at build and polled while the arena is open;
    //    when unset the GPU string decides (Intel HD/UHD/Iris -> LOW). crowd = fraction of seats filled, near = crowd model detail (0 quads only, 1 lower tier solid, 2 both),
    //    lights = real point lights, floor = pitch texture width, glb = load the GLB kit, agents = load the 7 agent bodies. ──
    var TIERS = ['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
    var QPARAM = {
      POTATO: { crowd: 0,    near: 0, lights: 0, floor: 1024, glb: 0, agents: 0, kiosks: 0 },
      LOW:    { crowd: 0.30, near: 0, lights: 0, floor: 1536, glb: 0, agents: 0, kiosks: 0 },
      MEDIUM: { crowd: 0.55, near: 0, lights: 2, floor: 2048, glb: 1, agents: 3, kiosks: 8 },
      HIGH:   { crowd: 0.75, near: 1, lights: 4, floor: 2048, glb: 1, agents: 7, kiosks: 24 },
      ULTRA:  { crowd: 0.90, near: 2, lights: 6, floor: 3072, glb: 1, agents: 7, kiosks: 24 },
    };
    function readQuality() { var q = window.__quality; if (q && typeof q === 'object') q = q.tier || q.name || q.level; if (typeof q === 'string') { q = q.toUpperCase(); if (QPARAM[q]) return q; } return null; }
    function detectTier() {
      var forced = readQuality(); if (forced) return forced;
      var gpu = '';
      try {
        var dbg = window.__w3dDebug && window.__w3dDebug.renderer, gl = dbg && dbg.getContext ? dbg.getContext() : null;
        if (!gl) { var cv = document.createElement('canvas'); gl = cv.getContext && cv.getContext('webgl'); }
        var ext = gl && gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      } catch (e) {}
      var mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8, tier = 'MEDIUM';
      if (/SwiftShader|llvmpipe|Software|Mali-4|Adreno \(TM\) [1-4]\d\d/i.test(gpu)) tier = 'POTATO';
      else if (/Intel/i.test(gpu) && /HD|UHD|Iris|Graphics/i.test(gpu)) tier = /Iris Xe|Arc/i.test(gpu) ? 'MEDIUM' : 'LOW';
      else if (/RTX|GTX 1[0-9]|RX [5-9]|Radeon Pro|Apple M/i.test(gpu)) tier = /RTX (3|4|5)|RX [7-9]|Apple M[2-9]/i.test(gpu) ? 'ULTRA' : 'HIGH';
      if (mem <= 4 && TIERS.indexOf(tier) > 1) tier = 'LOW';
      return tier;
    }
    var Q = QPARAM[detectTier()], qName = Q === QPARAM.POTATO ? 'POTATO' : Q === QPARAM.LOW ? 'LOW' : Q === QPARAM.MEDIUM ? 'MEDIUM' : Q === QPARAM.HIGH ? 'HIGH' : 'ULTRA';
    var qualityHooks = [];

    // ── floor (canvas texture = field mode) ──
    var fc = document.createElement('canvas'); fc.width = Q.floor; fc.height = Math.round(Q.floor * B / A); var fx = fc.getContext('2d');
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
    frameHooks.push(function (dt) { for (var pr = 0; pr < portalRings.length; pr++) portalRings[pr].rotation.z += portalRings[pr].userData.spin * dt; });
    frameHooks.push(function (dt) { var k = Math.min(1, dt * 1.4); if (Math.abs(vel.target - vel.open) > 0.002) { vel.open += (vel.target - vel.open) * k; velU.uOpen.value = vel.open; velU.mesh.visible = vel.open > 0.02; } });
    function drawScreen(line2) {
      sx.fillStyle = '#05070a'; sx.fillRect(0, 0, 1024, 512); sx.strokeStyle = '#e8c45c'; sx.lineWidth = 10; sx.strokeRect(8, 8, 1008, 496);
      sx.fillStyle = '#e8c45c'; sx.font = '900 92px Georgia, serif'; sx.textAlign = 'center'; sx.fillText('THE COLOSSEUM', 512, 220);
      sx.fillStyle = '#dfe7ee'; sx.font = '600 44px system-ui, sans-serif'; sx.fillText(line2, 512, 330); stex.needsUpdate = true;
    }
    var portalRings = [];   // lobby portal rings spin slowly (frame hook below)
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
    // ── GRAND HALL upgrade (owner ref, 2026-09-29): ribbed vault + skylight shafts, swirled marble walls, gold-ringed portal to the arena, navy/gold floor, cyan LED ribs ──
    (function () {
      roof.visible = false;
      var navyM = M(0x22346a, { roughness: 0.35, metalness: 0.5, emissive: 0x12204a, emissiveIntensity: 0.9 }), goldM = M(0xD4AF37, { roughness: 0.3, metalness: 0.9, emissive: 0xD4AF37, emissiveIntensity: 0.25 }), cyanM = new THREE.MeshBasicMaterial({ color: 0x00D4FF });
      lf.material = M(0x111d3d, { roughness: 0.22, metalness: 0.55 });
      var inl = [[0, 0, 1.2, LOBBY_D - 4], [-9, 0, 0.5, LOBBY_D - 4], [9, 0, 0.5, LOBBY_D - 4]]; inl.forEach(function (q) { var m = new THREE.Mesh(new THREE.PlaneGeometry(q[2], q[3]), goldM); m.rotation.x = -Math.PI / 2; m.position.set(q[0], 0.04, q[1]); lobby.add(m); });
      var vr = LOBBY_W / 2, springY = 15, vaultH = LOBBY_H - springY;
      var arch = new THREE.Shape(); arch.absellipse(0, 0, vr, vaultH, 0, Math.PI, false); arch.lineTo(-vr, 0);
      var vg = new THREE.ExtrudeGeometry(arch, { depth: LOBBY_D, bevelEnabled: false, curveSegments: 40 }); vg.translate(0, 0, -LOBBY_D / 2);
      var vault = new THREE.Mesh(vg, M(0x24346a, { roughness: 0.6, metalness: 0.3, emissive: 0x12204a, emissiveIntensity: 0.9 })); vault.material.side = THREE.BackSide; vault.position.set(0, springY, 0); lobby.add(vault);
      for (var rb = -3; rb <= 3; rb++) { var rib = new THREE.Mesh(new THREE.TorusGeometry(vr - 0.15, 0.35, 8, 40, Math.PI), goldM); rib.scale.set(1, vaultH / vr, 1); rib.position.set(0, springY, rb * 4.4); lobby.add(rib); }
      var apex = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, LOBBY_D - 1), cyanM); apex.position.set(0, LOBBY_H - 0.1, 0); lobby.add(apex);
      var sk = new THREE.Mesh(new THREE.PlaneGeometry(6, LOBBY_D - 3), new THREE.MeshBasicMaterial({ color: 0xffe9b8 })); sk.rotation.x = Math.PI / 2; sk.position.set(0, LOBBY_H - 0.25, 0); lobby.add(sk);
      for (var sh = -1; sh <= 1; sh++) { var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.0, LOBBY_H - 2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffdfa0, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); shaft.position.set(sh * 8, (LOBBY_H - 2) / 2 + 1, sh * 4); shaft.rotation.z = sh * 0.06; lobby.add(shaft); }
      var mc = document.createElement('canvas'); mc.width = 512; mc.height = 512; var mx = mc.getContext('2d'); var gr = mx.createLinearGradient(0, 0, 512, 512); gr.addColorStop(0, '#e8cf8a'); gr.addColorStop(0.5, '#f4e6bd'); gr.addColorStop(1, '#c9a24a'); mx.fillStyle = gr; mx.fillRect(0, 0, 512, 512);
      for (var sw = 0; sw < 26; sw++) { mx.strokeStyle = sw % 3 ? 'rgba(212,175,55,0.5)' : 'rgba(15,26,54,0.42)'; mx.lineWidth = 2 + (sw % 5); mx.beginPath(); var y0 = (sw * 37) % 512; mx.moveTo(-10, y0); mx.bezierCurveTo(120, y0 - 120 + sw * 6, 260, y0 + 140 - sw * 4, 522, y0 + ((sw * 53) % 120) - 60); mx.stroke(); }
      var mtex = new THREE.CanvasTexture(mc); mtex.colorSpace = THREE.SRGBColorSpace; mtex.wrapS = mtex.wrapT = THREE.RepeatWrapping; mtex.repeat.set(2, 1.6);
      [-1, 1].forEach(function (sd) {
        var panel = new THREE.Mesh(new THREE.PlaneGeometry(LOBBY_D - 2, LOBBY_H - 2), new THREE.MeshStandardMaterial({ map: mtex, roughness: 0.35, metalness: 0.25, emissive: 0x3a2a08, emissiveIntensity: 0.25 })); panel.rotation.y = -sd * Math.PI / 2; panel.position.set(sd * (LOBBY_W / 2 - 0.85), (LOBBY_H - 2) / 2 + 1, 0); lobby.add(panel);
        for (var bz = -3; bz <= 3; bz++) { var buttress = new THREE.Mesh(new THREE.BoxGeometry(1.4, LOBBY_H - 1, 1.2), navyM); buttress.position.set(sd * (LOBBY_W / 2 - 1.5), (LOBBY_H - 1) / 2, bz * 4.4); lobby.add(buttress); var led = new THREE.Mesh(new THREE.BoxGeometry(0.12, LOBBY_H - 3, 0.12), cyanM); led.position.set(sd * (LOBBY_W / 2 - 2.25), (LOBBY_H - 1) / 2, bz * 4.4); lobby.add(led); }
        var ban = document.createElement('canvas'); ban.width = 128; ban.height = 384; var bx = ban.getContext('2d'); bx.fillStyle = '#0d2b5c'; bx.fillRect(0, 0, 128, 384); bx.strokeStyle = '#D4AF37'; bx.lineWidth = 6; bx.strokeRect(6, 6, 116, 372); bx.fillStyle = '#D4AF37'; bx.font = '700 40px Georgia,serif'; bx.textAlign = 'center'; bx.save(); bx.translate(64, 200); bx.rotate(-Math.PI / 2); bx.fillText('S H A D D A I', 0, 12); bx.restore(); var btx = new THREE.CanvasTexture(ban); btx.colorSpace = THREE.SRGBColorSpace;
        [-8.8, 8.8].forEach(function (zz) { var bn = new THREE.Mesh(new THREE.PlaneGeometry(3, 9), new THREE.MeshBasicMaterial({ map: btx, side: THREE.DoubleSide })); bn.rotation.y = -sd * Math.PI / 2; bn.position.set(sd * (LOBBY_W / 2 - 1.0), 15.5, zz); lobby.add(bn); });
      });
      lobby.children.slice().forEach(function (o) { if (o.geometry === colGeo) { o.material = navyM; [0.3, LOBBY_H - 2.3].forEach(function (yy) { var ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.22, 8, 24), goldM); ring.rotation.x = Math.PI / 2; ring.position.set(o.position.x, yy, o.position.z); lobby.add(ring); }); } });
      var pz = -LOBBY_D / 2 + 0.9, pc = document.createElement('canvas'); pc.width = pc.height = 256; var px = pc.getContext('2d'); var rg = px.createRadialGradient(128, 128, 6, 128, 128, 126); rg.addColorStop(0, '#fff6d6'); rg.addColorStop(0.35, '#ffd27a'); rg.addColorStop(0.75, '#d99a2a'); rg.addColorStop(1, '#5a3a08'); px.fillStyle = rg; px.fillRect(0, 0, 256, 256);
      var ptx = new THREE.CanvasTexture(pc); ptx.colorSpace = THREE.SRGBColorSpace; var emb = new THREE.Group(); emb.position.set(0, 18.8, pz); emb.scale.setScalar(0.6); lobby.add(emb);   // the sun-disc emblem now hangs ABOVE the gate instead of walling the tunnel mouth
      var disc = new THREE.Mesh(new THREE.CircleGeometry(8.4, 48), new THREE.MeshBasicMaterial({ map: ptx })); disc.position.set(0, 0, 0); emb.add(disc);
      [[8.9, 0.55], [7.2, 0.3], [5.4, 0.22], [3.6, 0.18]].forEach(function (q, i) { var r = new THREE.Mesh(new THREE.TorusGeometry(q[0], q[1], 10, 60), i % 2 ? cyanM : goldM); r.position.set(0, 0, 0.15 + i * 0.05); r.userData.spin = (i % 2 ? 1 : -1) * (0.12 + i * 0.05); emb.add(r); portalRings.push(r); });
      for (var pk = 0; pk < 16; pk++) { var pa = pk / 16 * Math.PI * 2, spk = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), goldM); spk.position.set(Math.cos(pa) * 10.2, Math.sin(pa) * 10.2, 0.1); spk.rotation.z = pa - Math.PI / 2; emb.add(spk); }
      var tc = document.createElement('canvas'); tc.width = 1024; tc.height = 160; var tx2 = tc.getContext('2d'); tx2.fillStyle = 'rgba(13,20,44,0.92)'; tx2.fillRect(0, 0, 1024, 160); tx2.strokeStyle = '#D4AF37'; tx2.lineWidth = 6; tx2.strokeRect(6, 6, 1012, 148); tx2.fillStyle = '#D4AF37'; tx2.font = '700 84px Georgia,serif'; tx2.textAlign = 'center'; tx2.textBaseline = 'middle'; tx2.fillText('S H A D D A I   C O L O S S E U M', 512, 84);
      var ttx = new THREE.CanvasTexture(tc); ttx.colorSpace = THREE.SRGBColorSpace; var ttl = new THREE.Mesh(new THREE.PlaneGeometry(28, 4.4), new THREE.MeshBasicMaterial({ map: ttx })); ttl.rotation.y = Math.PI; ttl.position.set(0, 20.6, LOBBY_D / 2 - 0.9); lobby.add(ttl);
      // ── ENTRANCE (owner: "no entrance to the actual colosseum"): a real open GATE to the grand tunnel + glowing floor chevrons leading through it to the arena ──
      (function () {
        var gz = -LOBBY_D / 2 + 1.6, gw = TUNNEL_HALF + 0.9, gh = 11.5;
        [-1, 1].forEach(function (sd) {
          var pil = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, gh, 18), goldM); pil.position.set(sd * gw, gh / 2, gz); lobby.add(pil);
          var cap = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.25, 8, 20), goldM); cap.rotation.x = Math.PI / 2; cap.position.set(sd * gw, gh, gz); lobby.add(cap);
          var led = new THREE.Mesh(new THREE.BoxGeometry(0.14, gh - 1, 0.14), cyanM); led.position.set(sd * (gw - 1.1), gh / 2, gz + 0.2); lobby.add(led);
        });
        var lin = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 2.4, 1.5, 2.0), goldM); lin.position.set(0, gh + 0.7, gz); lobby.add(lin);
        var inner = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 0.2, 0.22, 0.22), cyanM); inner.position.set(0, gh - 0.2, gz + 1.05); lobby.add(inner);
        var sc = document.createElement('canvas'); sc.width = 1024; sc.height = 200; var sx = sc.getContext('2d'); sx.fillStyle = 'rgba(8,14,34,0.94)'; sx.fillRect(0, 0, 1024, 200); sx.strokeStyle = '#D4AF37'; sx.lineWidth = 8; sx.strokeRect(8, 8, 1008, 184);
        sx.fillStyle = '#D4AF37'; sx.font = '700 96px Georgia,serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('THE ARENA', 512, 92); sx.fillStyle = '#00D4FF'; sx.font = '700 38px Georgia,serif'; sx.fillText('GRAND TUNNEL  ▲  SEATS · FIELD · STAGE', 512, 160);
        var stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace; var sgn = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.9), new THREE.MeshBasicMaterial({ map: stx })); sgn.position.set(0, gh + 2.9, gz + 1.1); lobby.add(sgn);
        // floor chevrons (one InstancedMesh): from the lobby's middle, through the gate, down the tunnel to the arena edge
        var tri = new THREE.Shape(); tri.moveTo(0, -1.3); tri.lineTo(1.5, 0.9); tri.lineTo(0.55, 0.9); tri.lineTo(0, -0.2); tri.lineTo(-0.55, 0.9); tri.lineTo(-1.5, 0.9); tri.closePath();
        var cg = new THREE.ShapeGeometry(tri); cg.rotateX(-Math.PI / 2);
        var z0l = LOBBY_D / 2 - 7, z1l = (B + 8) - (LOBBY_Z0 + LOBBY_D / 2), nCh = Math.max(4, Math.floor((z0l - z1l) / 5)), chv = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0x00D4FF, transparent: true, opacity: 0.85, depthWrite: false }), nCh), cm = new THREE.Matrix4();
        for (var ci = 0; ci < nCh; ci++) { cm.makeTranslation(0, 0.09, z0l - ci * 5); chv.setMatrixAt(ci, cm); } chv.instanceMatrix.needsUpdate = true; chv.frustumCulled = false; lobby.add(chv);
        frameHooks.push(function () { chv.material.opacity = 0.55 + 0.35 * Math.sin(_clk * 3); });
      })();
    })();
    // ── sky + light (open-air bowl) ──
    var skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.4+0.25,0.0,1.0)), 1.0); }' });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat); sky.frustumCulled = false; root.add(sky);
    var hemi = new THREE.HemisphereLight(0xfff1d6, 0x6b5a42, 1.1); root.add(hemi);
    var sun = new THREE.DirectionalLight(0xffe2b0, 2.2); sun.position.set(-120, 200, -80); root.add(sun); root.add(sun.target);   // aim at the arena, not the far-away world origin
    // ── CROWD + TORCHES: every spectator is one instance (4 InstancedMeshes total), seat positions come from hLocal only ──
    var CHEER = { value: 0.25 };                          // 0 = seated, 1 = on their feet (shader bob amplitude); setCrowdMood()
    function crowdMat(base) {
      var m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uTime = TIME; sh.uniforms.uCheer = CHEER;
        sh.vertexShader = 'uniform float uTime; uniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph = float(gl_InstanceID) * 1.618; transformed.y += uCheer * (0.5 + 0.5 * sin(uTime * (3.0 + 5.0 * uCheer) + ph)) * 0.32 * (0.4 + position.y);\n#endif');
      };
      return m;
    }
    var seatsL = [], seatsU = [];
    (function () {
      var rng = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(20260928);
      function tierSeats(out, dStart, dEnd, h0, h1, rows, upper) {
        for (var r = 0; r < rows; r++) {
          var dMid = dStart + (r + 0.5) * (dEnd - dStart) / rows, yTop = h0 + (h1 - h0) * (r + 1) / rows, pts = perim(dMid, Math.floor(perim(dMid, 4).len / 0.55), 0.5), n = pts.length, per = n / D.SECTIONS;
          for (var i = 0; i < n; i++) {
            if ((i % per) < 2) continue;                                  // aisle between sections
            var p = pts[i], smooth = upper ? H_LOW + ((dMid - PROM1) / (UP1 - PROM1)) * (H_UP - H_LOW) : tierH(dMid);
            if (Math.abs(hLocal(p.x, p.z) - smooth) > 0.05) continue;     // tunnels / vomitoria / lobby cut-outs — hLocal is the sole authority
            out.push({ x: p.x, y: yTop, z: p.z, yaw: p.yaw, sec: Math.floor(i / per), r: rng() });
          }
        }
      }
      tierSeats(seatsL, LOW0, LOW1, POD_H, H_LOW, ROWS, false);
      tierSeats(seatsU, PROM1, UP1, H_LOW, H_UP, ROWS, true);
      [seatsL, seatsU].forEach(function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } });   // shuffle so a prefix is a uniform density
    })();
    var PALETTE = [0xd94a4a, 0x3f7fd9, 0xe8c45c, 0x4fb87a, 0xa35bd6, 0xe98a3c, 0x36b8c9, 0xd9d9d9];
    var nearGeo = mergeGeos([{ geo: new THREE.CylinderGeometry(0.16, 0.22, 0.62, 5, 1, true), m: T4(0, 0.31, 0) }, { geo: new THREE.OctahedronGeometry(0.15, 0), m: T4(0, 0.78, 0) }]);
    var farGeo = mergeGeos([{ geo: new THREE.PlaneGeometry(0.46, 0.95), m: T4(0, 0.48, 0) }, { geo: new THREE.PlaneGeometry(0.46, 0.95).rotateY(Math.PI / 2), m: T4(0, 0.48, 0) }]);
    var crowdMatFar = crowdMat(), crowdMatNear = crowdMat();
    function crowdMesh(geo, mat, list, name) {
      var im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), m = new THREE.Matrix4(), c = new THREE.Color();
      for (var i = 0; i < list.length; i++) {
        var s = list[i]; compose(m, s.x, s.y, s.z, s.yaw + Math.PI, 0.9 + s.r * 0.25, 0.9 + s.r * 0.25, 1); im.setMatrixAt(i, m);
        c.setHex(PALETTE[(s.sec * 3 + (s.r * 4 | 0)) % PALETTE.length]).offsetHSL(0, 0, (s.r - 0.5) * 0.12); im.setColorAt(i, c);
      }
      im.count = 0; im.visible = false; im.name = name; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; root.add(im); return im;
    }
    var crowd = { farL: crowdMesh(farGeo, crowdMatFar, seatsL, 'crowd-far-lower'), farU: crowdMesh(farGeo, crowdMatFar, seatsU, 'crowd-far-upper'),
      nearL: crowdMesh(nearGeo, crowdMatNear, seatsL, 'crowd-near-lower'), nearU: crowdMesh(nearGeo, crowdMatNear, seatsU, 'crowd-near-upper'), seatsLower: seatsL.length, seatsUpper: seatsU.length };
    function setCount(im, n) { im.count = Math.max(0, Math.min(n, im.instanceMatrix.count)); im.visible = im.count > 0; }
    function applyCrowd() {
      var d = Q.crowd, nl = Math.floor(seatsL.length * d), nu = Math.floor(seatsU.length * d), near = Q.near;   // near: 0 none, 1 lower tier only, 2 both tiers
      setCount(crowd.farL, near >= 1 ? 0 : nl); setCount(crowd.farU, near >= 2 ? 0 : nu); setCount(crowd.nearL, near >= 1 ? nl : 0); setCount(crowd.nearU, near >= 2 ? nu : 0);
    }
    // torches: 32 emissive flames on posts along the promenade parapet (1 draw call each for posts + flames); a few REAL point lights depending on the quality tier
    var NTORCH = 32, torchPts = perim(PROM1 - 0.7, NTORCH, 0.25);
    mats.flame = new THREE.MeshBasicMaterial({ color: 0xff9a3c });
    instanced(new THREE.BoxGeometry(0.16, 1.3, 0.16), mats.stoneDark, NTORCH, function (i, m) { var p = torchPts[i]; compose(m, p.x, H_LOW + 0.65, p.z, p.yaw); }, 'torch-posts');
    instanced(new THREE.ConeGeometry(0.22, 0.6, 6), mats.flame, NTORCH, function (i, m) { var p = torchPts[i]; compose(m, p.x, H_LOW + 1.6, p.z, 0); }, 'torch-flames');
    var MAXL = 6, torches = [];
    for (var tI = 0; tI < MAXL; tI++) { var lp = torchPts[Math.floor(tI * NTORCH / MAXL)], pl = new THREE.PointLight(0xff9a3c, 0, 70); pl.position.set(lp.x, H_LOW + 3, lp.z); pl.visible = false; root.add(pl); torches.push(pl); }
    var torchIntensity = 0;
    frameHooks.push(function () { for (var i = 0; i < torches.length; i++) if (torches[i].visible) torches[i].intensity = torchIntensity * (0.92 + 0.08 * Math.sin(TIME.value * 9 + i * 2.1)); });
    function applyLights() { for (var i = 0; i < torches.length; i++) torches[i].visible = torchIntensity > 0 && i < Q.lights; }

    // ── KIOSKS (24, promenade ring): code-built stalls always exist; GLB kiosks replace them when the kit loads. Solid footprints live in hLocal (KIOSKS at module scope). ──
    var kioskCode = { body: null, awning: null }, kioskGlbSet = {}, kioskSetSaved = {};
    (function () {
      kioskCode.body = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 2.4, 1.4), mats.stoneDark, KIOSKS.length);
      kioskCode.awning = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.16, 1.9), mats.neon, KIOSKS.length);
      [kioskCode.body, kioskCode.awning].forEach(function (im) { im.frustumCulled = false; im.name = 'kiosks-code'; root.add(im); });
    })();
    function refreshKioskCode() {           // instances covered by a loaded GLB kiosk are compacted out of the code meshes
      var m = new THREE.Matrix4(), n = 0;
      for (var i = 0; i < KIOSKS.length; i++) { if (kioskGlbSet[i]) continue; var k = KIOSKS[i];
        kioskCode.body.setMatrixAt(n, compose(m, k.x, H_LOW + 1.2, k.z, k.yaw)); kioskCode.awning.setMatrixAt(n, compose(m, k.x - k.nx * 0.2, H_LOW + 2.6, k.z - k.nz * 0.2, k.yaw)); n++; }
      kioskCode.body.count = kioskCode.awning.count = n; kioskCode.body.instanceMatrix.needsUpdate = kioskCode.awning.instanceMatrix.needsUpdate = true;
    }
    refreshKioskCode();
    // portals: 4 arches at the tunnel mouths (code geometry; kit stand-arc01 replaces it)
    var portalPts = [[A + 0.6, 0, Math.PI / 2], [-(A + 0.6), 0, -Math.PI / 2], [0, B + 0.6, 0], [0, -(B + 0.6), Math.PI]];
    var portalCode = instanced(mergeGeos([{ geo: new THREE.BoxGeometry(1.4, 8.6, 1.6), m: T4(-(TUNNEL_HALF + 0.7), 4.3, 0) }, { geo: new THREE.BoxGeometry(1.4, 8.6, 1.6), m: T4(TUNNEL_HALF + 0.7, 4.3, 0) },
      { geo: new THREE.BoxGeometry(2 * TUNNEL_HALF + 3.6, 1.6, 1.8), m: T4(0, 8.6, 0) }]), mats.stone, 4, function (i, m) { var p = portalPts[i]; compose(m, p[0], 0, p[1], p[2]); }, 'portals-code');
    var vipSeatCode = root.children.filter(function (o) { return o.name === 'vip-seats'; })[0] || null;

    // ── GLB KIT: lazy (after the arena is first entered), Meshopt+Draco GLTFLoader, runtime Box3 fit-to-span in METRES + ground snap
    //    (idiom of world-landmarks.js:56-58 — accessor bounds in these GLBs are quantised garbage, so never trust them). Repeats are InstancedMesh. Any failure keeps the code geometry. ──
    var KIT = {
      kiosk: { url: '/assets/models/fal/prop-kiosk.glb', span: 2.8, axis: 'y' },
      seat:  { url: '/assets/models/kit/seat.glb', span: 0.78, axis: 'x' },        // backrest is on -z, i.e. it faces +z
      arch:  { url: '/assets/models/kit/stand-arc01.glb', span: 8.6, axis: 'x' },   // open at the centre (checked) -> safe over a tunnel mouth
    };
    var AGENTS = ['SHADDAI', 'ZEROX', 'ORACLE', 'QUILL', 'TURTLE', 'PIKADON', 'NEXUS'];
    var kit = { loader: null, started: false, done: {}, failed: {}, group: new THREE.Group(), mixers: [], agentObjs: {} };
    kit.group.name = 'colosseum-kit'; root.add(kit.group);
    function getGLTFLoader(cb) {
      if (kit.loader) return cb(kit.loader);
      var ok = function (L) { kit.loader = L; cb(L); };
      if (opts.loader && opts.loader.load) return ok(opts.loader);
      if (window.__shdGLTF && window.__shdGLTF.loader) return ok(window.__shdGLTF.loader);   // host may share its meshopt+draco loader (docs/COLOSSEUM-HOST-SNIPPET.md)
      try {
        Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js'), import('three/addons/loaders/DRACOLoader.js')]).then(function (m) {
          var L = new m[0].GLTFLoader(); L.setMeshoptDecoder(m[1].MeshoptDecoder);
          var dr = new m[2].DRACOLoader(); dr.setDecoderPath('/vendor/three/addons/libs/draco/'); L.setDRACOLoader(dr); ok(L);
        }).catch(function () { cb(null); });
      } catch (e) { cb(null); }
    }
    function fitObject(obj, span, axis) {   // scale so the chosen bbox axis is `span` metres, centre on x/z, put the lowest point at y = 0
      obj.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), cur = axis === 'y' ? sz.y : axis === 'x' ? sz.x : axis === 'z' ? sz.z : Math.max(sz.x, sz.z);
      if (!(cur > 1e-6) || !isFinite(cur)) return false;
      obj.scale.multiplyScalar(span / cur); obj.updateMatrixWorld(true); box.setFromObject(obj);
      obj.position.x -= (box.min.x + box.max.x) / 2; obj.position.z -= (box.min.z + box.max.z) / 2; obj.position.y -= box.min.y; obj.updateMatrixWorld(true);
      return true;
    }
    function lam(m) {                        // GLB PBR -> Lambert: same texture, far cheaper fragments on integrated GPUs
      if (!m || m.isMeshLambertMaterial || m.isMeshBasicMaterial) return m;
      var n = new THREE.MeshLambertMaterial({ color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null, emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity == null ? 1 : m.emissiveIntensity, transparent: !!m.transparent, opacity: m.opacity == null ? 1 : m.opacity, side: m.side, alphaTest: m.alphaTest || 0 });
      return n;
    }
    function loadFit(spec, cb) {             // -> cb(null, wrapperGroup) | cb(err)
      getGLTFLoader(function (L) {
        if (!L) return cb(new Error('no GLTFLoader'));
        try {
          L.load(spec.url, function (g) {
            try { var w = new THREE.Group(); w.add(g.scene); if (!fitObject(w, spec.span, spec.axis)) return cb(new Error('empty model ' + spec.url)); w.userData.animations = g.animations || []; cb(null, w); }
            catch (e) { cb(e); }
          }, undefined, function (e) { cb(e || new Error('load failed ' + spec.url)); });
        } catch (e) { cb(e); }
      });
    }
    function bakeParts(w) {                  // flatten a fitted wrapper into [{geo, mat, mtx}] (no skinned meshes)
      w.updateMatrixWorld(true); var parts = [];
      w.traverse(function (o) { if (o.isMesh && !o.isSkinnedMesh) parts.push({ geo: o.geometry, mat: lam(o.material), mtx: o.matrixWorld.clone() }); });
      return parts;
    }
    function instancePlacements(parts, mats4, name) {   // one InstancedMesh per sub-mesh; instance = placement x part matrix
      var out = [], tmp = new THREE.Matrix4();
      parts.forEach(function (pt, pi) {
        var im = new THREE.InstancedMesh(pt.geo, pt.mat, mats4.length); im.name = 'kit-' + name + '-' + pi; im.frustumCulled = false;
        for (var i = 0; i < mats4.length; i++) im.setMatrixAt(i, tmp.multiplyMatrices(mats4[i], pt.mtx));
        im.instanceMatrix.needsUpdate = true; kit.group.add(im); out.push(im);
      });
      return out;
    }
    function kitStep(name, fn) {
      if (kit.done[name] || kit.failed[name]) return;
      loadFit(KIT[name], function (err, w) { if (err) { kit.failed[name] = String(err && err.message || err); return; } try { fn(w); kit.done[name] = true; } catch (e) { kit.failed[name] = String(e && e.message || e); } });
    }
    function place4(x, y, z, yaw) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(_up, yaw), new THREE.Vector3(1, 1, 1)); }
    function startKit() {
      if (kit.started || !Q.glb) return; kit.started = true;
      var steps = [
        function () { kitStep('arch', function (w) { var ms = portalPts.map(function (p) { return place4(p[0], 0, p[1], p[2]); }); kit.arch = instancePlacements(bakeParts(w), ms, 'arch'); portalCode.visible = false; }); },
        function () { kitStep('kiosk', function (w) {
          var want = Q.kiosks, step = Math.max(1, Math.round(KIOSKS.length / Math.max(1, want))), ms = []; kioskGlbSet = {};
          for (var i = 0; i < KIOSKS.length; i += step) { var k = KIOSKS[i]; kioskGlbSet[i] = true; ms.push(place4(k.x, H_LOW, k.z, k.yaw + Math.PI)); }
          kit.kiosk = instancePlacements(bakeParts(w), ms, 'kiosk'); kioskSetSaved = kioskGlbSet; refreshKioskCode(); }); },
        function () { kitStep('seat', function (w) {
          var ms = vipSeats.map(function (s) { return place4(s.x, s.y - 0.2, s.z, s.yaw); }); kit.seat = instancePlacements(bakeParts(w), ms, 'vipseat'); if (vipSeatCode) vipSeatCode.visible = false; }); },
        function () { loadAgents(); },
      ];
      var i = 0, gap = opts.kitGap == null ? 400 : opts.kitGap; (function next() { if (i >= steps.length) return; steps[i++](); setTimeout(next, gap); })();   // spread the work so entering the arena never hitches
    }
    // agents: the council as vendors / ushers / greeter. Static poses driven by their baked idle clip (one mixer each, updated from the clock hook).
    var vendorPosts = [];
    (function () {
      var ks = [0, 1, 2, 3].map(function (q) { return Math.floor(q * KIOSKS.length / 4); }), tag = ['ZEROX', 'ORACLE', 'QUILL', 'TURTLE'];   // spread over the kiosks that exist (lobby arc skips some)
      ks.forEach(function (ki, n) { var k = KIOSKS[ki]; vendorPosts.push({ agent: tag[n], x: k.x + k.nz * 1.9, y: H_LOW, z: k.z - k.nx * 1.9, face: k.yaw + Math.PI, role: 'vendor', kiosk: ki }); });
      [0, 4].forEach(function (vi, n) { var th = VOM0 + vi * Math.PI * 2 / NVOM, cs = Math.cos(th), sn = Math.sin(th), rF = 1 / Math.sqrt((cs / A) * (cs / A) + (sn / B) * (sn / B)) - 2.2;
        var ux = rF * cs + sn * (STAIR_HALF + 1.4), uz = rF * sn - cs * (STAIR_HALF + 1.4); vendorPosts.push({ agent: n ? 'NEXUS' : 'PIKADON', x: ux, y: 0, z: uz, face: Math.atan2(-ux, -uz), role: 'usher' }); });
      vendorPosts.push({ agent: 'SHADDAI', x: 3.5, y: 0, z: LOBBY_Z0 + 12, face: 0, role: 'greeter' });
    })();
    var AGENT_PRIORITY = ['SHADDAI', 'ZEROX', 'ORACLE', 'QUILL', 'TURTLE', 'PIKADON', 'NEXUS'];
    function loadAgents() {
      var want = AGENT_PRIORITY.slice(0, Q.agents), i = 0;
      (function next() {
        if (i >= want.length) return; var name = want[i++], post = vendorPosts.filter(function (p) { return p.agent === name; })[0];
        if (!post || kit.agentObjs[name]) return next();
        loadFit({ url: '/assets/agents/' + name + '.glb', span: 1.8, axis: 'y' }, function (err, w) {
          if (!err) {
            w.position.set(post.x, post.y, post.z); w.rotation.y = post.face; w.name = 'agent-' + name; w.traverse(function (o) { if (o.isMesh) { o.frustumCulled = false; if (o.material && o.material.isMeshStandardMaterial) o.material = lam(o.material); } });
            kit.group.add(w); kit.agentObjs[name] = w;
            var clips = w.userData.animations, idle = null; for (var c = 0; c < clips.length; c++) if (/idle/i.test(clips[c].name)) idle = clips[c];
            if (idle) { var mx = new THREE.AnimationMixer(w); mx.clipAction(idle).play(); mx.update(Math.random() * 2); kit.mixers.push(mx); }
          } else kit.failed['agent-' + name] = String(err && err.message || err);
          setTimeout(next, opts.kitGap == null ? 300 : opts.kitGap);
        });
      })();
    }
    frameHooks.push(function (dt) { for (var i = 0; i < kit.mixers.length; i++) kit.mixers[i].update(dt); });
    qualityHooks.push(function () {          // tier change: show/hide the GLB layers; late upgrade starts the loader
      var on = !!Q.glb;
      kit.group.visible = on; if (kit.arch) portalCode.visible = !on; if (vipSeatCode && kit.seat) vipSeatCode.visible = !on;
      if (!on) { kioskGlbSet = {}; refreshKioskCode(); } else if (kit.started) { kioskGlbSet = kioskSetSaved; refreshKioskCode(); } else startKit();
    });

    // ── themes (admin presets) ──
    var THEMES = {
      shaddai:  { stone: 0x4a5f9c, dark: 0x243158, seat: 0x4a5c94, trim: 0xD4AF37, neonC: 0x00D4FF, banner: 0x123a80, top: 0x0a1338, bot: 0x2f4585, sun: 1.7, hemi: 1.15, torch: 2.4, neon: 1.7, namp: 0.5, vel: 0.6 },
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
      torchIntensity = T.torch; applyLights(); mats.flame.color.setHex(name === 'festival' ? 0xff5ac8 : 0xff9a3c);
      mats.recess.color.setHex(T.dark).multiplyScalar(0.3); velU.uC1.value.setHex(T.banner); velU.uC2.value.setHex(T.stone); vel.target = T.vel; if (!themeSet) { vel.open = T.vel; velU.uOpen.value = T.vel; velU.mesh.visible = T.vel > 0.02; themeSet = true; }
      mats.neon.emissive.setHex(T.neonC || T.trim); glowEntries[0].base = T.neon; glowEntries[0].amp = T.namp; mats.neon.emissiveIntensity = T.neon;
      env.fog.color.setHex(T.bot);
      drawScreen((current.field.toUpperCase()) + '  ·  ' + current.theme.toUpperCase());
    }
    // ── field modes (drawn onto the floor canvas; the canvas covers the ellipse's 124 × 88 m box) ──
    function setField(mode) {
      if (window.ColosseumFloors && api) { if (window.ColosseumFloors.modes.indexOf(mode) >= 0) { current.field = mode; drawScreen(mode.toUpperCase() + '  ·  ' + current.theme.toUpperCase()); return api.floors.apply(mode); } api.floors.clear(); }
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
      // 2026-11-05: was C, which is also the dodge roll (player controller) + hoverboard roll-right, so every roll in the arena switched cameras
      if (e.code === 'BracketRight') { var n = spectate(camIdx + 1); if (window.__toast) window.__toast('Camera: ' + n + '   ] next · X back'); specPost(); }
      if (e.code === 'KeyX' && camIdx >= 0) { spectate(-1); specPost(); }
    });

    // ── ARENA DESK KIOSK (owner 2026-11-07: "the menu doesn't just pop up, you go to the kiosk in the lobby before the doors") ──
    // A lit desk stands in the lobby 5 m before the inner arena doors. Walk up (3.5 m) -> "E · ARENA DESK" prompt -> E opens the mode screen
    // (world-actions.js openArena via window.__openArenaDesk). Replaces the old auto-pop at the doors.
    var DESK_L = [-7, 0, LOBBY_Z0 + 7], deskW = W2(DESK_L[0], 0, DESK_L[2]), deskNear = false, deskTip = null;
    (function buildDesk() {
      var d = new THREE.Group(); d.name = 'colosseum-arena-desk';
      var sc = group.scale.x || 1, toL = function (w) { return [(w[0] - group.position.x) / sc, (w[1] - group.position.y) / sc, (w[2] - group.position.z) / sc]; };
      var lp = toL(deskW); d.position.set(lp[0], lp[1], lp[2]); d.scale.setScalar(U / sc);   // children below are in metres
      var dark = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.6 });
      var gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0xe8c45c, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.8 });
      var base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.05, 0.7), dark); base.position.y = 0.525; d.add(base);
      var trim = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.05, 0.74), gold); trim.position.y = 1.07; d.add(trim);
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; var cx = cv.getContext('2d');
      cx.fillStyle = '#06080b'; cx.fillRect(0, 0, 512, 256); cx.strokeStyle = '#e8c45c'; cx.lineWidth = 6; cx.strokeRect(8, 8, 496, 240);
      cx.fillStyle = '#e8c45c'; cx.font = 'bold 64px sans-serif'; cx.textAlign = 'center'; cx.fillText('ARENA DESK', 256, 112);
      cx.fillStyle = '#27e0ff'; cx.font = '30px sans-serif'; cx.fillText('MODES  ·  SPECTATE  ·  EVENTS', 256, 172);
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      scr.position.set(0, 1.55, -0.05); scr.rotation.x = -0.25; d.add(scr);
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), gold); post.position.set(0, 1.3, -0.15); d.add(post);
      var ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 48), new THREE.MeshBasicMaterial({ color: 0xe8c45c, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; d.add(ring);   // TURTLE: findable from the lobby doors
      cx.fillStyle = '#27e0ff'; cx.fillRect(156, 128, 200, 3); tex.needsUpdate = true;
      d.rotation.y = 0;   // screen faces +z = toward the lobby entrance, so you read it walking in
      group.add(d);
    })();
    function deskPrompt(on) {
      if (on === deskNear) return; deskNear = on;
      if (!deskTip) { deskTip = document.createElement('div'); deskTip.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:60;padding:8px 16px;background:rgba(6,8,11,.88);border:1px solid #e8c45c;border-radius:8px;color:#e8c45c;font:600 13px system-ui,sans-serif;letter-spacing:.08em;pointer-events:none;display:none'; deskTip.innerHTML = '<b style="color:#fff">E</b> &nbsp;ARENA DESK'; document.body.appendChild(deskTip); }
      deskTip.style.display = on ? 'block' : 'none';
    }
    setInterval(function () {
      var D = window.__w3dDebug, p = D && D.playerPos;
      if (!group.visible || !p || camIdx >= 0) { deskPrompt(false); return; }
      deskPrompt(Math.hypot(p.x - deskW[0], p.z - deskW[2]) < 3.5 * U);
    }, 200);
    addEventListener('keydown', function (e) {
      if (e.code !== 'KeyE' || !deskNear || e.repeat || /input|textarea/i.test((document.activeElement || {}).tagName || '')) return;
      if (window.__openArenaDesk) { e.stopImmediatePropagation(); window.__openArenaDesk(); }
    }, true);

    // ── SPECTATE API for the dashboard (2026-11-07) ──
    // window.ShaddaiSpectate.watch('colosseum', cam) / .next() / .stop() / .state(). The dashboard can also drive it without code access:
    //   URL  SHADDAI-WORLD-3D.html?spectate=colosseum[&cam=N]          (opens straight into the broadcast cams)
    //   BroadcastChannel('shd-world') or window.postMessage  {type:'spectate', venue:'colosseum', cam:N}   (cam -1 = stop)
    // Every change answers {type:'spectate-state', venue, cam, name, cams:[names]} on the same channel + to window.parent (iframe embed).
    var specBC = null; try { specBC = new BroadcastChannel('shd-world'); } catch (e) { }
    function specState() { return { type: 'spectate-state', venue: 'colosseum', cam: camIdx, name: camIdx >= 0 ? cams[camIdx].name : null, cams: cams.map(function (c) { return c.name; }) }; }
    function specPost() { var s = specState(); try { if (specBC) specBC.postMessage(s); } catch (e) { } try { if (window.parent && window.parent !== window) window.parent.postMessage(s, '*'); } catch (e) { } return s; }
    function watch(cam) {
      var go = function () { var n = spectate(Math.max(0, cam | 0)); if (window.__toast) window.__toast('Spectating: ' + n + '   ] next camera · X back'); return specPost(); };
      if (group.visible) return go();
      if (window.__interiorsEnter) window.__interiorsEnter('COLOSSEUM');
      var tries = 0, t = setInterval(function () { if (group.visible || ++tries > 50) { clearInterval(t); if (group.visible) go(); } }, 200);
      return specState();
    }
    function onSpec(m) { if (!m || m.type !== 'spectate' || (m.venue && m.venue !== 'colosseum')) return; if (m.cam != null && m.cam < 0) { spectate(-1); specPost(); } else watch(m.cam || 0); }
    if (specBC) specBC.addEventListener('message', function (e) { onSpec(e.data); });
    addEventListener('message', function (e) { if (e.origin === location.origin || (window.parent && e.source === window.parent)) onSpec(e.data); });
    window.ShaddaiSpectate = { venues: ['colosseum'], watch: function (v, cam) { return v && v !== 'colosseum' ? null : watch(cam); }, next: function () { return watch(camIdx + 1); },
      stop: function () { spectate(-1); return specPost(); }, state: specState };
    (function () { var q = /[?&]spectate=colosseum\b/.test(location.search), m = /[?&]cam=(\d+)/.exec(location.search); if (!q) return;
      var t = setInterval(function () { if (window.__loadPlayable && window.__interiorsEnter) { clearInterval(t); watch(m ? +m[1] : 0); } }, 1000); })();

    // ── environment swap: the outdoor world's fog + view distance are tuned for the open map; inside this
    //    800-unit bowl they turn everything navy. While the arena is visible use a light warm haze + long view. ──
    var env = { saved: null, fog: new THREE.Fog(0xf2dcb0, 900, 4200) };
    setInterval(function () {
      var wq = readQuality(); if (wq && wq !== qName) api.setQuality(wq);
      var cam = window.__w3dDebug && window.__w3dDebug.camera;
      if (group.visible && !env.saved) {
        if (window.__shdVisitDistrict) window.__shdVisitDistrict('colosseum');
        startKit();
        // owner 2026-10-08: no fog. Swapping FogExp2 -> Fog also changed every material's shader key = a full
        // recompile freeze on entering the arena, so with fog off the world fog object is left alone (?fog=1 = old haze).
        env.saved = { fog: scene.fog, far: cam ? cam.far : null }; if (window.__SHD_FOG_ON) scene.fog = env.fog;
        if (cam && cam.far < 5000) { cam.far = 5000; cam.updateProjectionMatrix(); }
      } else if (!group.visible && env.saved) {
        scene.fog = env.saved.fog; if (cam && env.saved.far) { cam.far = env.saved.far; cam.updateProjectionMatrix(); }
        env.saved = null; if (camIdx >= 0) spectate(-1);
      }
    }, 250);
    var params = new URLSearchParams(location.search);
    setField(params.get('field') || 'sand'); setTheme(params.get('colo') || 'shaddai'); applyCrowd(); applyLights();
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
      var pts = new THREE.Points(geo, (typeof WorldVFX !== 'undefined' && WorldVFX.softPointsMaterial ? WorldVFX.softPointsMaterial(THREE, { color: 0xffe0a0, size: 0.6, opacity: 0.4, additive: true }) : new THREE.PointsMaterial({ color: 0xffe0a0, size: 0.6, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
      pts.frustumCulled = false; group.add(pts);
      return { pts: pts, vel: vel, count: n, hs: hs, falling: false };
    })();

    var api = {
      group: group, code: 'COLOSSEUM', animObjs: animObjs, motes: motes, glowEntries: glowEntries, time: TIME,
      // interiors spawn = origin.z + SPAWN_Z_OFFSET(28) → put the player in the lobby, facing the grand tunnel
      origin: { x: X0, z: Z0 + (LOBBY_Z0 + LOBBY_D * 0.65) * U - 28 },
      contains: function (x, z) { var lx = (x - X0) / U, lz = (z - Z0) / U; return (lx > -HALF_X && lx < HALF_X && lz > -HALF_Z_N && lz < HALF_Z_S) || inMetro(lx, lz); },
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
      setTheme: setTheme, setField: setField, spectate: spectate, cams: cams, quality: function () { return qName; }, kit: kit, kiosks: KIOSKS, vendorPosts: vendorPosts, startKit: startKit, crowd: crowd,
      setQuality: function (name) { name = String(name || '').toUpperCase(); if (!QPARAM[name]) return qName; Q = QPARAM[name]; qName = name; applyCrowd(); applyLights(); for (var qi = 0; qi < qualityHooks.length; qi++) qualityHooks[qi](Q, qName); return qName; },
      setCrowdMood: function (v) { CHEER.value = Math.max(0, Math.min(1, v)); },
      vipSeats: vipSeats, agentSlots: agentSlots, setVelarium: function (o) { vel.target = Math.max(0, Math.min(1, o)); }, velarium: vel,
      dims: Object.assign({}, D, { LOW1: LOW1, PROM1: PROM1, UP1: UP1, SHELL: SHELL, H_LOW: H_LOW, H_UP: H_UP, RAMP: RAMP, LOBBY_Z0: LOBBY_Z0 }), hLocal: hLocal,
      state: current, themes: Object.keys(THEMES), root: root, floorMesh: floor, metro: METRO,
    };
    if (window.ColosseumMetro) { window.ColosseumMetro.attach(THREE, api); frameHooks.push(function (dt) { api.metroApi.tick(dt); }); }
    if (window.ColosseumFloors) { window.ColosseumFloors.attach(THREE, api); frameHooks.push(function (dt) { api.floors.tick(dt); }); var pf = params.get('field'); if (pf && window.ColosseumFloors.modes.indexOf(pf) >= 0) setField(pf); }
    window.__colosseumArena = api;
    return api;
  };
})();
