'use strict';
// HTTP surface for the gateway. Identity comes from the verified session (injected `auth`), never the body.
// CORS fails closed. The model call is aborted (and its budget hold released) when the client disconnects.
// Mount (later, owner-approved):  app.use('/api/agents', require('./agents/routes').makeRouter({ gateway, auth, resolveAgent, allowedOrigins }))
const express = require('express');

function makeRouter({ gateway, auth, resolveAgent, listAgents, adapterFor, allowedOrigins = [], production = process.env.NODE_ENV === 'production', adminIds = [] }) {
  if (production && (!allowedOrigins || allowedOrigins.length === 0)) throw new Error('ALLOWED_ORIGINS required in production (refusing to start)');
  const r = express.Router();
  r.use(express.json({ limit: '32kb' }));
  r.use((req, res, next) => {                                   // allowlist only; no wildcard fallback
    const o = req.headers.origin;
    if (o && allowedOrigins.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Credentials', 'true'); }
    next();
  });
  r.use(auth);                                                   // must set req.user = { id }
  const need = (req, res, next) => (req.user && req.user.id ? next() : res.status(401).json({ error: 'auth' }));
  r.use(need);

  const sse = (res, ev) => res.write('data: ' + JSON.stringify(ev) + '\n\n');
  const suspended = new Map();   // approvalId -> { userId, agentId, alias, resumeState }  (server-side; never sent to the browser)
  const newRid = () => 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ctxFor = (userId, agent) => ({ userId, agentId: agent.id, requestId: newRid(), grants: new Set(agent.grants || []),
    provider: agent.provider, byok: !!agent.byok, privacy: !!agent.privacy, persona: agent.persona });
  const openSSE = res => res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  async function stream(res, ac, args, meta) {
    try {
      for await (const ev of gateway.run(args)) {
        if (ac.signal.aborted) break;
        if (ev.type === 'approval_required') {
          suspended.set(ev.approvalId, Object.assign({}, meta, { resumeState: ev.resumeState }));
          sse(res, Object.assign({}, ev, { resumeState: undefined }));          // the browser never sees run state
        } else sse(res, ev);
      }
    } catch (_) { sse(res, { type: 'error', code: 'internal' }); }
    res.end();
  }

  r.post('/chat', async (req, res) => {
    const { agentId, message, alias } = req.body || {};      // identity fields in the body are IGNORED by design
    if (typeof agentId !== 'string' || typeof message !== 'string' || !message) return res.status(400).json({ error: 'bad_request' });
    const agent = await resolveAgent(req.user.id, agentId);  // null when the caller may not use that agent
    if (!agent) return res.status(404).json({ error: 'not_found' });
    const ac = new AbortController();
    res.on('close', () => ac.abort());                       // stop spending when the client leaves
    openSSE(res);
    const { adapter, providerCfg } = adapterFor(agent);
    const alias2 = alias && agent.allowedAliases && agent.allowedAliases.includes(alias) ? alias : agent.defaultAlias;
    await stream(res, ac, { ctx: ctxFor(req.user.id, agent), message, adapter, alias: alias2, providerCfg, signal: ac.signal },
      { userId: req.user.id, agentId: agent.id, alias: alias2 });
  });

  // After the OWNER approves, the client asks the server to continue the suspended run (SSE).
  r.post('/approvals/:id/resume', async (req, res) => {
    const s = suspended.get(req.params.id);
    const rec = gateway.approvals.get(req.params.id);
    if (!s || s.userId !== req.user.id || !rec) return res.status(404).json({ error: 'not_found' });
    if (rec.status !== 'approved') return res.status(409).json({ error: 'not_approved', status: rec.status });
    const agent = await resolveAgent(req.user.id, s.agentId);
    if (!agent) return res.status(404).json({ error: 'not_found' });
    suspended.delete(req.params.id);                           // single use
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    openSSE(res);
    const { adapter, providerCfg } = adapterFor(agent);
    await stream(res, ac, { ctx: ctxFor(req.user.id, agent), adapter, alias: s.alias, providerCfg, signal: ac.signal, resume: s.resumeState },
      { userId: req.user.id, agentId: agent.id, alias: s.alias });
  });

  r.get('/roster', async (req, res) => res.json({ agents: listAgents ? await listAgents(req.user.id) : [] }));
  r.get('/approvals', (req, res) => res.json({ pending: gateway.approvals.pendingFor(req.user.id) }));
  r.post('/approvals/:id/decision', (req, res) => {
    const d = req.body && req.body.decision;
    if (d !== 'approve' && d !== 'deny') return res.status(400).json({ error: 'bad_decision' });
    const out = gateway.approvals.decide(req.params.id, req.user.id, d);   // owner only; foreign ids look missing
    gateway.audit.write({ type: 'approval_decision', approvalId: req.params.id, userId: req.user.id, decision: d, ok: out.ok });
    res.status(out.ok ? 200 : 404).json(out);
  });
  r.get('/usage', (req, res) => res.json(gateway.usage.summary(req.user.id)));
  r.post('/kill', async (req, res) => {                            // owners may pause their OWN agents; everything else is admin
    const { level, id, on } = req.body || {};
    const admin = adminIds.includes(req.user.id);
    if (level === 'global' || level === 'provider' || level === 'tool') {
      if (!admin) return res.status(403).json({ error: 'admin_only' });
      gateway.killSwitch.set(level, id, on !== false);
    } else if (level === 'agent') {
      const mine = typeof id === 'string' && (await resolveAgent(req.user.id, id));
      if (!mine && !admin) return res.status(404).json({ error: 'not_found' });   // never reveal or touch another user's agent
      if (on === false && !admin) return res.status(403).json({ error: 'admin_only' });   // resume needs admin (owner can pause only)
      gateway.killSwitch.set('agent', id, on !== false);
    } else return res.status(400).json({ error: 'bad_level' });
    gateway.audit.write({ type: 'kill_switch', level, id, on: on !== false, userId: req.user.id });
    res.json({ ok: true, state: gateway.killSwitch.snapshot() });
  });
  return r;
}
module.exports = { makeRouter };
