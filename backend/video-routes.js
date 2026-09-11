'use strict';

/**
 * SHADDAI video-routes.js
 * Express router for the BYOK AI video-generation backend.
 *
 * Mount with:
 *   app.use('/api/video', require('./video-routes'));
 *
 * Providers (keys from env, BYOK): pika, runway, heygen, kling — see video-providers.js
 *
 * Routes:
 *   GET  /providers      — list providers, configured-boolean, costPerSecond (never the key)
 *   POST /generate       — body { prompt, provider, duration, style }
 *                          503 { error, needsKey:true } if the provider key is missing;
 *                          else queue job + begin polling, return { jobId, status, eta, costUsd }
 *   GET  /status/:jobId  — return the job record
 *   GET  /library        — list completed jobs
 *
 * Jobs are held in an in-memory Map (no DB). Survives only for process lifetime.
 */

const express = require('express');
const router = express.Router();

const PROVIDERS = require('./video-providers');
const { isConfigured } = PROVIDERS;
// PIKADON: /generate triggers a real paid provider call billed on the server's
// own env key (despite the "BYOK" label) — the generic global /api limiter
// (150/min) is far too loose for that; give it its own tight per-route budget,
// same pattern as forge/forge-routes.js and quickstart-routes.js.
const { rateLimit } = require('./auth-guard');
const generateLimit = rateLimit({ windowMs: 60000, max: 10 });

// ─── in-memory job store ──────────────────────────────────────────────────────
const jobs = new Map(); // jobId -> job record

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 240; // ~20 min ceiling, then give up

function makeLocalId() {
  return 'vid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Begin background polling of provider.getStatus for a queued job.
 * Updates the in-memory record in place. Never throws.
 */
function startPolling(localId) {
  const job = jobs.get(localId);
  if (!job || !job.providerJobId) return;
  const provider = PROVIDERS[job.provider];
  if (!provider || typeof provider.getStatus !== 'function') return;

  let polls = 0;
  const tick = async () => {
    polls += 1;
    const current = jobs.get(localId);
    if (!current) return; // job removed
    if (current.status === 'completed' || current.status === 'error') return; // done

    try {
      const s = await provider.getStatus(current.providerJobId);
      current.status = s.status || current.status;
      current.progress = typeof s.progress === 'number' ? s.progress : current.progress;
      if (s.videoUrl) current.videoUrl = s.videoUrl;
      if (s.error) current.error = s.error;
      current.updatedAt = Date.now();
    } catch (err) {
      current.error = (err && err.message) || 'status poll failed';
      current.status = 'error';
      current.updatedAt = Date.now();
    }

    const done = current.status === 'completed' || current.status === 'error';
    if (!done && polls < MAX_POLLS) {
      setTimeout(tick, POLL_INTERVAL_MS).unref?.();
    } else if (!done) {
      current.status = 'error';
      current.error = 'timed out waiting for provider';
      current.updatedAt = Date.now();
    }
  };

  setTimeout(tick, POLL_INTERVAL_MS).unref?.();
}

/** Public-safe view of a job (no keys are ever stored, so this is just a copy). */
function publicJob(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    provider: job.provider,
    prompt: job.prompt,
    duration: job.duration,
    style: job.style,
    status: job.status,
    progress: job.progress,
    eta: job.eta,
    costUsd: job.costUsd,
    videoUrl: job.videoUrl || null,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

// ─── GET /providers ───────────────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  const list = Object.keys(PROVIDERS.PROVIDERS || {})
    .map((name) => {
      const p = PROVIDERS[name];
      return {
        name,
        configured: isConfigured(name), // boolean only — never the key
        costPerSecond: p.costPerSecond,
        envKey: p.envKey, // the NAME of the env var (not its value) so the UI can tell users what to set
      };
    });
  res.json({ providers: list });
});

// ─── POST /generate ───────────────────────────────────────────────────────────
router.post('/generate', generateLimit, async (req, res) => {
  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
  const duration = Number(body.duration) > 0 ? Number(body.duration) : 5;
  const style = typeof body.style === 'string' ? body.style : undefined;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  const adapter = PROVIDERS[provider];
  if (!adapter || typeof adapter.generate !== 'function') {
    return res.status(400).json({
      error: `unknown provider '${provider}'`,
      available: Object.keys(PROVIDERS.PROVIDERS || {}),
    });
  }
  if (!isConfigured(provider)) {
    return res.status(503).json({
      error: `${adapter.envKey} not set — add your ${provider} API key to enable this provider`,
      needsKey: true,
    });
  }

  let result;
  try {
    result = await adapter.generate(prompt, { duration, style });
  } catch (err) {
    // requireKey or unexpected throw — treat missing key as 503, else 502
    const msg = (err && err.message) || 'generation failed';
    if (/not set/i.test(msg)) {
      return res.status(503).json({ error: msg, needsKey: true });
    }
    return res.status(502).json({ error: msg });
  }

  if (!result || result.status === 'error' || !result.jobId) {
    return res.status(502).json({
      error: (result && result.error) || 'provider did not return a job id',
    });
  }

  const localId = makeLocalId();
  const now = Date.now();
  const job = {
    jobId: localId,
    providerJobId: result.jobId,
    provider,
    prompt,
    duration,
    style: style || null,
    status: 'queued',
    progress: 0,
    eta: result.eta || duration * 15,
    costUsd: result.costUsd != null ? result.costUsd : 0,
    videoUrl: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(localId, job);
  startPolling(localId);

  return res.json({
    jobId: localId,
    status: job.status,
    eta: job.eta,
    costUsd: job.costUsd,
  });
});

// --- GET /status/:jobId ------------------------------------------------------
router.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  return res.json(publicJob(job));
});

// --- GET /library ------------------------------------------------------------
router.get('/library', (req, res) => {
  const completed = [];
  for (const job of jobs.values()) {
    if (job.status === 'completed') completed.push(publicJob(job));
  }
  completed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return res.json({ videos: completed, count: completed.length });
});

module.exports = router;
