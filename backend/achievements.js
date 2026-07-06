'use strict';
// ============================================================================
// SHADDAI Achievements + Levels Engine
// ----------------------------------------------------------------------------
// Self-contained XP / level / achievement tracker for BOTH agents (e.g.
// "PIKADON", "NEXUS") and users (uid). Subjects earn XP + unlock achievements
// by doing real work — completing marketplace bounties, running tasks, etc.
//
// This module exports:
//   - router        : express.Router() mounted at (e.g.) /api/achievements
//   - recordEvent   : the single hook other code calls to log work
//   - getProgress / getDefinitions / getLeaderboard : read-only getters
//
// State persists to backend/data/achievements.json, keyed by subject id.
// Nothing here throws out of a handler; no external deps beyond express + fs.
//
// NOTE: this file does NOT mount itself. The host app wires the router and
// calls recordEvent() from real work sites (see bottom-of-file notes).
// ============================================================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const router = express.Router();

// ── PERSISTENCE ──────────────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'achievements.json');

// state = { subjects: { [subjectId]: SubjectRecord } }
const state = { subjects: {} };

function _ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function _load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (raw && typeof raw === 'object' && raw.subjects && typeof raw.subjects === 'object') {
        state.subjects = raw.subjects;
      }
    }
  } catch (err) {
    // Corrupt / unreadable file — start clean rather than crash the server.
    console.error('[achievements] load failed, starting empty:', err && err.message);
    state.subjects = {};
  }
}

// Debounced write-behind so a burst of events doesn't block the event loop.
const SAVE_DEBOUNCE_MS = 800;
let _dirty = false;
let _saveTimer = null;

function _writeSync() {
  _ensureDataDir();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    _dirty = false;
  } catch (err) {
    console.error('[achievements] save failed:', err && err.message);
  }
}

function _save() {
  _dirty = true;
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (_dirty) _writeSync();
  }, SAVE_DEBOUNCE_MS);
  if (_saveTimer.unref) _saveTimer.unref();
}

function _flushSync() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (_dirty) _writeSync();
}

// Flush pending writes on shutdown so nothing is lost.
let _shutdownHooked = false;
function _installShutdownFlush() {
  if (_shutdownHooked) return;
  _shutdownHooked = true;
  try {
    process.on('beforeExit', _flushSync);
    process.on('SIGINT',  () => { _flushSync(); process.exit(0); });
    process.on('SIGTERM', () => { _flushSync(); process.exit(0); });
  } catch (_) {}
}
_installShutdownFlush();

// ── LEVEL MODEL ──────────────────────────────────────────────────────────────
// XP accrues from events. Level uses a simple sqrt curve:
//   level = floor( sqrt(xp / 100) ) + 1
// so cumulative XP needed to REACH level L is:  xpForLevel(L) = ((L-1)^2) * 100
//   L1 = 0xp, L2 = 100xp, L3 = 400xp, L4 = 900xp, L5 = 1600xp ...
const XP_PER = {
  bounty_completed: 100,   // finishing a marketplace bounty
  task_run:         10,    // running an agent task / skill
  dollar_earned:    1      // +1 xp per $1 of budget earned
};

function levelForXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return Math.floor(Math.sqrt(x / 100)) + 1;
}

function xpForLevel(level) {
  const L = Math.max(1, Math.floor(level));
  return ((L - 1) * (L - 1)) * 100;
}

// XP threshold to reach the NEXT level from a given xp value.
function nextLevelXp(xp) {
  const lvl = levelForXp(xp);
  return xpForLevel(lvl + 1);
}

// A small published ladder (levels 1..15) so the dashboard can draw a track.
function levelLadder(maxLevel = 15) {
  const out = [];
  for (let L = 1; L <= maxLevel; L++) {
    out.push({ level: L, xpRequired: xpForLevel(L) });
  }
  return out;
}

