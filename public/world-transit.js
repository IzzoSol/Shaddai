/* world-transit.js — the Ringed Realm maglev (owner atlas + transit refs, 2026-09-25).
 *
 * The golden ring on the atlas is a real elevated MAGLEV LINE: a double-track viaduct on pylons around
 * WORLD_LAYOUT.transit.radius, one station per atlas station (+ Central Station on the city edge, linked by a
 * spoke), and two 5-car trains looping the ring. At a station press E → pick a destination → ride there.
 * Real sizes (1 m = 7/1.8 u): deck 10 m wide ~9 m up, pylons every ~18 m, cars 20 m, stations 40 m.
 * Refs: fal-assets/refs/transit/*.jpg (white capsule maglevs, glass tubes, viaducts over snow + city).
 *
 * Parse time: pushes every pylon into WORLD_LAYOUT.realmColliders (solid) — load right after world-layout.js.
 * Spokes: every station links to an inner-ring HUB on The Grid's edge (E at a hub also opens the ride menu).
 * Build:  window.buildWorldTransit({ THREE, scene, layout, heightAt }) → { update(t, dt), stations, near(x,z), addStation(st), … }
 * Ride:   with the v2 trainset (world-train-v2.js) the ride is WALKABLE — board through a door, walk the cars, E to sit,
 *         step out at arrival. Host API: aboard(), walk(dt, inp, camYaw), aboardYawDelta(), seatYaw(). Spec: docs/TRAIN-RIDE.md.
 */
