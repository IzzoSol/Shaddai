/* world-district-signs.js — district identity signs in the Grid (owner 2026-10-16, districts authored in Blender -> assets/world/districts-v1.json).
 *   WorldDistrictSigns.build({ THREE, scene, heightAt, U, data })  -> { group, signs }
 * One tall holo pylon per district at its centroid (bearing mid, radius mid): district name + what you do there, in the district colour,
 * double-sided, always facing the Grid centre so you read it as you arrive. A toast names the district when you cross into it.
 * 2 meshes per district (pylon + panel) -> ~10 draw calls total. ?districtsigns=0 = off.
 */
(function (root) {
  'use strict';
  var WHAT = { core: 'Athenaeum · Job Hall · quests', academy: 'Lessons · agent training · skill books', trade: 'Shops · market screens · auctions',
    residential: 'Homes for Sparks · plots · agent dorms', forge: 'Workshops · boards · ships · upgrades' };
  function panelTex(THREE, d) {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 384; var g = c.getContext('2d');
    g.fillStyle = 'rgba(4,8,14,0.82)'; g.fillRect(0, 0, 1024, 384); g.strokeStyle = d.color; g.lineWidth = 10; g.strokeRect(8, 8, 1008, 368);
    g.fillStyle = d.color; g.font = '900 92px Orbitron, Arial, sans-serif'; g.textAlign = 'center'; g.fillText(String(d.label).split(' - ')[0].split(' / ')[0], 512, 170);
    g.fillStyle = '#e8f6ff'; g.font = '700 46px Rajdhani, Arial, sans-serif'; g.fillText(WHAT[d.id] || '', 512, 270);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]districtsigns=0\b/.test(location.search)) return null;
    var THREE = o.THREE, U = o.U || 7 / 1.8, D = (o.data && o.data.districts) || [], group = new THREE.Group(); group.name = 'world-district-signs'; o.scene.add(group);
    var signs = [];
    D.forEach(function (d) {
      var full = d.bearing[1] - d.bearing[0] >= 359, bm = (d.bearing[0] + d.bearing[1]) / 2 * Math.PI / 180, rm = full ? 150 : (d.radius_m[0] + d.radius_m[1]) / 2;
      var x = rm * Math.sin(bm) * U, z = -rm * Math.cos(bm) * U, y = o.heightAt ? o.heightAt(x, z) : 0, col = new THREE.Color(d.color);
      var pylon = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * U, 1.6 * U, 44 * U, 8), new THREE.MeshStandardMaterial({ color: 0x0b0f16, emissive: col, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.35 }));
      pylon.position.set(x, y + 22 * U, z); group.add(pylon);
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(40 * U, 15 * U), new THREE.MeshBasicMaterial({ map: panelTex(THREE, d), side: THREE.DoubleSide, transparent: true, toneMapped: false }));
      panel.position.set(x, y + 36 * U, z); panel.lookAt(0, y + 36 * U, 0); group.add(panel);
      signs.push({ id: d.id, x: x, z: z });
    });
    // crossing into a district names it (bearing + radius band from the same data)
    var last = null;
    if (o.getPlayer) setInterval(function () { var p = o.getPlayer(); if (!p) return; var xm = p.x / U, ym = -p.z / U, r = Math.hypot(xm, ym), b = (Math.atan2(xm, ym) * 180 / Math.PI + 360) % 360, cur = null;
      D.forEach(function (d) { if (r >= d.radius_m[0] && r <= d.radius_m[1] && (d.bearing[1] - d.bearing[0] >= 359 || (b >= d.bearing[0] && b <= d.bearing[1]))) cur = d; });
      if (cur && cur !== last && root.Navi && root.Navi.toast) root.Navi.toast(String(cur.label) + ' - ' + (WHAT[cur.id] || '')); last = cur; }, 1000);
    return { group: group, signs: signs };
  }
  root.WorldDistrictSigns = { build: build, WHAT: WHAT };
})(typeof window !== 'undefined' ? window : globalThis);
