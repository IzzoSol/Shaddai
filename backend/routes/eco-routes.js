'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const ECO = path.join(__dirname, '..', '..', 'shaddai-mcp', 'lib');
const ECO_DATA = path.join(__dirname, '..', '..', 'shaddai-mcp', 'data');

const hall = require(path.join(ECO, 'eco-telegram'));
const paybox = require(path.join(ECO, 'eco-paybox'));
const ledger = require(path.join(ECO, 'eco-ledger'));
const scheduler = require(path.join(ECO, 'eco-scheduler'));
const graph = require(path.join(ECO, 'eco-graph'));
const discoveries = require(path.join(ECO, 'eco-discoveries'));
const directory = require(path.join(ECO, 'eco-directory'));
const reputation = require(path.join(ECO, 'eco-reputation'));
const subagents = require(path.join(ECO, 'eco-subagents'));
const bridge = require(path.join(ECO, 'eco-bridge'));
const workflows = require(path.join(ECO, 'eco-workflows'));
const plots = require(path.join(ECO, 'eco-plots'));
const mastery = require(path.join(ECO, 'eco-mastery'));
const quota = require(path.join(ECO, 'eco-quota'));

let wired = false;

function guard(out) {
  if (out && typeof out === 'object' && out.error) return out.error;
  return null;
}

function countFromFile(name) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ECO_DATA, name), 'utf8'));
    if (Array.isArray(raw)) return { items: raw.length };
    if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw).filter((k) => k !== 'next_id' && k !== 'next_plot_id');
      const sub = raw[keys[0]];
      return { items: Array.isArray(sub) ? sub.length : keys.length };
    }
    return { items: 0 };
  } catch (_) {
    return null;
  }
}

function graphCounts() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ECO_DATA, 'eco-graph.json'), 'utf8'));
    return { entities: Object.keys(raw.entities || {}).length, edges: (raw.edges || []).length };
  } catch (_) {
    return { entities: 0, edges: 0 };
  }
}

function ok(res, data) {
  if (typeof data === 'string' || data === null || data === undefined) return res.json({ ok: true, detail: data });
  return res.json(Object.assign({ ok: true }, data));
}
function fail(res, e, status) {
  const msg = (e && e.message) || String(e || 'unknown error');
  return res.status(status || 400).json({ ok: false, error: msg });
}
function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      fail(res, e);
    }
  };
}
function bodyOf(req) { return req.body || {}; }

const MAX_CALL_USDC = 2500;
const MAX_PLOT_USDC = 5000;
const MAX_RENT_USDC = 250;
const AUDIT_FILE = path.join(__dirname, '..', 'data', 'eco-audit.log');

function audit(req, action, detail) {
  try {
    const line = new Date().toISOString() + ' ' + action + ' ' + (req.method || '') + ' ' + (req.originalUrl || req.url || '') + ' user=' + (req.userId || '?') + ' ' + JSON.stringify(detail || {}).slice(0, 400) + '\n';
    fs.appendFileSync(AUDIT_FILE, line);
  } catch (_) {}
}

function owned(req, owner) {
  if (req.userId && req.userId !== 'local' && owner && String(owner) !== String(req.userId)) {
    return 'caller may only act as their own identity';
  }
  return null;
}

