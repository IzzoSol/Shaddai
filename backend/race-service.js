'use strict';
/**
 * SHADDAI Race Service — heats on TRACK_MAIN (Grid ring road r 1600 m,
 * counter-clockwise), gate `race.gate`, pits `race.pit.01..08`,
 * checkpoints CP_00..CP_07 (every 45 deg, numbered in CCW driving order).
 *
 * Money rules (see economy-service.js — the ONLY writer of Sparks tables):
 *   - Entry fee = SINK (EconomyService.spend, key race:entry:<heat>:<user>).
 *   - Prizes for places 1-3 = grants FUNDED FROM THAT HEAT'S ENTRY POOL.
 *     sum(prizes) <= pool, always: prizeSplitPct must sum to <= 100 and every
 *     prize is floor()ed. Anything not paid out (split remainder, missing
 *     finishers, daily prize cap) stays BURNED. Nothing is ever minted beyond
 *     the entries already sunk into that heat.
 *   - Sparks are closed-loop and one-way. No payout-to-cash / transfer path
 *     exists here and none may be added.
 *
 * Heat lifecycle:  open (entries) --start--> racing (results) --settle--> settled
 *
 * Result validation (server-side, before anything can earn):
 *   - checkpoints must be exactly CP_00, CP_01, ..., CP_07, CP_00 (one lap,
 *     CCW). Missing, skipped, repeated or out-of-order checkpoints -> reject.
 *   - times: integer ms, first == 0 (relative to the gate), strictly
 *     increasing; every 45-deg segment >= minSegmentMs (derived from a hard
 *     speed ceiling) and lap <= maxLapMs.
 *   - a lap can't be reported faster than wall-clock time since the heat
 *     started (you can't finish a 2-minute lap 30 s after the gate opens).
 *
 * All mutations are serialized through one in-process lock.
 */

const {
  getDefault: getDefaultEconomy,
  ValidationError
} = require('./economy-service');

class RaceError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'RaceError';
    this.code = code || 'RACE_ERROR';
    this.status = status || 409;
  }
}

const DAY_MS = 86400000;
const TRACK_RADIUS_M = 1600;
const CHECKPOINTS = ['CP_00', 'CP_01', 'CP_02', 'CP_03', 'CP_04', 'CP_05', 'CP_06', 'CP_07'];
const LAP_SEQUENCE = CHECKPOINTS.concat(['CP_00']);
const PITS = Array.from({ length: 8 }, (_, i) => `race.pit.${String(i + 1).padStart(2, '0')}`);
const SEGMENT_M = (2 * Math.PI * TRACK_RADIUS_M) / CHECKPOINTS.length; // ~1256.6 m

const DEFAULT_CONFIG = {
  defaultEntryFee: 10,
  maxEntryFee: 1000,
  prizeSplitPct: [50, 25, 15],  // sums to 90 -> 10% of every pool always burns
  maxSpeedMps: 150,             // hard ceiling (~540 km/h hover); faster = impossible
  maxLapMs: 30 * 60 * 1000,     // 30 min: slower = abandoned / garbage
  clockSkewMs: 5000,            // tolerance for lap vs time-since-start check
  dailyEntryCap: 10,            // heats a user may enter per UTC day
  dailyPrizeCap: 100,           // prize Sparks a user may receive per UTC day
  maxEntrants: PITS.length
};

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function assertUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '' || userId.length > 256) {
    throw new ValidationError('userId must be a non-empty string (<=256 chars)');
  }
}
function assertHeatId(heatId) {
  if (typeof heatId !== 'string' || !/^[A-Za-z0-9._:-]{1,64}$/.test(heatId)) {
    throw new ValidationError('heatId must match [A-Za-z0-9._:-]{1,64}');
  }
}

// ===========================================================================
// MEMORY STORE
// Interface (all async):
//   getHeat(id) -> heat|null ; putHeat(heat) ; listHeats() -> heat[]
//   getCapUsed(userId, source, day) -> int ; addCapUsed(userId, source, day, n)
// ===========================================================================
class MemoryRaceStore {
  constructor() {
    this.heats = new Map();
    this.caps = new Map();
    this._seq = 0;
  }
  _clone(h) { return h ? JSON.parse(JSON.stringify(h)) : null; }
  async nextHeatId() { this._seq += 1; return `heat-${this._seq}`; }
  async getHeat(id) { return this._clone(this.heats.get(id) || null); }
  async putHeat(h) { this.heats.set(h.heat_id, this._clone(h)); }
  async listHeats() { return Array.from(this.heats.values()).map((h) => this._clone(h)); }
  async getCapUsed(userId, source, day) { return this.caps.get(`${userId}|${source}|${day}`) || 0; }
  async addCapUsed(userId, source, day, n) {
    const k = `${userId}|${source}|${day}`;
    this.caps.set(k, (this.caps.get(k) || 0) + n);
  }
}

