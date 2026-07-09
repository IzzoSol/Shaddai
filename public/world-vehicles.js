/* world-vehicles.js — proper procedural vehicles for SHADDAI World (classic script).
 *   window.buildWorldVehicles(THREE, scene, layout) -> { update(dt, t) }
 * A flying SHIP (hover vessel circling the world), a SNOW ROVER (arctic), and a JET.
 * Built from primitives, sized to read clearly (no more "mini cars"), neon-trimmed.
 */
window.buildWorldVehicles = function (THREE, scene, layout) {
  const arctic = (layout.biomes || []).find(b => b.id === 'arctic') || { center: [-230, 170] };
  const vehicles = [];

  function neon(col) { return new THREE.MeshStandardMaterial({ color: 0x10141c, emissive: col, emissiveIntensity: 0.7, metalness: 0.8, roughness: 0.3 }); }
  function hull(col) { return new THREE.MeshStandardMaterial({ color: 0x1a2230, emissive: col, emissiveIntensity: 0.22, metalness: 0.85, roughness: 0.35 }); }

  // ───────────────────────── FLYING SHIP (big hover vessel) ─────────────────────────
  (function ship() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 9, 6, 16), hull(0x27e0ff)); body.rotation.z = Math.PI / 2; g.add(body);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 3.4), neon(0x27e0ff)); deck.position.y = 1.8; g.add(deck);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2), hull(0xffcf4a)); bridge.position.set(2.4, 2.4, 0); g.add(bridge);
    for (const s of [-1, 1]) { const en = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.2, 16), neon(0x27e0ff)); en.position.set(-3, -1.4, s * 1.8); g.add(en); }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -2; g.add(glow);
    g.scale.setScalar(1.6);
    scene.add(g);
    vehicles.push({ g, kind: 'ship', r: 130, alt: 30, speed: 0.06, ph: 0 });
  })();

  // ───────────────────────── SNOW ROVER (arctic) ─────────────────────────
  (function rover() {
    const g = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 7), hull(0xaaddff)); chassis.position.y = 1.8; g.add(chassis);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 3), neon(0xaaddff)); cab.position.set(0, 3.0, 0.6); g.add(cab);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.3), neon(0xffffff)); bar.position.set(0, 3.9, -1); g.add(bar);
    const wheels = [];
    const wmat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, emissive: 0x183040, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.6 });
    for (const zx of [-2.4, 0, 2.4]) for (const sx of [-2.5, 2.5]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 16), wmat); w.rotation.z = Math.PI / 2; w.position.set(sx, 1.0, zx); g.add(w); wheels.push(w);
    }
    g.scale.setScalar(1.1);
    scene.add(g);
    vehicles.push({ g, kind: 'rover', wheels, cx: arctic.center[0], cz: arctic.center[1], r: 55, speed: 0.18, ph: 0 });
  })();

  // ───────────────────────── JET (flying craft) ─────────────────────────
  (function jet() {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 7, 12), hull(0xff7a18)); fus.rotation.x = Math.PI / 2; g.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 12), neon(0xffcf4a)); nose.rotation.x = -Math.PI / 2; nose.position.z = 4.2; g.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 2.4), neon(0xff7a18)); wing.position.z = -0.4; g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 1.4), neon(0xff7a18)); tail.position.z = -3; g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 1.6), neon(0xffcf4a)); fin.position.set(0, 0.9, -3); g.add(fin);
    for (const s of [-1, 1]) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.6, 12), neon(0x27e0ff)); eng.rotation.x = Math.PI / 2; eng.position.set(s * 2.2, -0.1, -2.4); g.add(eng); }
    g.scale.setScalar(1.5);
    scene.add(g);
    vehicles.push({ g, kind: 'jet', r: 185, alt: 62, speed: 0.12, ph: Math.PI });
  })();

  return {
    update(dt, t) {
      for (const v of vehicles) {
        if (v.kind === 'ship') {
          const a = t * v.speed + v.ph;
          v.g.position.set(Math.cos(a) * v.r, v.alt + Math.sin(t * 0.6) * 1.5, Math.sin(a) * v.r);
          v.g.rotation.y = -a + Math.PI / 2;
          v.g.rotation.z = Math.sin(t * 0.5) * 0.04;
        } else if (v.kind === 'rover') {
          const a = t * v.speed + v.ph;
          v.g.position.set(v.cx + Math.cos(a) * v.r, 0, v.cz + Math.sin(a) * v.r);
          v.g.rotation.y = -a + Math.PI / 2;
          for (const w of v.wheels) w.rotation.x += dt * 6;
        } else if (v.kind === 'jet') {
          const a = t * v.speed + v.ph;
          v.g.position.set(Math.cos(a) * v.r, v.alt + Math.sin(t * 0.8) * 4, Math.sin(a) * v.r);
          v.g.rotation.y = -a;
          // gentler, subtly-animated bank into the turn (was a fixed steep 0.5 rad that read as permanently tilted)
          v.g.rotation.z = 0.3 + Math.sin(t * 0.7) * 0.06;
        }
      }
    }
  };
};
