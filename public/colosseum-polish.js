/**
 * SHADDAI Colosseum — POLISH VERSION
 * Reference Images:
 * #1: Naval spectacle with 6-ship squadron
 * #2: Grand cathedral lobby with glowing orb
 * #3: Modern stadium with golden seating (retractable roof)
 *
 * Combines all visual references into polished, epic stadium
 */

function buildColosseumPolished(THREE, opts) {
  const scene = opts.scene;
  const group = new THREE.Group();
  group.name = 'COLOSSEUM_POLISHED';
  scene.add(group);

  // ─── SCALE & DIMENSIONS (REFERENCE #3: MODERN STADIUM) ───
  const FIELD_W = 120;  // Expanded for spectacle
  const FIELD_L = 80;   // Expanded for spectacle
  const OUTER_R = 130;  // Larger stadium
  const ROOF_H = 50;    // Taller (reference #3)
  const LOBBY_H = 40;   // Cathedral height

  // ─── MATERIALS (POLISH: GOLD + MARBLE + STONE) ───
  const mats = {
    goldSeats: new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x884400,
      emissiveIntensity: 0.2
    }),
    marble: new THREE.MeshStandardMaterial({
      color: 0xf5f5dc,
      roughness: 0.3,
      metalness: 0.1
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0xc9a961,
      roughness: 0.8
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.5,
      metalness: 0.8
    }),
    water: new THREE.MeshStandardMaterial({
      color: 0x1a7fb0,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7,
      metalness: 0.1
    }),
    goldOrb: new THREE.MeshStandardMaterial({
      color: 0xffed4e,
      emissive: 0xffed4e,
      emissiveIntensity: 1.0,
      metalness: 0.6,
      roughness: 0.1
    })
  };

  // ─── ARENA FLOORS (REFERENCE #1: WATER SPECTACLE) ───
  // Sand
  const sandFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_W, FIELD_L),
    new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.95 })
  );
  sandFloor.rotation.x = -Math.PI / 2;
  sandFloor.position.y = 0.01;
  sandFloor.receiveShadow = true;
  group.add(sandFloor);

  // Water (detailed)
  const waterFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_W, FIELD_L, 64, 64),
    mats.water
  );
  waterFloor.rotation.x = -Math.PI / 2;
  waterFloor.position.y = 1;
  waterFloor.receiveShadow = true;
  waterFloor.visible = false;
  group.add(waterFloor);

  // ─── NAVAL SQUADRON (REFERENCE #1: 6 GRAND SHIPS) ───
  const shipsGroup = new THREE.Group();
  shipsGroup.name = 'SHIPS';
  group.add(shipsGroup);
  shipsGroup.visible = false;

  function createGrandShip(x, z) {
    const ship = new THREE.Group();

    // Hull
    const hullGeo = new THREE.BoxGeometry(14, 4, 30);
    const hull = new THREE.Mesh(hullGeo, mats.wood);
    hull.castShadow = true;
    ship.add(hull);

    // Bow figurehead (gold)
    const figureheadGeo = new THREE.SphereGeometry(2, 16, 16);
    const figurehead = new THREE.Mesh(figureheadGeo, mats.goldOrb);
    figurehead.position.z = -16;
    figurehead.castShadow = true;
    ship.add(figurehead);

    // Mast (tall)
    const mastGeo = new THREE.CylinderGeometry(0.6, 0.6, 25);
    const mast = new THREE.Mesh(mastGeo, mats.steel);
    mast.position.y = 15;
    mast.castShadow = true;
    ship.add(mast);

    // Main sail
    const sailGeo = new THREE.PlaneGeometry(12, 16);
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({
      color: 0xf5deb3,
      roughness: 0.6
    }));
    sail.position.set(4, 10, 0);
    sail.castShadow = true;
    ship.add(sail);

    // Fore sail
    const foreSail = sail.clone();
    foreSail.position.set(-2, 8, -4);
    foreSail.scale.set(0.7, 0.8, 1);
    ship.add(foreSail);

    // Rigging
    const ropeGeo = new THREE.TubeGeometry(
      new THREE.LineCurve3(new THREE.Vector3(0, 25, 0), new THREE.Vector3(8, 0, 0)),
      8, 0.2, 8
    );
    const rope = new THREE.Mesh(ropeGeo, new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.9
    }));
    ship.add(rope);

    ship.position.set(x, 1.5, z);
    ship.userData.baseY = 1.5;
    ship.userData.wavePhase = Math.random() * Math.PI * 2;
    return ship;
  }

  // Squadron positions (reference #1 aesthetic)
  const shipPositions = [
    { x: -50, z: -35 },
    { x: 50, z: 35 },
    { x: -60, z: 0 },
    { x: 60, z: 0 },
    { x: 0, z: -50 },
    { x: 0, z: 50 }
  ];

  shipPositions.forEach(pos => {
    shipsGroup.add(createGrandShip(pos.x, pos.z));
  });

  // ─── GOLDEN BLEACHERS (REFERENCE #3: MODERN STADIUM) ───
  // Lower bleachers (golden, modern)
  for (let i = 0; i < 25; i++) {
    const r1 = 60 + i * 2;
    const r2 = 60 + (i + 1) * 2;
    const rowGeo = new THREE.LatheGeometry([
      new THREE.Vector2(r1, 0),
      new THREE.Vector2(r2, 0),
      new THREE.Vector2(r2, 0.8),
      new THREE.Vector2(r1, 0.8)
    ], 64);
    const row = new THREE.Mesh(rowGeo, mats.goldSeats);
    row.position.y = 2 + i * 0.8;
    row.castShadow = true;
    row.receiveShadow = true;
    group.add(row);
  }

  // Upper bleachers
  for (let i = 0; i < 20; i++) {
    const r1 = 135 + i * 2.2;
    const r2 = 135 + (i + 1) * 2.2;
    const rowGeo = new THREE.LatheGeometry([
      new THREE.Vector2(r1, 0),
      new THREE.Vector2(r2, 0),
      new THREE.Vector2(r2, 0.7),
      new THREE.Vector2(r1, 0.7)
    ], 64);
    const row = new THREE.Mesh(rowGeo, mats.goldSeats);
    row.position.y = 22 + i * 0.7;
    row.castShadow = true;
    row.receiveShadow = true;
    group.add(row);
  }

  // ─── GRAND CATHEDRAL LOBBY (REFERENCE #2: GLOWING ORB) ───
  const lobbyZ = 250;
  const lobbyW = 150;
  const lobbyD = 70;

  // Floor
  const lobbyFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(lobbyW, lobbyD),
    mats.marble
  );
  lobbyFloor.rotation.x = -Math.PI / 2;
  lobbyFloor.position.set(0, 22, lobbyZ);
  lobbyFloor.receiveShadow = true;
  group.add(lobbyFloor);

  // Soaring arches
  const archGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(lobbyW / 2, 0),
    new THREE.Vector2(lobbyW / 2, LOBBY_H * 1.3),
    new THREE.Vector2(0, LOBBY_H * 1.3)
  ], 32);
  const arch = new THREE.Mesh(archGeo, mats.stone);
  arch.position.set(0, 22 + LOBBY_H * 1.1, lobbyZ);
  arch.castShadow = true;
  group.add(arch);

  // Back wall (cathedral backdrop)
  const backWallGeo = new THREE.BoxGeometry(lobbyW + 20, LOBBY_H * 1.4, 3);
  const backWall = new THREE.Mesh(backWallGeo, mats.stone);
  backWall.position.set(0, 22 + LOBBY_H * 0.7, lobbyZ + lobbyD / 2 + 5);
  backWall.castShadow = true;
  group.add(backWall);

  // Central glowing platform
  const platformGeo = new THREE.CylinderGeometry(20, 20, 2.5, 32);
  const platform = new THREE.Mesh(platformGeo, mats.goldOrb);
  platform.position.set(0, 23.5, lobbyZ);
  platform.castShadow = true;
  group.add(platform);

  // Massive glowing orb (reference #2: the altar)
  const orbGeo = new THREE.SphereGeometry(4, 32, 32);
  const orb = new THREE.Mesh(orbGeo, mats.goldOrb);
  orb.position.set(0, 30, lobbyZ);
  orb.castShadow = true;
  group.add(orb);

  // Orb light (intense glow)
  const orbLight = new THREE.PointLight(0xffed4e, 4, 150);
  orbLight.position.set(0, 30, lobbyZ);
  orbLight.castShadow = true;
  group.add(orbLight);

  // Giant pillars (cathedral columns)
  const colGeo = new THREE.CylinderGeometry(4, 4.5, LOBBY_H * 1.2, 12);
  const colPositions = [
    [-5, -2], [-5, 2], [0, -2], [0, 2], [5, -2], [5, 2], [-2.5, 0], [2.5, 0]
  ];
  colPositions.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(colGeo, mats.marble);
    col.position.set(cx * 15, 22 + LOBBY_H * 0.6, lobbyZ + cz * 25);
    col.castShadow = true;
    group.add(col);
  });

  // ─── RETRACTABLE ROOF (REFERENCE #3) ───
  const roofR = 180;
  const roofGeo = new THREE.LatheGeometry([
    new THREE.Vector2(roofR, 0),
    new THREE.Vector2(roofR + 10, 0),
    new THREE.Vector2(roofR + 10, ROOF_H),
    new THREE.Vector2(roofR, ROOF_H)
  ], 64);
  const roof = new THREE.Mesh(roofGeo, mats.steel);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Support pillars (32)
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const x = Math.cos(angle) * roofR;
    const z = Math.sin(angle) * roofR;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 35, 12),
      mats.steel
    );
    pillar.position.set(x, 18, z);
    pillar.castShadow = true;
    group.add(pillar);
  }

  // ─── SPECTACULAR LIGHTING (REFERENCE #3: STADIUM LIGHTS) ───
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  group.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(150, 150, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 4096;
  sun.shadow.mapSize.height = 4096;
  sun.shadow.camera.far = 1000;
  group.add(sun);

  // Stadium spotlights (24 for epic effect)
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const light = new THREE.SpotLight(0xffd700, 2.5);
    light.position.set(Math.cos(angle) * roofR, ROOF_H - 2, Math.sin(angle) * roofR);
    light.target.position.set(0, 25, 0);
    light.castShadow = true;
    light.angle = Math.PI / 8;
    group.add(light);
  }

  // ─── SIMPLE API ───
  let currentMode = 'sand';
  return {
    group,
    setMode: (mode) => {
      sandFloor.visible = (mode === 'sand');
      waterFloor.visible = (mode !== 'sand');
      shipsGroup.visible = (mode === 'naval' || mode === 'water');
      currentMode = mode;
    },
    getMode: () => currentMode,
    update: (deltaTime) => {
      shipsGroup.children.forEach((ship, i) => {
        if (ship.userData.wavePhase !== undefined) {
          ship.userData.wavePhase += deltaTime * 1.5;
          ship.position.y = ship.userData.baseY + Math.sin(ship.userData.wavePhase) * 0.7;
          ship.rotation.z = Math.sin(ship.userData.wavePhase * 0.5) * 0.12;
        }
      });
    }
  };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = buildColosseumPolished;
}
if (typeof window !== 'undefined') {
  window.buildColosseumPolished = buildColosseumPolished;
}
