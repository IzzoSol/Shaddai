/* world-clusters-v4.js — realm DISTRICTS + city GRID FABRIC for Map v4 (?map=v4), 2026-09-26 (rev 3: generic placement file + lod2 tier).
 *
 * Reads public/assets/world/realm-clusters-v4.json (tools/blender/realm-clusters-v4.py — the SAME file the Blender
 * scene uses, so Blender == game): Suburbs street-grid district, Sand Sea habitat domes, Crystal Sea island spires +
 * harbour town, Emberfall forge line, Arctic outposts, Darkforest ruin fields, Void crystal fields (only EXISTING models).
 * rev 3: the same loader also reads public/assets/world/grid-fabric-v4.json (city buildings, keys `sc-*`) — pass `url`.
 *
 * PERF (measured 2026-09-26: rev 1 drew 9.65 M triangles — 45 % of the frame — because every copy of every full-detail
 * model was one world-spanning InstancedMesh: never frustum-culled, always in the shadow pass). Same detail up close,
 * far cheaper overall (our gamedev repo's game-qa-performance checklist: cull, LOD, instance):
 *   • instances are split into CELLS (realm 1 km, grid fabric 250 m — preset cell_m) → each cell's InstancedMesh has a tight
 *     bounding sphere → frustum culling works
 *   • per cell, distance picks the model: < near_m → full model (casts shadows) · < far_m → lod1 (simplified, no shadow)
 *     · < hide_m → lod2 (coarser, no shadow) · beyond → hidden (fog)
 *   • lod1/lod2 = public/assets/models/lod/<key>-lod{1,2}.glb (gltf-transform simplify, generated from the same source model);
 *     sc-* keys: public/assets/models/shaddai-city/<key>.glb + shaddai-city/lod/<key>-lod{1,2}.glb
 *   • missing lod1 → full model covers the lod1 band; missing lod2 → lod1 (or full) covers the lod2 band.
 *   • lod2 is only requested when hide_m > far_m (realm defaults: hide_m == far_m → identical to rev 2, no extra fetches).
 *
 *   window.buildWorldClustersV4({ THREE, scene, loader, heightAt (units),
 *       url?  (placement JSON, default '/assets/world/realm-clusters-v4.json'),
 *       name? (group name, default 'world-clusters-v4'),
 *       near_m?, far_m?, hide_m?  (tier distances in metres; defaults come from presetFor(url)) })
 *     → Promise<{ group, update(t, dt, camPos), stats(), dispose() }>
 *
 *   Extra opts: cell_m? (cell size), collide? (RegExp of keys that get circle colliders | false; default from preset),
 *     onMaterial? (fn(material) called once per UNIQUE material, deduped by material.uuid, as parts are built —
 *     grid-fabric night glow: host wires this to `var g = __clustersV4Internals.glowFor(mat); if (g) _v4Sky.addEmissive(mat, g);`
 *     — glowFor gates on the material ACTUALLY being emissive (emissive color non-black or an emissiveMap), so it
 *     needs the material object, not just its name).
 *   Pure helpers (for node tests) on window.__clustersV4Internals: { U, CELL_M, urlOf, presetFor, pickTier, collides, glowFor }.
 */
