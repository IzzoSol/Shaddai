// backend/lib/reputation-engine.js
// REPUTATION ENGINE — persist per-agent accuracy / success-rate / latency across
// real tool outcomes, so agents compound reputation over time and the directory
// can rank by evidence instead of vibes.
//
// Zero dependencies. Append-only, capped event log + a live aggregate. Feeds:
//   record({ agent, outcome, latencyMs, tool, task })  → history + aggregates
//   rank()                                              → sorted leadboard
//   leader()                                            → top agent
//   get(agent)                                          → single agent stats
//
// Persistence: backend/data/reputation.json
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'reputation.json');
const MAX_EVENTS = 2000;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (_) { return { agents: {}, events: [] }; }
}
function save(d) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); return true; }
  catch (_) { return false; }
}

function fmtAgent(agent) { return String(agent || '').toUpperCase(); }

// outcome: true|false (success), or 'win'|'neutral'|'loss'
function toSuccess(outcome) {
  if (outcome === true || outcome === 'win' || outcome === 'success') return true;
  if (outcome === false || outcome === 'loss' || outcome === 'fail' || outcome === 'error') return false;
  return null; // neutral → not counted toward success rate
}

function ensure(agent) {
  if (!agent.agents) agent.agents = {};
}

function record({ agent, outcome, latencyMs = 0, tool = '', task = '' }) {
  const d = load();
  const id = fmtAgent(agent);
  const a = d.agents[id] || (d.agents[id] = {
    id, calls: 0, successes: 0, failures: 0, neutral: 0,
    totalLatency: 0, avgLatency: 0, accuracy: 0.5, successRate: 0, lastAt: null,
  });

  const success = toSuccess(outcome);
  a.calls += 1;
  if (success === true) a.successes += 1;
  else if (success === false) a.failures += 1;
  else a.neutral += 1;

  const lat = Math.max(0, Number(latencyMs) || 0);
  a.totalLatency += lat;
  a.avgLatency = a.calls ? Math.round(a.totalLatency / a.calls) : 0;

  const decided = a.successes + a.failures;
  a.successRate = decided ? +(a.successes / decided).toFixed(4) : 0;
  // accuracy = blended success rate weighted toward 0.5 early on (Bayesian-ish,
  // no strong opinion on few samples)
  a.accuracy = +( (a.successes + 0.5) / (decided + 1) ).toFixed(4);
  a.lastAt = new Date().toISOString();

  d.events.push({ agent: id, tool, task: String(task || '').slice(0, 120), outcome: success, latencyMs: lat, at: a.lastAt });
  if (d.events.length > MAX_EVENTS) d.events = d.events.slice(-MAX_EVENTS);

  save(d);
  return a;
}

function get(agent) {
  const d = load();
  return d.agents[fmtAgent(agent)] || null;
}

function rank() {
  const d = load();
  return Object.values(d.agents)
    .sort((a, b) => b.accuracy - a.accuracy || b.calls - a.calls)
    .map((a, i) => ({ rank: i + 1, ...a }));
}

function leader() {
  const r = rank();
  return r.length ? r[0] : null;
}

function recent(agent, limit = 50) {
  const d = load();
  const id = fmtAgent(agent);
  return d.events.filter(e => e.agent === id).slice(-Math.max(1, Math.min(500, limit))).reverse();
}

function reset(agent) {
  const d = load();
  const id = fmtAgent(agent);
  if (id === '*') { d.agents = {}; d.events = []; save(d); return { ok: true, reset: 'all' }; }
  delete d.agents[id];
  d.events = d.events.filter(e => e.agent !== id);
  save(d);
  return { ok: true, reset: id };
}

module.exports = { record, get, rank, leader, recent, reset };