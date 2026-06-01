/**
 * SHADDAI Billing Service v2.0
 * Real-structured billing core — payment providers stubbed behind env vars.
 *
 * Architecture:
 *   - Tier definitions with concrete credit limits + feature gates
 *   - Credit ledger (in-memory, swappable to database-real.js)
 *   - recordUsage() — single chokepoint called by LLM brain layer
 *   - Stripe + MoonPay as configured stubs (no live keys required)
 *   - Rate limiting (req/min) preserved from v1
 *
 * Tiers:
 *   Free    — 500 credits/mo, cheap models only, 7 agents, no scheduling
 *   Pro     — 5 000 credits/mo, standard+cheap models, all agents, scheduling
 *   Elite   — 50 000 credits/mo, all model tiers, all agents, all features
 *
 * 1 credit ≈ $0.001 (1 tenth of a cent).  LLM usage is debited by token cost.
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// ── LOGGER ──────────────────────────────────────────────────────────────────
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
        winston.format.printf(({ timestamp, level, message }) =>
          `[${timestamp}] ${level}: ${message}`)
      )
    })
  ]
});

// ── STRIPE — configured stub ─────────────────────────────────────────────────
// Lazy-loaded so the server starts fine without STRIPE_SECRET_KEY.
// Every function that needs Stripe calls getStripe() and handles the null case.
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    _stripe = require('stripe')(key);
    return _stripe;
  } catch {
    return null;
  }
}

// ── STRIPE PRICE IDs ─────────────────────────────────────────────────────────
const STRIPE_PRICES = {
  pro:   process.env.STRIPE_PRICE_PRO   || '',
  elite: process.env.STRIPE_PRICE_ELITE || ''
};

// ── TIER DEFINITIONS ─────────────────────────────────────────────────────────
/**
 * monthlyCredits: credits reset on each billing cycle.  -1 = unlimited.
 * modelTiers: which LLM cost tiers are allowed ('cheap'|'standard'|'premium').
 * rateLimit: max API requests per minute.
 * features: set of named feature gates checked by pay-guard / middleware.
 */
const TIER_CONFIG = {
  free: {
    name: 'Free',
    price: 0,
    currency: 'usd',
    interval: 'month',
    monthlyCredits: 500,
    modelTiers: ['cheap'],
    maxAgents: 7,
    rateLimit: 30,
    features: {
      scheduling: false,
      batching: false,
      byok: false,          // bring-your-own-key for LLM
      advancedWorkflows: false,
      prioritySupport: false
    },
    description: 'Get started — 500 credits/month, basic models'
  },
  pro: {
    name: 'Pro',
    price: 29,
    currency: 'usd',
    interval: 'month',
    monthlyCredits: 5000,
    modelTiers: ['cheap', 'standard'],
    maxAgents: 7,
    rateLimit: 200,
    features: {
      scheduling: true,
      batching: false,
      byok: false,
      advancedWorkflows: true,
      prioritySupport: false
    },
    description: 'For serious builders — 5 000 credits/month'
  },
  elite: {
    name: 'Elite',
    price: 99,
    currency: 'usd',
    interval: 'month',
    monthlyCredits: 50000,
    modelTiers: ['cheap', 'standard', 'premium'],
    maxAgents: 7,
    rateLimit: 1000,
    features: {
      scheduling: true,
      batching: true,
      byok: true,
      advancedWorkflows: true,
      prioritySupport: true
    },
    description: 'Unlimited power — 50 000 credits/month, all models'
  }
};

// ── IN-MEMORY STORES ─────────────────────────────────────────────────────────
// These are the canonical runtime stores.  Persistence is handled below.
// To swap to a real DB: replace the read/write helpers at the bottom of this
// file (search for "── PERSISTENCE HELPERS ──").

/**
 * customerDatabase[userId] = {
 *   userId, email, name,
 *   tier: 'free'|'pro'|'elite',
 *   status: 'active'|'cancelled'|'past_due',
 *   stripeCustomerId: string|null,
 *   subscriptionId: string|null,
 *   creditsRemaining: number,
 *   creditsMonthly: number,     // snapshot of tier limit at last reset
 *   cycleStart: ISO string,     // when current billing cycle began
 *   createdAt: ISO string,
 *   updatedAt: ISO string
 * }
 */
const customerDatabase = {};

