'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI Agent Academy — HTTP routes (constitution §6).
//   GET  /api/academy/catalog            discovery ($0)
//   POST /api/academy/quote              dry-run ($0)
//   POST /api/academy/open_tab           payment channel (sandbox or real)
//   POST /api/academy/spend              metered call (AURA cache + PIKADON gate)
//   POST /api/academy/close_tab          settle + refund
//   POST /api/academy/lesson01           full Channel Opener lab + badge
//   POST /x402/academy/pay-lab           MERCHANT: sell lesson @ $0.10
//        unpaid -> 402 with requirements; paid/mock -> 200 + {sessionId, wsUrl}
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const engine = require('./lib/academy-engine');

// discovery — always $0, no payment required
router.get('/academy/catalog', (req, res) => {
  try { res.json(engine.academyCatalog({ query: req.query.q, provider: req.query.provider, sessionId: req.query.sessionId })); }
  catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

// quote — dry run, $0
router.post('/academy/quote', (req, res) => {
  try { res.json(engine.academyQuote(req.body || {})); }
  catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

// open a tab (payment channel)
router.post('/academy/open_tab', (req, res) => {
  try { res.json(engine.academyOpenTab(req.body || {})); }
  catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

// spend against a tab (AURA cache + PIKADON gate)
router.post('/academy/spend', (req, res) => {
  try {
    const r = engine.academySpend(req.body || {});
    if (!r.success && r.humanApprovalRequired) return res.status(402).json({ error: 'humanApprovalRequired', details: r });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json(r);
  } catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

// close tab + refund
router.post('/academy/close_tab', (req, res) => {
  try { res.json(engine.academyCloseTab(req.body || {})); }
  catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

// full lesson 01 run
router.post('/academy/lesson01', async (req, res) => {
  try {
    const sessionId = (req.body && req.body.sessionId) || 'lesson_' + Date.now();
    const result = await engine.runLesson01(sessionId);
    engine.logReceipt('[lesson01] session=' + sessionId + ' rail=' + (engine.PAY_SANDBOX ? 'sandbox' : 'x402') + ' badge=channel-opener sandbox=' + engine.PAY_SANDBOX);
    res.json({ ok: true, sessionId, ...result });
  } catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
});

// ── MERCHANT: sell the pay-lab lesson (constitution §6) ──────────────────────
// Mounted at /x402/academy/pay-lab separately (see exports + server-production).
// Unpaid -> 402 with x402 requirements. Paid/mock -> 200 + {sessionId, wsUrl, badge}
const LESSON_PRICE = engine.ACADEMY_LESSON_PRICE_USDC; // 0.10 USDC Solana
const paylabRouter = express.Router();
paylabRouter.post('/pay-lab', (req, res) => {
  const sessionId = (req.body && req.body.sessionId) || 'lesson_' + Date.now();
  const paid = !!(req.body && (req.body.mockPaid || req.body.paid === true)) ||
               !!(req.headers['x-payment']) ||          // real x402 payment header
               !!(req.headers['x-paybox']);              // PayBox structured intent proof
  const wsUrl = 'ws://' + (req.headers.host || 'localhost:3000') + '/ws/academy?sessionId=' + encodeURIComponent(sessionId);

  if (!paid) {
    // 402 + payment requirements (standard x402 shape)
    res.set('Accept-Payments', 'x402+json');
    return res.status(402).json({
      reason: 'paymentRequired',
      sessionId,
      price: { amount: String(Math.round(LESSON_PRICE * 1e6)), asset: 'USDC', network: 'solana:mainnet' },
      requirements: {
        'solana:mainnet': {
          scheme: 'exact',
          asset: 'USDC',
          price: String(LESSON_PRICE),
          address: 'SHADDAI_MERCHANT' // no key on the wire — PayBox/x402 facilitator resolves
        }
      },
      _instructions: 'POST { mockPaid:true } to test in sandbox, or settle via PayBox/x402 then replay.',
    });
  }

  // unlocked: run lesson + badge, return sessionId + wsUrl
  engine.academyCatalog({ query: 'solana rpc', sessionId });
  engine.academyQuote({ provider: 'helius', endpoint: 'https://api.helius-rpc.com/', method: 'POST', body: '{}', sessionId });
  const tab = engine.academyOpenTab({ provider: 'helius', max_usdc: 0.50, ttl_hours: 24, sessionId });
  engine.academySpend({ tabId: tab.tabId, endpoint: 'https://api.helius-rpc.com/', method: 'POST', body: { jsonrpc: '2.0', method: 'getBalance', params: ['YourWallet'] }, sessionId });
  const closed = engine.academyCloseTab({ tabId: tab.tabId, sessionId });
  const badge = engine.grantBadge(sessionId, 'channel-opener');
  engine.logReceipt('[pay-lab] session=' + sessionId + ' sold rail=paybox/mock price=' + LESSON_PRICE + ' badge=channel-opener');

  res.json({
    ok: true,
    sessionId,
    wsUrl,
    lesson: 'academy-pay-lab',
    pricePaid: LESSON_PRICE,
    badge,
    receipt: closed.receipt,
    memo: '402 is not a trade. Channels are loops. PayBox is the vault.',
  });
});

module.exports = router;
module.exports.paylabRouter = paylabRouter;
