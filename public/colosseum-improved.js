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

  // ─── UNDERGROUND PASSAGES (dungeons) ───
  const undergroundGroup = new THREE.Group();
  undergroundGroup.name = 'UNDERGROUND';
  group.add(undergroundGroup);

  // Main dungeon chamber
  const dungeonFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 100), mats.stone);
  dungeonFloor.rotation.x = -Math.PI / 2;
  dungeonFloor.position.y = -8;
  dungeonFloor.receiveShadow = true;
  undergroundGroup.add(dungeonFloor);

  // Dungeon walls
  const dungeonWallGeo = new THREE.BoxGeometry(120, 8, 1);
  [-50, 50].forEach(z => {
    const wall = new THREE.Mesh(dungeonWallGeo, mats.concrete);
    wall.position.set(0, -4, z);
    wall.castShadow = true;
    undergroundGroup.add(wall);
  });

  const dungeonSideGeo = new THREE.BoxGeometry(1, 8, 100);
  [-60, 60].forEach(x => {
    const wall = new THREE.Mesh(dungeonSideGeo, mats.concrete);
    wall.position.set(x, -4, 0);
    wall.castShadow = true;
    undergroundGroup.add(wall);
  });

  // Gates
  const gateGeo = new THREE.BoxGeometry(8, 8, 0.5);
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const gateX = Math.cos(angle) * 50;
    const gateZ = Math.sin(angle) * 45;
    const gate = new THREE.Mesh(gateGeo, gateMat);
    gate.position.set(gateX, 0, gateZ);
    gate.castShadow = true;
    undergroundGroup.add(gate);
  }

  // ─── CROWD SPECTATORS ───
  const crowdGroup = new THREE.Group();
  crowdGroup.name = 'CROWD';
  group.add(crowdGroup);

  // Simple spectator placeholders (small spheres)
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = FIELD_R_X + 10 + Math.random() * 30;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = 2 + Math.random() * 28;

    const spectator = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
        roughness: 0.6
      })
    );
    spectator.position.set(x, h, z);
    spectator.castShadow = true;
    crowdGroup.add(spectator);
  }

  // ─── EQUIPMENT RACKS ───
  const equipGroup = new THREE.Group();
  equipGroup.name = 'EQUIPMENT';
  group.add(equipGroup);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.cos(angle) * 35;
    const z = Math.sin(angle) * 35;

    // Rack frame
    const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 2), mats.steel);
    rack.position.set(x, 3, z);
    rack.castShadow = true;
    equipGroup.add(rack);

    // Weapons (small cubes on rack)
    for (let j = 0; j < 3; j++) {
      const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.5), mats.steel);
      weapon.position.set(x - 1.5 + j * 1.5, 4 + j * 1.5, z);
      weapon.castShadow = true;
      equipGroup.add(weapon);
    }
  }

  // ─── REST AREAS (benches in lobby) ───
  const benchGeo = new THREE.BoxGeometry(8, 1, 2);
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(benchGeo, mats.wood);
    bench.position.set(-30 + i * 20, PROM_H + 1, 200);
    bench.castShadow = true;
    group.add(bench);
  }

  // ─── HEALING STATION (medical area) ───
  const healPlatform = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mats.marble);
  healPlatform.rotation.x = -Math.PI / 2;
  healPlatform.position.set(0, PROM_H + 0.01, 170);
  healPlatform.receiveShadow = true;
  group.add(healPlatform);

  const healPillar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4), mats.stone);
  healPillar.position.set(0, PROM_H + 2, 170);
  healPillar.castShadow = true;
  group.add(healPillar);

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

  // Underground dungeon lighting
  const dungeonLight = new THREE.PointLight(0xff6600, 0.8, 200);
  dungeonLight.position.set(0, -4, 0);
  group.add(dungeonLight);

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

  // ─── STATE & MECHANICS ───
  let spectatorEnergy = 100;
  let eventCount = 0;
  let isGameActive = false;
  let trapActivated = false;
  let treasureHidden = true;

  // ─── GUARDS / NPCs ───
  const guardsGroup = new THREE.Group();
  guardsGroup.name = 'GUARDS';
  group.add(guardsGroup);

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const x = Math.cos(angle) * (FIELD_R_X + 15);
    const z = Math.sin(angle) * (FIELD_R_L || 32);

    const guard = new THREE.Group();

    // Guard body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.8), mats.steel);
    body.position.y = 1;
    body.castShadow = true;
    guard.add(body);

    // Guard head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), mats.steel);
    head.position.y = 2.5;
    head.castShadow = true;
    guard.add(head);

    // Spear
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), mats.steel);
    spear.position.set(0.5, 1.5, 0);
    spear.castShadow = true;
    guard.add(spear);

    guard.position.set(x, PODIUM_H, z);
    guard.userData.angle = angle;
    guard.userData.patrolSpeed = 0.5;
    guardsGroup.add(guard);
  }

  // ─── VENDOR STALLS ───
  const vendorGroup = new THREE.Group();
  vendorGroup.name = 'VENDORS';
  group.add(vendorGroup);

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(angle) * (promR_in + 2);
    const z = Math.sin(angle) * (promR_in + 2);

    // Stall counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), mats.wood);
    counter.position.set(x, PROM_H + 0.8, z);
    counter.castShadow = true;
    vendorGroup.add(counter);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 2.5), mats.stone);
    roof.position.set(x, PROM_H + 2.5, z);
    roof.castShadow = true;
    vendorGroup.add(roof);

    // Items on display
    for (let j = 0; j < 3; j++) {
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(i / 4, 0.8, 0.6),
          metalness: 0.7
        })
      );
      item.position.set(x - 1 + j * 1, PROM_H + 1.2, z);
      item.castShadow = true;
      vendorGroup.add(item);
    }
  }

  // ─── SPECIAL EVENT ARENAS (hidden chambers) ───
  const eventArenasGroup = new THREE.Group();
  eventArenasGroup.name = 'EVENT_ARENAS';
  group.add(eventArenasGroup);

  // Ice arena (north)
  const iceFloor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({
      color: 0xb4e7ff,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.8
    })
  );
  iceFloor.rotation.x = -Math.PI / 2;
  iceFloor.position.set(0, 0.02, 80);
  iceFloor.visible = false;
  eventArenasGroup.add(iceFloor);

  // Fire arena (south)
  const fireFloor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({
      color: 0xff6b1a,
      roughness: 0.8,
      emissive: 0xff3300,
      emissiveIntensity: 0.5
    })
  );
  fireFloor.rotation.x = -Math.PI / 2;
  fireFloor.position.set(0, 0.02, -80);
  fireFloor.visible = false;
  eventArenasGroup.add(fireFloor);

  // Poison arena (east)
  const poisonFloor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({
      color: 0x2d5a2d,
      roughness: 0.9,
      map: (() => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2d5a2d';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#00ff00';
        for (let i = 0; i < 20; i++) {
          ctx.fillRect(Math.random() * 128, Math.random() * 128, 20, 20);
        }
        return new THREE.CanvasTexture(canvas);
      })()
    })
  );
  poisonFloor.rotation.x = -Math.PI / 2;
  poisonFloor.position.set(80, 0.02, 0);
  poisonFloor.visible = false;
  eventArenasGroup.add(poisonFloor);

  // ─── TREASURE CHAMBER ───
  const treasureGroup = new THREE.Group();
  treasureGroup.name = 'TREASURE';
  group.add(treasureGroup);

  // Hidden below in dungeon
  const treasureChest = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2), mats.wood);
  treasureChest.position.set(0, -8 + 1, 0);
  treasureChest.castShadow = true;
  treasureGroup.add(treasureChest);

  // Gold coins (visual)
  for (let i = 0; i < 10; i++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.9,
        roughness: 0.2
      })
    );
    coin.position.set(
      -1 + Math.random() * 2,
      -6 + Math.random() * 1,
      -1 + Math.random() * 2
    );
    coin.rotation.x = Math.random() * Math.PI;
    coin.castShadow = true;
    treasureGroup.add(coin);
  }

  // ─── TRAP SYSTEMS ───
  const trapGroup = new THREE.Group();
  trapGroup.name = 'TRAPS';
  group.add(trapGroup);

  // Floor spikes (hidden on arena)
  const spikePattern = document.createElement('canvas');
  spikePattern.width = 256;
  spikePattern.height = 256;
  const spikeCtx = spikePattern.getContext('2d');
  spikeCtx.fillStyle = '#d2b48c';
  spikeCtx.fillRect(0, 0, 256, 256);
  spikeCtx.fillStyle = '#333';
  for (let i = 0; i < 20; i++) {
    spikeCtx.fillRect(Math.random() * 256, Math.random() * 256, 10, 10);
  }

  // Trap zones (invisible colliders)
  for (let i = 0; i < 3; i++) {
    const trapZone = new THREE.Mesh(
      new THREE.BoxGeometry(15, 0.1, 15),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    const angle = (i / 3) * Math.PI * 2;
    trapZone.position.set(
      Math.cos(angle) * 30,
      0.2,
      Math.sin(angle) * 30
    );
    trapZone.userData.isTrap = true;
    trapZone.userData.trapType = ['spike', 'fire', 'slow'][i];
    trapGroup.add(trapZone);
  }

  // ─── API ───
  return {
    group: group,
    dims: {
      FIELD_W, FIELD_L,
      LOW_BLEACH_H, UP_BLEACH_H,
      ROOF_H, LOBBY_H,
      OUTER_R, roofR,
      DUNGEON_DEPTH: 8
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

    getSpectatorCount: function() {
      return 42000 + Math.floor(spectatorEnergy * 100);
    },

    setSpectatorEnergy: function(energy) {
      spectatorEnergy = Math.max(0, Math.min(100, energy));
    },

    startEvent: function(eventType) {
      isGameActive = true;
      eventCount++;
      return { eventId: eventCount, type: eventType, spectators: this.getSpectatorCount() };
    },

    endEvent: function() {
      isGameActive = false;
      this.setSpectatorEnergy(spectatorEnergy - 5);
    },

    setArenaMode: setArenaMode,
    getCurrentMode: () => currentMode,
    updateArena: updateArena,
    getArenaGroup: () => arenaGroup,
    getUnderground: () => undergroundGroup,
    getCrowd: () => crowdGroup,
    getEquipment: () => equipGroup,

    getGameState: function() {
      return {
        mode: currentMode,
        isActive: isGameActive,
        eventCount: eventCount,
        spectatorEnergy: spectatorEnergy,
        spectators: this.getSpectatorCount(),
        timestamp: Date.now()
      };
    },

    // ─── GUARD MECHANICS ───
    getGuards: () => guardsGroup,
    updateGuards: function(deltaTime) {
      guardsGroup.children.forEach(guard => {
        if (guard.userData.patrolSpeed) {
          guard.userData.angle += guard.userData.patrolSpeed * deltaTime * 0.1;
          const newX = Math.cos(guard.userData.angle) * (FIELD_R_X + 15);
          const newZ = Math.sin(guard.userData.angle) * (FIELD_R_Z || 32);
          guard.position.x = newX;
          guard.position.z = newZ;
          guard.rotation.y = guard.userData.angle + Math.PI / 2;
        }
      });
    },
    pauseGuards: function() {
      guardsGroup.children.forEach(g => g.userData.patrolSpeed = 0);
    },
    resumeGuards: function() {
      guardsGroup.children.forEach(g => g.userData.patrolSpeed = 0.5);
    },

    // ─── VENDOR MECHANICS ───
    getVendors: () => vendorGroup,
    buyFromVendor: function(vendorIndex, itemIndex) {
      return {
        success: true,
        item: ['health_potion', 'strength_buff', 'speed_buff'][itemIndex],
        cost: 100 + itemIndex * 50,
        quantity: 1
      };
    },

    // ─── SPECIAL EVENT ARENAS ───
    activateSpecialArena: function(arenaType) {
      const arenas = {
        ice: eventArenasGroup.children[0],
        fire: eventArenasGroup.children[1],
        poison: eventArenasGroup.children[2]
      };
      Object.values(arenas).forEach(a => a.visible = false);
      if (arenas[arenaType]) arenas[arenaType].visible = true;
      currentMode = arenaType;
      return { arena: arenaType, active: true };
    },

    // ─── TREASURE SYSTEM ───
    getTreasure: () => treasureGroup,
    claimTreasure: function() {
      if (treasureHidden) {
        treasureHidden = false;
        return {
          success: true,
          treasure: 'Gold Coins',
          amount: 500,
          message: 'Treasure claimed!'
        };
      }
      return { success: false, message: 'Treasure already claimed' };
    },
    isTreasureAvailable: () => treasureHidden,

    // ─── TRAP MECHANICS ───
    getTraps: () => trapGroup,
    checkForTrap: function(x, z) {
      for (let trap of trapGroup.children) {
        const dx = trap.position.x - x;
        const dz = trap.position.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 10) {
          return {
            triggered: true,
            type: trap.userData.trapType,
            damage: trap.userData.trapType === 'spike' ? 15 : 10
          };
        }
      }
      return { triggered: false };
    },
    activateTrap: function(trapIndex) {
      trapActivated = true;
      return { trapId: trapIndex, active: true, warning: 'TRAP ACTIVATED!' };
    },
    deactivateTraps: function() {
      trapActivated = false;
      return { allTraps: 'DEACTIVATED' };
    },

    // ─── FULL COLOSSEUM STATE ───
    getFullState: function() {
      return {
        game: this.getGameState(),
        guards: guardsGroup.children.length,
        vendors: vendorGroup.children.length / 5, // 5 objects per vendor
        spectators: this.getSpectatorCount(),
        spectatorEnergy: spectatorEnergy,
        trapsActive: trapActivated,
        treasureAvailable: treasureHidden,
        currentMode: currentMode,
        dimensions: this.dims,
        timestamp: Date.now()
      };
    }
  };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = buildColosseumImproved;
}
if (typeof window !== 'undefined') {
  window.buildColosseumImproved = buildColosseumImproved;
}
