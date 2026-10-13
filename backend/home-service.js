'use strict';
/**
 * SHADDAI Home Service — HUB_HOME_A..F ("home.a".."home.f") tenancy, rent and
 * daily check-in.
 *
 * Money rules (see economy-service.js — the ONLY writer of Sparks tables):
 *   - This module NEVER touches sparks_balance / spark_transactions directly.
 *     Every Sparks movement goes through EconomyService.spend() / .grant()
 *     with a deterministic idempotency key.
 *   - Rent is a SINK (spend). Check-in is a capped SOURCE (grant).
 *   - Sparks are closed-loop and one-way. There is no refund-to-cash, payout
 *     or transfer path here and none may be added.
 *
 * Lifecycle of a home (lights are the ledger):
 *   empty --inhabit(pays today's rent)--> lit
 *   lit   --day passes unpaid----------> rent_due   (grace; still lit)
 *   rent_due --> more than graceDays unpaid --> lapsed (home dims, claimable)
 *   lit/rent_due --payRent--> lit
 *   lapsed: payRent is refused; the home is claimable by anyone (including
 *           the old tenant) via inhabit, which starts a fresh tenancy. Arrears
 *           are NOT carried as debt — Sparks balances never go negative.
 *
 * State is evaluated lazily from the clock (no cron needed). All mutating
 * operations are serialized through one in-process lock so cap checks and
 * tenancy updates can't interleave.
 *
 * Store: MemoryHomeStore (default). A Postgres mirror would use the schema
 * documented in HOME-RACE-SERVICES.md; the interface below is what it must
 * implement.
 */

const {
  getDefault: getDefaultEconomy,
  InsufficientFundsError,
  ValidationError
} = require('./economy-service');

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
class HomeError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'HomeError';
    this.code = code || 'HOME_ERROR';
    this.status = status || 409;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;

// Hub props from the world brief: rent_sparks_per_day 5, agent_capacity 1-3,
// dashboard_id home.<letter>.
const DEFAULT_HOMES = ['a', 'b', 'c', 'd', 'e', 'f'].reduce((acc, l) => {
  acc[`home.${l}`] = {
    hub: `HUB_HOME_${l.toUpperCase()}`,
    rent_sparks_per_day: 5,
    agent_capacity: 3
  };
  return acc;
}, {});

const DEFAULT_CONFIG = {
  graceDays: 2,          // unpaid days tolerated (state rent_due) before lapse
  maxPrepayDays: 7,      // can pay up to today + (maxPrepayDays - 1)
  checkinReward: 3,      // Sparks per daily check-in (kept < rent: sinks >= print)
  checkinDailyCap: 3,    // HARD cap on check-in Sparks minted per user per UTC day
  maxPings: 20           // ring buffer size of dashboard pings per user
};

// ---------------------------------------------------------------------------
// Day helpers (UTC calendar days as 'YYYY-MM-DD')
// ---------------------------------------------------------------------------
function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(day, n) {
  return dayKey(Date.parse(day + 'T00:00:00Z') + n * DAY_MS);
}
function diffDays(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY_MS);
}
function isDayKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
    && dayKey(Date.parse(s + 'T00:00:00Z')) === s;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function assertUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '' || userId.length > 256) {
    throw new ValidationError('userId must be a non-empty string (<=256 chars)');
  }
}
function normalizeAgents(agents, capacity) {
  if (agents == null) return [];
  if (!Array.isArray(agents)) throw new ValidationError('agents must be an array of agent ids');
  const out = [];
  for (const a of agents) {
    if (typeof a !== 'string' || a.trim() === '' || a.length > 64) {
      throw new ValidationError('each agent id must be a non-empty string (<=64 chars)');
    }
    if (!out.includes(a)) out.push(a);
  }
  if (out.length > capacity) {
    throw new HomeError(`home capacity is ${capacity} agent(s)`, 'CAPACITY_EXCEEDED', 409);
  }
  return out;
}

