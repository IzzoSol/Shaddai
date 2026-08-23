'use strict';

/**
 * rag-index.js
 * Per-user document RAG store using TF-IDF cosine similarity.
 * Pure Node.js — no external packages required.
 *
 * Pattern adapted from ./skill-embeddings.js (tokenize, termFrequency, cosineSim)
 * — comments there explain the math. This module:
 *   - chunks documents into ~500-word windows
 *   - persists per-user docs to backend/data/rag/{user}/docs.json
 *   - rebuilds the user's TF-IDF + IDF on every write so search reflects
 *     the latest corpus (re-normalizing each chunk vector)
 *
 * v2 — TIMESTAMPS (the brain knows WHERE knowledge lives, not just THAT it exists):
 *   - every chunk carries t0/t1 (seconds into the source) + how the time was derived
 *   - real timestamps: parsed from in-transcript markers ([MM:SS] / MM:SS / H:MM:SS)
 *   - estimated timestamps: word-position ÷ speaking rate (~150 wpm) or scaled to a
 *     known durationSec — flagged `tsEstimate:true` so nothing pretends to be exact
 *   - docs can carry { videoId, url, kind, durationSec, source } metadata
 *   - search hits come back with timeLabel + deepLink, fully backward compatible
 */

const fs = require('fs');
const path = require('path');

// ─── reuse tokenization from skill-embeddings.js where possible ──────────────
// (skill-embeddings.js doesn't export tokenize/termFrequency; copy with attribution.)
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

function termFrequency(tokens) {
  const tf = new Map();
  if (!tokens.length) return tf;
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  for (const [term, count] of tf) tf.set(term, count / tokens.length);
  return tf;
}

function cosineSim(vecA, vecB) {
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  for (const [term, w] of small) {
    const w2 = large.get(term);
    if (w2 !== undefined) dot += w * w2;
  }
  return dot;
}

// ─── timestamps ──────────────────────────────────────────────────────────────
const DEFAULT_WPM = 150; // typical spoken-word rate for talks/podcasts

