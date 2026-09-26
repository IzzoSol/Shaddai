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
 * Build:  window.buildWorldTransit({ THREE, scene, layout, heightAt }) → { update(t, dt), stations, near(x,z) }
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
      tr.cars.forEach(function (m, c) {
        var a = tr.s - tr.dir * c * (CAR + GAP) / tr.r;
        m.position.set(Math.cos(a) * tr.r, DECK_Y + 2.2 * PM, Math.sin(a) * tr.r);
        m.rotation.y = -a + (tr.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      });
    }
    trains.forEach(placeTrain);

    // ── boarding: E at a station pad → destination menu → ride (camera follows the train) → arrive ──
    var ui = null, riding = null;
    function near(x, z) { var best = null, bd = 16 * PM; stations.concat(hubs).forEach(function (s) { var d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }); return best; }
    function menu(from) {
      if (ui) ui.remove();
      ui = document.createElement('div');
      ui.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99998;background:rgba(6,8,11,.94);border:1px solid #e8c45c;border-radius:14px;padding:18px 20px;font:14px Georgia,serif;color:#dfe7ee;min-width:320px';
      ui.innerHTML = '<div style="color:#e8c45c;letter-spacing:.2em;font-size:12px;margin-bottom:4px">RINGED REALM MAGLEV</div><div style="font-size:18px;margin-bottom:12px">' + from.name + '</div>' +
        stations.filter(function (s) { return s !== from && s.id !== from.station; }).map(function (s) { return '<button data-to="' + s.id + '" style="display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;background:#101822;border:1px solid #1d2733;color:#dfe7ee;border-radius:8px;cursor:pointer;font:inherit">→ ' + s.name + '</button>'; }).join('') +
        '<div style="color:#7a8794;font-size:12px;margin-top:8px">Esc to close</div>';
      document.body.appendChild(ui);
      if (document.exitPointerLock) document.exitPointerLock();
      ui.addEventListener('click', function (e) { var to = e.target.getAttribute('data-to'); if (!to) return; var dest = stations.find(function (s) { return s.id === to; }); ui.remove(); ui = null; ride(from, dest); });
    }
    function ride(from, dest) {
      if (window.__dragons && window.__dragons.isOpen && !window.__dragons.isOpen(dest.id)) {   // crossing dragons: beaten once = open forever
        if (window.__toast) window.__toast('🐉 A dragon guards ' + dest.name + ' — defeat it at the crossing first'); return;
      }
      var tr = trains[0], a0 = Math.atan2(from.z, from.x), a1 = Math.atan2(dest.z, dest.x);
      var da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      riding = { tr: tr, a0: a0, da: da, t: 0, dur: Math.max(4, Math.min(12, Math.abs(da) * tr.r / SPEED)), dest: dest, dir: tr.dir };
      tr.dir = da >= 0 ? 1 : -1; tr.s = a0;
      if (window.__toast) window.__toast('🚄 ' + from.name + ' → ' + dest.name);
    }
    addEventListener('keydown', function (e) {
      if (e.code === 'Escape' && ui) { ui.remove(); ui = null; return; }
      if (e.code !== 'KeyE' || riding || ui) return;
      var P = window.__w3dDebug && window.__w3dDebug.playerPos; if (!P) return;
      var I = window.__w3dDebug.interiors; if (I && I.isInside && I.isInside()) return;
      var s = near(P.x, P.z); if (!s) return;
      e.stopImmediatePropagation(); e.preventDefault(); menu(s);
    }, true);

    var api = {
      group: group, stations: stations, hubs: hubs, near: near, deckY: DECK_Y,
      _frames: 0,
      status: function () { return riding ? { f: api._frames, t: +riding.t.toFixed(2), dur: +riding.dur.toFixed(2), to: riding.dest.id } : null; },   // probe/debug
      update: function (t, dt) {
        api._frames++; dt = Math.min(dt || 0.016, 0.1);
        for (var bi = 0; bi < beacons.length; bi++) { beacons[bi].rotation.y += dt * 0.9; beacons[bi].position.y += Math.sin(t * 1.6 + bi) * 0.02; }
        trains.forEach(function (tr) { if (riding && riding.tr === tr) return; tr.s += tr.dir * SPEED * dt / tr.r; placeTrain(tr); });
        if (riding) {
          var rd = riding; rd.t += dt; var k = Math.min(1, rd.t / rd.dur), e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          rd.tr.s = rd.a0 + rd.da * e2; placeTrain(rd.tr);
          var lead = rd.tr.cars[0].position, ah = rd.tr.s + (rd.da >= 0 ? 0.08 : -0.08);
          window.__probeCam = { pos: [lead.x * 1.04, lead.y + 5 * PM, lead.z * 1.04], look: [Math.cos(ah) * R, DECK_Y, Math.sin(ah) * R] };
          if (k >= 1) { var P = window.__w3dDebug.playerPos; P.x = rd.dest.x; P.z = rd.dest.z; window.__probeCam = null; riding = null; if (window.__toast) window.__toast('🚉 Arrived: ' + rd.dest.name); }
        }
      },
    };
    window.__worldTransit = api;
    return api;
  };
})();
