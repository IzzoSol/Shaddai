/* ==== FREE-API HELPERS ================================================= */

const fetch = require('node-fetch');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINDESK_BASE = 'https://www.coindesk.com/';
const TRENDING_BASE = 'https://www.reddit.com/r/cryptocurrency/new.json';
const TWITTER_SEARCH = 'https://api.twitter.com/2/tweets/search/recent';

// ---------------------------------------------------------------------
// 1️⃣  Get list of top coins from CoinGecko (price, %change, market-cap)
// ---------------------------------------------------------------------
async function getCoingeckoCoins(limit = 200) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=${limit}`,
    { timeout: 15000 }
  );
  if (!response.ok) throw new Error('CoinGecko fetch failed');
  const data = await response.json();
  const enriched = data.map(c => ({
    ...c,
    change24h: c.price_change_percentage_24h || 0,
  }));
  return enriched;
}

// ---------------------------------------------------------------------
// 2️⃣  Get "Boosted" tokens (newly-listed on DexScreener) – same as before
// ---------------------------------------------------------------------
async function getBoostedCoins(limit = 6) {
  const r = await fetch('https://api.dexscreener.com/latest/token/boosted', { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('Boosted fetch failed');
  const data = await r.json();
  return (data.assets || []).slice(0, limit).map(a => ({
    mint: a.tokenAddress,
    symbol: a.symbol,
    name: a.name,
    priceUsd: a.priceUsd || 0,
  }));
}

// ---------------------------------------------------------------------
// 3️⃣  Pull the three "free-news" streams
// ---------------------------------------------------------------------
async function fetchGoogleNews(query) {
  const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}`);
  const txt = await r.text();
  const items = [...txt.matchAll(/<item>(.*?)<\/item>/g)] || [];
  return items.map(i => ({
    title: i[1].match(/<title>(.*?)<\/title>/)[1],
    link: i[1].match(/<link>(.*?)<\/link>/)[1],
  }));
}

// ---------------------------------------------------------------------
// 4️⃣  Reddit-crypto sentiment (free, no key)
// ---------------------------------------------------------------------
async function fetchRedditSentiment(query) {
  const res = await fetch(`https://www.reddit.com/r/cryptocurrency/new.json?search=${encodeURIComponent(query)}&limit=10`);
  const json = await res.json();
  const posts = json.data?.data?.children || [];
  return posts.map(p => ({
    title: p.data.title,
    author: p.data.author,
    created_utc: new Date(p.data.created_utc * 1000).toLocaleString(),
    score: p.data.score,
  }));
}

// ---------------------------------------------------------------------
// 5️⃣  Twitter sentiment (free dev tier – needs a bearer token)
// ---------------------------------------------------------------------
async function fetchTwitterSentiment(query) {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) throw new Error('Twitter bearer token not set');
  const headers = { Authorization: `Bearer ${token}` };
  const resp = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10`,
    { headers }
  );
  if (!resp.ok) throw new Error('Twitter fetch failed');
  const tweets = await resp.json();
  return tweets.data.map(t => ({
    text: t.text,
    author_id: t.author_id,
    created_at: new Date(t.created_at).toLocaleString(),
  }));
}

// ---------------------------------------------------------------------
// 6️⃣  Boosted + Top-25 combined endpoint data
// ---------------------------------------------------------------------
async function getBoostedAndTop() {
  try {
    const boostedResp = await fetch('https://api.dexscreener.com/latest/token/boosted', { signal: AbortSignal.timeout(12000) });
    if (!boostedResp.ok) throw new Error('Boosted fetch failed');
    const boostedData = await boostedResp.json();
    const boosted = (boostedData.assets || []).filter(a => a.chainId === 'solana').slice(0, 25);

    const topResp = await fetch('https://api.dexscreener.com/latest/tokens', { signal: AbortSignal.timeout(12000) });
    if (!topResp.ok) throw new Error('Top tokens fetch failed');
    const topData = await topResp.json();
    const top25 = (topData || []).slice(0, 25).filter(a => a.chainId === 'solana');

    const combined = [...boosted, ...top25].map(t => ({
      symbol: t.symbol,
      name: t.name,
      mint: t.address,
      priceUsd: t.priceUsd?.toString() || '0',
      volume24h: Number(t.volumeUsd24h) || 0,
    }));

    return { ok: true, assets: combined };
  } catch (e) {
    console.error('[Boosted+Top] error:', e.message);
    return { ok: false, assets: [], error: e.message };
  }
}

module.exports = {
  fetchCoingeckoCoins: getCoingeckoCoins,
  fetchBoostedCoins: getBoostedCoins,
  fetchGoogleNews,
  fetchRedditSentiment,
  fetchTwitterSentiment,
  getBoostedAndTop,
};