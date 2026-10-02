'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createEngine } = require('./engine');

const stockQuote = { symbol: 'AAA', name: 'A', assetClass: 'stock', price: 10, change24hPct: 1, volume: 1, closes: [1] };
const cryptoQuote = { symbol: 'BBB', name: 'B', assetClass: 'crypto', price: 5, change24hPct: 1, volume: 1, closes: [1] };
const mod = (id, cls, conf) => ({ id, source: 't', assetClasses: [cls],
  run: (qs) => qs.filter((q) => q.assetClass === cls).map((q) => ({ id: `${id}:${q.symbol}:buy`, moduleId: id, symbol: q.symbol,
    assetClass: cls, side: 'buy', confidence: conf, entry: q.price, target: 1, stop: 1, rationale: 'r', ts: 0 })) });
const grow = Array.from({ length: 7 }, (_, i) => ({ d: `2026-09-0${i + 1}`, c: 100 + i }));

function make(over = {}) {
  return createEngine({
    adapters: [{ id: 'ok', fetch: async () => [stockQuote, cryptoQuote] }],
    modules: [mod('m1', 'stock', 0.6), mod('m2', 'crypto', 0.8)],
    getBasket: async () => ({ SPY: grow, BTC: grow }),
    ...over,
  });
}

test('signals are sorted by confidence desc, regime-adjusted, and filterable by class', async () => {
  const e = make();
  const { signals, regime } = await e.signals();
  assert.strictEqual(regime.riskOn, true);
  assert.deepStrictEqual(signals.map((s) => s.moduleId), ['m2', 'm1']);
  assert.strictEqual(signals[1].confidence, 0.65);
  assert.deepStrictEqual((await e.signals({ assetClass: 'stock' })).signals.map((s) => s.symbol), ['AAA']);
});

test('a failing adapter yields partial data + errors, not a throw', async () => {
  const e = make({ adapters: [
    { id: 'ok', fetch: async () => [stockQuote] },
    { id: 'bad', fetch: async () => { throw new Error('upstream 429'); } } ] });
  const snap = await e.snapshot();
  assert.strictEqual(snap.quotes.length, 1);
  assert.deepStrictEqual(snap.errors, [{ adapter: 'bad', error: 'upstream 429' }]);
});

test('a throwing module or basket failure does not break the response', async () => {
  const e = make({ modules: [mod('m1', 'stock', 0.6), { id: 'boom', assetClasses: ['stock'], run() { throw new Error('x'); } }],
    getBasket: async () => { throw new Error('basket down'); } });
  const r = await e.signals();
  assert.strictEqual(r.signals.length, 1);
  assert.strictEqual(r.regime.riskOn, null);
  assert.deepStrictEqual((await e.correlations()).symbols, []);
});

test('snapshot is cached within ttl; signalById finds a current signal', async () => {
  let calls = 0, t = 0;
  const e = make({ adapters: [{ id: 'ok', fetch: async () => { calls++; return [stockQuote]; } }], now: () => t, ttlMs: 1000 });
  await e.signals(); await e.signals();
  assert.strictEqual(calls, 1);
  assert.strictEqual((await e.signalById('m1:AAA:buy')).symbol, 'AAA');
  assert.strictEqual(await e.signalById('nope'), null);
  t += 5000; await e.signals();
  assert.strictEqual(calls, 2);
});
