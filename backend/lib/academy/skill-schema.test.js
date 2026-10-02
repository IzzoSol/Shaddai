'use strict';
const assert = require('assert');
const { runAll, sampleSkill } = require('./testkit');
const { validateSkill, TRACKS } = require('./skill-schema');

runAll('skill-schema', {
  'accepts a valid skill and adds a stable hash'() {
    const a = validateSkill(sampleSkill());
    assert.ok(a.ok, JSON.stringify(a.errors));
    assert.strictEqual(a.skill.hash.length, 64);
    assert.strictEqual(validateSkill(sampleSkill()).skill.hash, a.skill.hash);
    assert.notStrictEqual(validateSkill(sampleSkill({ version: '1.0.1' })).skill.hash, a.skill.hash);
  },
  'rejects bad id, track, tier, version, price'() {
    for (const bad of [{ id: 'X' }, { track: 'cooking' }, { tier: 'god' }, { version: '1.0' }, { price_sparks: -1 }, { price_sparks: 1.5 }]) {
      assert.ok(!validateSkill(sampleSkill(bad)).ok, JSON.stringify(bad));
    }
    assert.ok(TRACKS.includes('trading'));
  },
  'rejects secret-looking keys and values anywhere'() {
    const k = sampleSkill(); k.lesson.api_key = 'x';
    assert.ok(!validateSkill(k).ok);
    const v = sampleSkill(); v.lesson.examples = ['use sk-abcdefghijkl to call'];
    assert.ok(!validateSkill(v).ok);
    const h = sampleSkill(); h.summary = 'a'.repeat(64).replace(/a/g, 'f');
    assert.ok(!validateSkill(h).ok);
  },
  'strips markup from text fields'() {
    const r = validateSkill(sampleSkill({ name: 'Tool <b>Hygiene</b>' }));
    assert.ok(r.ok);
    assert.strictEqual(r.skill.name, 'Tool Hygiene');
  },
  'caps sizes and list lengths'() {
    const s = sampleSkill(); s.lesson.prompt_template = 'x'.repeat(6001);
    assert.ok(!validateSkill(s).ok);
    const t = sampleSkill(); t.lesson.checklist = new Array(21).fill('c');
    assert.ok(!validateSkill(t).ok);
  },
  'rejects non-objects and missing sections'() {
    assert.ok(!validateSkill(null).ok);
    assert.ok(!validateSkill([]).ok);
    const s = sampleSkill(); delete s.teacher;
    assert.ok(!validateSkill(s).ok);
  }
});
