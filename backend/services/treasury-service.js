'use strict';
/**
 * SHADDAI Treasury Service — the money-settlement LEDGER for real revenue events.
 *
 * Records a RevenueSettlement for every real money event (produced by the reward
 * engine) and accrues per-pool balances: treasury, ownerPayouts, referrer, eco
 * reserve, partner.
 *
 * PHASE LINE — record everything, cash-out nothing (yet):
 *   Settlements are stored with status 'pending' and pools accrue what is OWED.
 *   There is intentionally NO payout / withdraw / transfer method here. Actual
 *   cash movement (Stripe payouts, USDC transfers, refund/fraud windows, tax) is
 *   a separate, later, separately-reviewed sub-project. Keeping cash-out out of
 *   this module makes it impossible for a bug here to send real money anywhere.
 *
 * Amounts are integer CENTS. Idempotent on attributionId (one settlement per
 * attribution) so a replayed event never double-accrues.
 *
 * Persistence: atomic JsonStore at backend/data/treasury.json.
 */

const path = require('path');
const { JsonStore } = require('../lib/json-store');

const POOLS = ['treasury', 'owner', 'referrer', 'eco', 'partner'];

const EMPTY = {
  settlements: [],   // RevenueSettlement[]
  pools: { treasury: 0, owner: 0, referrer: 0, eco: 0, partner: 0 }, // cents accrued (owed)
  ownerPayouts: {},  // ownerUserId -> cents owed (pending)
  _seq: 0,
};

class TreasuryError extends Error {
  constructor(message, code) { super(message); this.name = 'TreasuryError'; this.code = code || 'TREASURY_ERROR'; }
}

function assertCents(n, label) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || !Number.isSafeInteger(n)) {
    throw new TreasuryError(`${label} must be a non-negative integer (cents)`, 'VALIDATION');
  }
}

class TreasuryService {
  constructor(opts = {}) {
    const file = opts.filePath || path.join(__dirname, '..', 'data', 'treasury.json');
    this.store = opts.store || new JsonStore(file, EMPTY);
  }

  /**
   * Record a real-money settlement and accrue pool balances. Idempotent on
   * attributionId. NEVER moves money out — only records what is owed.
   *
   * @param {object} s
   * @param {string} s.attributionId  one settlement per attribution
   * @param {string} s.sourceType     event type (paid_signup, hire, x402_purchase, ...)
   * @param {number} s.grossAmount    integer cents (must equal sum of split)
   * @param {string} s.currency       'USD' | 'USDC'
   * @param {object} s.split          { treasury, owner, referrer, eco, partner } in cents
   * @param {string|null} [s.ownerUserId] owner credited the `owner` pool slice
   * @returns {Promise<object>} the persisted RevenueSettlement
   */
  async recordSettlement(s) {
    if (!s || !s.attributionId) throw new TreasuryError('attributionId required', 'VALIDATION');
    assertCents(s.grossAmount, 'grossAmount');
    const split = s.split || {};
    for (const p of POOLS) assertCents(split[p] || 0, `split.${p}`);

    // Money invariant: the split MUST sum to gross — no cent created or lost.
    const sum = POOLS.reduce((acc, p) => acc + (split[p] || 0), 0);
    if (sum !== s.grossAmount) {
      throw new TreasuryError(`split sum ${sum} != gross ${s.grossAmount}`, 'SPLIT_MISMATCH');
    }

    return this.store.withLock(async (db) => {
      const prior = db.settlements.find((x) => x.attributionId === s.attributionId);
      if (prior) return { ...prior, replayed: true };

      db._seq = (db._seq || 0) + 1;
      const settlement = {
        id: `set_${Date.now().toString(36)}_${db._seq}`,
        attributionId: s.attributionId,
        sourceType: s.sourceType || 'unknown',
        grossAmount: s.grossAmount,
        currency: s.currency === 'USDC' ? 'USDC' : 'USD',
        treasuryAmount: split.treasury || 0,
        ownerPayoutAmount: split.owner || 0,
        referrerAmount: split.referrer || 0,
        ecoReserveAmount: split.eco || 0,
        partnerAmount: split.partner || 0,
        ownerUserId: s.ownerUserId || null,
        status: 'pending',   // record only — NEVER auto-settled to real accounts here
        createdAt: new Date().toISOString(),
        settledAt: null,
      };
      db.settlements.push(settlement);

      // Accrue pool balances (what is OWED, not what is paid).
      db.pools.treasury += settlement.treasuryAmount;
      db.pools.owner    += settlement.ownerPayoutAmount;
      db.pools.referrer += settlement.referrerAmount;
      db.pools.eco      += settlement.ecoReserveAmount;
      db.pools.partner  += settlement.partnerAmount;

      if (settlement.ownerUserId && settlement.ownerPayoutAmount > 0) {
        db.ownerPayouts[settlement.ownerUserId] =
          (db.ownerPayouts[settlement.ownerUserId] || 0) + settlement.ownerPayoutAmount;
      }

      return { ...settlement, replayed: false };
    });
  }

  /** Pool balances snapshot (cents owed per pool) — for the admin treasury dashboard. */
  async getPools() {
    const db = await this.store.read();
    return { ...db.pools };
  }

  /** Pending payout owed to a specific owner (cents). */
  async getOwnerOwed(ownerUserId) {
    const db = await this.store.read();
    return db.ownerPayouts[ownerUserId] || 0;
  }

  /** Full settlement list (admin). */
  async listSettlements() {
    const db = await this.store.read();
    return db.settlements.map((x) => ({ ...x }));
  }

  // NOTE: There is intentionally NO payout(), withdraw(), transfer(), or
  // settleToAccount() method. Cash-out is a separate, later sub-project.
}

module.exports = { TreasuryService, TreasuryError, POOLS };
