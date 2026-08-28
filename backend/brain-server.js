'use strict';

/**
 * brain-server.js
 * Local in-process replacement for the standalone `python brain_server.py`
 * that public/brain.html expects on http://localhost:8787.
 *
 * Serves the exact same JSON contract — /api/overview, /api/search,
 * /api/summary, /api/council, /api/ask, /api/synthesize, /api/crosstalk,
 * /api/books, /api/booksearch, /api/gallery, /api/rooms/* — but backed by the
 * corpus adapter (backend/brain-index.js) + brain_agent_stats.json so the whole
 * 95,893-chunk brain works with ZERO extra processes. Mount at `/api`.
 *
 * If an LLM provider is configured (via backend/llm-client.js chain), /ask and
 * /synthesize produce real grounded answers; otherwise they fall back to a
 * RAG-only synthesis so the UI never dead-ends.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const brainIndex = require('./brain-index');
const ragIndex = require('./rag-index');
const knowledge = require('./lib/knowledge');

const BRAIN_DIR = process.env.SHADDAI_BRAIN_DIR ||
  path.join('C:', 'Users', 'Brittany', 'Documents', 'SHADDAI-SYSTEM', 'rag');
const RAG_KB_DIR = path.join(__dirname, 'data', 'rag');
const GALLERY_DIR = process.env.SHADDAI_GALLERY_DIR ||
  path.join('C:', 'Users', 'Brittany', 'Documents', 'SHADDAI-SYSTEM', 'gallery');

const AGENT_ORDER = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];

const AGENT_META = {
  SHADDAI: { role: 'Strategy, decisions',                    color: '#e8c45c' },
  NEXUS:   { role: 'Backend, APIs, infrastructure',          color: '#4fc3f7' },
  ZEROX:   { role: 'Billing, business, revenue',             color: '#ce93d8' },
  ORACLE:  { role: 'Research & intelligence',                color: '#fff176' },
  TURTLE:  { role: 'UI/UX & creative',                       color: '#80cbc4' },
  QUILL:   { role: 'Writing & communication',                color: '#ef9a9a' },
  PIKADON: { role: 'Security & compliance',                  color: '#ff8a65' },
};

const SYSTEM_PROMPTS = {
  SHADDAI: 'You are SHADDAI, the supreme orchestrator of a 7-agent AI empire. Give strategic, long-term answers focused on product-market fit and revenue. Be decisive and confident.',
  NEXUS:   'You are NEXUS, the technical architect. Answer with correctness, scalability and pragmatism. Favor simple, testable solutions over clever abstractions.',
  ZEROX:   'You are ZEROX, the wealth & revenue engine. Think in terms of MRR, LTV, unit economics, billing and pricing. Be growth-focused and concrete with numbers.',
  ORACLE:  'You are ORACLE, the research & intelligence specialist. Be curious, thorough, and connect dots. Question assumptions and cite knowledge when possible.',
  TURTLE:  'You are TURTLE, the UI/UX & creative. Answer about design, feel, flow and brand. Care about visual quality and user delight.',
  QUILL:   'You are QUILL, the writing & communication specialist. Be clear, articulate, and detail-oriented. Focus on how the user reads and understands.',
  PIKADON: 'You are PIKADON, the security & compliance guardian. Assume worst-case scenarios, check assumptions ruthlessly, and focus on hardening and audit trails.',
};

const router = express.Router();
const _llm = { get: null };
function getLLM() {
  if (_llm.get) return _llm.get;
  try { _llm.get = require('./llm-client'); } catch (_) { _llm.get = null; }
  return _llm.get;
}

// ── free/pro quota gate (server-side — the client-side counter in brain.html is
// UX only and trivially bypassable by calling /api/ask directly or clearing
// localStorage). Pro/Alpha/Builder tier = unlimited; everyone else gets
// FREE_ASK_LIMIT grounded queries per day. Mirrors brain.html's FREE_LIMIT=3.
// In-memory (matches auth-guard.js's rateLimit pattern) — resets on restart,
// which is fine for a soft daily cap; swap for Firestore if it needs to survive
// restarts before this goes to real paid enforcement.
const FREE_ASK_LIMIT = 3;
const _freeAskUsage = new Map(); // "userId:YYYY-MM-DD" -> count
let _billing = null, _billingTried = false;
function getBilling() {
  if (_billingTried) return _billing;
  _billingTried = true;
  try { _billing = require('./billing-service'); } catch (_) { _billing = null; }
  return _billing;
}
function isProUser(userId) {
  if (!userId || userId === 'local' || userId === 'anon') return false;
  const billing = getBilling();
  if (!billing) return false;
  try {
    const customer = billing.getCustomer(userId);
    // Canonical tiers live in billing-service.js's TIER_CONFIG: free/pro/elite.
    // (brain.html's client-side counter checks a stale pro/alpha/builder set
    // from an older pricing scheme — that's UI-only cosmetics, not authoritative;
    // this is the real gate, so it must match TIER_CONFIG.)
    return !!(customer && customer.tier && customer.tier !== 'free');
  } catch (_) { return false; }
}
function checkFreeQuota(req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  const uid = (isProd ? '' : (req.headers['x-user-id'] || '')) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || 'anon';
  if (isProUser(uid)) return true;
  const day = new Date().toISOString().slice(0, 10);
  const key = uid + ':' + day;
  const count = _freeAskUsage.get(key) || 0;
  if (count >= FREE_ASK_LIMIT) {
    res.status(402).json({
      error: 'free query limit reached',
      limit: FREE_ASK_LIMIT,
      message: `Free tier gets ${FREE_ASK_LIMIT} grounded queries/day. Upgrade to Pro for unlimited.`,
      upgrade: '/pricing.html',
    });
    return false;
  }
  _freeAskUsage.set(key, count + 1);
  return true;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function kb(agent) { return 'kb_' + String(agent || '').toLowerCase(); }

// Fallback stats from the populated per-agent RAG store (backend/data/rag) so
// /overview + /summary stay live on Render where the 95k-chunk corpus is absent.
// Computes real WORDS / TERMS / SYSTEMS / top_terms from the per-agent
// docs.json + idf.json so brain.html never shows zeros.
let _ragStatsCache = null, _ragStatsAt = 0;
function loadRagStats() {
  if (_ragStatsCache && Date.now() - _ragStatsAt < 60000) return _ragStatsCache;
  const agents = {};
  let totalChunks = 0, totalVideos = 0, totalWords = 0;
  const allTerms = new Set();
  for (const id of AGENT_ORDER) {
    const dir = path.join(RAG_KB_DIR, kb(id));
    let docs = [], idf = {};
    try { docs = JSON.parse(fs.readFileSync(path.join(dir, 'docs.json'), 'utf8')); } catch (_) {}
    try { idf = JSON.parse(fs.readFileSync(path.join(dir, 'idf.json'), 'utf8')); } catch (_) {}
    let chunks = 0, words = 0;
    for (const d of docs) {
      const dc = d.chunks || [];
      chunks += dc.length;
      for (const c of dc) words += String(c.text || '').split(/\s+/).filter(Boolean).length;
    }
    const terms = Object.keys(idf);
    terms.forEach(t => { if (t && t.length > 1) allTerms.add(t); });
    const top_terms = terms
      .filter(t => t && t.length > 1 && t.length <= 24)
      .sort((a, b) => (idf[b] || 0) - (idf[a] || 0))
      .slice(0, 25);
    agents[id] = {
      videos: docs.length,
      chunks,
      words,
      topics: [],
      systems: [id],
      channels: [],
      top_terms,
      titles: docs.slice(0, 10).map(d => d.name || ''),
    };
    totalChunks += chunks;
    totalVideos += docs.length;
    totalWords += words;
  }
  const out = {
    agents,
    total_chunks: totalChunks,
    total_videos: totalVideos,
    total_words: totalWords,
    total_terms: allTerms.size,
    all_systems: AGENT_ORDER.slice(),
    built: 'rag-store',
  };
  _ragStatsCache = out;
  _ragStatsAt = Date.now();
  return out;
}

// Search one agent's knowledge by MERGING two indexes:
//   • per-agent rag store (backend/data/rag/kb_*) — carries the digestion
//     pipeline's DIGEST_/MASTERY_ docs with ≈timestamps + deep links
//   • 95k-chunk corpus adapter (brain-index) — human-titled knowledge cards,
//     no chunk timestamps (predates the pipeline), so none are invented
// Digest hits get a score boost so ORGANIZED knowledge outranks raw walls.
function normScores(arr) {
  const m = Math.max(1e-9, ...arr.map(h => h.score || 0));
  arr.forEach(h => { h.score = (h.score || 0) / m; });
  return arr;
}

/* ── digest metadata ──────────────────────────────────────────────────────
   Search hits carry the DOCUMENT name ("DIGEST_hormozi_100m_offer"), which is
   an id, not a title — showing it is exactly the "title plus two random
   sentences" problem. The digest store holds the real synthesized title and
   topics, so read them from there and attach them to the hit.
   Cached with an mtime check so an upgrade run is picked up without a
   restart. */
