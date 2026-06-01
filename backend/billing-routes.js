/**
 * SHADDAI Billing Routes v2.0
 * Express routes for subscription management, credit ledger, and usage metering.
 *
 * All routes mount under the prefix the server applies (e.g. /api/billing).
 * Existing route shapes are preserved; new endpoints are additive.
 *
 * Endpoints (relative to mount prefix):
 *
 *  Customer / profile
 *    POST   /customer              — register a billing record
 *    GET    /subscription          — full subscription + credit info
 *    GET    /balance               — quick credit balance check
 *    GET    /tiers                 — all tier definitions (replaces api-proxy version)
 *
 *  Subscription lifecycle
 *    POST   /subscribe             — create subscription (Stripe or stub)
 *    POST   /subscribe/confirm     — confirm after Stripe payment intent
 *    POST   /upgrade               — change tier
 *    POST   /cancel                — cancel subscription
 *
 *  Invoices & payments
 *    GET    /invoices              — Stripe invoices or ledger credits
 *    POST   /payment-method        — update Stripe payment method
 *    POST   /checkout              — Stripe checkout session (or stub)
 *    GET    /providers             — configured payment provider status
 *
 *  Usage / ledger
 *    GET    /usage                 — current usage vs tier limits
 *    GET    /transactions          — credit ledger history
 *
 *  Webhooks
 *    POST   /webhook               — Stripe webhook (raw body)
 *
 *  Admin (internal — guard with IP or secret in production)
 *    POST   /admin/credit          — manually credit a user
 *    POST   /admin/set-tier        — manually set user tier
 */

'use strict';

const express        = require('express');
const router         = express.Router();
const billingService = require('./billing-service');
const { v4: uuidv4 } = require('uuid');
const winston        = require('winston');

// ── LOGGER ───────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'billing-routes' },
  transports: [
    new winston.transports.File({ filename: 'billing-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'billing.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) =>
          `[${timestamp}] ${level}: ${message}`)
      )
    })
  ]
});

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

/**
 * authenticateUser — extracts userId from header, query, or body.
 * In production: validate a Firebase/JWT token here.
 */
function authenticateUser(req, res, next) {
  try {
    req.userId =
      req.headers['x-user-id'] ||
      req.body.userId           ||
      req.query.userId          ||
      null;

    if (!req.userId) {
      return res.status(401).json({
        error:   'Unauthorized',
        message: 'userId required (X-User-ID header, body.userId, or ?userId=...)'
      });
    }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed', message: err.message });
  }
}

/** Validate required body fields. */
function validateFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => req.body[f] == null || req.body[f] === '');
    if (missing.length) {
      return res.status(400).json({
        error:   'Missing fields',
        missing,
        message: `Required: ${missing.join(', ')}`
      });
    }
    next();
  };
}

