// backend/lib/knowledge.js
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI KNOWLEDGE — grounds every agent in two layers, and GROWS with use:
//   1. Static domain knowledge — each agent's curated KB (backend/knowledge/*-kb.js).
//   2. Learned knowledge — every run's Q→A is stored per-agent in the local RAG
//      index, so relevant past work is recalled on future tasks. The more the
//      system is used, the more each agent knows. Fully self-contained, no external
//      services, no third-party dependencies.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

let _rag = null, _kb = null;
function rag() { if (!_rag) { try { _rag = require('../rag-index'); } catch (_) { _rag = {}; } } return _rag; }
function kbIndex() { if (!_kb) { try { _kb = require('../knowledge'); } catch (_) { _kb = null; } } return _kb; }

function nsFor(agent) { return 'kb_' + String(agent || 'shaddai').toLowerCase(); }

// Curated, evergreen domain knowledge for an agent relevant to the query.
function staticKnowledge(agent, query) {
  try {
    const k = kbIndex();
    const hit = k && typeof k.lookup === 'function' ? k.lookup(String(agent).toUpperCase(), String(query || '')) : null;
    if (hit && hit.text) return (hit.title ? hit.title + '\n' : '') + hit.text;
  } catch (_) {}
  return '';
}

// Recall what this agent has LEARNED from prior runs, relevant to the query.
function recall(agent, query, k = 2) {
  try {
    const hits = rag().searchUser ? rag().searchUser(nsFor(agent), String(query || ''), k) : [];
    return (hits || [])
      .filter(h => h && (h.score === undefined || h.score > 0.03))
      .map(h => h.chunkText || h.text || h.chunk || h.content || '')
      .filter(Boolean);
  } catch (_) { return []; }
}

// Learn: store a Q→A into this agent's growing store (best-effort, never throws).
function learn(agent, question, answer) {
  try {
    if (!rag().addDocument) return;
    const q = String(question || '').slice(0, 500);
    const a = String(answer || '').slice(0, 2000);
    if (a.length < 30) return; // don't store empty/failed answers
    rag().addDocument(nsFor(agent), 'run_' + Date.now(), 'Q: ' + q + '\nA: ' + a);
  } catch (_) {}
}

// The knowledge block to inject into an agent's system prompt (static + learned).
function contextFor(agent, query) {
  const parts = [];
  const st = staticKnowledge(agent, query);
  if (st) parts.push('DOMAIN KNOWLEDGE (use if relevant):\n' + st.slice(0, 1200));
  const learned = recall(agent, query, 2);
  if (learned.length) parts.push('RELEVANT PAST WORK:\n' + learned.join('\n---\n').slice(0, 1000));
  return parts.join('\n\n');
}

module.exports = { staticKnowledge, recall, learn, contextFor, nsFor };