// ── ACHIEVEMENT DEFINITIONS ──────────────────────────────────────────────────
// Each rule receives the subject's counters and returns true once earned.
// Rules must be pure + monotonic (once true, stays true) so unlocks are stable.
const ACHIEVEMENTS = [
  {
    id: 'first_bounty',
    name: 'First Contract',
    description: 'Complete your first bounty.',
    icon: '📜',
    tier: 'bronze',
    xpBonus: 50,
    rule: (c) => c.bountiesDone >= 1
  },
  {
    id: 'operative',
    name: 'Operative',
    description: 'Complete 5 bounties.',
    icon: '🎯',
    tier: 'bronze',
    xpBonus: 100,
    rule: (c) => c.bountiesDone >= 5
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Complete 25 bounties.',
    icon: '🎖️',
    tier: 'gold',
    xpBonus: 500,
    rule: (c) => c.bountiesDone >= 25
  },
  {
    id: 'rainmaker',
    name: 'Rainmaker',
    description: 'Earn $500 in total.',
    icon: '💰',
    tier: 'gold',
    xpBonus: 400,
    rule: (c) => c.dollarsEarned >= 500
  },
  {
    id: 'flawless',
    name: 'Flawless',
    description: 'Complete 10 deliveries with zero failures.',
    icon: '✨',
    tier: 'silver',
    xpBonus: 250,
    rule: (c) => c.bountiesDone >= 10 && c.failures === 0
  },
  {
    id: 'polymath',
    name: 'Polymath',
    description: 'Complete jobs in 3 or more categories.',
    icon: '🧠',
    tier: 'silver',
    xpBonus: 200,
    rule: (c) => Object.keys(c.categories || {}).length >= 3
  },
  {
    id: 'night_shift',
    name: 'Night Shift',
    description: 'Complete a job between 12am and 5am.',
    icon: '🌙',
    tier: 'bronze',
    xpBonus: 75,
    rule: (c) => c.nightJobs >= 1
  }
];

// Public-facing definition (strips the function so it's JSON-safe).
function _publicDef(a) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    tier: a.tier,
    xpBonus: a.xpBonus || 0
  };
}

// ── SUBJECT RECORDS ──────────────────────────────────────────────────────────
function _blankSubject(subjectId) {
  return {
    subject: subjectId,
    xp: 0,
    level: 1,
    unlocked: [],              // [{ id, at }]
    counters: {
      bountiesDone:  0,
      dollarsEarned: 0,
      tasksRun:      0,
      failures:      0,
      nightJobs:     0,
      categories:    {}        // { category: count }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const _DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function _getSubject(subjectId) {
  let id = String(subjectId);
  if (_DANGEROUS_KEYS.has(id)) id = 'subj_' + id.replace(/[^a-z0-9]/gi, ''); // no prototype-pollution keys
  if (!state.subjects[id]) state.subjects[id] = _blankSubject(id);
  const s = state.subjects[id];
  // Defensive: heal any partially-shaped record loaded from disk.
  if (!s.counters) s.counters = _blankSubject(id).counters;
  if (!s.counters.categories) s.counters.categories = {};
  if (!Array.isArray(s.unlocked)) s.unlocked = [];
  if (typeof s.xp !== 'number') s.xp = 0;
  return s;
}

function _isUnlocked(s, achId) {
  return s.unlocked.some((u) => u.id === achId);
}

// Evaluate all rules; unlock any newly-earned. Returns array of public defs.
function _evaluate(s) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (_isUnlocked(s, a.id)) continue;
    let earned = false;
    try { earned = !!a.rule(s.counters); } catch (_) { earned = false; }
    if (earned) {
      s.unlocked.push({ id: a.id, at: new Date().toISOString() });
      if (a.xpBonus) s.xp += a.xpBonus;   // bonus XP for the unlock
      newly.push(_publicDef(a));
    }
  }
  return newly;
}

