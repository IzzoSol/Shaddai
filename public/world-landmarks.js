/* world-landmarks.js — arena (walk-in colosseum platform) + castle moat glow + garage beacon.
 * All procedural + EXISTING shipped models. Real fal assets land Thursday in the same spots. */
window.buildWorldLandmarks = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, layout = opts.layout || window.WORLD_LAYOUT;
  if (!THREE || !scene || !layout) return null;
  var group = new THREE.Group();
  group.name = 'world-landmarks';
  scene.add(group);
  var dis = [], track = function (o) { dis.push(o); return o; };

  // ── COLOSSEUM (south road end, [-14, 460]): bld-mecha-arena on a walk-in plateau ──
  var _coLm = layout && layout.landmark && layout.landmark('colosseum');
  var AR = _coLm ? { x: _coLm.pos[0], z: _coLm.pos[1] } : { x: -14, z: 460 };   // MAP v2: from WORLD_LAYOUT
  var _realColo = !!window.buildColosseumExterior;   // MAP v3: the real-size exterior (world-colosseum.js) replaces this 92u placeholder
  var arenaFloor = new THREE.Mesh(track(new THREE.CircleGeometry(46, 48)),
    track(new THREE.MeshStandardMaterial({ color: 0x1a1626, roughness: 0.5, metalness: 0.4, emissive: 0x2a1a40, emissiveIntensity: 0.5 })));
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.set(AR.x, 1.32, AR.z);
  arenaFloor.receiveShadow = true;
  if (!_realColo) group.add(arenaFloor);
  var arenaRim = new THREE.Mesh(track(new THREE.TorusGeometry(46, 0.5, 8, 72)),
    track(new THREE.MeshStandardMaterial({ color: 0xe8c45c, roughness: 0.3, metalness: 0.9, emissive: 0xe8c45c, emissiveIntensity: 0.35 })));
  arenaRim.rotation.x = Math.PI / 2;
  arenaRim.position.set(AR.x, 1.42, AR.z);
  if (!_realColo) group.add(arenaRim);
  var arenaLight = new THREE.PointLight(0xc084fc, 120, 140, 1.6);
  arenaLight.position.set(AR.x, 14, AR.z);
  if (!_realColo) group.add(arenaLight);

  // ── CASTLE MOAT GLOW (darkforest castle ring) ──
  var df = (layout.biomes || []).find(function (b) { return b.id === 'darkforest'; });
  if (df) {
    var moat = new THREE.Mesh(track(new THREE.TorusGeometry(34, 1.4, 8, 64)),
      track(new THREE.MeshStandardMaterial({ color: 0x5fe0ff, emissive: 0x5fe0ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.6 })));
    moat.rotation.x = Math.PI / 2;
    moat.position.set(df.center[0], 1.3, df.center[1]);
    group.add(moat);
    var cl1 = new THREE.PointLight(0x9b59f5, 90, 110, 1.7); cl1.position.set(df.center[0], 22, df.center[1]); group.add(cl1);
  }

  // ── GARAGE BEACON (plaza, [26, 96]): gold ring pad where the hover shop opens (B) ──
  var GB = { x: 26, z: 96 };
  var pad = new THREE.Mesh(track(new THREE.CylinderGeometry(4.4, 4.7, 0.24, 32)),
    track(new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.4, metalness: 0.7 })));
  pad.position.set(GB.x, 0.14, GB.z);
  group.add(pad);
  var ring = new THREE.Mesh(track(new THREE.TorusGeometry(4.4, 0.16, 8, 40)),
    track(new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0xe8c45c, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.9 })));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(GB.x, 0.3, GB.z);
  group.add(ring);

  // mecha-arena GLB seated on the plateau (fallback: skip — the platform still reads)
  if (opts.loader && !_realColo) {
    opts.loader.load('/assets/models/bld-mecha-arena.glb', function (g) {
      var m = g.scene;
      var box = new THREE.Box3().setFromObject(m); var sz = box.getSize(new THREE.Vector3());
      m.scale.multiplyScalar(92 / Math.max(sz.x, sz.z, 0.001));
      var yOff = -new THREE.Box3().setFromObject(m).min.y;
      m.name = 'colosseum-arena';
      m.position.set(AR.x, 1.3 + yOff, AR.z);
      group.add(m);
    }, undefined, function () {});
  }

  var api = {
    group: group,
    arenaPos: [AR.x, AR.z],
    garagePos: [GB.x, GB.z],
    update: function (t) {
      ring.position.y = 0.3 + Math.abs(Math.sin(t * 1.8)) * 0.1;
      arenaRim.material.emissiveIntensity = 0.35 + Math.sin(t * 1.2) * 0.12;
    },
    dispose: function () {
      scene.remove(group);
      dis.forEach(function (d) { if (d.geometry) d.geometry.dispose(); if (d.material) d.material.dispose(); });
      try { if (window.__worldLandmarks === api) delete window.__worldLandmarks; } catch (e) {}
    },
  };
  try { window.__worldLandmarks = api; } catch (e) {}
  return api;
};
