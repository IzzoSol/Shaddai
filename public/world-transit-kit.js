/* world-transit-kit.js — dresses the maglev (world-transit.js) with the Blender kits:
 *   K7 shaddai_maglev_kit_v01.glb  → instanced pylon foot / unit shaft / hammerhead cap (replaces the code cylinders)
 *   K8 shaddai_station_<realm>_v01.glb → each station's realm canopy (replaces the code glass dome + ribs)
 *
 *   WorldTransitKit.dress({ THREE, GLTFLoader, api: window.__worldTransitApi, base? }) → Promise<{pylons, stations}>
 *
 * Kits are authored in metres (track along glTF Z, deck top = 0); world-transit works in units (PM = 7/1.8 per m)
 * with each station group's local +x along the track. Anything that fails to load leaves the code geometry in place.
 * The station GLB is lowered 1 m so its platforms (+1.0 m in the kit) sit at the code platform height the walk logic uses.
 */
(function (root) {
  'use strict';
  var BASE = '/assets/kits/';

  function load(loader, url) {
    return new Promise(function (res) { loader.load(url, function (g) { res(g); }, undefined, function (e) { console.warn('[transit-kit] missing', url, e && e.message); res(null); }); });
  }
  function meshesOf(node) {          // a glTF node with 2 materials arrives as a Group of Meshes (or a single Mesh)
    var out = []; node.traverse(function (o) { if (o.isMesh) out.push(o); }); return out;
  }

  function dressPylons(THREE, api, gltf) {
    var P = api.pylons; if (!P || !gltf) return 0;
    var foot = gltf.scene.getObjectByName('maglev_pylon_foot'), shaft = gltf.scene.getObjectByName('maglev_pylon_shaft'), cap = gltf.scene.getObjectByName('maglev_pylon_cap');
    if (!foot || !shaft || !cap) { console.warn('[transit-kit] pylon parts missing in kit'); return 0; }
    var PM = P.PM, n = P.list.length, m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    var FOOT_H = 1.8, CAP_H = 3.9;    // metres (k7_maglev.py)
    function inst(node, place) {
      meshesOf(node).forEach(function (src) {
        var im = new THREE.InstancedMesh(src.geometry, src.material, n); im.name = 'transit-kit-' + node.name;
        for (var i = 0; i < n; i++) { place(P.list[i]); im.setMatrixAt(i, m.compose(p, q, s)); }
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; api.group.add(im);
      });
    }
    inst(foot, function (it) { q.identity(); p.set(it.x, it.g - 0.3 * PM, it.z); s.set(PM, PM, PM); });
    inst(shaft, function (it) { q.identity(); var y0 = it.g + (FOOT_H - 0.3) * PM, h = Math.max(PM, P.deckBottom - CAP_H * PM - y0); p.set(it.x, y0, it.z); s.set(PM, h, PM); });
    var up = new THREE.Vector3(0, 1, 0);
    inst(cap, function (it) { p.set(it.x, P.deckBottom, it.z); s.set(PM, PM, PM); q.setFromAxisAngle(up, -Math.atan2(it.z, it.x)); });   // hammerhead spans the deck: its local X -> the ring radius
    q.identity();
    P.cols.visible = false; P.collars.visible = false;
    return n;
  }

  function dressStation(THREE, st, gltf, PM) {
    if (!gltf) return false;
    var model = gltf.scene; model.scale.setScalar(PM);
    model.rotation.y = Math.PI / 2;                       // kit track axis (Z) -> station local +x
    model.position.set(0, st.top - 1.0 * PM, 0);
    st.group.add(model);
    st.group.traverse(function (o) { if (o.userData && (o.userData.codeCanopy || o.userData.codePlatform)) o.visible = false; });
    return true;
  }

  root.WorldTransitKit = {
    dress: function (o) {
      var THREE = o.THREE, api = o.api, base = o.base || BASE; if (!api || !THREE || !o.GLTFLoader) return Promise.resolve(null);
      var loader = new o.GLTFLoader(), PM = (api.pylons && api.pylons.PM) || 7 / 1.8;
      var jobs = [load(loader, base + 'shaddai_maglev_kit_v01.glb').then(function (g) { return dressPylons(THREE, api, g); })];
      var byRealm = {};
      (api.stations || []).forEach(function (st) { if (st.realm && st.onRing !== false) (byRealm[st.realm] = byRealm[st.realm] || []).push(st); });
      Object.keys(byRealm).forEach(function (realm) {
        jobs.push(load(loader, base + 'shaddai_station_' + realm + '_v01.glb').then(function (g) {
          var done = 0; byRealm[realm].forEach(function (st, i) { if (dressStation(THREE, st, i === 0 || !g ? g : { scene: g.scene.clone(true) }, PM)) done++; }); return done;
        }));
      });
      return Promise.all(jobs).then(function (r) {
        var out = { pylons: r[0], stations: r.slice(1).reduce(function (a, b) { return a + b; }, 0) };
        console.info('[transit-kit] dressed', out.pylons, 'pylons,', out.stations, 'stations'); return out;
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
