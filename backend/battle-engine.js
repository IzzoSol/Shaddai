'use strict';
// ============================================================================
// battle-engine.js — SHADDAI Agent Battle Arena.
// Mix-and-match SKILL FILES -> game STATS -> simulated match -> logged outcome.
// The "data learner": aggregate every match to see which skills/agents actually
// win. Deterministic per seed; random each real run so data reveals correlations.
// Persists to data/battle-results.json (+ best-effort Firestore mirror).
//
// This is the sim layer. The live basketball game can later read the SAME loadout
// stats (getLoadoutStats) so a build that wins here also plays better there.
// ============================================================================
const fs = require('fs');
const path = require('path');
// Skill-affinity engine (semantic skill->role mapping). Optional/best-effort:
// if it fails to load or resolve, the sim falls back to plain mode stats.
let affinity = null;
try { affinity = require('./battle-affinity'); } catch (_) { affinity = null; }

const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'battle-results.json');
const MAX_RESULTS = 5000;

// ── GAME STATS ───────────────────────────────────────────────────────────────
// Every agent build resolves to these 0-100 stats. Base ~50, skills push them up.
const STAT_KEYS = ['shooting', 'ballControl', 'speed', 'defense', 'vertical', 'stamina', 'iq'];

// ── SKILL FILES (the mix-and-match loadout pieces) ──────────────────────────
// Each skill maps to stat modifiers. Pick up to LOADOUT_MAX per agent.
const LOADOUT_MAX = 4;
const SKILLS = {
  sharpshooter:      { name: 'Sharpshooter',       icon: '🎯', desc: 'Elite jump shot',            mods: { shooting: +25 } },
  ball_handler:      { name: 'Ball Handler',        icon: '🤾', desc: 'Tight handles, few turnovers', mods: { ballControl: +25 } },
  speed_demon:       { name: 'Speed Demon',         icon: '⚡', desc: 'Blazing transition speed',   mods: { speed: +25 } },
  lockdown:          { name: 'Lockdown Defender',   icon: '🛡️', desc: 'Smothers the ball-handler',  mods: { defense: +25 } },
  high_riser:        { name: 'High Riser',          icon: '🦅', desc: 'Dunks + boards',             mods: { vertical: +25 } },
  iron_lungs:        { name: 'Iron Lungs',          icon: '🫁', desc: 'Never tires late',           mods: { stamina: +22 } },
  court_vision:      { name: 'Court Vision',        icon: '👁️', desc: 'Reads the floor, smart shots', mods: { iq: +22 } },
  slasher:           { name: 'Slasher',             icon: '🗡️', desc: 'Drives to the rim',           mods: { speed: +12, vertical: +12 } },
  playmaker:         { name: 'Playmaker',           icon: '🎩', desc: 'Creates for the build',      mods: { ballControl: +12, iq: +12 } },
  clutch_gene:       { name: 'Clutch Gene',         icon: '❄️', desc: 'Ice in close games',         mods: { shooting: +8, iq: +8, stamina: +8 } },
  glass_cleaner:     { name: 'Glass Cleaner',       icon: '🧹', desc: 'Owns the glass',             mods: { vertical: +14, defense: +10 } },
  two_way:           { name: 'Two-Way Wing',        icon: '♻️', desc: 'Balanced both ends',         mods: { shooting: +10, defense: +12 } },
};

// ── AGENT BASE PROFILES (ties the 7 SHADDAI agents to play styles) ──────────
const AGENT_BASE = {
  SHADDAI: { shooting: 60, ballControl: 58, speed: 55, defense: 58, vertical: 55, stamina: 60, iq: 68 }, // all-around leader
  ZEROX:   { shooting: 66, ballControl: 55, speed: 58, defense: 48, vertical: 52, stamina: 55, iq: 60 }, // scorer/clutch
  ORACLE:  { shooting: 55, ballControl: 54, speed: 50, defense: 55, vertical: 50, stamina: 55, iq: 72 }, // high IQ
  NEXUS:   { shooting: 52, ballControl: 62, speed: 56, defense: 56, vertical: 54, stamina: 58, iq: 64 }, // playmaker
  TURTLE:  { shooting: 58, ballControl: 64, speed: 52, defense: 46, vertical: 50, stamina: 52, iq: 58 }, // handles/flair
  QUILL:   { shooting: 62, ballControl: 52, speed: 50, defense: 50, vertical: 48, stamina: 56, iq: 62 }, // shooter
  PIKADON: { shooting: 48, ballControl: 50, speed: 54, defense: 70, vertical: 60, stamina: 60, iq: 56 }, // defense/boards
};
const DEFAULT_BASE = { shooting: 50, ballControl: 50, speed: 50, defense: 50, vertical: 50, stamina: 50, iq: 50 };

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

