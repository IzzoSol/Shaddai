# SHADDAI World Labs Integration Guide

**Date:** June 25, 2026  
**Status:** Ready for Implementation  
**World Labs Key:** `IdcaJyxG1kX8sHlvvwyskrHUq1CBnyFe`

---

## Overview

SHADDAI World now supports **dynamic world generation** using three integrated APIs:

1. **World Labs API** — Generates 3D world structure and environment
2. **Higgs Physics Engine** — Simulates gravity, rigid bodies, and collisions
3. **Hugging Face APIs** — Generates terrain textures and environmental details

This creates infinite, unique SHADDAI worlds on demand, each with procedurally generated districts, physics-enabled entities, and AI agent interactions.

---

## Architecture

```
Frontend (SHADDAI-WORLD-3D.html)
  ├── WorldLabsClient (public/js/world-labs-client.js)
  │   ├── Create worlds
  │   ├── Manage districts
  │   └── Render Three.js visualization
  │
Backend (Node.js)
  ├── /api/worlds/* routes (backend/routes/worlds-api.js)
  │   ├── POST /create — Create world
  │   ├── GET /:id — Fetch world
  │   ├── GET / — List worlds
  │   └── POST /:id/physics — Update physics
  │
Services
  ├── WorldLabsIntegration (backend/services/world-labs-integration.js)
  │   ├── World Labs API calls
  │   ├── Higgs physics engine
  │   ├── Hugging Face texture generation
  │   └── World caching & management
```

---

## Setup

### 1. Add Worlds API Route to Server

In `server-production.js` or your Express app:

```javascript
const worldsApiRoutes = require('./backend/routes/worlds-api');
app.use('/api/worlds', worldsApiRoutes);
```

### 2. Load World Labs Client in Frontend

In `SHADDAI-WORLD-3D.html`, add before your main script:

```html
<script src="/js/world-labs-client.js"></script>
```

### 3. Initialize World Creation

In your world initialization code:

```javascript
// Create a new world
const worldLabs = new WorldLabsClient();

const myWorld = await worldLabs.createWorld({
  name: 'SHADDAI Prime',
  prompt: 'A neon city with 7 district hubs for AI agents',
  style: 'shaddai'
});

// Render it in Three.js
const { scene, camera, renderer } = await worldLabs.createThreeScene(
  document.getElementById('world-container')
);

// Enable physics
worldLabs.enablePhysics((bodies) => {
  console.log('Physics update:', bodies.length, 'bodies');
});
```

---

## API Reference

### WorldLabsClient Methods

#### `createWorld(config)`
Create a new world.

**Parameters:**
- `config.name` (string) — World name
- `config.prompt` (string, optional) — World generation prompt
- `config.style` (string, optional) — Style: 'shaddai', 'cyberpunk', 'solarpunk'

**Returns:** World object with id, name, districts, terrains

**Example:**
```javascript
const world = await worldLabs.createWorld({
  name: 'Grid City',
  prompt: 'Cybernetic grid city with cyan accents',
  style: 'shaddai'
});
```

---

#### `getWorld(worldId)`
Fetch a world by ID.

**Returns:** World object

---

#### `listWorlds()`
Get all created worlds.

**Returns:** Array of world summaries

---

#### `enablePhysics(updateFn)`
Start physics simulation loop.

**Parameters:**
- `updateFn` (function, optional) — Callback with physics bodies

---

#### `disablePhysics()`
Stop physics simulation.

---

#### `seedEntities(entities)`
Add entities to the world.

**Parameters:**
- `entities` (array) — Array of entity configs: `{ type, position, mass, shape }`

---

#### `visitDistrict(districtId)`
Visit a specific district.

**Parameters:**
- `districtId` (string) — District ID

**Returns:** District object with agents and features

---

#### `getDistricts()`
Get all districts in current world.

**Returns:** Array of district objects

---

#### `createThreeScene(containerElement)`
Create a Three.js visualization of the world.

**Returns:** `{ scene, camera, renderer }`

---

## World Structure

### World Object

```javascript
{
  id: "abc123",
  name: "SHADDAI Prime",
  created: "2026-06-25T10:30:00Z",
  districts: [
    {
      id: "shaddai",
      name: "SHADDAI",
      color: "#ffad2e",
      role: "Supreme Orchestrator",
      position: [0, 0, 0],
      radius: 50,
      features: ["marketplace", "headquarters", "training_ground", "research_lab"]
    },
    // ... 6 more agent districts (ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON)
  ],
  terrains: [
    { type: "grid", dimensions: { width: 1024, height: 1024 } },
    { type: "forest", ... },
    { type: "arctic", ... },
    { type: "desert", ... },
    { type: "void", ... }
  ],
  entities: [],
  physics: {
    gravity: 9.81,
    bodies: []
  }
}
```

---

## Districts

Each world has **7 districts**, one per agent:

| ID | Name | Color | Role |
|---|---|---|---|
| shaddai | SHADDAI | #ffad2e | Supreme Orchestrator |
| zerox | ZEROX | #00ff88 | Wealth Engine |
| oracle | ORACLE | #9b59f5 | Intelligence |
| nexus | NEXUS | #00e5ff | Architecture |
| turtle | TURTLE | #18cae6 | Creative |
| quill | QUILL | #f0c8d8 | Communication |
| pikadon | PIKADON | #ff4400 | Security |

