'use strict';

/**
 * SHADDAI tools-news.js
 * Real crypto/news data source for the News tab + ORACLE.
 * Inspired by nirholas/cryptocurrency.cv.
 *
 * Merge into the main TOOLS registry with:
 *   Object.assign(TOOLS, require('./tools-news').TOOLS_NEWS);
 *
 * Tools (all keyless out of the box):
 *   get_crypto_news     — latest crypto headlines (public RSS feeds)
 *   get_market_news     — same feed, filtered client-side by coin/topic
 *   get_trending_topics — trending coins/topics (CoinGecko /search/trending)
 *
 * News headlines come from public crypto RSS feeds (CoinDesk, CoinTelegraph,
 * Decrypt) which need no API key. NEWSAPI_API_KEY is optional — if set,
 * get_crypto_news additionally merges NewsAPI headlines as an enhancement.
 * Everything degrades gracefully; on network error tools return
 * { success:false, error } instead of throwing.
 */

const axios = require('axios');

// ─── helpers ────────────────────────────────────────────────────────────────

/** Wrap a promise so it rejects after `ms` milliseconds. */
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    )
  ]);
}

const UA = 'Mozilla/5.0 SHADDAI-Agent/2.0 (shaddai.ai)';

// Public, keyless crypto news RSS feeds (tried in order, all merged).
const RSS_FEEDS = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
  { url: 'https://cointelegraph.com/rss',                   source: 'CoinTelegraph' },
  { url: 'https://decrypt.co/feed',                         source: 'Decrypt' }
];