// Resolve an agent build (name + skill ids) to final stats. Reused by the live game.
function getLoadoutStats(agentName, skillIds) {
  const base = { ...(AGENT_BASE[String(agentName || '').toUpperCase()] || DEFAULT_BASE) };
  const skills = (Array.isArray(skillIds) ? skillIds : []).slice(0, LOADOUT_MAX);
  for (const id of skills) {
    const sk = SKILLS[id];
    if (!sk) continue;
    for (const [k, v] of Object.entries(sk.mods)) base[k] = clamp((base[k] || 50) + v);
  }
  const overall = Math.round(STAT_KEYS.reduce((s, k) => s + (base[k] || 0), 0) / STAT_KEYS.length);
  return { stats: base, overall, skills };
}

// Seeded RNG (mulberry32) so a given matchup+seed is reproducible; omit seed for real random.
function rng(seed) {
  let a = (seed >>> 0) || (Math.random() * 2 ** 32) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── MATCH SIM ────────────────────────────────────────────────────────────────
// Possession-based: each possession, offense rating vs defense rating + noise
// decides a make (2 or 3) or a miss; a miss is a rebound contest (vertical/defense).
function simulateMatch(A, B, opts = {}) {
  const rand = rng(opts.seed);
  const a = getLoadoutStats(A.agent, A.skills);
  const b = getLoadoutStats(B.agent, B.skills);
  const POSS = opts.possessions || 24;
  const box = {
    a: { pts: 0, fgm: 0, fga: 0, tpm: 0, reb: 0, tov: 0, dunk: 0 },
    b: { pts: 0, fgm: 0, fga: 0, tpm: 0, reb: 0, tov: 0, dunk: 0 },
  };
  const play = [];

  function possession(off, def, offBox, defBox, offStats, defStats, tag) {
    // Turnover chance: defense vs ball control.
    const tov = 0.10 + (defStats.defense - offStats.ballControl) / 400;
    if (rand() < clamp(tov, 0.02, 0.35)) { offBox.tov++; return; }
    offBox.fga++;
    const goThree = rand() < 0.34;
    const shootStat = offStats.shooting + (goThree ? -6 : 0) + offStats.iq * 0.15;
    const contest = defStats.defense * 0.55;
    let makeP = 0.30 + (shootStat - contest) / 160;
    // Rim attack / dunk if athletic + fast beats defense.
    const canDunk = offStats.vertical > 62 && offStats.speed > 55 && !goThree;
    if (canDunk && rand() < (offStats.vertical - defStats.defense) / 180 + 0.12) {
      offBox.fgm++; offBox.dunk++; offBox.pts += 2;
      play.push(tag + ' throws down a DUNK 🔨'); return;
    }
    if (rand() < clamp(makeP, 0.15, 0.72)) {
      offBox.fgm++;
      if (goThree) { offBox.tpm++; offBox.pts += 3; play.push(tag + ' drills a three 🎯'); }
      else { offBox.pts += 2; play.push(tag + ' scores'); }
    } else {
      // Miss -> rebound contest (rim rule: miss = live board, no points).
      const offReb = offStats.vertical * 0.45, defReb = defStats.vertical * 0.55 + defStats.defense * 0.2;
      if (rand() < offReb / (offReb + defReb)) { offBox.reb++; play.push(tag + ' grabs its own board'); }
      else { defBox.reb++; }
    }
  }

  for (let i = 0; i < POSS; i++) {
    // Late-game stamina: tired builds shoot worse in the last 25%.
    const late = i > POSS * 0.75;
    const aS = late ? decay(a.stats) : a.stats;
    const bS = late ? decay(b.stats) : b.stats;
    possession(A, B, box.a, box.b, aS, bS, (A.agent || 'A'));
    possession(B, A, box.b, box.a, bS, aS, (B.agent || 'B'));
  }
  function decay(s) { const t = { ...s }; const drop = clamp((60 - s.stamina) / 4, 0, 12); t.shooting = clamp(s.shooting - drop); t.speed = clamp(s.speed - drop); return t; }

  const winner = box.a.pts === box.b.pts
    ? (a.overall >= b.overall ? 'a' : 'b')       // tiebreak by overall
    : (box.a.pts > box.b.pts ? 'a' : 'b');
  return {
    a: { agent: A.agent, skills: a.skills, overall: a.overall, stats: a.stats, box: box.a },
    b: { agent: B.agent, skills: b.skills, overall: b.overall, stats: b.stats, box: box.b },
    winner,
    score: `${box.a.pts}-${box.b.pts}`,
    highlights: play.slice(-8),
    ts: Date.now(),
  };
}

// ============================================================================
// EVENT-TIMELINE SIM (watchable replay) — deterministic per seed.
// Returns a tick-ordered event stream a 3D viewer can replay for ANY game mode.
// Every mode emits the SAME timeline shape; only its scoring rule + which stats
// matter + its event vocabulary differ. Outcomes reuse getLoadoutStats + rng so
// they stay consistent with simulateMatch.
// ============================================================================

// Per-mode skill multiplier: how much a skill's stat mods "matter" in a mode.
// A mode's effective stat for a fighter = base loadout stat, then per-possession
// logic weights the stats it cares about (see MODES[x].weights). This table lets
// a shooting-heavy skill count for more in shooting/hoops than in, say, soccer.
// Value multiplies the skill's declared mods when resolving mode stats. Default 1.
const MODE_SKILL_MULT = {
  hoops:     { sharpshooter: 1.3, clutch_gene: 1.2, high_riser: 1.15, court_vision: 1.1 },
  dodgeball: { speed_demon: 1.4, ball_handler: 1.25, lockdown: 1.2, slasher: 1.15, sharpshooter: 1.1 },
  soccer:    { speed_demon: 1.3, ball_handler: 1.3, court_vision: 1.2, playmaker: 1.25, lockdown: 1.15 },
  shooting:  { sharpshooter: 1.6, clutch_gene: 1.3, court_vision: 1.25 },
  gridiron:  { high_riser: 1.3, speed_demon: 1.25, lockdown: 1.3, iron_lungs: 1.2, glass_cleaner: 1.15 },
};

// Resolve mode-adjusted stats: start from loadout stats, then re-apply each skill's
// mods scaled by that mode's multiplier (so a skill can matter more/less by mode).
function getModeStats(agentName, skillIds, mode) {
  const base = { ...(AGENT_BASE[String(agentName || '').toUpperCase()] || DEFAULT_BASE) };
  const skills = (Array.isArray(skillIds) ? skillIds : []).slice(0, LOADOUT_MAX);
  const mult = MODE_SKILL_MULT[mode] || {};
  for (const id of skills) {
    const sk = SKILLS[id];
    if (!sk) continue;
    const m = mult[id] || 1;
    for (const [k, v] of Object.entries(sk.mods)) base[k] = clamp((base[k] || 50) + v * m);
  }
  const overall = Math.round(STAT_KEYS.reduce((s, k) => s + (base[k] || 0), 0) / STAT_KEYS.length);
  return { stats: base, overall, skills };
}

// Weighted "power" of a fighter for a mode's offensive action, plus its defense.
function power(stats, weights) {
  let sum = 0, wsum = 0;
  for (const [k, w] of Object.entries(weights)) { sum += (stats[k] || 50) * w; wsum += w; }
  return wsum ? sum / wsum : 50;
}

// ── AFFINITY BRIDGE ───────────────────────────────────────────────────────────
// Resolve an agent's semantic trait profile + best role for a mode, and produce
// a role-adjusted copy of its stats. Backward-compatible: if the affinity module
// is missing or throws, returns the stats untouched and role=null so every mode
// keeps its current behavior.
function resolveAffinity(agentName, skillIds, mode, stats, forcedRole) {
  if (!affinity) return { role: null, profile: null, stats, aptitude: 0 };
  try {
    const profile = affinity.agentAffinity(skillIds, agentName);
    const role = forcedRole || affinity.bestRole(profile, mode);
    if (!role) return { role: null, profile, stats, aptitude: 0 };
    const { mods, aptitude } = affinity.roleStatMods(profile, mode, role);
    const out = { ...stats };
    for (const [k, m] of Object.entries(mods || {})) out[k] = clamp((out[k] || 50) * m);
    return { role, profile, stats: out, aptitude };
  } catch (_) {
    return { role: null, profile: null, stats, aptitude: 0 };
  }
}

// ── MODE DEFINITIONS ────────────────────────────────────────────────────────
// Each mode: label, periods, ticksPerPeriod, offensive weights, defensive weights,
// and a resolve() that — given rng, offense/defense stats, and an emit() — decides
// what happens on one "possession"/tick and returns points scored by offense.
// resolve emits watchable beats via emit(type, {actor,target,detail}).
const MODES = {
  // ── HOOPS: mirrors simulateMatch (basketball reference). ──
  hoops: {
    label: 'Hoops', periods: 4, ticksPerPeriod: 6,
    weights: { shooting: 0.5, iq: 0.2, speed: 0.15, ballControl: 0.15 },
    def: { defense: 0.7, vertical: 0.3 },
    resolve(rand, off, def, offName, defName, emit) {
      const tov = clamp(0.10 + (def.defense - off.ballControl) / 400, 0.02, 0.35);
      if (rand() < tov) { emit('steal', { actor: defName, target: offName, detail: 'strips the ball' }); return 0; }
      const goThree = rand() < 0.34;
      const shootStat = off.shooting + (goThree ? -6 : 0) + off.iq * 0.15;
      const makeP = 0.30 + (shootStat - def.defense * 0.55) / 160;
      const canDunk = off.vertical > 62 && off.speed > 55 && !goThree;
      if (canDunk && rand() < (off.vertical - def.defense) / 180 + 0.12) {
        emit('score', { actor: offName, detail: 'throws down a DUNK', pts: 2 }); return 2;
      }
      if (rand() < clamp(makeP, 0.15, 0.72)) {
        if (goThree) { emit('score', { actor: offName, detail: 'drills a three', pts: 3 }); return 3; }
        emit('score', { actor: offName, detail: 'scores', pts: 2 }); return 2;
      }
      const offReb = off.vertical * 0.45, defReb = def.vertical * 0.55 + def.defense * 0.2;
      if (rand() < offReb / (offReb + defReb)) emit('miss', { actor: offName, detail: 'misses, grabs own board' });
      else { emit('block', { actor: defName, target: offName, detail: 'boxes out the rebound' }); }
      return 0;
    },
  },
  // ── DODGEBALL: hit to eliminate; speed to dodge, ballControl+shooting to throw. ──
  dodgeball: {
    label: 'Dodgeball', periods: 3, ticksPerPeriod: 8,
    weights: { speed: 0.35, ballControl: 0.35, shooting: 0.2, iq: 0.1 },
    def: { speed: 0.6, iq: 0.4 },
    resolve(rand, off, def, offName, defName, emit) {
      const acc = power(off, this.weights), dodge = power(def, this.def);
      const hitP = clamp(0.34 + (acc - dodge) / 170, 0.10, 0.80);
      if (rand() < hitP) { emit('score', { actor: offName, target: defName, detail: 'nails a throw — HIT', pts: 1 }); return 1; }
      if (rand() < 0.3) emit('block', { actor: defName, target: offName, detail: 'catches it — turnover' });
      else emit('miss', { actor: offName, target: defName, detail: 'throw dodged' });
      return 0;
    },
  },
  // ── SOCCER: build-up then shot; ballControl+iq to create, defense to stop. ──
  soccer: {
    label: 'Soccer', periods: 2, ticksPerPeriod: 9,
    weights: { ballControl: 0.35, iq: 0.25, speed: 0.25, shooting: 0.15 },
    def: { defense: 0.6, speed: 0.25, iq: 0.15 },
    resolve(rand, off, def, offName, defName, emit) {
      const build = power(off, this.weights), stop = power(def, this.def);
      if (rand() < clamp(0.12 + (stop - build) / 380, 0.03, 0.30)) {
        emit('steal', { actor: defName, target: offName, detail: 'tackles, wins possession' }); return 0;
      }
      emit('move', { actor: offName, detail: 'works it up the pitch' });
      const goalP = clamp(0.20 + (off.shooting + build * 0.3 - def.defense * 0.6) / 300, 0.06, 0.55);
      if (rand() < goalP) { emit('score', { actor: offName, detail: 'buries it — GOAL', pts: 1 }); return 1; }
      if (rand() < 0.35) emit('block', { actor: defName, target: offName, detail: 'keeper saves it' });
      else emit('miss', { actor: offName, detail: 'shot goes wide' });
      return 0;
    },
  },
  // ── SHOOTING: pure accuracy contest; shooting+iq dominate, stamina late. ──
  shooting: {
    label: 'Shooting Range', periods: 3, ticksPerPeriod: 7,
    weights: { shooting: 0.6, iq: 0.25, stamina: 0.15 },
    def: { defense: 0.0 }, // no live defender; you vs the target
    resolve(rand, off, def, offName, defName, emit) {
      const acc = power(off, this.weights);
      const roll = rand();
      if (roll < clamp(0.05 + (acc - 55) / 400, 0.01, 0.25)) {
        emit('score', { actor: offName, detail: 'BULLSEYE', pts: 3 }); return 3;
      }
      if (roll < clamp(0.40 + (acc - 50) / 200, 0.15, 0.85)) {
        emit('score', { actor: offName, detail: 'on target', pts: 1 }); return 1;
      }
      emit('miss', { actor: offName, detail: 'shot missed the mark' });
      return 0;
    },
  },
  // ── GRIDIRON: a real drive with downs, run/pass choice, coverage, sacks,
  //    turnovers (INT/fumble), turnover-on-downs, punts, FGs, TDs. Each play
  //    resolves against the relevant role stats (affinity picks who's the QB /
  //    RB / WR on offense and the pass-rush / coverage / tackling on defense).
  //    Emits rich, replayable beats with the SAME event shape as every mode.
  gridiron: {
    label: 'Gridiron', periods: 4, ticksPerPeriod: 5, positional: true,
    weights: { vertical: 0.3, speed: 0.3, shooting: 0.2, iq: 0.2 },
    def: { defense: 0.6, vertical: 0.25, speed: 0.15 },
    // A "tick" = one full drive (a series of downs). Returns points scored.
    resolve(rand, off, def, offName, defName, emit) {
      // Offensive role lanes (affinity already nudged these stats before us):
      const passGame = off.shooting * 0.5 + off.iq * 0.3 + off.speed * 0.2;   // QB+WR
      const runGame  = off.vertical * 0.5 + off.speed * 0.3 + off.stamina * 0.2; // RB
      const passRush = def.defense * 0.5 + def.speed * 0.5;                   // DL
      const coverage = def.defense * 0.5 + def.vertical * 0.25 + def.iq * 0.25; // DB
      const tackling = def.defense * 0.6 + def.vertical * 0.4;                // LB

      emit('snap', { actor: offName, detail: 'breaks the huddle, drive begins' });
      let yards = 0;              // drive starts near midfield; reach endzone at GOAL
      const GOAL = 60;
      let down = 1, toGo = 10;

      for (let play = 0; play < 14; play++) { // hard cap on plays per drive
        const isPass = rand() < clamp(0.42 + (passGame - runGame) / 400, 0.25, 0.72);

        if (isPass) {
          // Pass rush can sack before the throw.
          const sackP = clamp(0.08 + (passRush - passGame) / 420, 0.02, 0.26);
          if (rand() < sackP) {
            emit('sack', { actor: defName, target: offName, detail: 'SACK — loss of yards' });
            yards -= 6; toGo += 6;
          } else {
            emit('pass', { actor: offName, detail: 'drops back to pass' });
            // Interception risk rises when coverage beats the pass game.
            const intP = clamp(0.05 + (coverage - passGame) / 900, 0.01, 0.14);
            if (rand() < intP) {
              emit('interception', { actor: defName, target: offName, detail: 'INTERCEPTED — turnover' });
              return 0;
            }
            const compP = clamp(0.55 + (passGame - coverage) / 260, 0.20, 0.85);
            if (rand() < compP) {
              const gain = 6 + Math.floor(rand() * 22 * (passGame / 70));
              yards += gain; toGo -= gain;
              emit('move', { actor: offName, detail: `completion for ${gain} yds` });
            } else {
              emit('miss', { actor: offName, detail: 'pass falls incomplete' });
            }
          }
        } else {
          // Run: gain vs tackling; small fumble chance on contact.
          const fumbleP = clamp(0.03 + (tackling - runGame) / 1400, 0.005, 0.08);
          if (rand() < fumbleP) {
            emit('tackle', { actor: defName, target: offName, detail: 'big hit — FUMBLE, recovered' });
            return 0;
          }
          emit('handoff', { actor: offName, detail: 'hands it off' });
          const gain = Math.max(-2, Math.floor((runGame - tackling) / 12 + rand() * 8) - 2);
          yards += gain; toGo -= gain;
          if (gain <= 1) emit('tackle', { actor: defName, target: offName, detail: `stuffed for ${gain} yds` });
          else emit('move', { actor: offName, detail: `run for ${gain} yds` });
        }

        // Score?
        if (yards >= GOAL) { emit('touchdown', { actor: offName, detail: 'TOUCHDOWN', pts: 7 }); return 7; }
        // Down accounting: reaching the sticks resets the series; every other
        // play (sack, incompletion, short run) consumes exactly one down.
        if (toGo <= 0) { down = 1; toGo = 10; }
        else down++;

        // 4th down decision.
        if (down >= 4) {
          const distToGoal = GOAL - yards;
          if (distToGoal <= 20 && distToGoal > 3) {
            // Field goal attempt.
            const fgP = clamp(0.55 + (off.shooting - 55) / 200 - distToGoal / 120, 0.25, 0.9);
            if (rand() < fgP) { emit('field_goal', { actor: offName, detail: `field goal is GOOD (${distToGoal} yd)`, pts: 3 }); return 3; }
            emit('miss', { actor: offName, detail: 'field goal is NO GOOD' });
            emit('turnover_on_downs', { actor: defName, target: offName, detail: 'takes over on the miss' });
            return 0;
          }
          if (toGo > 2 || distToGoal > 45) {
            emit('punt', { actor: offName, detail: 'punts it away' });
            return 0;
          }
          // Go for it on 4th & short.
          const convP = clamp(0.5 + (runGame - tackling) / 200, 0.2, 0.8);
          if (rand() < convP) { down = 1; toGo = 10; emit('move', { actor: offName, detail: 'converts on 4th down!' }); }
          else { emit('turnover_on_downs', { actor: defName, target: offName, detail: 'stopped on downs — turnover' }); return 0; }
        }
      }
      // Ran out of plays without scoring.
      emit('punt', { actor: offName, detail: 'drive stalls, punts' });
      return 0;
    },
  },
};

function listModes() {
  return Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, periods: m.periods, ticksPerPeriod: m.ticksPerPeriod }));
}

