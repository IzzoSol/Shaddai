// sub-billing-service.js — SHADDAI Stripe subscriptions + unlocks (NEXUS)
// -----------------------------------------------------------------------------
// Real Stripe subscriptions + one-time "unlock" Checkout, TEST-MODE ready.
//
// NOTE ON FILENAME: the repo already has an unrelated credit-ledger billing
// system (`billing-service.js` / `billing-routes.js`, tiers Free/Pro/Elite).
// This module is the SEPARATE subscription+unlock paywall requested (tiers
// free/builder/pro/creator). It is namespaced `sub-billing-*` so it mounts
// alongside the existing system WITHOUT clobbering it.
//
// GRACEFUL DEGRADE: the `stripe` npm package may not be installed yet, and the
// STRIPE_SECRET_KEY may be absent. This module NEVER throws on require/boot.
// If billing is not configured, isConfigured() returns false and the route
// layer returns a clean 503 {error:'billing not configured'}. Server boots fine.
//
// Owner setup:
//   npm i stripe
//   set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and the price IDs
//   (see .env.billing.example). Use Stripe TEST keys (sk_test_..., whsec_...).
//
// LAW/SAFETY: closed-loop. Money flows IN only (subscriptions + unlocks in USD).
// There is NO refund-to-balance and NO cash-out here, by design. In-app currency
// is called "Sparks" but this service only ever deals in USD via Stripe.
// -----------------------------------------------------------------------------

'use strict';

const fs = require('fs');
const path = require('path');

// ---- Guarded Stripe load -----------------------------------------------------
let Stripe = null;
try {
  Stripe = require('stripe'); // may not be installed yet
} catch (_e) {
  Stripe = null; // absent package -> unconfigured, not a crash
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

let stripe = null;
if (Stripe && STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  } catch (_e) {
    stripe = null; // bad key -> stay unconfigured rather than crash
  }
}

function isConfigured() {
  return !!stripe;
}
function webhookConfigured() {
  return !!(stripe && STRIPE_WEBHOOK_SECRET);
}

// ---- Tier / price mapping ----------------------------------------------------
// Entitlements per tier. `free` is the implicit default (no Stripe object).
const TIERS = {
  free:    { rank: 0, label: 'Free',    priceUsd: 0,     priceEnv: null },
  builder: { rank: 1, label: 'Builder', priceUsd: 9.99,  priceEnv: 'STRIPE_PRICE_BUILDER' },
  pro:     { rank: 2, label: 'Pro',     priceUsd: 29.99, priceEnv: 'STRIPE_PRICE_PRO' },
  creator: { rank: 3, label: 'Creator', priceUsd: 79,    priceEnv: 'STRIPE_PRICE_CREATOR' },
};

function tierRank(tier) {
  const t = TIERS[String(tier || 'free').toLowerCase()];
  return t ? t.rank : 0;
}

// Map a Stripe price ID (from a subscription line) back to a tier name.
function tierFromPriceId(priceId) {
  if (!priceId) return null;
  for (const [name, cfg] of Object.entries(TIERS)) {
    if (cfg.priceEnv && process.env[cfg.priceEnv] && process.env[cfg.priceEnv] === priceId) return name;
  }
  return null;
}

function priceIdForTier(tier) {
  const cfg = TIERS[String(tier || '').toLowerCase()];
  if (!cfg || !cfg.priceEnv) return null;
  return process.env[cfg.priceEnv] || null;
}

// ---- Local JSON mirror (atomic) ---------------------------------------------
// The subscriptions/unlocks mirror is the SOURCE OF TRUTH for entitlement, and
// it is ONLY ever written from verified Stripe webhook events (never from a
// client-set flag). If an "economy store" module exists we prefer it; otherwise
// we fall back to this atomic JSON file.
const DATA_DIR = path.join(__dirname, 'data');
const MIRROR_FILE = path.join(DATA_DIR, 'entitlements.json');

// Optional economy store integration. If backend/economy-store.js exists and
// exposes getEntitlement, we use it. Kept optional so this module has zero hard deps.
let economy = null;
try {
  // eslint-disable-next-line global-require
  economy = require('./economy-store');
  if (!economy || typeof economy.getEntitlement !== 'function') economy = null;
} catch (_e) {
  economy = null;
}

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_e) {}
}

function readMirror() {
  try {
    const raw = fs.readFileSync(MIRROR_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object') {
      return {
        subscriptions: j.subscriptions && typeof j.subscriptions === 'object' ? j.subscriptions : {},
        unlocks: j.unlocks && typeof j.unlocks === 'object' ? j.unlocks : {},
        processedEvents: Array.isArray(j.processedEvents) ? j.processedEvents : [],
      };
    }
  } catch (_e) {}
  return { subscriptions: {}, unlocks: {}, processedEvents: [] };
}

