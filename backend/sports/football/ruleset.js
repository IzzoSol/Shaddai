'use strict';
// ============================================================================
// backend/sports/football/ruleset.js — 4v4 Arcade Football SportRuleset
//
// Implements the SportRuleset contract for sim-driver.js:
//   { id, tickRate, maxTicks, createInitialState, update, isComplete, summarize }
//
// ONE TICK = ONE PLAY. Each update() call advances by one down.
// Drives are 4-down sequences; drivesLeft counts down from totalDrives (default 8).
// No wall-clock calls. No Math.random. All randomness via the `rand` arg.
//
// Also exports:
//   makeFootballConfig({ hero, heroRole, pool, seed }) → config for runMatch()
// ============================================================================

const { playerFootballRatings }         = require('./football-stats');
const { OFFENSE_ROLES, DEFENSE_ROLES }  = require('./roles');
const { ABILITIES, abilitiesForRole, shouldActivate, applyEffect } = require('./abilities');
const { pickOffensePlay, pickDefenseCall } = require('./playbook');
const { buildMatchup }                  = require('../../platform/roster');

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const TOTAL_DRIVES    = 8;    // total possessions across both teams in a "game"
const FIRST_DOWN_DIST = 10;   // yards needed for a first down
const TD_SCORE        = 7;    // touchdown (with PAT)
const FG_SCORE        = 3;    // field goal

// Council pool for auto-matchup.
const COUNCIL_POOL = [
  { id: 'shaddai', name: 'SHADDAI', skills: [] },
  { id: 'nexus',   name: 'NEXUS',   skills: [] },
  { id: 'zerox',   name: 'ZEROX',   skills: [] },
  { id: 'oracle',  name: 'ORACLE',  skills: [] },
  { id: 'turtle',  name: 'TURTLE',  skills: [] },
  { id: 'quill',   name: 'QUILL',   skills: [] },
  { id: 'pikadon', name: 'PIKADON', skills: [] },
];

// Lineup spec for a 4v4 football game.
const FOOTBALL_SPEC = {
  mode:         'gridiron',
  teamSize:     4,
  offenseRoles: OFFENSE_ROLES,
  defenseRoles: DEFENSE_ROLES,
};

// ── INTERNAL HELPERS ──────────────────────────────────────────────────────────

/**
 * Build a flat player list from a roster lineup (from buildMatchup/buildLineup).
 * Each player entry: { name, offRole, defRole, football, defFootball, aptitude }
 *
 * football    — ratings resolved from offRole (used when this player is on offense)
 * defFootball — ratings resolved from defRole (used when this player is on defense)
 *
 * Dual ratings ensure that a QB-aptitude player doesn't accidentally have high
 * passRush/tackle just because those stats happened to be computed for their
 * offensive role.  Both sets are clamped to [0,100] by playerFootballRatings.
 */
function _resolvePlayers(lineup) {
  return lineup.players.map(p => {
    const agent = p.agent;
    const name  = agent.name || agent.id || 'UNKNOWN';
    const skills = agent.skills || [];
    const offRole = p.offRole || OFFENSE_ROLES[0];
    const defRole = p.defRole || DEFENSE_ROLES[0];

    const { football, aptitude } = playerFootballRatings(name, skills, offRole);
    const { football: defFootball } = playerFootballRatings(name, skills, defRole);

    return {
      name,
      offRole,
      defRole,
      football,      // offense-role ratings
      defFootball,   // defense-role ratings
      aptitude,
      isHero: p.isHero || false,
    };
  });
}

/**
 * Initialize per-player stat accumulators for MVP tracking.
 */
function _initAccumulators(players) {
  const acc = {};
  for (const p of players) {
    acc[p.name] = { yards: 0, touchdowns: 0, tackles: 0, interceptions: 0, sacks: 0 };
  }
  return acc;
}

/**
 * Initialize ability cooldown map: { playerName_abilityId: lastActivatedTick }
 * Start at -Infinity so first tick can always fire.
 */
function _initCooldowns(playersA, playersB) {
  const cd = {};
  for (const p of [...playersA, ...playersB]) {
    for (const ab of abilitiesForRole(p.offRole)) {
      cd[`${p.name}::${ab.id}`] = -Infinity;
    }
    for (const ab of abilitiesForRole(p.defRole)) {
      cd[`${p.name}::${ab.id}`] = -Infinity;
    }
  }
  return cd;
}

