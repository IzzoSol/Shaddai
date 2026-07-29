#!/usr/bin/env node
'use strict';

/**
 * shaddai-rag — Zero-dependency TF-IDF RAG for Node.js.
 *
 *   const rag = require('shaddai-rag');
 *   rag.init({ dataDir: './my-rag-data' });
 *   rag.addDocument('user1', 'doc-name', 'long text...');
 *   const hits = rag.searchUser('user1', 'search query');
 *
 * Everything persists to disk as plain JSON. No databases, no vector stores,
 * no external packages — just Node fs + math.
 */

// ─── config ───────────────────────────────────────────────────────────────────
let RAG_ROOT = null; // set by init()

function init(opts = {}) {
  RAG_ROOT = String(opts.dataDir || opts.data_dir || path.join(process.cwd(), 'rag-data'));
  try { fs.mkdirSync(RAG_ROOT, { recursive: true }); } catch (_) {}
}

// ─── stopwords & tokenization ─────────────────────────────────────────────────
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

// ─── storage ──────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

function safeUser(user) {
  const u = String(user || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return u || 'guest';
}

function userDir(user) {
  const dir = path.join(RAG_ROOT || path.join(process.cwd(), 'rag-data'), safeUser(user));
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

// ─── chunking ─────────────────────────────────────────────────────────────────
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

// ─── index build ──────────────────────────────────────────────────────────────
function rebuildVectors(docs) {
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
  for (const [term, df] of docFreq) idf[term] = Math.log((N + 1) / (df + 1)) + 1;
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

function _loadIdf(user) {
  const p = path.join(userDir(user), 'idf.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

// ─── public API ───────────────────────────────────────────────────────────────

function addDocument(user, name, text) {
  if (!RAG_ROOT) init();
  if (!text || typeof text !== 'string') throw new Error('text required');
  const docs = loadDocs(user);
  const chunksText = chunkText(text);
  if (!chunksText.length) throw new Error('No content found in text');
  const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const doc = {
    id: docId, name: String(name || 'untitled').slice(0, 200),
    text: text.slice(0, 1_000_000), uploadedAt: new Date().toISOString(),
    chunks: chunksText.map((t, i) => ({ id: docId + '_c' + i, text: t, tfIdfVector: {} })),
  };
  docs.push(doc);
  const meta = rebuildVectors(docs);
  fs.writeFileSync(path.join(userDir(user), 'idf.json'), JSON.stringify(meta.idf), 'utf8');
  saveDocs(user, docs);
  return { docId, chunks: doc.chunks.length };
}

function searchUser(user, query, topK = 3) {
  if (!RAG_ROOT) init();
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
      if (score > 0) scored.push({ docId: doc.id, docName: doc.name, chunkText: chunk.text, score: Math.round(score * 10000) / 10000 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function listUserDocs(user) {
  if (!RAG_ROOT) init();
  return loadDocs(user).map(d => ({ id: d.id, name: d.name, chunks: (d.chunks || []).length, uploadedAt: d.uploadedAt }));
}

function deleteDocument(user, docId) {
  if (!RAG_ROOT) init();
  const docs = loadDocs(user);
  const idx = docs.findIndex(d => d.id === docId);
  if (idx === -1) return { ok: false, error: 'doc not found' };
  docs.splice(idx, 1);
  const meta = rebuildVectors(docs);
  fs.writeFileSync(path.join(userDir(user), 'idf.json'), JSON.stringify(meta.idf), 'utf8');
  saveDocs(user, docs);
  return { ok: true };
}

module.exports = { init, addDocument, searchUser, listUserDocs, deleteDocument,
  _internal: { tokenize, termFrequency, cosineSim, chunkText } };
