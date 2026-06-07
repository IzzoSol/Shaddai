'use strict';

/**
 * SHADDAI video-providers.js
 * BYOK (Bring Your Own Key) adapters for real AI video-generation providers.
 *
 * Keys are read from environment variables ONLY — never hardcoded, never logged.
 * Each adapter exposes:
 *   - generate(prompt, opts)  -> { jobId, status:'queued', eta, costUsd }
 *   - getStatus(jobId)        -> { status, progress, videoUrl, error }
 * and a costPerSecond number used for cost estimation.
 *
 * All network calls are wrapped in try/catch with a 30s timeout. These functions
 * surface errors via thrown Error objects (missing key) or via the returned
 * { status:'error', error } shape (network/API failures) — they NEVER crash the
 * process.
 *
 * Supported providers: pika, runway, heygen, kling.
 */

const axios = require('axios');
const keys = require('./lib/keys');

const TIMEOUT_MS = 30000;

/** Estimate cost in USD from a per-second rate and a requested duration (seconds). */
function estimateCost(costPerSecond, duration) {
  const secs = Number(duration) > 0 ? Number(duration) : 5;
  return Math.round(costPerSecond * secs * 100) / 100;
}

/** Read an env key or throw a clean, client-safe Error. */
function requireKey(envName) {
  const val = keys.get(envName);
  if (!val || !String(val).trim()) {
    throw new Error(`${envName} not set`);
  }
  return String(val).trim();
}

/** Normalize any axios/network failure into a consistent error string. */
function describeError(err) {
  if (err && err.response) {
    const status = err.response.status;
    const body = err.response.data;
    const detail =
      (body && (body.error || body.message || body.detail)) ||
      (typeof body === 'string' ? body : '');
    return `provider responded ${status}${detail ? ': ' + detail : ''}`;
  }
  if (err && err.code === 'ECONNABORTED') return 'provider request timed out';
  return (err && err.message) || 'unknown provider error';
}

/* ────────────────────────────────────────────────────────────────────────────
 * PIKA  —  https://pika.art   (Pika Labs API)
 * Endpoint pattern: POST https://api.pika.art/generate   (Bearer token)
 * ──────────────────────────────────────────────────────────────────────────── */
const pika = {
  name: 'pika',
  envKey: 'PIKA_API_KEY',
  costPerSecond: 0.10,
  baseUrl: 'https://api.pika.art',

  async generate(prompt, opts = {}) {
    const key = requireKey(this.envKey);
    const duration = Number(opts.duration) || 5;
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/generate`,
        {
          promptText: prompt,
          duration,
          options: { aspectRatio: opts.aspectRatio || '16:9', style: opts.style },
        },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: TIMEOUT_MS,
        }
      );
      const jobId = data.id || data.job_id || data.videoId;
      return {
        jobId,
        status: 'queued',
        eta: duration * 12, // seconds; Pika ~12x realtime
        costUsd: estimateCost(this.costPerSecond, duration),
      };
    } catch (err) {
      return { jobId: null, status: 'error', eta: 0, costUsd: 0, error: describeError(err) };
    }
  },

  async getStatus(jobId) {
    const key = requireKey(this.envKey);
    try {
      const { data } = await axios.get(`${this.baseUrl}/videos/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: TIMEOUT_MS,
      });
      const raw = (data.status || '').toLowerCase();
      const status =
        raw === 'finished' || raw === 'completed' ? 'completed'
          : raw === 'failed' || raw === 'error' ? 'error'
            : raw === 'pending' || raw === 'queued' ? 'queued'
              : 'processing';
      return {
        status,
        progress: data.progress != null ? Number(data.progress) : (status === 'completed' ? 100 : 0),
        videoUrl: data.resultUrl || data.videoUrl || data.url || null,
        error: data.error || null,
      };
    } catch (err) {
      return { status: 'error', progress: 0, videoUrl: null, error: describeError(err) };
    }
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * RUNWAY  —  https://runwayml.com   (Gen-3 / Runway API)
 * Endpoint: POST https://api.dev.runwayml.com/v1/image_to_video (Bearer + version header)
 * Text-to-video task creation; status via GET /v1/tasks/:id
 * ──────────────────────────────────────────────────────────────────────────── */