/**
 * Get the 4 on-field offense players (all players on the possessing team).
 */
function _offensePlayers(state) {
  return state.possession === 'A' ? state.playersA : state.playersB;
}
function _defensePlayers(state) {
  return state.possession === 'A' ? state.playersB : state.playersA;
}

/**
 * Team score getters / setters aligned with possession.
 */
function _offScore(state)         { return state.possession === 'A' ? state.scoreA : state.scoreB; }
function _defScore(state)         { return state.possession === 'A' ? state.scoreB : state.scoreA; }
function _addOffScore(state, pts) { if (state.possession === 'A') state.scoreA += pts; else state.scoreB += pts; }

/**
 * Compute team aggregate football rating for a given stat.
 * Returns the average of the relevant players' stat values.
 */
function _teamStat(players, stat) {
  if (!players.length) return 50;
  const sum = players.reduce((s, p) => s + (p.football[stat] || 50), 0);
  return sum / players.length;
}

/**
 * Get QB from a player list (or first player as fallback).
 */
function _qb(players)  { return players.find(p => p.offRole === 'QB') || players[0]; }
function _wr(players)  { return players.find(p => p.offRole === 'WR') || players[1] || players[0]; }
function _rb(players)  { return players.find(p => p.offRole === 'RB') || players[1] || players[0]; }
function _ol(players)  { return players.find(p => p.offRole === 'OL') || players[3] || players[0]; }
function _dl(players)  { return players.find(p => p.defRole === 'DL') || players[0]; }
function _lb(players)  { return players.find(p => p.defRole === 'LB') || players[1] || players[0]; }
function _cb(players)  { return players.find(p => p.defRole === 'CB') || players[2] || players[0]; }
function _fs(players)  { return players.find(p => p.defRole === 'FS') || players[3] || players[0]; }

/**
 * Check and fire abilities for on-field players during a play tick.
 * Mutates cooldowns. Returns an array of ability-used events to emit.
 */
function _checkAbilities(players, side, playTick, ticksSinceMatchStart, cooldowns, rand) {
  const events = [];
  for (const p of players) {
    const roleKey = side === 'off' ? p.offRole : p.defRole;
    const abs = abilitiesForRole(roleKey);
    for (const ab of abs) {
      const cdKey  = `${p.name}::${ab.id}`;
      const lastAct = cooldowns[cdKey];

      // Context score: higher on game-relevant ticks (simple heuristic).
      const contextScore = 0.4 + rand() * 0.4; // 0.4–0.8 range per tick

      const result = shouldActivate(ab, {
        currentTick:    playTick,
        lastActivated:  typeof lastAct === 'number' ? lastAct : -Infinity,
        contextScore,
        scoreThreshold: 0.5,
      }, rand);

      if (result.activate) {
        cooldowns[cdKey] = playTick;
        events.push({
          type:   'ability_used',
          actor:  p.name,
          detail: { abilityId: ab.id, abilityName: ab.name, reason: result.reason, role: roleKey },
        });
      }
    }
  }
  return events;
}

/**
 * Resolve a single play outcome deterministically.
 *
 * Returns { outcome, yards, actor, target, detail }
 *
 * outcome:
 *   'incomplete'   — pass fell incomplete
 *   'sack'         — QB sacked (yards = negative)
 *   'interception' — defense picks off the pass
 *   'fumble'       — ball carrier fumbles (turnover)
 *   'gain'         — yardage gain (yards > 0)
 *   'touchdown'    — TD scored
 *   'field_goal'   — FG made
 */
