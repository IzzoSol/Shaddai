'use strict';
/**
 * SHADDAI x402 — "agents can take payments".
 * Exposes paid agent-hire endpoints gated by the x402 micropayment layer.
 *
 * Mount (in server-production.js):
 *   app.use('/api/x402/agent', require('./x402-agent-routes'));
 *
 * Routes:
 *   GET  /            → x402 discovery doc, filtered to agent endpoints.
 *   POST /:name/hire  → pay (x402 'agent.hire'), then run agent `:name`.
 *
 * SAFETY: dev-permissive. When X402_ENABLED!=='true', requirePayment is a
 * no-op so the agent runs FREE locally (good for dev). When enabled, callers
 * must supply a valid X-PAYMENT header (402 otherwise).
 */
const express = require('express');
const x402 = require('./lib/x402');

const router = express.Router();

// ── Discovery: only the agent-hire slice of the x402 catalog ──
router.get('/', (req, res) => {
  const doc = x402.discovery();
  const endpoints = (doc.endpoints || []).filter(
    e => e.resource === 'agent.hire' || String(e.path || '').startsWith('/api/x402/agent')
  );
  res.json(Object.assign({}, doc, { endpoints }));
});

// ── Hire an agent: gated by x402 payment for 'agent.hire' ──
router.post('/:name/hire', x402.requirePayment('agent.hire'), async (req, res) => {
  try {
    const eng = require('./agent-engine');
    const goal = (req.body && req.body.task) || 'do your job';
    const agent = String(req.params.name).toUpperCase();
    const t = eng.createTask(goal, agent);
    await eng.runAgentLoop(t.id);
    res.json(eng.getTask(t.id));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

module.exports = router;