/** Simple error wrapper to keep route handlers tidy. */
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      logger.error(err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

// Apply authentication to all billing routes
router.use(authenticateUser);

// ── TIER DEFINITIONS (public, no auth needed — but auth is already applied above) ──

/**
 * GET /tiers
 * Returns all tier definitions with credits, model access, features, and pricing.
 */
router.get('/tiers', (req, res) => {
  const tiers = Object.entries(billingService.TIER_CONFIG).map(([key, cfg]) => ({
    tier:           key,
    name:           cfg.name,
    price:          cfg.price,
    currency:       cfg.currency,
    interval:       cfg.interval,
    monthlyCredits: cfg.monthlyCredits,
    modelTiers:     cfg.modelTiers,
    maxAgents:      cfg.maxAgents,
    rateLimit:      cfg.rateLimit,
    features:       cfg.features,
    description:    cfg.description
  }));
  res.json({ tiers });
});

// ── CUSTOMER MANAGEMENT ───────────────────────────────────────────────────────

/**
 * POST /customer
 * Body: { email, name, tier? }
 * Registers a billing record (no live charge).
 */
router.post('/customer', validateFields(['email', 'name']), handle(async (req, res) => {
  const { email, name, tier } = req.body;
  const userId = req.userId;
  logger.info(`Creating customer for user ${userId}`);

  const existing = billingService.getCustomer(userId);
  if (existing) {
    return res.status(200).json({ status: 'exists', message: 'Customer already registered', customer: existing });
  }

  const customer = await billingService.createCustomer(userId, email, name, { tier });
  res.status(201).json({ status: 'created', customer });
}));

// ── SUBSCRIPTION ──────────────────────────────────────────────────────────────

/**
 * GET /subscription
 * Full subscription info: tier, credits, usage, limits.
 */
router.get('/subscription', handle(async (req, res) => {
  const info = await billingService.getSubscriptionInfo(req.userId);
  if (!info) {
    // Auto-create a free record so the FE always gets a response
    await billingService.getOrCreateCustomer(req.userId);
    const freshInfo = await billingService.getSubscriptionInfo(req.userId);
    return res.json({ status: 'success', subscription: freshInfo });
  }
  res.json({ status: 'success', subscription: info });
}));

/**
 * GET /balance
 * Quick balance check — returns credits remaining + tier.
 * Designed to be called frequently (e.g. before each LLM call from the FE).
 */
router.get('/balance', handle(async (req, res) => {
  await billingService.getOrCreateCustomer(req.userId);
  const cust = billingService.getCustomer(req.userId);
  const tc   = billingService.TIER_CONFIG[cust.tier] || billingService.TIER_CONFIG.free;
  res.json({
    userId:           req.userId,
    tier:             cust.tier,
    tierName:         tc.name,
    creditsRemaining: cust.creditsRemaining,
    creditsMonthly:   cust.creditsMonthly,
    status:           cust.status
  });
}));

/**
 * POST /subscribe
 * Body: { tier, email?, name? }
 * Creates a Stripe subscription (or returns a stub if Stripe is not configured).
 * Returns clientSecret for Stripe.js confirmation when live.
 */
router.post('/subscribe', validateFields(['tier']), handle(async (req, res) => {
  const { tier, email, name } = req.body;
  const userId = req.userId;

  const validTiers = Object.keys(billingService.TIER_CONFIG);
  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: `Invalid tier. Valid: ${validTiers.join(', ')}` });
  }

  // Ensure billing record exists
  await billingService.getOrCreateCustomer(userId, email, name);

  const subscription = await billingService.createSubscription(userId, tier);

  if (!subscription.configured) {
    return res.status(200).json({
      status:  'stub',
      message: subscription.message,
      tier,
      subscription
    });
  }

  res.status(201).json({
    status:      'pending_payment',
    message:     'Subscription created — use clientSecret with Stripe.js to confirm.',
    subscription
  });
}));

/**
 * POST /subscribe/confirm
 * Body: { subscriptionId, tier }
 */
router.post('/subscribe/confirm', validateFields(['subscriptionId', 'tier']), handle(async (req, res) => {
  const confirmed = await billingService.confirmSubscription(
    req.userId, req.body.subscriptionId, req.body.tier
  );
  res.json({
    status:   'success',
    message:  `Welcome to ${req.body.tier} tier!`,
    customer: confirmed
  });
}));

/**
 * POST /upgrade
 * Body: { newTier }
 */
router.post('/upgrade', validateFields(['newTier']), handle(async (req, res) => {
  const { newTier } = req.body;
  const validTiers  = Object.keys(billingService.TIER_CONFIG);

  if (!validTiers.includes(newTier)) {
    return res.status(400).json({ error: `Invalid tier. Valid: ${validTiers.join(', ')}` });
  }

  const updated = await billingService.updateSubscription(req.userId, newTier);
  res.json({ status: 'success', message: `Tier updated to ${newTier}`, customer: updated });
}));

/**
 * POST /cancel
 * Body: { reason? }
 */
router.post('/cancel', handle(async (req, res) => {
  const result = await billingService.cancelSubscription(req.userId);
  res.json({ status: 'success', result });
}));

// ── INVOICES & PAYMENTS ───────────────────────────────────────────────────────

/**
 * GET /invoices
 * Returns Stripe invoices (if configured) or synthetic ledger entries.
 */
router.get('/invoices', handle(async (req, res) => {
  const result = await billingService.getInvoices(req.userId);
  res.json({ status: 'success', ...result });
}));

/**
 * POST /payment-method
 * Body: { paymentMethodId }
 * Updates default Stripe payment method.
 */
router.post('/payment-method', validateFields(['paymentMethodId']), handle(async (req, res) => {
  const cust   = billingService.getCustomer(req.userId);
  const stripe = billingService.getStripe();

  if (!stripe) {
    return res.json({ configured: false, message: 'Stripe not configured. Set STRIPE_SECRET_KEY in .env.' });
  }
  if (!cust || !cust.stripeCustomerId) {
    return res.status(404).json({ error: 'No Stripe customer record found.' });
  }

  await stripe.customers.update(cust.stripeCustomerId, {
    invoice_settings: { default_payment_method: req.body.paymentMethodId }
  });
  res.json({ status: 'success', message: 'Payment method updated.' });
}));

