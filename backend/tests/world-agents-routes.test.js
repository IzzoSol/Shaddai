'use strict';
// Tests for the world-agents routes (3D terminal contract C4). Run: node backend/tests/world-agents-routes.test.js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createWorldAgents } = require('../world-agents-routes');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-agents-'));
  const ops = { op1: { id: 'op1', name: 'Bolt', owner: 'alice' }, op2: { id: 'op2', name: 'Zed', owner: 'bob' } };
  const kernelCalls = []; let kernelMode = 'allow';
  const kernel = { pikadonEntrance: async (agent, payload) => { kernelCalls.push(payload.tool); if (kernelMode === 'secret') return { ok: false, decision: 'deny_on', reason_code: 'secret_detected' }; if (kernelMode === 'throw') throw new Error('boom'); return { ok: true, decision: 'allow' }; } };
  const router = createWorldAgents({ dir, kernel, operatives: { get: (id) => ops[id] || null, listByOwner: (o) => Object.values(ops).filter((x) => x.owner === o) }, uidOf: (req) => req.headers['x-uid'] || '' });
  const app = express(); app.use('/api/world/agents', router);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); const base = 'http://127.0.0.1:' + server.address().port + '/api/world/agents';
  async function http(method, p, o) { o = o || {}; const headers = { 'content-type': 'application/json' }; if (o.uid) headers['x-uid'] = o.uid; const r = await fetch(base + p, { method, headers, body: o.body ? JSON.stringify(o.body) : undefined }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; }
  const auditLines = () => (fs.existsSync(router._test.auditFile) ? fs.readFileSync(router._test.auditFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

  // anonymous GET: council listed, all idle, no bots
  const anon = (await http('GET', '')).json; assert.strictEqual(anon.ok, true); assert.strictEqual(anon.agents.length, 7); assert.ok(anon.agents.every((a) => a.state === 'idle' && a.kind === 'council'));
  // 401 unauthenticated, and it is audited
  assert.strictEqual((await http('POST', '/NEXUS/task', { body: { verb: 'idle' } })).status, 401);
  // 400: bad verb, unknown pin, missing args, bad agent id
  assert.strictEqual((await http('POST', '/NEXUS/task', { uid: 'alice', body: { verb: 'pay', args: {} } })).status, 400, 'no spending verbs');
  assert.strictEqual((await http('POST', '/NEXUS/task', { uid: 'alice', body: { verb: 'goto', args: { pin: 'nowhere' } } })).status, 400, 'unknown pin');
  assert.strictEqual((await http('POST', '/NEXUS/task', { uid: 'alice', body: { verb: 'study', args: {} } })).status, 400);
  assert.strictEqual((await http('POST', '/bad%20id/task', { uid: 'alice', body: { verb: 'idle' } })).status, 400);
  // 403: someone else's agent
  assert.strictEqual((await http('POST', '/op2/task', { uid: 'alice', body: { verb: 'idle' } })).status, 403);
  // 202: goto a pin for a council agent
  const ok = await http('POST', '/NEXUS/task', { uid: 'alice', body: { verb: 'goto', args: { pin: 'academy' } } });
  assert.strictEqual(ok.status, 202); assert.ok(/^wt_/.test(ok.json.taskId)); assert.deepStrictEqual(kernelCalls, ['world.task.goto'], 'the request went through the kernel');
  const mine = (await http('GET', '', { uid: 'alice' })).json.agents;
  const nexus = mine.find((a) => a.id === 'NEXUS'); assert.strictEqual(nexus.state, 'travelling'); assert.strictEqual(nexus.task.verb, 'goto'); assert.deepStrictEqual(nexus.place, { pin: 'academy' }); assert.ok(/Athenaeum/.test(nexus.task.label));
  assert.ok(mine.some((a) => a.id === 'op1' && a.kind === 'bot' && a.owner === 'alice'), 'your own agents are listed'); assert.ok(!mine.some((a) => a.id === 'op2'), 'other users agents are not');
  // tasks are per user: bob sees NEXUS idle
  assert.strictEqual((await http('GET', '', { uid: 'bob' })).json.agents.find((a) => a.id === 'NEXUS').state, 'idle', 'one player cannot command the council for another');
  // your own forged agent: study + work
  assert.strictEqual((await http('POST', '/op1/task', { uid: 'alice', body: { verb: 'study', args: { classId: 'cls_abc' } } })).status, 202);
  assert.strictEqual((await http('GET', '', { uid: 'alice' })).json.agents.find((a) => a.id === 'op1').state, 'working');
  assert.strictEqual((await http('POST', '/op1/task', { uid: 'alice', body: { verb: 'work', args: { officeId: 'off_1' } } })).status, 202);
  // idle clears
  assert.strictEqual((await http('POST', '/op1/task', { uid: 'alice', body: { verb: 'idle' } })).status, 202); assert.strictEqual((await http('GET', '', { uid: 'alice' })).json.agents.find((a) => a.id === 'op1').state, 'idle');
  // kernel denial -> 403 with the reason shown plainly; kernel failure -> 403, never a free pass
  kernelMode = 'secret'; const den = await http('POST', '/NEXUS/task', { uid: 'alice', body: { verb: 'goto', args: { pin: 'park' } } }); assert.strictEqual(den.status, 403); assert.strictEqual(den.json.why, 'secret_detected');
  kernelMode = 'throw'; assert.strictEqual((await http('POST', '/NEXUS/task', { uid: 'alice', body: { verb: 'goto', args: { pin: 'park' } } })).status, 403, 'if the kernel fails the request is refused'); kernelMode = 'allow';
  // every attempt was audit-logged: allow, deny and invalid, with uid/agent/verb/args/decision
  const lines = auditLines(); const dec = (d) => lines.filter((l) => l.decision === d).length;
  assert.ok(dec('allow') >= 4 && dec('deny') >= 4 && dec('invalid') >= 4, 'allow/deny/invalid all logged: ' + JSON.stringify({ a: dec('allow'), d: dec('deny'), i: dec('invalid') }));
  assert.ok(lines.every((l) => l.ts && l.uid && l.agent && l.decision), 'audit lines carry ts, uid, agent, decision');
  assert.ok(lines.some((l) => l.decision === 'deny' && l.why === 'unauthenticated'));
  // persisted to disk
  assert.ok(fs.existsSync(path.join(dir, 'world-agent-tasks.json')));
  server.close(); console.log('world-agents-routes: all assertions passed'); process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
