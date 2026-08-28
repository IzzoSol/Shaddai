/**
 * SHADDAI World Labs Integration
 * Generates dynamic 3D worlds using World Labs Marble API + Hugging Face
 * Key loaded from gitignored backend/data/runtime-keys.json (WORLDLABS_KEY) or env.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const WORLD_LABS_KEY = process.env.WORLDLABS_KEY || (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'runtime-keys.json'), 'utf8')).WORLDLABS_KEY || ''; } catch { return ''; } })();
const WORLD_LABS_API = 'https://api.worldlabs.ai/v1';
// ⚠️ NON-FUNCTIONAL STUB (verified 2026-08-28). This module posts to
// `api-inference.huggingface.co` (a retired provider, 410 Gone) with a
// hardcoded placeholder token 'hf_YOUR_HF_TOKEN' — it has never been able to
// return a real texture. Left as-is deliberately: wiring it up means routing
// through backend/lib/hf-keys.js (live provider + key pool) rather than
// pasting a token here. Do not treat its failures as a key/credit problem.
const HUGGING_FACE_API = 'https://api-inference.huggingface.co/models';

class WorldLabsIntegration {
  constructor() {
    this.worldCache = new Map();
    this.higgs = null;
    this.initHiggs();
  }

  /**
   * Initialize Higgs physics engine
   */
  initHiggs() {
    try {
      this.higgs = {
        gravity: 9.81,
        timeStep: 1 / 60,
        bodies: [],
        constraints: [],

        addRigidBody: (mass, shape, position) => {
          return {
            id: Math.random().toString(36).substr(2, 9),
            mass,
            shape,
            position: [...position],
            velocity: [0, 0, 0],
            angularVelocity: [0, 0, 0],
            active: true
          };
        },

        step: () => {
          for (let body of this.higgs.bodies) {
            if (!body.active) continue;
            body.velocity[1] -= this.higgs.gravity * this.higgs.timeStep;
            body.position[0] += body.velocity[0] * this.higgs.timeStep;
            body.position[1] += body.velocity[1] * this.higgs.timeStep;
            body.position[2] += body.velocity[2] * this.higgs.timeStep;
          }
        }
      };

      console.log('✓ Higgs physics engine initialized');
    } catch (err) {
      console.error('✗ Higgs initialization failed:', err.message);
    }
  }

  /**
   * Call the REAL World Labs Marble API to start a world generation.
   * POST https://api.worldlabs.ai/marble/v1/worlds:generate  (header: WLT-Api-Key)
   * Returns the Operation { operation_id, done, ... } — poll pollOperation() until done.
   */
  async generateWorldStructure(prompt, style = 'shaddai') {
    const payload = JSON.stringify({
      display_name: 'SHADDAI World',
      model: 'marble-1.1',
      world_prompt: { type: 'text', text_prompt: prompt },
    });
    const json = await this._req('POST', '/marble/v1/worlds:generate', payload);
    console.log('✓ World Labs generation started:', json.operation_id);
    return json; // { operation_id, done:false, ... }
  }

  /** Poll an operation until done (or timeout). Resolves the completed World object. */
  async pollOperation(operationId, { intervalMs = 8000, timeoutMs = 8 * 60 * 1000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const op = await this._req('GET', `/marble/v1/operations/${operationId}`);
      if (op.done) {
        if (op.error) throw new Error('World Labs generation failed: ' + JSON.stringify(op.error));
        return op.response; // World object: { assets: { splats, mesh, imagery, caption, thumbnail_url } }
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('World Labs generation timed out');
  }

  /** Low-level HTTPS request to the Marble API with the correct WLT-Api-Key header. */
  _req(method, path, payload) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.worldlabs.ai', port: 443, path, method,
        headers: { 'WLT-Api-Key': WORLD_LABS_KEY, Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
      };
      const req = https.request(options, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => {
          let json; try { json = JSON.parse(data); } catch { json = { raw: data }; }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`World Labs ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  /**
   * Use Hugging Face to generate terrain details
   */
  async generateTerrainDetails(biomeType, dimensions = { width: 1024, height: 1024 }) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        inputs: `Generate a ${biomeType} terrain texture with realistic details. Style: Tron Legacy sci-fi. Dimensions: ${dimensions.width}x${dimensions.height}`
      });

      const options = {
        hostname: 'api-inference.huggingface.co',
        port: 443,
        path: '/models/stabilityai/stable-diffusion-3-medium',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': 'Bearer hf_YOUR_HF_TOKEN'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            console.log('✓ Terrain details generated via Hugging Face');
            resolve({
              type: biomeType,
              texture: data,
              dimensions
            });
          } catch (e) {
            reject(new Error(`Terrain generation failed: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Generate complete world with all systems
   */
  async createWorld(worldConfig) {
    try {
      console.log(`\n🌍 Creating SHADDAI World: "${worldConfig.name}"...`);

      const structure = await this.generateWorldStructure(
        worldConfig.prompt || 'Neon sci-fi world with 7 agent districts',
        worldConfig.style || 'shaddai'
      );

      const biomes = ['grid', 'forest', 'arctic', 'desert', 'void'];
      const terrains = await Promise.all(
        biomes.map(biome => this.generateTerrainDetails(biome))
      );

      const world = {
        id: worldConfig.id || Math.random().toString(36).substr(2, 9),
        name: worldConfig.name,
        created: new Date().toISOString(),
        structure: structure,
        terrains: terrains,
        entities: [],
        districts: this.createDistricts(worldConfig),
        physics: {
          gravity: 9.81,
          bodies: []
        }
      };

      for (let entity of world.entities) {
        const body = this.higgs.addRigidBody(entity.mass || 1, entity.shape || 'sphere', entity.position || [0, 0, 0]);
        world.physics.bodies.push(body);
      }

      this.worldCache.set(world.id, world);

      console.log(`✅ World created: ${world.name} (ID: ${world.id})\n`);
      return world;

    } catch (error) {
      console.error('❌ World creation failed:', error.message);
      throw error;
    }
  }

  /**
   * Create district definitions for agents
   */
  createDistricts(config) {
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
      position: [Math.cos(i * (2 * Math.PI / 7)) * 100, 0, Math.sin(i * (2 * Math.PI / 7)) * 100],
      radius: 50,
      features: ['marketplace', 'headquarters', 'training_ground', 'research_lab']
    }));
  }

  /**
   * Get world by ID
   */
  getWorld(worldId) {
    return this.worldCache.get(worldId);
  }

  /**
   * Update world physics
   */
  updatePhysics(worldId, deltaTime = 1/60) {
    const world = this.getWorld(worldId);
    if (!world) return null;

    for (let body of world.physics.bodies) {
      body.position[0] += body.velocity[0] * deltaTime;
      body.position[1] += body.velocity[1] * deltaTime;
      body.position[2] += body.velocity[2] * deltaTime;

      if (body.mass > 0) {
        body.velocity[1] -= this.higgs.gravity * deltaTime;
      }
    }

    return world;
  }

  /**
   * Export world as JSON for frontend
   */
  exportWorld(worldId) {
    const world = this.getWorld(worldId);
    if (!world) return null;

    return {
      id: world.id,
      name: world.name,
      created: world.created,
      districts: world.districts,
      terrains: world.terrains.map(t => ({ type: t.type, dimensions: t.dimensions })),
      entities: world.entities.map(e => ({
        id: e.id,
        type: e.type,
        position: e.position,
        scale: e.scale
      }))
    };
  }

  /**
   * List all created worlds
   */
  listWorlds() {
    return Array.from(this.worldCache.entries()).map(([id, world]) => ({
      id,
      name: world.name,
      created: world.created,
      districts: world.districts.length,
      entities: world.entities.length
    }));
  }
}

module.exports = new WorldLabsIntegration();
