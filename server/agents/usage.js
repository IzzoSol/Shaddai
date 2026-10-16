'use strict';
// AURA middleware = the token saver: budgets + reserve/settle/release (idempotent) + safe read-only cache.
// AURA is NOT a currency here: amounts are USD-equivalent compute cost, kept out of the Sparks ledger.
const crypto = require('crypto');

function makePriceTable(entries, version) {
  // entries: { 'provider/alias': { inPerM, outPerM, dataUse: 'private-ok'|'improves-provider' } }  (USD per million tokens)
  return {
    version: version || 'unversioned',
    get(provider, alias) { return entries[provider + '/' + alias] || null; },
    estimate(provider, alias, inTokens, maxOutTokens) {
      const p = entries[provider + '/' + alias];
      if (!p) return null;
      return (inTokens * p.inPerM + maxOutTokens * p.outPerM) / 1e6;
    },
    actual(provider, alias, usage) {
      const p = entries[provider + '/' + alias];
      if (!p || !usage) return null;
      return ((usage.inputTokens || 0) * p.inPerM + (usage.outputTokens || 0) * p.outPerM) / 1e6;
    },
  };
}

function makeUsage({ limits = {}, now = () => Date.now(), cacheTtlMs = 60000 } = {}) {
  const L = Object.assign({ perRequestUsd: 0.25, perAgentDayUsd: 2, perUserDayUsd: 5, globalDayUsd: 100, emergencyStop: false }, limits);
  const holds = new Map();   // requestId -> { usd, userId, agentId, state }
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const spent = { user: new Map(), agent: new Map(), global: new Map() };
  const bump = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const total = (m, k) => m.get(k) || 0;
  const held = (pred) => [...holds.values()].filter(h => h.state === 'held' && pred(h)).reduce((a, h) => a + h.usd, 0);
  const cache = new Map();

  return {
    limits: L,
    setEmergencyStop(on) { L.emergencyStop = !!on; },
    reserve({ requestId, userId, agentId, estUsd }) {
      if (L.emergencyStop) return { ok: false, code: 'emergency_stop' };
      const prior = holds.get(requestId);
      if (prior) return prior.state === 'held' ? { ok: true, hold: requestId, idempotent: true } : { ok: false, code: 'request_already_' + prior.state };
      if (!(estUsd >= 0)) return { ok: false, code: 'bad_estimate' };
      if (estUsd > L.perRequestUsd) return { ok: false, code: 'over_request_cap' };
      const d = day();
      if (total(spent.agent, agentId + d) + held(h => h.agentId === agentId) + estUsd > L.perAgentDayUsd) return { ok: false, code: 'over_agent_day_cap' };
      if (total(spent.user, userId + d) + held(h => h.userId === userId) + estUsd > L.perUserDayUsd) return { ok: false, code: 'over_user_day_cap' };
      if (total(spent.global, d) + held(() => true) + estUsd > L.globalDayUsd) return { ok: false, code: 'over_global_day_cap' };
      holds.set(requestId, { usd: estUsd, userId, agentId, state: 'held' });
      return { ok: true, hold: requestId };
    },
    settle(requestId, actualUsd) {
      const h = holds.get(requestId);
      if (!h) return { ok: false, code: 'no_hold' };
      if (h.state === 'settled') return { ok: true, idempotent: true };   // retry never double-charges
      if (h.state !== 'held') return { ok: false, code: 'hold_' + h.state };
      const usd = actualUsd == null ? h.usd : Math.max(0, actualUsd);
      h.state = 'settled'; h.actual = usd;
      const d = day();
      bump(spent.user, h.userId + d, usd); bump(spent.agent, h.agentId + d, usd); bump(spent.global, d, usd);
      return { ok: true, usd };
    },
    release(requestId) {                                                    // error or client abort: nothing is charged
      const h = holds.get(requestId);
      if (h && h.state === 'held') h.state = 'released';
      return { ok: true };
    },
    summary(userId) {
      const d = day();
      return { day: d, userUsd: total(spent.user, userId + d), globalUsd: total(spent.global, d),
        heldUsd: held(h => h.userId === userId), limits: Object.assign({}, L) };
    },
    // Read-only, non-personal results only. Key includes user scope, tool name+version and args; never cache writes.
    cacheKey({ userId, tool, version, args }) {
      return crypto.createHash('sha256').update([userId, tool, version || '1', JSON.stringify(args)].join('|')).digest('hex');
    },
    cacheGet(key) { const e = cache.get(key); if (!e) return null; if (now() > e.exp) { cache.delete(key); return null; } return e.value; },
    cacheSet(key, value) { cache.set(key, { value, exp: now() + cacheTtlMs }); },
  };
}
module.exports = { makePriceTable, makeUsage };
