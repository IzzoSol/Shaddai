// backend/lib/research-learn.js
// ============================================================================
// SHADDAI RESEARCH → LEARN LOOP (ORACLE + NEXUS)
// ----------------------------------------------------------------------------
// Search the live web (keyless), scrape the most relevant public pages (SSRF-
// guarded), and fold them into a specific agent KB via rag-index so the brain
// GROWS from real data — not just the boot-time transcript corpus.
//
// POST /api/research/learn   { q, agent='ORACLE', limit=3, maxChars=60000 }
//   → { ok, agent, query, learned: [{docId,title,url,chars,deduped}], totalChars }
//
// Security (PIKADON): each scrape goes through lib/web-scrape.js which blocks
// private/loopback hosts and https-only; dedupe by doc name prevents the KB
// from accumulating duplicates across runs.
// ============================================================================
'use strict';

const websearch = require('./websearch');
const scraper = require('./web-scrape');
const rscrape = require('./rag-scrape');

const AGENTS = rscrape.AGENTS || ['SHADDAI', 'ORACLE', 'ZEROX', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];
const MAX_LIMIT = 6;

function _agentDir(agent) {
  const a = String(agent || '').trim().toUpperCase();
  return AGENTS.includes(a) ? a : null;
}
function _slugFromUrl(url) {
  const u = new URL(url);
  const base = u.hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const tail = u.pathname.split('/').filter(Boolean).pop() || '';
  const t = tail.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return (base + (t ? '-' + t : '')).slice(0, 60) || 'page';
}

// Search → scrape → ingest. Returns { ok } or { ok, agent, query, reviewHits,
// learned:[...], totalChars, skipped:[...] }
async function researchLearn({ q, agent, limit, maxChars }) {
  const query = String(q || '').trim().slice(0, 300);
  if (!query) return { ok: false, error: 'q required' };
  const a = _agentDir(agent);
  if (!a) return { ok: false, error: 'agent must be one of: ' + AGENTS.join(', ') };

  // Skip redirect stubs that render as JS shells (news.google.com RSS links).
  const IS_REDIRECT_STUB = /^https:\/\/news\.google\.com\/rss\/articles\//;

  const n = Math.max(1, Math.min(parseInt(limit, 10) || 3, MAX_LIMIT));
  // Prefer DuckDuckGo's real article URLs for scraping. Google News RSS yields
  // news.google.com/rss/articles/<token> redirect stubs that render as JS shells
  // and scrape to ~0 readable chars — useless to the KB. DDG first, news as a
  // review-only fallback (kept behind `reviewHits` for ORACLE to eyeball).
  const search = await websearch.webSearch(query, { limit: n * 2, engines: ['duckduckgo', 'google-news'] });
  const learned = [];
  const skipped = [];

  for (const hit of (search.results || []).slice(0, n)) {
    if (IS_REDIRECT_STUB.test(hit.url || '')) { skipped.push({ url: hit.url, reason: 'redirect stub — not scrapeable' }); continue; }
    const result = await rscrape.ingest({
      agent: a,
      url: hit.url,
      slug: hit.title ? _slugFromUrl(hit.url) : undefined,
      maxChars: maxChars || 60000,
    });
    if (result && result.ok) {
      learned.push({
        docId: result.docId, title: result.title || hit.title, url: result.url || hit.url,
        chars: result.chars, deduped: !!result.deduped, path: result.path || null,
      });
    } else {
      skipped.push({ url: hit.url, reason: (result && result.error) || 'ingest failed' });
    }
  }

  return {
    ok: true,
    agent: a,
    query,
    engine: search.engine || 'none',
    learned,
    skipped,
    totalChars: learned.reduce((s, l) => s + (l.chars || 0), 0),
    links: (search.results || []).slice(0, n).map(r => r.url),
  };
}

// Express handler for POST /api/research/learn
function handler(req, res) {
  const b = (req && req.body) || {};
  researchLearn({ q: b.q, agent: b.agent, limit: b.limit, maxChars: b.maxChars })
    .then(r => { const code = r.ok ? 200 : 400; res.status(code).json(r); })
    .catch(e => res.status(500).json({ ok: false, error: (e && e.message) || String(e) }));
}

module.exports = { researchLearn, handler, AGENTS, _agentDir, _slugFromUrl };