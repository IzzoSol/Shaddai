'use strict';
const test = require('node:test');
const assert = require('node:assert');
const stock = require('./modules/stock-screener');
const crypto = require('./modules/crypto-momentum');
const pred = require('./modules/prediction-watch');
const { MODULES } = require('./modules');

// 26 flat closes at 100, then one step per char: 'u' = +1, 'd' = -1
const series = (steps) => { const c = Array(26).fill(100); for (const s of steps) c.push(c[c.length - 1] + (s === 'u' ? 1 : -1)); return c; };
const sq = (symbol, closes) => ({ symbol, name: symbol, assetClass: 'stock', price: closes[closes.length - 1], change24hPct: 0, volume: 1e6, closes });

test('stock-screener: buy on uptrend with healthy RSI; sell on downtrend; nothing on flat/short', () => {
  const out = stock.run([
    sq('UP', series('ddddduuuuuuuuu')),                 // 5 d then 9 u -> RSI ~64, price above SMA20
    sq('DN', series('uuuuuddddddddd')),                 // 5 u then 9 d -> RSI ~36, price below SMA20
    sq('FLAT', Array(40).fill(100)),
    sq('SHORT', [100, 101, 102]),
    sq('NANS', [100, NaN, 101]),
  ]);
  const by = Object.fromEntries(out.map((s) => [s.symbol, s]));
  assert.strictEqual(by.UP.side, 'buy');
  assert.ok(by.UP.confidence >= 0.5 && by.UP.confidence <= 0.95);
  assert.ok(by.UP.target > by.UP.entry && by.UP.stop < by.UP.entry);
  assert.strictEqual(by.DN.side, 'sell');
  assert.ok(by.DN.target < by.DN.entry && by.DN.stop > by.DN.entry);
  assert.strictEqual(by.FLAT, undefined);
  assert.strictEqual(by.SHORT, undefined);
  assert.strictEqual(by.NANS, undefined);
  out.forEach((s) => Object.values(s).forEach((v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v)); }));
});

test('crypto-momentum: buy on rising 7d + 24h pop; ignores low volume and other classes', () => {
  const rising = Array.from({ length: 168 }, (_, i) => 100 + i * 0.06);
  const mk = (o) => ({ symbol: 'AAA', name: 'A', assetClass: 'crypto', price: 110, change24hPct: 4, volume: 5e7, closes: rising, ...o });
  assert.strictEqual(crypto.run([mk({})])[0].side, 'buy');
  assert.strictEqual(crypto.run([mk({ volume: 100 })]).length, 0);
  assert.strictEqual(crypto.run([mk({ assetClass: 'stock' })]).length, 0);
  const falling = rising.slice().reverse();
  assert.strictEqual(crypto.run([mk({ closes: falling, price: 100, change24hPct: -5 })])[0].side, 'sell');
  assert.strictEqual(crypto.run([mk({ closes: [] })]).length, 0);
});

test('prediction-watch: follows big moves on liquid markets, confidence capped', () => {
  const mk = (o) => ({ symbol: 's', name: 'Will X?', assetClass: 'prediction', price: 0.6, change24hPct: 9, volume: 90000, closes: [], ...o });
  const up = pred.run([mk({})])[0];
  assert.strictEqual(up.side, 'buy');
  assert.ok(up.confidence <= 0.7);
  assert.strictEqual(pred.run([mk({ change24hPct: -9 })])[0].side, 'sell');
  assert.strictEqual(pred.run([mk({ change24hPct: 2 })]).length, 0);
  assert.strictEqual(pred.run([mk({ volume: 100 })]).length, 0);
  assert.strictEqual(pred.run([mk({ price: 0.99 })]).length, 0);
});

test('registry exposes the three modules with unique ids', () => {
  assert.deepStrictEqual(MODULES.map((m) => m.id).sort(), ['crypto-momentum', 'prediction-watch', 'stock-screener']);
});
