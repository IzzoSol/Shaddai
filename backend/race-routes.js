'use strict';
/**
 * SHADDAI Race routes — express Router for race.gate / race.pit.01..08.
 *
 * Mount example (in server-production.js, NOT edited here):
 *   const raceRoutes = require('./race-routes');
 *   app.use('/api/race', raceRoutes());
 *
 * Assumes express.json() is applied globally. Heat control (open / start /
 * settle) is SERVER-TO-SERVER (race tower / game server) behind the same
 * x-admin-token gate as economy /grant and /spend. Players enter and submit
 * laps. There is NO cash-out / withdraw endpoint (closed-loop by design).
 *
 * User identity: req.user?.id / req.userId from auth middleware; dev fallback
 * to body/query userId (same as economy-routes). Wire real auth in prod.
 *
 * Optional hardening: set RACE_RESULTS_REQUIRE_SERVICE=1 to accept lap
 * results ONLY from the game server (x-admin-token), not from browsers.
 */

const express = require('express');
const { InsufficientFundsError, ValidationError } = require('./economy-service');
const { getDefault, RaceService, RaceError } = require('./race-service');
const { rateLimit, timingSafeTokenMatch } = require('./auth-guard');

const moneyMoveLimit = rateLimit({ windowMs: 60000, max: 30 });

function serviceTokenMatches(provided) {
  return timingSafeTokenMatch(provided, process.env.ADMIN_TOKEN)
    || timingSafeTokenMatch(provided, process.env.ARCADE_SERVICE_TOKEN);
}

function resolveUserId(req, provided) {
  if (req.user && typeof req.user.id === 'string' && req.user.id) return req.user.id;
  if (typeof req.userId === 'string' && req.userId) return req.userId;
  if (typeof provided === 'string' && provided) return provided;
  return null;
}

function sendError(res, err) {
  if (err instanceof InsufficientFundsError) {
    return res.status(402).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof RaceError && err.status < 500) {
    return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
  }
  // eslint-disable-next-line no-console
  console.error('[race-routes] unexpected error:', err && err.stack ? err.stack : err);
  return res.status(500).json({ ok: false, error: 'Internal error', code: 'INTERNAL' });
}

// Returns true if the request carries a valid service token; otherwise sends
// 503/401 and returns false.
function requireService(req, res) {
  if (!process.env.ADMIN_TOKEN && !process.env.ARCADE_SERVICE_TOKEN) {
    res.status(503).json({ ok: false, error: 'Race control disabled (ADMIN_TOKEN not set)', code: 'DISABLED' });
    return false;
  }
  const provided = req.get('x-admin-token') || (req.body && req.body.adminToken);
  if (!serviceTokenMatches(provided)) {
    res.status(401).json({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}

function createRouter(serviceOverride) {
  const router = express.Router();
  const svc = serviceOverride || getDefault();

  // GET /track — lap sequence, pits, direction (static).
  router.get('/track', (req, res) => res.json({ ok: true, ...RaceService.track() }));

  // GET /heats?state=open|racing|settled
  router.get('/heats', async (req, res) => {
    try {
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      return res.json({ ok: true, heats: await svc.listHeats({ state }) });
    } catch (err) { return sendError(res, err); }
  });

  // GET /heats/:heatId
  router.get('/heats/:heatId', async (req, res) => {
    try {
      return res.json({ ok: true, heat: await svc.getHeat(req.params.heatId) });
    } catch (err) { return sendError(res, err); }
  });

  // POST /heats  (SERVICE) { heatId?, entryFee?, prizeSplitPct? }
  router.post('/heats', moneyMoveLimit, async (req, res) => {
    try {
      if (!requireService(req, res)) return undefined;
      const body = req.body || {};
      const r = await svc.openHeat({ heatId: body.heatId, entryFee: body.entryFee, prizeSplitPct: body.prizeSplitPct });
      return res.json({ ok: true, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /heats/:heatId/enter — pays entry fee (idempotent per heat+user).
  router.post('/heats/:heatId/enter', moneyMoveLimit, async (req, res) => {
    try {
      const body = req.body || {};
      const userId = resolveUserId(req, body.userId);
      if (!userId) return res.status(400).json({ ok: false, error: 'userId required', code: 'VALIDATION' });
      const r = await svc.enterHeat(userId, req.params.heatId);
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /heats/:heatId/start  (SERVICE)
  router.post('/heats/:heatId/start', moneyMoveLimit, async (req, res) => {
    try {
      if (!requireService(req, res)) return undefined;
      return res.json({ ok: true, ...(await svc.startHeat(req.params.heatId)) });
    } catch (err) { return sendError(res, err); }
  });

  // POST /heats/:heatId/result  { checkpoints: [{ id:'CP_00', t:0 }, ... { id:'CP_00', t }] }
  router.post('/heats/:heatId/result', moneyMoveLimit, async (req, res) => {
    try {
      if (process.env.RACE_RESULTS_REQUIRE_SERVICE === '1' && !requireService(req, res)) return undefined;
      const body = req.body || {};
      const userId = process.env.RACE_RESULTS_REQUIRE_SERVICE === '1'
        ? (typeof body.userId === 'string' ? body.userId : null)
        : resolveUserId(req, body.userId);
      if (!userId) return res.status(400).json({ ok: false, error: 'userId required', code: 'VALIDATION' });
      const r = await svc.submitResult(userId, req.params.heatId, body.checkpoints);
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /heats/:heatId/settle  (SERVICE) — pays places 1-3 from the pool.
  router.post('/heats/:heatId/settle', moneyMoveLimit, async (req, res) => {
    try {
      if (!requireService(req, res)) return undefined;
      return res.json({ ok: true, ...(await svc.settleHeat(req.params.heatId)) });
    } catch (err) { return sendError(res, err); }
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