// ===========================================================================
// Checkpoint validation (pure; exported for tests and the game client)
// ===========================================================================
function validateLap(checkpoints, config) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
  const minSegmentMs = Math.ceil((SEGMENT_M / cfg.maxSpeedMps) * 1000);
  if (!Array.isArray(checkpoints)) throw new ValidationError('checkpoints must be an array');
  if (checkpoints.length !== LAP_SEQUENCE.length) {
    throw new RaceError(`lap must pass ${LAP_SEQUENCE.length} checkpoints (${LAP_SEQUENCE.join(' -> ')})`, 'BAD_CHECKPOINTS', 422);
  }
  let prevT = null;
  for (let i = 0; i < LAP_SEQUENCE.length; i++) {
    const cp = checkpoints[i];
    if (!cp || typeof cp !== 'object') throw new ValidationError(`checkpoint ${i} must be { id, t }`);
    if (cp.id !== LAP_SEQUENCE[i]) {
      throw new RaceError(`checkpoint ${i} must be ${LAP_SEQUENCE[i]} (got ${String(cp.id)}): skipped or out of order`, 'BAD_CHECKPOINTS', 422);
    }
    if (typeof cp.t !== 'number' || !Number.isInteger(cp.t) || cp.t < 0) {
      throw new ValidationError(`checkpoint ${i} time must be a non-negative integer (ms)`);
    }
    if (i === 0 && cp.t !== 0) throw new RaceError('CP_00 start time must be 0', 'IMPOSSIBLE_TIME', 422);
    if (prevT !== null) {
      const seg = cp.t - prevT;
      if (seg < minSegmentMs) {
        throw new RaceError(`segment ${LAP_SEQUENCE[i - 1]} -> ${LAP_SEQUENCE[i]} in ${seg} ms is impossible (min ${minSegmentMs} ms)`, 'IMPOSSIBLE_TIME', 422);
      }
    }
    prevT = cp.t;
  }
  const lapMs = prevT;
  if (lapMs > cfg.maxLapMs) throw new RaceError(`lap ${lapMs} ms exceeds max ${cfg.maxLapMs} ms`, 'IMPOSSIBLE_TIME', 422);
  return { lapMs, minSegmentMs };
}

// ===========================================================================
// SERVICE
// ===========================================================================
class RaceService {
  /**
   * @param {object} [opts]
   * @param {object} [opts.economy] EconomyService (default singleton)
   * @param {object} [opts.store]   race store (default MemoryRaceStore)
   * @param {function} [opts.now]   clock () => ms
   * @param {object} [opts.config]  overrides of DEFAULT_CONFIG
   */
  constructor(opts = {}) {
    this.economy = opts.economy || getDefaultEconomy();
    this.store = opts.store || new MemoryRaceStore();
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.config = Object.assign({}, DEFAULT_CONFIG, opts.config || {});
    this._assertSplit(this.config.prizeSplitPct);
    this._lock = Promise.resolve();
  }

  _serial(fn) {
    const next = this._lock.then(fn, fn);
    this._lock = next.then(() => undefined, () => undefined);
    return next;
  }

  _assertSplit(split) {
    if (!Array.isArray(split) || split.length < 1 || split.length > 3) {
      throw new ValidationError('prizeSplitPct must list 1-3 places');
    }
    let sum = 0;
    for (const p of split) {
      if (!Number.isInteger(p) || p < 0) throw new ValidationError('prizeSplitPct entries must be non-negative integers');
      sum += p;
    }
    if (sum > 100) throw new ValidationError('prizeSplitPct must sum to <= 100 (prizes can never exceed the entry pool)');
  }

  async _getHeat(heatId) {
    assertHeatId(heatId);
    const h = await this.store.getHeat(heatId);
    if (!h) throw new RaceError(`unknown heat: ${heatId}`, 'NOT_FOUND', 404);
    return h;
  }

