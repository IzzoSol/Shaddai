'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const { runAll } = require('./lib/academy/testkit');
const { boot } = require('./lib/academy/http-testkit');
const { seedCurriculum } = require('./lib/academy/curriculum');

const BODY = '# A guide\n\n' + 'Write one clear idea per paragraph and cut every word that does not help the reader. '.repeat(4);
const as = (uid, body) => ({ uid, body });
const pub = (o) => Object.assign({ room: 'scriptorium', title: 'Writing with Heat', kind: 'guide', body: BODY, price_sparks: 40, authors: [{ type: 'owner', id: 'owner2', share: 100 }] }, o || {});

runAll('press-routes', {
  async 'house course books are listed without bodies and filter by room'() {
    const w = await boot(); seedCurriculum(w.academy);
    const all = await w.call('GET', '/press/titles');
    assert.strictEqual(all.status, 200);
    assert.strictEqual(all.json.titles.length, 11);
    assert.ok(all.json.titles.every((t) => !('body' in t)));
    const room = await w.call('GET', '/press/titles?room=tool-foundry');
    assert.ok(room.json.titles.length >= 2 && room.json.titles.every((t) => t.room === 'tool-foundry'));
    assert.strictEqual((await w.call('GET', '/press/titles/' + all.json.titles[0].id)).json.title.id, all.json.titles[0].id);
    assert.strictEqual((await w.call('GET', '/press/titles/__proto__')).status, 404);
    w.close();
  },
  async 'buying a book grants a read entitlement; reading without one is forbidden'() {
    const w = await boot(); seedCurriculum(w.academy);
    const t = (await w.call('GET', '/press/titles?room=scriptorium')).json.titles[0];
    assert.strictEqual((await w.call('GET', '/press/read/' + t.id)).status, 401);
    assert.strictEqual((await w.call('GET', '/press/read/' + t.id, { uid: 'owner1' })).status, 403);
    const buy = await w.call('POST', '/press/buy', as('owner1', { titleId: t.id }));
    assert.strictEqual(buy.status, 200, JSON.stringify(buy.json));
    const again = await w.call('POST', '/press/buy', as('owner1', { titleId: t.id }));
    assert.strictEqual(again.status, 200);
    assert.strictEqual(await w.economy.getBalance('owner1'), 200 - t.price_sparks);          // charged once
    const read = await w.call('GET', '/press/read/' + t.id, { uid: 'owner1' });
    assert.strictEqual(read.status, 200);
    assert.ok(read.json.body.length > 100);
    assert.strictEqual((await w.call('GET', '/press/read/' + t.id, { uid: 'owner2' })).status, 403);
    assert.strictEqual((await w.call('POST', '/press/buy', as('owner1', { titleId: 'bk_missing' }))).status, 404);
    assert.strictEqual((await w.call('POST', '/press/buy', { body: { titleId: t.id } })).status, 401);
    w.close();
  },
  async 'teachers publish, admins approve, then the title is on sale'() {
    const w = await boot();
    assert.strictEqual((await w.call('POST', '/press/titles', as('owner2', pub()))).status, 403);                     // student
    await w.call('POST', '/admin/roles', as('owner1', { target: 'owner2', role: 'teacher', action: 'grant' }));
    const p = await w.call('POST', '/press/titles', as('owner2', pub()));
    assert.strictEqual(p.status, 200, JSON.stringify(p.json));
    assert.strictEqual(p.json.title.status, 'pending');
    assert.strictEqual((await w.call('GET', '/press/titles')).json.titles.length, 0);
    assert.strictEqual((await w.call('GET', '/press/pending', { uid: 'owner2' })).status, 403);
    assert.strictEqual((await w.call('GET', '/press/pending', { uid: 'owner1' })).json.titles.length, 1);
    assert.strictEqual((await w.call('POST', '/press/approve', as('owner2', { titleId: p.json.title.id, approve: true }))).status, 403);
    assert.strictEqual((await w.call('POST', '/press/approve', as('owner1', { titleId: p.json.title.id, approve: true }))).status, 200);
    assert.strictEqual((await w.call('GET', '/press/titles')).json.titles.length, 1);
    assert.strictEqual((await w.call('POST', '/press/buy', as('owner1', { titleId: p.json.title.id }))).status, 200);
    assert.strictEqual(await w.economy.getBalance('owner2'), 200 + 32);                                               // 80% of 40
    w.close();
  },
  async 'publishing rejects secrets, bad rooms and impersonating authors; funds are checked on buy'() {
    const w = await boot();
    await w.call('POST', '/admin/roles', as('owner1', { target: 'owner2', role: 'teacher', action: 'grant' }));
    assert.strictEqual((await w.call('POST', '/press/titles', as('owner2', pub({ body: BODY + ' key sk-abcdefghijklmnopqrstuv' })))).status, 400);
    assert.strictEqual((await w.call('POST', '/press/titles', as('owner2', pub({ room: 'nowhere' })))).status, 400);
    assert.strictEqual((await w.call('POST', '/press/titles', as('owner2', pub({ authors: [{ type: 'owner', id: 'owner1', share: 100 }] })))).status, 400);
    assert.strictEqual((await w.call('POST', '/press/titles', as('owner2', pub({ authors: [{ type: 'house', id: 'TURTLE', share: 100 }] })))).status, 403);   // house works are admin only
    const big = await w.call('POST', '/press/titles', as('owner1', pub({ title: 'Expensive', body: BODY + ' expensive', price_sparks: 5000, authors: [{ type: 'house', id: 'QUILL', share: 100 }] })));
    assert.strictEqual(big.status, 200, JSON.stringify(big.json));
    assert.strictEqual((await w.call('POST', '/press/buy', as('owner2', { titleId: big.json.title.id }))).status, 402);
    w.close();
  },
  async 'a skill with prerequisites cannot be enrolled until they are installed'() {
    const w = await boot(); seedCurriculum(w.academy);
    const r = await w.call('POST', '/enroll', as('owner1', { agentId: 'op1', skillId: 'tool-error-recovery' }));
    assert.strictEqual(r.status, 400);
    assert.ok(/tool-protocol/.test(r.json.error), r.json.error);
    const bot = await w.call('POST', '/xagent/enroll', { agent: 'bot-1', body: { skillId: 'tool-error-recovery' } });
    assert.strictEqual(bot.status, 400);
    w.opsDb.op1.skills = [{ skillId: 'tool-protocol', version: '1.0.0', hash: 'h', receiptId: 'rc_x' }];
    assert.strictEqual((await w.call('POST', '/enroll', as('owner1', { agentId: 'op1', skillId: 'tool-error-recovery' }))).status, 200);
    w.close();
  }
});