/**
 * ledger[userId] = [
 *   { id, type:'debit'|'credit', amount, reason, agent, brain, tokens, costUsd, balance, ts }
 * ]
 * Capped at 1 000 entries per user to bound memory.
 */
const ledger = {};

/**
 * usageDatabase[userId] = {
 *   requestsThisMinute, lastResetTime,
 *   totalTokens, totalCostUsd,
 *   callsByAgent: { agentName: count },
 *   callsByBrain:  { brainName: count },
 *   updatedAt
 * }
 */
const usageDatabase = {};

const webhookLog = {};

// ── PERSISTENCE HELPERS ──────────────────────────────────────────────────────
// Swap these four functions to use database-real.js when a DB is wired.

const DATA_DIR = path.join(__dirname, 'data');

function _ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function loadPersistentData() {
  _ensureDataDir();
  const files = {
    customerDatabase: path.join(DATA_DIR, 'customers.json'),
    ledger:           path.join(DATA_DIR, 'ledger.json'),
    usageDatabase:    path.join(DATA_DIR, 'usage.json')
  };
  [['customerDatabase', customerDatabase],
   ['ledger', ledger],
   ['usageDatabase', usageDatabase]].forEach(([key, store]) => {
    try {
      if (fs.existsSync(files[key])) {
        const data = JSON.parse(fs.readFileSync(files[key], 'utf8'));
        Object.assign(store, data);
        logger.info(`Loaded ${key}`);
      }
    } catch (err) {
      logger.warn(`Could not load ${key}: ${err.message}`);
    }
  });
}

function savePersistentData() {
  _ensureDataDir();
  try {
    fs.writeFileSync(path.join(DATA_DIR, 'customers.json'), JSON.stringify(customerDatabase, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'ledger.json'),    JSON.stringify(ledger, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'usage.json'),     JSON.stringify(usageDatabase, null, 2));
  } catch (err) {
    logger.error('Failed to save persistent data:', err.message);
  }
}

// ── CREDIT LEDGER HELPERS ────────────────────────────────────────────────────

function _ensureLedger(userId) {
  if (!ledger[userId]) ledger[userId] = [];
}

function _getBalance(userId) {
  const cust = customerDatabase[userId];
  return cust ? cust.creditsRemaining : 0;
}

/**
 * credit(userId, amount, reason)
 * Add credits to a user's balance. Returns new balance.
 */
function credit(userId, amount, reason) {
  const cust = customerDatabase[userId];
  if (!cust) throw new Error(`User ${userId} not found in billing system`);
  const prev = cust.creditsRemaining;
  cust.creditsRemaining = Math.max(0, prev + amount);
  cust.updatedAt = new Date().toISOString();
  _ensureLedger(userId);
  const entry = {
    id: uuidv4(),
    type: 'credit',
    amount,
    reason: reason || 'manual_credit',
    balance: cust.creditsRemaining,
    ts: new Date().toISOString()
  };
  ledger[userId].push(entry);
  if (ledger[userId].length > 1000) ledger[userId] = ledger[userId].slice(-1000);
  savePersistentData();
  logger.info(`Credit +${amount} for ${userId} (${reason}). Balance: ${cust.creditsRemaining}`);
  return cust.creditsRemaining;
}

/**
 * debit(userId, amount, reason)
 * Subtract credits from a user's balance.
 * Returns { ok, balance, shortfall } — does NOT throw on insufficient credits
 * so callers can decide whether to hard-block or soft-warn.
 */
function debit(userId, amount, reason) {
  const cust = customerDatabase[userId];
  if (!cust) {
    // Unknown user — create a ghost free-tier record and debit
    _ensureUserRecord(userId, { tier: 'free' });
    return debit(userId, amount, reason);
  }
  const prev = cust.creditsRemaining;
  const shortfall = Math.max(0, amount - prev);
  cust.creditsRemaining = Math.max(0, prev - amount);
  cust.updatedAt = new Date().toISOString();
  _ensureLedger(userId);
  const entry = {
    id: uuidv4(),
    type: 'debit',
    amount,
    reason: reason || 'usage',
    balance: cust.creditsRemaining,
    shortfall: shortfall > 0 ? shortfall : undefined,
    ts: new Date().toISOString()
  };
  ledger[userId].push(entry);
  if (ledger[userId].length > 1000) ledger[userId] = ledger[userId].slice(-1000);
  savePersistentData();
  if (shortfall > 0) {
    logger.warn(`Debit -${amount} for ${userId} hit zero (shortfall ${shortfall}). Balance: 0`);
  }
  return { ok: shortfall === 0, balance: cust.creditsRemaining, shortfall };
}

