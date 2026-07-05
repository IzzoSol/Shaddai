// bazaar-routes.js — The Agora: a real marketplace where users list items, trade skills/services,
// and (hook) request external orders. Buying settles through the x402 SHAD-Credits ledger.
//   GET  /api/bazaar/list?kind=          → listings (kind: item|skill|service|all)
//   POST /api/bazaar/list-item {seller,name,kind,price,desc,image}
//   POST /api/bazaar/buy {id, buyer}     → x402 charge buyer → credit seller (5% fee)
//   DELETE /api/bazaar/:id?user=         → delist (seller or admin)
//   POST /api/bazaar/order-external {user,store,item,note}  → external fulfillment request (queued)
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'bazaar.json');
const COLLECTIBLES_FILE = path.join(DATA_DIR, 'collectibles.json');
const COLLECTIBLE_TRADES_FILE = path.join(DATA_DIR, 'collectible-trades.json');
const FORGE_STATE_FILE = path.join(DATA_DIR, 'forge-state.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'bazaar-purchases.json'); // pending/settled buy records (incl. Solana Pay)
let x402 = null; try { x402 = require('./x402-routes'); } catch (e) {}
let adminGate = null; try { adminGate = require('./admin-routes').canManage; } catch (e) {}

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { listings: [], orders: [] }; } };
const write = (d) => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch (e) {} };
const KINDS = ['item', 'skill', 'service'];
const FEE_RATE = 0.05; // 5% marketplace fee (mirrors x402-routes)

// ── generic JSON helpers (atomic tmp→rename, never throw) ──────────────────
function readJSON(fp, fallback) { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { return fallback; } }
function writeJSONAtomic(fp, data) {
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = fp + '.tmp.' + process.pid + '.' + Date.now().toString(36);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, fp); // atomic on same volume
    return true;
  } catch (e) { return false; }
}

// ── resolve a buyable item across every store the bazaar sells from ─────────
// Returns a normalized descriptor: { source, id, name, priceCredits, seller, sellable, reason }
//   source: 'bazaar' | 'collectible' | 'forge'
// Item id conventions accepted:
//   bazaar listing  → the raw id (e.g. "bz_abc123")
//   collectible     → numeric id, or "col_<id>" / "collectible_<id>"
//   forged operative→ "forge_<tokenId>" / "op_<tokenId>"  (or a listed forge tokenId)
function resolveItem(itemId) {
  const raw = String(itemId == null ? '' : itemId).trim();
  if (!raw) return { sellable: false, reason: 'itemId required' };

  // 1) Bazaar listing
  if (/^bz_/.test(raw)) {
    const db = read();
    const it = (db.listings || []).find(x => x && x.id === raw);
    if (!it) return { sellable: false, reason: 'listing not found' };
    if (it.status === 'sold') return { sellable: false, reason: 'already sold', name: it.name };
    return { source: 'bazaar', id: it.id, name: it.name, priceCredits: Math.max(0, Number(it.price) || 0), seller: String(it.seller || 'guest'), kind: it.kind, sellable: true, raw: it };
  }

  // 2) Forged operative
  let m = /^(?:forge|op)_(.+)$/i.exec(raw);
  if (m) {
    const tokenId = m[1];
    const state = readJSON(FORGE_STATE_FILE, { operatives: [] });
    const ops = Array.isArray(state.operatives) ? state.operatives : [];
    const op = ops.find(o => o && String(o.tokenId) === String(tokenId));
    if (!op) return { sellable: false, reason: 'operative not found' };
    const price = op.listing && op.listing.priceCredits != null ? Number(op.listing.priceCredits) : null;
    if (!(price > 0)) return { sellable: false, reason: 'operative is not listed for sale', name: op.codename };
    return { source: 'forge', id: 'forge_' + op.tokenId, tokenId: op.tokenId, name: op.codename || ('Operative #' + op.tokenId), priceCredits: price, seller: String(op.owner || 'anon'), sellable: true, raw: op };
  }

  // 3) Collectible (numeric or col_/collectible_ prefixed)
  m = /^(?:col|collectible)_(\d+)$/i.exec(raw);
  const numId = m ? Number(m[1]) : (/^\d+$/.test(raw) ? Number(raw) : NaN);
  if (Number.isFinite(numId)) {
    const list = readJSON(COLLECTIBLES_FILE, []);
    const it = (Array.isArray(list) ? list : []).find(c => c && Number(c.id) === numId);
    if (!it) return { sellable: false, reason: 'collectible not found' };
    const price = it.listing && it.listing.priceCredits != null ? Number(it.listing.priceCredits) : null;
    if (!(price > 0)) return { sellable: false, reason: 'collectible is not listed for sale', name: it.name };
    return { source: 'collectible', id: 'col_' + it.id, collectibleId: it.id, name: it.name, priceCredits: price, seller: String(it.owner || 'unknown'), sellable: true, raw: it };
  }

  return { sellable: false, reason: 'unrecognized itemId' };
}