const _digestCache = new Map();
function digestMeta(agent) {
  const ns = kb(agent);
  const file = path.join(RAG_KB_DIR, ns, 'digests.json');
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { return new Map(); }
  const cached = _digestCache.get(ns);
  if (cached && cached.mtime === mtime) return cached.map;
  const map = new Map();
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    (store.digests || []).forEach((d) => {
      if (d && d.name) map.set(d.name, { title: d.title || '', topics: d.topics || [], url: d.url || null });
    });
  } catch {}
  _digestCache.set(ns, { mtime, map });
  return map;
}

function searchChunks2(agent, q, k, opts) {
  const ns = kb(agent);
  let ragHits = [];
  try {
    ragHits = (ragIndex.searchUser(ns, q, Math.max(4, Math.min(k, 12))) || []).map(h => ({
      agent,
      title: h.docName || '',
      score: h.score || 0,
      text: h.chunkText || '',
      system: '', topic: '', channel: '', words: 0,
      topics: [],
      video_id: h.videoIdOf || h.docId || '',
      kind: /^DIGEST_|^MASTERY_/.test(h.docName || '') ? 'digest' : 'transcript',
      t0: h.t0, t1: h.t1,
      timeLabel: h.timeLabel || null, tsEstimate: !!h.tsEstimate,
      deepLink: h.deepLink || null,
    }));
    normScores(ragHits);
    ragHits.forEach(h => { h.score *= h.kind === 'digest' ? 1.35 : 1.05; });
    // a hit carries the DOCUMENT name ("DIGEST_hormozi_100m_offer"), which is an
    // id, not a title. Swap in the real synthesized title + topics.
    const meta = digestMeta(agent);
    ragHits.forEach((h) => {
      const m = /^DIGEST_(.+)$/.exec(h.title || '');
      const d = m && meta.get(m[1]);
      if (!d) return;
      if (d.title) h.title = d.title;
      if (d.topics.length) h.topics = d.topics;
      if (d.url && !h.deepLink) h.deepLink = d.url;
    });
  } catch (_) {}
  let corpusHits = [];
  try {
    corpusHits = (brainIndex.searchChunks(ns, q, k, opts) || []).map(h => ({
      ...h,
      kind: h.kind || 'corpus',
      timeLabel: null, tsEstimate: false, deepLink: null,
    }));
    normScores(corpusHits);
  } catch (_) {}
  const seen = new Set();
  const merged = [];
  for (const h of [
    ...ragHits.filter(x => x.kind === 'digest'),
    ...corpusHits,
    ...ragHits.filter(x => x.kind !== 'digest'),
  ]) {
    const key = String(h.text || '').slice(0, 60).toLowerCase() + '|' + String(h.title || '');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(h);
  }
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, Math.max(k, 1));
}

