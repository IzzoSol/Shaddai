/**
 * llm-proxy-routes.js — Server-side LLM proxy (PIKADON Issue 1 fix).
 *
 * Replaces hardcoded client-side provider keys with a secure server proxy.
 * The browser posts { messages, agent?, taskTier?, options? } and this router
 * calls llm-client.js / brains.js using server-side env keys. Keys NEVER leave
 * the server or appear in any response.
 *
 * TODO: mount this router in server-production.js with:
 *   app.use('/api/llm', require('./llm-proxy-routes'));
 */

'use strict';

const express = require('express');
const router  = express.Router();
const json    = express.json();

// Rate-limit all routes on this router: 60 req/min per IP.
const { rateLimit } = require('./auth-guard');
router.use(rateLimit({ max: 60 }));

// Lazy-load heavy modules only when first request arrives (keeps startup fast
// if the server has optional features disabled).
let _callLLM      = null;
let _agentLLM     = null;
let _getProviders = null;

function getLLMClient() {
  if (!_callLLM) {
    const llm    = require('./llm-client');
    _callLLM     = llm.callLLM;
    _getProviders = llm.getAvailableProviders;
  }
  return { callLLM: _callLLM, getAvailableProviders: _getProviders };
}

function getBrains() {
  if (!_agentLLM) {
    _agentLLM = require('./brains').agentLLM;
  }
  return _agentLLM;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /chat
// Body: { messages: Array, agent?: string, taskTier?: string, options?: object }
//
// If `agent` is provided → delegates to brains.agentLLM() which applies the
//   correct persona, brain routing, and metering.
// Otherwise → calls llm-client.callLLM() directly with the fallback chain
//   (Ollama → Groq → OpenRouter → Anthropic → OpenAI).
//
// Response: { ok: true, content, provider, model }
//           { ok: false, error: string }            on any failure
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', json, async (req, res) => {
  try {
    const { messages, agent, taskTier, options } = req.body || {};

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages must be a non-empty array' });
    }

    // Sanitise each message: only keep role + content, nothing injected
    const safeMessages = messages.map(m => ({
      role:    String(m.role    || 'user').slice(0, 32),
      content: String(m.content || '').slice(0, 32000)
    }));

    let result;

    if (agent) {
      const agentLLM = getBrains();
      result = await agentLLM({
        agent:     String(agent).slice(0, 64),
        messages:  safeMessages,
        taskTier:  taskTier ? String(taskTier).slice(0, 32) : 'standard',
        options:   (options && typeof options === 'object') ? options : {}
      });
    } else {
      const { callLLM } = getLLMClient();
      result = await callLLM(
        safeMessages,
        (options && typeof options === 'object') ? options : {}
      );
    }

    // Return only safe fields — never echo keys or internal state
    return res.json({
      ok:       true,
      content:  result.content,
      provider: result.provider,
      model:    result.model
    });

  } catch (err) {
    console.error('[llm-proxy] /chat error:', err.message);
    return res.status(500).json({ ok: false, error: String(err.message || 'LLM call failed') });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /providers
// Returns which providers are currently configured — boolean flags only.
// Key values are NEVER included.
//
// Response: { ok: true, providers: { ollama: true, groq: false, ... } }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  try {
    const { getAvailableProviders } = getLLMClient();
    const available = new Set(getAvailableProviders());

    // Enumerate all known providers as boolean presence flags (no key values)
    const providers = {
      ollama:     available.has('ollama'),
      groq:       available.has('groq'),
      openrouter: available.has('openrouter'),
      anthropic:  available.has('anthropic'),
      openai:     available.has('openai')
    };

    return res.json({ ok: true, providers });

  } catch (err) {
    console.error('[llm-proxy] /providers error:', err.message);
    return res.status(500).json({ ok: false, error: String(err.message || 'Failed to read provider config') });
  }
});

module.exports = router;
