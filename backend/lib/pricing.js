'use strict';

/**
 * SHADDAI — Real compute-cost-based agent pricing.
 *
 * Replaces arbitrary "vibes" prices ($2.50 etc.) with prices derived from the
 * actual token cost of running an agent task on its preferred model, plus a
 * small, explainable platform margin.
 *
 * Pure module: no network, no side effects, never throws.
 *
 * @module backend/lib/pricing
 */

/**
 * Public model rates in USD per 1,000 tokens (input / output).
 * Sourced from realistic 2025 public list prices. Local/free tiers are 0.
 *
 * Keep these conservative & explainable — the goal is honest, defensible prices,
 * not exact-to-the-cent provider billing.
 */
const MODEL_RATES = {
  // Groq — Llama 3.3 70B Versatile (fast, very cheap)
  'groq-70b': { inputPer1k: 0.00059, outputPer1k: 0.00079, label: 'groq llama-3.3-70b' },

  // Google Gemini 1.5 Flash (effectively free / near-free at low volume)
  'gemini-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003, label: 'gemini-1.5-flash' },

  // Anthropic Claude 3.5 Haiku
  'claude-haiku': { inputPer1k: 0.0008, outputPer1k: 0.004, label: 'claude-3.5-haiku' },

  // Local Ollama — no marginal cost
  'ollama-local': { inputPer1k: 0, outputPer1k: 0, label: 'ollama-local' },

  // OpenRouter free-tier models — no marginal cost
  'openrouter-free': { inputPer1k: 0, outputPer1k: 0, label: 'openrouter-free' },
};

/**
 * Per-agent preferred model. Heavy-reasoning/security agents use Haiku;
 * the rest use the cheap fast Groq 70B.
 */
const AGENT_MODELS = {
  SHADDAI: 'groq-70b',
  NEXUS: 'groq-70b',
  ZEROX: 'groq-70b',
  TURTLE: 'groq-70b',
  QUILL: 'groq-70b',
  ORACLE: 'claude-haiku',
  PIKADON: 'claude-haiku',
};

const ALL_AGENTS = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];

/**
 * Workload model for a "typical" agent task.
 * A task runs a short tool-loop: a few iterations, each consuming context in
 * and producing a modest output.
 */
const TASK_MODEL = {
  iterations: 4,
  inputTokensPerIter: 1500,
  outputTokensPerIter: 600,
};

/** Platform pricing policy. */
const MARGIN = 2; // charge 2x raw compute cost
const MIN_PRICE = 0.05; // floor so free/local models still cover overhead
const MAX_PRICE = 1.0; // ceiling so a single task stays affordable

/** Safely look up a model rate, defaulting to the cheap Groq rate. */
function resolveModel(modelKey) {
  if (modelKey && Object.prototype.hasOwnProperty.call(MODEL_RATES, modelKey)) {
    return modelKey;
  }
  return 'groq-70b';
}

/** Round a USD number to whole cents. */
function roundCents(usd) {
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

/** Clamp a number into [min, max]. */
function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Estimate the USD price to hire an agent for one task.
 *
 * @param {string} agent  Agent name (e.g. "NEXUS"). Case-insensitive.
 * @param {object} [opts]
 * @param {string} [opts.model]               Override the agent's preferred model key.
 * @param {number} [opts.iterations]          Override tool-loop iterations.
 * @param {number} [opts.inputTokensPerIter]  Override input tokens per iteration.
 * @param {number} [opts.outputTokensPerIter] Override output tokens per iteration.
 * @param {number} [opts.margin]              Override the platform margin multiplier.
 * @returns {{priceUsd:number, model:string, modelLabel:string, basis:string,
 *            computeUsd:number, inputTokens:number, outputTokens:number,
 *            totalTokens:number, iterations:number, margin:number}}
 */
function estimateAgentPrice(agent, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};

  const agentKey = typeof agent === 'string' ? agent.toUpperCase() : '';
  const preferred = AGENT_MODELS[agentKey] || 'groq-70b';
  const modelKey = resolveModel(options.model || preferred);
  const rate = MODEL_RATES[modelKey];

  const iterations = Number.isFinite(options.iterations) && options.iterations > 0
    ? options.iterations
    : TASK_MODEL.iterations;
  const inPerIter = Number.isFinite(options.inputTokensPerIter) && options.inputTokensPerIter >= 0
    ? options.inputTokensPerIter
    : TASK_MODEL.inputTokensPerIter;
  const outPerIter = Number.isFinite(options.outputTokensPerIter) && options.outputTokensPerIter >= 0
    ? options.outputTokensPerIter
    : TASK_MODEL.outputTokensPerIter;

  const inputTokens = iterations * inPerIter;
  const outputTokens = iterations * outPerIter;
  const totalTokens = inputTokens + outputTokens;

  const margin = Number.isFinite(options.margin) && options.margin > 0 ? options.margin : MARGIN;

  const computeUsd =
    (inputTokens / 1000) * rate.inputPer1k + (outputTokens / 1000) * rate.outputPer1k;

  const rawPrice = computeUsd * margin;
  const priceUsd = roundCents(clamp(rawPrice, MIN_PRICE, MAX_PRICE));

  const tokensK = Math.round(totalTokens / 100) / 10; // e.g. 8.4k
  const basis = `~${tokensK}k tokens @ ${modelKey} ×${margin} margin`;

  return {
    priceUsd,
    model: modelKey,
    modelLabel: rate.label,
    basis,
    computeUsd: roundCents(computeUsd * 1000) / 1000, // keep a little precision for display
    inputTokens,
    outputTokens,
    totalTokens,
    iterations,
    margin,
  };
}

/**
 * Build the explainable price table for all 7 agents.
 *
 * @returns {Object.<string, {priceUsd:number, model:string, basis:string}>}
 */
function priceTable() {
  const table = {};
  for (const agent of ALL_AGENTS) {
    const est = estimateAgentPrice(agent);
    table[agent] = {
      priceUsd: est.priceUsd,
      model: est.model,
      basis: est.basis,
    };
  }
  return table;
}

module.exports = {
  MODEL_RATES,
  AGENT_MODELS,
  TASK_MODEL,
  MARGIN,
  MIN_PRICE,
  MAX_PRICE,
  estimateAgentPrice,
  priceTable,
};
