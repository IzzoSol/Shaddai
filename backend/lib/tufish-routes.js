/**
 * tufish-routes.js — MiroFish Income Engine proxy router
 * Mounts at /api/tufish — proxies free public APIs server-side to avoid
 * browser CORS/rate-limit issues on Render.
 *
 * Mount in server-production.js:
 *   const tufishRouter = require('./lib/tufish-routes');
 *   app.use('/api/tufish', tufishRouter);
 *
 * Endpoints:
 *   GET /api/tufish/polymarket/markets          → clob.polymarket.com/markets
 *   GET /api/tufish/polymarket/events?slug=     → gamma-api.polymarket.com/events?slug=
 *   GET /api/tufish/polymarket/book?token_id=   → clob.polymarket.com/books/:token_id
 *   GET /api/tufish/price?ids=&vs=              → api.coingecko.com simple price
 *   GET /api/tufish/sentiment?q=                → TuFish sentiment scan
 *        (Wikipedia research + Google News RSS headlines, each scored by the
 *        built-in lexicon; CoinGecko live price/24h change blended in for coins)
 *
 * All endpoints: read-only market data, no keys, no auth, no trading execution.
 * Responses cached in memory (15 s – 5 min) to respect upstream rate limits.
 */

'use strict';

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

// ── Simple in-memory TTL cache ─────────────────────────────────────────────
const CACHE = new Map();

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { CACHE.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  // Evict if cache grows large (safety valve)
  if (CACHE.size > 200) {
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
  CACHE.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Shared axios instance ──────────────────────────────────────────────────
const http = axios.create({
  timeout: 8000,
  headers: { 'Accept': 'application/json', 'User-Agent': 'MiroFish/4.0 (proxy)' }
});

// ── Helper: send upstream response or cached data ─────────────────────────
async function proxyGet(cacheKey, ttlMs, upstreamUrl, res) {
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data } = await http.get(upstreamUrl);
    cacheSet(cacheKey, data, ttlMs);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json({
      error: 'upstream_error',
      message: err.message,
      upstream: upstreamUrl
    });
  }
}

// ── Whitelist of safe token_id characters (hex / alphanumeric only) ────────
const TOKEN_ID_RE = /^[0-9a-fA-F]{1,128}$/;

// ── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/tufish/polymarket/markets
 * Returns the CLOB market list (cached 30 s).
 */
router.get('/polymarket/markets', async (req, res) => {
  await proxyGet(
    'poly:markets',
    30_000,
    'https://clob.polymarket.com/markets',
    res
  );
});

/**
 * GET /api/tufish/polymarket/events?slug=bitcoin-above-XXXXX-on-YYYYY
 * Fetches a Polymarket event by slug from gamma API (cached 20 s).
 */
router.get('/polymarket/events', async (req, res) => {
  const slug = String(req.query.slug || '').trim();
  // Slug: letters, digits, hyphens only
  if (!slug || !/^[a-zA-Z0-9\-_]{1,200}$/.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug' });
  }
  await proxyGet(
    'poly:event:' + slug,
    20_000,
    'https://gamma-api.polymarket.com/events?slug=' + encodeURIComponent(slug),
    res
  );
});

/**
 * GET /api/tufish/polymarket/book?token_id=<hex>
 * Fetches a single CLOB order book (cached 15 s).
 */
router.get('/polymarket/book', async (req, res) => {
  const tokenId = String(req.query.token_id || '').trim();
  if (!TOKEN_ID_RE.test(tokenId)) {
    return res.status(400).json({ error: 'invalid_token_id' });
  }
  await proxyGet(
    'poly:book:' + tokenId,
    15_000,
    'https://clob.polymarket.com/books/' + tokenId,
    res
  );
});

/**
 * GET /api/tufish/price?ids=bitcoin,ethereum&vs=usd
 * Fetches CoinGecko simple price (cached 20 s, free tier — no key).
 */
