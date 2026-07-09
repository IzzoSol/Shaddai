'use strict';
// Agent Battle Arena API. Mounted at /api/battle.
const express = require('express');
const router = express.Router();
const engine = require('./battle-engine');
const json = express.json();

// Available skill files + agents + loadout limit (for the loadout picker UI).
router.get('/skills', (req, res) => res.json({ ok: true, skills: engine.listSkills(), agents: engine.agents(), loadoutMax: engine.LOADOUT_MAX, statKeys: engine.STAT_KEYS }));

// Resolve a build to stats — the SAME numbers the live game will read.  ?agent=NEXUS&skills=sharpshooter,slasher
router.get('/loadout', (req, res) => {
  const skills = String(req.query.skills || '').split(',').map(s => s.trim()).filter(Boolean);
  res.json({ ok: true, agent: req.query.agent || null, ...engine.getLoadoutStats(req.query.agent, skills) });
});

// Simulate a match between two builds; logs the outcome to your data by default.
router.post('/simulate', json, (req, res) => {
  try {
    const { a, b, log = true } = req.body || {};
    if (!a || !b || !a.agent || !b.agent) return res.status(400).json({ ok: false, error: 'need { a:{agent,skills[]}, b:{agent,skills[]} }' });
    const result = engine.simulateMatch(a, b, {});
    if (log) result.match = engine.record(result);
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// Available game modes (for the mode picker + viewer).
router.get('/modes', (req, res) => res.json({ ok: true, modes: engine.listModes() }));

// Watchable event-timeline sim — deterministic replay for the 3D spectator viewer.
// Body: { a, b, aSkills[], bSkills[], mode, seed, speed, maxTicks, stepId }.
// Echoes back the seed so a replay is always reproducible.
router.post('/sim', json, (req, res) => {
  try {
    const body = req.body || {};
    const capSkills = (x) => (Array.isArray(x) ? x : []).slice(0, engine.LOADOUT_MAX).map(String).slice(0, 8);
    const A = { agent: String(body.a || '').slice(0, 40), skills: capSkills(body.aSkills || (body.a && body.a.skills)) };
    const B = { agent: String(body.b || '').slice(0, 40), skills: capSkills(body.bSkills || (body.b && body.b.skills)) };
    if (!A.agent || !B.agent) return res.status(400).json({ ok: false, error: 'need { a, b, aSkills[], bSkills[], mode?, seed? }' });
    const valid = new Set(engine.listModes().map(m => m.id));
    const mode = valid.has(body.mode) ? body.mode : 'hoops';
    let seed = body.seed;
    if (seed != null) { seed = Number(seed); if (!Number.isFinite(seed)) seed = undefined; else seed = seed >>> 0; }
    const maxTicks = Number.isFinite(Number(body.maxTicks)) ? Math.max(1, Math.min(500, Number(body.maxTicks))) : undefined;
    const speed = Number.isFinite(Number(body.speed)) ? Number(body.speed) : undefined;
    const stepId = (body.stepId != null) ? String(body.stepId).slice(0, 64) : undefined;
    const result = engine.simulateTimeline(A, B, { mode, seed, maxTicks, speed, stepId });
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// Why is a skill loadout good/bad for a game? Returns the semantic trait profile,
// the agent's best role for the mode, and per-role aptitudes so the frontend can
// SHOW the user why. ?a=PIKADON&skills=lockdown,iron_lungs&mode=gridiron
router.get('/affinity', (req, res) => {
  try {
    const aff = engine.affinity;
    if (!aff) return res.status(503).json({ ok: false, error: 'affinity engine unavailable' });
    const agent = String(req.query.a || req.query.agent || '').slice(0, 40);
    const skills = String(req.query.skills || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, engine.LOADOUT_MAX);
    const valid = new Set(engine.listModes().map(m => m.id));
    const mode = valid.has(req.query.mode) ? req.query.mode : 'hoops';
    const profile = aff.agentAffinity(skills, agent);
    const aptitudes = aff.roleAptitudes(profile, mode);
    const bestRole = aff.bestRole(profile, mode);
    const statMods = bestRole ? aff.roleStatMods(profile, mode, bestRole) : null;
    res.json({ ok: true, agent: agent || null, mode, skills, tags: aff.TAGS, profile, bestRole, aptitudes, statMods });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// The data learner: which skills/agents actually win across all logged matches.
router.get('/leaderboard', (req, res) => res.json({ ok: true, ...engine.leaderboard() }));

module.exports = router;
