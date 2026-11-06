// backend/lib/operatives-routes.js — REST over the unified Operative store.
// Mounted at /api/operatives. Every pillar (Forge/Rooms/Marketplace/Office/
// Collectables) creates & reads operatives here.
const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./operatives');
const { softAuth } = require('../auth-guard');
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
router.post('/', softAuth, express.json({ limit: '256kb' }), (req, res) => {
  try {
    const b = req.body || {};
    if (!b.codename) return res.status(400).json({ ok: false, error: 'codename required' });
    // SECURITY: owner is always the server-verified caller (req.userId from softAuth),
    // never a client-supplied value. store.create() upserts in place when owner+codename
    // match an existing record, so trusting b.owner here would let a POST silently
    // rewrite someone else's operative (bypassing any ownership check added to PATCH).
    // SECURITY (PIKADON 2026-11-05): only the creative fields come from the client. Spreading the whole body let a caller pass
    // `id` (create() writes db.operatives[id] = op, so a known id overwrote someone else's record) or self-set economy/stats/
    // inventory/tokenId/timestamps. Those stay server-owned. NOTE: rarity is still client-sent because forge.html relays the
    // value /api/forge returned; moving that server-side is an open item.
    const ALLOWED = ['codename', 'archetype', 'model', 'rarity', 'look', 'portrait', 'brain', 'tools', 'buildHash', 'room'];
    const clean = {};
    for (const k of ALLOWED) if (b[k] !== undefined) clean[k] = b[k];
    const op = store.create({ ...clean, owner: req.userId || 'local' });

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
// SECURITY: ownership/admin identity comes ONLY from req.userId (set by softAuth from a
// verified session — Firebase token, our own signed JWT, or 'local' when anonymous/dev).
// The old check used req.query.user || req.headers['x-user'], both fully attacker-
// controlled, and GET /api/operatives publicly returns every operative's owner field —
// so an attacker could always supply the exact value needed to pass. Never fall back to
// a client-supplied identity for this check.
router.delete('/:id', softAuth, (req, res) => {
  const op = store.get(req.params.id);
  if (!op) return res.status(404).json({ ok: false, error: 'not found' });
  const user = req.userId || '';
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
// SECURITY: previously had ZERO ownership check — anyone could rewrite any operative's
// rarity/tools/brain/economy stats, or even its owner field. Gated the same way as
// DELETE (owner/creator via req.userId, or a world admin). A non-admin patch may not
// reassign `owner` — only an admin can transfer ownership.
router.patch('/:id', softAuth, express.json({ limit: '256kb' }), (req, res) => {
  const op = store.get(req.params.id);
  if (!op) return res.status(404).json({ ok: false, error: 'not found' });
  const user = req.userId || '';
  const isOwner = user !== '' && (user === op.owner || user === op.creator);
  const isAdmin = adminGate ? adminGate(req.query.world || 'shaddai', user, req.headers['x-admin-token']) : false;
  if (!isOwner && !isAdmin) return res.status(403).json({ ok: false, error: 'only the agent owner or a world admin can modify this agent' });
  const patch = { ...(req.body || {}) };
  if (!isAdmin) delete patch.owner;
  const updated = store.update(req.params.id, patch);
  if (!updated) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, operative: updated });
});

module.exports = router;