function listUserDocs2(agent, opts) {
  try {
    const hits = brainIndex.listUserDocs(kb(agent), opts);
    if (hits && hits.length) return hits;
  } catch (_) {}
  try { return ragIndex.listUserDocs(kb(agent)); } catch (_) { return []; }
}

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(path.join(BRAIN_DIR, 'brain_agent_stats.json'), 'utf8'));
  } catch (_) { return loadRagStats(); }
}

function agentInfo(id) {
  const m = AGENT_META[id] || { role: '', color: '#888' };
  return { id, role: m.role, color: m.color };
}

// Grounded LLM answer. Returns null when no provider works.
async function groundedLLM(agentId, query, chunks) {
  const llm = getLLM();
  if (!llm || !llm.callLLM) return null;
  const meta = AGENT_META[agentId] || AGENT_META.SHADDAI;
  const context = (chunks || []).slice(0, 5).map((c, i) =>
    `[${i + 1}] (${c.system || c.topic || 'knowledge'}) ${(c.text || '').slice(0, 900)}`
  ).join('\n\n');
  // five-layer grounding: route guidance + digested knowledge + tools ledger
  const layers = knowledge.contextFor(agentId, query);
  const sys = `${SYSTEM_PROMPTS[agentId] || SYSTEM_PROMPTS.SHADDAI}\n\n${layers}\n\nGrounded knowledge excerpts (use them, cite sources naturally — when a ≈timestamp is present, mention it):\n${context}`;
  try {
    const r = await llm.callLLM(
      [{ role: 'system', content: sys }, { role: 'user', content: query }],
      { maxTokens: 900, agentName: agentId, temperature: 0.35 }
    );
    return { content: r.content, provider: r.provider, model: r.model };
  } catch (_) { return null; }
}

