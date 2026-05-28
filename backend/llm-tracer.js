'use strict';
// Lightweight LLM call tracer — logs all LLM calls with timing, tokens, provider
// Writes to backend/logs/llm-traces.jsonl (newline-delimited JSON, one line per call)
// Also exposes in-memory ring buffer (last 200 calls) for the dashboard

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'logs', 'llm-traces.jsonl');
const RING_SIZE = 200;
const _ring = [];
let _totalCalls = 0;
let _totalTokens = 0;
let _totalCostUSD = 0;

// Cost per 1M tokens (input) — rough estimates
const COST_TABLE = {
  'llama3.2:1b': 0,      // Ollama — free
  'llama3.2:3b': 0,
  'llama-3.1-70b-versatile': 0.59,   // Groq
  'llama-3.1-8b-instant': 0.05,
  'claude-haiku-4-5-20251001': 0.25,
  'claude-sonnet-4-6': 3.00,
  'gpt-4o-mini': 0.15,
  'default': 0.10
};

function estimateCost(model, inputTokens, outputTokens, provider) {
  // Local providers are always free — never bill them.
  if (provider === 'ollama' || provider === 'lmstudio' || provider === 'janai' || provider === 'shaddai_agent' || provider === 'local') return 0;
  // Use ?? not || so a legitimate 0 rate isn't overridden by the default.
  const inputRate = COST_TABLE[model] ?? COST_TABLE.default;
  const outputRate = inputRate * 2; // output typically 2x input cost
  return ((inputTokens * inputRate) + (outputTokens * outputRate)) / 1_000_000;
}

function trace(event) {
  // event: { provider, model, agentName, inputTokens, outputTokens, durationMs, success, error, exact }
  const record = {
    ts: new Date().toISOString(),
    id: `trace_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    ...event,
    costUSD: estimateCost(event.model || 'default', event.inputTokens || 0, event.outputTokens || 0, event.provider)
  };

  _ring.push(record);
  if (_ring.length > RING_SIZE) _ring.shift();
  _totalCalls++;
  _totalTokens += (record.inputTokens || 0) + (record.outputTokens || 0);
  _totalCostUSD += record.costUSD;

  // Append to log file (async, don't block)
  fs.appendFile(LOG_PATH, JSON.stringify(record) + '\n', () => {});

  return record;
}

function getStats() {
  const byProvider = {};
  const byAgent = {};
  _ring.forEach(r => {
    byProvider[r.provider] = (byProvider[r.provider] || { calls: 0, tokens: 0, costUSD: 0 });
    byProvider[r.provider].calls++;
    byProvider[r.provider].tokens += (r.inputTokens || 0) + (r.outputTokens || 0);
    byProvider[r.provider].costUSD += r.costUSD;
    if (r.agentName) {
      byAgent[r.agentName] = (byAgent[r.agentName] || { calls: 0 });
      byAgent[r.agentName].calls++;
    }
  });
  return {
    totalCalls: _totalCalls,
    totalTokens: _totalTokens,
    totalCostUSD: Number(_totalCostUSD.toFixed(6)),
    recentCalls: _ring.length,
    byProvider,
    byAgent,
    last10: _ring.slice(-10)
  };
}

module.exports = { trace, getStats };
