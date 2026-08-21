/**
 * AGENT BODY ROUTES — 3D Body Generation & Customization
 *
 * Routes:
 *   POST   /agent/:id/body/generate   — start 3D body generation via Meshy
 *   GET    /agent/:id/body            — get body status + URL
 *   GET    /agent/:id/body.glb        — stream GLB file
 *   PUT    /agent/:id/body            — update customizations
 */
'use strict';

const express = require('express');
const router = express.Router();
const meshyService = require('./meshy-service');

/**
 * POST /agent/:id/body/generate
 * Start generating a 3D body for an agent
 *
 * body: {
 *   style: 'humanoid' | 'creature' | 'mech' | 'abstract'
 *   name: 'Agent NEXUS'
 *   description: (optional, overrides auto-prompt)
 *   colors: ['#27e0ff', '#c08cff']
 *   features: ['cybernetic', 'ethereal', 'glowing']
 * }
 *
 * Returns: { status, jobId, glbUrl, message, estimatedTime }
 */
router.post('/agent/:id/body/generate', async (req, res) => {
  try {
    const agentId = req.params.id;
    const options = req.body;

    const result = await meshyService.generateBody(agentId, options);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[agent-body] POST generate error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /agent/:id/body
 * Get status of agent's 3D body (or generate if missing)
 *
 * query: {
 *   autoGenerate: true  — if not found, auto-generate with defaults
 * }
 *
 * Returns: { status, jobId, glbUrl, customizations, estimatedTime }
 */
router.get('/agent/:id/body', async (req, res) => {
  try {
    const agentId = req.params.id;
    const { autoGenerate } = req.query;

    let result = await meshyService.getBodyStatus(agentId);

    if (result.status === 'not_found' && autoGenerate === 'true') {
      // Auto-generate with sensible defaults
      result = await meshyService.generateBody(agentId, {
        name: agentId,
        style: 'humanoid',
        features: ['neon', 'cybernetic']
      });
    }

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[agent-body] GET status error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /agent/:id/body.glb
 * Stream GLB file (3D model)
 *
 * Content-Type: model/gltf-binary
 */
router.get('/agent/:id/body.glb', (req, res) => {
  try {
    const agentId = req.params.id;
    const glbBuffer = meshyService.getBodyGLB(agentId);

    if (!glbBuffer) {
      return res.status(404).json({ ok: false, error: 'GLB file not found' });
    }

    res.header('Content-Type', 'model/gltf-binary');
    res.header('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    res.send(glbBuffer);
  } catch (e) {
    console.error('[agent-body] GET .glb error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * PUT /agent/:id/body
 * Update body customizations (triggers re-generation)
 *
 * body: {
 *   colors: ['#27e0ff', '#ffcf4a']
 *   features: ['neon', 'ethereal']
 *   style: 'mech'
 * }
 */
router.put('/agent/:id/body', async (req, res) => {
  try {
    const agentId = req.params.id;
    const options = req.body;

    // Re-generate with new customizations
    const result = await meshyService.generateBody(agentId, options);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[agent-body] PUT update error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
