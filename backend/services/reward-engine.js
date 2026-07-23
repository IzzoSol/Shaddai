'use strict';
/**
 * SHADDAI Reward Engine — the brain of the referral flywheel.
 *
 * Takes a qualified referral event and decides the payout across FOUR pipes:
 *   1. Sparks           (internal soft credits — economy-service)
 *   2. Reputation       (internal trust score — reputation-service attestation)
 *   3. Status Perks     (internal placement/badges — status-perk-service, deferred consumer)
 *   4. Revenue Settlement (REAL MONEY — treasury-service; runs ONLY on money events)
 *
 * THE MONEY-EVENT RULE (non-negotiable):
 *   Nothing "prints money" by existing. Sparks / Reputation / Status Perks fire on
 *   any good event, but a RevenueSettlement (splitting real gross value into
 *   treasury / owner / referrer / eco / partner pools) is produced ONLY when the
 *   event type is a real monetized event AND a positive grossCents is supplied.
 *
 * PHASE LINE ("record everything, cash-out nothing yet"):
 *   settle() RECORDS a settlement with status 'pending' and accrues pool balances.
 *   It does NOT move real money out (no Stripe payout / USDC transfer). Actual
 *   cash-out is a separate, later, separately-reviewed sub-project.
 *
 * planReward() is a PURE function (no I/O) so the money math is trivially testable.
 * settle() is the orchestrator that applies a plan through injected services.
 *
 * Money amounts are integer CENTS (USD/USDC). No floats, ever — matching the
 * economy-service ledger discipline.
 */

// Which event types represent REAL money arriving.
const MONEY_EVENTS = new Set([
  'paid_signup',
  'subscription',
  'x402_purchase',
  'hire',
  'marketplace_sale',
  'sponsorship',
  'creator_payout',
]);

// Internal reward per event type: Sparks, base Reputation, and an optional
// Status Perk kind. Reputation is a small integer; the engine caps it at 50.
// `perkMinValue` gates perks that should only fire past a magnitude threshold
// (e.g. a room-visit milestone).
const REWARD_RULES = {
  // ── non-money events (internal pipes only) ──
  view:             { sparks: 1,  reputation: 0,  perk: null,                 money: false },
  click:            { sparks: 2,  reputation: 0,  perk: null,                 money: false },
  visit:            { sparks: 5,  reputation: 0,  perk: 'visibility-boost',   money: false, perkMinValue: 10 },
  signup:           { sparks: 25, reputation: 0,  perk: null,                 money: false }, // free/waitlist signup
  // ── money events (internal pipes + revenue settlement) ──
  paid_signup:      { sparks: 25, reputation: 5,  perk: 'featured-placement', money: true },
  subscription:     { sparks: 15, reputation: 8,  perk: 'district-badge',     money: true },
  x402_purchase:    { sparks: 20, reputation: 4,  perk: null,                 money: true },
  hire:             { sparks: 10, reputation: 12, perk: 'featured-placement', money: true },
  marketplace_sale: { sparks: 15, reputation: 3,  perk: null,                 money: true },
  sponsorship:      { sparks: 10, reputation: 6,  perk: 'district-badge',     money: true },
  creator_payout:   { sparks: 5,  reputation: 2,  perk: null,                 money: true },
};

const REPUTATION_CAP = 50;

// Revenue split templates (fractions of gross) per money event. Each row sums to
// 1.0 across treasury+owner+referrer+eco+partner. These are admin-tunable policy
// examples, not fixed promises.
const SPLIT_TEMPLATES = {
  paid_signup:      { owner: 0.20, referrer: 0.20, eco: 0.10, partner: 0.00 }, // treasury = remainder (0.50)
  subscription:     { owner: 0.20, referrer: 0.20, eco: 0.10, partner: 0.00 }, // treasury 0.50
  x402_purchase:    { owner: 0.30, referrer: 0.20, eco: 0.15, partner: 0.00 }, // treasury 0.35
  hire:             { owner: 0.45, referrer: 0.20, eco: 0.10, partner: 0.00 }, // treasury 0.25
  marketplace_sale: { owner: 0.30, referrer: 0.30, eco: 0.10, partner: 0.00 }, // treasury 0.30
  sponsorship:      { owner: 0.15, referrer: 0.15, eco: 0.50, partner: 0.00 }, // treasury 0.20
  creator_payout:   { owner: 0.60, referrer: 0.15, eco: 0.10, partner: 0.00 }, // treasury 0.15
};

/**
 * Split an integer gross (cents) across the pools using integer math. The
 * treasury absorbs the rounding remainder so the parts ALWAYS sum EXACTLY to
 * gross — no cent is ever created or lost.
 * @returns {{treasury:number,owner:number,referrer:number,eco:number,partner:number}}
 */
function splitAmount(grossCents, template) {
  const parts = { treasury: 0, owner: 0, referrer: 0, eco: 0, partner: 0 };
  let allocated = 0;
  for (const key of ['owner', 'referrer', 'eco', 'partner']) {
    const amt = Math.floor(grossCents * (template[key] || 0));
    parts[key] = amt;
    allocated += amt;
  }
  parts.treasury = grossCents - allocated; // remainder-safe
  return parts;
}

function isMoneyEvent(eventType) {
  return MONEY_EVENTS.has(eventType);
}

