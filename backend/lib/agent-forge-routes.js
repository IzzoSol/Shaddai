/* ══════════════════════════════════════════════════════════════════════════
   AGENT FORGE API — mounted at /api/agent-forge.

     GET    /kits          what an agent can be given, and what it costs
     GET    /traits        the character options
     GET    /mine          the agents you have forged
     POST   /              forge one, end to end
     DELETE /:id           remove one and everything it created

   OWNERSHIP: every route scopes to the caller's identity from auth-guard, and
   an agent belonging to someone else answers 404 rather than 403 — telling a
   stranger that an id exists is itself a leak.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const express = require('express');
const forge = require('./agent-forge');

const router = express.Router();

/* auth-guard.softAuth verifies a bearer token (Firebase ID token, then our own
   JWT) and puts the result on req.userId / req.isAuthenticated. It never throws
   and never 500s, so it is safe to run in front of every route here. Loaded
   defensively: if the module is missing, every caller is anonymous — the forge
   still works locally rather than the whole route disappearing. */
let softAuth = (req, _res, next) => { req.userId = req.userId || 'local'; next(); };
try { softAuth = require('../auth-guard').softAuth || softAuth; } catch (_) {}

router.use(softAuth);

// 'local' is what softAuth uses for an unverified caller. Keeping that as the
// owner key means a single-user local install works with no sign-in at all,
// while a signed-in user gets their own namespace.
function ownerOf(req) {
  return String((req && req.userId) || 'local');
}

router.get('/kits', (_req, res) => {
  res.json({ ok: true, kits: forge.listKits() });
});

router.get('/traits', (_req, res) => {
  res.json({
    ok: true,
    traits: Object.keys(forge.TRAITS).map((id) => ({ id, effect: forge.TRAITS[id] })),
  });
});

router.get('/mine', (req, res) => {
  const mine = forge.listByOwner(ownerOf(req)).map((a) => ({
    id: a.id, name: a.name, emoji: a.emoji, role: a.role, color: a.color,
    kits: a.kits || [], skills: a.skills || [], walletKey: a.walletKey || null,
    personaMode: a.personaMode, createdAt: a.createdAt,
  }));
  res.json({ ok: true, agents: mine, count: mine.length });
});

router.post('/', express.json({ limit: '64kb' }), (req, res) => {
  const spec = Object.assign({}, req.body || {}, { owner: ownerOf(req) });
  const result = forge.forgeAgent(spec);
  if (!result.ok) return res.status(400).json(result);

  const a = result.agent;
  res.json({
    ok: true,
    agent: {
      id: a.id, name: a.name, emoji: a.emoji, role: a.role, color: a.color,
      kits: a.kits, skills: a.skills, walletKey: a.walletKey,
      personaFile: a.personaFile, personaMode: a.personaMode, createdAt: a.createdAt,
    },
    // What the person can do with it right now, so the UI never has to guess.
    next: {
      hire: `/api/agents/${a.id}`,
      wallet: a.walletKey ? `/api/agent-wallet/${a.walletKey}` : null,
      note: a.walletKey
        ? 'The wallet opens empty. Fund it before this agent can spend.'
        : 'This agent does not spend money, so it has no wallet.',
    },
  });
});

router.delete('/:id', (req, res) => {
  const r = forge.removeAgent(String(req.params.id || ''), ownerOf(req));
  if (!r.ok) return res.status(404).json(r);
  res.json({ ok: true });
});

module.exports = router;