/**
 * getTransactionHistory(userId, limit?)
 * Returns the ledger array for a user, newest first.
 */
function getTransactionHistory(userId, limit = 50) {
  const entries = ledger[userId] || [];
  return entries.slice(-limit).reverse();
}

// ── USAGE METERING — SINGLE CHOKEPOINT ──────────────────────────────────────

/**
 * recordUsage({ userId, agent, brain, tokens, costUsd })
 *
 * Called by the LLM brain layer after every inference.
 * Converts costUsd → credits (1 credit = $0.001) and debits the user.
 * Also updates aggregate usage stats.
 *
 * @param {object} p
 * @param {string}  p.userId   — user identifier
 * @param {string}  [p.agent]  — agent name e.g. "NEXUS" (optional)
 * @param {string}  [p.brain]  — model/brain used e.g. "llama3.2:1b" (optional)
 * @param {number}  [p.tokens] — total tokens consumed (optional, for logging)
 * @param {number}  [p.costUsd]— USD cost of the call (optional; if absent, tokens*0.000001 used)
 * @returns {{ ok, creditsDebited, balance, shortfall }}
 */
function recordUsage({ userId, agent = 'unknown', brain = 'unknown', tokens = 0, costUsd = 0 } = {}) {
  if (!userId) {
    logger.warn('recordUsage called without userId — skipping');
    return { ok: false, creditsDebited: 0, balance: 0, shortfall: 0 };
  }

  // Ensure user exists in billing system; default to free tier
  if (!customerDatabase[userId]) {
    _ensureUserRecord(userId, { tier: 'free' });
  }

  // Convert cost to credits. Minimum 1 credit per call so free-tier depletes.
  const derivedCost = costUsd > 0 ? costUsd : tokens * 0.000001;
  const creditsToDebit = Math.max(1, Math.round(derivedCost * 1000));

  const result = debit(userId, creditsToDebit, `llm:${agent}:${brain}`);

  // Update aggregate usage stats
  if (!usageDatabase[userId]) {
    usageDatabase[userId] = {
      requestsThisMinute: 0,
      lastResetTime: Date.now(),
      totalTokens: 0,
      totalCostUsd: 0,
      callsByAgent: {},
      callsByBrain: {},
      updatedAt: new Date().toISOString()
    };
  }
  const u = usageDatabase[userId];
  u.totalTokens  += tokens;
  u.totalCostUsd  = Number((u.totalCostUsd + derivedCost).toFixed(6));
  u.callsByAgent[agent] = (u.callsByAgent[agent] || 0) + 1;
  u.callsByBrain[brain] = (u.callsByBrain[brain] || 0) + 1;
  u.updatedAt = new Date().toISOString();

  // Rate-limit counter
  const now = Date.now();
  if (now - u.lastResetTime > 60000) {
    u.requestsThisMinute = 0;
    u.lastResetTime = now;
  }
  u.requestsThisMinute++;

  savePersistentData();

  return {
    ok: result.ok,
    creditsDebited: creditsToDebit,
    balance: result.balance,
    shortfall: result.shortfall
  };
}

// ── USER RECORD MANAGEMENT ───────────────────────────────────────────────────

/**
 * _ensureUserRecord — internal: create a minimal record if one doesn't exist.
 */
function _ensureUserRecord(userId, opts = {}) {
  if (customerDatabase[userId]) return;
  const tier = opts.tier || 'free';
  const tc   = TIER_CONFIG[tier] || TIER_CONFIG.free;
  customerDatabase[userId] = {
    userId,
    email:              opts.email  || null,
    name:               opts.name   || null,
    tier,
    status:             'active',
    stripeCustomerId:   null,
    subscriptionId:     null,
    creditsRemaining:   tc.monthlyCredits,
    creditsMonthly:     tc.monthlyCredits,
    cycleStart:         new Date().toISOString(),
    createdAt:          new Date().toISOString(),
    updatedAt:          new Date().toISOString()
  };
  savePersistentData();
}