// RAG-only synthesis when no LLM — never dead-end the council.
function ragFallback(agentId, query, chunks) {
  const best = chunks[0];
  if (!best) return null;
  const title = best.title ? `\nFrom: ${best.title}` : '';
  const topic = best.topic ? `\nTopic: ${best.topic}` : '';
  return {
    content: `RAG retrieval for "${query.slice(0, 80)}"${title}${topic}\n\n${(best.text || '').slice(0, 900)}`,
    provider: 'rag-only',
    model: 'tfidf-corpus',
  };
}

// ── overview ─────────────────────────────────────────────────────────────────
router.get('/overview', (req, res) => {
  const b = brainIndex._internal.brain();
  const stats = loadStats();
  const meta = b.ok ? b.meta : null;

  const agents = AGENT_ORDER.map(id => {
    const a = (stats && stats.agents && stats.agents[id]) || {};
    return {
      id,
      docs: a.videos || 0,
      chunks: a.chunks || 0,
      tools: 0,
      words: a.words || 0,
      topics: a.topics || [],
      systems: a.systems || [],
      channels: a.channels || [],
      top_terms: a.top_terms || [],
      titles: (a.titles || []).slice(0, 10),
    };
  });

  const totalChunks = agents.reduce((s, a) => s + a.chunks, 0);
  const totalVideos = agents.reduce((s, a) => s + a.docs, 0);
  const totalWords = agents.reduce((s, a) => s + a.words, 0);

  res.json({
    ok: true,
    built: meta ? meta.built : (stats && stats.built) || null,
    videos: totalVideos,
    chunks: totalChunks,
    terms: (meta && meta.n_terms) || (stats && stats.total_terms) || 0,
    words: totalWords,
    systems: (stats && stats.all_systems) || [],
    agents,
    n_chunks: meta ? meta.n_chunks : totalChunks,
  });
});

// ── search (per-agent or whole brain) ────────────────────────────────────────
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const agent = String(req.query.agent || '').trim().toUpperCase();
  const k = Math.max(1, Math.min(parseInt(req.query.k, 10) || 6, 30));
  if (!q) return res.json({ results: [], ms: 0 });

  const start = Date.now();
  let results = [];

  if (agent) {
    results = searchChunks2(agent, q, k);
  } else {
    for (const id of AGENT_ORDER) {
      const hits = searchChunks2(id, q, Math.max(1, Math.ceil(k / AGENT_ORDER.length)));
      results = results.concat(hits.map(h => ({ ...h, agent: id })));
    }
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, k);
  }

  res.json({ results, ms: Date.now() - start });
});

