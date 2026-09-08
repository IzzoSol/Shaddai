// backend/aura-brain.js — AURA BRAIN: boxed knowledge (INGEST → COMPARTMENT → SERVE).
//
// INGEST   → Jina Reader (JINA_API_KEY) → Firecrawl (FIRECRAWL_API_KEY)
//            → bundled SSRF-guarded web-scrape.js. Always a clean markdown/text.
// COMPARTMENT → boxes are labeled compartments, NOT one giant vector dump:
//            hall/<owner>/<slug>          readable by everyone, free
//            <office>/<owner>/<slug>      readable only by its owning agent/user
//            ugly/index/<owner>           (any tuple) readable by the owner only
// SERVE    → aura_ingest, aura_search, aura_boxes on MCP + Telegram /learn /ask.
//
// Search is per-box TF-IDF cosine over ~500-token chunks (zero deps, pure Node).
// PIKADON: https-only + public-IP SSRF guard + internal-path blocklist +
//          per-user daily ingest cap (metered; paid after the free quota).
//
// Deliberately NOT wired: Libretto / Chromium / one-global-vector-store. Libretto
// stays NEXUS-only (see docs/STATUS.md). Boxes are the whole architecture.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const scraper = require('./lib/web-scrape');

const DEFAULT_DATA_DIR = path.join(__dirname, 'data', 'aura-boxes');
// Resolved lazily so AURA_BRAIN_DATA_DIR can be set (tests, sandboxes) after require.
const dataDir = () => process.env.AURA_BRAIN_DATA_DIR ? path.resolve(process.env.AURA_BRAIN_DATA_DIR) : DEFAULT_DATA_DIR;
const REGISTRY_FILE = () => path.join(dataDir(), 'boxes.json');
const QUOTA_FILE = () => path.join(dataDir(), 'ingest-daily.json');

const DEFAULT_FREE_INGESTS = 5;          // free ingests / user / UTC day
const MAX_CHUNK_CHARS = 2000;            // ≈ 500 tokens
const CHUNK_OVERLAP = 160;               // carries context across chunk seams
const MAX_CHUNKS_PER_BOX = 600;          // PIKADON cap: no unbounded boxes
const MAX_SEARCH_K = 8;
const SNIPPET_CHARS = 300;

// Uniform tokenizer — lowercase, strip punctuation, keep alnum + apostrophes.
const STOP = new Set(('the a an and or but if of to in on for with as from at by is are was were be been being it its this that these those has have had do does did not no nor so than then too very can will just should now').split(' '));
function tokenize(text) {
  const out = [];
  const re = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g;
  let m;
  while ((m = re.exec(String(text || '').toLowerCase()))) {
    const w = m[0];
    if (w.length > 1 && !STOP.has(w)) out.push(w);
  }
  return out;
}

// Chunk text into ~500-token windows, preferring paragraph / sentence seams.
function chunkText(text, max = MAX_CHUNK_CHARS, overlap = CHUNK_OVERLAP) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const out = [];
  let buffer = '';
  const push = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = '';
  };
  for (const p of paras) {
    if (p.length > max) {
      // very long paragraph — hard-split on sentence boundaries
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (buffer.length + s.length > max && buffer) push();
        if (s.length > max) { out.push(s.slice(0, max)); continue; }
        buffer += (buffer ? ' ' : '') + s;
        if (buffer.length >= max) push();
      }
      continue;
    }
    if (buffer.length + p.length > max && buffer) push();
    buffer += (buffer ? '\n\n' : '') + p;
    if (buffer.length >= max) push();
  }
  push();
  const final = [];                              // reattach overlap for continuity
  for (let i = 0; i < out.length; i++) {
    let c = out[i];
    if (i > 0) c = (out[i - 1].slice(-overlap) + c).slice(overlap);
    final.push(c);
  }
  return final;
}

// ── box path / registry helpers ──────────────────────────────────────────────
function _fileFor(boxId) {
  return path.join(dataDir(), 'b_' + crypto.createHash('sha1').update(String(boxId)).digest('hex').slice(0, 16) + '.json');
}
function _readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE(), 'utf8')) || {}; } catch (_) { return {}; }
}
function _writeRegistry(reg) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE(), JSON.stringify(reg, null, 2));
}
function _readBox(boxId) {
  try { return JSON.parse(fs.readFileSync(_fileFor(boxId), 'utf8')) || null; } catch (_) { return null; }
}
function _writeBox(box) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(_fileFor(box.boxId), JSON.stringify(box, null, 2));
}

