'use strict';
const { makeSignal } = require('../signal');
// Follows large 24h probability moves on liquid markets. Momentum only — NOT a claim of true edge, so confidence is capped.
module.exports = {
  id: 'prediction-watch',
  source: 'polymarket',
  assetClasses: ['prediction'],
  run(quotes) {
    const out = [];
    for (const q of quotes) {
      if (q.assetClass !== 'prediction' || q.volume < 50000 || Math.abs(q.change24hPct) < 5) continue;
      if (q.price < 0.05 || q.price > 0.95) continue; // near-certain markets carry no tradeable move
      const side = q.change24hPct > 0 ? 'buy' : 'sell';
      out.push(makeSignal({ moduleId: this.id, symbol: q.symbol, name: q.name, assetClass: 'prediction', side,
        entry: q.price, targetPct: 0.15, stopPct: 0.1, confidence: Math.min(0.7, 0.45 + Math.abs(q.change24hPct) / 50),
        rationale: `Yes ${(q.price * 100).toFixed(0)}% (${q.change24hPct > 0 ? '+' : ''}${q.change24hPct.toFixed(0)} pts in 24h), $${Math.round(q.volume).toLocaleString()} volume` }));
    }
    return out;
  },
};
