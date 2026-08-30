/* ══════════════════════════════════════════════════════════════════════════
   AGENT SERVICES API — mounted at /api/services.

     GET  /            the storefront, grouped by agent
     GET  /all         flat catalogue, including anything unavailable and why
     GET  /:id         one service
     POST /:id/order   buy it — charges Sparks, runs the work, refunds on failure

   Paybox is deliberately NOT wired here yet. It is unmounted and its REST
   contract is unverified, so accepting it would mean advertising a payment
   method that cannot settle. When Terminal B lands it, the only change needed
   is another branch in the payment step below — the catalogue, the executor
   and the refund path are payment-agnostic on purpose.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const express = require('express');
const services = require('./agent-services');

const router = express.Router();

let softAuth = (req, _res, next) => { req.userId = req.userId || 'local'; next(); };
try { softAuth = require('../auth-guard').softAuth || softAuth; } catch (_) {}

router.use(express.json({ limit: '64kb' }));
router.use(softAuth);

let economy = null;
try { economy = require('../economy-service').getDefault(); } catch (_) {}
let paybox = null;
try { paybox = require('../paybox-guard'); } catch (_) {}

/* The executor. Routes the order to the named council agent and runs the
   service's own skill against the buyer's input.

   Kept behind one function so agent-services.js stays testable with a fake,
   and so the day this becomes a queue instead of an inline call, only this
   changes. */
async function execute({ service, agent, input, userId }) {
  const skillRouter = require('../skill-router');

  /* The buyer's own words are the prompt — nothing else.

     Skills echo the prompt back into their output and parse it for entities
     (a coin symbol, a URL, a colour). Prefixing it with service scaffolding
     put "Coin check / Deliver exactly this: A verdict with the evidence
     behind it" inside the deliverable someone paid for, and gave the entity
     extractors extra words to trip over. The service name belongs in the
     receipt, not in the prompt. */
  const prompt = String(input || '').trim() || service.name;

  // routeAndExecute(message, requestedAgent) — the second argument is the
  // agent NAME, matched case-insensitively against the catalogue. Passing an
  // options object here silently falls through to auto-routing, which would
  // send a PIKADON audit to whichever agent the keywords happened to match.
  const out = await skillRouter.routeAndExecute(prompt, agent);

  if (!out || out.error) return { ok: false, error: (out && out.error) || 'the agent returned nothing' };

  const text = out.response || '';
  if (!text) return { ok: false, error: 'the agent returned nothing' };

  return {
    ok: true,
    agent: out.agent || agent,
    role: out.role,
    skill: out.skill,
    skillDesc: out.skillDesc,
    text,
  };
}

router.get('/', (_req, res) => {
  res.json({ ok: true, storefront: services.storefront(), currency: 'sparks', rate: '1 Spark = $1' });
});

router.get('/all', (_req, res) => {
  res.json({ ok: true, services: services.catalogue() });
});

router.get('/:id', (req, res) => {
  const s = services.byId(String(req.params.id || ''));
  if (!s) return res.status(404).json({ ok: false, error: 'no such service' });
  res.json({ ok: true, service: s });
});

router.post('/:id/order', async (req, res) => {
  const body = req.body || {};
  const method = String(body.method || 'sparks').toLowerCase();

  // Paybox branch (2026-08-30): Paybox's REST contract is now verified (see
  // paybox-guard.js), but its real tool surface cannot do what Sparks does —
  // every Paybox money-moving tool requires the PAYER to already be a
  // connected, granted credential; there is no "charge this arbitrary
  // stranger" primitive. So this is NOT the same synchronous charge-then-run-
  // then-refund flow as Sparks. It generates a real checkout link (the same
  // get_buy_link tool the tip button uses — no approval, touches no key,
  // moves no money to generate) priced at this service's Sparks value ($1 =
  // 1 Spark), and returns pending — the buyer pays, then must be topped up in
  // Sparks (see /api/economy webhook path) or the order re-submitted with
  // method:"sparks" once funded. It does NOT run the work synchronously,
  // because SHADDAI cannot verify a MoonPay checkout completed within this
  // request/response cycle. Faking synchronicity here would repeat the exact
  // mistake the original paybox-guard.js made — guessing a shape Paybox
  // doesn't actually have.
  if (method === 'paybox') {
    const svc = services.byId(String(req.params.id || ''));
    if (!svc) return res.status(404).json({ ok: false, error: 'no such service' });
    if (!paybox) return res.status(501).json({ ok: false, error: 'Paybox guard unavailable' });
    const cfg = paybox.getConfig();
    const credentialId = cfg.tip_credentials && cfg.tip_credentials.ZEROX;
    if (!credentialId) return res.status(501).json({ ok: false, error: 'No Paybox receiving wallet configured' });
    const r = await paybox.payboxRead('get_buy_link', { credential_id: credentialId, amount_usd: svc.sparks }, 'ZEROX');
    if (!r.ok) return res.status(502).json({ ok: false, error: r.output });
    return res.json({
      ok: true, pending: true,
      service: svc.id, amount_usd: svc.sparks,
      checkout_url: r.output && r.output.url,
      note: 'Complete this checkout, then your Sparks balance updates and you can order with method:"sparks". This does not run the work yet — Paybox has no way for SHADDAI to confirm your payment within this request.',
    });
  }

  if (method !== 'sparks') {
    return res.status(400).json({
      ok: false,
      error: `"${method}" is not accepted yet`,
      accepted: ['sparks', 'paybox'],
    });
  }

  const result = await services.order({ economy, execute }, {
    userId: req.userId,
    serviceId: String(req.params.id || ''),
    input: body.input,
    idempotencyKey: body.idempotencyKey,
  });

  // 402 is the honest status for "you simply do not have enough".
  if (!result.ok && result.error === 'not enough Sparks') return res.status(402).json(result);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

module.exports = router;
