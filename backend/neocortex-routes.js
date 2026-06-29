// neocortex-routes.js — HTTP surface for the Neocortex memory + bond system.
//   GET  /api/neocortex/bond     ?agent=&user=            → current bond + level
//   POST /api/neocortex/interact {agent,user,type,content,role,tags} → bump bond (+memory)
//   GET  /api/neocortex/context  ?agent=&user=&q=         → messages array w/ conscious recall
//   GET  /api/neocortex/memory   ?agent=&user=&limit=     → recent memory entries
const express = require('express');
const router = express.Router();
const json = express.json();
const nc = require('./lib/neocortex');

router.get('/api/neocortex/bond', (req, res) => {
  const { agent, user } = req.query;
  res.json({ ok: true, ...nc.getBond(agent, user) });
});

router.post('/api/neocortex/interact', json, (req, res) => {
  const { agent, user, type, content, role, tags } = req.body || {};
  if (!agent || !user) return res.status(400).json({ error: 'agent and user required' });
  const bond = nc.incrementBond(agent, user, type);
  let memCount = null;
  if (content) memCount = nc.addMemory(agent, user, { role, content, tags });
  res.json({ ok: true, bond, ...nc.getBond(agent, user), memCount });
});

router.get('/api/neocortex/context', (req, res) => {
  const { agent, user, q } = req.query;
  res.json({ ok: true, messages: nc.buildAgentContext(agent, user, q) });
});

router.get('/api/neocortex/memory', (req, res) => {
  const { agent, user, limit } = req.query;
  res.json({ ok: true, memory: nc.getRecentMemory(agent, user, limit) });
});

module.exports = router;
