/* world-realm-kits.js — realm towns around every maglev ring station (Blender kits K10 buildings + K19 props), 2026-10-15.
 *
 *   WorldRealmKits.build({ THREE, GLTFLoader, scene, transit: window.__worldTransitApi, heightAt, base? }) → Promise<{ group, stats }>
 *
 * Each ring station gets an authored town on its lift side (station-local +z = toward the city, where the lift lands):
 * a hall facing the station, two shops lining the approach path, two towers behind, plus that realm's PURPOSEFUL props
 * (Emberfall: rune pad on the plaza, spires framing the path, ember vents + lava rocks on the far side; forest: moss
 * pillars + glow mushrooms; desert: sand-arch gate + hoodoo path markers + mesas on the skyline; ...). Nothing random.
 * Every piece type is ONE InstancedMesh per material primitive across all towns (draw calls stay flat). Buildings and
 * the big props are solid (circle colliders pushed to WORLD_LAYOUT.realmColliders, then collision rebuilt).
 * Kits are metres; the world is units (PM = 7/1.8). Missing GLBs are skipped. ?realmkits=0 = off.
 */
(function (root) {
  'use strict';
  var PM = 7 / 1.8, BASE = '/assets/kits/';
  // station realm -> prop realm key in shaddai_realm_props_v01.glb
  var PROP_REALM = { volcano: 'emberfall', forest: 'swamp', desert: 'desert', ocean: 'ocean', meadow: 'meadow', void: 'void', arctic: 'arctic', darkforest: 'darkforest' };
  // layouts in station-local METRES: [x along the track, z toward the lift/city, yawDeg, scale]; mirrored pairs use +-x
  function pair(x, z, yaw, s) { return [[x, z, yaw || 0, s || 1], [-x, z, -(yaw || 0), s || 1]]; }
  // COMPACT STATION CLUSTER (owner refs 2026-10-16, image 70/76/81: vast realm land + one compact functional cluster per station):
  // hall + shop + tower at the station, then a short avenue to the inn, a workshop and 2 buyable homes on a cross street. 7 buildings, all within ~150 m.
  var BUILDINGS = [['hall', 0, 70, 180, 1], ['shop', 30, 40, -90, 1], ['tower', -34, 96, 135, 1]];
  var TOWN = [['inn', 0, 150, 180, 1], ['workshop', 30, 140, -90, 1], ['home', 56, 104, 0, 1], ['home', -56, 104, 0, 1]];
  // STREETS in station-local metres: [x0, z0, x1, z1, widthM]
  var STREETS = [[0, 92, 0, 136, 12], [-70, 118, 70, 118, 10]];
  var PROPS = {
    emberfall: { rune_pad: [[0, 30, 0, 1]], obsidian_spire: pair(11, 22, 20, 0.8).concat(pair(13, 56, -30, 0.7), pair(150, 190, 40, 2.4)), ember_vent: pair(55, 70, 0, 0.9), lava_rock: pair(46, 36, 30, 1.2) },
    swamp: { moss_pillar: pair(22, 40, 15, 1.6).concat(pair(28, 84, 70, 1.8)), glow_mushrooms: pair(10, 30, 0, 3).concat(pair(16, 64, 40, 3), [[0, 96, 0, 3]]), reed_clump: pair(42, 58, 0, 1.4), dead_tree: pair(120, 150, 30, 1.7) },
    desert: { sand_arch: [[0, 28, 0, 1.4]], hoodoo: pair(8, 44, 10, 1.2).concat(pair(9, 64, -20, 1.1)), mesa: pair(230, 320, 40, 3) },
    ocean: { reef_ruin: pair(62, 92, 25, 1.2) },
    meadow: { rune_arch: [[0, 40, 0, 1]] },
    void: { rift_gate: [[0, 40, 0, 1]] },
    arctic: { ice_spire: pair(18, 46, 0, 1.3).concat(pair(25, 86, 40, 1.4), pair(135, 175, 20, 2.5)) },
    darkforest: { rune_stone: [[0, 30, 0, 1], [0, 72, 0, 1]] }
  };
  var SOLID_R = { hall: 13, shop: 8.5, tower: 10, home: 6.5, workshop: 10, inn: 10, apartments: 8.5, obsidian_spire: 2.6, moss_pillar: 4.2, sand_arch: 0, hoodoo: 1.6, mesa: 14, rune_arch: 3.5, rift_gate: 0, ice_spire: 3, rune_stone: 0, reef_ruin: 0, ember_vent: 2.8, lava_rock: 2 };

  function load(loader, url) { return new Promise(function (res) { loader.load(url, res, undefined, function () { console.warn('[realm-kits] missing', url); res(null); }); }); }

  /* pure: world placements for one station. st = {x, z, rot} (rot = station group rotation.y); returns [{name, x, z, yaw, s}] in units */
  function placements(st, list) {
    var c = Math.cos(st.rot), s = Math.sin(st.rot), out = [];
    list.forEach(function (p) {
      var lx = p[1] * PM, lz = p[2] * PM;                                  // three rotation.y: x' = x c + z s, z' = -x s + z c
      out.push({ name: p[0], x: st.x + lx * c + lz * s, z: st.z - lx * s + lz * c, yaw: st.rot + p[3] * Math.PI / 180, s: p[4] });
    });
    return out;
  }
  function stationList(transit) {
    return (transit && transit.stations || []).filter(function (t) { return t.onRing !== false && t.realm && t.group; })
      .map(function (t) { return { id: t.id, realm: t.realm, x: t.group.position.x, z: t.group.position.z, rot: t.group.rotation.y }; });
  }

  function build(o) {
    var THREE = o.THREE, base = o.base || BASE, heightAt = o.heightAt || function () { return 0; };
    var group = new THREE.Group(); group.name = 'world-realm-kits'; o.scene.add(group);
    var stats = { towns: 0, instancedMeshes: 0, instances: 0, colliders: 0 }, L = root.WORLD_LAYOUT, cols = L && L.realmColliders;
    var loader = new o.GLTFLoader(), stations = stationList(o.transit), towns_on = o.towns !== false && !(typeof location !== 'undefined' && /[?&]realmtowns=0/.test(location.search || ''));
    var batches = {}, solids = {}, towns = {};                                        // key -> [Matrix4] ; key -> [collider] (only registered once the model exists)
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    function add(key, p, solidR) {
      (batches[key] = batches[key] || []).push(m4.compose(pv.set(p.x, heightAt(p.x, p.z), p.z), q.setFromAxisAngle(up, p.yaw), sv.setScalar(PM * p.s)).clone());
      if (solidR) (solids[key] = solids[key] || []).push({ x: Math.round(p.x), z: Math.round(p.z), r: Math.round(solidR * PM * p.s), label: 'realmkit:' + key });
    }
    var homeLots = [];   // HOME DEEDS: every K10b home lot -> id 'home:<stationId>:<lot>' (backend/home-deed-routes.js), door point in world units
    if (towns_on) stations.forEach(function (st) { var lot = 0; placements(st, TOWN.filter(function (t) { return t[0] === 'home'; })).forEach(function (p) {
      var fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); homeLots.push({ id: 'home:' + st.id + ':' + (lot++), realm: st.realm, x: p.x + fx * 6 * PM, z: p.z + fz * 6 * PM }); }); });
    root.__homeLots = homeLots;
    stations.forEach(function (st) {
      stats.towns++; var sk = st.id + '|';
      placements(st, BUILDINGS.concat(towns_on ? TOWN : [])).forEach(function (p) { add(sk + 'bld:' + st.realm + ':' + p.name, p, SOLID_R[p.name]); });
      var pr = PROPS[PROP_REALM[st.realm]] || {};
      Object.keys(pr).forEach(function (name) {
        placements(st, pr[name].map(function (t) { return [name, t[0], t[1], t[2], t[3]]; })).forEach(function (p) { add(sk + 'prop:' + PROP_REALM[st.realm] + ':' + name, p, SOLID_R[name]); });
      });
    });
    var realms = {}; stations.forEach(function (st) { realms[st.realm] = 1; });
    var jobs = [load(loader, base + 'shaddai_realm_props_v01.glb').then(function (g) { return { kind: 'prop', g: g }; })];
    Object.keys(realms).forEach(function (r) { jobs.push(load(loader, base + 'shaddai_realm_buildings_' + r + '_v01.glb').then(function (g) { return { kind: 'bld', realm: r, g: g }; }));
      if (towns_on) jobs.push(load(loader, base + 'shaddai_realm_town_' + r + '_v01.glb').then(function (g) { return { kind: 'bld', realm: r, g: g }; })); });
    return Promise.all(jobs).then(function (res) {
      var nodes = {};
      res.forEach(function (r) {
        if (!r.g) return; r.g.scene.updateMatrixWorld(true);
        r.g.scene.traverse(function (n) {
          if (r.kind === 'prop' && /^prop_/.test(n.name) && !/_skin$/.test(n.name)) { var k = n.name.slice(5).split('_'); nodes['prop:' + k[0] + ':' + k.slice(1).join('_')] = n; }
          if (r.kind === 'bld' && /^shaddai_bld_/.test(n.name)) nodes['bld:' + r.realm + ':' + n.name.split('_').pop()] = n;
        });
      });
      Object.keys(batches).forEach(function (key) {
        var bar = key.indexOf('|'), sid = key.slice(0, bar), node = nodes[key.slice(bar + 1)]; if (!node) return;
        var town = towns[sid]; if (!town) { var st0 = stations.filter(function (q) { return q.id === sid; })[0]; town = towns[sid] = new THREE.Group(); town.name = 'realm-town-' + sid; town.userData.x = st0.x; town.userData.z = st0.z; group.add(town); }
        if (solids[key] && cols) solids[key].forEach(function (c) { cols.push(c); stats.colliders++; });
        var inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), list = batches[key];
        node.traverse(function (mesh) {
          if (!mesh.isMesh) return;
          var local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
          var im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length); im.name = 'realmkit-' + key;
          list.forEach(function (w, i) { im.setMatrixAt(i, m4.multiplyMatrices(w, local)); });
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
          town.add(im); stats.instancedMeshes++; stats.instances += list.length;
        });
      });
      if (towns_on) stations.forEach(function (st) { var town = towns[st.id]; if (town) { var rd = buildStreets(THREE, st, heightAt); if (rd) { town.add(rd); stats.streets = (stats.streets || 0) + 1; } } });
      if (stats.colliders && root.buildWorldCollision && L) { try { root.buildWorldCollision(L); } catch (e) { console.warn('[realm-kits] collision rebuild', e && e.message); } }
      // FPS: only towns near the player draw (each town is its own group; far ones hidden). Budget: < 80 draw calls total.
      var R2 = Math.pow((o.viewM || 1200) * PM, 2);
      function update(pos) { if (!pos) return; var on = 0; Object.keys(towns).forEach(function (k) { var t = towns[k], dx = t.userData.x - pos.x, dz = t.userData.z - pos.z; t.visible = dx * dx + dz * dz < R2; if (t.visible) on++; }); stats.visibleTowns = on; }
      update(o.getPlayer && o.getPlayer());
      if (o.getPlayer && typeof setInterval === 'function' && o.autoUpdate !== false) setInterval(function () { update(o.getPlayer()); }, 500);
      console.info('[realm-kits]', stats);
      return { group: group, towns: towns, stats: stats, update: update };
    });
  }

  // STREETS: one merged ribbon mesh per town that follows the ground (2 m steps), dark paving with realm-coloured edge lines. 2 draw calls per town.
  var STREET_GLOW = { grid: 0xe8c45c, void: 0xb06cff, desert: 0xffb24a, volcano: 0xff5a2a, forest: 0x2bff88, suburb: 0xaab4c2, meadow: 0xa8ff6a, ocean: 0x4ac8ff, darkforest: 0x2affd0, arctic: 0xbfe8ff };
  var STREET_PAVE = { arctic: 0x9aa6b2, desert: 0x6b5a44, volcano: 0x2a2220, meadow: 0x4a4f44, forest: 0x34403a, darkforest: 0x22262a, ocean: 0x3c4a52, suburb: 0x4a4d52, void: 0x1c1826, grid: 0x23262c };
  function buildStreets(THREE, st, heightAt) {
    var c = Math.cos(st.rot), s = Math.sin(st.rot), pave = [], glow = [];
    function W(lx, lz) { var x = lx * PM, z = lz * PM; return [st.x + x * c + z * s, st.z - x * s + z * c]; }
    function strip(out, x0, z0, x1, z1, half, lift) {
      var L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 2)), ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz, nz = ux;
      for (var i = 0; i < n; i++) { var a = i / n * L, b = (i + 1) / n * L, q = [];
        [[a, -half], [a, half], [b, half], [b, -half]].forEach(function (t) { var w = W(x0 + ux * t[0] + nx * t[1], z0 + uz * t[0] + nz * t[1]); q.push([w[0], heightAt(w[0], w[1]) + lift * PM, w[1]]); });
        out.push(q[0], q[1], q[2], q[0], q[2], q[3]); }
    }
    STREETS.forEach(function (r) { var h = r[4] / 2; strip(pave, r[0], r[1], r[2], r[3], h, 0.12);
      var L = Math.hypot(r[2] - r[0], r[3] - r[1]), nx = -(r[3] - r[1]) / L, nz = (r[2] - r[0]) / L;
      [-1, 1].forEach(function (sd) { strip(glow, r[0] + nx * sd * (h - 0.4), r[1] + nz * sd * (h - 0.4), r[2] + nx * sd * (h - 0.4), r[3] + nz * sd * (h - 0.4), 0.18, 0.16); }); });
    var g = new THREE.Group(); g.name = 'realm-streets-' + st.id;
    [[pave, new THREE.MeshStandardMaterial({ color: STREET_PAVE[st.realm] || 0x2a2d33, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide })],
     [glow, new THREE.MeshBasicMaterial({ color: STREET_GLOW[st.realm] || 0x2bff88, side: THREE.DoubleSide })]].forEach(function (pm) {
      var arr = new Float32Array(pm[0].length * 3); pm[0].forEach(function (v, i) { arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2]; });
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); geo.computeVertexNormals();
      var mesh = new THREE.Mesh(geo, pm[1]); mesh.receiveShadow = true; g.add(mesh); });
    return g;
  }

  root.WorldRealmKits = { build: build, _placements: placements, _stations: stationList, BUILDINGS: BUILDINGS, TOWN: TOWN, STREETS: STREETS, PROPS: PROPS, PROP_REALM: PROP_REALM };
})(typeof window !== 'undefined' ? window : globalThis);