/**
 * createCustomer(userId, email, name, opts?)
 * Registers a user in the billing system (no live Stripe call until checkout).
 * If Stripe is configured, also creates a Stripe customer.
 */
async function createCustomer(userId, email, name, opts = {}) {
  if (customerDatabase[userId]) {
    logger.info(`Customer ${userId} already exists`);
    return customerDatabase[userId];
  }

  const tier = opts.tier || 'free';
  const tc   = TIER_CONFIG[tier] || TIER_CONFIG.free;

  customerDatabase[userId] = {
    userId,
    email,
    name,
    tier,
    status: 'active',
    stripeCustomerId: null,
    subscriptionId:   null,
    creditsRemaining: tc.monthlyCredits,
    creditsMonthly:   tc.monthlyCredits,
    cycleStart:       new Date().toISOString(),
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString()
  };

  // Optionally create Stripe customer if key is present
  const stripe = getStripe();
  if (stripe) {
    try {
      const sc = await stripe.customers.create({
        email, name,
        metadata: { userId, createdAt: new Date().toISOString() }
      });
      customerDatabase[userId].stripeCustomerId = sc.id;
      logger.info(`Created Stripe customer ${sc.id} for user ${userId}`);
    } catch (err) {
      logger.warn(`Stripe customer creation failed (non-fatal): ${err.message}`);
    }
  }

  savePersistentData();
  logger.info(`Created billing record for user ${userId} (tier: ${tier})`);
  return customerDatabase[userId];
}

/**
 * getCustomer(userId) — synchronous lookup.
 */
function getCustomer(userId) {
  return customerDatabase[userId] || null;
}

/**
 * getOrCreateCustomer(userId, email, name) — convenience for middleware.
 */
async function getOrCreateCustomer(userId, email, name) {
  if (customerDatabase[userId]) return customerDatabase[userId];
  return createCustomer(userId, email || `${userId}@shaddai.app`, name || userId);
}

// ── SUBSCRIPTION MANAGEMENT ──────────────────────────────────────────────────

/**
 * createSubscription(customerId, tier)
 * If Stripe is configured: creates a real Stripe subscription and returns clientSecret.
 * If not configured:       returns a stub with configured:false so the FE can show setup UI.
 */
async function createSubscription(customerId, tier) {
  if (!TIER_CONFIG[tier]) {
    throw new Error(`Invalid tier: ${tier}. Must be free, pro, or elite`);
  }

  const stripe = getStripe();
  const priceId = STRIPE_PRICES[tier];

  if (!stripe || !priceId) {
    // Stub — Stripe not configured
    logger.warn(`Stripe not configured — returning stub for tier ${tier}`);
    return {
      configured: false,
      tier,
      message: `Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_${tier.toUpperCase()} in .env to enable live billing.`,
      clientSecret: null,
      subscriptionId: null
    };
  }

  // Retrieve or create Stripe customer record
  const cust = customerDatabase[customerId];
  let stripeCustomerId = cust && cust.stripeCustomerId;
  if (!stripeCustomerId) {
    const sc = await stripe.customers.create({
      email: cust && cust.email,
      metadata: { userId: customerId }
    });
    stripeCustomerId = sc.id;
    if (cust) { cust.stripeCustomerId = stripeCustomerId; savePersistentData(); }
  }

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
    metadata: { tier, createdAt: new Date().toISOString() }
  });

  logger.info(`Created ${tier} subscription ${subscription.id} for user ${customerId}`);

  return {
    configured: true,
    subscriptionId: subscription.id,
    status: subscription.status,
    tier,
    clientSecret: subscription.latest_invoice?.payment_intent?.client_secret || null,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd:   new Date(subscription.current_period_end   * 1000)
  };
}

/**
 * confirmSubscription(userId, subscriptionId, tier)
 * Called after Stripe payment intent succeeds.
 * Activates the tier and resets the credit balance.
 */
