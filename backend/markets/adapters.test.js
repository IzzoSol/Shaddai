'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createYahooAdapter } = require('./adapters/yahoo');
const { createCoinGeckoAdapter } = require('./adapters/coingecko');
const { createPolymarketAdapter } = require('./adapters/polymarket');
const { fetchBasket } = require('./adapters/basket');

const chart = (closes, price) => ({ chart: { result: [{
  meta: { regularMarketPrice: price, chartPreviousClose: closes[closes.length - 2], shortName: 'Acme' },
  timestamp: closes.map((_, i) => 1700000000 + i * 86400),
  indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }] },
}] } });

test('yahoo: maps chart to Quote, drops null closes, skips failed symbols', async () => {
  const getJson = async (url) => {
    if (url.includes('/BAD?')) throw new Error('upstream 404');
    return chart([100, null, 102, NaN, 104, 106], 106);
  };
  const a = createYahooAdapter(getJson, ['AAA', 'BAD']);
  const q = await a.fetch();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].symbol, 'AAA');
  assert.strictEqual(q[0].assetClass, 'stock');
  assert.deepStrictEqual(q[0].closes, [100, 102, 104, 106]);
  assert.ok(Number.isFinite(q[0].change24hPct));
});

test('yahoo: throws when every symbol fails', async () => {
  const a = createYahooAdapter(async () => { throw new Error('upstream 429'); }, ['AAA']);
  await assert.rejects(() => a.fetch(), /all symbols failed/);
});

test('coingecko: maps markets payload', async () => {
  const getJson = async () => [{ symbol: 'btc', name: 'Bitcoin', current_price: 60000,
    price_change_percentage_24h: 2.5, total_volume: 3e10, sparkline_in_7d: { price: [1, 2, 3] } },
    { symbol: 'bad', current_price: null }];
  const q = await createCoinGeckoAdapter(getJson).fetch();
  assert.strictEqual(q.length, 1);
  assert.deepStrictEqual([q[0].symbol, q[0].assetClass, q[0].price], ['BTC', 'crypto', 60000]);
  assert.deepStrictEqual(q[0].closes, [1, 2, 3]);
});

test('polymarket: parses outcomePrices, skips closed/garbled markets', async () => {
  const getJson = async () => [
    { question: 'Will X happen?', slug: 'x', outcomePrices: '["0.62","0.38"]', volume24hr: 90000, oneDayPriceChange: 0.08, closed: false },
    { question: 'Garbled', slug: 'g', outcomePrices: 'nope', volume24hr: 1, closed: false },
    { question: 'Closed', slug: 'c', outcomePrices: '["0.5","0.5"]', volume24hr: 1, closed: true },
    { question: 'Missing', slug: 'm', volume24hr: 1 },
  ];
  const q = await createPolymarketAdapter(getJson).fetch();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].assetClass, 'prediction');
  assert.strictEqual(q[0].price, 0.62);
  assert.strictEqual(q[0].change24hPct, 8);
});

test('basket: returns dated series for stocks and crypto, tolerates one failure', async () => {
  const getJson = async (url) => {
    if (url.includes('ethereum')) throw new Error('upstream 429');
    if (url.includes('finance.yahoo.com')) return chart([1, 2, 3], 3);
    return { prices: [[Date.UTC(2026, 8, 1), 10], [Date.UTC(2026, 8, 2), 11]] };
  };
  const b = await fetchBasket(getJson);
  assert.ok(Array.isArray(b.SPY) && b.SPY.length === 3);
  assert.strictEqual(b.BTC[0].d, '2026-09-01');
  assert.strictEqual(b.ETH, undefined);
});