function _resolvePlay(offPlayers, defPlayers, play, defCall, state, rand) {
  const qb  = _qb(offPlayers);
  const wr  = _wr(offPlayers);
  const rb  = _rb(offPlayers);
  const ol  = _ol(offPlayers);
  const dl  = _dl(defPlayers);
  const lb  = _lb(defPlayers);
  const cb  = _cb(defPlayers);
  const fs  = _fs(defPlayers);

  // Helper: get the right rating set for a player depending on which side of the
  // ball they're on.  Offense players use .football (offRole ratings); defense
  // players use .defFootball (defRole ratings) so a QB-profile agent doesn't
  // accidentally have high passRush/tackle when assigned to DL/LB.
  const offR = (p, stat) => ((p.football       || {})[stat]) ?? 50;
  const defR = (p, stat) => ((p.defFootball     || p.football || {})[stat]) ?? 50;

  // Base football ratings (with a small noise term using rand).
  // Reduced from ±5 to ±3 so stat differentials are less likely to be swamped
  // by luck.  Upsets still happen, but a 15-point rating edge consistently wins.
  const noise = () => (rand() - 0.5) * 6; // ±3

  if (play.type === 'run') {
    // Run play: RB vs LB (primary), OL block vs DL passRush
    const blockPower   = offR(ol, 'block')   + noise();
    const rushPressure = defR(dl, 'passRush') + noise();
    const rbCarry      = offR(rb, 'tackle')  + noise(); // physical toughness of carry
    const lbStop       = defR(lb, 'tackle')  + noise();

    // Net carry score: offense advantage
    const carryScore = (blockPower + rbCarry) - (rushPressure + lbStop);

    // Fumble chance: low (~3%) but driven by carryScore being very negative
    if (carryScore < -20 && rand() < 0.03) {
      return { outcome: 'fumble', yards: 0, actor: rb.name, target: lb.name,
               detail: { playId: play.id, blockPower, rushPressure, carryScore } };
    }

    // Yards gained: base 3 yards, carryScore adjusts, play.reward scales ceiling.
    // carryScore sensitivity raised from 0.10→0.16 so a well-blocked run gains
    // noticeably more yards than a stuffed one.
    const base   = 3 + carryScore * 0.16;
    const yards  = Math.round(Math.max(-2, Math.min(30, base + rand() * play.reward * 8)));

    // TD check: ballOn + yards >= 100
    if (state.ballOn + yards >= 100) {
      return { outcome: 'touchdown', yards: 100 - state.ballOn,
               actor: rb.name, target: lb.name,
               detail: { playId: play.id, scorer: rb.name } };
    }

    return { outcome: 'gain', yards, actor: rb.name, target: lb.name,
             detail: { playId: play.id, blockPower, lbStop } };
  }

  // Pass play
  const throwAcc = offR(qb, 'throwAccuracy') + noise();
  const blitzPressure = defCall.pressure * (defR(dl, 'passRush') + noise()) / 100;
  const blockQuality  = offR(ol, 'block') + noise();

  // Sack: pocket collapses if DL passRush overwhelms OL block & high pressure
  const pocketScore = blockQuality - blitzPressure * 80;
  if (pocketScore < -10 && rand() < (defCall.pressure * 0.30)) {
    return { outcome: 'sack', yards: -Math.round(3 + rand() * 7),
             actor: dl.name, target: qb.name,
             detail: { playId: play.id, pocketScore } };
  }

  // Completion check: throwAccuracy vs coverage
  const coverageRating = defR(cb, 'coverage') * 0.5 +
                          defR(fs, 'coverage') * 0.5 + noise();
  const routeBreak     = offR(wr, 'routeRunning') + noise();
  const catchRating    = offR(wr, 'catching')     + noise();

  // Interception: poor throw + good coverage + risk from deep pass.
  // Multiplier on the coverage-throwAcc differential increased from 0.004→0.007
  // so a 20-point coverage advantage raises int chance by ~1.4% more per play,
  // giving elite defenders a meaningful edge without making every deep ball a pick.
  const intBase = play.risk * 0.3;
  const intChance = Math.max(0, intBase + (coverageRating - throwAcc) * 0.007);
  if (rand() < intChance) {
    const interceptor = (fs.football.coverage >= cb.football.coverage) ? fs : cb;
    return { outcome: 'interception', yards: 0,
             actor: interceptor.name, target: qb.name,
             detail: { playId: play.id, intChance: +intChance.toFixed(3) } };
  }

  // Incomplete (low accuracy vs coverage / route separation).
  // Divisor reduced from 150 → 120 so the same stat differential has more weight:
  // a +15 rating edge swings completionChance by ~12.5pp instead of ~10pp.
  // Hard floor raised from 0.15→0.20 and ceiling kept at 0.92 for arcade feel.
  const completionChance = Math.min(0.92, Math.max(0.20,
    (throwAcc + routeBreak - coverageRating + 60) / 120
  ));
  if (rand() > completionChance) {
    return { outcome: 'incomplete', yards: 0, actor: qb.name, target: wr.name,
             detail: { playId: play.id, completionChance: +completionChance.toFixed(3) } };
  }

  // Completion: yards after catch.
  // catchBonus/routeBonus multipliers raised from 0.1→0.20 so a 20-point rating
  // advantage adds 4 yards per completion (vs 2 before), making elite WRs clearly
  // better at gaining yards after the catch.
  const baseYards   = play.reward * 15;                        // deep pass → up to ~13.5 yds base
  const catchBonus  = (catchRating - 60) * 0.20;
  const routeBonus  = (routeBreak  - 60) * 0.20;
  const yardsAfterCatch = Math.round(baseYards + catchBonus + routeBonus + rand() * play.reward * 10);
  const yards = Math.max(0, Math.min(50, yardsAfterCatch));

  // TD check
  if (state.ballOn + yards >= 100) {
    return { outcome: 'touchdown', yards: 100 - state.ballOn,
             actor: qb.name, target: wr.name,
             detail: { playId: play.id, scorer: wr.name } };
  }

  return { outcome: 'gain', yards, actor: qb.name, target: wr.name,
           detail: { playId: play.id, completionChance: +completionChance.toFixed(3) } };
}

