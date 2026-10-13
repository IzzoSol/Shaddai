/**
 * SHADDAI Colosseum — GAME ENGINE
 * Dynamic Terrain + Game Modes + Obstacles
 * Infinite game variety like a futuristic sports arena
 *
 * Features:
 * - 8+ Terrain Types (grass, water, fire, ice, sand, lava, void, crystal)
 * - 10+ Game Modes (capture-flag, king-of-hill, parkour, dodgeball, etc.)
 * - Dynamic Obstacles (poles, platforms, hazards, moving elements)
 * - Height Variations (jumping, climbing, diving)
 * - Agent-friendly event system
 */

class ColosseumGameEngine {
  constructor(colosseum, THREE, scene) {
    this.colosseum = colosseum;
    this.THREE = THREE;
    this.scene = scene;

    this.currentTerrain = 'grass';
    this.currentGameMode = 'combat';
    this.currentArena = null;
    this.obstacles = [];
    this.hazards = [];
    this.gameState = {
      active: false,
      startTime: 0,
      players: [],
      score: {},
      events: []
    };

    this.initTerrains();
    this.initGameModes();
  }

  // ─── TERRAIN SYSTEM ───
  initTerrains() {
    this.terrains = {
      grass: {
        name: 'Grass Arena',
        color: 0x2d5a2d,
        hazardType: null,
        speedModifier: 1.0,
        jumpModifier: 1.0,
        description: 'Classic grass field - balanced gameplay'
      },
      water: {
        name: 'Water World',
        color: 0x1a7fb0,
        hazardType: 'drowning',
        speedModifier: 0.7,
        jumpModifier: 0.8,
        description: 'Flooded arena - slow movement, water hazards'
      },
      fire: {
        name: 'Inferno',
        color: 0xff6b1a,
        hazardType: 'burning',
        speedModifier: 1.2,
        jumpModifier: 1.3,
        emissive: 0xff3300,
        emissiveIntensity: 0.5,
        description: 'Burning arena - fast, hot, dangerous'
      },
      ice: {
        name: 'Frozen Tundra',
        color: 0xb4e7ff,
        hazardType: 'slipping',
        speedModifier: 0.6,
        jumpModifier: 0.9,
        description: 'Icy field - slippery, hard to control'
      },
      sand: {
        name: 'Dune Wastes',
        color: 0xd2b48c,
        hazardType: null,
        speedModifier: 0.8,
        jumpModifier: 0.7,
        description: 'Sandy desert - slow, ground-based'
      },
      lava: {
        name: 'Lava Chambers',
        color: 0x8b0000,
        hazardType: 'lava_damage',
        speedModifier: 1.1,
        jumpModifier: 1.5,
        emissive: 0xff3300,
        emissiveIntensity: 0.8,
        description: 'Molten arena - instant death zones, high jumps'
      },
      void: {
        name: 'Void Portal',
        color: 0x1a0033,
        hazardType: 'falling',
        speedModifier: 1.3,
        jumpModifier: 1.1,
        description: 'Dark void - edge hazards, blind spots'
      },
      crystal: {
        name: 'Crystal Realm',
        color: 0x00ffff,
        hazardType: 'fragile',
        speedModifier: 1.0,
        jumpModifier: 1.2,
        emissive: 0x00ffff,
        emissiveIntensity: 0.4,
        description: 'Crystalline field - bouncy, reflective'
      }
    };
  }

