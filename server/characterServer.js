/* --------------------------------------------------------------
   Minimal character server – Express routes for a persistent
   2‑D MMO character (spawn, move, inventory, shop, death).
   -------------------------------------------------------------- */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHAR_DB_PATH = path.join(DATA_DIR, 'characters.json');
const GRAVE_DB_PATH = path.join(DATA_DIR, 'graves.json');
const GRAVE_GRACE_MS = 10 * 60 * 1000; // 10 minutes to reclaim a gravestone

// Ensure store exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHAR_DB_PATH)) fs.writeFileSync(CHAR_DB_PATH, '{}', 'utf8');
if (!fs.existsSync(GRAVE_DB_PATH)) fs.writeFileSync(GRAVE_DB_PATH, '{}', 'utf8');

function loadDB() { return JSON.parse(fs.readFileSync(CHAR_DB_PATH, 'utf8')); }
function saveDB(db) { fs.writeFileSync(CHAR_DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }
function loadGraves() { return JSON.parse(fs.readFileSync(GRAVE_DB_PATH, 'utf8')); }
function saveGraves(g) { fs.writeFileSync(GRAVE_DB_PATH, JSON.stringify(g, null, 2), 'utf8'); }

function genId(db) { const ids = Object.keys(db).map(i => parseInt(i.slice(1))); const m = ids.length ? Math.max(...ids) : 0; return `c${m + 1}`; }

function addItemToChar(char, itemId, amount = 1) {
  const cur = char.inventory?.[itemId] ?? 0;
  char.inventory[itemId] = Math.min(cur + amount, 99);
  return char;
}
function removeItemFromChar(char, itemId, amount = 1) {
  const cur = char.inventory?.[itemId] ?? 0;
  const nxt = Math.max(cur - amount, 0);
  if (nxt === 0) delete char.inventory[itemId];
  else char.inventory[itemId] = nxt;
  return char;
}
function handleDeath(char, dangerous = false) {
  const dropped = {};
  const lossPct = dangerous ? 0.5 : 0.0;
  // Items: keep equipment, drop a fraction of loose inventory
  for (const [k, c] of Object.entries(char.inventory || {})) {
    if (k.startsWith('equip_')) continue;
    const lose = Math.ceil(c * lossPct);
    if (lose > 0) {
      dropped[k] = lose;
      char.inventory[k] = c - lose;
      if (char.inventory[k] <= 0) delete char.inventory[k];
    }
  }
  // Sparks as a currency sink (dangerous zone only)
  let sparksLost = 0;
  if (dangerous && char.currency?.sparks) {
    sparksLost = Math.floor(char.currency.sparks * 0.1);
    char.currency.sparks -= sparksLost;
  }
  char.stats.hp = char.stats.maxHp;
  char.stats.energy = char.stats.maxEnergy;
  // Respawn at the central safe hub
  char.location = { x: 50, y: 50 };
  char.lastDeath = { at: Date.now(), dropped, sparksLost };
  console.log(`[Death] ${char.id} ${dangerous ? '(wilderness)' : '(safe)'} dropped=${JSON.stringify(dropped)} sparksLost=${sparksLost}`);
  return char;
}
function sendBridge(event) {
  if (global.shaddai_bridge && global.shaddai_bridge.post) {
    global.shaddai_bridge.post(event);
  }
}

/* ---------- /spawn ---------- */
router.post('/spawn', (req, res) => {
  try {
    const db = loadDB();
    const id = genId(db);
    const char = {
      id,
      inventory: {},
      stats: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 },
      location: { x: Math.floor(100 / 2), y: Math.floor(100 / 2) },
      hotbar: Array(10).fill(''),
      currency: { sparks: 100 }
    };
    db[id] = char;
    saveDB(db);
    sendBridge({ type: 'character_created', payload: char });
    res.json({ success: true, characterId: id, character: char });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /move ---------- */
router.post('/move', (req, res) => {
  try {
    const { characterId, dx, dy } = req.body;
    if (typeof dx !== 'number' || typeof dy !== 'number') return res.status(400).json({ success: false, error: 'dx,dy must be numbers' });
    const db = loadDB();
    if (!db[characterId]) return res.status(404).json({ success: false, error: 'Character not found' });

    const char = db[characterId];
    const nx = char.location.x + dx;
    const ny = char.location.y + dy;
    // Simple bound check (100x100 grid)
    if (nx < 0 || nx >= 100 || ny < 0 || ny >= 100) return res.json({ success: false, newPos: char.location });
    // Simple obstacle check – block odd‑odd cells
    if (nx % 2 === 1 && ny % 2 === 1) return res.json({ success: false, newPos: char.location });
    char.location = { x: nx, y: ny };
    saveDB(db);
    sendBridge({ type: 'character_moved', payload: char });
    res.json({ success: true, newPos: char.location });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /inventory/add ---------- */
router.post('/inventory/add', (req, res) => {
  try {
    const { characterId, itemId, amount = 1 } = req.body;
    const db = loadDB();
    if (!db[characterId]) return res.status(404).json({ success: false, error: 'Character not found' });
    const char = db[characterId];
    addItemToChar(char, itemId, amount);
    saveDB(db);
    sendBridge({ type: 'inventory_update', payload: char });
    res.json({ success: true, character: char });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /inventory/remove ---------- */
router.post('/inventory/remove', (req, res) => {
  try {
    const { characterId, itemId, amount = 1 } = req.body;
    const db = loadDB();
    if (!db[characterId]) return res.status(404).json({ success: false, error: 'Character not found' });
    const char = db[characterId];
    removeItemFromChar(char, itemId, amount);
    saveDB(db);
    sendBridge({ type: 'inventory_update', payload: char });
    res.json({ success: true, character: char });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /shop ---------- */
const SHOP_CATALOG = {
  sword:   { name: 'Iron Sword',   price: 80,  durability: 120 },
  shield:  { name: 'Wooden Shield', price: 60,  durability: 150 },
  health:  { name: 'Health Potion',price: 30,  stackable: true },
  ore:     { name: 'Iron Ore',     price: 20,  stackable: true },
  wood:    { name: 'Oak Wood',     price: 15,  stackable: true },
  fiber:   { name: 'Fiber Cloth',  price: 12,  stackable: true }
};

router.post('/shop', (req, res) => {
  try {
    const { characterId, itemId } = req.body;
    const db = loadDB();
    if (!db[characterId]) return res.status(404).json({ success: false, error: 'Character not found' });
    const char = db[characterId];
    const item = SHOP_CATALOG[itemId];
    if (!item) return res.status(400).json({ success: false, error: 'Invalid item' });
    if (!char.currency?.sparks || char.currency.sparks < item.price) {
      return res.status(400).json({ success: false, error: 'Insufficient Sparks' });
    }
    char.currency.sparks -= item.price;
    addItemToChar(char, itemId, 1);
    saveDB(db);
    sendBridge({ type: 'shop_purchase', payload: { characterId, itemId } });
    res.json({ success: true, character: char });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /die ---------- */
router.post('/die', (req, res) => {
  try {
    const { characterId, dangerous = false } = req.body;
    const db = loadDB();
    if (!db[characterId]) return res.status(404).json({ success: false, error: 'Character not found' });
    const deathLocation = { ...db[characterId].location };
    const char = handleDeath(db[characterId], !!dangerous);
    saveDB(db);
    const loss = char.lastDeath || {};

    // Dangerous deaths that actually dropped something leave a reclaimable grave
    let graveId = null;
    if (dangerous && Object.keys(loss.dropped || {}).length) {
      const graves = loadGraves();
      graveId = `g${Date.now()}${Math.floor(Math.random() * 1000)}`;
      graves[graveId] = {
        id: graveId,
        characterId,
        location: deathLocation,
        items: loss.dropped,
        createdAt: Date.now(),
        expiresAt: Date.now() + GRAVE_GRACE_MS,
        claimed: false
      };
      saveGraves(graves);
    }

    sendBridge({ type: 'character_died', payload: { characterId, dangerous, dropped: loss.dropped || {}, sparksLost: loss.sparksLost || 0, graveId } });
    res.json({ success: true, message: 'Character dead', dangerous: !!dangerous, dropped: loss.dropped || {}, sparksLost: loss.sparksLost || 0, newPos: char.location, graveId, graveExpiresInMs: graveId ? GRAVE_GRACE_MS : null });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /grave/list ----------
   Returns this character's own unclaimed, unexpired graves. */
router.get('/grave/list', (req, res) => {
  try {
    const { characterId } = req.query;
    const graves = loadGraves();
    const now = Date.now();
    const mine = Object.values(graves).filter(
      g => g.characterId === characterId && !g.claimed && g.expiresAt > now
    );
    res.json({ success: true, graves: mine });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* ---------- /grave/retrieve ----------
   Free reclaim for the owner within the grace window; expired or
   already-claimed graves cannot be retrieved (loot is gone for good —
   the point of the death cost). */
router.post('/grave/retrieve', (req, res) => {
  try {
    const { characterId, graveId } = req.body;
    const graves = loadGraves();
    const grave = graves[graveId];
    if (!grave) return res.status(404).json({ success: false, error: 'Grave not found' });
    if (grave.characterId !== characterId) return res.status(403).json({ success: false, error: 'Not your grave' });
    if (grave.claimed) return res.status(400).json({ success: false, error: 'Already claimed' });
    if (grave.expiresAt <= Date.now()) return res.status(400).json({ success: false, error: 'Grave expired' });

    const db = loadDB();
    if (!db[characterId]) return res.status(404).json({ success: false, error: 'Character not found' });
    const char = db[characterId];
    for (const [itemId, amount] of Object.entries(grave.items)) addItemToChar(char, itemId, amount);
    grave.claimed = true;
    saveDB(db);
    saveGraves(graves);
    sendBridge({ type: 'grave_retrieved', payload: { characterId, graveId, items: grave.items } });
    res.json({ success: true, character: char, retrieved: grave.items });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* --------------------------------------------------------------
   Mount router externally (e.g. in server/index.js):
   const charRoutes = require('./characterServer');
   app.use('/character', charRoutes);
   -------------------------------------------------------------- */
module.exports = router;