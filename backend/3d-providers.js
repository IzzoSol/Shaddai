/**
 * 3D PROVIDERS — Unified interface for model generation
 * Support: Meshy, Tripo3D, HuggingFace, Blockade Labs, Replicate, Sketchfab, Custom Upload
 *
 * Each provider implements:
 *   - generate(prompt, options) → { jobId, status, estimatedTime }
 *   - getStatus(jobId) → { status, glbUrl, error? }
 *   - download(glbUrl) → GLB buffer
 *   - list() → array of available models (if applicable)
 */
'use strict';

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// BASE PROVIDER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ThreeDProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.apiKey = config.apiKey || process.env[`${name.toUpperCase()}_API_KEY`];
  }

  async generate(prompt, options = {}) {
    throw new Error(`${this.name}.generate() not implemented`);
  }

  async getStatus(jobId) {
    throw new Error(`${this.name}.getStatus() not implemented`);
  }

  async download(glbUrl) {
    try {
      const response = await axios.get(glbUrl, { responseType: 'arraybuffer', timeout: 30000 });
      return response.data;
    } catch (e) {
      throw new Error(`Download failed: ${e.message}`);
    }
  }

  async list() {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESHY — https://www.meshy.ai/
// ═══════════════════════════════════════════════════════════════════════════════

class MeshyProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('meshy', config);
    this.apiBase = 'https://api.meshy.ai/v2';
  }

  async generate(prompt, options = {}) {
    const { style = 'humanoid', colors = [], features = [] } = options;

    // Build full prompt
    let fullPrompt = prompt;
    if (features.length) fullPrompt += `, with ${features.join(', ')}`;
    if (colors.length) fullPrompt += `, color palette: ${colors.map(c => c.replace('#', '')).join(', ')}`;

    try {
      const response = await axios.post(`${this.apiBase}/text-to-3d`, {
        mode: 'generate',
        prompt: fullPrompt,
        art_style: style,
        enable_pbr: true,
        texture_richness: 'high'
      }, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 10000
      });

      return {
        jobId: response.data.result.id,
        status: 'generating',
        estimatedTime: '60-120s',
        provider: 'meshy'
      };
    } catch (e) {
      throw new Error(`Meshy generate failed: ${e.message}`);
    }
  }

  async getStatus(jobId) {
    try {
      const response = await axios.get(`${this.apiBase}/text-to-3d/${jobId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 5000
      });

      const result = response.data.result;
      return {
        status: result.status, // pending, completed, failed
        glbUrl: result.model_url,
        textureUrl: result.texture_url,
        error: result.error,
        provider: 'meshy'
      };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIPO3D — https://www.tripo3d.com/
// Fast alternative to Meshy
// ═══════════════════════════════════════════════════════════════════════════════

class Tripo3DProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('tripo3d', config);
    this.apiBase = 'https://api.tripo3d.com/v2';
  }

  async generate(prompt, options = {}) {
    const { style = 'object', quality = 'medium' } = options;

    try {
      const response = await axios.post(`${this.apiBase}/chunked-upload/init`, {
        // First initialize upload
      }, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      // Then submit request
      const genResponse = await axios.post(`${this.apiBase}/models`, {
        prompt,
        model_type: style,
        quality,
        webhook_url: process.env.TRIPO3D_WEBHOOK_URL
      }, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      return {
        jobId: genResponse.data.job_id,
        status: 'processing',
        estimatedTime: '10-30s',
        provider: 'tripo3d'
      };
    } catch (e) {
      throw new Error(`Tripo3D generate failed: ${e.message}`);
    }
  }

  async getStatus(jobId) {
    try {
      const response = await axios.get(`${this.apiBase}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      return {
        status: response.data.status, // queued, running, succeeded, failed
        glbUrl: response.data.result?.glb_url,
        error: response.data.error,
        provider: 'tripo3d'
      };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUGGING FACE / REPLICATE — TripoSR (FREE)
// Run via Replicate API
// ═══════════════════════════════════════════════════════════════════════════════

class HuggingFaceProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('huggingface', config);
    this.replicateKey = config.replicateKey || process.env.REPLICATE_API_KEY;
    this.apiBase = 'https://api.replicate.com/v1';
    // TripoSR model version (latest)
    this.modelVersion = 'triposr-model-v1'; // Will be updated
  }

  async generate(prompt, options = {}) {
    if (!this.replicateKey) {
      throw new Error('REPLICATE_API_KEY required for HuggingFace provider');
    }

    try {
      const response = await axios.post(`${this.apiBase}/predictions`, {
        version: this.modelVersion,
        input: {
          prompt,
          ...options.params || {}
        }
      }, {
        headers: { 'Authorization': `Token ${this.replicateKey}` }
      });

      return {
        jobId: response.data.id,
        status: 'processing',
        estimatedTime: '20-60s',
        provider: 'huggingface'
      };
    } catch (e) {
      throw new Error(`HuggingFace/Replicate generate failed: ${e.message}`);
    }
  }

  async getStatus(jobId) {
    try {
      const response = await axios.get(`${this.apiBase}/predictions/${jobId}`, {
        headers: { 'Authorization': `Token ${this.replicateKey}` }
      });

      return {
        status: response.data.status, // processing, succeeded, failed
        glbUrl: response.data.output?.[0], // Output is array of URLs
        error: response.data.error,
        provider: 'huggingface'
      };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKADE LABS — https://www.blockadelabs.com/
// Skyboxes and panoramic environments
// ═══════════════════════════════════════════════════════════════════════════════

class BlockadeLabsProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('blockade', config);
    this.apiBase = 'https://api.blockadelabs.com';
  }

  async generate(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('BLOCKADE_API_KEY required');
    }

    try {
      const response = await axios.post(`${this.apiBase}/api/v1/skybox`, {
        prompt,
        negative_text: options.negative || '',
        seed: crypto.randomBytes(4).readUInt32BE(0)
      }, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      return {
        jobId: response.data.request_id,
        status: 'queued',
        estimatedTime: '5-15s',
        provider: 'blockade'
      };
    } catch (e) {
      throw new Error(`Blockade Labs generate failed: ${e.message}`);
    }
  }

  async getStatus(jobId) {
    try {
      const response = await axios.get(`${this.apiBase}/api/v1/skybox/${jobId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      // Blockade returns equirectangular panorama; would need to convert to cubemap → GLB
      return {
        status: response.data.status, // pending, complete, error
        imageUrl: response.data.file_url, // Equirectangular image
        glbUrl: null, // TODO: Convert to cubemap GLB
        error: response.data.error,
        provider: 'blockade'
      };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPLICATE — https://replicate.com/
// Run any open-source model (TripoSR, Point-E, Shap-E, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

class ReplicateProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('replicate', config);
    this.apiBase = 'https://api.replicate.com/v1';
    this.model = config.model || 'triposr'; // Default to TripoSR
  }

  async generate(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('REPLICATE_API_KEY required');
    }

    // Map model name to version ID (hardcode known models)
    const models = {
      triposr: 'stable-diffusion-triposr',
      'point-e': 'point-e-model-id',
      'shap-e': 'shap-e-model-id'
    };
    const version = models[this.model] || this.model;

    try {
      const response = await axios.post(`${this.apiBase}/predictions`, {
        version,
        input: {
          prompt,
          ...options.params || {}
        }
      }, {
        headers: { 'Authorization': `Token ${this.apiKey}` }
      });

      return {
        jobId: response.data.id,
        status: 'processing',
        estimatedTime: '10-180s',
        provider: 'replicate'
      };
    } catch (e) {
      throw new Error(`Replicate generate failed: ${e.message}`);
    }
  }

  async getStatus(jobId) {
    try {
      const response = await axios.get(`${this.apiBase}/predictions/${jobId}`, {
        headers: { 'Authorization': `Token ${this.apiKey}` }
      });

      return {
        status: response.data.status,
        glbUrl: response.data.output?.[0],
        error: response.data.error,
        provider: 'replicate'
      };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKETCHFAB — https://sketchfab.com/
// Browse and curate existing 3D models
// ═══════════════════════════════════════════════════════════════════════════════

class SketchfabProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('sketchfab', config);
    this.apiBase = 'https://api.sketchfab.com/v3';
  }

  async search(query, options = {}) {
    try {
      const response = await axios.get(`${this.apiBase}/search`, {
        params: {
          q: query,
          type: 'models',
          license: options.license || 'by-sa,by,cc0',
          count: options.limit || 20
        },
        headers: this.apiKey ? { 'Authorization': `Token ${this.apiKey}` } : {}
      });

      return response.data.results;
    } catch (e) {
      throw new Error(`Sketchfab search failed: ${e.message}`);
    }
  }

  async curate(modelId) {
    // Fetch model details and prepare for listing on SHADDAI
    try {
      const response = await axios.get(`${this.apiBase}/models/${modelId}`, {
        headers: this.apiKey ? { 'Authorization': `Token ${this.apiKey}` } : {}
      });

      const model = response.data;
      return {
        name: model.name,
        description: model.description || '',
        creator: model.user?.username,
        glbUrl: model.downloadUrl, // If available
        license: model.license?.label,
        rating: model.averageRating,
        downloads: model.viewCount
      };
    } catch (e) {
      throw new Error(`Sketchfab curate failed: ${e.message}`);
    }
  }

  // Sketchfab doesn't generate; it searches existing models
  async generate() {
    throw new Error('Sketchfab provider only supports search/curation, not generation');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM UPLOAD — User uploads their own GLB
// ═══════════════════════════════════════════════════════════════════════════════

class CustomUploadProvider extends ThreeDProvider {
  constructor(config = {}) {
    super('custom', config);
    this.uploadsDir = path.join(__dirname, 'data', 'user-models');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async upload(glbBuffer, metadata = {}) {
    const filename = `${crypto.randomUUID()}.glb`;
    const filepath = path.join(this.uploadsDir, filename);

    // Validate GLB magic number
    if (glbBuffer.toString('utf8', 0, 4) !== 'glTF') {
      throw new Error('Invalid GLB file (wrong magic number)');
    }

    fs.writeFileSync(filepath, glbBuffer);

    return {
      glbUrl: `/api/models/user/${filename}`,
      filename,
      size: glbBuffer.length,
      metadata,
      provider: 'custom'
    };
  }

  async getUpload(filename) {
    const filepath = path.join(this.uploadsDir, filename);
    if (!fs.existsSync(filepath)) {
      throw new Error('File not found');
    }
    return fs.readFileSync(filepath);
  }

  // Custom upload doesn't "generate"; it uploads
  async generate() {
    throw new Error('Custom provider requires file upload, not generation');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this._initializeProviders();
  }

  _initializeProviders() {
    // Initialize configured providers
    if (process.env.MESHY_API_KEY) {
      this.register('meshy', new MeshyProvider({
        apiKey: process.env.MESHY_API_KEY
      }));
    }

    if (process.env.TRIPO3D_API_KEY) {
      this.register('tripo3d', new Tripo3DProvider({
        apiKey: process.env.TRIPO3D_API_KEY
      }));
    }

    if (process.env.REPLICATE_API_KEY) {
      this.register('huggingface', new HuggingFaceProvider({
        replicateKey: process.env.REPLICATE_API_KEY
      }));
      this.register('replicate', new ReplicateProvider({
        apiKey: process.env.REPLICATE_API_KEY
      }));
    }

    if (process.env.BLOCKADE_API_KEY) {
      this.register('blockade', new BlockadeLabsProvider({
        apiKey: process.env.BLOCKADE_API_KEY
      }));
    }

    if (process.env.SKETCHFAB_API_KEY) {
      this.register('sketchfab', new SketchfabProvider({
        apiKey: process.env.SKETCHFAB_API_KEY
      }));
    }

    // Custom upload always available
    this.register('custom', new CustomUploadProvider());
  }

  register(name, provider) {
    this.providers.set(name.toLowerCase(), provider);
  }

  get(name) {
    const provider = this.providers.get(name?.toLowerCase());
    if (!provider) throw new Error(`3D provider '${name}' not found or not configured`);
    return provider;
  }

  list() {
    return Array.from(this.providers.keys());
  }

  status() {
    const status = {};
    for (const [name, provider] of this.providers) {
      status[name] = {
        configured: !!provider.apiKey,
        name: provider.name
      };
    }
    return status;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  ThreeDProvider,
  MeshyProvider,
  Tripo3DProvider,
  HuggingFaceProvider,
  BlockadeLabsProvider,
  ReplicateProvider,
  SketchfabProvider,
  CustomUploadProvider,
  ProviderRegistry,
  providerRegistry: new ProviderRegistry()
};
