/* world-nature.js — Quaternius "Ultimate Stylized Nature" (CC0) scattered through the realms (2026-09-24).
 *
 *   window.buildWorldNature({ THREE, scene, loader, heightAt, layout }) -> { group, stats() }
 *
 * Real sizes (1 m = 7/1.8 world units, same law as world-falprops.js). Everything is an InstancedMesh per
 * model part, so hundreds of plants cost a handful of draw calls. Placement is seeded (same world every
 * load) and keeps clear of: water, the mountain ridge, light-trail roads, agent stations, the plaza core,
 * every collider in WORLD_LAYOUT.realmColliders, and the colosseum plateau.
 */
window.buildWorldNature = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt, L = opts.layout || window.WORLD_LAYOUT;
  if (!THREE || !scene || !loader || !heightAt || !L) return null;
  var PM = 7 / 1.8;
  var group = new THREE.Group(); group.name = 'world-nature'; scene.add(group);

  // ── seeded RNG ──
  var seed = 1337; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var TRAILS = [0.785, 0.074, -0.736, -2.405, 2.366, 1.6];
  var sectors = (L.sectors || []).map(function (s) { return s.pos; });
  function clear(x, z, pad) {
    var r = Math.hypot(x, z);
    if (r < 100) return false;                                    // plaza core stays open
    if (r > 372 && r < 528) return false;                         // mountain ridge band
    for (var i = 0; i < TRAILS.length; i++) {                     // light-trail roads: 12u each side
      var a = TRAILS[i], along = x * Math.cos(a) + z * Math.sin(a), off = Math.abs(-x * Math.sin(a) + z * Math.cos(a));
      if (along > 60 && along < 560 && off < 12 + pad) return false;
    }
    for (var s = 0; s < sectors.length; s++) if (Math.hypot(x - sectors[s][0], z - sectors[s][1]) < 55 + pad) return false;
    var cs = L.realmColliders || [];
    for (var c = 0; c < cs.length; c++) if (Math.hypot(x - cs[c].x, z - cs[c].z) < cs[c].r + 8 + pad) return false;
    if (Math.hypot(x + 14, z - 460) < 60) return false;            // colosseum plateau
    var h = heightAt(x, z); if (!isFinite(h) || h < 0.3 || h > 25) return false;   // no water, no ridge tops
    return true;
  }
  function scatter(cx, cz, rMax, rMin, n, pad) {
    var pts = [], tries = n * 12;
    while (pts.length < n && tries-- > 0) {
      var a = rnd() * Math.PI * 2, r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin));
      var x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!clear(x, z, pad)) continue;
      var ok = true; for (var i = 0; i < pts.length && ok; i++) if (Math.hypot(pts[i][0] - x, pts[i][1] - z) < pad * 2) ok = false;
      if (ok) pts.push([x, z]);
    }
    return pts;
  }
  var B = function (id) { return (L.biomes || []).find(function (b) { return b.id === id; }); };
  var F = B('forest'), M = B('meadow'), D = B('darkforest');

  // [model file, real height in metres, points]
  var PLAN = [];
  function add(models, hM, pts) { pts.forEach(function (p, i) { PLAN.push([models[i % models.length], hM * (0.8 + rnd() * 0.4), p]); }); }
  if (F) {
    add(['mapletree-1', 'mapletree-2', 'mapletree-3', 'mapletree-4', 'mapletree-5'], 11, scatter(F.center[0], F.center[1], F.radius * 0.95, 0, 70, 7));
    add(['birchtree-1', 'birchtree-2', 'birchtree-3'], 12, scatter(F.center[0], F.center[1], F.radius * 0.95, 0, 25, 6));
    add(['bush', 'bush-flowers', 'bush-large'], 1.6, scatter(F.center[0], F.center[1], F.radius, 0, 60, 3));
    add(['flower-1-clump', 'flower-2-clump', 'flower-3-clump'], 0.5, scatter(F.center[0], F.center[1], F.radius, 0, 60, 2));
  }
  if (M) {
    add(['grass-large', 'grass-small', 'grass-large-extruded'], 0.7, scatter(M.center[0], M.center[1], M.radius, 0, 220, 2.5));
    add(['flower-4-clump', 'flower-5-clump', 'flower-1-clump'], 0.5, scatter(M.center[0], M.center[1], M.radius, 0, 90, 2));
    add(['bush-small-flowers', 'bush-large-flowers'], 1.4, scatter(M.center[0], M.center[1], M.radius, 0, 30, 4));
    add(['birchtree-4', 'birchtree-5'], 12, scatter(M.center[0], M.center[1], M.radius, M.radius * 0.6, 10, 8));
  }
  if (D) add(['deadtree-1', 'deadtree-2', 'deadtree-3', 'deadtree-4', 'deadtree-5', 'deadtree-6', 'deadtree-7', 'deadtree-8', 'deadtree-9', 'deadtree-10'], 9, scatter(D.center[0], D.center[1], D.radius, 45, 70, 6));
  add(['grass-large', 'grass-small', 'bush-small'], 0.8, scatter(0, 0, 368, 250, 140, 3));   // outer city belt verges

  // ── build one InstancedMesh per model part ──
  var byModel = {}; PLAN.forEach(function (e) { (byModel[e[0]] = byModel[e[0]] || []).push(e); });
  var made = 0, instances = 0, failed = 0;
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  Object.keys(byModel).forEach(function (name) {
    var list = byModel[name];
    loader.load('/assets/models/nature/' + name + '.glb', function (g) {
      g.scene.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(g.scene), sz = box.getSize(new THREE.Vector3());
      var parts = []; g.scene.traverse(function (o) { if (o.isMesh) parts.push(o); });
      parts.forEach(function (part) {
        var im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        im.castShadow = /tree/.test(name); im.receiveShadow = true; im.name = 'nature-' + name;   // only trees cast shadows (perf)
        list.forEach(function (e, i) {
          var k = (e[1] * PM) / (sz.y || 1), x = e[2][0], z = e[2][1];
          _q.setFromAxisAngle(_up, (x * 12.9898 + z * 78.233) % (Math.PI * 2));
          _s.set(k, k, k); _p.set(x, heightAt(x, z) - box.min.y * k, z);
          _m.compose(_p, _q, _s).multiply(part.matrixWorld);
          im.setMatrixAt(i, _m);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();   // bounds over ALL instances, so off-screen batches are culled
        group.add(im); made++;
      });
      instances += list.length;
    }, undefined, function () { failed++; });
  });
  return { group: group, stats: function () { return { planned: PLAN.length, instances: instances, meshes: made, failed: failed }; } };
};
