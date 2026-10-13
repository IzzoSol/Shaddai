/**
 * SHADDAI Colosseum — ECS GAME ARCHITECTURE
 * Integrated from game-creator design patterns
 * Entity-Component-System with proper game systems
 */

// ─── COMPONENT SYSTEM ───
class Component {
  constructor(data = {}) {
    Object.assign(this, data);
  }
}

// Game-specific components
class Transform extends Component {
  constructor(x = 0, y = 0, z = 0) {
    super({ x, y, z, vx: 0, vy: 0, vz: 0, rotation: 0 });
  }
}

class Health extends Component {
  constructor(hp = 100, maxHp = 100) {
    super({ hp, maxHp, alive: true });
  }
}

class Physics extends Component {
  constructor(mass = 1, friction = 0.8) {
    super({ mass, friction, velocity: { x: 0, y: 0, z: 0 } });
  }
}

class Combat extends Component {
  constructor(damage = 10, armor = 0, attackSpeed = 1) {
    super({ damage, armor, attackSpeed, lastAttack: 0 });
  }
}

class Renderable extends Component {
  constructor(mesh = null, visible = true) {
    super({ mesh, visible });
  }
}

class Hazard extends Component {
  constructor(type = 'fire', damage = 10, radius = 5) {
    super({ type, damage, radius });
  }
}

class Obstacle extends Component {
  constructor(type = 'pole', height = 5, climbable = false) {
    super({ type, height, climbable });
  }
}

class PlayerInput extends Component {
  constructor() {
    super({ moveDir: { x: 0, z: 0 }, jumping: false, attacking: false });
  }
}

// ─── ENTITY MANAGER ───
class EntityManager {
  constructor() {
    this.nextId = 0;
    this.entities = new Map();
  }

  create(type = 'entity') {
    const id = this.nextId++;
    this.entities.set(id, { id, type, components: {} });
    return id;
  }

  destroy(id) {
    this.entities.delete(id);
  }

  addComponent(entityId, ComponentClass, data) {
    const entity = this.entities.get(entityId);
    if (entity) {
      entity.components[ComponentClass.name] = new ComponentClass(data);
    }
  }

  getComponent(entityId, ComponentClass) {
    const entity = this.entities.get(entityId);
    return entity?.components[ComponentClass.name];
  }

  hasComponent(entityId, ComponentClass) {
    const entity = this.entities.get(entityId);
    return entity?.components[ComponentClass.name] !== undefined;
  }

  getEntitiesWithComponent(ComponentClass) {
    const results = [];
    for (const [id, entity] of this.entities) {
      if (entity.components[ComponentClass.name]) {
        results.push({ id, entity });
      }
    }
    return results;
  }

  clear() {
    this.entities.clear();
    this.nextId = 0;
  }
}

// ─── SYSTEM BASE ───
class GameSystem {
  constructor(entityManager) {
    this.entities = entityManager;
  }

  update(deltaTime) {
    // Override in subclasses
  }
}

// ─── MOVEMENT SYSTEM ───
class MovementSystem extends GameSystem {
  update(deltaTime) {
    const entities = this.entities.getEntitiesWithComponent(Transform);

    for (const { id, entity } of entities) {
      const transform = entity.components.Transform;
      const physics = entity.components.Physics;
      const input = entity.components.PlayerInput;

      if (!transform) continue;

      // Apply input
      if (input) {
        transform.vx = input.moveDir.x * 5;
        transform.vz = input.moveDir.z * 5;
      }

      // Apply physics
      if (physics) {
        transform.vx *= physics.friction;
        transform.vz *= physics.friction;
      }

      // Update position
      transform.x += transform.vx * deltaTime;
      transform.y += transform.vy * deltaTime;
      transform.z += transform.vz * deltaTime;

      // Gravity
      transform.vy -= 9.8 * deltaTime;

      // Ground collision
      if (transform.y < 0) {
        transform.y = 0;
        transform.vy = 0;
      }
    }
  }
}

// ─── COMBAT SYSTEM ───
class CombatSystem extends GameSystem {
  constructor(entityManager) {
    super(entityManager);
    this.combats = [];
  }

  simulateBattle(attacker, defender) {
    const aCombat = this.entities.getComponent(attacker, Combat);
    const aHealth = this.entities.getComponent(attacker, Health);
    const dCombat = this.entities.getComponent(defender, Combat);
    const dHealth = this.entities.getComponent(defender, Health);

    if (!aCombat || !aHealth || !dCombat || !dHealth) return null;

    const damage = (aCombat.damage * (0.8 + Math.random() * 0.4)) - (dCombat.armor * 0.5);
    dHealth.hp = Math.max(0, dHealth.hp - damage);

    if (dHealth.hp <= 0) {
      dHealth.alive = false;
    }

    return {
      attacker,
      defender,
      damage: Math.max(0, damage),
      defenderHp: dHealth.hp,
      victory: !dHealth.alive
    };
  }