/** Seconds → "MM:SS" (or "H:MM:SS" past an hour). */
function fmtTime(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(ss)}` : `${m}:${two(ss)}`;
}

/**
 * Scan a word array for timestamp markers: [MM:SS], MM:SS., H:MM:SS, (MM:SS)…
 * Returns [{word, sec}] filtered to a monotonic non-decreasing sequence —
 * stray numbers that aren't real markers almost never stay in order.
 */
function parseTimeMarkers(words) {
  const found = [];
  const re = /^\[?\(?((?:\d{1,2}:)?[0-5]?\d):([0-5]\d)\)?\]?[.:,;]?$/;
  for (let i = 0; i < words.length; i++) {
    const m = re.exec(String(words[i]));
    if (!m) continue;
    const parts = m[1].split(':');
    const h = parts.length === 2 ? parseInt(parts[0], 10) : 0;
    const mm = parts.length === 2 ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
    const sec = h * 3600 + mm * 60 + parseInt(m[2], 10);
    found.push({ word: i, sec });
  }
  const mono = [];
  let last = -1;
  for (const f of found) {
    if (f.sec >= last) { mono.push(f); last = f.sec; }
  }
  return mono;
}

/**
 * Build timestamped chunks for one document.
 * Priority: (1) real in-text markers, interpolated between;
 *           (2) uniform spread across a known durationSec;
 *           (3) word-position ÷ wpm estimate.
 */
function buildChunks(docId, text, meta) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return { chunks: [], hasReal: false };
  const markers = parseTimeMarkers(words);
  const hasReal = markers.length >= 2;
  const wpm = Number(meta && meta.wpm) > 20 ? Number(meta.wpm) : DEFAULT_WPM;
  const dur = Number(meta && meta.durationSec) > 0 ? Number(meta.durationSec) : 0;
  // When both real markers and a duration exist, scale markers to the true runtime.
  const scale = (hasReal && dur) ? dur / Math.max(1, markers[markers.length - 1].sec) : 1;

  function timeAt(wIdx) {
    const w = Math.max(0, Math.min(words.length - 1, wIdx));
    if (hasReal) {
      if (w <= markers[0].word) return markers[0].sec * scale;
      if (w >= markers[markers.length - 1].word) return markers[markers.length - 1].sec * scale;
      for (let k = 1; k < markers.length; k++) {
        if (w <= markers[k].word) {
          const a = markers[k - 1], b = markers[k];
          const f = (w - a.word) / Math.max(1, b.word - a.word);
          return (a.sec + f * (b.sec - a.sec)) * scale;
        }
      }
    }
    if (dur) return (w / words.length) * dur;
    return (w / wpm) * 60;
  }

  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    const slice = words.slice(i, i + CHUNK_WORDS);
    const t0 = Math.max(0, Math.floor(timeAt(i)));
    const t1 = Math.ceil(timeAt(i + slice.length - 1));
    chunks.push({
      id: docId + '_c' + chunks.length,
      text: slice.join(' '),
      t0,
      t1: Math.max(t0 + 1, t1),
      tsReal: hasReal,
      tfIdfVector: {}, // filled by rebuildVectors
    });
  }
  return { chunks, hasReal };
}

/** Deep link into the source moment (only when a real video id exists). */
function deepLink(videoId, sec) {
  const v = String(videoId || '').trim();
  if (!v) return null;
  return 'https://www.youtube.com/watch?v=' + encodeURIComponent(v) + '&t=' + Math.max(0, Math.floor(Number(sec) || 0)) + 's';
}

// ─── storage ─────────────────────────────────────────────────────────────────
const RAG_ROOT = path.join(__dirname, 'data', 'rag');

function safeUser(user) {
  // Whitelist; collapse weird chars to underscore. Empty → 'guest'.
  const u = String(user || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return u || 'guest';
}

function userDir(user) {
  const dir = path.join(RAG_ROOT, safeUser(user));
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function docsPath(user) {
  return path.join(userDir(user), 'docs.json');
}

function loadDocs(user) {
  const p = docsPath(user);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return []; }
}

function saveDocs(user, docs) {
  fs.writeFileSync(docsPath(user), JSON.stringify(docs, null, 2), 'utf8');
}

// ─── chunking (~500 words per chunk) ─────────────────────────────────────────
const CHUNK_WORDS = 500;

function chunkText(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(' '));
  }
  return chunks;
}

// ─── index build: compute IDF over ALL chunks of a user, then per-chunk vec ──
function rebuildVectors(docs) {
  // Collect all chunks → compute doc frequency (chunk-level)
  const docFreq = new Map();
  const allChunkTokens = [];

  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      const tokens = tokenize(chunk.text);
      allChunkTokens.push(tokens);
      const seen = new Set(tokens);
      for (const term of seen) docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  const N = allChunkTokens.length;
  const idf = {};
  for (const [term, df] of docFreq) {
    idf[term] = Math.log((N + 1) / (df + 1)) + 1;
  }

  // Assign normalized TF-IDF vectors back to chunks (stored as plain objects)
  let i = 0;
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      const tf = termFrequency(allChunkTokens[i++]);
      const vec = {};
      let mag = 0;
      for (const [term, tfw] of tf) {
        const w = tfw * (idf[term] || 0);
        if (w > 0) { vec[term] = w; mag += w * w; }
      }
      mag = Math.sqrt(mag);
      if (mag > 0) for (const t of Object.keys(vec)) vec[t] /= mag;
      chunk.tfIdfVector = vec;
    }
  }

  return { idf, N };
}

function vectorizeQuery(query, idf) {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const tf = termFrequency(tokens);
  const vec = new Map();
  let mag = 0;
  for (const [term, tfw] of tf) {
    const idfw = idf[term] || 0;
    if (!idfw) continue;
    const w = tfw * idfw;
    vec.set(term, w);
    mag += w * w;
  }
  if (!vec.size) return null;
  mag = Math.sqrt(mag);
  for (const [t, w] of vec) vec.set(t, w / mag);
  return vec;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Add a document for a user. Chunks text, recomputes TF-IDF across all of the
 * user's chunks, and persists docs.json. Returns {docId, chunks}.
 *
 * v2: optional 4th arg `meta`:
 *   { videoId, url, kind ('transcript'|'digest'|'run'|'tool'|…'),
 *     durationSec, wpm, source, title }
 * Chunks gain t0/t1 timestamps (real markers when present, estimates otherwise).
 */
function addDocument(user, name, text, meta) {
  if (!text || typeof text !== 'string') throw new Error('text required');
  const docs = loadDocs(user);

  const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const m = meta && typeof meta === 'object' ? meta : {};
  const built = buildChunks(docId, text, m);
  if (!built.chunks.length) throw new Error('No content found in text');

  const doc = {
    id: docId,
    name: String(name || 'untitled').slice(0, 200),
    text: text.slice(0, 1_000_000), // cap stored raw text at 1MB
    uploadedAt: new Date().toISOString(),
    // v2 source metadata (optional — absent on legacy docs)
    kind: m.kind ? String(m.kind).slice(0, 40) : undefined,
    videoId: m.videoId ? String(m.videoId).slice(0, 32) : undefined,
    url: m.url ? String(m.url).slice(0, 500) : undefined,
    title: m.title ? String(m.title).slice(0, 300) : undefined,
    source: m.source ? String(m.source).slice(0, 200) : undefined,
    durationSec: Number(m.durationSec) > 0 ? Math.round(Number(m.durationSec)) : undefined,
    tsMode: built.hasReal ? 'markers' : (Number(m.durationSec) > 0 ? 'duration' : 'estimate'),
    chunks: built.chunks,
  };
  docs.push(doc);

  const metaOut = rebuildVectors(docs);
  // Stash IDF per-user so search doesn't recompute it
  fs.writeFileSync(path.join(userDir(user), 'idf.json'), JSON.stringify(metaOut.idf), 'utf8');
  saveDocs(user, docs);

  return { docId, chunks: doc.chunks.length };
}

function _loadIdf(user) {
  const p = path.join(userDir(user), 'idf.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

/** Hit enrichment: time refs + deep link for one chunk of one doc. */
function _timeRefs(doc, chunk) {
  if (!chunk || chunk.t0 == null) return {};
  const vid = doc.videoId || '';
  return {
    t0: chunk.t0,
    t1: chunk.t1,
    tsEstimate: !chunk.tsReal,
    timeLabel: fmtTime(chunk.t0) + '–' + fmtTime(chunk.t1),
    deepLink: doc.url || deepLink(vid, chunk.t0),
  };
}

/**
 * Cosine-similarity search over all of user's chunks.
 * Returns top-K [{docId, docName, chunkText, score, t0?, t1?, timeLabel?, deepLink?, tsEstimate?}].
 */
function searchUser(user, query, topK = 3) {
  const docs = loadDocs(user);
  if (!docs.length) return [];
  const idf = _loadIdf(user);
  const qVec = vectorizeQuery(query, idf);
  if (!qVec) return [];

  const scored = [];
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      const vec = new Map(Object.entries(chunk.tfIdfVector || {}));
      const score = cosineSim(qVec, vec);
      if (score > 0) {
        scored.push({
          docId: doc.id,
          docName: doc.name,
          chunkText: chunk.text,
          score: Math.round(score * 10000) / 10000,
          ..._timeRefs(doc, chunk),
        });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function listUserDocs(user) {
  return loadDocs(user).map(d => ({
    id: d.id,
    name: d.name,
    title: d.title || d.name,
    kind: d.kind || 'transcript',
    videoId: d.videoId || null,
    url: d.url || null,
    durationSec: d.durationSec || null,
    tsMode: d.tsMode || 'legacy',
    chunks: (d.chunks || []).length,
    timedChunks: (d.chunks || []).filter(c => c && c.t0 != null).length,
    uploadedAt: d.uploadedAt,
  }));
}

/**
 * Backfill timestamps onto EXISTING docs (v1 stores have none).
 * `defaults`: optional map/doc-array of {name|id → {videoId,url,durationSec,wpm,kind}}.
 * Rebuilds chunk time refs from stored text; never touches vectors/idf.
 */
function backfillTimestamps(user, defaults) {
  const docs = loadDocs(user);
  const byKey = new Map();
  for (const d of (Array.isArray(defaults) ? defaults : Object.values(defaults || {}))) {
    if (d && d.name) byKey.set(String(d.name), d);
    if (d && d.id) byKey.set(String(d.id), d);
  }
  let touched = 0;
  for (const doc of docs) {
    const extra = byKey.get(doc.name) || byKey.get(doc.id) || {};
    if (extra.videoId && !doc.videoId) doc.videoId = String(extra.videoId).slice(0, 32);
    if (extra.url && !doc.url) doc.url = String(extra.url).slice(0, 500);
    if (extra.title && !doc.title) doc.title = String(extra.title).slice(0, 300);
    if (extra.kind && !doc.kind) doc.kind = String(extra.kind).slice(0, 40);
    if (Number(extra.durationSec) > 0 && !(doc.durationSec > 0)) doc.durationSec = Math.round(Number(extra.durationSec));
    const built = buildChunks(doc.id, doc.text, doc);
    if (!built.chunks.length) continue;
    doc.chunks = built.chunks.map((c, i) => ({
      ...c,
      id: doc.id + '_c' + i,
      tfIdfVector: (doc.chunks[i] && doc.chunks[i].tfIdfVector) || {},
    }));
    doc.tsMode = built.hasReal ? 'markers' : (doc.durationSec > 0 ? 'duration' : 'estimate');
    touched++;
  }
  if (touched) saveDocs(user, docs);
  return { ok: true, touched };
}

function deleteDocument(user, docId) {
  const docs = loadDocs(user);
  const idx = docs.findIndex(d => d.id === docId);
  if (idx === -1) return { ok: false, error: 'doc not found' };
  docs.splice(idx, 1);
  const meta = rebuildVectors(docs);
  fs.writeFileSync(path.join(userDir(user), 'idf.json'), JSON.stringify(meta.idf), 'utf8');
  saveDocs(user, docs);
  return { ok: true };
}

module.exports = {
  addDocument,
  searchUser,
  listUserDocs,
  deleteDocument,
  backfillTimestamps,
  // exposed for testing
  _internal: { tokenize, termFrequency, cosineSim, chunkText, buildChunks, parseTimeMarkers, fmtTime, deepLink },
};
