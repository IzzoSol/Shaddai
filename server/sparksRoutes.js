/* sparksRoutes.js — server-authoritative Sparks for the 3D world (mounted at /sparks).
   The client (public/sparks-ledger.js -> window.ShdSparks) keeps a READ-THROUGH CACHE of char.currency.sparks and
   identifies the caller with the same x-user-id header world-gate.js already attaches. Guests ('guest-*', 'local', empty) get NO server wallet
   (they stay on the local cache, which is fine for a demo but not for anything that can be sold).
     GET  /sparks/balance          -> { balance, characterId }
     POST /sparks/spend            { amount, kind, note }        debit (never below 0)
     POST /sparks/earn             { amount, kind, note }        credit ONLY for allow-listed game kinds, with per-call + per-day caps
     POST /sparks/vendor/buy       { vendorId, itemId }          price comes from the SERVER catalog, never the client
     GET  /sparks/ledger?limit=    -> this character's recent entries
     GET  /sparks/summary          -> minted / burned / net by kind (governance view)                                                */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const core = require('./sparksCore');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');
function loadChars() { return fs.existsSync(CHARS_FILE) ? JSON.parse(fs.readFileSync(CHARS_FILE, 'utf8')) : {}; }
function saveChars(db) { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CHARS_FILE, JSON.stringify(db, null, 2), 'utf8'); }

/* same rule as cloudUid() (game.html:2258, shd-tier.js:46): real ids only */
function cloudUid(req) {
  const u = String(req.headers['x-user-id'] || '').trim();
  if (!u || u.length > 128 || u === 'local' || u.indexOf('guest') === 0) return null;
  return u;
}
function newId(db) { const ids = Object.keys(db).map(i => parseInt(i.slice(1))).filter(n => !isNaN(n)); return 'c' + ((ids.length ? Math.max(...ids) : 0) + 1); }
function findOrCreate(db, uid) {
  let char = Object.values(db).find(c => c.userId === uid);
  if (char) return { char, created: false };
  const id = newId(db);
  char = { id, userId: uid, inventory: {}, stats: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 }, location: { x: 50, y: 50 }, hotbar: Array(10).fill(''), currency: { sparks: 100 } };
  db[id] = char; core.record({ kind: 'signup-grant', characterId: id, delta: 100, balanceAfter: 100, minted: 100, note: 'starting Sparks' });
  return { char, created: true };
}
function auth(req, res, next) {
  const uid = cloudUid(req);
  if (!uid) return res.status(401).json({ success: false, error: 'Sign in to use the server wallet (guests stay on the local cache)', guest: true });
  req.uid = uid; next();
}
function amt(v, max) { const n = Math.floor(Number(v)); return isFinite(n) && n >= 1 && n <= (max || 100000) ? n : 0; }

/* faucet allow-list: what a client may CLAIM from a game it just finished. Everything else must be minted by a server route. */
const EARN_RULES = { tactics: { perCall: 100, perDay: 400 }, arena: { perCall: 200, perDay: 800 }, arcade: { perCall: 50, perDay: 300 }, soccer: { perCall: 150, perDay: 600 } };

/* Colosseum concessions — the ONLY place prices exist (Sparks only). vendorId 'kiosk-N' or any string; kind picks the menu. */
const VENDOR_CATALOG = {
  nachos:   { name: 'Arena Nachos',   price: 8,  kind: 'food',  item: 'snack_nachos' },
  hotdog:   { name: 'Gladiator Dog',  price: 5,  kind: 'food',  item: 'snack_hotdog' },
  soda:     { name: 'Neon Soda',      price: 3,  kind: 'drink', item: 'drink_soda' },
  nectar:   { name: 'Spark Nectar',   price: 6,  kind: 'drink', item: 'drink_nectar' },
  scarf:    { name: 'Team Scarf',     price: 25, kind: 'merch', item: 'merch_scarf' },
  foamhand: { name: 'Foam Hand',      price: 12, kind: 'merch', item: 'merch_foamhand' },
  program:  { name: 'Match Program',  price: 4,  kind: 'score', item: 'misc_program' },
};

router.get('/balance', auth, (req, res) => {
  try { const db = loadChars(); const { char, created } = findOrCreate(db, req.uid); if (created) saveChars(db); res.json({ success: true, balance: char.currency.sparks || 0, characterId: char.id, mode: 'server' }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/spend', auth, (req, res) => {
  try {
    const n = amt(req.body && req.body.amount); if (!n) return res.status(400).json({ success: false, error: 'Bad amount' });
    const db = loadChars(); const { char } = findOrCreate(db, req.uid);
    if ((char.currency.sparks || 0) < n) return res.status(400).json({ success: false, error: 'Insufficient Sparks', balance: char.currency.sparks || 0 });
    char.currency.sparks -= n; saveChars(db);
    core.recordSink(char, n, 'spend:' + String((req.body && req.body.kind) || 'misc').slice(0, 24), { note: req.body && req.body.note });
    res.json({ success: true, balance: char.currency.sparks });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/earn', auth, (req, res) => {
  try {
    const kind = String((req.body && req.body.kind) || ''); const rule = EARN_RULES[kind];
    if (!rule) return res.status(403).json({ success: false, error: 'Not a client-claimable faucet', kind });
    const n = amt(req.body && req.body.amount, rule.perCall); if (!n) return res.status(400).json({ success: false, error: 'Amount outside 1..' + rule.perCall });
    const db = loadChars(); const { char } = findOrCreate(db, req.uid);
    const key = 'earn:' + kind, today = core.earnedToday(char.id, key);
    if (today + n > rule.perDay) return res.status(429).json({ success: false, error: 'Daily cap reached for ' + kind, cap: rule.perDay, balance: char.currency.sparks || 0 });
    char.currency.sparks = (char.currency.sparks || 0) + n; saveChars(db);
    core.recordChange(char, n, key, { note: req.body && req.body.note });
    res.json({ success: true, balance: char.currency.sparks, earnedToday: today + n, cap: rule.perDay });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.get('/vendor/catalog', (req, res) => res.json({ success: true, catalog: VENDOR_CATALOG }));
router.post('/vendor/buy', auth, (req, res) => {
  try {
    const { vendorId, itemId } = req.body || {}; const it = VENDOR_CATALOG[itemId];
    if (!vendorId || !it) return res.status(400).json({ success: false, error: 'Unknown item' });
    const db = loadChars(); const { char } = findOrCreate(db, req.uid);
    if ((char.currency.sparks || 0) < it.price) return res.status(400).json({ success: false, error: 'Insufficient Sparks', price: it.price, balance: char.currency.sparks || 0 });
    char.currency.sparks -= it.price; char.inventory = char.inventory || {}; char.inventory[it.item] = Math.min((char.inventory[it.item] || 0) + 1, 99); saveChars(db);
    core.recordSink(char, it.price, 'vendor:' + it.kind, { ref: String(vendorId).slice(0, 32) + ':' + itemId });
    res.json({ success: true, balance: char.currency.sparks, item: it.item, name: it.name, price: it.price });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.get('/ledger', auth, (req, res) => {
  try { const db = loadChars(); const { char } = findOrCreate(db, req.uid); res.json({ success: true, entries: core.forCharacter(char.id, Math.min(200, parseInt(req.query.limit, 10) || 50)) }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});
router.get('/summary', (req, res) => { try { res.json({ success: true, summary: core.summary() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

module.exports = router;
module.exports.VENDOR_CATALOG = VENDOR_CATALOG;
module.exports.EARN_RULES = EARN_RULES;
module.exports.cloudUid = cloudUid;
module.exports.findOrCreate = findOrCreate;
