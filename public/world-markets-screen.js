/* world-markets-screen.js — ZEROX MARKET SENTINEL STATUE.
 * (Formerly a big live candlestick chart panel — replaced by a bronze statue now that the real
 *  market terminal lives inside the ZEROX temple as TuFish. This is a monument, not a screen.)
 * Classic script: window.buildWorldMarketsScreen(THREE, scene, layout) -> { mesh, update(t), dispose() }
 */
window.buildWorldMarketsScreen = function (THREE, scene, layout) {
  const sec = (layout && layout.sector) ? layout.sector('ZEROX') : { pos: [260, 0], color: 0xff7a18 };
  const bx = sec.pos[0], bz = sec.pos[1];
  const accent = new THREE.Color(sec.color || 0xff7a18);

  // Stand the statue in the plaza IN FRONT of the ZEROX building (offset toward world-center) so
  // it reads as a monument, not something blended into the building wall.
  const d = Math.hypot(bx, bz) || 1;
  const sx = bx - (bx / d) * 66, sz = bz - (bz / d) * 66;
  const gy = (typeof window !== 'undefined' && window.WORLD_HEIGHT_AT) ? window.WORLD_HEIGHT_AT(sx, sz) : 0;

  const group = new THREE.Group();
  group.position.set(sx, gy, sz);
  group.lookAt(0, gy, 0);   // face the plaza / world center

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ── PEDESTAL (stone) ──
  const stone = track(new THREE.MeshStandardMaterial({ color: 0x2b2f39, roughness: 0.92, metalness: 0.08 }));
  const stoneLite = track(new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.9, metalness: 0.08 }));
  const base = new THREE.Mesh(track(new THREE.CylinderGeometry(6.2, 7.2, 2.2, 8)), stone); base.position.y = 1.1; group.add(base);
  const mid  = new THREE.Mesh(track(new THREE.CylinderGeometry(4.6, 5.4, 5.0, 8)), stoneLite); mid.position.y = 2.2 + 2.5; group.add(mid);
  const cap  = new THREE.Mesh(track(new THREE.CylinderGeometry(5.2, 4.6, 1.0, 8)), stone); cap.position.y = 2.2 + 5.0 + 0.5; group.add(cap);
  const PLINTH_TOP = 2.2 + 5.0 + 1.0; // 8.2

  // accent inlay ring around the cap
  const inlay = new THREE.Mesh(
    track(new THREE.TorusGeometry(5.0, 0.12, 8, 40)),
    track(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
  );
  inlay.rotation.x = -Math.PI / 2; inlay.position.y = PLINTH_TOP - 0.2; group.add(inlay);

  // engraved plaque on the pedestal front
  (function plaque() {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#12141c'; c.fillRect(0, 0, 512, 128);
    c.strokeStyle = '#ff7a18'; c.lineWidth = 4; c.strokeRect(6, 6, 500, 116);
    c.fillStyle = '#ffcf4a'; c.font = 'bold 40px Orbitron, serif'; c.textAlign = 'center';
    c.fillText('ZEROX', 256, 56);
    c.fillStyle = '#cfe9ff'; c.font = '22px "Share Tech Mono", monospace';
    c.fillText('THE MARKETS', 256, 92);
    const tex = track(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace;
    const pl = new THREE.Mesh(track(new THREE.PlaneGeometry(6.4, 1.6)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
    pl.position.set(0, 4.4, 5.45); group.add(pl);
  })();

  // ── BRONZE STATUE — a heroic operative raising a market orb ──
  const bronze = track(new THREE.MeshStandardMaterial({
    color: 0x7a4a1e, metalness: 0.95, roughness: 0.42,
    emissive: accent.clone().multiplyScalar(0.10),
  }));
  const fig = new THREE.Group(); fig.position.y = PLINTH_TOP; group.add(fig);

  const cap6 = (r, h) => track(new THREE.CapsuleGeometry(r, h, 5, 10));
  // legs
  const legL = new THREE.Mesh(cap6(0.7, 3.4), bronze); legL.position.set(-0.95, 2.0, 0.1); fig.add(legL);
  const legR = new THREE.Mesh(cap6(0.7, 3.4), bronze); legR.position.set(0.95, 1.9, -0.3); legR.rotation.x = -0.18; fig.add(legR);
  // torso
  const torso = new THREE.Mesh(cap6(1.35, 3.0), bronze); torso.position.set(0, 5.5, 0); fig.add(torso);
  // chest emblem (accent)
  const emblem = new THREE.Mesh(track(new THREE.CircleGeometry(0.7, 6)), track(new THREE.MeshBasicMaterial({ color: accent, toneMapped: false })));
  emblem.position.set(0, 6.0, 1.28); fig.add(emblem);
  // head
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.95, 16, 16)), bronze); head.position.set(0, 7.9, 0.1); fig.add(head);
  // left arm at side
  const armL = new THREE.Mesh(cap6(0.42, 2.6), bronze); armL.position.set(-1.7, 5.4, 0.1); armL.rotation.z = 0.32; fig.add(armL);
  // right arm RAISED holding the market orb
  const armR = new THREE.Mesh(cap6(0.42, 2.8), bronze); armR.position.set(1.55, 6.6, 0.1); armR.rotation.z = -0.95; fig.add(armR);
  // cape (behind, tapered)
  const cape = new THREE.Mesh(track(new THREE.ConeGeometry(2.2, 6.4, 10, 1, true)), track(new THREE.MeshStandardMaterial({
    color: 0x5a3414, metalness: 0.9, roughness: 0.5, side: THREE.DoubleSide, emissive: accent.clone().multiplyScalar(0.06),
  })));
  cape.position.set(0, 5.0, -0.9); cape.rotation.x = 0.14; fig.add(cape);

  // the glowing MARKET ORB the statue raises
  const orbMat = track(new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
  const orb = new THREE.Mesh(track(new THREE.IcosahedronGeometry(1.1, 1)), orbMat);
  orb.position.set(2.5, 8.8, 0.2); fig.add(orb);
  const orbGlow = new THREE.Mesh(track(new THREE.SphereGeometry(1.7, 16, 16)), track(new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })));
  orbGlow.position.copy(orb.position); fig.add(orbGlow);
  const orbLight = new THREE.PointLight(accent, 1.2, 60, 2); orbLight.position.copy(orb.position).add(new THREE.Vector3(0, 0, 0)); fig.add(orbLight);

  fig.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  scene.add(group);

  return {
    mesh: group,
    update: function (t) {
      // orb hovers + pulses gently (allocation-free)
      const b = 0.15 * Math.sin(t * 1.4);
      orb.position.y = 8.8 + b; orbGlow.position.y = orb.position.y; orbLight.position.y = orb.position.y;
      orb.rotation.y = t * 0.6; orb.rotation.x = t * 0.25;
      orbGlow.scale.setScalar(1 + 0.08 * Math.sin(t * 2.1));
      orbLight.intensity = 1.0 + 0.35 * Math.sin(t * 2.1);
    },
    dispose: function () { for (const o of disposables) { if (o.dispose) o.dispose(); } scene.remove(group); },
  };
};
