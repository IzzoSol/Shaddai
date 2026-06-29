// backend/lib/operatives.js — the unified Operative store (single source of truth).
// One record per forged operative: identity + look + portrait + brain + tools +
// room + inventory + economy + stats. Atomic JSON persistence. All five pillars
// (Forge/Rooms/Marketplace/Office/Collectables) read & write through this.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'operatives.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { nextTokenId: 1, operatives: {} }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE); // atomic on same volume
}

// Stats are computed (read-only) from rarity + equipped tools → feeds Games (Pillar F).
const RARITY_BASE = { legendary: 90, epic: 70, rare: 55, common: 40 };
function computeStats(rarity, tools = []) {
  const base = RARITY_BASE[rarity] || 40;
  const t = Array.isArray(tools) ? tools.length : 0;
  // deterministic spread so the same build always yields the same stats
  return {
    speed: Math.min(100, base + ((t * 7) % 11)),
    power: Math.min(100, base + ((t * 5) % 13)),
    iq:    Math.min(100, base + ((t * 9) % 9) + (rarity === 'legendary' ? 5 : 0)),
  };
}

function create(rec = {}) {
  const db = load();
  const tokenId = db.nextTokenId++;
  const id = rec.id || `op_${rec.buildHash || 'x'}_${Date.now()}`;
  const now = Date.now();
  const op = {
    id, tokenId,
    owner: rec.owner || 'anon',
    codename: rec.codename || `OPERATIVE-${tokenId}`,
    archetype: rec.archetype || null,
    rarity: rec.rarity || 'common',
    look: rec.look || null,
    portrait: rec.portrait || null,
    brain: rec.brain || { tier: 'free', brainId: 'ollama-local', persona: '' },
    tools: rec.tools || [],
    room: rec.room || { theme: 'neon-loft', scene: null, wearablesLook: rec.look || null },
    inventory: rec.inventory || { files: [], collectables: [] },
    economy: rec.economy || { auraEarned: 0, creditsSpent: 0, jobsDone: 0, earnings: 0 },
    stats: computeStats(rec.rarity || 'common', rec.tools || []),
    createdAt: now, updatedAt: now,
  };
  db.operatives[id] = op;
  save(db);
  return op;
}

function get(id) { return load().operatives[id] || null; }
function all() { return Object.values(load().operatives); }
function listByOwner(owner) { return all().filter(o => o.owner === owner); }

function update(id, patch = {}) {
  const db = load();
  const op = db.operatives[id];
  if (!op) return null;
  Object.assign(op, patch, { updatedAt: Date.now() });
  if (patch.rarity || patch.tools) op.stats = computeStats(op.rarity, op.tools);
  db.operatives[id] = op;
  save(db);
  return op;
}

function remove(id) {
  const db = load();
  const op = db.operatives[id];
  if (!op) return null;
  delete db.operatives[id];
  save(db);
  // best-effort cleanup of the generated character art
  try {
    const safe = String(op.codename || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (safe) { const fp = path.join(__dirname, '..', 'data', 'forge-art', 'char-' + safe + '.png'); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
  } catch (e) {}
  return op;
}

module.exports = { create, get, all, listByOwner, update, remove, computeStats };
