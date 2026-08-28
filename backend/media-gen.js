'use strict';
// ============================================================================
// media-gen.js — SHADDAI premium media generation router.
//
//   MOUNT ME AT:  app.use('/api/media-gen', require('./backend/media-gen'));
//   (The owner mounts this — this file does NOT mount itself.)
//
// Routes:
//   POST /music        FREE   — HuggingFace MusicGen (facebook/musicgen-small)
//   POST /video        BYOK   — fal.ai video, USER'S OWN key only (never funded)
//   GET  /capabilities        — what the UI is allowed to offer
//
// VOICE / TTS: intentionally NOT here. Text-to-speech is handled FREE, 100%
// client-side in the browser via the Web Speech API (window.speechSynthesis).
// No backend, no key, no cost — so there is deliberately no /voice route.
//
// Honesty notes:
//   * Music runs on HF's free Inference tier. MusicGen is heavy and is often
//     rate-limited / cold / 404'd on free serverless inference. We rotate every
//     HF token and, if audio still doesn't come back, we tell the truth:
//     { ok:false, error:'music model unavailable on free tier', suggestUpgrade:true }.
//     We NEVER fabricate an audio blob.
//   * Video is BYOK ONLY. process.env.FAL_KEY is NEVER read here — if the user
//     doesn't supply their own fal.ai key, we refuse before calling anything.
// ============================================================================
const express = require('express');
const router = express.Router();

// --- HF token source ---------------------------------------------------------
// Prefer the shared pool in backend/lib/hf-keys.js. Fall back to reading
// HF_TOKENS / HF_TOKEN from backend/data/runtime-keys.json (and matching env).
function hfTokens() {
  // 1) Shared key pool (auto-rotating, single source of truth).
  try {
    const pool = require('./lib/hf-keys');
    if (pool && typeof pool.keys === 'function') {
      const list = pool.keys();
      if (Array.isArray(list) && list.length) return list;
    }
  } catch { /* lib not present — fall through */ }

  // 2) Direct fallback: env + runtime-keys.json.
  const out = [];
  const add = (k) => {
    if (k && /^hf_/.test(String(k).trim()) && !out.includes(String(k).trim())) out.push(String(k).trim());
  };
  if (process.env.HF_TOKENS) String(process.env.HF_TOKENS).split(',').forEach(add);
  add(process.env.HF_TOKEN);
  add(process.env.HUGGINGFACE_API_KEY);
  try {
    const fs = require('fs');
    const path = require('path');
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'runtime-keys.json'), 'utf8'));
    if (Array.isArray(j.HF_TOKENS)) j.HF_TOKENS.forEach(add);
    add(j.HF_TOKEN);
    add(j.HUGGINGFACE_API_KEY);
  } catch { /* no runtime-keys file — that's fine */ }
  return out;
}

// ⚠️ KNOWN DEAD (verified 2026-08-28). `hf-inference` is a retired provider and
// returns 410 Gone, so this route cannot produce audio no matter how many keys
// are configured — it is NOT a key problem, and adding keys will not fix it.
// Unlike the image models, MusicGen is not currently served by any live HF
// Inference Provider (nscale/fal-ai/wavespeed are text-to-image), so there is
// no drop-in URL swap. Re-enabling this needs a different audio provider.
// The route already degrades to a clean error, so it fails honestly.
const MUSICGEN_URL = 'https://router.huggingface.co/hf-inference/models/facebook/musicgen-small';

