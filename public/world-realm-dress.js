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
  var PM = 7 / 1.8, VIEW_M = 1200, DATA = '/assets/world/realm-dress-v1.json?v=20261023f', TOWNS2 = '/assets/world/realm-towns-v2.json?v=20261023a';
  function stationList(transit) {
    var out = (transit && transit.stations || []).filter(function (t) { return t.onRing !== false && t.realm && t.group; })   // owner 2026-10-23: the grid dress at Central read as a random cluster - not placed
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
    var getJ = function (u, n) { n = n == null ? 3 : n; return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return n > 0 ? new Promise(function (res) { setTimeout(res, 900); }).then(function () { return getJ(u, n - 1); }) : null; }); };   /* retries: a dropped request must not leave every realm town empty */
    return Promise.all([getJ(DATA), /[?&]realmtowns=0/.test(location.search || '') ? null : getJ(TOWNS2)]).then(function (both) {
      var data = both[0], t2 = both[1];
      if (!data || !data.realms) { console.info('[realm-dress] no data'); return { group: group, stats: stats }; }
      var stations = stationList(o.transit), byFile = {}, towns = {}, crownReqs = [];
      // REALM-HEART TOWNS (realm-towns-v2.json, tools/gen-realm-towns.cjs, TURTLE layouts 2026-10-23): one pseudo-station per town at its
      // centre (rot 0, so item x/z are plain game-metre offsets). float: the Crystal Sea town stands on a deck at the water line.
      ((t2 && t2.towns) || []).forEach(function (t) {
        var key = 'town2:' + t.realm; data.realms[key] = t.items;
        var st = { id: t.id, realm: key, x: t.c[0] * PM, z: t.c[1] * PM, rot: 0 };
        var wy = o.waterAt ? o.waterAt(st.x, st.z) : null; if (wy != null) st.floatY = wy + 1.2 * PM;
        stations.push(st); stats.towns2 = (stats.towns2 || 0) + 1;
      });
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
            if (!town) { town = towns[sid] = new THREE.Group(); town.name = 'realm-dress-' + sid; town.userData.x = t.st.x; town.userData.z = t.st.z; group.add(town);
              if (t.st.floatY != null && /[?&]oceandeck=code/.test(location.search || '')) {   /* 2026-10-23: replaced by the reef-style GLB platform + glass bridge (world-edge-realms.js); ?oceandeck=code = this one */ // HARBOUR PLATFORM (owner 2026-10-23: the plain white disc read as odd): dark teal tech-deck, white rim with a cyan glow edge,
                // eight piers out to the water with mooring posts. One merged mesh per material (3 draws).
                var Y = t.st.floatY, cx = t.st.x, cz = t.st.z, gD = [], gW = [], gG = [];
                var deckG = new THREE.CylinderGeometry(150 * PM, 146 * PM, 2.4 * PM, 64); deckG.translate(cx, Y - 1.2 * PM, cz); gD.push(deckG);
                var rimG = new THREE.TorusGeometry(152 * PM, 3 * PM, 6, 96); rimG.rotateX(Math.PI / 2); rimG.translate(cx, Y - 0.2 * PM, cz); gW.push(rimG);
                var glowG = new THREE.TorusGeometry(155.5 * PM, 0.6 * PM, 4, 96); glowG.rotateX(Math.PI / 2); glowG.translate(cx, Y - 0.6 * PM, cz); gG.push(glowG);
                for (var pk = 0; pk < 8; pk++) { var pa = pk * Math.PI / 4 + Math.PI / 8, px = Math.sin(pa), pz = Math.cos(pa);
                  var pier = new THREE.BoxGeometry(8 * PM, 1.2 * PM, 60 * PM); pier.rotateY(pa); pier.translate(cx + px * 182 * PM, Y - 0.8 * PM, cz + pz * 182 * PM); gW.push(pier);
                  for (var mk = 0; mk < 3; mk++) { var post = new THREE.CylinderGeometry(0.4 * PM, 0.4 * PM, 3 * PM, 6), d = 165 + mk * 20, sd = (mk % 2 ? 1 : -1) * 5;
                    post.translate(cx + px * d * PM + pz * sd * PM, Y + 0.3 * PM, cz + pz * d * PM - px * sd * PM); gG.push(post); } }
                function mg(list) { var pos = []; list.forEach(function (g) { g = g.index ? g.toNonIndexed() : g; pos.push.apply(pos, g.attributes.position.array); }); var o2 = new THREE.BufferGeometry(); o2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o2.computeVertexNormals(); return o2; }
                [[gD, new THREE.MeshStandardMaterial({ color: 0x1d3a44, roughness: 0.5, metalness: 0.4 })], [gW, new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.35, metalness: 0.3 })], [gG, new THREE.MeshBasicMaterial({ color: 0x5fe8ff, toneMapped: false })]]
                  .forEach(function (e) { var mm = new THREE.Mesh(mg(e[0]), e[1]); mm.receiveShadow = true; town.add(mm); });
              } }
            if (/_b[1-4]_v01\.glb$/.test(file) && root.WorldCityCrowns) t.list.forEach(function (e) {   // REALM CROWNS (owner 2026-10-24: realm buildings read basic) - same crown kit as the Grid, styled per realm
              var k2 = PM * (e.h ? e.h / rawH : e.w.s), gy = t.st.floatY != null ? Math.max(heightAt(e.w.x, e.w.z), t.st.floatY) : heightAt(e.w.x, e.w.z), rl = String(t.st.realm).replace('town2:', '');
              var dist = /volcano|desert/.test(rl) ? 'forge' : /arctic|ocean/.test(rl) ? 'trade' : /void/.test(rl) ? 'athenaeum' : 'residential';
              crownReqs.push({ d: dist, x: e.w.x, z: e.w.z, y: gy + rawH * k2, w: (bb.max.x - bb.min.x) * k2, dz: (bb.max.z - bb.min.z) * k2, yaw: e.w.yaw }); });
            var mats = t.list.map(function (e) { return m4.compose(pv.set(e.w.x, t.st.floatY != null ? Math.max(heightAt(e.w.x, e.w.z), t.st.floatY) : heightAt(e.w.x, e.w.z), e.w.z), q.setFromAxisAngle(up, e.w.yaw), sv.setScalar(PM * (e.h ? e.h / rawH : e.w.s))).clone(); });
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
        if (crownReqs.length && root.WorldCityCrowns) try { var cr = root.WorldCityCrowns.build({ THREE: THREE, parent: group, reqs: crownReqs }); stats.crowns = cr && cr.stats; } catch (e) { console.warn('[realm-dress] crowns', e && e.message); }
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
