'use strict';
// Acceptance tests for the Outside-Bot Bridge (handoff §4.12). Run: node backend/tests/platform-bridge.test.js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createBridge } = require('../platform-bridge');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
const plotsFile = path.join(tmp, 'plots.json');
fs.writeFileSync(plotsFile, JSON.stringify({ plots: {
  'p-free': { id: 'p-free', name: 'Free plot', status: 'available', owner: null, pos: [1, 2] },
  'p-alice': { id: 'p-alice', name: 'Alice plot', status: 'rented', owner: 'alice', pos: [3, 4] },
  'p-bob': { id: 'p-bob', name: 'Bob plot', status: 'rented', owner: 'bob', pos: [5, 6] } } }));
const ops = { a1: { id: 'a1', name: 'Bolt', owner: 'alice', skills: [] }, b1: { id: 'b1', name: 'Zed', owner: 'bob', skills: [] } };
const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(ops, id) ? ops[id] : null) };

(async () => {
  const bridge = createBridge({ file: path.join(tmp, 'bridge.json'), plotsFile, operatives, stepMs: 60, uidOf: (req) => req.headers['x-uid'] || '' });
  const app = express(); app.use('/b', bridge);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/b';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function http(method, p, o) {
    o = o || {}; const headers = { 'content-type': 'application/json' };
    if (o.uid) headers['x-uid'] = o.uid; if (o.bearer) headers.authorization = 'Bearer ' + o.bearer;
    const res = await fetch(base + p, { method, headers, body: o.body ? JSON.stringify(o.body) : undefined });
    let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j };
  }
  let n = 0;
  const rpc = (bearer, method, params) => http('POST', '/mcp', { bearer, body: { jsonrpc: '2.0', id: ++n, method, params } });
  const tool = (bearer, name, args) => rpc(bearer, 'tools/call', { name, arguments: args });
  const out = (r) => r.json.result.structuredContent;
  const mint = async (uid, body) => (await http('POST', '/tokens', { uid, body })).json;

  // owner endpoints need a session
  assert.strictEqual((await http('POST', '/tokens', { body: {} })).status, 401, 'minting needs sign-in');

  // 2. no bearer -> 401; bad bearer -> 401
  assert.strictEqual((await rpc(null, 'tools/list')).status, 401);
  assert.strictEqual((await rpc('shdb_' + 'x'.repeat(40), 'tools/list')).status, 401);

  // scopes that outside bots must never get
  for (const s of ['admin:*', 'treegens:pay', 'sparks_ledger:spend', 'plots:maintain']) {
    assert.strictEqual((await http('POST', '/tokens', { uid: 'alice', body: { scopes: [s] } })).status, 400, s + ' must not be grantable');
  }
  assert.strictEqual((await http('POST', '/tokens', { uid: 'alice', body: { agent_id: 'b1' } })).status, 403, 'cannot bind to someone else\'s agent');

  // default token is read-only
  const ro = await mint('alice', { label: 'readonly' });
  assert.ok(ro.token && ro.token.startsWith('shdb_'));
  assert.ok(!JSON.stringify((await http('GET', '/tokens', { uid: 'alice' })).json).includes(ro.token), 'the secret is never listed again');
  const init = await rpc(ro.token, 'initialize', {}); assert.strictEqual(init.json.result.serverInfo.name, 'shaddai-world-bridge');
  const names = (await rpc(ro.token, 'tools/list')).json.result.tools.map((t) => t.name);
  assert.ok(names.includes('list_plots') && !names.includes('start_workflow') && !names.includes('cancel_run'), 'tools/list shows only granted scopes: ' + names);
  const denied = await tool(ro.token, 'start_workflow', { workflow_id: 'demo.ping', idempotency_key: 'k1' });
  assert.strictEqual(denied.status, 403, 'missing scope -> 403');

  // 1. full run with a runner token
  const run = await mint('alice', { label: 'runner', scopes: ['workflows:read', 'workflows:run', 'runs:read', 'runs:cancel', 'agents:read', 'plots:read'] });
  const wf = out(await tool(run.token, 'list_workflows', {})); assert.ok(wf.items.some((w) => w.workflow_id === 'demo.ping'));
  const s1 = await tool(run.token, 'start_workflow', { workflow_id: 'demo.ping', agent_id: 'a1', idempotency_key: 'job-1' });
  assert.strictEqual(out(s1).status, 'queued');
  const runId = out(s1).run_id;
  await sleep(40);
  assert.strictEqual(out(await tool(run.token, 'read_agent_state', { agent_id: 'a1' })).presence, 'working', 'avatar shows working');
  assert.ok((await http('GET', '/world-state')).json.agents.some((a) => a.agent_id === 'a1' && a.presence === 'working'));
  await sleep(300);
  const done = out(await tool(run.token, 'get_run_status', { run_id: runId }));
  assert.strictEqual(done.status, 'succeeded'); assert.ok(done.receipt && done.receipt.steps.length === 3 && done.receipt.money.class === 'none');
  assert.strictEqual(out(await tool(run.token, 'read_agent_state', { agent_id: 'a1' })).presence, 'celebrating');

  // 3. idempotency
  const again = out(await tool(run.token, 'start_workflow', { workflow_id: 'demo.ping', agent_id: 'a1', idempotency_key: 'job-1' }));
  assert.strictEqual(again.run_id, runId, 'same key + same params -> same run');
  const clash = await tool(run.token, 'start_workflow', { workflow_id: 'demo.ping', agent_id: 'a1', plot_id: 'p-alice', idempotency_key: 'job-1' });
  assert.strictEqual(clash.status, 409, 'same key + different params -> conflict');

  // agent ownership + cross-user isolation (test 8)
  assert.strictEqual((await tool(run.token, 'start_workflow', { workflow_id: 'demo.ping', agent_id: 'b1', idempotency_key: 'steal' })).status, 403, 'cannot run as another user\'s agent');
  assert.strictEqual((await tool(run.token, 'read_agent_state', { agent_id: 'b1' })).status, 404);
  const mine = out(await tool(run.token, 'list_plots', { owner: 'me' })).items.map((p) => p.plot_id); assert.deepStrictEqual(mine, ['p-alice']);
  assert.strictEqual((await tool(run.token, 'get_plot_state', { plot_id: 'p-bob' })).status, 404, 'cannot read another user\'s plot');
  assert.strictEqual(out(await tool(run.token, 'get_plot_state', { plot_id: 'p-free' })).status, 'available');
  const bobTok = await mint('bob', { scopes: ['runs:read', 'runs:cancel'] });
  assert.strictEqual((await tool(bobTok.token, 'get_run_status', { run_id: runId })).status, 404, 'cannot see another user\'s run');

  // 4. secrets never accepted in tool arguments
  for (const args of [{ workflow_id: 'demo.ping', idempotency_key: 's1', params: { apiKey: 'abc' } }, { workflow_id: 'demo.ping', idempotency_key: 's2', params: { note: 'use sk-' + 'a'.repeat(30) } }]) {
    assert.strictEqual((await tool(run.token, 'start_workflow', args)).status, 400, 'secret rejected');
  }
  assert.ok(!JSON.stringify(bridge._test.db.audit).includes(ro.token), 'audit never contains tokens');

  // 5. cancel
  const c1 = out(await tool(run.token, 'start_workflow', { workflow_id: 'demo.ping', agent_id: 'a1', idempotency_key: 'job-2' }));
  const cancelled = out(await tool(run.token, 'cancel_run', { run_id: c1.run_id, reason: 'test' })); assert.strictEqual(cancelled.status, 'cancelled');
  await sleep(150); assert.strictEqual(out(await tool(run.token, 'get_run_status', { run_id: c1.run_id })).status, 'cancelled', 'stays cancelled');

  // 6. money_class != none stops for the OWNER; the bot cannot approve
  const w = out(await tool(run.token, 'start_workflow', { workflow_id: 'demo.needs-approval', agent_id: 'a1', idempotency_key: 'job-3' }));
  await sleep(200);
  const st = out(await tool(run.token, 'get_run_status', { run_id: w.run_id })); assert.strictEqual(st.status, 'awaiting_approval'); assert.strictEqual(st.approvals_pending.length, 1);
  assert.strictEqual((await http('POST', '/runs/' + w.run_id + '/approve', { bearer: run.token })).status, 401, 'a bridge token cannot approve');
  assert.strictEqual((await http('POST', '/runs/' + w.run_id + '/approve', { uid: 'bob' })).status, 404, 'another user cannot approve');
  assert.strictEqual(out(await tool(run.token, 'read_agent_state', { agent_id: 'a1' })).presence, 'awaiting_approval');
  assert.strictEqual((await http('POST', '/runs/' + w.run_id + '/approve', { uid: 'alice' })).status, 200);
  await sleep(300);
  const ap = out(await tool(run.token, 'get_run_status', { run_id: w.run_id })); assert.strictEqual(ap.status, 'succeeded'); assert.strictEqual(ap.receipt.approvals[0].by, 'user:alice');
  const w2 = out(await tool(run.token, 'start_workflow', { workflow_id: 'demo.needs-approval', agent_id: 'a1', idempotency_key: 'job-4' })); await sleep(200);
  assert.strictEqual((await http('POST', '/runs/' + w2.run_id + '/deny', { uid: 'alice' })).status, 200);
  assert.strictEqual(out(await tool(run.token, 'get_run_status', { run_id: w2.run_id })).status, 'failed', 'denied runs fail, they never proceed');

  // 7. revocation takes effect on the next call
  const info = (await http('GET', '/tokens', { uid: 'alice' })).json.tokens.find((t) => t.label === 'runner');
  assert.strictEqual((await http('DELETE', '/tokens/' + info.id, { uid: 'bob' })).status, 404, 'cannot revoke another user\'s token');
  assert.strictEqual((await http('DELETE', '/tokens/' + info.id, { uid: 'alice' })).status, 200);
  assert.strictEqual((await tool(run.token, 'list_workflows', {})).status, 401, 'revoked token fails on the very next call');

  // audit is owner-scoped
  assert.ok((await http('GET', '/audit', { uid: 'alice' })).json.audit.length > 5);
  assert.strictEqual((await http('GET', '/audit', { uid: 'bob' })).json.audit.every((a) => a.owner === 'bob'), true);

  server.close();
  console.log('platform-bridge: all assertions passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
