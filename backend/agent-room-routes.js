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
const fs = require('fs');
const path = require('path');

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

// Preset office looks + visibility options for the office customizer.
// (declared BEFORE /api/office/:userId so 'presets'/'lots' aren't read as a userId)
router.get('/api/office/presets', (req, res) => {
  res.json({ ok: true, presets: office.PRESETS, visibilities: office.VISIBILITIES });
});

// Founders' Row lot map (open vs taken) for the lot picker.
router.get('/api/office/lots', softAuth, (req, res) => {
  res.json({ ok: true, total: office.TOTAL_LOTS, lots: office.lotMap(req.userId) });
});

// Update your office look/identity (name · preset · visibility).
router.patch('/api/office', softAuth, json, (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'sign in first', needSignIn: true });
  const o = office.updateOffice(req.userId, req.body || {});
  if (!o) return res.status(404).json({ error: 'no office — claim one first' });
  res.json({ ok: true, office: o });
});

// Set up at / switch to a different Founders' Row lot (rejects taken lots).
router.post('/api/office/switch-lot', softAuth, json, (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'sign in first', needSignIn: true });
  const r = office.switchLot(req.userId, req.body && req.body.slot);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, office: r.office });
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

// ── 2D WORLD access gate — sign-in OR a beta code (beta-friendly). ──
// Codes come from data/world-beta-codes.json {codes:[...]} and/or env WORLD_BETA_CODES
// (comma-separated). Falls back to a default so the gate works out of the box.
function betaCodes() {
  let codes = [];
  try { codes = (JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'world-beta-codes.json'), 'utf8')).codes || []); } catch (e) {}
  const env = String(process.env.WORLD_BETA_CODES || '').split(',');
  const all = codes.concat(env).map(c => String(c).trim().toUpperCase()).filter(Boolean);
  if (!all.length) all.push('SHADDAI-BETA');
  return all;
}
router.post('/api/world/redeem', json, (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: 'code required' });
  if (betaCodes().includes(code)) return res.json({ ok: true, pass: code });
  return res.status(403).json({ ok: false, error: 'invalid code' });
});

module.exports = router;
