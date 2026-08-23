// backend/lib/knowledge.js
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI KNOWLEDGE — grounds every agent in FIVE layers, and GROWS with use:
//   1. Knowledge ROUTES   — goal→playbook mapping so knowledge is APPLIED,
//                           not just recited (backend/knowledge/routes.json).
//   2. Digested mastery   — organized, timestamped DIGEST_/MASTERY_ docs from
//                           the digestion pipeline (digest-brain.js).
//   3. Static domain KB   — each agent's curated KB (backend/knowledge/*-kb.js).
//   4. Tools ledger       — living registry of the stack the agents run on;
//                           new tools (PayBox, Grok bot…) get amplified here.
//   5. Learned knowledge  — every run's Q→A stored per-agent in the local RAG
//                           index; relevant past work is recalled on future tasks.
// Fully self-contained, no external services required.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

let _rag = null, _kb = null, _routes = null, _tools = null;

function rag() { if (!_rag) { try { _rag = require('../rag-index'); } catch (_) { _rag = {}; } } return _rag; }
function kbIndex() { if (!_kb) { try { _kb = require('../knowledge'); } catch (_) { _kb = null; } } return _kb; }

const ROUTES_FILE = path.join(__dirname, '..', 'knowledge', 'routes.json');
const TOOLS_FILE = path.join(__dirname, '..', 'knowledge', 'tools-ledger.json');

function routesIndex() {
  if (_routes) return _routes;
  try { _routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); } catch (_) { _routes = { routes: {} }; }
  return _routes;
}
function toolsLedger() {
  if (_tools) return _tools;
  try { _tools = JSON.parse(fs.readFileSync(TOOLS_FILE, 'utf8')); } catch (_) { _tools = { tools: [] }; }
  return _tools;
}

function nsFor(agent) { return 'kb_' + String(agent || 'shaddai').toLowerCase(); }

// ── layer 1: routes of use ───────────────────────────────────────────────────
function matchRoute(agent, query) {
  const q = String(query || '').toLowerCase();
  if (!q) return null;
  const list = (routesIndex().routes || {})[String(agent).toUpperCase()] || [];
  let best = null, bestHits = 0;
  for (const r of list) {
    const hits = (r.match || []).filter(k => q.includes(k.toLowerCase())).length;
    if (hits > bestHits) { best = r; bestHits = hits; }
  }
  return best;
}

function routeContext(agent, query) {
  const r = matchRoute(agent, query);
  if (!r) return '';
  const steps = (r.playbook || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const refs = (r.sources || []).length ? `\nGround in: ${r.sources.join(', ')}` : '';
  return `ROUTE · ${r.title}${refs}\n${steps}`;
}

// ── layer 2: digested, timestamped mastery recall ────────────────────────────
function digestRecall(agent, query, k = 3) {
  try {
    const hits = rag().searchUser ? rag().searchUser(nsFor(agent), String(query || ''), k * 3) : [];
    const digests = (hits || [])
      .filter(h => h && /^DIGEST_|^MASTERY_/.test(h.docName || ''))
      .slice(0, k);
    return digests.map(h => {
      const t = h.timeLabel ? ` [≈${h.timeLabel}]` : '';
      const body = String(h.chunkText || '').split('\n').slice(0, 6).join(' ');
      return `• ${h.docName}${t} — ${body.slice(0, 320)}`;
    });
  } catch (_) { return []; }
}

// ── layer 3: curated static KB ───────────────────────────────────────────────
function staticKnowledge(agent, query) {
  try {
    const k = kbIndex();
    const hit = k && typeof k.lookup === 'function' ? k.lookup(String(agent).toUpperCase(), String(query || '')) : null;
    if (hit && hit.text) return (hit.title ? hit.title + '\n' : '') + hit.text;
  } catch (_) {}
  return '';
}

// ── layer 4: tools ledger (what the empire runs on / what's emerging) ───────
function toolsContext(query) {
  const led = toolsLedger();
  const tools = (led.tools || []).filter(t => t.status === 'active' || t.status === 'pilot');
  const emerging = (led.tools || []).filter(t => t.status === 'watchlist');
  const q = String(query || '').toLowerCase();
  const relevant = tools.filter(t => !q ||
    (t.useFor || []).some(u => q.includes(u.split(' ')[0].toLowerCase())) ||
    (t.category || '').split(/[-/]/).some(c => c.length > 3 && q.includes(c)));
  const act = (relevant.length ? relevant : tools).slice(0, 5).map(t => t.name).join(', ');
  const watch = emerging.slice(0, 3).map(t => `${t.name} (${(t.agents || []).join('/')})`).join(', ');
  let out = `TOOLING ACTIVE: ${act}`;
  if (watch) out += `\nEMERGING (scout & amplify when ready): ${watch}`;
  return out;
}

// ── layer 5: learned knowledge from prior runs ───────────────────────────────
function recall(agent, query, k = 2) {
  try {
    const hits = rag().searchUser ? rag().searchUser(nsFor(agent), String(query || ''), k * 2) : [];
    return (hits || [])
      .filter(h => h && !/^DIGEST_|^MASTERY_/.test(h.docName || ''))
      .filter(h => h.score === undefined || h.score > 0.03)
      .map(h => h.chunkText || h.text || h.chunk || h.content || '')
      .filter(Boolean)
      .slice(0, k);
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

// The knowledge block injected into an agent's system prompt — all five layers.
function contextFor(agent, query) {
  const parts = [];
  const route = routeContext(agent, query);
  if (route) parts.push('KNOWLEDGE ROUTE (how to apply what you know):\n' + route);
  const digests = digestRecall(agent, query, 3);
  if (digests.length) parts.push('ORGANIZED KNOWLEDGE (digested sources with ≈timestamps):\n' + digests.join('\n'));
  const st = staticKnowledge(agent, query);
  if (st) parts.push('DOMAIN KNOWLEDGE (use if relevant):\n' + st.slice(0, 1200));
  const tools = toolsContext(query);
  if (tools) parts.push(tools);
  const learned = recall(agent, query, 2);
  if (learned.length) parts.push('RELEVANT PAST WORK:\n' + learned.join('\n---\n').slice(0, 1000));
  return parts.join('\n\n');
}

module.exports = {
  staticKnowledge, recall, learn, contextFor, nsFor,
  // v2 exports — routes, digests, tools (used by brain-server + MCP too)
  routeContext, matchRoute, digestRecall, toolsContext,
  routesIndex, toolsLedger,
};
