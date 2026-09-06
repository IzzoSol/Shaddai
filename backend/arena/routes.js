'use strict';
// ============================================================================
// arena/routes.js - REST router for SHADDAI Arena Tier 0.
// GET  /api/arena/rulesets      - list rulesets
// POST /api/arena/bots          - register a bot (BotCard)
// POST /api/arena/queue         - queue two bots for a match, returns matchId
// GET  /api/arena/matches       - in-memory match list
// GET  /api/arena/match/:id     - match status
// GET  /api/arena/replay/:id    - replay JSON from disk
// ============================================================================
const express = require('express');
const router = express.Router();
const mk = require('./matchmaker');
const replays = require('./replays');
const tool = require('./mcp/arena-tools');

router.get('/rulesets', (req, res) => {
  res.json({ rulesets: mk.listRulesets() });
});

router.post('/bots', (req, res) => {
  tool.arena_register_bot(req.body || {}).then(bot => res.json(bot)).catch(e => res.status(400).json({ error: e.message }));
});

router.post('/queue', async (req, res) => {
  const { botA, botB, rulesetId, ticket } = req.body || {};
  if (!botA || !botB || !rulesetId) return res.status(400).json({ error: 'botA, botB, rulesetId required' });
  try {
    const q = mk.queueMatch(botA, botB, rulesetId, ticket);
    const matchId = await mk.processQueue(rulesetId);
    res.json({ queued: q.queued, rulesetId, ticket: q.ticket, matchId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/matches', (req, res) => {
  res.json({ matches: mk.listMatches() });
});

router.get('/match/:id', (req, res) => {
  const m = mk.getMatchStatus(req.params.id);
  if (!m) return res.status(404).json({ error: 'match not found' });
  res.json(m);
});

router.get('/replay/:id', (req, res) => {
  const r = replays.readReplay(req.params.id);
  if (!r) return res.status(404).json({ error: 'replay not found' });
  res.json(r);
});

module.exports = router;
