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

// The data learner: which skills/agents actually win across all logged matches.
router.get('/leaderboard', (req, res) => res.json({ ok: true, ...engine.leaderboard() }));

module.exports = router;