async function confirmSubscription(userId, subscriptionId, tier) {
  if (!customerDatabase[userId]) throw new Error(`Customer ${userId} not found`);
  if (!TIER_CONFIG[tier]) throw new Error(`Invalid tier: ${tier}`);

  const stripe = getStripe();
  if (stripe) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (!['active', 'incomplete'].includes(sub.status)) {
      throw new Error(`Subscription status is ${sub.status}, not active`);
    }
  }

  const tc = TIER_CONFIG[tier];
  Object.assign(customerDatabase[userId], {
    tier,
    subscriptionId,
    status: 'active',
    creditsRemaining: tc.monthlyCredits,
    creditsMonthly:   tc.monthlyCredits,
    cycleStart:       new Date().toISOString(),
    updatedAt:        new Date().toISOString()
  });

  // Credit the new allocation to ledger
  _ensureLedger(userId);
  ledger[userId].push({
    id: uuidv4(),
    type: 'credit',
    amount: tc.monthlyCredits,
    reason: `subscription_activated:${tier}`,
    balance: tc.monthlyCredits,
    ts: new Date().toISOString()
  });

  savePersistentData();
  logger.info(`Confirmed ${tier} subscription for user ${userId}`);
  return customerDatabase[userId];
}

/**
 * updateSubscription(userId, newTier)
 * Changes tier in-memory (and Stripe if configured).
 * Credits the difference when upgrading; does NOT refund on downgrade.
 */
async function updateSubscription(userId, newTier) {
  if (!TIER_CONFIG[newTier]) throw new Error(`Invalid tier: ${newTier}`);
  const cust = customerDatabase[userId];
  if (!cust) throw new Error(`Customer ${userId} not found`);

  const oldTc  = TIER_CONFIG[cust.tier] || TIER_CONFIG.free;
  const newTc  = TIER_CONFIG[newTier];
  const stripe = getStripe();

  if (stripe && cust.subscriptionId && STRIPE_PRICES[newTier]) {
    try {
      const sub   = await stripe.subscriptions.retrieve(cust.subscriptionId);
      await stripe.subscriptions.update(cust.subscriptionId, {
        items: [{ id: sub.items.data[0].id, price: STRIPE_PRICES[newTier] }],
        proration_behavior: 'create_prorations',
        metadata: { tier: newTier, updatedAt: new Date().toISOString() }
      });
    } catch (err) {
      logger.warn(`Stripe subscription update failed (non-fatal): ${err.message}`);
    }
  }

  // Top up credits if upgrading
  if (newTc.monthlyCredits > oldTc.monthlyCredits && newTc.monthlyCredits !== -1) {
    const top = newTc.monthlyCredits - oldTc.monthlyCredits;
    credit(userId, top, `upgrade:${cust.tier}->${newTier}`);
  }

  Object.assign(cust, {
    tier: newTier,
    creditsMonthly: newTc.monthlyCredits,
    updatedAt: new Date().toISOString()
  });

  savePersistentData();
  logger.info(`Updated ${userId} subscription from ${cust.tier} to ${newTier}`);
  return customerDatabase[userId];
}

/**
 * cancelSubscription(userId)
 * Cancels in Stripe (if configured) and marks tier as cancelled in-memory.
 */