  // ─── GAME MODE SYSTEM ───
  initGameModes() {
    this.gameModes = {
      // Combat modes
      combat: {
        name: '⚔️ Arena Combat',
        type: 'PvP',
        players: '1v1 or teams',
        objective: 'Last one standing',
        terrain: 'any',
        obstacles: 'moderate',
        difficulty: 'medium'
      },
      king_of_hill: {
        name: '👑 King of the Hill',
        type: 'PvP',
        players: 'FFA (4-8)',
        objective: 'Control center platform',
        terrain: 'any',
        obstacles: 'heavy',
        difficulty: 'hard',
        specialFeatures: ['centerPlatform', 'movingPlatforms']
      },
      capture_flag: {
        name: '🚩 Capture the Flag',
        type: 'Team',
        players: 'Teams of 2-4',
        objective: 'Steal enemy flag, return to base',
        terrain: 'grass',
        obstacles: 'heavy',
        difficulty: 'hard',
        specialFeatures: ['twoTeamZones', 'flagSpawns']
      },

      // Parkour modes
      parkour: {
        name: '🏃 Parkour Challenge',
        type: 'Solo',
        players: 'Individual',
        objective: 'Reach end in time',
        terrain: 'grass',
        obstacles: 'extreme',
        difficulty: 'extreme',
        specialFeatures: ['polesToClimb', 'platformsToJump', 'timedCourse']
      },
      pole_vault: {
        name: '🎯 Pole Vault Sprint',
        type: 'Solo/Race',
        players: 'Individual or race',
        objective: 'Vault over all poles fastest',
        terrain: 'any',
        obstacles: 'extreme',
        difficulty: 'hard',
        specialFeatures: ['vaultPoles', 'heightVariation']
      },

      // Hazard modes
      dodgeball: {
        name: '🎱 Dodgeball Arena',
        type: 'Team',
        players: 'Teams of 3-5',
        objective: 'Eliminate opponents with hazards',
        terrain: 'any',
        obstacles: 'light',
        difficulty: 'medium',
        specialFeatures: ['movingHazards', 'deflectors']
      },
      lava_survival: {
        name: '🔥 Lava Survival',
        type: 'FFA',
        players: '2-8',
        objective: 'Stay off lava longest',
        terrain: 'lava',
        obstacles: 'extreme',
        difficulty: 'extreme',
        specialFeatures: ['risingLava', 'floatingPlatforms']
      },

      // Puzzle modes
      ice_puzzle: {
        name: '❄️ Ice Slide Puzzle',
        type: 'Solo',
        players: 'Individual',
        objective: 'Solve ice-sliding puzzle',
        terrain: 'ice',
        obstacles: 'moderate',
        difficulty: 'medium',
        specialFeatures: ['slipperyControls', 'targetZones']
      },
      void_jump: {
        name: '🌌 Void Jump',
        type: 'Solo/Race',
        players: 'Individual',
        objective: 'Jump platforms over void',
        terrain: 'void',
        obstacles: 'heavy',
        difficulty: 'extreme',
        specialFeatures: ['floatingPlatforms', 'fallingHazard']
      }
    };
  }

  // ─── TERRAIN MORPHING ───
  changeTerrain(terrainKey) {
    if (!this.terrains[terrainKey]) {
      return { success: false, error: 'Unknown terrain' };
    }

    const terrain = this.terrains[terrainKey];
    this.currentTerrain = terrainKey;

    // Update arena floor
    const floorMat = new this.THREE.MeshStandardMaterial({
      color: terrain.color,
      roughness: 0.9,
      metalness: 0.1,
      emissive: terrain.emissive || 0x000000,
      emissiveIntensity: terrain.emissiveIntensity || 0
    });

    return {
      success: true,
      terrain: terrain.name,
      modifiers: {
        speed: terrain.speedModifier,
        jump: terrain.jumpModifier
      },
      hazard: terrain.hazardType,
      description: terrain.description
    };
  }

  // ─── GAME MODE SELECTION ───
  selectGameMode(modeKey) {
    if (!this.gameModes[modeKey]) {
      return { success: false, error: 'Unknown game mode' };
    }

    const mode = this.gameModes[modeKey];
    this.currentGameMode = modeKey;

    return {
      success: true,
      mode: mode.name,
      type: mode.type,
      players: mode.players,
      objective: mode.objective,
      difficulty: mode.difficulty,
      specialFeatures: mode.specialFeatures || []
    };
  }

  // ─── OBSTACLE GENERATION ───
  generateObstacles(type = 'moderate') {
    this.obstacles = [];
    const THREE = this.THREE;

    const obstacleConfigs = {
      light: 3,
      moderate: 6,
      heavy: 12,
      extreme: 20
    };

    const count = obstacleConfigs[type] || 6;

    for (let i = 0; i < count; i++) {
      const obstacleTypes = [
        this.createPole(i),
        this.createPlatform(i),
        this.createRamp(i),
        this.createBarrier(i)
      ];

      const obstacle = obstacleTypes[i % obstacleTypes.length];
      if (obstacle) this.obstacles.push(obstacle);
    }

    return { success: true, obstaclesCreated: this.obstacles.length };
  }