function saneHttpsUrl(raw) {
  const u = String(raw || '');
  if (!/^https:\/\//i.test(u)) return 'url must be https';
  let host = null;
  try { host = new URL(u).hostname; } catch (_) { return 'url invalid'; }
  const h = String(host).toLowerCase().replace(/\[|\]/g, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return 'url host must be public (no loopback)';
  if (/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return 'url host must be public (no private ranges)';
  return null;
}

async function wiredPrice(symbol) {
  const map = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin', BONK: 'bonk', WIF: 'dogwifcoin', JUP: 'jupiter-exchange-solana', PYTH: 'pyth-network', ONDO: 'ondo-finance' };
  const id = map[String(symbol || '').toUpperCase()] || String(symbol || '').toLowerCase();
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(id) + '&vs_currencies=usd&include_24hr_change=true', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j && j[id];
    if (!p || !p.usd) return null;
    return { symbol: String(symbol || '').toUpperCase(), name: id, price: p.usd, change24h: Math.round((p.usd_24h_change || 0) * 100) / 100 };
  } catch (_) {
    return null;
  }
}

function workflowRunner(tool, args) {
  const t = String(tool || '');
  const callers = {
    directory_register: (a) => directory.register(a),
    directory_search: (a) => directory.search(a && a.q),
    directory_list: () => directory.listAll(),
    graph_context: (a) => { const n = graph.neighborhood(a && a.target, Number(a && a.depth) || 2); return { entities: n }; },
    graph_neighbors: (a) => graph.neighborhood(a && a.id, Number(a && a.depth) || 2),
    discovery_log: (a) => discoveries.logDiscovery(a),
    discovery_context: (a) => discoveries.contextual(a && a.target),
    ledger_summary: () => ledger.summary(),
    ledger_owed: () => ledger.owed(),
    paybox_quote: (a) => ({ price_usdc: paybox.quote(a && a.tool) }),
    paybox_intent: (a) => paybox.createIntent(a && a.tool, a && a.user_id),
    reputation_derive: (a) => reputation.derive(a && a.instance_id),
    quota_status: (a) => ({ free_tier_daily_calls: quota.FREE_TIER_DAILY_CALLS, usage_today: quota.usageToday(a && a.user_id) }),
    scheduler_list: () => scheduler.list(),
    subagent_stats: (a) => subagents.stats(a && a.parent_id),
    plot_list: (a) => plots.list(a && a.district_id),
    bridge_call: (a) => bridge.callAgent(a && a.agent_id, a && a.tool, (a && a.params) || {}),
    workflow_create: (a) => workflows.create(a),
    mastery_list: (a) => mastery.list(a && a.instance_id),
    tele_post: (a) => hall.post(a && a.text, a && a.chat_id),
  };
  if (callers[t]) return Promise.resolve(callers[t](args || {}));
  return Promise.resolve({ error: 'workflow step not available over REST: ' + t + ' — bind it in the MCP runner or a later phase' });
}

function wire() {
  if (wired) return;
  wired = true;
  workflows.setRunner(workflowRunner);

  scheduler.register('zerox.watch', async (data) => {
    const p = await wiredPrice(data.symbol || 'BTC');
    if (!p) return 'watched ' + (data.symbol || 'BTC') + ' - no price yet';
    const line = p.name + ' ' + p.price + ' (' + p.change24h + '%)';
    const gate = data.threshold ? Number(data.threshold) : null;
    if (gate && p.price >= gate) {
      discoveries.logDiscovery({ agent_id: data.agent_id || 'zerox.watch', type: 'alpha', target: data.symbol || 'BTC', reason: 'price ' + p.price + ' crossed threshold ' + gate, confidence: 0.5, notes: p.name });
      return 'TRIGGERED ' + line + ' - discovery logged, rep credited to ' + (data.agent_id || 'owner');
    }
    return 'watched: ' + line;
  });

  scheduler.register('hall.announce', async (data) => {
    const r = await hall.post(data.text, data.chat_id);
    return r.ok ? 'announced to hall - msg ' + r.message_id : 'announce skipped: ' + r.error;
  });

  scheduler.register('collect_rent', async () => {
    const a = plots.accrueRent();
    return 'rent collected: ' + a.collected_usdc.toFixed(2) + ' USDC across ' + a.owned + ' owned plots';
  });

  ['oracle.weekly', 'pikadon.recheck', 'sub_agent_work'].forEach((t) => {
    scheduler.register(t, async (data) => {
      if (t === 'sub_agent_work') return 'sub_agent_work: ' + subagents.stats(data.parent_id || '').queued + ' queued tasks for parent ' + (data.parent_id || '(none)') + ' - auto-run not yet bound';
      return t + ' pipeline queued - bind integrations in Phase 2.5';
    });
  });

  if (process.env.ECO_OWN_SCHEDULER !== 'false') {
    scheduler.start(3000);
  } else {
    console.log('[eco-routes] scheduler loop disabled for this process (ECO_OWN_SCHEDULER=false)');
  }
}

function status(probes) {
  const out = { ok: true, modules: {} };
  for (const [name, probe] of Object.entries(probes)) {
    try {
      const p = typeof probe === 'function' ? probe() : probe;
      out.modules[name] = { ok: true, detail: p };
    } catch (e) {
      out.modules[name] = { ok: false, error: (e && e.message) || String(e) };
      out.ok = false;
    }
  }
  return out;
}

function buildRouter() {
  wire();
  const r = express.Router();
  const { softAuth } = require(path.join(__dirname, '..', 'auth-guard'));

  r.get('/api/eco/health', (req, res) => {
    ok(res, status({
      hall: { ready: hall.ready() || 'ok', binds: countFromFile('eco-telegram.json') },
      paybox: { tools_priced: Object.keys(paybox.PRICES_USDC).length, intents: countFromFile('eco-intents.json'), merchant_configured: !!process.env.VIRTUALS_SOL_WALLET },
      ledger: ledger.summary(),
      scheduler: { jobs: scheduler.list().length, running: true },
      directory: { instances_live: directory.listAll().length },
      graph: graphCounts(),
      discoveries: countFromFile('eco-discoveries.json') || 'empty',
      subagents: countFromFile('eco-subagents.json') || 'empty',
      bridge: { agents: bridge.listAll().length },
      plots: plots.list().length ? { plots: plots.list().length } : { plots: 0 },
      mastery: { packs: mastery.list().length },
      workflows: { workflows: workflows.list().length },
      quota: { free_tier_daily_calls: quota.FREE_TIER_DAILY_CALLS },
    }));
  });

  r.get('/api/hall/status', (req, res) => { ok(res, { ready: hall.ready() || 'ok', hall_chat: hall.HALL || null, binds: countFromFile('eco-telegram.json') }); });
  r.get('/api/hall/chat/:userId', (req, res) => { ok(res, { userId: req.params.userId, chatId: hall.chatFor(req.params.userId) }); });
  r.post('/api/hall/bind', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    const userId = b.userId || req.userId;
    if (!b.chatId) return fail(res, new Error('chatId required'));
    const errOwn = owned(req, userId);
    if (errOwn) return fail(res, new Error(errOwn), 403);
    ok(res, { binding: hall.bind(userId, b.chatId), userId });
  }));
  r.post('/api/hall/post', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.text) return fail(res, new Error('text required'));
    ok(res, await hall.post(b.text, b.chatId));
  }));

  r.get('/api/eco/paybox/status', (req, res) => { ok(res, { prices: paybox.PRICES_USDC, merchant: !!process.env.VIRTUALS_SOL_WALLET, intents: countFromFile('eco-intents.json') }); });
  r.get('/api/eco/paybox/quote/:tool', (req, res) => { ok(res, { tool: req.params.tool, price_usdc: paybox.quote(req.params.tool) }); });
  r.post('/api/eco/paybox/quote', (req, res) => { const b = bodyOf(req); ok(res, { tool: b.tool, price_usdc: paybox.quote(b.tool) }); });
  r.post('/api/eco/paybox/create-intent', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.tool) return fail(res, new Error('tool required'));
    if (isFinite(Number(b.amount_usdc)) && Number(b.amount_usdc) > MAX_CALL_USDC) return fail(res, new Error('amount exceeds per-call cap ' + MAX_CALL_USDC), 400);
    const out = paybox.createIntent(b.tool, b.userId || req.userId, b.amount_usdc);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'paybox.create-intent', { tool: b.tool, userId: b.userId || req.userId });
    ok(res, out);
  }));
  r.post('/api/eco/paybox/confirm', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.intentId || !b.tx) return fail(res, new Error('intentId and tx required'));
    const out = await paybox.confirm(b.intentId, b.tx, ledger);
    if (guard(out)) return fail(res, new Error(guard(out)));
    if (out && out.ok === false) return fail(res, new Error(out.reason || 'payment not verified'), 402);
    audit(req, 'paybox.confirm', { intentId: b.intentId, tx: String(b.tx).slice(0, 12) });
    ok(res, out);
  }));
  r.get('/api/eco/paybox/intent/:id', (req, res) => { const i = paybox.getIntent(req.params.id); if (!i) return fail(res, new Error('intent not found'), 404); ok(res, { intent: i }); });

  r.get('/api/eco/ledger/status', (req, res) => { ok(res, ledger.summary()); });
  r.get('/api/eco/ledger/summary', (req, res) => { ok(res, ledger.summary()); });
  r.get('/api/eco/ledger/owed', (req, res) => { ok(res, { owed: ledger.owed() }); });
  r.post('/api/eco/ledger/receipt', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (isFinite(Number(b.amount_usdc)) && Number(b.amount_usdc) > MAX_CALL_USDC) return fail(res, new Error('amount exceeds per-call cap ' + MAX_CALL_USDC), 400);
    const errOwn = owned(req, b.caller);
    if (errOwn) return fail(res, new Error(errOwn), 403);
    const out = ledger.logReceipt(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'ledger.receipt', { caller: b.caller, instance_id: b.instance_id, amount: b.amount_usdc });
    ok(res, { receipt: out });
  }));
  r.post('/api/eco/ledger/pay', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.instance_id || !b.amount_usdc) return fail(res, new Error('instance_id and amount_usdc required'));
    const out = ledger.pay(b.instance_id, b.amount_usdc, b.tx_signature);
    audit(req, 'ledger.pay', { instance_id: b.instance_id, amount: b.amount_usdc });
    ok(res, { payout: out });
  }));

  r.get('/api/scheduler/status', (req, res) => { ok(res, { running: true, jobs: scheduler.list().length }); });
  r.get('/api/scheduler/jobs', (req, res) => { ok(res, { jobs: scheduler.list(req.query.type) }); });
  r.post('/api/scheduler/add', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    const out = scheduler.add(b);
    if (out.error) return fail(res, new Error(out.error));
    audit(req, 'scheduler.add', { type: b.type, every_ms: b.every_ms });
    ok(res, { job: out });
  }));
  r.post('/api/scheduler/remove', wrap(async (req, res) => { const b = bodyOf(req); ok(res, scheduler.remove(b.jobId)); }));
  r.post('/api/scheduler/enable', wrap(async (req, res) => {
    const b = bodyOf(req);
    const out = scheduler.setEnabled(b.jobId, b.enabled);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, { job: out });
  }));
  r.post('/api/scheduler/tick', wrap(async (req, res) => { ok(res, { ran: await scheduler.tick() }); }));

  r.get('/api/eco/graph/status', (req, res) => { ok(res, countFromFile('eco-graph.json') || 'empty'); });
  r.post('/api/eco/graph/entity', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.id) return fail(res, new Error('id required'));
    ok(res, { entity: graph.upsertEntity(b.id, b.data || {}) });
  }));
  r.post('/api/eco/graph/edge', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.from || !b.relation || !b.to) return fail(res, new Error('from, relation, to required'));
    ok(res, { edge: graph.addEdge(b.from, b.relation, b.to) });
  }));
  r.get('/api/eco/graph/outgoing/:id', (req, res) => { ok(res, { edges: graph.outgoing(req.params.id) }); });
  r.get('/api/eco/graph/incoming/:id', (req, res) => { ok(res, { edges: graph.incoming(req.params.id) }); });
  r.get('/api/eco/graph/neighbors/:id', (req, res) => { ok(res, { neighborhood: graph.neighborhood(req.params.id, Number(req.query.depth) || 2) }); });

  r.get('/api/eco/discoveries/status', (req, res) => { ok(res, countFromFile('eco-discoveries.json') || 'empty'); });
  r.post('/api/eco/discoveries/log', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.type || !b.reason) return fail(res, new Error('type and reason required'));
    const out = discoveries.logDiscovery(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, { discovery: out });
  }));
  r.post('/api/eco/discoveries/cite', wrap(async (req, res) => { const b = bodyOf(req); ok(res, { cited: discoveries.cite(b.discoveryId, b.citingAgentId) }); }));
  r.get('/api/eco/discoveries/contextual/:target', (req, res) => { ok(res, { discoveries: discoveries.contextual(req.params.target) }); });
  r.get('/api/eco/discoveries/all', (req, res) => { ok(res, { discoveries: discoveries.all(req.query.type) }); });
  r.get('/api/eco/discoveries/by-agent/:agentId', (req, res) => { ok(res, { discoveries: discoveries.byAgent(req.params.agentId) }); });

  r.get('/api/directory/status', (req, res) => { ok(res, { instances_live: directory.listAll().length }); });
  r.get('/api/directory', (req, res) => { ok(res, { instances: req.query.q ? directory.search(req.query.q) : directory.listAll() }); });
  r.get('/api/directory/search', (req, res) => { ok(res, { instances: directory.search(req.query.q || '') }); });
  r.get('/api/directory/template/:id', (req, res) => { ok(res, { instances: directory.byTemplate(req.params.id) }); });
  r.post('/api/directory/register', softAuth, wrap(async (req, res) => {
    const out = directory.register(bodyOf(req));
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, { instance: out });
  }));
  r.post('/api/directory/unregister', wrap(async (req, res) => { const b = bodyOf(req); ok(res, directory.unregister(b.id)); }));
  r.post('/api/directory/bump-calls', wrap(async (req, res) => { const b = bodyOf(req); ok(res, { bumped: directory.bumpCalls(b.id) }); }));

  r.get('/api/eco/reputation/status', (req, res) => { ok(res, { tiers: ['Novice', 'Journeyman', 'Expert', 'Master'] }); });
  r.get('/api/eco/reputation/:instanceId', (req, res) => { ok(res, reputation.derive(req.params.instanceId)); });

  r.get('/api/eco/subagents/status', (req, res) => { ok(res, { roles: subagents.ROLES }); });
  r.post('/api/eco/subagents/spawn', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.parent_id) b.parent_id = req.userId;
    const errOwn = owned(req, b.parent_id);
    if (errOwn) return fail(res, new Error(errOwn), 403);
    const out = subagents.spawnSubAgent(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'subagents.spawn', { parent_id: b.parent_id, role: b.role });
    ok(res, { sub: out });
  }));
  r.post('/api/eco/subagents/delegate', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.sub_id || !b.tasks) return fail(res, new Error('sub_id and tasks required'));
    const out = subagents.delegate(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, out);
  }));
  r.post('/api/eco/subagents/complete', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.work_id) return fail(res, new Error('work_id required'));
    const out = subagents.complete(b.work_id, b.results || {});
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, out);
  }));
  r.get('/api/eco/subagents/queue/:parentId', (req, res) => { ok(res, { work: subagents.queue(req.params.parentId) }); });
  r.get('/api/eco/subagents/by-sub/:subId', (req, res) => { ok(res, { work: subagents.bySub(req.params.subId) }); });
  r.get('/api/eco/subagents/of-parent/:parentId', (req, res) => { ok(res, { subs: subagents.ofParent(req.params.parentId) }); });
  r.get('/api/eco/subagents/stats/:parentId', (req, res) => { ok(res, subagents.stats(req.params.parentId)); });

  r.get('/api/eco/bridge/status', (req, res) => { ok(res, { agents: bridge.listAll().length, split: bridge.SPLIT }); });
  r.post('/api/eco/bridge/register', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    const urlErr = saneHttpsUrl(b.url);
    if (urlErr) return fail(res, new Error(urlErr), 400);
    const out = bridge.register(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'bridge.register', { id: b.id, url: b.url });
    ok(res, { agent: out });
  }));
  r.post('/api/eco/bridge/call', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.agentId || !b.tool) return fail(res, new Error('agentId and tool required'));
    const out = await bridge.callAgent(b.agentId, b.tool, b.params || {});
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, out);
  }));
  r.get('/api/eco/bridge', (req, res) => { ok(res, { agents: bridge.listAll() }); });
  r.get('/api/eco/bridge/:id', (req, res) => { const a = bridge.get(req.params.id); if (!a) return fail(res, new Error('bridge agent not found'), 404); ok(res, { agent: a }); });

  r.get('/api/eco/workflows/status', (req, res) => { ok(res, { workflows: workflows.list().length }); });
  r.post('/api/eco/workflows/create', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.name || !b.steps) return fail(res, new Error('name and steps required'));
    const out = workflows.create(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, { workflow: out });
  }));
  r.post('/api/eco/workflows/publish', wrap(async (req, res) => { const b = bodyOf(req); ok(res, { workflow: workflows.publish(b.id) }); }));
  r.get('/api/eco/workflows', (req, res) => { ok(res, { workflows: workflows.list() }); });
  r.get('/api/eco/workflows/:id', (req, res) => { const w = workflows.get(req.params.id); if (!w) return fail(res, new Error('workflow not found'), 404); ok(res, { workflow: w }); });
  r.post('/api/eco/workflows/run', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.id) return fail(res, new Error('id required'));
    ok(res, { run: await workflows.run(b.id, b.context || {}) });
  }));

  r.get('/api/eco/plots/status', (req, res) => {
    const all = plots.list();
    ok(res, { districts: plots.DISTRICTS, plots_total: all.length, plots_owned: all.filter((p) => p.owner).length });
  });
  r.get('/api/eco/plots', (req, res) => { ok(res, { plots: req.query.district ? plots.list(req.query.district) : plots.list() }); });
  r.post('/api/eco/plots/create', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.districtId || !b.name) return fail(res, new Error('districtId and name required'));
    const opts = b.opts || {};
    if (isFinite(Number(opts.price_usdc)) && Number(opts.price_usdc) > MAX_PLOT_USDC) return fail(res, new Error('plot price exceeds cap ' + MAX_PLOT_USDC), 400);
    if (isFinite(Number(opts.rent_usdc)) && Number(opts.rent_usdc) > MAX_RENT_USDC) return fail(res, new Error('plot rent exceeds cap ' + MAX_RENT_USDC), 400);
    const out = plots.createPlot(b.districtId, b.name, opts);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'plots.create', { district: b.districtId, name: b.name });
    ok(res, { plot: out });
  }));
  r.post('/api/eco/plots/buy', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.plotId) return fail(res, new Error('plotId required'));
    const errOwn = owned(req, b.owner);
    if (errOwn) return fail(res, new Error(errOwn), 403);
    const out = plots.buy(b.plotId, b.owner || req.userId, b.tx);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'plots.buy', { plotId: b.plotId, owner: b.owner || req.userId });
    ok(res, { plot: out });
  }));
  r.post('/api/eco/plots/rent', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.plotId || !b.instanceId) return fail(res, new Error('plotId and instanceId required'));
    const out = plots.rent(b.plotId, b.instanceId);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, { tenant: out });
  }));
  r.post('/api/eco/plots/visit', wrap(async (req, res) => {
    const b = bodyOf(req);
    const out = plots.visit(b.plotId);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, out);
  }));
  r.post('/api/eco/plots/accrue-rent', wrap(async (req, res) => { ok(res, plots.accrueRent()); }));

  r.get('/api/eco/mastery/status', (req, res) => { ok(res, { packs: mastery.list().length, royalty_pct: 75 }); });
  r.post('/api/eco/mastery/create', softAuth, wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.instance_id || !b.name || !b.price_usdc) return fail(res, new Error('instance_id, name, price_usdc required'));
    if (isFinite(Number(b.price_usdc)) && Number(b.price_usdc) > MAX_CALL_USDC) return fail(res, new Error('price exceeds cap ' + MAX_CALL_USDC), 400);
    const out = mastery.create(b);
    if (guard(out)) return fail(res, new Error(guard(out)));
    audit(req, 'mastery.create', { instance_id: b.instance_id, name: b.name });
    ok(res, { pack: out });
  }));
  r.post('/api/eco/mastery/buy', wrap(async (req, res) => {
    const b = bodyOf(req);
    if (!b.packId || !b.targetInstanceId) return fail(res, new Error('packId and targetInstanceId required'));
    const out = mastery.buy(b.packId, b.targetInstanceId);
    if (guard(out)) return fail(res, new Error(guard(out)));
    ok(res, out);
  }));
  r.get('/api/eco/mastery', (req, res) => { ok(res, { packs: mastery.list(req.query.instanceId) }); });
  r.get('/api/eco/mastery/:id', (req, res) => { const p = mastery.get(req.params.id); if (!p) return fail(res, new Error('pack not found'), 404); ok(res, { pack: p }); });

  r.get('/api/eco/quota/status/:userId', (req, res) => {
    const daily = quota.FREE_TIER_DAILY_CALLS;
    const used = quota.usageToday(req.params.userId);
    ok(res, { userId: req.params.userId, free_tier_daily_calls: daily, usage_today: used, remaining: Math.max(0, daily - used), has_free_calls: used < daily });
  });
  r.post('/api/eco/quota/consume', wrap(async (req, res) => { const b = bodyOf(req); ok(res, { consumed: quota.consume(b.userId || 'anonymous') }); }));

  return r;
}

module.exports = { router: buildRouter, buildRouter, status, wire, workflowRunner };