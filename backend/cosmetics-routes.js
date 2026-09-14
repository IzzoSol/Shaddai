/*
 * cosmetics-routes.js — Forge Character-Kit Cosmetics store.
 *
 * Serves the accessory catalog (public/assets/accessories/catalog.json) and
 * handles "buy with Sparks + equip on an operative" purchases.
 *
 * Identity comes from softAuth at the mount (req.userId). Ownership of an
 * operative is only enforced when the caller is actually identified; an
 * unauthenticated caller may still complete a purchase on a guest operative
 * (owner 'anon'/'me'/'local') so the no-login funnel keeps working — but they
 * can never touch a named player's wardrobe (no cross-user theft).
 *
 * Pricing wallet = billing-service, keyed to the OPERATIVE's owner id
 * (op.owner) — the same Sparks wallet that operative DB row already spends
 * from, which is exactly where the Forge's kit/accessory credits live today.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'assets', 'accessories', 'catalog.json');

function loadCatalog() {
  try {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.accessories || []);
    const byId = {};
    for (const item of arr) byId[item.id] = item;
    return { list: arr, byId };
  } catch (e) {
    return { error: e.message, list: [], byId: {} };
  }
}

// Guard rails shared by every slot-mutable endpoint.
function slotBase() {
  return {
    hats: [], masks: [], pets: [], weapons: [], wings: [],
    cosmetics: [], ownedCosmetics: []
  };
}

// Debit the operative's Sparks (via billing-service, owner-scoped) and, on
// success, mark the cosmetic owned + equip it. Idempotent for already-owned.
function grantCosmetic(op, accessoryId, price) {
  const inv = Object.assign({}, slotBase(), op.inventory || {});
  inv.cosmetics = Array.isArray(inv.cosmetics) ? inv.cosmetics : [];
  inv.ownedCosmetics = Array.isArray(inv.ownedCosmetics) ? inv.ownedCosmetics : [];

  const alreadyOwned = inv.ownedCosmetics.indexOf(accessoryId) !== -1
    || inv.cosmetics.indexOf(accessoryId) !== -1;

  const billing = require('./billing-service');
  if (alreadyOwned) {
    const cust = billing.getCustomer(op.owner);
    return {
      inventory: inv, ok: true, alreadyOwned: true,
      balance: cust ? (cust.creditsRemaining || 0) : 0
    };
  }

  inv.ownedCosmetics.push(accessoryId);
  inv.cosmetics.push(accessoryId);
  const r = billing.debit(op.owner, price, 'cosmetic-accessory ' + accessoryId);

  return { inventory: inv, balance: r.balance, ok: r.ok, alreadyOwned };
}

// ── Catalog ─────────────────────────────────────────────────────────────────
router.get('/catalog', (req, res) => {
  const { error, list } = loadCatalog();
  if (error) return res.status(500).json({ ok: false, error: 'catalog unavailable' });
  res.json({ ok: true, accessories: list });
});

// ── Purchase + equip a cosmetic on an operative ─────────────────────────────
router.post('/purchase', express.json({ limit: '64kb' }), (req, res) => {
  const accessoryId = String((req.body && req.body.accessoryId) || '').trim();
  const operativeId = String((req.body && req.body.operativeId) || '').trim();
  if (!accessoryId || !operativeId) {
    return res.status(400).json({ ok: false, error: 'operativeId and accessoryId are required' });
  }

  const { error, byId } = loadCatalog();
  if (error) return res.status(500).json({ ok: false, error: 'catalog unavailable' });
  const item = byId[accessoryId];
  if (!item || !item.sparksPrice) {
    return res.status(400).json({ ok: false, error: 'unknown accessory: ' + accessoryId });
  }

  let operatives;
  try { operatives = require('./lib/operatives'); }
  catch (e) { return res.status(500).json({ ok: false, error: 'operatives unavailable' }); }
  const op = operatives.get(operativeId);
  if (!op) return res.status(404).json({ ok: false, error: 'operative not found' });

  // Ownership: verified caller must be the owner of a named operative.
  const caller = req.userId || 'local';
  const isGuestOperative = !op.owner || op.owner === 'anon' || op.owner === 'me' || op.owner === 'local';
  if (!isGuestOperative && caller === 'local') {
    return res.status(401).json({ ok: false, error: 'log in to equip a named operative' });
  }
  if (!isGuestOperative && caller !== op.owner) {
    return res.status(403).json({ ok: false, error: 'not your operative' });
  }

  // Sparks wallet check before we touch the ledger.
  const billing = require('./billing-service');
  let balance = 0;
  try {
    const cust = billing.getCustomer(op.owner);
    balance = cust ? (cust.creditsRemaining || 0) : 0;
  } catch (_) { balance = 0; }
  if (balance < item.sparksPrice) {
    return res.status(429).json({ ok: false, error: 'insufficient sparks', sparks: balance, price: item.sparksPrice });
  }

  const granted = grantCosmetic(op, accessoryId, item.sparksPrice);

  let saved;
  try { saved = operatives.update(operativeId, { inventory: granted.inventory }); }
  catch (e) { return res.status(500).json({ ok: false, error: 'failed to save operative' }); }

  res.json({
    ok: true,
    owned: granted.ok || granted.alreadyOwned,
    alreadyOwned: granted.alreadyOwned,
    sparks: granted.balance,
    accessoryId,
    operative: saved,
    equippedTo: item.slot || null
  });
});

module.exports = router;