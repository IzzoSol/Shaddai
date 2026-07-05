// hire-routes.js — walk-in agent hiring (multi-day plan §1.4).
//   Pay a deposit (base fee) upfront → agent runs the task → final cost settled at poll,
//   the difference refunded. Routes through the existing x402 ledger + agent engine.
//   GET  /api/hire/rates            — per-agent rate card
//   POST /api/hire/:agent {user,task} — charge deposit, start the task
//   GET  /api/hire/task/:id         — poll; settles + refunds when complete
const express = require('express');
const router = express.Router();
const json = express.json();
let ae = null; try { ae = require('./agent-engine'); } catch (e) {}
let neo = null; try { neo = require('./lib/neocortex'); } catch (e) {}

const BASE = () => process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + (process.env.PORT || 8099));
const RATES = {
  SHADDAI: { base: 10, perToken: 0.002 }, ORACLE: { base: 8, perToken: 0.003 },
  NEXUS: { base: 6, perToken: 0.001 }, ZEROX: { base: 12, perToken: 0.002 },
  QUILL: { base: 5, perToken: 0.001 }, TURTLE: { base: 4, perToken: 0.001 },
  PIKADON: { base: 15, perToken: 0.004 },
};
const settled = new Map();   // taskId -> true  (refund happens once)

const post = (path, body) => fetch(BASE() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

router.get('/api/hire/rates', (req, res) => res.json({ ok: true, currency: 'SHAD-Credits', rates: RATES }));

router.post('/api/hire/:agent', json, async (req, res) => {
  const agent = String(req.params.agent || '').toUpperCase();
  const rate = RATES[agent];
  if (!rate) return res.status(400).json({ ok: false, error: 'unknown agent (one of: ' + Object.keys(RATES).join(', ') + ')' });
  const { user = 'guest', task } = req.body || {};
  if (!task) return res.status(400).json({ ok: false, error: 'task required' });
  // 1) charge the deposit (base fee) up front
  const pay = await post('/api/x402/charge', { user, amount: rate.base, reason: 'hire ' + agent, payee: agent });
  if (pay.status === 402) return res.status(402).json({ ok: false, error: 'INSUFFICIENT_CREDITS', x402: pay.data.x402 });
  if (!pay.data.ok) return res.status(502).json({ ok: false, error: 'deposit charge failed' });
  // 2) start the task on the agent engine
  if (!ae || !ae.createTask) return res.status(503).json({ ok: false, error: 'agent engine unavailable' });
  const t = ae.createTask(String(task), agent, {});
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
      if (t.user || true) { try { await post('/api/x402/grant', { user: req.query.user || 'guest', amount: refunded }); } catch (e) {} }
    }
    settled.set(t.id, true);
  }
  res.json({ ok: true, task: { id: t.id, agent, status: t.status, result: t.result, finalCost, refunded } });
});

module.exports = router;
