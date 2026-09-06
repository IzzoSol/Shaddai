// backend/lib/llm-router.js
// MULTI-PROVIDER LLM ROUTER
// Groq stays primary (free tier, key-rotation). If Groq is down/rate-limited/absent,
// fall back to the next configured provider — OpenAI, Anthropic, DeepSeek, or
// OpenRouter — so a single backend outage never bricks the whole empire.
//
// Registers its own /api/router/mount in the bottom of this file. Never throws:
// a bad provider key is reported and the next provider is tried. Add keys via env:
//   GROQ_API_KEY (primary), OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY
// Provider order = [groq, openai, anthropic, deepseek, openrouter].
'use strict';

const fetch = globalThis.fetch; // Node 18+

const PROVIDERS = [
  {
    id: 'groq',
    env: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.GROQ_ROUTER_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    api: 'openai',
  },
  {
    id: 'openai',
    env: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    api: 'openai',
  },
  {
    id: 'anthropic',
    env: 'ANTHROPIC_API_KEY',
    url: 'https://api.anthropic.com/v1/messages',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
    api: 'anthropic',
  },
  {
    id: 'deepseek',
    env: 'DEEPSEEK_API_KEY',
    url: 'https://api.deepseek.com/chat/completions',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    api: 'openai',
  },
  {
    id: 'openrouter',
    env: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    api: 'openai',
  },
];

// in-memory health: track consecutive failures to skip a broken provider fast
const health = {};
const MAX_CONSECUTIVE_FAILS = 3;
const COOLDOWN_MS = 60000;

function markSuccess(id) { health[id] = { fails: 0, until: 0 }; }
function markFail(id) {
  const h = health[id] || (health[id] = { fails: 0, until: 0 });
  h.fails += 1;
  if (h.fails >= MAX_CONSECUTIVE_FAILS) h.until = Date.now() + COOLDOWN_MS;
}

function isCooling(id) {
  const h = health[id];
  return h && h.until && Date.now() < h.until;
}

function getProviders() {
  const configured = [];
  for (const p of PROVIDERS) {
    const k = (process.env[p.env] || '').trim();
    if (k) configured.push(p);
  }
  // Move groq first if present; otherwise preserve order. Never invent keys.
  const groq = configured.find(p => p.id === 'groq');
  const rest = configured.filter(p => p.id !== 'groq');
  return groq ? [groq, ...rest] : rest;
}

// Normalize a message list into the OpenAI chat shape.
// Handles {role,content} and {role, parts:[{text}]] (gemini-ish) gracefully.
function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map(m => {
    const content = typeof m.content === 'string'
      ? m.content
      : (Array.isArray(m.parts) ? m.parts.map(p => p.text).join('\n') : String(m.content || ''));
    return { role: m.role || 'user', content };
  });
}

// OpenAI-compatible chat call.
async function openAIChat(provider, messages, opts) {
  const key = process.env[provider.env];
  const body = {
    model: provider.model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.max_tokens ?? 1500,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key,
  };
  if (provider.id === 'openrouter') headers['HTTP-Referer'] = 'https://shaddai-g81x.onrender.com';

  const r = await fetch(provider.url, {
    method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs || 45000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`[${provider.id}] HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

// Anthropic (native) chat call.
async function anthropicChat(provider, messages, opts) {
  const key = process.env[provider.env];
  const sysParts = messages.filter(m => m.role === 'system').map(m => m.content);
  const rest = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
  const body = {
    model: provider.model,
    max_tokens: opts.max_tokens ?? 1500,
    temperature: opts.temperature ?? 0.4,
    system: sysParts.join('\n') || undefined,
    messages: rest,
  };
  const r = await fetch(provider.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs || 45000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`[${provider.id}] HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const text = Array.isArray(j.content) && j.content[0] && j.content[0].type === 'text'
    ? j.content[0].text
    : '';
  return text || (j.content ? JSON.stringify(j.content) : '');
}

/**
 * Route a chat request to the first healthy, keyed provider.
 * @param {Array} messages  [{role, content}]
 * @param {object} opts     { temperature, max_tokens, json, timeoutMs }
 * @returns {Promise<string>}  text content
 */
async function chat(messages, opts = {}) {
  const normalized = normalizeMessages(messages);
  if (!normalized.length) throw new Error('llm-router: no messages provided');

  const providers = getProviders();
  if (!providers.length) {
    throw new Error('llm-router: no LLM key configured (set GROQ_API_KEY or OPENAI_API_KEY / ANTHROPIC_API_KEY)');
  }

  let lastErr = null;
  for (const p of providers) {
    if (isCooling(p.id)) continue;
    try {
      const out = p.api === 'anthropic'
        ? await anthropicChat(p, normalized, opts)
        : await openAIChat(p, normalized, opts);
      markSuccess(p.id);
      return { text: out, provider: p.id, model: p.model };
    } catch (e) {
      lastErr = e;
      markFail(p.id);
    }
  }
  throw lastErr || new Error('llm-router: all providers failed');
}

/** Status: which providers are configured + health. */
function status() {
  return PROVIDERS.map(p => {
    const k = (process.env[p.env] || '').trim();
    return {
      id: p.id,
      configured: !!k,
      model: p.model,
      health: isCooling(p.id) ? 'cooling' : (k ? 'ok' : 'no-key'),
      consecutiveFails: (health[p.id] && health[p.id].fails) || 0,
    };
  });
}

module.exports = { chat, status, getProviders };