async function cancelSubscription(userId) {
  const cust = customerDatabase[userId];
  if (!cust) throw new Error(`Customer ${userId} not found`);

  const stripe = getStripe();
  let stripeResult = null;
  if (stripe && cust.subscriptionId) {
    try {
      stripeResult = await stripe.subscriptions.del(cust.subscriptionId);
    } catch (err) {
      logger.warn(`Stripe cancellation failed (non-fatal): ${err.message}`);
    }
  }

  Object.assign(cust, {
    tier:           'free',
    subscriptionId: null,
    status:         'cancelled',
    updatedAt:      new Date().toISOString()
  });
  savePersistentData();
  logger.info(`Cancelled subscription for user ${userId}`);

  return {
    userId,
    status: 'cancelled',
    stripeStatus: stripeResult ? stripeResult.status : 'not_configured',
    cancelledAt:  new Date().toISOString()
  };
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────

async function enforceRateLimit(userId, tier) {
  const tierConfig = TIER_CONFIG[tier];
  if (!tierConfig) return { allowed: false, error: `Invalid tier: ${tier}` };

  if (!usageDatabase[userId]) {
    usageDatabase[userId] = {
      requestsThisMinute: 0,
      lastResetTime: Date.now(),
      totalTokens: 0,
      totalCostUsd: 0,
      callsByAgent: {},
      callsByBrain: {},
      updatedAt: new Date().toISOString()
    };
  }

  const u = usageDatabase[userId];
  const now = Date.now();
  if (now - u.lastResetTime > 60000) {
    u.requestsThisMinute = 0;
    u.lastResetTime = now;
  }

  if (u.requestsThisMinute >= tierConfig.rateLimit) {
    const retryAfter = Math.ceil((60000 - (now - u.lastResetTime)) / 1000);
    logger.warn(`Rate limit exceeded for ${userId}: ${u.requestsThisMinute}/${tierConfig.rateLimit}`);
    return {
      allowed: false,
      error: `Rate limit exceeded: ${u.requestsThisMinute}/${tierConfig.rateLimit} req/min`,
      retryAfter,
      current: u.requestsThisMinute,
      limit: tierConfig.rateLimit
    };
  }

  u.requestsThisMinute++;
  u.updatedAt = new Date().toISOString();
  savePersistentData();

  return {
    allowed: true,
    current: u.requestsThisMinute,
    limit: tierConfig.rateLimit,
    remaining: tierConfig.rateLimit - u.requestsThisMinute,
    resetTime: new Date(u.lastResetTime + 60000)
  };
}

// ── SUBSCRIPTION INFO ─────────────────────────────────────────────────────────

async function getSubscriptionInfo(userId) {
  const customer = customerDatabase[userId];
  if (!customer) return null;

  const u  = usageDatabase[userId] || {};
  const tc = TIER_CONFIG[customer.tier] || TIER_CONFIG.free;

  return {
    customer: {
      userId,
      email:  customer.email,
      name:   customer.name,
      status: customer.status,
      stripeCustomerId: customer.stripeCustomerId
    },
    subscription: {
      subscriptionId: customer.subscriptionId,
      tier:           customer.tier,
      tierName:       tc.name,
      status:         customer.status,
      cycleStart:     customer.cycleStart,
      updatedAt:      customer.updatedAt
    },
    credits: {
      remaining: customer.creditsRemaining,
      monthly:   customer.creditsMonthly,
      used:      Math.max(0, (customer.creditsMonthly === -1 ? 0 : customer.creditsMonthly) - customer.creditsRemaining),
      pct:       customer.creditsMonthly === -1
        ? 0
        : Math.min(100, Math.round(
            ((customer.creditsMonthly - customer.creditsRemaining) / customer.creditsMonthly) * 100
          ))
    },
    tierLimits: tc,
    usage: {
      requestsThisMinute: u.requestsThisMinute || 0,
      totalTokens:        u.totalTokens  || 0,
      totalCostUsd:       u.totalCostUsd || 0,
      callsByAgent:       u.callsByAgent || {},
      callsByBrain:       u.callsByBrain || {},
      resetTime: u.lastResetTime ? new Date(u.lastResetTime + 60000) : null
    }
  };
}

// ── INVOICES (Stripe-backed) ──────────────────────────────────────────────────

async function getInvoices(userId) {
  const cust   = customerDatabase[userId];
  const stripe = getStripe();

  if (!stripe || !cust || !cust.stripeCustomerId) {
    // Return ledger credits as synthetic "invoices" when Stripe isn't configured
    const entries = (ledger[userId] || [])
      .filter(e => e.type === 'credit' && e.reason && e.reason.startsWith('subscription'))
      .map(e => ({
        id:          e.id,
        type:        'credit_grant',
        amount:      e.amount,
        reason:      e.reason,
        ts:          e.ts,
        source:      'ledger'
      }));
    return { configured: false, invoices: entries };
  }

  try {
    const invoices = await stripe.invoices.list({ customer: cust.stripeCustomerId, limit: 50 });
    return {
      configured: true,
      invoices: invoices.data.map(inv => ({
        id:               inv.id,
        invoiceNumber:    inv.number,
        amount:           inv.amount_paid,
        currency:         inv.currency,
        status:           inv.status,
        paidAt:           inv.paid_at ? new Date(inv.paid_at * 1000) : null,
        periodStart:      new Date(inv.period_start * 1000),
        periodEnd:        new Date(inv.period_end   * 1000),
        hostedInvoiceUrl: inv.hosted_invoice_url,
        pdfUrl:           inv.invoice_pdf
      }))
    };
  } catch (err) {
    logger.error(`Failed to get invoices for ${userId}: ${err.message}`);
    return { configured: true, invoices: [], error: err.message };
  }
}

// ── STRIPE WEBHOOKS ───────────────────────────────────────────────────────────

async function handleWebhook(event) {
  if (webhookLog[event.id]) {
    return { eventId: event.id, status: 'already_processed' };
  }

  let result = { eventId: event.id, eventType: event.type, status: 'processed', ts: new Date() };

  switch (event.type) {
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      // Find user by stripeCustomerId
      const userId = Object.keys(customerDatabase).find(
        uid => customerDatabase[uid].stripeCustomerId === sub.customer
      );
      if (userId) {
        const tierMeta = sub.metadata && sub.metadata.tier;
        if (tierMeta && TIER_CONFIG[tierMeta]) {
          const tc = TIER_CONFIG[tierMeta];
          Object.assign(customerDatabase[userId], {
            tier:           tierMeta,
            subscriptionId: sub.id,
            status:         sub.status === 'active' ? 'active' : sub.status,
            creditsMonthly: tc.monthlyCredits,
            updatedAt:      new Date().toISOString()
          });
          savePersistentData();
        }
      }
      result.action = 'subscription_updated';
      break;
    }
    case 'invoice.payment_succeeded': {
      const inv    = event.data.object;
      const userId = Object.keys(customerDatabase).find(
        uid => customerDatabase[uid].stripeCustomerId === inv.customer
      );
      if (userId) {
        // Reset monthly credits on successful payment (new billing cycle)
        const tc = TIER_CONFIG[customerDatabase[userId].tier] || TIER_CONFIG.free;
        customerDatabase[userId].creditsRemaining = tc.monthlyCredits;
        customerDatabase[userId].cycleStart       = new Date().toISOString();
        customerDatabase[userId].updatedAt        = new Date().toISOString();
        credit(userId, tc.monthlyCredits, `monthly_reset:invoice:${inv.id}`);
      }
      result.action = 'credits_reset';
      break;
    }
    case 'customer.subscription.deleted': {
      const sub    = event.data.object;
      const userId = Object.keys(customerDatabase).find(
        uid => customerDatabase[uid].stripeCustomerId === sub.customer
      );
      if (userId) {
        Object.assign(customerDatabase[userId], {
          tier: 'free', subscriptionId: null, status: 'cancelled', updatedAt: new Date().toISOString()
        });
        savePersistentData();
      }
      result.action = 'subscription_cancelled';
      break;
    }
    case 'invoice.payment_failed':
      result.action = 'invoice_failed';
      logger.warn(`Invoice payment failed: ${event.data.object.id}`);
      break;
    default:
      result.action = 'no_op';
  }

  webhookLog[event.id] = { ts: new Date(), status: 'processed' };
  return result;
}

