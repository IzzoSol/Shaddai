/* world-realm-dress.js — realm DRESSING authored in Blender, placed around every ring station (2026-10-22).
 *
 *   window.WorldRealmDress.build({ THREE, GLTFLoader, scene, transit, heightAt, getPlayer }) -> Promise<{ group, stats }>
 *
 * Source of truth: docs/blender/realm-scenes-20261022.blend — one Blender scene per realm, built from world-realm-kits.js's own
 * layout (station at the origin, Blender X = station-local x, Blender -Y = station-local z toward the lift/city, Z-rotation = yaw).
 * Everything in a scene's DRESS_<realm> collection is exported by tools/blender_dress_export.py to
 *   /assets/world/realm-dress-v1.json  { realms: { <realm>: [ { file, x, z, yaw, h | s, col } ] } }   (metres, degrees)
 * Each file is normalized once (footprint centred, feet on the ground); h = real height in metres (else s = raw scale).
 * so the owner arranges a realm in Blender and the game shows exactly that. Same transform as world-realm-kits placements().
 * Pass meshopt (MeshoptDecoder) + draco (DRACOLoader): most model-viewer GLBs are meshopt-compressed and fail without it.
 * Perf: each GLB loads once; every mesh primitive of a file is ONE InstancedMesh per station town (draw calls stay flat);
 * a town group is hidden beyond VIEW_M. col (metres, 0 = walk-through) pushes a circle collider. ?realmdress=0 = off.
 */
