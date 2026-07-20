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
const office = require('./office-service');
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

// ── OFFICE ownership (World → OFFICE → Rooms). One office per user, sign-in-gated. ──
// Your office (the caller's) + the rooms it owns. Guests get a sign-in prompt.
router.get('/api/office', softAuth, (req, res) => {
  if (!req.userId) return res.json({ ok: true, office: null, needSignIn: true });
  const o = office.officeWithRooms(req.userId);
  res.json({ ok: true, office: o ? o.office : null, rooms: o ? o.rooms : [], summary: o ? o.summary : null, canClaim: !o });
});

// A specific user's office (public exterior + rooms honoring visibility).
router.get('/api/office/:userId', (req, res) => {
  const o = office.officeWithRooms(req.params.userId);
  if (!o) return res.status(404).json({ error: 'no office' });
  res.json({ ok: true, ...o });
});

// Claim your one office — SIGN-IN REQUIRED (signed-in is enough for now; verify later).
router.post('/api/office/claim', softAuth, json, (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'sign in to claim your office', needSignIn: true });
  const o = office.claimOffice(req.userId, { name: (req.body && req.body.name), verified: true });
  res.json({ ok: true, office: o, claimed: true });
});

// All offices as city map markers (exteriors) — for placing office buildings in the world.
router.get('/api/city/offices', (req, res) => {
  res.json({ ok: true, region: 'shaddai-city', offices: office.cityOffices() });
});

module.exports = router;
