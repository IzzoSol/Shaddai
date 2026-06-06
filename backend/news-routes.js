'use strict';

/**
 * SHADDAI news-routes.js
 * Express router backing the News tab. Thin wrapper over the keyless news
 * tools in ./tools-news (get_crypto_news / get_market_news / get_trending_topics).
 *
 * Mount with:
 *   app.use('/api/news', require('./news-routes'));
 *
 * Routes (all keyless, never throw to the client):
 *   GET  /             — latest crypto news        ?q=<query>&limit=<n>  -> { items, ... }
 *   GET  /trending     — trending coins/topics                          -> { trending, categories, ... }
 *   GET  /topic/:topic — market news for a coin/topic  ?limit=<n>        -> { items, ... }
 *   POST /analyze      — LOCAL (keyless, no-LLM) sentiment read over headlines.
 *                        body { items:[{title,summary}] }  OR  { topic:"btc", limit }
 *                        -> { overallSentiment, score, bullishCount, bearishCount,
 *                             perItem, topMovers, summary }
 */

const express = require('express');
const router = express.Router();

const { TOOLS_NEWS, analyzeSentiment } = require('./tools-news');

// ─── tiny in-memory cache (~5 min) ────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { ts, data }

function getCached(key) {
  const hit = cache.get(key);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.data;
  return null;
}
function setCached(key, data) {
  cache.set(key, { ts: Date.now(), data });
  return data;
}

/** Parse a tool's JSON-string result; tolerate non-JSON / failures. */
function parseToolResult(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { success: false, error: 'Malformed tool response' };
  }
}

function clampLimit(v, def, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, 1), max);
}

// ─── GET / — latest crypto news ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  const query = req.query.q ? String(req.query.q) : undefined;
  const limit = clampLimit(req.query.limit, 10, 50);
  const cacheKey = `crypto:${query || ''}:${limit}`;

  try {
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const parsed = parseToolResult(
      await TOOLS_NEWS.get_crypto_news.execute({ query, limit })
    );
    if (parsed.success === false) {
      return res.json({ items: [], error: parsed.error || 'Failed to fetch news' });
    }

    const payload = {
      items: parsed.results || [],
      source: parsed.source || 'rss',
      query: parsed.query != null ? parsed.query : (query || null),
      total: parsed.total != null ? parsed.total : (parsed.results || []).length
    };
    return res.json(setCached(cacheKey, payload));
  } catch (err) {
    return res.json({ items: [], error: err.message });
  }
});

// ─── GET /trending — trending coins/topics ────────────────────────────────────
router.get('/trending', async (req, res) => {
  const cacheKey = 'trending';

  try {
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const parsed = parseToolResult(
      await TOOLS_NEWS.get_trending_topics.execute({})
    );
    if (parsed.success === false) {
      return res.json({ items: [], trending: [], categories: [], error: parsed.error || 'Failed to fetch trending' });
    }

    const payload = {
      items: parsed.trending || [],
      trending: parsed.trending || [],
      categories: parsed.categories || [],
      source: parsed.source || 'coingecko',
      total: parsed.total != null ? parsed.total : (parsed.trending || []).length
    };
    return res.json(setCached(cacheKey, payload));
  } catch (err) {
    return res.json({ items: [], trending: [], categories: [], error: err.message });
  }
});

// ─── GET /topic/:topic — market news for a coin/topic ─────────────────────────
router.get('/topic/:topic', async (req, res) => {
  const topic = String(req.params.topic || '');
  const limit = clampLimit(req.query.limit, 10, 50);
  const cacheKey = `topic:${topic.toLowerCase()}:${limit}`;

  try {
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const parsed = parseToolResult(
      await TOOLS_NEWS.get_market_news.execute({ topic, limit })
    );
    if (parsed.success === false) {
      return res.json({ items: [], error: parsed.error || 'Failed to fetch market news' });
    }

    const payload = {
      items: parsed.results || [],
      source: parsed.source || 'rss',
      topic: parsed.topic != null ? parsed.topic : topic,
      total: parsed.total != null ? parsed.total : (parsed.results || []).length
    };
    return res.json(setCached(cacheKey, payload));
  } catch (err) {
    return res.json({ items: [], error: err.message });
  }
});

// ─── POST /analyze — keyless, no-LLM sentiment + market read ──────────────────
// Body: { items: [{title, summary}, ...] }  → analyze the supplied headlines.
//   OR: { topic: "bitcoin", limit?: n }      → fetch market news for topic first.
//   OR: {} / { limit }                       → fetch latest crypto news first.
// Always returns 200 with a sentiment object; never throws to the client.
router.post('/analyze', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    let items = Array.isArray(body.items) ? body.items : null;

    // No items supplied → pull headlines from the keyless feed ourselves.
    if (!items || items.length === 0) {
      const limit = clampLimit(body.limit, 20, 50);
      const topic = body.topic ? String(body.topic) : '';
      const raw = topic
        ? await TOOLS_NEWS.get_market_news.execute({ topic, limit })
        : await TOOLS_NEWS.get_crypto_news.execute({ limit });
      const parsed = parseToolResult(raw);
      items = (parsed && parsed.success !== false && Array.isArray(parsed.results))
        ? parsed.results
        : [];
    }

    const analysis = analyzeSentiment(items);

    return res.json({
      success: true,
      analyzed: analysis.total,
      overallSentiment: analysis.overallSentiment,
      score: analysis.score,
      bullishCount: analysis.bullishCount,
      bearishCount: analysis.bearishCount,
      neutralCount: analysis.neutralCount,
      topMovers: analysis.topMovers,
      perItem: analysis.perItem,
      summary: analysis.summary
    });
  } catch (err) {
    // Graceful empty result — surface a neutral signal rather than an error page.
    return res.json({
      success: false,
      error: err.message,
      analyzed: 0,
      overallSentiment: 'neutral',
      score: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      topMovers: [],
      perItem: [],
      summary: 'Sentiment analysis unavailable.'
    });
  }
});

module.exports = router;