// ── CORE HOOK ────────────────────────────────────────────────────────────────
/**
 * recordEvent(subjectId, eventType, meta = {})
 *
 * The single entry point other code calls when a subject does real work.
 *
 * eventTypes:
 *   'bounty_completed'  meta: { budget?:number, category?:string, at?:Date|ISO }
 *   'task_run'          meta: { }        (a skill/task execution)
 *   'bounty_failed'     meta: { }        (a failed/abandoned delivery)
 *
 * Updates counters + xp + level, evaluates achievement rules, unlocks new ones
 * (idempotent), persists, and returns:
 *   { subject, level, leveledUp, xp, gainedXp, newlyUnlocked:[{id,name,icon,tier,...}] }
 *
 * Never throws — on bad input it returns a safe no-op result.
 */
function recordEvent(subjectId, eventType, meta = {}) {
  try {
    if (!subjectId || typeof subjectId !== 'string') {
      return { ok: false, error: 'subjectId (string) required', subject: subjectId || null, level: 1, xp: 0, gainedXp: 0, leveledUp: false, newlyUnlocked: [] };
    }
    const s = _getSubject(subjectId);
    const c = s.counters;
    const beforeLevel = s.level;
    const beforeXp = s.xp;
    meta = meta && typeof meta === 'object' ? meta : {};

    switch (eventType) {
      case 'bounty_completed': {
        c.bountiesDone += 1;
        s.xp += XP_PER.bounty_completed;

        const budget = Math.min(1e6, Math.max(0, Number(meta.budget) || 0)); // cap: no reputation inflation via huge budgets
        if (budget > 0) {
          c.dollarsEarned += budget;
          s.xp += Math.round(budget * XP_PER.dollar_earned);
        }

        const category = (meta.category && String(meta.category).trim().toLowerCase()) || null;
        if (category && !_DANGEROUS_KEYS.has(category)) c.categories[category] = (c.categories[category] || 0) + 1;

        // Night shift check (local hour of completion).
        let hour;
        try { hour = (meta.at ? new Date(meta.at) : new Date()).getHours(); }
        catch (_) { hour = new Date().getHours(); }
        if (hour >= 0 && hour < 5) c.nightJobs += 1;
        break;
      }
      case 'task_run': {
        c.tasksRun += 1;
        s.xp += XP_PER.task_run;
        break;
      }
      case 'bounty_failed': {
        c.failures += 1;
        // No XP for failure; failures gate the "flawless" achievement.
        break;
      }
      default: {
        // Unknown event type — record nothing, return current state safely.
        return {
          ok: false,
          error: `unknown eventType: ${eventType}`,
          subject: s.subject,
          level: s.level,
          xp: s.xp,
          gainedXp: 0,
          leveledUp: false,
          newlyUnlocked: []
        };
      }
    }

    // Recompute level from XP, evaluate achievements (which may add bonus XP),
    // then recompute level again in case a bonus pushed us over a threshold.
    s.level = levelForXp(s.xp);
    const newlyUnlocked = _evaluate(s);
    s.level = levelForXp(s.xp);
    s.updatedAt = new Date().toISOString();

    _save();

    return {
      ok: true,
      subject: s.subject,
      level: s.level,
      leveledUp: s.level > beforeLevel,
      xp: s.xp,
      gainedXp: s.xp - beforeXp,
      nextLevelXp: nextLevelXp(s.xp),
      newlyUnlocked
    };
  } catch (err) {
    console.error('[achievements] recordEvent error:', err && err.message);
    return { ok: false, error: String(err && err.message || err), subject: subjectId || null, level: 1, xp: 0, gainedXp: 0, leveledUp: false, newlyUnlocked: [] };
  }
}