/**
 * POST /checkout
 * Body: { tier, successUrl?, cancelUrl? }
 * Creates a Stripe Checkout session (or returns stub with instructions).
 */
router.post('/checkout', validateFields(['tier']), handle(async (req, res) => {
  const { tier, successUrl, cancelUrl } = req.body;
  const validTiers = Object.keys(billingService.TIER_CONFIG).filter(t => t !== 'free');

  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: `Checkout tier must be one of: ${validTiers.join(', ')}` });
  }

  const stripe   = billingService.getStripe();
  const priceId  = billingService.STRIPE_PRICES[tier];

  if (!stripe || !priceId) {
    return res.json({
      configured: false,
      tier,
      message:    `Stripe not fully configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_${tier.toUpperCase()} in .env.`,
      url:        null
      // TODO: once keys are added this returns a real Stripe Checkout URL
    });
  }

  // Ensure billing record + Stripe customer exist
  const cust = await billingService.getOrCreateCustomer(req.userId);
  let stripeCustomerId = cust.stripeCustomerId;
  if (!stripeCustomerId) {
    const sc = await stripe.customers.create({
      email:    cust.email,
      metadata: { userId: req.userId }
    });
    stripeCustomerId = sc.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer:             stripeCustomerId,
    payment_method_types: ['card'],
    line_items:           [{ price: priceId, quantity: 1 }],
    mode:                 'subscription',
    success_url:          successUrl || `${req.protocol}://${req.get('host')}/?billing=success`,
    cancel_url:           cancelUrl  || `${req.protocol}://${req.get('host')}/?billing=cancel`,
    metadata:             { tier, userId: req.userId }
  });

  res.json({ configured: true, url: session.url, sessionId: session.id });
}));

/**
 * GET /providers
 * Returns which payment providers are configured.
 */
router.get('/providers', (req, res) => {
  const stripeConfigured  = !!process.env.STRIPE_SECRET_KEY;
  const moonpayStatus     = billingService.getMoonpayStatus();
  res.json({
    stripe: {
      configured: stripeConfigured,
      message:    stripeConfigured
        ? 'Stripe is configured.'
        : 'Stripe not configured. Set STRIPE_SECRET_KEY in .env.',
      pricingConfigured: {
        pro:   !!process.env.STRIPE_PRICE_PRO,
        elite: !!process.env.STRIPE_PRICE_ELITE
      }
    },
    moonpay: moonpayStatus
  });
});

// ── USAGE & LEDGER ────────────────────────────────────────────────────────────

/**
 * GET /usage
 * Current usage vs tier limits, credit consumption, and rate-limit status.
 */
router.get('/usage', handle(async (req, res) => {
  await billingService.getOrCreateCustomer(req.userId);
  const info = await billingService.getSubscriptionInfo(req.userId);

  if (!info) {
    return res.status(404).json({ error: 'Billing record not found.' });
  }

  const { credits, tierLimits, usage, subscription } = info;
  const nearLimit = credits.pct >= 80;

  res.json({
    status:   'success',
    tier:     subscription.tier,
    credits,
    usage,
    limits: {
      monthlyCredits: tierLimits.monthlyCredits,
      modelTiers:     tierLimits.modelTiers,
      rateLimit:      tierLimits.rateLimit,
      features:       tierLimits.features
    },
    warning: nearLimit
      ? `Credit usage at ${credits.pct}% — consider upgrading.`
      : null
  });
}));

/**
 * GET /transactions
 * Query: { limit? }
 * Returns the credit ledger for this user (newest first).
 */
router.get('/transactions', handle(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const txns  = billingService.getTransactionHistory(req.userId, limit);
  res.json({ status: 'success', count: txns.length, transactions: txns });
}));

// ── STRIPE WEBHOOK ────────────────────────────────────────────────────────────