  // openHeat (admin / race tower). opts: { heatId?, entryFee?, prizeSplitPct? }
  async openHeat(opts = {}) {
    const entryFee = opts.entryFee == null ? this.config.defaultEntryFee : opts.entryFee;
    if (!Number.isInteger(entryFee) || entryFee <= 0 || entryFee > this.config.maxEntryFee) {
      throw new ValidationError(`entryFee must be an integer 1-${this.config.maxEntryFee}`);
    }
    const split = opts.prizeSplitPct == null ? this.config.prizeSplitPct.slice() : opts.prizeSplitPct;
    this._assertSplit(split);
    return this._serial(async () => {
      const heatId = opts.heatId == null ? await this.store.nextHeatId() : opts.heatId;
      assertHeatId(heatId);
      const existing = await this.store.getHeat(heatId);
      if (existing) return { replayed: true, heat: this._public(existing) };
      const heat = {
        heat_id: heatId,
        gate: 'race.gate',
        state: 'open',
        entry_fee: entryFee,
        prize_split_pct: split.slice(),
        pool: 0,
        paid_out: 0,
        entrants: [],   // { user_id, pit, entered_at }
        results: [],    // { user_id, lap_ms, submitted_at }
        payouts: [],    // { place, user_id, amount, burned }
        opened_at: new Date(this.now()).toISOString(),
        started_at_ms: null,
        settled_at: null
      };
      await this.store.putHeat(heat);
      return { replayed: false, heat: this._public(heat) };
    });
  }

  // enterHeat — pay the entry fee (spend), get a pit. Idempotent per heat+user.
  async enterHeat(userId, heatId) {
    assertUserId(userId);
    assertHeatId(heatId);
    return this._serial(async () => {
      const heat = await this._getHeat(heatId);
      const already = heat.entrants.find((e) => e.user_id === userId);
      if (already) return { replayed: true, pit: already.pit, heat: this._public(heat) };
      if (heat.state !== 'open') throw new RaceError('heat is not open for entries', 'HEAT_CLOSED', 409);
      if (heat.entrants.length >= this.config.maxEntrants) throw new RaceError('heat is full (all pits taken)', 'HEAT_FULL', 409);

      const day = dayKey(this.now());
      const used = await this.store.getCapUsed(userId, 'race_entry', day);
      if (used >= this.config.dailyEntryCap) throw new RaceError('daily race entry cap reached', 'DAILY_CAP', 429);

      // Spend first: insufficient funds throws before any state changes.
      const s = await this.economy.spend(userId, heat.entry_fee, `race_entry:${heatId}`,
        `race:entry:${heatId}:${userId}`, { refId: heatId });

      const taken = new Set(heat.entrants.map((e) => e.pit));
      const pit = PITS.find((p) => !taken.has(p));
      heat.entrants.push({ user_id: userId, pit, entered_at: new Date(this.now()).toISOString() });
      // Pool grows by what actually sank. A ledger replay (store lost state)
      // means the Sparks already sank earlier — still counts toward this pool.
      heat.pool += heat.entry_fee;
      await this.store.putHeat(heat);
      await this.store.addCapUsed(userId, 'race_entry', day, 1);
      return { replayed: false, pit, balance: s.balance, heat: this._public(heat) };
    });
  }

  // startHeat (admin) — gate drops; entries close, results open.
  async startHeat(heatId) {
    return this._serial(async () => {
      const heat = await this._getHeat(heatId);
      if (heat.state === 'racing') return { replayed: true, heat: this._public(heat) };
      if (heat.state !== 'open') throw new RaceError('heat cannot be started', 'BAD_STATE', 409);
      if (heat.entrants.length === 0) throw new RaceError('heat has no entrants', 'NO_ENTRANTS', 409);
      heat.state = 'racing';
      heat.started_at_ms = this.now();
      await this.store.putHeat(heat);
      return { replayed: false, heat: this._public(heat) };
    });
  }

  // submitResult — one validated lap per entrant.
  async submitResult(userId, heatId, checkpoints) {
    assertUserId(userId);
    assertHeatId(heatId);
    return this._serial(async () => {
      const heat = await this._getHeat(heatId);
      if (!heat.entrants.some((e) => e.user_id === userId)) throw new RaceError('not entered in this heat', 'NOT_ENTRANT', 403);
      if (heat.state !== 'racing') throw new RaceError('heat is not racing', 'BAD_STATE', 409);
      const { lapMs } = validateLap(checkpoints, this.config);
      const elapsed = this.now() - heat.started_at_ms;
      if (lapMs > elapsed + this.config.clockSkewMs) {
        throw new RaceError(`lap ${lapMs} ms is longer than time since start (${elapsed} ms)`, 'IMPOSSIBLE_TIME', 422);
      }
      const prior = heat.results.find((r) => r.user_id === userId);
      if (prior) {
        if (prior.lap_ms === lapMs) return { replayed: true, lap_ms: lapMs };
        throw new RaceError('result already submitted', 'RESULT_EXISTS', 409);
      }
      heat.results.push({ user_id: userId, lap_ms: lapMs, submitted_at: new Date(this.now()).toISOString() });
      await this.store.putHeat(heat);
      return { replayed: false, lap_ms: lapMs };
    });
  }

