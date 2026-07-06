// ============================================================================
// SHADDAI Demo Limit — protects the SHARED key pool from abuse.
// ----------------------------------------------------------------------------
// GOAL: let anyone test the dashboard instantly on our shared Groq/Ollama-Cloud
// keys, WITHOUT letting one visitor (or a bot) drain the whole free quota.
//
//   • Per-visitor daily cap  (DEMO_PER_VISITOR_DAILY, default 25 calls/day)
//   • Global daily cap        (DEMO_GLOBAL_DAILY,      default 2000 calls/day)
//   • BYOK bypasses BOTH — a user on their OWN key is never limited.
//
// Counters are in-memory and reset at UTC midnight. Good enough for a beta demo;
// swap the Map for Redis when you outgrow a single server.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const PER_VISITOR = Number(process.env.DEMO_PER_VISITOR_DAILY) || 25;
const GLOBAL      = Number(process.env.DEMO_GLOBAL_DAILY)      || 2000;

// --- Persistence: local JSON now, Cloudflare KV later --------------------------
// backend/data/demo-limit.json survives restarts. When CLOUDFLARE creds land we
// swap _load/_save to KV (same shape) and everything else stays identical.
const _FILE = path.join(__dirname, 'data', 'demo-limit.json');

function todayKey() { return new Date().toISOString().slice(0, 10); } // YYYY-MM-DD (UTC)

let _day = todayKey();
let _global = 0;
let _visitors = new Map(); // visitorId -> count today

function _load() {
  try {
    const s = JSON.parse(fs.readFileSync(_FILE, 'utf8'));
    if (s && s.day === todayKey()) {           // only restore if it's still the same UTC day
      _day = s.day;
      _global = s.global || 0;
      _visitors = new Map(Object.entries(s.visitors || {}));
    }
  } catch (_) { /* first run / absent — start fresh */ }
}
_load();

function _flush() {                             // synchronous write of current state
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  try {
    fs.mkdirSync(path.dirname(_FILE), { recursive: true });
    fs.writeFileSync(_FILE, JSON.stringify({ day: _day, global: _global, visitors: Object.fromEntries(_visitors) }));
  } catch (_) { /* non-fatal — limits still enforced in memory */ }
}

let _saveTimer = null;
function _save() {                              // debounced write so bursts don't thrash disk
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => { _saveTimer = null; _flush(); }, 1500);
}

// Guarantee durability if the process exits before the debounce fires.
['beforeExit', 'SIGINT', 'SIGTERM'].forEach(ev =>
  process.once(ev, () => { _flush(); if (ev !== 'beforeExit') process.exit(0); })
);

function rollIfNewDay() {
  const t = todayKey();
  if (t !== _day) { _day = t; _global = 0; _visitors.clear(); _save(); }
}

// Derive a stable-ish visitor id from the request (session > user id > IP).
function visitorId(req) {
  return (
    (req.headers && (req.headers['x-visitor-id'] || req.headers['x-session-id'])) ||
    (req.user && (req.user.id || req.user.userId)) ||
    (req.ip) ||
    (req.headers && req.headers['x-forwarded-for']) ||
    'anon'
  );
}

// True when the caller is on their own key → skip all shared-pool limits.
function hasBYOK(req) {
  if (req && req.byok) return true;
  const h = req && req.headers || {};
  if (h['x-byok'] || h['x-api-key']) return true;
  try { // any stored BYOK key means they're a real key holder
    const eng = require('./agent-engine');
    if (eng && typeof eng.getBYOKKey === 'function') {
      return ['groq', 'openrouter', 'openai', 'claude'].some(p => eng.getBYOKKey(p));
    }
  } catch (_) {}
  return false;
}

// Check + consume one unit. Returns { ok, reason, remaining, limit, scope }.
function consume(req) {
  rollIfNewDay();
  if (hasBYOK(req)) return { ok: true, byok: true, remaining: Infinity };

  if (_global >= GLOBAL) {
    return { ok: false, scope: 'global', reason: 'Daily demo capacity reached — add your own free API key to keep going.', remaining: 0, limit: GLOBAL };
  }
  const id = visitorId(req);
  const used = _visitors.get(id) || 0;
  if (used >= PER_VISITOR) {
    return { ok: false, scope: 'visitor', reason: `You've used your ${PER_VISITOR} free demo messages for today. Add your own free API key for unlimited use.`, remaining: 0, limit: PER_VISITOR };
  }

  _visitors.set(id, used + 1);
  _global += 1;
  _save();
  return { ok: true, remaining: PER_VISITOR - used - 1, limit: PER_VISITOR, scope: 'visitor' };
}

// Express middleware form — 429s when the demo pool is spent. Mount on public
// LLM routes: app.post('/api/model/chat', demoLimit, handler)
function middleware(req, res, next) {
  const r = consume(req);
  if (!r.ok) return res.status(429).json({ ok: false, error: r.reason, limit: r.limit, scope: r.scope, needsKey: true });
  res.setHeader('X-Demo-Remaining', String(r.remaining));
  next();
}

function stats() {
  rollIfNewDay();
  return { day: _day, globalUsed: _global, globalLimit: GLOBAL, perVisitorLimit: PER_VISITOR, activeVisitors: _visitors.size };
}

module.exports = { consume, middleware, stats, visitorId, hasBYOK, PER_VISITOR, GLOBAL };