/**
 * planReward — PURE. Given an event, return the full payout plan. No side effects.
 *
 * @param {object} event
 * @param {string} event.eventType    one of REWARD_RULES keys
 * @param {number} [event.value]      magnitude; for money events this is grossCents
 * @param {string} [event.currency]   'USD' | 'USDC' (money events)
 * @returns {{
 *   eventType:string, qualified:boolean,
 *   internal:{ sparks:number, reputation:number, perk:(string|null) },
 *   money:(null|{ grossCents:number, currency:string, split:object })
 * }}
 */
function planReward(event) {
  const eventType = event && event.eventType;
  const rule = REWARD_RULES[eventType];
  if (!rule) {
    return { eventType: eventType || null, qualified: false, internal: { sparks: 0, reputation: 0, perk: null }, money: null };
  }

  const value = Number(event.value) || 0;

  // Perk fires only if the rule defines one and any magnitude gate is met.
  let perk = rule.perk;
  if (perk && rule.perkMinValue != null && value < rule.perkMinValue) perk = null;

  const internal = {
    sparks: rule.sparks,
    reputation: Math.min(REPUTATION_CAP, rule.reputation),
    perk,
  };

  let money = null;
  if (rule.money && isMoneyEvent(eventType)) {
    const grossCents = Math.max(0, Math.trunc(value));
    if (grossCents > 0) {
      money = {
        grossCents,
        currency: event.currency === 'USDC' ? 'USDC' : 'USD',
        split: splitAmount(grossCents, SPLIT_TEMPLATES[eventType] || {}),
      };
    }
  }

  return { eventType, qualified: true, internal, money };
}

/**
 * settle — apply a plan for an already-recorded, non-duplicate attribution.
 *
 * Idempotency is the CALLER's responsibility: settle() must only be invoked once
 * per attribution (the referral-service dedups attributions, and each pipe below
 * is additionally keyed by the attribution id). Returns a receipt describing what
 * fired.
 *
 * @param {object} attribution  a persisted ReferralAttribution (must have id, promoterAgentId, ...)
 * @param {object} deps
 * @param {object} [deps.economy]     EconomyService-like: grant(userId, amount, reason, idemKey)
 * @param {object} [deps.reputation]  reputation-service-like: recordAttestation(did, type, outcome, meta)
 * @param {object} [deps.statusPerks] status-perk-service-like: award({...})
 * @param {object} [deps.treasury]    treasury-service-like: recordSettlement({...})
 * @returns {Promise<object>} receipt
 */
async function settle(attribution, deps = {}) {
  const plan = planReward({
    eventType: attribution.eventType,
    value: attribution.value,
    currency: attribution.currency,
  });

  const receipt = {
    attributionId: attribution.id,
    eventType: attribution.eventType,
    qualified: plan.qualified,
    sparks: 0,
    reputation: 0,
    perk: null,
    settlement: null,
  };
  if (!plan.qualified) return receipt;

  const idem = attribution.id; // stable per-attribution key across all pipes

  // Pipe 1: Sparks → the referring agent's OWNER (agents don't hold balances; owners do).
  if (plan.internal.sparks > 0 && deps.economy && attribution.promoterOwnerUserId) {
    try {
      await deps.economy.grant(
        attribution.promoterOwnerUserId,
        plan.internal.sparks,
        `referral:${attribution.eventType}`,
        `ref_sparks_${idem}`,
        { refId: idem }
      );
      receipt.sparks = plan.internal.sparks;
    } catch (_) { /* non-fatal: reward pipe failure must not lose the attribution */ }
  }

  // Pipe 2: Reputation → attestation against the promoter agent's DID.
  if (plan.internal.reputation > 0 && deps.reputation && attribution.promoterAgentDid) {
    try {
      deps.reputation.recordAttestation(
        attribution.promoterAgentDid,
        'referral_conversion',
        'success',
        { endpoint: attribution.eventType, amount: plan.internal.reputation }
      );
      receipt.reputation = plan.internal.reputation;
    } catch (_) { /* non-fatal */ }
  }

  // Pipe 3: Status Perk → deferred ledger (no live consumer yet).
  if (plan.internal.perk && deps.statusPerks) {
    try {
      await deps.statusPerks.award({
        agentId: attribution.promoterAgentId,
        perkType: plan.internal.perk,
        reason: `referral:${attribution.eventType}`,
        sourceAttributionId: idem,
      });
      receipt.perk = plan.internal.perk;
    } catch (_) { /* non-fatal */ }
  }

  // Pipe 4: Revenue Settlement → REAL money split, RECORDED as pending. No cash-out.
  if (plan.money && deps.treasury) {
    try {
      receipt.settlement = await deps.treasury.recordSettlement({
        attributionId: idem,
        sourceType: attribution.eventType,
        grossAmount: plan.money.grossCents,
        currency: plan.money.currency,
        split: plan.money.split,
        ownerUserId: attribution.promoterOwnerUserId || null,
      });
    } catch (_) { /* non-fatal */ }
  }

  return receipt;
}

module.exports = {
  planReward,
  settle,
  splitAmount,
  isMoneyEvent,
  MONEY_EVENTS,
  REWARD_RULES,
  SPLIT_TEMPLATES,
  REPUTATION_CAP,
};
