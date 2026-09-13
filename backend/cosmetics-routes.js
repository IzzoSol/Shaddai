// backend/cosmetics-routes.js — Forge cosmetics store: catalog + Sparks-priced purchase.
// GET  /api/cosmetics/catalog             -> { accessories: [...] }
// POST /api/cosmetics/purchase {operativeId, accessoryId} -> { success, operative } | { success:false, error }
'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const operatives = require('./lib/operatives');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'assets', 'accessories', 'catalog.json');
function loadCatalog() {
  try { return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')); }
  catch { return []; }
}

router.get('/catalog', (req, res) => {
  res.json({ accessories: loadCatalog() });
});

router.post('/purchase', async (req, res) => {
  const { operativeId, accessoryId } = req.body || {};
  if (!operativeId || !accessoryId) {
    return res.status(400).json({ success: false, error: 'operativeId and accessoryId required' });
  }
  const item = loadCatalog().find(a => a.id === accessoryId);
  if (!item) return res.status(404).json({ success: false, error: 'unknown accessory' });

  const op = operatives.get(operativeId);
  if (!op) return res.status(404).json({ success: false, error: 'unknown operative' });

  // update() shallow-merges at the top level (Object.assign), so `inventory` must be
  // read+cloned+extended whole here, never patched with just {cosmetics:[...]} — that
  // would silently wipe files/collectables on this same record.
  const inv = Object.assign({ files: [], collectables: [], cosmetics: [] }, op.inventory);
  inv.cosmetics = inv.cosmetics || [];
  if (inv.cosmetics.includes(accessoryId)) {
    return res.json({ success: true, operative: op, note: 'already owned' }); // idempotent
  }

  // Dynamic per-item price -> billing-service's primitives directly, not enforceCredits/
  // credit-meter (those charge a fixed cost for a small set of named actionIds from
  // credit-costs.json; a catalog with a different price per item needs the lower-level
  // debit(userId, amount, reason) instead).
  const billing = require('./billing-service');
  const userId = op.owner || 'anon';
  const cust = billing.getCustomer(userId) || await billing.getOrCreateCustomer(userId);
  const balance = (cust && cust.creditsRemaining) || 0;
  const price = Number(item.sparksPrice) || 0;
  if (balance < price) {
    return res.status(402).json({ success: false, error: 'insufficient Sparks', needed: price, remaining: balance });
  }
  billing.debit(userId, price, `cosmetics:${accessoryId}`);

  inv.cosmetics.push(accessoryId);
  const updated = operatives.update(operativeId, { inventory: inv });
  res.json({ success: true, operative: updated });
});

module.exports = router;
