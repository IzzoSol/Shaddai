'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const { runAll, tmpDir } = require('./testkit');
const { EconomyService } = require('../../economy-service');
const { createAcademy } = require('./academy-core');
const { ENTRIES, seedCurriculum } = require('./curriculum');
const { createAgentRunner } = require('./agent-runner');

const BY_PROMPT = {};
for (const e of ENTRIES) for (const t of e.bench.tasks) BY_PROMPT[t.prompt + '|' + e.skill.id + '|' + t.id] = { e, t };

async function world(opts) {
  opts = opts || {};
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  await economy.grant('owner1', opts.funds === undefined ? 300 : opts.funds, 'test.seed', 'seed-o1');
  const opsDb = { op1: { id: 'op1', owner: 'owner1', codename: 'ASTER', brain: { persona: 'Calm and exact.' }, tools: [], skills: [] }, op2: { id: 'op2', owner: 'owner2', codename: 'OTHER', tools: [], skills: [] } };
  const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(opsDb, id) ? opsDb[id] : null), update: (id, p) => Object.assign(opsDb[id], p) };
  const clock = { t: 1700000000000 };
  const academy = createAcademy({ dir: tmpDir(), economy, operatives, adminIds: ['owner1'], now: () => clock.t, hooks: { passed() {}, failed() {}, homeworkImproved() {}, taught() {}, classCompleted() {} }, judge: async () => ({ scores: {} }) });
  seedCurriculum(academy);
  const calls = [];
  const state = { broken: false };
  // A stand-in LLM: it only answers well when the lesson is in its system prompt, like a real model that has not learned the skill.
  const chat = opts.chat || (async (messages) => {
    const sys = messages[0].content; const user = messages[1].content;
    calls.push({ sys, user });
    const hasLesson = sys.includes('SKILL LESSON');
    if (state.broken) throw new Error('provider down');
    const hit = Object.keys(BY_PROMPT).map((k) => BY_PROMPT[k]).find((x) => user.includes('Task [' + x.t.id + ']: ' + x.t.prompt));
    if (!hit) return { text: 'I do not know.' };
    if (!hasLesson) return { text: hit.e.bench.grader === 'tool_use' ? '[{"tool":"search","args":{"query":"x"}}]' : 'Here is some text.' };
    const model = hit.e.fixtures.model(hit.t);
    return { text: typeof model === 'string' ? model : 'Sure:\n' + JSON.stringify(model) };
  });
  const runner = createAgentRunner({ academy, operatives, chat });
  return { academy, economy, opsDb, runner, calls, clock, state };
}

runAll('agent-runner', {
  async 'an agent learns a skill: baseline without the lesson, exam with it, finish installs it'() {
    const w = await world();
    const r = await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.passed, true);
    assert.ok(r.exam - r.baseline >= 0.3);
    assert.strictEqual(r.installed, true);
    assert.ok(w.opsDb.op1.tools.includes('tool-protocol'));
    assert.strictEqual(w.academy.receipts.verifyChain('op1').ok, true);
    assert.strictEqual(await w.economy.getBalance('owner1'), 280);                          // tuition 20 charged once
    // honesty: the first three calls are the baseline and must not contain the lesson; the exam calls must
    const lessonText = w.academy.registry.get('tool-protocol').lesson.prompt_template.slice(0, 40);
    assert.strictEqual(w.calls.length, 6);
    for (const c of w.calls.slice(0, 3)) { assert.ok(!c.sys.includes('SKILL LESSON') && !c.sys.includes(lessonText) && !c.user.includes(lessonText)); }
    for (const c of w.calls.slice(3)) assert.ok(c.sys.includes('SKILL LESSON') && c.sys.includes(lessonText));
    assert.ok(w.calls[0].sys.includes('ASTER') && w.calls[0].sys.includes('Calm and exact.'));       // persona carried
    assert.ok(w.calls[0].user.includes('"tools"'));                                                  // the tool catalog is shown
  },
  async 'text skills work too and the answer format matches the grader'() {
    const w = await world();
    const r = await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'seo-audit' });
    assert.ok(r.ok && r.passed, JSON.stringify(r));
    assert.ok(/plain text/i.test(w.calls[0].user));
    const t = await world();
    await t.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(/JSON array of tool calls/.test(t.calls[0].user));
    const p = await world();
    await p.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'paper-risk-basics' });
    assert.ok(/JSON array of orders/.test(p.calls[0].user));
  },
  async 'guards: not your agent, missing prerequisites, unknown skill, no funds (and nothing runs)'() {
    const w = await world({ funds: 5 });
    assert.ok(!(await w.runner.learn({ ownerId: 'owner1', agentId: 'op2', skillId: 'tool-protocol' })).ok);
    assert.ok(!(await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'no-such-skill' })).ok);
    const pre = await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-error-recovery' });
    assert.ok(!pre.ok && /tool-protocol/.test(pre.error));
    const poor = await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(!poor.ok && poor.stage === 'enroll');
    assert.strictEqual(w.calls.length, 0);                                                          // no LLM spend without tuition
  },
  async 'an agent that already has the skill is not charged or run again'() {
    const w = await world();
    await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    const n = w.calls.length;
    const again = await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(!again.ok && /already/.test(again.error));
    assert.strictEqual(w.calls.length, n);
  },
  async 'a failing or garbage model never installs a skill and never crashes'() {
    const w = await world({ chat: async () => ({ text: 'not json at all <script>alert(1)</script>' }) });
    const r = await w.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(r.ok);
    assert.strictEqual(r.passed, false);
    assert.deepStrictEqual(w.opsDb.op1.skills, []);
    // A provider outage must not zero the baseline (that would inflate lift) and must not cost the owner tuition twice.
    const d = await world();
    d.state.broken = true;
    const f = await d.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(!f.ok && /provider down|model/.test(f.error), JSON.stringify(f));
    assert.strictEqual(f.stage, 'baseline');
    assert.deepStrictEqual(d.opsDb.op1.skills, []);
    assert.strictEqual(await d.economy.getBalance('owner1'), 280);                          // tuition was charged once
    d.state.broken = false;
    const ok = await d.runner.learn({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-protocol' });
    assert.ok(ok.ok && ok.passed, JSON.stringify(ok));
    assert.strictEqual(await d.economy.getBalance('owner1'), 280);                          // the retry reused the open enrollment
  }
});
