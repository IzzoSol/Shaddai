// backend/stripe-routes.js
// SHADDAI — Stripe Checkout -> x402 prepaid credit ledger.
// Lets users buy CREDITS with a card. On successful payment we credit the
// existing x402 prepaid ledger (backend/lib/x402-ledger.js).
//
// Mount with:  app.use('/api/stripe', require('./stripe-routes'))
// NOTE: `npm i stripe` is only required when STRIPE_SECRET_KEY is actually set;
// this module loads fine (and the server boots) without the package or a key.

const express = require('express');
const router = express.Router();

// ---- Lazy-loaded Stripe client -------------------------------------------
// Never throws on require: if the key is missing or the `stripe` package isn't
// installed, getStripe() simply returns null and handlers degrade gracefully.
let stripe;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    try {
      stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (e) {
      return null;
    }
  }
  return stripe;
}

// ---- Helpers ---------------------------------------------------------------
function baseUrlFrom(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  try {
    const origin = req.headers && (req.headers.origin || req.headers.referer);
    if (origin) return String(origin).replace(/\/+$/, '');
    const proto = (req.headers && req.headers['x-forwarded-proto']) || req.protocol || 'http';
    const host = (req.headers && req.headers.host) || 'localhost';
    return `${proto}://${host}`;
  } catch (e) {
    return 'http://localhost:3000';
  }
}

