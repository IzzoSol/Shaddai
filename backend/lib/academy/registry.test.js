'use strict';
const assert = require('assert');
const { runAll, tmpStore, sampleSkill } = require('./testkit');
const { createRegistry } = require('./registry');

runAll('registry', {
  'publish then get latest'() {
    const r = createRegistry(tmpStore());
    const p = r.publish(sampleSkill());
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.strictEqual(r.get('tool-hygiene').version, '1.0.0');
  },
  'new version must be greater, same teacher only'() {
    const r = createRegistry(tmpStore());
    r.publish(sampleSkill());
    assert.ok(!r.publish(sampleSkill()).ok);                      // same version
    assert.ok(!r.publish(sampleSkill({ version: '0.9.0' })).ok);  // lower
    assert.ok(!r.publish(sampleSkill({ version: '1.1.0', teacher: { type: 'owner', id: 'someone' } })).ok);
    const up = r.publish(sampleSkill({ version: '1.1.0' }));
    assert.ok(up.ok);
    assert.strictEqual(r.get('tool-hygiene').version, '1.1.0');
    assert.strictEqual(r.history('tool-hygiene').length, 2);
  },
  'invalid skills are not stored'() {
    const r = createRegistry(tmpStore());
    assert.ok(!r.publish(sampleSkill({ track: 'nope' })).ok);
    assert.strictEqual(r.get('tool-hygiene'), null);
  },
  'list filters by track and tier; retire hides'() {
    const r = createRegistry(tmpStore());
    r.publish(sampleSkill());
    r.publish(sampleSkill({ id: 'trade-basics', track: 'trading', tier: 'adept' }));
    assert.strictEqual(r.list({}).length, 2);
    assert.strictEqual(r.list({ track: 'trading' }).length, 1);
    assert.strictEqual(r.list({ tier: 'spark' })[0].id, 'tool-hygiene');
    r.retire('tool-hygiene');
    assert.strictEqual(r.get('tool-hygiene'), null);
    assert.strictEqual(r.list({}).length, 1);
  }
});
