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
/* Canonical plans + packs — see lib/tiers.js. Do not redeclare prices here. */
const _tiers = require('./lib/tiers');
const TIERS = _tiers.TIERS.filter((t) => t.price > 0).map((t) => ({
  id: t.id, name: t.name, price: t.price, interval: t.interval,
  blurb: t.blurb, highlight: !!t.highlight, features: t.unlocks,
}));
const CREDIT_PACKS = _tiers.CREDIT_PACKS.map((c) => ({ id: c.id, label: c.label, usd: c.usd }));


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
  if (mode === 'off') console.warn('[stripe] Payments not configured yet. Add hosted checkout links in backend/data/payment-config.json (or set STRIPE_SECRET_KEY).');
  res.json({
    ok: true,
    enabled: mode !== 'off',
    mode,                                   // 'links' | 'stripe' | 'off'
    publishableKey: cfg.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY || '',
    message: mode === 'off'
      ? "This option isn't available yet — please check back soon."
      : 'Payments live (' + mode + ').',
  });
});

// GET /api/stripe/tier-check — does the code agree with the Stripe links?
// Stripe is authoritative: if a Payment Link charges something other than the
// price declared in lib/tiers.js, this reports it rather than guessing. Run
// after any price change in the Stripe dashboard.
router.get('/tier-check', async (req, res) => {
  try {
    const t = require('./lib/tiers');
    const { cfg } = paymentMode();
    let fetchAmount = null;
    if (billingService && billingService.getStripe && billingService.getStripe()) {
      const stripe = billingService.getStripe();
      // Resolve a Payment Link's amount via its line items when a key exists.
      fetchAmount = async (url) => {
        const id = String(url).split('/').pop().split('?')[0];
        const links = await stripe.paymentLinks.list({ limit: 100 });
        const hit = links.data.find((l) => String(l.url || '').includes(id));
        if (!hit) return null;
        const items = await stripe.paymentLinks.listLineItems(hit.id, { limit: 1 });
        return items.data[0] && items.data[0].amount_total;
      };
    }
    const rows = await t.checkAgainst(cfg.links || {}, fetchAmount);
    const bad = rows.filter((r) => /MISMATCH/.test(r.status));
    res.json({ ok: bad.length === 0, verified: !!fetchAmount, rows, mismatches: bad.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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

// GET /api/stripe/founders — public scarcity counter for pricing.html.
// Carries no personal data: a count, not a list of who paid.
router.get('/founders', (req, res) => {
  try {
    const f = require('./lib/founders');
    res.json(Object.assign({ ok: true }, f.status()));
  } catch (e) {
    // Never let a missing register break the pricing page — it just won't
    // show a countdown.
    res.json({ ok: false, seats: 20, claimed: null, remaining: null, soldOut: false });
  }
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
      // Encode "uid-item" so the webhook knows WHO paid and WHAT to grant.
      const ref = encodeURIComponent(userId + '-' + item);
      const sep = links[item].indexOf('?') >= 0 ? '&' : '?';
      const url = links[item] + sep + 'client_reference_id=' + ref;
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
    console.warn('[stripe] Checkout for "' + item + '" not configured. Paste a hosted checkout link for it in backend/data/payment-config.json.');
    return res.json({
      ok: true, enabled: false, url: null,
      message: "This option isn't available yet — please check back soon.",
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
    console.warn('[stripe] verify: no session_id / webhook — cannot confirm payment server-side.');
    res.json({ ok: true, paid: null, status: 'unknown', message: "We're still confirming your payment — this may take a moment." });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/stripe/subscribe — body { account?, priceId } → subscription Checkout Session URL.
// Mirrors create-checkout but forces subscription mode for a tier priceId. Returns { url }.
router.post('/subscribe', express.json(), async (req, res) => {
  try {
    const priceId = String((req.body && (req.body.priceId || req.body.item || req.body.tier)) || '').trim();
    if (!priceId) return res.status(400).json({ ok: false, error: 'priceId required' });
    const userId = (req.body && req.body.userId) || 'guest';
    // Reuse the exact session-building logic from create-checkout (links OR stripe).
    const item = priceId;
    const { mode, cfg } = paymentMode();
    const links = cfg.links || {};
    if (links[item]) {
      const ref = encodeURIComponent(userId + '-' + item);
      const sep = links[item].indexOf('?') >= 0 ? '&' : '?';
      return res.json({ ok: true, url: links[item] + sep + 'client_reference_id=' + ref, mode: 'links' });
    }
    if (mode === 'stripe' && billingService && billingService.getStripe && billingService.getStripe()) {
      const stripe = billingService.getStripe();
      const price = (billingService.STRIPE_PRICES || {})[item];
      if (stripe && price) {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{ price, quantity: 1 }],
          mode: 'subscription',
          success_url: (req.body.successUrl) || `${req.protocol}://${req.get('host')}/?billing=success`,
          cancel_url:  (req.body.cancelUrl)  || `${req.protocol}://${req.get('host')}/?billing=cancel`,
          client_reference_id: userId,
          metadata: { item, userId },
        });
        return res.json({ ok: true, url: session.url, mode: 'stripe' });
      }
    }
    return res.json({ ok: true, enabled: false, url: null, message: "This plan isn't configured yet." });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
