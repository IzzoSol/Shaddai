// backend/reputation-routes.js — Phase 0 #3: DID reputation + Verifiable Credentials.
//   GET  /api/reputation/:did        — score + tier + breakdown
//   GET  /api/reputation/:did/vc     — issue a signed AgentReputationCredential
//   POST /api/reputation/verify {vc} — verify a presented VC
//   POST /api/reputation/attest      — record an attestation (admin/internal)
'use strict';
const express = require('express');
const router = express.Router();
const json = express.json();
const rep = require('./services/reputation-service');
const { requireAdmin } = require('./auth-guard');

router.get('/api/reputation/:did', (req, res) => {
  const did = decodeURIComponent(req.params.did || '');
  if (!did.startsWith('did:')) return res.status(400).json({ error: 'not a DID' });
  const { score, breakdown } = rep.getScore(did);
  res.json({ ok: true, did, score, tier: rep.tierFor(score), breakdown });
});

router.get('/api/reputation/:did/vc', (req, res) => {
  const did = decodeURIComponent(req.params.did || '');
  if (!did.startsWith('did:')) return res.status(400).json({ error: 'not a DID' });
  res.json({ ok: true, vc: rep.issueReputationVC(did) });
});

router.post('/api/reputation/verify', json, (req, res) => {
  res.json({ ok: true, ...rep.verifyReputationVC(req.body && req.body.vc) });
});

router.post('/api/reputation/attest', requireAdmin, json, (req, res) => {
  const { did, type, outcome, metadata } = req.body || {};
  if (!did) return res.status(400).json({ error: 'did required' });
  res.json({ ok: true, attestation: rep.recordAttestation(did, type || 'task_completion', outcome || 'success', metadata || {}) });
});

module.exports = router;
