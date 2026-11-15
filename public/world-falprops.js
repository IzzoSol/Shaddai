/* world-falprops.js — the fal-generated models, placed at REAL size (2026-09-24).
 *
 * SCALE LAW (owner decision): characters are 7 units tall, so 1 real metre = 7/1.8 ≈ 3.89 world units.
 * Every model here is sized from its REAL dimension in metres × PM — a 15 m shop is ~58 units tall,
 * four times a player, not character-height.
 *
 * Loaded as a classic script right after world-layout.js: at parse time it appends each solid model's
 * collider to WORLD_LAYOUT.realmColliders, so world-collision.js blocks it and world-terrain.js keeps
 * the ground under it flat (flatZones). The meshes load later via buildWorldFalProps({ THREE, scene, loader, heightAt }).
 * Source of truth for positions: fal-assets/production/placements.js (World Planner) — keep them in step.
 */
(function () {
  var PM = 7 / 1.8;   // world units per real metre
  var L = window.WORLD_LAYOUT;
  if (!L) return;
  var face = function (x, z) { return Math.atan2(-x, -z); };   // yaw that faces the city center

  // roadside signs: one at each light-trail head, 14u to the side of the road so the path stays clear
  // MAP v2: one sign at the head of every road (bearing toward each realm + the colosseum)
  var TRAILS = (L.biomes || []).filter(function (b) { return b.id !== 'grid'; }).map(function (b) { return Math.atan2(b.center[1], b.center[0]); });
  var _coF = L.landmark && L.landmark('colosseum'); if (_coF) TRAILS.push(Math.atan2(_coF.pos[1], _coF.pos[0]));
  var signs = TRAILS.map(function (a) {
    var r = 84, px = -Math.sin(a) * 14, pz = Math.cos(a) * 14;
    return [Math.cos(a) * r + px, Math.sin(a) * r + pz];
  });
  var ring = function (r, n, off) { var o = []; for (var i = 0; i < n; i++) { var a = off + i * 2 * Math.PI / n; o.push([Math.sin(a) * r, Math.cos(a) * r]); } return o; };
  var dockAt = [-209, 209], oc = (L.biomes || []).find(function (b) { return b.id === 'ocean'; });
  var seaYaw = oc ? Math.atan2(oc.center[0] - dockAt[0], oc.center[1] - dockAt[1]) : 0;

  // m = real size in metres: { h } = height, or { len } = longest horizontal side (flat things)
  // col = collider radius as a fraction of the placed half-width (0 = walk-through / walk-on)
  var ITEMS = [
    { id: 'bld-shop',       m: { len: 13 }, at: [[-40, -85]], col: 0.8, label: 'SHOP' },   // ASSET-SPEC 12x12 m base: this model is wide, so size by footprint
    { id: 'bld-arcade',     m: { h: 16 },  at: [[62, -55]],    col: 0.8, label: 'ARCADE' },
    { id: 'prop-neon-tree', m: { h: 6 },   at: [ring(130, 6, Math.PI / 6)[1], ring(130, 6, Math.PI / 6)[3], ring(130, 6, Math.PI / 6)[5], [0, -60], [40, -40], [-20, -50]], col: 0.18 },
    { id: 'prop-signpost',  m: { h: 3.5 }, at: signs, col: 0.25, faceRoad: true },
    { id: 'prop-crate',     m: { h: 1.2 }, at: [[36, 110], [44, 118], [30, 122], [-86, 124]], col: 0.7 },
    // hub-dock held back: the harbor already has a dock + boats there (probe-overlap); it goes to the ocean farm field next
  ];

  // MISSING-BUILDINGS fix (2026-11-11): the two fal buildings in the middle of SHADDAI City
  // (bld-shop at [-40,-85], bld-arcade at [62,-55]) build by DEFAULT now — they are the
  // inside-circle buildings. ?falbld=0 opts back out. (The old ?falbld=1 opt-in never
  // worked: raw 0x08 byte instead of \b in the regex.)
  if (typeof location !== 'undefined' && /[?&]falbld=0\b/.test(location.search)) ITEMS = ITEMS.filter(function (it) { return it.id !== 'bld-shop' && it.id !== 'bld-arcade'; });

  // pre-measured footprint radius (units) for colliders, from each model's real size and aspect
  var ASPECT = { 'bld-shop': 1.0, 'bld-arcade': 0.96, 'prop-neon-tree': 1.22, 'prop-signpost': 0.62, 'prop-crate': 1.4, 'hub-dock': 1 };   // width/height, measured in-world (probe-falprops)
  ITEMS.forEach(function (it) {
    if (!it.col) return;
    var halfW = ((it.m.h || it.m.len) * PM * (ASPECT[it.id] || 1)) / 2;
    it.at.forEach(function (p) { L.realmColliders.push({ x: p[0], z: p[1], r: Math.max(1.5, halfW * it.col), label: 'fal-' + it.id }); });
  });
  window.WORLD_FAL_ITEMS = ITEMS;

  window.buildWorldFalProps = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt || function () { return 0; };
    if (!THREE || !scene || !loader) return null;
    var group = new THREE.Group(); group.name = 'world-fal-props'; scene.add(group);
    var placed = 0, failed = 0;
    ITEMS.forEach(function (it) {
      (window.__queueLoad || function (l, u, a, b) { l.load(u, a, undefined, b); })(loader, '/assets/models/fal/' + it.id + '.glb?v=20260924', function (g) {
        it.at.forEach(function (p, k) {
          var m = k === 0 ? g.scene : g.scene.clone(true);
          m.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
          var box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
          var s = it.m.h ? (it.m.h * PM) / (sz.y || 1) : (it.m.len * PM) / (Math.max(sz.x, sz.z) || 1);
          m.scale.multiplyScalar(s);
          var holder = new THREE.Group();
          holder.add(m);
          var b2 = new THREE.Box3().setFromObject(m), c2 = b2.getCenter(new THREE.Vector3());
          m.position.x -= c2.x; m.position.z -= c2.z;                         // center the footprint on the spot
          m.position.y -= it.water ? b2.max.y - 0.6 : b2.min.y;               // feet on the ground / deck just above water
          holder.position.set(p[0], it.water ? 0.05 : heightAt(p[0], p[1]), p[1]);
          holder.rotation.y = it.yaw != null ? it.yaw : it.faceRoad ? face(p[0], p[1]) + Math.PI / 2 : face(p[0], p[1]);
          holder.name = 'fal-' + it.id + '-' + k;
          holder.userData.falId = it.id; holder.userData.label = it.label || null;
          group.add(holder); placed++;
          if (window.__registerPlaceable) window.__registerPlaceable('fal:' + it.id + '#' + k, holder, { source: 'world-falprops.js', id: it.id });
        });
      }, function (err) { failed++; console.warn('[falprops] failed ' + it.id + ': ' + (err && (err.message || err))); });
    });
    return { group: group, stats: function () { return { placed: placed, failed: failed, colliders: L.realmColliders.filter(function (c) { return /^fal-/.test(c.label); }).length }; } };
  };
})();
