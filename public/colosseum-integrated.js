/**
 * SHADDAI Colosseum — INTEGRATED GAME ENGINE
 * Complete system with visual polish, game modes, terrain, obstacles, hazards
 * Ready for agent integration and infinite gameplay
 */

class ColosseumIntegrated {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;

    // Visual components
    this.colosseum = null;
    this.gameEngine = null;

    // Game state
    this.currentGame = null;
    this.activePlayers = [];
    this.sessionEvents = [];
  }

  initialize() {
    // Build visual stadium (polish version)
    this.colosseum = buildColosseumPolished(this.THREE, { scene: this.scene });

    // Initialize game engine
    this.gameEngine = new ColosseumGameEngine(this.colosseum, this.THREE, this.scene);

    return {
      success: true,
      colosseum: 'Polished stadium loaded',
      gameEngine: 'Game modes and terrain system ready',
      features: {
        terrains: this.gameEngine.getAvailableTerrains().length,
        gameModes: this.gameEngine.getAvailableGameModes().length,
        arenaTypes: 'Dynamic configuration system'
      }
    };
  }

  // ─── GAME LAUNCHER ───
  launchGame(config) {
    const { gameMode, terrain, players = ['Player 1', 'Player 2'] } = config;

    // Validate
    if (!this.gameEngine.gameModes[gameMode]) {
      return { success: false, error: `Unknown game mode: ${gameMode}` };
    }
    if (!this.gameEngine.terrains[terrain]) {
      return { success: false, error: `Unknown terrain: ${terrain}` };
    }

    // Start game
    const result = this.gameEngine.startGame(gameMode, terrain, players);

    if (result.success) {
      this.currentGame = {
        id: Date.now(),
        startTime: Date.now(),
        config: config,
        state: result.game
      };

      return {
        success: true,
        gameId: this.currentGame.id,
        gameStarted: true,
        arena: result.game,
        message: result.message
      };
    }

    return result;
  }

  // ─── GAMEPLAY LOOP ───
  updateGame(deltaTime) {
    if (!this.currentGame || !this.gameEngine.gameState.active) {
      return;
    }

    // Update visual animations
    if (this.colosseum.update) {
      this.colosseum.update(deltaTime);
    }

    // Simulate game state
    this.gameEngine.gameState.runtime = Date.now() - this.currentGame.startTime;
  }

  // ─── PLAYER ACTIONS ───
  playerMove(playerName, direction) {
    if (!this.currentGame || !this.gameEngine.gameState.active) {
      return { success: false, error: 'No active game' };
    }

    const modifiers = this.gameEngine.gameState.modifiers;
    const movement = {
      direction,
      speedModifier: modifiers.speed,
      timestamp: Date.now() - this.currentGame.startTime,
      player: playerName
    };

    this.gameEngine.logGameEvent({
      type: 'player_move',
      player: playerName,
      movement
    });

    return { success: true, movement };
  }

  playerJump(playerName, height = 1.0) {
    if (!this.currentGame || !this.gameEngine.gameState.active) {
      return { success: false, error: 'No active game' };
    }

    const modifiers = this.gameEngine.gameState.modifiers;
    const jumpHeight = height * modifiers.jump;

    this.gameEngine.logGameEvent({
      type: 'player_jump',
      player: playerName,
      jumpHeight
    });

    return { success: true, jumpHeight };
  }

  playerAttack(attacker, defender) {
    if (!this.currentGame || !this.gameEngine.gameState.active) {
      return { success: false, error: 'No active game' };
    }

    const damage = Math.random() * 30 + 10; // 10-40 damage

    this.gameEngine.logGameEvent({
      type: 'player_attack',
      attacker,
      defender,
      damage
    });

    return { success: true, damage, attacker, defender };
  }

  playerInteract(playerName, obstacle) {
    if (!this.currentGame || !this.gameEngine.gameState.active) {
      return { success: false, error: 'No active game' };
    }

    const interaction = {
      player: playerName,
      obstacle: obstacle.type,
      action: obstacle.interact,
      timestamp: Date.now() - this.currentGame.startTime
    };

    this.gameEngine.logGameEvent({
      type: 'player_interact',
      ...interaction
    });

    return { success: true, interaction };
  }

  // ─── TERRAIN CHANGES (MID-GAME) ───
  switchTerrain(newTerrain) {
    const result = this.gameEngine.changeTerrain(newTerrain);

    if (result.success) {
      this.gameEngine.createHazards(newTerrain);
      this.gameEngine.generateObstacles(
        this.gameEngine.gameModes[this.gameEngine.currentGameMode].obstacles
      );

      this.gameEngine.logGameEvent({
        type: 'terrain_change',
        newTerrain,
        modifiers: result.modifiers
      });

      return {
        success: true,
        terrain: result.terrain,
        modifiers: result.modifiers
      };
    }

    return result;
  }

  // ─── GAME STATISTICS ───
  getGameStatus() {
    if (!this.currentGame) {
      return { success: false, error: 'No active game' };
    }

    return {
      success: true,
      gameId: this.currentGame.id,
      duration: this.gameEngine.gameState.runtime,
      mode: this.gameEngine.currentGameMode,
      terrain: this.gameEngine.currentTerrain,
      players: this.gameEngine.gameState.players,
      score: this.gameEngine.gameState.score,
      events: this.gameEngine.gameState.events.length,
      obstacles: this.gameEngine.obstacles.length,
      hazards: this.gameEngine.hazards.length
    };
  }

  getGameHistory() {
    if (!this.currentGame) {
      return [];
    }

    return this.gameEngine.gameState.events.map(event => ({
      ...event,
      runtime: this.gameEngine.gameState.runtime
    }));
  }

  // ─── TERRAIN SHOWCASE ───
  showcaseAllTerrains() {
    const terrains = this.gameEngine.getAvailableTerrains();

    return {
      success: true,
      terrains: terrains.map(t => ({
        key: t.key,
        name: t.name,
        description: t.description,
        hazard: t.hazard
      }))
    };
  }

  // ─── GAME MODE SHOWCASE ───
  showcaseAllGameModes() {
    const modes = this.gameEngine.getAvailableGameModes();

    return {
      success: true,
      modes: modes.map(m => ({
        key: m.key,
        name: m.name,
        type: m.type,
        difficulty: m.difficulty,
        players: m.players
      }))
    };
  }

  // ─── INFINITE GAME COMBINATIONS ───
  suggestRandomGame() {
    const terrains = Object.keys(this.gameEngine.terrains);
    const gameModes = Object.keys(this.gameEngine.gameModes);

    const randomTerrain = terrains[Math.floor(Math.random() * terrains.length)];
    const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];

    const terrain = this.gameEngine.terrains[randomTerrain];
    const mode = this.gameEngine.gameModes[randomMode];

    return {
      suggestion: `${mode.name} on ${terrain.name}`,
      gameMode: randomMode,
      terrain: randomTerrain,
      description: `${mode.objective} - ${terrain.description}`,
      difficulty: mode.difficulty,
      players: mode.players,
      config: { gameMode: randomMode, terrain: randomTerrain }
    };
  }

  // ─── END GAME ───
  endCurrentGame() {
    if (!this.currentGame) {
      return { success: false, error: 'No active game' };
    }

    this.gameEngine.endGame();

    const result = {
      success: true,
      gameEnded: true,
      summary: this.getGameStatus(),
      finalScore: this.gameEngine.gameState.score,
      totalEvents: this.gameEngine.gameState.events.length
    };

    this.currentGame = null;

    return result;
  }

  // ─── RENDERING STATE ───
  getVisualState() {
    return {
      colosseum: this.colosseum ? 'loaded' : 'not loaded',
      currentMode: this.colosseum?.getMode ? this.colosseum.getMode() : 'unknown',
      gameEngine: this.gameEngine ? 'initialized' : 'not initialized',
      gameActive: this.gameEngine?.gameState.active || false
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColosseumIntegrated;
}
if (typeof window !== 'undefined') {
  window.ColosseumIntegrated = ColosseumIntegrated;
}