// ----------------------------------------------------------------------------
// POST /music  — FREE music generation via HF MusicGen.
//   Body: { prompt: string, duration?: number }   (duration is advisory only;
//          MusicGen-small on serverless inference ignores explicit length.)
//   → { ok:true, audio:'data:audio/wav;base64,...' }
//   → { ok:false, error:'music model unavailable on free tier', suggestUpgrade:true }
//   → { ok:false, error, needsKey:true }   (no HF token configured)
// ----------------------------------------------------------------------------
router.post('/music', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const prompt = (req.body && typeof req.body.prompt === 'string') ? req.body.prompt.trim() : '';
    if (!prompt) return res.json({ ok: false, error: 'prompt required' });

    const tokens = hfTokens();
    if (!tokens.length) {
      return res.json({ ok: false, needsKey: true, error: 'No HuggingFace token configured on the server.' });
    }

    let lastErr = '';
    for (let i = 0; i < tokens.length; i++) {
      try {
        const r = await fetch(MUSICGEN_URL, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tokens[i],
            'Content-Type': 'application/json',
            'x-wait-for-model': 'true',
            Accept: 'audio/wav, audio/flac, audio/*',
          },
          body: JSON.stringify({ inputs: prompt }),
          signal: AbortSignal.timeout(90000),
        });

        const ct = (r.headers.get('content-type') || '').toLowerCase();

        // Success: real audio bytes came back.
        if (r.ok && ct.includes('audio')) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 128) { lastErr = 'empty audio payload'; continue; }
          const mime = ct.includes('flac') ? 'audio/flac' : (ct.includes('mpeg') || ct.includes('mp3')) ? 'audio/mpeg' : 'audio/wav';
          return res.json({ ok: true, audio: `data:${mime};base64,` + buf.toString('base64'), bytes: buf.length });
        }

        // Depleted / rate-limited / unauthorized → rotate to next token.
        if ([401, 402, 403, 429].includes(r.status)) {
          lastErr = `HF ${r.status} on token#${i + 1}`;
          continue;
        }

        // Model still loading → wait once, retry the SAME token.
        if (r.status === 503) {
          await new Promise((s) => setTimeout(s, 8000));
          i--;
          continue;
        }

        // Anything else (incl. 404 / JSON error blob): capture and move on.
        let body = '';
        try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
        lastErr = `HF ${r.status} ${body}`;
      } catch (e) {
        lastErr = String((e && e.message) || e);
      }
    }

    // Honest failure — do NOT fake audio.
    return res.json({
      ok: false,
      error: 'music model unavailable on free tier',
      detail: lastErr,
      suggestUpgrade: true,
    });
  } catch (e) {
    return res.json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ----------------------------------------------------------------------------
// POST /video  — BYOK ONLY. Uses the USER'S OWN fal.ai key. Never funded.
//   Body: { prompt: string, apiKey: string }   apiKey = the user's fal.ai key.
//   No apiKey → { ok:false, needsKey:true, message:'Add your own fal.ai key ...' }
//              (nothing is called).
//   → { ok:true, video:'<url>' }
//   → { ok:false, error }
//
//   process.env.FAL_KEY is deliberately NEVER read here.
// ----------------------------------------------------------------------------
const FAL_VIDEO_URL = 'https://fal.run/fal-ai/ltx-video';

router.post('/video', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = (typeof body.prompt === 'string') ? body.prompt.trim() : '';
    const apiKey = (typeof body.apiKey === 'string') ? body.apiKey.trim() : '';

    if (!apiKey) {
      return res.json({
        ok: false,
        needsKey: true,
        message: 'Add your own fal.ai key to generate video (premium/BYOK).',
      });
    }
    if (!prompt) return res.json({ ok: false, error: 'prompt required' });

    let r;
    try {
      r = await fetch(FAL_VIDEO_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Key ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(180000),
      });
    } catch (e) {
      return res.json({ ok: false, error: 'fal.ai request failed: ' + String((e && e.message) || e) });
    }

    let data = null;
    let text = '';
    try {
      text = await r.text();
      data = text ? JSON.parse(text) : null;
    } catch { /* non-JSON response */ }

    if (!r.ok) {
      const msg = (data && (data.detail || data.error || data.message)) || text.slice(0, 200) || ('HTTP ' + r.status);
      return res.json({ ok: false, error: 'fal.ai error: ' + String(msg) });
    }

    // fal.ai video responses vary by model — dig out the URL defensively.
    const url =
      (data && data.video && data.video.url) ||
      (data && Array.isArray(data.videos) && data.videos[0] && data.videos[0].url) ||
      (data && data.video_url) ||
      (data && data.url) ||
      (data && data.output && data.output.url) ||
      null;

    if (!url) return res.json({ ok: false, error: 'fal.ai returned no video URL', detail: text.slice(0, 200) });
    return res.json({ ok: true, video: url });
  } catch (e) {
    return res.json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ----------------------------------------------------------------------------
// GET /capabilities — what the UI may offer.
// ----------------------------------------------------------------------------
router.get('/capabilities', (_req, res) => {
  try {
    res.json({
      music: 'free (HF MusicGen)',
      video: 'byok',
      voice: 'browser (Web Speech, frontend)',
    });
  } catch (e) {
    res.json({ ok: false, error: String((e && e.message) || e) });
  }
});

module.exports = router;
