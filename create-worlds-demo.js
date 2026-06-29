#!/usr/bin/env node
/**
 * SHADDAI World Creation - Demo Mode
 * Simulates World Labs world generation (no external API calls)
 * Perfect for showing the system architecture and data structures
 */

class WorldLabsDemoEngine {
  constructor() {
    this.worlds = new Map();
    this.initHiggs();
  }

  initHiggs() {
    this.higgs = {
      gravity: 9.81,
      timeStep: 1 / 60,
      bodies: []
    };
  }

  createDistricts() {
    const agents = [
      { name: 'SHADDAI', color: '#ffad2e', role: 'Supreme Orchestrator' },
      { name: 'ZEROX', color: '#00ff88', role: 'Wealth Engine' },
      { name: 'ORACLE', color: '#9b59f5', role: 'Intelligence' },
      { name: 'NEXUS', color: '#00e5ff', role: 'Architecture' },
      { name: 'TURTLE', color: '#18cae6', role: 'Creative' },
      { name: 'QUILL', color: '#f0c8d8', role: 'Communication' },
      { name: 'PIKADON', color: '#ff4400', role: 'Security' }
    ];

    return agents.map((agent, i) => ({
      id: agent.name.toLowerCase(),
      name: agent.name,
      color: agent.color,
      role: agent.role,
      position: [
        Math.cos(i * (2 * Math.PI / 7)) * 100,
        0,
        Math.sin(i * (2 * Math.PI / 7)) * 100
      ],
      radius: 50,
      features: ['marketplace', 'headquarters', 'training_ground', 'research_lab'],
      agents_online: 1
    }));
  }

  createTerrains() {
    return [
      { type: 'grid', dimensions: { width: 1024, height: 1024 }, color: '#00e5ff' },
      { type: 'forest', dimensions: { width: 1024, height: 1024 }, color: '#00ff88' },
      { type: 'arctic', dimensions: { width: 1024, height: 1024 }, color: '#aaddff' },
      { type: 'desert', dimensions: { width: 1024, height: 1024 }, color: '#ff7a18' },
      { type: 'void', dimensions: { width: 1024, height: 1024 }, color: '#9b59f5' }
    ];
  }

  createWorld(config) {
    const world = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      name: config.name,
      prompt: config.prompt,
      style: config.style || 'shaddai',
      created: new Date().toISOString(),
      districts: this.createDistricts(),
      terrains: this.createTerrains(),
      entities: [],
      physics: {
        gravity: 9.81,
        bodies: []
      },
      stats: {
        size_mb: 2.5,
        poly_count: 125000,
        texture_resolution: '1024x1024',
        generation_time_ms: Math.random() * 3000 + 1000
      }
    };

    this.worlds.set(world.id, world);
    return world;
  }

  getWorld(id) {
    return this.worlds.get(id);
  }

  listWorlds() {
    return Array.from(this.worlds.values()).map(w => ({
      id: w.id,
      name: w.name,
      created: w.created,
      districts: w.districts.length,
      entities: w.entities.length
    }));
  }

  exportWorldForThreeJS(worldId) {
    const world = this.getWorld(worldId);
    if (!world) return null;

    return {
      id: world.id,
      name: world.name,
      districts: world.districts.map(d => ({
        id: d.id,
        name: d.name,
        color: d.color,
        position: d.position,
        radius: d.radius,
        agents_online: d.agents_online
      })),
      terrains: world.terrains.map(t => ({
        type: t.type,
        color: t.color
      })),
      gravity: world.physics.gravity
    };
  }
}

// Create demo engine
const engine = new WorldLabsDemoEngine();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  SHADDAI WORLD CREATION ENGINE — DEMO MODE                 ║');
console.log('║  (Simulated World Labs + Higgs Physics)                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const worldConfigs = [
  {
    name: 'SHADDAI Prime',
    prompt: 'A neon sci-fi civilization with 7 glowing agent district hubs. Tron Legacy aesthetic with gold accents and cyberpunk towers.'
  },
  {
    name: 'Grid City',
    prompt: 'A perfect geometric city built on data streams. Cyan neon grid lines create a perfect square layout of 7 agent districts.'
  },
  {
    name: 'Emerald Forest',
    prompt: 'A bioluminescent forest where 7 agent trees grow together. Glowing green vines mixed with organic architecture.'
  },
  {
    name: 'Void Harbor',
    prompt: 'A deep space station orbiting a black hole. 7 district domes connected by neon bridges with purple and magenta accents.'
  },
  {
    name: 'Diamond Citadel',
    prompt: 'An ultra-advanced AI fortress made of crystalline structures. 7 faceted towers in geometric harmony with white and gold neon.'
  }
];

const createdWorlds = [];

for (let i = 0; i < worldConfigs.length; i++) {
  const config = worldConfigs[i];
  console.log(`[${i + 1}/${worldConfigs.length}] Creating "${config.name}"...`);

  const world = engine.createWorld(config);
  createdWorlds.push(world);

  console.log(`  ✅ World created!`);
  console.log(`     ID: ${world.id}`);
  console.log(`     Size: ${world.stats.size_mb}MB | Polys: ${world.stats.poly_count}`);
  console.log(`     Generation: ${world.stats.generation_time_ms.toFixed(0)}ms`);
  console.log(`     Districts: ${world.districts.length}`);
  console.log(`     Terrains: ${world.terrains.length}`);
  console.log(`     Districts:`);

  for (const district of world.districts) {
    console.log(`       • ${district.name.padEnd(10)} (${district.color}) @ [${district.position.map(p => p.toFixed(1)).join(', ')}]`);
  }
  console.log('');
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  WORLD CREATION SUMMARY                                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const worlds = engine.listWorlds();
console.log(`📊 Total Worlds Created: ${worlds.length}\n`);

for (const w of worlds) {
  console.log(`  ${w.id} — ${w.name}`);
  console.log(`    Created: ${w.created}`);
  console.log(`    Districts: ${w.districts} | Entities: ${w.entities}`);
}

console.log('\n🌍 Sample World Export (for Three.js):\n');
const sampleWorld = engine.exportWorldForThreeJS(createdWorlds[0].id);
console.log(JSON.stringify(sampleWorld, null, 2));

console.log('\n✨ Demo Complete! All 5 worlds created successfully.\n');
console.log('💡 Next Steps:');
console.log('   1. Wire up REST API endpoints to return these worlds');
console.log('   2. Load WorldLabsClient in SHADDAI-WORLD-3D.html');
console.log('   3. Create UI buttons for "Create New World"');
console.log('   4. Render districts as Three.js cylinders with labels');
console.log('   5. Enable physics simulation for entities\n');

process.exit(0);
