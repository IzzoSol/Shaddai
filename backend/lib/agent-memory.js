'use strict';
/**
 * Per-customer agent memory — lets an embedded agent "learn / grow with" each
 * user it talks to. Keyed by (userId, agentName). ADDITIVE layer: persisted to
 * data/agent-memory.json under a reserved namespace key so it does NOT clobber
 * any other flat key:value entries an earlier module may have written there.
 *
 * Wiring (done by the caller, NOT here):
 *   1. app.use('/api/agent-memory', require('./lib/agent-memory').router);
 *   2. Inside agent-engine.callLLM, inject contextString() into the system prompt
 *      so the agent recalls what it knows about this user (see RETURN notes).
 *
 * Node built-ins only (fs, path). Matches the repo JSON-file style:
 *   _read() -> JSON.parse(readFileSync) catch {} ;  _write() -> writeFileSync.
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'agent-memory.json');

// Reserved top-level key under which all per-user memory lives. Keeps this
// module's data isolated from any pre-existing flat entries in the same file.
const NS = '__userMemory__';
const MAX_FACTS = 50;     // most-recent facts kept per (user, agent) pair
const MAX_FACT_LEN = 500; // sanitize cap per fact
const RECALL_LIMIT = 8;   // facts returned by recall()/contextString()

function _read() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}
function _write(obj) {
  try { fs.writeFileSync(STORE, JSON.stringify(obj, null, 2)); return true; } catch { return false; }
}

/** Normalize a userId to a sane non-empty string. */
function _uid(userId) {
  const u = String(userId == null ? '' : userId).trim();
  return u || 'anon';
}
/** Normalize an agent name to an uppercased non-empty string. */
function _agent(agentName) {
  const a = String(agentName == null ? '' : agentName).trim().toUpperCase();
  return a || 'AGENT';
}
/** Composite store key for a (user, agent) pair. */
function _pairKey(userId, agentName) {
  return _uid(userId) + '::' + _agent(agentName);
}

/** Get the facts array for a pair from an already-read store (may be undefined). */
function _listFrom(obj, userId, agentName) {
  const ns = obj[NS];
  if (!ns || typeof ns !== 'object') return [];
  const list = ns[_pairKey(userId, agentName)];
  return Array.isArray(list) ? list : [];
}

/** Lowercased word set for cheap relevance scoring. */
function _words(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Append { fact, at } to a pair's list, capped at the most recent MAX_FACTS.
 * Empty/whitespace facts are ignored. Fact is stored trimmed, max 500 chars.
 */
function remember(userId, agentName, fact) {
  const clean = String(fact == null ? '' : fact).trim().slice(0, MAX_FACT_LEN);
  if (!clean) return false;
  const obj = _read();
  if (!obj[NS] || typeof obj[NS] !== 'object') obj[NS] = {};
  const key = _pairKey(userId, agentName);
  const list = Array.isArray(obj[NS][key]) ? obj[NS][key] : [];
  list.push({ fact: clean, at: new Date().toISOString() });
  // Keep only the most recent MAX_FACTS.
  obj[NS][key] = list.slice(-MAX_FACTS);
  return _write(obj);
}

/**
 * Return the most relevant facts for a pair as an array of { fact, at }.
 * If `query` is given, score by shared lowercased word overlap (top 8);
 * otherwise return the last 8 (most recent).
 */
function recall(userId, agentName, query) {
  const list = _listFrom(_read(), userId, agentName);
  if (!list.length) return [];

  const qWords = _words(query);
  if (!qWords.length) {
    return list.slice(-RECALL_LIMIT).map(e => ({ fact: e.fact, at: e.at }));
  }

  const qSet = new Set(qWords);
  const scored = list.map((e, i) => {
    const fWords = _words(e.fact);
    let overlap = 0;
    for (const w of fWords) if (qSet.has(w)) overlap++;
    return { e, i, score: overlap };
  });
  // Highest overlap first; ties broken by recency (later index wins).
  scored.sort((a, b) => (b.score - a.score) || (b.i - a.i));
  return scored
    .filter(s => s.score > 0)
    .slice(0, RECALL_LIMIT)
    .map(s => ({ fact: s.e.fact, at: s.e.at }));
}

/**
 * Short (<= ~600 char) summary of what we know about this user, for prompt
 * injection. Returns '' when there is nothing remembered.
 */
function contextString(userId, agentName) {
  const list = _listFrom(_read(), userId, agentName);
  if (!list.length) return '';

  const header = 'Things you remember about this user:\n';
  const BUDGET = 600;
  const lines = [];
  let len = header.length;
  // Most recent first so the freshest context survives the budget.
  for (let i = list.length - 1; i >= 0; i--) {
    const line = '- ' + list[i].fact;
    if (len + line.length + 1 > BUDGET) break;
    lines.push(line);
    len += line.length + 1;
  }
  if (!lines.length) return '';
  return header + lines.join('\n');
}

/** Clear all facts for a (user, agent) pair. */
function forget(userId, agentName) {
  const obj = _read();
  if (obj[NS] && typeof obj[NS] === 'object') {
    delete obj[NS][_pairKey(userId, agentName)];
    return _write(obj);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Express router (mounted by caller, e.g. app.use('/api/agent-memory', router))
// ---------------------------------------------------------------------------
let router;
try {
  const express = require('express');
  router = express.Router();

  // GET /:agent?user=<id>&q=<query> -> { facts: [...] }
  router.get('/:agent', (req, res) => {
    const user = req.query.user;
    const q = req.query.q || req.query.query || '';
    res.json({ facts: recall(user, req.params.agent, q) });
  });

  // POST /:agent  body { user, fact } -> { ok: true }
  router.post('/:agent', (req, res) => {
    const body = req.body || {};
    const ok = remember(body.user, req.params.agent, body.fact);
    res.json({ ok: !!ok });
  });
} catch (_) {
  // express not resolvable in this context — export a no-op router so requiring
  // this module never throws. Real mounting happens in the server where express exists.
  router = function noopRouter() {};
}

module.exports = { remember, recall, contextString, forget, router };