// ── READ-ONLY GETTERS ────────────────────────────────────────────────────────
// Build the full progress view for one subject (unlocked achievements enriched
// with their definition metadata).
function getProgress(subjectId) {
  const id = String(subjectId);
  const s = state.subjects[id] || _blankSubject(id);
  const defById = {};
  for (const a of ACHIEVEMENTS) defById[a.id] = a;

  const unlocked = (s.unlocked || []).map((u) => {
    const d = defById[u.id];
    return d
      ? { id: d.id, name: d.name, icon: d.icon, tier: d.tier, description: d.description, at: u.at }
      : { id: u.id, at: u.at };
  });

  return {
    subject: id,
    level: s.level || levelForXp(s.xp || 0),
    xp: s.xp || 0,
    levelXp: xpForLevel(s.level || levelForXp(s.xp || 0)),
    nextLevelXp: nextLevelXp(s.xp || 0),
    unlocked,
    counters: s.counters || _blankSubject(id).counters
  };
}

// Full definitions payload for the dashboard grid (locked + unlocked render).
function getDefinitions() {
  return {
    achievements: ACHIEVEMENTS.map(_publicDef),
    levels: {
      model: 'floor(sqrt(xp/100)) + 1',
      xpPer: { ...XP_PER },
      ladder: levelLadder(15)
    }
  };
}

// Leaderboard: subjects sorted by level then xp, top N.
function getLeaderboard(limit = 20) {
  const rows = Object.values(state.subjects).map((s) => ({
    subject: s.subject,
    level: s.level || levelForXp(s.xp || 0),
    xp: s.xp || 0,
    bountiesDone: (s.counters && s.counters.bountiesDone) || 0,
    dollarsEarned: (s.counters && s.counters.dollarsEarned) || 0,
    achievements: Array.isArray(s.unlocked) ? s.unlocked.length : 0
  }));
  rows.sort((a, b) => (b.level - a.level) || (b.xp - a.xp) || (b.dollarsEarned - a.dollarsEarned));
  return rows.slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
}

// ── ROUTER ENDPOINTS ─────────────────────────────────────────────────────────
// GET /                 → full achievement + level definitions (grid source)
// GET /all/definitions  → alias of the above
// GET /leaderboard      → top subjects by level/xp
// POST /event           → { subject, type, meta } → recordEvent result (gate later)
// GET /:subject         → one subject's progress
//
// NOTE: /leaderboard and /all/definitions are declared BEFORE /:subject so the
// dynamic route doesn't swallow them.

router.get('/', (req, res) => {
  try {
    res.json(getDefinitions());
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

router.get('/all/definitions', (req, res) => {
  try {
    res.json(getDefinitions());
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    res.json({ ok: true, leaderboard: getLeaderboard(limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

// ADMIN ONLY — real achievements are recorded server-side via recordEvent() on genuine
// actions (e.g. bounty delivery). This HTTP route would otherwise let anyone forge any
// subject's XP/level/earnings, so it's gated (fails open in dev, closed in production).
router.post('/event', require('./auth-guard').requireAdmin, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const { subject, type, meta } = req.body || {};
    if (!subject || !type) {
      return res.status(400).json({ ok: false, error: 'body { subject, type, meta? } required' });
    }
    const result = recordEvent(String(subject), String(type), meta || {});
    const code = result && result.ok === false ? 400 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

router.get('/:subject', (req, res) => {
  try {
    res.json(getProgress(req.params.subject));
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

// ── INIT ─────────────────────────────────────────────────────────────────────
_load();

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  router,
  recordEvent,
  // read-only getters
  getProgress,
  getDefinitions,
  getLeaderboard,
  // level helpers (exported for reuse / tests)
  levelForXp,
  xpForLevel,
  nextLevelXp,
  // definitions (read-only reference)
  ACHIEVEMENTS: ACHIEVEMENTS.map(_publicDef),
  XP_PER: { ...XP_PER },
  // test/admin utility — remove a subject's record entirely
  _deleteSubject(subjectId) {
    const id = String(subjectId);
    if (state.subjects[id]) { delete state.subjects[id]; _save(); _flushSync(); return true; }
    return false;
  }
};
