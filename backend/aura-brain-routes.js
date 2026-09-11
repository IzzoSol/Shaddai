// backend/aura-brain-routes.js — HTTP layer for the AURA BRAIN (boxed knowledge).
// Mounted at /api/aura-brain by server-production.js (with softAuth).
//   GET  /api/aura-brain                  → status (boxes, quota, adapters)
//   GET  /api/aura-brain/boxes            → boxes visible to the caller
//   POST /api/aura-brain/ingest           → {url, box?, title?}  (402 = quota, 403 = PIKADON)
//   GET  /api/aura-brain/search?q=&box=&k → ranked snippets from boxes the caller can read
'use strict';
const express = require('express');
const brain = require('./aura-brain');

// SECURITY — fixed 2026-09-11 (PIKADON audit). This previously read the caller
// straight off the spoofable x-user-id / x-telegram-user-id headers, with no
// verification. Since box read access (canRead) and the daily ingest quota
// are both keyed on this id, anyone could claim any uid to read a stranger's
// private boxes, or burn a stranger's daily ingest quota, just by setting a
// header. Identity now comes from req.userId, set by softAuth (auth-guard.js)
// from a verified Firebase/JWT bearer — or, off-production only, softAuth's
// own x-user-id dev fallback. Raw request headers are never read here.
function caller(req) {
  const uid = typeof req.userId === 'string' ? req.userId : '';
  return (uid && uid !== 'local') ? uid : 'anon';
}

const router = express.Router();

router.get('/', (req, res) => {
  const s = brain.stats();
  return res.json({ ok: true, ...s, quota: brain.quotaLeftFor(caller(req)) });
});

router.get('/boxes', (req, res) => {
  const list = brain.listBoxes(caller(req));
  return res.json({ ok: true, boxes: list, quota: brain.quotaLeftFor(caller(req)) });
});

router.post('/ingest', async (req, res) => {
  const uid = caller(req);
  const { url, box, title } = req.body || {};
  try {
    const result = await brain.ingest({ url, box, ownerId: uid, title });
    return res.json({ ok: true, ...result });
  } catch (e) {
    if (e && e.code === 'QUOTA') {
      return res.status(402).json({ ok: false, error: 'aura_ingest quota used up for today — flip to paid to keep teaching agents.',
        code: 'QUOTA', quota: e.quota, paid: { tool: 'aura_ingest', rail: 'x402/solana-usdc' }, upgrade: '/pricing.html' });
    }
    const msg = String((e && e.message) || e);
    const blocked = /blocked|ssrf|private/i.test(msg);
    return res.status(blocked ? 403 : 400).json({ ok: false, error: msg, code: blocked ? 'BLOCKED' : 'BAD_REQUEST' });
  }
});

router.get('/search', (req, res) => {
  const uid = caller(req);
  const { q, box, k } = req.query || {};
  try {
    const results = brain.search({ q, box, ownerId: uid, k });
    return res.json({ ok: true, query: q || '', box: box || '', results, quota: brain.quotaLeftFor(uid) });
  } catch (e) {
    return res.status(400).json({ ok: false, error: String((e && e.message) || e) });
  }
});

module.exports = router;