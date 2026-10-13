'use strict';
/**
 * SHADDAI Home routes — express Router for HUB_HOME_A..F.
 *
 * Mount example (in server-production.js, NOT edited here):
 *   const homeRoutes = require('./home-routes');
 *   app.use('/api/home', homeRoutes());
 *
 * Assumes express.json() is applied globally. Follows economy-routes.js:
 * validated input, clean 4xx on bad input, never a 500 on user error.
 * There is NO refund / cash-out / withdraw endpoint (closed-loop by design).
 *
 * User identity: req.user?.id / req.userId from auth middleware; falls back
 * to body/query userId for dev (same as economy-routes). In production wire
 * real auth and remove the fallback.
 */

const express = require('express');
const { InsufficientFundsError, ValidationError } = require('./economy-service');
const { getDefault, HomeError } = require('./home-service');
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
  if (err instanceof HomeError) {
    return res.status(err.status || 409).json({ ok: false, error: err.message, code: err.code });
  }
  // eslint-disable-next-line no-console
  console.error('[home-routes] unexpected error:', err && err.stack ? err.stack : err);
  return res.status(500).json({ ok: false, error: 'Internal error', code: 'INTERNAL' });
}

function needUser(req, res, provided) {
  const userId = resolveUserId(req, provided);
  if (!userId) {
    res.status(400).json({ ok: false, error: 'userId required', code: 'VALIDATION' });
    return null;
  }
  return userId;
}

function createRouter(serviceOverride) {
  const router = express.Router();
  const svc = serviceOverride || getDefault();

  // GET /homes — public board of all hubs (state/lit/claimable; no user ids).
  router.get('/homes', async (req, res) => {
    try {
      return res.json({ ok: true, homes: await svc.listHomes() });
    } catch (err) { return sendError(res, err); }
  });

  // GET /status — dashboard home tile: lit / rent due / stall sold N / pings.
  router.get('/status', async (req, res) => {
    try {
      const userId = needUser(req, res, req.query.userId);
      if (!userId) return undefined;
      return res.json({ ok: true, userId, ...(await svc.status(userId)) });
    } catch (err) { return sendError(res, err); }
  });

  // POST /inhabit  { homeId, agents?: string[] } — pays today's rent.
  router.post('/inhabit', moneyMoveLimit, async (req, res) => {
    try {
      const body = req.body || {};
      const userId = needUser(req, res, body.userId);
      if (!userId) return undefined;
      const r = await svc.inhabit(userId, body.homeId, { agents: body.agents });
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /agents  { homeId, agents: string[] } — capacity 1-3 per hub.
  router.post('/agents', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = needUser(req, res, body.userId);
      if (!userId) return undefined;
      const r = await svc.setAgents(userId, body.homeId, body.agents);
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /rent  { homeId, throughDay?: 'YYYY-MM-DD' } — pays unpaid days.
  router.post('/rent', moneyMoveLimit, async (req, res) => {
    try {
      const body = req.body || {};
      const userId = needUser(req, res, body.userId);
      if (!userId) return undefined;
      const r = await svc.payRent(userId, body.homeId, { throughDay: body.throughDay });
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /checkin  { homeId } — daily capped grant; home must be lit.
  router.post('/checkin', moneyMoveLimit, async (req, res) => {
    try {
      const body = req.body || {};
      const userId = needUser(req, res, body.userId);
      if (!userId) return undefined;
      const r = await svc.checkIn(userId, body.homeId);
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /vacate  { homeId } — leave; no refund (rent is a burn).
  router.post('/vacate', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = needUser(req, res, body.userId);
      if (!userId) return undefined;
      const r = await svc.vacate(userId, body.homeId);
      return res.json({ ok: true, userId, ...r });
    } catch (err) { return sendError(res, err); }
  });

  // POST /stall-sale  (SERVER-TO-SERVER) { userId, homeId, saleId }
  // Header: x-admin-token. Counter only — the sale's Sparks move in bazaar.
  router.post('/stall-sale', moneyMoveLimit, async (req, res) => {
    try {
      if (!process.env.ADMIN_TOKEN && !process.env.ARCADE_SERVICE_TOKEN) {
        return res.status(503).json({ ok: false, error: 'stall-sale disabled (ADMIN_TOKEN not set)', code: 'DISABLED' });
      }
      const provided = req.get('x-admin-token') || (req.body && req.body.adminToken);
      if (!serviceTokenMatches(provided)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
      const body = req.body || {};
      const r = await svc.recordStallSale(body.userId, body.homeId, body.saleId);
      return res.json({ ok: true, ...r });
    } catch (err) { return sendError(res, err); }
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