// ---------------------------------------------------------------------------
// GET /config — expose whether Stripe is enabled + publishable key for client.
// ---------------------------------------------------------------------------
router.get('/config', (req, res) => {
  try {
    res.json({
      enabled: !!process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'config_failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /create-checkout — body {account, amountUsd}. Creates a one-time
// Checkout Session priced at amountUsd. Returns {url}.
// ---------------------------------------------------------------------------
router.post('/create-checkout', async (req, res) => {
  try {
    const s = getStripe();
    if (!s) {
      return res.status(503).json({
        error: 'Stripe not configured. Set STRIPE_SECRET_KEY.',
        needsKey: true,
      });
    }

    const body = req.body || {};
    const account = body.account;
    const amountUsd = Number(body.amountUsd);

    if (!account || !isFinite(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ error: 'account and positive amountUsd are required' });
    }

    const base = baseUrlFrom(req);
    const cents = Math.round(amountUsd * 100);

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: cents,
            product_data: {
              name: `SHADDAI credits ($${amountUsd.toFixed(2)})`,
            },
          },
        },
      ],
      success_url: `${base}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?stripe=cancel`,
      metadata: {
        account: String(account),
        amountUsd: String(amountUsd),
      },
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: 'create_checkout_failed', detail: (e && e.message) || String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /verify?session_id=… — called on return from Checkout. Stripe confirms
// the payment was actually 'paid', then we credit the ledger (idempotent —
// safe even if the webhook also fires). Makes top-ups work WITHOUT a webhook.
// ---------------------------------------------------------------------------
router.get('/verify', async (req, res) => {
  try {
    const s = getStripe();
    if (!s) return res.status(503).json({ ok: false, error: 'Stripe not configured', needsKey: true });
    const sid = req.query.session_id;
    if (!sid) return res.status(400).json({ ok: false, error: 'session_id required' });
    const sess = await s.checkout.sessions.retrieve(String(sid));
    if (!sess || sess.payment_status !== 'paid') {
      return res.json({ ok: false, status: (sess && sess.payment_status) || 'unknown' });
    }
    const account = (sess.metadata && sess.metadata.account) || 'commerce-ui';
    const isSub = (sess.metadata && sess.metadata.kind) === 'subscription';
    // subscription → grant the plan's value as credits; one-off → grant amountUsd
    const amount = isSub
      ? (Number(sess.metadata && sess.metadata.monthlyCredits) || (sess.amount_total ? sess.amount_total / 100 : 0))
      : (Number(sess.metadata && sess.metadata.amountUsd) || (sess.amount_total ? sess.amount_total / 100 : 0));
    const ledger = require('./lib/x402-ledger');
    const ref = (isSub ? 'sub ' + (sess.metadata.tier || 'plan') + ' ' : 'stripe ') + sess.id;
    const hist = (ledger.history && ledger.history(account, 300)) || [];
    if (hist.some(e => e.ref === ref)) {
      return res.json({ ok: true, already: true, balance: ledger.getBalance(account) });
    }
    ledger.credit(account, amount, ref);
    return res.json({ ok: true, credited: amount, balance: ledger.getBalance(account) });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) || String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /plans — list your active recurring prices (the Builder/Pro/Max products).
// ---------------------------------------------------------------------------
router.get('/plans', async (req, res) => {
  try {
    const s = getStripe();
    if (!s) return res.json({ ok: false, enabled: false, plans: [] });
    const prices = await s.prices.list({ active: true, type: 'recurring', expand: ['data.product'], limit: 50 });
    const plans = (prices.data || [])
      .filter(p => p.product && p.product.active !== false)
      .map(p => ({
        priceId: p.id,
        name: (p.product && p.product.name) || 'Plan',
        amount: (p.unit_amount || 0) / 100,
        interval: (p.recurring && p.recurring.interval) || 'month'
      }))
      .sort((a, b) => a.amount - b.amount);
    res.json({ ok: true, enabled: true, plans });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) || String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /subscribe — start a recurring subscription Checkout for a priceId.
// On return, /verify grants that plan's value as ledger credits (pay $19 → $19 usage).
// ---------------------------------------------------------------------------
router.post('/subscribe', async (req, res) => {
  try {
    const s = getStripe();
    if (!s) return res.status(503).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY.', needsKey: true });
    const body = req.body || {};
    const account = body.account || 'commerce-ui';
    const priceId = body.priceId;
    if (!priceId) return res.status(400).json({ error: 'priceId required' });
    const base = baseUrlFrom(req);
    // fetch the price so we know the $ value to grant as credits
    let amount = 0, planName = 'Subscription';
    try { const pr = await s.prices.retrieve(priceId, { expand: ['product'] }); amount = (pr.unit_amount || 0) / 100; planName = (pr.product && pr.product.name) || planName; } catch (_) {}
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?stripe=cancel`,
      metadata: { account: String(account), tier: planName, monthlyCredits: String(amount), kind: 'subscription' }
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: 'subscribe_failed', detail: (e && e.message) || String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /webhook — Stripe sends raw body; verify signature when a webhook
// secret is set. On checkout.session.completed, credit the x402 ledger.
// express.raw is applied to THIS route only so signature verification works.
// ---------------------------------------------------------------------------
router.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const s = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    if (s && webhookSecret) {
      const sig = req.headers['stripe-signature'];
      try {
        event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        return res.status(400).json({ error: 'invalid_signature', detail: (err && err.message) || String(err) });
      }
    } else {
      // Dev mode: no webhook secret -> accept but skip verification.
      console.warn('[stripe-routes] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev only).');
      try {
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
        event = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
    }

    if (event && event.type === 'checkout.session.completed') {
      const session = (event.data && event.data.object) || {};
      const meta = session.metadata || {};
      try {
        const ledger = require('./lib/x402-ledger');
        ledger.credit(meta.account, Number(meta.amountUsd), 'stripe ' + session.id);
      } catch (e) {
        console.error('[stripe-routes] failed to credit ledger:', (e && e.message) || e);
      }
    }

    res.json({ received: true });
  } catch (e) {
    res.status(500).json({ error: 'webhook_failed', detail: (e && e.message) || String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /health — quick status probe.
// ---------------------------------------------------------------------------
router.get('/health', (req, res) => {
  try {
    res.json({ enabled: !!process.env.STRIPE_SECRET_KEY, ledger: true });
  } catch (e) {
    res.status(500).json({ error: 'health_failed' });
  }
});

module.exports = router;
