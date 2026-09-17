'use strict';
/**
 * backend/hall/lens-adapter.js — in-process LENS adapter for the Hall
 * (Shaddai-Arcade -> Shaddai merge, 2026-09-14). Replaces the old
 * cross-service hall/lens-client.js (HTTP + SHADDAI_ADMIN_TOKEN), which
 * only existed because Royale used to be a separate PUBLIC repo/deploy
 * (see the ARCADE_SERVICE_TOKEN comment at the top of ../economy-routes.js
 * for the original threat model that no longer applies here). Reuses the
 * exact same pieces backend/lens-routes.js's POST /clip already calls --
 * this is the same logic invoked directly, not a second implementation.
 */
const economy = require('../economy-service').getDefault();
const { buildLensContract } = require('../lib/lens-rewriter');
const videoProviders = require('../video-providers');

const LENS_COST_SPARKS = 15;

// Spending/refunding happens against whichever economy the adapter is bound to.
// Production uses the module default (createHallRouter() with no deps, just
// like server-production.js mounts it). Tests/futures that inject a custom
// economySvc MUST also bind the lens to it via createLens() -- otherwise
// settlements land on the injected store while the lens spend would hit the
// default one (balance 0 → confusing 402). The router does this automatically.
function makeRequestClip(eco) {
  return async function requestClip(userId, event, idempotencyKey) {
    let contract;
    try {
      contract = buildLensContract({
        matchId: event.matchId, pack: event.pack, eventType: event.eventType, seatId: event.seatId,
        agent: event.agent, game: event.game,
      });
    } catch (e) {
      e.status = 400; e.code = 'UNFILMABLE_EVENT';
      throw e;
    }

    const spendKey = `lens:${idempotencyKey}:spend`;
    const spendResult = await eco.spend(userId, LENS_COST_SPARKS, 'lens:bj_clip', spendKey);

    const fal = videoProviders.fal;
    if (!fal || !videoProviders.isConfigured('fal')) {
      await eco.grant(userId, LENS_COST_SPARKS, 'lens:bj_clip_refund', `${spendKey}:refund`);
      const err = new Error('FAL_KEY not configured');
      err.status = 503; err.code = 'DISABLED';
      throw err;
    }

    let gen;
    try {
      gen = await fal.generate(contract.prompt, { duration: contract.DURATION });
    } catch (e) {
      gen = { status: 'error', error: (e && e.message) || 'fal generation failed' };
    }

    if (!gen || gen.status === 'error' || !gen.jobId) {
      await eco.grant(userId, LENS_COST_SPARKS, 'lens:bj_clip_refund', `${spendKey}:refund`);
      const err = new Error((gen && gen.error) || 'fal did not return a job id');
      err.status = 502; err.code = 'PROVIDER_ERROR'; err.sparksRefunded = true;
      throw err;
    }

    return {
      jobId: gen.jobId, status: gen.status, eta: gen.eta, costUsd: gen.costUsd,
      sparksCharged: LENS_COST_SPARKS, balance: spendResult.balance, replayed: !!spendResult.replayed,
      contract: { EVENT: contract.EVENT, CAST_LOCK: contract.CAST_LOCK, DURATION: contract.DURATION },
    };
  };
}

/** getClipStatus(jobId) -> { status, progress, videoUrl, error } */
async function getClipStatus(jobId) {
  const fal = videoProviders.fal;
  if (!fal) {
    const err = new Error('Lens disabled (FAL_KEY not configured)');
    err.status = 503; err.code = 'DISABLED';
    throw err;
  }
  return fal.getStatus(jobId);
}

module.exports = {
  requestClip: makeRequestClip(economy),
  getClipStatus,
  createLens: (opts = {}) => ({ requestClip: makeRequestClip(opts.economy || economy), getClipStatus }),
  LENS_COST_SPARKS,
};
