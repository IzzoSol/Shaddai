'use strict';
// Sparks metering for the Outside-Bot Bridge. 1 Spark = $1; prices are cents of a Spark. Run: node backend/tests/platform-bridge.sparks.test.js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createBridge } = require('../platform-bridge');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-sparks-'));
  const bal = { alice: 10 }; const spent = []; const granted = []; let failEconomy = false;
  const economy = {
    spend: async (u, n, reason, key) => { if (failEconomy) throw new Error('db down'); if ((bal[u] || 0) < n) { const e = new Error('Insufficient Sparks balance'); e.code = 'INSUFFICIENT_FUNDS'; throw e; } bal[u] -= n; spent.push({ u, n, reason, key }); return { balance: bal[u] }; },
    grant: async (u, n, reason, key) => { bal[u] = (bal[u] || 0) + n; granted.push({ u, n, reason, key }); return { balance: bal[u] }; },
    getBalance: async (u) => bal[u] || 0
  };
  let boom = false;
  const bridge = createBridge({ file: path.join(tmp, 'b.json'), plotsFile: path.join(tmp, 'p.json'), metering: true, economy, unitsPerSpark: 100, runsPerHour: 2, asksPerHour: 1, chatAsksPerHour: 1, stepMs: 5, spacingMs: 0,
    operatives: { get: () => null, listByOwner: () => [] }, askAgent: async (id, q) => { if (boom) throw new Error('llm down'); return { answer: id + ': ' + q, sources: [] }; }, uidOf: (req) => req.headers['x-uid'] || '' });
  const app = express(); app.use('/b', bridge); const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); const base = 'http://127.0.0.1:' + server.address().port + '/b';
  async function http(method, p, o) { o = o || {}; const headers = { 'content-type': 'application/json' }; if (o.uid) headers['x-uid'] = o.uid; if (o.bearer) headers.authorization = 'Bearer ' + o.bearer; const r = await fetch(base + p, { method, headers, body: o.body ? JSON.stringify(o.body) : undefined }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; }
  let n = 0; const tool = (tk, name, args) => http('POST', '/mcp', { bearer: tk, body: { jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } } });
  const mint = async (body) => (await http('POST', '/tokens', { uid: 'alice', body })).json;
  const start = (tk, key, wf) => tool(tk, 'start_workflow', { workflow_id: wf || 'demo.ping', idempotency_key: key });

  const t1 = await mint({ label: 'bot1', scopes: ['workflows:run', 'runs:read', 'agents:ask'] });
  assert.ok(t1.info.daily_cap_sparks === '1.00', 'default daily cap is 1.00 Spark'); assert.strictEqual(t1.info.spent_today_sparks, '0.00');

  // free allowance is free
  assert.strictEqual((await start(t1.token, 'r1')).status, 200); assert.strictEqual((await start(t1.token, 'r2')).status, 200);
  assert.strictEqual(spent.length, 0, 'the first runs in the hour cost nothing');
  // overage is charged: 1 cent of a Spark = 1 ledger unit
  assert.strictEqual((await start(t1.token, 'r3')).status, 200); assert.strictEqual(spent.length, 1); assert.deepStrictEqual([spent[0].u, spent[0].n, spent[0].reason], ['alice', 1, 'bridge:run']); assert.strictEqual(bal.alice, 9);
  assert.strictEqual((await start(t1.token, 'r3')).status, 200); assert.strictEqual(spent.length, 1, 'replaying the same idempotency key is never charged twice'); assert.strictEqual(bal.alice, 9);
  // a request that fails validation is refunded
  assert.strictEqual((await start(t1.token, 'r4', 'no.such.workflow')).status, 404); assert.strictEqual(bal.alice, 9, 'a charged request that fails is refunded'); assert.ok(granted.some((g) => /refund/.test(g.reason)));
  // owner session doors are metered too (no per-bot cap)
  assert.strictEqual((await http('POST', '/run', { uid: 'alice', body: { workflow_id: 'demo.ping' } })).status, 202); assert.strictEqual(bal.alice, 8);
  // the per-bot daily cap protects the owner's balance
  const t2 = await mint({ label: 'frugal', scopes: ['workflows:run'], daily_cap_cents: 2 }); assert.strictEqual(t2.info.daily_cap_sparks, '0.02');
  assert.strictEqual((await start(t2.token, 'f1')).status, 200); assert.strictEqual((await start(t2.token, 'f2')).status, 200);
  const capped = await start(t2.token, 'f3'); assert.strictEqual(capped.status, 402); assert.ok(/daily Sparks cap/.test(capped.json.error.message), 'bot stops at its own cap'); assert.strictEqual(bal.alice, 6);
  assert.strictEqual((await http('GET', '/tokens', { uid: 'alice' })).json.tokens.find((t) => t.label === 'frugal').spent_today_sparks, '0.02');
  // questions: 1 free per hour, then 3 cents of a Spark each
  assert.strictEqual((await tool(t1.token, 'ask_agent', { question: 'free one' })).status, 200); assert.strictEqual(bal.alice, 6);
  assert.strictEqual((await tool(t1.token, 'ask_agent', { question: 'paid one' })).status, 200); assert.strictEqual(bal.alice, 3, 'an extra question costs 0.03 Spark');
  boom = true; assert.ok((await tool(t1.token, 'ask_agent', { question: 'will fail' })).status >= 400); boom = false; assert.strictEqual(bal.alice, 3, 'a failed answer is refunded');
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'NEXUS', question: 'chat free' } })).status, 200); assert.strictEqual(bal.alice, 3);
  assert.strictEqual((await http('POST', '/ask', { uid: 'alice', body: { agent: 'NEXUS', question: 'chat paid' } })).status, 200); assert.strictEqual(bal.alice, 0, 'dashboard chat overage is charged to the owner');
  // out of Sparks: a clear message, nothing runs
  const broke = await start(t1.token, 'r9'); assert.strictEqual(broke.status, 402); assert.ok(/Top up/.test(broke.json.error.message), 'tells the owner to top up');
  const brokeAsk = await http('POST', '/ask', { uid: 'alice', body: { agent: 'NEXUS', question: 'no money' } }); assert.strictEqual(brokeAsk.status, 402);
  // ledger outage -> 503, not a free pass
  bal.alice = 50; failEconomy = true; assert.strictEqual((await start(t1.token, 'r10')).status, 503, 'if the Sparks ledger is down, extra usage is refused, not given away'); failEconomy = false;
  // usage endpoint
  bal.alice = 500; const u = (await http('GET', '/usage', { uid: 'alice' })).json;
  assert.strictEqual(u.metering, true); assert.strictEqual(u.one_spark_usd, 1); assert.strictEqual(u.prices_sparks.extra_question, '0.03'); assert.strictEqual(u.prices_sparks.extra_run, '0.01');
  assert.strictEqual(u.balance.units, 500); assert.strictEqual(u.balance.sparks, '5.00'); assert.ok(u.recent.length >= 3 && u.recent.every((x) => /^-?\d+\.\d\d$/.test(x.sparks)));
  assert.strictEqual((await http('GET', '/usage', {})).status, 401, 'usage needs sign-in');
  // hard ceiling on paid overage
  const cap = createBridge({ file: path.join(tmp, 'c.json'), plotsFile: path.join(tmp, 'p.json'), metering: true, economy, runsPerHour: 1, stepMs: 5, spacingMs: 0, operatives: { get: () => null, listByOwner: () => [] }, uidOf: (req) => req.headers['x-uid'] || '' });
  assert.ok(cap._test && cap._test.WORKFLOWS['demo.ping']);

  // ── LEARN ONCE, RUN FREE FOREVER ──
  const store = { a1: { id: 'a1', name: 'Bolt', owner: 'alice', skills: [] }, a2: { id: 'a2', name: 'Zed', owner: 'alice', skills: [] }, b1: { id: 'b1', name: 'Eve', owner: 'bob', skills: [] } };
  const bal2 = { alice: 100, bob: 100 }, spent2 = [];
  const econ2 = { spend: async (u, n, reason, key) => { if ((bal2[u] || 0) < n) { const e = new Error('Insufficient'); e.code = 'INSUFFICIENT_FUNDS'; throw e; } bal2[u] -= n; spent2.push({ u, n, reason, key }); return {}; }, grant: async (u, n) => { bal2[u] = (bal2[u] || 0) + n; return {}; }, getBalance: async (u) => bal2[u] || 0 };
  let failUpdate = false;
  const lb = createBridge({ file: path.join(tmp, 'l.json'), plotsFile: path.join(tmp, 'p.json'), metering: true, economy: econ2, unitsPerSpark: 100, runsPerHour: 1, stepMs: 5, spacingMs: 0,
    operatives: { get: (id) => store[id] || null, listByOwner: (o) => Object.values(store).filter((x) => x.owner === o), update: (id, patch) => { if (failUpdate) throw new Error('disk'); Object.assign(store[id], patch); return store[id]; } },
    tools: { get_joke: { description: 'joke', execute: async () => 'a joke' } }, skills: { getRecipe: (id) => (id === 'tell-a-joke' ? { steps: [{ tool: 'get_joke', params: {} }] } : id === 'run-code' ? { steps: [{ tool: 'run_js', params: {} }] } : undefined), listRecipes: () => [], interpolate: (t) => t },
    uidOf: (req) => req.headers['x-uid'] || '' });
  const app3 = express(); app3.use('/l', lb); const s3 = await new Promise((r) => { const x = app3.listen(0, () => r(x)); }); const b3 = 'http://127.0.0.1:' + s3.address().port + '/l';
  const H = (uid, body, m, p2) => fetch(b3 + p2, { method: m || 'POST', headers: { 'content-type': 'application/json', 'x-uid': uid }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
  assert.strictEqual((await H('alice', { agent_id: 'b1', skill: 'tell-a-joke' }, 'POST', '/learn')).status, 403, 'cannot teach someone else agent');
  assert.strictEqual((await H('alice', { agent_id: 'a1', skill: 'run-code' }, 'POST', '/learn')).status, 404, 'a skill that needs unsafe tools cannot be learned');
  assert.strictEqual((await H('alice', { agent_id: 'a1', skill: 'nope' }, 'POST', '/learn')).status, 404);
  assert.strictEqual((await H('alice', { agent_id: 'a1' }, 'POST', '/learn')).status, 400);
  const balBefore = bal2.alice, L1 = await H('alice', { agent_id: 'a1', skill: 'tell-a-joke' }, 'POST', '/learn');
  assert.strictEqual(L1.status, 200); assert.strictEqual(L1.json.tuition_sparks, '0.25'); assert.strictEqual(bal2.alice, balBefore - 25, 'tuition for a skill is 0.25 Spark, charged once'); assert.strictEqual(store.a1.skills.length, 1); assert.strictEqual(store.a1.skills[0].skillId, 'skill:tell-a-joke');
  const L2 = await H('alice', { agent_id: 'a1', skill: 'tell-a-joke' }, 'POST', '/learn'); assert.strictEqual(L2.json.already, true); assert.strictEqual(bal2.alice, balBefore - 25, 'learning again is free (already known)');
  const tokL = (await (await fetch(b3 + '/tokens', { method: 'POST', headers: { 'content-type': 'application/json', 'x-uid': 'alice' }, body: JSON.stringify({ scopes: ['workflows:run', 'runs:read', 'tools:run'] }) })).json()).token;
  let nn = 0; const go2 = (key, agent) => fetch(b3 + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tokL }, body: JSON.stringify({ jsonrpc: '2.0', id: ++nn, method: 'tools/call', params: { name: 'start_workflow', arguments: { workflow_id: 'skill.run', agent_id: agent, idempotency_key: key, params: { skill: 'tell-a-joke' } } } }) }).then((r) => r.status);
  const spentBefore = spent2.length;
  assert.deepStrictEqual([await go2('j1', 'a1'), await go2('j2', 'a1'), await go2('j3', 'a1'), await go2('j4', 'a1')], [200, 200, 200, 200], 'the agent that learned the skill runs it again and again');
  assert.strictEqual(spent2.length, spentBefore, 'learned runs cost nothing');
  assert.strictEqual(await go2('u1', 'a2'), 200, 'the first run by an agent that has not learned it uses the free allowance');
  const u2 = await go2('u2', 'a2'); assert.strictEqual(u2, 200); assert.strictEqual(spent2.length, spentBefore + 1, 'an agent that has NOT learned it pays overage (the 4 learned runs did not use up the allowance)');
  assert.strictEqual(spent2[spent2.length - 1].reason, 'bridge:run');
  // a failed recording refunds the tuition
  failUpdate = true; const bal3 = bal2.alice; const L3 = await H('alice', { agent_id: 'a2', skill: 'tell-a-joke' }, 'POST', '/learn'); failUpdate = false;
  assert.strictEqual(L3.status, 500); assert.strictEqual(bal2.alice, bal3, 'if the lesson could not be recorded, the tuition is refunded'); assert.strictEqual(store.a2.skills.length, 0);
  assert.strictEqual((await H('alice', null, 'GET', '/usage')).json.prices_sparks.learn_skill, '0.25');
  s3.close();

  // metering OFF (default): overage is simply rate limited, Sparks untouched
  const off = createBridge({ file: path.join(tmp, 'o.json'), plotsFile: path.join(tmp, 'p.json'), economy, runsPerHour: 1, stepMs: 5, spacingMs: 0, operatives: { get: () => null, listByOwner: () => [] }, uidOf: (req) => req.headers['x-uid'] || '' });
  const app2 = express(); app2.use('/o', off); const s2 = await new Promise((r) => { const x = app2.listen(0, () => r(x)); }); const b2 = 'http://127.0.0.1:' + s2.address().port + '/o';
  bal.alice = 100; const before = spent.length;
  const runOff = (k) => fetch(b2 + '/run', { method: 'POST', headers: { 'content-type': 'application/json', 'x-uid': 'alice' }, body: JSON.stringify({ workflow_id: 'demo.ping', idempotency_key: k }) }).then((r) => r.status);
  assert.deepStrictEqual([await runOff('z1'), await runOff('z2')], [202, 429], 'with metering off the limit is a plain 429'); assert.strictEqual(spent.length, before, 'and no Sparks are touched');
  s2.close(); server.close();
  console.log('platform-bridge sparks: all assertions passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
