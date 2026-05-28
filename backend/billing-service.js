/**
 * SHADDAI Billing Service v1.0
 * Stripe-based subscription management for 3-tier system
 *
 * Tiers:
 * - Starter: $29/month (1 agent, 100 req/min, no scheduling)
 * - Pro: $99/month (3 agents, 500 req/min, scheduling enabled)
 * - Enterprise: $299/month (5+ agents, 2000 req/min, all features)
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// ── LOGGER ──────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'billing-service' },
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

// ── STRIPE PRICE IDS (from Stripe Dashboard) ──────────────────
// Format: stripe_[ENVIRONMENT]_[TIER]_price_[ID]
const STRIPE_PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER || 'price_starter_test',
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_test',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise_test'
};

// ── TIER CONFIGURATION ──────────────────────────────────────
const TIER_CONFIG = {
  starter: {
    name: 'Starter',
    price: 2900, // $29.00 in cents
    currency: 'usd',
    maxAgents: 1,
    rateLimit: 100, // requests per minute
    scheduling: false,
    batching: false,
    maxBatchItems: 0,
    description: 'Perfect for getting started with SHADDAI'
  },
  pro: {
    name: 'Pro',
    price: 9900, // $99.00 in cents
    currency: 'usd',
    maxAgents: 3,
    rateLimit: 500,
    scheduling: true,
    batching: false,
    maxBatchItems: 0,
    description: 'For growing teams and projects'
  },
  enterprise: {
    name: 'Enterprise',
    price: 29900, // $299.00 in cents
    currency: 'usd',
    maxAgents: 5,
    rateLimit: 2000,
    scheduling: true,
    batching: true,
    maxBatchItems: 100,
    description: 'Unlimited scale and priority support'
  }
};

// ── IN-MEMORY STORES (use database in production) ──────────────
const customerDatabase = {}; // { userId: { stripeCustomerId, email, name, tier, subscriptionId, status } }
const usageDatabase = {}; // { userId: { requestsThisMinute, agentsUsed, lastResetTime, createdAt, updatedAt } }
const webhookLog = {}; // { eventId: { timestamp, processed, status } }

// Load persistent data if exists
const loadPersistentData = () => {
  try {
    if (fs.existsSync('customers.json')) {
      const data = JSON.parse(fs.readFileSync('customers.json', 'utf8'));
      Object.assign(customerDatabase, data);
      logger.info('Loaded customer database');
    }
    if (fs.existsSync('usage.json')) {
      const data = JSON.parse(fs.readFileSync('usage.json', 'utf8'));
      Object.assign(usageDatabase, data);
      logger.info('Loaded usage database');
    }
  } catch (err) {
    logger.warn('Could not load persistent data:', err.message);
  }
};

const savePersistentData = () => {
  try {
    fs.writeFileSync('customers.json', JSON.stringify(customerDatabase, null, 2));
    fs.writeFileSync('usage.json', JSON.stringify(usageDatabase, null, 2));
  } catch (err) {
    logger.error('Failed to save persistent data:', err.message);
  }
};

// Load on module init
loadPersistentData();

// ══════════════════════════════════════════════════════════════
// ═══ CORE BILLING FUNCTIONS ═══
// ══════════════════════════════════════════════════════════════

/**
 * Create a Stripe customer for a user
 * @param {string} userId - User ID (Firebase UID or similar)
 * @param {string} email - User email
 * @param {string} name - User full name
 * @returns {Promise<Object>} Stripe customer object
 */
async function createCustomer(userId, email, name) {
  try {
    // Check if customer already exists
    if (customerDatabase[userId]) {
      logger.info(`Customer ${userId} already exists with Stripe ID ${customerDatabase[userId].stripeCustomerId}`);
      return customerDatabase[userId];
    }

    // Create in Stripe
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId,
        createdAt: new Date().toISOString()
      },
      description: `SHADDAI API Customer - ${email}`
    });

    // Store locally
    customerDatabase[userId] = {
      userId,
      stripeCustomerId: customer.id,
      email,
      name,
      tier: null,
      subscriptionId: null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    savePersistentData();
    logger.info(`Created customer ${userId} with Stripe ID ${customer.id}`);

    return customerDatabase[userId];
  } catch (err) {
    logger.error(`Failed to create customer ${userId}:`, err.message);
    throw new Error(`Customer creation failed: ${err.message}`);
  }
}

