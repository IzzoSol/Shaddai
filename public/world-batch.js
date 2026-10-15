/* world-batch.js — STATIC BATCHER: merge thousands of tiny static meshes into a few draw calls (the biggest FPS lever on integrated GPUs; profile: ~2000 calls, most from meshes of 50-250 tris).
 *   WorldBatch.run({ THREE, scene, U?, settleMs?, filter?, log? }) -> Promise<report>     measure motion for settleMs, then merge every STATIC mesh
 *   WorldBatch.mergeMeshes(THREE, scene, meshes, opts) -> report                          the pure merge step (tested in node with real three.js)
 * What gets merged: plain Mesh (not skinned / instanced / multi-material / frustumCulled=false / custom userData / layers / morphs), grouped by
 *   material + shadow flags + renderOrder + attribute layout + a 100 m map cell (so frustum culling still works). World matrices are BAKED into the merged geometry.
 * What never gets merged: anything whose world matrix changes during the settle window (moving/rotating props), lights, points, lines, sprites, the terrain/water/sky,
 *   and anything under a top-level object matching DENY (characters, vehicles, crowds, mobs, grass, FX, transit trains, farm crops).
 * Merged meshes stay CHILDREN OF THEIR ORIGINAL TOP-LEVEL OWNER (geometry baked relative to it), so hiding/moving that owner (interiors hide the building you enter) still works; meshes
 *   added straight to the scene are never merged. Off switch: ?batch=0.  Report: window.__batchReport = { before, after, merged, groups, skippedMoving, ms }.
 */
