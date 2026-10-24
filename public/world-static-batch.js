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

  /* SAFE MODE (2026-10-24, default ON from world-main.js; ?batch=0 = off). Differences from run():
   *  - merges SIBLINGS only (same parent), in parent-local space, and adds the merged mesh to that parent, so hiding / moving / LOD-toggling
   *    any ancestor still applies exactly as before, and frustum culling stays per group;
   *  - the material signature is wider (maps, offsets, alphaTest, tone mapping) and must be STABLE: values are sampled twice `settleMs` apart
   *    and a material that changed (pulsing emissive etc.) is never merged; a watchdog re-checks every 2 s and undoes a bucket whose
   *    materials start changing later;
   *  - the work is spread over frames (`perSlice` buckets per tick) so it never stalls the first seconds of play. */
  function sig2(m) { return sig(m) + '|' + [m.normalMap && m.normalMap.uuid, m.roughnessMap && m.roughnessMap.uuid, m.metalnessMap && m.metalnessMap.uuid,
    m.aoMap && m.aoMap.uuid, m.envMap && m.envMap.uuid, m.envMapIntensity, m.alphaTest, m.polygonOffset ? [m.polygonOffsetFactor, m.polygonOffsetUnits].join(',') : 0,
    m.toneMapped ? 1 : 0, m.depthTest ? 1 : 0, m.colorWrite ? 1 : 0, m.visible ? 1 : 0].join('|'); }
  function tf(m) { return (m.visible ? 1 : 0) + ':' + m.matrix.elements.join(','); }   /* visibility + transform */
  function runSafe(o) {
    var THREE = o.THREE, scene = o.scene, merge = o.mergeGeometries, minGroup = o.minGroup || 3, log = o.log || function () {}, perSlice = o.perSlice || 12;
    if (!THREE || !scene || !merge) return Promise.resolve(null);
    var t0 = {}; scene.traverse(function (x) { if (eligible(x, THREE)) t0[x.material.uuid] = sig2(x.material); });
    return new Promise(function (res) { setTimeout(res, o.settleMs || 3000); }).then(function () {
      var buckets = {}, list = [];
      scene.traverse(function (x) {
        if (!eligible(x, THREE) || !x.parent) return; for (var p = x.parent; p; p = p.parent) if (p.visible === false) return;
        var s = sig2(x.material); if (t0[x.material.uuid] !== s) return;   // changed during the settle window: animated, leave it alone
        var k = x.parent.uuid + '|' + s + '|' + (x.geometry.attributes.uv ? 'uv' : 'nouv') + '|' + (x.geometry.attributes.color ? 'c' : '') + '|' + (x.castShadow ? 1 : 0) + (x.receiveShadow ? 1 : 0) + '|' + x.renderOrder;
        if (!buckets[k]) { buckets[k] = []; list.push(k); } buckets[k].push(x);
      });
      var stats = { removed: 0, merged: 0, reverted: 0 }, entries = [];
      return new Promise(function (done) {
        var i = 0;
        (function slice() {
          for (var n = 0; n < perSlice && i < list.length; i++) {
            var group = buckets[list[i]]; if (group.length < minGroup) continue; n++;
            var parent = group[0].parent, geos = group.map(function (m) {
              var g = m.geometry.clone(); g.applyMatrix4(m.matrix);
              Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal' && a !== 'uv' && a !== 'color') g.deleteAttribute(a); });
              g.clearGroups(); return g.index ? g.toNonIndexed() : g;
            }), geo = null;
            try { geo = merge(geos, false); } catch (e) { geo = null; }
            geos.forEach(function (g) { g.dispose(); }); if (!geo) continue;
            var mesh = new THREE.Mesh(geo, group[0].material); mesh.name = 'static-batch'; mesh.castShadow = group[0].castShadow; mesh.receiveShadow = group[0].receiveShadow;
            mesh.renderOrder = group[0].renderOrder; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); geo.computeBoundingSphere(); geo.computeBoundingBox();
            parent.add(mesh); mesh.updateMatrixWorld(true);
            var e = { mesh: mesh, originals: group.map(function (m) { return { m: m, parent: parent, s: sig2(m.material), t: tf(m) }; }) };
            group.forEach(function (m) { parent.remove(m); }); undoStack.push(e); entries.push(e); stats.merged++; stats.removed += group.length;
          }
          if (i < list.length) setTimeout(slice, 0); else done();
        })();
      }).then(function () {
        log('[batch] safe mode: ' + stats.removed + ' sibling meshes merged into ' + stats.merged);
        // watchdog: a bucket whose materials start changing (late-starting animation) goes back to its original meshes
        var w = setInterval(function () {
          for (var j = entries.length - 1; j >= 0; j--) {
            var e = entries[j], bad = e.originals.some(function (r) { return sig2(r.m.material) !== r.s || tf(r.m) !== r.t; }); if (!bad) continue;
            if (e.mesh.parent) e.mesh.parent.remove(e.mesh); e.originals.forEach(function (r) { r.parent.add(r.m); }); e.mesh.geometry.dispose();
            entries.splice(j, 1); var u = undoStack.indexOf(e); if (u >= 0) undoStack.splice(u, 1); stats.reverted++;
          }
        }, 2000);
        stats.stopWatchdog = function () { clearInterval(w); };
        return stats;
      });
    });
  }
  root.WorldStaticBatch = { run: run, runSafe: runSafe, undo: undo };
})(typeof window !== 'undefined' ? window : globalThis);