// Auto-play driver: runs a full match tick-by-tick and returns a replayable timeline.
// Deterministic: same (A, B, mode, seed) => identical events. Zero user input.
function simulateTimeline(A, B, opts = {}) {
  const mode = (opts.mode && MODES[opts.mode]) ? opts.mode : 'hoops';
  const cfg = MODES[mode];
  // Echo a concrete seed so a replay is always reproducible.
  const seed = (opts.seed != null) ? (opts.seed >>> 0) : (Math.random() * 2 ** 32) >>> 0;
  const rand = rng(seed);

  const a = getModeStats(A.agent, A.skills, mode);
  const b = getModeStats(B.agent, B.skills, mode);
  const nameA = A.agent || 'A', nameB = B.agent || 'B';

  // ── AFFINITY: semantic skill->role mapping nudges each side's effective stats.
  // Backward-compatible: if the module is absent/unresolvable, offStats === stats
  // and role === null, so every mode behaves exactly as before.
  const OFF_POOL = { gridiron: ['QB', 'RB', 'WR', 'OL'] };
  const DEF_POOL = { gridiron: ['DL', 'LB', 'DB'] };
  function affFor(name, skills, stats) {
    // Offensive best-role stat nudge (used by all modes for the attacking side).
    const off = resolveAffinity(name, skills, mode, stats, null);
    let offAdj = off.stats, offRole = off.role, profile = off.profile;
    if (affinity && OFF_POOL[mode]) {
      const r = affinity.bestRole(profile, mode, OFF_POOL[mode]);
      const rm = resolveAffinity(name, skills, mode, stats, r);
      offAdj = rm.stats; offRole = rm.role;
    }
    // Defensive best-role stat nudge (positional modes only; else = offAdj).
    let defAdj = offAdj, defRole = offRole;
    if (affinity && DEF_POOL[mode]) {
      const r = affinity.bestRole(profile, mode, DEF_POOL[mode]);
      const rm = resolveAffinity(name, skills, mode, stats, r);
      defAdj = rm.stats; defRole = rm.role;
    }
    return { profile, offRole, defRole, offStats: offAdj, defStats: defAdj };
  }
  const affA = affFor(nameA, A.skills, a.stats);
  const affB = affFor(nameB, B.skills, b.stats);

  let scoreA = 0, scoreB = 0, t = 0;
  const events = [];
  // proc tallies for MVP + skill_proc flavor
  const procCount = { [nameA]: 0, [nameB]: 0 };
  const emitFor = (side) => (type, detail) => {
    const actor = detail.actor != null ? detail.actor : (side === 'a' ? nameA : nameB);
    const ev = { t, type, actor, detail: detail.detail || '', scoreA, scoreB };
    if (detail.target != null) ev.target = detail.target;
    events.push(ev);
  };

  events.push({ t, type: 'spawn', actor: nameA, detail: `${nameA} enters (${cfg.label})`, scoreA, scoreB });
  events.push({ t, type: 'spawn', actor: nameB, detail: `${nameB} enters (${cfg.label})`, scoreA, scoreB });

  // Small chance each possession that a loadout skill visibly "procs" (flavor + MVP weight).
  function maybeProc(side, stats, name) {
    const sk = (side === 'a' ? a.skills : b.skills);
    if (!sk.length) return;
    if (rand() < 0.22) {
      const id = sk[Math.floor(rand() * sk.length)];
      const meta = SKILLS[id];
      if (!meta) return;
      procCount[name]++;
      events.push({ t, type: 'skill_proc', actor: name, detail: `${meta.name} ${meta.icon} activates`, skill: id, scoreA, scoreB });
    }
  }

  const maxTicks = Math.max(1, Math.min(opts.maxTicks || Infinity, cfg.periods * cfg.ticksPerPeriod));
  const staminaDecay = (s) => { const drop = clamp((60 - s.stamina) / 4, 0, 12); return { ...s, shooting: clamp(s.shooting - drop), speed: clamp(s.speed - drop) }; };

  for (let p = 0; p < cfg.periods; p++) {
    for (let k = 0; k < cfg.ticksPerPeriod; k++) {
      if (t >= maxTicks) break;
      const late = (p === cfg.periods - 1) && (k >= cfg.ticksPerPeriod * 0.5);
      // Use affinity-adjusted stats: attacker uses its OFFENSIVE role stats,
      // the defender uses its DEFENSIVE role stats. (Identical to plain stats
      // when affinity is unavailable.)
      const aOff = late ? staminaDecay(affA.offStats) : affA.offStats;
      const bOff = late ? staminaDecay(affB.offStats) : affB.offStats;
      const aDef = late ? staminaDecay(affA.defStats) : affA.defStats;
      const bDef = late ? staminaDecay(affB.defStats) : affB.defStats;

      // A's turn (A attacks, B defends)
      maybeProc('a', aOff, nameA);
      scoreA += cfg.resolve.call(cfg, rand, aOff, bDef, nameA, nameB, emitFor('a'));
      // Each event captured score BEFORE increment; keep as-is for deterministic replay.

      // B's turn (B attacks, A defends)
      maybeProc('b', bOff, nameB);
      scoreB += cfg.resolve.call(cfg, rand, bOff, aDef, nameB, nameA, emitFor('b'));

      t++;
    }
    if (t >= maxTicks) break;
    events.push({ t, type: 'period_end', actor: null, detail: `End of period ${p + 1}`, scoreA, scoreB });
  }

  const winner = scoreA === scoreB ? (a.overall >= b.overall ? 'a' : 'b') : (scoreA > scoreB ? 'a' : 'b');
  // MVP: winner's side, weighted by procs (fallback to winner name).
  const mvp = winner === 'a' ? nameA : nameB;
  events.push({ t, type: 'end', actor: mvp, detail: `${mvp} wins ${scoreA}-${scoreB}`, scoreA, scoreB });

  return {
    ok: true, mode, seed,
    fighters: [
      { name: nameA, stats: a.stats, skills: a.skills, overall: a.overall, role: affA.offRole, defRole: affA.defRole, profile: affA.profile },
      { name: nameB, stats: b.stats, skills: b.skills, overall: b.overall, role: affB.offRole, defRole: affB.defRole, profile: affB.profile },
    ],
    events,
    finalScoreA: scoreA, finalScoreB: scoreB,
    winner, mvp,
    stepId: opts.stepId != null ? opts.stepId : null,
    speed: opts.speed != null ? opts.speed : 1,
    ts: Date.now(),
  };
}

