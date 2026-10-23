/* world-perf-guard.js — keep the world smooth without lowering quality (2026-10-23, owner: "keep high quality while improving fps").
 *
 * 1) SPECK CULL: every 0.25 s, any mesh whose on-screen size is under MIN_PX pixels (or wholly beyond the far plane) is moved to a
 *    hidden layer, and back the moment it grows past the threshold. Nothing visible is removed: a 2 px object is a speck the eye
 *    cannot resolve, but it still costs a full draw call. Instanced and skinned meshes and anything tagged userData.noCull are left
 *    alone (one draw each; their bounds span many objects). Measured with tools/_perf-breakdown.cjs before/after.
 * 2) SKIN GUARD: a SkinnedMesh whose skinIndex points past its skeleton crashed three's frustum test (the red "matrixWorld of
 *    undefined" banner). Such meshes get a static bounding sphere from their geometry (no per-bone math) and are logged once by path.
 *   WorldPerfGuard.attach({ THREE, scene, camera, renderer }) · .tick(dt) · .enable(bool) · .stats()   ?perfguard=0 = off
 */
(function (root) {
  'use strict';
  var MIN_PX = 2.0, HIDE_LAYER = 31, SCAN_S = 1.5, STEP_S = 0.25;   // scan often: skinned meshes must be guarded before their first frustum test
  var S = { on: true, list: [], scanT: 0, stepT: 0, hidden: 0, checked: 0, badSkins: [], o: null, sph: null, v: null };
  function path(o) { var a = []; for (var x = o; x && x.parent; x = x.parent) a.push(x.name || x.type); return a.reverse().join(' > ').slice(0, 160); }
  function guardSkin(m) {
    if (m.userData.__skinChecked) return; m.userData.__skinChecked = true;
    var g = m.geometry, si = g && g.attributes && g.attributes.skinIndex, nb = m.skeleton && m.skeleton.bones ? m.skeleton.bones.length : 0, bad = !m.skeleton;
    if (si && !bad) { var a = si.array, mx = 0; for (var i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i]; bad = mx >= nb; }
    if (!bad && m.skeleton) for (var k = 0; k < nb; k++) if (!m.skeleton.bones[k]) { bad = true; break; }
    if (!bad) return;
    if (!g.boundingSphere) g.computeBoundingSphere(); m.boundingSphere = g.boundingSphere.clone(); m.boundingBox = null;
    if (!g.boundingBox) g.computeBoundingBox(); m.boundingBox = g.boundingBox.clone();
    var top = m; while (top.parent && top.parent.parent) top = top.parent;
    var p = path(m) + ' | top=' + (top.name || top.type) + ' bones=' + nb + ' maxIdx=' + (si ? Math.max.apply(null, Array.prototype.slice.call(si.array, 0, 40000)) : -1) + ' undefinedBones=' + (m.skeleton ? m.skeleton.bones.filter(function (b) { return !b; }).length : 'noskel');
    S.badSkins.push(p); console.warn('[perf-guard] skinned mesh with out-of-range skin indices (bounds pinned):', p);
  }
  function scan() {
    var list = [];
    S.o.scene.traverse(function (o) {
      if (o.isSkinnedMesh) { guardSkin(o); return; }
      if (!o.isMesh || o.isInstancedMesh || (o.userData && o.userData.noCull) || !o.geometry) return;
      list.push(o);
    });
    S.list = list;
  }
  function step() {
    var cam = S.o.camera, T = S.o.THREE, H = (S.o.renderer.domElement.clientHeight || 600), k = H / 2 / Math.tan(cam.fov * Math.PI / 360), far = cam.far;
    var cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, hid = 0;
    for (var i = 0; i < S.list.length; i++) {
      var m = S.list[i], g = m.geometry; if (!m.parent) continue;
      if (!g.boundingSphere) g.computeBoundingSphere(); var bs = g.boundingSphere; if (!bs) continue;
      var e = m.matrixWorld.elements, sx = e[0] * e[0] + e[1] * e[1] + e[2] * e[2], sy = e[4] * e[4] + e[5] * e[5] + e[6] * e[6], sz = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
      var r = bs.radius * Math.sqrt(Math.max(sx, sy, sz)), c = bs.center;
      var wx = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12], wy = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13], wz = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
      var d = Math.sqrt((wx - cx) * (wx - cx) + (wy - cy) * (wy - cy) + (wz - cz) * (wz - cz));
      var speck = d > r && (r * k / d < MIN_PX || d - r > far);
      var U = m.userData;
      if (speck && S.on) { if (U.__pgMask == null) { U.__pgMask = m.layers.mask; m.layers.set(HIDE_LAYER); } hid++; }
      else if (U.__pgMask != null) { m.layers.mask = U.__pgMask; U.__pgMask = null; }
    }
    S.hidden = hid; S.checked = S.list.length;
  }
  function tick(dt) {
    if (!S.o) return; S.scanT -= dt; S.stepT -= dt;
    if (S.scanT <= 0) { S.scanT = SCAN_S; scan(); }
    if (S.stepT <= 0) { S.stepT = STEP_S; step(); }
  }
  function enable(on) { S.on = !!on; if (!S.on) step(); }
  function attach(o) {
    if (typeof location !== 'undefined' && /[?&]perfguard=0/.test(location.search || '')) return null;
    S.o = o;
    var SM = o.THREE && o.THREE.SkinnedMesh;                                    // no frame may ever throw on a bad skin (red banner)
    if (SM && !SM.prototype.__pgPatched) {
      SM.prototype.__pgPatched = true;
      ['computeBoundingSphere', 'computeBoundingBox'].forEach(function (fn) {
        var orig = SM.prototype[fn]; if (!orig) return;
        SM.prototype[fn] = function () {
          try { return orig.apply(this, arguments); } catch (e) {
            var g = this.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox();
            this.boundingSphere = g.boundingSphere.clone(); this.boundingBox = g.boundingBox.clone();
            if (!this.userData.__pgLogged) { this.userData.__pgLogged = true; var p = path(this); S.badSkins.push(p); console.warn('[perf-guard] bad skin, bounds pinned:', p); }
            return fn === 'computeBoundingSphere' ? this.boundingSphere : this.boundingBox;
          }
        };
      });
    }
    scan(); return api;
  }
  var api = { attach: attach, tick: tick, enable: enable, stats: function () { return { on: S.on, checked: S.checked, hidden: S.hidden, badSkins: S.badSkins.slice() }; } };
  root.WorldPerfGuard = api;
})(typeof window !== 'undefined' ? window : this);
