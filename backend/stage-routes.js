// stage-routes.js — who the caller is to the dashboard (free / user / client).
//   GET   /api/stage/me                 the CALLER's stage + features (identity = verified session only)
//   GET   /api/stage/engagements        admin: all engagements
//   POST  /api/stage/engagements        admin: start an engagement for a client  {clientUserId, title}
//   PATCH /api/stage/engagements/:id    admin: change status / phase / title
// There is deliberately no :userId anywhere a non-admin can reach — the caller can only ever see themselves.
// MOUNT: app.use('/api/stage', softAuth, require('./stage-routes'));
'use strict';
const path = require('path');
const express = require('express');
const stages = require('./lib/stages');
const { createEngagementStore } = require('./lib/engagement-store');

function createRouter(deps) {
  deps = deps || {};
  const store = deps.store || createEngagementStore(path.join(__dirname, 'data', 'engagements.json'));
  const getEntitlement = deps.getEntitlement || ((uid) => require('./sub-billing-service').getEntitlement(uid));
  const requireAdmin = deps.requireAdmin || require('./auth-guard').requireAdminUser;
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));

  router.get('/me', (req, res) => {
    const signedIn = !!req.isAuthenticated && !!req.userId && req.userId !== 'local';
    let entitlement = { tier: 'free', active: true };
    if (signedIn) { try { entitlement = getEntitlement(req.userId) || entitlement; } catch (_) {} }
    const resolved = stages.resolveStage({
      signedIn, entitlement, engagements: signedIn ? store.forClient(req.userId) : [],
    });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...resolved });
  });

  router.get('/engagements', requireAdmin, (req, res) => res.json({ ok: true, engagements: store.all() }));

  router.post('/engagements', requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      res.status(201).json({ ok: true, engagement: store.create({
        clientUserId: b.clientUserId, title: b.title, consultantUserId: req.userId !== 'local' ? req.userId : null,
      }) });
    } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });

  router.patch('/engagements/:id', requireAdmin, (req, res) => {
    try { res.json({ ok: true, engagement: store.update(String(req.params.id), req.body || {}) }); }
    catch (e) { res.status(/not found/.test(e.message) ? 404 : 400).json({ ok: false, error: e.message }); }
  });

  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
