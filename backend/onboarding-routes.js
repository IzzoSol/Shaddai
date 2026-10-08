// onboarding-routes.js — the goal-first onboarding wizard (spec §2), persisted per user.
//   GET  /api/onboarding/options      static choices (verticals, goals, readiness questions, agent fields)
//   GET  /api/onboarding/me           the CALLER's progress + computed recommendations / next step
//   PUT  /api/onboarding/step/:n      submit step n (1,2,3,5,6,7); steps 4 and 8 are computed
//   POST /api/onboarding/complete     finish (needs the first run)
//   POST /api/onboarding/reset        start over
// Identity is the verified session only (req.userId). No userId in URL or body, and no credentials stored.
// MOUNT: app.use('/api/onboarding', softAuth, require('./onboarding-routes'));
'use strict';
const path = require('path');
const express = require('express');
const ob = require('./lib/onboarding');
const { createOnboardingStore } = require('./lib/onboarding-store');

const KEYS = { 1: 'profile', 2: 'goal', 3: 'readiness', 5: 'agent', 6: 'bridge', 7: 'firstrun' };

function view(state) {
  const out = { ok: true, step: state.step, completed: !!state.completed, state: {}, nextStepId: null };
  for (const k of Object.values(KEYS)) if (state[k]) out.state[k] = state[k];
  if (state.profile && state.goal) {
    out.recommendations = ob.recommend(state.profile.vertical, state.goal.goal, state.readiness);
  }
  if (state.completed) out.next = ob.nextStepCard(state);
  return out;
}

function createRouter(deps) {
  deps = deps || {};
  const store = deps.store || createOnboardingStore(path.join(__dirname, 'data', 'onboarding'));
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));

  router.get('/options', (req, res) => res.json({
    ok: true, verticals: ob.VERTICALS, goals: ob.GOALS,
    readinessQuestions: ob.READINESS_QUESTIONS, agentFields: ob.AGENT_FIELDS,
  }));

  router.use((req, res, next) => {
    if (!req.isAuthenticated || !req.userId || req.userId === 'local') return res.status(401).json({ ok: false, error: 'sign in to continue' });
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/me', (req, res) => res.json(view(store.get(req.userId))));

  router.put('/step/:n', (req, res) => {
    const n = Number(req.params.n);
    if (!KEYS[n]) return res.status(400).json({ ok: false, error: 'step ' + req.params.n + ' is not submitted by the client' });
    const state = store.get(req.userId);
    const missing = [1, 2, 3, 5, 6, 7].filter((s) => s < n && !state[KEYS[s]]);
    if (missing.length) return res.status(409).json({ ok: false, error: 'finish step ' + missing[0] + ' first', needStep: missing[0] });
    const v = ob.validateStep(n, req.body && req.body.data !== undefined ? req.body.data : req.body, state);
    if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
    state[KEYS[n]] = v.value;
    state.step = Math.max(state.step, n === 3 ? 4 : n);
    if (n < 7) state.completed = false;
    res.json(view(store.save(req.userId, state)));
  });

  router.post('/complete', (req, res) => {
    const state = store.get(req.userId);
    if (!state.firstrun) return res.status(409).json({ ok: false, error: 'run your first task before finishing', needStep: 7 });
    state.completed = true; state.step = 8;
    res.json(view(store.save(req.userId, state)));
  });

  router.post('/reset', (req, res) => res.json(view(store.reset(req.userId))));

  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