// ===========================================================================
// MEMORY STORE
// Interface (all async):
//   getTenancyByHome(homeId) / getTenancyByUser(userId) -> tenancy | null
//   putTenancy(tenancy) ; deleteTenancy(homeId)
//   getCapUsed(userId, source, day) -> int ; addCapUsed(userId, source, day, n)
//   addPing(userId, ping, max) ; getPings(userId, limit) -> ping[] (newest first)
// ===========================================================================
class MemoryHomeStore {
  constructor() {
    this.tenancies = new Map();   // homeId -> tenancy
    this.caps = new Map();        // `${userId}|${source}|${day}` -> int
    this.pings = new Map();       // userId -> ping[] (newest last)
  }
  _clone(t) {
    return t ? JSON.parse(JSON.stringify(t)) : null;
  }
  async getTenancyByHome(homeId) {
    return this._clone(this.tenancies.get(homeId) || null);
  }
  async getTenancyByUser(userId) {
    for (const t of this.tenancies.values()) if (t.user_id === userId) return this._clone(t);
    return null;
  }
  async listTenancies() {
    return Array.from(this.tenancies.values()).map((t) => this._clone(t));
  }
  async putTenancy(t) {
    this.tenancies.set(t.home_id, this._clone(t));
  }
  async deleteTenancy(homeId) {
    this.tenancies.delete(homeId);
  }
  async getCapUsed(userId, source, day) {
    return this.caps.get(`${userId}|${source}|${day}`) || 0;
  }
  async addCapUsed(userId, source, day, n) {
    const k = `${userId}|${source}|${day}`;
    this.caps.set(k, (this.caps.get(k) || 0) + n);
  }
  async addPing(userId, ping, max) {
    const arr = this.pings.get(userId) || [];
    arr.push({ ...ping });
    while (arr.length > (max || 20)) arr.shift();
    this.pings.set(userId, arr);
  }
  async getPings(userId, limit) {
    const arr = this.pings.get(userId) || [];
    return arr.slice(-(limit || 5)).reverse().map((p) => ({ ...p }));
  }
}

// ===========================================================================
// SERVICE
// ===========================================================================
class HomeService {
  /**
   * @param {object} [opts]
   * @param {object} [opts.economy] EconomyService instance (default singleton)
   * @param {object} [opts.store]   home store (default MemoryHomeStore)
   * @param {function} [opts.now]   clock () => ms (tests inject)
   * @param {object} [opts.homes]   home_id -> { hub, rent_sparks_per_day, agent_capacity }
   * @param {object} [opts.config]  overrides of DEFAULT_CONFIG
   */
  constructor(opts = {}) {
    this.economy = opts.economy || getDefaultEconomy();
    this.store = opts.store || new MemoryHomeStore();
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.config = Object.assign({}, DEFAULT_CONFIG, opts.config || {});
    this.homes = {};
    const homes = opts.homes || DEFAULT_HOMES;
    for (const id of Object.keys(homes)) {
      const h = homes[id];
      const rent = h.rent_sparks_per_day == null ? 5 : h.rent_sparks_per_day;
      const cap = h.agent_capacity == null ? 3 : h.agent_capacity;
      if (!Number.isInteger(rent) || rent <= 0) throw new ValidationError(`${id}: rent_sparks_per_day must be a positive integer`);
      if (!Number.isInteger(cap) || cap < 1 || cap > 3) throw new ValidationError(`${id}: agent_capacity must be 1-3`);
      this.homes[id] = { home_id: id, hub: h.hub || null, rent_sparks_per_day: rent, agent_capacity: cap };
    }
    if (!Number.isInteger(this.config.checkinReward) || this.config.checkinReward <= 0) {
      throw new ValidationError('checkinReward must be a positive integer');
    }
    if (!Number.isInteger(this.config.checkinDailyCap) || this.config.checkinDailyCap < 0) {
      throw new ValidationError('checkinDailyCap must be a non-negative integer');
    }
    this._lock = Promise.resolve();
  }

  // Serialize all mutations (cap check + grant + store write are one unit).
  _serial(fn) {
    const next = this._lock.then(fn, fn);
    this._lock = next.then(() => undefined, () => undefined);
    return next;
  }

  _today() {
    return dayKey(this.now());
  }

  _home(homeId) {
    if (typeof homeId !== 'string' || !this.homes[homeId]) {
      throw new HomeError(`unknown home: ${homeId}`, 'NOT_FOUND', 404);
    }
    return this.homes[homeId];
  }

  // Pure: compute state of a tenancy for `today`.
  _evaluate(t, today) {
    if (!t) return { state: 'empty', overdueDays: 0 };
    const overdue = Math.max(0, diffDays(today, t.paid_through));
    if (overdue === 0) return { state: 'lit', overdueDays: 0 };
    if (overdue <= this.config.graceDays) return { state: 'rent_due', overdueDays: overdue };
    return { state: 'lapsed', overdueDays: overdue };
  }

  async _ping(userId, type, fields) {
    await this.store.addPing(userId, Object.assign({ type, at: new Date(this.now()).toISOString() }, fields), this.config.maxPings);
  }

