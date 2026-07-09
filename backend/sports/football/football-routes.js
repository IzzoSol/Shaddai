'use strict';
// ============================================================================
// backend/sports/football/football-routes.js — Express router for 4v4 football
//
// Mount: app.use('/api/football', require('./sports/football/football-routes'))
//
// Routes:
//   POST /api/football/sim              — run a full match, return match record
//   GET  /api/football/meta             — roles, abilities, playbook, agent priors
//   GET  /api/football/lineup           — preview auto-built lineups (no sim)
//   GET  /api/football/agent-kit/:id    — abilities + role derived from real skills
//   GET  /api/football/roster-kits      — all council + forged ops with derived abilities
//   GET  /api/football/agent-stats/:id  — aggregate game history for an agent
// ============================================================================

const express = require('express');
const router  = express.Router();

const { runMatch }            = require('../../platform/sim-driver');
const { buildMatchup }        = require('../../platform/roster');
const { footballRuleset, makeFootballConfig, COUNCIL_POOL, FOOTBALL_SPEC } =
        require('./ruleset');
const { OFFENSE_ROLES, DEFENSE_ROLES, ROLE_INFO, AGENT_ROLE_PRIORS } =
        require('./roles');
const { ABILITIES }           = require('./abilities');
const { OFFENSE_PLAYS, DEFENSE_CALLS } = require('./playbook');

// ── Abilities kit (council presets + skill-derived abilities) ─────────────────
const {
  ABILITIES: KIT_ABILITIES,
  abilitiesForCouncil,
  abilitiesForSkills,
} = require('./abilities-kit');

// ── Operatives store (forged agents) ─────────────────────────────────────────
const operatives = require('../../lib/operatives');

// ── Arcade scores store (read-only — do NOT change the write path) ────────────
const { leaderboard: arcadeLeaderboard, FILE: ARCADE_FILE } = require('../../lib/arcade-store');
const fs   = require('fs');
const path = require('path');

// ── Council agent id set (case-insensitive match) ────────────────────────────
const COUNCIL_IDS = new Set(['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON']);

// ── Validation helpers ────────────────────────────────────────────────────────

/** Coerce a value to a safe uint32 seed, or null if not provided. */
function parseSeed(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!isFinite(n)) return null;
  return (n >>> 0);
}

/** Normalize a lineup array from request body. */
function normalizeLineup(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  // Expect array of { agent: {name, skills?}, offRole, defRole }
  return raw.slice(0, 8).map(p => ({
    agent: {
      id:     String((p.agent && p.agent.id)   || p.name || 'unknown'),
      name:   String((p.agent && p.agent.name) || p.name || 'unknown'),
      skills: Array.isArray(p.agent && p.agent.skills ? p.agent.skills : p.skills) ?
              (p.agent && p.agent.skills ? p.agent.skills : p.skills) : [],
    },
    offRole:     String(p.offRole || OFFENSE_ROLES[0]),
    defRole:     String(p.defRole || DEFENSE_ROLES[0]),
    aptitudeOff: Number(p.aptitudeOff || 0),
    aptitudeDef: Number(p.aptitudeDef || 0),
    isHero:      Boolean(p.isHero),
  }));
}

// ── POST /sim ─────────────────────────────────────────────────────────────────
/**
 * Run a deterministic 4v4 football simulation.
 *
 * Body (all optional):
 *   seed      {number}  — PRNG seed; random if omitted (echoed in response)
 *   hero      {object}  — { name, skills? } for the hero agent on team A
 *   heroRole  {string}  — QB | RB | WR | OL (hero's offensive role)
 *   lineupA   {Array}   — pre-built team A (see normalizeLineup above)
 *   lineupB   {Array}   — pre-built team B
 *
 * Returns: full match record (telemetry.makeMatchRecord shape).
 */
