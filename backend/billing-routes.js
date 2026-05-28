/**
 * SHADDAI Billing Routes v1.0
 * Express routes for subscription management and billing
 *
 * Endpoints:
 * - POST /billing/customer - Create customer record
 * - POST /billing/subscribe - Create subscription
 * - GET /billing/subscription - Get current subscription
 * - POST /billing/upgrade - Change subscription tier
 * - POST /billing/cancel - Cancel subscription
 * - GET /billing/invoices - List invoices
 * - POST /billing/payment-method - Update payment method
 * - GET /billing/usage - Get usage stats vs tier limits
 * - POST /billing/webhook - Stripe webhook endpoint
 */

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const billingService = require('./billing-service');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// ── LOGGER ──────────────────────────────────────────────────
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
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
      )
    })
  ]
});

// ── MIDDLEWARE ──────────────────────────────────────────────
/**
 * Authenticate user from Authorization header or context
 * In production, this would validate Firebase JWT or similar
 */
function authenticateUser(req, res, next) {
  try {
    // Check for Authorization header (Firebase token)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // In production: validate Firebase token
      // For now, extract userId if present
      req.userId = req.body.userId || req.query.userId || req.headers['x-user-id'];
    }

    // Fallback to direct userId header
    if (!req.userId) {
      req.userId = req.headers['x-user-id'] || req.body.userId;
    }

    if (!req.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID required in header (X-User-ID) or body (userId)'
      });
    }

    next();
  } catch (err) {
    res.status(401).json({
      error: 'Authentication failed',
      message: err.message
    });
  }
}

/**
 * Validate request body fields
 */
function validateFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(field => !req.body[field]);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing fields',
        missing,
        message: `Required fields: ${missing.join(', ')}`
      });
    }
    next();
  };
}

// Apply authentication to all billing routes
router.use(authenticateUser);

// ══════════════════════════════════════════════════════════════
// ═══ CUSTOMER MANAGEMENT ═══
// ══════════════════════════════════════════════════════════════

/**
 * POST /billing/customer
 * Create a Stripe customer record for a user
 * Body: { email, name }
 */
router.post('/customer', validateFields(['email', 'name']), async (req, res) => {
  try {
    const { email, name } = req.body;
    const userId = req.userId;

    logger.info(`Creating customer for user ${userId}`);

    // Check if customer already exists
    const existing = billingService.getCustomer(userId);
    if (existing) {
      return res.status(200).json({
        status: 'success',
        message: 'Customer already exists',
        customer: existing
      });
    }

    const customer = await billingService.createCustomer(userId, email, name);

    res.status(201).json({
      status: 'success',
      message: 'Customer created',
      customer
    });
  } catch (err) {
    logger.error('Customer creation error:', err.message);
    res.status(500).json({
      error: 'Customer creation failed',
      message: err.message
    });
  }
});

// ══════════════════════════════════════════════════════════════
// ═══ SUBSCRIPTION MANAGEMENT ═══
// ══════════════════════════════════════════════════════════════

/**
 * POST /billing/subscribe
 * Create a subscription for a customer
 * Body: { tier, email?, name? }
 * Returns: { subscriptionId, clientSecret, ...subscription details }
 */
router.post('/subscribe', validateFields(['tier']), async (req, res) => {
  try {
    const { tier, email, name } = req.body;
    const userId = req.userId;

    logger.info(`Creating subscription for user ${userId} - tier: ${tier}`);

    // Validate tier
    if (!['starter', 'pro', 'enterprise'].includes(tier)) {
      return res.status(400).json({
        error: 'Invalid tier',
        message: 'Tier must be: starter, pro, or enterprise'
      });
    }

    // Get or create customer
    let customer = billingService.getCustomer(userId);
    if (!customer) {
      if (!email || !name) {
        return res.status(400).json({
          error: 'Customer not found',
          message: 'Email and name required to create new customer'
        });
      }
      customer = await billingService.createCustomer(userId, email, name);
    }

    // Create subscription
    const subscription = await billingService.createSubscription(
      customer.stripeCustomerId,
      tier
    );

    res.status(201).json({
      status: 'success',
      message: 'Subscription created - confirm payment to activate',
      subscription,
      nextStep: 'Use clientSecret with Stripe.js to confirm payment'
    });
  } catch (err) {
    logger.error('Subscription creation error:', err.message);
    res.status(500).json({
      error: 'Subscription creation failed',
      message: err.message
    });
  }
});

/**
 * POST /billing/subscribe/confirm
 * Confirm subscription after successful payment
 * Body: { subscriptionId, tier }
 */
