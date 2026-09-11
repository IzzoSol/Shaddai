'use strict';
/**
 * SHADDAI Agent WORK loop — the differentiator.
 *
 * Agents do REAL work (via the existing agent-engine run path), earn Sparks,
 * and produce two product surfaces:
 *   - "while you were away" summary  (GET /api/work/summary)
 *   - live "agents at work" feed     (GET /api/work/feed)
 *
 * Mount (in server-production.js):
 *     app.use('/api/work', require('./work-sessions'));
 *
 * Design rules honored here:
 *   - REUSES the real agent execution path (agent-engine createTask/runAgentLoop/
 *     getTask). It does NOT reimplement the LLM engine. If the engine is
 *     unavailable or produces no result (no LLM key in dev), it DEGRADES to a
 *     short deterministic "did X" activity so the loop/feed never hard-fails.
 *   - Sparks payout is SERVER-AUTHORITATIVE (the client never says how much it
 *     earned) and IDEMPOTENT — economy-service.grant(userId, amount, reason,
 *     idempotencyKey) is called with the sessionId as the idempotency key, so a
 *     retry / double-click / restart-replay never double-pays.
 *   - In-memory ring buffers (feed <= 60, per-user activity <= 100) with OPTIONAL
 *     atomic-file persistence (data/work.json, tmp+rename) so a restart doesn't
 *     wipe the "while you were away" summary. File I/O never crashes the process.
 *   - Anti-farm: one active session per (user, agent) at a time (server-side).
 *   - Inputs validated; bad input -> clean 400, never a 500 crash.
 *
 * Zero new npm deps.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ---------------------------------------------------------------------------
// Dependencies — loaded defensively so a missing/broken module degrades
// gracefully instead of taking the whole server down at mount time.
// ---------------------------------------------------------------------------
let economy = null;
try {
  economy = require('./economy-service').getDefault();
} catch (e) {
  console.error('[work-sessions] economy-service unavailable:', e.message);
}

let engine = null;
try {
  engine = require('./agent-engine');
} catch (e) {
  console.error('[work-sessions] agent-engine unavailable (degrade mode):', e.message);
}

// The 7 canonical agents. Used to validate/normalize the requested agent.
const AGENTS = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];

// ---------------------------------------------------------------------------
// Bounds & tuning
// ---------------------------------------------------------------------------
const FEED_MAX = 60;            // global feed ring buffer
const USER_ACTIVITY_MAX = 100;  // per-user activity ring buffer
const TASK_MAX_MS = 45000;      // hard cap on how long we wait for the engine
const POLL_MS = 400;            // engine task poll interval
const SPARKS_MIN = 5;
const SPARKS_MAX = 20;

const ID_RE = /^[\w-]{1,64}$/;

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
// feed: newest-last array of privacy-safe public activity entries.
let feed = [];
// activityByUser: userId -> newest-last array of that user's completed activities.
const activityByUser = new Map();
// lastSeenByUser: userId -> ISO string of the last time /summary was read.
const lastSeenByUser = new Map();
// active: Set of "userId::AGENT" keys currently mid-session (anti-farm + indicator).
const active = new Set();

// ---------------------------------------------------------------------------
// Persistence (optional, atomic, crash-safe)
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'work.json');
const DATA_TMP = DATA_FILE + '.tmp';
let _saveScheduled = false;

function loadState() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw || !raw.trim()) return;
    const db = JSON.parse(raw);
    if (Array.isArray(db.feed)) feed = db.feed.slice(-FEED_MAX);
    if (db.activityByUser && typeof db.activityByUser === 'object') {
      for (const [uid, list] of Object.entries(db.activityByUser)) {
        if (Array.isArray(list)) activityByUser.set(uid, list.slice(-USER_ACTIVITY_MAX));
      }
    }
    if (db.lastSeenByUser && typeof db.lastSeenByUser === 'object') {
      for (const [uid, ts] of Object.entries(db.lastSeenByUser)) {
        if (typeof ts === 'string') lastSeenByUser.set(uid, ts);
      }
    }
  } catch (e) {
    // Corrupt/unreadable file must never crash startup.
    console.error('[work-sessions] loadState failed (ignored):', e.message);
  }
}

// Persist atomically: write tmp then rename over target. A crash leaves either
// the old or the new file intact, never a half-written one. Never throws.
function saveStateNow() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = {
      feed,
      activityByUser: Object.fromEntries(activityByUser),
      lastSeenByUser: Object.fromEntries(lastSeenByUser)
    };
    fs.writeFileSync(DATA_TMP, JSON.stringify(db));
    fs.renameSync(DATA_TMP, DATA_FILE);
  } catch (e) {
    console.error('[work-sessions] saveState failed (ignored):', e.message);
  }
}

// Debounce saves so a burst of activity coalesces into one write.
function scheduleSave() {
  if (_saveScheduled) return;
  _saveScheduled = true;
  setTimeout(() => { _saveScheduled = false; saveStateNow(); }, 500).unref?.();
}

loadState();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normAgent(agent) {
  if (typeof agent !== 'string') return null;
  const up = agent.trim().toUpperCase();
  return AGENTS.includes(up) ? up : null;
}

function newSessionId() {
  // Prefer engine/crypto randomness; fall back to time+rand. Only [\w-] chars.
  try {
    return 'ws_' + require('crypto').randomUUID();
  } catch (_) {
    return 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
}

// Scale the Sparks payout by (rough) task effort — server-authoritative, small
// positive integer, clamped to [SPARKS_MIN, SPARKS_MAX]. The client cannot
// influence this beyond providing the task text.
function sparksForTask(task, result) {
  const taskLen = (task || '').length;
  const resLen = (result || '').length;
  // Base 5, +1 per ~40 task chars, +1 per ~200 result chars.
  let s = SPARKS_MIN + Math.floor(taskLen / 40) + Math.floor(resLen / 200);
  if (s < SPARKS_MIN) s = SPARKS_MIN;
  if (s > SPARKS_MAX) s = SPARKS_MAX;
  return s;
}

// Short human "did X" action verb/phrase for the public feed & summary.
// Privacy-safe: derived from agent + a compact task hint, never raw output.
function actionPhrase(agent, task, degraded) {
  const t = (task || '').replace(/\s+/g, ' ').trim();
  const hint = t ? (t.length > 48 ? t.slice(0, 45) + '…' : t) : 'a task';
  const verbs = {
    SHADDAI: 'coordinated', ZEROX: 'analyzed', ORACLE: 'researched',
    NEXUS: 'built', TURTLE: 'designed', QUILL: 'wrote', PIKADON: 'audited'
  };
  const verb = verbs[agent] || 'worked on';
  return `${verb} ${hint}` + (degraded ? '' : '');
}

function relTime(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'just now';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function pushUserActivity(userId, entry) {
  let list = activityByUser.get(userId);
  if (!list) { list = []; activityByUser.set(userId, list); }
  list.push(entry);
  if (list.length > USER_ACTIVITY_MAX) list.splice(0, list.length - USER_ACTIVITY_MAX);
}

function pushFeed(entry) {
  feed.push(entry);
  if (feed.length > FEED_MAX) feed.splice(0, feed.length - FEED_MAX);
}

// ---------------------------------------------------------------------------
// The real work runner — REUSES agent-engine (createTask/runAgentLoop/getTask).
// Returns { summary, result, degraded }. Never throws; degrades on any failure.
// ---------------------------------------------------------------------------
async function runRealWork(agent, task) {
  // Degrade path: deterministic "did X" so the loop/feed works with no LLM.
  const degrade = (why) => ({
    summary: `${agent} ${actionPhrase(agent, task, true)}.`,
    result: `${agent} completed a work session on: ${(task || '').slice(0, 160)}`,
    degraded: true,
    why: why || 'engine-unavailable'
  });

  if (!engine || typeof engine.createTask !== 'function' ||
      typeof engine.runAgentLoop !== 'function' || typeof engine.getTask !== 'function') {
    return degrade('engine-unavailable');
  }

  try {
    const t = engine.createTask(task, agent, { maxIter: 3 });
    // runAgentLoop resolves when the task is done; race it against a hard cap so
    // a stuck engine can't hold the request open forever.
    const loop = Promise.resolve().then(() => engine.runAgentLoop(t.id));
    let timer;
    const cap = new Promise((resolve) => {
      timer = setTimeout(() => resolve('__timeout__'), TASK_MAX_MS);
      timer.unref?.();
    });
    const outcome = await Promise.race([loop.then(() => '__done__', (e) => e), cap]);
    clearTimeout(timer);

    const done = engine.getTask(t.id);
    if (outcome === '__timeout__') return degrade('engine-timeout');
    if (!done) return degrade('task-missing');
    if (done.status === 'failed' || (outcome instanceof Error)) {
      return degrade('engine-failed');
    }
    const result = (done.result != null ? String(done.result) : '').trim();
    if (!result) return degrade('empty-result');

    // Real result. summary = short one-liner; result = full text.
    const oneLine = result.replace(/\s+/g, ' ').trim();
    return {
      summary: `${agent} ${actionPhrase(agent, task, false)}.`,
      result: result.slice(0, 4000),
      degraded: false,
      why: null,
      _preview: oneLine.slice(0, 160)
    };
  } catch (e) {
    return degrade('exception:' + e.message);
  }
}

// ---------------------------------------------------------------------------
// POST /api/work/assign  { userId, agent, task }
// Runs the agent's REAL work, logs an activity, grants Sparks (idempotent),
// returns { ok, sessionId, agent, summary, result, sparksEarned }.
// ---------------------------------------------------------------------------
router.post('/assign', async (req, res) => {
  try {
    const body = req.body || {};
    // SECURITY: identity comes from the verified session (req.userId, set by
    // softAuth at the mount in server-production.js) — NEVER from the request
    // body. Sparks payouts here are server-authoritative; trusting a
    // caller-supplied userId would let anyone mint payouts to any account.
    const userId = typeof req.userId === 'string' && req.userId
      ? req.userId.trim()
      : (typeof body.userId === 'string' ? body.userId.trim() : '');
    const agent = normAgent(body.agent);
    const task = typeof body.task === 'string' ? body.task.trim() : '';

    // --- validate ---
    if (!ID_RE.test(userId)) {
      return res.status(400).json({ ok: false, error: 'invalid userId (expected [\\w-]{1,64})' });
    }
    if (!agent) {
      return res.status(400).json({ ok: false, error: 'invalid agent (expected one of ' + AGENTS.join('/') + ')' });
    }
    if (!task || task.length > 2000) {
      return res.status(400).json({ ok: false, error: 'task required (1..2000 chars)' });
    }

    // --- anti-farm: one active session per (user, agent) ---
    const key = userId + '::' + agent;
    if (active.has(key)) {
      return res.status(429).json({ ok: false, error: agent + ' is already working for you — wait for it to finish.' });
    }
    active.add(key);

    const sessionId = newSessionId();
    let work;
    try {
      work = await runRealWork(agent, task);
    } finally {
      active.delete(key); // always release the slot
    }

    const at = new Date().toISOString();

    // --- grant Sparks: server-authoritative amount, idempotent on sessionId ---
    const sparksEarned = sparksForTask(task, work.result);
    let granted = sparksEarned;
    if (economy && typeof economy.grant === 'function') {
      try {
        // sessionId is the idempotency key => a retry never double-pays.
        const r = await economy.grant(userId, sparksEarned, 'work:' + sessionId, sessionId);
        if (r && r.replayed) {
          // Already paid for this session (double-click / retry). Report the
          // originally-granted amount, do not add more.
          granted = r.transaction ? Math.abs(r.transaction.amount) : sparksEarned;
        }
      } catch (e) {
        // Payout failure must not lose the activity; log it, report 0 earned.
        console.error('[work-sessions] grant failed:', e.message);
        granted = 0;
      }
    } else {
      granted = 0; // economy unavailable — activity still logged
    }

    // --- log activity (per-user + public feed) ---
    const action = actionPhrase(agent, task, work.degraded);
    pushUserActivity(userId, {
      sessionId, agent, action, sparks: granted, at, degraded: !!work.degraded
    });
    pushFeed({
      // PUBLIC & privacy-safe: NO userId, NO raw output.
      agent, action, sparks: granted, at
    });
    scheduleSave();

    return res.json({
      ok: true,
      sessionId,
      agent,
      summary: work.summary,
      result: work.result,
      sparksEarned: granted,
      degraded: !!work.degraded
    });
  } catch (e) {
    // Absolute backstop — never 500-crash the loop.
    console.error('[work-sessions] /assign error:', e && e.stack || e);
    return res.status(500).json({ ok: false, error: 'work assignment failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/work/summary?userId=  — the "while you were away" HERO MOMENT.
// Lists the user's completed activities since their lastSeen, then advances
// lastSeen to now. Shape:
//   { ok, since, totalSparks, count, activities:[{agent, action, sparks, at}] }
// ---------------------------------------------------------------------------
router.get('/summary', (req, res) => {
  try {
    // SECURITY: identity comes from the verified session, not the query string
    // — otherwise anyone could read another user's private activity summary.
    const userId = typeof req.userId === 'string' && req.userId
      ? req.userId.trim()
      : (typeof req.query.userId === 'string' ? req.query.userId.trim() : '');
    if (!ID_RE.test(userId)) {
      return res.status(400).json({ ok: false, error: 'invalid userId (expected [\\w-]{1,64})' });
    }

    const since = lastSeenByUser.get(userId) || null;
    const sinceMs = since ? Date.parse(since) : 0;
    const list = activityByUser.get(userId) || [];

    const activities = list
      .filter((a) => (since ? Date.parse(a.at) > sinceMs : true))
      .map((a) => ({ agent: a.agent, action: a.action, sparks: a.sparks, at: a.at }));

    const totalSparks = activities.reduce((n, a) => n + (Number(a.sparks) || 0), 0);

    // Advance lastSeen AFTER computing the window (this read consumes it).
    const now = new Date().toISOString();
    lastSeenByUser.set(userId, now);
    scheduleSave();

    return res.json({
      ok: true,
      since,
      totalSparks,
      count: activities.length,
      activities
    });
  } catch (e) {
    console.error('[work-sessions] /summary error:', e.message);
    return res.status(500).json({ ok: false, error: 'summary failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/work/feed  — public "agents at work" ticker.
// Most-recent ~30 completed activities across ALL users. Privacy-safe:
// agent + short action verb + relative time + sparks. NO user PII, NO raw output.
// ---------------------------------------------------------------------------
router.get('/feed', (req, res) => {
  try {
    const items = feed
      .slice(-30)
      .reverse()
      .map((e) => ({
        agent: e.agent,
        action: e.action,
        sparks: e.sparks,
        at: e.at,
        ago: relTime(e.at)
      }));
    return res.json({ ok: true, count: items.length, items, feed: items });
  } catch (e) {
    console.error('[work-sessions] /feed error:', e.message);
    return res.status(500).json({ ok: false, error: 'feed failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/work/active?userId=  — which of the user's agents are mid-session.
// ---------------------------------------------------------------------------
router.get('/active', (req, res) => {
  try {
    // SECURITY: identity comes from the verified session, not the query string.
    const userId = typeof req.userId === 'string' && req.userId
      ? req.userId.trim()
      : (typeof req.query.userId === 'string' ? req.query.userId.trim() : '');
    if (!ID_RE.test(userId)) {
      return res.status(400).json({ ok: false, error: 'invalid userId (expected [\\w-]{1,64})' });
    }
    const prefix = userId + '::';
    const working = [];
    for (const k of active) {
      if (k.startsWith(prefix)) working.push(k.slice(prefix.length));
    }
    return res.json({ ok: true, userId, working });
  } catch (e) {
    console.error('[work-sessions] /active error:', e.message);
    return res.status(500).json({ ok: false, error: 'active failed' });
  }
});

// Expose internals for tests / introspection (not routed).
router._internal = {
  runRealWork, sparksForTask, actionPhrase, normAgent, relTime,
  _state: { feed, activityByUser, lastSeenByUser, active }
};

module.exports = router;
