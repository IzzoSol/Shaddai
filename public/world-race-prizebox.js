/* world-race-prizebox.js — PRIZE BOXES for city circuits (2026-10-10, owner ref: black armoured sci-fi crate with green neon bands, Mario-Kart-style item box).
 * The race runtime already rolls rank-weighted items on pickup (world-race.js grabCrate); on city circuits the crates had no mesh. This draws them.
 *
 *   var pb = WorldRacePrizeBox.create({ THREE, scene, U, crates: [{x,y,z}], hover? })
 *   pb.setVisible(i, bool)   pickup / respawn          pb.update(dt)   spin + bob (call every frame)
 *   pb.pop(i)                short flash ring at the box (feedback on pickup)      pb.dispose()
 * 4 draw calls total: body, lid, neon bands, "?" glyph quads (instanced, one geometry each). No lights. Original art; code-drawn.
 */
(function (root) {
  'use strict';
  function glyphTex(THREE) {
    var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128); g.fillStyle = '#c8ff3c'; g.shadowColor = '#7dff3c'; g.shadowBlur = 14;
    g.font = '900 96px "Arial Black",Impact,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 70);
    var t = new THREE.CanvasTexture(c); return t;
  }
  function create(o) {
    var THREE = o.THREE, U = o.U || 7 / 1.8, C = o.crates || [], n = C.length, S = 2.0 * U, hover = (o.hover == null ? 2.2 : o.hover) * U;
    var grp = new THREE.Group(); grp.name = 'race-prizeboxes';
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c1210, roughness: 0.35, metalness: 0.85 });
    var lidMat = new THREE.MeshStandardMaterial({ color: 0x151d19, roughness: 0.3, metalness: 0.9 });
    var neonMat = new THREE.MeshBasicMaterial({ color: 0x7dff3c, toneMapped: false });
    var glyphMat = new THREE.MeshBasicMaterial({ map: glyphTex(THREE), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    var body = new THREE.InstancedMesh(new THREE.BoxGeometry(S, S * 0.72, S), bodyMat, n);
    var lid = new THREE.InstancedMesh(new THREE.BoxGeometry(S * 1.08, S * 0.2, S * 1.08).translate(0, S * 0.46, 0), lidMat, n);
    // two neon bands wrapping the body (slightly proud of the faces)
    var bandG = [new THREE.BoxGeometry(S * 1.03, S * 0.08, S * 1.03).translate(0, S * 0.12, 0), new THREE.BoxGeometry(S * 1.03, S * 0.08, S * 1.03).translate(0, -S * 0.2, 0)];
    var band = new THREE.InstancedMesh(root.THREE_mergeGeometries ? root.THREE_mergeGeometries(bandG) : bandG[0], neonMat, n);
    var band2 = new THREE.InstancedMesh(bandG[1], neonMat, n);
    var glyph = new THREE.InstancedMesh(new THREE.PlaneGeometry(S * 0.62, S * 0.62).translate(0, S * 0.02, S * 0.512), glyphMat, n);
    var parts = [body, lid, band, band2, glyph];
    parts.forEach(function (m) { m.frustumCulled = false; m.name = 'prizebox'; grp.add(m); });
    var vis = [], base = [], ph = [], i;
    for (i = 0; i < n; i++) { vis.push(true); base.push(C[i]); ph.push(i * 0.9); }
    var d = new THREE.Object3D(), t = 0, pops = [];
    var ring = new THREE.Mesh(new THREE.RingGeometry(S * 0.9, S * 1.05, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8ff3c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.visible = false; grp.add(ring);
    function paint() {
      for (i = 0; i < n; i++) {
        var c = base[i], s = vis[i] ? 1 : 0.0001, y = c.y + hover + Math.sin(t * 2 + ph[i]) * 0.35 * U;
        d.position.set(c.x, y, c.z); d.rotation.set(0, t * 1.1 + ph[i], 0); d.scale.setScalar(s); d.updateMatrix();
        parts.forEach(function (m) { m.setMatrixAt(i, d.matrix); });
      }
      parts.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
    }
    paint();
    var api = {
      group: grp,
      setVisible: function (k, v) { if (k >= 0 && k < n) vis[k] = !!v; },
      pop: function (k) { if (base[k]) pops.push({ k: k, t: 0 }); },
      update: function (dt) {
        t += dt; paint();
        if (pops.length) {
          var p = pops[0]; p.t += dt; var c = base[p.k];
          ring.visible = true; ring.position.set(c.x, c.y + hover, c.z); var k = Math.min(1, p.t / 0.45); ring.scale.setScalar(1 + 2.4 * k); ring.material.opacity = 0.9 * (1 - k);
          if (p.t >= 0.45) { pops.shift(); ring.visible = pops.length > 0; }
        }
      },
      dispose: function () { if (grp.parent) grp.parent.remove(grp); grp.traverse(function (c) { if (c.geometry) c.geometry.dispose(); }); }
    };
    if (o.scene) o.scene.add(grp);
    return api;
  }
  var out = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
  if (root) root.WorldRacePrizeBox = out;
})(typeof window !== 'undefined' ? window : globalThis);