router.post('/subscribe/confirm', validateFields(['subscriptionId', 'tier']), async (req, res) => {
  try {
    const { subscriptionId, tier } = req.body;
    const userId = req.userId;

    logger.info(`Confirming subscription for user ${userId}`);

    const confirmed = await billingService.confirmSubscription(userId, subscriptionId, tier);

    res.status(200).json({
      status: 'success',
      message: `Subscription confirmed - welcome to ${tier} tier!`,
      customer: confirmed
    });
  } catch (err) {
    logger.error('Subscription confirmation error:', err.message);
    res.status(500).json({
      error: 'Subscription confirmation failed',
      message: err.message
    });
  }
});

/**
 * GET /billing/subscription
 * Get current subscription details
 */
router.get('/subscription', async (req, res) => {
  try {
    const userId = req.userId;

    logger.info(`Getting subscription for user ${userId}`);

    const subscriptionInfo = await billingService.getSubscriptionInfo(userId);

    if (!subscriptionInfo) {
      return res.status(404).json({
        error: 'No subscription found',
        message: `User ${userId} has no active subscription`
      });
    }

    res.status(200).json({
      status: 'success',
      subscription: subscriptionInfo
    });
  } catch (err) {
    logger.error('Get subscription error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve subscription',
      message: err.message
    });
  }
});

/**
 * POST /billing/upgrade
 * Upgrade or downgrade subscription tier
 * Body: { newTier }
 */
router.post('/upgrade', validateFields(['newTier']), async (req, res) => {
  try {
    const { newTier } = req.body;
    const userId = req.userId;

    logger.info(`Upgrading subscription for user ${userId} to ${newTier}`);

    // Validate tier
    if (!['starter', 'pro', 'enterprise'].includes(newTier)) {
      return res.status(400).json({
        error: 'Invalid tier',
        message: 'Tier must be: starter, pro, or enterprise'
      });
    }

    // Get current subscription
    const customer = billingService.getCustomer(userId);
    if (!customer || !customer.subscriptionId) {
      return res.status(404).json({
        error: 'No active subscription',
        message: 'User must have an active subscription to upgrade'
      });
    }

    // Prevent downgrading (optional - adjust based on product policy)
    const currentTierOrder = { starter: 1, pro: 2, enterprise: 3 };
    if (currentTierOrder[newTier] < currentTierOrder[customer.tier]) {
      logger.warn(`Downgrade attempt blocked: ${customer.tier} -> ${newTier}`);
      // Uncomment to enforce upgrade-only:
      // return res.status(400).json({
      //   error: 'Downgrade not allowed',
      //   message: 'Contact support to downgrade your plan'
      // });
    }

    const updated = await billingService.updateSubscription(customer.subscriptionId, newTier);

    res.status(200).json({
      status: 'success',
      message: `Subscription upgraded to ${newTier}`,
      subscription: updated
    });
  } catch (err) {
    logger.error('Subscription upgrade error:', err.message);
    res.status(500).json({
      error: 'Subscription upgrade failed',
      message: err.message
    });
  }
});

/**
 * POST /billing/cancel
 * Cancel subscription
 * Body: { reason? }
 */
router.post('/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.userId;

    logger.info(`Cancelling subscription for user ${userId}. Reason: ${reason || 'Not provided'}`);

    const customer = billingService.getCustomer(userId);
    if (!customer || !customer.subscriptionId) {
      return res.status(404).json({
        error: 'No active subscription',
        message: 'User has no active subscription to cancel'
      });
    }

    const cancelled = await billingService.cancelSubscription(customer.subscriptionId);

    res.status(200).json({
      status: 'success',
      message: 'Subscription cancelled',
      subscription: cancelled
    });
  } catch (err) {
    logger.error('Subscription cancellation error:', err.message);
    res.status(500).json({
      error: 'Subscription cancellation failed',
      message: err.message
    });
  }
});

// ══════════════════════════════════════════════════════════════
// ═══ INVOICES & PAYMENTS ═══
// ══════════════════════════════════════════════════════════════

/**
 * GET /billing/invoices
 * Get all invoices for current user
 * Query: { limit? }
 */
router.get('/invoices', async (req, res) => {
  try {
    const userId = req.userId;
    const customer = billingService.getCustomer(userId);

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: `No customer record for user ${userId}`
      });
    }

    logger.info(`Getting invoices for user ${userId}`);

    const invoices = await billingService.getInvoices(customer.stripeCustomerId);

    res.status(200).json({
      status: 'success',
      count: invoices.length,
      invoices
    });
  } catch (err) {
    logger.error('Get invoices error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve invoices',
      message: err.message
    });
  }
});

