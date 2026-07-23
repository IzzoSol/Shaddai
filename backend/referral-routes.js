'use strict';
/**
 * SHADDAI Referral / Reward Flywheel routes.
 *
 *   POST /api/referral/code            — create (or reuse) an agent's referral code   [softAuth]
 *   GET  /api/referral/code/:code      — resolve a referral code (public)
 *   POST /api/referral/event           — record an attribution + settle the reward    [requireAdmin]
 *   GET  /api/referral/stats/:agentId  — per-agent attribution stats (public)
 *   GET  /api/referral/perks/:agentId  — per-agent earned status perks (public)
 *   GET  /api/referral/treasury        — pools + settlements snapshot                 [requireAdmin]
 *
 * SECURITY: the /event endpoint drives real rewards (Sparks/Reputation/Status +
 * a real-money settlement record), so it is admin-only — it is meant to be called
 * by trusted server-side flows (payment webhooks, world/dashboard backends), never
 * exposed raw to browsers. This mirrors the reputation /attest guard.
 *
 * PHASE LINE: /event RECORDS money settlements as 'pending'. No cash-out happens.
 */

const express = require('express');
const router = express.Router();
const json = express.json();

const { ok, fail } = require('./lib/respond');
const { requireAdmin, softAuth } = require('./auth-guard');

const engine = require('./services/reward-engine');
const { ReferralService, ReferralError } = require('./services/referral-service');
const { TreasuryService } = require('./services/treasury-service');
const { StatusPerkService } = require('./services/status-perk-service');
const economy = require('./economy-service').getDefault();
const reputation = require('./services/reputation-service');

// Singletons (dev file stores, or Postgres via env inside economy).
const referral = new ReferralService();
const treasury = new TreasuryService();
const statusPerks = new StatusPerkService();

function errStatus(e) {
  if (e instanceof ReferralError) {
    if (e.code === 'SELF_REFERRAL') return 403;
    if (e.code === 'UNKNOWN_CODE' || e.code === 'VALIDATION') return 400;
  }
  return 500;
}

// ── create / reuse a code ────────────────────────────────────────────────
router.post('/api/referral/code', softAuth, json, async (req, res) => {
  try {
    const { agentId, agentDid, campaignId } = req.body || {};
    // Prefer the authenticated user as owner; fall back to explicit body owner.
    const ownerUserId = (req.user && (req.user.uid || req.user.sub)) || (req.body && req.body.ownerUserId) || null;
    if (!agentId) return fail(res, 400, 'validation', 'agentId required');
    const rec = await referral.createCode({ agentId, ownerUserId, agentDid, campaignId });
    return ok(res, { ok: true, code: rec });
  } catch (e) {
    return fail(res, errStatus(e), 'referral_code_error', e.message);
  }
});

// ── resolve a code (public) ──────────────────────────────────────────────
router.get('/api/referral/code/:code', async (req, res) => {
  const rec = await referral.getCode(req.params.code);
  if (!rec) return fail(res, 404, 'not_found', 'unknown referral code');
  return ok(res, { ok: true, code: rec });
});

// ── record an event + settle rewards (admin / trusted server-side only) ──
router.post('/api/referral/event', requireAdmin, json, async (req, res) => {
  try {
    const { replayed, attribution } = await referral.recordEvent(req.body || {});
    // Only settle NEW attributions — a replay must never pay twice.
    let receipt = null;
    if (!replayed) {
      receipt = await engine.settle(attribution, { economy, reputation, statusPerks, treasury });
    }
    return ok(res, { ok: true, replayed, attribution, receipt });
  } catch (e) {
    return fail(res, errStatus(e), 'referral_event_error', e.message);
  }
});

// ── per-agent stats (public) ─────────────────────────────────────────────
router.get('/api/referral/stats/:agentId', async (req, res) => {
  return ok(res, { ok: true, stats: await referral.statsForAgent(req.params.agentId) });
});

// ── per-agent earned perks (public) ──────────────────────────────────────
router.get('/api/referral/perks/:agentId', async (req, res) => {
  return ok(res, { ok: true, ...(await statusPerks.forAgent(req.params.agentId)) });
});

// ── treasury snapshot (admin) ────────────────────────────────────────────
router.get('/api/referral/treasury', requireAdmin, async (req, res) => {
  return ok(res, {
    ok: true,
    pools: await treasury.getPools(),
    settlements: await treasury.listSettlements(),
  });
});

module.exports = router;
