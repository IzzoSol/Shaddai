// backend/paybox-routes.js — customer-facing Paybox endpoints, mounted at /api/paybox.
// Separate from federation-routes.js (that's for EXTERNAL bots/agents calling SHADDAI's
// agents over MCP) — this is SHADDAI's own site talking to its own agents' wallets.
'use strict';
const express = require('express');
const router = express.Router();
const json = express.json();
let guard = null; try { guard = require('./paybox-guard'); } catch (e) { console.warn('[paybox-routes] paybox-guard unavailable:', e.message); }

// GET /api/paybox/tip-link?agent=ZEROX&amount_usd=5
// Generates a real MoonPay checkout URL that lands funds straight into that agent's
// Paybox wallet. Uses get_buy_link — a READ-ONLY Paybox tool ("Generating the link
// needs no approval, touches no key, and moves no money" per its own description), so
// this works regardless of paybox-config.json's enabled flag; a tip is money coming IN,
// not the agent spending, so the spend-gate doesn't apply here.
//
// tip_credentials in paybox-config.json currently points ZEROX at the general
// evm-default wallet — update it once ZEROX's own dedicated wallets ("Xerox Fomo
// Robinhood"/"Xerox Fomo Solana") are granted + their fresh signing key is pasted back
// into Paybox (owner action, pending as of 2026-08-29).
router.get('/tip-link', json, async (req, res) => {
  if (!guard) return res.status(501).json({ ok: false, error: 'Paybox guard unavailable' });
  const agent = String(req.query.agent || 'ZEROX').toUpperCase();
  const cfg = guard.getConfig();
  const credentialId = cfg.tip_credentials && cfg.tip_credentials[agent];
  if (!credentialId) return res.status(404).json({ ok: false, error: `No tip wallet configured for "${agent}"` });

  const amount = req.query.amount_usd ? Number(req.query.amount_usd) : undefined;
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 10000)) {
    return res.status(400).json({ ok: false, error: 'amount_usd must be a positive number (max 10000)' });
  }

  const r = await guard.payboxRead('get_buy_link', { credential_id: credentialId, amount_usd: amount }, agent);
  if (!r.ok) return res.status(502).json({ ok: false, error: r.output });
  res.json({ ok: true, agent, checkout_url: r.output && r.output.url, raw: r.output });
});

module.exports = router;
