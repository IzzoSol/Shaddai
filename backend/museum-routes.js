// museum-routes.js — TURTLE's place: The Museum (gallery of digital art, music & other).
//   GET  /api/museum/list?type=art|music|other   — browse the gallery (open to all).
//   POST /api/museum/item  {title,type,url,creator,desc} — upload a gallery item (open to all).
//   POST /api/museum/mint  {id,tier}             — mint an item as an NFT (Pro/Alpha premium hook).
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const MUS = path.join(__dirname, 'data', 'museum.json');
const readLib = () => { try { return JSON.parse(fs.readFileSync(MUS, 'utf8')); } catch (e) { return { items: [] }; } };
const writeLib = (d) => { try { fs.writeFileSync(MUS, JSON.stringify(d, null, 2)); } catch (e) {} };

const TYPES = ['art', 'music', 'other'];
const MINT_TIERS = ['pro', 'alpha'];

router.get('/api/museum/list', (req, res) => {
  const type = String(req.query.type || '').toLowerCase();
  const db = readLib();
  let items = db.items.slice();
  if (TYPES.includes(type)) items = items.filter(it => it.type === type);
  items = items.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 200);
  res.json({ ok: true, count: items.length, items });
});

router.post('/api/museum/item', json, (req, res) => {
  const { title, type, url, creator, desc } = req.body || {};
  const t = String(type || '').toLowerCase();
  if (!TYPES.includes(t)) return res.status(400).json({ error: 'type must be art, music, or other' });
  if (!url) return res.status(400).json({ error: 'url required (image / audio / file URL or data ref)' });
  const db = readLib();
  const item = {
    id: Date.now().toString(36),
    title: String(title || '(untitled)').slice(0, 200),
    type: t,
    url: String(url).slice(0, 4000),
    creator: String(creator || 'guest').slice(0, 80),
    desc: String(desc || '').slice(0, 2000),
    minted: false,
    at: Date.now(),
  };
  db.items.unshift(item); db.items = db.items.slice(0, 1000); writeLib(db);
  res.json({ ok: true, item, total: db.items.length });
});

router.post('/api/museum/mint', json, (req, res) => {
  const { id, tier } = req.body || {};
  if (!MINT_TIERS.includes(String(tier || '').toLowerCase())) return res.status(402).json({ error: 'Minting NFTs is a Pro/Alpha feature. Upgrade to mint your gallery items on-chain.', gated: true });
  if (!id) return res.status(400).json({ error: 'id required' });
  const db = readLib();
  const item = db.items.find(it => it.id === id);
  if (!item) return res.status(404).json({ error: 'item not found' });
  item.minted = true;
  item.mintedAt = Date.now();
  item.tier = String(tier).toLowerCase();
  writeLib(db);
  res.json({ ok: true, item });
});

module.exports = router;