// ── MOONPAY STUB ──────────────────────────────────────────────────────────────
// Crypto payments route through the existing /api/moonpay module (moonpay-agent.js).
// This stub exposes the configuration status so the FE can show the correct payment UI.

function getMoonpayStatus() {
  const configured = !!(process.env.MOONPAY_API_KEY || process.env.MOONPAY_SECRET_KEY);
  return {
    configured,
    message: configured
      ? 'MoonPay is configured. Crypto payments are handled via /api/moonpay.'
      : 'MoonPay not configured. Set MOONPAY_API_KEY in .env to enable crypto payments.',
    endpoint: '/api/moonpay'
    // TODO: wire actual credit-top-up flow — when MoonPay webhook fires for a userId,
    //       call credit(userId, amountInCredits, 'moonpay:txId') to add credits.
  };
}

// ── INIT ──────────────────────────────────────────────────────────────────────
loadPersistentData();

// ── EXPORTS ───────────────────────────────────────────────────────────────────
module.exports = {
  // Tier definitions (canonical)
  TIER_CONFIG,
  STRIPE_PRICES,
  TIER_LIMITS: TIER_CONFIG, // back-compat alias

  // Customer management
  createCustomer,
  getCustomer,
  getOrCreateCustomer,
  getSubscriptionInfo,

  // Subscription management
  createSubscription,
  confirmSubscription,
  updateSubscription,
  cancelSubscription,

  // Credit ledger
  credit,
  debit,
  getTransactionHistory,

  // Usage metering — call from LLM brain layer
  recordUsage,

  // Rate limiting
  enforceRateLimit,

  // Invoices
  getInvoices,

  // Webhooks
  handleWebhook,

  // Payment provider status
  getMoonpayStatus,
  getStripe, // expose for stripe webhook verification in routes

  // Internal helpers (exported for tests / admin tooling)
  _ensureUserRecord
};
