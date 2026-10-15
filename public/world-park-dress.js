/* world-park-dress.js — HOVERSKATE PARK v2 dressing from the Blender kit K25 (2026-10-15, owner skate-park ref: gold-lantern torii gate,
 * stands round the bowl, lane lights, glowing rim). Pure set dressing on top of the code-built park (world-hoverpark-v2.js): nothing here
 * is ridden; the stands and gate pillars are solid only through the park's own colliders (none added).
 *
 *   WorldParkDress.dress({ THREE, GLTFLoader, park, base?, layout? }) -> Promise<{ group, stats }>
 *     park = the object WorldHoverPark.build() returned (its .group is the park root at deck height, yawed toward the city).
 * Placements: /assets/world/park-dress-v2.json — park-local METRES, three frame, yaw = rotation.y, y null = deck (Blender preview used
 * deck = 1.2 m, so explicit y values are given relative to that and shifted here). One InstancedMesh per piece primitive: 132 pieces,
 * ~27 draws. Missing GLB / JSON = nothing happens. ?parkdress=0 = off.
 */
(function (root) {
  'use strict';
  var DECK_M = 1.2;
  function load(loader, url) { return new Promise(function (res) { loader.load(url, res, undefined, function () { console.warn('[park-dress] missing', url); res(null); }); }); }
  function getJSON(url) { return (root.fetch ? root.fetch(url).then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null)).catch(function () { return null; }); }

  /* pure: JSON pieces -> { name: [{x, y, z, yaw}] } in park-local metres with the deck at y = 0 */
  function plan(J) {
    var out = {};
    (J && J.pieces || []).forEach(function (p) {
      var y = p[4] == null ? 0 : (+p[4] - DECK_M);
      (out[p[0]] = out[p[0]] || []).push({ x: +p[1], y: y, z: +p[2], yaw: +p[3] });
    });
    return out;
  }

  function dress(o) {
    var THREE = o.THREE, base = o.base || '/assets/kits/', park = o.park;
    if (!park || !park.group || (root.location && /[?&]parkdress=0/.test(root.location.search || ''))) return Promise.resolve(null);
    var U = park.U || o.U || 7 / 1.8;
    return Promise.all([load(new o.GLTFLoader(), base + 'shaddai_park_dress_v01.glb'), o.layout ? Promise.resolve(o.layout) : getJSON('/assets/world/park-dress-v2.json')]).then(function (r) {
      var gl = r[0], J = r[1]; if (!gl || !J) return null;
      var g = new THREE.Group(); g.name = 'park-dress'; g.scale.setScalar(U); park.group.add(g);
      var nodes = {}; gl.scene.updateMatrixWorld(true);
      gl.scene.traverse(function (n) { if (/^park_[a-z]+$/.test(n.name) && !nodes[n.name]) nodes[n.name] = n; });
      var P = plan(J), stats = { pieces: 0, instancedMeshes: 0 }, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
      Object.keys(P).forEach(function (name) {
        var nd = nodes[name], list = P[name]; if (!nd) return;
        var inv = new THREE.Matrix4().copy(nd.matrixWorld).invert();
        nd.traverse(function (mesh) {
          if (!mesh.isMesh) return;
          var local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
          var im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length); im.name = 'parkdress-' + name;
          list.forEach(function (p, i) { m4.compose(pv.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), one); im.setMatrixAt(i, m4.multiply(local)); });
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); g.add(im); stats.instancedMeshes++;
        });
        stats.pieces += list.length;
      });
      console.info('[park-dress]', stats);
      return { group: g, stats: stats };
    });
  }

  root.WorldParkDress = { dress: dress, _plan: plan, DECK_M: DECK_M };
})(typeof window !== 'undefined' ? window : globalThis);