// ── digests (organized knowledge from the digestion pipeline) ───────────────
router.get('/digests', (req, res) => {
  const agent = String(req.query.agent || 'SHADDAI').trim().toUpperCase();
  const ns = knowledge.nsFor(agent);
  try {
    const file = path.join(RAG_KB_DIR, 'kb_' + agent.toLowerCase(), 'digests.json');
    if (!fs.existsSync(file)) return res.json({ agent, digests: [] });
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')).digests || [];
    const list = raw.map(d => ({
      name: d.name,
      source: d.source || d.name,
      videoId: d.videoId || null,
      url: d.url || null,
      title: d.title,
      thesis: String(d.thesis || '').slice(0, 240),
      chapters: (d.chapters || []).length,
      insights: (d.chapters || []).reduce((n, c) => n + ((c.insights || []).length), 0),
      quotes: (d.quotes || []).length,
      runtimeLabel: d.runtimeLabel || (d.durationSec ? ragIndex._internal.fmtTime(d.durationSec) : ''),
      tsMode: d.tsMode,
      generatedAt: d.generatedAt,
    }));
    res.json({ agent, count: list.length, digests: list });
  } catch (e) {
    res.status(500).json({ error: 'digests unavailable', detail: String(e.message || e) });
  }
});

router.get('/digest', (req, res) => {
  const agent = String(req.query.agent || '').trim().toUpperCase();
  const name = String(req.query.name || '').trim();
  if (!agent || !name) return res.status(400).json({ error: 'agent and name required' });
  try {
    const file = path.join(RAG_KB_DIR, 'kb_' + agent.toLowerCase(), 'digests.json');
    const d = (JSON.parse(fs.readFileSync(file, 'utf8')).digests || [])
      .find(x => x.name === name || x.source === name ||
                 x.name === 'DIGEST_' + name || 'DIGEST_' + x.name === name);
    if (!d) return res.status(404).json({ error: 'digest not found' });
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: 'digest unavailable', detail: String(e.message || e) });
  }
});

// ── routes of use (goal → playbook → sources per agent) ─────────────────────
router.get('/routes', (req, res) => {
  const agent = String(req.query.agent || '').trim().toUpperCase();
  const q = String(req.query.q || '').trim();
  const all = knowledge.routesIndex().routes || {};
  if (!agent) {
    const counts = {}; Object.entries(all).forEach(([a, rs]) => { counts[a] = rs.length; });
    return res.json({ routes: all, counts });
  }
  const list = all[agent] || [];
  if (q) {
    const matched = knowledge.matchRoute(agent, q);
    return res.json({
      agent, query: q,
      route: matched,
      context: matched ? knowledge.routeContext(agent, q) : null,
      digestRecall: knowledge.digestRecall(agent, q, 3),
    });
  }
  res.json({ agent, count: list.length, routes: list });
});

// ── tools ledger (living registry of the stack) ──────────────────────────────
router.get('/tools', (req, res) => {
  const led = knowledge.toolsLedger();
  res.json({ version: led.version, updated: led.updated, policy: led.policy, tools: led.tools || [] });
});

// ── summary ──────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const agent = String(req.query.agent || 'SHADDAI').trim().toUpperCase();
  const stats = loadStats();
  const a = (stats && stats.agents && stats.agents[agent]) || {};

  const topics = a.topics || [];
  const channels = a.channels || [];
  const topTerms = a.top_terms || [];
  const titles = (a.titles || []).slice(0, 6);

  const tagline = topTerms.length
    ? topTerms.slice(0, 8).map(([t, n]) => t + ' (' + n + ')').join(', ')
    : (a.videos || 0) + ' knowledge sources';

  let llm = null;
  try {
    llm = await groundedLLM(agent, `Summarize the core expertise and specializations of the ${agent} knowledge corpus. Cover its main topics, focus areas, and what makes it authoritative. 3-4 sentences.`, []);
  } catch (_) { llm = null; }

  res.json({
    agent,
    summary: `${agent} corpus: ${a.chunks || 0} chunks · ${a.videos || 0} sources · focus on ${tagline}.`,
    topics,
    channels,
    top_terms: topTerms,
    titles,
    llm: llm ? llm.content : null,
    llm_powered: !!llm,
  });
});

// ── council ──────────────────────────────────────────────────────────────────
router.get('/council', async (req, res) => {
  if (!checkFreeQuota(req, res)) return;
  const q = String(req.query.q || '').trim();
  const k = Math.max(1, Math.min(parseInt(req.query.k, 10) || 3, 10));
  if (!q) return res.json({ agents: [], ms: 0 });

  const start = Date.now();
  const agents = AGENT_ORDER.map(id => {
    const meta = agentInfo(id);
    const hits = searchChunks2(id, q, k);
    return {
      id,
      role: meta.role,
      color: meta.color,
      score: hits.length ? hits[0].score : 0,
      chunks: hits.length,
      results: hits.slice(0, k).map(h => ({
        title: h.title, text: h.text, channel: h.channel,
        system: h.system, topic: h.topic, video_id: h.video_id, score: h.score,
      })),
    };
  });

  res.json({ agents, ms: Date.now() - start });
});

