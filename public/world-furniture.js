/* world-furniture.js — SHADDAI furniture library for world-interiors-v3 (Blender kit K12, owner refs: chunky sci-fi set).
 *
 *   window.SHADDAI_FURNITURE = { kinds, meta(kind), build(kind) → THREE.Object3D, load(THREE, GLTFLoader) → Promise }
 *
 * The object exists as soon as this script runs; kinds stay empty (interiors fall back to their built-in boxes) until
 * load() has parsed /assets/kits/shaddai_furniture_kit_v01.glb. Interiors resolve kinds when a room is laid out (on
 * approach), so rooms entered after the load get the real models. Nodes are furn_<kind>, metres, origin at the floor
 * centre of the footprint, front = +z — the same contract as the FALLBACK table in world-interiors-v3.js.
 */
(function (root) {
  'use strict';
  var URL = '/assets/kits/shaddai_furniture_kit_v01.glb';
  var src = {}, info = {};
  var lib = {
    kinds: [],
    meta: function (kind) { return info[kind] || null; },
    build: function (kind) { var s = src[kind]; return s ? s.clone(true) : null; },
    load: function (THREE, GLTFLoader) {
      if (lib._p) return lib._p;
      lib._p = new Promise(function (resolve) {
        new GLTFLoader().load(URL, function (gltf) {
          var box = new THREE.Box3(), size = new THREE.Vector3();
          gltf.scene.traverse(function (o) {
            if (!o.name || o.name.indexOf('furn_') !== 0 || (o.parent && o.parent.name.indexOf('furn_') === 0)) return;
            var kind = o.name.slice(5).replace(/_/g, '-');
            o.position.set(0, 0, 0); o.updateMatrixWorld(true);
            box.setFromObject(o); box.getSize(size);
            o.traverse(function (m) { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
            src[kind] = o;
            info[kind] = { footprint_m: [+size.x.toFixed(3), +size.z.toFixed(3)], height_m: +size.y.toFixed(3) };
          });
          lib.kinds = Object.keys(src);
          resolve(lib.kinds.length);
        }, undefined, function (err) { console.warn('[furniture] kit failed to load, interiors keep box fallback:', err && err.message); resolve(0); });
      });
      return lib._p;
    }
  };
  root.SHADDAI_FURNITURE = lib;
})(typeof window !== 'undefined' ? window : globalThis);
