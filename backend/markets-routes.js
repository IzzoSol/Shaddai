// markets-routes.js — live market data for the 3D Markets portal (ZEROX's domain).
//   GET /api/markets/ohlc?symbol=btc   → candlesticks for the 3D chart
//   GET /api/markets/tickers           → top coins ticker strip
// Source: CoinGecko free API (no key). Server-side cached to respect rate limits.
const express = require('express');
const router = express.Router();

const TTL = 60 * 1000;                    // 60s cache (CoinGecko free is rate-limited)
const cache = new Map();                  // key -> { at, data }
const CG = 'https://api.coingecko.com/api/v3';
const SYMBOLS = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin',
  xrp: 'ripple', doge: 'dogecoin', ada: 'cardano', avax: 'avalanche-2', link: 'chainlink',
};
async function cached(key, url) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { accept: 'application/json' } });
  if (!r.ok) { if (hit) return hit.data; throw new Error('upstream ' + r.status); }
  const data = await r.json();
  cache.set(key, { at: Date.now(), data });
  return data;
}

// ── candlesticks ──
router.get('/api/markets/ohlc', async (req, res) => {
  const sym = String(req.query.symbol || 'btc').toLowerCase();
  const id = SYMBOLS[sym] || (Object.values(SYMBOLS).includes(sym) ? sym : 'bitcoin');
  try {
    const raw = await cached('ohlc:' + id, `${CG}/coins/${id}/ohlc?vs_currency=usd&days=1`);
    const candles = (raw || []).map(c => ({ t: c[0], o: c[1], h: c[2], l: c[3], c: c[4] }));
    const last = candles[candles.length - 1] || {};
    const first = candles[0] || {};
    const change = first.o ? ((last.c - first.o) / first.o) * 100 : 0;
    res.json({ ok: true, symbol: sym.toUpperCase(), id, price: last.c || null, change24h: Math.round(change * 100) / 100, count: candles.length, candles });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// ── ticker strip ──
router.get('/api/markets/tickers', async (req, res) => {
  const ids = (req.query.ids ? String(req.query.ids).split(',').map(s => SYMBOLS[s.toLowerCase()] || s) : Object.values(SYMBOLS)).slice(0, 12).join(',');
  try {
    const raw = await cached('tickers:' + ids, `${CG}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`);
    const tickers = (raw || []).map(c => ({ symbol: (c.symbol || '').toUpperCase(), name: c.name, price: c.current_price, change24h: Math.round((c.price_change_percentage_24h || 0) * 100) / 100, marketCap: c.market_cap, image: c.image }));
    res.json({ ok: true, count: tickers.length, tickers });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// ── news feed (ORACLE/ZEROX) — Cointelegraph RSS, parsed + cached ──
function rssItems(xml) {
  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const b of blocks.slice(0, 20)) {
    const pick = (tag) => {
      const m = b.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
    };
    const title = pick('title'), link = pick('link'), date = pick('pubDate');
    if (title) items.push({ title, link, date });
  }
  return items;
}
router.get('/api/news/crypto', async (req, res) => {
  try {
    const data = await (async () => {
      const hit = cache.get('news');
      if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
      const r = await fetch('https://cointelegraph.com/rss', { signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'SHADDAI/1.0' } });
      if (!r.ok) { if (hit) return hit.data; throw new Error('rss ' + r.status); }
      const items = rssItems(await r.text());
      cache.set('news', { at: Date.now(), data: items });
      return items;
    })();
    res.json({ ok: true, count: data.length, source: 'Cointelegraph', news: data.slice(0, 15) });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

module.exports = router;
