// backend/lib/leaderboard-routes.js — simple per-game leaderboards for SHADDAI games.
// Mounted at /api/leaderboard. Data in backend/data/leaderboards.json (atomic write).
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const FILE = path.join(__dirname, '..', 'data', 'leaderboards.json');
const MAX_PER_GAME = 100;
const ALLOWED = /^[a-z0-9_-]{1,32}$/i;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; }
  catch (e) { return {}; }
}
function save(data) {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) { /* best-effort */ }
}
function clean(s, n) { return String(s == null ? '' : s).replace(/[<>]/g, '').slice(0, n); }

// GET /api/leaderboard/:game  → top scores (desc)
router.get('/:game', (req, res) => {
  const game = req.params.game;
  if (!ALLOWED.test(game)) return res.status(400).json({ ok: false, error: 'bad game id' });
  const db = load();
  const list = (db[game] || []).slice().sort((a, b) => b.score - a.score).slice(0, 25);
  res.json({ ok: true, game, scores: list });
});

// POST /api/leaderboard/:game  body { name?, score?, goals? }
router.post('/:game', express.json({ limit: '8kb' }), (req, res) => {
  const game = req.params.game;
  if (!ALLOWED.test(game)) return res.status(400).json({ ok: false, error: 'bad game id' });
  const b = req.body || {};
  let score = Number(b.score != null ? b.score : b.goals);
  if (!isFinite(score)) score = 0;
  score = Math.max(-100000, Math.min(1000000, Math.round(score)));
  const name = clean(b.name, 24) || 'operative';
  const db = load();
  if (!Array.isArray(db[game])) db[game] = [];
  const entry = { name, score, at: Date.now() };
  db[game].push(entry);
  db[game].sort((a, c) => c.score - a.score);
  if (db[game].length > MAX_PER_GAME) db[game] = db[game].slice(0, MAX_PER_GAME);
  save(db);
  const rank = db[game].findIndex(e => e === entry) + 1;
  res.json({ ok: true, game, entry, rank });
});

module.exports = router;
