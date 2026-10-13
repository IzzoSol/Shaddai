'use strict';
const { returns, pearson, pctChange } = require('./indicators');

function alignSeries(basket) {
  const syms = Object.keys(basket);
  if (!syms.length) return { dates: [], closes: {} };
  const maps = Object.fromEntries(syms.map((s) => [s, new Map(basket[s].map((p) => [p.d, p.c]))]));
  const dates = [...maps[syms[0]].keys()].filter((d) => syms.every((s) => maps[s].has(d))).sort();
  const closes = Object.fromEntries(syms.map((s) => [s, dates.map((d) => maps[s].get(d))]));
  return { dates, closes };
}

function matrix(basket) {
  const { closes } = alignSeries(basket);
  const symbols = Object.keys(closes);
  const rets = Object.fromEntries(symbols.map((s) => [s, returns(closes[s])]));
  const values = symbols.map((a) => symbols.map((b) => {
    const r = a === b ? (rets[a].length >= 5 ? 1 : null) : pearson(rets[a], rets[b]);
    return r == null ? null : Math.round(r * 100) / 100;
  }));
  return { symbols, values };
}

function computeRegime(basket) {
  const last5 = (s) => (basket[s] && basket[s].length > 5 ? pctChange(basket[s].map((p) => p.c), 5) : null);
  const spy5d = last5('SPY'), btc5d = last5('BTC');
  let riskOn = null;
  if (spy5d != null && btc5d != null) {
    if (spy5d > 0 && btc5d > 0) riskOn = true; else if (spy5d < 0 && btc5d < 0) riskOn = false;
  }
  const m = matrix({ SPY: basket.SPY || [], BTC: basket.BTC || [] });
  const btcSpyCorr = m.symbols.length === 2 ? m.values[0][1] : null;
  return { riskOn, spy5d, btc5d, btcSpyCorr };
}

function regimeAdjust(signal, regime) {
  if (!regime || regime.riskOn == null || (signal.assetClass !== 'stock' && signal.assetClass !== 'crypto')) return signal;
  const aligned = (regime.riskOn && signal.side === 'buy') || (!regime.riskOn && signal.side === 'sell');
  const c = Math.max(0, Math.min(1, Math.round((signal.confidence + (aligned ? 0.05 : -0.05)) * 100) / 100));
  return { ...signal, confidence: c, rationale: `${signal.rationale} · ${regime.riskOn ? 'risk-on' : 'risk-off'} market` };
}

module.exports = { alignSeries, matrix, computeRegime, regimeAdjust };