  createPole(index) {
    const angle = (index / 10) * Math.PI * 2;
    const x = Math.cos(angle) * 40;
    const z = Math.sin(angle) * 40;
    const height = 2 + Math.random() * 8; // Varied heights

    const poleGeo = new this.THREE.CylinderGeometry(0.5, 0.5, height, 16);
    const poleMat = new this.THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8,
      metalness: 0.2
    });
    const pole = new this.THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, height / 2, z);
    pole.castShadow = true;
    pole.userData = { type: 'pole', climbable: true, height: height };

    return {
      mesh: pole,
      type: 'pole',
      position: { x, z },
      height: height,
      interact: 'vault/climb'
    };
  }

  createPlatform(index) {
    const angle = (index / 8) * Math.PI * 2 + 0.5;
    const x = Math.cos(angle) * 50;
    const z = Math.sin(angle) * 50;
    const height = 3 + (index % 5) * 2; // Step heights

    const platformGeo = new this.THREE.BoxGeometry(8, 1, 8);
    const platformMat = new this.THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.6,
      metalness: 0.4
    });
    const platform = new this.THREE.Mesh(platformGeo, platformMat);
    platform.position.set(x, height, z);
    platform.castShadow = true;
    platform.userData = { type: 'platform', climbable: false };

    return {
      mesh: platform,
      type: 'platform',
      position: { x, z },
      height: height,
      size: { w: 8, d: 8 },
      interact: 'jump/land'
    };
  }

  createRamp(index) {
    const angle = (index / 6) * Math.PI * 2 + 1;
    const x = Math.cos(angle) * 45;
    const z = Math.sin(angle) * 45;
    const height = 5;

    const rampGeo = new this.THREE.BoxGeometry(6, 1, 12);
    const rampMat = new this.THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.7
    });
    const ramp = new this.THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(x, height, z);
    ramp.rotation.z = Math.PI / 6; // 30 degree angle
    ramp.castShadow = true;

    return {
      mesh: ramp,
      type: 'ramp',
      position: { x, z },
      angle: 30,
      interact: 'slide/run'
    };
  }

  createBarrier(index) {
    const angle = (index / 12) * Math.PI * 2 + 2;
    const x = Math.cos(angle) * 35;
    const z = Math.sin(angle) * 35;

    const barrierGeo = new this.THREE.BoxGeometry(2, 2, 10);
    const barrierMat = new this.THREE.MeshStandardMaterial({
      color: 0xff0000,
      roughness: 0.5,
      metalness: 0.6
    });
    const barrier = new this.THREE.Mesh(barrierGeo, barrierMat);
    barrier.position.set(x, 1, z);
    barrier.castShadow = true;
    barrier.userData = { type: 'barrier', hazard: true, damage: 10 };

    return {
      mesh: barrier,
      type: 'barrier',
      position: { x, z },
      hazard: true,
      damage: 10
    };
  }

  // ─── HAZARD SYSTEM ───
  createHazards(terrainType) {
    this.hazards = [];

    switch (terrainType) {
      case 'lava':
        this.hazards = this.createLavaZones();
        break;
      case 'water':
        this.hazards = this.createWaterHazards();
        break;
      case 'fire':
        this.hazards = this.createFireZones();
        break;
      case 'void':
        this.hazards = this.createVoidHazards();
        break;
      case 'ice':
        this.hazards = this.createIceHazards();
        break;
    }

    return { success: true, hazardsCreated: this.hazards.length };
  }

  createLavaZones() {
    const zones = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = Math.cos(angle) * 30;
      const z = Math.sin(angle) * 30;

      zones.push({
        type: 'lava',
        position: { x, z },
        radius: 8,
        damage: 50,
        instant: true
      });
    }
    return zones;
  }

  createWaterHazards() {
    return [
      { type: 'deep_water', position: { x: 0, z: 0 }, radius: 25, damage: 5, drowning: true },
      { type: 'whirlpool', position: { x: -30, z: 30 }, radius: 15, damage: 3, pull: true }
    ];
  }

  createFireZones() {
    return [
      { type: 'fire', position: { x: 20, z: 20 }, radius: 12, damage: 15, burning: true },
      { type: 'fire', position: { x: -20, z: 20 }, radius: 12, damage: 15, burning: true },
      { type: 'fire', position: { x: 0, z: -35 }, radius: 10, damage: 15, burning: true }
    ];
  }

  createVoidHazards() {
    return [
      { type: 'void', position: { x: 40, z: 0 }, radius: 50, damage: 999, falling: true },
      { type: 'void', position: { x: -40, z: 0 }, radius: 50, damage: 999, falling: true }
    ];
  }

  createIceHazards() {
    return [
      { type: 'thin_ice', position: { x: 0, z: 0 }, radius: 35, damage: 0, slippery: true, slipAmount: 1.5 }
    ];
  }

  // ─── ARENA CONFIGURATION ───
  configureArena(gameMode, terrainType) {
    const mode = this.gameModes[gameMode];
    const terrain = this.terrains[terrainType];

    if (!mode || !terrain) {
      return { success: false, error: 'Invalid configuration' };
    }

    // Apply terrain
    this.changeTerrain(terrainType);

    // Generate obstacles based on mode
    const obstacleIntensity = mode.obstacles || 'moderate';
    this.generateObstacles(obstacleIntensity);

    // Create hazards
    this.createHazards(terrainType);

    // Configure special features
    const specialFeatures = {};
    if (mode.specialFeatures) {
      mode.specialFeatures.forEach(feature => {
        specialFeatures[feature] = this.enableFeature(feature);
      });
    }

    this.currentArena = {
      gameMode: mode.name,
      terrain: terrain.name,
      obstacles: this.obstacles.length,
      hazards: this.hazards.length,
      modifiers: {
        speed: terrain.speedModifier,
        jump: terrain.jumpModifier
      },
      specialFeatures: specialFeatures
    };

    return {
      success: true,
      arena: this.currentArena,
      message: `Arena configured: ${mode.name} on ${terrain.name}`
    };
  }

  enableFeature(feature) {
    const features = {
      centerPlatform: { size: 20, height: 8, contested: true },
      polesToClimb: { count: 8, heights: [3, 5, 7, 9] },
      platformsToJump: { count: 10, minHeight: 2, maxHeight: 10 },
      timedCourse: { duration: 60, checkpoints: 5 },
      vaultPoles: { count: 12, spacing: 8 },
      movingHazards: { count: 4, speed: 1.5 },
      movingPlatforms: { count: 3, speed: 1.0 },
      risingLava: { startHeight: 0, riseSpeed: 0.5 },
      floatingPlatforms: { count: 8, height: 15 },
      fallingHazard: { damage: 999, radius: 50 },
      slipperyControls: { slipFactor: 1.8 },
      targetZones: { count: 3, points: 100 },
      twoTeamZones: { size: 50, distance: 100 },
      flagSpawns: { respawnTime: 30 }
    };

    return features[feature] || {};
  }

  // ─── GAME LIFECYCLE ───
  startGame(gameMode, terrainType, players) {
    const config = this.configureArena(gameMode, terrainType);
    if (!config.success) return config;

    this.gameState = {
      active: true,
      startTime: Date.now(),
      mode: gameMode,
      terrain: terrainType,
      players: players || [],
      score: {},
      events: [],
      modifiers: config.arena.modifiers
    };

    players?.forEach(player => {
      this.gameState.score[player] = { points: 0, alive: true, position: { x: 0, y: 0, z: 0 } };
    });

    return {
      success: true,
      gameStarted: true,
      game: this.gameState,
      message: `Game started: ${config.arena.gameMode} on ${config.arena.terrain}`
    };
  }

  endGame() {
    this.gameState.active = false;
    return { success: true, gameStopped: true };
  }

  logGameEvent(event) {
    this.gameState.events.push({
      timestamp: Date.now() - this.gameState.startTime,
      ...event
    });
  }

  // ─── STATS & INFO ───
  getAvailableTerrains() {
    return Object.entries(this.terrains).map(([key, terrain]) => ({
      key,
      name: terrain.name,
      description: terrain.description,
      hazard: terrain.hazardType || 'none'
    }));
  }

  getAvailableGameModes() {
    return Object.entries(this.gameModes).map(([key, mode]) => ({
      key,
      name: mode.name,
      type: mode.type,
      difficulty: mode.difficulty,
      players: mode.players
    }));
  }

  getGameStatus() {
    return {
      active: this.gameState.active,
      currentGameMode: this.currentGameMode,
      currentTerrain: this.currentTerrain,
      currentArena: this.currentArena,
      players: Object.keys(this.gameState.score),
      events: this.gameState.events.length,
      runtime: this.gameState.active ? Date.now() - this.gameState.startTime : 0
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColosseumGameEngine;
}
if (typeof window !== 'undefined') {
  window.ColosseumGameEngine = ColosseumGameEngine;
}
