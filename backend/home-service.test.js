'use strict';
/**
 * home-service.test.js — plain node test runner (no framework).
 * Run:  node home-service.test.js
 *
 * Real EconomyService on a throwaway DEV file store + injectable clock.
 * Verifies: inhabit pays rent, rent idempotency per user+home+day,
 * insufficient balance (no mutation), check-in daily cap + idempotency,
 * grace -> lapse -> claimable, capacity, status tile, routes wiring.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

delete process.env.DATABASE_URL;

const { EconomyService, DevFileStore, InsufficientFundsError, ValidationError } = require('./economy-service');
const { HomeService, HomeError, addDays } = require('./home-service');

let passed = 0;
let failed = 0;
const failures = [];
const DAY = 86400000;
const T0 = Date.parse('2026-09-27T12:00:00Z');

async function test(name, fn) {
  const tmp = path.join(os.tmpdir(), `home-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const economy = new EconomyService({ store: new DevFileStore(tmp) });
  const clock = { t: T0 };
  const svc = new HomeService({ economy, now: () => clock.t });
  try {
    await fn({ svc, economy, clock });
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n        ') : err}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {}
  }
}

async function rejects(fn, check) {
  let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  assert.ok(threw, 'expected an error');
  check(threw);
  return threw;
}

// Drive an express Router without any network: fake req/res.
function callRoute(router, method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const hdrs = Object.assign({ 'x-forwarded-for': `t-${Math.random()}` }, headers || {});
    const req = {
      method, url, body: body || {}, headers: hdrs, query: {},
      get(h) { return hdrs[String(h).toLowerCase()]; }
    };
    const q = url.indexOf('?');
    if (q >= 0) for (const [k, v] of new URLSearchParams(url.slice(q + 1))) req.query[k] = v;
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); return this; },
      setHeader() {}, getHeader() {}
    };
    router.handle(req, res, (err) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}

(async () => {
  console.log('home-service tests (dev economy store, fake clock)\n');

  await test('inhabit pays today\'s rent (default 5) and lights the home', async ({ svc, economy }) => {
    await economy.grant('u1', 20, 'seed', 'seed');
    const r = await svc.inhabit('u1', 'home.a', { agents: ['nexus'] });
    assert.strictEqual(r.state, 'lit');
    assert.strictEqual(r.balance, 15);
    const s = await svc.status('u1');
    assert.strictEqual(s.lit, true);
    assert.strictEqual(s.state, 'lit');
    assert.strictEqual(s.rent_due, 0);
    assert.strictEqual(s.dashboard_id, 'home.a');
    assert.deepStrictEqual(s.agents, ['nexus']);
    assert.strictEqual(s.last_pings[0].type, 'rent');
    assert.strictEqual(s.last_pings[0].amount, -5);
  });

  await test('inhabit is idempotent for the same tenant (no double rent)', async ({ svc, economy }) => {
    await economy.grant('u1', 20, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');
    const again = await svc.inhabit('u1', 'home.a');
    assert.strictEqual(again.replayed, true);
    assert.strictEqual(await economy.getBalance('u1'), 15);
  });

  await test('insufficient balance: inhabit rejected, nothing changes', async ({ svc, economy }) => {
    await economy.grant('u1', 4, 'seed', 'seed');
    await rejects(() => svc.inhabit('u1', 'home.a'), (e) => assert.ok(e instanceof InsufficientFundsError));
    assert.strictEqual(await economy.getBalance('u1'), 4);
    const s = await svc.status('u1');
    assert.strictEqual(s.housed, false);
    const board = await svc.listHomes();
    assert.strictEqual(board.find((h) => h.home_id === 'home.a').state, 'empty');
  });

  await test('occupied home, one-home-per-user, unknown home, capacity', async ({ svc, economy }) => {
    await economy.grant('u1', 50, 'seed', 's1');
    await economy.grant('u2', 50, 'seed', 's2');
    await svc.inhabit('u1', 'home.a');
    await rejects(() => svc.inhabit('u2', 'home.a'), (e) => assert.strictEqual(e.code, 'HOME_OCCUPIED'));
    await rejects(() => svc.inhabit('u1', 'home.b'), (e) => assert.strictEqual(e.code, 'ALREADY_HOUSED'));
    await rejects(() => svc.inhabit('u2', 'home.z'), (e) => assert.strictEqual(e.code, 'NOT_FOUND'));
    await rejects(() => svc.setAgents('u1', 'home.a', ['a', 'b', 'c', 'd']), (e) => assert.strictEqual(e.code, 'CAPACITY_EXCEEDED'));
    const r = await svc.setAgents('u1', 'home.a', ['a', 'b', 'c']);
    assert.strictEqual(r.tenancy.agents.length, 3);
    assert.throws(() => new HomeService({ economy, homes: { 'home.x': { agent_capacity: 4 } } }), ValidationError);
  });

  await test('rent is idempotent per user+home+day (retry never double-charges)', async ({ svc, economy, clock }) => {
    await economy.grant('u1', 100, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');          // day0 paid -> 95
    clock.t += DAY;                              // day1 unpaid
    const a = await svc.payRent('u1', 'home.a');
    assert.strictEqual(a.spent, 5);
    assert.strictEqual(a.balance, 90);
    const b = await svc.payRent('u1', 'home.a'); // client retry same day
    assert.strictEqual(b.replayed, true);
    assert.strictEqual(b.spent, 0);
    assert.strictEqual(await economy.getBalance('u1'), 90);
    // Even if the home store forgot the payment, the ledger key replays.
    const day1 = new Date(clock.t).toISOString().slice(0, 10);
    const replay = await economy.spend('u1', 5, 'x', `home:rent:u1:home.a:${day1}`);
    assert.strictEqual(replay.replayed, true);
    assert.strictEqual(await economy.getBalance('u1'), 90);
  });

  await test('arrears in grace are paid day by day; prepay is bounded', async ({ svc, economy, clock }) => {
    await economy.grant('u1', 100, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');          // 95
    clock.t += 2 * DAY;                          // 2 days unpaid = grace limit
    let s = await svc.status('u1');
    assert.strictEqual(s.state, 'rent_due');
    assert.strictEqual(s.lit, true);
    assert.strictEqual(s.rent_due, 10);
    const r = await svc.payRent('u1', 'home.a');
    assert.strictEqual(r.paid_days.length, 2);
    assert.strictEqual(r.balance, 85);
    const today = new Date(clock.t).toISOString().slice(0, 10);
    const r2 = await svc.payRent('u1', 'home.a', { throughDay: addDays(today, 2) });
    assert.strictEqual(r2.spent, 10);
    await rejects(() => svc.payRent('u1', 'home.a', { throughDay: addDays(today, 30) }), (e) => assert.ok(e instanceof ValidationError));
    await rejects(() => svc.payRent('u1', 'home.a', { throughDay: 'nope' }), (e) => assert.ok(e instanceof ValidationError));
  });

  await test('insufficient balance for arrears: rejected with no partial payment', async ({ svc, economy, clock }) => {
    await economy.grant('u1', 12, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');          // 7 left
    clock.t += 2 * DAY;                          // owes 10
    await rejects(() => svc.payRent('u1', 'home.a'), (e) => assert.ok(e instanceof InsufficientFundsError));
    assert.strictEqual(await economy.getBalance('u1'), 7);
    assert.strictEqual((await svc.status('u1')).overdue_days, 2);
  });

  await test('lapse after grace: home dims, rent refused, claimable by others', async ({ svc, economy, clock }) => {
    await economy.grant('u1', 50, 'seed', 's1');
    await economy.grant('u2', 50, 'seed', 's2');
    await svc.inhabit('u1', 'home.a');
    clock.t += 3 * DAY;                          // grace 2 -> lapsed on day 3
    const s = await svc.status('u1');
    assert.strictEqual(s.state, 'lapsed');
    assert.strictEqual(s.dims, true);
    assert.strictEqual(s.lit, false);
    assert.strictEqual(s.rent_due, 0, 'arrears are not carried as debt');
    assert.strictEqual(s.last_pings[0].type, 'lapse');
    await rejects(() => svc.payRent('u1', 'home.a'), (e) => assert.strictEqual(e.code, 'HOME_LAPSED'));
    await rejects(() => svc.checkIn('u1', 'home.a'), (e) => assert.strictEqual(e.code, 'HOME_LAPSED'));
    const board = await svc.listHomes();
    const a = board.find((h) => h.home_id === 'home.a');
    assert.strictEqual(a.state, 'lapsed');
    assert.strictEqual(a.claimable, true);
    const r = await svc.inhabit('u2', 'home.a');
    assert.strictEqual(r.state, 'lit');
    assert.strictEqual((await svc.status('u2')).home_id, 'home.a');
    assert.strictEqual((await svc.status('u1')).housed, false);
    // Old tenant can take a different home now.
    await svc.inhabit('u1', 'home.b');
  });

  await test('check-in: requires lit, once per day, capped, idempotent', async ({ svc, economy, clock }) => {
    await economy.grant('u1', 20, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');          // 15
    const c1 = await svc.checkIn('u1', 'home.a');
    assert.strictEqual(c1.granted, 3);
    assert.strictEqual(c1.balance, 18);
    const c2 = await svc.checkIn('u1', 'home.a');
    assert.strictEqual(c2.replayed, true);
    assert.strictEqual(await economy.getBalance('u1'), 18);
    // Concurrent burst on a new day still mints once.
    clock.t += DAY;
    await svc.payRent('u1', 'home.a');          // 13
    await Promise.all(Array.from({ length: 10 }, () => svc.checkIn('u1', 'home.a')));
    assert.strictEqual(await economy.getBalance('u1'), 16);
    // Next day: rent unpaid -> check-in refused.
    clock.t += DAY;
    await rejects(() => svc.checkIn('u1', 'home.a'), (e) => assert.strictEqual(e.code, 'RENT_DUE'));
    assert.strictEqual((await svc.status('u1')).last_pings[0].type, 'checkin');
  });

  await test('hard daily check-in cap bounds the mint even if reward > cap', async ({ economy, clock }) => {
    const svc = new HomeService({ economy, now: () => clock.t, config: { checkinReward: 50, checkinDailyCap: 4 } });
    await economy.grant('u1', 10, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');          // 5
    const c = await svc.checkIn('u1', 'home.a');
    assert.strictEqual(c.granted, 4, 'granted must be clamped to the daily cap');
    assert.strictEqual(await economy.getBalance('u1'), 9);
    const zero = new HomeService({ economy, now: () => clock.t, config: { checkinDailyCap: 0 } });
    await economy.grant('u2', 10, 'seed', 'seed2');
    await zero.inhabit('u2', 'home.b');
    await rejects(() => zero.checkIn('u2', 'home.b'), (e) => assert.strictEqual(e.code, 'DAILY_CAP'));
    assert.strictEqual(await economy.getBalance('u2'), 5);
  });

  await test('stall sale counter is idempotent and shows on the tile', async ({ svc, economy }) => {
    await economy.grant('u1', 10, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');
    await svc.recordStallSale('u1', 'home.a', 'sale-1');
    await svc.recordStallSale('u1', 'home.a', 'sale-1');
    await svc.recordStallSale('u1', 'home.a', 'sale-2');
    const s = await svc.status('u1');
    assert.strictEqual(s.stall_sold, 2);
    assert.strictEqual(await economy.getBalance('u1'), 5, 'stall counter moves no Sparks');
  });

  await test('vacate: no refund; NO cash-out / refund methods exist', async ({ svc, economy }) => {
    await economy.grant('u1', 10, 'seed', 'seed');
    await svc.inhabit('u1', 'home.a');
    await svc.vacate('u1', 'home.a');
    assert.strictEqual(await economy.getBalance('u1'), 5);
    for (const n of ['withdraw', 'cashOut', 'cashout', 'redeem', 'transfer', 'transferOut', 'payout', 'refund']) {
      assert.strictEqual(typeof svc[n], 'undefined', `forbidden method present: ${n}`);
    }
  });

  await test('routes: status/inhabit/checkin map errors to clean 4xx', async ({ svc, economy }) => {
    const router = require('./home-routes')(svc);
    await economy.grant('u1', 7, 'seed', 'seed');
    let r = await callRoute(router, 'POST', '/inhabit', { userId: 'u1', homeId: 'home.c', agents: ['quill'] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    r = await callRoute(router, 'GET', '/status?userId=u1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.lit, true);
    r = await callRoute(router, 'POST', '/inhabit', { userId: 'u2', homeId: 'home.c' });
    assert.strictEqual(r.status, 409);
    r = await callRoute(router, 'POST', '/inhabit', { userId: 'u3', homeId: 'home.d' });
    assert.strictEqual(r.status, 402);
    r = await callRoute(router, 'POST', '/inhabit', { homeId: 'home.d' });
    assert.strictEqual(r.status, 400);
    r = await callRoute(router, 'GET', '/homes');
    assert.strictEqual(r.body.homes.length, 6);
    assert.ok(!JSON.stringify(r.body).includes('u1'), 'public board must not expose user ids');
    const saved = { a: process.env.ADMIN_TOKEN, b: process.env.ARCADE_SERVICE_TOKEN };
    delete process.env.ADMIN_TOKEN; delete process.env.ARCADE_SERVICE_TOKEN;
    r = await callRoute(router, 'POST', '/stall-sale', { userId: 'u1', homeId: 'home.c', saleId: 's' });
    assert.strictEqual(r.status, 503);
    process.env.ADMIN_TOKEN = 'tok';
    r = await callRoute(router, 'POST', '/stall-sale', { userId: 'u1', homeId: 'home.c', saleId: 's' }, { 'x-admin-token': 'bad' });
    assert.strictEqual(r.status, 401);
    r = await callRoute(router, 'POST', '/stall-sale', { userId: 'u1', homeId: 'home.c', saleId: 's' }, { 'x-admin-token': 'tok' });
    assert.strictEqual(r.status, 200);
    if (saved.a === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved.a;
    if (saved.b !== undefined) process.env.ARCADE_SERVICE_TOKEN = saved.b;
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err && f.err.message}`);
    process.exit(1);
  }
  process.exit(0);
})();