// ── ask (single agent, LLM-grounded) ────────────────────────────────────────
router.get('/ask', async (req, res) => {
  if (!checkFreeQuota(req, res)) return;
  const q = String(req.query.q || '').trim();
  const agent = String(req.query.agent || 'SHADDAI').trim().toUpperCase();
  const k = Math.max(1, Math.min(parseInt(req.query.k, 10) || 6, 15));
  if (!q) return res.status(400).json({ error: 'missing q' });

  const start = Date.now();
  const hits = searchChunks2(agent, q, k);
  let answer = null;

  if (hits.length) {
    answer = await groundedLLM(agent, q, hits) || ragFallback(agent, q, hits);
  }
  if (!answer) {
    answer = { content: 'No grounded knowledge matched this query, and no LLM provider was reachable.', provider: 'none', model: '' };
  }

  const meta = AGENT_META[agent] || {};
  res.json({
    agent,
    role: meta.role || '',
    answer: answer.content,
    llm_powered: answer.provider !== 'rag-only' && answer.provider !== 'none',
    provider: answer.provider,
    ms: Date.now() - start,
    sources: hits.slice(0, 5).map(h => ({
      agent, title: h.title, score: h.score,
      snippet: (h.text || '').slice(0, 200),
      video_id: h.video_id,
      kind: h.kind || 'transcript',
      timeLabel: h.timeLabel || null,
      tsEstimate: !!h.tsEstimate,
      deepLink: h.deepLink || null,
    })),
  });
});

// ── synthesize (all 7 agents, LLM-grounded per agent) ───────────────────────
router.get('/synthesize', async (req, res) => {
  if (!checkFreeQuota(req, res)) return;
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing q' });

  const start = Date.now();
  const results = await Promise.allSettled(AGENT_ORDER.map(async id => {
    const meta = agentInfo(id);
    const hits = searchChunks2(id, q, 4);
    let ans = null;
    if (hits.length) ans = await groundedLLM(id, q, hits) || ragFallback(id, q, hits);
    return {
      agent: id,
      role: meta.role,
      score: hits.length ? hits[0].score : 0,
      rag_used: hits.length,
      answer: ans ? ans.content : null,
      llm_powered: !!(ans && ans.provider !== 'rag-only' && ans.provider !== 'none'),
      top: hits.slice(0, 2).map(h => ({ title: h.title, score: h.score })),
    };
  }));

  const agents = results.map(r => r.status === 'fulfilled' ? r.value : {
    agent: 'SHADDAI', role: '', score: 0, rag_used: 0, answer: null, llm_powered: false, top: [],
  });

  res.json({ agents, ms: Date.now() - start, llm_powered: agents.some(a => a.llm_powered) });
});

// ── crosstalk ───────────────────────────────────────────────────────────────
router.get('/crosstalk', (req, res) => {
  if (!checkFreeQuota(req, res)) return;
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ thread: [], ms: 0, agents_with_signal: 0 });

  const start = Date.now();
  const thread = AGENT_ORDER.map(id => {
    const meta = agentInfo(id);
    const hits = searchChunks2(id, q, 3);
    const best = hits[0] || null;
    return {
      agent: id,
      label: meta.role,
      color: meta.color,
      has_signal: !!best,
      score: best ? best.score : 0,
      snippet: best ? String(best.text).slice(0, 300) : '',
      title: best ? best.title : '',
      channel: best ? best.channel : '',
      video_id: best ? best.video_id : '',
    };
  });

  res.json({
    thread,
    ms: Date.now() - start,
    agents_with_signal: thread.filter(t => t.has_signal).length,
  });
});

