# SHADDAI Colosseum — ECS Architecture Guide

## Architecture Overview

The colosseum now uses **Entity-Component-System (ECS)** design, extracted from the `shaddai-threejs-gamedev-master` game studio patterns. This provides:

- **Data-oriented design** — Components store data, systems process logic
- **Scalability** — Add new gameplay easily without modifying existing systems
- **Performance** — Cache-friendly iteration over components
- **Testability** — Systems are independent and mockable

## Core Systems

### 1. EntityManager
```javascript
// Create entity
const playerId = entityManager.create('player');

// Add components
entityManager.addComponent(playerId, Health, { hp: 100, maxHp: 100 });
entityManager.addComponent(playerId, Transform, { x: 0, y: 0, z: 0 });
entityManager.addComponent(playerId, Combat, { damage: 15, armor: 5 });

// Query
const entities = entityManager.getEntitiesWithComponent(Transform);
```

### 2. GameSystems

#### MovementSystem
- Processes `Transform` + `Physics` + `PlayerInput`
- Updates position based on velocity
- Applies gravity and ground collision
- Frame-rate independent (uses deltaTime)

#### CombatSystem
- Processes `Combat` + `Health`
- Damage formula: `damage × variance - armor × 0.5`
- Tracks battle queue
- Victory detection (HP ≤ 0)

#### HazardSystem
- Processes `Hazard` + `Transform`
- Radius-based collision detection
- Applies damage over time
- Multiple hazard types (fire, lava, drowning, etc.)

#### ObstacleSystem
- Processes `Obstacle` + `Transform`
- Collision response (push entity away)
- Climbing detection (climbable poles)
- Jump impulse when climbing

#### RenderSystem
- Processes `Renderable` + `Transform`
- Syncs Three.js mesh positions
- Handles visibility toggling
- Real-time mesh updates

## Components (Data Storage)

```javascript
class Transform extends Component {
  x, y, z           // Position
  vx, vy, vz        // Velocity
  rotation          // Rotation angle
}

class Health extends Component {
  hp                // Current health
  maxHp             // Max health
  alive             // Alive flag
}

class Physics extends Component {
  mass              // Entity mass
  friction          // Friction coefficient (0.8-0.95)
  velocity          // Velocity vector
}

class Combat extends Component {
  damage            // Damage per attack
  armor             // Damage reduction
  attackSpeed       // Attacks per second
  lastAttack        // Last attack timestamp
}

class Renderable extends Component {
  mesh              // Three.js mesh
  visible           // Visibility flag
}

class Hazard extends Component {
  type              // 'fire', 'lava', 'drowning', etc
  damage            // Damage per second
  radius            // Collision radius
}

class Obstacle extends Component {
  type              // 'pole', 'platform', 'ramp', 'barrier'
  height            // Height (for rendering)
  climbable         // Can be climbed (bool)
}

class PlayerInput extends Component {
  moveDir           // { x, z } movement direction
  jumping           // Jump flag
  attacking         // Attack flag
}
```

## Game Loop

```javascript
const engine = new ColosseumGameEngine(THREE, scene);
engine.startGame();

function animate() {
  const deltaTime = clock.getDelta();
  engine.update(deltaTime);  // All systems update
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

## Creating Entities

### Player
```javascript
const playerId = engine.createPlayer(x, y, z, 'Player Name');
// Includes: Transform, Health, Physics, Combat, PlayerInput, Renderable
```

### Obstacle
```javascript
const poleId = engine.createObstacle(x, y, z, 'pole', height=5);
// Includes: Transform, Obstacle, Renderable
```

### Hazard
```javascript
const hazardId = engine.createHazard(x, y, z, 'fire', damage=15, radius=8);
// Includes: Transform, Hazard, Renderable
```

## Gameplay Actions

```javascript
// Movement
engine.movePlayer(playerId, { x: 1, z: 0 });

// Jumping
engine.jumpPlayer(playerId);

