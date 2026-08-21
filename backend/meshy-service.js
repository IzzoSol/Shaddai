/**
 * MESHY SERVICE — 3D Model Generation for Agent Bodies
 *
 * Generates GLB 3D models for agents via Meshy API.
 * Meshy uses AI to create 3D models from text descriptions.
 *
 * API: https://www.meshy.ai/api
 * Async job-based: POST request → poll for completion → download GLB
 *
 * Caches generated models locally so we don't re-generate.
 */
'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MESHY_API_BASE = 'https://api.meshy.ai/v2';
const MESHY_API_KEY = process.env.MESHY_API_KEY;

const BODIES_DIR = path.join(__dirname, 'data', 'agent-bodies');
const BODIES_META_FILE = path.join(BODIES_DIR, 'bodies.json');

// Ensure directories exist
if (!fs.existsSync(BODIES_DIR)) fs.mkdirSync(BODIES_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════════

class MeshyService {
  constructor() {
    this.apiKey = MESHY_API_KEY;
    this.pollInterval = 2000; // ms between status checks
    this.pollMaxAttempts = 60; // max 2 minutes
  }

  /**
   * Generate a 3D model for an agent
   *
   * @param {string} agentId - Agent ID (e.g., 'agent-nexus')
   * @param {object} options - Customization options
   *   - style: 'humanoid' | 'creature' | 'mech' | 'abstract'
   *   - name: Agent name for context
   *   - description: Custom text description
   *   - colors: array of hex colors for palette
   *   - features: array of feature keywords (e.g., 'cybernetic', 'ethereal')
   *
   * @returns {object} { status, jobId, glbUrl, message }
   */
  async generateBody(agentId, options = {}) {
    if (!this.apiKey) {
      console.warn('[meshy] MESHY_API_KEY not set; returning mock URL');
      return this._mockGenerate(agentId, options);
    }

    try {
      // Build prompt from options
      const prompt = this._buildPrompt(agentId, options);

      // 1. Submit job to Meshy
      console.log(`[meshy] Generating 3D body for ${agentId}...`);
      const jobId = await this._submitJob(prompt, options);
      console.log(`[meshy] Job ${jobId} submitted`);

      // 2. Poll for completion (async, but return immediately with job ID)
      this._pollJobAsync(jobId, agentId, options);

      // 3. Return immediate response with job ID (user polls /api/agent/:id/body)
      return {
        status: 'generating',
        jobId,
        glbUrl: null,
        message: `Generating 3D body for ${agentId}... Check back in 30-60s`,
        estimatedTime: '30-60 seconds'
      };
    } catch (e) {
      console.error('[meshy] generateBody failed:', e.message);
      return {
        status: 'error',
        error: e.message,
        glbUrl: null
      };
    }
  }

  /**
   * Get the status of a generation job
   *
   * @param {string} agentId - Agent ID
   * @returns {object} { status, jobId, glbUrl, ... }
   */
  async getBodyStatus(agentId) {
    const meta = this._readMeta();
    const body = meta[agentId];

    if (!body) {
      return { status: 'not_found', agentId };
    }

    if (body.status === 'ready') {
      return {
        status: 'ready',
        agentId,
        jobId: body.jobId,
        glbUrl: body.glbUrl,
        glbPath: body.glbPath,
        customizations: body.customizations
      };
    }

    if (body.status === 'generating') {
      // Poll Meshy for update
      const jobStatus = await this._checkJobStatus(body.jobId);
      if (jobStatus.status === 'completed') {
        // Job is done; download GLB
        const glbPath = path.join(BODIES_DIR, `${agentId}.glb`);
        try {
          await this._downloadGLB(jobStatus.modelUrl, glbPath);
          body.status = 'ready';
          body.glbUrl = `/api/agent/${agentId}/body.glb`;
          body.glbPath = glbPath;
          this._saveMeta(meta);
          return { status: 'ready', agentId, jobId: body.jobId, glbUrl: body.glbUrl };
        } catch (e) {
          console.error('[meshy] GLB download failed:', e.message);
          return { status: 'download_failed', error: e.message };
        }
      }

      // Still generating
      return { status: 'generating', agentId, jobId: body.jobId };
    }

    return { status: body.status, agentId, error: body.error };
  }

  /**
   * Get cached body or fallback URL
   *
   * @param {string} agentId - Agent ID
   * @returns {string} URL to GLB file
   */
  getBodyUrl(agentId) {
    const meta = this._readMeta();
    const body = meta[agentId];
    if (body?.glbUrl) return body.glbUrl;
    return `/api/assets/agent-default-body.glb`; // fallback
  }

  /**
   * Stream a cached GLB file
   *
   * @param {string} agentId - Agent ID
   * @returns {Buffer|null}
   */
  getBodyGLB(agentId) {
    const meta = this._readMeta();
    const body = meta[agentId];
    if (!body?.glbPath || !fs.existsSync(body.glbPath)) return null;
    return fs.readFileSync(body.glbPath);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  _buildPrompt(agentId, options) {
    const { name, description, style, features, colors } = options;
    const features_str = Array.isArray(features) ? features.join(', ') : '';
    const colors_str = Array.isArray(colors) ? colors.map(c => c.replace('#', '')).join(', ') : '';

    if (description) return description;

    // Auto-build prompt
    let prompt = `3D model of ${name || agentId}`;
    if (style) prompt += `, ${style} style`;
    if (features_str) prompt += `, with ${features_str}`;
    if (colors_str) prompt += `, color palette: ${colors_str}`;
    prompt += '. Professional 3D asset, high quality, detailed, suitable for game/metaverse.';

    return prompt;
  }

  async _submitJob(prompt, options) {
    const { style = 'humanoid' } = options;

    const payload = {
      mode: 'generate', // or 'refine'
      prompt,
      art_style: style, // humanoid, creature, mech, abstract, etc.
      enable_pbr: true,
      texture_richness: 'high'
    };

    try {
      const response = await axios.post(`${MESHY_API_BASE}/text-to-3d`, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.result.id; // Job ID
    } catch (e) {
      console.error('[meshy] _submitJob error:', e.message);
      throw new Error(`Meshy API error: ${e.response?.data?.error || e.message}`);
    }
  }

  async _checkJobStatus(jobId) {
    try {
      const response = await axios.get(`${MESHY_API_BASE}/text-to-3d/${jobId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 5000
      });

      const result = response.data.result;
      return {
        status: result.status, // pending, completed, failed
        modelUrl: result.model_url,
        textureUrl: result.texture_url,
        error: result.error
      };
    } catch (e) {
      console.error('[meshy] _checkJobStatus error:', e.message);
      return { status: 'error', error: e.message };
    }
  }

  async _pollJobAsync(jobId, agentId, options) {
    // Poll without blocking; update metadata as job completes
    for (let attempt = 0; attempt < this.pollMaxAttempts; attempt++) {
      try {
        const status = await this._checkJobStatus(jobId);

        if (status.status === 'completed') {
          // Download GLB
          const glbPath = path.join(BODIES_DIR, `${agentId}.glb`);
          await this._downloadGLB(status.modelUrl, glbPath);

          // Update metadata
          const meta = this._readMeta();
          meta[agentId] = {
            jobId,
            status: 'ready',
            glbUrl: `/api/agent/${agentId}/body.glb`,
            glbPath,
            customizations: options,
            generatedAt: Date.now()
          };
          this._saveMeta(meta);

          console.log(`[meshy] ${agentId} body ready: ${glbPath}`);
          return;
        }

        if (status.status === 'failed') {
          console.error(`[meshy] Job ${jobId} failed:`, status.error);
          const meta = this._readMeta();
          meta[agentId] = { jobId, status: 'failed', error: status.error };
          this._saveMeta(meta);
          return;
        }

        // Still pending; wait and retry
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      } catch (e) {
        console.error(`[meshy] Poll attempt ${attempt + 1} failed:`, e.message);
      }
    }

    console.warn(`[meshy] Job ${jobId} timed out after ${this.pollMaxAttempts} attempts`);
  }

  async _downloadGLB(url, destPath) {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    fs.writeFileSync(destPath, response.data);
  }

  _readMeta() {
    try {
      return JSON.parse(fs.readFileSync(BODIES_META_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  _saveMeta(meta) {
    try {
      fs.writeFileSync(BODIES_META_FILE, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.warn('[meshy] _saveMeta failed:', e.message);
    }
  }

  _mockGenerate(agentId, options) {
    // Mock response when MESHY_API_KEY is not set
    const mockJobId = `mock-${agentId}-${Date.now()}`;
    const meta = this._readMeta();
    meta[agentId] = {
      jobId: mockJobId,
      status: 'ready',
      glbUrl: `/api/agent/${agentId}/body.glb`,
      customizations: options,
      generatedAt: Date.now(),
      mock: true
    };
    this._saveMeta(meta);

    return {
      status: 'ready',
      jobId: mockJobId,
      glbUrl: `/api/agent/${agentId}/body.glb`,
      message: '(Mock response; MESHY_API_KEY not set)',
      mock: true
    };
  }
}

module.exports = new MeshyService();
