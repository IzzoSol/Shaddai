// backend/agent-room-routes.js — canonical Agent-Room API (one agent, many surfaces).
//   GET   /api/agent-rooms?owner=   — owner's agents as canonical {agent,room,worldPresence}
//   GET   /api/agent-rooms/:id      — one canonical agent room
//   PATCH /api/agent-rooms/:id      — update room config (owner only)
// Reads are open (the town square + public showrooms need them); writes are owner-guarded.
'use strict';
const express = require('express');
const router = express.Router();
const json = express.json();
const svc = require('./agent-room-service');
const { softAuth } = require('./auth-guard');

router.get('/api/agent-rooms', softAuth, (req, res) => {
  const owner = req.query.owner ? String(req.query.owner) : (req.userId || null);
  res.json({ ok: true, region: 'shaddai-city', district: 'capital-square', rooms: svc.listForOwner(owner) });
});

router.get('/api/agent-rooms/:id', (req, res) => {
  const r = svc.enrich(svc.findOperative(req.params.id));
  if (!r) return res.status(404).json({ error: 'agent not found' });
  res.json({ ok: true, ...r });
});

router.patch('/api/agent-rooms/:id', softAuth, json, (req, res) => {
  const op = svc.findOperative(req.params.id);
  if (!op) return res.status(404).json({ error: 'agent not found' });
  if (!req.userId) return res.status(401).json({ error: 'sign in to edit your room' });
  if (op.owner && req.userId !== op.owner) return res.status(403).json({ error: 'not your agent' });
  res.json({ ok: true, ...svc.updateRoom(req.params.id, req.body || {}) });
});

module.exports = router;
