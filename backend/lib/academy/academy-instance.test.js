'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runAll, tmpDir, sampleSkill } = require('./testkit');
const { EconomyService } = require('../../economy-service');
const inst = require('./academy-instance');

const SERVER = path.join(__dirname, '..', '..', 'server-production.js');

runAll('academy-instance', {
  'buildAcademy wires the core with injected dependencies'() {
    const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
    const operatives = { get: () => null, update: () => null };
    const a = inst.buildAcademy({ dir: tmpDir(), economy, operatives, judge: async () => ({ scores: {} }), hooks: { passed() {}, failed() {}, homeworkImproved() {}, taught() {}, classCompleted() {} } });
    assert.strictEqual(typeof a.finishExam, 'function');
    assert.ok(a.registry.publish(sampleSkill()).ok);
  },
  'default judge goes through the llm router lazily and fails closed without a key'() {
    const j = inst.defaultJudge();
    assert.strictEqual(typeof j, 'function');
    return assert.rejects(() => inst.defaultJudge({ chat: async () => { throw new Error('no provider'); } })({ criteria: [] }, {}, 'A'), /no provider/);
  },
  'uidFromReq accepts a verified uid and rejects empty, local and oversized ids'() {
    assert.strictEqual(inst.uidFromReq({ userId: 'u_123' }), 'u_123');
    assert.strictEqual(inst.uidFromReq({ userId: 'local' }), '');
    assert.strictEqual(inst.uidFromReq({}), '');
    assert.strictEqual(inst.uidFromReq({ userId: 'x'.repeat(129) }), '');
    assert.strictEqual(inst.uidFromReq({ userId: ' u_1 ' }), 'u_1');
    assert.strictEqual(inst.uidFromReq({ headers: { 'x-user-id': 'spoof' } }), '');            // headers are never trusted here
  },
  'externalAgents still exports its routers and now the bearer middleware'() {
    const ext = require('../../../server/externalAgents');
    assert.strictEqual(typeof ext.agentAuth, 'function');
    assert.ok(ext.xagent && ext.jobs && ext._test);
  },
  'server-production mounts the school router and still parses'() {
    execFileSync(process.execPath, ['--check', SERVER]);
    const src = fs.readFileSync(SERVER, 'utf8');
    assert.ok(/app\.use\('\/api\/school'/.test(src), 'school router is not mounted');
    assert.ok(/createSchoolRouter/.test(src));
    assert.ok(/agentAuth:\s*_ext\w*\.agentAuth/.test(src), 'bot routes must use the existing bearer middleware');
    assert.ok(src.indexOf("app.use('/api/school'") > src.indexOf("app.use('/api/academy'"));
  }
});
