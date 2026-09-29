/* world-colosseum-metro.js — Colosseum UNDERGROUND STATION (plan phase 5), connects the arena to the maglev ring.
 *
 *   ColosseumMetro.attach(THREE, arena)   (called by world-colosseum.js once the arena api exists)
 *   Layout (arena-local metres): a 100 x 24 m platform hall EAST of the lobby (arena.metro = { x0,x1,z0,z1, lobbyPad, metroPad, platform }).
 *   Only the near platform strip is walkable (arena.hLocal returns 0 there; the track trench is solid = 999), so collision needs no new system.
 *   ELEVATOR: lobby pad <-> platform pad, press E within 3 m (fade, no loading).
 *   TRAIN: registers window.__worldTransitApi.addStation({ id:'colosseum', underground:true, ... }) once the ring exists AND the station is unlocked
 *          (same rule as the dashboard Ring Train widget: localStorage shd_dist_visited >= 3 OR you own a room). Arriving by train drops you on the platform
 *          inside the arena (interiors.enter('COLOSSEUM') then place on the platform). Board = walk to the platform edge and use the ring train as usual.
 *   The arrival board shows ACTIVE / LOCKED live. Everything is code-built, tiny, and only ticks while the arena is visible.
 */
(function () {
  'use strict';
  function unlocked() {
    try {
      var v = Number(localStorage.getItem('shd_dist_visited') || 0), uid = localStorage.getItem('shd_uid') || '';
      var city = JSON.parse(localStorage.getItem('shaddai.city') || '[]');
      var has = city.some(function (p) { return p.rooms && p.rooms.some(function (r) { return r.owner === uid; }); });
      return v >= 3 || has || /[?&]metro=1/.test(location.search);
    } catch (e) { return /[?&]metro=1/.test(location.search); }
  }
  function attach(THREE, arena) {
    var M = arena.metro, root = arena.root, U = arena.dims.U, X0 = arena.origin.x - 0, Z0 = 0;
    // arena.origin.x == X0 (island x); local metres -> world: x = X0 + lx*U, z = Z0 + lz*U
    var g = new THREE.Group(); g.name = 'colosseum-metro'; root.add(g);
    var W = M.x1 - M.x0, D = M.z1 - M.z0, H = 8;
    function mat(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.2 }, o || {})); }
    var mTile = mat(0x2a2f38, { emissive: 0x141a22, emissiveIntensity: 1 }), mWall = mat(0x2b3860, { emissive: 0x17224a, emissiveIntensity: 0.9 }), mTrim = mat(0x00d4ff, { emissive: 0x00d4ff, emissiveIntensity: 1.4 }), mGold = mat(0xe8c45c, { emissive: 0xe8c45c, emissiveIntensity: 0.5 }),
      mRail = mat(0x9aa3ad, { metalness: 0.9, roughness: 0.3 }), mCar = mat(0xdfe6ee, { metalness: 0.6, roughness: 0.35 }), mWin = mat(0x0a1a22, { emissive: 0x66f0ff, emissiveIntensity: 0.7 }),
      mLight = mat(0xffffff, { emissive: 0xfff3d0, emissiveIntensity: 1.2 }), mDark = mat(0x07090c), mGlass = mat(0x0f2a30, { emissive: 0x00d4ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 });
    function box(w, h, d, m, x, y, z) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; }
    var cx = (M.x0 + M.x1) / 2, cz = (M.z0 + M.z1) / 2, pz1 = M.z0 + M.platform;
    // floor (platform tiles) + trench + ceiling + walls
    var tc = document.createElement('canvas'); tc.width = tc.height = 256; var t = tc.getContext('2d'); t.fillStyle = '#2a2f38'; t.fillRect(0, 0, 256, 256); t.strokeStyle = '#3b4250'; t.lineWidth = 3; t.strokeRect(0, 0, 256, 256); t.strokeStyle = '#e8c45c'; t.lineWidth = 6; t.beginPath(); t.moveTo(0, 246); t.lineTo(256, 246); t.stroke();
    var tex = new THREE.CanvasTexture(tc); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 4, M.platform / 4); tex.colorSpace = THREE.SRGBColorSpace;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, M.platform), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.25, emissive: 0x2a3140, emissiveMap: tex, emissiveIntensity: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, M.z0 + M.platform / 2); g.add(floor);
    box(W, 0.2, D - M.platform, mDark, cx, -1.1, pz1 + (D - M.platform) / 2);                            // trench bed
    box(W, 0.3, D, mWall, cx, H + 0.15, cz);                                                             // ceiling
    box(W + 1.6, 0.6, 0.6, mGold, cx, H + 0.6, M.z0 - 0.8); box(W + 1.6, 0.6, 0.6, mGold, cx, H + 0.6, M.z1 + 0.8); box(0.6, 0.6, D + 1.6, mGold, M.x0 - 0.8, H + 0.6, cz); box(0.6, 0.6, D + 1.6, mGold, M.x1 + 0.8, H + 0.6, cz); box(W + 1.2, 0.25, 0.3, mTrim, cx, H + 1.05, M.z0 - 0.6); box(W + 1.2, 0.25, 0.3, mTrim, cx, H + 1.05, M.z1 + 0.6); box(0.3, 0.25, D + 1.2, mTrim, M.x0 - 0.6, H + 1.05, cz); box(0.3, 0.25, D + 1.2, mTrim, M.x1 + 0.6, H + 1.05, cz);   // gold cornice + cyan cap: reads as a building, not a black box
    box(W, H, 0.6, mWall, cx, H / 2, M.z0 - 0.3); box(W, H, 0.6, mWall, cx, H / 2, M.z1 + 0.3);         // long walls
    box(0.6, H, D, mWall, M.x0 - 0.3, H / 2, cz); box(0.6, H, D, mWall, M.x1 + 0.3, H / 2, cz);          // end walls
    box(W, 0.3, 0.3, mGold, cx, 0.02, pz1 - 0.3); box(W, 0.12, 0.4, mTrim, cx, H - 0.1, M.z0 + 0.4);   // platform edge strip + cyan cove
    for (var x = M.x0 + 6; x < M.x1 - 4; x += 8) box(3.2, 0.12, 1.0, mLight, x, H - 0.05, pz1 - 4);   // ceiling light strips
    for (var p = M.x0 + 12; p < M.x1 - 6; p += 14) box(1.0, H, 1.0, mWall, p, H / 2, pz1 + 3.6);         // pillars in the trench zone
    [pz1 + 2.2, pz1 + 5.0].forEach(function (rz) { box(W, 0.14, 0.14, mRail, cx, -0.6, rz); box(W, 0.5, 0.5, mTrim, cx, -0.9, rz); });   // rails + glow guide
    // parked maglev (3 cars) on the track, doors toward the platform
    for (var c = 0; c < 3; c++) { var carx = M.x0 + 40 + c * 19; box(18, 3.4, 3.8, mCar, carx, 1.2, pz1 + 3.7); box(15, 1.1, 0.06, mWin, carx, 2.0, pz1 + 1.78); box(2.4, 2.6, 0.08, mGlass, carx, 1.3, pz1 + 1.76); }
    // benches
    for (var b = 0; b < 6; b++) box(2.4, 0.5, 0.7, mTile, M.x0 + 18 + b * 13, 0.3, M.z0 + 1.2);
    // name board + arrival board (canvas textures)
    function boardTex(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; var tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return { c: c, x: c.getContext('2d'), tex: tx }; }
    var name = boardTex(1024, 160); name.x.fillStyle = '#070b12'; name.x.fillRect(0, 0, 1024, 160); name.x.strokeStyle = '#e8c45c'; name.x.lineWidth = 6; name.x.strokeRect(6, 6, 1012, 148);
    name.x.fillStyle = '#e8c45c'; name.x.font = '700 76px Georgia, serif'; name.x.textAlign = 'center'; name.x.textBaseline = 'middle'; name.x.fillText('COLOSSEUM  UNDERGROUND', 512, 84); name.tex.needsUpdate = true;
    var nb = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.4), new THREE.MeshBasicMaterial({ map: name.tex })); nb.position.set(cx, 5.2, M.z0 + 0.05); g.add(nb);
    var ab = boardTex(768, 256), abMesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshBasicMaterial({ map: ab.tex })); abMesh.position.set(M.x0 + 34, 5.6, M.z0 + 0.06); g.add(abMesh);
    var abLast = '';
    function drawBoard() {
      var on = unlocked(), sec = Math.floor(Date.now() / 1000) % 90, eta = sec < 78 ? 78 - sec : 0, msg = on ? (eta > 0 ? 'NEXT RING TRAIN  ' + eta + 's' : 'NOW BOARDING') : 'LINE LOCKED  ·  visit 3 districts or own a room';
      var key = on + '|' + msg; if (key === abLast) return; abLast = key; var x = ab.x;
      x.fillStyle = '#05080e'; x.fillRect(0, 0, 768, 256); x.strokeStyle = on ? '#00d4ff' : '#ff5a6e'; x.lineWidth = 8; x.strokeRect(6, 6, 756, 244);
      x.fillStyle = on ? '#00d4ff' : '#ff5a6e'; x.font = '700 44px monospace'; x.textAlign = 'center'; x.fillText(on ? 'RING LINE · ACTIVE' : 'RING LINE · LOCKED', 384, 80);
      x.fillStyle = '#e8f6ff'; x.font = '600 34px monospace'; x.fillText(msg, 384, 170); ab.tex.needsUpdate = true;
    }
    // elevator cabs (lobby side + platform side): glass box, glowing ring pad, "METRO" sign
    function elevator(px, pz, faceX, label) {
      var cab = new THREE.Group(); cab.position.set(px, 0, pz); g.add(cab);
      var m = function (w, h, d, mt, x, y, z) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(x, y, z); cab.add(b); };
      m(3.4, 0.2, 3.4, mGold, 0, 0.1, 0); m(3.4, 0.2, 3.4, mWall, 0, 3.7, 0); m(0.15, 3.6, 3.4, mGlass, -faceX * 1.7, 1.9, 0); m(3.4, 3.6, 0.15, mGlass, 0, 1.9, -1.7); m(3.4, 3.6, 0.15, mGlass, 0, 1.9, 1.7);
      var ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; cab.add(ring);
      var lt = boardTex(512, 128); lt.x.fillStyle = '#05080e'; lt.x.fillRect(0, 0, 512, 128); lt.x.fillStyle = '#00d4ff'; lt.x.font = '700 60px monospace'; lt.x.textAlign = 'center'; lt.x.textBaseline = 'middle'; lt.x.fillText(label, 256, 68); lt.tex.needsUpdate = true;
      var sg = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: lt.tex })); sg.position.set(-faceX * 1.6, 4.4, 0); sg.rotation.y = faceX > 0 ? -Math.PI / 2 : Math.PI / 2; cab.add(sg);
    }
    elevator(M.lobbyPad[0], M.lobbyPad[1], 1, '▼ METRO');
    elevator(M.metroPad[0], M.metroPad[1], -1, '▲ COLOSSEUM');

    /* ── interaction: E at either pad teleports to the other (fade) ── */
    var fade = document.createElement('div'); fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:8400;transition:opacity .22s'; document.body.appendChild(fade);
    function pp() { return window.__w3dDebug && window.__w3dDebug.playerPos; }
    function local() { var p = pp(); return p ? [(p.x - X0) / U, (p.z - Z0) / U] : null; }
    function near(pad, r) { var l = local(); return !!l && Math.hypot(l[0] - pad[0], l[1] - pad[1]) < (r || 3.2); }
    function place(lx, lz) { var p = pp(); if (!p) return; p.x = X0 + lx * U; p.z = Z0 + lz * U; }
    function useElevator() {
      var to = near(M.lobbyPad) ? [M.metroPad[0] + 3.2, M.metroPad[1]] : (near(M.metroPad) ? [M.lobbyPad[0] - 3.4, M.lobbyPad[1]] : null); if (!to) return false;
      fade.style.opacity = '1'; setTimeout(function () { place(to[0], to[1]); setTimeout(function () { fade.style.opacity = '0'; }, 120); }, 240); return true;
    }
    addEventListener('keydown', function (e) { if (e.code === 'KeyE' && !e.repeat && arena.group.visible && useElevator()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    var hintT = 0;
    function tick(dt) {
      if (!arena.group.visible) return; drawBoard();
      hintT -= dt; if (hintT <= 0 && (near(M.lobbyPad) || near(M.metroPad))) { hintT = 3; if (window.__toast) window.__toast('[E] Elevator ' + (near(M.lobbyPad) ? '▼ to the metro platform' : '▲ back to the Colosseum')); }
    }

    var registered = false;   // registration is done at load by bootRegister() (below) so the stop exists BEFORE the arena is first built
    arena.metroApi = { tick: tick, unlocked: unlocked, isRegistered: function () { return bootState.registered; }, useElevator: useElevator, group: g, tryRegister: bootTry };
    return arena.metroApi;
  }
  /* ── train stop: registered at load (does not need the arena built). Arriving by train enters the arena room and stands you on the platform. ── */
  var bootState = { registered: false };
  function bootTry() {
    var T = window.__worldTransitApi, M = window.COLOSSEUM_METRO, I = window.COLOSSEUM_ISLAND; if (!T || !T.addStation || !M || !I) return false;
    var pl = [(M.x0 + M.x1) / 2, M.z0 + M.platform - 3];
    if (unlocked() && !bootState.registered) {
      T.addStation({ id: 'colosseum', name: 'Colosseum Underground', x: I.x + pl[0] * I.U, z: I.z + pl[1] * I.U, y: 0, underground: true,
        onArrive: function () {
          var V = window.__w3dDebug && window.__w3dDebug.interiors; if (!V) return;
          if (!V.isInside()) { try { V.enter('COLOSSEUM'); } catch (e) { return; } }
          var n = 0, iv = setInterval(function () { if (V.isInside() || ++n > 60) { clearInterval(iv); var p = window.__w3dDebug.playerPos; if (V.isInside() && p) { p.x = I.x + pl[0] * I.U; p.z = I.z + pl[1] * I.U; } } }, 150);
        } });
      bootState.registered = true;
    } else if (!unlocked() && bootState.registered && T.removeStation) { T.removeStation('colosseum'); bootState.registered = false; }
    return true;
  }
  setInterval(bootTry, 3000);
  window.ColosseumMetro = { attach: attach, unlocked: unlocked, bootTry: bootTry, state: bootState };
})();
