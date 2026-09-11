// hire-routes.js — walk-in agent hiring (multi-day plan §1.4).
//   Pay a deposit (base fee) upfront → agent runs the task → final cost settled at poll,
//   the difference refunded. Routes through the existing x402 ledger + agent engine.
//   GET  /api/hire/rates            — per-agent rate card
//   POST /api/hire/:agent {user,task} — charge deposit, start the task
//   GET  /api/hire/task/:id         — poll; settles + refunds when complete
const express = require('express');
const router = express.Router();
const json = express.json();
const { softAuth } = require('./auth-guard');
let ae = null; try { ae = require('./agent-engine'); } catch (e) {}
let neo = null; try { neo = require('./lib/neocortex'); } catch (e) {}
// SECURITY/CORRECTNESS (2026-09-11): this used to settle via an internal HTTP
// self-call to POST /api/x402/charge (and /grant for refunds). That call
// never forwarded the caller's session, so x402-routes.js's own softAuth saw
// every such request as anonymous and silently charged the shared 'local'
// account regardless of which user's body.user was sent -- meanwhile
// body.user was ALSO trusted with no verification of its own, so nothing
// here ever reliably charged (or protected) the right account. Both fixed by
// calling the ledger directly, in-process, with the caller's real identity.
let x402 = null; try { x402 = require('./x402-routes'); } catch (e) {}

const RATES = {
  SHADDAI: { base: 10, perToken: 0.002 }, ORACLE: { base: 8, perToken: 0.003 },
  NEXUS: { base: 6, perToken: 0.001 }, ZEROX: { base: 12, perToken: 0.002 },
  QUILL: { base: 5, perToken: 0.001 }, TURTLE: { base: 4, perToken: 0.001 },
  PIKADON: { base: 15, perToken: 0.004 },
};
const settled = new Map();   // taskId -> true  (refund happens once)

router.get('/api/hire/rates', (req, res) => res.json({ ok: true, currency: 'SHAD-Credits', rates: RATES }));

router.post('/api/hire/:agent', softAuth, json, async (req, res) => {
  const agent = String(req.params.agent || '').toUpperCase();
  const rate = RATES[agent];
  if (!rate) return res.status(400).json({ ok: false, error: 'unknown agent (one of: ' + Object.keys(RATES).join(', ') + ')' });
  // Identity comes from the verified session (req.userId, set by softAuth) —
  // never a caller-supplied body field, matching every other charge in this
  // codebase. Falls back to body.user only when genuinely anonymous.
  const user = req.userId ? String(req.userId) : String((req.body && req.body.user) || 'guest');
  const { task } = req.body || {};
  if (!task) return res.status(400).json({ ok: false, error: 'task required' });
  if (!x402 || !x402.chargeCredits) return res.status(503).json({ ok: false, error: 'ledger unavailable' });
  // 1) charge the deposit (base fee) up front
  const pay = await x402.chargeCredits({ user, amount: rate.base, reason: 'hire ' + agent, payee: agent });
  if (pay.status === 402) return res.status(402).json({ ok: false, error: 'INSUFFICIENT_CREDITS', x402: pay.body.x402 });
  if (!pay.body.ok) return res.status(502).json({ ok: false, error: 'deposit charge failed' });
  // 2) start the task on the agent engine. Stash the paying user on the task's
  // own options so the poll endpoint below can refund the RIGHT account later —
  // it used to trust req.query.user at poll time (spoofable, and never even
  // the same request as the original hire) instead of remembering who paid.
  if (!ae || !ae.createTask) return res.status(503).json({ ok: false, error: 'agent engine unavailable' });
  const t = ae.createTask(String(task), agent, { hireUser: user });
  ae.runAgentLoop(t.id).catch(() => {});
  // Neocortex: hiring this agent grows your bond + logs the request to its memory of you
  try { if (neo) { neo.incrementBond(agent, user, 'task_complete'); neo.addMemory(agent, user, { role: 'user', content: String(task).slice(0, 200), tags: ['hire'] }); } } catch (e) {}
  res.json({ ok: true, taskId: t.id, agent, deposit: rate.base, status: 'running', poll: '/api/hire/task/' + t.id });
});

router.get('/api/hire/task/:id', async (req, res) => {
  if (!ae || !ae.getTask) return res.status(503).json({ ok: false, error: 'agent engine unavailable' });
  const t = ae.getTask(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'task not found' });
  const agent = String(t.agentName || t.agent || 'SHADDAI').toUpperCase();
  const rate = RATES[agent] || RATES.SHADDAI;
  let finalCost = rate.base, refunded = 0;
  const done = t.status === 'completed' || t.status === 'failed';
  if (done && !settled.has(t.id)) {
    const resultText = typeof t.result === 'string' ? t.result : JSON.stringify(t.result || '');
    const tokensUsed = t.tokensUsed || Math.round((resultText.length || 0) / 4);
    finalCost = Math.round((rate.base + tokensUsed * rate.perToken) * 100) / 100;
    if (finalCost < rate.base) { // shouldn't happen (base is floor), but honor the refund contract
      refunded = Math.round((rate.base - finalCost) * 100) / 100;
      // Refund the user who actually PAID (stashed on the task at hire time),
      // never req.query.user -- that was spoofable and, worse, was read from
      // the POLL request, not the original hire, so it was rarely even the
      // right person to begin with.
      const hireUser = (t.options && t.options.hireUser) || 'guest';
      if (x402 && x402.grantCredits) { try { x402.grantCredits({ user: hireUser, amount: refunded, reason: 'hire refund: ' + agent }); } catch (e) {} }
    }
    settled.set(t.id, true);
  }
  res.json({ ok: true, task: { id: t.id, agent, status: t.status, result: t.result, finalCost, refunded } });
});

module.exports = router;