(function (root) {
  'use strict';
  var PM = 7 / 1.8, VIEW_M = 1200, DATA = '/assets/world/realm-dress-v1.json?v=20261023f';
  function stationList(transit) {
    var out = (transit && transit.stations || []).filter(function (t) { return t.realm && t.group && (t.onRing !== false || t.realm === 'grid'); })   // + Central (grid)
      .map(function (t) { return { id: t.id, realm: t.realm, x: t.group.position.x, z: t.group.position.z, rot: t.group.rotation.y }; });
    // 2026-10-23 audit: realms with NO station (forest) got no town at all - anchor them at the middle of their terrain wedge, facing the city
    try {
      var M = root.__w3dDebug && root.__w3dDebug.terrainV4 && root.__w3dDebug.terrainV4.meta, have = {};
      out.forEach(function (o) { have[o.realm] = 1; });
      ((M && M.realms) || []).forEach(function (R) {
        if (have[R.id]) return; var c0 = R.c0, c1 = R.c1 < c0 ? R.c1 + 360 : R.c1, cdeg = ((c0 + c1) / 2) % 360, rm = (+R.r0_m + +(R.r1_m || M.rim_m)) / 2;
        var a = cdeg * Math.PI / 180, x = Math.sin(a) * rm * PM, z = -Math.cos(a) * rm * PM, ang = Math.atan2(z, x);
        out.push({ id: 'anchor-' + R.id, realm: R.id, x: x, z: z, rot: -ang - Math.PI / 2 });
      });
    } catch (e) { }
    return out;
  }
  function toWorld(st, p) {   // station-local metres -> world units (identical to world-realm-kits placements())
    var c = Math.cos(st.rot), s = Math.sin(st.rot), lx = p.x * PM, lz = p.z * PM;
    return { x: st.x + lx * c + lz * s, z: st.z - lx * s + lz * c, yaw: st.rot + (p.yaw || 0) * Math.PI / 180, s: p.s || 1 };
  }
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]realmdress=0/.test(location.search || '')) return Promise.resolve(null);
    var THREE = o.THREE, heightAt = o.heightAt || function () { return 0; }, L = root.WORLD_LAYOUT, cols = L && L.realmColliders;
    var group = new THREE.Group(); group.name = 'world-realm-dress'; o.scene.add(group);
    var stats = { entries: 0, files: 0, instancedMeshes: 0, instances: 0, colliders: 0, missing: [] };
    return fetch(DATA).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (data) {
      if (!data || !data.realms) { console.info('[realm-dress] no data'); return { group: group, stats: stats }; }
      var stations = stationList(o.transit), byFile = {}, towns = {};
      stations.forEach(function (st) {
        (data.realms[st.realm] || []).forEach(function (p) {
          var w = toWorld(st, p); stats.entries++;
          (byFile[p.file] = byFile[p.file] || []).push({ st: st, w: w, col: p.col || 0, h: p.h || 0 });
        });
      });
      var loader = new o.GLTFLoader(); if (o.meshopt) loader.setMeshoptDecoder(o.meshopt); if (o.draco) loader.setDRACOLoader(o.draco);   // viewer models are meshopt-compressed
      var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();
      var jobs = Object.keys(byFile).map(function (file) {
        return new Promise(function (res) { loader.load(file, res, undefined, function () { stats.missing.push(file); res(null); }); }).then(function (g) {
          if (!g) return; stats.files++; g.scene.updateMatrixWorld(true);
          // normalize once: footprint centred on the spot, feet on the ground; raw height lets an entry ask for h metres
          var bb = new THREE.Box3().setFromObject(g.scene), bc = bb.getCenter(new THREE.Vector3()), rawH = Math.max(1e-6, bb.max.y - bb.min.y);
          var inv = new THREE.Matrix4().makeTranslation(-bc.x, -bb.min.y, -bc.z).multiply(new THREE.Matrix4().copy(g.scene.matrixWorld).invert()), perTown = {};
          byFile[file].forEach(function (e) { (perTown[e.st.id] = perTown[e.st.id] || { st: e.st, list: [] }).list.push(e); });
          Object.keys(perTown).forEach(function (sid) {
            var t = perTown[sid], town = towns[sid];
            if (!town) { town = towns[sid] = new THREE.Group(); town.name = 'realm-dress-' + sid; town.userData.x = t.st.x; town.userData.z = t.st.z; group.add(town); }
            var mats = t.list.map(function (e) { return m4.compose(pv.set(e.w.x, heightAt(e.w.x, e.w.z), e.w.z), q.setFromAxisAngle(up, e.w.yaw), sv.setScalar(PM * (e.h ? e.h / rawH : e.w.s))).clone(); });
            g.scene.traverse(function (mesh) {
              if (!mesh.isMesh) return;
              if (mesh.material && mesh.material.map) mesh.material.map.colorSpace = THREE.SRGBColorSpace;
              var local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld), im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
              im.name = 'dress-' + file.split('/').pop(); mats.forEach(function (w, i) { im.setMatrixAt(i, m4.multiplyMatrices(w, local)); });
              im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
              town.add(im); stats.instancedMeshes++; stats.instances += mats.length;
            });
            var colOf = t.list.map(function (e) { if (!(cols && e.col > 0)) return null; var c = { x: Math.round(e.w.x), z: Math.round(e.w.z), r: Math.max(1.5, Math.round(e.col * PM)), label: 'dress:' + file.split('/').pop() }; cols.push(c); stats.colliders++; return c; });
            // WALK-IN INTERIORS: a hook_interior_* node carrying interior_recipe / interior_w / _d / _h (metres) becomes a room in
            // world-interiors-v3 (registered by world-realm-interiors.js); its collider is handed over so the doorway opens.
            g.scene.traverse(function (hk) {
              var ud = hk.userData || {}; if (!/^hook_interior_/.test(hk.name || '') || !ud.interior_recipe) return;
              var hl = new THREE.Matrix4().multiplyMatrices(inv, hk.matrixWorld), hp = new THREE.Vector3(), hq = new THREE.Quaternion();
              mats.forEach(function (w, i) { new THREE.Matrix4().multiplyMatrices(w, hl).decompose(hp, hq, new THREE.Vector3());
                var yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
                (root.__realmDressInteriors = root.__realmDressInteriors || []).push({ id: 'dressint:' + sid + ':' + hk.name + ':' + i, recipe: ud.interior_recipe, x: hp.x, z: hp.z, yaw: yaw,
                  w: ud.interior_w || 12, d: ud.interior_d || 10, h: ud.interior_h || 4, canon: colOf[i] }); stats.interiors = (stats.interiors || 0) + 1; });
            });
          });
        });
      });
      return Promise.all(jobs).then(function () {
        if (stats.colliders && root.buildWorldCollision && L) { try { root.buildWorldCollision(L); } catch (e) { console.warn('[realm-dress] collision rebuild', e && e.message); } }
        var R2 = Math.pow(VIEW_M * PM, 2);
        function update(pos) { if (!pos) return; Object.keys(towns).forEach(function (k) { var t = towns[k], dx = t.userData.x - pos.x, dz = t.userData.z - pos.z; t.visible = dx * dx + dz * dz < R2; }); }
        update(o.getPlayer && o.getPlayer());
        if (o.getPlayer) setInterval(function () { update(o.getPlayer()); }, 500);
        console.info('[realm-dress]', stats);
        if (root.WorldRealmInteriors) root.WorldRealmInteriors.sync();
        return { group: group, towns: towns, stats: stats, update: update };
      });
    });
  }
  root.WorldRealmDress = { build: build, toWorld: toWorld };
})(typeof window !== 'undefined' ? window : this);