Each district has:
- **Position:** Circular arrangement around world center (100 unit radius)
- **Radius:** 50 units
- **Features:** marketplace, headquarters, training_ground, research_lab

---

## Physics Engine (Higgs)

The integrated Higgs physics engine provides:

- **Gravity:** 9.81 m/s² (Earth-standard)
- **Timestep:** 1/60 (60 FPS)
- **Rigid Bodies:** Mass, velocity, position, angular velocity
- **Constraints:** Collisions, constraints (future expansion)

### Seeding Physics

```javascript
await worldLabs.seedEntities([
  {
    type: 'npc_agent',
    position: [10, 5, 10],
    mass: 1,
    shape: 'capsule'
  },
  {
    type: 'collectible',
    position: [20, 0, 15],
    mass: 0,
    shape: 'sphere'
  }
]);
```

### Custom Physics Updates

```javascript
worldLabs.enablePhysics((bodies) => {
  // bodies = array of { id, position, velocity }
  for (let body of bodies) {
    // Update your Three.js meshes:
    const mesh = scene.getObjectByName(body.id);
    if (mesh) {
      mesh.position.set(...body.position);
    }
  }
});
```

---

## Hugging Face Integration

Terrain textures are generated using Hugging Face's text-to-image models:

- **Model:** Stable Diffusion 3 Medium
- **Output:** 1024×1024 PNG textures per biome
- **Biomes:** Grid, Forest, Arctic, Desert, Void

Currently configured for Stable Diffusion. To use custom Hugging Face models:

```javascript
// In world-labs-integration.js
const HF_TOKEN = process.env.HF_API_TOKEN;
// Replace in headers: Authorization: `Bearer ${HF_TOKEN}`
```

---

## Example: Complete World Creation Flow

```javascript
// 1. Initialize client
const worldLabs = new WorldLabsClient();

// 2. Create world
const world = await worldLabs.createWorld({
  name: 'SHADDAI Alpha',
  prompt: 'Neon sci-fi civilization with 7 agent districts and 5 terraformed biomes'
});

console.log('Created world:', world.id);

// 3. Fetch and display districts
const districts = worldLabs.getDistricts();
for (let district of districts) {
  console.log(`${district.name} (${district.color}) at ${district.position}`);
}

// 4. Create Three.js scene
const threeScene = await worldLabs.createThreeScene(
  document.getElementById('world-viewport')
);

// 5. Seed some entities
await worldLabs.seedEntities([
  {
    type: 'player',
    position: [0, 10, 0],
    mass: 1
  },
  {
    type: 'npc',
    position: [50, 5, 0],
    mass: 1
  }
]);

// 6. Enable physics
worldLabs.enablePhysics((bodies) => {
  // Update entity positions based on physics
  for (let body of bodies) {
    const obj = threeScene.scene.getObjectByName(body.id);
    if (obj) obj.position.set(...body.position);
  }
});

// 7. Allow district visits
document.addEventListener('click', async (e) => {
  if (e.target.dataset.districtId) {
    const district = await worldLabs.visitDistrict(e.target.dataset.districtId);
    console.log('Entered:', district.name, 'with agents:', district.agents);
  }
});
```

---

## Error Handling

```javascript
try {
  const world = await worldLabs.createWorld({
    name: 'Test World'
  });
} catch (error) {
  console.error('World creation failed:', error.message);
  // Fallback to procedural world or error UI
}

try {
  await worldLabs.seedEntities([...]);
} catch (error) {
  console.error('Could not seed entities:', error);
  // Continue without physics objects
}
```

---

## Performance Optimization

### Caching
Worlds are cached in memory on the backend:
```javascript
this.worldCache = new Map(); // Stores generated worlds
```

### Physics Throttling
Physics updates run at 60 FPS by default. To reduce: `enablePhysics()` with custom delta time.

### Asset Streaming
Terrain textures are downloaded on-demand. Consider pre-loading:
```javascript
const preloadWorld = async (worldId) => {
  const world = await worldLabs.getWorld(worldId);
  // Pre-load textures
  for (let terrain of world.terrains) {
    const img = new Image();
    img.src = `/textures/${terrain.type}.png`;
  }
};
```

---

## Future Enhancements

1. **Persistent Worlds** — Save worlds to database
2. **Multiplayer** — Real-time world sync across clients
3. **Advanced Physics** — Cloth simulation, fluid dynamics
4. **Custom Models** — User-created world structures via Blender
5. **World Forking** — Create variants of existing worlds
6. **Dynamic Districts** — Districts change based on game events

---

## Troubleshooting

### World creation times out
- Check network connection
- Verify World Labs API key is valid
- Check server logs for API errors

### Physics objects fall through ground
- Ensure ground collider is set up in Three.js
- Verify physics bodies have mass > 0
- Check collision layer configuration

### Textures not loading
- Verify Hugging Face API token is set
- Check texture output paths
- Ensure CORS headers are correct

### Memory leaks
- Call `disablePhysics()` when unloading worlds
- Clear world cache: `worldLabs.worldCache.clear()`
- Cancel animation frames in cleanup

---

## References

- World Labs API: https://api.worldlabs.ai/docs
- Higgs Physics: https://github.com/higgs-boson/higgs-physics
- Hugging Face API: https://huggingface.co/docs/api-inference
- Three.js Documentation: https://threejs.org/docs/

---

**End of Integration Guide**