router.post('/sim', (req, res) => {
  try {
    const body = req.body || {};

    // Parse seed.
    const seed = parseSeed(body.seed) ??
                 ((Math.random() * 0x100000000) >>> 0);

    // Pre-built lineups (optional).
    const rawA = normalizeLineup(body.lineupA);
    const rawB = normalizeLineup(body.lineupB);

    let config;

    if (rawA && rawB) {
      // Caller supplied both lineups — use them directly.
      config = { seed, mode: 'gridiron', lineupA: rawA, lineupB: rawB };
    } else {
      // Auto-build via roster module.
      const hero = body.hero && body.hero.name
        ? { id: body.hero.name, name: body.hero.name, skills: body.hero.skills || [] }
        : null;

      config = makeFootballConfig({
        hero,
        heroRole: body.heroRole || null,
        seed,
      });
      // Ensure the echoed seed is the one actually used.
      config.seed = seed;
    }

    const record = runMatch(footballRuleset, config);

    return res.json({ ok: true, seed, record });
  } catch (err) {
    console.error('[football-routes] /sim error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /meta ─────────────────────────────────────────────────────────────────
/**
 * Return static metadata for building frontend pickers:
 *   - offenseRoles / defenseRoles
 *   - roleInfo (ROLE_INFO keyed by role)
 *   - abilities (full ABILITIES array)
 *   - offensePlays / defenseCalls (playbook)
 *   - agentRolePriors (AGENT_ROLE_PRIORS)
 *   - councilPool (the 7 agents)
 */
router.get('/meta', (_req, res) => {
  res.json({
    ok: true,
    offenseRoles:    OFFENSE_ROLES,
    defenseRoles:    DEFENSE_ROLES,
    roleInfo:        ROLE_INFO,
    abilities:       ABILITIES,
    offensePlays:    OFFENSE_PLAYS,
    defenseCalls:    DEFENSE_CALLS,
    agentRolePriors: AGENT_ROLE_PRIORS,
    councilPool:     COUNCIL_POOL.map(a => ({ id: a.id, name: a.name })),
  });
});

// ── GET /lineup ───────────────────────────────────────────────────────────────
/**
 * Preview the auto-built lineup for a given hero + seed without running the sim.
 *
 * Query params:
 *   hero  {string}  — agent name (default: SHADDAI)
 *   seed  {number}  — seed (random if omitted)
 *
 * Returns: { lineupA, lineupB, seed, balanceHint }
 */
router.get('/lineup', (req, res) => {
  try {
    const heroName = String(req.query.hero || 'SHADDAI').toUpperCase();
    const seed     = parseSeed(req.query.seed) ??
                     ((Math.random() * 0x100000000) >>> 0);

    const heroAgent = COUNCIL_POOL.find(a => a.name === heroName) ||
                      { id: heroName.toLowerCase(), name: heroName, skills: [] };

    const matchup = buildMatchup({
      hero:  heroAgent,
      pool:  COUNCIL_POOL,
      spec:  FOOTBALL_SPEC,
      seed,
    });

    return res.json({ ok: true, seed, ...matchup });
  } catch (err) {
    console.error('[football-routes] /lineup error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Lab routes ────────────────────────────────────────────────────────────────
// Loaded lazily to keep startup fast (lab.js pulls in the full ruleset).
const {
  runLab,
  compareLoadouts,
  roleLab,
  recentLabResults,
} = require('./lab');

const LAB_RUNS_CAP     = 2000;
const LAB_RUNS_DEFAULT = 200;

// ── POST /lab ─────────────────────────────────────────────────────────────────
/**
 * Run a batch-simulation lab over two lineups.
 *
 * Body (all optional):
 *   lineupA {Array}   — pre-built team A (normalizeLineup shape)
 *   lineupB {Array}   — pre-built team B
 *   hero    {Object}  — { name, skills? } — auto-build lineups around this hero
 *   seed    {number}  — base seed (default: 1)
 *   runs    {number}  — capped at 2000, default 200
 *
 * Returns: aggregate metrics from runLab.
 */
router.post('/lab', (req, res) => {
  try {
    const body = req.body || {};

    const runs     = Math.min(LAB_RUNS_CAP, Math.max(1, Number(body.runs) || LAB_RUNS_DEFAULT));
    const baseSeed = parseSeed(body.seed) ?? 1;

    const rawA = normalizeLineup(body.lineupA);
    const rawB = normalizeLineup(body.lineupB);

    let lineupA = null;
    let lineupB = null;

    if (rawA && rawB) {
      // Caller supplied full lineups; wrap in { players: [...] } shape.
      lineupA = { players: rawA };
      lineupB = { players: rawB };
    } else if (body.hero && body.hero.name) {
      // Auto-build around a named hero.
      const hero = {
        id:     body.hero.name,
        name:   body.hero.name,
        skills: Array.isArray(body.hero.skills) ? body.hero.skills : [],
      };
      const { buildMatchup: bm } = require('../../platform/roster');
      const { FOOTBALL_SPEC: FS, COUNCIL_POOL: CP } = require('./ruleset');
      const matchup = bm({ hero, pool: CP, spec: FS, seed: baseSeed });
      lineupA = matchup.lineupA;
      lineupB = matchup.lineupB;
    }
    // If neither, runLab will auto-build internally.

    const metrics = runLab({ lineupA, lineupB, runs, baseSeed });
    return res.json({ ok: true, metrics });
  } catch (err) {
    console.error('[football-routes] /lab error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /lab/compare ─────────────────────────────────────────────────────────
/**
 * Compare two skill loadouts for the same agent at the same role.
 *
 * Body (required):
 *   agent    {Object}   — { name, skills? }
 *   role     {string}   — offensive role (QB | RB | WR | OL)
 *   loadoutX {string[]} — skill array for loadout X
 *   loadoutY {string[]} — skill array for loadout Y
 *   runs     {number}   — capped at 2000, default 200
 *
 * Returns: { x: metrics, y: metrics, verdict, deltaWinRate }
 */
router.post('/lab/compare', (req, res) => {
  try {
    const body = req.body || {};

    if (!body.agent || !body.agent.name) {
      return res.status(400).json({ ok: false, error: 'agent.name is required' });
    }
    if (!Array.isArray(body.loadoutX) || !Array.isArray(body.loadoutY)) {
      return res.status(400).json({ ok: false, error: 'loadoutX and loadoutY must be arrays' });
    }

    const runs     = Math.min(LAB_RUNS_CAP, Math.max(1, Number(body.runs) || LAB_RUNS_DEFAULT));
    const baseSeed = parseSeed(body.seed) ?? 1;

    const result = compareLoadouts({
      agent:        { id: body.agent.name, name: body.agent.name, skills: body.agent.skills || [] },
      roleForAgent: body.role || null,
      loadoutX:     body.loadoutX,
      loadoutY:     body.loadoutY,
      runs,
      baseSeed,
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[football-routes] /lab/compare error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /lab/recent ───────────────────────────────────────────────────────────
/**
 * Return recent lab results from the persisted JSON store.
 *
 * Query params:
 *   limit {number} — max entries to return (default 20, max 200)
 */
router.get('/lab/recent', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
    const results = recentLabResults(limit);
    return res.json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error('[football-routes] /lab/recent error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /agent-kit/:id ────────────────────────────────────────────────────────
/**
 * Return an agent's football abilities derived from their real skills.
 *
 * :id   — council name (SHADDAI|NEXUS|ZEROX|ORACLE|TURTLE|QUILL|PIKADON)
 *         OR forged operative id (op_xxx…) or operatives.json id (any other string)
 *
 * Response shape:
 * {
 *   ok: true,
 *   id, kind: 'council'|'operative'|'unknown',
 *   abilities: [{ id, name, side, desc, effect }],
 *   role: 'QB'|'CB'|…,       // best gridiron role from affinity
 *   ratings: { speed, power, iq }  // operative-computed stats (null for council)
 * }
 */
router.get('/agent-kit/:id', (req, res) => {
  try {
    const raw = String(req.params.id || '').trim();
    const up  = raw.toUpperCase();

    // ── Council agent ────────────────────────────────────────────────────────
    if (COUNCIL_IDS.has(up)) {
      const abilities = abilitiesForCouncil(up);
      const abilityIds = abilities.map(a => a.id);
      const { agentAffinity, bestRole: afBestRole } = require('../../platform/affinity');
      const profile = agentAffinity([], up); // council: no skill ids, intrinsic tags only
      const role = afBestRole(profile, 'gridiron');
      return res.json({
        ok: true,
        id: up,
        kind: 'council',
        abilities,
        role,
        ratings: null,
      });
    }

    // ── Forged operative ─────────────────────────────────────────────────────
    // Accept either raw operative id or prefixed "op:<id>"
    const opId = raw.startsWith('op:') ? raw.slice(3) : raw;
    const op = operatives.get(opId);

    if (op) {
      const skillIds = Array.isArray(op.tools) ? op.tools : [];
      const abilities = abilitiesForSkills(skillIds, op.codename || '');
      const { agentAffinity, bestRole: afBestRole } = require('../../platform/affinity');
      const profile = agentAffinity(skillIds, op.codename || '');
      const role = afBestRole(profile, 'gridiron');
      return res.json({
        ok: true,
        id: op.id,
        kind: 'operative',
        codename: op.codename,
        archetype: op.archetype || null,
        abilities,
        role,
        ratings: op.stats || null,
      });
    }

    // ── Unknown id — return sensible neutral default ──────────────────────────
    return res.json({
      ok: true,
      id: raw,
      kind: 'unknown',
      abilities: [],
      role: null,
      ratings: null,
    });
  } catch (err) {
    console.error('[football-routes] /agent-kit error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /roster-kits ──────────────────────────────────────────────────────────
/**
 * All 7 council agents + all forged operatives with their derived abilities.
 * For use in selection screens and roster builders.
 *
 * Response: { ok: true, council: [...], operatives: [...] }
 * Each entry: { id, name/codename, kind, abilities:[{id,name,side,desc}], role }
 */
router.get('/roster-kits', (_req, res) => {
  try {
    const { agentAffinity, bestRole: afBestRole } = require('../../platform/affinity');

    // Council kits
    const council = [...COUNCIL_IDS].map(name => {
      const abilities = abilitiesForCouncil(name);
      const profile   = agentAffinity([], name);
      const role      = afBestRole(profile, 'gridiron');
      return { id: name.toLowerCase(), name, kind: 'council', abilities, role };
    });

    // Forged operative kits
    let ops = [];
    try {
      ops = operatives.all().map(op => {
        const skillIds = Array.isArray(op.tools) ? op.tools : [];
        const abilities = abilitiesForSkills(skillIds, op.codename || '');
        const profile   = agentAffinity(skillIds, op.codename || '');
        const role      = afBestRole(profile, 'gridiron');
        return {
          id:        op.id,
          codename:  op.codename,
          archetype: op.archetype || null,
          kind:      'operative',
          abilities,
          role,
          ratings:   op.stats || null,
        };
      });
    } catch (e) {
      // operatives store empty or unavailable — return council only
    }

    return res.json({ ok: true, council, operatives: ops });
  } catch (err) {
    console.error('[football-routes] /roster-kits error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /agent-stats/:id ─────────────────────────────────────────────────────
/**
 * Aggregate game history for an agent from the arcade results store.
 * Reads arcade-scores.json (read-only — write path is unchanged).
 *
 * :id — agent name (council) or operative id. Matched case-insensitively against
 *       the `agent` field in each arcade record.
 *
 * Response:
 * {
 *   ok: true, id,
 *   gamesPlayed, wins, losses, winRate,   // 0..1, 2dp
 *   avgScore, bestScore, lastPlayed,       // lastPlayed = ISO timestamp or null
 *   footballGamesPlayed,                  // filtered to game === 'football'
 *   recentGames: [...last 10 football records]
 * }
 */
router.get('/agent-stats/:id', (req, res) => {
  try {
    const raw = String(req.params.id || '').trim();
    // Try both raw and uppercased to cover council names + operative ids
    const lookupName = raw.toUpperCase();

    // Read from arcade-scores.json directly so we get ALL records, not just top-20
    let allScores = [];
    try {
      const raw2 = fs.readFileSync(ARCADE_FILE, 'utf8');
      const parsed = JSON.parse(raw2);
      allScores = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      // File absent or corrupt — return zeros
    }

    // Match records for this agent (case-insensitive on agent field)
    const agentRecords = allScores.filter(
      r => String(r.agent || '').toUpperCase() === lookupName ||
           String(r.agent || '').toUpperCase() === raw.toUpperCase()
    );

    // All-game aggregates
    const gamesPlayed  = agentRecords.length;
    const wins         = agentRecords.filter(r => r.win).length;
    const losses       = gamesPlayed - wins;
    const winRate      = gamesPlayed > 0 ? +(wins / gamesPlayed).toFixed(4) : 0;
    const scores       = agentRecords.map(r => Number(r.score) || 0);
    const avgScore     = gamesPlayed > 0 ? +(scores.reduce((a, b) => a + b, 0) / gamesPlayed).toFixed(2) : 0;
    const bestScore    = gamesPlayed > 0 ? Math.max(...scores) : 0;
    const timestamps   = agentRecords.map(r => r.ts || 0).filter(Boolean);
    const lastPlayed   = timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;

    // Football-specific aggregates
    const footballRecords = agentRecords.filter(r => String(r.game || '').toLowerCase() === 'football');
    const footballGamesPlayed = footballRecords.length;

    // Recent 10 football games (newest first)
    const recentGames = footballRecords
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 10)
      .map(r => ({
        score:    r.score,
        win:      r.win,
        playedAt: r.ts ? new Date(r.ts).toISOString() : null,
      }));

    return res.json({
      ok:   true,
      id:   raw,
      gamesPlayed,
      wins,
      losses,
      winRate,
      avgScore,
      bestScore,
      lastPlayed,
      footballGamesPlayed,
      recentGames,
    });
  } catch (err) {
    console.error('[football-routes] /agent-stats error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
