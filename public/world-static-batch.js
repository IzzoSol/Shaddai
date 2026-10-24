/* world-static-batch.js — STATIC DRAW-CALL BATCHER (2026-10-11, opt-in `?batch=1`).
 * The measured boot (docs/perf-drawcall-audit.json) showed ~1,800 of 2,300 scene draw submissions are loose, unnamed meshes, mostly one BoxGeometry per
 * mesh each with its own material. This pass runs once after the world is playable and merges FROZEN meshes (matrixAutoUpdate === false) that share the
 * same material VALUES into one world-space mesh per material signature.
 *
 *   WorldStaticBatch.run({ THREE, scene, mergeGeometries, minGroup: 8, log })  -> { before, after, merged, removed, groups }
 * Safe-by-default rules: only plain Mesh (no InstancedMesh / SkinnedMesh / morph targets), single material, matrixAutoUpdate false, userData empty, visible,
 * not transparent/additive, no custom onBeforeRender, geometry has position + normal. Originals are detached (not disposed) and kept in
 * WorldStaticBatch.undo() so `?batch=0` style rollbacks are possible at runtime. Nothing here touches meshes that are named or interactive.
 */
(function (root) {
  'use strict';
  var undoStack = [];
  function sig(m) {
    var c = function (x) { return x && x.getHex ? x.getHex() : 0; };
    return [m.type, c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.side, m.vertexColors ? 1 : 0,
      m.map ? m.map.uuid : '', m.emissiveMap ? m.emissiveMap.uuid : '', m.flatShading ? 1 : 0, m.fog === false ? 0 : 1].join('|');
  }
  function eligible(o, THREE) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.matrixAutoUpdate !== false) return false;
    if (o.name || Object.keys(o.userData || {}).length || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
    var m = o.material; if (!m || Array.isArray(m) || m.transparent || m.blending !== THREE.NormalBlending || m.depthWrite === false || m.wireframe) return false;
    if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return false;
    var g = o.geometry; if (!g || !g.attributes || !g.attributes.position || !g.attributes.normal || g.morphAttributes && Object.keys(g.morphAttributes).length) return false;
    return true;
  }
  function run(o) {
    var THREE = o.THREE, scene = o.scene, merge = o.mergeGeometries, minGroup = o.minGroup || 8, log = o.log || function () {};
    if (!THREE || !scene || !merge) return null;
    var count = function () { var n = 0; scene.traverse(function (x) { if ((x.isMesh || x.isPoints || x.isLine) && x.visible) n++; }); return n; };
    var before = count(), buckets = {};
    scene.updateMatrixWorld(true);
    scene.traverse(function (x) {
      if (!eligible(x, THREE)) return; for (var p = x.parent; p; p = p.parent) if (p.visible === false) return;   // skip anything under a hidden parent
      var k = sig(x.material) + '|' + (x.geometry.attributes.uv ? 'uv' : 'nouv') + '|' + (x.castShadow ? 1 : 0) + (x.receiveShadow ? 1 : 0);
      (buckets[k] = buckets[k] || []).push(x);
    });
    var merged = 0, removed = 0, groups = 0;
    Object.keys(buckets).forEach(function (k) {
      var list = buckets[k]; if (list.length < minGroup) return;
      var geos = list.map(function (m) {
        var g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
        Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal' && a !== 'uv' && a !== 'color') g.deleteAttribute(a); });
        g.clearGroups(); return g.index ? g.toNonIndexed() : g;
      });
      var geo; try { geo = merge(geos, false); } catch (e) { log('[batch] merge failed for a bucket: ' + (e && e.message)); geos.forEach(function (g) { g.dispose(); }); return; }
      geos.forEach(function (g) { g.dispose(); });
      if (!geo) return;
      var mesh = new THREE.Mesh(geo, list[0].material); mesh.name = 'static-batch'; mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow;
      mesh.matrixAutoUpdate = false; mesh.frustumCulled = true; geo.computeBoundingSphere();
      scene.add(mesh); undoStack.push({ mesh: mesh, originals: list.map(function (m) { return { m: m, parent: m.parent }; }) });
      list.forEach(function (m) { if (m.parent) m.parent.remove(m); }); merged++; removed += list.length; groups++;
    });
    var after = count(); log('[batch] meshes ' + before + ' -> ' + after + ' (' + removed + ' merged into ' + merged + ')');
    return { before: before, after: after, merged: merged, removed: removed, groups: groups };
  }
  function undo() { undoStack.forEach(function (u) { if (u.mesh.parent) u.mesh.parent.remove(u.mesh); u.originals.forEach(function (r) { if (r.parent) r.parent.add(r.m); }); }); var n = undoStack.length; undoStack = []; return n; }
  root.WorldStaticBatch = { run: run, undo: undo };
})(typeof window !== 'undefined' ? window : globalThis);