router.get('/price', async (req, res) => {
  // Whitelist coin IDs (letters, digits, hyphens) and vs_currencies
  const rawIds = String(req.query.ids || 'bitcoin').toLowerCase();
  const rawVs  = String(req.query.vs  || 'usd').toLowerCase();

  const ids = rawIds.split(',').filter(s => /^[a-z0-9\-]{1,64}$/.test(s)).slice(0, 20).join(',');
  const vs  = rawVs.split(',').filter(s => /^[a-z]{1,10}$/.test(s)).slice(0, 5).join(',');

  if (!ids || !vs) return res.status(400).json({ error: 'invalid_params' });

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`;
  await proxyGet('cg:price:' + ids + ':' + vs, 20_000, url, res);
});

// ═════════════════════════════════════════════════════════════════════════════
// NEWS FEED (ticker + coin context) — Google News RSS, key-free, cached 3 min
// Endpoint: GET /api/tufish/news?q=<crypto|coin symbol>
// ═════════════════════════════════════════════════════════════════════════════
router.get('/news', async (req, res) => {
  const q = String(req.query.q || 'crypto')
    .replace(/[<>&"'`]/g, ' ').trim().slice(0, 80);
  if (!q) return res.status(400).json({ error: 'invalid_params' });

  const key = 'tufish:news:' + q.toLowerCase();
  let items = cacheGet(key);
  if (!items) {
    try {
      items = await fetchNewsItems(q);
      items = items.slice(0, 12);
      if (items.length) cacheSet(key, items, 3 * 60 * 1000);
    } catch (e) {
      return res.status(502).json({ error: 'news feed unavailable', message: String(e.message || e) });
    }
  }
  res.json({ ok: true, q, count: items.length, items });
});

// ═════════════════════════════════════════════════════════════════════════════
// MARKET WATCH (terminal strip) — CoinGecko /coins/markets, key-free, cached 60s
// Endpoint: GET /api/tufish/watch?ids=bitcoin,ethereum,solana
// ═════════════════════════════════════════════════════════════════════════════
router.get('/watch', async (req, res) => {
  const ids = String(req.query.ids || 'bitcoin,ethereum,solana').toLowerCase()
    .split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[a-z0-9\-]{1,64}$/.test(s); })
    .slice(0, 12).join(',');
  if (!ids) return res.status(400).json({ error: 'invalid_params' });

  const key = 'cg:watch:' + ids;
  let data = cacheGet(key);
  if (!data) {
    try {
      const r = await http.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + ids +
        '&order=market_cap_desc&price_change_percentage=24h');
      data = (r.data || []).map(function (c) {
        return {
          id: c.id,
          symbol: (c.symbol || '').toUpperCase(),
          name: c.name || c.id,
          price: c.current_price,
          change24h: c.price_change_percentage_24h,
          marketCap: c.market_cap
        };
      });
      if (data.length) cacheSet(key, data, 60 * 1000);
    } catch (e) {
      return res.status(502).json({ error: 'market snapshot unavailable', message: String(e.message || e) });
    }
  }
  res.json({ ok: true, count: data.length, coins: data });
});

// ═════════════════════════════════════════════════════════════════════════════
// SENTIMENT SCAN — TuFish "Yin & Yang of the news"
// Endpoint: GET /api/tufish/sentiment?q=<topic|coin>
//
// Pipeline (all key-free, all public, all read-only):
//   1. Wikipedia REST   → canonical title + research extract (Yin, the grounding)
//   2. Google News RSS  → the last ~40 headlines about the query (search feed)
//   3. Lexicon scoring  → each headline → raw ∈ [-1, 1]; weighted by recency
//   4. CoinGecko API    → if the query is a known coin: live price + 24h %
//   5. Blend            → 65/35 news + market (news=0 alone → wiki extract scored)
// Result score ∈ [-100, 100], magnitude ∈ [0, 100], polarity + bucket counts.
// ═════════════════════════════════════════════════════════════════════════════

const POS_WORDS = new Set([
  'gain', 'gains', 'rally', 'rallies', 'rallying', 'surge', 'surges', 'surged', 'soar', 'soars', 'soaring',
  'record', 'records', 'highs', 'all-time high', 'ath', 'bull', 'bulls', 'bullish', 'breakout', 'breakouts',
  'moons', 'mooning', 'rise', 'rises', 'rising', 'spike', 'spikes', 'spiked', 'boom', 'booming', 'positive',
  'wins', 'win', 'won', 'beat', 'beats', 'upgrade', 'upgrades', 'upgraded', 'strong', 'strength', 'leap',
  'leaps', 'jumps', 'jump', 'jumped', 'rebound', 'rebounds', 'recover', 'recovers', 'recovering', 'recovery',
  'green', 'buy', 'buys', 'buyback', 'approval', 'launch', 'launches', 'launched', 'partnership', 'adoption',
  'inflows', 'profits', 'profit', 'growth', 'growing', 'grows', 'outperform', 'outperforms', 'outperformed',
  'exceeds', 'exceeded', 'success', 'successful', 'optimistic', 'milestones', 'milestone', 'new high',
  'benefit', 'benefits', 'boost', 'boosts', 'boosted', 'upside', 'gains ground', 'pump', 'pumping', 'surge on'
]);

