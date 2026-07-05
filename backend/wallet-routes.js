// wallet-routes.js — x402 V2 wallet sessions + multi-chain debit endpoints.
//   Pairs with lib/x402-v2.js. BACKWARD-COMPATIBLE: off-chain debits still hit the
//   real x402 ledger; base/solana return simulated receipts.
//   GET  /api/wallet/nonce                         — issue a one-time nonce (5 min TTL)
//   POST /api/wallet/session {wallet_address,signed_nonce} — exchange for a JWT session
//   GET  /api/wallet/me        (Bearer token)      — current wallet from the session
//   POST /api/wallet/debit {chain,user,amount,reason,payee} — multi-chain settlement
//
//   NOTE: signature verification is STUBBED — any non-empty signed_nonce is accepted
//   for now. Real on-chain signature recovery (Base/Solana) is future work.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const json = express.json();
const { createSession, verifySession, debit } = require('./lib/x402-v2');

// In-memory nonce store: nonce → expiry (ms). Pruned lazily on issue. 5-minute TTL.
const NONCE_TTL = 5 * 60 * 1000;
const nonces = new Map();
const pruneNonces = () => { const now = Date.now(); for (const [n, exp] of nonces) if (exp < now) nonces.delete(n); };

// GET /api/wallet/nonce — random hex challenge, stashed for 5 minutes.
router.get('/api/wallet/nonce', (req, res) => {
  pruneNonces();
  const nonce = crypto.randomBytes(16).toString('hex');
  nonces.set(nonce, Date.now() + NONCE_TTL);
  res.json({ nonce });
});

// POST /api/wallet/session — exchange a signed nonce for a JWT session.
//   Signature verification is STUBBED: any non-empty signed_nonce is accepted.
router.post('/api/wallet/session', json, (req, res) => {
  const { wallet_address, signed_nonce } = req.body || {};
  if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });
  if (!signed_nonce) return res.status(400).json({ error: 'signed_nonce required' });
  // TODO: verify signed_nonce is a real signature of an issued nonce by wallet_address.
  const session = createSession(wallet_address);
  res.json({ ok: true, ...session });
});

// verifyWalletSession — middleware: read Bearer token, attach req.wallet, 401 if invalid.
function verifyWalletSession(req, res, next) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const payload = token ? verifySession(token) : null;
  if (!payload || !payload.wallet) return res.status(401).json({ error: 'invalid or missing wallet session' });
  req.wallet = payload.wallet;
  next();
}

// GET /api/wallet/me — echo the wallet bound to the current session.
router.get('/api/wallet/me', verifyWalletSession, (req, res) => {
  res.json({ ok: true, wallet: req.wallet });
});

// POST /api/wallet/debit — settle via the chosen chain (default off-chain).
router.post('/api/wallet/debit', json, async (req, res) => {
  const { chain = 'offchain', user, amount, reason, payee } = req.body || {};
  try {
    const receipt = await debit({ chain, user, amount, reason, payee });
    res.json({ ok: true, receipt });
  } catch (e) {
    res.status(e.status || 400).json({ ok: false, error: e.message, data: e.data });
  }
});

module.exports = router;
module.exports.verifyWalletSession = verifyWalletSession;
