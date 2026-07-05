/**
 * SHADDAI Worlds API Routes
 * Endpoints for creating, retrieving, and managing dynamic worlds
 */

const express = require('express');
const router = express.Router();
const worldLabs = require('../services/world-labs-integration');

/**
 * POST /api/worlds/create
 * Create a new world using World Labs API
 * Body: { name, prompt, style }
 */
router.post('/create', async (req, res) => {
  try {
    const { name, prompt, style } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'World name required' });
    }

    const world = await worldLabs.createWorld({
      name: name,
      prompt: prompt || `${name} - AI agent sovereign world`,
      style: style || 'shaddai'
    });

    res.json({
      success: true,
      world: worldLabs.exportWorld(world.id)
    });

  } catch (err) {
    console.error('World creation error:', err);
    res.status(500).json({
      error: 'Failed to create world',
      details: err.message
    });
  }
});

/**
 * GET /api/worlds/:id
 * Get world by ID
 */
router.get('/:id', (req, res) => {
  try {
    const world = worldLabs.getWorld(req.params.id);

    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json(worldLabs.exportWorld(world.id));

  } catch (err) {
    console.error('Retrieval error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/worlds
 * List all created worlds
 */
router.get('/', (req, res) => {
  try {
    const worlds = worldLabs.listWorlds();
    res.json({ worlds });
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/worlds/:id/physics
 * Update physics for world
 * Body: { deltaTime }
 */
router.post('/:id/physics', (req, res) => {
  try {
    const { deltaTime } = req.body;
    const world = worldLabs.updatePhysics(req.params.id, deltaTime || 1/60);

    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json({
      success: true,
      bodies: world.physics.bodies.map(b => ({
        id: b.id,
        position: b.position,
        velocity: b.velocity
      }))
    });

  } catch (err) {
    console.error('Physics update error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/worlds/:id/seed
 * Seed a world with specific entities
 * Body: { entities: [{ type, position, mass }] }
 */
router.post('/:id/seed', (req, res) => {
  try {
    const world = worldLabs.getWorld(req.params.id);

    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    const { entities } = req.body;

    for (let entity of entities || []) {
      const body = worldLabs.higgs.addRigidBody(
        entity.mass || 1,
        entity.shape || 'sphere',
        entity.position || [0, 0, 0]
      );
      world.physics.bodies.push(body);
      world.entities.push({
        id: body.id,
        ...entity
      });
    }

    res.json({
      success: true,
      entityCount: world.entities.length
    });

  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/worlds/:id/districts/visit
 * Visit a district in the world
 * Body: { districtId }
 */
router.post('/:id/districts/visit', (req, res) => {
  try {
    const world = worldLabs.getWorld(req.params.id);

    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    const { districtId } = req.body;
    const district = world.districts.find(d => d.id === districtId);

    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    res.json({
      district: {
        ...district,
        agents: [{
          name: district.name,
          role: district.role,
          color: district.color,
          status: 'online'
        }],
        features: district.features
      }
    });

  } catch (err) {
    console.error('Visit error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
