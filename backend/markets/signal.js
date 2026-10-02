'use strict';
const p = (x) => Number(Number(x).toPrecision(6));

function makeSignal({ moduleId, symbol, name, assetClass, side, confidence, entry, targetPct, stopPct, rationale }) {
  const dir = side === 'buy' ? 1 : -1;
  return {
    id: `${moduleId}:${symbol}:${side}`, moduleId, symbol, name: name || symbol, assetClass, side,
    confidence: Math.max(0, Math.min(1, Math.round(confidence * 100) / 100)),
    entry: p(entry), target: p(entry * (1 + dir * targetPct)), stop: p(entry * (1 - dir * stopPct)),
    rationale, ts: Date.now(),
  };
}
module.exports = { makeSignal };
