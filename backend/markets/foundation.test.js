'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeJsonFetcher } = require('./http');
const { sma, rsi, pctChange, returns, pearson, cleanCloses } = require('./indicators');
const { makeSignal } = require('./signal');

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });

test('getJson caches within ttl', async () => {
  let calls = 0, t = 1000;
  const get = makeJsonFetcher({ fetchImpl: async () => { calls++; return okRes({ a: 1 }); }, now: () => t });
  await get('http://x', 60000); t += 1000; await get('http://x', 60000);
  assert.strictEqual(calls, 1);
});

test('getJson serves stale data when upstream fails, throws when nothing cached', async () => {
  let fail = false, t = 0;
  const get = makeJsonFetcher({
    fetchImpl: async () => (fail ? { ok: false, status: 429 } : okRes({ v: 7 })), now: () => t,
  });
  assert.deepStrictEqual(await get('http://y', 10), { v: 7 });
  t += 100; fail = true;
  assert.deepStrictEqual(await get('http://y', 10), { v: 7 });
  await assert.rejects(() => get('http://never', 10), /upstream 429/);
});

test('indicators', () => {
  assert.strictEqual(sma([1, 2, 3, 4], 2), 3.5);
  assert.strictEqual(sma([1], 2), null);
  const up = Array.from({ length: 20 }, (_, i) => 100 + i);
  assert.strictEqual(rsi(up, 14), 100);
  assert.strictEqual(rsi([1, 2], 14), null);
  assert.ok(Math.abs(pctChange([100, 110], 1) - 10) < 1e-9);
  assert.strictEqual(pctChange([100], 5), null);
  assert.deepStrictEqual(returns([100, 110]).map((x) => +x.toFixed(2)), [0.1]);
  assert.deepStrictEqual(cleanCloses([1, null, NaN, 0, -3, 2, 'x']), [1, 2]);
});

test('pearson: +1, -1, and null for flat / too-short series', () => {
  const a = [1, 2, 3, 4, 5, 6], b = [2, 4, 6, 8, 10, 12], c = [6, 5, 4, 3, 2, 1];
  assert.ok(Math.abs(pearson(a, b) - 1) < 1e-9);
  assert.ok(Math.abs(pearson(a, c) + 1) < 1e-9);
  assert.strictEqual(pearson(a, [3, 3, 3, 3, 3, 3]), null);
  assert.strictEqual(pearson([1, 2], [1, 2]), null);
});

test('makeSignal clamps confidence and sets target/stop by side', () => {
  const s = makeSignal({ moduleId: 'm', symbol: 'AAA', assetClass: 'stock', side: 'buy',
    confidence: 1.4, entry: 100, targetPct: 0.06, stopPct: 0.03, rationale: 'r' });
  assert.strictEqual(s.id, 'm:AAA:buy');
  assert.strictEqual(s.confidence, 1);
  assert.strictEqual(s.target, 106);
  assert.strictEqual(s.stop, 97);
  const d = makeSignal({ moduleId: 'm', symbol: 'AAA', assetClass: 'stock', side: 'sell',
    confidence: -1, entry: 100, targetPct: 0.06, stopPct: 0.03, rationale: 'r' });
  assert.strictEqual(d.confidence, 0);
  assert.strictEqual(d.target, 94);
  assert.strictEqual(d.stop, 103);
});
