// wallet-routes.js — x402 V2 wallet sessions + multi-chain debit endpoints.
//   Pairs with lib/x402-v2.js. BACKWARD-COMPATIBLE: off-chain debits still hit the
//   real x402 ledger; base/solana return simulated receipts.
//   GET  /api/wallet/nonce                         — issue a one-time nonce (5 min TTL)
//   POST /api/wallet/session {wallet_address,signature,message}
//                                                  — verify SIWS Ed25519 signature → JWT
//   GET  /api/wallet/me        (Bearer token)      — current wallet from the session
//   POST /api/wallet/debit {chain,user,amount,reason,payee} — multi-chain settlement
//
//   SECURITY: Sign-In With Solana (SIWS). The client requests a nonce, signs a
//   human-readable message CONTAINING that nonce with its Phantom/Solana wallet,
//   and POSTs { wallet_address, message, signature }. The server:
//     1. verifies the Ed25519 signature of `message` against the base58 pubkey,
//     2. requires the message to embed a nonce that WE issued (unexpired, unused),
//     3. burns the nonce (one-time use) to block replay.
//   Hard rejection is gated behind WALLET_SIG_REQUIRED (default 'true'). When set
//   to 'false', signature failures are logged as "[wallet-sig] would-reject ..."
//   but the session is still granted — a controlled rollout valve. Set it to
//   'false' only if a client is discovered that cannot yet sign.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const json = express.json();
const { createSession, verifySession, debit } = require('./lib/x402-v2');

// --- crypto libs: Ed25519 verify + base58 decode (both present in node_modules) ---
const { ed25519 } = require('@noble/curves/ed25519');
const bs58lib = require('bs58');
const bs58decode = bs58lib.decode || (bs58lib.default && bs58lib.default.decode);

// Whether an invalid/missing signature is a hard 401 (default) or a logged soft-pass.
const SIG_REQUIRED = String(process.env.WALLET_SIG_REQUIRED ?? 'true').toLowerCase() !== 'false';

// In-memory nonce store: nonce → expiry (ms). Pruned lazily on issue. 5-minute TTL.
// One-time use: consumed on successful (or attempted) session exchange.
const NONCE_TTL = 5 * 60 * 1000;
const nonces = new Map();
const pruneNonces = () => { const now = Date.now(); for (const [n, exp] of nonces) if (exp < now) nonces.delete(n); };

// buildSiwsMessage — canonical challenge text the client is expected to sign.
// Kept here so tests and (future) frontend can produce an identical string.
function buildSiwsMessage(nonce) {
  return `SHADDAI wants you to sign in with your Solana account.\n\nNonce: ${nonce}`;
}

// GET /api/wallet/nonce — random hex challenge, stashed for 5 minutes. Also returns
// the exact message the wallet should sign, so clients don't have to hard-code format.
router.get('/api/wallet/nonce', (req, res) => {
  pruneNonces();
  const nonce = crypto.randomBytes(16).toString('hex');
  nonces.set(nonce, Date.now() + NONCE_TTL);
  res.json({ nonce, message: buildSiwsMessage(nonce) });
});

// verifyWalletSignature — the real SIWS check. Returns { ok, reason }.
//   - message must be a string containing exactly one server-issued, unexpired nonce
//   - signature (base58 or base64) must be a valid Ed25519 sig of that message by pubkey
//   - on success (or on any attempt), the nonce is BURNED (one-time use, anti-replay)
function verifyWalletSignature({ wallet_address, message, signature }) {
  if (!message || typeof message !== 'string') return { ok: false, reason: 'message required' };
  if (!signature || typeof signature !== 'string') return { ok: false, reason: 'signature required' };

  // 1) Find a nonce we issued that appears in the signed message.
  pruneNonces();
  let matchedNonce = null;
  for (const [n, exp] of nonces) {
    if (message.includes(n)) { matchedNonce = n; if (exp < Date.now()) matchedNonce = null; break; }
  }
  if (!matchedNonce) return { ok: false, reason: 'no valid/issued nonce in message (expired, unknown, or already used)' };

  // Burn it now — one attempt per nonce, so a captured signature can't be replayed.
  nonces.delete(matchedNonce);

  // 2) Decode the pubkey and signature.
  let pubkey, sigBytes;
  try {
    pubkey = bs58decode(String(wallet_address));
    if (pubkey.length !== 32) return { ok: false, reason: 'wallet_address is not a 32-byte Solana pubkey' };
  } catch (e) { return { ok: false, reason: 'wallet_address is not valid base58' }; }
  try {
    // Accept base58 (Phantom signMessage default) or base64.
    try { sigBytes = bs58decode(signature); }
    catch (_) { sigBytes = Buffer.from(signature, 'base64'); }
    if (sigBytes.length !== 64) return { ok: false, reason: 'signature is not 64 bytes' };
  } catch (e) { return { ok: false, reason: 'signature not decodable (base58/base64)' }; }

  // 3) Verify Ed25519.
  const msgBytes = new TextEncoder().encode(message);
  let valid = false;
  try { valid = ed25519.verify(Uint8Array.from(sigBytes), msgBytes, Uint8Array.from(pubkey)); }
  catch (e) { return { ok: false, reason: 'verify threw: ' + e.message }; }
  return valid ? { ok: true } : { ok: false, reason: 'signature does not match wallet_address' };
}

// POST /api/wallet/session — exchange a SIGNED nonce message for a JWT session.
//   Body: { wallet_address, message, signature }.
//   Legacy field `signed_nonce` is still accepted as `signature` for back-compat.
router.post('/api/wallet/session', json, (req, res) => {
  const body = req.body || {};
  const wallet_address = body.wallet_address;
  const message = body.message;
  const signature = body.signature || body.signed_nonce; // back-compat alias
  if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

  const result = verifyWalletSignature({ wallet_address, message, signature });
  if (!result.ok) {
    if (SIG_REQUIRED) {
      return res.status(401).json({ error: 'signature verification failed', reason: result.reason });
    }
    // Soft-rollout valve: log loudly but do not lock the caller out.
    console.warn('[wallet-sig] would-reject (WALLET_SIG_REQUIRED=false):', wallet_address, '-', result.reason);
  }

  const session = createSession(wallet_address);
  res.json({ ok: true, verified: result.ok, ...session });
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
module.exports.verifyWalletSignature = verifyWalletSignature;
module.exports.buildSiwsMessage = buildSiwsMessage;
module.exports._nonces = nonces; // exported for tests