// ── MVP RESOLUTION ─────────────────────────────────────────────────────────────
function _pickMvp(accA, accB) {
  const all = { ...accA, ...accB };
  let best = null, bestScore = -1;
  for (const [name, stats] of Object.entries(all)) {
    const score = stats.yards * 0.5 + stats.touchdowns * 20 +
                  stats.tackles * 3 + stats.interceptions * 15 + stats.sacks * 8;
    if (score > bestScore) { bestScore = score; best = name; }
  }
  return best;
}

// ── SPORT RULESET ─────────────────────────────────────────────────────────────
const footballRuleset = {
  id:       'football',
  tickRate: 1,       // 1 tick = 1 play (informational)
  maxTicks: 200,     // safety cap — 4 downs × 8 drives × ~6 plays = well under 200

  // ── createInitialState ──────────────────────────────────────────────────────
  createInitialState(config, rand) {
    // Resolve lineups from config.
    const rawA = config.lineupA || [];
    const rawB = config.lineupB || [];

    // lineupA/lineupB can be either:
    //   (a) roster.buildLineup result with .players array, OR
    //   (b) plain array of { agent, offRole, defRole } objects
    const playersA = _resolvePlayers(
      Array.isArray(rawA) && rawA.length && rawA[0].agent
        ? { players: rawA }
        : (rawA.players ? rawA : { players: [] })
    );
    const playersB = _resolvePlayers(
      Array.isArray(rawB) && rawB.length && rawB[0].agent
        ? { players: rawB }
        : (rawB.players ? rawB : { players: [] })
    );

    // Ensure minimum 1 player per side.
    if (!playersA.length) {
      playersA.push({ name: 'BOT-A', offRole: 'QB', defRole: 'DL',
                      football: { throwAccuracy:55,routeRunning:55,tackle:55,coverage:55,block:55,passRush:55,catching:55 },
                      aptitude: 0.5, isHero: false });
    }
    if (!playersB.length) {
      playersB.push({ name: 'BOT-B', offRole: 'QB', defRole: 'DL',
                      football: { throwAccuracy:55,routeRunning:55,tackle:55,coverage:55,block:55,passRush:55,catching:55 },
                      aptitude: 0.5, isHero: false });
    }

    // Coin-flip for first possession (deterministic via rand).
    const possession = rand() < 0.5 ? 'A' : 'B';

    return {
      // Field state
      quarter:      1,
      driveCount:   0,
      drivesLeft:   TOTAL_DRIVES,
      ballOn:       25,           // offense always starts on their own 25
      down:         1,
      distance:     FIRST_DOWN_DIST,
      possession,

      // Score
      scoreA: 0,
      scoreB: 0,

      // Current drive tracking
      lastPlayId:   null,
      lastPlayType: null,
      playsOnDrive: 0,

      // Players (resolved)
      playersA,
      playersB,

      // Ability cooldowns: playerName::abilityId → last activated tick
      cooldowns: _initCooldowns(playersA, playersB),

      // Per-player stat accumulators for MVP
      accumA: _initAccumulators(playersA),
      accumB: _initAccumulators(playersB),

      // Summary totals
      yardsA: 0,
      yardsB: 0,
      turnoversA: 0,
      turnoversB: 0,
      touchdownsA: 0,
      touchdownsB: 0,
      playsRun: 0,
    };
  },

  // ── update ──────────────────────────────────────────────────────────────────
  // One tick = one play. Mutates state, emits events via emit().
  update(state, rand, emit) {
    if (state.drivesLeft <= 0) return;

    const offPlayers = _offensePlayers(state);
    const defPlayers = _defensePlayers(state);
    const qb  = _qb(offPlayers);
    const isA = state.possession === 'A';

    // ── 1. Snap event ─────────────────────────────────────────────────────────
    emit({
      type:   'snap',
      actor:  qb.name,
      detail: { down: state.down, distance: state.distance, ballOn: state.ballOn,
                possession: state.possession },
      scoreA: state.scoreA,
      scoreB: state.scoreB,
    });

    // ── 2. Check abilities for on-field players (play tick = playsOnDrive) ────
    const playTick = state.playsOnDrive;
    const offAbEvents = _checkAbilities(offPlayers, 'off', playTick, state.playsRun, state.cooldowns, rand);
    const defAbEvents = _checkAbilities(defPlayers, 'def', playTick, state.playsRun, state.cooldowns, rand);
    for (const ev of [...offAbEvents, ...defAbEvents]) {
      emit({ ...ev, scoreA: state.scoreA, scoreB: state.scoreB });
    }

    // ── 3. Play selection ─────────────────────────────────────────────────────
    const scoreDeficit = _offScore(state) - _defScore(state);
    const scoreLead    = -scoreDeficit;
    const ticksLeft    = state.drivesLeft * 6; // rough proxy

    const { play } = pickOffensePlay({
      down:        state.down,
      yardsToGo:   state.distance,
      scoreDeficit,
      ticksLeft,
      lastPlayId:  state.lastPlayId,
    }, rand);

    const { call: defCall } = pickDefenseCall({
      down:        state.down,
      yardsToGo:   state.distance,
      scoreLead,
      ticksLeft,
      lastPlayType: state.lastPlayType,
    }, rand);

    // ── 4. Emit handoff or throw sub-event ───────────────────────────────────
    if (play.type === 'run') {
      const rb = _rb(offPlayers);
      emit({
        type:   'handoff',
        actor:  qb.name,
        target: rb.name,
        detail: { playId: play.id },
        scoreA: state.scoreA,
        scoreB: state.scoreB,
      });
    } else {
      const wr = _wr(offPlayers);
      emit({
        type:   'throw',
        actor:  qb.name,
        target: wr.name,
        detail: { playId: play.id, defCallId: defCall.id },
        scoreA: state.scoreA,
        scoreB: state.scoreB,
      });
    }

    // ── 5. Resolve play outcome ───────────────────────────────────────────────
    const result = _resolvePlay(offPlayers, defPlayers, play, defCall, state, rand);

    state.playsRun++;
    state.playsOnDrive++;

    // Current accumulators
    const accumOff = isA ? state.accumA : state.accumB;
    const accumDef = isA ? state.accumB : state.accumA;

    // ── 6. Handle each outcome ────────────────────────────────────────────────
    switch (result.outcome) {

      case 'touchdown': {
        state.ballOn = result.yards + state.ballOn; // reaches 100
        if (isA) { state.scoreA += TD_SCORE; state.touchdownsA++; }
        else      { state.scoreB += TD_SCORE; state.touchdownsB++; }
        accumOff[result.actor] = accumOff[result.actor] || { yards:0,touchdowns:0,tackles:0,interceptions:0,sacks:0 };
        accumOff[result.actor].yards      += result.yards;
        accumOff[result.actor].touchdowns += 1;

        emit({
          type:   'catch',
          actor:  result.target,
          detail: { yards: result.yards, ...result.detail },
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        emit({
          type:   'touchdown',
          actor:  result.actor,
          target: result.target,
          detail: { scorer: result.detail.scorer || result.target, yards: result.yards },
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        // End drive, swap possession
        _endDrive(state, rand);
        break;
      }

      case 'interception': {
        if (isA) state.turnoversA++; else state.turnoversB++;
        accumDef[result.actor] = accumDef[result.actor] || { yards:0,touchdowns:0,tackles:0,interceptions:0,sacks:0 };
        accumDef[result.actor].interceptions += 1;

        emit({
          type:   'interception',
          actor:  result.actor,
          target: result.target,
          detail: result.detail,
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        _endDrive(state, rand);
        break;
      }

      case 'fumble': {
        if (isA) state.turnoversA++; else state.turnoversB++;
        accumDef[result.target] = accumDef[result.target] ||
          { yards:0,touchdowns:0,tackles:0,interceptions:0,sacks:0 };
        accumDef[result.target].tackles += 1;

        emit({
          type:   'fumble',
          actor:  result.actor,
          target: result.target,
          detail: result.detail,
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        _endDrive(state, rand);
        break;
      }

      case 'sack': {
        // Negative yards
        const sackYards = result.yards; // negative
        state.ballOn  = Math.max(1, state.ballOn + sackYards);
        state.down++;
        state.distance -= sackYards; // increases since sackYards is negative

        accumDef[result.actor] = accumDef[result.actor] ||
          { yards:0,touchdowns:0,tackles:0,interceptions:0,sacks:0 };
        accumDef[result.actor].sacks += 1;

        emit({
          type:   'sack',
          actor:  result.actor,
          target: result.target,
          detail: { ...result.detail, sackYards },
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        // Check if now 4th down (handled on next tick)
        if (state.down > 4) {
          _handleFourthDownFail(state, emit);
        }
        break;
      }

      case 'incomplete': {
        // Down advances, distance unchanged
        state.down++;
        emit({
          type:   'route_break',
          actor:  result.actor,
          target: result.target,
          detail: result.detail,
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });
        if (state.down > 4) {
          _handleFourthDownFail(state, emit);
        }
        break;
      }

      case 'gain':
      default: {
        const yards = result.yards;
        state.ballOn  = Math.min(99, state.ballOn + yards); // cap below endzone
        state.distance -= yards;

        accumOff[result.actor] = accumOff[result.actor] ||
          { yards:0,touchdowns:0,tackles:0,interceptions:0,sacks:0 };
        accumOff[result.actor].yards += yards;

        // Tackling credit to defender
        const tackleName = _lb(defPlayers).name;
        accumDef[tackleName] = accumDef[tackleName] ||
          { yards:0,touchdowns:0,tackles:0,interceptions:0,sacks:0 };
        accumDef[tackleName].tackles += 1;

        if (isA) state.yardsA += yards; else state.yardsB += yards;

        // Emit catch (for pass) or tackle (for run)
        if (play.type === 'pass') {
          emit({
            type:   'catch',
            actor:  result.target,
            detail: { yards, ...result.detail },
            scoreA: state.scoreA,
            scoreB: state.scoreB,
          });
        }
        emit({
          type:   'tackle',
          actor:  tackleName,
          target: result.actor,
          detail: { yards, ballOn: state.ballOn },
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        });

        // First down check
        if (state.distance <= 0) {
          state.down     = 1;
          state.distance = FIRST_DOWN_DIST;
          // If ball is inside FG range (≥75) on a first down, slight FG chance
          if (state.ballOn >= 75 && rand() < 0.15) {
            // Attempt field goal
            const fgMade = rand() < 0.70; // 70% success rate
            if (fgMade) {
              if (isA) { state.scoreA += FG_SCORE; } else { state.scoreB += FG_SCORE; }
              emit({
                type:   'field_goal',
                actor:  qb.name,
                detail: { ballOn: state.ballOn, made: true },
                scoreA: state.scoreA,
                scoreB: state.scoreB,
              });
              _endDrive(state, rand);
            }
            // missed FG: turnover on downs effectively
          }
        } else if (state.down > 4) {
          _handleFourthDownFail(state, emit);
        } else {
          state.down++;
        }
        break;
      }
    }

    // Track last play info for play-action setup
    state.lastPlayId   = play.id;
    state.lastPlayType = play.type;
  },

  // ── isComplete ──────────────────────────────────────────────────────────────
  isComplete(state) {
    return state.drivesLeft <= 0;
  },

  // ── summarize ───────────────────────────────────────────────────────────────
  summarize(state) {
    const finalScoreA = state.scoreA;
    const finalScoreB = state.scoreB;
    let winner = null;
    if (finalScoreA > finalScoreB) winner = 'a';
    else if (finalScoreB > finalScoreA) winner = 'b';

    const mvp = _pickMvp(state.accumA, state.accumB);

    return {
      finalScoreA,
      finalScoreB,
      winner,
      mvp,
      summary: {
        yardsA:      state.yardsA,
        yardsB:      state.yardsB,
        turnoversA:  state.turnoversA,
        turnoversB:  state.turnoversB,
        touchdownsA: state.touchdownsA,
        touchdownsB: state.touchdownsB,
        playsRun:    state.playsRun,
        drivesPlayed: TOTAL_DRIVES - state.drivesLeft,
      },
    };
  },
};

// ── Drive management helpers ──────────────────────────────────────────────────

/** End the current drive: swap possession, reset down/distance/ballOn. */
function _endDrive(state, rand) {
  state.driveCount++;
  state.drivesLeft--;
  state.playsOnDrive = 0;
  state.down     = 1;
  state.distance = FIRST_DOWN_DIST;
  state.ballOn   = 25; // always start at own 25

  // Alternate possession each drive.
  state.possession = state.possession === 'A' ? 'B' : 'A';
}

/** Handle failed 4th down conversion: turnover on downs or punt. */
function _handleFourthDownFail(state, emit) {
  const isA = state.possession === 'A';
  // If inside FG range (≥60 yardline, ~40-yard FG), attempt FG.
  if (state.ballOn >= 60) {
    const fgMade = true; // simplified: always make short FGs on 4th
    if (isA) state.scoreA += FG_SCORE; else state.scoreB += FG_SCORE;
    emit({
      type:   'field_goal',
      actor:  'offense',
      detail: { ballOn: state.ballOn, made: fgMade, reason: '4th_down_fg' },
      scoreA: state.scoreA,
      scoreB: state.scoreB,
    });
  } else {
    // Punt or turnover on downs
    const eventType = state.ballOn < 45 ? 'turnover_on_downs' : 'punt';
    emit({
      type:   eventType,
      actor:  'offense',
      detail: { down: state.down, distance: state.distance, ballOn: state.ballOn },
      scoreA: state.scoreA,
      scoreB: state.scoreB,
    });
  }
  _endDrive(state, null); // rand not needed for drive swap
}

// ── makeFootballConfig ─────────────────────────────────────────────────────────
/**
 * Build a runMatch config for football using roster.buildMatchup.
 *
 * @param {{ hero?, heroRole?, pool?, seed? }} opts
 * @returns {Object} config for runMatch(footballRuleset, config)
 */
function makeFootballConfig({ hero = null, heroRole = null, pool = null, seed = null } = {}) {
  const resolvedSeed = seed != null ? (seed >>> 0) : ((Math.random() * 0x100000000) >>> 0);
  const resolvedPool = pool || COUNCIL_POOL;

  // Normalize a string hero (e.g. "SHADDAI" from the /sim request body) into the
  // real council agent OBJECT. A bare string has no .name/.id, so buildLineup
  // could neither exclude it from the fill pool (→ duplicate hero) nor resolve
  // its affinity profile (agentAffinity(skills, undefined) → weak neutral → the
  // hero played like a scrub, e.g. a 0-28 shutout). Resolving it fixes both.
  let heroAgent = hero;
  if (typeof hero === 'string' && hero.trim()) {
    const want = hero.trim().toUpperCase();
    heroAgent = resolvedPool.find(a => String(a.name).toUpperCase() === want)
      || { id: want.toLowerCase(), name: want, skills: [] };
  }
  if (!heroAgent) heroAgent = resolvedPool[0];

  const { lineupA, lineupB, seed: usedSeed } = buildMatchup({
    hero:     heroAgent,
    heroRole: heroRole || null,
    pool:     resolvedPool,
    spec:     FOOTBALL_SPEC,
    seed:     resolvedSeed,
  });

  return {
    seed:    usedSeed,
    mode:    'gridiron',
    lineupA: lineupA,
    lineupB: lineupB,
  };
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  footballRuleset,
  makeFootballConfig,
  COUNCIL_POOL,
  FOOTBALL_SPEC,
  TOTAL_DRIVES,
};
