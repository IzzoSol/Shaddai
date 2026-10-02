'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const express = require('express');
const { runAll, tmpDir, sampleSkill, sampleBenchmark, sampleRubric } = require('./lib/academy/testkit');
const { EconomyService } = require('./economy-service');
const { createAcademy } = require('./lib/academy/academy-core');
const { createSchoolRouter } = require('./academy-school-routes');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));

async function boot() {
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  for (const u of ['owner1', 'owner2', 'teacherUser']) await economy.grant(u, 200, 'test.seed', 'seed-' + u);
  const opsDb = {
    op1: { id: 'op1', owner: 'owner1', tools: ['chat'], skills: [] },
    op2: { id: 'op2', owner: 'owner2', tools: [], skills: [] },
    tchr: { id: 'tchr', owner: 'teacherUser', tools: [], skills: [] }
  };
  const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(opsDb, id) ? opsDb[id] : null), update: (id, p) => Object.assign(opsDb[id], p) };
  let clock = 1700000000000;
  const academy = createAcademy({
    dir: tmpDir(), economy, operatives, now: () => clock, adminIds: ['owner1'],
    hooks: { passed() {}, failed() {}, homeworkImproved() {}, taught() {}, classCompleted() {} },
    judge: async () => ({ scores: { clarity: 3, tools: 3 }, critique: { focus_next: 'composition', what_went_wrong: ['vague'] } })
  });
  assert.ok(academy.benchmarks.register(sampleBenchmark()).ok);
  assert.ok(academy.benchmarks.registerRubric(sampleRubric()).ok);
  assert.ok(academy.registry.publish(sampleSkill()).ok);
  const app = express();
  app.use('/school', createSchoolRouter({
    academy, operatives,
    uidOf: (req) => String(req.headers['x-test-uid'] || ''),
    agentAuth: (req, res, next) => {
      const a = { 'bot-1': { id: 'xa_1', operativeId: 'op1', owner: 'owner1', name: 'Bot1' }, 'bot-2': { id: 'xa_2', operativeId: 'op2', owner: 'owner2', name: 'Bot2' } }[String(req.headers['x-test-agent'] || '')];
      if (!a) return res.status(401).json({ success: false, error: 'agent bearer token required' });
      req.agent = a; next();
    }
  }));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/school';
  async function call(method, p, o) {
    o = o || {};
    const headers = { 'content-type': 'application/json' };
    if (o.uid) headers['x-test-uid'] = o.uid;
    if (o.agent) headers['x-test-agent'] = o.agent;
    const res = await fetch(base + p, { method, headers, body: o.raw !== undefined ? o.raw : (o.body ? JSON.stringify(o.body) : undefined) });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  }
  return { academy, economy, opsDb, call, close: () => server.close(), tick: (ms) => { clock += ms; } };
}

