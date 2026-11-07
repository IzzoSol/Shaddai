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
const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(ops, id) ? ops[id] : null), listByOwner: (o) => Object.values(ops).filter((x) => x.owner === o) };

(async () => {
  const calls = []; let lastAskExtra = null;
  const tools = {
    fetch_price: { description: 'price', schema: { symbol: 'string' }, execute: async ({ symbol }) => { calls.push('fetch_price:' + symbol); await new Promise((r) => setTimeout(r, 450)); return { symbol, usd: 100 }; } },
    get_fear_greed: { description: 'fg', execute: async () => ({ value: 55 }) },
    get_trending: { description: 'tr', execute: async () => ['a', 'b'] },
    search_web: { description: 'web', execute: async ({ query }) => 'results for ' + query + ' key sk-' + 'z'.repeat(30) },
    wikipedia_search: { description: 'wiki', execute: async () => { throw new Error('wiki down'); } },
    get_moon_phase: { description: 'moon', execute: async () => { calls.push('moon'); return { phase: 'waxing crescent' }; } },
    execute_trade: { description: 'NEVER', execute: async () => { calls.push('TRADE!'); return 'traded'; } },
    write_file: { description: 'NEVER', execute: async () => { calls.push('WRITE!'); return 'wrote'; } }
  };
  const recipes = { 'price-check': { agent: 'ZEROX', description: 'price and mood', params: ['symbol'], steps: [{ tool: 'fetch_price', params: { symbol: '{{input.symbol||bitcoin}}' } }, { tool: 'get_fear_greed', params: {} }] }, 'bad-skill': { agent: 'NEXUS', description: 'runs code', params: [], steps: [{ tool: 'run_js', params: {} }] } };
  const skills = { getRecipe: (id) => recipes[id], listRecipes: () => Object.keys(recipes).map((id) => ({ id, agent: recipes[id].agent, description: recipes[id].description, params: recipes[id].params })), interpolate: (t, input) => (typeof t === 'string' ? t.replace(/\{\{input\.(\w+)(?:\|\|(\w+))?\}\}/g, (_, k, d) => ((input && input[k]) || d || '')) : t) };
  const academy = { classes: { join: ({ classId, agentId }) => (classId === 'cls_full' ? { ok: false, error: 'class is full' } : classId === 'cls_open' ? { ok: true, member: { agentId } } : { ok: false, error: 'unknown class' }) } };
  const internal = { agents: async () => [{ agent_id: 'a1' }], plots: async () => [], balance: async () => ({ sparks: 42 }), classes: async () => [] };
  const bridge = createBridge({ file: path.join(tmp, 'bridge.json'), plotsFile, operatives, tools, internal, skills, academy, library: [
    { id: 'research-brief', name: 'research-brief', description: 'Research a topic', requires: [], steps: [{ tool: 'rag_search', args: { query: '{{context.q}}' } }, { tool: 'shaddai_run_agent', args: { agent: 'ORACLE', task: 'Summarize: {{step_1.output}}' } }, { tool: 'web_search', args: { query: '{{context.q}}' } }] },
    { id: 'price-pulse', name: 'price-pulse', description: 'Price and mood', requires: [], steps: [{ tool: 'zerox_price', args: { symbol: '{{context.coin}}' } }, { tool: 'zerox_sentiment', args: {} }] },
    { id: 'multi-price', name: 'multi-price', description: 'Several tickers', requires: [], steps: [{ tool: 'zerox_price', args: { symbols: 'BTC,ETH,SOL' } }] },
    { id: 'no-symbol', name: 'no-symbol', description: 'forgot the symbol', requires: [], steps: [{ tool: 'zerox_price', args: {} }] },
    { id: 'calc-pack', name: 'calc-pack', description: 'Business math', requires: [], steps: [{ tool: 'roi', args: { gain: 120, cost: 100 } }, { tool: 'profit_margin', args: { revenue: 1000, cost: 100 } }, { tool: 'ltv_cac', args: { ltv: 600, cac: 200 } }, { tool: 'turtle_palette', args: { mood: 'sacred', count: 5 } }, { tool: 'hall_moon', args: {} }, { tool: 'csv_stats', args: { csv: 'a,b\n1,2\n3,4', column: 'a' } }, { tool: 'json_format', args: { json: '{"a":1}' } }] },
    { id: 'bad-math', name: 'bad-math', description: 'division by zero', requires: [], steps: [{ tool: 'roi', args: { gain: 5, cost: 0 } }] },
    { id: 'arena-game', name: 'arena-game', description: 'Needs a game tool', requires: [], steps: [{ tool: 'hall_arena', args: {} }] },
    { id: 'admin-thing', name: 'admin-thing', description: 'Admin-ish', requires: [], steps: [{ tool: 'shaddai_create_agent', args: {} }] }
  ], asksPerHour: 3, ragSearch: (id, q, n) => [{ docName: 'doc-' + id, score: 0.9, chunkText: 'chunk about ' + q + ' key sk-' + 'w'.repeat(30) }].slice(0, n), askAgent: async (id, q, extra) => { lastAskExtra = extra; return { answer: id + ' says: ' + q, sources: ['doc-' + id] }; }, chatAsksPerHour: 3, stepMs: 60, spacingMs: 0, retryMs: 5, uidOf: (req) => req.headers['x-uid'] || '' });
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
  for (const s of ['admin:*', 'treegens:pay', 'sparks_ledger:spend', 'trade:execute', 'wallet:transfer']) {
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
  let done; for (let i = 0; i < 60; i++) { await sleep(50); done = out(await tool(run.token, 'get_run_status', { run_id: runId })); if (['succeeded', 'failed', 'cancelled', 'expired'].includes(done.status)) break; }
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
  let ap; for (let i = 0; i < 60; i++) { await sleep(50); ap = out(await tool(run.token, 'get_run_status', { run_id: w.run_id })); if (ap.status === 'succeeded' || ap.status === 'failed') break; }
   assert.strictEqual(ap.status, 'succeeded'); assert.strictEqual(ap.receipt.approvals[0].by, 'user:alice');
  const w2 = out(await tool(run.token, 'start_workflow', { workflow_id: 'demo.needs-approval', agent_id: 'a1', idempotency_key: 'job-4' })); await sleep(200);
  assert.strictEqual((await http('POST', '/runs/' + w2.run_id + '/deny', { uid: 'alice' })).status, 200);
  assert.strictEqual(out(await tool(run.token, 'get_run_status', { run_id: w2.run_id })).status, 'failed', 'denied runs fail, they never proceed');

  // ── REAL WORK: forged agents OR outside bots run the same server-side workflows ──
  const wk = await mint('alice', { label: 'worker', scopes: ['workflows:read', 'workflows:run', 'runs:read', 'agents:read', 'plots:read', 'tools:run', 'economy:read', 'school:read'] });
  const wait = async (tk, id) => { for (let i = 0; i < 40; i++) { const r = out(await tool(tk, 'get_run_status', { run_id: id })); if (['succeeded', 'failed', 'cancelled', 'expired'].includes(r.status)) return r; await sleep(40); } throw new Error('run did not finish'); };
  assert.ok(out(await tool(wk.token, 'list_tools', {})).items.every((t) => t.tool !== 'execute_trade' && t.tool !== 'write_file'), 'list_tools never offers write/trade tools');
  assert.strictEqual((await tool(ro.token, 'start_workflow', { workflow_id: 'market.snapshot', idempotency_key: 'm0' })).status, 403, 'tools:run scope required for data workflows');
  const ms = out(await tool(wk.token, 'start_workflow', { workflow_id: 'market.snapshot', agent_id: 'a1', params: { symbols: ['bitcoin', 'solana'] }, idempotency_key: 'm1' }));
  const msDone = await wait(wk.token, ms.run_id);
  assert.strictEqual(msDone.status, 'succeeded'); assert.deepStrictEqual(Object.keys(msDone.outputs), ['price:bitcoin', 'price:solana', 'fear_greed', 'trending']);
  assert.ok(JSON.parse(msDone.outputs['price:bitcoin']).usd === 100, 'tool output returned to the bot'); assert.strictEqual(msDone.actor.kind, 'bot');
  for (const t of ['execute_trade', 'write_file', 'run_js']) assert.strictEqual((await tool(wk.token, 'start_workflow', { workflow_id: 'tool.run', idempotency_key: 'bad-' + t, params: { tool: t, args: {} } })).status, 400, t + ' is not allowed');
  assert.ok(!calls.includes('TRADE!') && !calls.includes('WRITE!'), 'denied tools were never executed');
  assert.strictEqual((await tool(wk.token, 'start_workflow', { workflow_id: 'research.topic', idempotency_key: 'r0', params: {} })).status, 400, 'missing query rejected');
  const rs = out(await tool(wk.token, 'start_workflow', { workflow_id: 'research.topic', idempotency_key: 'r1', params: { query: 'mangroves' } }));
  const rsDone = await wait(wk.token, rs.run_id);
  assert.strictEqual(rsDone.status, 'failed', 'a failing tool fails the run honestly'); assert.ok(/wiki down/.test(rsDone.error)); assert.ok(!/sk-z/.test(JSON.stringify(rsDone)), 'secrets in tool output are redacted'); assert.ok(/[redacted]/.test(rsDone.outputs.web));
  const dr = await wait(wk.token, out(await tool(wk.token, 'start_workflow', { workflow_id: 'dashboard.report', agent_id: 'a1', idempotency_key: 'd1' })).run_id);
  assert.strictEqual(dr.status, 'succeeded'); assert.strictEqual(JSON.parse(dr.outputs.balance).sparks, 42);
  assert.strictEqual(out(await tool(wk.token, 'get_balance', {})).sparks, 42, 'bots can read the balance but there is no spend tool');
  assert.ok(!(await rpc(wk.token, 'tools/list')).json.result.tools.some((t) => /spend|pay|trade|transfer/.test(t.name)), 'no money tools exist');

  // forged agent door: the OWNER starts work for their own forged agent from the dashboard (session auth, not a token)
  assert.strictEqual((await http('POST', '/agents/a1/run', { body: { workflow_id: 'news.digest' } })).status, 401, 'needs sign-in');
  assert.strictEqual((await http('POST', '/agents/a1/run', { bearer: wk.token, body: { workflow_id: 'news.digest' } })).status, 401, 'a bot token cannot use the owner door');
  assert.strictEqual((await http('POST', '/agents/b1/run', { uid: 'alice', body: { workflow_id: 'dashboard.report' } })).status, 403, 'not your forged agent');
  const fr = await http('POST', '/agents/a1/run', { uid: 'alice', body: { workflow_id: 'dashboard.report', idempotency_key: 'ui-1' } });
  assert.strictEqual(fr.status, 202); assert.strictEqual(fr.json.run.actor.kind, 'forged');
  await sleep(250);
  const frRuns = (await http('GET', '/runs', { uid: 'alice' })).json.runs; const mineRun = frRuns.find((r) => r.run_id === fr.json.run.run_id);
  assert.strictEqual(mineRun.status, 'succeeded'); assert.ok(mineRun.outputs && mineRun.outputs.agents, 'forged agent run has outputs and a receipt'); assert.ok(mineRun.receipt);
  assert.ok((await http('GET', '/workflows', { uid: 'alice' })).json.workflows.some((w) => w.workflow_id === 'tool.run'));

  // ── dashboard SKILLS, inbox, city view, quota ──
  const sk = await mint('alice', { label: 'skiller', scopes: ['workflows:read', 'workflows:run', 'runs:read', 'agents:read', 'tools:run', 'inbox:write'] });
  const sl = out(await tool(sk.token, 'list_skills', {})).items;
  assert.strictEqual(sl.find((x) => x.skill === 'price-check').runnable, true); assert.strictEqual(sl.find((x) => x.skill === 'bad-skill').runnable, false, 'skills needing unsafe tools are marked not runnable');
  assert.strictEqual((await tool(sk.token, 'start_workflow', { workflow_id: 'skill.run', idempotency_key: 'sk-bad', params: { skill: 'bad-skill' } })).status, 400, 'unsafe skill refused');
  assert.strictEqual((await tool(sk.token, 'start_workflow', { workflow_id: 'skill.run', idempotency_key: 'sk-none', params: { skill: 'nope' } })).status, 400);
  const sr = out(await tool(sk.token, 'start_workflow', { workflow_id: 'skill.run', agent_id: 'a1', idempotency_key: 'sk-1', params: { skill: 'price-check', input: { symbol: 'polkadot' } } }));
  await sleep(25);
  const cityWorking = (await http('GET', '/city', { uid: 'alice' })).json.me.find((m) => m.id === 'a1');
  assert.strictEqual(cityWorking.presence, 'working'); assert.strictEqual(cityWorking.station, 'market', 'a price lookup walks the agent to the market');
  assert.ok((await http('GET', '/city', { uid: 'bob' })).json.me.every((m) => m.id !== 'a1'), 'other users do not see your agent by name'); assert.ok((await http('GET', '/city', { uid: 'bob' })).json.others.length >= 1, 'but they see anonymous activity');
  const srDone = await wait(sk.token, sr.run_id);
  assert.strictEqual(srDone.status, 'succeeded'); assert.ok(calls.filter((c) => c === 'fetch_price:polkadot').length >= 1 && !calls.some((c) => /undefined/.test(c)), 'skill input was interpolated into the tool call'); assert.ok(/polkadot/.test(srDone.outputs['1. fetch_price']), 'the skill result reflects the interpolated input'); assert.deepStrictEqual(Object.keys(srDone.outputs), ['1. fetch_price', '2. get_fear_greed']);
  const botRun = out(await tool(sk.token, 'start_workflow', { workflow_id: 'skill.run', idempotency_key: 'sk-2', params: { skill: 'price-check', input: { symbol: 'cardano' } } })); await sleep(25);
   assert.ok((await http('GET', '/city', { uid: 'alice' })).json.me.some((m) => m.kind === 'bot' && m.name === 'skiller' && m.station === 'market'), 'an outside bot without an avatar appears by its token name'); await wait(sk.token, botRun.run_id);
  assert.strictEqual((await tool(ro.token, 'post_to_inbox', { subject: 'x', content: 'y' })).status, 403, 'inbox:write required');
  assert.strictEqual((await tool(sk.token, 'post_to_inbox', { subject: 'Report', content: 'BTC is 100' })).status, 200);
  assert.strictEqual((await tool(sk.token, 'post_to_inbox', { subject: 'k', content: 'key sk-' + 'q'.repeat(30) })).status, 400, 'no secrets in messages');
  const inbox = (await http('GET', '/inbox', { uid: 'alice' })).json.messages; assert.strictEqual(inbox.length, 1); assert.strictEqual(inbox[0].from, 'skiller');
  assert.strictEqual((await http('GET', '/inbox', { uid: 'bob' })).json.messages.length, 0, 'inbox is private to its owner');
  assert.strictEqual((await http('DELETE', '/inbox/' + inbox[0].id, { uid: 'bob' })).status, 404);
  const tiny = createBridge({ file: path.join(tmp, 'tiny.json'), plotsFile, operatives, tools, internal, skills, stepMs: 5, spacingMs: 0, runsPerHour: 2, uidOf: (req) => req.headers['x-uid'] || '' });
  const app2 = express(); app2.use('/t', tiny); const srv2 = await new Promise((r) => { const x = app2.listen(0, () => r(x)); });
  const b2 = 'http://127.0.0.1:' + srv2.address().port + '/t';
  const tk2 = (await (await fetch(b2 + '/tokens', { method: 'POST', headers: { 'content-type': 'application/json', 'x-uid': 'alice' }, body: JSON.stringify({ scopes: ['workflows:run'] }) })).json()).token;
  const go = (k) => fetch(b2 + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk2 }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'start_workflow', arguments: { workflow_id: 'demo.ping', idempotency_key: k } } }) }).then((r) => r.status);
  assert.deepStrictEqual([await go('q1'), await go('q2'), await go('q3')], [200, 200, 429], 'hourly run quota per account'); assert.strictEqual(await go('q1'), 200, 'replaying an existing run is never rate limited'); srv2.close();

  // ── bots sign up for classes with THEIR agent; snapshot of the world ──
  const bound = await mint('alice', { label: 'student', agent_id: 'a1', scopes: ['school:join', 'agents:read', 'school:read'] });
  assert.strictEqual((await tool(bound.token, 'join_class', { class_id: 'cls_open' })).status, 200, 'a bot bound to a forged agent can join a class as that agent');
  assert.strictEqual((await tool(bound.token, 'join_class', { class_id: 'cls_full' })).status, 409); assert.strictEqual((await tool(bound.token, 'join_class', { class_id: 'nope' })).status, 404);
  assert.strictEqual((await tool(bound.token, 'join_class', { class_id: 'cls_open', agent_id: 'b1' })).status, 403, 'cannot enroll another agent');
  const loose = await mint('alice', { label: 'loose', scopes: ['school:join'] });
  assert.strictEqual((await tool(loose.token, 'join_class', { class_id: 'cls_open' })).status, 400, 'needs an agent');
  assert.strictEqual((await tool(loose.token, 'join_class', { class_id: 'cls_open', agent_id: 'b1' })).status, 403, 'not your agent');
  assert.strictEqual((await tool(ro.token, 'join_class', { class_id: 'cls_open' })).status, 403, 'school:join scope required');
  const snap = out(await tool(bound.token, 'get_world_snapshot', {})); assert.ok(Array.isArray(snap.mine) && snap.others_by_station && typeof snap.others_by_station === 'object');

  // identical read-only lookups share one upstream call (protects shared API quotas)
  const cacheA = out(await tool(wk.token, 'start_workflow', { workflow_id: 'tool.run', idempotency_key: 'c-1', params: { tool: 'fetch_price', args: { symbol: 'dogecoin' } } })); await wait(wk.token, cacheA.run_id);
  const cacheB = out(await tool(wk.token, 'start_workflow', { workflow_id: 'tool.run', idempotency_key: 'c-2', params: { tool: 'fetch_price', args: { symbol: 'dogecoin' } } })); const cacheBd = await wait(wk.token, cacheB.run_id);
  assert.strictEqual(calls.filter((c) => c === 'fetch_price:dogecoin').length, 1, 'second identical lookup came from the cache'); assert.strictEqual(cacheBd.status, 'succeeded');

  // ── headless council: knowledge search + grounded answers; skill input validation; extension point ──
  const brain = await mint('alice', { label: 'brain', scopes: ['rag:read', 'agents:ask', 'workflows:run', 'runs:read', 'tools:run', 'plots:maintain'] });
  const rg = out(await tool(brain.token, 'rag_search', { agent: 'turtle', query: 'login page', limit: 2 })); assert.strictEqual(rg.agent, 'TURTLE'); assert.ok(rg.hits.length === 1 && !/sk-w/.test(JSON.stringify(rg)), 'rag hits are redacted');
  assert.strictEqual((await tool(brain.token, 'rag_search', { agent: 'EVIL', query: 'x' })).status, 400, 'only council agents');
  assert.strictEqual((await tool(ro.token, 'rag_search', { query: 'x' })).status, 403, 'rag:read required');
  assert.strictEqual(out(await tool(brain.token, 'ask_agent', { agent: 'ZEROX', question: 'is BTC overbought?' })).answer, 'ZEROX says: is BTC overbought?');
  assert.strictEqual((await tool(ro.token, 'ask_agent', { question: 'x' })).status, 403, 'agents:ask required');
  await tool(brain.token, 'ask_agent', { question: 'two' }); await tool(brain.token, 'ask_agent', { question: 'three' });
  assert.strictEqual((await tool(brain.token, 'ask_agent', { question: 'four' })).status, 429, 'hourly question quota');
  assert.strictEqual((await tool(brain.token, 'start_workflow', { workflow_id: 'skill.run', idempotency_key: 'need-in', params: { skill: 'price-check', input: {} } })).status, 200, 'skill with a default input runs without it');
  recipes['needs-topic'] = { agent: 'ORACLE', description: 'needs topic', params: ['topic'], steps: [{ tool: 'search_web', params: { query: '{{input.topic}}' } }] };
  assert.strictEqual((await tool(brain.token, 'start_workflow', { workflow_id: 'skill.run', idempotency_key: 'need-2', params: { skill: 'needs-topic' } })).status, 400, 'missing required skill input is refused up front');
  assert.deepStrictEqual(out(await tool(brain.token, 'list_skills', { query: 'needs' })).items[0].required_input, ['topic']);
  // SAP (or any module) plugs workflows in; plot maintenance is a normal run with a receipt, scoped by plots:maintain
  let watered = null; bridge.registerWorkflow('sap.plot.water', { title: 'Water a plot', required_scopes: ['workflows:run', 'plots:maintain'], build: () => [{ name: 'water', fn: async (c) => { watered = c; return { ok: true, moisture: 0.8 }; } }] });
  assert.throws(() => bridge.registerWorkflow('sap.plot.water', { required_scopes: ['workflows:run'], build: () => [] }), /duplicate/);
  assert.throws(() => bridge.registerWorkflow('x.bad-scope', { required_scopes: ['admin:*'], build: () => [] }), /unknown scope/);
  assert.strictEqual((await tool(wk.token, 'start_workflow', { workflow_id: 'sap.plot.water', idempotency_key: 'w-0' })).status, 403, 'plots:maintain required');
  const wr = out(await tool(brain.token, 'start_workflow', { workflow_id: 'sap.plot.water', agent_id: 'a1', plot_id: 'p-alice', idempotency_key: 'w-1' })); const wd = await wait(brain.token, wr.run_id);
  assert.strictEqual(wd.status, 'succeeded'); assert.strictEqual(watered.owner, 'alice'); assert.strictEqual(watered.agent_id, 'a1'); assert.strictEqual(watered.plot_id, 'p-alice'); assert.ok(wd.receipt);

  // ── DASHBOARD CHAT: council + forged agents via owner doors; two-way channel with outside bots ──
  assert.strictEqual((await http('POST', '/ask', { body: { agent: 'ZEROX', question: 'hi' } })).status, 401, 'chat needs sign-in');
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'EVIL', question: 'hi' } })).status, 400);
  const a1r = await http('POST', '/ask', { uid: 'alice', body: { agent: 'TURTLE', question: 'review my login page', history: [{ role: 'user', text: 'earlier' }, { role: 'assistant', text: 'ok' }], as: 'a1' } });
  assert.strictEqual(a1r.status, 200); assert.strictEqual(a1r.json.answer, 'TURTLE says: review my login page'); assert.strictEqual(lastAskExtra.persona.name, 'Bolt'); assert.strictEqual(lastAskExtra.history.length, 2);
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'TURTLE', question: 'x', as: 'b1' } })).status, 403, 'cannot speak as someone else agent');
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'TURTLE', question: 'my key is sk-' + 'k'.repeat(30) } })).status, 400, 'no secrets in chat');
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'NEXUS', question: 'again' } })).status, 200);
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'NEXUS', question: 'and again' } })).status, 200);
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'NEXUS', question: 'one too many' } })).status, 429, 'hourly chat limit');
  const orun = await http('POST', '/run', { uid: 'alice', body: { workflow_id: 'demo.ping' } }); assert.strictEqual(orun.status, 202); assert.strictEqual(orun.json.run.actor.kind, 'owner');
  assert.strictEqual((await http('POST', '/run', { uid: 'alice', body: { workflow_id: 'demo.ping', params: { apiKey: 'abc' } } })).status, 400);
  const sk2 = (await http('GET', '/skills', { uid: 'alice' })).json.skills; assert.ok(sk2.some((x) => x.skill === 'price-check') && !sk2.some((x) => x.skill === 'bad-skill'), 'only runnable skills are offered to the chat');

  const talker = await mint('alice', { label: 'Grok Bot', scopes: ['chat:talk', 'runs:read'] });
  const ttid = (await http('GET', '/tokens', { uid: 'alice' })).json.tokens.find((t) => t.label === 'Grok Bot').id;
  assert.strictEqual((await tool(talker.token, 'read_messages', {})).status, 200); assert.deepStrictEqual(out(await tool(talker.token, 'read_messages', {})).messages, [], 'no messages yet');
  assert.strictEqual((await http('POST', '/chat/threads/' + ttid, { uid: 'alice', body: { text: 'hello bot, please check BTC' } })).status, 201);
  assert.strictEqual((await http('POST', '/chat/threads/' + ttid, { uid: 'bob', body: { text: 'hi' } })).status, 404, 'cannot write into another user bot thread');
  assert.strictEqual((await http('GET', '/chat/threads/' + ttid, { uid: 'bob' })).status, 404);
  assert.strictEqual((await http('POST', '/chat/threads/' + ttid, { uid: 'alice', body: { text: 'key sk-' + 'm'.repeat(30) } })).status, 400, 'owner cannot paste a key to a bot');
  const got = out(await tool(talker.token, 'read_messages', {})).messages; assert.strictEqual(got.length, 1); assert.strictEqual(got[0].text, 'hello bot, please check BTC');
  assert.deepStrictEqual(out(await tool(talker.token, 'read_messages', {})).messages, [], 'messages are delivered once');
  assert.strictEqual((await tool(talker.token, 'post_message', { text: 'BTC is 6k, fear index 28' })).status, 200);
  assert.strictEqual((await tool(talker.token, 'post_message', { text: 'my key is sk-' + 'z'.repeat(30) })).status, 400, 'a bot cannot post secrets either');
  const thr = (await http('GET', '/chat/threads', { uid: 'alice' })).json.threads.find((t) => t.thread === ttid); assert.strictEqual(thr.unread, 1); assert.strictEqual(thr.can_chat, true);
  const conv = (await http('GET', '/chat/threads/' + ttid, { uid: 'alice' })).json.messages; assert.deepStrictEqual(conv.map((m) => m.from), ['owner', 'bot']); assert.ok(conv[0].seq < conv[1].seq);
  assert.strictEqual((await http('GET', '/chat/threads', { uid: 'alice' })).json.threads.find((t) => t.thread === ttid).unread, 0, 'reading the thread clears unread');
  assert.strictEqual((await http('GET', '/chat/threads/' + ttid + '?after=' + conv[1].seq, { uid: 'alice' })).json.messages.length, 0, 'polling with ?after only returns new messages');
  const mute = await mint('alice', { label: 'mute', scopes: ['runs:read'] }); const mtid = (await http('GET', '/tokens', { uid: 'alice' })).json.tokens.find((t) => t.label === 'mute').id;
  assert.strictEqual((await http('POST', '/chat/threads/' + mtid, { uid: 'alice', body: { text: 'hi' } })).status, 403, 'a bot without chat:talk cannot be chatted with');
  assert.strictEqual((await tool(mute.token, 'post_message', { text: 'hi' })).status, 403);

  // ── WORKFLOW LIBRARY (from the unified MCP): vetted, templated, scoped ──
  await sleep(80);
  const libTok = await mint('bob', { label: 'libber', scopes: ['workflows:read', 'workflows:run', 'runs:read', 'rag:read', 'agents:ask', 'tools:run'] });
  const ls = out(await tool(libTok.token, 'library_search', { query: 'research' })).items; assert.ok(ls.some((x) => x.workflow_id === 'lib.research-brief' && x.needs_context.join() === 'q' && x.scopes.indexOf('rag:read') > -1), 'library entries show the context they need');
  const allLib = out(await tool(libTok.token, 'library_search', {})).items.map((x) => x.workflow_id); assert.ok(allLib.indexOf('lib.price-pulse') > -1 && allLib.indexOf('lib.arena-game') < 0 && allLib.indexOf('lib.admin-thing') < 0, 'workflows needing game/admin tools are never offered');
  assert.strictEqual((await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.research-brief', idempotency_key: 'lb0', params: {} })).status, 400, 'missing required context refused up front');
  const lr = out(await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.research-brief', idempotency_key: 'lb1', params: { context: { q: 'mangroves' } } })); const lrd = await wait(libTok.token, lr.run_id);
  assert.strictEqual(lrd.status, 'succeeded'); assert.deepStrictEqual(Object.keys(lrd.outputs), ['1. rag_search', '2. shaddai_run_agent', '3. web_search']);
  assert.ok(/ORACLE says: Summarize: .*chunk about mangroves/.test(JSON.parse(lrd.outputs['2. shaddai_run_agent']).answer), 'step 1 output was templated into step 2 ({{step_1.output}})');
  assert.ok(!/sk-w|sk-z/.test(JSON.stringify(lrd)), 'secrets in step output are redacted');
  const pp = out(await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.price-pulse', idempotency_key: 'lb2', params: { context: { coin: 'litecoin' } } })); const ppd = await wait(libTok.token, pp.run_id); assert.strictEqual(ppd.status, 'succeeded'); assert.ok(calls.indexOf('fetch_price:litecoin') > -1, 'unified zerox_price mapped to the allowlisted fetch_price with the templated symbol');
  const mp = out(await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.multi-price', idempotency_key: 'lb4', params: {} })); const mpd = await wait(libTok.token, mp.run_id); assert.strictEqual(mpd.status, 'succeeded');
  assert.ok(calls.indexOf('fetch_price:bitcoin') > -1 && calls.indexOf('fetch_price:ethereum') > -1 && calls.indexOf('fetch_price:solana') > -1, 'a symbols list (BTC,ETH,SOL) fetches EACH asset, mapped to coin ids');
  assert.strictEqual(JSON.parse(mpd.outputs['1. zerox_price']).length, 3);
  const ns = out(await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.no-symbol', idempotency_key: 'lb5', params: {} })); const nsd = await wait(libTok.token, ns.run_id); assert.strictEqual(nsd.status, 'failed'); assert.ok(/needs symbols/.test(nsd.error), 'a missing symbol fails clearly instead of silently returning bitcoin');
  const cp = out(await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.calc-pack', idempotency_key: 'nat1', params: {} })); const cpd = await wait(libTok.token, cp.run_id); assert.strictEqual(cpd.status, 'succeeded', cpd.error);
  const o1 = (k) => JSON.parse(cpd.outputs[k]); assert.strictEqual(o1('1. roi').roi_percent, 20); assert.strictEqual(o1('2. profit_margin').margin_percent, 90); assert.strictEqual(o1('3. ltv_cac').ratio, 3); assert.ok(/healthy/.test(o1('3. ltv_cac').verdict));
  assert.strictEqual(o1('4. turtle_palette').colors.length, 5); assert.ok(o1('4. turtle_palette').colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), 'palette colors are valid hex'); assert.ok(calls.indexOf('moon') > -1, 'hall_moon maps to the allowlisted get_moon_phase');
  assert.deepStrictEqual([o1('6. csv_stats').count, o1('6. csv_stats').sum, o1('6. csv_stats').mean], [2, 4, 2], 'csv helper reads escaped newlines'); assert.ok(/"a": 1/.test(cpd.outputs['7. json_format']), 'json_format pretty prints');
  const bm = out(await tool(libTok.token, 'start_workflow', { workflow_id: 'lib.bad-math', idempotency_key: 'nat3', params: {} })); const bmd = await wait(libTok.token, bm.run_id); assert.strictEqual(bmd.status, 'failed'); assert.ok(/cost cannot be zero/.test(bmd.error), 'bad input fails clearly');
  const noRag = await mint('bob', { label: 'norag', scopes: ['workflows:run', 'tools:run', 'agents:ask'] }); assert.strictEqual((await tool(noRag.token, 'start_workflow', { workflow_id: 'lib.research-brief', idempotency_key: 'lb3', params: { context: { q: 'x' } } })).status, 403, 'scopes follow the tools a workflow uses');
  assert.ok((await http('GET', '/library?q=price', { uid: 'bob' })).json.workflows.some((x) => x.workflow_id === 'lib.price-pulse'), 'owner door lists the library for the dashboard chat');

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
