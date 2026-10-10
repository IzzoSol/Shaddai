/* world-reef.js — the REEF STATION (reference: reef clip d93016…): white clearcoat pods, glass band, wooden deck,
 * gold rail, pier piles. Built in code, attached to the existing ocean (no second ocean), budget ~13 draws.
 *   var r = WorldReef.create({ THREE, scene, U, x, z, waterY(x,z)->y|null, groundY?(x,z)->y, rot? });
 *   r.group · r.draws (count) · r.update(t) (no-op for now; hook for later) · r.dispose()
 * All sizes are in METRES; U = world units per metre (the host's V4_U). Materials are reused, nothing per frame.
 * UMD: window.WorldReef or module.exports. */
(function (root) {
  'use strict';
  var PODS = [   // [dx, dz, radiusM, height offset M] — a loose ring of five pods around a centre
    [0, 0, 22, 0], [-38, -14, 16, 0.4], [36, -18, 17, 0.2], [-22, 30, 14, 0.6], [30, 28, 15, 0.3]
  ];
  var DECK_M = 60, DECK_T = 1.2, PILE_N = 8, PILE_R = 0.9;

  function create(o) {
    var THREE = o.THREE, U = o.U || 1, cx = o.x || 0, cz = o.z || 0;
    var water = o.waterY || function () { return 0; };
    var g = new THREE.Group(); g.name = 'reef-station';
    var draws = 0;

    // Materials (shared; reused for every pod so the draw count stays flat)
    var white = new THREE.MeshPhysicalMaterial({ color: 0xf4f7fa, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.12 });
    var glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd8e8, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false });
    var wood = new THREE.MeshStandardMaterial({ color: 0xa7774a, roughness: 0.8 });
    var gold = new THREE.MeshStandardMaterial({ color: 0xd4b46a, metalness: 1, roughness: 0.25 });
    var pile = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6 });

    // Surface height at a point: the water surface if it's water, else the ground (or 0)
    function surfaceAt(x, z) { var w = water(x, z); if (w != null) return w; return o.groundY ? o.groundY(x, z) : 0; }
    var baseY = surfaceAt(cx, cz) + 1.2 * U;   // deck sits 1.2 m above the surface at the centre

    // Pods: sphere scaled to a flattened dome (1 x 0.45 x 1), radius in metres
    // o.podGeometry = a hero pod from Blender (assets/reef/reef-pod.glb, 2 m wide, already flattened to 0.45 m tall):
    // it is scaled uniformly by radius; the code sphere is the fallback and is flattened here instead.
    var podGeo = o.podGeometry || new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    var heroPod = !!o.podGeometry;
    PODS.forEach(function (p) {
      var m = new THREE.Mesh(podGeo, white);
      m.scale.set(p[2] * U, (heroPod ? p[2] : 0.45 * p[2]) * U, p[2] * U);
      m.position.set(cx + p[0] * U, baseY + p[3] * U, cz + p[1] * U);
      m.castShadow = false; m.receiveShadow = false; g.add(m); draws++;
      // glass band: a thin ring of glass around each pod's waist
      var band = new THREE.Mesh(new THREE.CylinderGeometry(p[2] * U * 1.01, p[2] * U * 1.01, 1.4 * U, 28, 1, true), glass);
      band.position.set(m.position.x, m.position.y + 0.3 * p[2] * U * 0.45, m.position.z); g.add(band); draws++;
    });

    // Deck: one box across the pod ring
    var deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_M * U, DECK_T * U, DECK_M * U * 0.5), wood);
    deck.position.set(cx, baseY - 0.2 * DECK_T * U, cz); g.add(deck); draws++;

    // Gold rail: a tube along the deck's outer edge (rectangle, 4 segments)
    var hw = DECK_M * U / 2, hd = DECK_M * U * 0.25, y = baseY + 1.1 * U;
    var pts = [
      new THREE.Vector3(cx - hw, y, cz - hd), new THREE.Vector3(cx + hw, y, cz - hd),
      new THREE.Vector3(cx + hw, y, cz + hd), new THREE.Vector3(cx - hw, y, cz + hd),
      new THREE.Vector3(cx - hw, y, cz - hd)
    ];
    var rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.12 * U, 6, true), gold);
    g.add(rail); draws++;

    // Pier piles: one InstancedMesh, placed under the deck where water is deep enough
    var pileGeo = new THREE.CylinderGeometry(PILE_R * U, PILE_R * U, 1, 8);
    var inst = new THREE.InstancedMesh(pileGeo, pile, PILE_N);
    var mtx = new THREE.Matrix4(), n = 0;
    for (var i = 0; i < PILE_N; i++) {
      var a = i / PILE_N * Math.PI * 2, px = cx + Math.cos(a) * hw * 0.9, pz = cz + Math.sin(a) * hd * 0.9;
      var bottom = (o.groundY ? o.groundY(px, pz) : surfaceAt(px, pz) - 10 * U);
      var top = baseY - 0.2 * DECK_T * U, h = Math.max(1 * U, top - bottom);
      mtx.makeScale(1, h, 1); mtx.setPosition(px, bottom + h / 2, pz);
      inst.setMatrixAt(n++, mtx);
    }
    inst.count = n; inst.instanceMatrix.needsUpdate = true; g.add(inst); draws++;

    if (o.rot) g.rotation.y = o.rot;
    if (o.scene) o.scene.add(g);
    return {
      group: g, draws: draws,
      update: function () { },
      dispose: function () {
        if (o.scene) o.scene.remove(g);
        g.traverse(function (m) { if (m.geometry) m.geometry.dispose(); });
        [white, glass, wood, gold, pile].forEach(function (mt) { mt.dispose(); });
      }
    };
  }

  var api = { create: create, PODS: PODS, DECK_M: DECK_M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldReef = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
