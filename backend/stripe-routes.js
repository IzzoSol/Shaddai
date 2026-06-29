// backend/stripe-routes.js — "Plug-in Payments" layer (mounted at /api/stripe).
//
// Implements the 4 endpoints the dashboard already calls (config/plans/create-checkout/verify),
// which previously 404'd and broke the billing UI with "Unexpected token '<'".
//
// TWO ways to go live, configured in backend/data/payment-config.json (gitignored):
//   1) HOSTED LINKS (fastest, no secret keys, no PCI): paste a Stripe Payment Link / Lemon Squeezy /
//      Gumroad URL per tier/product. create-checkout just redirects the buyer there. Real money, today.
//   2) FULL STRIPE: set STRIPE_SECRET_KEY + STRIPE_PRICE_* env — create-checkout builds a real
//      Checkout Session via billing-service. (Supported, but needs your secret key on the server.)
// If neither is configured, endpoints return a clear { enabled:false } so the UI shows a tidy
// "payments not set up yet" state instead of erroring.
'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const CONFIG_FILE = path.join(__dirname, 'data', 'payment-config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { mode: 'off', publishableKey: '', links: {} }; }
}
let billingService = null;
try { billingService = require('./billing-service'); } catch (_) {}

// Tier catalog the UI shows (kept here so plans work even before billing-service tiers are aligned).
const TIERS = [
  { id: 'builder', name: 'Builder', price: 19,  interval: 'month', blurb: 'For makers shipping their first agents',
    features: ['Forge custom agents', 'Run real agent tasks', '8 skill slots / agent', 'Markets + News + AURA', 'Pixel Office'] },
  { id: 'pro',     name: 'Pro',     price: 49,  interval: 'month', blurb: 'For operators running a real workflow', highlight: true,
    features: ['Everything in Builder', 'Workflow chains (multi-agent)', 'Premium brains (Groq/Claude)', '20 skill slots', 'Media/Clips tools', 'Priority compute'] },
  { id: 'alpha',   name: 'Alpha',   price: 199, interval: 'month', blurb: 'For teams + power sellers',
    features: ['Everything in Pro', 'Unlimited agents', 'Marketplace seller tools', 'API access', 'White-glove onboarding'] },
];
const CREDIT_PACKS = [
  { id: 'credits_10',  label: '$10 credits',  usd: 10 },
  { id: 'credits_25',  label: '$25 credits',  usd: 25 },
  { id: 'credits_50',  label: '$50 credits',  usd: 50 },
  { id: 'credits_100', label: '$100 credits', usd: 100 },
];

function paymentMode() {
  const cfg = loadConfig();
  const hasLinks = cfg.links && Object.values(cfg.links).some(Boolean);
  const hasStripe = !!(process.env.STRIPE_SECRET_KEY && billingService && billingService.getStripe && billingService.getStripe());
  if (hasLinks) return { mode: 'links', cfg, hasStripe };
  if (hasStripe) return { mode: 'stripe', cfg, hasStripe };
  return { mode: 'off', cfg, hasStripe: false };
}

// GET /api/stripe/config — is checkout live? + publishable key (for Stripe.js, if ever used)
router.get('/config', (req, res) => {
  const { mode, cfg } = paymentMode();
  res.json({
    ok: true,
    enabled: mode !== 'off',
    mode,                                   // 'links' | 'stripe' | 'off'
    publishableKey: cfg.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY || '',
    message: mode === 'off'
      ? 'Payments not configured yet. Add hosted checkout links in backend/data/payment-config.json (or set STRIPE_SECRET_KEY).'
      : 'Payments live (' + mode + ').',
  });
});

// GET /api/stripe/plans — subscription tiers + credit packs (with per-item link availability)
router.get('/plans', (req, res) => {
  const { cfg } = paymentMode();
  const links = cfg.links || {};
  res.json({
    ok: true,
    tiers: TIERS.map(t => ({ ...t, checkout: !!links[t.id] })),
    credits: CREDIT_PACKS.map(c => ({ ...c, checkout: !!links[c.id] })),
  });
});

// POST /api/stripe/create-checkout — body { item, userId?, successUrl?, cancelUrl? }
//   item = a tier id ('builder'|'pro'|'alpha') or credit pack id ('credits_25'...).
//   Returns { url } to redirect the buyer to (hosted link or Stripe session), or { enabled:false }.
router.post('/create-checkout', express.json(), async (req, res) => {
  try {
    const item = String((req.body && (req.body.item || req.body.tier || req.body.product)) || '').trim();
    if (!item) return res.status(400).json({ ok: false, error: 'item required (tier or credit pack id)' });
    const { mode, cfg } = paymentMode();
    const links = cfg.links || {};

    // 1) Hosted link wins if present for this item — append client_reference_id so we can match the buyer
    if (links[item]) {
      const userId = (req.body && req.body.userId) || 'guest';
      const sep = links[item].indexOf('?') >= 0 ? '&' : '?';
      const url = links[item] + sep + 'client_reference_id=' + encodeURIComponent(userId);
      return res.json({ ok: true, url, mode: 'links' });
    }

    // 2) Full Stripe session (subscription tiers only) if secret key is configured
    if (mode === 'stripe' && billingService) {
      const stripe = billingService.getStripe();
      const priceId = (billingService.STRIPE_PRICES || {})[item];
      if (stripe && priceId) {
        const isCredit = item.startsWith('credits_');
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{ price: priceId, quantity: 1 }],
          mode: isCredit ? 'payment' : 'subscription',
          success_url: (req.body.successUrl) || `${req.protocol}://${req.get('host')}/?billing=success`,
          cancel_url:  (req.body.cancelUrl)  || `${req.protocol}://${req.get('host')}/?billing=cancel`,
          client_reference_id: (req.body && req.body.userId) || 'guest',
          metadata: { item, userId: (req.body && req.body.userId) || 'guest' },
        });
        return res.json({ ok: true, url: session.url, mode: 'stripe' });
      }
    }

    // 3) Not configured — tidy response so the UI shows a clean "coming soon" state
    return res.json({
      ok: true, enabled: false, url: null,
      message: 'Checkout for "' + item + '" not configured. Paste a hosted checkout link for it in backend/data/payment-config.json.',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/stripe/verify?session_id=... — best-effort confirmation after returning from checkout.
router.get('/verify', async (req, res) => {
  try {
    const sid = req.query.session_id;
    if (sid && billingService && billingService.getStripe && billingService.getStripe()) {
      const s = await billingService.getStripe().checkout.sessions.retrieve(sid);
      return res.json({ ok: true, paid: s.payment_status === 'paid', status: s.status, item: s.metadata && s.metadata.item });
    }
    // hosted-link mode can't verify server-side without a webhook — report optimistic pending
    res.json({ ok: true, paid: null, status: 'unknown', message: 'Verification needs a Stripe webhook or session_id.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