  // settleHeat (admin) — rank by lap time, pay places 1-3 FROM THE POOL.
  async settleHeat(heatId) {
    return this._serial(async () => {
      const heat = await this._getHeat(heatId);
      if (heat.state === 'settled') return { replayed: true, heat: this._public(heat) };
      if (heat.state !== 'racing') throw new RaceError('heat must be racing to settle', 'BAD_STATE', 409);

      // Stable sort: faster lap wins; tie -> earlier submission (insertion order).
      const ranked = heat.results
        .map((r, i) => ({ ...r, i }))
        .sort((a, b) => (a.lap_ms - b.lap_ms) || (a.i - b.i));

      const day = dayKey(this.now());
      let remainingPool = heat.pool;
      heat.payouts = [];
      for (let place = 1; place <= heat.prize_split_pct.length; place++) {
        const winner = ranked[place - 1];
        const nominal = Math.floor((heat.pool * heat.prize_split_pct[place - 1]) / 100);
        if (!winner || nominal <= 0) {
          heat.payouts.push({ place, user_id: winner ? winner.user_id : null, amount: 0, burned: nominal });
          continue;
        }
        const capLeft = Math.max(0, this.config.dailyPrizeCap - (await this.store.getCapUsed(winner.user_id, 'race_prize', day)));
        const amount = Math.min(nominal, capLeft, remainingPool);
        if (amount > 0) {
          const g = await this.economy.grant(winner.user_id, amount, `race_prize:${heatId}:p${place}`,
            `race:prize:${heatId}:${place}`, { refId: heatId });
          if (!g.replayed) await this.store.addCapUsed(winner.user_id, 'race_prize', day, amount);
          remainingPool -= amount;
        }
        heat.payouts.push({ place, user_id: winner.user_id, lap_ms: winner.lap_ms, amount, burned: nominal - amount });
      }
      heat.paid_out = heat.pool - remainingPool;
      if (heat.paid_out > heat.pool) {
        // Unreachable by construction; refuse to record an over-mint.
        throw new RaceError('invariant violated: payouts exceed pool', 'INVARIANT', 500);
      }
      heat.state = 'settled';
      heat.settled_at = new Date(this.now()).toISOString();
      await this.store.putHeat(heat);
      return { replayed: false, heat: this._public(heat) };
    });
  }

  async getHeat(heatId) {
    return this._public(await this._getHeat(heatId));
  }

  async listHeats(filter = {}) {
    const all = await this.store.listHeats();
    return all
      .filter((h) => !filter.state || h.state === filter.state)
      .map((h) => this._public(h));
  }

  _public(h) {
    return {
      heat_id: h.heat_id,
      gate: h.gate,
      state: h.state,
      entry_fee: h.entry_fee,
      prize_split_pct: h.prize_split_pct,
      pool: h.pool,
      paid_out: h.paid_out,
      burned: h.state === 'settled' ? h.pool - h.paid_out : null,
      entrants: h.entrants.map((e) => ({ user_id: e.user_id, pit: e.pit })),
      pits_free: PITS.length - h.entrants.length,
      results: h.results.map((r) => ({ user_id: r.user_id, lap_ms: r.lap_ms })),
      payouts: h.payouts,
      opened_at: h.opened_at,
      started_at: h.started_at_ms == null ? null : new Date(h.started_at_ms).toISOString(),
      settled_at: h.settled_at
    };
  }

  static track() {
    return {
      track: 'TRACK_MAIN',
      radius_m: TRACK_RADIUS_M,
      direction: 'counter-clockwise',
      gate: 'race.gate',
      pits: PITS.slice(),
      lap_sequence: LAP_SEQUENCE.slice(),
      segment_m: Math.round(SEGMENT_M)
    };
  }

  // NOTE: intentionally NO refund-to-cash, withdraw(), cashOut(), transfer().
}

let _default = null;
function getDefault() {
  if (!_default) _default = new RaceService();
  return _default;
}

module.exports = {
  RaceService,
  MemoryRaceStore,
  RaceError,
  validateLap,
  CHECKPOINTS,
  LAP_SEQUENCE,
  PITS,
  DEFAULT_CONFIG,
  getDefault
};