  // Lazily mark a lapse (emits a single 'lapse' ping per tenancy).
  async _refresh(t, today) {
    if (!t) return null;
    const ev = this._evaluate(t, today);
    if (ev.state === 'lapsed' && !t.lapsed_pinged) {
      t.lapsed_pinged = true;
      await this.store.putTenancy(t);
      await this._ping(t.user_id, 'lapse', { home_id: t.home_id, amount: 0 });
    }
    return ev;
  }

  _rentKey(userId, homeId, day) {
    return `home:rent:${userId}:${homeId}:${day}`;
  }

  // ---------------------------------------------------------------------
  // inhabit — take an empty or lapsed home. Pays today's rent (so the home
  // is lit immediately). A user holds at most one active home.
  // ---------------------------------------------------------------------
  async inhabit(userId, homeId, opts = {}) {
    assertUserId(userId);
    const home = this._home(homeId);
    const agents = normalizeAgents(opts.agents, home.agent_capacity);
    return this._serial(async () => {
      const today = this._today();

      // Already mine and active -> idempotent success (update agents).
      const current = await this.store.getTenancyByHome(homeId);
      const curEv = await this._refresh(current, today);
      if (current && current.user_id === userId && curEv.state !== 'lapsed') {
        if (opts.agents != null) {
          current.agents = agents;
          await this.store.putTenancy(current);
        }
        return { replayed: true, tenancy: current, state: curEv.state };
      }
      if (current && current.user_id !== userId && curEv.state !== 'lapsed') {
        throw new HomeError('home is occupied', 'HOME_OCCUPIED', 409);
      }

      // One active home per user.
      const mine = await this.store.getTenancyByUser(userId);
      if (mine && mine.home_id !== homeId) {
        const ev = await this._refresh(mine, today);
        if (ev.state !== 'lapsed') {
          throw new HomeError(`already inhabiting ${mine.home_id}; vacate it first`, 'ALREADY_HOUSED', 409);
        }
        await this.store.deleteTenancy(mine.home_id); // lapsed old home becomes claimable
      }

      // Pay today's rent first; if it throws (insufficient funds), nothing changes.
      const spend = await this.economy.spend(
        userId, home.rent_sparks_per_day, `home_rent:${homeId}:${today}`,
        this._rentKey(userId, homeId, today), { refId: homeId }
      );

      const tenancy = {
        home_id: homeId,
        user_id: userId,
        agents,
        since: new Date(this.now()).toISOString(),
        paid_through: today,
        stall_sold: 0,
        stall_sale_ids: [],
        checkins: [],
        lapsed_pinged: false
      };
      await this.store.putTenancy(tenancy); // replaces any lapsed tenancy on this home
      // (spend.replayed happens only on vacate + re-inhabit of the same home on
      // the same day: today's rent was already paid, so no second charge.)
      if (!spend.replayed) {
        await this._ping(userId, 'rent', { home_id: homeId, amount: -home.rent_sparks_per_day, day: today });
      }
      return { replayed: false, tenancy, state: 'lit', balance: spend.balance };
    });
  }

  // ---------------------------------------------------------------------
  // setAgents — change who lives here (capacity 1-3 per hub).
  // ---------------------------------------------------------------------
  async setAgents(userId, homeId, agents) {
    assertUserId(userId);
    const home = this._home(homeId);
    const list = normalizeAgents(agents, home.agent_capacity);
    return this._serial(async () => {
      const t = await this._requireActiveTenant(userId, homeId);
      t.agents = list;
      await this.store.putTenancy(t);
      return { tenancy: t };
    });
  }

  async _requireActiveTenant(userId, homeId) {
    const t = await this.store.getTenancyByHome(homeId);
    if (!t || t.user_id !== userId) throw new HomeError('you do not inhabit this home', 'NOT_TENANT', 403);
    const ev = await this._refresh(t, this._today());
    if (ev.state === 'lapsed') throw new HomeError('home has lapsed; inhabit it again', 'HOME_LAPSED', 409);
    return t;
  }

