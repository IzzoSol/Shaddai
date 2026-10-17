/* world-auto-merge.js — STATIC MESH MERGE for draw calls (owner 2026-10-16: "fix draw calls ... SPEED ... no lag").
 * The draw profile showed ~2,000 draw calls at spawn, most of them loose meshes one-per-draw inside decor groups (council towers, plazas,
 * stations, entrances, sky dock...). The old batcher only merges meshes already flagged frozen, which almost none are.
 *
 *   WorldAutoMerge.run({ THREE, scene, mergeGeometries, log }) -> Promise<{ before, after, groups }>
 *   1. CANDIDATES: plain visible single-material meshes (no Skinned/Instanced/morph, not transparent/additive, no custom render hooks)
 *      under top-level groups whose name is not on the DYNAMIC list (interiors, agents, player, boards, mobs, dragons, water, sky...).
 *   2. STABILITY: world matrices are sampled twice, 3 s apart - anything that moved (trains, spinners, doors) is left alone.
 *   3. MERGE: per top-level group x material x 300 m cell, geometry baked into the group's local space, one Mesh added to the SAME
 *      group (so the group's visibility toggles + frustum culling still work). Materials are shared, so glow/colour animation keeps working.
 *   One group per idle slice (no frame stall). Originals are detached (kept for undo()). ?smerge=0 = off.
 */
(function (root) {
  'use strict';
  var DYNAMIC = /interior|agent|avatar|player|hover|board|rider|mob|dragon|wildlife|npc|bot|water|sky|ocean|reef|race|kart|car|ship|traffic|train|ferry|sub|particle|fx|vfx|portal|cursor|waypoint|marker|label|sign|hud|preview|ghost|league|colosseum-arena|ball/i;
  var CELL_U = 300 * 7 / 1.8, undo = [];
  function eligible(o, THREE) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return false;
    if (o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
    var m = o.material; if (!m || Array.isArray(m) || m.transparent || m.blending !== THREE.NormalBlending || m.depthWrite === false || m.wireframe) return false;
    if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.isShaderMaterial) return false;
    var g = o.geometry; if (!g || !g.attributes || !g.attributes.position || !g.attributes.normal || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return false;
    if (o.userData && (o.userData.interactive || o.userData.noMerge)) return false;
    return true;
  }
  function chainVisible(o, top) { for (var p = o; p && p !== top; p = p.parent) if (!p.visible) return false; return true; }
  function idle(fn) { if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 500 }); else setTimeout(fn, 30); }
  function count(scene) { var n = 0; scene.traverse(function (x) { if ((x.isMesh || x.isPoints || x.isLine) && x.visible) n++; }); return n; }

  function mergeGroup(THREE, merge, top, snap) {
    top.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(top.matrixWorld).invert(), buckets = {}, tmp = new THREE.Vector3(), merged = 0, removed = 0;
    top.traverse(function (o) {
      if (o === top || !snap.has(o) || !eligible(o, THREE) || !chainVisible(o, top)) return;
      if (!o.matrixWorld.equals(snap.get(o))) return;   // moved during the watch window -> dynamic, leave it
      tmp.setFromMatrixPosition(o.matrixWorld);
      var key = o.material.uuid + '|' + Math.floor(tmp.x / CELL_U) + ',' + Math.floor(tmp.z / CELL_U) + '|' + (o.geometry.attributes.uv ? 'uv' : 'no') + '|' + (o.geometry.attributes.color ? 'c' : '');
      (buckets[key] = buckets[key] || []).push(o);
    });
    Object.keys(buckets).forEach(function (key) {
      var list = buckets[key]; if (list.length < 3) return;
      var geos = [], cast = false, recv = false, m4 = new THREE.Matrix4();
      list.forEach(function (o) {
        var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal' && a !== 'uv' && a !== 'color') g.deleteAttribute(a); });
        g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); g.morphAttributes = {}; geos.push(g); cast = cast || o.castShadow; recv = recv || o.receiveShadow;
      });
      var mg = null; try { mg = merge(geos, false); } catch (e) { mg = null; }
      geos.forEach(function (g) { g.dispose(); });
      if (!mg) return;
      mg.computeBoundingSphere();
      var mesh = new THREE.Mesh(mg, list[0].material); mesh.name = 'auto-merge'; mesh.castShadow = cast; mesh.receiveShadow = recv;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); top.add(mesh); merged++;
      list.forEach(function (o) { undo.push({ o: o, parent: o.parent }); o.parent.remove(o); removed++; });
    });
    return { merged: merged, removed: removed };
  }

  function run(o) {
    var THREE = o.THREE, scene = o.scene, merge = o.mergeGeometries, log = o.log || function () {};
    if (!THREE || !scene || !merge || (typeof location !== 'undefined' && /[?&]smerge=0\b/.test(location.search))) return Promise.resolve(null);
    var tops = scene.children.filter(function (c) { return !c.isMesh && !DYNAMIC.test(c.name || '') && c.visible; }), snap = new Map();
    scene.updateMatrixWorld(true);
    tops.forEach(function (t) { t.traverse(function (x) { if (x.isMesh && eligible(x, THREE)) snap.set(x, x.matrixWorld.clone()); }); });
    var before = count(scene);
    return new Promise(function (res) {
      setTimeout(function () {
        scene.updateMatrixWorld(true);
        var i = 0, stats = { groups: 0, merged: 0, removed: 0 };
        (function step() {
          if (i >= tops.length) { var r = { before: before, after: count(scene), groups: stats.groups, merged: stats.merged, removed: stats.removed }; log('[auto-merge] meshes ' + r.before + ' -> ' + r.after + ' (' + r.removed + ' merged into ' + r.merged + ' across ' + r.groups + ' groups)'); res(r); return; }
          var t = tops[i++]; try { var s = mergeGroup(THREE, merge, t, snap); if (s.removed) { stats.groups++; stats.merged += s.merged; stats.removed += s.removed; } } catch (e) { log('[auto-merge] skipped ' + (t.name || 'group') + ': ' + (e && e.message)); }
          idle(step);
        })();
      }, o.watchMs || 3000);
    });
  }
  function undoAll() { undo.forEach(function (u) { if (u.parent) u.parent.add(u.o); }); undo.length = 0; }
  root.WorldAutoMerge = { run: run, undo: undoAll, DYNAMIC: DYNAMIC };
})(typeof window !== 'undefined' ? window : globalThis);
