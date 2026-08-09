'use strict';

/**
 * brain-index.js
 * Adapter over the SHADDAI RAG brain (built by rag/build_index.py in the
 * SHADDAI-SYSTEM folder) exposing the same API surface as rag-index.js so the
 * MCP server can serve the full 40K+ chunk brain per agent.
 *
 * Brain format:
 *   index.json  -> { n_chunks, n_terms, built, idf: {term: idf}, vocab: [...] }
 *   chunks.jsonl-> one JSON per line:
 *      { id, video_id, title, channel, topic, system, agent, word_count, text, tf: {term: count} }
 *
 * The `user` arg mirrors rag-index: kb_<AGENT> (e.g. "kb_nexus"). Chunks are
 * filtered by their `agent` field; untagged chunks fall back to the SHADDAI
 * store so the orchestrator sees everything.
 *
 * Pure Node.js — no external packages. Loads lazily on first use.
 */

const fs = require('fs');
const path = require('path');

const BRAIN_DIR = process.env.SHADDAI_BRAIN_DIR ||
  path.join('C:', 'Users', 'Brittany', 'Documents', 'SHADDAI-SYSTEM', 'rag');

const KB_PREFIX = process.env.SHADDAI_RAG_KB_PREFIX || 'kb_';

// Same tokenizer contract as rag-index.js so vectors stay comparable.
const STOPWORDS = new Set([
  'the','a','an','is','it','in','on','at','to','for','of','and','or','with',
  'that','this','are','was','be','as','by','from','you','your','use','when',
  'user','wants','also','can','will','not','all','any','have','has','been',
  'they','their','them','we','our','more','one','two','three','such','about',
  'how','what','which','who','its','if','do','does','did','so','no','my',
  'than','but','would','could','should','may','might','get','set','used',
  'using','into','over','up','out','see','new','each','other','these','those',
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

// ─── lazy load of the brain ───────────────────────────────────────────────────
// Sharded cache: meta.json (built/n_chunks/n_terms/idf) + <AGENT>.jsonl per agent.
// Shards are JSONL (one chunk per line), read with a streaming byte-level scanner
// so multi-hundred-MB files load without ever materializing a single giant string
// (past Node's max string size). Only the requested agent's shard is parsed.
const CACHE_DIR = path.join(BRAIN_DIR, 'brain_cache');
let _brain = null;
let _loadError = null;
const _shardCache = new Map();

// Stream a JSONL file synchronously without ever materializing the whole file
// as one string (chunks.jsonl is ~700MB+, past Node's max string size).
// Splits on newline at the byte level so UTF-8 boundaries stay intact.
function forEachJsonlSync(file, cb) {
  const fd = fs.openSync(file, 'r');
  const CHUNK = 16 * 1024 * 1024;
  const buf = Buffer.allocUnsafe(CHUNK);
  let partial = Buffer.alloc(0);
  let pos = 0;
  try {
    while (true) {
      const n = fs.readSync(fd, buf, 0, CHUNK, pos);
      if (n <= 0) break;
      pos += n;
      const data = n === CHUNK ? buf : buf.slice(0, n);
      let start = 0;
      let idx;
      while ((idx = data.indexOf(0x0a, start)) !== -1) {
        const line = Buffer.concat([partial, data.slice(start, idx)]).toString('utf8').trim();
        partial = Buffer.alloc(0);
        start = idx + 1;
        if (line) { try { cb(JSON.parse(line)); } catch { /* skip */ } }
      }
      partial = Buffer.concat([partial, data.slice(start)]);
    }
    const last = partial.toString('utf8').trim();
    if (last) { try { cb(JSON.parse(last)); } catch { /* skip */ } }
  } finally {
    fs.closeSync(fd);
  }
}

// Read a whole JSONL file into an array (streamed). Also tolerates legacy
// single-line array dumps by flattening them (old <AGENT>.json cache format).
function readJsonlArraySync(file) {
  const arr = [];
  forEachJsonlSync(file, (obj) => {
    if (Array.isArray(obj)) { for (const c of obj) arr.push(c); }
    else arr.push(obj);
  });
  return arr;
}

// Normalize one raw chunk line into the shape shards / search consume, and
// precompute its normalized TF-IDF vector. Returns null for empty chunks.
function transformChunk(c, idf) {
  if (!c || !c.text) return null;
  const tf = c.tf || {};
  const ch = {
    id: c.id,
    videoId: c.video_id || '',
    title: c.title || '',
    channel: c.channel || '',
    agent: String(c.agent || '').toUpperCase(),
    topic: c.topic || '',
    system: c.system || '',
    text: c.text,
    tf,
    words: c.word_count || c.text.split(/\s+/).length,
  };
  const total = Object.values(tf).reduce((a, b) => a + b, 0) || 1;
  const vec = {};
  let mag = 0;
  for (const [term, count] of Object.entries(tf)) {
    const w = (count / total) * ((idf && idf[term]) || 0);
    if (w > 0) { vec[term] = w; mag += w * w; }
  }
  mag = Math.sqrt(mag);
  if (mag > 0) for (const t of Object.keys(vec)) vec[t] /= mag;
  ch.vec = vec;
  return ch;
}

function brain() {
  if (_brain) return _brain;
  if (_loadError) return { ok: false, error: _loadError };

  const indexPath = path.join(BRAIN_DIR, 'index.json');
  const chunksPath = path.join(BRAIN_DIR, 'chunks.jsonl');
  const metaPath = path.join(CACHE_DIR, 'meta.json');
  if (!fs.existsSync(indexPath) || !fs.existsSync(chunksPath)) {
    _loadError = `Brain index not found in ${BRAIN_DIR} (need index.json + chunks.jsonl)`;
    return { ok: false, error: _loadError };
  }

  const start = Date.now();

  let meta;
  try { meta = JSON.parse(fs.readFileSync(indexPath, 'utf8')); }
  catch (e) { _loadError = `Failed to parse index.json: ${e.message}`; return { ok: false, error: _loadError }; }

  // Fast path: sharded cache present + fresh.
  if (fs.existsSync(metaPath)) {
    try {
      const cm = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (cm.built === (meta.built || '') && cm.n_chunks === (meta.n_chunks || '')) {
        _brain = { ok: true, meta: { built: cm.built, n_chunks: cm.n_chunks, n_terms: cm.n_terms }, idf: cm.idf || {} };
        console.error(`[brain-index] sharded cache ready (${cm.n_chunks} chunks) in ${Date.now() - start}ms`);
        return _brain;
      }
      console.error(`[brain-index] cache stale (built ${cm.built} vs ${meta.built}); rebuilding…`);
    } catch (e) {
      console.error(`[brain-index] cache read failed (${e.message}); rebuilding…`);
    }
  }

  const idf = meta.idf || {};

  const chunks = [];
  forEachJsonlSync(chunksPath, (c) => {
    const ch = transformChunk(c, idf);
    if (ch) chunks.push(ch);
  });

  // Group by agent; untagged -> SHADDAI (orchestrator sees everything).
  const byAgent = new Map();
  for (const c of chunks) {
    const key = c.agent || 'SHADDAI';
    if (!byAgent.has(key)) byAgent.set(key, []);
    byAgent.get(key).push(c);
  }

  _brain = { ok: true, meta, idf, byAgent };
  console.error(`[brain-index] loaded ${chunks.length} chunks in ${Date.now() - start}ms`);
  return _brain;
}

function shardPath(agent) {
  return path.join(CACHE_DIR, agent + '.jsonl');
}

// Doc lists: tiny per-agent summaries (videoId, name, chunk count) so
// listUserDocs / list_agents never have to parse the big chunk shards.
// Built by `node brain-index.js --doclists` after the shards are rebuilt.
const DOCLIST_DIR = path.join(CACHE_DIR, 'doclists');

function docListMeta() {
  try { return JSON.parse(fs.readFileSync(path.join(DOCLIST_DIR, 'meta.json'), 'utf8')); }
  catch { return null; }
}

// Fast path: a prebuilt per-agent doc list, valid only when it matches the
// current brain snapshot and no system/topic filter needs chunk-level data.
function docList(user, opts) {
  const b = brain();
  if (!b.ok) return [];
  if (opts && (opts.system || opts.topic)) return null;
  const agent = userToAgent(user);
  const p = path.join(DOCLIST_DIR, agent + '.json');
  try {
    const m = docListMeta();
    if (m && m.built === (b.meta.built || '') && m.n_chunks === (b.meta.n_chunks || '') && fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    console.error(`[brain-index] doclist read failed for ${agent}: ${e.message}`);
  }
  return null;
}

function shard(agent) {
  const b = brain();
  if (!b.ok) return [];
  if (_shardCache.has(agent)) return _shardCache.get(agent);
  const p = shardPath(agent);
  if (!fs.existsSync(p)) {
    // Fallback: full in-memory brain (built without --cache).
    return (b.byAgent && b.byAgent.get(agent)) || [];
  }
  try {
    const arr = readJsonlArraySync(p);
    _shardCache.set(agent, arr);
    return arr;
  } catch (e) {
    console.error(`[brain-index] shard read failed for ${agent}: ${e.message}`);
    return (b.byAgent && b.byAgent.get(agent)) || [];
  }
}

// ─── compact vector index (fmt 2) ─────────────────────────────────────────────
// Search over the multi-hundred-MB text shards is slow (each JSON.parse is
// seconds). `--vecindex` prebuilds a per-agent compact index under brain_cache/vec:
//   <AGENT>.jsonl      one line per chunk: {k:[termIds],w:[weights],t,s,tp,ch,vid,ag,wc}
//                      termIds index into `vocab` (stored in meta.json) — no
//                      repeated key strings, so load + parse is fast.
//   <AGENT>.off.json   byte offsets of each vec line
//   <AGENT>.text.jsonl one JSON-per-line {x:text}, texts fetched only for top-K
//   <AGENT>.toff.json  byte offsets of each text line
// Runtime scoring uses only the compact vec index; snippets are read on demand.
const VEC_DIR = path.join(CACHE_DIR, 'vec');
const VEC_FMT = 2;
let _vecMeta = null;
const _vecCache = new Map();
const _vecFd = new Map();

function vecMeta() {
  if (_vecMeta) return _vecMeta;
  try { _vecMeta = JSON.parse(fs.readFileSync(path.join(VEC_DIR, 'meta.json'), 'utf8')); }
  catch { _vecMeta = { built: null, n_chunks: null, fmt: 0 }; }
  return _vecMeta;
}

// termId -> termId lookup map built lazily from the shared vocab.
function vecTermIds() {
  const vm = vecMeta();
  if (vm.fmt !== VEC_FMT) return null;
  if (vm._termIds) return vm._termIds;
  const vocab = vm.vocab;
  if (!Array.isArray(vocab)) return null;
  const m = new Map();
  for (let i = 0; i < vocab.length; i++) m.set(vocab[i], i);
  vm._termIds = m;
  return m;
}

// Loads a per-agent compact index. Returns null when absent/stale/old format.
function vecIndex(agent) {
  if (_vecCache.has(agent)) return _vecCache.get(agent);
  const b = brain();
  if (!b.ok) return null;
  const vm = vecMeta();
  if (vm.fmt !== VEC_FMT || vm.built !== (b.meta.built || '') || vm.n_chunks !== (b.meta.n_chunks || '')) return null;

  const vecP = path.join(VEC_DIR, agent + '.jsonl');
  const offP = path.join(VEC_DIR, agent + '.off.json');
  const toffP = path.join(VEC_DIR, agent + '.toff.json');
  if (!fs.existsSync(vecP) || !fs.existsSync(offP) || !fs.existsSync(toffP)) return null;

  const start = Date.now();
  const lines = fs.readFileSync(vecP, 'utf8').split('\n');
  const entries = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  const textOffs = JSON.parse(fs.readFileSync(toffP, 'utf8'));
  const idx = { entries, textOffs };
  _vecCache.set(agent, idx);
  console.error(`[brain-index] vec index ${agent}: ${entries.length} chunks in ${Date.now() - start}ms`);
  return idx;
}

function vecTextFd(agent) {
  if (_vecFd.has(agent)) return _vecFd.get(agent);
  const p = path.join(VEC_DIR, agent + '.text.jsonl');
  if (!fs.existsSync(p)) return null;
  const fd = fs.openSync(p, 'r');
  _vecFd.set(agent, fd);
  return fd;
}

// Lazy snippet fetch: reads exactly one JSON line from the text file.
function vecText(agent, k, idx) {
  const toff = idx.textOffs;
  if (!toff || k >= toff.length - 1) return '';
  const fd = vecTextFd(agent);
  if (!fd) return '';
  const start = toff[k];
  const end = toff[k + 1];
  const len = Math.max(0, end - start);
  if (!len) return '';
  const buf = Buffer.allocUnsafe(len);
  try {
    let read = 0;
    while (read < len) {
      const n = fs.readSync(fd, buf, read, len - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    return JSON.parse(buf.toString('utf8')).x || '';
  } catch { return ''; }
}

function vecMatchesOpts(e, opts) {
  if (!opts) return true;
  const sys = String(opts.system || '').toLowerCase().trim();
  if (sys && String(e.s || '').toLowerCase() !== sys) return false;
  const top = String(opts.topic || '').toLowerCase().trim();
  if (top && !String(e.tp || '').toLowerCase().includes(top)) return false;
  return true;
}

// Query vector as Map<termId, weight> over the compact vocab.
function buildQueryVec(query) {
  const b = brain();
  if (!b.ok) return null;
  const vm = vecMeta();
  const termIds = vecTermIds();
  if (!termIds || !vm.vocab) return null;
  const tokens = tokenize(query);
  const total = tokens.length || 1;
  const counts = new Map();
  for (const t of tokens) {
    const id = termIds.get(t);
    if (id !== undefined && b.idf[t]) counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (!counts.size) return null;
  const vec = new Map();
  let mag = 0;
  for (const [id, count] of counts) {
    const w = (count / total) * b.idf[vm.vocab[id]];
    vec.set(id, w);
    mag += w * w;
  }
  mag = Math.sqrt(mag);
  if (mag > 0) for (const [id, w] of vec) vec.set(id, w / mag);
  return vec;
}

// Cosine similarity between a query vector and a compact chunk vec (k/w sorted
// by termId; binary search per query term).
function simCompact(q, k, w) {
  let dot = 0;
  for (const [tid, qw] of q) {
    let lo = 0, hi = k.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (k[mid] < tid) lo = mid + 1; else hi = mid; }
    if (lo < k.length && k[lo] === tid) dot += qw * w[lo];
  }
  return dot;
}

// Fast vector search. Returns null when the vec index is unavailable so the
// caller can fall back to the full-text shard path.
function searchVec(agent, query, topK, opts) {
  const idx = vecIndex(agent);
  if (!idx || !idx.entries.length) return null;
  const qVec = buildQueryVec(query);
  if (!qVec) return [];

  const scored = [];
  for (let i = 0; i < idx.entries.length; i++) {
    const e = idx.entries[i];
    if (opts && !vecMatchesOpts(e, opts)) continue;
    const score = simCompact(qVec, e.k, e.w);
    if (score > 0) scored.push({ i, score: Math.round(score * 10000) / 10000 });
  }
  scored.sort((a, b2) => b2.score - a.score);
  const top = scored.slice(0, Math.max(1, Math.min(topK || 3, 12)));

  return top.map(r => {
    const e = idx.entries[r.i];
    return {
      agent: e.ag || agent,
      title: e.t || '',
      score: r.score,
      text: vecText(agent, r.i, idx),
      system: e.s || '',
      topic: e.tp || '',
      channel: e.ch || '',
      video_id: e.vid || '',
      words: e.wc || 0,
    };
  });
}

// Prebuild the compact vector index (run: node brain-index.js --vecindex).
function writeVecIndex() {
  const b = brain();
  if (!b.ok) { console.error(b.error); process.exit(1); }
  const idxMeta = JSON.parse(fs.readFileSync(path.join(BRAIN_DIR, 'index.json'), 'utf8'));
  const vocab = idxMeta.vocab || [];
  const termIds = new Map();
  for (let i = 0; i < vocab.length; i++) termIds.set(vocab[i], i);

  fs.mkdirSync(VEC_DIR, { recursive: true });
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.jsonl'));
  let total = 0;
  const agents = [];
  for (const f of files) {
    const agent = f.slice(0, -6);
    agents.push(agent);
    let arr;
    try { arr = readJsonlArraySync(shardPath(agent)); }
    catch (e) { console.error(`[brain-index] vecindex skip ${agent}: ${e.message}`); continue; }

    const vecLines = [];
    const textLines = [];
    for (const c of arr) {
      const tfs = c.tf || {};
      const totalW = Object.values(tfs).reduce((a, v) => a + v, 0) || 1;
      const ids = [];
      const ws = [];
      for (const [term, count] of Object.entries(tfs)) {
        const id = termIds.get(term);
        if (id === undefined) continue;
        const idf = b.idf[term] || 0;
        if (idf <= 0) continue;
        const w = (count / totalW) * idf;
        ids.push(id);
        ws.push(w);
      }
      let mag = 0;
      for (const w of ws) mag += w * w;
      mag = Math.sqrt(mag);
      if (mag > 0) for (let j = 0; j < ws.length; j++) ws[j] /= mag;
      const order = ids.map((_, j) => j).sort((a, bb) => ids[a] - ids[bb]);
      const ks = order.map(j => ids[j]);
      const wsSorted = order.map(j => ws[j]);
      vecLines.push(JSON.stringify({
        k: ks, w: wsSorted, t: c.title || '', s: c.system || '', tp: c.topic || '',
        ch: c.channel || '', vid: c.videoId || '', ag: c.agent || '', wc: c.words || 0,
      }));
      textLines.push(JSON.stringify({ x: c.text || '' }));
    }

    const vecBuf = Buffer.from(vecLines.join('\n') + (vecLines.length ? '\n' : ''), 'utf8');
    const textBuf = Buffer.from(textLines.join('\n') + (textLines.length ? '\n' : ''), 'utf8');
    const offs = [0];
    let o = 0;
    for (const l of vecLines) { o += Buffer.byteLength(l, 'utf8') + 1; offs.push(o); }
    const toff = [0];
    o = 0;
    for (const l of textLines) { o += Buffer.byteLength(l, 'utf8') + 1; toff.push(o); }

    fs.writeFileSync(path.join(VEC_DIR, agent + '.jsonl'), vecBuf);
    fs.writeFileSync(path.join(VEC_DIR, agent + '.text.jsonl'), textBuf);
    fs.writeFileSync(path.join(VEC_DIR, agent + '.off.json'), JSON.stringify(offs));
    fs.writeFileSync(path.join(VEC_DIR, agent + '.toff.json'), JSON.stringify(toff));
    console.error(`[brain-index] vec index written for ${agent}: ${vecLines.length} chunks (vec ${(vecBuf.length / 1024 / 1024).toFixed(1)}MB, text ${(textBuf.length / 1024 / 1024).toFixed(1)}MB)`);
    total += vecLines.length;
  }
  fs.writeFileSync(path.join(VEC_DIR, 'meta.json'),
    JSON.stringify({ fmt: VEC_FMT, built: b.meta.built || '', n_chunks: b.meta.n_chunks || 0, agents, vocab }));
  console.error(`[brain-index] vec index complete: ${total} chunks across ${agents.length} agents in ${VEC_DIR}`);
}

// Prebuild the sharded fast-load cache (run: node brain-index.js --cache).
// Prebuild the sharded fast-load cache (run: node brain-index.js --cache).
// Streams chunks.jsonl directly — one chunk in memory at a time — writing each
// normalized chunk to its agent's shard as it arrives. Never builds the full
// in-memory brain, so it fits in a small heap even for multi-hundred-MB brains.
function writeCache() {
  const indexPath = path.join(BRAIN_DIR, 'index.json');
  const chunksPath = path.join(BRAIN_DIR, 'chunks.jsonl');
  const idxMeta = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const idf = idxMeta.idf || {};
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const fds = new Map();
  const counts = new Map();
  let bytes = 0;
  const fdFor = (agent) => {
    let fd = fds.get(agent);
    if (!fd) { fd = fs.openSync(shardPath(agent), 'w'); fds.set(agent, fd); }
    return fd;
  };

  forEachJsonlSync(chunksPath, (c) => {
    const ch = transformChunk(c, idf);
    if (!ch) return;
    const agent = ch.agent || 'SHADDAI';
    const line = JSON.stringify(ch) + '\n';
    fs.writeSync(fdFor(agent), line);
    bytes += Buffer.byteLength(line, 'utf8');
    counts.set(agent, (counts.get(agent) || 0) + 1);
  });
  for (const fd of fds.values()) fs.closeSync(fd);

  // Remove any legacy array-format <AGENT>.json shards so old files can't be
  // misread by the JSONL readers (doclists/vec dirs are untouched).
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (f.endsWith('.json') && f !== 'meta.json') {
      try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
    }
  }

  const nChunks = [...counts.values()].reduce((a, b) => a + b, 0);
  const metaOut = {
    built: idxMeta.built || '',
    n_chunks: idxMeta.n_chunks || nChunks,
    n_terms: idxMeta.n_terms || 0,
    idf,
  };
  fs.writeFileSync(path.join(CACHE_DIR, 'meta.json'), JSON.stringify(metaOut), 'utf8');
  console.error(`[brain-index] sharded cache written: ${CACHE_DIR} (${nChunks} chunks across ${fds.size} agents, ${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

// Prebuild per-agent doc lists from the shards (tiny files; listUserDocs fast path).
function writeDocLists() {
  const b = brain();
  if (!b.ok) { console.error(b.error); process.exit(1); }
  fs.mkdirSync(DOCLIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DOCLIST_DIR, 'meta.json'),
    JSON.stringify({ built: b.meta.built || '', n_chunks: b.meta.n_chunks || 0 }), 'utf8');
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.jsonl'));
  let total = 0;
  for (const f of files) {
    const agent = f.slice(0, -6);
    let list;
    try { list = readJsonlArraySync(shardPath(agent)); }
    catch (e) { console.error(`[brain-index] doclist skip ${agent}: ${e.message}`); continue; }
    const byVideo = new Map();
    for (const c of list) {
      if (!byVideo.has(c.videoId)) {
        byVideo.set(c.videoId, { id: c.videoId, name: c.title, chunks: 0, uploadedAt: b.meta.built || '' });
      }
      byVideo.get(c.videoId).chunks += 1;
    }
    const docs = [...byVideo.values()].sort((x, y) => y.chunks - x.chunks);
    fs.writeFileSync(path.join(DOCLIST_DIR, agent + '.json'), JSON.stringify(docs), 'utf8');
    total += docs.length;
  }
  console.error(`[brain-index] doclists written: ${DOCLIST_DIR} (${total} docs across ${files.length} agents)`);
}

// Regenerate brain_agent_stats.json from chunks.jsonl (same schema the old
// python brain_server.py produced: per-agent chunk/video/word counts plus
// topic/system/channel/term/title aggregates). Run: node brain-index.js --stats.
function writeStats() {
  const indexPath = path.join(BRAIN_DIR, 'index.json');
  const chunksPath = path.join(BRAIN_DIR, 'chunks.jsonl');
  if (!fs.existsSync(indexPath) || !fs.existsSync(chunksPath)) {
    console.error('[brain-index] stats needs index.json + chunks.jsonl');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const agents = new Map();
  const getAgent = (name) => {
    let a = agents.get(name);
    if (!a) {
      a = {
        chunks: 0, words: 0, videos: new Set(),
        topics: new Map(), systems: new Map(), channels: new Map(),
        terms: new Map(), titles: new Map(),
      };
      agents.set(name, a);
    }
    return a;
  };

  let skipped = 0;
  forEachJsonlSync(chunksPath, (c) => {
    if (!c || !c.text) { skipped++; return; }
    const name = String(c.agent || '').toUpperCase() || 'SHADDAI';
    const a = getAgent(name);
    a.chunks += 1;
    a.words += c.word_count || 0;
    if (c.video_id) a.videos.add(c.video_id);
    bump(a.topics, c.topic || 'untagged');
    bump(a.systems, c.system || 'unspecified');
    bump(a.channels, c.channel || 'unknown');
    for (const [t, ct] of Object.entries(c.tf || {})) a.terms.set(t, (a.terms.get(t) || 0) + ct);
    bump(a.titles, c.title || c.video_id || '');
  });

  const topEntries = (m, n) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);
  const allSystems = new Set();
  const allTopics = new Set();
  const outAgents = {};
  let totalChunks = 0, totalWords = 0, totalVideos = 0;

  for (const [name, a] of agents) {
    for (const s of a.systems.keys()) allSystems.add(s);
    for (const t of a.topics.keys()) allTopics.add(t);
    const titles = topEntries(a.titles, 20).map(([t]) => t);
    outAgents[name] = {
      chunks: a.chunks,
      words: a.words,
      videos: a.videos.size,
      topics: topEntries(a.topics, 10),
      systems: topEntries(a.systems, 10),
      channels: topEntries(a.channels, 10),
      top_terms: topEntries(a.terms, 40),
      titles,
    };
    totalChunks += a.chunks;
    totalWords += a.words;
    totalVideos += a.videos.size;
  }

  const out = {
    built: meta.built || '',
    total_chunks: totalChunks,
    total_terms: meta.n_terms || 0,
    total_words: totalWords,
    total_videos: totalVideos,
    total_systems: allSystems.size,
    all_systems: [...allSystems].sort(),
    all_topics: [...allTopics].sort(),
    agents: outAgents,
  };

  const dest = path.join(BRAIN_DIR, 'brain_agent_stats.json');
  fs.writeFileSync(dest, JSON.stringify(out), 'utf8');
  console.error(`[brain-index] stats written: ${dest} (${totalChunks} chunks, ${totalVideos} videos across ${agents.size} agents)`);
  if (skipped) console.error(`[brain-index] stats skipped ${skipped} malformed lines`);
}

if (require.main === module && process.argv[2] === '--cache') { writeCache(); }
if (require.main === module && process.argv[2] === '--doclists') { writeDocLists(); }
if (require.main === module && process.argv[2] === '--vecindex') { writeVecIndex(); }
if (require.main === module && process.argv[2] === '--stats') { writeStats(); }

function userToAgent(user) {
  let u = String(user || '').toLowerCase();
  if (u.startsWith(KB_PREFIX)) u = u.slice(KB_PREFIX.length);
  const agent = u.toUpperCase();
  return agent === 'ORACLE' || agent === 'NEXUS' || agent === 'TURTLE' ||
         agent === 'ZEROX' || agent === 'PIKADON' || agent === 'QUILL' ||
         agent === 'SHADDAI'
    ? agent
    : 'SHADDAI';
}

function matchesOpts(c, opts) {
  if (!opts) return true;
  const sys = String(opts.system || '').toLowerCase().trim();
  if (sys && String(c.system || '').toLowerCase() !== sys) return false;
  const top = String(opts.topic || '').toLowerCase().trim();
  if (top && !String(c.topic || '').toLowerCase().includes(top)) return false;
  return true;
}

// docs per agent store: one "document" per video (name = title).
function listUserDocs(user, opts) {
  const fast = docList(user, opts);
  if (fast !== null) return fast;
  const b = brain();
  if (!b.ok) return [];
  const agent = userToAgent(user);
  const chunks = shard(agent).filter(c => matchesOpts(c, opts));
  const byVideo = new Map();
  for (const c of chunks) {
    if (!byVideo.has(c.videoId)) {
      byVideo.set(c.videoId, { id: c.videoId, name: c.title, chunks: 0, uploadedAt: b.meta.built || '' });
    }
    byVideo.get(c.videoId).chunks += 1;
  }
  return [...byVideo.values()].sort((a, b2) => b2.chunks - a.chunks);
}

function vectorizeQuery(query, idf) {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const counts = {};
  for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
  const total = tokens.length || 1;
  const vec = new Map();
  let mag = 0;
  for (const [term, count] of Object.entries(counts)) {
    const w = (count / total) * (idf[term] || 0);
    if (w > 0) { vec.set(term, w); mag += w * w; }
  }
  if (!vec.size) return null;
  mag = Math.sqrt(mag);
  for (const [t, w] of vec) vec.set(t, w / mag);
  return vec;
}

function cosineSim(a, b) {
  let dot = 0;
  for (const [term, w] of a) {
    const w2 = b[term];
    if (w2 !== undefined) dot += w * w2;
  }
  return dot;
}

function searchUser(user, query, topK = 3, opts) {
  const b = brain();
  if (!b.ok) return [];
  const agent = userToAgent(user);

  const fast = searchVec(agent, query, topK, opts);
  if (fast !== null) {
    return fast.map(c => ({
      docId: c.video_id,
      docName: c.title,
      chunkText: c.text,
      score: c.score,
    }));
  }

  const chunks = shard(agent).filter(c => matchesOpts(c, opts));
  if (!chunks.length) return [];
  const qVec = vectorizeQuery(query, b.idf);
  if (!qVec) return [];

  const scored = [];
  for (const c of chunks) {
    const score = cosineSim(qVec, c.vec);
    if (score > 0) {
      scored.push({
        docId: c.videoId,
        docName: c.title,
        chunkText: c.text,
        score: Math.round(score * 10000) / 10000,
      });
    }
  }
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(topK || 3, 12)));
}

// Richer search: returns full chunk metadata (title/system/topic/channel/video_id)
// so the local brain server can render cards exactly like the Python server did.
function searchChunks(user, query, topK = 3, opts) {
  const b = brain();
  if (!b.ok) return [];
  const agent = userToAgent(user);

  const fast = searchVec(agent, query, topK, opts);
  if (fast !== null) return fast;

  const chunks = shard(agent).filter(c => matchesOpts(c, opts));
  if (!chunks.length) return [];
  const qVec = vectorizeQuery(query, b.idf);
  if (!qVec) return [];

  const scored = [];
  for (const c of chunks) {
    const score = cosineSim(qVec, c.vec);
    if (score > 0) {
      scored.push({
        agent: c.agent || agent,
        title: c.title || '',
        score: Math.round(score * 10000) / 10000,
        text: c.text || '',
        system: c.system || '',
        topic: c.topic || '',
        channel: c.channel || '',
        video_id: c.videoId || '',
        words: c.words || 0,
      });
    }
  }
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(topK || 3, 12)));
}

module.exports = {
  listUserDocs,
  searchUser,
  searchChunks,
  forEachJsonlSync,
  _internal: { userToAgent, tokenize, cosineSim, brain, shard, vectorizeQuery },
};
