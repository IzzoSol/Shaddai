'use strict';
/**
 * SHADDAI Referral Service — records WHO referred WHOM to do WHAT.
 *
 * Owns the ReferralAttribution audit trail and the per-agent referral codes.
 * Attribution records are NOT a currency; they are provenance. Rewards are
 * decided by reward-engine and settled through the existing Sparks / Reputation
 * rails plus the treasury settlement ledger.
 *
 * Safety baked in from day one (this is money-adjacent):
 *   - Idempotency: an event carrying an `idempotencyKey` (or a natural dedup key)
 *     can never be recorded — or paid — twice.
 *   - Self-referral block: a promoter's OWNER cannot be the referred user, and an
 *     agent cannot earn off an event attributed to its own owner.
 *   - Validation: event types are whitelisted; codes are normalized.
 *
 * Persistence: atomic JsonStore at backend/data/referrals.json.
 */

const path = require('path');
const crypto = require('crypto');
const { JsonStore } = require('../lib/json-store');
const { REWARD_RULES } = require('./reward-engine');

const VALID_EVENT_TYPES = new Set(Object.keys(REWARD_RULES));

const EMPTY = {
  codes: {},          // CODE -> { code, agentId, ownerUserId, agentDid, campaignId, createdAt }
  attributions: [],   // append-only ReferralAttribution[]
  _seq: 0,
};

class ReferralError extends Error {
  constructor(message, code) { super(message); this.name = 'ReferralError'; this.code = code || 'REFERRAL_ERROR'; }
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

class ReferralService {
  constructor(opts = {}) {
    const file = opts.filePath || path.join(__dirname, '..', 'data', 'referrals.json');
    this.store = opts.store || new JsonStore(file, EMPTY);
  }

  /**
   * Create (or return existing) a referral code for an agent. Codes are stable
   * per (agentId, campaignId) so the same agent+campaign always shares one code.
   */
  async createCode({ agentId, ownerUserId, agentDid, campaignId }) {
    if (!agentId || typeof agentId !== 'string') throw new ReferralError('agentId required', 'VALIDATION');
    return this.store.withLock(async (db) => {
      // Reuse an existing code for this agent+campaign if present.
      const existing = Object.values(db.codes).find(
        (c) => c.agentId === agentId && (c.campaignId || null) === (campaignId || null)
      );
      if (existing) return { ...existing, reused: true };

      // Generate a collision-free short code: <AGENTPREFIX>-<6 hex>.
      let code;
      do {
        const prefix = agentId.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'SHD';
        code = `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      } while (db.codes[code]);

      const rec = {
        code,
        agentId,
        ownerUserId: ownerUserId || null,
        agentDid: agentDid || null,
        campaignId: campaignId || null,
        createdAt: new Date().toISOString(),
      };
      db.codes[code] = rec;
      return { ...rec, reused: false };
    });
  }

  async getCode(code) {
    const db = await this.store.read();
    const rec = db.codes[normalizeCode(code)];
    return rec ? { ...rec } : null;
  }

  /**
   * Record a referral attribution. Idempotent and self-referral-safe.
   *
   * @returns {Promise<{ replayed:boolean, attribution:object }>}
   *   `replayed:true` means the event was already recorded — the CALLER must NOT
   *   re-run reward settlement for it.
   */
  async recordEvent(evt) {
    const {
      code, eventType, referredUserId, referredAgentId,
      sourcePlatform, value, currency, idempotencyKey,
    } = evt || {};

    if (!VALID_EVENT_TYPES.has(eventType)) {
      throw new ReferralError(`unknown eventType '${eventType}'`, 'VALIDATION');
    }
    const norm = normalizeCode(code);
    if (!norm) throw new ReferralError('referral code required', 'VALIDATION');

    return this.store.withLock(async (db) => {
      const codeRec = db.codes[norm];
      if (!codeRec) throw new ReferralError(`unknown referral code '${norm}'`, 'UNKNOWN_CODE');

      // Self-referral block: an agent's owner cannot be the referred user.
      if (referredUserId && codeRec.ownerUserId && referredUserId === codeRec.ownerUserId) {
        throw new ReferralError('self-referral blocked', 'SELF_REFERRAL');
      }

      // Dedup key: explicit idempotencyKey, else a natural key derived from the
      // event so the same signup/purchase can't be attributed twice.
      const dedupKey = idempotencyKey
        ? `idem:${idempotencyKey}`
        : `nat:${norm}:${eventType}:${referredUserId || referredAgentId || 'anon'}`;

      const prior = db.attributions.find((a) => a.dedupKey === dedupKey);
      if (prior) return { replayed: true, attribution: { ...prior } };

      db._seq = (db._seq || 0) + 1;
      const attribution = {
        id: `ref_${Date.now().toString(36)}_${db._seq}`,
        dedupKey,
        referralCode: norm,
        campaignId: codeRec.campaignId || null,
        promoterAgentId: codeRec.agentId,
        promoterOwnerUserId: codeRec.ownerUserId || null,
        promoterAgentDid: codeRec.agentDid || null,
        referredUserId: referredUserId || null,
        referredAgentId: referredAgentId || null,
        sourcePlatform: sourcePlatform || 'unknown',
        eventType,
        value: Number(value) || 0,
        currency: currency === 'USDC' ? 'USDC' : (currency === 'USD' ? 'USD' : null),
        timestamp: new Date().toISOString(),
      };
      db.attributions.push(attribution);
      return { replayed: false, attribution: { ...attribution } };
    });
  }

  /** Per-agent attribution summary — counts by event type + total recorded value. */
  async statsForAgent(agentId) {
    const db = await this.store.read();
    const mine = db.attributions.filter((a) => a.promoterAgentId === agentId);
    const byEvent = {};
    let totalValue = 0;
    for (const a of mine) {
      byEvent[a.eventType] = (byEvent[a.eventType] || 0) + 1;
      totalValue += a.value || 0;
    }
    return { agentId, events: mine.length, byEvent, totalValue };
  }
}

module.exports = { ReferralService, ReferralError, normalizeCode, VALID_EVENT_TYPES };
