// backend/lib/operatives-routes.js — REST over the unified Operative store.
// Mounted at /api/operatives. Every pillar (Forge/Rooms/Marketplace/Office/
// Collectables) creates & reads operatives here.
const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./operatives');
const router = express.Router();

// ── SELF-HEAL: forged operatives created via POST /api/forge are recorded in forge-state.json.
//    If they're missing from the unified store (e.g. the brain step failed, or stores diverged),
//    import them so forged agents ALWAYS appear in Office / Gallery / Workflows / World. ──
const FORGE_STATE = path.join(__dirname, '..', 'data', 'forge-state.json');
function syncFromForgeState() {
  try {
    const raw = JSON.parse(fs.readFileSync(FORGE_STATE, 'utf8'));
    const list = Array.isArray(raw.operatives) ? raw.operatives : [];
    if (!list.length) return;
    const have = new Set(store.all().map(o => (o.owner || '') + ':' + String(o.codename || '').toUpperCase()));
    for (const o of list) {
      if (!o || !o.codename) continue;
      const key = (o.owner || '') + ':' + String(o.codename).toUpperCase();
      if (have.has(key)) continue;
      have.add(key);
      store.create({
        id: o.id, owner: o.owner || 'demo',
        codename: o.codename,
        archetype: o.archetype || (o.look && o.look.archetype) || null,
        rarity: o.rarity || 'common',
        look: o.look || (o.archetype ? { archetype: o.archetype } : null),
        portrait: o.portrait || o.image || null,
        brain: o.brain, tools: o.tools || [], buildHash: o.buildHash,
      });
    }
  } catch (e) { /* forge-state optional */ }
}

// POST /api/operatives  → create a forged operative (called after /api/forge succeeds)
router.post('/', express.json({ limit: '256kb' }), (req, res) => {
  try {
    const b = req.body || {};
    if (!b.codename) return res.status(400).json({ ok: false, error: 'codename required' });
    const op = store.create(b);

    // Forge → Character: full-body FLUX portrait (fire-and-forget)
    try { require('./char-gen').generateCharForOperative(op).catch(() => {}); } catch (e) {}

    // Forge → Room: auto-create the operative's personal room so they have a home immediately.
    // Keyed as "op_{codename}" so rooms are per-operative, not per-user.
    try {
      const ROOMS_FILE = path.join(__dirname, '..', 'data', 'agent-rooms.json');
      let rooms = {};
      try { rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')); } catch (_) {}
      const roomKey = 'op_' + String(op.codename).toLowerCase().replace(/[^\w]/g, '_');
      if (!rooms[roomKey]) {
        const THEMES = ['neon-loft','command-center','void-observatory','crystal-sanctum','matrix-vault'];
        // Pick a default theme based on archetype
        const archTheme = { vanguard:'command-center', oracle:'void-observatory', nexus:'command-center',
          ghost:'matrix-vault', artisan:'crystal-sanctum', 'gaia-link':'crystal-sanctum',
          psionic:'void-observatory', harvester:'neon-loft' };
        const theme = archTheme[String(op.archetype||'').toLowerCase()] || THEMES[Math.floor(Math.random()*THEMES.length)];
        rooms[roomKey] = {
          owner: roomKey,
          codename: op.codename,
          operativeId: op.id,
          theme,
          build: { slots: {} },
          tools: Array.isArray(op.tools) ? op.tools : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
      }
    } catch (e) { console.warn('[operative-room] auto-create failed:', e.message); }

    res.json({ ok: true, operative: op });
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
});

// GET /api/operatives?owner=foo  → list (all if no owner)
router.get('/', (req, res) => {
  syncFromForgeState();   // ensure forged agents are present before listing
  const owner = req.query.owner;
  res.json({ ok: true, operatives: owner ? store.listByOwner(owner) : store.all() });
});

// GET /api/operatives/:id
router.get('/:id', (req, res) => {
  const op = store.get(req.params.id);
  if (!op) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, operative: op });
});

// DELETE /api/operatives/:id  → remove a forged operative (from World + Forge at once,
// since both read this store). Gated: the operative's owner, a world admin, or the admin token.
let adminGate = null; try { adminGate = require('../admin-routes').canManage; } catch (e) {}
router.delete('/:id', (req, res) => {
  const op = store.get(req.params.id);
  if (!op) return res.status(404).json({ ok: false, error: 'not found' });
  const user = String(req.query.user || req.headers['x-user'] || '');
  const isOwner = user !== '' && (user === op.owner || user === op.creator);
  const isAdmin = adminGate ? adminGate(req.query.world || 'shaddai', user, req.headers['x-admin-token']) : false;
  if (!isOwner && !isAdmin) return res.status(403).json({ ok: false, error: 'only the agent owner or a world admin can remove this agent' });
  const removed = store.remove(req.params.id);
  // keep forge-state.json in sync so a deleted agent doesn't get re-imported by syncFromForgeState
  try {
    const raw = JSON.parse(fs.readFileSync(FORGE_STATE, 'utf8'));
    if (Array.isArray(raw.operatives)) {
      const before = raw.operatives.length;
      raw.operatives = raw.operatives.filter(o => o && o.id !== removed.id && String(o.codename || '').toUpperCase() !== String(removed.codename || '').toUpperCase());
      if (raw.operatives.length !== before) fs.writeFileSync(FORGE_STATE, JSON.stringify(raw, null, 2));
    }
  } catch (e) {}
  res.json({ ok: true, removed: { id: removed.id, codename: removed.codename } });
});

// PATCH /api/operatives/:id  → update look/room/inventory/economy
router.patch('/:id', express.json({ limit: '256kb' }), (req, res) => {
  const op = store.update(req.params.id, req.body || {});
  if (!op) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, operative: op });
});

module.exports = router;