  // ---------------------------------------------------------------------
  // payRent — pay every unpaid day from paid_through+1 up to `throughDay`
  // (default today). Each day is its own spend with key
  // home:rent:<user>:<home>:<day>, so retries never double-charge. Balance is
  // pre-checked for the full amount so a partial payment can't happen on a
  // plain insufficient-funds case.
  // ---------------------------------------------------------------------
  async payRent(userId, homeId, opts = {}) {
    assertUserId(userId);
    const home = this._home(homeId);
    return this._serial(async () => {
      const today = this._today();
      const throughDay = opts.throughDay == null ? today : opts.throughDay;
      if (!isDayKey(throughDay)) throw new ValidationError('throughDay must be YYYY-MM-DD');
      if (diffDays(throughDay, today) < 0) throw new ValidationError('throughDay cannot be in the past');
      if (diffDays(throughDay, today) >= this.config.maxPrepayDays) {
        throw new ValidationError(`can prepay at most ${this.config.maxPrepayDays} days (through ${addDays(today, this.config.maxPrepayDays - 1)})`);
      }

      const t = await this._requireActiveTenant(userId, homeId);
      const days = [];
      for (let d = addDays(t.paid_through, 1); diffDays(throughDay, d) >= 0; d = addDays(d, 1)) days.push(d);
      if (days.length === 0) {
        return { replayed: true, paid_days: [], spent: 0, paid_through: t.paid_through, state: 'lit' };
      }
      const total = days.length * home.rent_sparks_per_day;
      const bal = await this.economy.getBalance(userId);
      if (bal < total) {
        throw new InsufficientFundsError(`Insufficient Sparks: balance ${bal}, rent due ${total}`);
      }
      let balance = bal;
      let spent = 0;
      for (const d of days) {
        const r = await this.economy.spend(
          userId, home.rent_sparks_per_day, `home_rent:${homeId}:${d}`,
          this._rentKey(userId, homeId, d), { refId: homeId }
        );
        balance = r.balance;
        if (!r.replayed) spent += home.rent_sparks_per_day;
        t.paid_through = d;              // advance per successful day
        await this.store.putTenancy(t);
      }
      t.lapsed_pinged = false;
      await this.store.putTenancy(t);
      if (spent > 0) await this._ping(userId, 'rent', { home_id: homeId, amount: -spent, day: today });
      return { replayed: spent === 0, paid_days: days, spent, paid_through: t.paid_through, state: 'lit', balance };
    });
  }

  // ---------------------------------------------------------------------
  // checkIn — daily check-in at your home: a capped SOURCE of Sparks.
  // Requires the home to be lit (today's rent paid). One per user per day,
  // idempotent key home:checkin:<user>:<day>, and minted amount is bounded by
  // checkinDailyCap (hard cap, per user per UTC day, across all homes).
  // ---------------------------------------------------------------------
  async checkIn(userId, homeId) {
    assertUserId(userId);
    this._home(homeId);
    return this._serial(async () => {
      const today = this._today();
      const t = await this._requireActiveTenant(userId, homeId);
      const ev = this._evaluate(t, today);
      if (ev.state !== 'lit') throw new HomeError('pay rent before checking in', 'RENT_DUE', 409);

      if (t.checkins.includes(today)) {
        return { replayed: true, granted: 0, day: today };
      }
      const used = await this.store.getCapUsed(userId, 'home_checkin', today);
      const remaining = Math.max(0, this.config.checkinDailyCap - used);
      const amount = Math.min(this.config.checkinReward, remaining);
      if (amount <= 0) throw new HomeError('daily check-in cap reached', 'DAILY_CAP', 429);

      // Reserve the cap before minting; release it if the grant fails.
      await this.store.addCapUsed(userId, 'home_checkin', today, amount);
      let g;
      try {
        g = await this.economy.grant(userId, amount, `home_checkin:${homeId}:${today}`,
          `home:checkin:${userId}:${today}`, { refId: homeId });
      } catch (e) {
        await this.store.addCapUsed(userId, 'home_checkin', today, -amount);
        throw e;
      }
      if (g.replayed) {
        // Ledger already has it (store lost state) -> don't double count cap.
        await this.store.addCapUsed(userId, 'home_checkin', today, -amount);
      }
      t.checkins = t.checkins.concat([today]).slice(-14);
      await this.store.putTenancy(t);
      if (!g.replayed) await this._ping(userId, 'checkin', { home_id: homeId, amount, day: today });
      return { replayed: g.replayed, granted: g.replayed ? 0 : amount, day: today, balance: g.balance };
    });
  }

