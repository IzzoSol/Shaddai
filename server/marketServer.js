/* marketplace – listings, bids, and settlements
   – uses the same bridge signalling pattern as characterServer
   – all data persisted in data/listings.json
   – Sparks and items move for real (see /listing and /complete) — this
     used to be console.log-only ("simulate wallet"); fixed here.
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { readTotalLevel } = require('./skillsServer');
const sparksCore = require('./sparksCore');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data'); // env override = test isolation
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LISTINGS_FILE)) fs.writeFileSync(LISTINGS_FILE, '[]', 'utf8');

function loadListings() { return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
function saveListings(db) { fs.writeFileSync(LISTINGS_FILE, JSON.stringify(db, null, 2), 'utf8'); }
function loadChars() { return fs.existsSync(CHARS_FILE) ? JSON.parse(fs.readFileSync(CHARS_FILE, 'utf8')) : {}; }
function saveChars(db) { fs.writeFileSync(CHARS_FILE, JSON.stringify(db, null, 2), 'utf8'); }
function genId(db) { const ids = db.map(i => parseInt(String(i.id).slice(1), 10) || 0); const max = ids.length ? Math.max(...ids) : 0; return `l${max + 1}`; }

function broadcast(event) {
  if (global.shaddai_bridge && global.shaddai_bridge.post) {
    global.shaddai_bridge.post(event);
  }
}

const MARKET_MIN_TL = 5;       // must reach this Total Level to list/buy at all
const SOFT_GATE_TL = 10;       // past this, a small extra fee applies (soft token gate)
const SOFT_GATE_FEE = 5;       // flat Sparks, taken from the seller's proceeds
const COMMISSION_RATE = 0.05;  // 5% to the house

/* ---------- GET /market/listings ---------- */
router.get('/listings', (req, res) => {
  try {
    const db = loadListings();
    res.json({ success: true, listings: db });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- POST /market/listing ----------
   Escrows the item out of the seller's inventory immediately, so a
   listing can never outlive what the seller actually has (no dupes). */
router.post('/listing', (req, res) => {
  try {
    const { ownerId, itemName, price, duration } = req.body;
    if (!ownerId || typeof itemName !== 'string' || typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    const tl = readTotalLevel(ownerId);
    if (tl < MARKET_MIN_TL) {
      return res.status(403).json({ success: false, error: `Reach Total Level ${MARKET_MIN_TL} to use the market (you are TL ${tl})` });
    }

    const chars = loadChars();
    const seller = chars[ownerId];
    if (!seller) return res.status(404).json({ success: false, error: 'Character not found' });
    const have = (seller.inventory || {})[itemName] || 0;
    if (have < 1) return res.status(400).json({ success: false, error: `You don't have any ${itemName} to list` });
    seller.inventory[itemName] = have - 1;
    if (seller.inventory[itemName] <= 0) delete seller.inventory[itemName];
    saveChars(chars);

    const newListing = {
      id: genId(loadListings()),
      ownerId,
      itemName,
      price,
      duration: duration || 86400, // default 24 h in seconds
      createdAt: Date.now(),
      active: true,
      bids: [] // array of {bidderId, amount, ts}
    };
    const db = loadListings();
    db.push(newListing);
    saveListings(db);
    broadcast({ type: 'listing_created', payload: newListing });
    res.json({ success: true, listing: newListing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- POST /market/bid ----------
   Validates the bidder can actually afford it (no fake bids), but does
   not move Sparks yet — that happens once, atomically, at /complete. */
router.post('/bid', (req, res) => {
  try {
    const { listingId, bidderId, amount } = req.body;
    if (typeof listingId !== 'string' || typeof bidderId !== 'string' || typeof amount !== 'number') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    const db = loadListings();
    const listingIdx = db.findIndex(l => l.id === listingId);
    if (listingIdx < 0) return res.status(404).json({ success: false, error: 'Listing not found' });

    const listing = db[listingIdx];
    if (!listing.active) return res.status(400).json({ success: false, error: 'Listing expired' });
    if (amount <= 0) return res.status(400).json({ success: false, error: 'Bid must be > 0' });
    if (listing.ownerId === bidderId) return res.status(400).json({ success: false, error: 'Cannot bid on your own listing' });

    const chars = loadChars();
    const bidder = chars[bidderId];
    if (!bidder) return res.status(404).json({ success: false, error: 'Character not found' });
    if ((bidder.currency?.sparks || 0) < amount) return res.status(400).json({ success: false, error: 'Insufficient Sparks to cover this bid' });

    listing.bids.push({ bidderId, amount, ts: Date.now() });
    saveListings(db);
    broadcast({ type: 'bid_placed', payload: { listingId, bidderId, amount } });
    res.json({ success: true, message: 'Bid recorded' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- POST /market/complete ----------
   Real settlement: Sparks move from buyer to seller (minus commission,
   minus the soft-gate fee above TL 10), and the item lands in the
   buyer's inventory. Buyer must actually afford it. */
router.post('/complete', (req, res) => {
  try {
    const { listingId, buyerId, sellerId } = req.body;
    if (!listingId || typeof buyerId !== 'string' || typeof sellerId !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    const db = loadListings();
    const listingIdx = db.findIndex(l => l.id === listingId);
    if (listingIdx < 0) return res.status(404).json({ success: false, error: 'Listing not found' });
    const listing = db[listingIdx];
    if (!listing.active) return res.status(400).json({ success: false, error: 'Listing expired' });
    if (listing.ownerId !== sellerId) return res.status(403).json({ success: false, error: 'sellerId does not own this listing' });

    const chars = loadChars();
    const buyer = chars[buyerId];
    const seller = chars[sellerId];
    if (!buyer || !seller) return res.status(404).json({ success: false, error: 'Character not found' });

    const price = listing.price;
    if ((buyer.currency?.sparks || 0) < price) return res.status(400).json({ success: false, error: 'Buyer cannot afford this listing' });

    const commission = Math.floor(price * COMMISSION_RATE);
    const sellerTL = readTotalLevel(sellerId);
    const softFee = sellerTL >= SOFT_GATE_TL ? Math.min(SOFT_GATE_FEE, price - commission) : 0;
    const sellerNet = price - commission - softFee;

    buyer.currency = buyer.currency || { sparks: 0 };
    seller.currency = seller.currency || { sparks: 0 };
    buyer.currency.sparks -= price;
    seller.currency.sparks += sellerNet;
    buyer.inventory = buyer.inventory || {};
    buyer.inventory[listing.itemName] = (buyer.inventory[listing.itemName] || 0) + 1;
    saveChars(chars);
    /* the burn is no longer silent: buyer debit, seller credit, and the commission + soft-gate fee as an explicit ledgered burn */
    sparksCore.recordChange(buyer, -price, 'market-buy', { ref: listingId, burned: 0 });
    sparksCore.recordChange(seller, sellerNet, 'market-sale', { ref: listingId, minted: 0 });
    sparksCore.recordBurn(commission + softFee, 'market-burn', { ref: listingId, note: 'commission ' + commission + ' + soft-gate fee ' + softFee });

    listing.active = false;
    listing.bids = [];
    saveListings(db);
    broadcast({ type: 'sale_completed', payload: { listingId, buyerId, sellerId, price, commission, softFee, sellerNet } });
    res.json({ success: true, message: 'Sale completed', price, commission, softFee, sellerNet });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* --------------------------------------------------------------
   Mount this router from server/index.js:
   app.use('/market', marketRouter);
   -------------------------------------------------------------- */
module.exports = router;
