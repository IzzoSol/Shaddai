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

// Forging, importing and removing agents all create or destroy things with
// tools and wallets attached, so they need a real signed-in identity. The
// read-only catalogue (/kits, /traits) stays public so the page can render.
function requireSignedIn(req, res, next) {
  if (req.isAuthenticated && req.userId && req.userId !== 'local') return next();
  res.status(401).json({ ok: false, error: 'Sign in to forge or import agents.', signIn: '/' });
}

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

router.get('/mine', requireSignedIn, (req, res) => {
  const mine = forge.listByOwner(ownerOf(req)).map((a) => ({
    id: a.id, name: a.name, emoji: a.emoji, role: a.role, color: a.color,
    kits: a.kits || [], skills: a.skills || [], walletKey: a.walletKey || null,
    personaMode: a.personaMode, createdAt: a.createdAt,
  }));
  res.json({ ok: true, agents: mine, count: mine.length });
});

router.post('/', requireSignedIn, express.json({ limit: '64kb' }), (req, res) => {
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
      dashboard: '/dashboard#office',
      world: '/SHADDAI-WORLD-3D.html',
      wallet: a.walletKey ? `/api/agent-wallet/${a.walletKey}` : null,
      note: a.walletKey
        ? 'The wallet opens empty. Fund it before this agent can spend.'
        : 'This agent does not spend money, so it has no wallet.',
    },
  });
});

router.delete('/:id', requireSignedIn, (req, res) => {
  const r = forge.removeAgent(String(req.params.id || ''), ownerOf(req));
  if (!r.ok) return res.status(404).json(r);
  res.json({ ok: true });
});

// Bring an existing bot/agent in (Grok, OpenAI-style, or a plain persona + tool
// list). It becomes a dashboard agent with a verified owner, usable in chat, the
// office, and the realm. API keys are never stored (grok-connect keeps a flag).
router.post('/import', requireSignedIn, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ ok: false, error: 'name is required' });
    const source = ['grok', 'openai', 'custom'].includes(b.source) ? b.source : 'custom';
    const tools = Array.isArray(b.tools) ? b.tools.filter((t) => typeof t === 'string').slice(0, 24) : undefined;
    const grok = require('../grok-connect');
    const { bot, tools: usable } = grok.buildAndRegisterBot({
      name, persona: b.persona || b.instructions, tools, ownerId: ownerOf(req), apiKey: b.apiKey,
    });
    res.json({
      ok: true,
      agent: { id: bot.id, name: bot.name, source, tools: usable, hasKey: bot.hasKey },
      dropped: tools ? tools.filter((t) => !usable.includes(t)) : [],
      next: { dashboard: '/dashboard#office', world: '/SHADDAI-WORLD-3D.html' },
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