// Combat
const result = engine.attackPlayer(attacker, defender);
// Returns: { attacker, defender, damage, defenderHp, victory }

// Events
engine.logEvent('Event description');

// Status
const status = engine.getGameStatus();
```

## Performance Characteristics

- **Movement**: O(n) where n = entities with Transform
- **Combat**: O(1) per attack
- **Hazards**: O(m × n) where m = hazards, n = entities
- **Rendering**: O(n) where n = renderable entities

## Extending the Engine

### Add a New Component
```javascript
class Stamina extends Component {
  constructor(current = 100, max = 100) {
    super({ current, max });
  }
}
```

### Add a New System
```javascript
class StaminaSystem extends GameSystem {
  update(deltaTime) {
    const entities = this.entities.getEntitiesWithComponent(Stamina);
    
    for (const { id, entity } of entities) {
      const stamina = entity.components.Stamina;
      // Regen: +20 per second
      stamina.current = Math.min(stamina.max, stamina.current + 20 * deltaTime);
    }
  }
}

// Register in engine
engine.systems.push(new StaminaSystem(engine.entityManager));
```

### Add a New Game Feature
1. Define Components (data storage)
2. Create System class (logic)
3. Register system in engine
4. Expose action methods on engine (movePlayer, attackPlayer, etc.)

## Design Advantages Over Previous Version

| Aspect | Previous | ECS |
|--------|----------|-----|
| **Scalability** | Hard to add features | Easy: compose new components + system |
| **Performance** | Object iteration overhead | Data-locality optimized |
| **Testing** | Systems tightly coupled | Each system testable in isolation |
| **Debugging** | State spread across objects | Centralized component data |
| **Memory** | Fragmented (multiple objects) | Contiguous component arrays |
| **Code Reuse** | Inheritance hierarchies | Component composition |

## Terrain System Integration

Each terrain modifies system behavior:

```javascript
// Grass (1.0x speed, 1.0x jump)
// Water (0.7x speed, 0.8x jump, stamina drain)
// Fire (1.2x speed, 1.3x jump, burn damage)
// Ice (0.6x speed, 0.9x jump, slipping friction)
// Lava (1.1x speed, 1.5x jump, instant death zones)
// Void (1.3x speed, 1.1x jump, falling damage)
// Crystal (1.0x speed, 1.2x jump, bouncy friction)

// System reads terrain from gameState and adjusts:
// - Physics.friction
// - MovementSystem velocity multipliers
// - HazardSystem damage values
```

## Game Modes & Rules

Each game mode composes different obstacles and hazard zones:

```javascript
engine.startGame();  // Creates arena layout
// Includes: 4 poles, 2 hazard zones, 2 players

// Mid-game terrain switch
engine.gameState.terrain = 'lava';
// HazardSystem picks up new hazard radius
// MovementSystem applies new friction
```

## Example: Full Game Session

```javascript
const engine = new ColosseumGameEngine(THREE, scene);

// Setup
engine.startGame();

// Game loop
const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  
  // Player input (from keyboard)
  engine.movePlayer(engine.player1, { x: 1, z: 0 });
  
  // Update all systems
  engine.update(dt);
  
  // Check for end condition
  if (!engine.gameActive) {
    console.log('Winner:', engine.gameState.score);
  }
  
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// Later: cleanup
engine.endGame();
```

## Integration with Agents

Agents can:

```javascript
// NEXUS designs combat strategy
const result = engine.attackPlayer(agentA, agentB);

// ORACLE analyzes game state
const state = engine.getGameStatus();

// TURTLE choreographs obstacle placement
for (let i = 0; i < 8; i++) {
  engine.createObstacle(...positions[i], 'pole', heights[i]);
}

// PIKADON tests hazard effectiveness
engine.createHazard(x, y, z, 'fire', damage, radius);
```

---

**ECS Colosseum Ready for Production! 🎮⚔️**