// ── commit ownership transfer to the right store (atomic). Returns true/false ─
function commitOwnership(desc, buyer) {
  try {
    if (desc.source === 'bazaar') {
      const db = read();
      const it = (db.listings || []).find(x => x && x.id === desc.id);
      if (!it || it.status === 'sold') return false;
      if (it.kind === 'item') { it.status = 'sold'; it.buyer = buyer; it.soldAt = Date.now(); }
      // skills/services stay listed (repeatable) — record the sale count instead
      it.sales = (Number(it.sales) || 0) + 1;
      write(db);
      return true;
    }
    if (desc.source === 'collectible') {
      const list = readJSON(COLLECTIBLES_FILE, []);
      const arr = Array.isArray(list) ? list : [];
      const it = arr.find(c => c && Number(c.id) === Number(desc.collectibleId));
      if (!it) return false;
      const seller = String(it.owner || 'unknown');
      it.owner = buyer;
      it.tradedAt = new Date().toISOString();
      delete it.listing; // no longer for sale after transfer
      if (!writeJSONAtomic(COLLECTIBLES_FILE, arr)) return false;
      // append a trade record (fee math mirrors execute_trade: 10% there, but bazaar fee is 5%)
      const price = Number(desc.priceCredits) || 0;
      const platformFee = Math.round(price * FEE_RATE * 100) / 100;
      const trades = readJSON(COLLECTIBLE_TRADES_FILE, []);
      (Array.isArray(trades) ? trades : []).push({
        id: 'trade-' + Date.now().toString(36), collectibleId: it.id, seller, buyer,
        price, platformFee, sellerProceeds: Math.round((price - platformFee) * 100) / 100,
        via: 'bazaar', executedAt: new Date().toISOString()
      });
      writeJSONAtomic(COLLECTIBLE_TRADES_FILE, Array.isArray(trades) ? trades : []);
      return true;
    }
    if (desc.source === 'forge') {
      const state = readJSON(FORGE_STATE_FILE, { operatives: [] });
      if (!Array.isArray(state.operatives)) return false;
      const op = state.operatives.find(o => o && String(o.tokenId) === String(desc.tokenId));
      if (!op) return false;
      op.owner = buyer;
      op.tradedAt = Date.now();
      delete op.listing; // transferred → delisted
      return writeJSONAtomic(FORGE_STATE_FILE, state);
    }
  } catch (e) {}
  return false;
}

// ── purchase record store (pending Solana Pay + settled) ───────────────────
function readPurchases() { const d = readJSON(PURCHASES_FILE, { purchases: [] }); return d && Array.isArray(d.purchases) ? d : { purchases: [] }; }
function savePurchase(rec) {
  const db = readPurchases();
  const i = db.purchases.findIndex(p => p.reference === rec.reference);
  if (i >= 0) db.purchases[i] = rec; else db.purchases.unshift(rec);
  db.purchases = db.purchases.slice(0, 1000);
  writeJSONAtomic(PURCHASES_FILE, db);
}
function findPurchase(reference) { return readPurchases().purchases.find(p => p.reference === reference) || null; }

const API_BASE = () => process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + (process.env.PORT || 8099));

router.get('/api/bazaar/list', (req, res) => {
  const kind = String(req.query.kind || 'all');
  const db = read();
  let l = db.listings.filter(x => x.status !== 'sold');
  if (kind !== 'all' && KINDS.includes(kind)) l = l.filter(x => x.kind === kind);
  res.json({ ok: true, count: l.length, listings: l.slice(0, 100) });
});

router.post('/api/bazaar/list-item', json, (req, res) => {
  const { seller, name, kind, price, desc, image } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const k = KINDS.includes(kind) ? kind : 'item';
  const db = read();
  const item = { id: 'bz_' + Date.now().toString(36), seller: String(seller || 'guest').slice(0, 32), name: String(name).slice(0, 80), kind: k, price: Math.max(0, Number(price) || 0), desc: String(desc || '').slice(0, 400), image: image || null, status: 'live', at: Date.now() };
  db.listings.unshift(item); db.listings = db.listings.slice(0, 500); write(db);
  res.json({ ok: true, listing: item, total: db.listings.length });
});

