'use strict';
const { cleanCloses } = require('../indicators');
const CG = 'https://api.coingecko.com/api/v3';

function createCoinGeckoAdapter(getJson) {
  return {
    id: 'coingecko',
    async fetch() {
      const rows = await getJson(`${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=30&page=1&sparkline=true&price_change_percentage=24h`, 90000);
      return (Array.isArray(rows) ? rows : [])
        .filter((c) => c && Number.isFinite(c.current_price))
        .map((c) => ({ symbol: String(c.symbol || '').toUpperCase(), name: c.name || c.symbol, assetClass: 'crypto',
          price: c.current_price, change24hPct: Number(c.price_change_percentage_24h) || 0,
          volume: Number(c.total_volume) || 0, closes: cleanCloses(c.sparkline_in_7d && c.sparkline_in_7d.price) }));
    },
  };
}
module.exports = { createCoinGeckoAdapter };
