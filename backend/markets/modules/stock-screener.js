'use strict';
// Trend + RSI screener — idea adapted from zc6503204-collab/stock-strategy-dashboard (MIT).
const { sma, rsi, pctChange } = require('../indicators');
const { makeSignal } = require('../signal');

module.exports = {
  id: 'stock-screener',
  source: 'stock-strategy-dashboard',
  assetClasses: ['stock'],
  run(quotes) {
    const out = [];
    for (const q of quotes) {
      if (q.assetClass !== 'stock' || !Array.isArray(q.closes) || q.closes.length < 21) continue;
      const s20 = sma(q.closes, 20), r = rsi(q.closes, 14), ret5 = pctChange(q.closes, 5);
      if (s20 == null || r == null || ret5 == null) continue;
      const base = { moduleId: this.id, symbol: q.symbol, name: q.name, assetClass: 'stock', entry: q.price };
      if (q.price > s20 && r >= 50 && r <= 70 && ret5 > 0) {
        out.push(makeSignal({ ...base, side: 'buy', targetPct: 0.06, stopPct: 0.03,
          confidence: 0.5 + Math.min(0.25, ret5 / 20) + (r >= 55 && r <= 65 ? 0.1 : 0),
          rationale: `Above 20-day average, RSI ${r.toFixed(0)}, +${ret5.toFixed(1)}% over 5 days` }));
      } else if (q.price < s20 && r < 45 && ret5 < 0) {
        out.push(makeSignal({ ...base, side: 'sell', targetPct: 0.06, stopPct: 0.03,
          confidence: 0.5 + Math.min(0.25, Math.abs(ret5) / 20),
          rationale: `Below 20-day average, RSI ${r.toFixed(0)}, ${ret5.toFixed(1)}% over 5 days` }));
      }
    }
    return out;
  },
};
