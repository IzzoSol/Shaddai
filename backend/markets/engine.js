'use strict';
const { computeRegime, matrix, regimeAdjust } = require('./correlation');

function createEngine({ adapters, modules, getBasket, now = Date.now, ttlMs = 60000 }) {
  let snap = null, inflight = null, basket = null;

  async function loadBasket() {
    if (basket && now() - basket.at < 3600000) return basket.data;
    try { basket = { at: now(), data: await getBasket() }; } catch (_) { return basket ? basket.data : {}; }
    return basket.data;
  }

  async function snapshot() {
    if (snap && now() - snap.at < ttlMs) return snap.data;
    if (inflight) return inflight;
    inflight = (async () => {
      const settled = await Promise.allSettled(adapters.map((a) => a.fetch()));
      const quotes = [], errors = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') quotes.push(...r.value);
        else errors.push({ adapter: adapters[i].id, error: String(r.reason && r.reason.message || r.reason) });
      });
      const data = { quotes, errors, ts: now() };
      snap = { at: now(), data };
      return data;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  async function signals({ assetClass } = {}) {
    const snapData = await snapshot();
    const { quotes, ts } = snapData, errors = [...snapData.errors]; // copy: module errors must not leak into the cached snapshot
    const regime = computeRegime(await loadBasket());
    let out = [];
    for (const m of modules) {
      try { out.push(...m.run(quotes)); } catch (e) { errors.push({ adapter: 'module:' + m.id, error: e.message }); }
    }
    out = out.map((s) => regimeAdjust(s, regime)).sort((a, b) => b.confidence - a.confidence);
    if (assetClass) out = out.filter((s) => s.assetClass === assetClass);
    return { signals: out, errors, regime, ts };
  }

  async function quotes({ assetClass } = {}) {
    const { quotes: q, errors, ts } = await snapshot();
    return { quotes: assetClass ? q.filter((x) => x.assetClass === assetClass) : q, errors, ts };
  }

  async function correlations() { return matrix(await loadBasket()); }
  async function signalById(id) { return (await signals()).signals.find((s) => s.id === id) || null; }

  return { snapshot, signals, quotes, correlations, signalById };
}
module.exports = { createEngine };
