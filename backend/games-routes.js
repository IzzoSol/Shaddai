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

// Daily play bonus: fixed 5 Sparks for the FIRST score submission by a given
// (userId, game) per UTC calendar day. Deliberately NOT scaled by the
// client-reported score — that value is unauthenticated and trivially
// spoofable (no server-authoritative simulation, no signature), so it must
// never influence a Sparks amount. See economy-service.js grant() for the
// idempotency-key replay protection this relies on.
const DAILY_PLAY_BONUS = 5;
async function awardDailyPlayBonus(userId, game) {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const idempotencyKey = `daily_play_${userId}_${game}_${dateStr}`;
  const { getDefault } = require('./economy-service');
  const svc = getDefault();
  const result = await svc.grant(userId, DAILY_PLAY_BONUS, 'daily_game_play', idempotencyKey, { refId: game });
  return result && result.replayed ? 0 : DAILY_PLAY_BONUS;
}

router.post('/api/games/score', json, async (req, res) => {
  const { game, user, score } = req.body || {};
  const s = Number(score);
  if (!game || !Number.isFinite(s)) return res.status(400).json({ ok: false, error: 'game and numeric score required' });
  const userId = String(user || 'guest').slice(0, 32);
  const db = read(); const b = board(db, String(game));
  b.push({ user: userId, score: s, at: Date.now() });
  b.sort((a, c) => c.score - a.score);
  db[game] = b.slice(0, 200);
  write(db);
  const rank = db[game].findIndex(e => e.score === s && e.user === userId) + 1;

  // Real, non-guest users only: fixed daily play bonus, never scaled by score.
  let sparksAwarded = 0;
  if (userId && userId !== 'guest') {
    try {
      sparksAwarded = await awardDailyPlayBonus(userId, String(game));
    } catch (e) {
      console.error('[games] daily play bonus grant failed:', e && e.message ? e.message : e);
      sparksAwarded = 0;
    }
  }

  const payload = { ok: true, game, rank: rank || null, top: db[game].slice(0, 10) };
  if (sparksAwarded > 0) payload.sparksAwarded = sparksAwarded;
  res.json(payload);
});

router.get('/api/games/leaderboard', (req, res) => {
  const game = String(req.query.game || '');
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const db = read();
  res.json({ ok: true, game, top: (db[game] || []).slice(0, limit) });
});

module.exports = router;