(function () {
  var U = 7 / 1.8, CELL_M = 1000;
  var REALM_URL = '/assets/world/realm-clusters-v4.json';
  var ROOT = ['bld-apartment-pod-block', 'bld-inverted-cube-hab', 'bld-neon-observatory', 'bld-sea-terrace-spire', 'bld-holo-market-v2',
    'homes-mushroom-pods', 'prop-obsidian-rocks', 'prop-crystal-cluster', 'volcano-forge-tower', 'volcano-ritual-circle', 'volcano-dragon', 'volcano-bridge', 'volcano-gate'];
  function urlOf(key, lod) {
    if (key.indexOf('sc-') === 0) return lod ? '/assets/models/shaddai-city/lod/' + key + '-lod' + lod + '.glb' : '/assets/models/shaddai-city/' + key + '.glb';
    return lod ? '/assets/models/lod/' + key + '-lod' + lod + '.glb' : (ROOT.indexOf(key) >= 0 ? '/assets/models/' : '/assets/models/fal/') + key + '.glb';
  }
  // default tier distances (metres) per placement file: realm = rev-2 behaviour; grid fabric = city buildings
  // cell_m: instancing/LOD cell size. The tier test is |cam − cell centroid| − 0.7·cell, so a 1 km cell turned the fabric's
  //   "full < 250 m" into "full < ~950 m" (≈ 46 M full-detail tris + shadow pass at spawn). 250 m cells keep the band honest.
  // collide: which keys push a circle collider into WORLD_LAYOUT.realmColliders (null = legacy rule: all but lamp|crystal).
  //   Grid fabric: canon-colliders-v4.json already has exact OBBs for every collider:true sc-* type, and sc-market / sc-garden /
  //   sc-teleport are walk-in (collider:false) — only sc-ad-pylon has no canon OBB.
  function presetFor(url) {
var _q = function (k, d) { try { var m = new RegExp('[?&]' + k + '=(\d+)').exec(location.search); return m ? +m[1] : d; } catch (e) { return d; } };   // ?cell= / ?hide= / ?near= / ?far= tuning overrides for perf A/B
    if (url && /grid-fabric/.test(url)) return { name: 'grid-fabric-v4', near_m: _q('near', 250), far_m: _q('far', 900), hide_m: _q('hide', 2600), cell_m: _q('cell', 250), collide: /^sc-ad-pylon$/ };
    return { name: 'world-clusters-v4', near_m: 450, far_m: 2500, hide_m: 2500, cell_m: CELL_M, collide: null };
  }
  function collides(key, rule) { return rule === false ? false : (rule && typeof rule.test === 'function' ? rule.test(key) : !/lamp|crystal/.test(key)); }
  // night glow (Task 2): grid-fabric building materials → _v4Sky.addEmissive(mat, {dayMul, nightMul}) multipliers.
  // Fix round 1 (review): name-regex alone false-positived on non-emissive Trim variants (MI_Trim_02/03/03_Dark,
  // MI_Trim_MetalConcrete — emissiveFactor all-zero, no emissiveMap) and false-negatived real emissive materials
  // whose names match no rule (MI_PaddedWall, Atlas_Sign, M_Light — confirmed via a full sweep of every
  // shaddai-city/*.glb + lod/*.glb with @gltf-transform/core; see task-2-report.md "Fix round 1"). A material is
  // now a glow CANDIDATE only if it actually emits (isEmissive); the name only picks which multiplier bucket a
  // true emissive candidate falls into, and any true emissive with no name match gets DEFAULT_GLOW rather than
  // being silently skipped.
  function isEmissive(mat) {
    if (!mat) return false;
    var c = mat.emissive, nonBlack = !!(c && (c.r || c.g || c.b));
    var intensityOk = mat.emissiveIntensity == null || mat.emissiveIntensity > 0;
    return (nonBlack || !!mat.emissiveMap) && intensityOk;
  }
  var DEFAULT_GLOW = { dayMul: 0.6, nightMul: 1.8 };   // any other genuinely-emissive material (e.g. Atlas_Sign, M_Light)
  var GLOW_RULES = [
    { test: /glass/i, dayMul: 0.2, nightMul: 2.4 },          // smoked glass (M_Glass)
    { test: /skylight/i, dayMul: 0.3, nightMul: 2.0 },       // lod2 block-skylight
    { test: /artslot/i, dayMul: 0.8, nightMul: 1.4 },        // artslot-* panels
    { test: /emerald|trim|padd/i, dayMul: 0.6, nightMul: 1.8 } // emerald trim + lod2 block-emerald + MI_PaddedWall
  ];
  function glowFor(mat) {   // mat: the real material (needs .name, .emissive {r,g,b}, .emissiveMap, .emissiveIntensity)
    if (!isEmissive(mat)) return null;
    var name = (mat && mat.name || '') + '';
    for (var i = 0; i < GLOW_RULES.length; i++) if (GLOW_RULES[i].test.test(name)) return { dayMul: GLOW_RULES[i].dayMul, nightMul: GLOW_RULES[i].nightMul };
    return { dayMul: DEFAULT_GLOW.dayMul, nightMul: DEFAULT_GLOW.nightMul };
  }
  // d = distance (units) from camera to the cell's nearest edge-ish; returns 0 full · 1 lod1 · 2 lod2 · 3 hidden
  function pickTier(d, near, far, hide, has1, has2) {
    if (d < near) return 0;
    if (d < far) return has1 ? 1 : 0;
    if (d < hide) return has2 ? 2 : (has1 ? 1 : 0);
    return 3;
  }
  window.__clustersV4Internals = { U: U, CELL_M: CELL_M, urlOf: urlOf, presetFor: presetFor, pickTier: pickTier, collides: collides, glowFor: glowFor };

  window.buildWorldClustersV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt || function () { return 0; };
    var url = opts.url || REALM_URL, pre = presetFor(url);
    var NEAR = (opts.near_m != null ? opts.near_m : pre.near_m) * U, FAR = (opts.far_m != null ? opts.far_m : pre.far_m) * U;
    var hideM = opts.hide_m != null ? opts.hide_m : (pre.hide_m > pre.far_m ? pre.hide_m : null);   // realm preset: no lod2 band
    var HIDE = hideM == null ? FAR : Math.max(FAR, hideM * U);
    var CELL = (opts.cell_m || pre.cell_m || CELL_M) * U, COLLIDE = opts.collide !== undefined ? opts.collide : pre.collide, pushed = 0;
    var WANT2 = HIDE > FAR, TAG = '[clusters-v4' + (opts.name ? ':' + opts.name : (url === REALM_URL ? '' : ':' + pre.name)) + '] ';
    var group = new THREE.Group(); group.name = opts.name || pre.name; scene.add(group);
    var allK = [];   // per-model batches (see BATCHED below)
    var st = { items: 0, types: 0, cells: 0, meshes: 0, near: 0, mid: 0, far: 0, hidden: 0, failed: [], noLod2: [] }, cells = {};
    var seenMat = {};   // dedupe by material.uuid: onMaterial fires once per unique material even though it's reused across many cells/instances
    function load(url) { return new Promise(function (res, rej) { if (window.__queueLoad) window.__queueLoad(loader, url, res, rej); else loader.load(url, res, undefined, rej); }); }
    function parts(root) {   // mesh parts with transforms baked relative to the model's base-centre (one instance matrix places the whole model)
      root.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      var toBase = new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z), out = [];
      root.traverse(function (o) {
        if (!o.isMesh || o.isSkinnedMesh) return;
        var geo = o.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toBase, o.matrixWorld));
        if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
        if (opts.onMaterial && o.material && !seenMat[o.material.uuid]) { seenMat[o.material.uuid] = true; opts.onMaterial(o.material); }
        out.push({ geo: geo, mat: o.material });
      });
      return { parts: out, wid: Math.max(size.x, size.z, 1e-4), hgt: Math.max(size.y, 1e-4) };
    }
    function minGround(x, z, r) {
      var m = heightAt(x, z), k, a;
      for (k = 0; k < 8; k++) { a = k / 8 * Math.PI * 2; m = Math.min(m, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
      return m;
    }
    return fetch(url).then(function (r) { return r.json(); }).then(function (plan) {
      // 2026-10-11 (owner: "so many office buildings that don't appear and are janky"): thin the dense city fabric to ~60% by a stable hash of position;
      // fewer instances = fewer cells to rebuild and less popping. ?fullcity=1 restores every piece.
      if (/grid-fabric/.test(String(url)) && plan.items.length > 300 && !(typeof location !== 'undefined' && /[?&]fullcity=1/.test(location.search))) plan.items = plan.items.filter(function (it) { var h = Math.abs(Math.sin(it.x_m * 12.9898 + it.y_m * 78.233) * 43758.5453) % 1; return h < 0.3 && !/office/.test(String(it.key)); });
      // 2026-10-11: buildings may not sit on a race deck - the keys come from tools/ (docs/track-*.json vs the fabric). ?trackclear=0 disables.
      var _tc = (typeof location !== 'undefined' && /[?&]trackclear=0/.test(location.search)) ? null : window.__trackClear;
      if (_tc && /grid-fabric/.test(String(url))) plan.items = plan.items.filter(function (it) { return !_tc[it.x_m + ',' + it.y_m]; });
      // HOVERSKATE PARK KEEP-OUT (2026-10-15, seen in the Blender world): 18 live fabric shops/labs/gardens stood inside the park (r 170 m at the PLAZA_SKATE
      // marker) and poked through its deck. Same rule world-grid-city-v4.js used. ?parkclear=0 disables.
      if (/grid-fabric/.test(String(url)) && !(typeof location !== 'undefined' && /[?&]parkclear=0/.test(location.search))) plan.items = plan.items.filter(function (it) { return Math.hypot(it.x_m + 694.46, it.y_m - 1039.34) >= 172 + (it.len_m || 0) * 0.5; });
      var byKey = {};
      plan.items.forEach(function (it) { (byKey[it.key] = byKey[it.key] || []).push(it); });
      var keys = Object.keys(byKey); st.types = keys.length; st.items = plan.items.length;
      return Promise.all(keys.map(function (key) {
        var none = function () { return null; };
        return Promise.all([load(urlOf(key, 0)), load(urlOf(key, 1)).catch(none), WANT2 ? load(urlOf(key, 2)).catch(none) : null]).then(function (gs) {
          var L0 = parts(gs[0].scene), L1 = gs[1] ? parts(gs[1].scene) : null, L2 = gs[2] ? parts(gs[2].scene) : null;
          if (WANT2 && !L2) st.noLod2.push(key);
          var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0);
          var byCell = {};
          byKey[key].forEach(function (it) {   // sized from the FULL model (lods share the same bounds, so one matrix fits all)
            var k = (it.by_height ? it.len_m / L0.hgt : it.len_m / L0.wid) * U, x = it.x_m * U, z = -it.y_m * U;
            var y = minGround(x, z, L0.wid * k * 0.35) + (it.lift_m || 0) * U;
            var ck = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
            (byCell[ck] = byCell[ck] || []).push(m4.compose(p.set(x, y, z), q.setFromAxisAngle(yA, -(it.yaw || 0) * Math.PI / 180), s.set(k, k, k)).clone());
          });
          // BATCHED: one InstancedMesh per (model, LOD set, part) — capacity = every instance of the model — refilled from the cells that are in
          // that LOD band (see update). Draw calls drop from (cells x models x LODs x parts) to (models x LODs x parts). Content and LOD rules are unchanged.
          var total = byKey[key].length, K = { total: total, cellMats: {}, sets: [] };
          function makeSet(L, shadow) {
            return L.parts.map(function (pt) {
              var im = new THREE.InstancedMesh(pt.geo, pt.mat, total); im.count = 0; im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true;
              im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.visible = false; im.name = 'cluster:' + key; group.add(im); st.meshes++; return im;
            });
          }
          var s0 = makeSet(L0, true), s1 = L1 ? makeSet(L1, false) : null, s2 = L2 ? makeSet(L2, false) : null;
          K.sets = [s0, s1 || s0, s2 || s1 || s0];
          Object.keys(byCell).forEach(function (ck) {
            var mats = byCell[ck], c = cells[ck] || (cells[ck] = { entries: [], centre: new THREE.Vector3(), n: 0, state: -1 });
            var arr = new Float32Array(mats.length * 16); mats.forEach(function (m, i) { m.toArray(arr, i * 16); });
            K.cellMats[ck] = arr; c.entries.push({ K: K, ck: ck });
            mats.forEach(function (m) { c.centre.x += m.elements[12]; c.centre.z += m.elements[14]; c.n++; });
          });
          allK.push(K);
        }).catch(function (e) { st.failed.push(key); console.warn(TAG + key + ' failed: ' + (e && e.message)); });
      })).then(function () {
        Object.keys(cells).forEach(function (ck) { var c = cells[ck]; c.centre.x /= c.n; c.centre.z /= c.n; });
        st.cells = Object.keys(cells).length;
        if (pushed && window.buildWorldCollision && window.WORLD_LAYOUT) window.buildWorldCollision(window.WORLD_LAYOUT);   // full rebuild — skip when nothing new
        console.info(TAG + st.items + ' pieces · ' + st.types + ' model types · ' + st.cells + ' cells · ' + st.meshes + ' chunk meshes · ' + Math.round(CELL / U) + ' m cells · ' + pushed + ' colliders (LOD: full < ' + Math.round(NEAR / U) + ' m, lod1 < ' + Math.round(FAR / U) + ' m' + (WANT2 ? ', lod2 < ' + Math.round(HIDE / U) + ' m' : '') + ')' + (st.failed.length ? ' · failed ' + st.failed.join(',') : '') + (st.noLod2.length ? ' · no lod2: ' + st.noLod2.join(',') : ''));
        var acc = 1, lastYaw = 9, lastX = 1e9, lastZ = 1e9;
        // FRUSTUM CULL (FPS S1, 2026-10-09): cells outside the view no longer draw (before, only cells clearly BEHIND the camera were
        // skipped, so whole side cells of fabric - ~1.3M tris - drew off-screen). Tall sphere per cell (towers reach ~320 m) and a 1.6x
        // radius margin so cells coming into view on a turn are already on; near cells always stay. ?fcull=0 = old behaviour.
        var FCULL = !(typeof location !== 'undefined' && /[?&]fcull=0\b/.test(location.search)), _frus = new THREE.Frustum(), _fm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1);
        var CELL_R = Math.hypot(CELL * 0.75, 170 * U) * 1.6;
        return {
          group: group,
          update: function (t, dt, cam) {       // re-pick LODs 4×/s — cells are 1 km, so that's plenty
            acc += dt || 0; if (acc < (FCULL ? 0.15 : 0.25) || !cam) return; acc = 0; st.near = st.mid = st.far = st.hidden = 0; st.frustumHidden = 0;
            // QUALITY-GOVERNOR LOD: scale the tier bands by the FPS governor's quality tier — a weak GPU
            // tightens the bands (less full-detail inventory, fewer cells → fewer draw calls), a fast machine
            // keeps the full preset distances. Content never changes: same models, same cells, only which
            // LOD each cell shows at a given distance. Restores automatically when the governor climbs.
            var qi = window.__w3dTierIdx, kf = qi === 0 ? 0.4 : qi === 1 ? 0.6 : qi === 2 ? 0.8 : qi === 3 ? 0.92 : 1;
            var nN = NEAR * kf, nF = FAR * kf, nH = HIDE * kf;
            // FOG CUTOFF: with exp2 fog, everything beyond ~2.05/density is >98.5% fog colour (invisible). Never draw what fog already hides:
            // the city fabric alone is ~2,000 draw calls at a 2.6 km hide radius. Content is untouched; only cells the fog fully covers switch off.
            var fg = scene.fog, fogD = Infinity; if (/[?&]nofogcut=1/.test(location.search)) fg = null;   // A/B switch for perf tests
            if (fg) { if (fg.density > 0) fogD = 2.05 / fg.density * 1.15; else if (fg.far) fogD = fg.far * 1.05; }
            nF = Math.min(nF, Math.max(fogD, nN * 1.1)); nH = Math.min(nH, Math.max(fogD, nF)); st.fogCutoffM = isFinite(fogD) ? Math.round(fogD / U) : null;
            var dirty = false, cx = cam.x, cz = cam.z, fx = 0, fz = 0, camObj = window.__w3dDebug && window.__w3dDebug.camera;
            if (camObj) { var me = camObj.matrixWorld.elements; fx = -me[8]; fz = -me[10]; var fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl; }
            var useF = FCULL && camObj; if (useF) { camObj.updateMatrixWorld(); _fm.multiplyMatrices(camObj.projectionMatrix, camObj.matrixWorldInverse); _frus.setFromProjectionMatrix(_fm); _sph.radius = CELL_R; }
            var yawNow = Math.atan2(fx, fz), turned = Math.abs(Math.atan2(Math.sin(yawNow - lastYaw), Math.cos(yawNow - lastYaw))) > 0.26 || Math.hypot(cx - lastX, cz - lastZ) > 40 * U;   // >15 deg or 40 m
            Object.keys(cells).forEach(function (ck) {
              var c = cells[ck], dx = c.centre.x - cx, dz = c.centre.z - cz, d = Math.hypot(dx, dz) - CELL * 0.7;
              // HYSTERESIS: keep the cell's CURRENT tier unless d is clearly outside its band edge ± HYST —
              // stops the popping/flicker when the camera sits right on a boundary, and cuts dirty flips,
              // which each drive a full O(cells×keys) instance-buffer rebuild. HYST = 0.15×cell ≈ 37 m.
              var HYST = CELL * 0.15, s;
              var lo = c.state === 0 ? -1e9 : c.state === 1 ? nN : c.state === 2 ? nF : nH;
              var hi = c.state === 0 ? nN : c.state === 1 ? nF : c.state === 2 ? nH : 1e9;
              if (c.state >= 0 && c.state <= 3 && d >= lo - HYST && d <= hi + HYST) s = c.state;
              else s = pickTier(d, nN, nF, nH, true, true);   // per-key fallbacks are baked into each entry's tiers[]
              // cells clearly BEHIND the camera are skipped (a cheap stand-in for per-chunk frustum culling); nearby cells always stay in
              var back = d > CELL * 1.5 && camObj && (dx * fx + dz * fz) < -0.35 * Math.hypot(dx, dz);
              if (back) s = 3;
              else if (useF && s < 3 && d > CELL * 0.5) { _sph.center.set(c.centre.x, 85 * U, c.centre.z); if (!_frus.intersectsSphere(_sph)) { s = 3; st.frustumHidden++; } }
              if (s === 0) st.near++; else if (s === 1) st.mid++; else if (s === 2) st.far++; else st.hidden++;
              if (s !== c.state) { c.state = s; dirty = true; }
            });
            if (!dirty && !turned) return;
            lastYaw = yawNow; lastX = cx; lastZ = cz;
            allK.forEach(function (K) {
              var seen = [], si;
              for (si = 0; si < 3; si++) { if (seen.indexOf(K.sets[si]) < 0) seen.push(K.sets[si]); }
              seen.forEach(function (set) {
                var n = 0, arr0 = set[0].instanceMatrix.array;
                Object.keys(cells).forEach(function (ck) {
                  var c = cells[ck]; if (c.state < 0 || c.state > 2 || K.sets[c.state] !== set) return;
                  var src = K.cellMats[ck]; if (!src) return; arr0.set(src, n * 16); n += src.length / 16;
                });
                for (var j = 0; j < set.length; j++) {
                  var im = set[j]; if (j > 0) im.instanceMatrix.array.set(arr0.subarray(0, n * 16));
                  im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true;
                }
              });
            });
          },
          stats: function () { return st; },
          dispose: function () { scene.remove(group); }
        };
      });
    });
  };
})();
