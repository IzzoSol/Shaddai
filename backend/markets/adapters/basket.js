'use strict';
const { cleanCloses } = require('../indicators');
const CG = 'https://api.coingecko.com/api/v3';
const STOCKS = ['SPY', 'QQQ', 'NVDA'];
const COINS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function fetchBasket(getJson) {
  const out = {};
  await Promise.all([
    ...STOCKS.map(async (sym) => {
      try {
        const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1mo&interval=1d`, 3600000);
        const r = d.chart.result[0];
        const ts = r.timestamp || [], cl = r.indicators.quote[0].close || [];
        const series = ts.map((t, i) => ({ d: day(t * 1000), c: cl[i] })).filter((p) => cleanCloses([p.c]).length);
        if (series.length) out[sym] = series;
      } catch (_) { /* leave symbol out */ }
    }),
    ...Object.entries(COINS).map(async ([sym, id]) => {
      try {
        const d = await getJson(`${CG}/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`, 3600000);
        const series = (d.prices || []).map(([ms, c]) => ({ d: day(ms), c })).filter((p) => cleanCloses([p.c]).length);
        if (series.length) out[sym] = series;
      } catch (_) { /* leave symbol out */ }
    }),
  ]);
  return out;
}
module.exports = { fetchBasket };
