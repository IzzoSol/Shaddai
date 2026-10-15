/* world-race-kit.js — dresses a built race circuit (world-race-track.js) with the Blender race kits (K6 + K6b), 2026-10-15.
 *
 *   WorldRaceKit.dress({ THREE, GLTFLoader, track, U, getPlayer, groundAt?, base? }) → Promise<{ group, lift, stats }>
 *
 * In place of the code pieces (same positions, read back from the track's own InstancedMeshes):
 *   track-pylons -> foot + unit shaft (stretched to the deck) + fork head · track-gantries -> race_gantry
 *   track-sector-gates -> race_checkpoint (hex arch) · track-boost pads -> a race_boost_ring floating over each pad
 *   track-gate-towers -> race_gate_tower (fitted to the code span/height) · a race_holo_billboard on the ground beside each checkpoint
 * Added: race_start_gate (5 start lights) on the start line, a grandstand + pit garages beside the start at ground level,
 * and a glass START ELEVATOR from the ground up to the deck (E at either end; owner 2026-10-15 "an elevator to the start").
 * Kit frame == the track's frame basis (x = side S, y = deck normal N, z = travel T), metres -> scale U.
 * Missing GLB = the code pieces stay. ?racekit=0 = off.
 */
(function (root) {
  'use strict';
  var BASE = '/assets/kits/';
  function load(loader, url) { return new Promise(function (res) { loader.load(url, res, undefined, function () { console.warn('[race-kit] missing', url); res(null); }); }); }
  function named(group, name) { var hit = null; group.traverse(function (o) { if (!hit && o.name === name) hit = o; }); return hit; }

  function dress(o) {
    var THREE = o.THREE, t = o.track, U = o.U || 7 / 1.8, base = o.base || BASE;
    if (!t || !t.group || !t.frames || !t.frames.length) return Promise.resolve(null);
    var loader = new o.GLTFLoader(), out = new THREE.Group(); out.name = 'race-kit'; t.group.add(out);
    var stats = { pylons: 0, gantries: 0, checkpoints: 0, rings: 0, gateTowers: 0, billboards: 0, instancedMeshes: 0 };
    return Promise.all([load(loader, base + 'shaddai_race_kit_v01.glb'), load(loader, base + 'shaddai_race_extras_v01.glb')]).then(function (g) {
      var kit = g[0], ex = g[1]; if (!kit) return { group: out, stats: stats };
      kit.scene.updateMatrixWorld(true); if (ex) ex.scene.updateMatrixWorld(true);
      var node = function (n) { return named(kit.scene, n) || (ex && named(ex.scene, n)); };
      var m4 = new THREE.Matrix4(), S = new THREE.Matrix4().makeScale(U, U, U);
      function place(n, mats, tag) {                                   // one InstancedMesh per primitive of node n (and its children)
        var nd = node(n); if (!nd || !mats.length) return 0;
        var inv = new THREE.Matrix4().copy(nd.matrixWorld).invert();
        nd.traverse(function (mesh) {
          if (!mesh.isMesh) return;
          var local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
          var im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length); im.name = 'racekit-' + (tag || n);
          mats.forEach(function (w, i) { im.setMatrixAt(i, m4.multiplyMatrices(w, local)); });
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); out.add(im); stats.instancedMeshes++;
        });
        return mats.length;
      }
      function matsOf(name) {                                          // read the code pieces' instance matrices, then hide them
        var im = named(t.group, name), list = []; if (!im || !im.isInstancedMesh) return list;
        for (var i = 0; i < im.count; i++) { var m = new THREE.Matrix4(); im.getMatrixAt(i, m); list.push(m); }
        im.visible = false; return list;
      }
      // pylons: code matrix = position (x, g + h/2, z), scale (1, h + 0.5 U, 1)
      var feet = [], shafts = [], heads = [], p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      matsOf('track-pylons').forEach(function (m) {
        m.decompose(p, q, s); var g0 = p.y - s.y / 2, top = p.y + s.y / 2, avail = top - g0;
        var k = Math.min(1, avail / (6.4 * U)), fH = 1.6 * U * k, hH = 3.8 * U * k, sh = Math.max(1e-4, avail - fH - hH);   // short pylons: foot + head shrink so the stack always fits
        feet.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, g0, p.z), q, new THREE.Vector3(U * k, U * k, U * k)));
        shafts.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, g0 + fH, p.z), q, new THREE.Vector3(U, sh, U)));
        heads.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, top, p.z), q, new THREE.Vector3(U * k, U * k, U * k)));
      });
      stats.pylons = place('race_pylon_foot', feet); place('race_pylon_shaft', shafts); place('race_pylon_head', heads);
      matsOf('track-gantry-lights');
      stats.gantries = place('race_gantry', matsOf('track-gantries').map(function (m) { return m.clone().multiply(S); }));
      var sectorMats = matsOf('track-sector-gates');
      stats.checkpoints = place('race_checkpoint', sectorMats.map(function (m) { return m.clone().multiply(S); }));
      // GATE TOWERS: the K6b race_gate_tower fitted to the code tower's span + height (code slabs + glow hidden)
      var gtIm = named(t.group, 'track-gate-towers'), gtNode = ex && named(ex.scene, 'race_gate_tower');
      if (gtIm && gtIm.isInstancedMesh && gtNode) {
        gtIm.geometry.computeBoundingBox(); var cb = gtIm.geometry.boundingBox, kb = new THREE.Box3();
        var gInv = new THREE.Matrix4().copy(gtNode.matrixWorld).invert();
        gtNode.traverse(function (mm) { if (mm.isMesh) { mm.geometry.computeBoundingBox(); kb.union(mm.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(gInv, mm.matrixWorld))); } });
        var ks = kb.getSize(new THREE.Vector3()), cs = cb.getSize(new THREE.Vector3()), kc = kb.getCenter(new THREE.Vector3()), cc = cb.getCenter(new THREE.Vector3());
        var sx = cs.x / Math.max(1e-3, ks.x), sy = cs.y / Math.max(1e-3, ks.y);
        var fit = new THREE.Matrix4().makeTranslation(cc.x, cb.min.y, cc.z).multiply(new THREE.Matrix4().makeScale(sx, sy, sx)).multiply(new THREE.Matrix4().makeTranslation(-kc.x, -kb.min.y, -kc.z));
        stats.gateTowers = place('race_gate_tower', matsOf('track-gate-towers').map(function (m) { return m.clone().multiply(fit); }));
        matsOf('track-gate-tower-glow');
      }
      // HOLO BILLBOARDS: one on the ground beside each checkpoint, outer side, screen turned toward the deck
      if (ex && sectorMats.length) {
        var bb = [], ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
        sectorMats.forEach(function (m) {
          m.decompose(p, q, s); ax.setFromMatrixColumn(m, 0).setY(0).normalize();
          var bx = p.x + ax.x * 60 * U, bz = p.z + ax.z * 60 * U, by = o.groundAt ? o.groundAt(bx, bz) : 0;
          bb.push(new THREE.Matrix4().compose(new THREE.Vector3(bx, by, bz), new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(-ax.x, -ax.z)), new THREE.Vector3(U * 1.6, U * 1.6, U * 1.6)));
        });
        stats.billboards = place('race_holo_billboard', bb);
      }
      // boost rings hover 4 m over each boost pad (pads stay: they are the gameplay trigger)
      var boost = named(t.group, 'track-boost'), rings = [];
      if (boost && boost.isInstancedMesh) for (var b = 0; b < boost.count; b++) { var bm = new THREE.Matrix4(); boost.getMatrixAt(b, bm); bm.decompose(p, q, s); rings.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + 4.6 * U, p.z), q, new THREE.Vector3(U, U, U))); }
      stats.rings = place('race_boost_ring', rings);
      // start gate on the start line (frame 0): the code frame basis (S, N, T) at the deck point
      var F0 = t.frames[0], start = new THREE.Matrix4().makeBasis(F0.S, F0.N, F0.T).setPosition(F0.P).multiply(S);
      place('race_start_gate', [start], 'start_gate');
      // grandstand + pits at ground level beside the start, on the outer side; the START ELEVATOR between them and the deck
      var side = F0.S.clone().setY(0).normalize(), fwd = F0.T.clone().setY(0).normalize(), gnd = (o.groundAt ? o.groundAt(F0.P.x, F0.P.z) : F0.g);
      var yaw = Math.atan2(side.x, side.z), at = function (lat, along) { return new THREE.Vector3(F0.P.x + side.x * lat * U + fwd.x * along * U, gnd, F0.P.z + side.z * lat * U + fwd.z * along * U); };
      var faceTrack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI);   // seats/doors (+X) face the deck
      if (ex) {
        place('race_grandstand', [new THREE.Matrix4().compose(at(-32, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - Math.PI / 2), new THREE.Vector3(U, U, U))], 'grandstand');
        place('race_pit_garage', [new THREE.Matrix4().compose(at(32, -10), faceTrack, new THREE.Vector3(U, U, U))], 'pits');
      }
      var liftBase = at(-14, -8), liftTop = F0.P.clone().addScaledVector(side, -6 * U), H = Math.max(2 * U, liftTop.y - gnd);
      var glass = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2, depthWrite: false });
      var gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, metalness: 0.8, roughness: 0.3, emissive: 0x3a2a00 });
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * U, 2.2 * U, H, 20, 1, true), glass); tube.position.set(liftBase.x, gnd + H / 2, liftBase.z); out.add(tube);
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6 * U, 2.6 * U, 0.3 * U, 24), gold); pad.position.set(liftBase.x, gnd + 0.15 * U, liftBase.z); out.add(pad);
      var cap = new THREE.Mesh(new THREE.TorusGeometry(2.3 * U, 0.18 * U, 8, 28), gold); cap.rotation.x = Math.PI / 2; cap.position.set(liftBase.x, gnd + H, liftBase.z); out.add(cap);
      var bridge = new THREE.Mesh(new THREE.BoxGeometry(2.4 * U, 0.4 * U, liftBase.distanceTo(new THREE.Vector3(liftTop.x, gnd, liftTop.z)) + 2 * U), gold);
      bridge.position.set((liftBase.x + liftTop.x) / 2, liftTop.y - 0.2 * U, (liftBase.z + liftTop.z) / 2); bridge.lookAt(liftTop.x, liftTop.y - 0.2 * U, liftTop.z); out.add(bridge);
      var lift = { base: { x: liftBase.x, y: gnd, z: liftBase.z }, top: { x: F0.P.x, y: F0.P.y, z: F0.P.z }, r: 4 * U };
      wireLift(lift, o);
      console.info('[race-kit]', stats);
      return { group: out, lift: lift, stats: stats };
    });
  }

  /* E at the lift base -> stand on the deck at the start line; E on the deck near the start -> back to the base. */
  function wireLift(lift, o) {
    if (typeof document === 'undefined' || !o.getPlayer) return;
    var near = function (p, a, r) { return p && Math.hypot(p.x - a.x, p.z - a.z) < r && Math.abs((p.y || a.y) - a.y) < 12 * (o.U || 3.89); };
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'KeyE' || e.repeat) return; var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      var p = o.getPlayer(); if (!p) return; var dest = null;
      if (near(p, lift.base, lift.r)) dest = lift.top; else if (near(p, lift.top, lift.r * 2)) dest = lift.base;
      if (!dest) return;
      p.x = dest.x; p.z = dest.z; if ('y' in p) p.y = dest.y + 0.2; e.stopImmediatePropagation(); e.preventDefault();
      if (root.Navi && root.Navi.toast) root.Navi.toast(dest === lift.top ? 'Start deck - race board is at the gate' : 'Ground level');
    }, true);
  }

  root.WorldRaceKit = { dress: dress };
})(typeof window !== 'undefined' ? window : globalThis);
