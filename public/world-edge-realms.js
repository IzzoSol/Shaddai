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
  var U = 7 / 1.8, BASE = '/assets/kits/', V = '?v=20261023x', GATE_M = 60;
  // compass degrees (clockwise from north = -z) — each sits beyond the realm whose palette it echoes
  var REALMS = [
    // 2026-10-23 owner layout: the SKY CLUSTER off the east rim over the Suburb city - Sky City hangs off the edge above it, the single
    // floating island (Veil) beyond it, Ringworld Rise (the half-circle city) further out, Cloud Harbor floating underneath; sky bridges
    // join them (see bridges below). r = metres from the world centre (head of the realm's causeway), z = metres above the rim ground.
    // 2026-10-23 owner re-layout (TURTLE): ONE AXIS at compass 97 - Star City on the land, Cloud Harbor just past the island's edge (r 5060 m, deck +40 m - at 4830 m its hanging rocks sat in the rim terrain) bridged to
    // it, Aurelia Sky City behind the harbor (deck +100 m, ramp up from the harbor), Scripture Veil (north) and Ringworld Rise (south) flanking
    // the Sky City at the same deck height with 150 m gaps. All share yaw 97 so the cluster reads as one composition. y = absolute metres.
    { id: 'harbor', deg: 97, r: 5060, y: 40, yaw: 97, label: 'Cloud Harbor' },
    { id: 'skycity', deg: 97, r: 6400, y: 100, yaw: 97, label: 'Aurelia Sky City' },
    { id: 'veil', deg: 90.36, r: 6443, y: 100, yaw: 97, label: 'Scripture Veil' },
    { id: 'rise', deg: 108.02, r: 6520, y: 100, yaw: 97, label: 'Ringworld Rise' },
    { id: 'arch', deg: 335.6, r: 4040, y: 756, yaw: 330, label: 'Ascension Arch' }   // owner placed it in Blender 2026-10-23: floating over the north-west mountains
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
    var heads = [], anim = [], lastMsg = 0, stats = { loaded: 0, failed: 0 }, anchors = {};
    // SKY BRIDGES: arched glowing decks between realm anchor points (Blender-local metres of each GLB -> world). One mesh per material.
    function wp(id, bx, by, bz) { var A2 = anchors[id]; if (!A2) return null; var v = new THREE.Vector3(bx, bz, -by); A2.s.localToWorld(v); return v; }
    function bridges() {
      // [from, bx, by, bz, to, bx, by, bz, widthM] in each GLB's Blender-local metres (+x = south, +y = outward). TURTLE: axial 30 m, side 20 m.
      var L = [['star', 0, 340, 18, 'harbor', 0, 8, 0, 30], ['harbor', 0, 1110, 0, 'skycity', 0, 8, 0, 30],
               ['skycity', -322, 480, 0, 'veil', 255, 400, 0, 20], ['skycity', 322, 480, 0, 'rise', -755, 520, 0, 20]];
      var deck = [], rail = [], blamps = [], under = [];
      L.forEach(function (b) {
        var p0 = wp(b[0], b[1], b[2], b[3]), p1 = wp(b[4], b[5], b[6], b[7]); if (!p0 || !p1) return;
        var d = new THREE.Vector3().subVectors(p1, p0), len = d.length(), side = new THREE.Vector3(-d.z, 0, d.x).normalize(), N = 40, W = (b[8] || 10) / 2 * U, arch = Math.min(25 * U, len * 0.06);
        for (var i = 0; i < N; i++) {
          var t0 = i / N, t1 = (i + 1) / N, a0 = p0.clone().lerp(p1, t0), a1 = p0.clone().lerp(p1, t1); a0.y += Math.sin(Math.PI * t0) * arch; a1.y += Math.sin(Math.PI * t1) * arch;
          var l0 = a0.clone().addScaledVector(side, -W), r0 = a0.clone().addScaledVector(side, W), l1 = a1.clone().addScaledVector(side, -W), r1 = a1.clone().addScaledVector(side, W);
          deck.push(l0, r0, r1, l0, r1, l1, l0, r1, r0, l0, l1, r1);
          if (i % 5 === 0) { blamps.push(l0.clone(), r0.clone()); }
          var u0 = a0.clone().setY(a0.y - 1.2 * U), u1 = a1.clone().setY(a1.y - 1.2 * U), uw = W * 0.35; under.push(u0.clone().addScaledVector(side, -uw), u1.clone().addScaledVector(side, -uw), u1.clone().addScaledVector(side, uw), u0.clone().addScaledVector(side, -uw), u1.clone().addScaledVector(side, uw), u0.clone().addScaledVector(side, uw));
          [[l0, l1], [r0, r1]].forEach(function (e) { var u0 = e[0].clone(), u1 = e[1].clone(), h = 1.1 * U; rail.push(u0, u1, u1.clone().setY(u1.y + h), u0, u1.clone().setY(u1.y + h), u0.clone().setY(u0.y + h)); rail.push(u0, u1.clone().setY(u1.y + h), u1, u0, u0.clone().setY(u0.y + h), u1.clone().setY(u1.y + h)); });
        }
      });
      function mesh(pts, mat) { var g = new THREE.BufferGeometry().setFromPoints(pts); g.computeVertexNormals(); var m2 = new THREE.Mesh(g, mat); m2.name = 'sky-bridges'; group.add(m2); return m2; }
      if (deck.length) mesh(deck, new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
      if (rail.length) {   // TURTLE: edge light shifts from soft amber low to cool teal at altitude
        var rm = mesh(rail, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false })), pa = rm.geometry.attributes.position, ca = new Float32Array(pa.count * 3);
        var lo = new THREE.Color(0xffb347), hi = new THREE.Color(0x5fffe0), cc = new THREE.Color(), y0 = -40 * U, y1 = 120 * U;
        for (var i = 0; i < pa.count; i++) { cc.copy(lo).lerp(hi, Math.max(0, Math.min(1, (pa.getY(i) - y0) / (y1 - y0)))); ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b; }
        rm.geometry.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      }
      if (under.length) mesh(under, new THREE.MeshBasicMaterial({ color: 0x5fffe0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false }));   /* underside glow strip */
      if (blamps.length) {   // bridge light posts (both rails): white post + warm cap
        var pg = new THREE.CylinderGeometry(0.12 * U, 0.18 * U, 5 * U, 6); pg.translate(0, 2.5 * U, 0); var cg = new THREE.SphereGeometry(0.5 * U, 10, 8); cg.translate(0, 5.2 * U, 0);
        var pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.4, metalness: 0.3 }), blamps.length), cm = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), blamps.length), bm4 = new THREE.Matrix4();
        blamps.forEach(function (v, k) { bm4.makeTranslation(v.x, v.y, v.z); pm.setMatrixAt(k, bm4); cm.setMatrixAt(k, bm4); });
        [pm, cm].forEach(function (m) { m.name = 'sky-bridge-lamps'; m.computeBoundingSphere(); group.add(m); });
      }
      stats.bridges = L.length;
    }
    function load(file) { return new Promise(function (res) { loader.load(BASE + file + V, function (g) { stats.loaded++; res(g.scene); }, null, function (e) { stats.failed++; console.warn('[edge-realms]', file, e && e.message); res(null); }); }); }
    function dress(obj) {
      obj.traverse(function (m) {
        if (!m.isMesh || !m.material) return; var n = m.material.name || '';
        m.matrixAutoUpdate = false; m.updateMatrix();
        if (n === 'edge_veil') { m.material = new THREE.MeshBasicMaterial({ color: m.material.emissive || 0x9fe4ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); anim.push({ kind: 'veil', mat: m.material }); }
        else if (n === 'edge_water') { m.material = new THREE.MeshStandardMaterial({ color: 0x0aa585, emissive: 0x0a5a4a, emissiveIntensity: 0.6, metalness: 0.35, roughness: 0.08, transparent: true, opacity: 0.86, side: THREE.DoubleSide }); anim.push({ kind: 'water', mat: m.material }); }   // emerald, glinting (owner water ref)
        else if (n === 'edge_script') { var t = glyphTexture(THREE); t.repeat.set(1, 1); m.material = new THREE.MeshBasicMaterial({ map: t, color: 0xffb347, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); anim.push({ kind: 'script', tex: t }); }
      });
    }
    var jobs = REALMS.map(function (R) {
      return load('shaddai_edge_' + R.id + '_v01.glb').then(function (s) {
        if (!s) return; var a = R.deg * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a), r0 = R.r ? R.r * U : rim - 3 * U;
        var hx = dx * r0, hz = dz * r0, hy = R.y != null ? R.y * U : Math.max(0, o.heightAt ? o.heightAt(dx * (rim - 15 * U), dz * (rim - 15 * U)) : 0) + (R.z || 0) * U;   // y = absolute metres (owner-placed)
        s.scale.setScalar(U); s.position.set(hx, hy, hz); s.rotation.y = -(R.yaw != null ? R.yaw * Math.PI / 180 : a); dress(s); group.add(s); s.updateMatrixWorld(true);
        heads.push({ id: R.id, label: R.label, x: hx, z: hz, y: hy, cosmetic: (s.children[0] && s.children[0].userData && s.children[0].userData.cosmetic) || 'skyward-pilgrim-veil' });
        if (R.id === 'rise') ringCars(s, hx, hz);
        anchors[R.id] = { s: s };
      });
    });
    // THE SKYWARD PORTAL over the Grid (owner: "above the platform in the shaddai grid and floating with a big portal but it's closed"):
    // stair foot on the Sky Nexus deck (opposite SHADDAI's temple island, which floats off -Z), island + 22 m ring floating out past
    // the deck rail. Same sealed gate as the rim realms. o.portalAnchor() -> {x, y, z, yaw} overrides the default spot.
    // SUBURB STAR CITY (K35, owner 2026-10-23 + TURTLE direction): the hexagram terrace city on the Suburb rim directly under the sky city,
    // lift towers + braided ladders up to it. Compass 97, 4330 m out, sat on the highest ground of its footprint (terrace skirts reach 30 m down).
    jobs.push(load('shaddai_suburb_star_v01.glb').then(function (s) {
      if (!s) return; var a = 97 * Math.PI / 180, cx = Math.sin(a) * 4330 * U, cz = -Math.cos(a) * 4330 * U, g = -Infinity;
      for (var rr = 0; rr <= 480; rr += 160) for (var k = 0; k < 12; k++) { var t = k * Math.PI / 6; if (o.heightAt) g = Math.max(g, o.heightAt(cx + Math.cos(t) * rr * U, cz + Math.sin(t) * rr * U)); }
      if (!isFinite(g)) g = 0;
      s.scale.setScalar(U * 1.25); s.position.set(cx, g - 20 * U, cz); s.rotation.y = -a; dress(s); group.add(s); s.updateMatrixWorld(true); stats.starCity = true; anchors.star = { s: s };
    }));
    // ARCTIC PEAK CITY (K36, owner 2026-10-23): ice towers on four arctic summits joined by glass ice-bridges in a loop, a skyway from the summit
    // tower to the Ascension Arch and a walkway down to an ice dock on the arctic river. The GLB is in WORLD metres (placed at the origin).
    // Boats from the dock need thermal gear (same sealed-gate check as the sky realms; the real ownership check must move server-side).
    jobs.push(load('shaddai_arctic_peaks_v01.glb').then(function (s) {
      if (!s) return; s.scale.setScalar(U); dress(s); group.add(s); s.updateMatrixWorld(true); stats.arcticPeaks = true;
      var DK = [-1572.2, 2912.3, 4.5]; heads.push({ id: 'icedock', label: 'Ice Dock - boats need thermal gear', x: DK[0] * U, z: -DK[1] * U, y: DK[2] * U, cosmetic: 'arctic-thermal-suit' });
    }));
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
      for (var i = 0; i < anim.length; i++) { var A = anim[i]; if (A.kind === 'veil') A.mat.opacity = 0.26 + 0.12 * Math.sin(t * 1.7 + i); else if (A.kind === 'water') A.mat.emissiveIntensity = 0.5 + 0.25 * Math.sin(t * 3.1 + i); else A.tex.offset.y = -t * 0.035; }
      var c = check(), now = Date.now();
      if (c && now - lastMsg > 9000 && root.__toast) { root.__toast(c.msg); lastMsg = now; }
    }
    return Promise.all(jobs).then(function () {
      try { bridges(); } catch (e) { console.warn('[edge-realms] bridges', e && e.message); }
      var api = { group: group, heads: heads, cars: cars, check: check, tick: tick, owns: owns, stats: function () { return { realms: heads.length, loaded: stats.loaded, failed: stats.failed, bridges: stats.bridges || 0 }; } };
      root.__edgeRealms = api; return api;
    });
  }
  root.WorldEdgeRealms = { build: build, REALMS: REALMS };
})(typeof window !== 'undefined' ? window : this);
