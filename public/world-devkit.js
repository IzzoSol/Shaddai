/* world-devkit.js — DEBUG HARNESS (2026-10-08, plan S0a). Never debug a moving frame.
 *   ?devkit=1 enables the keys:  F8 = freeze/thaw the sim clock (dt = 0, render keeps running)
 *                                F9 = cycle the "suspect" toggle (each registered suspect switched off in turn, then all on)
 *   (P and O are already game keys: P = portal, O = hoverboard.)
 *   ?gui=1 loads lil-gui from the CDN with the registered sliders/toggles. Nothing is loaded without the flag.
 *   sanitizeNormals(obj) runs on EVERY GLTF the page loads (patched once on GLTFLoader.prototype.parse; ?sanitize=0 = off):
 *     NaN/Inf positions -> 0, missing/zero/NaN/non-unit normals -> computeVertexNormals then lengthSq < 1e-8 -> (0,1,0),
 *     NaN tangents -> attribute removed. A handful of zero normals is enough to blow Bloom across the whole frame.
 *
 *   WorldDevkit.create({ THREE }) -> { frozen, suspect(name, setOn(bool)), cycle(), stats, sanitizeNormals, patchGLTFLoader(Loader), gui() }
 * Pure helper for node tests: WorldDevkit.sanitizeNormals(obj, THREE).
 */
(function (root) {
  'use strict';
  function sanitizeGeometry(g, THREE, st) {
    if (!g || !g.attributes || !g.attributes.position) return;
    var p = g.attributes.position.array, i, bad = 0;
    for (i = 0; i < p.length; i++) if (!isFinite(p[i])) { p[i] = 0; bad++; }
    if (bad) { g.attributes.position.needsUpdate = true; st.positions += bad; }
    var n = g.attributes.normal, need = !n;
    if (n) { var a = n.array; for (i = 0; i < a.length; i += 3) { var l = a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2]; if (!isFinite(l) || l < 1e-8 || Math.abs(l - 1) > 0.02) { need = true; break; } } }
    if (need) {
      g.computeVertexNormals(); st.recomputed++;
      var b = g.attributes.normal.array, fixed = 0;
      for (i = 0; i < b.length; i += 3) {
        var x = b[i], y = b[i + 1], z = b[i + 2], ll = x * x + y * y + z * z;
        if (!isFinite(ll) || ll < 1e-8) { b[i] = 0; b[i + 1] = 1; b[i + 2] = 0; fixed++; }
        else if (Math.abs(ll - 1) > 1e-4) { var il = 1 / Math.sqrt(ll); b[i] = x * il; b[i + 1] = y * il; b[i + 2] = z * il; }
      }
      g.attributes.normal.needsUpdate = true; st.zeroNormals += fixed;
    }
    var t = g.attributes.tangent;
    if (t) { var ta = t.array; for (i = 0; i < ta.length; i++) if (!isFinite(ta[i])) { g.deleteAttribute('tangent'); st.tangents++; break; } }
  }
  function sanitizeNormals(obj, THREE, st) {
    st = st || { meshes: 0, positions: 0, recomputed: 0, zeroNormals: 0, tangents: 0 };
    if (!obj) return st;
    var seen = new Set();
    (obj.traverse ? obj.traverse.bind(obj) : function (f) { f(obj); })(function (o) {
      if (!o.isMesh || !o.geometry || seen.has(o.geometry)) return; seen.add(o.geometry); st.meshes++;
      sanitizeGeometry(o.geometry, THREE, st);
    });
    return st;
  }

  function create(o) {
    o = o || {};
    var THREE = o.THREE, on = typeof location !== 'undefined' && /[?&]devkit=1\b/.test(location.search);
    var dk = { frozen: false, stats: { meshes: 0, positions: 0, recomputed: 0, zeroNormals: 0, tangents: 0, gltfs: 0 }, suspects: [], active: -1 };
    dk.sanitizeNormals = function (obj) { return sanitizeNormals(obj, THREE, dk.stats); };
    // suspects: { name, set(on) } — F9 switches ONE off at a time (the rest on), then all back on
    dk.suspect = function (name, set) { dk.suspects.push({ name: name, set: set }); };
    dk.cycle = function () {
      dk.active = dk.active + 1 >= dk.suspects.length ? -1 : dk.active + 1;
      dk.suspects.forEach(function (s, i) { try { s.set(i !== dk.active); } catch (_) { } });
      var msg = dk.active < 0 ? '[devkit] all suspects ON' : '[devkit] OFF: ' + dk.suspects[dk.active].name;
      console.info(msg); if (root.Navi && root.Navi.toast) root.Navi.toast(msg);
      return dk.active < 0 ? null : dk.suspects[dk.active].name;
    };
    // GLTF: wrap parse once so every load/loadAsync result is sanitized before anything adds it to the scene
    dk.patchGLTFLoader = function (Loader) {
      if (!Loader || !Loader.prototype || Loader.prototype.__dkPatched) return false;
      if (typeof location !== 'undefined' && /[?&]sanitize=0\b/.test(location.search)) return false;
      var parse = Loader.prototype.parse;
      Loader.prototype.parse = function (data, path, onLoad, onError) {
        return parse.call(this, data, path, function (gltf) {
          try { dk.stats.gltfs++; if (gltf && gltf.scene) dk.sanitizeNormals(gltf.scene); } catch (e) { console.warn('[devkit] sanitize failed', e && e.message); }
          onLoad(gltf);
        }, onError);
      };
      Loader.prototype.__dkPatched = true; return true;
    };
    dk.gui = function () {
      if (!(typeof location !== 'undefined' && /[?&]gui=1\b/.test(location.search))) return Promise.resolve(null);
      return import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm').then(function (m) {
        var g = new m.GUI({ title: 'SHADDAI devkit' }); dk._gui = g;
        g.add(dk, 'frozen').name('freeze (F8)').listen();
        dk.suspects.forEach(function (s) { var st = { on: true }; g.add(st, 'on').name(s.name).onChange(function (v) { s.set(v); }); });
        return g;
      }).catch(function (e) { console.warn('[devkit] lil-gui failed', e && e.message); return null; });
    };
    if (on && typeof addEventListener !== 'undefined') {
      addEventListener('keydown', function (e) {
        if (e.code === 'F8') { e.preventDefault(); dk.frozen = !dk.frozen; console.info('[devkit] ' + (dk.frozen ? 'FROZEN' : 'running')); if (root.Navi && root.Navi.toast) root.Navi.toast(dk.frozen ? 'FROZEN (F8)' : 'Running'); }
        else if (e.code === 'F9') { e.preventDefault(); dk.cycle(); }
      });
      console.info('[devkit] on: F8 freeze, F9 cycle suspects' + (/[?&]gui=1\b/.test(location.search) ? ', lil-gui' : ''));
    }
    dk.enabled = on;
    return dk;
  }
  var api = { create: create, sanitizeNormals: sanitizeNormals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldDevkit = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