const NEG_WORDS = new Set([
  'fall', 'falls', 'falling', 'fell', 'drop', 'drops', 'dropped', 'dropping', 'crash', 'crashes', 'crashed',
  'crashing', 'tumble', 'tumbles', 'tumbled', 'plunge', 'plunges', 'plunged', 'dump', 'dumps', 'dumped',
  'dip', 'dips', 'downbeat', 'downturn', 'decline', 'declines', 'declining', 'warning', 'warns', 'warned',
  'loss', 'losses', 'losing', 'bear', 'bears', 'bearish', 'sell', 'sells', 'selling', 'selloff', 'sell-off',
  'hack', 'hacked', 'hackers', 'hacking', 'breach', 'breaches', 'lawsuit', 'lawsuits', 'sued', 'sues',
  'fine', 'fined', 'fines', 'ban', 'banned', 'banning', 'crackdown', 'restrict', 'restrictions', 'restricted',
  'delist', 'delisted', 'bankruptcy', 'bankrupt', 'insolvent', 'fraud', 'scam', 'rug', 'rug pull', 'illicit',
  'fears', 'fear', 'panic', 'panicking', 'red', 'overvalued', 'risky', 'volatile', 'volatility', 'slump',
  'slumps', 'slumped', 'weak', 'weakness', 'worse', 'worst', 'fail', 'failed', 'failing', 'failure',
  'capitulation', 'outflows', 'layoff', 'layoffs', 'underperform', 'underperforms', 'underperformed',
  'correction', 'cooling', 'concern', 'concerns', 'troubled', 'struggles', 'struggling', 'turmoil', 'brakes'
]);

const POS_RE  = new RegExp('\\b(?:' + [...POS_WORDS].join('|') + ')\\b', 'gi');
const NEG_RE  = new RegExp('\\b(?:' + [...NEG_WORDS].join('|') + ')\\b', 'gi');

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').trim();
}

function countHits(re, text) {
  let n = 0; const copy = text.slice();
  let m; while ((m = re.exec(copy)) !== null && n < 200) n++;
  return n;
}

// Single headline/paragraph → raw sentiment ∈ [-1, 1]
function scoreText(text) {
  const low = ' ' + text.toLowerCase().replace(/[\u00a0\u2018\u2019\u201c\u201d-]+/g, ' ') + ' ';
  const p = countHits(POS_RE, low);
  const n = countHits(NEG_RE, low);
  const tot = p + n;
  return tot ? Math.max(-1, Math.min(1, (p - n) / tot)) : 0;
}

async function fetchNewsItems(q) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
    '&hl=en-US&gl=US&ceid=US:en';
  const { data } = await http.get(url, {
    responseType: 'text',
    transformResponse: [(d) => d]
  });
  const items = [];
  const blockRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = blockRe.exec(data)) !== null && items.length < 40) {
    const block = m[1];
    const get = (tag) => {
      const mm = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
      return mm ? decodeEntities(mm[1]) : '';
    };
    const title = get('title');
    if (!title) continue;
    items.push({
      title,
      link: (block.match(/<link>\s*([^<\s]+)/) || [])[1] || '',
      source: (block.match(/<source[^>]*>([^<]*)<\/source>/) || [])[1] || '',
      pubDate: get('pubDate')
    });
  }
  return items;
}

async function detectCoin(q) {
  try {
    const sKey = 'cg:search:' + q.toLowerCase().slice(0, 40);
    let coins = cacheGet(sKey);
    if (!coins) {
      const { data } = await http.get(
        'https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q.slice(0, 60))
      );
      coins = (data && data.coins) || [];
      cacheSet(sKey, coins, 5 * 60 * 1000);
    }
    if (!coins.length) return null;
    const c = coins[0];
    if (!c || !c.id) return null;
    const rank = c.market_cap_rank || null;
    if ((rank && rank > 250)) return null;             // real coins only — skip tokenized-ETF noise
    if ((c.symbol || '').length > 10) return null;
    const pKey = 'cg:price:' + c.id;
    let price = cacheGet(pKey);
    if (!price) {
      const { data } = await http.get('https://api.coingecko.com/api/v3/simple/price?ids=' +
        encodeURIComponent(c.id) + '&vs_currencies=usd&include_24hr_change=true');
      price = (data && data[c.id]) || {};
      cacheSet(pKey, price, 20 * 1000);
    }
    if (price.usd == null) return null;
    return {
      id: c.id,
      name: c.name || c.id,
      symbol: (c.symbol || c.id).toUpperCase(),
      price: price.usd,
      change24h: price.usd_24h_change != null ? price.usd_24h_change : null,
      rank: c.market_cap_rank || null
    };
  } catch {
    return null;
  }
}

