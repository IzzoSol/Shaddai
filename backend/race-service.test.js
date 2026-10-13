'use strict';
/**
 * race-service.test.js — plain node test runner (no framework).
 * Run:  node race-service.test.js
 *
 * Real EconomyService on a throwaway DEV file store + injectable clock.
 * Verifies: entry spend + idempotency, insufficient balance, heat full,
 * daily entry cap, checkpoint order (CP_00 -> CP_07 -> CP_00 CCW), impossible
 * times, prizes funded from (and never exceeding) the heat's entry pool,
 * daily prize cap (excess burns), settle idempotency, routes wiring.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

delete process.env.DATABASE_URL;

const { EconomyService, DevFileStore, InsufficientFundsError, ValidationError } = require('./economy-service');
const { RaceService, RaceError, validateLap, LAP_SEQUENCE } = require('./race-service');

let passed = 0;
let failed = 0;
const failures = [];
const T0 = Date.parse('2026-09-27T12:00:00Z');

async function test(name, fn) {
  const tmp = path.join(os.tmpdir(), `race-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const economy = new EconomyService({ store: new DevFileStore(tmp) });
  const clock = { t: T0 };
  const svc = new RaceService({ economy, now: () => clock.t });
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

// A valid lap: 9 checkpoints, equal segments of `segMs`.
function lap(segMs) {
  return LAP_SEQUENCE.map((id, i) => ({ id, t: i * segMs }));
}

function callRoute(router, method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const hdrs = Object.assign({ 'x-forwarded-for': `t-${Math.random()}` }, headers || {});
    const req = {
      method, url, body: body || {}, headers: hdrs, query: {},
      get(h) { return hdrs[String(h).toLowerCase()]; }
    };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); return this; },
      setHeader() {}, getHeader() {}
    };
    router.handle(req, res, (err) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}

async function seed(economy, users, amt) {
  for (const u of users) await economy.grant(u, amt, 'seed', `seed-${u}`);
}

(async () => {
  console.log('race-service tests (dev economy store, fake clock)\n');

  await test('enter spends entry fee, assigns pit, is idempotent', async ({ svc, economy }) => {
    await seed(economy, ['u1'], 50);
    await svc.openHeat({ heatId: 'h1', entryFee: 10 });
    const a = await svc.enterHeat('u1', 'h1');
    assert.strictEqual(a.pit, 'race.pit.01');
    assert.strictEqual(a.balance, 40);
    const b = await svc.enterHeat('u1', 'h1');
    assert.strictEqual(b.replayed, true);
    assert.strictEqual(await economy.getBalance('u1'), 40, 'retry must not double-charge');
    assert.strictEqual((await svc.getHeat('h1')).pool, 10);
    // Concurrent duplicate entries also charge once.
    await seed(economy, ['u2'], 50);
    await Promise.all(Array.from({ length: 8 }, () => svc.enterHeat('u2', 'h1')));
    assert.strictEqual(await economy.getBalance('u2'), 40);
    assert.strictEqual((await svc.getHeat('h1')).pool, 20);
  });

  await test('insufficient balance: entry rejected, pool/pits unchanged', async ({ svc, economy }) => {
    await seed(economy, ['u1'], 9);
    await svc.openHeat({ heatId: 'h1', entryFee: 10 });
    await rejects(() => svc.enterHeat('u1', 'h1'), (e) => assert.ok(e instanceof InsufficientFundsError));
    const h = await svc.getHeat('h1');
    assert.strictEqual(h.pool, 0);
    assert.strictEqual(h.entrants.length, 0);
    assert.strictEqual(await economy.getBalance('u1'), 9);
  });

  await test('heat full at 8 pits; entries close once racing', async ({ svc, economy }) => {
    const users = Array.from({ length: 9 }, (_, i) => `u${i}`);
    await seed(economy, users, 50);
    await svc.openHeat({ heatId: 'h1' });
    for (let i = 0; i < 8; i++) await svc.enterHeat(users[i], 'h1');
    await rejects(() => svc.enterHeat('u8', 'h1'), (e) => assert.strictEqual(e.code, 'HEAT_FULL'));
    assert.strictEqual((await svc.getHeat('h1')).entrants[7].pit, 'race.pit.08');
    await svc.openHeat({ heatId: 'h2' });
    await svc.enterHeat('u8', 'h2');
    await svc.startHeat('h2');
    await seed(economy, ['late'], 50);
    await rejects(() => svc.enterHeat('late', 'h2'), (e) => assert.strictEqual(e.code, 'HEAT_CLOSED'));
    assert.strictEqual(await economy.getBalance('late'), 50);
  });

  await test('daily entry cap', async ({ economy, clock }) => {
    const svc = new RaceService({ economy, now: () => clock.t, config: { dailyEntryCap: 2 } });
    await seed(economy, ['u1'], 100);
    for (const id of ['a', 'b', 'c']) await svc.openHeat({ heatId: id });
    await svc.enterHeat('u1', 'a');
    await svc.enterHeat('u1', 'b');
    await rejects(() => svc.enterHeat('u1', 'c'), (e) => assert.strictEqual(e.code, 'DAILY_CAP'));
    assert.strictEqual(await economy.getBalance('u1'), 80);
    clock.t += 86400000; // next UTC day resets the cap
    await svc.enterHeat('u1', 'c');
  });

  await test('checkpoint validation: order CP_00->CP_07->CP_00, no skips', async () => {
    const good = validateLap(lap(20000));
    assert.strictEqual(good.lapMs, 160000);
    // skipped CP_03
    const skipped = lap(20000).filter((c) => c.id !== 'CP_03');
    assert.throws(() => validateLap(skipped), (e) => e instanceof RaceError && e.code === 'BAD_CHECKPOINTS');
    // skipped but padded to length 9 (repeat CP_02)
    const padded = lap(20000); padded[3] = { id: 'CP_02', t: padded[3].t };
    assert.throws(() => validateLap(padded), (e) => e.code === 'BAD_CHECKPOINTS');
    // clockwise (reversed order)
    const cw = ['CP_00', 'CP_07', 'CP_06', 'CP_05', 'CP_04', 'CP_03', 'CP_02', 'CP_01', 'CP_00'].map((id, i) => ({ id, t: i * 20000 }));
    assert.throws(() => validateLap(cw), (e) => e.code === 'BAD_CHECKPOINTS');
    // swapped pair
    const swapped = lap(20000); [swapped[4].id, swapped[5].id] = [swapped[5].id, swapped[4].id];
    assert.throws(() => validateLap(swapped), (e) => e.code === 'BAD_CHECKPOINTS');
    // not returning to CP_00
    const open = lap(20000); open[8] = { id: 'CP_01', t: open[8].t };
    assert.throws(() => validateLap(open), (e) => e.code === 'BAD_CHECKPOINTS');
    assert.throws(() => validateLap('nope'), (e) => e instanceof ValidationError);
  });

  await test('checkpoint validation: impossible times rejected', async () => {
    // Too fast: 1256 m segment in 1 s (> 150 m/s ceiling)
    assert.throws(() => validateLap(lap(1000)), (e) => e.code === 'IMPOSSIBLE_TIME');
    // Non-increasing time
    const back = lap(20000); back[5].t = back[4].t;
    assert.throws(() => validateLap(back), (e) => e.code === 'IMPOSSIBLE_TIME');
    const neg = lap(20000); neg[6].t = neg[5].t - 1;
    assert.throws(() => validateLap(neg), (e) => e.code === 'IMPOSSIBLE_TIME');
    // Start not at 0
    const late = lap(20000).map((c) => ({ id: c.id, t: c.t + 5 }));
    assert.throws(() => validateLap(late), (e) => e.code === 'IMPOSSIBLE_TIME');
    // Float / NaN times
    const flt = lap(20000); flt[2].t = 40000.5;
    assert.throws(() => validateLap(flt), (e) => e instanceof ValidationError);
    // Too slow (> 30 min)
    assert.throws(() => validateLap(lap(5 * 60 * 1000)), (e) => e.code === 'IMPOSSIBLE_TIME');
  });

  await test('result: entrants only, racing only, lap <= time since start, one per user', async ({ svc, economy, clock }) => {
    await seed(economy, ['u1', 'u2'], 50);
    await svc.openHeat({ heatId: 'h1' });
    await svc.enterHeat('u1', 'h1');
    await rejects(() => svc.submitResult('u1', 'h1', lap(20000)), (e) => assert.strictEqual(e.code, 'BAD_STATE'));
    await svc.startHeat('h1');
    await rejects(() => svc.submitResult('u2', 'h1', lap(20000)), (e) => assert.strictEqual(e.code, 'NOT_ENTRANT'));
    clock.t += 60000; // only 60 s since the gate dropped
    await rejects(() => svc.submitResult('u1', 'h1', lap(20000)), (e) => assert.strictEqual(e.code, 'IMPOSSIBLE_TIME'));
    clock.t += 120000;
    const r = await svc.submitResult('u1', 'h1', lap(20000));
    assert.strictEqual(r.lap_ms, 160000);
    const again = await svc.submitResult('u1', 'h1', lap(20000));
    assert.strictEqual(again.replayed, true);
    await rejects(() => svc.submitResult('u1', 'h1', lap(15000)), (e) => assert.strictEqual(e.code, 'RESULT_EXISTS'));
  });

  await test('payout places 1-3 from the pool; prizes <= pool; remainder burned', async ({ svc, economy, clock }) => {
    const users = ['a', 'b', 'c', 'd'];
    await seed(economy, users, 100);
    await svc.openHeat({ heatId: 'h1', entryFee: 25 });  // pool 100
    for (const u of users) await svc.enterHeat(u, 'h1');
    await svc.startHeat('h1');
    clock.t += 10 * 60000;
    await svc.submitResult('c', 'h1', lap(15000));  // 1st
    await svc.submitResult('a', 'h1', lap(16000));  // 2nd
    await svc.submitResult('d', 'h1', lap(17000));  // 3rd
    await svc.submitResult('b', 'h1', lap(18000));  // 4th
    const { heat } = await svc.settleHeat('h1');
    assert.strictEqual(heat.pool, 100);
    assert.deepStrictEqual(heat.payouts.map((p) => [p.place, p.user_id, p.amount]), [[1, 'c', 50], [2, 'a', 25], [3, 'd', 15]]);
    assert.strictEqual(heat.paid_out, 90);
    assert.ok(heat.paid_out <= heat.pool);
    assert.strictEqual(heat.burned, 10);
    assert.strictEqual(await economy.getBalance('c'), 125);
    assert.strictEqual(await economy.getBalance('a'), 100);
    assert.strictEqual(await economy.getBalance('d'), 90);
    assert.strictEqual(await economy.getBalance('b'), 75);
    // Total Sparks in the system went DOWN (never minted beyond entries).
    const total = (await Promise.all(users.map((u) => economy.getBalance(u)))).reduce((x, y) => x + y, 0);
    assert.ok(total <= 400, `supply must not grow (got ${total})`);
    // Settle is idempotent: no second payout.
    const again = await svc.settleHeat('h1');
    assert.strictEqual(again.replayed, true);
    assert.strictEqual(await economy.getBalance('c'), 125);
  });

  await test('prize pool invariants: odd pools floor, few finishers, split > 100 refused', async ({ svc, economy, clock }) => {
    await seed(economy, ['a', 'b', 'c'], 100);
    await svc.openHeat({ heatId: 'odd', entryFee: 7, prizeSplitPct: [60, 30, 10] }); // pool 21, split = 100%
    for (const u of ['a', 'b', 'c']) await svc.enterHeat(u, 'odd');
    await svc.startHeat('odd');
    clock.t += 10 * 60000;
    for (const [u, s] of [['a', 15000], ['b', 16000], ['c', 17000]]) await svc.submitResult(u, 'odd', lap(s));
    const { heat } = await svc.settleHeat('odd');
    // floor(12.6)=12, floor(6.3)=6, floor(2.1)=2 -> 20 <= 21
    assert.deepStrictEqual(heat.payouts.map((p) => p.amount), [12, 6, 2]);
    assert.ok(heat.paid_out <= heat.pool);
    // Solo heat with one finisher: only 1st paid, never a profit.
    await seed(economy, ['solo'], 10);
    await svc.openHeat({ heatId: 'solo', entryFee: 10 });
    await svc.enterHeat('solo', 'solo');
    await svc.startHeat('solo');
    clock.t += 10 * 60000;
    await svc.submitResult('solo', 'solo', lap(15000));
    const s = (await svc.settleHeat('solo')).heat;
    assert.strictEqual(s.paid_out, 5);
    assert.strictEqual(await economy.getBalance('solo'), 5, 'solo racer nets a loss');
    // Nobody finished -> whole pool burns.
    await svc.openHeat({ heatId: 'dnf' });
    await svc.enterHeat('a', 'dnf');
    await svc.startHeat('dnf');
    const d = (await svc.settleHeat('dnf')).heat;
    assert.strictEqual(d.paid_out, 0);
    assert.strictEqual(d.burned, 10);
    await rejects(() => svc.openHeat({ heatId: 'bad', prizeSplitPct: [80, 30] }), (e) => assert.ok(e instanceof ValidationError));
    assert.throws(() => new RaceService({ economy, config: { prizeSplitPct: [100, 1] } }), ValidationError);
  });

  await test('daily prize cap: excess stays burned (not deferred, not minted)', async ({ economy, clock }) => {
    const svc = new RaceService({ economy, now: () => clock.t, config: { dailyPrizeCap: 30 } });
    await seed(economy, ['w', 'x'], 200);
    const race = async (id) => {
      await svc.openHeat({ heatId: id, entryFee: 40 });   // pool 80 -> 1st nominal 40
      await svc.enterHeat('w', id);
      await svc.enterHeat('x', id);
      await svc.startHeat(id);
      clock.t += 10 * 60000;
      await svc.submitResult('w', id, lap(15000));
      await svc.submitResult('x', id, lap(16000));
      return (await svc.settleHeat(id)).heat;
    };
    const h1 = await race('r1');
    assert.strictEqual(h1.payouts[0].amount, 30, 'clamped to daily cap');
    assert.strictEqual(h1.payouts[0].burned, 10);
    const h2 = await race('r2');
    assert.strictEqual(h2.payouts[0].amount, 0, 'cap exhausted for the day');
    assert.strictEqual(h2.payouts[0].burned, 40);
    assert.ok(h1.paid_out <= h1.pool && h2.paid_out <= h2.pool);
  });

  await test('NO cash-out / withdraw methods exist', async ({ svc }) => {
    for (const n of ['withdraw', 'cashOut', 'cashout', 'redeem', 'transfer', 'transferOut', 'payout', 'refund']) {
      assert.strictEqual(typeof svc[n], 'undefined', `forbidden method present: ${n}`);
    }
  });

  await test('routes: service gate on control, player enter/result, clean 4xx', async ({ svc, economy, clock }) => {
    const router = require('./race-routes')(svc);
    const saved = { a: process.env.ADMIN_TOKEN, b: process.env.ARCADE_SERVICE_TOKEN, c: process.env.RACE_RESULTS_REQUIRE_SERVICE };
    delete process.env.ARCADE_SERVICE_TOKEN; delete process.env.RACE_RESULTS_REQUIRE_SERVICE;
    process.env.ADMIN_TOKEN = 'tok';
    try {
      let r = await callRoute(router, 'POST', '/heats', { heatId: 'rh' });
      assert.strictEqual(r.status, 401);
      r = await callRoute(router, 'POST', '/heats', { heatId: 'rh', entryFee: 5 }, { 'x-admin-token': 'tok' });
      assert.strictEqual(r.status, 200);
      await seed(economy, ['p1'], 10);
      r = await callRoute(router, 'POST', '/heats/rh/enter', { userId: 'p1' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.pit, 'race.pit.01');
      r = await callRoute(router, 'POST', '/heats/rh/enter', { userId: 'broke' });
      assert.strictEqual(r.status, 402);
      r = await callRoute(router, 'POST', '/heats/rh/start', {}, { 'x-admin-token': 'tok' });
      assert.strictEqual(r.status, 200);
      clock.t += 10 * 60000;
      r = await callRoute(router, 'POST', '/heats/rh/result', { userId: 'p1', checkpoints: lap(1000) });
      assert.strictEqual(r.status, 422);
      r = await callRoute(router, 'POST', '/heats/rh/result', { userId: 'p1', checkpoints: lap(15000) });
      assert.strictEqual(r.status, 200);
      r = await callRoute(router, 'POST', '/heats/rh/settle', {}, { 'x-admin-token': 'tok' });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.heat.paid_out <= r.body.heat.pool);
      r = await callRoute(router, 'GET', '/heats/nope');
      assert.strictEqual(r.status, 404);
      r = await callRoute(router, 'GET', '/track');
      assert.strictEqual(r.body.lap_sequence.length, 9);
      assert.strictEqual(r.body.direction, 'counter-clockwise');
    } finally {
      if (saved.a === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved.a;
      if (saved.b !== undefined) process.env.ARCADE_SERVICE_TOKEN = saved.b;
      if (saved.c !== undefined) process.env.RACE_RESULTS_REQUIRE_SERVICE = saved.c;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err && f.err.message}`);
    process.exit(1);
  }
  process.exit(0);
})();
