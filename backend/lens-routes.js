'use strict';
/**
 * SHADDAI LENS routes — express Router factory.
 *
 * Mount example (in server-production.js, NOT edited here):
 *   app.use('/api/lens', require('./lens-routes')());
 *
 * Shaddai-Arcade issue #5: the Hall (a separate deploy) needs to turn a
 * resolved filmable table event (bust/win/blackjack) into a real Fal video
 * clip, gated behind a Sparks charge. This route is the one place that
 * happens, atomically-ish, server-to-server -- same ADMIN_TOKEN gate as
 * economy-routes.js's /spend and /grant (Royale never holds FAL_KEY; it
 * only holds the admin token to call this route).
 *
 * Flow: validate -> spend 15 Sparks (idempotent) -> build the locked LENS
 * contract (backend/lib/lens-rewriter.js -- never receives raw chat) ->
 * fal.generate(). If Fal generation fails after the spend went through, the
 * Sparks are refunded (same idempotency key + ':refund') so a provider 5xx
 * never just eats the user's Sparks.
 *
 * Body: { userId, matchId, pack, eventType, seatId, idempotencyKey }
 * Header: x-admin-token: <ADMIN_TOKEN>
 */

const express = require('express');
const {
  getDefault,
  InsufficientFundsError,
  ValidationError,
} = require('./economy-service');
const { buildLensContract } = require('./lib/lens-rewriter');
const videoProviders = require('./video-providers');

const LENS_COST_SPARKS = 15; // docs/HALL-PHASE1-SPEC.md: spend(seat.sparks_ref, 15, 'lens:bj_clip', idemKey)

function sendError(res, err) {
  if (err instanceof InsufficientFundsError) {
    return res.status(402).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ ok: false, error: err.message, code: err.code });
  }
  // eslint-disable-next-line no-console
  console.error('[lens-routes] unexpected error:', err && err.stack ? err.stack : err);
  return res.status(500).json({ ok: false, error: 'Internal error', code: 'INTERNAL' });
}

function createRouter(serviceOverride) {
  const router = express.Router();
  const svc = serviceOverride || getDefault();

  router.post('/clip', async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_TOKEN;
      if (!adminToken) {
        return res.status(503).json({ ok: false, error: 'Lens disabled (ADMIN_TOKEN not set)', code: 'DISABLED' });
      }
      const provided = req.get('x-admin-token') || (req.body && req.body.adminToken);
      if (provided !== adminToken) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }

      const body = req.body || {};
      const { userId, matchId, pack, eventType, seatId, idempotencyKey } = body;
      if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
        return res.status(400).json({ ok: false, error: 'idempotencyKey required', code: 'VALIDATION' });
      }

      let contract;
      try {
        contract = buildLensContract({ matchId, pack, eventType, seatId });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message, code: 'UNFILMABLE_EVENT' });
      }

      const spendKey = `lens:${idempotencyKey}:spend`;
      const spendResult = await svc.spend(userId, LENS_COST_SPARKS, 'lens:bj_clip', spendKey);

      const fal = videoProviders.fal;
      if (!fal || !videoProviders.isConfigured('fal')) {
        // Fal not configured -- refund immediately, never charge for a clip
        // that can't possibly be produced.
        await svc.grant(userId, LENS_COST_SPARKS, 'lens:bj_clip_refund', `${spendKey}:refund`);
        return res.status(503).json({ ok: false, error: 'FAL_KEY not configured', code: 'DISABLED' });
      }

      let gen;
      try {
        gen = await fal.generate(contract.prompt, { duration: contract.DURATION });
      } catch (e) {
        gen = { status: 'error', error: (e && e.message) || 'fal generation failed' };
      }

      if (!gen || gen.status === 'error' || !gen.jobId) {
        // Fal call failed after Sparks were already spent -- refund so a
        // provider-side failure never silently costs the user Sparks.
        await svc.grant(userId, LENS_COST_SPARKS, 'lens:bj_clip_refund', `${spendKey}:refund`);
        return res.status(502).json({
          ok: false,
          error: (gen && gen.error) || 'fal did not return a job id',
          code: 'PROVIDER_ERROR',
          sparksRefunded: true,
        });
      }

      return res.json({
        ok: true,
        jobId: gen.jobId,
        status: gen.status,
        eta: gen.eta,
        costUsd: gen.costUsd,
        sparksCharged: LENS_COST_SPARKS,
        balance: spendResult.balance,
        replayed: !!spendResult.replayed,
        contract: { EVENT: contract.EVENT, CAST_LOCK: contract.CAST_LOCK, DURATION: contract.DURATION },
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // --- GET /clip/:jobId ----------------------------------------------------
  // Thin passthrough to the fal adapter's getStatus() so a caller doesn't
  // need to know which provider served a given jobId.
  router.get('/clip/:jobId', async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_TOKEN;
      if (!adminToken) {
        return res.status(503).json({ ok: false, error: 'Lens disabled (ADMIN_TOKEN not set)', code: 'DISABLED' });
      }
      if (req.get('x-admin-token') !== adminToken) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
      const fal = videoProviders.fal;
      const status = await fal.getStatus(req.params.jobId);
      return res.json({ ok: true, ...status });
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
module.exports.LENS_COST_SPARKS = LENS_COST_SPARKS;