const runway = {
  name: 'runway',
  envKey: 'RUNWAY_API_KEY',
  costPerSecond: 0.25,
  baseUrl: 'https://api.dev.runwayml.com',
  apiVersion: '2024-11-06',

  async generate(prompt, opts = {}) {
    const key = requireKey(this.envKey);
    const duration = Number(opts.duration) || 5;
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/v1/text_to_video`,
        {
          promptText: prompt,
          model: opts.model || 'gen3a_turbo',
          duration,
          ratio: opts.aspectRatio || '1280:768',
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'X-Runway-Version': this.apiVersion,
            'Content-Type': 'application/json',
          },
          timeout: TIMEOUT_MS,
        }
      );
      const jobId = data.id || data.taskId;
      return {
        jobId,
        status: 'queued',
        eta: duration * 18,
        costUsd: estimateCost(this.costPerSecond, duration),
      };
    } catch (err) {
      return { jobId: null, status: 'error', eta: 0, costUsd: 0, error: describeError(err) };
    }
  },

  async getStatus(jobId) {
    const key = requireKey(this.envKey);
    try {
      const { data } = await axios.get(`${this.baseUrl}/v1/tasks/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': this.apiVersion },
        timeout: TIMEOUT_MS,
      });
      const raw = (data.status || '').toUpperCase();
      const status =
        raw === 'SUCCEEDED' ? 'completed'
          : raw === 'FAILED' || raw === 'CANCELLED' ? 'error'
            : raw === 'PENDING' ? 'queued'
              : 'processing';
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      return {
        status,
        progress: data.progress != null ? Math.round(Number(data.progress) * 100) : (status === 'completed' ? 100 : 0),
        videoUrl: output || null,
        error: data.failure || data.error || null,
      };
    } catch (err) {
      return { status: 'error', progress: 0, videoUrl: null, error: describeError(err) };
    }
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * HEYGEN  —  https://heygen.com   (avatar / talking-video API)
 * Endpoint: POST https://api.heygen.com/v2/video/generate  (X-Api-Key header)
 * Status via GET https://api.heygen.com/v1/video_status.get?video_id=:id
 * ──────────────────────────────────────────────────────────────────────────── */
