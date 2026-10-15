/* world-merge.js — ONE shared static-bake helper (2026-10-04). Replaces the per-module copies going forward.
 *   WorldMerge.bake(root, THREE, { skip?: Set<Object3D>, name?: string }) → { before, after }
 * Bakes every STATIC mesh under `root` into one mesh per identical-looking material (type, colour, emissive, opacity,
 * blending, side, map, roughness/metalness). Leaves alone: InstancedMesh, SkinnedMesh, morph targets, multi-material
 * meshes, anything in `skip` (and its subtree) and meshes flagged userData.live. Merged meshes are children of `root`
 * in root-local space. Only call it on a group you KNOW is static after build (no per-frame transforms/visibility on children). */
(function (root) {
  'use strict';
  function key(m) {
    return m.type + '|' + (m.color ? m.color.getHex() : '') + '|' + (m.emissive ? m.emissive.getHex() + ':' + m.emissiveIntensity : '') + '|' + m.transparent + ':' + m.opacity + ':' + m.blending + ':' + m.side + ':' + m.depthWrite + '|' + (m.map ? m.map.uuid : '') + '|' + (m.vertexColors ? 'vc' : '') + '|' + (m.roughness != null ? m.roughness + ':' + m.metalness : '');
  }
  function bake(group, THREE, opt) {
    opt = opt || {}; var skip = opt.skip || null, before = 0;
    group.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), m4 = new THREE.Matrix4(), byKey = new Map();
    group.traverse(function (o) {
      if (!o.isMesh) return; before++;
      if (o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || (o.userData && o.userData.live)) return;
      var g0 = o.geometry; if (!g0 || !g0.attributes.position || (g0.morphAttributes && Object.keys(g0.morphAttributes).length)) return;
      if (g0.attributes.color && !o.material.vertexColors) return;
      if (skip) for (var a = o; a && a !== group; a = a.parent) if (skip.has(a)) return;
      var k = key(o.material); if (!byKey.has(k)) byKey.set(k, { mat: o.material, items: [] }); byKey.get(k).items.push(o);
    });
    var after = before;
    byKey.forEach(function (e) {
      if (e.items.length < 2) return;
      var geos = e.items.map(function (o) { var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals(); return g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); });
      var uv = geos.every(function (g) { return g.attributes.uv && g.attributes.uv.itemSize === 2; }), vc = !!e.mat.vertexColors && geos.every(function (g) { return g.attributes.color && g.attributes.color.itemSize === 3; });
      var n = 0, off = 0; geos.forEach(function (g) { n += g.attributes.position.count; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = uv ? new Float32Array(n * 2) : null, C = vc ? new Float32Array(n * 3) : null;
      geos.forEach(function (g) { P.set(g.attributes.position.array, off * 3); N.set(g.attributes.normal.array, off * 3); if (UV) UV.set(g.attributes.uv.array, off * 2); if (C) C.set(g.attributes.color.array, off * 3); off += g.attributes.position.count; g.dispose(); });
      var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      if (UV) mg.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); if (C) mg.setAttribute('color', new THREE.BufferAttribute(C, 3)); mg.computeBoundingSphere();
      var mesh = new THREE.Mesh(mg, e.mat); mesh.name = (opt.name || group.name || 'baked') + '-baked'; mesh.castShadow = e.items.some(function (o) { return o.castShadow; }); mesh.receiveShadow = e.items.some(function (o) { return o.receiveShadow; });
      e.items.forEach(function (o) { if (o.parent) o.parent.remove(o); }); group.add(mesh); after -= e.items.length - 1;
    });
    return { before: before, after: after };
  }
  root.WorldMerge = { bake: bake };
})(typeof window !== 'undefined' ? window : globalThis);
