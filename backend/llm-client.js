/**
 * SHADDAI Provider-Agnostic LLM Client
 * ──────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for inline Groq calls in agent-engine.js.
 * Priority order: Ollama → Groq → OpenRouter → Anthropic → OpenAI
 *
 * Usage:
 *   const { callLLM, getAvailableProviders } = require('./llm-client');
 *
 *   const result = await callLLM(messages, { agentName: 'ZEROX', maxTokens: 800 });
 *   // result = { content, provider, model, tokens: { input, output } }
 *
 * Environment variables:
 *   OLLAMA_URL          — defaults to http://localhost:11434
 *   OLLAMA_MODEL        — defaults to llama3.2:1b
 *   GROQ_API_KEY        — enables Groq provider
 *   GROQ_MODEL          — defaults to llama-3.1-70b-versatile
 *   OPENROUTER_API_KEY  — enables OpenRouter provider
 *   OPENROUTER_MODEL    — defaults to meta-llama/llama-3.1-8b-instruct:free
 *   ANTHROPIC_API_KEY   — enables Anthropic/Claude provider
 *   ANTHROPIC_MODEL     — defaults to claude-haiku-4-5-20251001
 *   OPENAI_API_KEY      — enables OpenAI provider
 *   OPENAI_MODEL        — defaults to gpt-4o-mini
 */

'use strict';

// ─── Default models per provider ─────────────────────────────────────────────
const DEFAULTS = {
  ollama:      { model: process.env.OLLAMA_MODEL      || 'llama3.2:1b' },
  groq:        { model: process.env.GROQ_MODEL        || 'llama-3.3-70b-versatile' },
  openrouter:  { model: process.env.OPENROUTER_MODEL  || 'meta-llama/llama-3.1-8b-instruct:free' },
  anthropic:   { model: process.env.ANTHROPIC_MODEL   || 'claude-haiku-4-5-20251001' },
  openai:      { model: process.env.OPENAI_MODEL      || 'gpt-4o-mini' }
};

// ─── Message trimming (keeps total chars under maxChars) ─────────────────────
/**
 * Trim messages array so total character count of all content stays under
 * maxChars. Removes oldest non-system messages first. Always keeps system msg.
 * @param {Array<{role:string,content:string}>} messages
 * @param {number} maxChars
 * @returns {Array}
 */
function trimMessages(messages, maxChars = 8000) {
  // Count total chars
  const totalChars = () => messages.reduce((sum, m) => sum + (m.content || '').length, 0);

  if (totalChars() <= maxChars) return messages;

  // Separate system messages from the rest
  const system = messages.filter(m => m.role === 'system');
  let rest = messages.filter(m => m.role !== 'system');

  // Drop oldest non-system messages until we're under budget
  while (rest.length > 1 && totalChars() > maxChars) {
    rest.shift();
  }

  // If still over, truncate the oldest remaining message content
  const combined = [...system, ...rest];
  let chars = combined.reduce((s, m) => s + (m.content || '').length, 0);
  if (chars > maxChars && combined.length > 0) {
    const excess = chars - maxChars;
    // Truncate from the first non-system message content
    const target = combined.find(m => m.role !== 'system') || combined[0];
    if (target && target.content && target.content.length > excess) {
      target.content = target.content.slice(excess) + '\n[... trimmed ...]';
    }
  }

  return combined;
}

// ─── Fetch wrapper with timeout ───────────────────────────────────────────────
async function fetchJSON(url, options, timeoutMs = 30000) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Ollama (always attempted — free local) ─────────────────────────────────
async function callOllama(messages, options) {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model   = options.model || DEFAULTS.ollama.model;
  const url     = `${baseUrl}/api/chat`;

  const body = {
    model,
    messages: trimMessages(messages),
    stream: false,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens || 1500
    }
  };

  const data = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 25000);

  const content = data.message?.content;
  if (!content) throw new Error('Ollama returned empty content');

  return {
    content,
    provider: 'ollama',
    model,
    tokens: {
      input:  data.prompt_eval_count  || 0,
      output: data.eval_count         || 0
    }
  };
}

// ── 2. Groq (OpenAI-compatible) ───────────────────────────────────────────────
async function callGroq(messages, options) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const model = options.model || DEFAULTS.groq.model;

  const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: trimMessages(messages),
      max_tokens:  options.maxTokens  || 1500,
      temperature: options.temperature ?? 0.6
    })
  }, 30000);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty choices');

  return {
    content,
    provider: 'groq',
    model,
    tokens: {
      input:  data.usage?.prompt_tokens     || 0,
      output: data.usage?.completion_tokens || 0
    }
  };
}

// ── 3. OpenRouter (OpenAI-compatible, multi-model) ────────────────────────────
async function callOpenRouter(messages, options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const model = options.model || DEFAULTS.openrouter.model;

  const data = await fetchJSON('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://shaddai.app',
      'X-Title': 'SHADDAI'
    },
    body: JSON.stringify({
      model,
      messages: trimMessages(messages),
      max_tokens:  options.maxTokens  || 1500,
      temperature: options.temperature ?? 0.7
    })
  }, 30000);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned empty choices');

  return {
    content,
    provider: 'openrouter',
    model,
    tokens: {
      input:  data.usage?.prompt_tokens     || 0,
      output: data.usage?.completion_tokens || 0
    }
  };
}

