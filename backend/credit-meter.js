// ============================================================================
// SHADDAI Credit Meter — outcome/hybrid per-action credit metering.
// ----------------------------------------------------------------------------
// Reads the tunable cost model from data/credit-costs.json and debits the
// billing-service ledger per ACTION (fast_chat, strong_chat, image_generate…),
// instead of per-token. This is the chokepoint route handlers + the brain layer
// call to charge a user for a unit of work.
//
// Rules (approved model):
//   - BYOK (user brought their own API key) → cost 0, never debited, never blocked.
//   - balance < cost (and not BYOK)         → BLOCK, do NOT debit, never go negative.
//   - otherwise                             → debit cost via billing-service.debit().
//   - unknown actionId                      → default cost (defaultActionCredits, 1).
//   - missing user                          → getOrCreateCustomer first.
//
// billing-service.js re-exports debitForAction / getActionCost from here.
// billing-service is required LAZILY (inside the functions) to avoid the
// circular-require load-order problem (billing-service requires this file too).
// ============================================================================
'use strict';

const fs   = require('fs');
const path = require('path');

const COSTS_PATH = path.join(__dirname, 'data', 'credit-costs.json');

// Cached, hot-reloadable cost model. Falls back to safe defaults if the file
// is missing or malformed so metering never crashes the caller.
let _costs = null;
let _costsMtime = 0;

function _loadCosts() {
  try {
    const stat = fs.statSync(COSTS_PATH);
    if (_costs && stat.mtimeMs === _costsMtime) return _costs; // unchanged → cached
    const parsed = JSON.parse(fs.readFileSync(COSTS_PATH, 'utf8'));
    _costs = parsed;
    _costsMtime = stat.mtimeMs;
    return _costs;
  } catch (_) {
    // Safe built-in fallback mirroring credit-costs.json.
    _costs = _costs || {
      actions: {
        fast_chat: { credits: 1 }, strong_chat: { credits: 10 },
        image_generate: { credits: 15 }, image_generate_free: { credits: 0 }, image_generate_fal: { credits: 25 }, workflow_run: { credits: 25 },
        website_build: { credits: 200 }, clip_generate: { credits: 80 },
        video_commercial: { credits: 400 }, voice_tts: { credits: 10 }
      },
      defaultActionCredits: 1
    };
    return _costs;
  }
}

/**
 * getActionCost(actionId) → number of credits for an action.
 * Unknown / missing action → defaultActionCredits (1).
 */
function getActionCost(actionId) {
  const costs = _loadCosts();
  const def = Number.isFinite(costs.defaultActionCredits) ? costs.defaultActionCredits : 1;
  const a = costs.actions && costs.actions[actionId];
  const c = a && Number(a.credits);
  return Number.isFinite(c) && c >= 0 ? c : def;
}

/**
 * debitForAction(userId, actionId, { byok } = {})  → Promise<result>
 *
 * Looks up the credit cost for `actionId` and charges the user's balance.
 *   - byok:true              → { ok:true, charged:0, remaining, byok:true }   (no debit)
 *   - balance < cost         → { ok:false, blocked:true, needed:cost, remaining, reason:'insufficient_credits' }
 *   - otherwise              → { ok:true, charged:cost, remaining }           (debited)
 *
 * Resilient: unknown actionId → default cost 1; missing user → created first.
 * async because getOrCreateCustomer may be async.
 */
async function debitForAction(userId, actionId, { byok = false } = {}) {
  const billing = require('./billing-service'); // lazy — avoids circular load order
  const cost = getActionCost(actionId);

  // Ensure the user has a billing record so we can read a real balance.
  let cust = billing.getCustomer(userId);
  if (!cust) {
    try { cust = await billing.getOrCreateCustomer(userId); } catch (_) { cust = billing.getCustomer(userId); }
  }
  const remaining = cust ? (cust.creditsRemaining || 0) : 0;

  // BYOK → free, never debited, never blocked.
  if (byok) {
    return { ok: true, charged: 0, remaining, byok: true, action: actionId };
  }

  // Insufficient credits → block, do NOT debit, never go negative.
  if (remaining < cost) {
    return {
      ok: false,
      blocked: true,
      needed: cost,
      remaining,
      reason: 'insufficient_credits',
      message: 'Insufficient credits — top up or upgrade to continue.',
      action: actionId
    };
  }

  // Charge it.
  const res = billing.debit(userId, cost, `action:${actionId}`);
  return { ok: true, charged: cost, remaining: res.balance, action: actionId };
}

module.exports = { debitForAction, getActionCost };
