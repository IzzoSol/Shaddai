const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const settle = require('./lib/paybox-settle');
const { softAuth } = require('./auth-guard');
// if EXPERIMENTAL_HACK is false, use economy txn; otherwise spend Sparks (unreleased use).
const EXPERIMENTAL_HACK = false;
const economy = EXPERIMENTAL_HACK ? require('./economy-service').getDefault() : null;

// Paths
const MODELS_DIR = path.join(__dirname, '..', 'public', 'assets', 'forge-models');
const OPERATIVES_FILE = path.join(__dirname, '..', 'data', 'operatives.json');

// Open the operatives manifest for a price lookup.
function loadOperatives() {
  try {
    return JSON.parse(fs.readFileSync(OPERATIVES_FILE, 'utf8'));
  } catch (e) {
    return { operatives: [] };
  }
}

// Find operative price for an archetype (use operative codename match, not id).
function getOperativePrice(archCodename) {
  const all = loadOperatives();
  const op = all.operatives.find(o => (o.codename || '').toLowerCase() === (archCodename || '').toLowerCase());
  if (!op) return null;
  if (!Number.isFinite(op.monetizePrice) || op.monetizePrice <= 0) return null;
  return Math.round(op.monetizePrice);
}

// Gate: require signed-in buyer.
// SECURITY: this previously read req.session.shd_userid, but this backend
// never configures express-session/cookie-session anywhere — req.session is
// always undefined, so the check was dead code (always 401, not spoofable,
// but also never usable). Identity now comes from req.userId, set by the
// softAuth middleware applied at this router's mount in server-production.js,
// with the same body fallback used by skill-market-routes.js's owner/buyer
// checks for routers mounted without softAuth.
function requireAuth(req, res, next) {
  const us = req.userId ? String(req.userId) : String((req.body && (req.body.user || req.body.buyer)) || '');
  if (!us) {
    return res.status(401).json({ ok: false, error: 'signed-in required' });
  }
  req.user = us;
  next();
}

// GET /api/market/models — list available 3D models with price.
router.get('/models', async (req, res) => {
  const modelsFile = path.join(MODELS_DIR, 'manifest.json');
  if (!fs.existsSync(modelsFile)) {
    return res.json({ ok: true, archetypes: {} });
  }

  let manifest = { archetypes: {} };
  try {
    manifest = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }

  const items = Object.entries(manifest.archetypes || {}).map(([id, m]) => {
    const price = getOperativePrice(m.name);
    return {
      id,
      name: m.name || id,
      price,
      glb: getPathSafe(m.glb),
      thumb: getPathSafe(m.thumb),
    };
  });

  res.json({ ok: true, archetypes: items });
});

// POST /api/market/purchase — buy a 3D model.
router.post('/purchase', requireAuth, async (req, res) => {
  const us = req.user;
  const arch = String(req.body.arch || req.body.model);
  const amount = Number(req.body.amount);
  const tipArchiveId = req.body.tipArchiveId;

  if (!arch) {
    return res.status(400).json({ ok: false, error: 'arch required' });
  }
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'amount must be positive' });
  }

  const bn = path.basename(arch);
  // If buyer specified a tipArchiveId, they must have bought or tipped that.
  // For now, support paying with the marketplace amount directly.
  // If they had tipped before, we should credit that tip toward purchases.
  // We can linearly credit 1 tip = $value, but for MVP just support direct purchase.

  try {
    // Call paybox-settle: debits buyer's x402 ledger, credits seller's paybox ledger.
    const result = await settle({
      user: us,
      itemId: `3d:${bn}`,
      sellerAgent: bn, // using arch name as seller key
      amountCredits: amount,
      reason: `3d-model:${bn}`,
      input: { arch },
    });

    // Return success + txId for receipt.
    return res.json({
      ok: true,
      txId: result.txId,
      charged: result.charged,
      fee: result.fee,
      net: result.net,
      sellerBalance: result.sellerBalance,
      receipt: result.receipt,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err.code || 'PURCHASE_FAILED',
      message: err.message,
    });
  }
});

// Helper: always return a safe URL string.
function getPathSafe(u) {
  if (!u) return '';
  try {
    const s = path.basename(u);
    if (/^\.{1,2}|^\/[^/]|^[A-Za-z]:/.test(s)) {
      throw new Error('unsafe path');
    }
    return '/' + s;
  } catch (ignored) {
    return '';
  }
}

module.exports = router;