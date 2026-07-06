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

module.exports = { STAT_KEYS, LOADOUT_MAX, SKILLS, getLoadoutStats, simulateMatch, record, leaderboard, listSkills, agents };