async function fetchWiki(q) {
  let title = q;
  try {
    const s = await http.get('https://en.wikipedia.org/w/rest.php/v1/search/page?q=' +
      encodeURIComponent(q) + '&limit=1');
    const sd = s.data || {};
    if (sd.pages && sd.pages.length) title = sd.pages[0].title;
  } catch { /* keep raw q */ }
  try {
    const r = await http.get('https://en.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent(title.replace(/ /g, '_')));
    const d = r.data || {};
    return {
      title: d.title || title,
      extract: d.extract || '',
      url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || null,
      thumb: (d.thumbnail && d.thumbnail.source) || null
    };
  } catch {
    return { title, extract: '', url: null, thumb: null };
  }
}

async function computeSentiment(q) {
  const [wiki, headlines, market] = await Promise.all([
    fetchWiki(q),
    fetchNewsItems(q),
    detectCoin(q)
  ]);

  const now = Date.now();
  let sw = 0, sSum = 0, mSum = 0;
  const scored = headlines.map((h) => {
    const raw = scoreText(h.title);
    const ageDays = Number.isFinite(Date.parse(h.pubDate)) ? (now - Date.parse(h.pubDate)) / 86400000 : 0;
    const w = Math.exp(-Math.max(0, ageDays) / 3);
    sw += w; sSum += raw * w; mSum += Math.abs(raw) * w;
    return { title: h.title, link: h.link, source: h.source, days: ageDays, raw };
  });

  let newsScore = sw > 0 ? sSum / sw : 0;
  let magnitude = sw > 0 ? mSum / sw : 0;

  let marketScore = null;
  if (market && market.change24h != null) {
    marketScore = Math.tanh(market.change24h / 8); // -1..1
  }

  let blend = newsScore;
  const newsN = scored.length;
  if (marketScore != null && newsN >= 1) {
    const wNews = newsN >= 3 ? 0.65 : 0.5;
    blend = wNews * newsScore + (1 - wNews) * marketScore;
  } else if (newsN === 0 && marketScore != null) {
    blend = marketScore;
  }
  if (newsN === 0 && marketScore == null) {
    const base = (wiki.extract || q).slice(0, 3000);
    blend = scoreText(base);
  }

  const score = Math.max(-100, Math.min(100, Math.round(blend * 100)));
  const magn = Math.max(8, Math.min(100, Math.round(magnitude * 100)));
  const polarity = score >= 15 ? 'positive' : (score <= -15 ? 'negative' : 'neutral');

  return {
    ok: true,
    q,
    title: wiki.title || q,
    score,
    magnitude: magn,
    polarity,
    confidence: Math.min(1, (newsN + (market ? 1 : 0)) / 8),
    meta: { news: newsN, coin: !!market, wiki: !!wiki.extract },
    market,
    wiki,
    buckets: [
      scored.filter((h) => h.raw < -0.6).length,
      scored.filter((h) => h.raw >= -0.6 && h.raw < -0.2).length,
      scored.filter((h) => h.raw >= -0.2 && h.raw <= 0.2).length,
      scored.filter((h) => h.raw > 0.2 && h.raw <= 0.6).length,
      scored.filter((h) => h.raw > 0.6).length
    ],
    headlines: scored.sort((a, b) => b.days - a.days).map((h) => ({
      title: h.title, link: h.link, source: h.source, days: Math.round(h.days),
      label: h.raw >= 0.25 ? 'pos' : (h.raw <= -0.25 ? 'neg' : 'neu')
    }))
  };
}

/**
 * GET /api/tufish/sentiment?q=bitcoin
 * TuFish sentiment scan — news + wiki + market, key-free.
 */
router.get('/sentiment', async (req, res) => {
  const q = String(req.query.q || '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!q) return res.status(400).json({ ok: false, error: 'missing_query' });

  const ck = 'tufish:sent:' + q.toLowerCase();
  const cached = cacheGet(ck);
  if (cached) return res.json(cached);

  try {
    const result = await computeSentiment(q);
    cacheSet(ck, result, 2 * 60 * 1000);
    res.json(result);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'sentiment_failed', message: e.message });
  }
});

module.exports = router;
