/* world-clusters-v4.js — realm DISTRICTS for Map v4 (?map=v4), 2026-09-26.
 *
 * Reads public/assets/world/realm-clusters-v4.json (written by tools/blender/realm-clusters-v4.py — the SAME file the
 * Blender scene uses, so Blender == game): Suburbs street-grid district, Meadow mushroom-pod village, Sand Sea habitat
 * domes, Crystal Sea island spires + harbour town, Emberfall forge line, Arctic outposts, Darkforest ruin fields, Void
 * crystal fields (~411 pieces, only EXISTING models).
 *
 * Cost stays low with full detail: each model is loaded ONCE and every mesh inside it becomes ONE InstancedMesh with a
 * copy per placement (child transforms baked into the geometry) → draw calls = Σ meshes per model type (~40), not 411×.
 * Sizes follow world-realmprops fit(): widest horizontal side = len_m (or height when by_height), base seated on the
 * terrain at the lowest point under the footprint (nothing floats).
 *
 *   window.buildWorldClustersV4({ THREE, scene, loader, heightAt (game units) }) → Promise<{ stats(), dispose() }>
 */
(function () {
  var U = 7 / 1.8;
  // model key → url (fal heroes live in /fal/, the older realm props in /assets/models/)
  var ROOT = ['bld-apartment-pod-block', 'bld-inverted-cube-hab', 'bld-neon-observatory', 'bld-sea-terrace-spire', 'bld-holo-market-v2',
    'homes-mushroom-pods', 'prop-obsidian-rocks', 'prop-crystal-cluster', 'volcano-forge-tower', 'volcano-ritual-circle', 'volcano-dragon', 'volcano-bridge', 'volcano-gate'];
  function urlOf(key) { return (ROOT.indexOf(key) >= 0 ? '/assets/models/' : '/assets/models/fal/') + key + '.glb'; }

  window.buildWorldClustersV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt || function () { return 0; };
    var group = new THREE.Group(); group.name = 'world-clusters-v4'; scene.add(group);
    var st = { items: 0, types: 0, meshes: 0, failed: [] };
    function load(url) {
      return new Promise(function (res, rej) {
        if (window.__queueLoad) window.__queueLoad(loader, url, res, rej); else loader.load(url, res, undefined, rej);
      });
    }
    function minGround(x, z, r) {        // lowest terrain under the footprint → the model never floats on a slope
      var m = heightAt(x, z), k, a;
      for (k = 0; k < 8; k++) { a = k / 8 * Math.PI * 2; m = Math.min(m, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
      return m;
    }
    return fetch('/assets/world/realm-clusters-v4.json').then(function (r) { return r.json(); }).then(function (plan) {
      var byKey = {};
      plan.items.forEach(function (it) { (byKey[it.key] = byKey[it.key] || []).push(it); });
      var keys = Object.keys(byKey); st.types = keys.length; st.items = plan.items.length;
      return Promise.all(keys.map(function (key) {
        return load(urlOf(key)).then(function (g) {
          var root = g.scene; root.updateMatrixWorld(true);
          var box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
          var wid = Math.max(size.x, size.z, 1e-4), hgt = Math.max(size.y, 1e-4);
          // bake each mesh's transform relative to the model's base-centre, so one instance matrix places the whole model
          var toBase = new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z), parts = [];
          root.traverse(function (o) {
            if (!o.isMesh || o.isSkinnedMesh) return;
            var geo = o.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toBase, o.matrixWorld));
            if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
            parts.push({ geo: geo, mat: o.material });
          });
          var list = byKey[key], mats = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0);
          list.forEach(function (it) {
            var k = (it.by_height ? it.len_m / hgt : it.len_m / wid) * U;          // metres → units, per the plan's rule
            var x = it.x_m * U, z = -it.y_m * U;
            var y = minGround(x, z, wid * k * 0.35) + (it.lift_m || 0) * U;
            mats.push(m4.compose(p.set(x, y, z), q.setFromAxisAngle(yA, -(it.yaw || 0) * Math.PI / 180), s.set(k, k, k)).clone());
          });
          parts.forEach(function (pt) {
            var im = new THREE.InstancedMesh(pt.geo, pt.mat, mats.length);
            for (var i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
            im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
            im.name = 'cluster:' + key; group.add(im); st.meshes++;
          });
          // colliders: one circle per placed piece (buildings are solid)
          var L = window.WORLD_LAYOUT;
          if (L && L.realmColliders && !/lamp|crystal/.test(key)) list.forEach(function (it) {
            L.realmColliders.push({ x: Math.round(it.x_m * U), z: Math.round(-it.y_m * U), r: Math.round(it.len_m * 0.42 * U), label: 'cluster:' + it.cluster });
          });
        }).catch(function (e) { st.failed.push(key); console.warn('[clusters-v4] ' + key + ' failed: ' + (e && e.message)); });
      })).then(function () {
        console.info('[clusters-v4] ' + st.items + ' pieces · ' + st.types + ' model types · ' + st.meshes + ' instanced meshes' + (st.failed.length ? ' · failed ' + st.failed.join(',') : ''));
        return { group: group, stats: function () { return st; }, dispose: function () { scene.remove(group); } };
      });
    });
  };
})();