function writeMirror(state) {
  ensureDir();
  // Cap the processed-event list so it can't grow without bound.
  if (Array.isArray(state.processedEvents) && state.processedEvents.length > 5000) {
    state.processedEvents = state.processedEvents.slice(-5000);
  }
  const tmp = MIRROR_FILE + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, MIRROR_FILE); // atomic replace on same filesystem
}

// ---- Entitlement read --------------------------------------------------------
// Returns { userId, tier, active, status, currentPeriodEnd, customerId, source }.
// active === true means an in-good-standing paid subscription (or free = rank 0).
function getEntitlement(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return { userId: '', tier: 'free', active: false, status: 'none', source: 'invalid' };

  if (economy) {
    try {
      const e = economy.getEntitlement(uid);
      if (e) {
        const paid = e.tier && e.tier !== 'free';
        return {
          userId: uid,
          tier: e.tier || 'free',
          active: paid ? (e.status === 'active' || e.status === 'trialing') : true,
          status: e.status || 'active',
          currentPeriodEnd: e.currentPeriodEnd || null,
          customerId: e.customerId || null,
          source: 'economy',
        };
      }
    } catch (_e) { /* fall through to mirror */ }
  }

  const mirror = readMirror();
  const sub = mirror.subscriptions[uid];
  if (!sub) {
    return { userId: uid, tier: 'free', active: true, status: 'none', currentPeriodEnd: null, customerId: null, source: 'default' };
  }
  const paidActive = sub.status === 'active' || sub.status === 'trialing';
  return {
    userId: uid,
    tier: paidActive ? (sub.tier || 'free') : 'free',
    active: paidActive,
    status: sub.status || 'unknown',
    currentPeriodEnd: sub.currentPeriodEnd || null,
    customerId: sub.customerId || null,
    source: 'mirror',
  };
}

function isUnlocked(userId, item) {
  const uid = String(userId || '').trim();
  const it = String(item || '').trim();
  if (!uid || !it) return false;
  if (economy && typeof economy.isUnlocked === 'function') {
    try { return !!economy.isUnlocked(uid, it); } catch (_e) {}
  }
  const mirror = readMirror();
  const key = uid + '::' + it;
  return !!mirror.unlocks[key];
}

// ---- Checkout creation -------------------------------------------------------
const APP_URL = process.env.APP_URL || process.env.PUBLIC_URL || 'http://localhost:3000';

async function createSubscriptionCheckout({ tier, userId }) {
  if (!isConfigured()) { const e = new Error('billing not configured'); e.code = 'BILLING_UNCONFIGURED'; throw e; }
  const t = String(tier || '').toLowerCase();
  if (!TIERS[t] || t === 'free') { const e = new Error('invalid tier'); e.code = 'BAD_TIER'; throw e; }
  const priceId = priceIdForTier(t);
  if (!priceId) { const e = new Error('price id not set for tier ' + t); e.code = 'BILLING_UNCONFIGURED'; throw e; }
  const uid = String(userId || '').trim();
  if (!uid) { const e = new Error('userId required'); e.code = 'BAD_USER'; throw e; }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: uid,
    // subscription_data.metadata rides through to the subscription object so the
    // webhook can map subscription.updated/deleted back to the user + tier.
    subscription_data: { metadata: { userId: uid, tier: t } },
    metadata: { userId: uid, tier: t, kind: 'subscription' },
    allow_promotion_codes: true,
    success_url: APP_URL + '/?billing=success&tier=' + encodeURIComponent(t),
    cancel_url: APP_URL + '/?billing=cancel',
  });
  return { url: session.url, id: session.id, tier: t };
}

async function createUnlockCheckout({ userId, item, priceCents, label }) {
  if (!isConfigured()) { const e = new Error('billing not configured'); e.code = 'BILLING_UNCONFIGURED'; throw e; }
  const uid = String(userId || '').trim();
  const it = String(item || '').trim();
  if (!uid) { const e = new Error('userId required'); e.code = 'BAD_USER'; throw e; }
  if (!it) { const e = new Error('item required'); e.code = 'BAD_ITEM'; throw e; }
  const cents = Math.round(Number(priceCents));
  if (!Number.isFinite(cents) || cents < 50 || cents > 100000) {
    // Stripe min is 50 cents USD; upper bound is a sanity cap for a per-deliverable unlock.
    const e = new Error('priceCents must be an integer 50..100000'); e.code = 'BAD_PRICE'; throw e;
  }
  const name = String(label || ('Unlock ' + it)).slice(0, 250);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: cents,
        product_data: { name },
      },
    }],
    client_reference_id: uid,
    metadata: { userId: uid, item: it, kind: 'unlock' },
    payment_intent_data: { metadata: { userId: uid, item: it, kind: 'unlock' } },
    success_url: APP_URL + '/?unlock=success&item=' + encodeURIComponent(it),
    cancel_url: APP_URL + '/?unlock=cancel&item=' + encodeURIComponent(it),
  });
  return { url: session.url, id: session.id, item: it, priceCents: cents };
}

