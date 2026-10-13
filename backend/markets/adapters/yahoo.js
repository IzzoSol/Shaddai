'use strict';
const { cleanCloses } = require('../indicators');

const DEFAULT_STOCKS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD',
  'NFLX', 'AVGO', 'JPM', 'V', 'COST', 'LLY', 'XOM', 'COIN', 'PLTR', 'SMCI', 'MSTR', 'DIS', 'BA', 'UBER'];

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const it = items[i++]; out.push(await fn(it)); }
  }));
  return out;
}

function createYahooAdapter(getJson, symbols = DEFAULT_STOCKS) {
  return {
    id: 'yahoo',
    async fetch() {
      const results = await pool(symbols, 6, async (sym) => {
        try {
          const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, 120000);
          const r = d && d.chart && d.chart.result && d.chart.result[0];
          if (!r) return null;
          const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
          const closes = cleanCloses(q.close);
          const price = r.meta && r.meta.regularMarketPrice;
          if (!closes.length || !Number.isFinite(price)) return null;
          const prev = closes.length > 1 ? closes[closes.length - 2] : null;
          const vols = (q.volume || []).filter(Number.isFinite);
          return { symbol: sym, name: (r.meta && (r.meta.shortName || r.meta.symbol)) || sym, assetClass: 'stock',
            price, change24hPct: prev ? (price / prev - 1) * 100 : 0, volume: vols.length ? vols[vols.length - 1] : 0, closes };
        } catch (_) { return null; }
      });
      const quotes = results.filter(Boolean);
      if (!quotes.length) throw new Error('yahoo: all symbols failed');
      return quotes;
    },
  };
}
module.exports = { createYahooAdapter, DEFAULT_STOCKS };