// settle a purchase through the x402 ledger (reuses the charge logic via internal HTTP-free call)
router.post('/api/bazaar/buy', json, async (req, res) => {
  const { id, buyer } = req.body || {};
  const db = read(); const item = db.listings.find(x => x.id === id);
  if (!item) return res.status(404).json({ ok: false, error: 'listing not found' });
  if (item.status === 'sold') return res.status(409).json({ ok: false, error: 'already sold' });
  const user = String(buyer || 'guest');
  if (user === item.seller) return res.status(400).json({ ok: false, error: "you can't buy your own listing" });
  // settle via x402 charge: debit buyer, net to seller, 5% fee to treasury (x402-routes does the math)
  try {
    const base = process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + (process.env.PORT || 8099));
    const r = await fetch(base + '/api/x402/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, amount: item.price, reason: 'bazaar: ' + item.name, payee: item.seller }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 402) return res.status(402).json({ ok: false, error: 'Insufficient SHAD-Credits', x402: d.x402 });
    if (!d.ok) return res.status(502).json({ ok: false, error: 'payment failed' });
    // items become sold; skills/services stay listed (repeatable)
    if (item.kind === 'item') { item.status = 'sold'; item.buyer = user; item.soldAt = Date.now(); }
    write(db);
    res.json({ ok: true, bought: { id: item.id, name: item.name, price: item.price }, payment: { charged: d.charged, fee: d.fee, balance: d.balance } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/api/bazaar/:id', (req, res) => {
  const db = read(); const item = db.listings.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'not found' });
  const user = String(req.query.user || '');
  const ok = (user && user === item.seller) || (adminGate && adminGate(req.query.world || 'shaddai', user, req.headers['x-admin-token']));
  if (!ok) return res.status(403).json({ ok: false, error: 'only the seller or an admin can delist' });
  db.listings = db.listings.filter(x => x.id !== req.params.id); write(db);
  res.json({ ok: true, delisted: req.params.id });
});

// external ordering hook — queues a fulfillment request (groceries / other sites later)
router.post('/api/bazaar/order-external', json, (req, res) => {
  const { user, store, item, note } = req.body || {};
  if (!item) return res.status(400).json({ ok: false, error: 'item required' });
  const db = read();
  const order = { id: 'ord_' + Date.now().toString(36), user: String(user || 'guest'), store: String(store || 'external').slice(0, 60), item: String(item).slice(0, 120), note: String(note || '').slice(0, 300), status: 'queued', at: Date.now() };
  db.orders.unshift(order); db.orders = db.orders.slice(0, 200); write(db);
  res.json({ ok: true, order, message: 'Order queued. External fulfillment (groceries / partner stores) connects via agent + x402 — coming online soon.' });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED PURCHASE FLOW — buy collectibles & forged agents (credits or Solana)
//   POST /api/bazaar/purchase { itemId, method, buyer }
//     method:'credits' → settle now via x402 ledger, transfer ownership, done.
//     method:'sol'     → create a Solana Pay charge, return {url, reference};
//                        ownership is NOT granted until payment confirms.
//   GET  /api/bazaar/purchase/:reference → poll Solana Pay status; on 'paid',
//                        finalize ownership transfer exactly once.
// ═══════════════════════════════════════════════════════════════════════════
router.post('/api/bazaar/purchase', json, async (req, res) => {
  try {
    const { itemId, method = 'credits', buyer } = req.body || {};
    const user = String(buyer || 'guest').slice(0, 64);
    const desc = resolveItem(itemId);
    if (!desc.sellable) return res.status(desc.reason === 'itemId required' ? 400 : 404).json({ ok: false, error: desc.reason || 'item not available', item: desc.name || null });
    if (user === desc.seller) return res.status(400).json({ ok: false, error: "you can't buy your own item" });
    const price = Math.round((Number(desc.priceCredits) || 0) * 100) / 100;
    if (!(price > 0)) return res.status(400).json({ ok: false, error: 'item has no valid price' });

    // ── Off-chain SHAD-Credits path ──────────────────────────────────────
    if (method === 'credits') {
      let d = {};
      try {
        const r = await fetch(API_BASE() + '/api/x402/charge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, amount: price, reason: 'bazaar buy: ' + desc.name, payee: desc.seller })
        });
        d = await r.json().catch(() => ({}));
        if (r.status === 402) return res.status(402).json({ ok: false, error: 'Insufficient SHAD-Credits', x402: d.x402 || null });
        if (!r.ok || !d.ok) return res.status(502).json({ ok: false, error: (d && d.error) || 'payment failed' });
      } catch (e) { return res.status(502).json({ ok: false, error: 'credit ledger unreachable: ' + e.message }); }

      if (!commitOwnership(desc, user)) {
        // payment went through but transfer failed — surface honestly (do not claim success)
        return res.status(409).json({ ok: false, error: 'charged, but item was no longer available — contact support', payment: { charged: d.charged, fee: d.fee } });
      }
      const rec = { reference: 'cr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), itemId: desc.id, name: desc.name, source: desc.source, buyer: user, seller: desc.seller, price, method: 'credits', status: 'settled', at: Date.now() };
      savePurchase(rec);
      return res.json({ ok: true, status: 'settled', purchase: rec, payment: { charged: d.charged, fee: d.fee, balance: d.balance } });
    }

    // ── On-chain Solana Pay path ─────────────────────────────────────────
    if (method === 'sol') {
      // price is in SHAD-Credits; use it as the SOL amount 1:1 unless a solPrice override is provided
      const solAmount = Number(req.body && req.body.solPrice) > 0 ? Number(req.body.solPrice) : price;
      let d = {};
      try {
        const r = await fetch(API_BASE() + '/api/pay/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: desc.id, amount: solAmount, currency: 'SOL', label: 'SHADDAI Bazaar', message: 'Buy ' + desc.name })
        });
        d = await r.json().catch(() => ({}));
        if (r.status === 503) return res.status(503).json({ ok: false, error: (d && d.error) || 'Solana Pay unavailable — merchant wallet not configured', needsConfig: 'SHADDAI_MERCHANT_WALLET' });
        if (!r.ok || !d.success || !d.payment) return res.status(502).json({ ok: false, error: (d && d.error) || 'could not create Solana payment' });
      } catch (e) { return res.status(502).json({ ok: false, error: 'payment service unreachable: ' + e.message }); }

      const rec = { reference: d.payment.reference, itemId: desc.id, name: desc.name, source: desc.source, buyer: user, seller: desc.seller, price, solAmount, method: 'sol', status: 'pending', payUrl: d.payment.url, at: Date.now() };
      savePurchase(rec);
      // NOTE: ownership is NOT granted yet — client must poll GET /api/bazaar/purchase/:reference
      return res.json({ ok: true, status: 'pending', reference: rec.reference, payUrl: d.payment.url, amount: solAmount, currency: 'SOL', purchase: rec });
    }

    return res.status(400).json({ ok: false, error: "method must be 'credits' or 'sol'" });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/bazaar/purchase/:reference — confirm a Solana Pay purchase; finalize once.
router.get('/api/bazaar/purchase/:reference', async (req, res) => {
  try {
    const ref = String(req.params.reference || '');
    const rec = findPurchase(ref);
    if (!rec) return res.status(404).json({ ok: false, error: 'purchase not found' });
    if (rec.status === 'settled') return res.json({ ok: true, status: 'settled', purchase: rec });
    if (rec.method !== 'sol') return res.json({ ok: true, status: rec.status, purchase: rec });

    // ask the Solana Pay rail whether the reference has been paid on-chain
    let pay = {};
    try {
      const r = await fetch(API_BASE() + '/api/pay/status/' + encodeURIComponent(ref));
      pay = await r.json().catch(() => ({}));
    } catch (e) { return res.json({ ok: true, status: 'pending', error: 'status check failed: ' + e.message, purchase: rec }); }

    if (pay && pay.status === 'paid') {
      // re-resolve to ensure the item is still transferable, then grant ownership once
      const desc = resolveItem(rec.itemId);
      if (!desc.sellable) {
        rec.status = 'paid_unfulfilled'; rec.signature = pay.signature || null; rec.note = desc.reason || 'item no longer available'; savePurchase(rec);
        return res.status(409).json({ ok: false, status: 'paid_unfulfilled', error: 'payment received but item is no longer available: ' + (desc.reason || ''), purchase: rec });
      }
      if (commitOwnership(desc, rec.buyer)) {
        rec.status = 'settled'; rec.signature = pay.signature || null; rec.settledAt = Date.now(); savePurchase(rec);
        return res.json({ ok: true, status: 'settled', signature: rec.signature, purchase: rec });
      }
      rec.status = 'paid_unfulfilled'; rec.signature = pay.signature || null; savePurchase(rec);
      return res.status(409).json({ ok: false, status: 'paid_unfulfilled', error: 'payment received but ownership transfer failed', purchase: rec });
    }

    return res.json({ ok: true, status: 'pending', purchase: rec });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
