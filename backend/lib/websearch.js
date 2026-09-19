// backend/lib/websearch.js
// ============================================================================
// SHADDAI KEYLESS WEB SEARCH — real web search that works with ZERO API keys.
// ----------------------------------------------------------------------------
// WHY: public/index.html + brain cockpit call GET /api/search/web?q=, but the
// route never existed and SerpAPI needs a paid key. NEXUS wired three keyless
// engines so "RAG brain pulls real web data" works TODAY, no .env change:
//   1. Google News RSS  — fresh news headlines for any query (no key)
//   2. DuckDuckGo HTML  — organic web results (no key)
//   3. SerpAPI          — used ONLY if SERPAPI_KEY is set (upgrades quality)
// All engines are SSRF-hardened (no private/local hosts ever fetched; results
// carry public URLs for the caller to fetch via /api/scrape or mcp__fetch__fetch).
// ============================================================================
'use strict';

const MAX_RESULTS = 20;
const FETCH_TIMEOUT = 12000;

function _clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _host(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// Block private / internal hosts (PIKADON: SSRF guard for the URL the caller
// will forward to /api/scrape or the fetch MCP tool).
const PRIVATE_RE = /(^|\.)(localhost|internal|intranet)$/i;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
function _isPrivateHost(hostname) {
  if (PRIVATE_RE.test(hostname)) return true;
  if (IP_RE.test(hostname)) {
    const parts = hostname.split('.').map(Number);
    if (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) || parts[0] === 127) return true;
  }
  return false;
}

function _safeResultItem(r) {
  if (!r) return null;
  const url = String(r.url || '').trim();
  if (!/^https:\/\//i.test(url)) return null;
  const host = _host(url);
  if (!host || _isPrivateHost(host)) return null;
  return { title: _clean(r.title).slice(0, 300), snippet: _clean(r.snippet).slice(0, 400), url, source: String(r.source || 'web') };
}

async function _httpText(url, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'user-agent': 'ShaddaiResearch/1.0', accept: 'text/html,application/xhtml+xml,application/xml,*/*', 'accept-language': 'en', ...(headers || {}) } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ── Engine 1: Google News RSS (keyless, trustworthy sources, fresh) ─────────
async function googleNews(query, limit) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) +
    '&hl=en-US&gl=US&ceid=US:en';
  const xml = await _httpText(url);
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const title = _clean((/<title>([\s\S]*?)<\/title>/i.exec(block) || [])[1]);
    const link = (/(?:<link[^>]*>)([\s\S]*?)(?:<\/link>|$)/i.exec(block) || [])[1];
    const descRaw = _clean((/<description>([\s\S]*?)<\/description>/i.exec(block) || [])[1]);
    const desc = _clean(descRaw.replace(/<[^>]+>/g, ' '));
    const pub = _clean((/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block) || [])[1]);
    if (title && link) {
      items.push({ title, snippet: desc.slice(0, 300), url: link.trim(), source: 'google-news', published: pub });
    }
  }
  return items;
}

// ── Engine 2: DuckDuckGo HTML (keyless, organic web) ────────────────────────
async function duckDuckGo(query, limit) {
  const html = await _httpText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query));
  const items = [];
  const aRe = /<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const sRe = /<a[^>]+class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = [...html.matchAll(aRe)];
  const snippets = [...html.matchAll(sRe)];
  anchors.forEach((a, i) => {
    if (items.length >= limit) return;
    let href = a[1] || '';
    const m = /uddg=([^&]+)/.exec(href);
    if (m) { try { href = decodeURIComponent(m[1]); } catch {} }
    const title = _clean(a[2]);
    const snippet = _clean(i < snippets.length ? snippets[i][1] : '');
    items.push({ title, snippet, url: href, source: 'duckduckgo' });
  });
  return items;
}

// ── Engine 3: SerpAPI (only if SERPAPI_KEY is set) ───────────────────────────
async function serpapi(query, limit) {
  const key = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || '';
  if (!key) throw new Error('SERPAPI_KEY not set');
  const res = await fetch('https://serpapi.com/search?q=' + encodeURIComponent(query) +
    '&api_key=' + encodeURIComponent(key) + '&engine=google&num=' + limit, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error('SerpAPI HTTP ' + res.status);
  const data = await res.json();
  return (data.organic_results || []).slice(0, limit).map(r => ({
    title: r.title || '', snippet: r.snippet || '', url: r.link || '', source: 'serpapi',
  }));
}

// ── Public: search the web, keyless first ───────────────────────────────────
// Returns { ok, query, engine, count, results: [{title,snippet,url,source,published?}] }
async function webSearch(query, opts) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return { ok: false, error: 'query required', results: [] };
  const limit = Math.max(1, Math.min(parseInt((opts && opts.limit), 10) || 8, MAX_RESULTS));
  const engines = Array.isArray(opts && opts.engines) ? opts.engines : (process.env.SERPAPI_KEY ? ['serpapi', 'google-news', 'duckduckgo'] : ['google-news', 'duckduckgo']);

  const perEngine = Math.max(3, Math.ceil(limit * 1.5));
  const results = [];
  let usedEngine = null;
  for (const engine of engines) {
    if (results.length >= limit) break;
    try {
      const fn = engine === 'google-news' ? googleNews : engine === 'duckduckgo' ? duckDuckGo : engine === 'serpapi' ? serpapi : null;
      if (!fn) continue;
      const hits = await fn(q, perEngine);
      for (const h of hits) { const safe = _safeResultItem(h); if (safe) results.push(safe); if (results.length >= limit) break; }
      if (hits.length && !usedEngine) usedEngine = engine;
    } catch (e) {
      console.warn('[websearch] engine ' + engine + ' failed: ' + ((e && e.message) || e));
    }
  }
  const seen = new Set();
  const deduped = results.filter(r => { const k = r.url; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
  return { ok: true, query: q, engine: usedEngine || 'none', count: deduped.length, results: deduped, engines };
}

// Express handler for GET /api/search/web?q= — shape matches the UI contract
// (public/index.html runWebSearch + brain.html).
function handler(req, res) {
  webSearch(req.query.q, { limit: Number(req.query.limit) || 8 })
    .then(r => {
      if (!r.ok) return res.status(400).json(r);
      res.json({ ok: true, query: r.query, engine: r.engine, results: r.results, count: r.count });
    })
    .catch(e => res.status(500).json({ ok: false, error: (e && e.message) || String(e), results: [] }));
}

module.exports = { webSearch, handler, googleNews, duckDuckGo, serpapi, _safeResultItem, _isPrivateHost };