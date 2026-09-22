/* world-trails.js — FULL MAP roads (2026-09-21): glowing light-trails from the plaza
 * through each mountain pass to its realm gate. Futuristic SHADDAI roads are TRAILS OF
 * LIGHT, not asphalt — gold emitters every ~6u, seated on the terrain (heightAt),
 * pulsing gently. One InstancedMesh = one draw call for the whole network.
 *
 * Integration: worldTrails = window.buildWorldTrails({ THREE, scene, layout, heightAt });
 *   worldTrails.update(t);   // pulse only — zero allocations
 */
window.buildWorldTrails = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, layout = opts.layout || window.WORLD_LAYOUT;
  var heightAt = opts.heightAt || function () { return 0; };
  if (!THREE || !scene || !layout) return null;

  var group = new THREE.Group();
  group.name = 'world-trails';
  scene.add(group);

  // trail heads: bearing (atan2(z,x) convention, matches world-terrain _PASSES) + end radius
  var ROUTES = [
    { a: 0.785,  end: 540, name: 'meadow' },
    { a: 0.074,  end: 540, name: 'suburb' },
    { a: -0.736, end: 520, name: 'volcano' },
    { a: -2.405, end: 540, name: 'darkforest' },
    { a: 2.366,  end: 265, name: 'ocean-dock' },
    { a: 1.6,    end: 440, name: 'colosseum' },   // south road to the arena
  ];

  // collect marker transforms
  var pts = [];
  ROUTES.forEach(function (R) {
    for (var r = 72; r <= R.end; r += 6) {
      var x = Math.cos(R.a) * r, z = Math.sin(R.a) * r;
      pts.push({ x: x, z: z, y: heightAt(x, z) + 0.08, r: r });
    }
    // realm-gate cap: a brighter, wider disc at the end of each trail
    var gx = Math.cos(R.a) * R.end, gz = Math.sin(R.a) * R.end;
    pts.push({ x: gx, z: gz, y: heightAt(gx, gz) + 0.1, r: -1 });
  });

  var geo = new THREE.CircleGeometry(1, 12);
  geo.rotateX(-Math.PI / 2);
  var mat = new THREE.MeshBasicMaterial({ color: 0xe8c45c, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false });
  var inst = new THREE.InstancedMesh(geo, mat, pts.length);
  inst.frustumCulled = false;

  var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (var i = 0; i < pts.length; i++) {
    var P = pts[i];
    var w = P.r < 0 ? 4.2 : 1.5;                 // trail node vs gate cap
    p.set(P.x, P.y, P.z);
    q.setFromEuler(new THREE.Euler(0, i * 0.39, 0));
    s.set(w, 1, w);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  group.add(inst);

  var api = {
    group: group,
    update: function (t) { mat.opacity = 0.7 + Math.sin(t * 1.7) * 0.15; },
    dispose: function () {
      scene.remove(group);
      geo.dispose(); mat.dispose();
      try { if (window.__worldTrails === api) delete window.__worldTrails; } catch (e) {}
    },
  };
  try { window.__worldTrails = api; } catch (e) {}
  return api;
};
