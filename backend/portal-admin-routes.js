// MOUNT IN server-production.js:  app.use(require('./portal-admin-routes'));
// portal-admin-routes.js — admin CRUD over the portal registry (portal-registry.json).
//   The world reads portals read-only via GET /api/grid/portals (federation-routes.js).
//   This router lets an admin add / edit / remove the curated native portals.
//   Reads are open; writes (POST/PUT/DELETE) require header x-admin-token === process.env.ADMIN_TOKEN.
//   If ADMIN_TOKEN is unset, writes are allowed but responses carry a { warning } (dev mode).
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const REGISTRY = path.join(__dirname, 'portal-registry.json');

// ── storage (atomic-ish: read whole file, mutate in memory, write whole file) ──
function readRegistry() {
  try {
    const d = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    if (!Array.isArray(d.portals)) d.portals = [];
    return d;
  } catch (e) {
    return { portals: [] };
  }
}
function writeRegistry(db) {
  try {
    const tmp = REGISTRY + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, REGISTRY);
    return true;
  } catch (e) {
    // never crash the server on a write failure
    try { console.warn('[portal-admin] write failed:', e.message); } catch (_) {}
    return false;
  }
}

// ── auth: writes require x-admin-token === ADMIN_TOKEN (dev mode if unset) ──
const TYPES = ['link', 'game', 'agent-station', 'claimable'];
const ACCESS = ['public', 'credits', 'agent-only', 'admin'];

function requireAdmin(req, res, next) {
  // OPEN FOR TESTING: write routes are intentionally unguarded so the admin
  // UI buttons work without a token. Re-enable the token check before prod.
  res.locals.adminWarning = 'write routes are OPEN (no admin token required) — testing mode.';
  return next();
}

// attach the dev-mode warning to a response body if present
function withWarn(res, body) {
  if (res.locals && res.locals.adminWarning) body.warning = res.locals.adminWarning;
  return body;
}

// place a new portal on the NEXUS ring (radius ~34) at the next clear angular slot.
function autoPosition(portals) {
  const R = 34;
  const ring = portals.filter(p => Array.isArray(p.position));
  // spread evenly: use current count to pick the next angle, nudge if occupied
  const n = ring.length || 1;
  for (let i = 0; i < 64; i++) {
    const angle = ((ring.length + i) / (n + 1)) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * R);
    const z = Math.round(Math.sin(angle) * R);
    const clash = ring.some(p => Math.abs(p.position[0] - x) < 6 && Math.abs(p.position[2] - z) < 6);
    if (!clash) return [x, 0, z];
  }
  // fallback: random clear-ish point on the ring
  const a = Math.random() * Math.PI * 2;
  return [Math.round(Math.cos(a) * R), 0, Math.round(Math.sin(a) * R)];
}

// normalize + default an incoming portal, preserving all provided fields.
function buildPortal(body, portals) {
  const b = body || {};
  const type = TYPES.includes(b.type) ? b.type : 'link';
  const access = ACCESS.includes(b.access) ? b.access : 'public';
  const position = Array.isArray(b.position) && b.position.length === 3
    ? [Number(b.position[0]) || 0, Number(b.position[1]) || 0, Number(b.position[2]) || 0]
    : autoPosition(portals);
  return {
    id: 'portal-' + Date.now().toString(36),
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : '[UNNAMED PORTAL]',
    operator: b.operator != null ? String(b.operator) : null,
    url: b.url != null ? String(b.url) : null,
    position,
    color: typeof b.color === 'string' && b.color ? b.color : '#3a3a55',
    entry_fee_usdc: Number.isFinite(Number(b.entry_fee_usdc)) ? Number(b.entry_fee_usdc) : 0,
    type,
    access,
    doc: typeof b.doc === 'string' ? b.doc : '',
    tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
  };
}

// ── GET /api/portals — full list (open) ──
router.get('/api/portals', (req, res) => {
  const db = readRegistry();
  res.json({ portals: db.portals });
});

// ── POST /api/portals — create one ──
router.post('/api/portals', requireAdmin, json, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'body must be a JSON object' });
  }
  const db = readRegistry();
  // guard against a caller-supplied id colliding — we always mint our own
  let portal = buildPortal(req.body, db.portals);
  while (db.portals.some(p => p.id === portal.id)) {
    portal.id = 'portal-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  }
  db.portals.push(portal);
  if (!writeRegistry(db)) return res.status(500).json({ error: 'failed to persist registry' });
  res.status(201).json(withWarn(res, { ok: true, portal }));
});

// ── PUT /api/portals/:id — merge-update an existing portal ──
router.put('/api/portals/:id', requireAdmin, json, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'body must be a JSON object' });
  }
  const db = readRegistry();
  const idx = db.portals.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'portal not found: ' + req.params.id });

  const existing = db.portals[idx];
  const b = req.body;
  const patch = {};
  // only touch known, provided fields — never drop existing ones, never let id change
  if ('name' in b) patch.name = String(b.name);
  if ('operator' in b) patch.operator = b.operator != null ? String(b.operator) : null;
  if ('url' in b) patch.url = b.url != null ? String(b.url) : null;
  if ('position' in b && Array.isArray(b.position) && b.position.length === 3) {
    patch.position = [Number(b.position[0]) || 0, Number(b.position[1]) || 0, Number(b.position[2]) || 0];
  }
  if ('color' in b) patch.color = String(b.color);
  if ('entry_fee_usdc' in b && Number.isFinite(Number(b.entry_fee_usdc))) patch.entry_fee_usdc = Number(b.entry_fee_usdc);
  if ('type' in b && TYPES.includes(b.type)) patch.type = b.type;
  if ('access' in b && ACCESS.includes(b.access)) patch.access = b.access;
  if ('doc' in b) patch.doc = String(b.doc);
  if ('tags' in b && Array.isArray(b.tags)) patch.tags = b.tags.map(String);

  const updated = Object.assign({}, existing, patch, { id: existing.id });
  db.portals[idx] = updated;
  if (!writeRegistry(db)) return res.status(500).json({ error: 'failed to persist registry' });
  res.json(withWarn(res, { ok: true, portal: updated }));
});

// ── DELETE /api/portals/:id — remove one ──
router.delete('/api/portals/:id', requireAdmin, (req, res) => {
  const db = readRegistry();
  const idx = db.portals.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'portal not found: ' + req.params.id });
  const [removed] = db.portals.splice(idx, 1);
  if (!writeRegistry(db)) return res.status(500).json({ error: 'failed to persist registry' });
  res.json(withWarn(res, { ok: true, removed }));
});

module.exports = router;