(function (root) {
  'use strict';
  var CELL_M = 100, U0 = 7 / 1.8, MAXV = 200000;
  var DENY = /terrain|water|world-sky|sky-v4|skyv4|nightsky|moon|star|grass|footprint|crowd|mob|operative|avatar|hoverboard|hovercar|hazard|campfire|dragon(?!-gate)|air-traffic|skydock-traffic|race|rider|npc|bot|farm|crop|transit|fx|particle|weather|rain|cloud|aurora|firefl|wildlife|fish|boat|naval|vehicle|mount|player/i;
  var ATTRS = { position: 1, normal: 1, uv: 1, color: 1 };
  function sigOf(g) { var k = Object.keys(g.attributes).sort(), s = k.map(function (n) { var a = g.attributes[n]; return n + a.itemSize + (a.normalized ? 'n' : ''); }).join('|'); return s + (g.index ? '#i' : '#n'); }
  function customHook(f) { if (typeof f !== 'function') return false; var src = String(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s/g, ''); return !/^(function)?(onBeforeRender|onAfterRender)?\(.*\)\{\}$/.test(src); }   // three's default hook is an empty function; anything else is custom per-draw logic
  function eligible(m) {
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || !m.geometry || Array.isArray(m.material) || !m.material) return false;
    if (m.frustumCulled === false || m.layers.mask !== 1 || m.morphTargetInfluences || customHook(m.onBeforeRender) || customHook(m.onAfterRender)) return false;
    if (m.material.visible === false) return false; if (m.userData && Object.keys(m.userData).length) return false;
    var g = m.geometry; for (var n in g.attributes) if (!ATTRS[n]) return false; return !!g.attributes.position;
  }
  function visibleChain(o) { for (var a = o; a; a = a.parent) if (!a.visible) return false; return true; }
  function ownerOf(scene, o) { var a = o; while (a.parent && a.parent !== scene) a = a.parent; return a; }   // the top-level child of the scene that contains o
  function topName(scene, o) { var a = o; while (a.parent && a.parent !== scene) a = a.parent; return a.name || ''; }
  function collect(scene, filter) {
    var out = [], deniedTop = {}; scene.updateMatrixWorld(true);
    scene.traverse(function (o) { if (!o.isMesh || !visibleChain(o)) return; if (ownerOf(scene, o) === o) return; /* meshes added straight to the scene are left alone: their owners often toggle .visible per mesh */ var tn = topName(scene, o); if (DENY.test(tn) || (filter && !filter(o, tn))) return; if (eligible(o)) out.push(o); });
    return out;
  }
  function snapshot(list) { return list.map(function (m) { return m.matrixWorld.elements.slice(); }); }
  function movedSet(list, a, b) { var moved = {}; for (var i = 0; i < list.length; i++) { var x = a[i], y = b[i]; for (var k = 0; k < 16; k++) if (Math.abs(x[k] - y[k]) > 1e-4) { moved[i] = 1; break; } } return moved; }
  function keyOf(THREE, scene, m, cellSize) {
    var g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); var c = g.boundingSphere.center.clone().applyMatrix4(m.matrixWorld);
    return [ownerOf(scene, m).uuid, m.material.uuid, m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0, m.renderOrder, sigOf(g), Math.floor(c.x / cellSize), Math.floor(c.z / cellSize)].join('/');
  }
  function build(THREE, items, name, inv) {
    var nv = 0, ni = 0, indexed = !!items[0].geometry.index; items.forEach(function (m) { var g = m.geometry; nv += g.attributes.position.count; ni += indexed ? g.index.count : 0; });
    var geo = new THREE.BufferGeometry(), names = Object.keys(items[0].geometry.attributes), v = new THREE.Vector3(), nm = new THREE.Matrix3(), off = 0, ioff = 0;
    var outA = {}; names.forEach(function (n) { outA[n] = new Float32Array(nv * items[0].geometry.attributes[n].itemSize); });
    var idx = indexed ? (nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)) : null;
    items.forEach(function (m) {
      var g = m.geometry, cnt = g.attributes.position.count, mw = inv ? new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) : m.matrixWorld; nm.getNormalMatrix(mw);
      names.forEach(function (n) {
        var a = g.attributes[n], dst = outA[n], is = a.itemSize;
        for (var i = 0; i < cnt; i++) {
          if (n === 'position') { v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(mw); dst[(off + i) * 3] = v.x; dst[(off + i) * 3 + 1] = v.y; dst[(off + i) * 3 + 2] = v.z; }
          else if (n === 'normal') { v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix3(nm).normalize(); dst[(off + i) * 3] = v.x; dst[(off + i) * 3 + 1] = v.y; dst[(off + i) * 3 + 2] = v.z; }
          else { for (var k = 0; k < is; k++) dst[(off + i) * is + k] = k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i); }
        }
      });
      if (indexed) { var ix = g.index; for (var j = 0; j < ix.count; j++) idx[ioff + j] = ix.getX(j) + off; ioff += ix.count; }
      off += cnt;
    });
    names.forEach(function (n) { var s = items[0].geometry.attributes[n]; geo.setAttribute(n, new THREE.BufferAttribute(outA[n], s.itemSize, s.normalized)); });
    if (idx) geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
    var f = items[0], mesh = new THREE.Mesh(geo, f.material); mesh.name = name; mesh.castShadow = f.castShadow; mesh.receiveShadow = f.receiveShadow; mesh.renderOrder = f.renderOrder; mesh.matrixAutoUpdate = false; mesh.userData = { batched: items.length };
    return mesh;
  }
  function mergeMeshes(THREE, scene, meshes, opts) {
    opts = opts || {}; var cell = (opts.U || U0) * CELL_M, groups = {}, t0 = Date.now(), before = 0;
    meshes.forEach(function (m) { var k = keyOf(THREE, scene, m, cell); (groups[k] = groups[k] || []).push(m); before++; });
    var made = 0, merged = 0, n = 0;
    Object.keys(groups).forEach(function (k) {
      var list = groups[k]; if (list.length < 2) return; var chunk = [], verts = 0, parts = [];
      list.forEach(function (m) { var c = m.geometry.attributes.position.count; if (verts + c > MAXV && chunk.length) { parts.push(chunk); chunk = []; verts = 0; } chunk.push(m); verts += c; }); if (chunk.length) parts.push(chunk);
      parts.forEach(function (items) { if (items.length < 2) return; var own = ownerOf(scene, items[0]); own.updateMatrixWorld(true); var mesh = build(THREE, items, 'batched:' + (n++), new THREE.Matrix4().copy(own.matrixWorld).invert()); own.add(mesh); mesh.updateMatrix();   /* child of the original owner: hiding or moving the owner still hides or moves it */ items.forEach(function (m) { if (m.parent) m.parent.remove(m); }); made++; merged += items.length; });
    });
    var rep = { before: before, merged: merged, drawCallsSaved: merged - made, groups: made, ms: Date.now() - t0 }; return rep;
  }
  function run(o) {
    var THREE = o.THREE, scene = o.scene, settle = o.settleMs == null ? 2500 : o.settleMs, t0 = Date.now(), log = o.log || function () { };
    return new Promise(function (resolve) {
      var list = collect(scene, o.filter), a = snapshot(list), frames = 0;
      (function wait() { frames++; if (Date.now() - t0 < settle || frames < 20) return setTimeout(wait, 100);
        scene.updateMatrixWorld(true); var b = snapshot(list), mv = movedSet(list, a, b), still = list.filter(function (m, i) { return !mv[i]; }), skipped = list.length - still.length;
        var rep = mergeMeshes(THREE, scene, still, o); rep.skippedMoving = skipped; rep.candidates = list.length; rep.settle_ms = settle; log('[batch] merged ' + rep.merged + ' meshes into ' + rep.groups + ' (saved ' + rep.drawCallsSaved + ' draw calls); ' + skipped + ' moving skipped'); resolve(rep); })();
    });
  }
  root.WorldBatch = { run: run, mergeMeshes: mergeMeshes, collect: collect, eligible: eligible, sigOf: sigOf, DENY: DENY, CELL_M: CELL_M };
})(typeof window !== 'undefined' ? window : globalThis);
