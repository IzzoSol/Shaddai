// games-routes.js — leaderboard for Shaddai World games (see docs/SHADDAI_GAME_INTEGRATION_SPEC.md).
//   POST /api/games/score  { game, user, score }   → { ok, rank, top:[…] }
//   GET  /api/games/leaderboard?game=<slug>&limit=10
// Store: backend/data/games-scores.json  { <game>: [ {user, score, at} ... ] }
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const FILE = path.join(__dirname, 'data', 'games-scores.json');
const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } };
const write = (d) => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch (e) {} };
const board = (db, game) => (db[game] || (db[game] = []));

router.post('/api/games/score', json, (req, res) => {
  const { game, user, score } = req.body || {};
  const s = Number(score);
  if (!game || !Number.isFinite(s)) return res.status(400).json({ ok: false, error: 'game and numeric score required' });
  const db = read(); const b = board(db, String(game));
  b.push({ user: String(user || 'guest').slice(0, 32), score: s, at: Date.now() });
  b.sort((a, c) => c.score - a.score);
  db[game] = b.slice(0, 200);
  write(db);
  const rank = db[game].findIndex(e => e.score === s && e.user === String(user || 'guest')) + 1;
  res.json({ ok: true, game, rank: rank || null, top: db[game].slice(0, 10) });
});

router.get('/api/games/leaderboard', (req, res) => {
  const game = String(req.query.game || '');
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const db = read();
  res.json({ ok: true, game, top: (db[game] || []).slice(0, limit) });
});

module.exports = router;