// ── 4. Anthropic/Claude (different API format) ────────────────────────────────
async function callAnthropic(messages, options) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const model = options.model || DEFAULTS.anthropic.model;

  // Anthropic separates system prompt from the messages array
  const trimmed   = trimMessages(messages);
  const systemMsg = trimmed.find(m => m.role === 'system');
  const userMsgs  = trimmed.filter(m => m.role !== 'system').map(m => ({
    role:    m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content || ''
  }));

  // Anthropic requires at least one user message
  if (userMsgs.length === 0) {
    userMsgs.push({ role: 'user', content: 'Hello' });
  }

  const requestBody = {
    model,
    max_tokens:  options.maxTokens  || 1500,
    temperature: options.temperature ?? 0.7,
    messages:    userMsgs
  };

  if (systemMsg) {
    requestBody.system = systemMsg.content;
  }

  const data = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  }, 35000);

  // Anthropic returns content as an array of blocks
  const content = data.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text)
    .join('') || '';

  if (!content) throw new Error('Anthropic returned empty content');

  return {
    content,
    provider: 'anthropic',
    model,
    tokens: {
      input:  data.usage?.input_tokens  || 0,
      output: data.usage?.output_tokens || 0
    }
  };
}

// ── 5. OpenAI (OpenAI-compatible) ─────────────────────────────────────────────
async function callOpenAI(messages, options) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = options.model || DEFAULTS.openai.model;

  const data = await fetchJSON('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: trimMessages(messages),
      max_tokens:  options.maxTokens  || 1500,
      temperature: options.temperature ?? 0.7
    })
  }, 30000);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty choices');

  return {
    content,
    provider: 'openai',
    model,
    tokens: {
      input:  data.usage?.prompt_tokens     || 0,
      output: data.usage?.completion_tokens || 0
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER CHAIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ordered list of providers. Each entry has:
 *   name     — provider identifier
 *   enabled  — function returning bool (based on env vars)
 *   call     — async function(messages, options) → LLMResult
 */
// Order = speed/quality priority. Fast cloud providers (when keyed) win;
// Ollama is LAST — the free local fallback used only when no cloud key works.
// This makes responses sub-second instead of 20s+ on local llama3.2:1b.
const PROVIDER_CHAIN = [
  {
    name:    'groq',
    enabled: () => Boolean(process.env.GROQ_API_KEY),
    call:    callGroq
  },
  {
    name:    'openrouter',
    enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
    call:    callOpenRouter
  },
  {
    name:    'anthropic',
    enabled: () => Boolean(process.env.ANTHROPIC_API_KEY),
    call:    callAnthropic
  },
  {
    name:    'openai',
    enabled: () => Boolean(process.env.OPENAI_API_KEY),
    call:    callOpenAI
  },
  {
    name:    'ollama',
    enabled: () => true, // free local fallback — only reached if no cloud provider succeeds
    call:    callOllama
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call the LLM using the first available provider in priority order.
 *
 * @param {Array<{role: string, content: string}>} messages
 *   Standard OpenAI-style messages array. System prompt should be first if present.
 *
 * @param {Object} [options={}]
 * @param {string}  [options.model]       Override the default model for the chosen provider
 * @param {number}  [options.temperature] Sampling temperature (0–1). Default: provider default.
 * @param {number}  [options.maxTokens]   Max tokens to generate. Default: 1500.
 * @param {string}  [options.agentName]   For logging only. e.g. "ZEROX"
 *
 * @returns {Promise<{content: string, provider: string, model: string, tokens: {input: number, output: number}}>}
 *
 * @throws {Error} If all providers fail.
 */
async function callLLM(messages, options = {}) {
  const errors = [];

  // brains.js may request a specific provider first (per-agent brain); still fall back through the chain.
  const chain = options.provider
    ? [...PROVIDER_CHAIN].sort((a, b) => (a.name === options.provider ? -1 : b.name === options.provider ? 1 : 0))
    : PROVIDER_CHAIN;

  for (const provider of chain) {
    if (!provider.enabled()) continue;

    try {
      const result = await provider.call(messages, options);
      console.log(`[LLM] provider:${result.provider} model:${result.model} tokens:${result.tokens.input}in/${result.tokens.output}out${options.agentName ? ` agent:${options.agentName}` : ''}`);
      return result;
    } catch (err) {
      const short = err.message?.slice(0, 120) || 'unknown error';
      console.warn(`[LLM] provider:${provider.name} failed — ${short}`);
      errors.push(`${provider.name}: ${short}`);
      // Continue to next provider
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join('\n')}`);
}

/**
 * Returns an array of provider names that are currently configured (have API keys set,
 * or in Ollama's case, are always included since it's free/local).
 *
 * @returns {string[]}
 */
function getAvailableProviders() {
  return PROVIDER_CHAIN
    .filter(p => p.enabled())
    .map(p => p.name);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  callLLM,
  getAvailableProviders,
  trimMessages  // exported for testing
};
