// sub-billing-routes.js — SHADDAI subscription + unlock routes (NEXUS)
// -----------------------------------------------------------------------------
// Express Router for the subscription/unlock paywall. Mount AFTER the global
// json body parser (these routes read JSON bodies normally).
//
//   const subBillingRoutes = require('./sub-billing-routes');
//   app.use('/api/sub-billing', subBillingRoutes);
//
// The Stripe WEBHOOK is a SEPARATE handler (sub-billing-webhook.js) that MUST be
// mounted BEFORE express.json() because Stripe signature verification needs the
// raw request body. See sub-billing-webhook.js and the mount notes.
//
// GRACEFUL DEGRADE: if the `stripe` package or STRIPE_SECRET_KEY is missing,
// every checkout route returns 503 {error:'billing not configured'}. The
// entitlement read still works (returns free/default) so the app keeps running.
// -----------------------------------------------------------------------------

'use strict';

const express = require('express');
const router = express.Router();
const svc = require('./sub-billing-service');

function unconfigured(res) {
  return res.status(503).json({ error: 'billing not configured' });
}

// GET /health — quick status probe (safe to expose).
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    configured: svc.isConfigured(),
    webhookConfigured: svc.webhookConfigured(),
    tiers: Object.keys(svc.TIERS),
  });
});

// GET /tiers — tier + price metadata for the pricing UI.
router.get('/tiers', (req, res) => {
  const out = {};
  for (const [name, cfg] of Object.entries(svc.TIERS)) {
    out[name] = { label: cfg.label, priceUsd: cfg.priceUsd, rank: cfg.rank };
  }
  res.json({ tiers: out });
});

// POST /checkout/subscribe  { tier, userId } -> { url }
router.post('/checkout/subscribe', async (req, res) => {
  if (!svc.isConfigured()) return unconfigured(res);
  try {
    const { tier, userId } = req.body || {};
    const r = await svc.createSubscriptionCheckout({ tier, userId });
    res.json({ url: r.url, id: r.id, tier: r.tier });
  } catch (e) {
    if (e && e.code === 'BILLING_UNCONFIGURED') return unconfigured(res);
    const bad = e && (e.code === 'BAD_TIER' || e.code === 'BAD_USER');
    res.status(bad ? 400 : 500).json({ error: e && e.message ? e.message : 'checkout failed' });
  }
});

// POST /checkout/unlock  { userId, item, priceCents, label } -> { url }
// Fastest-first-dollar per-deliverable paywall (e.g. "Unlock this clip — $2.99").
router.post('/checkout/unlock', async (req, res) => {
  if (!svc.isConfigured()) return unconfigured(res);
  try {
    const { userId, item, priceCents, label } = req.body || {};
    const r = await svc.createUnlockCheckout({ userId, item, priceCents, label });
    res.json({ url: r.url, id: r.id, item: r.item, priceCents: r.priceCents });
  } catch (e) {
    if (e && e.code === 'BILLING_UNCONFIGURED') return unconfigured(res);
    const bad = e && ['BAD_USER', 'BAD_ITEM', 'BAD_PRICE'].includes(e.code);
    res.status(bad ? 400 : 500).json({ error: e && e.message ? e.message : 'checkout failed' });
  }
});

// GET /entitlement/:userId -> current tier + active flag (derived from Stripe
// webhook mirror; never a client-set flag).
router.get('/entitlement/:userId', (req, res) => {
  const ent = svc.getEntitlement(req.params.userId);
  res.json(ent);
});

// GET /unlock/:userId/:item -> { unlocked: bool }  (has this deliverable been paid for?)
router.get('/unlock/:userId/:item', (req, res) => {
  res.json({
    userId: req.params.userId,
    item: req.params.item,
    unlocked: svc.isUnlocked(req.params.userId, req.params.item),
  });
});

module.exports = router;