/**
 * Create a subscription for a customer
 * @param {string} customerId - Stripe Customer ID
 * @param {string} tier - Subscription tier (starter|pro|enterprise)
 * @returns {Promise<Object>} Stripe subscription object
 */
async function createSubscription(customerId, tier) {
  try {
    if (!STRIPE_PRICES[tier]) {
      throw new Error(`Invalid tier: ${tier}. Must be starter, pro, or enterprise`);
    }

    const priceId = STRIPE_PRICES[tier];

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        tier,
        createdAt: new Date().toISOString()
      }
    });

    logger.info(`Created ${tier} subscription ${subscription.id} for customer ${customerId}`);

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId,
      tier,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret || null
    };
  } catch (err) {
    logger.error(`Failed to create subscription for ${customerId}:`, err.message);
    throw new Error(`Subscription creation failed: ${err.message}`);
  }
}

/**
 * Confirm subscription creation (after payment intent)
 * @param {string} userId - User ID
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {string} tier - Subscription tier
 * @returns {Promise<Object>} Updated customer record
 */
async function confirmSubscription(userId, subscriptionId, tier) {
  try {
    if (!customerDatabase[userId]) {
      throw new Error(`Customer ${userId} not found`);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.status !== 'active' && subscription.status !== 'incomplete') {
      throw new Error(`Subscription status is ${subscription.status}, not active`);
    }

    customerDatabase[userId].subscriptionId = subscriptionId;
    customerDatabase[userId].tier = tier;
    customerDatabase[userId].status = 'active';
    customerDatabase[userId].updatedAt = new Date();

    // Initialize usage tracking
    if (!usageDatabase[userId]) {
      usageDatabase[userId] = {
        requestsThisMinute: 0,
        agentsUsed: 0,
        lastResetTime: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    savePersistentData();
    logger.info(`Confirmed ${tier} subscription for user ${userId}`);

    return customerDatabase[userId];
  } catch (err) {
    logger.error(`Failed to confirm subscription for ${userId}:`, err.message);
    throw new Error(`Subscription confirmation failed: ${err.message}`);
  }
}

/**
 * Update subscription to a new tier (upgrade/downgrade)
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {string} newTier - New tier (starter|pro|enterprise)
 * @returns {Promise<Object>} Updated subscription
 */
async function updateSubscription(subscriptionId, newTier) {
  try {
    if (!STRIPE_PRICES[newTier]) {
      throw new Error(`Invalid tier: ${newTier}`);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const newPriceId = STRIPE_PRICES[newTier];

    // Update subscription items
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId
        }
      ],
      proration_behavior: 'create_prorations',
      metadata: {
        tier: newTier,
        updatedAt: new Date().toISOString()
      }
    });

    // Update customer database
    const userId = Object.keys(customerDatabase).find(
      uid => customerDatabase[uid].subscriptionId === subscriptionId
    );

    if (userId) {
      customerDatabase[userId].tier = newTier;
      customerDatabase[userId].updatedAt = new Date();
      savePersistentData();
    }

    logger.info(`Updated subscription ${subscriptionId} to ${newTier} tier`);

    return {
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
      tier: newTier,
      currentPeriodStart: new Date(updatedSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000)
    };
  } catch (err) {
    logger.error(`Failed to update subscription ${subscriptionId}:`, err.message);
    throw new Error(`Subscription update failed: ${err.message}`);
  }
}

/**
 * Cancel a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {boolean} immediate - Cancel immediately (true) or at period end (false)
 * @returns {Promise<Object>} Cancelled subscription
 */
async function cancelSubscription(subscriptionId, immediate = false) {
  try {
    const cancelledSubscription = await stripe.subscriptions.del(subscriptionId);

    // Update customer database
    const userId = Object.keys(customerDatabase).find(
      uid => customerDatabase[uid].subscriptionId === subscriptionId
    );

    if (userId) {
      customerDatabase[userId].tier = null;
      customerDatabase[userId].subscriptionId = null;
      customerDatabase[userId].status = 'cancelled';
      customerDatabase[userId].updatedAt = new Date();
      savePersistentData();
    }

    logger.info(`Cancelled subscription ${subscriptionId}`);

    return {
      subscriptionId: cancelledSubscription.id,
      status: cancelledSubscription.status,
      cancelledAt: new Date(cancelledSubscription.canceled_at * 1000)
    };
  } catch (err) {
    logger.error(`Failed to cancel subscription ${subscriptionId}:`, err.message);
    throw new Error(`Subscription cancellation failed: ${err.message}`);
  }
}