// ── books ───────────────────────────────────────────────────────────────────
let _booksCache = null;
function booksIndex() {
  if (_booksCache) return _booksCache;
  const p = path.join(BRAIN_DIR, 'books_chunks.jsonl');
  if (!fs.existsSync(p)) { _booksCache = []; return _booksCache; }
  const byBook = new Map();
  brainIndex.forEachJsonlSync(p, (c) => {
    const key = c.video_id || c.id || c.title || 'unknown';
    if (!byBook.has(key)) {
      byBook.set(key, {
        id: key, title: c.title || key, topic: c.topic || '',
        video_id: key, chunks: 0, texts: [], text: '',
      });
    }
    const b = byBook.get(key);
    b.chunks += 1;
    b.texts.push(c.text || '');
  });
  for (const b of byBook.values()) b.text = b.texts.join('\n\n');
  _booksCache = [...byBook.values()];
  return _booksCache;
}

router.get('/books', (req, res) => {
  const books = booksIndex().map(b => ({
    title: b.title,
    topic: b.topic,
    author: null,
    public_domain: /gutenberg|project gutenberg|public domain/i.test(b.title + ' ' + b.topic),
    chunks: b.chunks,
    has_text: b.chunks > 0,
  }));
  res.json({ books, count: books.length });
});

router.get('/booksearch', (req, res) => {
  const q = String(req.query.q || '').trim();
  const k = Math.max(1, Math.min(parseInt(req.query.k, 10) || 8, 20));
  if (!q) return res.json({ results: [], ms: 0 });

  const start = Date.now();
  const qTokens = new Set(brainIndex._internal.tokenize(q));
  if (!qTokens.size) return res.json({ results: [], ms: 0 });

  const scored = [];
  for (const b of booksIndex()) {
    const text = (b.text || '').toLowerCase();
    const hits = [...qTokens].filter(t => text.includes(t)).length;
    if (hits > 0) {
      scored.push({
        title: b.title,
        video_id: b.video_id || b.id,
        topic: b.topic,
        score: Math.round((hits / qTokens.size) * 1000) / 1000,
        text: b.text.slice(0, 600),
      });
    }
  }
  scored.sort((a, b2) => b2.score - a.score);
  res.json({ results: scored.slice(0, k), ms: Date.now() - start });
});

// ── gallery ─────────────────────────────────────────────────────────────────
const GALLERY_EXTS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];

router.get('/gallery', (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(GALLERY_DIR).filter(f => GALLERY_EXTS.includes(path.extname(f).toLowerCase()));
  } catch (_) {}
  res.json({
    count: files.length,
    images: files.map(f => ({ file: f, url: '/api/gallery/img/' + encodeURIComponent(f) })),
  });
});

router.get('/gallery/img/:file', (req, res) => {
  const file = path.basename(String(req.params.file || ''));
  const p = path.join(GALLERY_DIR, file);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// ── rooms ───────────────────────────────────────────────────────────────────
const ROOM_STYLES = ['archive', 'library', 'vault', 'lab', 'observatory', 'crypt', 'workshop', 'studio'];

function makeRoom(agent, idx) {
  const meta = agentInfo(agent);
  const hits = listUserDocs2(agent).slice(0, 8);
  const theme = (hits[idx % hits.length] || { name: agent + ' knowledge' }).name || (agent + ' knowledge');
  const assets = hits.slice(0, 4).map(h => ({
    title: h.name,
    topic: agent,
    channel: 'corpus',
    snippet: '',
    video_id: h.id || '',
  }));
  return {
    id: `${agent.toLowerCase()}-${Date.now()}-${idx}`,
    agent,
    room_num: String(idx + 1).padStart(2, '0'),
    name: theme,
    theme,
    style: ROOM_STYLES[(idx + agent.length) % ROOM_STYLES.length],
    color: meta.color,
    ttl: 120,
    assets,
  };
}

router.get('/rooms/bulk', (req, res) => {
  const rooms = [];
  AGENT_ORDER.forEach((id, ai) => {
    const n = 2 + ((ai * 3) % 2);
    for (let i = 0; i < n; i++) rooms.push(makeRoom(id, i));
  });
  res.json({ rooms, count: rooms.length });
});

router.get('/rooms/generate', (req, res) => {
  const agent = String(req.query.agent || 'SHADDAI').trim().toUpperCase();
  const idx = Math.floor(Math.random() * 6);
  res.json(makeRoom(agent, idx));
});

module.exports = router;
