/* world-realmprops.js — FULL MAP (2026-09-21): the three remaining outer realms,
 * built from EXISTING shipped models — zero fal spend (realer props Thursday).
 *
 *   DARKFOREST (NW): castle-siege keep on a mist rise + obsidian rocks + crystal
 *                    clusters — matches the 2D darkforest realm (moat castle).
 *   SUBURB (E):      the pod-block residential arc + inverted-cube hab + a business
 *                    crescent (neon-observatory office, sea-terrace-spire office,
 *                    holo-market) — the "offices" district matching the 2D city rooms.
 *   MEADOW (SE):     homes-mushroom-pods village circle — the farm/meadow realm.
 *
 * Integration (classic script, same pattern as world-ocean.js / world-volcano.js):
 *   worldRealmProps = window.buildWorldRealmProps({ THREE, scene, layout, loader });
 *   worldRealmProps.update(t);
 */
window.buildWorldRealmProps = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, layout = opts.layout || window.WORLD_LAYOUT;
  if (!THREE || !scene || !layout) return null;
  var group = new THREE.Group();
  group.name = 'world-realm-props';
  scene.add(group);
  var disposables = [];
  var track = function (o) { disposables.push(o); return o; };
  var placed = 0;
  var placedList = [];   // { m, x, z, r } — for update()'s distance-hide (landmarks are km apart; far ones are behind fog)
  var upAcc = 1e9, upCam = null;

  function biome(id) { return (layout.biomes || []).find(function (x) { return x.id === id; }); }
  function fit(m, w) {
    var box = new THREE.Box3().setFromObject(m);
    var sz = box.getSize(new THREE.Vector3());
    m.scale.multiplyScalar(w / Math.max(sz.x, sz.z, 0.001));
    var box2 = new THREE.Box3().setFromObject(m);
    return -box2.min.y;
  }
  function place(b, cfg) {
    if (cfg.abs) return { x: cfg.x, z: cfg.z, w: cfg.w };   // MAP v2 master list: absolute position + real-size width
    var cx = b ? b.center[0] : 0, cz = b ? b.center[1] : 0, r = (b && b.radius) || 120;
    return { x: cx + (cfg.dx || 0) * r, z: cz + (cfg.dz || 0) * r, w: (cfg.w || 0.5) * r };
  }

  // ── per-realm model manifests (dx/dz = fraction of biome radius; w = fraction too) ──
  // MAP v2: realm models come from the master list in world-layout.js (real sizes); literal below = v1 fallback
  var _mv2 = layout.realmModelsFor ? ['darkforest', 'suburb', 'meadow', 'forest', 'arctic', 'desert', 'void', 'ocean'].map(function (r) {
    return { biome: r, models: layout.realmModelsFor(r).map(function (m) { return { id: m.id, abs: true, x: m.x, z: m.z, w: m.w, y: m.y || 0, ry: m.ry || 0, office: m.office, url: m.url }; }) };
  }).filter(function (mf) { return mf.models.length; }) : [];
  var MANIFESTS = _mv2.length ? _mv2 : [
    { biome: 'darkforest', models: [
      { id: 'castle-siege',          dx: 0,     dz: 0,     w: 0.72, ry: 0.4 },
      { id: 'prop-obsidian-rocks',  dx: 0.52,  dz: -0.4,  w: 0.20, ry: 0 },
      { id: 'prop-obsidian-rocks',  dx: -0.55, dz: 0.45,  w: 0.24, ry: 1.2 },
      { id: 'prop-crystal-cluster', dx: 0.58,  dz: 0.5,   w: 0.16, ry: 0.6 },
      { id: 'prop-crystal-cluster', dx: -0.5,  dz: -0.52, w: 0.14, ry: 2.1 },
      { id: 'prop-crystal-cluster', dx: 0.1,   dz: 0.62,  w: 0.18, ry: 1.5 },
    ]},
    { biome: 'suburb', models: [
      { id: 'bld-apartment-pod-block', dx: -0.5, dz: 0.35, w: 0.62, ry: 0.2 },
      { id: 'bld-inverted-cube-hab',   dx: -0.15, dz: -0.5, w: 0.55, ry: -0.3 },
      { id: 'bld-neon-observatory',    dx: 0.45, dz: 0.4,  w: 0.60, ry: 0.5, office: true },
      { id: 'bld-sea-terrace-spire',   dx: 0.55, dz: -0.2, w: 0.58, ry: -0.6, office: true },
      { id: 'bld-holo-market-v2',      dx: 0.0,  dz: 0.55, w: 0.50, ry: 3.14 },
    ]},
    { biome: 'meadow', models: [
      { id: 'homes-mushroom-pods', dx: 0,     dz: 0,     w: 0.85, ry: 0 },
      { id: 'homes-mushroom-pods', dx: -0.5,  dz: 0.4,   w: 0.5,  ry: 0.8 },
      { id: 'homes-mushroom-pods', dx: 0.45,  dz: -0.42, w: 0.45, ry: 2.4 },
    ]},
  ];

  function fallback(cfg, w) {
    var g = new THREE.Group();
    var core = new THREE.Mesh(track(new THREE.BoxGeometry(w * 0.35, w * 0.45, w * 0.35)),
      track(new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.6, metalness: 0.35, emissive: 0x0a1420, emissiveIntensity: 0.3 })));
    core.position.y = w * 0.22; g.add(core);
    return g;
  }

  MANIFESTS.forEach(function (mf) {
    var b = biome(mf.biome);
    if (!b) return;
    mf.models.forEach(function (cfg) {
      var P = place(b, cfg);
      function mount(m, fromGLB) {
        if (fromGLB) m.traverse(function (o) {
          if (o.isMesh && o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
        });
        var yOff = fit(m, P.w);
        m.name = 'realm-' + mf.biome + '-' + cfg.id + (cfg.office ? '-office' : '');
        var gH = opts.heightAt ? opts.heightAt(P.x, P.z) : 0;   // MAP v3: sit ON the terrain (was hard y=0 — models sank/floated)
        m.position.set(P.x, gH + (cfg.y || 0) + yOff, P.z);
        m.rotation.y = cfg.ry || 0;
        group.add(m);
        placed++;
        // track for the distance-hide: bounding radius from the fitted box (computed once per model at load)
        try {
          var bb = new THREE.Box3().setFromObject(m), bsz = bb.getSize(new THREE.Vector3());
          placedList.push({ m: m, x: P.x, z: P.z, r: Math.max(bsz.x, bsz.z) * 0.6 });
        } catch (e) { placedList.push({ m: m, x: P.x, z: P.z, r: P.w * 0.6 }); }
        if (window.__registerPlaceable) window.__registerPlaceable('realm:' + mf.biome + ':' + cfg.id, m, { source: 'world-layout.js realmModels', realm: mf.biome, id: cfg.id });
      }
      if (opts.loader) {
        opts.loader.load(cfg.url || ('/assets/models/' + cfg.id + '.glb'), function (g) { mount(g.scene, true); },
          undefined, function () { mount(fallback(cfg, P.w), false); });
      } else {
        mount(fallback(cfg, P.w), false);
      }
    });
  });

  var api = {
    group: group,
    count: function () { return placed; },
    update: function (t, camPos) {   // distance-hide far realm GLBs — throttled 2×/s, never per-frame
      var cam = camPos || (window.__w3dDebug && window.__w3dDebug.camera && window.__w3dDebug.camera.position); if (!cam || !placedList.length) return;
      upAcc += 0.016; if (upAcc < 0.5 && upCam && Math.abs(cam.x - upCam.x) + Math.abs(cam.z - upCam.z) < 200) return;
      upAcc = 0; upCam = { x: cam.x, z: cam.z };
      // hide radius scales with the FPS governor's tier — weak GPUs hide farther-out landmarks sooner.
      // Everything is fog-covered at these distances (base 0.0006 × ~4 u/m), so the hide is invisible;
      // a model reappears the moment you approach. Full quality (ULTRA) never hides.
      var qi = window.__w3dTierIdx, hideM = qi === 0 ? 900 : qi === 1 ? 1200 : qi === 2 ? 1800 : qi === 3 ? 2400 : Infinity;
      var h2 = hideM * hideM;
      for (var i = 0; i < placedList.length; i++) {
        var e = placedList[i], dx = e.x - cam.x, dz = e.z - cam.z;
        e.m.visible = (dx * dx + dz * dz) < h2;
      }
    },
    dispose: function () {
      scene.remove(group);
      disposables.forEach(function (d) { if (d.geometry) d.geometry.dispose(); if (d.material) d.material.dispose(); });
      try { if (window.__worldRealmProps === api) delete window.__worldRealmProps; } catch (e) {}
    },
  };
  try { window.__worldRealmProps = api; } catch (e) {}
  return api;
};
