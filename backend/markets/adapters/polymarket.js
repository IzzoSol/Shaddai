'use strict';
function createPolymarketAdapter(getJson) {
  return {
    id: 'polymarket',
    async fetch() {
      const rows = await getJson('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=40', 120000);
      const out = [];
      for (const m of Array.isArray(rows) ? rows : []) {
        if (!m || m.closed) continue;
        let prices;
        try { prices = JSON.parse(m.outcomePrices); } catch (_) { continue; }
        const yes = Number(prices && prices[0]);
        if (!Number.isFinite(yes)) continue;
        out.push({ symbol: String(m.slug || m.question).slice(0, 60), name: String(m.question || m.slug), assetClass: 'prediction',
          price: yes, change24hPct: (Number(m.oneDayPriceChange) || 0) * 100, volume: Number(m.volume24hr) || 0, closes: [] });
      }
      return out;
    },
  };
}
module.exports = { createPolymarketAdapter };