  // ---------------------------------------------------------------------
  // recordStallSale — counter only (the sale's Sparks move in bazaar-routes).
  // Server-to-server; idempotent on saleId. Feeds "stall sold N" on the tile.
  // ---------------------------------------------------------------------
  async recordStallSale(userId, homeId, saleId) {
    assertUserId(userId);
    this._home(homeId);
    if (typeof saleId !== 'string' || !saleId.trim() || saleId.length > 256) {
      throw new ValidationError('saleId must be a non-empty string (<=256 chars)');
    }
    return this._serial(async () => {
      const t = await this.store.getTenancyByHome(homeId);
      if (!t || t.user_id !== userId) throw new HomeError('you do not inhabit this home', 'NOT_TENANT', 403);
      if (t.stall_sale_ids.includes(saleId)) return { replayed: true, stall_sold: t.stall_sold };
      t.stall_sale_ids = t.stall_sale_ids.concat([saleId]).slice(-500);
      t.stall_sold += 1;
      await this.store.putTenancy(t);
      await this._ping(userId, 'stall_sale', { home_id: homeId, amount: 0, sale_id: saleId });
      return { replayed: false, stall_sold: t.stall_sold };
    });
  }

  // vacate — leave the home. Rent is a burn: nothing is refunded.
  async vacate(userId, homeId) {
    assertUserId(userId);
    this._home(homeId);
    return this._serial(async () => {
      const t = await this.store.getTenancyByHome(homeId);
      if (!t || t.user_id !== userId) throw new HomeError('you do not inhabit this home', 'NOT_TENANT', 403);
      await this.store.deleteTenancy(homeId);
      await this._ping(userId, 'vacate', { home_id: homeId, amount: 0 });
      return { vacated: true, home_id: homeId };
    });
  }

  // ---------------------------------------------------------------------
  // status — everything the dashboard home tile needs:
  // "lit / rent due / stall sold N / last pings".
  // ---------------------------------------------------------------------
  async status(userId) {
    assertUserId(userId);
    // Serialized: the lazy lapse refresh writes the tenancy.
    return this._serial(() => this._status(userId));
  }

  async _status(userId) {
    const today = this._today();
    const t = await this.store.getTenancyByUser(userId);
    const ev = t ? await this._refresh(t, today) : null; // may emit a lapse ping
    const pings = await this.store.getPings(userId, 5);
    const balance = await this.economy.getBalance(userId);
    if (!t) {
      return { housed: false, state: 'empty', lit: false, balance, last_pings: pings };
    }
    const home = this.homes[t.home_id];
    const lapsed = ev.state === 'lapsed';
    return {
      housed: !lapsed,
      home_id: t.home_id,
      dashboard_id: t.home_id,
      hub: home ? home.hub : null,
      state: ev.state,                             // lit | rent_due | lapsed
      lit: ev.state === 'lit' || ev.state === 'rent_due',
      dims: lapsed,
      rent_sparks_per_day: home ? home.rent_sparks_per_day : null,
      paid_through: t.paid_through,
      overdue_days: ev.overdueDays,
      rent_due: lapsed ? 0 : ev.overdueDays * (home ? home.rent_sparks_per_day : 0),
      grace_days: this.config.graceDays,
      lapses_after: addDays(t.paid_through, this.config.graceDays),
      agents: t.agents,
      agent_capacity: home ? home.agent_capacity : null,
      stall_sold: t.stall_sold,
      checked_in_today: t.checkins.includes(today),
      checkin_reward: this.config.checkinReward,
      balance,
      last_pings: pings
    };
  }

  // Public board of all hubs (for world lights). No user ids exposed.
  async listHomes() {
    const today = this._today();
    const out = [];
    for (const id of Object.keys(this.homes)) {
      const h = this.homes[id];
      const t = await this.store.getTenancyByHome(id);
      const ev = this._evaluate(t, today);
      out.push({
        home_id: id,
        hub: h.hub,
        rent_sparks_per_day: h.rent_sparks_per_day,
        agent_capacity: h.agent_capacity,
        state: ev.state,                              // empty | lit | rent_due | lapsed
        lit: ev.state === 'lit' || ev.state === 'rent_due',
        claimable: ev.state === 'empty' || ev.state === 'lapsed',
        agents_count: t && ev.state !== 'lapsed' ? t.agents.length : 0
      });
    }
    return out;
  }

  // NOTE: intentionally NO refund(), withdraw(), cashOut(), payout(),
  // transfer() — rent is a burn, Sparks are closed-loop and one-way.
}

let _default = null;
function getDefault() {
  if (!_default) _default = new HomeService();
  return _default;
}

module.exports = {
  HomeService,
  MemoryHomeStore,
  HomeError,
  DEFAULT_HOMES,
  DEFAULT_CONFIG,
  dayKey,
  addDays,
  diffDays,
  getDefault
};