// Resolve a caller-typed box string into a canonical boxId tuple.
//   "office"                → office/<owner>/default
//   "office/slug"           → office/<owner>/slug
//   "office/owner/slug"     → office/owner/slug        (owner may address own boxes)
// A box whose office is "hall" is shared; every other tuple is private to owner.
function resolveBox(box, ownerId) {
  const parts = String(box || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  const owner = String(ownerId || 'anon').trim().replace(/[\\/:*?"<>|#&\s]+/g, '_') || 'anon';
  let office = 'hall', slug = 'default', ownerPart = owner;
  if (parts.length === 1) { office = parts[0]; }
  else if (parts.length === 2) { office = parts[0]; slug = parts[1]; }
  else if (parts.length >= 3) { office = parts[0]; ownerPart = parts.slice(1, -1).join('_'); slug = parts.slice(-1)[0]; }
  if (office === 'hall') ownerPart = owner;
  const boxId = office + '/' + ownerPart + '/' + slug;
  return { boxId, office, owner: ownerPart, slug, visibility: office === 'hall' ? 'hall' : 'private' };
}

function canRead(box, viewerId) {
  if (!box) return false;
  if (box.visibility === 'hall') return true;
  const viewer = String(viewerId || '').trim();
  return viewer === String(box.owner || '') || viewer === 'admin' || viewer === 'hall';
}

// ── PIKADON URL guard ───────────────────────────────────────────────────────
const INTERNAL_PATH_RE = /^\/(api|admin|_internal|internal|dashboard|manage)\b|(\/|\.)(api|admin|internal)(\/|\.|$)/i;
const DENY_HOST_RE = /(^|\.)(localhost|local|internal|intranet|admin)(\.|$|:)/i;
async function pikadonCheckUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  let u;
  try { u = new URL(url); } catch (_) { throw new Error('aura_ingest blocked: not a valid URL'); }
  if (u.protocol !== 'https:') throw new Error('aura_ingest blocked: only https URLs are allowed');
  const host = u.hostname.toLowerCase();
  if (DENY_HOST_RE.test(host)) throw new Error('aura_ingest blocked: internal hostname');
  if (host.endsWith('.local')) throw new Error('aura_ingest blocked: mDNS .local host');
  if (INTERNAL_PATH_RE.test(u.pathname)) throw new Error('aura_ingest blocked: internal path');
  if (/^\[\d|^::/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    // literal IPs (incl. IPv6 in brackets) are rejected outright by SSRF guard below anyway
  }
  await scraper._assertPublic(host);   // rejects loopback / private / link-local
  return u;
}

// ── ingest adapters (Jina → Firecrawl → bundled scraper) ────────────────────
async function _jina(url) {
  const key = process.env.JINA_API_KEY;
  if (!key) return null;
  const r = await fetch('https://r.jina.ai/' + url, {
    headers: { Authorization: 'Bearer ' + key, 'x-respond-with': 'markdown' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;
  const text = await r.text();
  return text && text.trim() ? text : null;
}
async function _firecrawl(url) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  const md = j && j.data && (j.data.markdown || j.data.content);
  return md && md.trim() ? md : null;
}
async function _bundled(url) {
  const r = await scraper.scrape({ url, maxChars: 120000, timeoutMs: 30000 });
  if (!r || !r.text) throw new Error('aura_ingest failed: page returned no readable text');
  return { title: r.title || '', description: r.description || '', text: r.text };
}
async function fetchClean(url) {
  const jina = await _jina(url).catch(() => null);
  if (jina) return { title: '', description: '', text: jina };
  const fc = await _firecrawl(url).catch(() => null);
  if (fc) return { title: '', description: '', text: fc };
  return _bundled(url);
}

// ── daily quota (metered ingest) ─────────────────────────────────────────────
function _quotaCap() {
  const n = parseInt(process.env.AURA_FREE_INGESTS || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FREE_INGESTS;
}
function _today() { return new Date().toISOString().slice(0, 10); }
function _readQuota() {
  try { return JSON.parse(fs.readFileSync(QUOTA_FILE(), 'utf8')) || {}; } catch (_) { return {}; }
}
function _writeQuota(q) { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(QUOTA_FILE(), JSON.stringify(q)); }
function quotaLeftFor(ownerId) {
  const day = _today();
  const user = String(ownerId || 'anon');
  const rec = _readQuota()[user];
  const used = rec && rec.date === day ? rec.count : 0;
  return { used, left: Math.max(0, _quotaCap() - used), cap: _quotaCap(), day };
}
function _consumeQuota(ownerId) {
  const q = _readQuota();
  const day = _today();
  const user = String(ownerId || 'anon');
  const rec = (q[user] && q[user].date === day) ? q[user] : { date: day, count: 0 };
  rec.count += 1;
  q[user] = rec;
  _writeQuota(q);
}

// ── TF-IDF scoring for one box ──────────────────────────────────────────────
function _tfidfScores(box) {
  const chunks = (box && box.chunks) || [];
  const N = chunks.length;
  if (!N) return [];
  const dfs = {};
  for (const c of chunks) {
    const seen = new Set(c.terms || []);
    for (const t of seen) dfs[t] = (dfs[t] || 0) + 1;
  }
  const idf = (t) => Math.log(1 + N / (1 + (dfs[t] || 0)));
  return chunks.map((c, i) => {
    const tf = {};
    for (const t of c.terms || []) tf[t] = (tf[t] || 0) + 1;
    const norm = Math.sqrt(Object.values(tf).reduce((a, b) => a + b * b, 0)) || 1;
    return { i, tf, norm };
  });
}
function searchBox(box, qterms, k = 3) {
  const scores = _tfidfScores(box);
  const ranked = [];
  for (const s of scores) {
    let score = 0;
    for (const t of qterms) {
      const f = s.tf[t] || 0;
      if (f) {
        const idf = Math.log(1 + (box.chunks.length || 1) / (1 + ((box._idf || {})[t] || 0)));
        score += (f / s.norm) * idf;
      }
    }
    if (score > 0) ranked.push({ score, idx: s.i });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, k).map((r) => {
    const text = box.chunks[r.idx].text;
    return { score: r.score, text, head: box.chunks[r.idx].head || '' };
  });
}

// ── public API ──────────────────────────────────────────────────────────────
async function ingest({ url, box, ownerId, title }) {
  const owner = String(ownerId || 'anon');
  const picked = resolveBox(box, owner);
  const quota = quotaLeftFor(owner);
  if (quota.left <= 0) {
    const err = new Error('aura_ingest quota used up for today');
    err.code = 'QUOTA';
    err.quota = quota;
    throw err;
  }
  const u = await pikadonCheckUrl(url);            // PIKADON gate (throws → 403)
  const clean = await fetchClean(url);             // INGEST adapter chain
  const text = (title ? String(title).trim() + '\n\n' : '') + clean.text;
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('aura_ingest failed: nothing readable on that page');
  if (chunks.length > MAX_CHUNKS_PER_BOX) throw new Error('aura_ingest blocked: page bigger than the ' + MAX_CHUNKS_PER_BOX + '-chunk box cap');

  const now = new Date().toISOString();
  const newBox = {
    boxId: picked.boxId,
    office: picked.office,
    owner: picked.owner,
    slug: picked.slug,
    visibility: picked.visibility,
    title: title || clean.title || (u.hostname + u.pathname),
    sourceUrl: url,
    description: clean.description || '',
    createdAt: now,
    updatedAt: now,
    chunks: chunks.map((t) => ({ text: t, head: t.split('\n')[0].slice(0, 120), terms: tokenize(t) })),
  };
  _writeBox(newBox);
  const reg = _readRegistry();
  reg[picked.boxId] = {
    boxId: picked.boxId, office: picked.office, owner: picked.owner, slug: picked.slug,
    visibility: picked.visibility, title: newBox.title, sourceUrl: url,
    createdAt: newBox.createdAt, updatedAt: now,
    chunkCount: newBox.chunks.length,
  };
  _writeRegistry(reg);
  _consumeQuota(owner);
  return { ok: true, box: picked.boxId, office: picked.office, owner: picked.owner, slug: picked.slug,
    visibility: picked.visibility, title: newBox.title, sourceUrl: url,
    chunks: newBox.chunks.length, quota: quotaLeftFor(owner) };
}

function listBoxes(viewerId) {
  const reg = _readRegistry();
  const out = [];
  for (const id of Object.keys(reg)) {
    const meta = reg[id];
    const box = _readBox(id);
    if (!box) continue;
    if (!canRead(box, viewerId)) continue;
    out.push({ boxId: id, office: meta.office, owner: meta.owner, slug: meta.slug,
      visibility: meta.visibility, title: meta.title, sourceUrl: meta.sourceUrl,
      chunkCount: meta.chunkCount, createdAt: meta.createdAt, updatedAt: meta.updatedAt });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

// Does a registry entry match a caller-typed box filter ("office",
// "office/slug", or the full "office/owner/slug")? Owner segment is skipped
// unless the caller names it explicitly — so "oracle/demo" matches
// oracle/<myOwner>/demo no matter who owns it.
function _matchesBoxFilter(meta, wanted) {
  if (!wanted) return true;
  const parts = String(wanted).split('/').filter(Boolean);
  if (!parts.length) return true;
  if (meta.office !== parts[0]) return false;
  if (parts.length >= 2 && meta.slug !== parts[1]) return false;
  if (parts.length >= 3 && meta.owner !== parts.slice(1, -1).join('_')) return false;
  return true;
}

function search({ q, box, ownerId, k }) {
  const qtext = String(q || '').trim();
  if (!qtext) return [];
  const qterms = tokenize(qtext);
  if (!qterms.length) return [];
  const viewer = String(ownerId || 'anon');
  const reg = _readRegistry();
  const results = [];
  const wanted = String(box || '').trim();
  for (const id of Object.keys(reg)) {
    const meta = reg[id];
    if (!_matchesBoxFilter(meta, wanted)) continue;
    const b = _readBox(id);
    if (!b || !canRead(b, viewer)) continue;
    const hits = searchBox(b, qterms, Math.max(1, Math.min(MAX_SEARCH_K, Number(k) || 3)));
    for (const h of hits) {
      results.push({
        score: Math.round(h.score * 1000) / 1000,
        box: id,
        title: b.title || id,
        sourceUrl: b.sourceUrl || '',
        snippet: (h.head ? h.head + '\n' : '') + h.text.slice(0, SNIPPET_CHARS),
      });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.min(MAX_SEARCH_K, Number(k) || MAX_SEARCH_K));
}

function stats() {
  const reg = _readRegistry();
  const ids = Object.keys(reg);
  let chunks = 0;
  for (const id of ids) { const b = _readBox(id); if (b) chunks += (b.chunks || []).length; }
  return { boxes: ids.length, chunks, dataDir: dataDir(), freePerDay: _quotaCap(), adapters: ['jina', 'firecrawl', 'bundled'] };
}

// ── self-test ───────────────────────────────────────────────────────────────
async function selfTest() {
  const t0 = Date.now();
  const tmp = path.join(require('os').tmpdir(), 'aura-brain-test-' + Date.now());
  const oldDir = process.env.AURA_BRAIN_DATA_DIR;
  process.env.AURA_BRAIN_DATA_DIR = tmp;
  fs.mkdirSync(tmp, { recursive: true });
  const lines = [];
  const report = (ok, msg) => { lines.push((ok ? 'PASS' : 'FAIL') + '  ' + msg); return ok; };
  try {
    // 1. ingest a public https URL into oracle/demo
    let ing = null;
    try { ing = await ingest({ url: 'https://example.com', box: 'oracle/demo', ownerId: 'demo-user' }); }
    catch (e) { ing = { error: String(e && e.message || e) }; }
    let okIng = report(ing && ing.ok, 'ingest example.com → oracle/demo' + (ing && ing.box ? ' (' + ing.box + ', ' + ing.chunks + ' chunks)' : ' — ' + ing.error));

    // 2. aura_search returns snippets for that caller (private box scope works)
    const hits = (() => { try { return search({ q: 'example domain', box: 'oracle/demo', ownerId: 'demo-user', k: 3 }); } catch (e) { return []; } })();
    const okSearch = report(hits.length > 0, 'aura_search("example domain", box=oracle/demo) → ' + hits.length + ' snippet(s)');

    // 3. scope: a different user must NOT see the private box
    let cross = (() => { try { return search({ q: 'example domain', box: 'oracle/demo', ownerId: 'stranger', k: 3 }); } catch (e) { return []; } })();
    const okScope = report(cross.length === 0, 'stranger cannot read private oracle/demo box');

    // 4. a hall box IS readable by everyone
    let hall = null;
    try { hall = await ingest({ url: 'https://example.com', box: 'hall/docs', ownerId: 'doc-bot', title: 'Example Docs' }); }
    catch (e) { hall = { error: String(e && e.message || e) }; }
    cross = (() => { try { return search({ q: 'example', box: 'hall', ownerId: 'stranger', k: 3 }); } catch (e) { return []; } })();
    const okHall = report(hall && hall.ok && cross.length > 0, 'hall/docs readable by everyone (stranger saw ' + cross.length + ')');

    // 5. PIKADON: private/localhost URLs rejected
    let blocked = false;
    try { await ingest({ url: 'http://127.0.0.1:3000/api/aura/health', box: 'oracle/demo', ownerId: 'demo-user' }); }
    catch (e) { blocked = String(e && e.message || '').toLowerCase().includes('blocked'); }
    const okPik = report(blocked, 'PIKADON rejects http://127.0.0.1 internal scrape');

    // 6. quota: cap enforced (set 0 via env)
    process.env.AURA_FREE_INGESTS = '0';
    let q4 = false;
    try { await ingest({ url: 'https://example.com', box: 'hall/docs', ownerId: 'doc-bot' }); }
    catch (e) { q4 = e && e.code === 'QUOTA'; }
    const okQuota = report(q4, 'quota 0 blocks ingest → 402 path');
    process.env.AURA_FREE_INGESTS = '5';
    delete process.env.AURA_FREE_INGESTS;

    const all = okIng && okSearch && okScope && okHall && okPik && okQuota;
    return { ok: all, ms: Date.now() - t0, lines };
  } finally {
    process.env.AURA_BRAIN_DATA_DIR = oldDir;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  ingest, search, listBoxes, stats, quotaLeftFor, resolveBox, canRead, pikadonCheckUrl,
  chunkText, tokenize, selfTest, dataDir,
};