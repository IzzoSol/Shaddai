'use strict';
// Game-dev library — lazy BM25 search over backend/knowledge/gamedev/*.jsonl.
// Memory-aware: nothing loads until the first query, and the index is dropped after
// IDLE_MS of no use (or when toggled off in /ops.html). Built by scripts/gamedev-ingest.js.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'knowledge', 'gamedev');
const IDLE_MS = 10 * 60 * 1000;
const STOP = new Set('the a an and or of to in is it for on with as at by be this that from are was you your can will use using how what'.split(' '));

let idx = null;     // { docs, post, df, avgLen, byId }
let idleTimer = null;
let off = false;    // toggled off from the ops page

const tok = (s) => (String(s).toLowerCase().match(/[a-z0-9_]{2,}/g) || []).filter((w) => !STOP.has(w));

function sources() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'sources.json'), 'utf8')); } catch (_) { return {}; }
}

function build() {
  // Text stays on disk (read by byte offset on demand); only the index lives in RAM.
  const docs = [], post = new Map(), byId = new Map(), seen = new Set();
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')); } catch (_) {}
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f));
    let pos = 0;
    while (pos < buf.length) {
      let end = buf.indexOf(10, pos); if (end < 0) end = buf.length;
      const off = pos, len = end - pos; pos = end + 1;
      if (!len) continue;
      let d; try { d = JSON.parse(buf.toString('utf8', off, off + len)); } catch (_) { continue; }
      const hash = require('crypto').createHash('md5').update(d.text).digest('hex');
      if (seen.has(hash)) continue; seen.add(hash);          // same section in two repos → keep the first
      const n = docs.length;
      const toks = tok(d.title + ' ' + d.title + ' ' + d.path + ' ' + d.text); // title/path weighted x2
      docs.push({ id: d.id, source: d.source, path: d.path, title: d.title, kind: d.kind, part: d.part, _len: toks.length || 1, f, off, len });
      byId.set(d.id, n);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      for (const [t, c] of tf) { let a = post.get(t); if (!a) post.set(t, (a = [])); a.push(n, c); }
    }
  }
  const avgLen = docs.reduce((a, d) => a + d._len, 0) / (docs.length || 1);
  return { docs, post, byId, avgLen };
}

function textOf(d) {
  const fd = fs.openSync(path.join(DIR, d.f), 'r');
  try { const b = Buffer.alloc(d.len); fs.readSync(fd, b, 0, d.len, d.off); return JSON.parse(b.toString('utf8')).text; }
  finally { fs.closeSync(fd); }
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(unload, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}
function load() {
  if (off) throw new Error('gamedev library is switched off (ops toggle)');
  if (!idx) idx = build();
  touch();
  return idx;
}
function unload() { idx = null; if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } if (global.gc) global.gc(); }
function setOff(v) { off = !!v; if (off) unload(); }

function search(query, { source, kind, k = 6 } = {}) {
  const I = load();
  const qt = [...new Set(tok(query))];
  if (!qt.length) return [];
  const N = I.docs.length, scores = new Map();
  for (const t of qt) {
    const p = I.post.get(t); if (!p) continue;
    const idf = Math.log(1 + (N - p.length / 2 + 0.5) / (p.length / 2 + 0.5));
    for (let i = 0; i < p.length; i += 2) {
      const d = I.docs[p[i]], tf = p[i + 1];
      if (source && d.source !== source) continue;
      if (kind && d.kind !== kind) continue;
      const s = idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d._len / I.avgLen)));
      scores.set(p[i], (scores.get(p[i]) || 0) + s);
    }
  }
  // Prefer skills/docs slightly over raw code for "how do I" questions.
  const boost = { skill: 1.25, doc: 1.1, template: 1.05, shader: 1, code: 0.9 };
  return [...scores.entries()]
    .map(([n, s]) => ({ d: I.docs[n], s: s * (boost[I.docs[n].kind] || 1) }))
    .sort((a, b) => b.s - a.s).slice(0, Math.min(20, Math.max(1, k)))
    .map(({ d, s }) => ({ id: d.id, source: d.source, path: d.path, title: d.title, kind: d.kind, part: d.part, score: +s.toFixed(2), text: textOf(d) }));
}

function get(id) { const I = load(); const n = I.byId.get(id); if (n == null) return null; const d = I.docs[n]; return { id: d.id, source: d.source, path: d.path, title: d.title, kind: d.kind, part: d.part, text: textOf(d) }; }

// Skill/template listing (cheap: reads the jsonl once via the index).
function list({ source, kind } = {}) {
  const I = load(); const seen = new Set(), out = [];
  for (const d of I.docs) {
    if ((source && d.source !== source) || (kind && d.kind !== kind)) continue;
    const key = d.source + ':' + d.path; if (seen.has(key)) continue; seen.add(key);
    out.push({ source: d.source, path: d.path, title: d.title, kind: d.kind });
  }
  return out;
}

function stats() {
  return { loaded: !!idx, off, sections: idx ? idx.docs.length : null, sources: sources() };
}

module.exports = { search, get, list, stats, unload, setOff, sources };
