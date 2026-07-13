// sub-billing-webhook.js — SHADDAI Stripe webhook handler (NEXUS)
// -----------------------------------------------------------------------------
// !!! RAW BODY GOTCHA — THE #1 SILENT FAILURE !!!
// Stripe signature verification hashes the EXACT raw request bytes. If any JSON
// body parser (express.json()) runs first, the body is re-serialized and the
// signature check ALWAYS fails with "No signatures found matching the expected
// signature". Therefore this handler MUST be mounted with
//   express.raw({ type: 'application/json' })
// and it MUST be registered BEFORE the global express.json() middleware.
//
// EXACT MOUNT (put these in server-production.js BEFORE app.use(express.json())):
//   const express = require('express');
//   const subBillingWebhook = require('./sub-billing-webhook');
//   app.post('/api/sub-billing/webhook',
//     express.raw({ type: 'application/json' }),
//     subBillingWebhook);
//   // ...then, later, the normal parser + routes:
//   app.use(express.json());
//   app.use('/api/sub-billing', require('./sub-billing-routes'));
//
// Register this webhook with Stripe (test mode) for the events:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
//
// Entitlement is ALWAYS derived here from verified Stripe state, never from a
// client-set flag. Idempotent: duplicate event ids are ignored (Stripe re-delivers).
// -----------------------------------------------------------------------------

'use strict';

const svc = require('./sub-billing-service');

// Express handler. Expects req.body to be a raw Buffer (from express.raw()).
module.exports = function subBillingWebhook(req, res) {
  if (!svc.webhookConfigured()) {
    // Package missing, secret missing, or key missing -> degrade cleanly.
    return res.status(503).json({ error: 'billing not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'missing stripe-signature header' });
  }

  // req.body MUST be the raw Buffer. If a JSON parser ran first it will be a
  // plain object and verification will fail — that is the raw-body gotcha above.
  let event;
  try {
    event = svc.constructWebhookEvent(req.body, sig);
  } catch (err) {
    // Signature mismatch, malformed payload, or raw-body-not-preserved.
    return res.status(400).json({ error: 'signature verification failed', detail: err && err.message });
  }

  try {
    const result = svc.applyWebhookEvent(event); // idempotent upsert of the mirror
    // Always 200 on a verified event so Stripe stops retrying.
    return res.json({ received: true, result });
  } catch (err) {
    // We verified the signature but failed to persist. Return 500 so Stripe
    // retries later (the apply step is idempotent, so retry is safe).
    return res.status(500).json({ error: 'apply failed', detail: err && err.message });
  }
};
