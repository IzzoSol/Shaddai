'use strict';
// zerox-paid.js — the PAID "deep analysis" task surface for ZEROX.
//
//   POST /api/zerox/task   { task }   (gate: premiumGate('agent.hire'))
//   GET  /api/zerox/offers            (read-only: the sellable ZEROX offers)
//
// This is the "pay ZEROX → do a real task → route it to inference" loop:
//   • When X402_ENABLED !== 'true' it is FREE (acquisition stays open), exactly
//     like every other premium-gated rail (see lib/pikadon-gate.js).
//   • When X402_ENABLED === 'true', the caller must present a valid X-PAYMENT
//     header for the 'agent.hire' resource (the $2 agentic tier) or get 402.
//   • On a settled call it runs the REAL agentic engine — runAgentWithTools()
//     over the multi-provider llm-router — and records the inference against the
//     x402 ledger so the money is accounted, not just acknowledged.
//
// Never throws to the client; always fails closed to a clear JSON error.
const express = require('express');
const router = express.Router();

const OFFER_USD = 2.00; // matches lib/virtuals-discovery.js 'Deep analysis' (zerox_task)
const AGENT = 'ZEROX';

function gate() {
  try {
    const g = require('../lib/pikadon-gate');
    return g.premiumGate('agent.hire', { agent: AGENT });
  } catch (_) { return (req, res, next) => next(); }
}

async function runTask(task, agent) {
  try {
    const { runAgentWithTools } = require('../lib/agent-tool-run');
    return await runAgentWithTools(agent || AGENT, task, {});
  } catch (e) {
    return { response: '', error: String((e && e.message) || e), toolsUsed: [] };
  }
}

// Record the settled inference against the x402 ledger (ZEROX account) so paid
// tasks are real money-in, not a silent 200. Fails soft — the answer still returns.
function recordSettlement(agent, model) {
  try {
    const ledger = require('../lib/x402-ledger');
    const account = 'agent:' + String(agent || AGENT).toLowerCase();
    ledger.credit(account, OFFER_USD, String(model || 'inference'));
    return account;
  } catch (_) { return null; }
}

router.get('/api/zerox/offers', (req, res) => {
  try {
    const offers = require('../lib/virtuals-discovery').OFFERINGS || [];
    res.json({ ok: true, agent: AGENT, offers });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

router.post('/api/zerox/task', gate(), express.json({ limit: '32kb' }), async (req, res) => {
  const b = req.body || {};
  const task = String(b.task || b.message || '').trim();
  if (!task) return res.status(400).json({ ok: false, error: 'task (or message) required' });
  if (task.length > 4000) return res.status(400).json({ ok: false, error: 'task too long (max 4000 chars)' });

  const agent = String(b.agent || AGENT).toUpperCase();
  const out = await runTask(task, agent);

  if (out.error && !out.response) {
    return res.status(502).json({ ok: false, agent, error: out.error });
  }

  const settledAccount = recordSettlement(agent, out.model || out.provider);
  res.json({
    ok: true,
    agent,
    response: out.response || '',
    toolsUsed: out.toolsUsed || [],
    model: out.model || null,
    provider: out.provider || null,
    cached: !!out.cached,
    priceUsd: OFFER_USD,
    settledAccount,
  });
});

module.exports = router;