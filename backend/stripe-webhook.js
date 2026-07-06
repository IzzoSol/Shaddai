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
  founder:     { tier: 'pro',   credits: 26000, note: 'founder (lifetime) — 26000 credits ≈ $200 at pack rate, honors pricing promise' },
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

// uid ↔ stripeCustomerId map — captured at checkout so LATER lifecycle events
// (subscription.deleted / invoice.payment_succeeded) which carry only the Stripe
// customer id can resolve back to our internal uid. Durable JSON backup; also
// mirrored onto the live billing record so billing-service's own reverse lookup
// resolves after this.
const CUSTOMER_MAP_FILE = path.join(__dirname, 'data', 'stripe-customers.json');
function loadCustomerMap() { try { return JSON.parse(fs.readFileSync(CUSTOMER_MAP_FILE, 'utf8')); } catch (_) { return {}; } }
function saveCustomerMap(m) { try { fs.writeFileSync(CUSTOMER_MAP_FILE, JSON.stringify(m, null, 2)); } catch (_) {} }
function mapCustomer(customerId, uid) {
  if (!customerId || !uid || uid === 'guest') return;
  const m = loadCustomerMap();
  if (m[customerId] !== uid) { m[customerId] = uid; saveCustomerMap(m); }
}
function uidForCustomer(customerId) {
  if (!customerId) return null;
  const m = loadCustomerMap();
  return m[customerId] || null;
}
// Mirror the stripe customer id onto the (live) billing record so billing-service's
// own stripeCustomerId reverse lookup + reset logic works. getCustomer returns the
// live object reference, so this mutation sticks.
function linkBillingRecord(uid, customerId) {
  if (!uid || !customerId || !billing) return;
  try {
    const c = billing.getCustomer(uid);
    if (c && c.stripeCustomerId !== customerId) c.stripeCustomerId = customerId;
  } catch (_) {}
}

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
        // Capture the Stripe customer id so later subscription/invoice events resolve to this uid.
        if (s.customer) { mapCustomer(s.customer, uid); linkBillingRecord(uid, s.customer); }
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

    // ── SUBSCRIPTION LIFECYCLE ────────────────────────────────────────────────
    // Churned/renewed users must not keep a paid tier forever. These events carry
    // only the Stripe customer id, so we resolve the uid from the checkout-time map.
    else if (
      event.type === 'customer.subscription.deleted' ||
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'customer.subscription.updated'
    ) {
      const obj = event.data.object || {};
      const customerId = obj.customer;
      const uid = uidForCustomer(customerId);

      // Idempotency — skip if we've already handled this exact event id.
      const processed = loadProcessed();
      if (processed.has(event.id)) return res.json({ received: true, duplicate: true });

      if (!uid || !billing) {
        console.warn(`[stripe-webhook] ${event.type} for customer ${customerId} — no uid mapping (checkout predates map?)`);
      } else {
        // Ensure billing-service's own reverse lookup + reset logic can resolve this uid.
        linkBillingRecord(uid, customerId);

        if (event.type === 'customer.subscription.deleted') {
          // Churned → downgrade to free.
          try {
            await billing.updateSubscription(uid, 'free');
            console.log(`[stripe-webhook] subscription cancelled — downgraded ${uid} to free`);
          } catch (e) { console.warn('[stripe-webhook] downgrade failed:', e.message); }
        } else if (event.type === 'invoice.payment_succeeded') {
          // Successful renewal → reset monthly credits for the current tier.
          // billing.handleWebhook performs the reset AND persists it (no public setter exists),
          // resolving the uid via the stripeCustomerId we just linked above.
          try {
            if (typeof billing.handleWebhook === 'function') await billing.handleWebhook(event);
            console.log(`[stripe-webhook] invoice paid — reset monthly credits for ${uid}`);
          } catch (e) { console.warn('[stripe-webhook] credit reset failed:', e.message); }
        } else if (event.type === 'customer.subscription.updated') {
          // Tier/status change from Stripe (plan swap, past_due, etc.) — let billing sync it.
          try { if (typeof billing.handleWebhook === 'function') await billing.handleWebhook(event); }
          catch (e) { console.warn('[stripe-webhook] subscription update sync failed:', e.message); }
        }
      }
      processed.add(event.id);
      saveProcessed(processed);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook] handler error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