// ── PERSISTENCE + DATA LEARNER ──────────────────────────────────────────────
function _load() { try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch (_) { return []; } }
function _save(arr) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = RESULTS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(arr.slice(-MAX_RESULTS))); fs.renameSync(tmp, RESULTS_FILE);
    try { require('./lib/fire-store').saveDoc('shaddai_battles', 'results', arr.slice(-1500)); } catch (_) {}
  } catch (_) {}
}

function record(result) {
  const arr = _load();
  arr.push({
    a: result.a.agent, sa: result.a.skills, b: result.b.agent, sb: result.b.skills,
    w: result.winner, score: result.score, ts: result.ts,
  });
  _save(arr);
  return arr.length;
}

// The data learner: which SKILLS and AGENTS actually win, from all logged matches.
function leaderboard() {
  const arr = _load();
  const skill = {}, agent = {};
  const bump = (map, key, won) => { const e = map[key] || (map[key] = { key, games: 0, wins: 0 }); e.games++; if (won) e.wins++; };
  for (const m of arr) {
    const aWon = m.w === 'a', bWon = m.w === 'b';
    bump(agent, m.a, aWon); bump(agent, m.b, bWon);
    for (const s of (m.sa || [])) bump(skill, s, aWon);
    for (const s of (m.sb || [])) bump(skill, s, bWon);
  }
  const rate = (o) => Object.values(o).map(e => ({ ...e, winRate: e.games ? +(e.wins / e.games).toFixed(3) : 0 }))
    .filter(e => e.games >= 1).sort((x, y) => y.winRate - x.winRate || y.games - x.games);
  return { totalMatches: arr.length, skills: rate(skill).map(e => ({ ...e, ...(SKILLS[e.key] ? { name: SKILLS[e.key].name, icon: SKILLS[e.key].icon } : {}) })), agents: rate(agent) };
}

function listSkills() { return Object.entries(SKILLS).map(([id, s]) => ({ id, ...s })); }
function agents() { return Object.keys(AGENT_BASE); }

module.exports = { STAT_KEYS, LOADOUT_MAX, SKILLS, getLoadoutStats, simulateMatch, simulateTimeline, getModeStats, listModes, record, leaderboard, listSkills, agents, affinity };
