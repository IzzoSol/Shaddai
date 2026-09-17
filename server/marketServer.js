/* marketplace – listings, bids, and settlements
   – uses the same bridge signalling pattern as characterServer
   – all data persisted in data/listings.json
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const LISTINGS_FILE = path.join(__dirname, 'data', 'listings.json');

// ensure persistence file exists
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(LISTINGS_FILE)) fs.writeFileSync(LISTINGS_FILE, '[]', 'utf8');

function loadListings() { return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8')); }
function saveListings(db) { fs.writeFileSync(LISTINGS_FILE, JSON.stringify(db, null, 2), 'utf8'); }
function genId(db) { const ids = db.map(i => i.id); const max = ids.length ? Math.max(...ids) : 0; return `l${max + 1}`; }

function broadcast(event) {
  if (global.shaddai_bridge && global.shaddai_bridge.post) {
    global.shaddai_bridge.post(event);
  }
}

/* ---------- GET /market/listings ---------- */
router.get('/listings', (req, res) => {
  try {
    const db = loadListings();
    res.json({ success: true, listings: db });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- POST /market/listing ---------- */
router.post('/listing', (req, res) => {
  try {
    const { ownerId, itemName, price, duration } = req.body;
    if (!ownerId || typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    const newListing = {
      id: genId(loadListings()),
      ownerId,
      itemName,
      price,
      duration: duration || 86400, // default 24 h in seconds
      createdAt: Date.now(),
      active: true,
      bids: [] // array of {bidderId, amount, ts}
    };
    const db = loadListings();
    db.push(newListing);
    saveListings(db);
    // bridge notification
    broadcast({ type: 'listing_created', payload: newListing });
    res.json({ success: true, listing: newListing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- POST /market/bid ---------- */
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

    // ensure bidder has enough Sparks (simple check – real validation would query wallet)
    // assume a global wallet store exists – for demo we just log
    console.log(`Bid placed: listing ${listingId} by ${bidderId} for ${amount} Sparks`);

    // record bid
    listing.bids.push({ bidderId, amount, ts: Date.now() });
    saveListings(db);
    broadcast({ type: 'bid_placed', payload: { listingId, bidderId, amount } });
    res.json({ success: true, message: 'Bid recorded' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- POST /market/complete ---------- */
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

    // simple commission (5 %)
    const price = listing.price;
    const commission = price * 0.05;
    const sellerNet = price - commission;

    // deduct Sparks from buyer (simulate wallet)
    // TODO: integrate with wallet service
    console.log(`Spend ${price} Sparks from buyer ${buyerId}`);

    // credit seller (minus commission)
    console.log(`Credit ${sellerNet} Sparks to seller ${sellerId}`);

    // mark listing as completed (inactive) and remove bids
    listing.active = false;
    listing.bids = [];
    saveListings(db);
    broadcast({ type: 'sale_completed', payload: { listingId, buyerId, sellerId, price, commission } });
    res.json({ success: true, message: 'Sale completed' });
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