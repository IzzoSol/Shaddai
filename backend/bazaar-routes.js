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

const FILE = path.join(__dirname, 'data', 'bazaar.json');
let x402 = null; try { x402 = require('./x402-routes'); } catch (e) {}
let adminGate = null; try { adminGate = require('./admin-routes').canManage; } catch (e) {}

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { listings: [], orders: [] }; } };
const write = (d) => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch (e) {} };
const KINDS = ['item', 'skill', 'service'];

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

module.exports = router;
