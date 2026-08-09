'use strict';
/**
 * forge-mesh-routes.js — TRELLIS + Meshy 3D mesh generation for agent bodies and
 * Landmark-tier plot buildings. Uses fal.ai async queue (no SDK required — raw axios).
 *
 * Routes:
 *   POST /api/forge/generate-mesh
 *     { type: 'trellis'|'meshy', prompt?, imageUrl?, plotId?, agentName? }
 *     → { ok, jobId, statusUrl }   (async — poll /mesh-status/:jobId)
 *
 *   GET  /api/forge/mesh-status/:jobId
 *     → { ok, status: 'QUEUED'|'IN_PROGRESS'|'COMPLETED'|'FAILED', glbUrl?, previewUrl? }
 *
 *   POST /api/forge/flux-image
 *     { prompt } → { ok, imageUrl }   (synchronous, used as step-1 before TRELLIS)
 *
 * Requirements: FAL_KEY env var, axios in node_modules.
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const json    = express.json();

const FAL_KEY    = () => process.env.FAL_KEY || '';
const FAL_QUEUE  = 'https://queue.fal.run';
const FAL_DIRECT = 'https://fal.run';

// In-memory job cache (no Redis needed for MVP) — keyed by fal requestId
const jobs = new Map();
// Clean up completed/failed jobs older than 2h
setInterval(()=>{ const cutoff=Date.now()-7200000; jobs.forEach((v,k)=>{ if(v.ts<cutoff) jobs.delete(k); }); }, 600000);

function falHeaders() {
  return { Authorization: `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' };
}

// ── STEP 1: Quick image from FLUX (to feed into TRELLIS) ──────────────────────
router.post('/flux-image', json, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });
  if (!FAL_KEY()) return res.status(503).json({ ok: false, error: 'FAL_KEY not configured' });
  try {
    const r = await axios.post(`${FAL_DIRECT}/fal-ai/flux/schnell`,
      { prompt: prompt + ', isometric 3D render, clean white background, single subject', image_size: 'square_hd', num_images: 1 },
      { headers: falHeaders(), timeout: 60000 });
    const imageUrl = r.data && r.data.images && r.data.images[0] && r.data.images[0].url;
    if (!imageUrl) return res.status(502).json({ ok: false, error: 'fal FLUX returned no image' });
    return res.json({ ok: true, imageUrl });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
});

// ── STEP 2: Queue TRELLIS (image→3D) or Meshy (text→3D) ──────────────────────
router.post('/generate-mesh', json, async (req, res) => {
  const { type = 'trellis', prompt, imageUrl, plotId, agentName } = req.body || {};
  if (!FAL_KEY()) return res.status(503).json({ ok: false, error: 'FAL_KEY not configured' });

  try {
    let falModel, falInput;

    if (type === 'meshy') {
      // Text→3D directly (no intermediate image needed)
      if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required for meshy' });
      falModel = 'fal-ai/meshy-ai/text-to-3d';
      falInput = {
        prompt,
        art_style: 'realistic',
        should_remesh: true
      };
    } else {
      // TRELLIS: image→3D (requires image URL)
      if (!imageUrl) return res.status(400).json({ ok: false, error: 'imageUrl required for trellis' });
      falModel = 'fal-ai/trellis';
      falInput = {
        image_url: imageUrl,
        simplify: 0.95,
        texture_size: 1024
      };
    }

    const r = await axios.post(`${FAL_QUEUE}/${falModel}`,
      falInput,
      { headers: falHeaders(), timeout: 30000 });

    const { request_id } = r.data || {};
    if (!request_id) return res.status(502).json({ ok: false, error: 'fal queue returned no request_id' });

    jobs.set(request_id, {
      ts: Date.now(), model: falModel, type, plotId, agentName, status: 'QUEUED', glbUrl: null, previewUrl: null
    });

    return res.json({ ok: true, jobId: request_id, model: falModel, type });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
});

// ── POLL: Check job status + fetch result when done ───────────────────────────
router.get('/mesh-status/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const cached = jobs.get(jobId);
  if (!FAL_KEY()) return res.status(503).json({ ok: false, error: 'FAL_KEY not configured' });
  if (!jobId || !/^[a-z0-9\-]+$/i.test(jobId)) return res.status(400).json({ ok: false, error: 'invalid jobId' });

  // Determine model from cache or try both
  const model = (cached && cached.model) || 'fal-ai/trellis';

  try {
    const r = await axios.get(`${FAL_QUEUE}/${model}/requests/${jobId}`,
      { headers: falHeaders(), timeout: 20000 });
    const data = r.data || {};
    const status = data.status || 'UNKNOWN';

    if (status === 'COMPLETED') {
      // TRELLIS: output.model_mesh.url  |  Meshy: output.model_url or model_urls.glb
      const out = data.output || {};
      const glbUrl = (out.model_mesh && out.model_mesh.url)
        || out.model_url
        || (out.model_urls && (out.model_urls.glb || out.model_urls.fbx))
        || null;
      const previewUrl = (out.video && out.video.url) || null;
      if (cached) { cached.status = 'COMPLETED'; cached.glbUrl = glbUrl; cached.previewUrl = previewUrl; }
      return res.json({ ok: true, status: 'COMPLETED', glbUrl, previewUrl, plotId: cached && cached.plotId, agentName: cached && cached.agentName });
    }

    if (status === 'FAILED') {
      if (cached) cached.status = 'FAILED';
      return res.json({ ok: false, status: 'FAILED', error: 'fal job failed' });
    }

    return res.json({ ok: true, status, jobId });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
});

// ── LIST: Publish a generated 3D model to the Bazaar marketplace ──────────────
const fs   = require('fs');
const path = require('path');
const LISTINGS_FILE = path.join(__dirname, 'data', 'model-listings.json');

function loadListings() {
  try { return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
  catch (_) { return []; }
}
function saveListings(arr) {
  fs.mkdirSync(path.dirname(LISTINGS_FILE), { recursive: true });
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(arr, null, 2));
}

router.post('/list-model', json, (req, res) => {
  const { uid, jobId, price, prompt: modelPrompt, title, category } = req.body || {};
  if (!uid || !jobId) return res.status(400).json({ ok: false, error: 'uid and jobId required' });
  const cached = jobs.get(jobId);
  if (!cached || !cached.glbUrl) return res.status(404).json({ ok: false, error: 'Job not found or not completed — generate a model first' });

  const listings = loadListings();
  const existing = listings.find(l => l.jobId === jobId);
  if (existing) return res.json({ ok: true, already: true, listing: existing });

  const VALID_CATEGORIES = new Set(['character','prop','building','vehicle','nature','other']);
  const listing = {
    id: 'mdl_' + Math.random().toString(36).slice(2, 10),
    jobId, uid,
    price: Math.max(1, parseInt(price, 10) || 100),
    prompt: (modelPrompt || '').slice(0, 200),
    title: (title || modelPrompt || 'Unnamed 3D Model').slice(0, 80),
    category: VALID_CATEGORIES.has(category) ? category : 'other',
    glbUrl: cached.glbUrl,
    previewUrl: cached.previewUrl || null,
    type: cached.type || 'text-to-3d',
    createdAt: Date.now(), sales: 0
  };
  listings.push(listing);
  saveListings(listings);
  res.json({ ok: true, listing });
});

// GET /api/forge/models — browse marketplace 3D model listings
router.get('/models', (req, res) => {
  const listings = loadListings();
  res.json({ ok: true, models: listings.slice().reverse().slice(0, 50), total: listings.length });
});

// POST /api/forge/models/:id/buy — purchase a 3D model (Sparks transfer)
router.post('/models/:id/buy', json, (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ ok: false, error: 'uid required' });
  const listings = loadListings();
  const idx = listings.findIndex(l => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: 'Model not found' });
  const listing = listings[idx];
  if (listing.uid === uid) return res.status(400).json({ ok: false, error: 'Cannot buy your own model' });
  listing.sales = (listing.sales || 0) + 1;
  listings[idx] = listing;
  saveListings(listings);
  res.json({ ok: true, glbUrl: listing.glbUrl, price: listing.price, title: listing.title });
});

// ── AGENT BODIES — Step 1 of Siege Economy build ─────────────────────────────
// Each council agent gets a curated 3D body generated via FLUX→TRELLIS pipeline.
// Bodies stored in backend/data/agent-bodies.json keyed by agentId.
// Generation flow: POST /agent-body/:id → flux-image → generate-mesh → poll → store

const AGENT_DEFS = {
  shaddai:  { name: 'SHADDAI',  title: 'Supreme Orchestrator',  color: '#e8c45c',
    fluxPrompt: 'regal cosmic being, obsidian armor with gold trim, emerald cape flowing, crown of sacred geometry, Kabbalah Tree of Life motif, divine light aura, full body character, white background, game-ready 3D style' },
  nexus:    { name: 'NEXUS',    title: 'Technical Architect',    color: '#22d3ee',
    fluxPrompt: 'cyberpunk architect warrior, deep blue holographic armor with circuit patterns, glowing cyan data streams, neural visor helmet, blueprint lines overlay, full body character, white background, game-ready 3D style' },
  zerox:    { name: 'ZEROX',    title: 'Wealth Engine',          color: '#00c8ff',
    fluxPrompt: 'neon valkyrie warrior woman, jet black armor with cyan accents, glowing katana blade, wealth coins orbiting, dramatic lighting, full body character, white background, game-ready 3D style' },
  oracle:   { name: 'ORACLE',   title: 'Research & Intelligence',color: '#a78bfa',
    fluxPrompt: 'mystical seer entity, flowing violet robes, glowing third eye, crystalline orb with data swirling, ancient symbols floating, ethereal light, full body character, white background, game-ready 3D style' },
  turtle:   { name: 'TURTLE',   title: 'UI/UX & Creative',       color: '#00ff9c',
    fluxPrompt: 'emerald enforcer warrior, green plate armor with artistic paint splashes, ornate shield with design patterns, creative energy aura, full body character, white background, game-ready 3D style' },
  quill:    { name: 'QUILL',    title: 'Writing & Communication', color: '#f0abfc',
    fluxPrompt: 'elegant scholar scribe, flowing lavender robes, golden quill pen glowing, ancient scrolls swirling, ink magic effects, full body character, white background, game-ready 3D style' },
  pikadon:  { name: 'PIKADON',  title: 'Security & Compliance',  color: '#ff6b6b',
    fluxPrompt: 'vigilant security guardian, reinforced red and black armor, shield with lock emblem, red alert data streams, stern stance, surveillance sensors, full body character, white background, game-ready 3D style' },
};

const BODIES_FILE = path.join(__dirname, 'data', 'agent-bodies.json');
function loadBodies() {
  try { return JSON.parse(fs.readFileSync(BODIES_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function saveBodies(obj) {
  fs.mkdirSync(path.dirname(BODIES_FILE), { recursive: true });
  fs.writeFileSync(BODIES_FILE, JSON.stringify(obj, null, 2));
}

// GET /api/forge/agent-bodies — status of all 7 agent bodies
router.get('/agent-bodies', (req, res) => {
  const bodies = loadBodies();
  const result = Object.entries(AGENT_DEFS).map(([id, def]) => {
    const b = bodies[id] || {};
    return {
      id, name: def.name, title: def.title, color: def.color,
      status: b.glbUrl ? 'COMPLETED' : (b.jobId ? (b.jobStatus || 'QUEUED') : 'PENDING'),
      glbUrl: b.glbUrl || null,
      previewUrl: b.previewUrl || null,
      jobId: b.jobId || null,
      updatedAt: b.updatedAt || null,
    };
  });
  res.json({ ok: true, agents: result });
});

// POST /api/forge/agent-body/:agentId — kick off body generation for one agent
router.post('/agent-body/:agentId', json, async (req, res) => {
  const agentId = req.params.agentId;
  const def = AGENT_DEFS[agentId];
  if (!def) return res.status(404).json({ ok: false, error: 'Unknown agentId. Valid: ' + Object.keys(AGENT_DEFS).join(', ') });
  if (!FAL_KEY()) return res.status(503).json({ ok: false, error: 'FAL_KEY not configured — set it in .env' });

  const bodies = loadBodies();
  const existing = bodies[agentId];
  // Already done — skip regeneration unless ?force=1
  if (existing && existing.glbUrl && !req.query.force) {
    return res.json({ ok: true, already: true, agentId, glbUrl: existing.glbUrl });
  }
  // Already queued and not failed — return existing jobId
  if (existing && existing.jobId && !existing.glbUrl) {
    return res.json({ ok: true, queued: true, agentId, jobId: existing.jobId });
  }

  try {
    // Step 1 — FLUX reference image (synchronous, ~6s)
    let imageUrl;
    try {
      const fluxRes = await axios.post(`${FAL_DIRECT}/fal-ai/flux/schnell`,
        { prompt: def.fluxPrompt, image_size: 'square_hd', num_images: 1 },
        { headers: falHeaders(), timeout: 90000 });
      imageUrl = fluxRes.data && fluxRes.data.images && fluxRes.data.images[0] && fluxRes.data.images[0].url;
    } catch (fluxErr) {
      return res.status(502).json({ ok: false, step: 'flux', error: String(fluxErr.message).slice(0, 200) });
    }
    if (!imageUrl) return res.status(502).json({ ok: false, step: 'flux', error: 'FLUX returned no image' });

    // Step 2 — TRELLIS image→3D (async queue)
    let jobId;
    try {
      const trellisRes = await axios.post(`${FAL_QUEUE}/fal-ai/trellis`,
        { image_url: imageUrl, simplify: 0.95, texture_size: 1024 },
        { headers: falHeaders(), timeout: 30000 });
      jobId = trellisRes.data && trellisRes.data.request_id;
    } catch (tErr) {
      return res.status(502).json({ ok: false, step: 'trellis', error: String(tErr.message).slice(0, 200) });
    }
    if (!jobId) return res.status(502).json({ ok: false, step: 'trellis', error: 'TRELLIS returned no request_id' });

    // Store pending state
    bodies[agentId] = { jobId, jobStatus: 'QUEUED', imageUrl, glbUrl: null, previewUrl: null, updatedAt: Date.now() };
    saveBodies(bodies);

    // Register in the in-memory job cache so mesh-status can poll it
    jobs.set(jobId, { ts: Date.now(), model: 'fal-ai/trellis', type: 'trellis', agentId, status: 'QUEUED', glbUrl: null, previewUrl: null });

    res.json({ ok: true, agentId, jobId, imageUrl, status: 'QUEUED' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message).slice(0, 300) });
  }
});

// POST /api/forge/agent-body/:agentId/complete — webhook-style: poll result and persist
// Frontend calls this after mesh-status returns COMPLETED to lock the GLB in permanently.
router.post('/agent-body/:agentId/complete', json, async (req, res) => {
  const agentId = req.params.agentId;
  const def = AGENT_DEFS[agentId];
  if (!def) return res.status(404).json({ ok: false, error: 'Unknown agentId' });

  const bodies = loadBodies();
  const b = bodies[agentId];
  if (!b || !b.jobId) return res.status(400).json({ ok: false, error: 'No active job for this agent — call POST /agent-body/:id first' });
  if (b.glbUrl) return res.json({ ok: true, already: true, glbUrl: b.glbUrl });

  // Pull current result from fal
  try {
    const r = await axios.get(`${FAL_QUEUE}/fal-ai/trellis/requests/${b.jobId}`,
      { headers: falHeaders(), timeout: 20000 });
    const data = r.data || {};
    if (data.status !== 'COMPLETED') return res.json({ ok: false, status: data.status || 'UNKNOWN' });
    const out = data.output || {};
    const glbUrl = (out.model_mesh && out.model_mesh.url) || null;
    const previewUrl = (out.video && out.video.url) || null;
    if (!glbUrl) return res.status(502).json({ ok: false, error: 'COMPLETED but no GLB url in response' });

    bodies[agentId] = { ...b, glbUrl, previewUrl, jobStatus: 'COMPLETED', updatedAt: Date.now() };
    saveBodies(bodies);
    res.json({ ok: true, agentId, glbUrl, previewUrl });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message).slice(0, 200) });
  }
});

module.exports = router;