(function () {
  var L = window.WORLD_LAYOUT; if (!L || !L.transit) return;
  var PM = 7 / 1.8, R = L.transit.radius, PYLON_EVERY = 18 * PM;
  var N_PYL = Math.round((2 * Math.PI * R) / PYLON_EVERY);
  // realm roads (same bearings as world-trails / world-nature): no pylon may stand on one (12u each side)
  var ROAD_A = (L.biomes || []).filter(function (b) { return b.id !== 'grid'; }).map(function (b) { return Math.atan2(b.center[1], b.center[0]); });
  var _co = L.landmark && L.landmark('colosseum'); if (_co) ROAD_A.push(Math.atan2(_co.pos[1], _co.pos[0]));
  function onRoad(x, z) { return ROAD_A.some(function (a) { return x * Math.cos(a) + z * Math.sin(a) > 0 && Math.abs(-x * Math.sin(a) + z * Math.cos(a)) < 20; }); }
  var pylons = [];
  for (var i = 0; i < N_PYL; i++) { var a = i / N_PYL * Math.PI * 2, px = Math.cos(a) * R, pz = Math.sin(a) * R; if (!onRoad(px, pz)) pylons.push([px, pz, a]); }
  // SPOKES (atlas): every station is linked to The Grid by a straight elevated line. Ring stations start at an
  // inner-ring HUB on the city edge; Central Station's own spoke starts at the station. Straddle bents (twin
  // pylons ±7 m either side of the deck) keep the realm road under each spoke clear.
  var central = (L.stations || []).find(function (s) { return s.id === 'central'; });
  var HUB_R = ((L.city && L.city.radius) || 650) + 12 * PM, LAT = 7 * PM;
  var spokes = (L.stations || []).map(function (s) {
    var a = Math.atan2(s.pos[1], s.pos[0]), r0 = s.id === 'central' ? Math.hypot(s.pos[0], s.pos[1]) : HUB_R;
    return { id: s.id, st: s, a: a, r0: r0 };
  }).filter(function (sp) { return R - sp.r0 > PYLON_EVERY; });
  var spoke = [];   // bent pylons
  spokes.forEach(function (sp) {
    var ca = Math.cos(sp.a), sa = Math.sin(sp.a);
    for (var r = sp.r0 + PYLON_EVERY; r < R - PYLON_EVERY * 0.5; r += PYLON_EVERY)
      [-LAT, LAT].forEach(function (l) { spoke.push([ca * r - sa * l, sa * r + ca * l, sp.a]); });
  });
  pylons.concat(spoke).forEach(function (p) { L.realmColliders.push({ x: Math.round(p[0]), z: Math.round(p[1]), r: Math.round(1.6 * PM), label: 'maglev-pylon' }); });

  window.buildWorldTransit = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, heightAt = opts.heightAt || function () { return 0; };
    var group = new THREE.Group(); group.name = 'world-transit'; scene.add(group);
    // deck rides a constant height ~9 m above the highest ground under the ring (smooth, level line)
    var gMax = 0; pylons.forEach(function (p) { gMax = Math.max(gMax, heightAt(p[0], p[1])); });
    var DECK_Y = gMax + 9 * PM, DECK_W = 10 * PM, DECK_T = 1.4 * PM;
    var M = {
      concrete: new THREE.MeshStandardMaterial({ color: 0x1a1f27, roughness: 0.55, metalness: 0.35 }),
      white: new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.22, metalness: 0.25 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe8c45c, roughness: 0.3, metalness: 0.8, emissive: 0x3a2a08, emissiveIntensity: 0.4 }),
      rail: new THREE.MeshStandardMaterial({ color: 0x5fe0ff, emissive: 0x5fe0ff, emissiveIntensity: 1.6, roughness: 0.2 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      window: new THREE.MeshStandardMaterial({ color: 0x0b1a26, emissive: 0x5fe0ff, emissiveIntensity: 0.9, roughness: 0.1 }),
    };
    // ── viaduct deck: an annulus band + parapet walls + gold edge lines ──
    function band(r0, r1, y0, y1, mat, seg) {   // vertical wall (r0==r1) or flat ring (y0==y1)
      var g = r0 === r1 ? new THREE.CylinderGeometry(r0, r0, y1 - y0, seg || 720, 1, true) : new THREE.RingGeometry(r0, r1, seg || 720, 1);
      var m = new THREE.Mesh(g, mat); if (r0 === r1) m.position.y = (y0 + y1) / 2; else { m.rotation.x = -Math.PI / 2; m.position.y = y0; }
      m.material.side = THREE.DoubleSide; m.receiveShadow = true; group.add(m); return m;
    }
    band(R - DECK_W / 2, R + DECK_W / 2, DECK_Y, DECK_Y, M.concrete);                       // deck top
    band(R - DECK_W / 2, R + DECK_W / 2, DECK_Y - DECK_T, DECK_Y - DECK_T, M.concrete);     // deck underside
    band(R - DECK_W / 2, R - DECK_W / 2, DECK_Y - DECK_T, DECK_Y + 1.1 * PM, M.white);      // inner parapet
    band(R + DECK_W / 2, R + DECK_W / 2, DECK_Y - DECK_T, DECK_Y + 1.1 * PM, M.white);      // outer parapet
    band(R - DECK_W / 2 - 0.2, R - DECK_W / 2 - 0.2, DECK_Y + 1.1 * PM - 0.5, DECK_Y + 1.1 * PM, M.gold);
    band(R + DECK_W / 2 + 0.2, R + DECK_W / 2 + 0.2, DECK_Y + 1.1 * PM - 0.5, DECK_Y + 1.1 * PM, M.gold);
    // two tracks, each a pair of glowing rails
    var TRACKS = [-2.4 * PM, 2.4 * PM];
    TRACKS.forEach(function (off) { [-0.72 * PM, 0.72 * PM].forEach(function (g) { var t = new THREE.Mesh(new THREE.TorusGeometry(R + off + g, 0.22 * PM, 5, 720), M.rail); t.rotation.x = Math.PI / 2; t.position.y = DECK_Y + 0.25 * PM; group.add(t); }); });
    // pylons (instanced): tapered column + gold collar, standing on the terrain
    var colGeo = new THREE.CylinderGeometry(1.2 * PM, 1.7 * PM, 1, 12); colGeo.translate(0, 0.5, 0);
    var all = pylons.concat(spoke), cols = new THREE.InstancedMesh(colGeo, M.concrete, all.length), collars = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.9 * PM, 1.9 * PM, 0.6 * PM, 12), M.gold, all.length);
    var mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    all.forEach(function (p, k) {
      var g = heightAt(p[0], p[1]), h = Math.max(1, DECK_Y - DECK_T - g + 2);
      cols.setMatrixAt(k, mm.compose(pv.set(p[0], g - 2, p[1]), q.identity(), sv.set(1, h, 1)));
      collars.setMatrixAt(k, mm.compose(pv.set(p[0], DECK_Y - DECK_T - 0.4 * PM, p[1]), q.identity(), sv.set(1, 1, 1)));
    });
    cols.castShadow = true; group.add(cols); group.add(collars);
    // spoke decks (straight) from each hub / Central Station out to the ring, with a crossbeam on every bent
    var beams = [];
    spokes.forEach(function (sp) {
      var len = R - sp.r0 - DECK_W / 2, mid = sp.r0 + len / 2, yaw = Math.atan2(Math.cos(sp.a), Math.sin(sp.a));
      var sd = new THREE.Mesh(new THREE.BoxGeometry(DECK_W * 0.6, DECK_T, len), M.concrete);
      sd.position.set(Math.cos(sp.a) * mid, DECK_Y - DECK_T / 2, Math.sin(sp.a) * mid); sd.rotation.y = yaw; sd.receiveShadow = true; group.add(sd);
      [-1, 1].forEach(function (s) {
        var sr = new THREE.Mesh(new THREE.BoxGeometry(0.4 * PM, 0.3 * PM, len), M.rail); sr.position.copy(sd.position); sr.position.y = DECK_Y + 0.2 * PM; sr.rotation.y = yaw;
        sr.position.x += Math.cos(yaw) * s * 1.2 * PM; sr.position.z -= Math.sin(yaw) * s * 1.2 * PM; group.add(sr);
        var ed = new THREE.Mesh(new THREE.BoxGeometry(0.25 * PM, 0.25 * PM, len), M.gold); ed.position.copy(sd.position); ed.position.y = DECK_Y + 0.1 * PM; ed.rotation.y = yaw;
        ed.position.x += Math.cos(yaw) * s * DECK_W * 0.3; ed.position.z -= Math.sin(yaw) * s * DECK_W * 0.3; group.add(ed);
      });
      for (var r = sp.r0 + PYLON_EVERY; r < R - PYLON_EVERY * 0.5; r += PYLON_EVERY) beams.push([Math.cos(sp.a) * r, Math.sin(sp.a) * r, yaw]);
    });
    if (beams.length) {
      var bm = new THREE.InstancedMesh(new THREE.BoxGeometry(2 * LAT + 3 * PM, 1.4 * PM, 2.2 * PM), M.concrete, beams.length), qy = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      beams.forEach(function (b, k) { bm.setMatrixAt(k, mm.compose(pv.set(b[0], DECK_Y - DECK_T - 0.7 * PM, b[1]), qy.setFromAxisAngle(up, b[2] + Math.PI / 2), sv.set(1, 1, 1))); });
      bm.castShadow = true; group.add(bm);
    }
    // ── inner-ring HUBS (atlas cyan nodes on the city edge): gold-ringed plaza, floating beacon crystal, lift to the spoke ──
    var hubs = [], beacons = [];
    spokes.forEach(function (sp) {
      if (sp.id === 'central') return;
      var hx = Math.cos(sp.a) * sp.r0, hz = Math.sin(sp.a) * sp.r0, g = heightAt(hx, hz);
      var H = new THREE.Group(); H.position.set(hx, g, hz); group.add(H);
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(10 * PM, 10.5 * PM, 0.5 * PM, 48), M.concrete); disc.position.y = 0.25 * PM; disc.receiveShadow = true; H.add(disc);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(10 * PM, 0.25 * PM, 6, 64), M.gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.55 * PM; H.add(rim);
      var inner = new THREE.Mesh(new THREE.TorusGeometry(4 * PM, 0.18 * PM, 6, 48), M.rail); inner.rotation.x = Math.PI / 2; inner.position.y = 0.55 * PM; H.add(inner);
      var lift = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * PM, 2.2 * PM, DECK_Y - g, 16, 1, true), M.glass); lift.position.set(0, (DECK_Y - g) / 2, 0); H.add(lift);
      var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.4 * PM, 0), M.rail); crystal.position.y = DECK_Y - g + 6 * PM; crystal.scale.y = 1.6; H.add(crystal); beacons.push(crystal);
      var board = nameBoard(sp.st.name.replace(/ (Station|Terminal|Halt|Hub)$/i, '') + ' Line'); board.scale.setScalar(0.6); board.position.set(0, 6 * PM, 0); board.rotation.y = -sp.a - Math.PI / 2; H.add(board);
      hubs.push({ id: 'hub-' + sp.id, name: sp.st.name.replace(/ (Station|Terminal|Halt|Hub)$/i, '') + ' Line · Grid Hub', station: sp.id, x: hx, z: hz, group: H });
      if (window.__registerPlaceable) window.__registerPlaceable('transit:hub-' + sp.id, H, { source: 'world-transit.js', id: 'hub-' + sp.id });
    });
    // ── stations: platform + curved glass canopy with gold ribs + name board, and a ground lift pad ──
    var stations = [];
    function nameBoard(text) {
      var c = document.createElement('canvas'); c.width = 1024; c.height = 160; var x = c.getContext('2d');
      x.fillStyle = '#06080b'; x.fillRect(0, 0, 1024, 160); x.strokeStyle = '#e8c45c'; x.lineWidth = 8; x.strokeRect(6, 6, 1012, 148);
      x.fillStyle = '#e8c45c'; x.font = '700 64px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text.toUpperCase(), 512, 84);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Mesh(new THREE.PlaneGeometry(24 * PM, 3.75 * PM), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    }
    (L.stations || []).forEach(function (st) {
      var sx = st.pos[0], sz = st.pos[1], ang = Math.atan2(sz, sx), onRing = st.id !== 'central';
      var S = new THREE.Group(); S.position.set(sx, 0, sz); S.rotation.y = -ang - Math.PI / 2; group.add(S);   // local +x = along the track, +z = toward the city
      var ground = heightAt(sx, sz), top = onRing ? DECK_Y : ground + 9 * PM;
      var plat = new THREE.Mesh(new THREE.BoxGeometry(40 * PM, 1.2 * PM, 7 * PM), M.white); plat.position.set(0, top - 0.6 * PM, (onRing ? DECK_W / 2 + 3.5 * PM : 0)); S.add(plat);
      var canopy = new THREE.Mesh(new THREE.CylinderGeometry(9 * PM, 9 * PM, 40 * PM, 32, 1, true, 0, Math.PI), M.glass); canopy.rotation.z = Math.PI / 2; canopy.position.set(0, top + 1 * PM, plat.position.z * 0.5); S.add(canopy);
      for (var ri = -4; ri <= 4; ri++) { var rib = new THREE.Mesh(new THREE.TorusGeometry(9 * PM, 0.25 * PM, 6, 24, Math.PI), M.gold); rib.rotation.y = Math.PI / 2; rib.position.set(ri * 5 * PM, top + 1 * PM, plat.position.z * 0.5); S.add(rib); }
      var board = nameBoard(st.name); board.position.set(0, top + 11 * PM, plat.position.z + 3 * PM); S.add(board);
      var lift = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * PM, 2.2 * PM, top - ground, 16, 1, true), M.glass); lift.position.set(0, ground + (top - ground) / 2, plat.position.z + 6 * PM); S.add(lift);
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(4 * PM, 4 * PM, 0.3 * PM, 32), M.gold); pad.position.set(0, ground + 0.15 * PM, plat.position.z + 6 * PM); S.add(pad);
      S.updateMatrixWorld(true); var wp = new THREE.Vector3(); pad.getWorldPosition(wp);
      stations.push({ id: st.id, name: st.name, x: wp.x, z: wp.z, group: S });
      if (window.__registerPlaceable) window.__registerPlaceable('transit:' + st.id, S, { source: 'world-transit.js', id: st.id });
    });
    // ── trains: 2 × 5 capsule cars, one per track, opposite directions ──
    var CAR = 20 * PM, GAP = 1.2 * PM;
    function car(nose) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.CapsuleGeometry(1.7 * PM, CAR - 3.4 * PM, 8, 20), M.white); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.95); g.add(body);
      var win = new THREE.Mesh(new THREE.BoxGeometry(CAR * 0.82, 0.7 * PM, 3.5 * PM), M.window); win.position.y = 0.5 * PM; g.add(win);
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR * 0.9, 0.18 * PM, 3.46 * PM), M.gold); stripe.position.y = -0.55 * PM; g.add(stripe);
      if (nose) { var n = new THREE.Mesh(new THREE.SphereGeometry(1.1 * PM, 16, 12), M.gold); n.position.x = CAR / 2 - 0.4 * PM; n.scale.set(0.6, 0.7, 1.2); g.add(n); }
      g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      return g;
    }
    var trains = [0, 1].map(function (k) { var cars = []; for (var c = 0; c < 5; c++) { var m = car(c === 0 || c === 4); group.add(m); cars.push(m); } return { cars: cars, r: R + TRACKS[k], dir: k ? -1 : 1, s: k * Math.PI }; });
    var SPEED = 30 * PM;   // world units / s (30 m/s)
    function placeTrain(tr) {
      for (var c = 0; c < tr.cars.length; c++) {
        var m = tr.cars[c], a = tr.s - tr.dir * c * (CAR + GAP) / tr.r;
        m.position.set(Math.cos(a) * tr.r, DECK_Y + 2.2 * PM, Math.sin(a) * tr.r);
        m.rotation.y = -a + (tr.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    trains.forEach(placeTrain);

    // ── WALKABLE RIDE (v2 trainset, docs/TRAIN-RIDE.md): the player lives in TRAIN-LOCAL model metres while aboard ──
    // board: train parks at the station, platform-side doors open, you start on the platform and walk in through a door
    // run:   doors shut, the train runs the ring; WASD walks the aisle (floors + colliders from userData), E sits / stands
    // arrive: doors open on the platform side; walk out onto the platform → released at the station (lift pad)
    // Only E is ever consumed while aboard, so the map (M), chat (C), talk (T), Tab and every HUD/phone/inventory key still work.
    var WALK = null, occ = [];                                   // walkable layout (model userData) + seat occupancy
    var PR = 0.24, REACH = 1.8, WALK_MS = 2.6, RUN_MS = 4.2;     // player radius (m), E reach (m), walk / run speed inside (m/s)
    var CAR_Y = DECK_Y + 2.2 * PM, PLAT_Y = (DECK_Y - CAR_Y) / PM + 2.0, PLAT_HALF = 19.5;   // platform top in model metres (≈ -0.2)
    var ab = { x: 0, y: 0, z: 0, seat: -1, yawPrev: 0, yawD: 0 }, _wv = { x: 0, z: 0 }, _t = { x: 0, y: 0, z: 0 };
    var _info = { phase: null, seat: -1, kind: null, x: 0, y: 0, z: 0, side: 0, doors: 0 };
    function toWorld(tr, mx, my, mz, out) {   // model metres → world (setTrainModel: clone rot PI/2, scale PM, y −2 m)
      var w = tr.cars[0], th = w.rotation.y, c = Math.cos(th), s = Math.sin(th), lx = PM * mz, lz = -PM * mx;
      out.x = w.position.x + lx * c + lz * s; out.y = w.position.y + PM * (my - 2.0); out.z = w.position.z - lx * s + lz * c; return out;
    }
    function innerSide(tr) { toWorld(tr, 1, 0, 0, _t); var r1 = _t.x * _t.x + _t.z * _t.z; toWorld(tr, -1, 0, 0, _t); return r1 < _t.x * _t.x + _t.z * _t.z ? 1 : -1; }
    function inBox(b, x, z, pad) { return x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad; }
    function floorAt(x, z) {   // floor height (model m) under x,z, or NaN off every walkable floor
      var F = WALK.floors, i; for (i = 0; i < F.length; i++) if (inBox(F[i], x, z, 0)) return F[i].min.y;
      if (!riding || !riding.walk || riding.tr.doorOpen < 0.85) return NaN;
      var C = WALK.cabin, sd = riding.side, ax = x * sd, D = WALK.doors;
      if (ax > C.A + 0.3 && ax < C.A + 3.2 && z > -PLAT_HALF && z < PLAT_HALF) return PLAT_Y;            // the platform strip
      if (ax > C.halfW - 0.1 && ax <= C.A + 0.4)
        for (i = 0; i < D.length; i++) if (D[i].side === sd && Math.abs(z - D[i].z) < C.doorW / 2 - 0.1) return C.floorY;   // open doorway
      return NaN;
    }
    function solid(x, z) { var C = WALK.colliders; for (var i = 0; i < C.length; i++) if (inBox(C[i], x, z, PR)) return true; return false; }
    function ok(x, z) { var f = floorAt(x, z); return f === f && !solid(x, z); }
    function me() { return window.__w3dDebug && window.__w3dDebug.playerPos; }
    function placePlayer() { var P = me(); if (P && riding && riding.walk) toWorld(riding.tr, ab.x, ab.y, ab.z, P); }
    function inside() { return Math.abs(ab.x) <= WALK.cabin.halfW; }
    function nearestDoorZ(sd) { var D = WALK.doors, bz = 0, bd = 1e9; for (var i = 0; i < D.length; i++) if (D[i].side === sd && Math.abs(D[i].z - ab.z) < bd) { bd = Math.abs(D[i].z - ab.z); bz = D[i].z; } return bz; }
    function doorsTo(tr, target, dt) {   // ease the platform-side panels open (slide +Z into the pocket) / shut
      tr.doorOpen += Math.max(-dt * 1.6, Math.min(dt * 1.6, target - tr.doorOpen));
      var P = tr.doorPanels || [], sd = riding ? riding.side : 0;
      for (var i = 0; i < P.length; i++) P[i].position.z = P[i].userData.doorZ + (P[i].userData.side === sd ? tr.doorOpen * WALK.cabin.doorW * 0.95 : 0);
    }
    function sitToggle() {   // E aboard: stand up if seated, else take the nearest FREE seat within reach
      if (!riding || !riding.walk) return null;
      var S = WALK.seats, s;
      if (ab.seat >= 0) { s = S[ab.seat]; occ[ab.seat] = false; ab.seat = -1; ab.x = s.ax; ab.z = s.az; ab.y = WALK.cabin.floorY; placePlayer(); return 'stand'; }
      var best = -1, bd = REACH * REACH;
      for (var i = 0; i < S.length; i++) { if (occ[i]) continue; var dx = S[i].x - ab.x, dz = S[i].z - ab.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
      if (best < 0) { if (window.__toast) window.__toast('No free seat in reach — walk closer'); return null; }
      s = S[best]; ab.seat = best; occ[best] = true; ab.x = s.x; ab.z = s.z; ab.y = WALK.cabin.floorY; placePlayer();
      if (window.__toast) window.__toast({ standard: '💺 Seated', lounge: '🛋️ Lounge sofa', bar: '🍸 Window bar', pilot: '🕹️ Pilot seat — view only' }[s.kind] + ' · E to stand');
      return s.kind;
    }
    function release(auto) {   // off the train at the destination: the platform lift sets you down at the station pad
      var rd = riding, d = rd.dest, P = me();
      if (ab.seat >= 0) occ[ab.seat] = false; ab.seat = -1; ab.yawD = 0;
      rd.side = 0; doorsTo(rd.tr, 0, 1); rd.tr.doorOpen = 0; doorsTo(rd.tr, 0, 1);
      if (P) { P.x = d.x; P.z = d.z; if (d.y != null) P.y = d.y; }
      riding = null;
      if (window.__toast) window.__toast((auto ? '🚪 Doors closing — you step onto the platform · ' : '🚉 Arrived: ') + d.name);
      if (typeof d.onArrive === 'function') try { d.onArrive(d); } catch (e) {}
    }

    // ── boarding: E at a station pad → destination menu → ride → arrive ──
    var ui = null, riding = null;
    function near(x, z) { var best = null, bd = 16 * PM; stations.concat(hubs).forEach(function (s) { var d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }); return best; }
    function menu(from) {
      if (ui) ui.remove();
      ui = document.createElement('div');
      ui.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99998;background:rgba(6,8,11,.94);border:1px solid #e8c45c;border-radius:14px;padding:18px 20px;font:14px Georgia,serif;color:#dfe7ee;min-width:320px';
      ui.innerHTML = '<div style="color:#e8c45c;letter-spacing:.2em;font-size:12px;margin-bottom:4px">RINGED REALM MAGLEV</div><div style="font-size:18px;margin-bottom:12px">' + from.name + '</div>' +
        stations.filter(function (s) { return s !== from && s.id !== from.station; }).map(function (s) { return '<button data-to="' + s.id + '" style="display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;background:#101822;border:1px solid #1d2733;color:#dfe7ee;border-radius:8px;cursor:pointer;font:inherit">→ ' + s.name + (s.underground ? ' ⤓' : '') + '</button>'; }).join('') +
        '<div style="color:#7a8794;font-size:12px;margin-top:8px">Esc to close</div>';
      document.body.appendChild(ui);
      if (document.exitPointerLock) document.exitPointerLock();
      ui.addEventListener('click', function (e) { var to = e.target.getAttribute('data-to'); if (!to) return; var dest = stations.find(function (s) { return s.id === to; }); ui.remove(); ui = null; ride(from, dest); if (window.enterPlayMode) try { window.enterPlayMode(); } catch (er) {} });   // the click is a user gesture → re-grab the mouse so you can walk aboard
    }
    function ride(from, dest) {
      if (window.__dragons && window.__dragons.isOpen && !window.__dragons.isOpen(dest.id)) {   // crossing dragons: beaten once = open forever
        if (window.__toast) window.__toast('🐉 A dragon guards ' + dest.name + ' — defeat it at the crossing first'); return;
      }
      var tr = trains[0], a0 = Math.atan2(from.z, from.x), a1 = Math.atan2(dest.z, dest.x);
      var da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      var arc = Math.abs(da) * tr.r / SPEED;
      riding = { tr: tr, a0: a0, da: da, t: 0, dur: Math.max(4, Math.min(12, arc)), dest: dest, dir: tr.dir, walk: !!WALK };
      tr.dir = da >= 0 ? 1 : -1; tr.s = a0;
      if (WALK) {   // walkable: park at the platform, open the doors, put the player on the platform beside the nearest door
        placeTrain(tr); riding.phase = 'board'; riding.dur = Math.max(20, Math.min(60, arc)); riding.inT = 0;
        riding.side = innerSide(tr); tr.doorOpen = 0;
        ab.seat = -1; ab.z = 0; ab.z = nearestDoorZ(riding.side); ab.x = riding.side * (WALK.cabin.A + 1.4); ab.y = PLAT_Y;
        ab.yawPrev = tr.cars[0].rotation.y; ab.yawD = 0; placePlayer();
        if (window.__toast) window.__toast('🚄 ' + from.name + ' → ' + dest.name + ' · doors open — walk aboard (E = sit)');
        return;
      }
      if (window.__toast) window.__toast('🚄 ' + from.name + ' → ' + dest.name);
    }
    addEventListener('keydown', function (e) {
      if (e.code !== 'KeyE' || e.repeat) return;
      if (riding && riding.walk) { e.stopImmediatePropagation(); e.preventDefault(); sitToggle(); return; }   // aboard: E = sit / stand (the ONLY key the ride takes)
      if (riding || ui) return;
      var P = window.__w3dDebug && window.__w3dDebug.playerPos; if (!P) return;
      var I = window.__w3dDebug.interiors; if (I && I.isInside && I.isInside()) return;
      var s = near(P.x, P.z); if (!s) return;
      e.stopImmediatePropagation(); e.preventDefault(); menu(s);
    }, true);

    var api = {
      // Swap the procedural capsule cars for a real train model (owner download: Superconductor maglev, 60 m, length along
      // the model's Z). Each train becomes 2 coupled 60 m units; placeTrain keeps driving them along the ring.
      // A full v2 trainset (units = 1, userData.floors/colliders/seats) also makes the ride WALKABLE.
      setTrainModel: function (model, unitLenM, units) {   // units: coupled copies per train (default 2; a full trainset = 1)
        CAR = (unitLenM || 60) * PM; GAP = 0.8 * PM;
        var ud = model.userData || {};
        WALK = (units === 1 && ud.floors && ud.colliders && ud.seats && ud.cabin) ? ud : null;
        occ = WALK ? WALK.seats.map(function () { return false; }) : [];
        trains.forEach(function (tr) {
          tr.cars.forEach(function (m) { group.remove(m); });
          tr.doorPanels = []; tr.doorOpen = 0;
          tr.cars = Array.from({ length: units || 2 }, function () {
            var w = new THREE.Group(), c = model.clone(true); c.rotation.y = Math.PI / 2; c.scale.setScalar(PM); c.position.y = -2.0 * PM;   // base 0.2 m over the guideway (placeTrain puts car centres 2.2 m up); model metres → units; length Z → the car's X axis
            c.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } if (o.userData && o.userData.doorIdx != null) tr.doorPanels.push(o); }); w.add(c); w.position.y = 0; group.add(w); return w;
          });
          placeTrain(tr);
        });
        return true;
      },
      // HOOK for other modules (e.g. colosseum-underground.js): register a stop. The train serves it on the ring at its
      // bearing; arrival sets you down at (x, z) (and y when given, e.g. an underground platform) then calls onArrive(st).
      addStation: function (st) {
        if (!st || !st.id || !isFinite(st.x) || !isFinite(st.z)) return null;
        var old = stations.find(function (s) { return s.id === st.id; }); if (old) stations.splice(stations.indexOf(old), 1);
        var s = { id: st.id, name: st.name || st.id, x: st.x, z: st.z, y: st.y != null ? st.y : null, underground: !!st.underground, onArrive: st.onArrive || null, group: st.group || null, external: true };
        stations.push(s); return s;
      },
      removeStation: function (id) { var s = stations.find(function (x) { return x.id === id && x.external; }); if (s) stations.splice(stations.indexOf(s), 1); return !!s; },
      group: group, stations: stations, hubs: hubs, near: near, deckY: DECK_Y, ride: ride,
      _frames: 0,
      status: function () { return riding ? { f: api._frames, t: +riding.t.toFixed(2), dur: +riding.dur.toFixed(2), to: riding.dest.id, phase: riding.phase || 'cutscene' } : null; },   // probe/debug
      // ── aboard API for the host (SHADDAI-WORLD-3D.html) ──
      aboard: function () { return !!(riding && riding.walk); },
      walk: function (dt, inp, camYaw) {   // WASD in train-local space; camYaw = atan2(fwd.x, fwd.z). → world velocity (u/s), reused object
        _wv.x = 0; _wv.z = 0;
        if (!riding || !riding.walk || ab.seat >= 0 || !inp) return _wv;
        var f = (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0), r = (inp.right ? 1 : 0) - (inp.left ? 1 : 0); if (!f && !r) return _wv;
        var sy = Math.sin(camYaw), cy = Math.cos(camYaw), dx = sy * f - cy * r, dz = cy * f + sy * r, n = Math.sqrt(dx * dx + dz * dz);
        var ms = inp.sprint ? RUN_MS : WALK_MS, step = ms * Math.min(dt || 0.016, 0.1) / n;
        var th = riding.tr.cars[0].rotation.y, c = Math.cos(th), s = Math.sin(th), lx = dx * c - dz * s, lz = dx * s + dz * c;   // world dir → wrapper-local
        var nx = ab.x - lz * step, nz = ab.z + lx * step;                                                               // wrapper-local → model (x = −lz, z = lx)
        if (ok(nx, ab.z)) ab.x = nx;
        if (ok(ab.x, nz)) ab.z = nz;
        var fy = floorAt(ab.x, ab.z); if (fy === fy) ab.y = fy;
        placePlayer();
        _wv.x = dx / n * ms * PM; _wv.z = dz / n * ms * PM; return _wv;
      },
      sit: sitToggle,
      aboardYawDelta: function () { return riding && riding.walk ? ab.yawD : 0; },   // host adds this to the look yaw so the view turns with the train
      seatYaw: function () {   // world facing of the occupied seat (host convention atan2(fx, fz)), or null
        if (!riding || !riding.walk || ab.seat < 0) return null;
        var sw = WALK.seats[ab.seat], fx = Math.sin(sw.yaw), fz = Math.cos(sw.yaw), th = riding.tr.cars[0].rotation.y, c = Math.cos(th), s = Math.sin(th);
        return Math.atan2(fz * c - fx * s, -fz * s - fx * c);
      },
      aboardInfo: function () {
        var on = !!(riding && riding.walk); _info.phase = on ? riding.phase : null; _info.seat = on ? ab.seat : -1;
        _info.kind = on && ab.seat >= 0 ? WALK.seats[ab.seat].kind : null; _info.x = ab.x; _info.y = ab.y; _info.z = ab.z;
        _info.side = on ? riding.side : 0; _info.doors = on ? riding.tr.doorOpen : 0; return _info;
      },
      update: function (t, dt) {
        api._frames++; dt = Math.min(dt || 0.016, 0.1);
        for (var bi = 0; bi < beacons.length; bi++) { beacons[bi].rotation.y += dt * 0.9; beacons[bi].position.y += Math.sin(t * 1.6 + bi) * 0.02; }
        for (var ti = 0; ti < trains.length; ti++) { var tr = trains[ti]; if (riding && riding.tr === tr) continue; tr.s += tr.dir * SPEED * dt / tr.r; placeTrain(tr); }
        if (riding && riding.walk) {
          var rw = riding; rw.t += dt;
          if (rw.phase === 'board') {
            doorsTo(rw.tr, 1, dt);
            if (inside()) rw.inT += dt;
            if (rw.inT > 1.5 || rw.t > 30) {   // aboard (or the 30 s all-aboard): doors shut, depart
              if (!inside()) { if (window.__toast) window.__toast('🚄 All aboard!'); ab.z = nearestDoorZ(rw.side); ab.x = 0; ab.y = WALK.cabin.floorY; }
              else if (Math.abs(ab.x) > WALK.cabin.halfW - 0.3) ab.x = (ab.x > 0 ? 1 : -1) * (WALK.cabin.halfW - 0.3);
              rw.phase = 'run'; rw.t = 0;
            }
          } else if (rw.phase === 'run') {
            doorsTo(rw.tr, 0, dt);
            var kk = Math.min(1, rw.t / rw.dur), ee = kk < 0.5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
            rw.tr.s = rw.a0 + rw.da * ee; placeTrain(rw.tr);
            if (kk >= 1) { rw.phase = 'arrive'; rw.t = 0; rw.side = innerSide(rw.tr); if (window.__toast) window.__toast('🚉 ' + rw.dest.name + ' — doors open, step out onto the platform'); }
          } else if (rw.phase === 'arrive') {
            doorsTo(rw.tr, 1, dt);
            if (Math.abs(ab.x) > WALK.cabin.A + 0.6) { release(false); return; }   // walked out onto the platform
            if (rw.t > 45) { release(true); return; }
          }
          var yw = rw.tr.cars[0].rotation.y, yd = yw - ab.yawPrev; while (yd > Math.PI) yd -= 2 * Math.PI; while (yd < -Math.PI) yd += 2 * Math.PI;
          ab.yawD = yd; ab.yawPrev = yw;
          placePlayer();
        } else if (riding) {   // legacy camera-follow ride (downloaded GLB / capsule cars)
          var rd = riding; rd.t += dt; var k = Math.min(1, rd.t / rd.dur), e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          rd.tr.s = rd.a0 + rd.da * e2; placeTrain(rd.tr);
          var lead = rd.tr.cars[0].position, ah = rd.tr.s + (rd.da >= 0 ? 0.08 : -0.08);
          window.__probeCam = { pos: [lead.x * 1.04, lead.y + 5 * PM, lead.z * 1.04], look: [Math.cos(ah) * R, DECK_Y, Math.sin(ah) * R] };
          if (k >= 1) { var P = window.__w3dDebug.playerPos; P.x = rd.dest.x; P.z = rd.dest.z; if (rd.dest.y != null) P.y = rd.dest.y; window.__probeCam = null; riding = null; if (window.__toast) window.__toast('🚉 Arrived: ' + rd.dest.name); if (typeof rd.dest.onArrive === 'function') try { rd.dest.onArrive(rd.dest); } catch (e) {} }
        }
      },
      _debug: { trains: trains, ab: ab, occ: function () { return occ; }, ok: function (x, z) { return !!WALK && ok(x, z); }, toWorld: toWorld, walkLayout: function () { return WALK; }, platY: PLAT_Y },
    };
    window.__worldTransit = api;
    return api;
  };
})();
