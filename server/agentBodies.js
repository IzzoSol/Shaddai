/* server/agentBodies.js — BODY GRANTS: the join between a dashboard-forged agent (Operative) and its body in the game world.
 * Implements docs/FORGE-AGENT-WIRING-20260930.md steps 1-9:  fail loud · real registry (Operative store) · identity from the server · ownership checks ·
 * body grants (reference, not copy) · persisted forge output (archetype/rarity/tools drive yield) · idempotent collect + per-character mutex ·
 * presence + home room · release.
 *
 *   GET    /agent/forge-roster            the CALLER's operatives (never a raw file read)
 *   POST   /agent/claim   {operativeId}   station one of your operatives in the world (one body per operative, max MAX_BODIES per character)
 *   GET    /agent/bodies                  your granted bodies, joined with identity + presence
 *   POST   /agent/shift/:grantId          start a work shift (energy cost)
 *   POST   /agent/collect/:grantId        collect a finished shift (Idempotency-Key header or body.idemKey: replays return the same result, never double-yield)
 *   DELETE /agent/bodies/:grantId         release the body (not while working) - enables the Ward departure arc
 *
 * The world never mints identity: it grants a body to an identity that already exists (operativeId stays the source of truth).
 * Mounted by server/agentServer.js BEFORE the legacy base-role routes; ids that are not grant ids fall through (next()).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const ledger = require('./lib/ledger');
const { readJson, writeJsonAtomic, withLock } = require('./lib/atomic');

const router = express.Router();
const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data');
const BODIES_FILE = path.join(DATA_DIR, 'agent-bodies.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');
const MAX_BODIES = 6, SHIFT_MS = Number(process.env.SHADDAI_SHIFT_MS) || 5 * 60 * 1000, ENERGY = 15, IDEM_KEEP = 20;
const RARITY_BONUS = { common: 0, uncommon: 2, rare: 4, epic: 7, legendary: 12 };

// ── identity: server-verified user only (header is accepted in non-prod like the rest of the MMO server; production uses softAuth's req.userId) ──
function uidOf(req) {
  const fromAuth = String(req.userId || '').trim();
  const isProd = process.env.NODE_ENV === 'production';
  const h = isProd ? '' : String((req.headers && req.headers['x-user-id']) || '').trim();
  const u = fromAuth || h;
  return (!u || u.length > 128 || u === 'local') ? '' : u;
}
function operativeStore() {
  try { return require('../backend/lib/operatives'); }
  catch (e) { const err = new Error('operative store unreachable: ' + e.message); err.code = 'REGISTRY_DOWN'; throw err; }
}
function bodies() { return readJson(BODIES_FILE, {}); }
function saveBodies(db) { writeJsonAtomic(BODIES_FILE, db); }
function chars() { return readJson(CHARS_FILE, {}); }
function charOfUser(uid) { const db = chars(); return Object.values(db).find(c => c.userId === uid) || null; }
// production users never hit /character/spawn: give them a minimal character record on first claim (energy for shifts; Sparks live in the ledger)
function ensureChar(uid) { let c = charOfUser(uid); if (c) return c; const db = chars(), id = 'char_' + require('crypto').createHash('sha1').update(uid).digest('hex').slice(0, 10); c = db[id] = { id, userId: uid, inventory: {}, stats: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 }, currency: { sparks: 0 } }; writeJsonAtomic(CHARS_FILE, db); return c; }
function slug(s) { return String(s || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24); }

// yield is derived SERVER-SIDE from what the forge produced (the old literal {sparks:12} threw archetype/rarity/tools away)
function yieldFor(grant) {
  const tools = Array.isArray(grant.tools) ? grant.tools.length : 0, base = 8 + (RARITY_BONUS[grant.rarity] || 0) + Math.min(tools, 6) * 2;
  return { sparks: base };
}
function levelOf(w) { return 1 + Math.floor(((w && w.shifts) || 0) / 3); }
function presenceOf(g) { return (g.workState && g.workState.shiftEndAt > Date.now()) ? 'working' : 'home'; }
function view(g, op) {
  return { grantId: g.grantId, operativeId: g.operativeId, characterId: g.characterId, claimedAt: g.claimedAt, archetype: g.archetype, rarity: g.rarity, tools: g.tools, roomKey: g.roomKey,
    presence: presenceOf(g), level: levelOf(g.workState), workState: g.workState, yieldPerShift: yieldFor(g),
    identity: op ? { codename: op.codename, model: op.model, portrait: op.portrait || null, kind: op.kind || 'forged', provider: op.provider || null, wallet: op.wallet ? { chain: op.wallet.chain, address: op.wallet.address } : null } : null };
}
function fail(res, code, msg, extra) { return res.status(code).json(Object.assign({ success: false, error: msg }, extra || {})); }
function guard(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); }
    catch (e) { console.error('[agentBodies]', e && e.stack || e); if (e && e.code === 'REGISTRY_DOWN') return fail(res, 503, e.message, { cause: 'registry' }); fail(res, 500, e && e.message || 'error'); }
  };
}

router.get('/forge-roster', guard(async (req, res) => {
  const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in to see your forged agents');
  const store = operativeStore(), list = store.listByOwner(uid);
  console.log('[agent] forge-roster: ' + list.length + ' operatives for ' + uid + ' (unified Operative store)');
  const taken = new Set(Object.values(bodies()).map(g => g.operativeId));
  res.json({ success: true, agents: list.map(o => ({ operativeId: o.id, id: o.id, codename: o.codename, name: o.codename, archetype: o.archetype, rarity: o.rarity, tools: o.tools || [], model: o.model, portrait: o.portrait || null, kind: o.kind || 'forged', provider: o.provider || null, stationed: taken.has(o.id) })) });
}));

router.post('/claim', guard(async (req, res) => {
  const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first');
  const operativeId = String((req.body && req.body.operativeId) || '').trim(); if (!operativeId) return fail(res, 400, 'operativeId required');
  const ch = ensureChar(uid);
  const store = operativeStore(), op = store.get(operativeId);
  if (!op) return fail(res, 404, 'operative not found');
  if (op.owner !== uid) return fail(res, 403, 'that operative is not yours');   // ownership check against the Operative store
  return withLock('char:' + ch.id, async () => {
    const db = bodies();
    if (Object.values(db).some(g => g.operativeId === operativeId)) return fail(res, 409, 'already stationed');
    if (Object.values(db).filter(g => g.characterId === ch.id).length >= MAX_BODIES) return fail(res, 400, 'max ' + MAX_BODIES + ' bodies per character');
    const grantId = 'grant_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const grant = { grantId, operativeId, characterId: ch.id, claimedAt: new Date().toISOString(), archetype: op.archetype || null, rarity: op.rarity || 'common', tools: (op.tools || []).slice(0, 12),
      roomKey: (op.room && op.room.key) || ('op_' + slug(op.codename)), workState: { shiftEndAt: 0, shifts: 0, source: null }, idem: {} };
    db[grantId] = grant; saveBodies(db);
    res.json({ success: true, grant: view(grant, op) });
  });
}));

router.get('/bodies', guard(async (req, res) => {
  const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first');
  const ch = charOfUser(uid); if (!ch) return res.json({ success: true, bodies: [] });
  const store = operativeStore();
  res.json({ success: true, bodies: Object.values(bodies()).filter(g => g.characterId === ch.id).map(g => view(g, store.get(g.operativeId))) });
}));

function grantRoute(handler) {
  return guard(async (req, res, next) => {
    const id = req.params.grantId; if (!/^grant_/.test(id)) return next();   // legacy base-role keys fall through
    const uid = uidOf(req); if (!uid) return fail(res, 401, 'sign in first');
    const ch = charOfUser(uid); if (!ch) return fail(res, 404, 'character not found');
    return withLock('char:' + ch.id, async () => {
      const db = bodies(), g = db[id];
      if (!g) return fail(res, 404, 'body not found'); if (g.characterId !== ch.id) return fail(res, 403, 'not your body');
      return handler(req, res, { db, g, ch, uid });
    });
  });
}

router.post('/shift/:grantId', grantRoute(async (req, res, { db, g, ch }) => {
  if (Date.now() < (g.workState.shiftEndAt || 0)) return fail(res, 409, 'still working');
  const cdb = chars(), c = cdb[ch.id]; c.stats = c.stats || { energy: 100, maxEnergy: 100 };
  if (c.stats.energy < ENERGY) return fail(res, 400, 'not enough energy');
  c.stats.energy -= ENERGY; writeJsonAtomic(CHARS_FILE, cdb);
  g.workState.shiftEndAt = Date.now() + SHIFT_MS; g.workState.source = 'player'; db[g.grantId] = g; saveBodies(db);
  res.json({ success: true, grantId: g.grantId, endsAt: g.workState.shiftEndAt, presence: 'working' });
}));

router.post('/collect/:grantId', grantRoute(async (req, res, { db, g, ch, uid }) => {
  const idem = String(req.headers['idempotency-key'] || (req.body && req.body.idemKey) || '').trim().slice(0, 64);
  g.idem = g.idem || {};
  if (idem && g.idem[idem]) return res.json(Object.assign({ replay: true }, g.idem[idem]));   // never double-yield
  if (!g.workState.shiftEndAt) return fail(res, 400, 'not working');
  if (Date.now() < g.workState.shiftEndAt) return fail(res, 400, 'shift not finished');
  const level = levelOf(g.workState), y = yieldFor(g), gained = { sparks: y.sparks * level };
  const paid = await ledger.credit(uid, gained.sparks, 'agent-yield', g.grantId, 'collect:' + g.grantId + ':' + (g.workState.shifts || 0)); if (!paid.ok) return fail(res, 502, paid.why || 'ledger unavailable');   // idempotent per shift even if the ledger retries
  g.workState.shiftEndAt = 0; g.workState.shifts = (g.workState.shifts || 0) + 1;
  const result = { success: true, gained, level, newLevel: levelOf(g.workState), sparks: paid.balance };
  if (idem) { g.idem[idem] = result; const ks = Object.keys(g.idem); if (ks.length > IDEM_KEEP) delete g.idem[ks[0]]; }
  db[g.grantId] = g; saveBodies(db); res.json(result);
}));

router.delete('/bodies/:grantId', grantRoute(async (req, res, { db, g }) => {
  if (Date.now() < (g.workState.shiftEndAt || 0)) return fail(res, 409, 'finish the shift first');
  delete db[g.grantId]; saveBodies(db); res.json({ success: true, released: g.grantId, operativeId: g.operativeId });
}));

module.exports = router;
module.exports._test = { yieldFor, levelOf, BODIES_FILE };
