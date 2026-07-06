'use strict';
// ============================================================================
// Stripe webhook — grants tier/credits when a hosted Payment Link checkout
// completes. This is the piece that turns "money in Stripe" into "user actually
// upgraded / got credits" in billing-service.
//
// Mounted in server-production.js with express.raw() BEFORE express.json(), because
// signature verification needs the RAW request body.
//
// Setup: after deploying, create an endpoint at dashboard.stripe.com/webhooks
//   URL:    https://<your-domain>/api/stripe/webhook
//   Event:  checkout.session.completed
// then paste the signing secret into .env as STRIPE_WEBHOOK_SECRET=whsec_...
// ============================================================================
const fs = require('fs');
const path = require('path');
let billing = null; try { billing = require('./billing-service'); } catch (_) {}
let Stripe = null;  try { Stripe = require('stripe'); } catch (_) {}

// item id (from payment-config.json) -> what it grants.
// Tiers map to billing-service tiers (free/pro/elite). Founder = lifetime Pro + bonus credits.
// Credit packs add credits (billing-service credit scale). Tune here.
const GRANTS = {
  founder:     { tier: 'pro',   credits: 5000, note: 'founder (lifetime)' },
  builder:     { tier: 'pro' },
  pro:         { tier: 'pro' },
  alpha:       { tier: 'elite' },
  credits_10:  { credits: 1000 },
  credits_25:  { credits: 2750 },
  credits_50:  { credits: 6000 },
  credits_100: { credits: 13000 },
};

// Idempotency — Stripe retries webhooks; never grant twice for the same session.
const PROCESSED_FILE = path.join(__dirname, 'data', 'stripe-processed.json');
function loadProcessed() { try { return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8'))); } catch (_) { return new Set(); } }
function saveProcessed(set) { try { fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...set].slice(-5000))); } catch (_) {} }

// client_reference_id is "uid-item" (Firebase uids have no hyphen; item may contain underscores).
function parseRef(ref) {
  if (!ref) return {};
  const i = ref.indexOf('-');
  if (i < 0) return { uid: ref };                       // legacy: uid only
  return { uid: ref.slice(0, i), item: ref.slice(i + 1) };
}

module.exports = async function stripeWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];
  if (!secret || !Stripe) {
    return res.status(503).json({ ok: false, error: 'webhook not configured — set STRIPE_WEBHOOK_SECRET' });
  }
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_live_placeholder');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);   // req.body MUST be the raw Buffer
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'bad signature: ' + e.message });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const processed = loadProcessed();
      if (processed.has(s.id)) return res.json({ received: true, duplicate: true });

      const { uid, item } = parseRef(s.client_reference_id);
      if (uid && uid !== 'guest' && billing) {
        const email = (s.customer_details && s.customer_details.email) || undefined;
        try { await billing.getOrCreateCustomer(uid, email); } catch (_) {}
        const g = GRANTS[item];
        if (g) {
          if (g.tier)    { try { await billing.updateSubscription(uid, g.tier); } catch (e) { console.warn('[stripe-webhook] tier grant failed:', e.message); } }
          if (g.credits) { try { billing.credit(uid, g.credits, 'stripe:' + item); } catch (e) { console.warn('[stripe-webhook] credit grant failed:', e.message); } }
          console.log(`[stripe-webhook] granted "${item}" to ${uid}` + (g.credits ? ` (+${g.credits} credits)` : ''));
        } else {
          console.warn('[stripe-webhook] unknown item "' + item + '" (amount ' + s.amount_total + ') — no grant');
        }
      } else {
        console.warn('[stripe-webhook] no uid on session ' + s.id + ' — cannot attribute (guest checkout?)');
      }
      processed.add(s.id);
      saveProcessed(processed);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook] handler error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