// ---- Webhook application (idempotent) ---------------------------------------
// applyWebhookEvent(event) upserts the mirror from a VERIFIED Stripe event.
// Idempotent: duplicate event ids (Stripe re-delivers) are ignored.
function upsertSubscription(state, userId, patch) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const cur = state.subscriptions[uid] || {};
  state.subscriptions[uid] = Object.assign({}, cur, patch, { updatedAt: Date.now() });
}

function applyWebhookEvent(event) {
  if (!event || !event.id) return { ok: false, reason: 'no event' };
  const state = readMirror();

  if (state.processedEvents.includes(event.id)) {
    return { ok: true, duplicate: true };
  }

  const type = event.type;
  const obj = event.data && event.data.object ? event.data.object : {};

  if (type === 'checkout.session.completed') {
    const md = obj.metadata || {};
    const uid = md.userId || obj.client_reference_id || '';
    if (obj.mode === 'subscription') {
      upsertSubscription(state, uid, {
        tier: md.tier || 'builder',
        status: 'active',
        customerId: obj.customer || null,
        subscriptionId: obj.subscription || null,
      });
    } else if (obj.mode === 'payment') {
      // One-time unlock completed & paid.
      const item = md.item || '';
      if (uid && item && obj.payment_status === 'paid') {
        state.unlocks[uid + '::' + item] = {
          userId: uid, item, at: Date.now(),
          amount: obj.amount_total || null,
          sessionId: obj.id || null,
        };
      }
    }
  } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const md = obj.metadata || {};
    const uid = md.userId || '';
    // Derive tier from the subscription's price; fall back to metadata tier.
    let tier = md.tier || null;
    try {
      const priceId = obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].price && obj.items.data[0].price.id;
      const mapped = tierFromPriceId(priceId);
      if (mapped) tier = mapped;
    } catch (_e) {}
    const status = type === 'customer.subscription.deleted' ? 'canceled' : (obj.status || 'unknown');
    if (uid) {
      upsertSubscription(state, uid, {
        tier: (status === 'active' || status === 'trialing') ? (tier || 'builder') : 'free',
        status,
        customerId: obj.customer || null,
        subscriptionId: obj.id || null,
        currentPeriodEnd: obj.current_period_end ? obj.current_period_end * 1000 : null,
      });
    }
  } else {
    // Unhandled event type: mark processed so we don't reprocess, then no-op.
    state.processedEvents.push(event.id);
    writeMirror(state);
    return { ok: true, ignored: type };
  }

  state.processedEvents.push(event.id);

  // Mirror into the economy store too, if present.
  if (economy && typeof economy.applyBillingState === 'function') {
    try { economy.applyBillingState(state); } catch (_e) {}
  }

  writeMirror(state);
  return { ok: true, type };
}

// Verify + construct a Stripe event from a raw body + signature header.
// Throws if signature invalid. Caller MUST pass the RAW (Buffer) body.
function constructWebhookEvent(rawBody, signature) {
  if (!webhookConfigured()) { const e = new Error('webhook not configured'); e.code = 'BILLING_UNCONFIGURED'; throw e; }
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

// ---- Entitlement middleware --------------------------------------------------
// requireTier('pro') -> express middleware that 402s if the caller's tier rank
// is below the minimum. User id is read from req.userId / req.user.uid / header
// / query / body (in that order) so it works regardless of the auth layer.
function resolveUserId(req) {
  return (
    (req.userId) ||
    (req.user && (req.user.uid || req.user.id)) ||
    req.get('x-user-id') ||
    (req.query && req.query.userId) ||
    (req.body && req.body.userId) ||
    ''
  );
}

function requireTier(minTier) {
  const min = tierRank(minTier);
  return function (req, res, next) {
    const uid = resolveUserId(req);
    if (!uid) return res.status(401).json({ error: 'user not identified' });
    const ent = getEntitlement(uid);
    if (!ent.active || tierRank(ent.tier) < min) {
      return res.status(402).json({
        error: 'upgrade required',
        requiredTier: String(minTier).toLowerCase(),
        currentTier: ent.tier,
      });
    }
    req.entitlement = ent;
    return next();
  };
}

module.exports = {
  TIERS,
  isConfigured,
  webhookConfigured,
  tierRank,
  tierFromPriceId,
  priceIdForTier,
  getEntitlement,
  isUnlocked,
  createSubscriptionCheckout,
  createUnlockCheckout,
  applyWebhookEvent,
  constructWebhookEvent,
  requireTier,
};