/**
 * Get all invoices for a customer
 * @param {string} customerId - Stripe Customer ID
 * @returns {Promise<Array>} Array of invoice objects
 */
async function getInvoices(customerId) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 100
    });

    return invoices.data.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.number,
      amount: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      paidAt: inv.paid_at ? new Date(inv.paid_at * 1000) : null,
      dueDate: inv.due_date ? new Date(inv.due_date * 1000) : null,
      periodStart: new Date(inv.period_start * 1000),
      periodEnd: new Date(inv.period_end * 1000),
      hostedInvoiceUrl: inv.hosted_invoice_url,
      pdfUrl: inv.invoice_pdf,
      description: inv.description
    }));
  } catch (err) {
    logger.error(`Failed to get invoices for ${customerId}:`, err.message);
    return [];
  }
}

/**
 * Handle Stripe webhook events (idempotent)
 * @param {Object} event - Stripe event object
 * @returns {Promise<Object>} Processing result
 */
async function handleWebhook(event) {
  try {
    // Idempotency check - prevent duplicate processing
    if (webhookLog[event.id]) {
      logger.info(`Webhook ${event.id} already processed`);
      return {
        eventId: event.id,
        status: 'already_processed',
        timestamp: new Date()
      };
    }

    const eventType = event.type;
    let result = { eventId: event.id, eventType, status: 'processed', timestamp: new Date() };

    switch (eventType) {
      case 'customer.subscription.created':
        result.action = 'subscription_created';
        logger.info(`Subscription created: ${event.data.object.id}`);
        break;

      case 'customer.subscription.updated':
        result.action = 'subscription_updated';
        const subscription = event.data.object;
        logger.info(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
        break;

      case 'customer.subscription.deleted':
        result.action = 'subscription_deleted';
        logger.info(`Subscription deleted: ${event.data.object.id}`);
        break;

      case 'invoice.created':
        result.action = 'invoice_created';
        logger.info(`Invoice created: ${event.data.object.id}`);
        break;

      case 'invoice.payment_succeeded':
        result.action = 'invoice_paid';
        const invoice = event.data.object;
        logger.info(`Invoice paid: ${invoice.id}, amount: ${invoice.amount_paid} ${invoice.currency}`);
        break;

      case 'invoice.payment_failed':
        result.action = 'invoice_failed';
        logger.warn(`Invoice payment failed: ${event.data.object.id}`);
        break;

      case 'payment_intent.succeeded':
        result.action = 'payment_succeeded';
        logger.info(`Payment succeeded: ${event.data.object.id}`);
        break;

      case 'payment_intent.payment_failed':
        result.action = 'payment_failed';
        logger.warn(`Payment failed: ${event.data.object.id}`);
        break;

      default:
        result.action = 'unknown_event';
        logger.info(`Unknown event type: ${eventType}`);
    }

    // Mark as processed (idempotency)
    webhookLog[event.id] = {
      timestamp: new Date(),
      processed: true,
      status: 'success'
    };

    return result;
  } catch (err) {
    logger.error(`Webhook processing error:`, err.message);
    return {
      eventId: event.id,
      status: 'error',
      error: err.message,
      timestamp: new Date()
    };
  }
}

/**
 * Check and enforce rate limits based on subscription tier
 * @param {string} userId - User ID
 * @param {string} tier - Subscription tier
 * @returns {Promise<Object>} Rate limit status
 */
async function enforceRateLimit(userId, tier) {
  try {
    const tierConfig = TIER_CONFIG[tier];
    if (!tierConfig) {
      return { allowed: false, error: `Invalid tier: ${tier}` };
    }

    // Initialize usage if needed
    if (!usageDatabase[userId]) {
      usageDatabase[userId] = {
        requestsThisMinute: 0,
        agentsUsed: 0,
        lastResetTime: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    const usage = usageDatabase[userId];
    const now = Date.now();
    const timeSinceLastReset = now - usage.lastResetTime;

    // Reset counter if minute has passed
    if (timeSinceLastReset > 60000) {
      usage.requestsThisMinute = 0;
      usage.lastResetTime = now;
    }

    // Check if under limit
    if (usage.requestsThisMinute >= tierConfig.rateLimit) {
      logger.warn(`Rate limit exceeded for user ${userId}: ${usage.requestsThisMinute}/${tierConfig.rateLimit}`);
      return {
        allowed: false,
        error: `Rate limit exceeded: ${usage.requestsThisMinute}/${tierConfig.rateLimit} requests per minute`,
        retryAfter: Math.ceil((60000 - timeSinceLastReset) / 1000),
        tier,
        current: usage.requestsThisMinute,
        limit: tierConfig.rateLimit
      };
    }

    // Increment request count
    usage.requestsThisMinute++;
    usage.updatedAt = new Date();
    savePersistentData();

    return {
      allowed: true,
      current: usage.requestsThisMinute,
      limit: tierConfig.rateLimit,
      remaining: tierConfig.rateLimit - usage.requestsThisMinute,
      resetTime: new Date(usage.lastResetTime + 60000)
    };
  } catch (err) {
    logger.error(`Rate limit check failed for ${userId}:`, err.message);
    return { allowed: false, error: err.message };
  }
}

/**
 * Track agent usage for a user
 * @param {string} userId - User ID
 * @param {number} agentCount - Number of agents used in request
 * @returns {void}
 */
function trackAgentUsage(userId, agentCount) {
  try {
    if (!usageDatabase[userId]) {
      usageDatabase[userId] = {
        requestsThisMinute: 0,
        agentsUsed: 0,
        lastResetTime: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    usageDatabase[userId].agentsUsed += agentCount;
    usageDatabase[userId].updatedAt = new Date();
    savePersistentData();
  } catch (err) {
    logger.error(`Failed to track agent usage:`, err.message);
  }
}

/**
 * Get subscription and usage details for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Complete subscription and usage info
 */
async function getSubscriptionInfo(userId) {
  try {
    const customer = customerDatabase[userId];
    if (!customer) {
      return null;
    }

    const usage = usageDatabase[userId] || {
      requestsThisMinute: 0,
      agentsUsed: 0,
      lastResetTime: Date.now()
    };

    const tierConfig = TIER_CONFIG[customer.tier];

    return {
      customer: {
        userId,
        stripeCustomerId: customer.stripeCustomerId,
        email: customer.email,
        name: customer.name,
        status: customer.status
      },
      subscription: {
        subscriptionId: customer.subscriptionId,
        tier: customer.tier,
        tierName: tierConfig?.name || 'None',
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      },
      tierLimits: tierConfig || {},
      usage: {
        requestsThisMinute: usage.requestsThisMinute,
        agentsUsed: usage.agentsUsed,
        resetTime: new Date(usage.lastResetTime + 60000)
      }
    };
  } catch (err) {
    logger.error(`Failed to get subscription info for ${userId}:`, err.message);
    return null;
  }
}

/**
 * Get a customer by user ID
 * @param {string} userId - User ID
 * @returns {Object|null} Customer object or null
 */
function getCustomer(userId) {
  return customerDatabase[userId] || null;
}

/**
 * Update payment method for customer
 * @param {string} customerId - Stripe Customer ID
 * @param {string} paymentMethodId - Stripe Payment Method ID
 * @returns {Promise<Object>} Updated customer
 */
async function updatePaymentMethod(customerId, paymentMethodId) {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    logger.info(`Updated payment method for customer ${customerId}`);

    return { customerId, paymentMethodId, updated: true };
  } catch (err) {
    logger.error(`Failed to update payment method:`, err.message);
    throw new Error(`Payment method update failed: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// ═══ EXPORTS ═══
// ══════════════════════════════════════════════════════════════

module.exports = {
  // Customer management
  createCustomer,
  getCustomer,
  getSubscriptionInfo,

  // Subscription management
  createSubscription,
  confirmSubscription,
  updateSubscription,
  cancelSubscription,

  // Invoices & payments
  getInvoices,
  updatePaymentMethod,

  // Rate limiting & usage
  enforceRateLimit,
  trackAgentUsage,

  // Webhooks
  handleWebhook,

  // Configuration
  TIER_CONFIG,
  STRIPE_PRICES,
  TIER_LIMITS: TIER_CONFIG // Alias for compatibility

};
