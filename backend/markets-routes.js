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
async function cached(key, url, ttl) {
  const ms = ttl || TTL;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.data;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json', 'user-agent': 'SHADDAI/2.0' } });
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

// ── PRO-SIGNALS FEEDS — public/pro-signals.html markets tab ──────────────────
// Fear & Greed (alternative.me) — { ok, data:[{value,value_classification,timestamp}] } newest first
router.get('/api/markets/fear-greed', async (req, res) => {
  try {
    const raw = await cached('fng', 'https://api.alternative.me/fng/?limit=7&format=json', 10 * 60 * 1000);
    res.json({ ok: true, data: (raw && raw.data) || [] });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Global crypto stats (CoinGecko /global) — { ok, data:{total_market_cap:{usd},...} }
router.get('/api/markets/global', async (req, res) => {
  try {
    const raw = await cached('cg:global', `${CG}/global`, 5 * 60 * 1000);
    res.json({ ok: true, data: (raw && raw.data) || null });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Trending coins (CoinGecko /search/trending) — { ok, data:{coins:[{item:{...}}]} }
router.get('/api/markets/trending', async (req, res) => {
  try {
    const raw = await cached('cg:trending', `${CG}/search/trending`, 5 * 60 * 1000);
    res.json({ ok: true, data: raw || { coins: [] } });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// DexScreener hot token profiles — { ok, data:[{symbol,description,icon,url,links}] }
router.get('/api/markets/dex-hot', async (req, res) => {
  try {
    const raw = await cached('dex:hot', 'https://api.dexscreener.com/token-profiles/latest/v1', 2 * 60 * 1000);
    res.json({ ok: true, data: Array.isArray(raw) ? raw : [] });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Solana ecosystem prices (CoinGecko simple price + 24h change) — { ok, data:{data:{SYM:{price,priceChange24h}}} }
const SOL_IDS = {
  SOL: 'solana', BONK: 'bonk', WIF: 'dogwifcoin', POPCAT: 'popcat', BOME: 'book-of-meme',
  TRUMP: 'official-trump', PNUT: 'pnut', MOODENG: 'moodeng', GOAT: 'goat',
  AI16Z: 'ai16z', PENGU: 'peng', MEW: 'meow',
};
router.get('/api/markets/jupiter', async (req, res) => {
  try {
    const ids = Object.values(SOL_IDS).join(',');
    const raw = await cached('jup:sol', `${CG}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, 60 * 1000);
    const data = {};
    for (const [sym, id] of Object.entries(SOL_IDS)) {
      const c = raw && raw[id];
      data[sym] = c ? { price: c.usd, priceChange24h: c.usd_24h_change } : { price: null, priceChange24h: null };
    }
    res.json({ ok: true, data: { data } });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Crypto markets (CoinGecko /coins/markets) — { ok, data:[{id,symbol,name,current_price,market_cap,price_change_percentage_24h}] }
router.get('/api/markets/crypto', async (req, res) => {
  try {
    const raw = await cached('cg:mkts', `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&page=1&price_change_percentage=24h`, 5 * 60 * 1000);
    const data = (raw || []).map(c => ({
      id: c.id, symbol: c.symbol, name: c.name, current_price: c.current_price,
      market_cap: c.market_cap, price_change_percentage_24h: c.price_change_percentage_24h, image: c.image,
    }));
    res.json({ ok: true, data });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Forex (frankfurter.app, USD base) — { ok, data:[{pair,quote,rate}] }
const FX_PAIRS = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY'];
router.get('/api/markets/forex', async (req, res) => {
  try {
    const raw = await cached('fx', `https://api.frankfurter.app/latest?from=USD&symbols=${FX_PAIRS.join(',')}`, 10 * 60 * 1000);
    const rates = (raw && raw.rates) || {};
    const data = FX_PAIRS.map(q => ({ pair: 'USD/' + q, quote: q, rate: rates[q] || null }));
    res.json({ ok: true, data });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Stocks / commodities / crypto (Yahoo chart) — { ok, data:[{symbol,name,type,price,changePct,marketState}] }
const YF_SYMBOLS = [
  { symbol: 'SPY', name: 'S&P 500', type: 'stock' },
  { symbol: 'QQQ', name: 'Nasdaq 100', type: 'stock' },
  { symbol: 'AAPL', name: 'Apple', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock' },
  { symbol: 'META', name: 'Meta Platforms', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock' },
  { symbol: 'GC=F', name: 'Gold', type: 'commodity' },
  { symbol: 'CL=F', name: 'Crude Oil WTI', type: 'commodity' },
  { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto' },
  { symbol: 'SOL-USD', name: 'Solana', type: 'crypto' },
];
router.get('/api/markets/stocks', async (req, res) => {
  const data = [];
  await Promise.all(YF_SYMBOLS.map(async (s) => {
    try {
      const raw = await cached('yf:' + s.symbol, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?interval=1d&range=5d`, 5 * 60 * 1000);
      const result = raw && raw.chart && raw.chart.result && raw.chart.result[0];
      const meta = result && result.meta;
      const quote = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
      if (!meta) return;
      const closes = (quote && quote.close || []).filter(v => v != null);
      const price = meta.regularMarketPrice || closes[closes.length - 1] || null;
      const prev = meta.previousClose || closes[closes.length - 2] || null;
      const changePct = (price && prev) ? ((price - prev) / prev) * 100 : 0;
      data.push({ symbol: s.symbol, name: s.name, type: s.type, price, changePct: Math.round(changePct * 100) / 100, marketState: meta.marketState || '' });
    } catch (_) { /* skip failing symbol */ }
  }));
  res.json({ ok: true, count: data.length, data });
});

// Solana network stats (mainnet RPC) — { ok, data:{tps,slot,circulatingSupply} }
router.get('/api/network/solana', async (req, res) => {
  try {
    const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
    const post = (method, params) => fetch(RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() % 1000, method, params }),
      signal: AbortSignal.timeout(9000),
    }).then(x => x.json());
    const perf = await post('getRecentPerformanceSamples', [3]);
    const samples = (perf.result || []).filter(s => s.numTransactions != null);
    const last = samples[samples.length - 1] || {};
    const tps = last.numTransactions ? Math.round(last.numTransactions / Math.max(1, last.samplePeriodSecs)) : null;
    let slot = null, circulatingSupply = null;
    try {
      const [sl, su] = await Promise.all([post('getSlot'), post('getSupply')]);
      slot = sl.result || null;
      circulatingSupply = (su.result && su.result.value && su.result.value.circulating) || null;
    } catch (_) { /* optional extras */ }
    res.json({ ok: true, data: { tps, slot, circulatingSupply } });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

module.exports = router;