const heygen = {
  name: 'heygen',
  envKey: 'HEYGEN_API_KEY',
  costPerSecond: 0.30,
  baseUrl: 'https://api.heygen.com',

  async generate(prompt, opts = {}) {
    const key = requireKey(this.envKey);
    const duration = Number(opts.duration) || 10;
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/v2/video/generate`,
        {
          video_inputs: [
            {
              character: {
                type: 'avatar',
                avatar_id: opts.avatarId || 'default',
                avatar_style: opts.style || 'normal',
              },
              voice: { type: 'text', input_text: prompt, voice_id: opts.voiceId || 'default' },
            },
          ],
          dimension: opts.dimension || { width: 1280, height: 720 },
        },
        {
          headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
          timeout: TIMEOUT_MS,
        }
      );
      const payload = data.data || data;
      const jobId = payload.video_id || payload.videoId || payload.id;
      return {
        jobId,
        status: 'queued',
        eta: duration * 15,
        costUsd: estimateCost(this.costPerSecond, duration),
      };
    } catch (err) {
      return { jobId: null, status: 'error', eta: 0, costUsd: 0, error: describeError(err) };
    }
  },

  async getStatus(jobId) {
    const key = requireKey(this.envKey);
    try {
      const { data } = await axios.get(`${this.baseUrl}/v1/video_status.get`, {
        params: { video_id: jobId },
        headers: { 'X-Api-Key': key },
        timeout: TIMEOUT_MS,
      });
      const payload = data.data || data;
      const raw = (payload.status || '').toLowerCase();
      const status =
        raw === 'completed' ? 'completed'
          : raw === 'failed' ? 'error'
            : raw === 'pending' || raw === 'waiting' ? 'queued'
              : 'processing';
      return {
        status,
        progress: status === 'completed' ? 100 : 0,
        videoUrl: payload.video_url || payload.videoUrl || null,
        error: (payload.error && (payload.error.message || payload.error)) || null,
      };
    } catch (err) {
      return { status: 'error', progress: 0, videoUrl: null, error: describeError(err) };
    }
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * KLING  —  https://klingai.com   (Kuaishou Kling video API)
 * Endpoint: POST https://api.klingai.com/v1/videos/text2video  (Bearer JWT)
 * Status via GET https://api.klingai.com/v1/videos/text2video/:id
 * ──────────────────────────────────────────────────────────────────────────── */
const kling = {
  name: 'kling',
  envKey: 'KLING_API_KEY',
  costPerSecond: 0.14,
  baseUrl: 'https://api.klingai.com',

  async generate(prompt, opts = {}) {
    const key = requireKey(this.envKey);
    const duration = Number(opts.duration) || 5;
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/v1/videos/text2video`,
        {
          prompt,
          model_name: opts.model || 'kling-v1',
          duration: String(duration),
          aspect_ratio: opts.aspectRatio || '16:9',
          mode: opts.mode || 'std',
        },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: TIMEOUT_MS,
        }
      );
      const payload = data.data || data;
      const jobId = payload.task_id || payload.taskId || payload.id;
      return {
        jobId,
        status: 'queued',
        eta: duration * 20,
        costUsd: estimateCost(this.costPerSecond, duration),
      };
    } catch (err) {
      return { jobId: null, status: 'error', eta: 0, costUsd: 0, error: describeError(err) };
    }
  },

  async getStatus(jobId) {
    const key = requireKey(this.envKey);
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/v1/videos/text2video/${encodeURIComponent(jobId)}`,
        { headers: { Authorization: `Bearer ${key}` }, timeout: TIMEOUT_MS }
      );
      const payload = data.data || data;
      const raw = (payload.task_status || payload.status || '').toLowerCase();
      const status =
        raw === 'succeed' || raw === 'succeeded' || raw === 'completed' ? 'completed'
          : raw === 'failed' ? 'error'
            : raw === 'submitted' || raw === 'queued' ? 'queued'
              : 'processing';
      let videoUrl = null;
      const result = payload.task_result || payload.result;
      if (result && Array.isArray(result.videos) && result.videos.length) {
        videoUrl = result.videos[0].url || null;
      }
      return {
        status,
        progress: status === 'completed' ? 100 : 0,
        videoUrl,
        error: payload.task_status_msg || payload.error || null,
      };
    } catch (err) {
      return { status: 'error', progress: 0, videoUrl: null, error: describeError(err) };
    }
  },
};

// The provider adapters, keyed by name. This object stays clean (adapters only)
// so callers can safely iterate it to enumerate available providers.
const PROVIDERS = { pika, runway, heygen, kling };

/** True if the provider's env key is present (boolean only — never the value). */
function isConfigured(name) {
  const p = PROVIDERS[name];
  if (!p) return false;
  const val = keys.get(p.envKey);
  return Boolean(val && String(val).trim());
}

// Export shape: each adapter is reachable as module.exports.pika etc. (back-compat),
// plus a clean `.PROVIDERS` map and helpers. We build a fresh export object so the
// `.PROVIDERS` map is NOT polluted by the helper keys.
module.exports = {
  pika,
  runway,
  heygen,
  kling,
  PROVIDERS,
  isConfigured,
  estimateCost,
};
