'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const { runAll, tmpDir, tmpStore, sampleSkill } = require('./testkit');
const { validateSkill } = require('./skill-schema');
const { EconomyService } = require('../../economy-service');
const { createRoles } = require('./roles');
const { ACADEMY_ECON } = require('./economy');
const { createPress, compileBook } = require('./press');

const BODY = '# Prompt craft\n\n' + 'Name the subject, the light, the lens, and the mood. Then iterate on one thing at a time. '.repeat(4);

async function setup() {
  const store = tmpStore();
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  for (const u of ['buyer', 'author', 'author2']) await economy.grant(u, 500, 'test.seed', 'seed-' + u);
  const roles = createRoles({ store, adminIds: ['admin'] });
  roles.grant({ by: 'admin', target: 'author', role: 'teacher' });
  roles.grant({ by: 'admin', target: 'author2', role: 'teacher' });
  const press = createPress({ store, economy, roles });
  return { press, economy, roles };
}
const book = (o) => Object.assign({ room: 'scriptorium', title: 'Writing with Heat', kind: 'guide', body: BODY, price_sparks: 40, authors: [{ type: 'owner', id: 'author', share: 100 }] }, o || {});

runAll('press', {
  'compileBook turns a skill into a markdown course book'() {
    const skill = validateSkill(sampleSkill()).skill;
    const md = compileBook(skill);
    assert.ok(md.startsWith('# Tool Hygiene'));
    assert.ok(md.includes('Before calling a tool'));
    assert.ok(md.includes('names the tool'));
    assert.ok(md.includes('search'));
    assert.ok(!md.includes('<script'));
  },
  async 'a first title from a new author is pending; admin approval lists it'() {
    const { press } = await setup();
    const p = press.publish(Object.assign({ by: 'author' }, book()));
    assert.ok(p.ok, JSON.stringify(p));
    assert.strictEqual(p.title.status, 'pending');
    assert.strictEqual(press.list({ room: 'scriptorium' }).length, 0);
    assert.strictEqual(press.pending().length, 1);
    assert.ok(!press.approve({ by: 'author', titleId: p.title.id, approve: true }).ok);      // not an admin
    assert.ok(press.approve({ by: 'admin', titleId: p.title.id, approve: true }).ok);
    assert.strictEqual(press.list({ room: 'scriptorium' }).length, 1);
    assert.ok(!('body' in press.list({})[0]));
    const next = press.publish(Object.assign({ by: 'author' }, book({ title: 'Second Book', body: BODY + ' more words here for a different body' })));
    assert.strictEqual(next.title.status, 'approved');                                       // trusted after the first approval
  },
  async 'publish validation: roles, rooms, size, secrets, shares, duplicates, house works'() {
    const { press } = await setup();
    assert.ok(!press.publish(Object.assign({ by: 'buyer' }, book())).ok);                                    // student cannot publish
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ room: 'nowhere' }))).ok);
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ body: 'short' }))).ok);
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ body: BODY + ' key sk-abcdefghijklmnopqrstuv' }))).ok);
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ price_sparks: -1 }))).ok);
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ authors: [{ type: 'owner', id: 'author', share: 60 }] }))).ok);   // shares must total 100
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ authors: [{ type: 'owner', id: 'author2', share: 100 }] }))).ok);  // you must be an author
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ authors: [{ type: 'house', id: 'TURTLE', share: 100 }] }))).ok);   // house works: admin only
    assert.ok(press.publish(Object.assign({ by: 'admin' }, book({ authors: [{ type: 'house', id: 'QUILL', share: 100 }] }))).ok);
    assert.ok(!press.publish(Object.assign({ by: 'admin' }, book({ authors: [{ type: 'house', id: 'NOPE', share: 100 }] }))).ok);
    const marked = press.publish(Object.assign({ by: 'author' }, book({ title: 'Marked <b>Up</b> Title', body: BODY + ' marked' })));
    assert.strictEqual(marked.title.title, 'Marked Up Title');
    assert.ok(!press.publish(Object.assign({ by: 'author' }, book({ title: 'Same body again', body: BODY + '  MARKED ' }))).ok);   // duplicate body (normalized)
  },
  async 'buying pays authors, burns 5%, funds the house, and grants a read entitlement once'() {
    const { press, economy } = await setup();
    const t = press.publish(Object.assign({ by: 'author' }, book({ authors: [{ type: 'owner', id: 'author', share: 50 }, { type: 'owner', id: 'author2', share: 50 }] }))).title;
    press.approve({ by: 'admin', titleId: t.id, approve: true });
    assert.ok(!(await press.buy({ ownerId: 'buyer', titleId: 'bk_missing' })).ok);
    const r = await Promise.all([press.buy({ ownerId: 'buyer', titleId: t.id }), press.buy({ ownerId: 'buyer', titleId: t.id })]);
    assert.ok(r.every((x) => x.ok));
    assert.strictEqual(await economy.getBalance('buyer'), 460);                         // charged once
    assert.strictEqual(await economy.getBalance('author'), 516);                        // 40 * 0.80 = 32, half each
    assert.strictEqual(await economy.getBalance('author2'), 516);
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.houseAccount), 6);         // 40 - 32 - 2 burned
  },
  async 'house faculty author share funds the scholarship pool'() {
    const { press, economy } = await setup();
    const t = press.publish({ by: 'admin', ...book({ room: 'co-creation-studio', authors: [{ type: 'house', id: 'TURTLE', share: 100 }] }) }).title;
    assert.strictEqual(t.status, 'approved');
    await press.buy({ ownerId: 'buyer', titleId: t.id });
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.scholarshipAccount), 32);
  },
  async 'insufficient funds buy nothing; free titles need no ledger call'() {
    const { press, economy } = await setup();
    const t = press.publish({ by: 'admin', ...book({ price_sparks: 5000, authors: [{ type: 'house', id: 'QUILL', share: 100 }] }) }).title;
    const r = await press.buy({ ownerId: 'buyer', titleId: t.id });
    assert.ok(!r.ok && r.insufficient);
    assert.ok(!press.read({ ownerId: 'buyer', titleId: t.id }).ok);
    const f = press.publish({ by: 'admin', ...book({ title: 'Free Guide', body: BODY + ' free', price_sparks: 0, authors: [{ type: 'house', id: 'QUILL', share: 100 }] }) }).title;
    assert.ok((await press.buy({ ownerId: 'buyer', titleId: f.id })).ok);
    assert.strictEqual(await economy.getBalance('buyer'), 500);
  },
  async 'read needs an entitlement or authorship; pending titles are unreadable'() {
    const { press } = await setup();
    const t = press.publish(Object.assign({ by: 'author' }, book())).title;                  // pending
    assert.ok(!(await press.buy({ ownerId: 'buyer', titleId: t.id })).ok);                    // cannot buy a pending title
    assert.ok(press.read({ ownerId: 'author', titleId: t.id }).ok);                           // authors can read their own
    assert.ok(!press.read({ ownerId: 'buyer', titleId: t.id }).ok);
    press.approve({ by: 'admin', titleId: t.id, approve: true });
    await press.buy({ ownerId: 'buyer', titleId: t.id });
    const r = press.read({ ownerId: 'buyer', titleId: t.id });
    assert.ok(r.ok && r.body.includes('Name the subject'));
    assert.ok(!press.read({ ownerId: 'author2', titleId: t.id }).ok);
    assert.ok(!press.read({ ownerId: 'buyer', titleId: '__proto__' }).ok);
  },
  async 'rejecting a title removes it from the queue and blocks purchase'() {
    const { press } = await setup();
    const t = press.publish(Object.assign({ by: 'author' }, book())).title;
    assert.ok(press.approve({ by: 'admin', titleId: t.id, approve: false }).ok);
    assert.strictEqual(press.pending().length, 0);
    assert.strictEqual(press.list({}).length, 0);
    assert.ok(!(await press.buy({ ownerId: 'buyer', titleId: t.id })).ok);
  }
});
