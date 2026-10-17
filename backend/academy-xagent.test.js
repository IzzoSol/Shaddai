'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runAll, sampleSkill } = require('./lib/academy/testkit');
const { boot } = require('./lib/academy/http-testkit');
const { buildToolManifest, ACTIONS } = require('./lib/academy/tool-manifest');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));
const bot = (w, m, p, body, agent) => w.call(m, p, { agent: agent || 'bot-1', body });

async function learn(w, skillId, agent) {
  const enr = (await bot(w, 'POST', '/xagent/enroll', { skillId }, agent)).json.enrollment;
  const b = (await bot(w, 'POST', '/xagent/exams/begin', { skillId, kind: 'baseline' }, agent)).json;
  await bot(w, 'POST', '/xagent/exams/submit', { attemptId: b.attemptId, outputs: answerAll(b.tasks, []) }, agent);
  const e = (await bot(w, 'POST', '/xagent/exams/begin', { skillId, kind: 'exam' }, agent)).json;
  await bot(w, 'POST', '/xagent/exams/submit', { attemptId: e.attemptId, outputs: answerAll(e.tasks, GOOD) }, agent);
  return bot(w, 'POST', '/xagent/finish', { skillId, enrollmentId: enr.id }, agent);
}

runAll('school-xagent', {
  async 'tool manifest needs no auth and has one tool per action in both formats'() {
    const w = await boot();
    const r = await w.call('GET', '/xagent/tools');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.openai.length, ACTIONS.length);
    assert.strictEqual(r.json.anthropic.length, ACTIONS.length);
    for (const t of r.json.anthropic) { assert.ok(/^academy_[a-z_]+$/.test(t.name)); assert.strictEqual(t.input_schema.type, 'object'); }
    for (const t of r.json.openai) { assert.strictEqual(t.type, 'function'); assert.ok(t.function.parameters.properties); }
    assert.ok(/\/school$/.test(r.json.baseUrl) || r.json.baseUrl.includes('/school'));
    w.close();
  },
  async 'buildToolManifest is pure and lists the core actions'() {
    const m = buildToolManifest({ baseUrl: 'https://x.test/api/school' });
    const names = m.anthropic.map((t) => t.name);
    for (const n of ['academy_catalog', 'academy_enroll', 'academy_get_lesson', 'academy_begin_exam', 'academy_submit_exam', 'academy_submit_homework', 'academy_finish', 'academy_receipts', 'academy_my_skills', 'academy_export_skill']) assert.ok(names.includes(n), n);
    assert.strictEqual(m.baseUrl, 'https://x.test/api/school');
    const enroll = m.anthropic.find((t) => t.name === 'academy_enroll');
    assert.deepStrictEqual(enroll.input_schema.required, ['skillId']);
  },
  async 'bot routes require the bearer'() {
    const w = await boot();
    for (const [m, p] of [['GET', '/xagent/catalog'], ['POST', '/xagent/enroll'], ['POST', '/xagent/finish'], ['GET', '/xagent/receipts'], ['GET', '/xagent/skills']]) {
      assert.strictEqual((await w.call(m, p, { body: m === 'POST' ? {} : undefined })).status, 401, m + ' ' + p);
    }
    w.close();
  },
  async 'a bot learns a skill end to end; server derives agent, owner, price and withSkill'() {
    const w = await boot();
    assert.strictEqual((await bot(w, 'GET', '/xagent/catalog')).json.skills.length, 1);
    const enr = await bot(w, 'POST', '/xagent/enroll', { skillId: 'tool-hygiene', agentId: 'op2', ownerId: 'owner2', price_sparks: 0 });
    assert.strictEqual(enr.status, 200, JSON.stringify(enr.json));
    assert.strictEqual(enr.json.enrollment.agentId, 'op1');       // from the token, not the body
    assert.strictEqual(enr.json.enrollment.ownerId, 'owner1');
    assert.strictEqual(enr.json.enrollment.price, 20);            // from the registry, not the body
    assert.strictEqual((await bot(w, 'GET', '/xagent/skills/tool-hygiene/lesson?enrollmentId=' + enr.json.enrollment.id, undefined, 'bot-2')).status, 403);
    const les = await bot(w, 'GET', '/xagent/skills/tool-hygiene/lesson?enrollmentId=' + enr.json.enrollment.id);
    assert.ok(/Before calling a tool/.test(les.json.lesson.prompt_template));
    const b = (await bot(w, 'POST', '/xagent/exams/begin', { skillId: 'tool-hygiene', kind: 'baseline', withSkill: true })).json;
    assert.ok(b.attemptId, JSON.stringify(b));
    assert.strictEqual((await bot(w, 'POST', '/xagent/exams/submit', { attemptId: b.attemptId, outputs: {} }, 'bot-2')).status, 403);   // another bot's attempt
    await bot(w, 'POST', '/xagent/exams/submit', { attemptId: b.attemptId, outputs: answerAll(b.tasks, []) });
    const e = (await bot(w, 'POST', '/xagent/exams/begin', { skillId: 'tool-hygiene', kind: 'exam' })).json;
    await bot(w, 'POST', '/xagent/exams/submit', { attemptId: e.attemptId, outputs: answerAll(e.tasks, GOOD) });
    const fin = await bot(w, 'POST', '/xagent/finish', { skillId: 'tool-hygiene', enrollmentId: enr.json.enrollment.id });
    assert.strictEqual(fin.status, 200, JSON.stringify(fin.json));
    assert.strictEqual(fin.json.passed, true); assert.strictEqual(fin.json.installed, true);
    const rc = await bot(w, 'GET', '/xagent/receipts');
    assert.strictEqual(rc.json.receipts.length, 1); assert.strictEqual(rc.json.chain.ok, true);
    assert.strictEqual((await bot(w, 'GET', '/xagent/receipts', undefined, 'bot-2')).json.receipts.length, 0);
    assert.strictEqual((await bot(w, 'GET', '/xagent/skills')).json.skills[0].skillId, 'tool-hygiene');
    w.close();
  },
  async 'homework through the bot returns a critique'() {
    const w = await boot();
    await bot(w, 'POST', '/xagent/enroll', { skillId: 'tool-hygiene' });
    const r = await bot(w, 'POST', '/xagent/homework', { skillId: 'tool-hygiene', artifact: { kind: 'text', text: 'my plan' }, provenance: { prompt: 'make a plan' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.critique.focus_next, 'composition');
    w.close();
  },
  async 'export is only for installed skills with a verified receipt; lesson ships only if transferable'() {
    const w = await boot();
    assert.strictEqual((await bot(w, 'GET', '/xagent/skills/tool-hygiene/export')).status, 404);                       // not learned yet
    assert.strictEqual((await learn(w, 'tool-hygiene')).json.installed, true);
    const ex = await bot(w, 'GET', '/xagent/skills/tool-hygiene/export');
    assert.strictEqual(ex.status, 200);
    assert.strictEqual(ex.json.skill.license, 'single');
    assert.ok(!('lesson' in ex.json.skill));
    assert.ok(ex.json.skill.receipt.receiptId && ex.json.skill.receipt.hash);
    assert.ok(w.academy.registry.publish(sampleSkill({ id: 'open-skill', license: 'transferable' })).ok);
    assert.strictEqual((await learn(w, 'open-skill')).json.installed, true);
    const open = await bot(w, 'GET', '/xagent/skills/open-skill/export');
    assert.ok(/Before calling a tool/.test(open.json.skill.lesson.prompt_template));
    assert.strictEqual((await bot(w, 'GET', '/xagent/skills/open-skill/export', undefined, 'bot-2')).status, 404);       // other bot never learned it
    w.close();
  },
  'the agent guide mentions every action path (drift check)'() {
    const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ACADEMY-AGENT-GUIDE.md'), 'utf8');
    for (const a of ACTIONS) assert.ok(guide.includes(a.path.split('?')[0]), 'guide is missing ' + a.path);
    assert.ok(/shdx_/.test(guide));
    assert.ok(/never send (a )?(secret|key)/i.test(guide));
  }
});
