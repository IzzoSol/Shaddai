/* world-clusters-v4.js — realm DISTRICTS + city GRID FABRIC for Map v4 (?map=v4), 2026-09-26 (rev 3: generic placement file + lod2 tier).
 *
 * Reads public/assets/world/realm-clusters-v4.json (tools/blender/realm-clusters-v4.py — the SAME file the Blender
 * scene uses, so Blender == game): Suburbs street-grid district, Sand Sea habitat domes, Crystal Sea island spires +
 * harbour town, Emberfall forge line, Arctic outposts, Darkforest ruin fields, Void crystal fields (only EXISTING models).
 * rev 3: the same loader also reads public/assets/world/grid-fabric-v4.json (city buildings, keys `sc-*`) — pass `url`.
 *
 * PERF (measured 2026-09-26: rev 1 drew 9.65 M triangles — 45 % of the frame — because every copy of every full-detail
 * model was one world-spanning InstancedMesh: never frustum-culled, always in the shadow pass). Same detail up close,
 * far cheaper overall (our gamedev repo's game-qa-performance checklist: cull, LOD, instance):
 *   • instances are split into ~1 km CELLS → each cell's InstancedMesh has a tight bounding sphere → frustum culling works
 *   • per cell, distance picks the model: < near_m → full model (casts shadows) · < far_m → lod1 (simplified, no shadow)
 *     · < hide_m → lod2 (coarser, no shadow) · beyond → hidden (fog)
 *   • lod1/lod2 = public/assets/models/lod/<key>-lod{1,2}.glb (gltf-transform simplify, generated from the same source model);
 *     sc-* keys: public/assets/models/shaddai-city/<key>.glb + shaddai-city/lod/<key>-lod{1,2}.glb
 *   • missing lod1 → full model covers the lod1 band; missing lod2 → lod1 (or full) covers the lod2 band.
 *   • lod2 is only requested when hide_m > far_m (realm defaults: hide_m == far_m → identical to rev 2, no extra fetches).
 *
 *   window.buildWorldClustersV4({ THREE, scene, loader, heightAt (units),
 *       url?  (placement JSON, default '/assets/world/realm-clusters-v4.json'),
 *       name? (group name, default 'world-clusters-v4'),
 *       near_m?, far_m?, hide_m?  (tier distances in metres; defaults come from presetFor(url)) })
 *     → Promise<{ group, update(t, dt, camPos), stats(), dispose() }>
 *
 *   Pure helpers (for node tests) on window.__clustersV4Internals: { U, CELL_M, urlOf, presetFor, pickTier }.
 */
