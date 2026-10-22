/* world-edge-realms.js — the EDGE REALMS beyond the island rim (2026-10-23, owner: "the edge of the realms is blocked off but we can
 * make it visually stunning and a sky realm later on ... edge realms (not on map) not accessible ... after you get really close you
 * can only go by foot and have certain cosmetics that aren't out yet").
 *
 *   window.WorldEdgeRealms.build({ THREE, GLTFLoader, scene, heightAt, getPlayer, isOnFoot, meta }) -> Promise<api>
 *
 * Art: Blender kit K31 (Shaddai/public/assets/kits/_src/k31_edge_realms.py, headless export tools/k31_export_bg.py):
 *   shaddai_edge_{harbor,arch,veil,rise}_v01.glb — origin = causeway head on the rim, realm extends outward (GLB -z)
 *   shaddai_edge_cloudsea_v01.glb — cloud ring 4.8-8.6 km at cloud_sea_m + the world-edge monolith curtain
 * NOT on the map (nothing is registered with WORLD_LAYOUT / minimap). The rim clamp in SHADDAI-WORLD-3D.html stays closed.
 * GATE: within GATE_M of a causeway head the player gets the rule: foot only, and the bearer of the realm's cosmetic
 * (skyward-pilgrim-veil — not released, not in any catalog) may pass. Crossing itself is NOT built yet: when the cosmetic ships
 * the server must own the check (client inventory is localStorage) and the rim clamp + ground height need a causeway exception.
 * Perf: each GLB = one mesh per material (2-3 draws per realm, ~1 for the cloud sea). ?edgerealms=0 = off.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, BASE = '/assets/kits/', V = '?v=20261023a', GATE_M = 60;
  // compass degrees (clockwise from north = -z) — each sits beyond the realm whose palette it echoes
  var REALMS = [
    { id: 'harbor', deg: 228, label: 'Cloud Harbor' },     // beyond OCEAN
    { id: 'arch', deg: 330, label: 'Ascension Arch' },     // beyond ARCTIC
    { id: 'veil', deg: 32, label: 'Scripture Veil' },      // beyond DESERT
    { id: 'rise', deg: 147, label: 'Ringworld Rise' }      // beyond MEADOW
  ];
  function glyphTexture(THREE) {   // light-script for the Scripture Veil ribbons (procedural strokes; no font, no file)
    var c = document.createElement('canvas'); c.width = 256; c.height = 512; var g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512); g.strokeStyle = '#ffd9a0'; g.lineCap = 'round';
    var seed = 7; function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var col = 0; col < 6; col++) for (var row = 0; row < 18; row++) {
      var x = 22 + col * 40, y = 14 + row * 28; g.lineWidth = 1.5 + r() * 1.5; g.globalAlpha = 0.55 + r() * 0.45;
      for (var s = 0, n = 2 + (r() * 4 | 0); s < n; s++) { g.beginPath(); g.moveTo(x + r() * 18 - 9, y + r() * 18 - 9); g.quadraticCurveTo(x + r() * 24 - 12, y + r() * 24 - 12, x + r() * 18 - 9, y + r() * 18 - 9); g.stroke(); }
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]edgerealms=0/.test(location.search || '')) return Promise.resolve(null);
    var THREE = o.THREE, meta = o.meta || {}, rim = (+meta.rim_m || 4800) * U, seaY = (meta.cloud_sea_m != null ? +meta.cloud_sea_m : -160) * U;
    var loader = new o.GLTFLoader(), group = new THREE.Group(); group.name = 'edge-realms'; o.scene.add(group);
    var heads = [], anim = [], lastMsg = 0, stats = { loaded: 0, failed: 0 };
    function load(file) { return new Promise(function (res) { loader.load(BASE + file + V, function (g) { stats.loaded++; res(g.scene); }, null, function (e) { stats.failed++; console.warn('[edge-realms]', file, e && e.message); res(null); }); }); }
    function dress(obj) {
      obj.traverse(function (m) {
        if (!m.isMesh || !m.material) return; var n = m.material.name || '';
        m.matrixAutoUpdate = false; m.updateMatrix();
        if (n === 'edge_veil') { m.material = new THREE.MeshBasicMaterial({ color: m.material.emissive || 0x9fe4ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); anim.push({ kind: 'veil', mat: m.material }); }
        else if (n === 'edge_script') { var t = glyphTexture(THREE); t.repeat.set(1, 1); m.material = new THREE.MeshBasicMaterial({ map: t, color: 0xffb347, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); anim.push({ kind: 'script', tex: t }); }
      });
    }
    var jobs = REALMS.map(function (R) {
      return load('shaddai_edge_' + R.id + '_v01.glb').then(function (s) {
        if (!s) return; var a = R.deg * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a), r0 = rim - 3 * U;
        var hx = dx * r0, hz = dz * r0, hy = Math.max(0, o.heightAt ? o.heightAt(dx * (rim - 15 * U), dz * (rim - 15 * U)) : 0);
        s.scale.setScalar(U); s.position.set(hx, hy, hz); s.rotation.y = -a; dress(s); group.add(s); s.updateMatrixWorld(true);
        heads.push({ id: R.id, label: R.label, x: hx, z: hz, y: hy, cosmetic: (s.children[0] && s.children[0].userData && s.children[0].userData.cosmetic) || 'skyward-pilgrim-veil' });
        if (R.id === 'rise') ringCars(s, hx, hz);
      });
    });
    // THE SKYWARD PORTAL over the Grid (owner: "above the platform in the shaddai grid and floating with a big portal but it's closed"):
    // stair foot on the Sky Nexus deck (opposite SHADDAI's temple island, which floats off -Z), island + 22 m ring floating out past
    // the deck rail. Same sealed gate as the rim realms. o.portalAnchor() -> {x, y, z, yaw} overrides the default spot.
    jobs.push(load('shaddai_edge_portal_v01.glb').then(function (s) {
      if (!s) return; var A = (o.portalAnchor && o.portalAnchor()) || { x: 0, y: 200, z: 118, yaw: Math.PI };
      s.scale.setScalar(U); s.position.set(A.x, A.y, A.z); s.rotation.y = A.yaw; dress(s); group.add(s); s.updateMatrixWorld(true);
      heads.push({ id: 'portal', label: 'The Skyward Portal', x: A.x, z: A.z, y: A.y, cosmetic: 'skyward-pilgrim-veil', minY: A.y - 20 });
    }));
    jobs.push(load('shaddai_edge_cloudsea_v01.glb').then(function (s) { if (!s) return; s.scale.setScalar(U); s.position.set(0, seaY, 0); dress(s); group.add(s); s.updateMatrixWorld(true); }));
    // RING CARS (owner: "a road in the middle of the ring arch buildings that you can [ride] via ring car"): pods on the crest road of
    // the Ringworld Rise arch, two lanes in opposite directions. The road + arc come from K31 extras (ring_r/cy/cz/th, Blender metres);
    // Blender (x,y,z) -> glTF local (x, z, -y). Ambient for now — boarding opens with the sky-realm release (same gate as the rim).
    var cars = [], carNear = null;
    function ringCars(s, hx, hz) {
      var root_ = null, proto = null; s.traverse(function (n) { if (n.userData && n.userData.ring_r) root_ = n; if (/^ring_car/.test(n.name)) proto = n; });
      if (!root_ || !proto) return; proto.visible = false;
      var D = root_.userData, Rc = D.ring_r + D.ring_th + 0.6;
      for (var lane = 0; lane < 2; lane++) for (var k = 0; k < 9; k++) {
        var c = proto.clone(); c.visible = true; c.matrixAutoUpdate = true; c.rotation.order = 'ZYX'; root_.add(c);
        cars.push({ o: c, t: k / 9 * Math.PI, dir: lane ? -1 : 1, s: lane ? -8 : 8 });
      }
      carNear = { x: hx, z: hz, Rc: Rc, cy: D.ring_cy, cz: D.ring_cz };
    }
    function tickCars(dt) {
      if (!cars.length) return; var p = o.getPlayer && o.getPlayer(); if (p && Math.hypot(p.x - carNear.x, p.z - carNear.z) > 5200 * U / 1.0) return;
      for (var i = 0; i < cars.length; i++) {
        var C = cars[i]; C.t += C.dir * 0.032 * dt; if (C.t > Math.PI) C.t -= Math.PI; if (C.t < 0) C.t += Math.PI;
        var t = C.t; C.o.position.set(carNear.Rc * Math.cos(t), carNear.cz + carNear.Rc * Math.sin(t), -(carNear.cy + C.s));
        C.o.rotation.set(0, C.dir < 0 ? Math.PI : 0, t - Math.PI / 2);
      }
    }
    function owns(id) {   // client view only — the real check must be server-side when the cosmetic ships
      try { var G = root.WorldGear, st = G && G.state && G.state(); return !!(st && st.owned && st.owned[id]); } catch (e) { return false; }
    }
    function near() {
      var p = o.getPlayer && o.getPlayer(); if (!p) return null;
      for (var i = 0; i < heads.length; i++) { var h = heads[i]; if (h.minY != null && !(p.y > h.minY)) continue; if (Math.hypot(p.x - h.x, p.z - h.z) < (h.id === 'portal' ? 25 : GATE_M) * U) return h; }
      return null;
    }
    function check() {   // what the gate says right now (also used by tests)
      var h = near(); if (!h) return null;
      var foot = !o.isOnFoot || o.isOnFoot();
      if (!foot) return { realm: h.id, open: false, msg: h.label + ' — past the rim you go by foot only. Dismount to approach the veil.' };
      if (!owns(h.cosmetic)) return { realm: h.id, open: false, msg: h.label + ' — sealed. The veil opens for bearers of the Skyward Pilgrim Veil (not yet released).' };
      return { realm: h.id, open: true, msg: h.label + ' — the veil knows you. (Crossing opens with the sky-realm release.)' };
    }
    var lastT = 0;
    function tick(t) {
      var dt = lastT ? Math.min(0.1, t - lastT) : 0; lastT = t; tickCars(dt);
      for (var i = 0; i < anim.length; i++) { var A = anim[i]; if (A.kind === 'veil') A.mat.opacity = 0.26 + 0.12 * Math.sin(t * 1.7 + i); else A.tex.offset.y = -t * 0.035; }
      var c = check(), now = Date.now();
      if (c && now - lastMsg > 9000 && root.__toast) { root.__toast(c.msg); lastMsg = now; }
    }
    return Promise.all(jobs).then(function () {
      var api = { group: group, heads: heads, cars: cars, check: check, tick: tick, owns: owns, stats: function () { return { realms: heads.length, loaded: stats.loaded, failed: stats.failed }; } };
      root.__edgeRealms = api; return api;
    });
  }
  root.WorldEdgeRealms = { build: build, REALMS: REALMS };
})(typeof window !== 'undefined' ? window : this);
