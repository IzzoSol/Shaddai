'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const { runAll, sampleSkill, sampleBenchmark, sampleRubric } = require('./lib/academy/testkit');
const { boot } = require('./lib/academy/http-testkit');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));

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
  async 'progress: 401 signed out; 7 tiers + owned agents signed in; current enrollment shown'() {
    const w = await boot();
    assert.strictEqual((await w.call('GET', '/progress')).status, 401);
    const p = await w.call('GET', '/progress', { uid: 'owner1' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.json));
    assert.strictEqual(p.json.ok, true);
    assert.strictEqual(p.json.tiers.length, 7);
    assert.strictEqual(p.json.tiers[0].name, 'Artificial Intelligence');
    assert.strictEqual(p.json.tiers[6].name, 'Agentic AI');
    assert.strictEqual(p.json.agents.length, 1);
    assert.strictEqual(p.json.agents[0].agentId, 'op1');
    assert.deepStrictEqual(p.json.agents[0].passed, []);
    assert.strictEqual(p.json.agents[0].current, null);
    // someone else's agent is not listed, and scoping to it is forbidden
    assert.strictEqual((await w.call('GET', '/progress?agentId=op2', { uid: 'owner1' })).status, 403);
    // after enrolling, the open enrollment shows as current
    assert.strictEqual((await w.call('POST', '/enroll', { uid: 'owner1', body: { agentId: 'op1', skillId: 'tool-hygiene' } })).status, 200);
    const p2 = await w.call('GET', '/progress', { uid: 'owner1' });
    assert.strictEqual(p2.json.agents[0].current.skillId, 'tool-hygiene');
    assert.ok(p2.json.agents[0].current.enrollmentId);
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