  update(deltaTime) {
    // Process combat queue
    while (this.combats.length > 0) {
      const { a, d } = this.combats.shift();
      this.simulateBattle(a, d);
    }
  }

  queueBattle(attacker, defender) {
    this.combats.push({ a: attacker, d: defender });
  }
}

// ─── HAZARD SYSTEM ───
class HazardSystem extends GameSystem {
  update(deltaTime) {
    const hazards = this.entities.getEntitiesWithComponent(Hazard);
    const entities = this.entities.getEntitiesWithComponent(Transform);

    for (const { id: hazardId, entity: hazardEntity } of hazards) {
      const hazard = hazardEntity.components.Hazard;
      const hazardTrans = hazardEntity.components.Transform;

      if (!hazard || !hazardTrans) continue;

      // Check collisions with all entities
      for (const { id: entityId, entity } of entities) {
        if (entityId === hazardId) continue;

        const transform = entity.components.Transform;
        const health = entity.components.Health;

        if (!transform || !health) continue;

        // Distance check
        const dx = transform.x - hazardTrans.x;
        const dz = transform.z - hazardTrans.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < hazard.radius) {
          // Apply hazard damage
          health.hp = Math.max(0, health.hp - hazard.damage * deltaTime);

          if (health.hp <= 0) {
            health.alive = false;
          }
        }
      }
    }
  }
}

// ─── OBSTACLE COLLISION SYSTEM ───
class ObstacleSystem extends GameSystem {
  update(deltaTime) {
    const entities = this.entities.getEntitiesWithComponent(Transform);
    const obstacles = this.entities.getEntitiesWithComponent(Obstacle);

    for (const { id, entity } of entities) {
      const transform = entity.components.Transform;
      if (!transform) continue;

      // Check collision with obstacles
      for (const { id: obstacleId, entity: obstacleEntity } of obstacles) {
        const obstacleTrans = obstacleEntity.components.Transform;
        const obstacle = obstacleEntity.components.Obstacle;

        if (!obstacleTrans || !obstacle) continue;

        const dx = transform.x - obstacleTrans.x;
        const dz = transform.z - obstacleTrans.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Collision response (simple)
        if (dist < 2) {
          // Push entity away
          const angle = Math.atan2(dz, dx);
          transform.x = obstacleTrans.x + Math.cos(angle) * 2;
          transform.z = obstacleTrans.z + Math.sin(angle) * 2;

          // Climbing?
          if (obstacle.climbable && transform.vy < 0.1) {
            transform.vy = 5; // Jump impulse
          }
        }
      }
    }
  }
}

// ─── RENDER SYSTEM ───
class RenderSystem extends GameSystem {
  constructor(entityManager, THREE, scene) {
    super(entityManager);
    this.THREE = THREE;
    this.scene = scene;
  }

  update(deltaTime) {
    const entities = this.entities.getEntitiesWithComponent(Renderable);

    for (const { id, entity } of entities) {
      const renderable = entity.components.Renderable;
      const transform = entity.components.Transform;

      if (renderable.mesh && transform) {
        renderable.mesh.position.set(transform.x, transform.y, transform.z);
        renderable.mesh.visible = renderable.visible;
      }
    }
  }
}

// ─── GAME ENGINE (coordinator) ───
class ColosseumGameEngine {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;

    // Core systems
    this.entityManager = new EntityManager();
    this.movementSystem = new MovementSystem(this.entityManager);
    this.combatSystem = new CombatSystem(this.entityManager);
    this.hazardSystem = new HazardSystem(this.entityManager);
    this.obstacleSystem = new ObstacleSystem(this.entityManager);
    this.renderSystem = new RenderSystem(this.entityManager, THREE, scene);

    this.systems = [
      this.movementSystem,
      this.obstacleSystem,
      this.hazardSystem,
      this.combatSystem,
      this.renderSystem
    ];

