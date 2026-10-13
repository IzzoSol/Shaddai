'use strict';
const { sma, pctChange } = require('../indicators');
const { makeSignal } = require('../signal');
const MIN_VOLUME = 1e6;

module.exports = {
  id: 'crypto-momentum',
  source: 'shaddai',
  assetClasses: ['crypto'],
  run(quotes) {
    const out = [];
    for (const q of quotes) {
      if (q.assetClass !== 'crypto' || q.volume < MIN_VOLUME || !Array.isArray(q.closes) || q.closes.length < 48) continue;
      const s24 = sma(q.closes, 24), ret7d = pctChange(q.closes, q.closes.length - 1);
      if (s24 == null || ret7d == null) continue;
      const base = { moduleId: this.id, symbol: q.symbol, name: q.name, assetClass: 'crypto', entry: q.price, targetPct: 0.1, stopPct: 0.05 };
      if (q.change24hPct > 2 && ret7d > 0 && q.price > s24) {
        out.push(makeSignal({ ...base, side: 'buy', confidence: Math.min(0.85, 0.5 + Math.min(0.3, q.change24hPct / 30) + (ret7d > 5 ? 0.05 : 0)),
          rationale: `+${q.change24hPct.toFixed(1)}% 24h, +${ret7d.toFixed(1)}% 7d, above 24h average` }));
      } else if (q.change24hPct < -3 && ret7d < 0 && q.price < s24) {
        out.push(makeSignal({ ...base, side: 'sell', confidence: Math.min(0.85, 0.5 + Math.min(0.3, Math.abs(q.change24hPct) / 30)),
          rationale: `${q.change24hPct.toFixed(1)}% 24h, ${ret7d.toFixed(1)}% 7d, below 24h average` }));
      }
    }
    return out;
  },
};
