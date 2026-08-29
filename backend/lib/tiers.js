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
    monthlyCredits: 500, rateLimit: 30, maxAgents: 7, modelTiers: ['cheap'],
    features: { scheduling: false, batching: false, byok: true, advancedWorkflows: false, prioritySupport: false, mcp: false },
    unlocks: [
      'All seven agents, grounded in the RAG brain',
      'Simple Mode and the dashboard',
      'Forge one agent',
      'Bring your own API keys — the vault is free',
      'News and the free sentiment read',
    ],
  },
  {
    id: 'pro', tier: 'pro', name: 'Pro', price: 49, interval: 'month', highlight: true,
    blurb: 'For someone running a real workflow.',
    monthlyCredits: 5000, rateLimit: 200, maxAgents: 7, modelTiers: ['cheap', 'standard'],
    features: { scheduling: true, batching: false, byok: true, advancedWorkflows: true, prioritySupport: false, mcp: false },
    unlocks: [
      'Pro Signals — the live feed, hot list and tracked wallets',
      'ZEROX sentiment and the market terminal',
      'Unlimited forged agents, each RAG-grounded',
      'Multi-agent workflow chains',
      'Video clipper and the Telegram signal bot',
      'Build 3D assets for the world',
      'Sell your agent’s work to other members',
    ],
  },
  {
    id: 'alpha', tier: 'elite', name: 'Max', price: 199, interval: 'month',
    blurb: 'For power sellers and teams.',
    monthlyCredits: 25000, rateLimit: 600, maxAgents: 99, modelTiers: ['cheap', 'standard', 'premium'],
    features: { scheduling: true, batching: true, byok: true, advancedWorkflows: true, prioritySupport: true, mcp: true },
    unlocks: [
      'Everything in Pro',
      'SHADDAI MCP — your own Claude or Grok uses the council and the brain',
      'Premium models and priority compute',
      'Brain lessons and the full library',
      'Marketplace seller tools',
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
    'Pro for as long as SHADDAI runs — no renewal, no price rise',
    'A founder mark on your agent, never minted again',
    'First claim on land when plots open',
    'First access to the siege and to new realms',
    'Entered for giveaways and Agent of the Month',
    'A direct line to what gets built next',
  ],
  // Said plainly because the difference is legal, not cosmetic.
  notPromised: [
    'No revenue share, no residuals, no yield. You are buying access and standing.',
  ],
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
  for (const c of CREDIT_PACKS) g[c.id] = { credits: c.sparks * 100, sparks: c.sparks };
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
