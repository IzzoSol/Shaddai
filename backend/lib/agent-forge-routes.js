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

// WORLD LINK (2026-11-06): the 3D world's roster (server/agentBodies.js /agent/forge-roster), Rooms, Office and Marketplace read the
// unified Operative store, not custom_agents.json. Without this link a forged or imported agent "existed" on the dashboard but could
// never be stationed in the world. Best-effort + non-fatal (same rule as backend/forge/forge-routes.js): a store hiccup never fails
// the forge. create() upserts by owner+codename, so re-forging the same name updates in place instead of making a ghost duplicate.
let opStore = null; try { opStore = require('./operatives'); } catch (e) { console.warn('[agent-forge] operatives store unavailable:', e && e.message); }
const WORLD_MODELS = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
function linkOperative({ owner, agentId, name, archetype, tools, model, source }) {
  if (!opStore || typeof opStore.create !== 'function' || !owner || !agentId) return null;
  try {
    const codename = String(name || agentId).toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 32) || String(agentId).toUpperCase();
    const m = String(model || '').toUpperCase();
    const op = opStore.create({
      owner, codename, archetype: archetype || source || 'forged', rarity: 'common',
      model: WORLD_MODELS.includes(m) ? m : 'SHADDAI',
      tools: Array.isArray(tools) ? tools.filter((t) => typeof t === 'string').slice(0, 24) : [],
      brain: { tier: 'free', brainId: 'agent:' + agentId, persona: '' },   // the brain IS the forged agent (no persona copy, no keys)
    });
    if (op && (op.agentId !== agentId || op.source !== (source || 'forge'))) opStore.update(op.id, { agentId, source: source || 'forge' });
    return op ? { id: op.id, codename: op.codename, model: op.model } : null;
  } catch (e) { console.warn('[agent-forge] operative link failed (non-fatal):', e && e.message); return null; }
}
function unlinkOperative(owner, agentId) {
  if (!opStore || typeof opStore.all !== 'function') return 0;
  try { const mine = opStore.all().filter((o) => o && o.owner === owner && o.agentId === agentId); mine.forEach((o) => opStore.remove(o.id)); return mine.length; }
  catch (e) { console.warn('[agent-forge] operative unlink failed (non-fatal):', e && e.message); return 0; }
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
  const operative = linkOperative({ owner: ownerOf(req), agentId: a.id, name: a.name, archetype: a.role, tools: a.skills, model: spec.model, source: 'forge' });
  res.json({
    ok: true, operative,
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
  const id = String(req.params.id || '');
  const r = forge.removeAgent(id, ownerOf(req));
  if (!r.ok) return res.status(404).json(r);
  res.json({ ok: true, operativesRemoved: unlinkOperative(ownerOf(req), id) });
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
    const operative = linkOperative({ owner: ownerOf(req), agentId: bot.id, name: bot.name, archetype: source + '-import', tools: usable, source });
    res.json({
      ok: true, operative,
      agent: { id: bot.id, name: bot.name, source, tools: usable, hasKey: bot.hasKey },
      dropped: tools ? tools.filter((t) => !usable.includes(t)) : [],
      next: { dashboard: '/dashboard#office', world: '/SHADDAI-WORLD-3D.html' },
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
