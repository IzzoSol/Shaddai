// admin-routes.js — appointable admin privileges, per world/portal.
//   A world has one OWNER + a list of ADMINS. The owner (or an existing admin) can
//   appoint/revoke admins. Admins may manage agents within that world/portal.
//   Store: backend/data/admins.json  { worlds: { <worldId>: { owner, admins:[] } } }
//   GET  /api/admin/check?world=&user=     → { owner, isOwner, isAdmin, canManage }
//   GET  /api/admin/list?world=            → { owner, admins }
//   POST /api/admin/appoint {world,user,by} → add admin (by must be owner/admin)
//   POST /api/admin/revoke  {world,user,by} → remove admin (by must be owner/admin)
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const FILE = path.join(__dirname, 'data', 'admins.json');
// the system owner — set OWNER_ID in env for production; defaults to 'owner'.
const SYSTEM_OWNER = process.env.OWNER_ID || 'owner';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { worlds: {} }; } };
const write = (d) => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch (e) {} };

function worldRec(db, world) {
  const w = world || 'shaddai';
  if (!db.worlds[w]) db.worlds[w] = { owner: SYSTEM_OWNER, admins: [] };
  return db.worlds[w];
}

// shared helper — other routes gate destructive actions with this.
function canManage(world, user, headerToken) {
  if (ADMIN_TOKEN && headerToken && headerToken === ADMIN_TOKEN) return true; // master admin token
  const db = read(); const w = worldRec(db, world);
  const u = String(user || '');
  return u !== '' && (u === w.owner || w.admins.includes(u));
}

router.get('/api/admin/check', (req, res) => {
  const db = read(); const w = worldRec(db, req.query.world); write(db);
  const user = String(req.query.user || '');
  const isOwner = user !== '' && user === w.owner;
  const isAdmin = user !== '' && w.admins.includes(user);
  res.json({ ok: true, world: req.query.world || 'shaddai', owner: w.owner, isOwner, isAdmin, canManage: isOwner || isAdmin });
});

router.get('/api/admin/list', (req, res) => {
  const db = read(); const w = worldRec(db, req.query.world); write(db);
  res.json({ ok: true, world: req.query.world || 'shaddai', owner: w.owner, admins: w.admins });
});

router.post('/api/admin/appoint', json, (req, res) => {
  const { world, user, by } = req.body || {};
  if (!user) return res.status(400).json({ ok: false, error: 'user required' });
  if (!canManage(world, by, req.headers['x-admin-token'])) return res.status(403).json({ ok: false, error: 'only the owner or an admin can appoint' });
  const db = read(); const w = worldRec(db, world);
  if (!w.admins.includes(user) && user !== w.owner) w.admins.push(user);
  write(db);
  res.json({ ok: true, world: world || 'shaddai', admins: w.admins });
});

router.post('/api/admin/revoke', json, (req, res) => {
  const { world, user, by } = req.body || {};
  if (!user) return res.status(400).json({ ok: false, error: 'user required' });
  if (!canManage(world, by, req.headers['x-admin-token'])) return res.status(403).json({ ok: false, error: 'only the owner or an admin can revoke' });
  const db = read(); const w = worldRec(db, world);
  w.admins = w.admins.filter(a => a !== user);
  write(db);
  res.json({ ok: true, world: world || 'shaddai', admins: w.admins });
});

// ── Email-verified admin (ADMIN_EMAILS allowlist) — the secure per-login admin ──
const { requireAdminUser, isAdminUser } = require('./auth-guard');

// Non-blocking check the CLIENT uses to decide whether to reveal admin UI. The email is
// verified server-side from the Firebase token — a spoofed client just gets isAdmin:false.
router.get('/api/admin/whoami', async (req, res) => {
  try { res.json({ ok: true, isAdmin: await isAdminUser(req) }); }
  catch (e) { res.json({ ok: true, isAdmin: false }); }
});

// ADMIN: wipe offices (frees Founders' Row lots). Body { userId? } — omit to clear all.
// Enforced server-side by requireAdminUser (verified email OR master token).
router.post('/api/admin/clear-offices', json, requireAdminUser, (req, res) => {
  try {
    const removed = require('./office-service').clearOffices((req.body && req.body.userId) || '');
    res.json({ ok: true, removed });
  } catch (e) { res.status(500).json({ ok: false, error: 'clear failed' }); }
});

module.exports = router;
module.exports.canManage = canManage;
module.exports.SYSTEM_OWNER = SYSTEM_OWNER;
