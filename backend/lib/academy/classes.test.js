'use strict';
const assert = require('assert');
const { runAll, tmpStore, sampleSkill } = require('./testkit');
const { createRegistry } = require('./registry');
const { createRoles } = require('./roles');
const { createClasses } = require('./classes');
const { FACULTY } = require('./faculty');

function setup() {
  const store = tmpStore(); const registry = createRegistry(store);
  registry.publish(sampleSkill());
  registry.publish(sampleSkill({ id: 'trade-basics', track: 'trading', tier: 'adept' }));
  const roles = createRoles({ store, adminIds: ['owner'] });
  const classes = createClasses({ store, registry, roles });
  return { store, registry, roles, classes };
}
const spec = (o) => Object.assign({ name: 'Tools 101', track: 'tools', tier: 'spark', syllabus: ['tool-hygiene'], teacher: { type: 'house', id: 'NEXUS' }, room: 'tool-foundry', capacity: 2, kind: 'open', scholarshipSeats: 1 }, o || {});

runAll('roles+classes', {
  'faculty is the seven council agents with unique rooms'() {
    assert.deepStrictEqual(FACULTY.map((f) => f.agent).sort(), ['NEXUS', 'ORACLE', 'PIKADON', 'QUILL', 'SHADDAI', 'TURTLE', 'ZEROX']);
    assert.strictEqual(new Set(FACULTY.map((f) => f.room)).size, 7);
    assert.ok(FACULTY.every((f) => f.subjects.length >= 1));
  },
  'everyone is a student; only admins grant roles; changes are audited'() {
    const { roles } = setup();
    assert.deepStrictEqual(roles.rolesOf('rando'), ['student']);
    assert.ok(roles.can('rando', 'enroll'));
    assert.ok(!roles.can('rando', 'class.create'));
    assert.ok(!roles.grant({ by: 'rando', target: 'rando', role: 'admin' }).ok);
    assert.ok(roles.grant({ by: 'owner', target: 'tina', role: 'teacher' }).ok);
    assert.ok(roles.can('tina', 'class.create') && roles.can('tina', 'skill.publish'));
    assert.ok(roles.can('owner', 'anything.at.all'));
    assert.ok(roles.revoke({ by: 'owner', target: 'tina', role: 'teacher' }).ok);
    assert.ok(!roles.can('tina', 'class.create'));
    assert.strictEqual(roles.audit().length, 2);
    assert.ok(!roles.grant({ by: 'owner', target: 'x', role: 'wizard' }).ok);
  },
  'create requires permission, real syllabus skills, schedule for scheduled classes'() {
    const { classes, roles } = setup();
    assert.ok(!classes.create('rando', spec()).ok);
    assert.ok(classes.create('owner', spec()).ok);
    assert.ok(!classes.create('owner', spec({ syllabus: ['ghost-skill'] })).ok);
    assert.ok(!classes.create('owner', spec({ kind: 'scheduled' })).ok);
    assert.ok(classes.create('owner', spec({ kind: 'scheduled', schedule: { start: 1, end: 2 } })).ok);
    assert.ok(!classes.create('owner', spec({ kind: 'party' })).ok);
    roles.grant({ by: 'owner', target: 'tina', role: 'teacher' });
    assert.ok(classes.create('tina', spec()).ok);
  },
  'join respects capacity; scholarship seats need an admin and are limited'() {
    const { classes } = setup();
    const c = classes.create('owner', spec()).class;
    assert.ok(classes.join({ classId: c.id, agentId: 'a1' }).ok);
    assert.ok(classes.join({ classId: c.id, agentId: 'a1' }).ok);              // idempotent
    assert.ok(!classes.grantScholarship({ by: 'rando', classId: c.id, agentId: 'a2' }).ok);
    assert.ok(classes.grantScholarship({ by: 'owner', classId: c.id, agentId: 'a2' }).ok);
    assert.ok(!classes.join({ classId: c.id, agentId: 'a3' }).ok);              // capacity 2 reached
    assert.ok(!classes.grantScholarship({ by: 'owner', classId: c.id, agentId: 'a3' }).ok);
    assert.strictEqual(classes.roster(c.id).length, 2);
    assert.strictEqual(classes.roster(c.id).find((r) => r.agentId === 'a2').scholarship, true);
  },
  'recordPass tracks syllabus progress and flags completion once'() {
    const { classes } = setup();
    const c = classes.create('owner', spec({ syllabus: ['tool-hygiene', 'trade-basics'], capacity: 5 })).class;
    classes.join({ classId: c.id, agentId: 'a1' });
    const p1 = classes.recordPass({ classId: c.id, agentId: 'a1', skillId: 'tool-hygiene' });
    assert.deepStrictEqual([p1.ok, p1.classComplete], [true, false]);
    const p2 = classes.recordPass({ classId: c.id, agentId: 'a1', skillId: 'trade-basics' });
    assert.deepStrictEqual([p2.ok, p2.classComplete, p2.justCompleted], [true, true, true]);
    assert.strictEqual(classes.recordPass({ classId: c.id, agentId: 'a1', skillId: 'trade-basics' }).justCompleted, false);
    assert.ok(!classes.recordPass({ classId: c.id, agentId: 'nope', skillId: 'trade-basics' }).ok);
    assert.ok(!classes.recordPass({ classId: c.id, agentId: 'a1', skillId: 'not-in-syllabus' }).ok);
  }
});
