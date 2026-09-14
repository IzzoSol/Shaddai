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

/**
 * requestClip(userId, {matchId,pack,eventType,seatId}, idempotencyKey)
 *   -> { jobId, status, eta, costUsd, sparksCharged, balance, replayed, contract }
 * Throws InsufficientFundsError (caller maps to 402, same as economy-routes.js
 * does), ValidationError for an unfilmable event (400), or an Error with
 * .status=503/502 for Lens/Fal being unavailable -- mirrors lens-routes.js's
 * own error shape exactly so hall/routes.js's catch blocks need no changes.
 */
async function requestClip(userId, event, idempotencyKey) {
  let contract;
  try {
    contract = buildLensContract({
      matchId: event.matchId, pack: event.pack, eventType: event.eventType, seatId: event.seatId,
    });
  } catch (e) {
    e.status = 400; e.code = 'UNFILMABLE_EVENT';
    throw e;
  }

  const spendKey = `lens:${idempotencyKey}:spend`;
  const spendResult = await economy.spend(userId, LENS_COST_SPARKS, 'lens:bj_clip', spendKey);

  const fal = videoProviders.fal;
  if (!fal || !videoProviders.isConfigured('fal')) {
    await economy.grant(userId, LENS_COST_SPARKS, 'lens:bj_clip_refund', `${spendKey}:refund`);
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
    await economy.grant(userId, LENS_COST_SPARKS, 'lens:bj_clip_refund', `${spendKey}:refund`);
    const err = new Error((gen && gen.error) || 'fal did not return a job id');
    err.status = 502; err.code = 'PROVIDER_ERROR'; err.sparksRefunded = true;
    throw err;
  }

  return {
    jobId: gen.jobId, status: gen.status, eta: gen.eta, costUsd: gen.costUsd,
    sparksCharged: LENS_COST_SPARKS, balance: spendResult.balance, replayed: !!spendResult.replayed,
    contract: { EVENT: contract.EVENT, CAST_LOCK: contract.CAST_LOCK, DURATION: contract.DURATION },
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

module.exports = { requestClip, getClipStatus, LENS_COST_SPARKS };