(function () {
  var U = 7 / 1.8, CELL_M = 1000, CELL = CELL_M * U;
  var REALM_URL = '/assets/world/realm-clusters-v4.json';
  var ROOT = ['bld-apartment-pod-block', 'bld-inverted-cube-hab', 'bld-neon-observatory', 'bld-sea-terrace-spire', 'bld-holo-market-v2',
    'homes-mushroom-pods', 'prop-obsidian-rocks', 'prop-crystal-cluster', 'volcano-forge-tower', 'volcano-ritual-circle', 'volcano-dragon', 'volcano-bridge', 'volcano-gate'];
  function urlOf(key, lod) {
    if (key.indexOf('sc-') === 0) return lod ? '/assets/models/shaddai-city/lod/' + key + '-lod' + lod + '.glb' : '/assets/models/shaddai-city/' + key + '.glb';
    return lod ? '/assets/models/lod/' + key + '-lod' + lod + '.glb' : (ROOT.indexOf(key) >= 0 ? '/assets/models/' : '/assets/models/fal/') + key + '.glb';
  }
  // default tier distances (metres) per placement file: realm = rev-2 behaviour; grid fabric = city buildings
  function presetFor(url) {
    if (url && /grid-fabric/.test(url)) return { name: 'grid-fabric-v4', near_m: 250, far_m: 900, hide_m: 2600 };
    return { name: 'world-clusters-v4', near_m: 450, far_m: 2500, hide_m: 2500 };
  }
  // d = distance (units) from camera to the cell's nearest edge-ish; returns 0 full · 1 lod1 · 2 lod2 · 3 hidden
  function pickTier(d, near, far, hide, has1, has2) {
    if (d < near) return 0;
    if (d < far) return has1 ? 1 : 0;
    if (d < hide) return has2 ? 2 : (has1 ? 1 : 0);
    return 3;
  }
  window.__clustersV4Internals = { U: U, CELL_M: CELL_M, urlOf: urlOf, presetFor: presetFor, pickTier: pickTier };

  window.buildWorldClustersV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt || function () { return 0; };
    var url = opts.url || REALM_URL, pre = presetFor(url);
    var NEAR = (opts.near_m != null ? opts.near_m : pre.near_m) * U, FAR = (opts.far_m != null ? opts.far_m : pre.far_m) * U;
    var hideM = opts.hide_m != null ? opts.hide_m : (pre.hide_m > pre.far_m ? pre.hide_m : null);   // realm preset: no lod2 band
    var HIDE = hideM == null ? FAR : Math.max(FAR, hideM * U);
    var WANT2 = HIDE > FAR, TAG = '[clusters-v4' + (opts.name ? ':' + opts.name : (url === REALM_URL ? '' : ':' + pre.name)) + '] ';
    var group = new THREE.Group(); group.name = opts.name || pre.name; scene.add(group);
    var st = { items: 0, types: 0, cells: 0, meshes: 0, near: 0, mid: 0, far: 0, hidden: 0, failed: [], noLod2: [] }, cells = {};
    function load(url) { return new Promise(function (res, rej) { if (window.__queueLoad) window.__queueLoad(loader, url, res, rej); else loader.load(url, res, undefined, rej); }); }
    function parts(root) {   // mesh parts with transforms baked relative to the model's base-centre (one instance matrix places the whole model)
      root.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      var toBase = new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z), out = [];
      root.traverse(function (o) {
        if (!o.isMesh || o.isSkinnedMesh) return;
        var geo = o.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toBase, o.matrixWorld));
        if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
        out.push({ geo: geo, mat: o.material });
      });
      return { parts: out, wid: Math.max(size.x, size.z, 1e-4), hgt: Math.max(size.y, 1e-4) };
    }
    function minGround(x, z, r) {
      var m = heightAt(x, z), k, a;
      for (k = 0; k < 8; k++) { a = k / 8 * Math.PI * 2; m = Math.min(m, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
      return m;
    }
    return fetch(url).then(function (r) { return r.json(); }).then(function (plan) {
      var byKey = {};
      plan.items.forEach(function (it) { (byKey[it.key] = byKey[it.key] || []).push(it); });
      var keys = Object.keys(byKey); st.types = keys.length; st.items = plan.items.length;
      return Promise.all(keys.map(function (key) {
        var none = function () { return null; };
        return Promise.all([load(urlOf(key, 0)), load(urlOf(key, 1)).catch(none), WANT2 ? load(urlOf(key, 2)).catch(none) : null]).then(function (gs) {
          var L0 = parts(gs[0].scene), L1 = gs[1] ? parts(gs[1].scene) : null, L2 = gs[2] ? parts(gs[2].scene) : null;
          if (WANT2 && !L2) st.noLod2.push(key);
          var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0);
          var byCell = {};
          byKey[key].forEach(function (it) {   // sized from the FULL model (lods share the same bounds, so one matrix fits all)
            var k = (it.by_height ? it.len_m / L0.hgt : it.len_m / L0.wid) * U, x = it.x_m * U, z = -it.y_m * U;
            var y = minGround(x, z, L0.wid * k * 0.35) + (it.lift_m || 0) * U;
            var ck = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
            (byCell[ck] = byCell[ck] || []).push(m4.compose(p.set(x, y, z), q.setFromAxisAngle(yA, -(it.yaw || 0) * Math.PI / 180), s.set(k, k, k)).clone());
          });
          Object.keys(byCell).forEach(function (ck) {
            var mats = byCell[ck], c = cells[ck] || (cells[ck] = { entries: [], centre: new THREE.Vector3(), n: 0, state: -1 });
            function build(L, shadow) {
              return L.parts.map(function (pt) {
                var im = new THREE.InstancedMesh(pt.geo, pt.mat, mats.length);
                for (var i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
                im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true;
                im.visible = false; im.name = 'cluster:' + key; group.add(im); st.meshes++; return im;
              });
            }
            // per-key tier sets so a key without lod1/lod2 falls back on its own, not per cell
            var m0 = build(L0, true), m1 = L1 ? build(L1, false) : null, m2 = L2 ? build(L2, false) : null;
            c.entries.push({ tiers: [m0, m1 || m0, m2 || m1 || m0] });
            mats.forEach(function (m) { c.centre.x += m.elements[12]; c.centre.z += m.elements[14]; c.n++; });
          });
          var L = window.WORLD_LAYOUT;
          if (L && L.realmColliders && !/lamp|crystal/.test(key)) byKey[key].forEach(function (it) {
            L.realmColliders.push({ x: Math.round(it.x_m * U), z: Math.round(-it.y_m * U), r: Math.round(it.len_m * 0.42 * U), label: 'cluster:' + it.cluster });
          });
        }).catch(function (e) { st.failed.push(key); console.warn(TAG + key + ' failed: ' + (e && e.message)); });
      })).then(function () {
        Object.keys(cells).forEach(function (ck) { var c = cells[ck]; c.centre.x /= c.n; c.centre.z /= c.n; });
        st.cells = Object.keys(cells).length;
        if (window.buildWorldCollision && window.WORLD_LAYOUT) window.buildWorldCollision(window.WORLD_LAYOUT);
        console.info(TAG + st.items + ' pieces · ' + st.types + ' model types · ' + st.cells + ' cells · ' + st.meshes + ' chunk meshes (LOD: full < ' + Math.round(NEAR / U) + ' m, lod1 < ' + Math.round(FAR / U) + ' m' + (WANT2 ? ', lod2 < ' + Math.round(HIDE / U) + ' m' : '') + ')' + (st.failed.length ? ' · failed ' + st.failed.join(',') : '') + (st.noLod2.length ? ' · no lod2: ' + st.noLod2.join(',') : ''));
        var acc = 1;
        return {
          group: group,
          update: function (t, dt, cam) {       // re-pick LODs 4×/s — cells are 1 km, so that's plenty
            acc += dt || 0; if (acc < 0.25 || !cam) return; acc = 0; st.near = st.mid = st.far = st.hidden = 0;
            Object.keys(cells).forEach(function (ck) {
              var c = cells[ck], d = Math.hypot(c.centre.x - cam.x, c.centre.z - cam.z) - CELL * 0.7;
              var s = pickTier(d, NEAR, FAR, HIDE, true, true);   // per-key fallbacks are baked into each entry's tiers[]
              if (s === 0) st.near++; else if (s === 1) st.mid++; else if (s === 2) st.far++; else st.hidden++;
              if (s === c.state) return; c.state = s;
              c.entries.forEach(function (e) {
                var show = s < 3 ? e.tiers[s] : null;
                e.tiers.forEach(function (ms) { if (ms !== show) ms.forEach(function (m) { m.visible = false; }); });
                if (show) show.forEach(function (m) { m.visible = true; });
              });
            });
          },
          stats: function () { return st; },
          dispose: function () { scene.remove(group); }
        };
      });
    });
  };
})();
