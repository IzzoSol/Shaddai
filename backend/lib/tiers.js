/* ══════════════════════════════════════════════════════════════════════════
   TIERS — the single source of truth for what a plan costs and unlocks.

   There were THREE disagreeing definitions in this codebase:

     billing-service.js  TIER_CONFIG   free / pro $29 / elite $99
     stripe-routes.js    TIERS         builder $19 / pro $49 / alpha $199
     public/pricing.html hardcoded     Pro $30 / Max $200

   and the webhook mapped the `alpha` purchase onto the `elite` tier, so
   somebody buying the "$200 Max" link was granted a plan another file priced
   at $99. Nobody could answer "what does Pro cost" from the code, which means
   nobody could answer it for a customer either.

   ── THE RULE ────────────────────────────────────────────────────────────────
   STRIPE IS THE REAL PRICE. What a Payment Link charges is what the customer
   pays; this file only DESCRIBES it. If a price here disagrees with Stripe,
   this file is wrong — fix it here, and it propagates everywhere at once.
   Run `checkAgainst()` (exposed at GET /api/stripe/plans?verify=1) after any
   change in the Stripe dashboard.

   ── ONE CURRENCY: SPARKS ────────────────────────────────────────────────────
   There is no second user-facing unit. "Credits" are an internal billing
   implementation detail at a fixed 1 Spark = 100 credits, and no surface shown
   to a person may mention them.

   TALKING IS NOT METERED. A grounded agent answer costs us about $0.0016, so
   metering it buys nothing and costs the user their peace of mind. Text is
   included at every tier and protected by a rate limit, which is abuse control
   rather than a price.

   SPARKS ARE ONLY FOR THINGS THAT COST REAL MONEY TO MAKE — images, video,
   voice, 3D models, and finished deliverables from the council. That is the
   whole rule, and it is why a single $1 unit works: nothing priced in Sparks
   is ever worth less than a dollar.

   backend/data/credit-costs.json remains the tuning surface for what an action
   costs internally; its `tiers` block is a read-only mirror.

   ITEM IDS ARE FROZEN. `builder`, `pro`, `alpha`, `founder` and `credits_*`
   are the keys in payment-config.json and in the webhook's grant table. They
   are what a live Payment Link's client_reference_id encodes. Renaming one
   silently breaks grants for anybody mid-checkout, so the DISPLAY name is
   separate from the id and only the display name may change.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* Canonical plans. `id` is the frozen item id; `tier` is the entitlement key
   billing-service stores on the customer record. */
const TIERS = [
  {
    id: 'free', tier: 'free', name: 'Free', price: 0, interval: 'month',
    blurb: 'The workstation, with your own keys.',
    monthlySparks: 0, monthlyCredits: 500, rateLimit: 30, maxAgents: 7, modelTiers: ['cheap'],
    features: { scheduling: false, batching: false, byok: true, advancedWorkflows: false, prioritySupport: false, mcp: false },
    unlocks: [
      'All seven agents, grounded in the RAG brain — talking is never metered',
      'Simple Mode and the dashboard',
      'Forge one agent',
      'Bring your own API keys — the vault is free',
      'News and the free sentiment read',
    ],
  },
  {
    id: 'pro', tier: 'pro', name: 'Pro', price: 49, interval: 'month', highlight: true,
    blurb: 'For someone running a real workflow.',
    monthlySparks: 20, monthlyCredits: 5000, rateLimit: 200, maxAgents: 7, modelTiers: ['cheap', 'standard'],
    features: { scheduling: true, batching: false, byok: true, advancedWorkflows: true, prioritySupport: false, mcp: false },
    unlocks: [
      '20 Sparks a month, included',
      'Pro Signals — the live feed, hot list and tracked wallets',
      'ZEROX sentiment and the market terminal',
      'Unlimited forged agents, each RAG-grounded',
      'Multi-agent workflow chains',
      'Video clipper and the Telegram signal bot',
      'Build 3D assets for the world',
      // NOT LISTED: selling your agent's work to other members. economy-service
      // has intentionally no transfer/payout/withdraw — Sparks are closed-loop
      // and one-directional — so there is currently NO way to pay an agent's
      // owner. Advertising it would be selling something that cannot happen.
    ],
  },
  {
    id: 'alpha', tier: 'elite', name: 'Max', price: 199, interval: 'month',
    blurb: 'For power sellers and teams.',
    monthlySparks: 120, monthlyCredits: 50000, rateLimit: 600, maxAgents: 99, modelTiers: ['cheap', 'standard', 'premium'],
    features: { scheduling: true, batching: true, byok: true, advancedWorkflows: true, prioritySupport: true, mcp: true },
    unlocks: [
      'Everything in Pro',
      '120 Sparks a month, included',
      'Full MCP — your Claude or Grok drives the council, the brain and the tools',
      'A one-to-one build session — we make your agent with you',
      'Your agent highlighted across the world and the bazaar',
      'Project spotlight — your work featured on the front door',
      'Premium models, priority compute, unlimited jobs and workflows',
      'Brain lessons and the full library',
      'Host paid rooms, portals and private meet-ups',
    ],
  },
];