/** Strip HTML/CDATA noise from an RSS text fragment. */
function clean(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lightweight regex RSS parser (no external dep) → array of normalized articles. */
function parseRss(xml, sourceName) {
  const out = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1];
    const pick = (re) => { const x = chunk.match(re); return x ? (x[1] || x[2] || '') : ''; };
    const title = clean(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    // <link>text</link> or <link href="..."/> (Atom-style)
    let url = clean(pick(/<link[^>]*>([\s\S]*?)<\/link>/i));
    if (!url) url = (chunk.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    const pubDate = clean(pick(/<pubDate>([\s\S]*?)<\/pubDate>/i)) ||
                    clean(pick(/<published>([\s\S]*?)<\/published>/i)) ||
                    clean(pick(/<dc:date>([\s\S]*?)<\/dc:date>/i));
    const body = clean(pick(/<description>([\s\S]*?)<\/description>/i)).slice(0, 300);
    let publishedAt = '';
    if (pubDate) { const d = new Date(pubDate); if (!isNaN(d.getTime())) publishedAt = d.toISOString(); }
    if (title && url) out.push({ title, url, source: sourceName, publishedAt, body, categories: '' });
  }
  return out;
}

/** Normalise a NewsAPI article into our shape. */
function normalizeNewsApi(a) {
  return {
    title: (a.title || '').trim(),
    url: a.url || '',
    source: a.source && a.source.name ? a.source.name : '',
    publishedAt: a.publishedAt || '',
    body: a.description ? String(a.description).slice(0, 300) : '',
    categories: ''
  };
}

/**
 * Fetch the keyless crypto news feeds. Returns an array of normalized articles.
 * Feeds are fetched in parallel and merged; individual feed failures are tolerated.
 * Throws only if EVERY feed fails (so callers can surface a clean error).
 */
async function fetchNewsFeed() {
  const settled = await Promise.allSettled(
    RSS_FEEDS.map(f =>
      withTimeout(
        axios.get(f.url, { timeout: 10000, responseType: 'text', headers: { 'User-Agent': UA } }),
        12000
      ).then(resp => parseRss(resp.data, f.source))
    )
  );

  const articles = [];
  const seen = new Set();
  let anyOk = false;
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      anyOk = true;
      for (const a of r.value) {
        if (a.url && !seen.has(a.url)) { seen.add(a.url); articles.push(a); }
      }
    }
  }
  if (!anyOk) throw new Error('All crypto news feeds are unreachable');
  return articles;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS_NEWS registry
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS_NEWS = {

  get_crypto_news: {
    name: 'get_crypto_news',
    description: 'Latest cryptocurrency headlines. Keyless by default — pulls live public crypto RSS feeds (CoinDesk, CoinTelegraph, Decrypt) returning title/url/source/publishedAt. If NEWSAPI_API_KEY is set, NewsAPI crypto headlines are merged in as an enhancement. Optional query filters headlines client-side.',
    schema: {
      query: 'string — optional keyword to filter headlines (matches title/body, case-insensitive)',
      limit: 'number — max headlines to return (default 10, max 50)'
    },
    agents: ['ORACLE', 'ZEROX', 'SHADDAI'],
    async execute({ query, limit = 10 } = {}) {
      const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
      try {
        let articles = await fetchNewsFeed();

        // Optional enhancement: merge NewsAPI if a key is configured.
        const newsApiKey = process.env.NEWSAPI_API_KEY;
        if (newsApiKey) {
          try {
            const resp = await withTimeout(
              axios.get('https://newsapi.org/v2/everything', {
                params: {
                  q: query || 'cryptocurrency OR bitcoin OR ethereum',
                  language: 'en',
                  sortBy: 'publishedAt',
                  pageSize: n
                },
                timeout: 10000,
                headers: { 'User-Agent': UA, 'X-Api-Key': newsApiKey }
              }),
              12000
            );
            const naArticles = ((resp.data && resp.data.articles) || [])
              .map(normalizeNewsApi)
              .filter(a => a.title && a.url);
            // Merge + dedupe by url.
            const seen = new Set(articles.map(a => a.url));
            naArticles.forEach(a => { if (!seen.has(a.url)) { seen.add(a.url); articles.push(a); } });
          } catch (_) { /* NewsAPI is best-effort; ignore its failures */ }
        }

        // Client-side query filter.
        if (query) {
          const q = String(query).toLowerCase();
          articles = articles.filter(a =>
            a.title.toLowerCase().includes(q) || (a.body || '').toLowerCase().includes(q)
          );
        }

        // Sort newest first.
        articles.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

        const results = articles.slice(0, n).map(a => ({
          title: a.title,
          url: a.url,
          source: a.source,
          publishedAt: a.publishedAt
        }));

        return JSON.stringify({
          success: true,
          source: newsApiKey ? 'rss+newsapi' : 'rss',
          query: query || null,
          total: results.length,
          results
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  get_market_news: {
    name: 'get_market_news',
    description: 'Crypto market news filtered to a specific coin or topic (e.g. "ethereum", "regulation", "ETF"). Searches the keyless public crypto RSS feeds client-side and returns matching headlines with title/url/source/publishedAt.',
    schema: {
      topic: 'string — coin name, ticker, or topic to filter by (e.g. "bitcoin", "BTC", "regulation")',
      limit: 'number — max headlines to return (default 10, max 50)'
    },
    agents: ['ORACLE', 'ZEROX', 'SHADDAI'],
    async execute({ topic, limit = 10 } = {}) {
      const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
      try {
        let articles = await fetchNewsFeed();

        if (topic) {
          const t = String(topic).toLowerCase();
          articles = articles.filter(a =>
            a.title.toLowerCase().includes(t) ||
            (a.body || '').toLowerCase().includes(t) ||
            (a.categories || '').toLowerCase().includes(t)
          );
        }

        articles.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

        const results = articles.slice(0, n).map(a => ({
          title: a.title,
          url: a.url,
          source: a.source,
          publishedAt: a.publishedAt
        }));

        return JSON.stringify({
          success: true,
          source: 'rss',
          topic: topic || null,
          total: results.length,
          results
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  get_trending_topics: {
    name: 'get_trending_topics',
    description: 'Trending crypto coins/topics right now. Keyless — uses the CoinGecko /search/trending endpoint. Returns a ranked list of trending coins with name, symbol, market cap rank, and CoinGecko link.',
    schema: {
      limit: 'number — max trending items to return (default 10, max 25)'
    },
    agents: ['ORACLE', 'ZEROX', 'SHADDAI'],
    async execute({ limit = 10 } = {}) {
      const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25);
      try {
        const resp = await withTimeout(
          axios.get('https://api.coingecko.com/api/v3/search/trending', {
            timeout: 10000,
            headers: { 'User-Agent': UA }
          }),
          12000
        );

        const coins = (resp.data && resp.data.coins) || [];
        const trending = coins.slice(0, n).map((c, i) => {
          const item = c.item || {};
          return {
            rank: i + 1,
            name: item.name || '',
            symbol: (item.symbol || '').toUpperCase(),
            marketCapRank: item.market_cap_rank != null ? item.market_cap_rank : null,
            score: item.score != null ? item.score : null,
            url: item.id ? `https://www.coingecko.com/en/coins/${item.id}` : ''
          };
        });

        // Trending categories, if present, as a bonus topic list.
        const categories = ((resp.data && resp.data.categories) || [])
          .slice(0, 7)
          .map(c => c.name)
          .filter(Boolean);

        return JSON.stringify({
          success: true,
          source: 'coingecko',
          total: trending.length,
          trending,
          categories
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  }

};

module.exports = { TOOLS_NEWS };