    this.gameActive = false;
    this.gameState = {
      mode: 'sandbox',
      terrain: 'grass',
      players: [],
      score: {},
      events: []
    };
  }

  // ─── ENTITY CREATION ───
  createPlayer(x, y, z, name) {
    const playerId = this.entityManager.create('player');

    this.entityManager.addComponent(playerId, Transform, { x, y, z });
    this.entityManager.addComponent(playerId, Health, { hp: 100, maxHp: 100 });
    this.entityManager.addComponent(playerId, Physics, { mass: 1, friction: 0.85 });
    this.entityManager.addComponent(playerId, Combat, { damage: 15, armor: 5, attackSpeed: 1 });
    this.entityManager.addComponent(playerId, PlayerInput);

    // Create visual representation
    const geometry = new this.THREE.CapsuleGeometry(0.5, 2, 4, 8);
    const material = new this.THREE.MeshStandardMaterial({
      color: Math.random() * 0xffffff,
      roughness: 0.8
    });
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.entityManager.addComponent(playerId, Renderable, { mesh, visible: true });

    this.gameState.players.push({ id: playerId, name });
    this.gameState.score[name] = { points: 0, alive: true };

    return playerId;
  }

  createObstacle(x, y, z, type = 'pole', height = 5) {
    const obstacleId = this.entityManager.create('obstacle');

    this.entityManager.addComponent(obstacleId, Transform, { x, y, z });
    this.entityManager.addComponent(obstacleId, Obstacle, { type, height, climbable: true });

    // Visual
    const geometry = new this.THREE.CylinderGeometry(0.5, 0.5, height, 8);
    const material = new this.THREE.MeshStandardMaterial({
      color: type === 'pole' ? 0x8b4513 : 0x4a4a4a,
      roughness: 0.9
    });
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.entityManager.addComponent(obstacleId, Renderable, { mesh, visible: true });

    return obstacleId;
  }

  createHazard(x, y, z, type = 'fire', damage = 20, radius = 8) {
    const hazardId = this.entityManager.create('hazard');

    this.entityManager.addComponent(hazardId, Transform, { x, y, z });
    this.entityManager.addComponent(hazardId, Hazard, { type, damage, radius });

    // Visual
    const geometry = new this.THREE.SphereGeometry(radius, 16, 16);
    const color = type === 'fire' ? 0xff3300 : type === 'lava' ? 0xff6600 : 0x00aaff;
    const material = new this.THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.3
    });
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    this.scene.add(mesh);

    this.entityManager.addComponent(hazardId, Renderable, { mesh, visible: true });

    return hazardId;
  }

  // ─── GAMEPLAY ───
  startGame() {
    this.gameActive = true;
    this.gameState.events = [];

    // Create 2 players
    this.player1 = this.createPlayer(-10, 0, 0, 'Player 1');
    this.player2 = this.createPlayer(10, 0, 0, 'Player 2');

    // Create obstacles
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const x = Math.cos(angle) * 30;
      const z = Math.sin(angle) * 30;
      this.createObstacle(x, 0, z, 'pole', 5 + Math.random() * 4);
    }

    // Create hazards
    this.createHazard(20, 0, 20, 'fire', 15, 8);
    this.createHazard(-20, 0, -20, 'lava', 25, 6);

    this.logEvent('Game started: Arena combat');
  }

  endGame() {
    this.gameActive = false;
    this.entityManager.clear();
    this.logEvent('Game ended');
  }

  update(deltaTime) {
    if (!this.gameActive) return;

    // Run all systems
    for (const system of this.systems) {
      system.update(deltaTime);
    }

    // Check for dead players
    const p1Health = this.entityManager.getComponent(this.player1, Health);
    const p2Health = this.entityManager.getComponent(this.player2, Health);

    if (p1Health && !p1Health.alive) {
      this.gameState.score['Player 2'].points += 100;
      this.logEvent('Player 2 wins!');
      this.gameActive = false;
    }

    if (p2Health && !p2Health.alive) {
      this.gameState.score['Player 1'].points += 100;
      this.logEvent('Player 1 wins!');
      this.gameActive = false;
    }
  }

  // ─── PLAYER ACTIONS ───
  movePlayer(playerId, direction) {
    const input = this.entityManager.getComponent(playerId, PlayerInput);
    if (input) {
      input.moveDir = direction;
    }
  }

  jumpPlayer(playerId) {
    const transform = this.entityManager.getComponent(playerId, Transform);
    if (transform && Math.abs(transform.y) < 0.1) {
      transform.vy = 8;
      this.logEvent(`Player jumped`);
    }
  }

  attackPlayer(attacker, defender) {
    const result = this.combatSystem.simulateBattle(attacker, defender);
    if (result) {
      this.logEvent(`Attack: ${result.damage.toFixed(1)} damage`);
      return result;
    }
  }

  // ─── STATE ───
  logEvent(message) {
    this.gameState.events.push({
      timestamp: Date.now(),
      message
    });
  }

  getGameStatus() {
    return {
      active: this.gameActive,
      players: this.gameState.players,
      score: this.gameState.score,
      events: this.gameState.events.length
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