runAll('school-routes', {
  async 'public skill listing never includes lesson content'() {
    const w = await boot();
    const r = await w.call('GET', '/skills');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.skills.length, 1);
    assert.ok(!('lesson' in r.json.skills[0]));
    assert.ok(!JSON.stringify(r.json).includes('Before calling a tool'));
    const one = await w.call('GET', '/skills/tool-hygiene');
    assert.strictEqual(one.json.skill.price_sparks, 20);
    assert.ok(!('lesson' in one.json.skill));
    assert.strictEqual((await w.call('GET', '/skills/nope-skill')).status, 404);
    assert.strictEqual((await w.call('GET', '/faculty')).json.faculty.length, 7);
    w.close();
  },
  async 'lesson is served only with a matching paid enrollment'() {
    const w = await boot();
    assert.strictEqual((await w.call('GET', '/skills/tool-hygiene/lesson', { uid: 'owner1' })).status, 403);
    const enr = await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene' } });
    assert.strictEqual(enr.status, 200, JSON.stringify(enr.json));
    const id = enr.json.enrollment.id;
    assert.strictEqual((await w.call('GET', '/skills/tool-hygiene/lesson?enrollmentId=' + id, { uid: 'owner2' })).status, 403);   // someone else's enrollment
    assert.strictEqual((await w.call('GET', '/skills/tool-hygiene/lesson?enrollmentId=' + id)).status, 401);                      // not signed in
    const ok = await w.call('GET', '/skills/tool-hygiene/lesson?enrollmentId=' + id, { uid: 'owner1' });
    assert.strictEqual(ok.status, 200);
    assert.ok(/Before calling a tool/.test(ok.json.lesson.prompt_template));
    w.close();
  },
  async 'publishing needs the teacher role, forces teacher identity, house skills are admin only'() {
    const w = await boot();
    const mine = (o) => sampleSkill(Object.assign({ id: 'my-skill', version: '1.0.0', teacher: { type: 'house', id: 'NEXUS' } }, o || {}));
    assert.strictEqual((await w.call('POST', '/skills', { uid: 'owner2', body: mine() })).status, 403);                       // student
    assert.strictEqual((await w.call('POST', '/skills', { body: mine() })).status, 401);
    assert.strictEqual((await w.call('POST', '/admin/roles', { uid: 'owner2', body: { target: 'owner2', role: 'teacher', action: 'grant' } })).status, 403);
    assert.strictEqual((await w.call('POST', '/admin/roles', { uid: 'owner1', body: { target: 'owner2', role: 'teacher', action: 'grant' } })).status, 200);
    assert.strictEqual((await w.call('POST', '/skills', { uid: 'owner2', body: mine() })).status, 403);                       // house teacher: admin only
    const ok = await w.call('POST', '/skills', { uid: 'owner2', body: mine({ teacher: { type: 'owner', id: 'someone-else' } }) });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
    assert.deepStrictEqual(ok.json.skill.teacher, { type: 'owner', id: 'owner2' });                                           // forced to the caller
    assert.strictEqual((await w.call('POST', '/skills', { uid: 'owner1', body: mine({ id: 'house-skill' }) })).status, 200);   // admin may publish house skills
    assert.strictEqual((await w.call('GET', '/admin/audit', { uid: 'owner1' })).json.audit.length, 1);
    assert.strictEqual((await w.call('GET', '/admin/audit', { uid: 'owner2' })).status, 403);
    w.close();
  },
  async 'enrolling someone elses agent is forbidden; unknown skill 404-ish; funds checked'() {
    const w = await boot();
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op2', skillId: 'tool-hygiene' } })).status, 403);
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'no-such-skill' } })).status, 404);
    assert.ok(w.academy.registry.publish(sampleSkill({ id: 'pricey-skill', price_sparks: 9000 })).ok);
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'pricey-skill' } })).status, 402);
    w.close();
  },
  async 'full learning flow over HTTP installs the skill and records a verified receipt'() {
    const w = await boot();
    const enr = (await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene' } })).json.enrollment;
    const b = (await w.call('POST', '/exams/begin', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: true } })).json;   // withSkill in body is ignored
    assert.ok(b.attemptId, JSON.stringify(b));
    assert.strictEqual((await w.call('POST', '/exams/submit', { uid: 'owner2', body: { attemptId: b.attemptId, outputs: {} } })).status, 403);   // other owner
    const sb = await w.call('POST', '/exams/submit', { uid: 'owner1', body: { attemptId: b.attemptId, outputs: answerAll(b.tasks, []) } });
    assert.strictEqual(sb.json.score, 0);
    const e = (await w.call('POST', '/exams/begin', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene', kind: 'exam' } })).json;
    await w.call('POST', '/exams/submit', { uid: 'owner1', body: { attemptId: e.attemptId, outputs: answerAll(e.tasks, GOOD) } });
    const fin = await w.call('POST', '/finish', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: enr.id } });
    assert.strictEqual(fin.status, 200, JSON.stringify(fin.json));
    assert.strictEqual(fin.json.passed, true); assert.strictEqual(fin.json.installed, true);
    assert.ok(w.opsDb.op1.tools.includes('search'));
    const rc = await w.call('GET', '/agents/op1/receipts', { uid: 'owner1' });
    assert.strictEqual(rc.json.receipts.length, 1); assert.strictEqual(rc.json.chain.ok, true);
    assert.strictEqual((await w.call('GET', '/agents/op1/receipts', { uid: 'owner2' })).status, 403);
    assert.strictEqual((await w.call('GET', '/agents/op1/skills', { uid: 'owner1' })).json.skills[0].skillId, 'tool-hygiene');
    assert.strictEqual(await w.economy.getBalance('owner1'), 180);
    w.close();
  },
  async 'exams need a paid enrollment first'() {
    const w = await boot();
    const r = await w.call('POST', '/exams/begin', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene', kind: 'baseline' } });
    assert.strictEqual(r.status, 402);
    assert.strictEqual((await w.call('POST', '/exams/begin', { uid: 'owner1', body: { agentId: 'op2', skillId: 'tool-hygiene', kind: 'baseline' } })).status, 403);
    w.close();
  },
  async 'homework returns a critique and needs an enrollment and a rubric'() {
    const w = await boot();
    const body = { agentId: 'op1', skillId: 'tool-hygiene', artifact: { kind: 'text', text: 'my plan' }, provenance: { prompt: 'make a plan' } };
    assert.strictEqual((await w.call('POST', '/homework', { uid: 'owner1', body })).status, 402);
    await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene' } });
    const r = await w.call('POST', '/homework', { uid: 'owner1', body });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.critique.focus_next, 'composition');
    assert.strictEqual((await w.call('POST', '/homework', { uid: 'owner2', body })).status, 403);
    assert.strictEqual((await w.call('POST', '/homework', { uid: 'owner1', body: Object.assign({}, body, { artifact: { kind: 'text', text: 'key sk-abcdefghijklmnopqrstuv' } }) })).status, 400);
    w.close();
  },
  async 'classes: create, list, join with ownership'() {
    const w = await boot();
    const spec = { name: 'Tools 101', track: 'tools', tier: 'spark', syllabus: ['tool-hygiene'], teacher: { type: 'house', id: 'NEXUS' }, room: 'tool-foundry', capacity: 3, kind: 'open' };
    assert.strictEqual((await w.call('POST', '/classes', { uid: 'owner2', body: spec })).status, 403);
    const c = await w.call('POST', '/classes', { uid: 'owner1', body: spec });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const list = await w.call('GET', '/classes');
    assert.strictEqual(list.json.classes.length, 1);
    assert.ok(!('members' in list.json.classes[0]));
    assert.strictEqual((await w.call('POST', '/classes/' + c.json.class.id + '/join', { uid: 'owner1', body: { agentId: 'op2' } })).status, 403);
    assert.strictEqual((await w.call('POST', '/classes/' + c.json.class.id + '/join', { uid: 'owner1', body: { agentId: 'op1' } })).status, 200);
    w.close();
  },
  async 'admin review queue: only admins list and resolve'() {
    const w = await boot();
    const academy = w.academy;
    const bench = sampleBenchmark({ id: 'review-bench', grader: 'rubric', rubric: sampleRubric(), perAttempt: 1 });
    assert.strictEqual((await w.call('POST', '/benchmarks', { uid: 'owner2', body: bench })).status, 403);
    assert.strictEqual((await w.call('POST', '/benchmarks', { uid: 'owner1', body: bench })).status, 200);
    assert.strictEqual((await w.call('POST', '/rubrics', { uid: 'owner1', body: sampleRubric({ id: 'other-rubric' }) })).status, 200);
    assert.strictEqual((await w.call('GET', '/admin/review', { uid: 'owner2' })).status, 403);
    assert.strictEqual((await w.call('GET', '/admin/review', { uid: 'owner1' })).json.review.length, 0);
    assert.strictEqual((await w.call('POST', '/admin/review/att_nope', { uid: 'owner1', body: { taskScores: {} } })).status, 404);
    assert.ok(academy);
    w.close();
  },
  async 'bad input never crashes: malformed JSON, secrets, prototype keys, wrong types'() {
    const w = await boot();
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', raw: '{not json' })).status, 400);
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: '__proto__', skillId: 'tool-hygiene' } })).status, 403);
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 5, skillId: ['x'] } })).status, 400);
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene', api_key: 'x' } })).status, 400);
    assert.strictEqual((await w.call('GET', '/skills/__proto__')).status, 404);
    assert.strictEqual((await w.call('POST', '/exams/submit', { uid: 'owner1', body: { attemptId: '__proto__' } })).status, 404);
    assert.strictEqual((await w.call('GET', '/nope')).status, 404);
    w.close();
  }
});
