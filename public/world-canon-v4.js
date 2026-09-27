/* world-canon-v4.js — the CANON city from Blender, in the game (Map v4, ?map=v4), 2026-09-26.
 *
 * tools/blender/canon/build_canon.py builds the owner's canonical layout (atlas image 37 → world-layout.json) and
 * exports it: public/assets/world/canon-v4.glb (Grid streets + blocks, SHADDAI monument + Central Station, Agora,
 * agent pads, Meadowfields Halt boulevard + civic halls + amphitheater, Quill Forest) in METRES, glTF +Y up with
 * z = -Y — exactly the game's axes, so the whole scene just scales by U. Heights were baked from the same
 * height16.bin the game terrain uses, so every block already sits ON the ground.
 * Colliders (public/assets/world/canon-colliders-v4.json, game units): 1686 rotated boxes + circles → pushed into
 * WORLD_LAYOUT.realmColliders (world-collision.js handles rotated boxes) → solid buildings, no walking through.
 * Walkable tops are published on window.WORLD_WALKABLE_TOPS for the player controller (stand on roofs/decks).
 *
 *   window.buildWorldCanonV4({ THREE, scene, loader }) → Promise<{ group, stats() }>
 */
(function () {
  var U = 7 / 1.8;
  window.buildWorldCanonV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader;
    var st = { meshes: 0, obb: 0, circle: 0 };
    var glb = new Promise(function (res, rej) { loader.load('/assets/world/canon-v4.glb?v=3', res, undefined, rej); });
    var col = fetch('/assets/world/canon-colliders-v4.json?v=3').then(function (r) { return r.json(); });
    return Promise.all([glb, col]).then(function (both) {
      var g = both[0], C = both[1];
      var root = g.scene; root.name = 'world-canon-v4'; root.scale.setScalar(U);   // metres → units (axes already match)
      root.traverse(function (o) {
        if (!o.isMesh) return;
        st.meshes++; o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = false;
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) { if (m && m.emissive && m.emissiveIntensity > 0) m.toneMapped = true; });
      });
      root.updateMatrixWorld(true);
      scene.add(root);
      var L = window.WORLD_LAYOUT, tops = window.WORLD_WALKABLE_TOPS = window.WORLD_WALKABLE_TOPS || [];
      if (L && L.realmColliders) {
        C.obb.forEach(function (b) {
          if (b.walkableTop) { tops.push({ type: 'obb', x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, top: b.top, kind: b.kind, deck: true }); return; }   // bridge decks / overlook: stand ON them, walk UNDER them
          L.realmColliders.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, label: 'canon:' + b.kind }); st.obb++;
          tops.push({ type: 'obb', x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, top: b.top, kind: b.kind });
        });
        C.circle.forEach(function (c) {
          if (c.walkableTop) { tops.push({ type: 'circle', x: c.x, z: c.z, r: c.r, top: c.top, kind: c.kind }); return; }   // decks: stand on, not a wall
          L.realmColliders.push({ x: c.x, z: c.z, r: c.r, label: 'canon:' + c.kind }); st.circle++;
          tops.push({ type: 'circle', x: c.x, z: c.z, r: c.r, top: c.top, kind: c.kind });
        });
        if (window.buildWorldCollision) window.buildWorldCollision(L);   // re-register with the new solids
      }
      console.info('[canon-v4] ' + st.meshes + ' meshes · ' + st.obb + ' box + ' + st.circle + ' round colliders · ' + tops.length + ' walkable tops');
      return { group: root, stats: function () { return st; } };
    });
  };
})();
