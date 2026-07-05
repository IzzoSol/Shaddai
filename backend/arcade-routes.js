// arcade-routes.js — SHADDAI Agent Arcade (agents play, scores recorded, leaderboard).
//   Mounted at /api/arcade (see server-production.js). Scores only — NO money / wagering.
//   GET  /games                                  → { ok, games:[{id,name,url,color}] }
//   GET  /agents                                 → { ok, agents:[{id,name,color,ship,portrait}] }
//   POST /result   { game, agent, score, win }   → { ok, rank, best }
//   GET  /leaderboard?game=&agent=&limit=20      → { ok, scores:[...] }
//   POST /play     { game?, agent }              → { ok, result, rank, best }
const express = require('express');
const router = express.Router();
const json = express.json();

const store = require('./lib/arcade-store');
const sim = require('./lib/arcade-sim');

// ── shared tables ──
const GAMES = [
  { id: 'basketball', name: 'NEON HOOPS', url: '/games/basketball.html', color: '#ff9d3d' },
  { id: 'football', name: 'GRID GRIDIRON', url: '/games/football.html', color: '#ff2a2a' },
  { id: 'dodgeball', name: 'GRID DODGEBALL', url: '/games/dodgeball.html', color: '#ff5db1' },
  { id: 'sigil-storm', name: 'SIGIL STORM', url: '/games/sigil-storm.html', color: '#c084fc' }
];
const GAME_IDS = new Set(GAMES.map(g => g.id));

const AGENT_COLORS = {
  SHADDAI: '#ffcf1a', NEXUS: '#00f0ff', ORACLE: '#b06bff', ZEROX: '#ff9d3d',
  TURTLE: '#ff2bd6', QUILL: '#f5e000', PIKADON: '#ff2a2a'
};
const AGENTS = Object.keys(AGENT_COLORS).map(id => ({
  id,
  name: id,
  color: AGENT_COLORS[id],
  ship: `/assets/games/ships/${id}.png`,
  portrait: `/assets/agents/${id}-portrait.png`
}));
const AGENT_IDS = new Set(Object.keys(AGENT_COLORS));

const normAgent = (a) => String(a || '').trim().toUpperCase();

// ── routes ──
router.get('/games', (req, res) => res.json({ ok: true, games: GAMES }));

router.get('/agents', (req, res) => res.json({ ok: true, agents: AGENTS }));

router.post('/result', json, (req, res) => {
  const { game, score, win } = req.body || {};
  const agent = normAgent(req.body && req.body.agent);
  if (!GAME_IDS.has(String(game))) return res.status(400).json({ ok: false, error: 'invalid game' });
  if (!AGENT_IDS.has(agent)) return res.status(400).json({ ok: false, error: 'invalid agent' });
  if (!Number.isFinite(Number(score))) return res.status(400).json({ ok: false, error: 'numeric score required' });
  try {
    const { rank, best } = store.record({ game: String(game), agent, score, win });
    res.json({ ok: true, rank, best });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/leaderboard', (req, res) => {
  const game = req.query.game ? String(req.query.game) : undefined;
  if (game && !GAME_IDS.has(game)) return res.status(400).json({ ok: false, error: 'invalid game' });
  const agent = req.query.agent ? normAgent(req.query.agent) : undefined;
  const limit = req.query.limit;
  const scores = store.leaderboard({ game, agent, limit });
  res.json({ ok: true, scores });
});

router.post('/play', json, (req, res) => {
  const agent = normAgent(req.body && req.body.agent);
  if (!AGENT_IDS.has(agent)) return res.status(400).json({ ok: false, error: 'invalid agent' });
  let game = req.body && req.body.game ? String(req.body.game) : null;
  if (game && !GAME_IDS.has(game)) return res.status(400).json({ ok: false, error: 'invalid game' });
  if (!game) game = sim.GAMES[Math.floor(Math.random() * sim.GAMES.length)];
  const result = sim.play(game, agent);
  const { rank, best } = store.record({ game: result.game, agent: result.agent, score: result.score, win: result.win });
  res.json({ ok: true, result, rank, best });
});

module.exports = router;
