/*
 * SHADDAI Colosseum — Improved Build
 * Real-size stadium with lobby, bleachers, walkways, and full player navigation
 *
 * Dimensions: 200m × 160m outer shell
 * - Central field: 100m × 64m (FIFA standard)
 * - Lower bleachers: 20 rows × 15m rise
 * - Upper bleachers: 20 rows × 12m rise
 * - Grand lobby: 80m × 40m × 30m high
 * - Walkways: 4m wide, circling all levels
 */

function buildColosseumImproved(THREE, opts) {
  const scene = opts.scene;
  const group = new THREE.Group();
  group.name = 'COLOSSEUM_IMPROVED';
  scene.add(group);

  // ─── SCALE & DIMENSIONS ───
  const SCALE = 1; // 1 unit = 1 meter
  const OUTER_R = 100; // 100m radius outer shell
  const FIELD_W = 100; // 100m wide field
  const FIELD_L = 64;  // 64m long field (FIFA)
  const FIELD_R_X = FIELD_W / 2; // semi-major axis
  const FIELD_R_Z = FIELD_L / 2; // semi-minor axis

  // Heights
  const GROUND_Y = 0;
  const PODIUM_H = 2;      // 2m high podium around field
  const LOW_BLEACH_H = 15; // 15m rise for lower bleachers
  const PROM_H = 18;       // 18m promenade
  const UP_BLEACH_H = 12;  // 12m rise for upper bleachers
  const ROOF_H = 35;       // 35m total roof height
  const LOBBY_H = 30;      // 30m high lobby

  // Materials
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.05 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.8, metalness: 0.1 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8, metalness: 0 }),
    turf: new THREE.MeshStandardMaterial({ color: 0x2d5a2d, roughness: 0.95, metalness: 0 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3, metalness: 0.2 })
  };

  // ─── ARENA FLOOR (DYNAMIC - MULTIPLE MODES) ───
  const arenaGroup = new THREE.Group();
  arenaGroup.name = 'ARENA_MODES';
  group.add(arenaGroup);

  // Sand arena
  const sandGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_L, 32, 32);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.95, metalness: 0 });
  const sandArena = new THREE.Mesh(sandGeo, sandMat);
  sandArena.name = 'SAND_ARENA';
  sandArena.rotation.x = -Math.PI / 2;
  sandArena.position.y = GROUND_Y + 0.01;
  sandArena.receiveShadow = true;
  arenaGroup.add(sandArena);

  // Water arena (initially hidden)
  const waterGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_L, 64, 64);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e90ff,
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85
  });
  const waterArena = new THREE.Mesh(waterGeo, waterMat);
  waterArena.name = 'WATER_ARENA';
  waterArena.rotation.x = -Math.PI / 2;
  waterArena.position.y = GROUND_Y + 0.5;
  waterArena.receiveShadow = true;
  waterArena.visible = false;
  arenaGroup.add(waterArena);

  // Mixed terrain arena (sand + water patches)
  const terrainGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_L, 32, 32);
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9, metalness: 0 });
  const terrainArena = new THREE.Mesh(terrainGeo, terrainMat);
  terrainArena.name = 'TERRAIN_ARENA';
  terrainArena.rotation.x = -Math.PI / 2;
  terrainArena.position.y = GROUND_Y + 0.01;
  terrainArena.receiveShadow = true;
  terrainArena.visible = false;
  arenaGroup.add(terrainArena);

  // Sand markings (gladiator arena)
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 1024;
  sandCanvas.height = 768;
  const sandCtx = sandCanvas.getContext('2d');
  sandCtx.fillStyle = '#d2b48c';
  sandCtx.fillRect(0, 0, 1024, 768);
  sandCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  sandCtx.lineWidth = 2;
  // Sand arena circle
  sandCtx.beginPath();
  sandCtx.arc(512, 384, 150, 0, Math.PI * 2);
  sandCtx.stroke();
  const sandTex = new THREE.CanvasTexture(sandCanvas);
  sandMat.map = sandTex;

  // ─── BOATS FOR WATER BATTLES ───
  const boatsGroup = new THREE.Group();
  boatsGroup.name = 'BOATS';
  arenaGroup.add(boatsGroup);

  function createBoat(x, z, scale = 1) {
    const boat = new THREE.Group();

    // Hull
    const hullGeo = new THREE.BoxGeometry(8 * scale, 2 * scale, 15 * scale);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, metalness: 0.1 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    boat.add(hull);

    // Sail mast
    const mastGeo = new THREE.CylinderGeometry(0.3 * scale, 0.3 * scale, 12 * scale);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6, metalness: 0.5 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = 8 * scale;
    mast.castShadow = true;
    boat.add(mast);

    // Sail
    const sailGeo = new THREE.PlaneGeometry(6 * scale, 8 * scale);
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf5deb3, roughness: 0.7, metalness: 0 });
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(2 * scale, 6 * scale, 0);
    sail.castShadow = true;
    boat.add(sail);

    boat.position.set(x, GROUND_Y + 1.5, z);
    boat.castShadow = true;
    return boat;
  }

  // Add boats (hidden until water mode)
  const boat1 = createBoat(-30, -20, 1.2);
  const boat2 = createBoat(30, 20, 1.2);
  boatsGroup.add(boat1);
  boatsGroup.add(boat2);
  boatsGroup.visible = false;

  // ─── TERRAIN ROCKS (MIXED MODE) ───
  const rocksGroup = new THREE.Group();
  rocksGroup.name = 'TERRAIN_ROCKS';
  arenaGroup.add(rocksGroup);

  for (let i = 0; i < 8; i++) {
    const rockGeo = new THREE.IcosahedronGeometry(Math.random() * 3 + 2, 2);
    const rockMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0, 0, 0.4 + Math.random() * 0.2),
      roughness: 0.9,
      metalness: 0.05
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);

    const angle = (i / 8) * Math.PI * 2;
    rock.position.set(
      Math.cos(angle) * 35,
      GROUND_Y + 2,
      Math.sin(angle) * 35
    );
    rock.castShadow = true;
    rocksGroup.add(rock);
  }
  rocksGroup.visible = false;

  // ─── PODIUM (around field) ───
  const podiumGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(FIELD_R_X, 0), new THREE.Vector2(FIELD_R_X + 3, 0), new THREE.Vector2(FIELD_R_X + 3, PODIUM_H), new THREE.Vector2(FIELD_R_X, PODIUM_H)],
    64
  );
  const podium = new THREE.Mesh(podiumGeo, mats.concrete);
  podium.position.y = GROUND_Y;
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  // ─── LOWER BLEACHERS (20 rows, 15m rise) ───
  const rowCount = 20;
  const rowHeight = LOW_BLEACH_H / rowCount;
  const rowDepth = 2.5; // 2.5m per row

  for (let i = 0; i < rowCount; i++) {
    const startR = FIELD_R_X + 3 + i * rowDepth;
    const endR = FIELD_R_X + 3 + (i + 1) * rowDepth;
    const y = PODIUM_H + i * rowHeight;

    const rowGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(startR, 0), new THREE.Vector2(endR, 0), new THREE.Vector2(endR, rowHeight), new THREE.Vector2(startR, rowHeight)],
      64
    );
    const row = new THREE.Mesh(rowGeo, mats.seat);
    row.position.y = y;
    row.castShadow = true;
    row.receiveShadow = true;
    group.add(row);
  }

  // ─── PROMENADE (ring between bleachers) ───
  const promR_in = FIELD_R_X + 3 + rowCount * rowDepth;
  const promR_out = promR_in + 4; // 4m wide promenade
  const promGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(promR_in, 0), new THREE.Vector2(promR_out, 0), new THREE.Vector2(promR_out, 1), new THREE.Vector2(promR_in, 1)],
    64
  );
  const promenade = new THREE.Mesh(promGeo, mats.concrete);
  promenade.position.y = PROM_H;
  promenade.castShadow = true;
  promenade.receiveShadow = true;
  group.add(promenade);

  // ─── UPPER BLEACHERS (20 rows, 12m rise) ───
  const upperRowHeight = UP_BLEACH_H / rowCount;

  for (let i = 0; i < rowCount; i++) {
    const startR = promR_out + i * rowDepth;
    const endR = promR_out + (i + 1) * rowDepth;
    const y = PROM_H + i * upperRowHeight;

    const rowGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(startR, 0), new THREE.Vector2(endR, 0), new THREE.Vector2(endR, upperRowHeight), new THREE.Vector2(startR, upperRowHeight)],
      64
    );
    const row = new THREE.Mesh(rowGeo, mats.seat);
    row.position.y = y;
    row.castShadow = true;
    row.receiveShadow = true;
    group.add(row);
  }

  // ─── OUTER ROOF SHELL ───
  const roofR = promR_out + rowCount * rowDepth + 2;
  const roofGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(roofR, 0), new THREE.Vector2(roofR + 8, 0), new THREE.Vector2(roofR + 8, ROOF_H), new THREE.Vector2(roofR, ROOF_H)],
    64
  );
  const roof = new THREE.Mesh(roofGeo, mats.steel);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // ─── PILLARS (support structure) ───
  const pillarCount = 32;
  const pillarH = ROOF_H - 5;
  const pillarGeo = new THREE.CylinderGeometry(1.2, 1.2, pillarH, 12);

  for (let i = 0; i < pillarCount; i++) {
    const angle = (i / pillarCount) * Math.PI * 2;
    const x = Math.cos(angle) * roofR;
    const z = Math.sin(angle) * roofR;

    const pillar = new THREE.Mesh(pillarGeo, mats.steel);
    pillar.position.set(x, pillarH / 2 + 5, z);
    pillar.castShadow = true;
    group.add(pillar);
  }

  // ─── GRAND LOBBY (south side) ───
  const lobbyX = FIELD_R_X + 60;
  const lobbyZ = roofR + 10 + LOBBY_H / 2;
  const lobbyW = 80;
  const lobbyD = 40;

  // Lobby floor
  const lobbyFloorGeo = new THREE.PlaneGeometry(lobbyW, lobbyD);
  const lobbyFloor = new THREE.Mesh(lobbyFloorGeo, mats.marble);
  lobbyFloor.rotation.x = -Math.PI / 2;
  lobbyFloor.position.set(0, PROM_H, lobbyZ);
  lobbyFloor.receiveShadow = true;
  group.add(lobbyFloor);

  // Lobby walls
  const wallGeo = new THREE.BoxGeometry(lobbyW, LOBBY_H, 1);
  const backWall = new THREE.Mesh(wallGeo, mats.stone);
  backWall.position.set(0, LOBBY_H / 2, lobbyZ + lobbyD / 2);
  backWall.castShadow = true;
  group.add(backWall);

  const sideWallGeo = new THREE.BoxGeometry(1, LOBBY_H, lobbyD);
  [-1, 1].forEach(side => {
    const wall = new THREE.Mesh(sideWallGeo, mats.stone);
    wall.position.set(side * (lobbyW / 2), LOBBY_H / 2, lobbyZ);
    wall.castShadow = true;
    group.add(wall);
  });

  // Lobby columns
  const colGeo = new THREE.CylinderGeometry(1.5, 1.5, LOBBY_H - 4, 12);
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      if (cx === 0 && cz === 0) continue;
      const col = new THREE.Mesh(colGeo, mats.marble);
      col.position.set(cx * 15, LOBBY_H / 2, lobbyZ + (cz - 0.5) * 15);
      col.castShadow = true;
      group.add(col);
    }
  }

  // ─── WALKWAYS ───
  // Lower walkway (around field)
  const walkGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(FIELD_R_X - 2, 0), new THREE.Vector2(FIELD_R_X + 4, 0), new THREE.Vector2(FIELD_R_X + 4, 0.3), new THREE.Vector2(FIELD_R_X - 2, 0.3)],
    64
  );
  const walkLower = new THREE.Mesh(walkGeo, mats.concrete);
  walkLower.position.y = GROUND_Y + 0.1;
  walkLower.receiveShadow = true;
  group.add(walkLower);

  // Promenade walkway
  const promWalkGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(promR_in - 1, 0), new THREE.Vector2(promR_out + 1, 0), new THREE.Vector2(promR_out + 1, 0.3), new THREE.Vector2(promR_in - 1, 0.3)],
    64
  );
  const walkProm = new THREE.Mesh(promWalkGeo, mats.concrete);
  walkProm.position.y = PROM_H + 0.1;
  walkProm.receiveShadow = true;
  group.add(walkProm);

  // Upper rim walkway
  const rimR = roofR + 3;
  const rimGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(rimR - 1, 0), new THREE.Vector2(rimR + 1, 0), new THREE.Vector2(rimR + 1, 0.3), new THREE.Vector2(rimR - 1, 0.3)],
    64
  );
  const walkRim = new THREE.Mesh(rimGeo, mats.concrete);
  walkRim.position.y = ROOF_H - 1;
  walkRim.receiveShadow = true;
  group.add(walkRim);

  // ─── LIGHTING ───
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  group.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(50, 60, 50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 4096;
  sunLight.shadow.mapSize.height = 4096;
  sunLight.shadow.camera.far = 500;
  group.add(sunLight);

  // Stadium lights
  const lightCount = 16;
  for (let i = 0; i < lightCount; i++) {
    const angle = (i / lightCount) * Math.PI * 2;
    const x = Math.cos(angle) * roofR;
    const z = Math.sin(angle) * roofR;
    const light = new THREE.SpotLight(0xffd700, 1.5);
    light.position.set(x, ROOF_H - 2, z);
    light.target.position.set(0, PROM_H, 0);
    light.castShadow = true;
    group.add(light);
  }

  // ─── ARENA MODE SWITCHING ───
  let currentMode = 'sand';

  function setArenaMode(mode) {
    const arenaChildren = arenaGroup.children;
    const sandArena = arenaGroup.getObjectByName('SAND_ARENA');
    const waterArena = arenaGroup.getObjectByName('WATER_ARENA');
    const terrainArena = arenaGroup.getObjectByName('TERRAIN_ARENA');
    const boats = arenaGroup.getObjectByName('BOATS');
    const rocks = arenaGroup.getObjectByName('TERRAIN_ROCKS');

    // Hide all modes
    if (sandArena) sandArena.visible = false;
    if (waterArena) waterArena.visible = false;
    if (terrainArena) terrainArena.visible = false;
    if (boats) boats.visible = false;
    if (rocks) rocks.visible = false;

    // Show selected mode
    currentMode = mode;
    switch (mode) {
      case 'sand':
        if (sandArena) sandArena.visible = true;
        break;
      case 'water':
        if (waterArena) waterArena.visible = true;
        if (boats) boats.visible = true;
        break;
      case 'naval':
        if (waterArena) waterArena.visible = true;
        if (boats) boats.visible = true;
        // Animate boats
        boats.children.forEach((boat, i) => {
          boat.userData.wavePhase = (i * Math.PI);
        });
        break;
      case 'terrain':
        if (terrainArena) terrainArena.visible = true;
        if (rocks) rocks.visible = true;
        if (boats) boats.visible = true;
        break;
    }
  }

  // ─── ANIMATION LOOP UPDATES ───
  const updateArena = (deltaTime) => {
    if (currentMode === 'naval' || currentMode === 'water') {
      const boats = arenaGroup.getObjectByName('BOATS');
      if (boats) {
        boats.children.forEach((boat, i) => {
          if (!boat.userData.wavePhase) boat.userData.wavePhase = (i * Math.PI);
          boat.userData.wavePhase += deltaTime * 1.5;
          boat.position.y = GROUND_Y + 1.5 + Math.sin(boat.userData.wavePhase) * 0.3;
          boat.rotation.z = Math.sin(boat.userData.wavePhase * 0.5) * 0.1;
        });
      }
    }
  };

  // ─── API ───
  return {
    group: group,
    dims: {
      FIELD_W, FIELD_L,
      LOW_BLEACH_H, UP_BLEACH_H,
      ROOF_H, LOBBY_H,
      OUTER_R, roofR
    },
    getHeightAt: function(x, z) {
      const dist = Math.sqrt(x * x + z * z);
      if (dist < FIELD_R_X) return GROUND_Y; // Field
      if (dist < FIELD_R_X + 3) return PODIUM_H; // Podium
      if (dist < promR_in) return PODIUM_H + (dist - FIELD_R_X - 3) * (LOW_BLEACH_H / (rowCount * rowDepth)); // Lower bleachers
      if (dist < promR_out) return PROM_H; // Promenade
      if (dist < roofR) return PROM_H + (dist - promR_out) * (UP_BLEACH_H / (rowCount * rowDepth)); // Upper bleachers
      return ROOF_H; // Roof
    },
    canWalkAt: function(x, z) {
      const dist = Math.sqrt(x * x + z * z);
      return dist < roofR + 5; // Can walk anywhere up to roof edge
    },
    setArenaMode: setArenaMode,
    getCurrentMode: () => currentMode,
    updateArena: updateArena,
    getArenaGroup: () => arenaGroup
  };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = buildColosseumImproved;
}
if (typeof window !== 'undefined') {
  window.buildColosseumImproved = buildColosseumImproved;
}