/**
 * POST /billing/payment-method
 * Update payment method for customer
 * Body: { paymentMethodId }
 */
router.post('/payment-method', validateFields(['paymentMethodId']), async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    const userId = req.userId;

    const customer = billingService.getCustomer(userId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: `No customer record for user ${userId}`
      });
    }

    logger.info(`Updating payment method for user ${userId}`);

    const updated = await billingService.updatePaymentMethod(
      customer.stripeCustomerId,
      paymentMethodId
    );

    res.status(200).json({
      status: 'success',
      message: 'Payment method updated',
      result: updated
    });
  } catch (err) {
    logger.error('Payment method update error:', err.message);
    res.status(500).json({
      error: 'Payment method update failed',
      message: err.message
    });
  }
});

// ══════════════════════════════════════════════════════════════
// ═══ USAGE & LIMITS ═══
// ══════════════════════════════════════════════════════════════

/**
 * GET /billing/usage
 * Get current usage vs tier limits
 */
router.get('/usage', async (req, res) => {
  try {
    const userId = req.userId;

    logger.info(`Getting usage for user ${userId}`);

    const subscriptionInfo = await billingService.getSubscriptionInfo(userId);

    if (!subscriptionInfo) {
      return res.status(404).json({
        error: 'No subscription',
        message: 'User has no active subscription'
      });
    }

    const { tier, usage, tierLimits } = subscriptionInfo;

    res.status(200).json({
      status: 'success',
      tier,
      usage: {
        ...usage,
        requestsPercentage: Math.round(
          (usage.requestsThisMinute / tierLimits.rateLimit) * 100
        ),
        requestsRemaining: tierLimits.rateLimit - usage.requestsThisMinute
      },
      limits: {
        maxAgents: tierLimits.maxAgents,
        rateLimit: tierLimits.rateLimit,
        scheduling: tierLimits.scheduling,
        batching: tierLimits.batching
      },
      warning:
        usage.requestsThisMinute > tierLimits.rateLimit * 0.8
          ? `Usage at ${Math.round((usage.requestsThisMinute / tierLimits.rateLimit) * 100)}% of limit`
          : null
    });
  } catch (err) {
    logger.error('Get usage error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve usage',
      message: err.message
    });
  }
});

// ══════════════════════════════════════════════════════════════
// ═══ WEBHOOKS ═══
// ══════════════════════════════════════════════════════════════

/**
 * POST /billing/webhook
 * Stripe webhook endpoint - must be raw body (not JSON parsed)
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
      // Verify webhook signature
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      logger.info(`Received webhook: ${event.type} (ID: ${event.id})`);

      // Process webhook
      const result = await billingService.handleWebhook(event);

      res.json({
        received: true,
        eventId: event.id,
        result
      });
    } catch (err) {
      logger.error('Webhook error:', err.message);
      res.status(400).json({
        error: 'Webhook processing failed',
        message: err.message
      });
    }
  }
);

// ══════════════════════════════════════════════════════════════
// ═══ TIER ENFORCEMENT MIDDLEWARE ═══
// ══════════════════════════════════════════════════════════════

/**
 * Middleware to enforce subscription tier limits
 * Use with main API routes to rate limit based on subscription
 * Usage: app.use('/api/agents', enforceSubscriptionTier, agentRoutes)
 */
async function enforceSubscriptionTier(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.body?.userId;

    if (!userId) {
      // No user ID - allow but log
      return next();
    }

    const customer = billingService.getCustomer(userId);

    if (!customer || !customer.tier) {
      return res.status(403).json({
        error: 'No subscription',
        message: 'User must have an active subscription to access this resource',
        action: 'Create a subscription at /billing/subscribe'
      });
    }

    // Check rate limits
    const rateCheckResult = await billingService.enforceRateLimit(userId, customer.tier);

    if (!rateCheckResult.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: rateCheckResult.error,
        retryAfter: rateCheckResult.retryAfter,
        tier: customer.tier,
        usage: {
          current: rateCheckResult.current,
          limit: rateCheckResult.limit,
          resetTime: rateCheckResult.resetTime
        }
      });
    }

    // Attach usage info to request
    req.rateLimit = rateCheckResult;
    req.subscription = {
      tier: customer.tier,
      stripeCustomerId: customer.stripeCustomerId,
      status: customer.status
    };

    next();
  } catch (err) {
    logger.error('Tier enforcement error:', err.message);
    res.status(500).json({
      error: 'Rate limit check failed',
      message: err.message
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ═══ EXPORTS ═══
// ══════════════════════════════════════════════════════════════

module.exports = {
  router,
  enforceSubscriptionTier
};
