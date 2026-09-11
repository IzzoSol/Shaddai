// x402-ledger-routes.js — Express routes for the prepaid x402 balance ledger.
// Mount example (in server-production.js):
//   app.use('/api/x402/ledger', require('./x402-ledger-routes'));

const router = require('express').Router();
const ledger = require('./lib/x402-ledger');
const { requireAdmin } = require('./auth-guard');

// GET /balance/:account → { account, balance }
router.get('/balance/:account', (req, res) => {
  const account = req.params.account;
  res.json({ account, balance: ledger.getBalance(account) });
});

// POST /credit → body { account, amount, ref }
// Simulates a top-up. Real on-chain settlement is out of scope here.
router.post('/credit', requireAdmin, (req, res) => {
  const body = req.body || {};
  const account = body.account;
  const amount = Number(body.amount);
  const ref = body.ref;

  if (!account || String(account).trim() === '') {
    return res.status(400).json({ error: 'account is required' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const balance = ledger.credit(account, amount, ref);
  res.json({ account: String(account).trim(), balance });
});

// POST /debit → body { account, amount, ref }
// 402 { error, needed, balance } if insufficient, else { ok, balance }
// Gated the same as its sibling /credit — otherwise anyone could spend down
// (or drive negative-balance error paths against) any account by name.
router.post('/debit', requireAdmin, (req, res) => {
  const body = req.body || {};
  const account = body.account;
  const amount = Number(body.amount);
  const ref = body.ref;

  if (!account || String(account).trim() === '') {
    return res.status(400).json({ error: 'account is required' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const result = ledger.debit(account, amount, ref);
  if (!result.ok) {
    return res.status(402).json({
      error: result.error || 'insufficient balance',
      needed: result.needed,
      balance: result.balance
    });
  }
  res.json({ ok: true, balance: result.balance });
});

// GET /history/:account → recent entries
router.get('/history/:account', (req, res) => {
  const account = req.params.account;
  const limit = req.query.limit;
  res.json({ account, history: ledger.history(account, limit) });
});

// GET /stats → ledger stats
router.get('/stats', (req, res) => {
  res.json(ledger.stats());
});

module.exports = router;
