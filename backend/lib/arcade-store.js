// arcade-store.js — single source of truth for SHADDAI Agent Arcade scores.
//   Store: backend/data/arcade-scores.json  (a flat array of records)
//   record({game, agent, score, win}) → appends, caps to 2000, atomic write → {rank, best}
//   leaderboard({game, agent, limit}) → filtered + sorted desc by score, sliced
// Scores only — NO money / wagering.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'arcade-scores.json');

// per-game sane score ceilings — guards the leaderboard against negative or
// absurd (bugged / spoofed) values. Scores are clamped to [0, max].
const SCORE_MAX = {
  basketball: 400,
  football: 63,
  dodgeball: 2000,
  'sigil-storm': 2000000,
};
function clampScore(game, s) {
  const max = SCORE_MAX[game] != null ? SCORE_MAX[game] : 2000000;
  return Math.max(0, Math.min(max, s));
}

function ensure() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
  } catch (e) { /* best-effort */ }
}

function readAll() {
  ensure();
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}

function writeAll(arr) {
  ensure();
  // atomic: write tmp then rename over the target
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, FILE);
}

// record a single play. Returns { rank, best } for this score within its game.
function record({ game, agent, score, win } = {}) {
  game = String(game || '').trim();
  agent = String(agent || '').trim().toUpperCase();
  const raw = Math.round(Number(score));
  if (!game) throw new Error('game required');
  if (!agent) throw new Error('agent required');
  if (!Number.isFinite(raw)) throw new Error('numeric score required');
  const s = clampScore(game, raw);

  const entry = { game, agent, score: s, win: !!win, ts: Date.now() };
  const all = readAll();
  all.push(entry);
  // cap array to the last 2000 records
  const capped = all.slice(-2000);
  writeAll(capped);

  // rank = 1-based position of this score in the game's leaderboard (desc by score)
  const gameScores = capped.filter(r => r.game === game).map(r => r.score).sort((a, b) => b - a);
  const rank = gameScores.indexOf(s) + 1;

  // best = agent's best score for this game
  const agentScores = capped.filter(r => r.game === game && r.agent === agent).map(r => r.score);
  const best = agentScores.length ? Math.max(...agentScores) : s;

  return { rank, best };
}

// leaderboard for a game (and optionally a single agent), sorted desc by score.
function leaderboard({ game, agent, limit = 20 } = {}) {
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const all = readAll();
  let rows = all;
  if (game) rows = rows.filter(r => r.game === String(game));
  if (agent) rows = rows.filter(r => r.agent === String(agent).toUpperCase());
  return rows.slice().sort((a, b) => b.score - a.score).slice(0, lim);
}

module.exports = { record, leaderboard, FILE };
