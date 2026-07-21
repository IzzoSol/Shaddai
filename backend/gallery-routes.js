// gallery-routes.js — per-agent Creator Galleries for Shaddai.
//   Flow: use your agents to make packs/content (images, music, clips, articles, models)
//   → SAVE it into a gallery per agent (their rooms) or the main dashboard (OPERATOR)
//   → later LIST it for sale in the bazaar.
//   Store: backend/data/gallery.json  → { items:[ {id,user,agent,type,title,url,meta,createdAt,listed} ] }
//   Atomic JSON read/write in the style of district-routes.js (express/fs/path).
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const GAL = path.join(__dirname, 'data', 'gallery.json');
const readGal = () => { try { const d = JSON.parse(fs.readFileSync(GAL, 'utf8')); if (!Array.isArray(d.items)) d.items = []; return d; } catch (e) { return { items: [] }; } };
// atomic write: write a tmp file then rename over the target (safe under concurrent readers).
const writeGal = (d) => {
  try {
    const tmp = GAL + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d, null, 2)); fs.renameSync(tmp, GAL);
    // Mirror to Firestore so the user gallery survives Render redeploys (best-effort).
    try { require('./lib/fire-store').saveDoc('shaddai_gallery_all', 'items', (d.items || []).slice(0, 600)); } catch (_) {}
  } catch (e) {}
};
// Restore the gallery from Firestore after a redeploy wiped local JSON (only if local is empty).
setTimeout(async () => {
  try {
    const store = require('./lib/fire-store');
    if (!store.ready || !store.ready()) return;
    const items = await store.loadDoc('shaddai_gallery_all', 'items');
    if (Array.isArray(items) && items.length) { const db = readGal(); if (!db.items.length) { db.items = items; writeGal(db); } }
  } catch (_) {}
}, 2400);

const TYPES = ['image', 'music', 'clip', 'article', 'model', 'achievement', 'other'];
const AGENTS = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'QUILL', 'TURTLE', 'PIKADON', 'OPERATOR'];
const CAP = 500;   // max stored items
const pub = (it) => ({ id: it.id, user: it.user, agent: it.agent, type: it.type, title: it.title, url: it.url, meta: it.meta || {}, createdAt: it.createdAt, listed: !!it.listed, price: it.price != null ? it.price : null, minted: !!it.minted });

// ── SAVE — an agent's creation lands in its gallery (or the dashboard / OPERATOR) ──
router.post('/api/gallery/save', json, (req, res) => {
  const { user, agent, type, title, url, meta } = req.body || {};
  if (!user) return res.status(400).json({ error: 'user required' });
  if (!url) return res.status(400).json({ error: 'url required' });
  const t = TYPES.includes(String(type || '').toLowerCase()) ? String(type).toLowerCase() : 'image';
  const a = String(agent || 'OPERATOR').toUpperCase();
  if (!AGENTS.includes(a)) return res.status(400).json({ error: 'agent must be one of the 7 (SHADDAI, ZEROX, ORACLE, NEXUS, QUILL, TURTLE, PIKADON) or OPERATOR' });
  const db = readGal();
  const item = {
    id: 'gal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    user: String(user).slice(0, 120),
    agent: a,
    type: t,
    title: String(title || '(untitled)').slice(0, 300),
    url: String(url).slice(0, 4000),
    meta: (meta && typeof meta === 'object') ? meta : {},
    createdAt: Date.now(),
    listed: false,
    price: null,
    minted: false,   // NFT hook — achieved/created items can be minted later
  };
  db.items.unshift(item);              // newest first
  db.items = db.items.slice(0, CAP);   // cap 500
  writeGal(db);
  res.json({ ok: true, item: pub(item), total: db.items.length });
});

// ── GET — view a user's gallery, optionally a single agent's room and/or one type ──
// SECURITY: this is a PER-USER gallery. Without a user we return NOTHING — never the
// whole store — so leftover / other people's items can't surface in your gallery.
router.get('/api/gallery', (req, res) => {
  const user = String(req.query.user || '').trim();
  const agent = String(req.query.agent || '').trim().toUpperCase();
  const type = String(req.query.type || '').trim().toLowerCase();
  if (!user) return res.json({ ok: true, count: 0, items: [] });
  const db = readGal();
  let items = db.items.filter(it => it.user === user);
  if (agent) items = items.filter(it => it.agent === agent);
  if (type) items = items.filter(it => it.type === type);
  items = items.slice(0, 100).map(pub); // already newest-first; cap 100
  res.json({ ok: true, count: items.length, items });
});

// ── STATS — quick rollup for the user's dashboard ──
//   (declared before /:id routes so 'stats' isn't captured as an :id)
router.get('/api/gallery/stats', (req, res) => {
  const user = String(req.query.user || '').trim();
  const db = readGal();
  const mine = user ? db.items.filter(it => it.user === user) : db.items;
  const byType = {}, byAgent = {};
  let listed = 0;
  mine.forEach(it => {
    byType[it.type] = (byType[it.type] || 0) + 1;
    byAgent[it.agent] = (byAgent[it.agent] || 0) + 1;
    if (it.listed) listed++;
  });
  res.json({ ok: true, total: mine.length, byType, byAgent, listed });
});

// ── LIST — flag a gallery item for sale + record its price (bazaar wiring is separate) ──
router.post('/api/gallery/:id/list', json, (req, res) => {
  const { user, price } = req.body || {};
  if (!user) return res.status(400).json({ error: 'user required' });
  const db = readGal();
  const item = db.items.find(it => it.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (item.user !== user) return res.status(403).json({ error: 'only the owner can list this item' });
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return res.status(400).json({ error: 'price must be a non-negative number' });
  item.listed = true;
  item.price = p;
  writeGal(db);
  res.json({ ok: true, item: pub(item) });
});

// ── DELETE — only the owner can remove their item ──
router.delete('/api/gallery/:id', (req, res) => {
  const user = String(req.query.user || '').trim();
  const db = readGal();
  const idx = db.items.findIndex(it => it.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'item not found' });
  if (!user || db.items[idx].user !== user) return res.status(403).json({ error: 'only the owner can delete this item' });
  db.items.splice(idx, 1);
  writeGal(db);
  res.json({ ok: true, deleted: req.params.id });
});

// ── MINT — flag an achieved/created item as minted (NFT hook for later) ──
router.post('/api/gallery/:id/mint', json, (req, res) => {
  const user = String((req.body && req.body.user) || '').trim();
  const db = readGal();
  const item = db.items.find(it => it.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (!user || item.user !== user) return res.status(403).json({ error: 'only the owner can mint this item' });
  item.minted = true; item.mintedAt = Date.now();
  writeGal(db);
  res.json({ ok: true, item: pub(item) });
});

module.exports = router;