/* Founder is a ONE-TIME purchase, not a plan, so it is kept out of TIERS —
   putting it in a list of monthly prices is how "$100/month" ends up on a
   page. It grants the Pro entitlement permanently. */
const FOUNDER = {
  id: 'founder', tier: 'pro', name: 'Founding member',
  price: 100, interval: 'once', seats: 20,
  blurb: 'Twenty seats. Once, then never sold again.',
  unlocks: [
    'Pro access for the first year, no renewal and no price rise',
    'A founder mark on your agent — only twenty are ever made',
    'First claim on land when plots open',
    'First access to the siege and to new realms',
    'Entered for every giveaway and for Agent of the Month',
    'A direct line to what gets built next',
  ],
  /* DELIBERATELY UNSAID: anything about revenue share, residuals or yield.
     Not a denial — a silence. The owner has not decided whether such a thing
     will ever exist, and a perk list is exactly the wrong place to speculate:
     promise it and it becomes an obligation, deny it and it forecloses an
     option. Say nothing, sell access and standing, decide later.

     "Permanently" and "for as long as SHADDAI runs" were also removed. Nobody
     can honour a forever promise on a product this young, and the first twenty
     members are precisely the people who would remember it. */
};

const CREDIT_PACKS = [
  { id: 'credits_10',  label: '$10 in Sparks',  usd: 10,  sparks: 10 },
  { id: 'credits_25',  label: '$25 in Sparks',  usd: 25,  sparks: 25 },
  { id: 'credits_50',  label: '$50 in Sparks',  usd: 50,  sparks: 50 },
  { id: 'credits_100', label: '$100 in Sparks', usd: 100, sparks: 100 },
];

const byId = (id) => TIERS.find((t) => t.id === id) || (FOUNDER.id === id ? FOUNDER : null);
const byTier = (tier) => TIERS.find((t) => t.tier === tier) || null;

/** The shape billing-service wants: keyed by entitlement, not by item id. */
function tierConfig() {
  const out = {};
  for (const t of TIERS) {
    out[t.tier] = {
      name: t.name, price: t.price, currency: 'usd', interval: t.interval,
      monthlyCredits: t.monthlyCredits, modelTiers: t.modelTiers,
      maxAgents: t.maxAgents, rateLimit: t.rateLimit,
      features: t.features, description: t.blurb,
    };
  }
  return out;
}

/** What the webhook grants per purchased item id. */
function grants() {
  const g = {};
  for (const t of TIERS) if (t.tier !== 'free') g[t.id] = { tier: t.tier };
  g.builder = { tier: 'pro' };            // retired plan; existing links still honour Pro
  g.founder = { tier: FOUNDER.tier, founder: true };
  /* The billing-credit bonus per pack lives in credit-costs.json, which owns
     credit numbers. Sparks are separate and always 1 per $1. */
  let bonus = {};
  try { bonus = (require('../data/credit-costs.json').topups) || {}; } catch (_) {}
  for (const c of CREDIT_PACKS) {
    g[c.id] = { credits: (bonus[c.id] && bonus[c.id].credits) || c.usd * 100, sparks: c.sparks };
  }
  return g;
}

/**
 * Compare these declared prices against the live Stripe Payment Links.
 * Stripe is authoritative; this reports disagreement rather than guessing.
 *
 * @param {object} links  payment-config.json `links` map
 * @param {function} [fetchAmount] async (url) => cents, when a secret key exists
 */
async function checkAgainst(links, fetchAmount) {
  const rows = [];
  const all = TIERS.filter((t) => t.price > 0).concat([FOUNDER]);
  for (const t of all) {
    const url = links && links[t.id];
    if (!url) { rows.push({ id: t.id, declared: t.price, status: 'no link configured' }); continue; }
    if (typeof fetchAmount !== 'function') {
      rows.push({ id: t.id, declared: t.price, status: 'unverified — open the link to confirm the amount', url });
      continue;
    }
    try {
      const cents = await fetchAmount(url);
      const actual = cents == null ? null : cents / 100;
      rows.push({
        id: t.id, declared: t.price, actual,
        status: actual == null ? 'could not read' : (actual === t.price ? 'match' : 'MISMATCH — Stripe wins, fix tiers.js'),
      });
    } catch (e) { rows.push({ id: t.id, declared: t.price, status: 'error: ' + e.message }); }
  }
  return rows;
}

module.exports = { TIERS, FOUNDER, CREDIT_PACKS, byId, byTier, tierConfig, grants, checkAgainst };
