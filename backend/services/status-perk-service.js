'use strict';
/**
 * SHADDAI Status Perk Service — the deferred ledger for the third internal pipe.
 *
 * Records non-currency status rewards an agent earns from the flywheel:
 * visibility-boost, featured-placement, district-badge, room-upgrade. These are
 * RECORDED now; the systems that CONSUME them (world placement, discovery ranking)
 * are later sub-projects. Writing them from day one means those systems have real
 * history to read when they arrive.
 *
 * Persistence: atomic JsonStore at backend/data/status-perks.json.
 */

const path = require('path');
const { JsonStore } = require('../lib/json-store');

const VALID_PERKS = new Set(['visibility-boost', 'featured-placement', 'district-badge', 'room-upgrade']);

const EMPTY = {
  perks: [],     // append-only awarded-perk records
  _seq: 0,
};

class StatusPerkError extends Error {
  constructor(message, code) { super(message); this.name = 'StatusPerkError'; this.code = code || 'STATUS_PERK_ERROR'; }
}

class StatusPerkService {
  constructor(opts = {}) {
    const file = opts.filePath || path.join(__dirname, '..', 'data', 'status-perks.json');
    this.store = opts.store || new JsonStore(file, EMPTY);
  }

  /**
   * Award a status perk to an agent. Idempotent on sourceAttributionId+perkType
   * so a replayed event never double-awards the same perk.
   */
  async award({ agentId, perkType, reason, sourceAttributionId, amount }) {
    if (!agentId) throw new StatusPerkError('agentId required', 'VALIDATION');
    if (!VALID_PERKS.has(perkType)) throw new StatusPerkError(`unknown perkType '${perkType}'`, 'VALIDATION');

    return this.store.withLock(async (db) => {
      const dedup = `${sourceAttributionId || 'na'}:${perkType}`;
      const prior = db.perks.find((p) => p.dedupKey === dedup);
      if (prior) return { ...prior, replayed: true };

      db._seq = (db._seq || 0) + 1;
      const rec = {
        id: `perk_${Date.now().toString(36)}_${db._seq}`,
        dedupKey: dedup,
        agentId,
        perkType,
        amount: Number.isInteger(amount) && amount > 0 ? amount : 1,
        reason: reason || '',
        sourceAttributionId: sourceAttributionId || null,
        createdAt: new Date().toISOString(),
      };
      db.perks.push(rec);
      return { ...rec, replayed: false };
    });
  }

  /** All perks earned by an agent, plus a per-type tally. */
  async forAgent(agentId) {
    const db = await this.store.read();
    const mine = db.perks.filter((p) => p.agentId === agentId);
    const totals = {};
    for (const p of mine) totals[p.perkType] = (totals[p.perkType] || 0) + p.amount;
    return { agentId, perks: mine.map((p) => ({ ...p })), totals };
  }
}

module.exports = { StatusPerkService, StatusPerkError, VALID_PERKS };