/**
 * POST /webhook
 * Raw body required — do NOT apply JSON middleware to this route.
 * Mount with express.raw before the router-level JSON parser if needed.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig   = req.headers['stripe-signature'];
    const stripe = billingService.getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !secret) {
      // Accept the call but skip signature verification (dev mode)
      logger.warn('Stripe webhook received but STRIPE_WEBHOOK_SECRET not set — skipping verification');
      try {
        const event  = JSON.parse(req.body.toString());
        const result = await billingService.handleWebhook(event);
        return res.json({ received: true, result });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    try {
      const event  = stripe.webhooks.constructEvent(req.body, sig, secret);
      logger.info(`Webhook: ${event.type} (${event.id})`);
      const result = await billingService.handleWebhook(event);
      res.json({ received: true, eventId: event.id, result });
    } catch (err) {
      logger.error('Webhook error:', err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────
// TODO: protect with an admin secret header or IP allowlist before deploying publicly.

/**
 * POST /admin/credit
 * Body: { targetUserId, amount, reason }
 * Manually credit a user's balance (e.g. after MoonPay confirmation).
 */
router.post('/admin/credit', validateFields(['targetUserId', 'amount']), handle(async (req, res) => {
  const { targetUserId, amount, reason } = req.body;
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  // Ensure target user exists
  billingService._ensureUserRecord(targetUserId, { tier: 'free' });
  const balance = billingService.credit(targetUserId, parsedAmount, reason || 'admin_credit');
  res.json({ status: 'success', targetUserId, credited: parsedAmount, balance });
}));

/**
 * POST /admin/set-tier
 * Body: { targetUserId, tier }
 * Directly sets a user's tier (e.g. after manual payment verification).
 */
router.post('/admin/set-tier', validateFields(['targetUserId', 'tier']), handle(async (req, res) => {
  const { targetUserId, tier } = req.body;
  const validTiers = Object.keys(billingService.TIER_CONFIG);
  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: `tier must be one of: ${validTiers.join(', ')}` });
  }
  billingService._ensureUserRecord(targetUserId, { tier: 'free' });
  const updated = await billingService.updateSubscription(targetUserId, tier);
  res.json({ status: 'success', customer: updated });
}));

// ── TIER ENFORCEMENT MIDDLEWARE (export for use in other routers) ─────────────

/**
 * enforceSubscriptionTier
 * Express middleware — blocks the request if the user's tier/credits don't allow it.
 *
 * Attaches to req:
 *   req.billing.tier, req.billing.credits, req.billing.rateLimit
 *
 * Usage:
 *   app.use('/api/agents', enforceSubscriptionTier, agentRoutes)
 *   router.post('/generate', enforceSubscriptionTier, handler)
 *
 * Optional query/header:
 *   req.query.requiredModel — 'cheap'|'standard'|'premium'
 *     If set, blocks if user's tier doesn't allow that model tier.
 */
async function enforceSubscriptionTier(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.body && req.body.userId || req.query.userId;
    if (!userId) return next(); // anonymous — let downstream decide

    // Ensure record exists
    await billingService.getOrCreateCustomer(userId);
    const cust = billingService.getCustomer(userId);
    const tc   = billingService.TIER_CONFIG[cust.tier] || billingService.TIER_CONFIG.free;

    // Credit gate
    if (cust.creditsRemaining <= 0) {
      return res.status(402).json({
        error:    'Insufficient credits',
        message:  `Your ${tc.name} plan has 0 credits remaining. Upgrade or wait for your billing cycle to reset.`,
        code:     'NO_CREDITS',
        tier:     cust.tier,
        upgrade:  '/api/billing/checkout'
      });
    }

    // Model tier gate
    const requiredModel = req.query.requiredModel || (req.body && req.body.requiredModel);
    if (requiredModel && !tc.modelTiers.includes(requiredModel)) {
      return res.status(403).json({
        error:   'Model tier not permitted',
        message: `Your ${tc.name} plan allows models: ${tc.modelTiers.join(', ')}. Requested: ${requiredModel}.`,
        code:    'MODEL_TIER_DENIED',
        tier:    cust.tier,
        upgrade: '/api/billing/checkout'
      });
    }

    // Rate limit gate
    const rl = await billingService.enforceRateLimit(userId, cust.tier);
    if (!rl.allowed) {
      return res.status(429).json({
        error:      'Rate limit exceeded',
        message:    rl.error,
        retryAfter: rl.retryAfter,
        tier:       cust.tier
      });
    }

    // Attach billing context for downstream handlers
    req.billing = {
      userId,
      tier:             cust.tier,
      tierConfig:       tc,
      creditsRemaining: cust.creditsRemaining,
      rateLimit:        rl
    };

    next();
  } catch (err) {
    logger.error('enforceSubscriptionTier error:', err.message);
    res.status(500).json({ error: 'Billing check failed', message: err.message });
  }
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────
module.exports = {
  router,
  enforceSubscriptionTier
};
