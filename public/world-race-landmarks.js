/* world-race-landmarks.js — permanent scenery for the Dragon Gate Circuit (owner refs 2026-10-01): a gold TORII start gate with a SHADDAI plaque and hanging lanterns,
 * lantern posts along the first straight, and a row of orange cones at the start line. All code-drawn, ~20 draw calls (cones are one InstancedMesh), no lights.
 * buildRaceLandmarks({ THREE, scene, heightAt, WorldRace, U? }) -> { group, dispose(), pos:{x,z,yaw} }
 */
(function (root) {
  'use strict';
  function plaque(THREE) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; var g = cv.getContext('2d');
    g.fillStyle = '#10151c'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#e8c45c'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#e8c45c'; g.font = '900 64px Orbitron, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHADDAI', 256, 68);
    var t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function torii(THREE, U) {
    var g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0xb8860b, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.5 }),
      dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.7, metalness: 0.2 }), glow = new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false });
    var W = 13 * U, H = 15 * U, pw = 1.3 * U;
    [-1, 1].forEach(function (s) {
      var pil = new THREE.Mesh(new THREE.CylinderGeometry(pw * 0.5, pw * 0.58, H, 10), gold); pil.position.set(s * W / 2, H / 2, 0); g.add(pil);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(pw * 0.75, pw * 0.8, 0.9 * U, 10), dark); base.position.set(s * W / 2, 0.45 * U, 0); g.add(base);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(pw * 0.7, pw * 0.5, 0.8 * U, 10), dark); cap.position.set(s * W / 2, H - 0.4 * U, 0); g.add(cap);
    });
    var nuki = new THREE.Mesh(new THREE.BoxGeometry(W + pw * 1.6, 0.9 * U, 0.9 * U), gold); nuki.position.set(0, H * 0.78, 0); g.add(nuki);
    var shimaki = new THREE.Mesh(new THREE.BoxGeometry(W + 4.2 * U, 1.1 * U, 1.5 * U), dark); shimaki.position.set(0, H + 0.4 * U, 0); g.add(shimaki);
    var kasagi = new THREE.Mesh(new THREE.BoxGeometry(W + 7 * U, 0.8 * U, 2.4 * U), gold); kasagi.position.set(0, H + 1.3 * U, 0); g.add(kasagi);
    [-1, 1].forEach(function (s) { var tip = new THREE.Mesh(new THREE.BoxGeometry(2.6 * U, 0.7 * U, 2.4 * U), gold); tip.position.set(s * (W / 2 + 3.6 * U), H + 1.75 * U, 0); tip.rotation.z = s * 0.38; g.add(tip); });
    var pl = new THREE.Mesh(new THREE.PlaneGeometry(4.6 * U, 1.15 * U), new THREE.MeshBasicMaterial({ map: plaque(THREE), fog: false })); pl.position.set(0, H * 0.78 + 1.4 * U, 0.5 * U); g.add(pl);
    var pl2 = pl.clone(); pl2.position.z = -0.5 * U; pl2.rotation.y = Math.PI; g.add(pl2);
    [-0.3, 0.3].forEach(function (f) { var lan = new THREE.Mesh(new THREE.BoxGeometry(0.9 * U, 1.3 * U, 0.9 * U), glow); lan.position.set(f * W, H * 0.78 - 1.2 * U, 0); g.add(lan); });
    return g;
  }
  function lanternPost(THREE, U) {
    var g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.7 }), glow = new THREE.MeshBasicMaterial({ color: 0xffc766, fog: false });
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * U, 0.2 * U, 3.4 * U, 6), dark); post.position.y = 1.7 * U; g.add(post);
    var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7 * U, 0.9 * U, 0.7 * U), glow); lamp.position.y = 3.7 * U; g.add(lamp);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(0.62 * U, 0.45 * U, 4), dark); roof.position.y = 4.35 * U; roof.rotation.y = Math.PI / 4; g.add(roof);
    return g;
  }
  /* START / FINISH (owner 2026-10-02: "race track: size, how it looks, start and finish"): a checkered line across the ribbon, an 8-slot starting grid behind it (2 columns x 4 rows, nose to the line),
   * and - for circuits without a torii - a banner arch with START / FINISH on both faces. Local +z = the direction of travel; the line sits at z = 0. Track half-width = 4 U-metres. */
  function checkerTex(THREE) {
    if (typeof document === 'undefined') return null; var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; var g = cv.getContext('2d');
    for (var y = 0; y < 4; y++) for (var x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#101418' : '#f2f4f8'; g.fillRect(x * 16, y * 16, 16, 16); }
    var t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function bannerTex(THREE) {
    if (typeof document === 'undefined') return null; var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; var g = cv.getContext('2d');
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, 512, 128); for (var i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#e8c45c' : '#27e0ff'; g.fillRect(i * 32, 0, 32, 10); g.fillRect(i * 32, 118, 32, 10); }
    g.fillStyle = '#f2f4f8'; g.font = '900 54px Orbitron, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('START / FINISH', 256, 66);
    var t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function startFinish(THREE, U, withArch) {
    var g = new THREE.Group(), W = 8 * U; g.name = 'start-finish';
    var ct = checkerTex(THREE), line = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.4 * U), new THREE.MeshBasicMaterial(ct ? { map: ct, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 } : { color: 0xf2f4f8, transparent: true, opacity: 0.9, depthWrite: false })); line.rotation.x = -Math.PI / 2; line.position.y = 0.42 * U; g.add(line);
    var slot = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.1 * U, 4.2 * U), new THREE.MeshBasicMaterial({ color: 0xf2f4f8, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 8), m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (var r = 0; r < 4; r++) for (var c = 0; c < 2; c++) { m.compose(new THREE.Vector3((c ? 1 : -1) * 2 * U, 0.4 * U, -(4 + r * 7 + (c ? 3 : 0)) * U), q, new THREE.Vector3(1, 1, 1)); slot.setMatrixAt(r * 2 + c, m); }   // staggered like a real grid
    slot.instanceMatrix.needsUpdate = true; slot.name = 'start-grid'; g.add(slot);
    if (withArch) {
      var dark = new THREE.MeshStandardMaterial({ color: 0x151b26, metalness: 0.5, roughness: 0.5 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0x7a5a10, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4 });
      [-1, 1].forEach(function (sd) { var pyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * U, 0.7 * U, 11 * U, 10), dark); pyl.position.set(sd * (W / 2 + 1.2 * U), 5.5 * U, 0); g.add(pyl); var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * U, 0.75 * U, 0.5 * U, 10), gold); cap.position.set(sd * (W / 2 + 1.2 * U), 11.2 * U, 0); g.add(cap); });
      var beam = new THREE.Mesh(new THREE.BoxGeometry(W + 4 * U, 1.1 * U, 1.0 * U), dark); beam.position.set(0, 11.4 * U, 0); g.add(beam);
      var bt = bannerTex(THREE), bg = new THREE.PlaneGeometry(W + 2 * U, 2.4 * U); [0, Math.PI].forEach(function (flip) { var b = new THREE.Mesh(bg, new THREE.MeshBasicMaterial(bt ? { map: bt, side: THREE.FrontSide, fog: false } : { color: 0x27e0ff, side: THREE.FrontSide, fog: false })); b.position.set(0, 9.9 * U, (flip ? -0.56 : 0.56) * U); b.rotation.y = flip; g.add(b); });
    }
    return g;
  }
  function buildRaceLandmarks(o) {
    var THREE = o.THREE, WR = o.WorldRace || root.WorldRace, U = o.U || 7 / 1.8, hy = o.heightAt;
    var pts = WR.trackWorld('dragon-gate', U); if (!pts || pts.length < 4) return null;
    var p0 = pts[0], p1 = pts[1], yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z), grp = new THREE.Group(); grp.name = 'dragon-gate-landmarks';
    var gate = torii(THREE, U); gate.position.set(p0.x, hy(p0.x, p0.z), p0.z); gate.rotation.y = yaw; grp.add(gate);
    var sfg = startFinish(THREE, U, false); sfg.position.set(p0.x, hy(p0.x, p0.z), p0.z); sfg.rotation.y = yaw; grp.add(sfg);
    ['quarter-loop', 'grid-ring'].forEach(function (cid) { try { var tp = WR.trackWorld(cid, U); if (!tp || tp.length < 4) return; var a = tp[0], b2 = tp[1], y2 = Math.atan2(b2.x - a.x, b2.z - a.z), sg = startFinish(THREE, U, true); sg.position.set(a.x, hy(a.x, a.z), a.z); sg.rotation.y = y2; sg.name = 'start-finish:' + cid; grp.add(sg); } catch (e) { } });
    var sx = Math.cos(yaw), sz = -Math.sin(yaw);   // unit vector across the track
    for (var k = 1; k <= 6; k++) { var pt = pts[Math.min(pts.length - 1, k * 2)]; [-1, 1].forEach(function (s) { var lp = lanternPost(THREE, U), x = pt.x + sx * s * 8 * U, z = pt.z + sz * s * 8 * U; lp.position.set(x, hy(x, z), z); grp.add(lp); }); }
    var cone = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4 * U, 1.1 * U, 7), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5500, emissiveIntensity: 0.25, roughness: 0.6 }), 14), m = new THREE.Matrix4();
    for (var c = 0; c < 14; c++) { var f = (c - 6.5) / 6.5, x2 = p0.x + sx * f * 7.5 * U + Math.sin(yaw) * 4 * U, z2 = p0.z + sz * f * 7.5 * U + Math.cos(yaw) * 4 * U; m.makeTranslation(x2, hy(x2, z2) + 0.55 * U, z2); cone.setMatrixAt(c, m); }
    cone.instanceMatrix.needsUpdate = true; grp.add(cone);
    var rib = WR.ribbon(THREE, pts.map(function (p) { return { x: p.x, y: hy(p.x, p.z) + 0.3 * U, z: p.z }; }), 8 * U, true); if (rib.material) rib.material.opacity = 0.34; grp.add(rib);
    /* EDGE LINES: two bright strips along the kerbs so the course reads at night and from far away (track half-width 4 m) */
    [-1, 1].forEach(function (side) { var ep = pts.map(function (p, i) { var q = pts[(i + 1) % pts.length], o2 = pts[(i + pts.length - 1) % pts.length], dx = q.x - o2.x, dz = q.z - o2.z, L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L, x = p.x + nx * side * 4 * U, z = p.z + nz * side * 4 * U; return { x: x, y: hy(x, z) + 0.34 * U, z: z }; });
      var e = WR.ribbon(THREE, ep, 0.55 * U, true); if (e.material) { e.material.opacity = 0.9; e.material.blending = THREE.AdditiveBlending; } e.name = 'track-edge'; grp.add(e); });
    o.scene.add(grp);
    return { group: grp, pos: { x: p0.x, z: p0.z, yaw: yaw }, dispose: function () { o.scene.remove(grp); } };
  }
  root.buildRaceLandmarks = buildRaceLandmarks; root.startFinishMesh = startFinish;
})(typeof window !== 'undefined' ? window : globalThis);
