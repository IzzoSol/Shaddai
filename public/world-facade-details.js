/* world-facade-details.js — EXTERIOR DETAIL PASS for the repeated city buildings (owner 2026-10-01: "the repeated buildings are decent but basic on the outside";
 * art direction from TURTLE: rooftop prop kit + ground-floor glow band + district identity, all instanced, no lights).
 *
 *   var fd = window.buildFacadeDetails({ THREE, scene, heightAt, getPlayer(): {pos}, url?: '/assets/world/grid-fabric-v4.json' })
 *   fd.update(dt)   fd.stats()   fd.dispose()
 *
 * Reads the SAME placement list the building clusters use (items: key, x_m, y_m, len_m, yaw, lift_m, by_height, cluster) so every detail lands exactly on its building.
 * Only buildings within NEAR_M of the player get details (rebuilt when you move > 100 m): 4 InstancedMeshes total =
 *   vents (roof, 1-3 per building) · antennas (tall buildings) · antenna tips (emissive) · ground-floor GLOW BAND (district colour: Commons gold, Campus cyan, Race quarter magenta).
 * Zero lights, zero per-frame allocation. Units: world units (U = 7/1.8 per metre); building local frame = model metres, origin bottom-centre.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, NEAR_M = 420, MAX_B = 700;
  // model sizes in metres (x, y, z) measured from public/assets/models/shaddai-city/*.glb
  var DIMS = { 'sc-civic-tower': [16.6, 48.4, 16.9], 'sc-garden': [24.9, 2.7, 20], 'sc-market': [29, 7.2, 21], 'sc-office-mid': [20.6, 18, 16.6], 'sc-office': [20.9, 14.8, 20.6], 'sc-storefront-l': [24.6, 11.6, 17.1], 'sc-storefront-s': [17.6, 8.4, 13.4], 'sc-techlab': [24.3, 13.6, 17.2], 'sc-teleport': [16, 6.3, 16] };
  var BAND = { 'sc-office-mid': 1, 'sc-office': 1, 'sc-storefront-l': 1, 'sc-storefront-s': 1, 'sc-techlab': 1, 'sc-market': 1 };
  var CLUSTER_COL = { commons: 0xe8c45c, 'ne-campus': 0x27e0ff, 'nw-race': 0xff3ea5 };
  function hash(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

  root.buildFacadeDetails = function (o) {
    var THREE = o.THREE, scene = o.scene, hAt = o.heightAt, items = null, lastX = 1e12, lastZ = 1e12, tAcc = 0, st = { buildings: 0, vents: 0, antennas: 0, bands: 0 };
    var group = new THREE.Group(); group.name = 'facade-details'; scene.add(group);
    var ventG = new THREE.CylinderGeometry(0.6, 0.7, 0.9, 8), antG = new THREE.CylinderGeometry(0.08, 0.14, 1, 5), tipG = new THREE.SphereGeometry(0.28, 6, 5), bandG = new THREE.BoxGeometry(1, 1, 1);
    var ventM = new THREE.MeshLambertMaterial({ color: 0x2c3442 }), antM = new THREE.MeshLambertMaterial({ color: 0x57657a }), tipM = new THREE.MeshBasicMaterial({ color: 0xff5a4a }), bandM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var vents = new THREE.InstancedMesh(ventG, ventM, MAX_B * 3), ants = new THREE.InstancedMesh(antG, antM, MAX_B), tips = new THREE.InstancedMesh(tipG, tipM, MAX_B), bands = new THREE.InstancedMesh(bandG, bandM, MAX_B);
    [vents, ants, tips, bands].forEach(function (m, i) { m.frustumCulled = false; m.count = 0; m.name = ['fd-vents', 'fd-antennas', 'fd-tips', 'fd-bands'][i]; group.add(m); });
    bands.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_B * 3), 3);
    var dummy = new THREE.Object3D(), col = new THREE.Color(), yA = new THREE.Vector3(0, 1, 0);

    function load() {
      var url = o.url || ((typeof location !== 'undefined' && /[?&](citylayout=0|fullcity=1)/.test(location.search)) ? '/assets/world/grid-fabric-v4.json' : '/assets/world/grid-fabric-districts-v1.json');   // follow the designed layout (2026-10-16)
      fetch(url).then(function (r) { return r.json(); }).then(function (j) { items = (j.items || []).filter(function (it) { return DIMS[it.key]; }); }).catch(function (e) { if (root.console) console.warn('[facade-details] load failed', e && e.message); });
    }
    function rebuild(px, pz) {
      var nv = 0, na = 0, nb = 0, near = [], r2 = NEAR_M * U * NEAR_M * U;
      for (var i = 0; i < items.length; i++) { var it = items[i], x = it.x_m * U, z = -it.y_m * U, dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz; if (d2 < r2) near.push([d2, i]); }
      near.sort(function (a, b) { return a[0] - b[0]; }); if (near.length > MAX_B) near.length = MAX_B;
      for (var n = 0; n < near.length; n++) {
        var idx = near[n][1], it2 = items[idx], D = DIMS[it2.key], wid = Math.max(D[0], D[2]), k = (it2.by_height ? it2.len_m / D[1] : it2.len_m / wid) * U, x2 = it2.x_m * U, z2 = -it2.y_m * U, yaw = -(it2.yaw || 0) * Math.PI / 180;
        var gy = Math.min(hAt(x2, z2), hAt(x2 + D[0] * k * 0.3, z2), hAt(x2 - D[0] * k * 0.3, z2), hAt(x2, z2 + D[2] * k * 0.3), hAt(x2, z2 - D[2] * k * 0.3)) + (it2.lift_m || 0) * U, hgt = D[1] * k, cy = Math.cos(yaw), sy = Math.sin(yaw);
        var local = function (lx, lz) { return [x2 + lx * cy + lz * sy, z2 - lx * sy + lz * cy]; };   // rotation about Y by yaw (matches the cluster compose)
        var h = hash(idx);
        // rooftop vents (not on towers / gardens)
        if (it2.key !== 'sc-garden' && it2.key !== 'sc-civic-tower') { var nVent = 1 + Math.floor(h * 3); for (var v = 0; v < nVent && nv < vents.instanceMatrix.count; v++) { var hv = hash(idx * 7 + v), lx = (hv - 0.5) * D[0] * k * 0.6, lz = (hash(idx * 11 + v) - 0.5) * D[2] * k * 0.6, p = local(lx, lz); dummy.position.set(p[0], gy + hgt + 0.45 * U, p[1]); dummy.rotation.set(0, hv * 6.28, 0); dummy.scale.setScalar(U * (0.8 + hv * 0.7)); dummy.updateMatrix(); vents.setMatrixAt(nv++, dummy.matrix); } }
        // antennas on tall buildings (+ red tip)
        if (hgt > 11 * U && h > 0.35 && na < MAX_B) { var al = (hash(idx * 3) - 0.5) * D[0] * k * 0.5, az = (hash(idx * 5) - 0.5) * D[2] * k * 0.5, ap = local(al, az), aH = (4 + h * 6) * U; dummy.position.set(ap[0], gy + hgt + aH / 2, ap[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(U, aH, U); dummy.updateMatrix(); ants.setMatrixAt(na, dummy.matrix);
          dummy.position.set(ap[0], gy + hgt + aH + 0.2 * U, ap[1]); dummy.scale.setScalar(U); dummy.updateMatrix(); tips.setMatrixAt(na, dummy.matrix); na++; }
        // ground-floor glow band in the district colour (box-ish buildings)
        if (BAND[it2.key] && nb < MAX_B) { dummy.position.set(x2, gy + 3.4 * U, z2); dummy.rotation.set(0, yaw, 0); dummy.scale.set(D[0] * k * 1.012, 0.32 * U, D[2] * k * 1.012); dummy.updateMatrix(); bands.setMatrixAt(nb, dummy.matrix); col.setHex(CLUSTER_COL[it2.cluster] || 0xe8c45c); bands.setColorAt(nb, col); nb++; }
      }
      vents.count = nv; ants.count = na; tips.count = na; bands.count = nb; vents.instanceMatrix.needsUpdate = ants.instanceMatrix.needsUpdate = tips.instanceMatrix.needsUpdate = bands.instanceMatrix.needsUpdate = true; if (bands.instanceColor) bands.instanceColor.needsUpdate = true;
      st.buildings = near.length; st.vents = nv; st.antennas = na; st.bands = nb;
    }
    load();
    function update(dt) {
      var pl = o.getPlayer ? o.getPlayer() : null; if (!pl || !pl.pos || !items) return; tAcc += dt;
      if (Math.hypot(pl.pos.x - lastX, pl.pos.z - lastZ) > 100 * U || (tAcc > 30 && Math.hypot(pl.pos.x - lastX, pl.pos.z - lastZ) > 20 * U)) { lastX = pl.pos.x; lastZ = pl.pos.z; tAcc = 0; rebuild(lastX, lastZ); }
    }
    return { update: update, stats: function () { return { items: items ? items.length : 0, buildings: st.buildings, vents: st.vents, antennas: st.antennas, bands: st.bands }; }, dispose: function () { scene.remove(group); }, group: group };
  };
})(typeof window !== 'undefined' ? window : globalThis);
