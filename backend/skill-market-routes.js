/**
 * SHADDAI Skill + Agent Marketplace Routes
 *
 * A backend for a marketplace where users publish skill or agent listings and
 * others browse and buy/install them. Payment is credits today; x402 later.
 *
 * Mount under any prefix (recommended /api/market). Endpoints (relative):
 *   POST   /list               — create a skill/agent listing
 *   GET    /listings           — all listings (?type=skill|agent, ?owner=userId)
 *   GET    /listings/:id       — one listing or 404
 *   POST   /listings/:id/buy   — record a purchase, bump sales, return install payload
 *   GET    /mine?user=         — { listed:[...], purchased:[...] } for a user
 *   DELETE /listings/:id       — delete (requires body.owner === listing.owner)
 *
 * Persistence: flat JSON files in backend/data/, matching the loadJSON/saveJSON
 * style used elsewhere in this backend (fs.readFileSync/writeFileSync + try/catch).
 */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const DATA_DIR = path.join(__dirname, 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'skill-market.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'skill-market-purchases.json');

// Ensure the data dir + backing files exist (lazy create with []).
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
function ensureFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', 'utf8');
  } catch (e) {
    console.error('[SKILL-MARKET] Failed to init file:', filePath, e.message);
  }
}
ensureFile(LISTINGS_FILE);
ensureFile(PURCHASES_FILE);

// --- JSON-file persistence helpers (inline, same shape as api-proxy-routes.js) ---
function loadJSON(filePath, fallback = []) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return fallback; }
}

function saveJSON(filePath, data) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {
    console.error('[SKILL-MARKET] Failed to save:', filePath, e.message);
  }
}

function genId() {
  // lst_<ts>_<rand>; prefer crypto.randomUUID when available.
  const rand = (crypto.randomUUID ? crypto.randomUUID().split('-')[0]
                                  : crypto.randomBytes(4).toString('hex'));
  return `lst_${Date.now()}_${rand}`;
}

function genPurchaseId() {
  const rand = (crypto.randomUUID ? crypto.randomUUID().split('-')[0]
                                  : crypto.randomBytes(4).toString('hex'));
  return `pur_${Date.now()}_${rand}`;
}

// ---------------------------------------------------------------------------
// POST /list — create a listing
// ---------------------------------------------------------------------------
router.post('/list', (req, res) => {
  const { type, name, description, price, owner, payload } = req.body || {};

  if (type !== 'skill' && type !== 'agent') {
    return res.status(400).json({ error: "type must be 'skill' or 'agent'" });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!owner) {
    return res.status(400).json({ error: 'owner (userId) is required' });
  }

  // Normalize payload per type. These are public catalog entries — no secrets.
  let safePayload;
  if (type === 'agent') {
    const p = payload || {};
    safePayload = {
      persona: p.persona,
      brainId: p.brainId,
      tools: Array.isArray(p.tools) ? p.tools : [],
      avatar: p.avatar,
    };
  } else {
    const p = payload || {};
    safePayload = {
      tools: Array.isArray(p.tools) ? p.tools : [],
      systemPrompt: p.systemPrompt,
      instructions: p.instructions,
    };
  }

  const listing = {
    id: genId(),
    type,
    name: String(name),
    description: description ? String(description) : '',
    price: Number(price) || 0,
    owner: String(owner),
    payload: safePayload,
    createdAt: new Date().toISOString(),
    sales: 0,
  };

  const listings = loadJSON(LISTINGS_FILE, []);
  listings.push(listing);
  saveJSON(LISTINGS_FILE, listings);

  return res.status(201).json(listing);
});

// ---------------------------------------------------------------------------
// GET /listings — public catalog (optional ?type= and ?owner= filters)
// ---------------------------------------------------------------------------
router.get('/listings', (req, res) => {
  let listings = loadJSON(LISTINGS_FILE, []);
  const { type, owner } = req.query;
  if (type) listings = listings.filter(l => l.type === type);
  if (owner) listings = listings.filter(l => l.owner === owner);
  return res.json(listings);
});

// ---------------------------------------------------------------------------
// GET /listings/:id — one listing or 404
// ---------------------------------------------------------------------------
router.get('/listings/:id', (req, res) => {
  const listings = loadJSON(LISTINGS_FILE, []);
  const listing = listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'listing not found' });
  return res.json(listing);
});

// ---------------------------------------------------------------------------
// POST /listings/:id/buy — purchase + install
//
// TODO (x402): when process.env.X402_ENABLED === 'true' and listing.price > 0,
// gate this route with require('./lib/x402').requirePayment(<key>) so paid
// listings settle on-chain before the install payload is returned. Left as a
// soft TODO — do NOT hard-require x402 here so credit-based buys keep working.
// ---------------------------------------------------------------------------
router.post('/listings/:id/buy', (req, res) => {
  const { buyer } = req.body || {};
  if (!buyer) return res.status(400).json({ error: 'buyer is required' });

  const listings = loadJSON(LISTINGS_FILE, []);
  const idx = listings.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'listing not found' });

  const listing = listings[idx];

  // Record the purchase.
  const purchases = loadJSON(PURCHASES_FILE, []);
  const purchase = {
    id: genPurchaseId(),
    listingId: listing.id,
    buyer: String(buyer),
    price: listing.price,
    at: new Date().toISOString(),
  };
  purchases.push(purchase);
  saveJSON(PURCHASES_FILE, purchases);

  // Increment sales counter on the listing.
  listing.sales = (listing.sales || 0) + 1;
  listings[idx] = listing;
  saveJSON(LISTINGS_FILE, listings);

  return res.json({ ok: true, purchase, install: listing.payload });
});

// ---------------------------------------------------------------------------
// GET /mine?user= — what a user has listed + purchased
// ---------------------------------------------------------------------------
router.get('/mine', (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'user query param is required' });

  const listings = loadJSON(LISTINGS_FILE, []);
  const purchases = loadJSON(PURCHASES_FILE, []);

  const listed = listings.filter(l => l.owner === user);
  const purchased = purchases.filter(p => p.buyer === user);

  return res.json({ listed, purchased });
});

// ---------------------------------------------------------------------------
// DELETE /listings/:id — only the owner may delete (basic guard)
// ---------------------------------------------------------------------------
router.delete('/listings/:id', (req, res) => {
  const { owner } = req.body || {};
  const listings = loadJSON(LISTINGS_FILE, []);
  const listing = listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'listing not found' });

  if (!owner || owner !== listing.owner) {
    return res.status(403).json({ error: 'forbidden: owner mismatch' });
  }

  const remaining = listings.filter(l => l.id !== req.params.id);
  saveJSON(LISTINGS_FILE, remaining);
  return res.json({ ok: true, deleted: listing.id });
});

module.exports = router;
